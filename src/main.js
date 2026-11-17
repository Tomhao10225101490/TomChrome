const { app, BrowserWindow, WebContentsView, ipcMain, Menu, dialog, shell, session, nativeTheme, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { Store, resolveInput } = require('./core');
const { saveShortcut } = require('./shortcuts');
const privacy = require('./privacy');
const adblock = require('./adblock');
const { TorProcess } = require('./tor');
// Prevent QUIC / non-proxied WebRTC UDP from bypassing a SOCKS-only Tor session.
app.commandLine.appendSwitch('disable-quic');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy','disable_non_proxied_udp');
app.commandLine.appendSwitch('dns-prefetch-disable');
if (process.env.TOM_PROFILE) app.setPath('userData', path.resolve(process.env.TOM_PROFILE));
app.setName('Tom chrome');
const shellURL = pathToFileURL(path.join(__dirname, 'index.html')).href;
let store, sequence = 0, privateSequence = 0, quitPending=false, quitReady=false;
let pendingURLs=[];
if(!app.requestSingleInstanceLock()) app.quit();
app.on('open-url',(event,url)=>{event.preventDefault();if(!/^https?:\/\//i.test(url))return;const w=focused();if(w){addTab(w,url);w.win.show();}else pendingURLs.push(url);});
app.on('second-instance',()=>{const w=focused();if(w){if(w.win.isMinimized())w.win.restore();w.win.show();w.win.focus();}});
const windows = new Map();
const {TransientPermissions}=require('./permissions');
const transientPermissions=new TransientPermissions();
const configuredSessions = new WeakSet();
const downloadItems=new Map();
function dataChanged(kind){
  for(const w of windows.values()){
    if(active(w)?.url!=='tom://'+kind||w.win.isDestroyed())continue;
    if(w.dataTimer)continue;w.dataTimer=setTimeout(()=>{w.dataTimer=null;if(!w.win.isDestroyed())w.win.webContents.send('data-changed',active(w)?.url.split('://')[1]);},200);
  }
}
function exitHTMLFullscreen(w){
  if(!w.htmlFullscreen)return;
  const tab=w.tabs.find(t=>t.id===w.htmlFullscreen);clearTimeout(w.fullscreenTimer);w.fullscreenNotice=false;w.htmlFullscreen=null;
  tab?.view?.webContents.executeJavaScript('if(document.fullscreenElement)document.exitFullscreen().catch(()=>{})').catch(()=>{});
  layout(w);emit(w);
}
function focused() { return windows.get(BrowserWindow.getFocusedWindow()?.id) || [...windows.values()][0]; }
function active(w) { return w?.tabs.find(t => t.id === w.active); }
function isInternal(url) { return url.startsWith('tom://'); }
function emit(w) {
  if(w.win.isDestroyed()||w.emitScheduled)return;
  w.emitScheduled=true;setImmediate(()=>{w.emitScheduled=false;publish(w);});
}
function publish(w) {
  if (w.win.isDestroyed()) return;
  const t = active(w);
  layout(w);
  w.win.webContents.send('state', {
    tabs: w.tabs.map(({id,title,url,loading,error,zoom,muted,blockedPopups}) => ({id,title,url,loading,error,zoom,muted,popups:blockedPopups?.length||0,blockedPopups:blockedPopups||[]})), active: w.active,
    adblock: {enabled:adblock.enabled(store.data.preferences,t?.url||''),host:adblock.host(t?.url||''),snapshot:'2026-11-16'},
    private: w.private, tor: w.tor?.state || null, privacyStats: w.privacyStats, preferences: store.data.preferences,
    bookmarks: store.data.bookmarks, shortcuts:w.private?[]:store.data.shortcuts, recovery:store.recovery,
    canBack: !!t?.view?.webContents.navigationHistory.canGoBack(), canForward: !!t?.view?.webContents.navigationHistory.canGoForward(),
    htmlFullscreen:!!w.htmlFullscreen, fullscreenNotice:w.fullscreenNotice?w.fullscreenOrigin:'', fullscreen: w.win.isFullScreen(), version: app.getVersion(), chromium: process.versions.chrome
  });
}
function emitAll() { for (const w of windows.values()) emit(w); }
function saveTabs() {
  if(quitPending||quitReady)return;
  const w = [...windows.values()].find(w => !w.private);
  if (w) { store.data.tabs = w.tabs.map(t => t.url).filter(url => !url.startsWith('tom://') || url === 'tom://newtab'); store.saveSoon(); }
}
function layout(w) {
  const [width,height]=w.win.getContentSize();const top=w.htmlFullscreen?(w.fullscreenNotice?48:0):w.top;
  for (const t of w.tabs) if (t.view) {
    const visible = t.id === w.active && !w.overlay && !t.error && !isInternal(t.url);
    if(t.viewVisible!==visible){t.view.setVisible(visible);t.viewVisible=visible;}
    if(visible){const bounds={x:0,y:top,width,height:Math.max(0,height-top)};if(!t.viewBounds||Object.keys(bounds).some(k=>bounds[k]!==t.viewBounds[k])){t.view.setBounds(bounds);t.viewBounds=bounds;}}
  }
}
function remember(w,t) {
  if (quitPending || quitReady || w.private || isInternal(t.url)) return;
  const last = store.data.history[0];
  if (last?.url === t.url && Date.now() - last.time < 5000) { last.title = t.title; } else store.data.history.unshift({ id: ++sequence + '-' + Date.now(), url: t.url, title: t.title, time: Date.now() });
  store.data.history = store.data.history.slice(0, 10000); store.saveSoon();dataChanged('history');
}
function configureSession(s,w) {
  if (configuredSessions.has(s)) return;
  configuredSessions.add(s);
  s.setUserAgent(privacy.compatibleUA(s.getUserAgent()));
  s.setPreloads([]);
  const count=(kind,details)=>{const owner=[...windows.values()].find(x=>x.tabs.some(t=>t.view?.webContents.id===details.webContentsId))||w;if(owner.win.isDestroyed())return;owner.privacyStats[kind]++;if(!owner.statsTimer)owner.statsTimer=setTimeout(()=>{owner.statsTimer=null;emit(owner);},200);};
  s.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(details,callback)=>{
    const decision=privacy.requestDecision(details,store.data.preferences,w.tor?.state);
    if(decision.cancel)count(decision.reason==='tracker'?'trackers':'blocked',details);
    if(!decision.cancel&&!decision.redirectURL){const reason=adblock.match(details,store.data.preferences);if(reason){decision.cancel=true;count(reason,details);}}
    const {reason,...response}=decision;callback(response);
  });
  s.webRequest.onBeforeSendHeaders((details,callback)=>{
    const headers=privacy.requestHeaders(details,store.data.preferences,w.tor?.state);
    if(Object.keys(details.requestHeaders).some(k=>k.toLowerCase()==='cookie')&&!Object.keys(headers).some(k=>k.toLowerCase()==='cookie'))count('cookies',details);
    callback({requestHeaders:headers});
  });
  s.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:privacy.responseHeaders(details,store.data.preferences,w.tor?.state)}));
  s.setPermissionCheckHandler((wc,permission,origin,details)=>{const owner=[...windows.values()].find(w=>!w.tor&&w.tabs.some(t=>t.view?.webContents===wc));return !!owner&&(permission==='fullscreen'?active(owner)?.view?.webContents===wc:transientPermissions.check(wc,permission,origin,details));});
  s.setDevicePermissionHandler(()=>false);
  s.setDisplayMediaRequestHandler((request,callback)=>callback({}));
  s.setPermissionRequestHandler(async (wc, permission, callback, details) => {
    const allowed = ['media','geolocation','notifications','clipboard-sanitized-write','fullscreen','pointerLock'];
    if (!allowed.includes(permission)) return callback(false);
    const w = [...windows.values()].find(w => w.tabs.some(t => t.view?.webContents === wc));
    if (!w || w.tor || wc.isDestroyed()) return callback(false);
    // Chromium still requires a trusted user activation and its frame Permissions Policy.
    // Fullscreen is not a hardware grant: permit only this window's active page, without a second modal.
    if(permission==='fullscreen')return callback(active(w)?.view?.webContents===wc);
    const names = {media:'摄像头或麦克风',geolocation:'位置',notifications:'通知','clipboard-sanitized-write':'剪贴板',fullscreen:'全屏',pointerLock:'锁定鼠标'};
    let origin = ''; try { origin = new URL(details.requestingUrl || wc.getURL()).origin; } catch {}
    const epoch=transientPermissions.epoch(wc);
    const result = await dialog.showMessageBox(w.win, {type:'question', title:'网站权限', message:`${origin} 请求使用${names[permission]}`, detail:'仅在信任该网站时允许。本次允许不会永久保存。', buttons:['拒绝','允许'], defaultId:0, cancelId:0});
    const current=!wc.isDestroyed()&&transientPermissions.epoch(wc)===epoch;
    callback(current&&result.response===1&&transientPermissions.grant(wc,permission,details.securityOrigin||origin,details));
  });
  s.on('will-download', (event,item,wc) => {
    const w = [...windows.values()].find(w => w.tabs.some(t => t.view?.webContents === wc));
    if(w?.tor&&!w.downloadApprovals.delete(item.getURL())){
      const url=item.getURL();event.preventDefault();
      dialog.showMessageBox(w.win,{type:'warning',title:'Tor 下载提醒',message:'下载文件可能暴露你的身份',detail:'文件会保存到本机。用外部应用打开文档可能直接联网，绕过 Tor。仅在理解风险时继续。',buttons:['取消下载','仍然下载'],defaultId:0,cancelId:0}).then(r=>{if(r.response===1&&!wc.isDestroyed()&&w.tor.state.phase==='connected'){w.downloadApprovals.add(url);wc.downloadURL(url);}});
      return;
    }
    const record = { id: String(Date.now()) + Math.random().toString(36).slice(2), name: item.getFilename(), url: item.getURL(), path:'', received:0, total:item.getTotalBytes(), state:'progressing', time:Date.now() };
    if (!w?.private) { store.data.downloads.unshift(record); store.data.downloads = store.data.downloads.slice(0,500); }
    if(!w?.private)downloadItems.set(record.id,item);
    item.on('updated', () => { record.path = item.getSavePath(); record.received = item.getReceivedBytes(); record.state = item.isPaused() ? 'paused' : 'progressing';if(!w?.private)dataChanged('downloads'); });
    item.once('done', (_,state) => { downloadItems.delete(record.id);record.state = state; record.path = item.getSavePath();record.received=item.getReceivedBytes(); if (!w?.private){store.saveSoon();dataChanged('downloads');} });
  });
}
function createView(w,t) {
  const view = new WebContentsView({ webPreferences: { session:w.session, preload:path.join(__dirname,'page-preload.js'), nodeIntegration:false, contextIsolation:true, sandbox:true, webSecurity:true, allowRunningInsecureContent:false, navigateOnDragDrop:false, safeDialogs:true } });
  t.view = view;t.viewVisible=false;t.viewBounds=null; w.win.contentView.addChildView(view); view.setVisible(false);
  const wc = view.webContents;
  wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');wc.setAudioMuted(!!t.muted);
  wc.on('did-start-navigation',event=>{if(event.isMainFrame&&!event.isSameDocument)transientPermissions.invalidate(wc);});
  wc.on('enter-html-full-screen',()=>{if(t.id!==w.active)return;w.htmlFullscreen=t.id;w.fullscreenOrigin=new URL(wc.getURL()).origin;w.fullscreenNotice=true;clearTimeout(w.fullscreenTimer);w.fullscreenTimer=setTimeout(()=>{w.fullscreenNotice=false;layout(w);emit(w);},3000);layout(w);emit(w);});
  wc.on('leave-html-full-screen',()=>{if(w.htmlFullscreen===t.id){clearTimeout(w.fullscreenTimer);w.fullscreenNotice=false;w.htmlFullscreen=null;layout(w);emit(w);}});
  wc.on('will-attach-webview',event=>event.preventDefault());
  wc.setWindowOpenHandler(({url,disposition}) => {
    if(/^https?:/i.test(url)){
      if(adblock.popupBlocked(url,t.url,store.data.preferences,disposition)){
        t.blockedPopups=[{id:++sequence,url},...(t.blockedPopups||[])].slice(0,5);w.privacyStats.popups++;emit(w);
      }else addTab(w,url,disposition!=='background-tab');
    }
    return {action:'deny'};
  });
  wc.on('dom-ready',()=>{wc.setZoomFactor(t.zoom);applyCosmetics(w,t);});
  const protectNavigation=(event,url,isInPlace,isMainFrame)=>{
    if(!/^https?:/i.test(url)){event.preventDefault();return;}
    if(isMainFrame!==false&&privacy.thirdParty(url,t.url)&&adblock.popupBlocked(url,t.url,store.data.preferences,'foreground-tab')){event.preventDefault();t.blockedPopups=[{id:++sequence,url},...(t.blockedPopups||[])].slice(0,5);w.privacyStats.popups++;emit(w);}
  };
  wc.on('will-navigate',protectNavigation);
  wc.on('will-redirect',protectNavigation);
  wc.on('did-start-loading', () => { t.loading=true; t.error=null; emit(w); });
  wc.on('did-stop-loading', () => { t.loading=false; emit(w); clearTimeout(t.cosmeticTimer);t.cosmeticTimer=setTimeout(()=>applyCosmetics(w,t),500); });
  wc.on('did-navigate', (_,url) => { t.cosmeticDOM={};t.cssKey=null;t.cssText='';t.cssGeneration=(t.cssGeneration||0)+1;t.blockedPopups=[];t.url=url; t.error=null; remember(w,t); saveTabs(); emit(w); });
  wc.on('did-navigate-in-page', (_,url,isMain) => { if (isMain) { t.url=url; emit(w); saveTabs(); } });
  wc.on('page-title-updated', (_,title) => { t.title=title; if (!quitPending&&!quitReady&&!w.private && store.data.history[0]?.url===t.url) {store.data.history[0].title=title; store.saveSoon();dataChanged('history');} emit(w); });
  wc.on('did-fail-load', (_,code,description,url,isMain) => { if (isMain && code!==-3) {t.error={code,description,url}; t.loading=false; emit(w);} });
  wc.on('render-process-gone', (_,details) => {t.error={description:'网页进程已退出，请重新加载',code:details.reason};t.loading=false;emit(w);});
  wc.on('found-in-page', (_,result) => {if(t.id===w.active)w.win.webContents.send('find-result',result);});
  wc.on('context-menu', (_,p) => {
    const items=[];
    if (p.linkURL && /^https?:/.test(p.linkURL)) items.push({label:'在新标签页中打开链接',click:()=>addTab(w,p.linkURL)}, {label:'复制链接地址',click:()=>clipboard.writeText(p.linkURL)}, {type:'separator'});
    if (p.isEditable) items.push({role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'});
    else if (p.selectionText) items.push({role:'copy',label:'复制'}, {label:'搜索所选文字',click:()=>addTab(w,resolveInput(p.selectionText,store.data.preferences.engine))});
    else items.push({label:'后退',enabled:wc.navigationHistory.canGoBack(),click:()=>wc.navigationHistory.goBack()},{label:'前进',enabled:wc.navigationHistory.canGoForward(),click:()=>wc.navigationHistory.goForward()},{label:'重新加载',click:()=>wc.reload()}, {type:'separator'}, {label:'另存为…',enabled:!w.tor,click:()=>savePage(w)}, {label:'打印…',enabled:!w.tor,click:()=>wc.print()}, {label:'检查',click:()=>wc.inspectElement(p.x,p.y)});
    Menu.buildFromTemplate(items).popup({window:w.win});
  });
  return view;
}
async function applyCosmetics(w,t){
  const wc=t.view?.webContents;if(!wc||wc.isDestroyed()||isInternal(t.url))return;
  const url=wc.getURL();if(!/^https?:/.test(url))return;
  const generation=t.cssGeneration=(t.cssGeneration||0)+1;
  try{
    const enabled=adblock.enabled(store.data.preferences,url);wc.send('cosmetics-enabled',enabled);
    const styles=enabled?adblock.cosmetics(url,store.data.preferences,t.cosmeticDOM||{}):'';
    if(styles===t.cssText)return;
    const key=styles?await wc.insertCSS(styles,{cssOrigin:'user'}):null;
    if(wc.isDestroyed())return;
    if(t.cssGeneration!==generation||wc.getURL()!==url){if(key)await wc.removeInsertedCSS(key);return;}
    const previous=t.cssKey;t.cssKey=key;t.cssText=styles;
    if(previous)await wc.removeInsertedCSS(previous);
  }catch{} // Navigation may dispose the target; never disable web security to inject styles.
}
function addTab(w,url='tom://newtab',select=true) {
  if(select)exitHTMLFullscreen(w);
  const t = {id:++sequence,url,title:isInternal(url)?internalTitle(url):'新标签页',loading:false,zoom:1,muted:false,error:null,view:null};
  w.tabs.push(t);
  if (!isInternal(url)) { createView(w,t); t.view.webContents.loadURL(url).catch(()=>{}); }
  if(select) w.active=t.id;
  layout(w); emit(w); saveTabs(); return t;
}
function internalTitle(url) { return ({newtab:'新标签页',history:'历史记录',bookmarks:'书签管理器',downloads:'下载内容',settings:'设置'})[url.split('://')[1]] || 'Tom chrome'; }
function navigate(w,input) {
  let url = resolveInput(input,w.tor?'duckduckgo':store.data.preferences.engine); const t=active(w); if(!t) return;
  if((w.tor||store.data.preferences.httpsOnly)&&!isInternal(url))url=privacy.upgrade(url);
  if(w.tor&&!isInternal(url)&&w.tor.state.phase!=='connected')throw Error('Tor 尚未验证出口，已阻断访问；请等待连接或重试。');
  if(!w.tor&&new URL(url).hostname.endsWith('.onion'))throw Error('.onion 地址只能在 Tor 窗口中打开。');
  exitHTMLFullscreen(w);t.error=null; t.url=url;
  if (isInternal(url)) {
    if(t.view){const view=t.view;t.view=null;w.win.contentView.removeChildView(view);view.webContents.close();}
    t.title=internalTitle(url);t.loading=false;
  }
  else { if(!t.view) createView(w,t); t.view.webContents.loadURL(url).catch(()=>{}); }
  layout(w); emit(w); saveTabs();
}
function closeTab(w,id) {
  const i=w.tabs.findIndex(t=>t.id===id); if(i<0)return;
  if(w.htmlFullscreen===id)exitHTMLFullscreen(w);
  const [t]=w.tabs.splice(i,1); w.closed.unshift(t.url); w.closed=w.closed.slice(0,25);
  clearTimeout(t.cosmeticTimer);
  if(t.view) {w.win.contentView.removeChildView(t.view); t.view.webContents.close();}
  if(!w.tabs.length) {w.win.close();return;}
  if(w.active===id) w.active=w.tabs[Math.min(i,w.tabs.length-1)].id;
  layout(w);emit(w);saveTabs();
}
function zoom(w,delta) { const t=active(w); if(t?.view && !isInternal(t.url)) { t.zoom = delta===0 ? 1 : Math.min(3,Math.max(.25,Math.round((t.zoom+delta)*100)/100));t.view.webContents.setZoomFactor(t.zoom);emit(w); } }
async function savePage(w) { const wc=active(w)?.view?.webContents;if(!wc)return;const r=await dialog.showSaveDialog(w.win,{defaultPath:path.join(app.getPath('downloads'),'网页.html'),filters:[{name:'HTML 网页',extensions:['html']}]});if(!r.canceled) await wc.savePage(r.filePath,'HTMLComplete').catch(e=>dialog.showErrorBox('保存失败',e.message)); }
function createWindow(priv=false,urls,torMode=false) {
  const win = new BrowserWindow({width:1360,height:900,minWidth:760,minHeight:540,title:'Tom chrome',titleBarStyle:'hidden',trafficLightPosition:{x:16,y:16},backgroundColor:'#ffffff',show:false,webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  const s = session.fromPartition(priv ? `private-${++privateSequence}` : 'persist:tom');
  const w={win,session:s,private:priv,tabs:[],active:null,closed:[],top:122,overlay:false,privacyStats:{ads:0,trackers:0,cookies:0,blocked:0,popups:0},downloadApprovals:new Set(),tor:torMode?{state:{phase:'idle',progress:0,message:'正在准备安全代理'}}:null};windows.set(win.id,w);
  configureSession(s,w);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate', e=>e.preventDefault());
  win.loadURL(shellURL);
  win.once('ready-to-show',()=>{win.show();emit(w);});
  win.webContents.on('did-finish-load',()=>emit(w));
  win.on('resize',()=>layout(w));win.on('enter-full-screen',()=>emit(w));win.on('leave-full-screen',()=>emit(w));
  win.on('close',()=>{if(!priv)saveTabs();});
  win.on('closed',()=>{w.torController?.abort();w.tor?.stop?.();clearTimeout(w.statsTimer);clearTimeout(w.dataTimer);clearTimeout(w.fullscreenTimer);for(const t of w.tabs)if(t.view&&!t.view.webContents.isDestroyed())t.view.webContents.close();windows.delete(win.id);if(priv){s.closeAllConnections();s.clearStorageData();s.clearCache();}});
  for(const url of urls?.length?urls:['tom://newtab']) addTab(w,url);
  return w;
}
async function connectTor(w) {
  w.torController?.abort();w.tor?.stop?.();
  const controller=new AbortController();w.torController=controller;
  const bundle=app.isPackaged?path.join(process.resourcesPath,'tor'):path.join(__dirname,'../vendor/tor');
  const tor=new TorProcess(bundle);w.tor=tor;
  const current=()=>!w.win.isDestroyed()&&w.tor===tor&&!controller.signal.aborted;
  // Serialize proxy changes so an obsolete bootstrap cannot overwrite a newer route.
  const proxy=rules=>{
    const operation=(w.proxyQueue||Promise.resolve()).catch(()=>{}).then(async()=>{
      if(!current())throw Error('cancelled');
      await w.session.setProxy({mode:'fixed_servers',proxyRules:rules,proxyBypassRules:'<-loopback>'});
      await w.session.closeAllConnections();
      if(!current())throw Error('cancelled');
    });w.proxyQueue=operation.catch(()=>{});return operation;
  };
  tor.on('state',()=>{
    if(w.tor!==tor||w.win.isDestroyed())return;
    if(['failed','stopped'].includes(tor.state.phase)){
      controller.abort();
      for(const t of w.tabs)if(t.view&&!isInternal(t.url)){t.view.webContents.stop();t.error={description:tor.state.message,code:'TOR_DISCONNECTED',url:t.url};}
      w.session.closeAllConnections();
    }
    emit(w);
  });
  try {
    await proxy('socks5://127.0.0.1:1');
    if(!current())return tor.stop();
    const port=await tor.start();if(!current())return tor.stop();
    await proxy(`socks5://127.0.0.1:${port}`);
    const response=await w.session.fetch('https://check.torproject.org/api/ip',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)]),cache:'no-store'});
    if(!response.ok)throw Error('Tor 出口验证服务不可用');const result=await response.json();
    if(result.IsTor!==true)throw Error('出口并非 Tor，已阻断访问');
    if(!current())return tor.stop();
    tor.connected();
  }catch(error){if(current())tor.fail(error.message.includes('Tor')?error.message:'Tor 出口验证失败，已阻断联网。不会回退直连。');else tor.stop(false);}
}
function createTorWindow(){
  if([...windows.values()].filter(w=>w.tor).length>=2)throw Error('最多同时打开两个 Tor 窗口，避免过多进程。');
  const w=createWindow(true,undefined,true);connectTor(w);return w;
}
async function command(w,action,payload) {
  if (!w) return;
  const t=active(w),wc=t?.view?.webContents;
  switch(action) {
    case 'navigate':navigate(w,payload);break;
    case 'new-tab':addTab(w,payload ? resolveInput(payload,store.data.preferences.engine) : undefined);break;
    case 'select-tab':if(w.tabs.some(t=>t.id===payload)){if(w.active!==payload)exitHTMLFullscreen(w);w.active=payload;active(w)?.view?.webContents.send('refresh-cosmetics');layout(w);emit(w);}break;
    case 'duplicate-tab':{const source=w.tabs.find(t=>t.id===Number(payload))||t;if(source)addTab(w,source.url);break;}
    case 'close-other-tabs':{const keep=Number(payload)||w.active;if(w.tabs.some(t=>t.id===keep))for(const tab of [...w.tabs])if(tab.id!==keep)closeTab(w,tab.id);break;}
    case 'close-right-tabs':{const index=w.tabs.findIndex(t=>t.id===(Number(payload)||w.active));if(index>=0)for(const tab of w.tabs.slice(index+1))closeTab(w,tab.id);break;}
    case 'save-shortcut':if(w.private)throw Error('私密窗口不会保存快捷方式');saveShortcut(store.data.shortcuts,payload);emitAll();await store.flush();return true;
    case 'remove-shortcut':if(w.private)throw Error('私密窗口不会修改快捷方式');store.data.shortcuts=store.data.shortcuts.filter(s=>s.id!==payload);emitAll();await store.flush();break;
    case 'close-tab':closeTab(w,Number(payload)||w.active);break;
    case 'reopen':if(w.closed.length)addTab(w,w.closed.shift());break;
    case 'back':if(wc?.navigationHistory.canGoBack())wc.navigationHistory.goBack();break;
    case 'forward':if(wc?.navigationHistory.canGoForward())wc.navigationHistory.goForward();break;
    case 'reload':if(wc&&!isInternal(t.url)){t.error=null;wc.reload();emit(w);}break;
    case 'hard-reload':wc?.reloadIgnoringCache();break;
    case 'stop':wc?.stop();break;
    case 'new-window':createWindow(false);break;
    case 'private-window':createWindow(true);break;
    case 'tor-window':createTorWindow();break;
    case 'adblock-site':{if(!store.data.preferences.adblock)throw Error('请先在设置中开启广告拦截，再调整网站例外。');const host=adblock.host(t?.url||'');if(!host||isInternal(t.url))return;const list=store.data.preferences.adblockAllowlist||[];store.data.preferences.adblockAllowlist=list.includes(host)?list.filter(h=>h!==host):[...list,host];emitAll();if(t.view)t.view.webContents.reload();await store.flush();break;}
    case 'allow-popup':{const list=t?.blockedPopups||[];const i=payload?list.findIndex(p=>p.id===Number(payload)):0;const popup=i>=0?list.splice(i,1)[0]:null;if(popup)addTab(w,popup.url);emit(w);break;}
    case 'dismiss-popups':if(t)t.blockedPopups=[];emit(w);break;
    case 'tor-retry':if(w.tor)connectTor(w);break;
    case 'tor-disconnect':w.tor?.stop?.();break;
    case 'bookmark':if(w.tor){const r=await dialog.showMessageBox(w.win,{type:'warning',message:'书签会将此 Tor 网页的网址保存到本机',buttons:['取消','保存书签'],defaultId:0,cancelId:0});if(r.response!==1)return;}if(t&&!isInternal(t.url)){const i=store.data.bookmarks.findIndex(b=>b.url===t.url);if(i>=0)store.data.bookmarks.splice(i,1);else store.data.bookmarks.push({id:String(Date.now()),title:t.title,url:t.url});dataChanged('bookmarks');emitAll();await store.flush();}break;
    case 'remove-bookmark':store.data.bookmarks=store.data.bookmarks.filter(b=>b.id!==payload);dataChanged('bookmarks');emitAll();await store.flush();break;
    case 'preferences':for(const [key,val] of Object.entries(payload||{})){if(['restore','bookmarksBar','blockTrackers','blockThirdPartyCookies','privacySignals','httpsOnly','adblock','blockPopups'].includes(key)&&typeof val==='boolean')store.data.preferences[key]=val;if(key==='engine'&&['bing','google','duckduckgo'].includes(val))store.data.preferences[key]=val;if(key==='theme'&&['light','dark','system'].includes(val))store.data.preferences[key]=val;}nativeTheme.themeSource=store.data.preferences.theme;for(const x of windows.values())for(const tab of x.tabs)applyCosmetics(x,tab);emitAll();await store.flush();break;
    case 'zoom':zoom(w,Number(payload));break;
    case 'exit-html-fullscreen':exitHTMLFullscreen(w);break;
    case 'mute':t.muted=!t.muted;if(wc)wc.setAudioMuted(t.muted);emit(w);break;
    case 'find':if(wc&&!isInternal(t.url)&&payload?.text)wc.findInPage(String(payload.text),{forward:payload.forward!==false,...(payload.next?{findNext:true}:{})});break;
    case 'stop-find':wc?.stopFindInPage('clearSelection');break;
    case 'devtools':wc?.toggleDevTools();break;
    case 'print':if(w.tor)throw Error('Tor 窗口禁用打印，避免外部打印服务绕过 Tor。');if(wc&&!isInternal(t.url))wc.print();break;
    case 'save-page':if(w.tor)throw Error('Tor 窗口禁用网页另存为；下载文件前会单独提醒风险。');savePage(w);break;
    case 'fullscreen':w.win.setFullScreen(!w.win.isFullScreen());break;
    case 'clear-history':store.data.history=[];dataChanged('history');emitAll();await store.flush();break;
    case 'remove-history':store.data.history=store.data.history.filter(h=>h.id!==payload);dataChanged('history');await store.flush();break;
    case 'clear-downloads':store.data.downloads=store.data.downloads.filter(d=>['progressing','paused'].includes(d.state));dataChanged('downloads');await store.flush();break;
    case 'download-control':{if(w.private)throw Error('私密窗口不能操作普通窗口的下载记录');const item=downloadItems.get(payload?.id);if(!item)throw Error('该下载已结束，不能继续操作');if(payload.action==='pause')item.pause();else if(payload.action==='resume'){if(!item.canResume())throw Error('此下载暂时不能继续，请重新下载');item.resume();}else if(payload.action==='cancel')item.cancel();else throw Error('未知下载操作');const record=store.data.downloads.find(d=>d.id===payload.id);if(record&&record.state!=='cancelled')record.state=item.isPaused()?'paused':item.getState();dataChanged('downloads');break;}
    case 'open-download': {if(w.tor)throw Error('Tor 窗口不打开外部文件，避免应用绕过 Tor 联网。');const d=store.data.downloads.find(d=>d.id===payload);if(d?.state==='completed'&&fs.existsSync(d.path)){if(/\.(dmg|pkg|app|exe|msi|command|scpt|js|jar|sh|bat|vbs|ps1|workflow|webloc|url|html?|svg)$/i.test(d.path)){const r=await dialog.showMessageBox(w.win,{type:'warning',message:'此文件可能执行代码或直接联网',detail:d.name+'\n仅在确认来源可信时打开。Tom chrome 不提供恶意文件扫描。',buttons:['取消','仍然打开'],defaultId:0,cancelId:0});if(r.response!==1)return;}const error=await shell.openPath(d.path);if(error)throw Error(error);}break;}
    case 'show-download': {const d=store.data.downloads.find(d=>d.id===payload);if(d?.path)shell.showItemInFolder(d.path);break;}
    case 'clear-site-data':return w.session.clearStorageData().then(()=>w.session.clearCache());
    case 'default-browser':app.setAsDefaultProtocolClient('http');app.setAsDefaultProtocolClient('https');return app.isDefaultProtocolClient('https');
    case 'focus-web':if(wc&&!isInternal(t.url))wc.focus();break;
    case 'move-tab':{const i=w.tabs.findIndex(t=>t.id===payload.id),j=w.tabs.findIndex(t=>t.id===payload.before);if(i>=0&&j>=0){const [tab]=w.tabs.splice(i,1);w.tabs.splice(j,0,tab);emit(w);saveTabs();}break;}
  }
}
app.whenReady().then(()=>{
  try{store=new Store(app.getPath('userData'));}catch(error){dialog.showErrorBox('Tom chrome 资料恢复',error.message);app.quit();return;}
  store.onError=error=>{if(!store.failureNotified){store.failureNotified=true;dialog.showErrorBox('本地资料保存失败','当前修改暂未写入磁盘，请检查磁盘空间和目录权限。应用退出时会再次尝试保存。\n'+error.message);}};
  nativeTheme.themeSource=store.data.preferences.theme;
  ipcMain.on('cosmetic-dom',(event,payload)=>{
    if(event.senderFrame!==event.sender.mainFrame)return;
    const w=[...windows.values()].find(w=>w.tabs.some(t=>t.view?.webContents===event.sender));const t=w?.tabs.find(t=>t.view?.webContents===event.sender);
    if(!t||t.id!==w.active||Date.now()-(t.lastCosmeticMessage||0)<500)return;
    if(!payload||!Array.isArray(payload.ids)||!Array.isArray(payload.classes)||payload.ids.length+payload.classes.length>1500)return;
    let size=0;for(const value of [...payload.ids,...payload.classes]){if(typeof value!=='string'||value.length>128)return;size+=value.length;}if(size>24000)return;
    t.lastCosmeticMessage=Date.now();t.cosmeticDOM={ids:payload.ids,classes:payload.classes};applyCosmetics(w,t);
  });
  ipcMain.handle('browser', async(event,action,payload)=>{
    const w=windows.get(BrowserWindow.fromWebContents(event.sender)?.id);
    if(!w||event.sender!==w.win.webContents||event.senderFrame.url!==shellURL)throw new Error('Untrusted sender');
    if(action==='state'){emit(w);return;}
    if(action==='data'){const data={history:w.private?[]:store.data.history,downloads:w.private?[]:store.data.downloads,bookmarks:store.data.bookmarks,preferences:store.data.preferences};return ['history','downloads','bookmarks'].includes(payload)?{[payload]:data[payload]}:data;}
    if(action==='layout'){if(w.htmlFullscreen){layout(w);return;}w.top=Math.min(260,Math.max(80,Number(payload)||122));layout(w);return;}
    if(action==='overlay') {
      w.overlay=!!payload;const generation=w.overlayGeneration=(w.overlayGeneration||0)+1;let preview=null;const t=active(w);
      // Reveal menu immediately; render a compact screenshot behind it asynchronously.
      const capture=w.overlay&&t?.view&&!t.error&&!isInternal(t.url)?t.view.webContents.capturePage(undefined,{stayHidden:true}):null;
      layout(w);
      if(capture)try{const image=await capture;if(w.overlay&&w.overlayGeneration===generation){const width=Math.min(1400,image.getSize().width);preview='data:image/jpeg;base64,'+image.resize({width}).toJPEG(70).toString('base64');}}catch{}
      return preview;
    }
    return command(w,action,payload);
  });
  const run=(w,a,p)=>command(w,a,p).catch(error=>{if(w&&!w.win.isDestroyed())dialog.showMessageBox(w.win,{type:'info',message:error.message,buttons:['好']});});
  const act=(a,p)=>()=>run(focused(),a,p);
  const focusAddress=()=>{const w=focused();w?.win.webContents.focus();w?.win.webContents.send('focus-address');};
  const internal=(url)=>()=>{const w=focused();if(w)addTab(w,'tom://'+url);};
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'Tom chrome',submenu:[{role:'about',label:'关于 Tom chrome'},{type:'separator'},{label:'设置…',accelerator:'CmdOrCtrl+,',click:internal('settings')},{type:'separator'},{role:'hide',label:'隐藏 Tom chrome'},{role:'hideOthers',label:'隐藏其他'},{role:'unhide',label:'显示全部'},{type:'separator'},{role:'quit',label:'退出 Tom chrome'}]},
    {label:'文件',submenu:[{label:'新标签页',accelerator:'CmdOrCtrl+T',click:act('new-tab')},{label:'新窗口',accelerator:'CmdOrCtrl+N',click:()=>createWindow()},{label:'新建无痕窗口',accelerator:'CmdOrCtrl+Shift+N',click:()=>createWindow(true)},{label:'新建 Tor 窗口',click:()=>createTorWindow()},{label:'重新打开关闭的标签页',accelerator:'CmdOrCtrl+Shift+T',click:act('reopen')},{label:'关闭标签页',accelerator:'CmdOrCtrl+W',click:act('close-tab')},{type:'separator'},{label:'保存网页…',accelerator:'CmdOrCtrl+S',click:act('save-page')},{label:'打印…',accelerator:'CmdOrCtrl+P',click:act('print')}]},
    {label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'},{type:'separator'},{label:'查找…',accelerator:'CmdOrCtrl+F',click:()=>focused()?.win.webContents.send('show-find')}]},
    {label:'显示',submenu:[{label:'重新加载',accelerator:'CmdOrCtrl+R',click:act('reload')},{label:'强制重新加载',accelerator:'CmdOrCtrl+Shift+R',click:act('hard-reload')},{label:'放大',accelerator:'CmdOrCtrl+Plus',click:act('zoom',.1)},{label:'缩小',accelerator:'CmdOrCtrl+-',click:act('zoom',-.1)},{label:'实际大小',accelerator:'CmdOrCtrl+0',click:act('zoom',0)},{role:'togglefullscreen',label:'全屏'},{label:'开发者工具',accelerator:'Alt+CmdOrCtrl+I',click:act('devtools')}]},
    {label:'历史记录',submenu:[{label:'后退',accelerator:'CmdOrCtrl+[',click:act('back')},{label:'前进',accelerator:'CmdOrCtrl+]',click:act('forward')},{label:'历史记录',accelerator:'CmdOrCtrl+Y',click:internal('history')},{label:'下载内容',accelerator:'CmdOrCtrl+Shift+J',click:internal('downloads')}]},
    {label:'书签',submenu:[{label:'为此标签页添加书签',accelerator:'CmdOrCtrl+D',click:act('bookmark')},{label:'书签管理器',accelerator:'CmdOrCtrl+Alt+B',click:internal('bookmarks')}]},
    {label:'窗口',submenu:[{role:'minimize',label:'最小化'},{role:'zoom',label:'缩放'},{label:'地址栏',accelerator:'CmdOrCtrl+L',click:focusAddress},{label:'下一个标签页',accelerator:'Control+Tab',click:()=>{const w=focused();if(w)command(w,'select-tab',w.tabs[(w.tabs.findIndex(t=>t.id===w.active)+1)%w.tabs.length].id);}},{label:'上一个标签页',accelerator:'Control+Shift+Tab',click:()=>{const w=focused();if(w)command(w,'select-tab',w.tabs[(w.tabs.findIndex(t=>t.id===w.active)+w.tabs.length-1)%w.tabs.length].id);}}]}
  ]));
  app.on('web-contents-created',(_,wc)=>wc.on('before-input-event',(e,input)=>{
    if(input.type!=='keyDown')return;
    const w=[...windows.values()].find(w=>w.win.webContents===wc||w.tabs.some(t=>t.view?.webContents===wc));if(!w)return;
    const key=input.key.toLowerCase();
    if(key==='escape'&&w.htmlFullscreen){e.preventDefault();exitHTMLFullscreen(w);return;}
    if(!(input.meta||input.control))return;
    if(/^[1-9]$/.test(key)){const n=Number(key),t=w.tabs[n===9?w.tabs.length-1:n-1];if(t){e.preventDefault();command(w,'select-tab',t.id);}return;}
    if(key==='l'){e.preventDefault();exitHTMLFullscreen(w);w.win.webContents.focus();w.win.webContents.send('focus-address');return;}
    if(key==='f'){e.preventDefault();exitHTMLFullscreen(w);w.win.webContents.send('show-find');return;}
    if(key==='tab'&&input.control){e.preventDefault();const i=w.tabs.findIndex(t=>t.id===w.active);command(w,'select-tab',w.tabs[(i+(input.shift?-1:1)+w.tabs.length)%w.tabs.length].id);return;}
    if(key===','||key==='y'||(key==='j'&&input.shift)){e.preventDefault();addTab(w,'tom://'+(key===','?'settings':key==='y'?'history':'downloads'));return;}
    const action=({t:input.shift?'reopen':'new-tab',n:input.shift?'private-window':'new-window',w:'close-tab',r:input.shift?'hard-reload':'reload',d:'bookmark',p:'print',s:'save-page','[':'back',']':'forward','+':'zoom','=':'zoom','-':'zoom','0':'zoom'})[key];
    if(action){e.preventDefault();run(w,action,action==='zoom'?(key==='0'?0:key==='-'?-.1:.1):undefined);if(action==='new-tab'){w.win.webContents.focus();w.win.webContents.send('focus-address');}}
  }));
  createWindow(false,pendingURLs.length?pendingURLs.splice(0):store.data.preferences.restore?store.data.tabs:[]);
  app.on('activate',()=>{if(!windows.size)createWindow();});
});
app.on('before-quit',event=>{
  for(const w of windows.values()){w.torController?.abort();w.tor?.stop?.();}
  if(!store||quitReady)return;
  event.preventDefault();if(quitPending)return;
  saveTabs();quitPending=true;
  store.flush().then(()=>{quitReady=true;app.quit();}).catch(error=>{quitPending=false;dialog.showErrorBox('资料保存失败，暂未退出','为避免丢失修改，请检查磁盘空间 / 权限，然后再次退出。\n'+error.message);});
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('certificate-error',(event,wc,url,error,certificate,callback)=>callback(false));
