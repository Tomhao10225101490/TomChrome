const $ = s => document.querySelector(s);
const errorText=e=>e.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
const call = (a,p) => window.tom.call(a,p).catch(e => toast(errorText(e)));
async function action(a,p){try{return {ok:true,result:await window.tom.call(a,p)};}catch(e){toast(errorText(e));return {ok:false};}}
const paths = {
 plus:'M12 5v14M5 12h14',close:'m6 6 12 12M6 18 18 6',back:'m14 5-7 7 7 7',forward:'m10 5 7 7-7 7',down:'m6 9 6 6 6-6',up:'m6 15 6-6 6 6',reload:'M20 8a8 8 0 1 0 0 8M20 3v5h-5',stop:'M6 6h12v12H6z',home:'m3 11 9-8 9 8M6 10v11h12V10M10 21v-7h4v7',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',star:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',menu:'M12 5h.01M12 12h.01M12 19h.01',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18',sliders:'M4 7h7m5 0h4M4 17h3m5 0h8M11 4v6M7 14v6',shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Z',history:'M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2',folder:'M3 6h7l2 2h9v12H3Z',settings:'M9 3h6l1 4 4 1 1 6-4 2-1 5h-6l-2-4-5-1V9l4-2ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',external:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',window:'M3 4h18v16H3ZM3 9h18',private:'M3 10h18M5 10l3-7 4 2 4-2 3 7M4 16a3 3 0 1 0 6 0 3 3 0 0 0-6 0m10 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0m-4 0h4',print:'M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6Z',save:'M4 3h14l3 3v15H3V3ZM7 3v6h10V3M7 21v-8h10v8',fullscreen:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5',info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6m0-10h.01',error:'M4 3h11l5 5v13H4ZM14 3v6h6M8 13l6 5m0-5-6 5',check:'m5 12 4 4L19 6',code:'m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',minus:'M5 12h14'
};
const icon = (name,cls='') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.globe}"/></svg>`;
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state, pageKey='', pageData, filter='', toastTimer, findOpen=false, popupGeneration=0, recoveryShown=false, lastChromeHeight=-1, listLimit=100, pageRequest=0, listRequest=0, pendingFocus=null;
const tabNodes=new Map(),htmlCache=new WeakMap();
function patchHTML(element,html){if(htmlCache.get(element)===html)return;htmlCache.set(element,html);element.innerHTML=html;}
function renderTabs(tabs,selected){
  const container=$('#tabs'),wanted=new Set(tabs.map(t=>t.id));
  for(const [id,node]of tabNodes)if(!wanted.has(id)){node.remove();tabNodes.delete(id);}
  tabs.forEach((t,index)=>{
    let node=tabNodes.get(t.id);
    if(!node){node=document.createElement('div');node.className='tab';node.setAttribute('role','tab');node.tabIndex=0;node.dataset.tab=t.id;node.draggable=true;node.innerHTML=`<span class="tab-symbol"></span><span class="tab-title"></span><button class="tab-close" data-close="${t.id}">${icon('close')}</button>`;tabNodes.set(t.id,node);}
    if(container.children[index]!==node)container.insertBefore(node,container.children[index]||null);
    const selectedNow=t.id===selected;node.tabIndex=selectedNow?0:-1;if(node.classList.contains('active')!==selectedNow)node.classList.toggle('active',selectedNow);
    if(node.getAttribute('aria-selected')!==String(selectedNow))node.setAttribute('aria-selected',selectedNow);
    const title=String(t.title||'');if(node._title!==title){node._title=title;node.querySelector('.tab-title').textContent=title;node.querySelector('.tab-close').setAttribute('aria-label','关闭 '+title);}
    if(node._loading!==!!t.loading){node._loading=!!t.loading;node.querySelector('.tab-symbol').innerHTML=icon(t.loading?'reload':'globe',t.loading?'spinning':'');}
  });
}
const tab = () => state?.tabs.find(t=>t.id===state.active);
const navigate = url => {closePopup(); call('navigate',url);};
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),2600);}
function focusAddress(){if(state?.htmlFullscreen){pendingFocus='address';call('exit-html-fullscreen');return;}closePopup();$('#address').focus();$('#address').select();}
for (const [id,name] of Object.entries({'new-tab':'plus','tab-search':'down',back:'back',forward:'forward',reload:'reload','site-info':'sliders','privacy-button':'shield','blocked-popups':'window',bookmark:'star',downloads:'download','menu-button':'menu','find-prev':'up','find-next':'down','find-close':'close'})) $('#'+id).innerHTML=icon(name);
function update(s) {
  const switched=state?.active!==s.active;state=s;
  $('#chrome').hidden=!!s.htmlFullscreen;
  $('#fullscreen-notice').hidden=!s.fullscreenNotice;$('#fullscreen-origin').textContent=s.fullscreenNotice||'';
  if(!s.htmlFullscreen&&pendingFocus){const target=pendingFocus;pendingFocus=null;target==='address'?focusAddress():showFind();}
  if(s.recovery&&!recoveryShown){recoveryShown=true;toast(s.recovery);}
  const dark=s.preferences.theme==='dark'||s.preferences.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches;
  document.body.classList.toggle('dark',dark);document.body.classList.toggle('private',s.private);document.body.classList.toggle('tor-mode',!!s.tor);
  const t=tab();if(!t)return;
  document.title=t.title+' - Tom chrome';
  renderTabs(s.tabs,s.active);
  if(switched||document.activeElement!==$('#address')){$('#address').value=t.url==='tom://newtab'?'':t.url;if(switched&&document.activeElement===$('#address'))$('#address').select();}
  $('#back').disabled=!s.canBack;$('#forward').disabled=!s.canForward;
  patchHTML($('#reload'),icon(t.loading?'stop':'reload'));
  $('#bookmark').classList.toggle('selected',s.bookmarks.some(b=>b.url===t.url));
  $('#bookmark').disabled=t.url.startsWith('tom:');
  $('#blocked-popups').hidden=!t.popups;$('#blocked-popups').title=`已拦截 ${t.popups||0} 个弹窗`;
  $('#zoom-label').textContent=t.zoom!==1?Math.round(t.zoom*100)+'%':'';
  $('#privacy-button').title=`隐私与安全 · 本窗口拦截 ${(s.privacyStats?.ads||0)+(s.privacyStats?.trackers||0)} 次广告 / 追踪请求`;
  $('#tor-badge').hidden=!s.tor;$('#tor-badge').textContent=s.tor?.phase==='connected'?'Tor 已验证':s.tor?'Tor 未连接':'';
  $('#bookmarks-bar').hidden=!s.preferences.bookmarksBar;
  patchHTML($('#bookmarks-bar'),s.bookmarks.length?s.bookmarks.slice(0,20).map(b=>`<button class="bookmark-item" data-url="${esc(b.url)}" title="${esc(b.url)}">${icon('globe')}<span>${esc(b.title)}</span></button>`).join(''):`<span class="bookmark-hint">将常用网站添加到书签栏，方便随时访问。</span><button class="text-button" data-page="bookmarks">管理书签</button>`);
  const key=t.id+'|'+t.url+'|'+JSON.stringify(t.error)+'|'+JSON.stringify(s.preferences)+(s.tor&&t.url.startsWith('tom:')?JSON.stringify(s.tor):'')+(t.url==='tom://newtab'?JSON.stringify(s.shortcuts):'');
  if(key!==pageKey){pageKey=key;filter='';listLimit=100;renderPage();}
  if(switched&&findOpen){$('#find-count').textContent='';find();}
  layout();
}
function layout(){const height=$('#chrome').getBoundingClientRect().height;if(height===lastChromeHeight)return;lastChromeHeight=height;$('#content').style.height=`calc(100vh - ${height}px)`;call('layout',height);}
new ResizeObserver(layout).observe($('#chrome'));
window.tom.on('state',update);
window.tom.on('focus-address',focusAddress);
window.tom.on('show-find',()=>showFind());
window.tom.on('find-result',r=>$('#find-count').textContent=r.matches?`${r.activeMatchOrdinal} / ${r.matches}`:'0 / 0');
async function refreshList(kind){
  if(tab()?.url!=='tom://'+kind||!$('#page-list'))return;
  const key=pageKey,request=++listRequest,data=await call('data',kind);
  if(data&&key===pageKey&&request===listRequest&&$('#page-list')){pageData=data;renderList(kind);}
}
window.tom.on('data-changed',refreshList);
window.tom.on('downloads-changed',()=>refreshList('downloads'));
call('state');
$('#address').addEventListener('keydown',e=>{if(e.key==='Enter'){navigate(e.target.value);e.target.blur();call('focus-web');}if(e.key==='Escape'){e.target.value=tab().url==='tom://newtab'?'':tab().url;e.target.blur();call('focus-web');}});
$('#address').addEventListener('focus',e=>e.target.select());
$('#new-tab').onclick=()=>{call('new-tab').then(focusAddress);};
$('#back').onclick=()=>call('back');$('#forward').onclick=()=>call('forward');
$('#reload').onclick=()=>call(tab()?.loading?'stop':'reload');
$('#bookmark').onclick=async()=>{const existed=state.bookmarks.some(b=>b.url===tab().url);const {ok}=await action('bookmark');if(ok)toast(existed?'已移除书签':'已添加书签');};
$('#downloads').onclick=()=>navigate('tom://downloads');
$('#blocked-popups').onclick=()=>{
  const entries=tab().blockedPopups||[];
  openPopup(`<div class="menu-caption">已拦截 ${entries.length} 个弹窗 · 点击可允许一次</div>${entries.map(p=>menuItem(esc(p.url.length>78?p.url.slice(0,78)+'…':p.url),'external','allow-popup','',p.id)).join('')}<div class="menu-divider"></div>${menuItem('忽略这些弹窗','close','dismiss-popups')}`);
};
$('#menu-button').onclick=()=>openMenu();
$('#site-info').onclick=()=>{const t=tab();let origin='Tom 内置页面';try{origin=new URL(t.url).origin;}catch{}openPopup(`<div class="popup-info"><h3>${icon(t.url.startsWith('https:')?'shield':'info')} ${esc(origin)}</h3><p>${t.url.startsWith('https:')?'此网页使用 HTTPS 加密连接。证书由 Chromium 验证。':t.url.startsWith('tom:')?'此页面保存在你的设备上，无需登录。':'此连接未使用 HTTPS 加密，请勿输入敏感信息。'}</p><p>网站敏感权限按次询问；证书错误不会绕过。</p></div>`);};
$('#privacy-button').onclick=()=>openPopup(`<div class="popup-info"><h3>${icon('shield')} 隐私与安全</h3><p>本窗口已拦截 <strong>${state.privacyStats?.ads||0}</strong> 次广告请求、<strong>${state.privacyStats?.popups||0}</strong> 个弹窗、<strong>${state.privacyStats?.trackers||0}</strong> 次已知追踪请求，移除 <strong>${state.privacyStats?.cookies||0}</strong> 次跨站 Cookie 请求头。</p><p>${state.tor?esc(state.tor.message):'普通 / 无痕窗口仍使用当前网络出口，不隐藏 IP。'}</p><p>广告规则：EasyList + EasyList China，追踪规则：EasyPrivacy。离线内置快照 ${esc(state.adblock.snapshot)}，未启用规则脚本注入；不保证去除视频内嵌广告。</p><p>网站例外仅暂停广告 / 列表追踪拦截，不关闭 Cookie、HTTPS 或 Tor 安全限制。</p><p>GPC / DNT 是拒绝追踪信号，不代表网站一定遵守。此功能不是恶意网站数据库。</p><p>Tor 窗口使用独立临时存储与仅 SOCKS5 代理；未验证出口或连接中断时阻断访问。这不等同于 Tor Browser 的抗指纹能力。</p></div>${!tab().url.startsWith('tom:')&&state.preferences.adblock?menuItem(state.adblock.enabled?'在此网站暂停广告拦截':'在此网站开启广告拦截','shield','adblock-site'):''}${tab().popups?menuItem('允许最近拦截的弹窗（仅一次）','external','allow-popup'):''}${state.tor?menuItem('断开 Tor（阻断联网）','shield','tor-disconnect'):menuItem('新建 Tor 窗口','shield','tor-window')}${menuItem('隐私与安全设置','settings','page','','settings')}`);
$('#tab-search').onclick=()=>{openPopup(`<div class="menu-caption">打开的标签页 · ${state.tabs.length}</div><input class="popup-input" id="tab-filter" placeholder="搜索标签页"><div id="tab-results"></div>`);const fill=q=>$('#tab-results').innerHTML=state.tabs.filter(t=>(t.title+t.url).toLowerCase().includes(q.toLowerCase())).map(t=>`<button class="menu-item" data-select="${t.id}">${icon('globe')}<span>${esc(t.title)}</span></button>`).join('');fill('');$('#tab-filter').oninput=e=>fill(e.target.value);$('#tab-filter').focus();};
$('#tabs').addEventListener('click',e=>{const close=e.target.closest('[data-close]');if(close)return call('close-tab',Number(close.dataset.close));const t=e.target.closest('[data-tab]');if(t)call('select-tab',Number(t.dataset.tab));});
$('#tabs').addEventListener('keydown',e=>{if(e.target.closest('button'))return;const t=e.target.closest('[data-tab]');if(!t)return;if(['Enter',' '].includes(e.key)){e.preventDefault();call('select-tab',Number(t.dataset.tab));}if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const i=state.tabs.findIndex(tab=>tab.id===Number(t.dataset.tab));const n=e.key==='Home'?0:e.key==='End'?state.tabs.length-1:(i+(e.key==='ArrowLeft'?-1:1)+state.tabs.length)%state.tabs.length;const id=state.tabs[n].id;call('select-tab',id);tabNodes.get(id)?.focus();}});
$('#tabs').addEventListener('auxclick',e=>{if(e.button===1){const t=e.target.closest('[data-tab]');if(t)call('close-tab',Number(t.dataset.tab));}});
$('#tabs').addEventListener('contextmenu',e=>{
  const target=e.target.closest('[data-tab]');if(!target)return;e.preventDefault();
  const id=target.dataset.tab;
  openPopup(`${menuItem('新标签页','plus','new-tab','⌘T')}${menuItem('复制标签页','window','duplicate-tab','',id)}<div class="menu-divider"></div>${menuItem('关闭标签页','close','close-tab','⌘W',id)}${menuItem('关闭其他标签页','close','close-other-tabs','',id)}${menuItem('关闭右侧标签页','forward','close-right-tabs','',id)}<div class="menu-divider"></div>${menuItem('重新打开关闭的标签页','history','reopen','⇧⌘T')}`);
  $('#popup').style.left=Math.min(e.clientX,innerWidth-340)+'px';$('#popup').style.right='auto';$('#popup').style.top=Math.min(Math.max(0,e.clientY-44),innerHeight-360)+'px';
});
let dragged;
$('#tabs').addEventListener('dragstart',e=>{dragged=Number(e.target.closest('[data-tab]')?.dataset.tab);e.dataTransfer.effectAllowed='move';});
$('#tabs').addEventListener('dragover',e=>e.preventDefault());
$('#tabs').addEventListener('drop',e=>{e.preventDefault();const before=Number(e.target.closest('[data-tab]')?.dataset.tab);if(dragged&&before)call('move-tab',{id:dragged,before});});
$('#overlay').onclick=e=>{if(e.target===$('#overlay'))closePopup();};
async function openPopup(html){
  const generation=++popupGeneration;$('#popup').style.cssText='';
  $('#popup').innerHTML=html;$('#overlay').hidden=false;
  const preview=await call('overlay',true);
  if(preview&&generation===popupGeneration&&!$('#overlay').hidden){let image=$('#web-preview');if(!image){image=document.createElement('img');image.id='web-preview';image.alt='';$('#content').appendChild(image);}image.src=preview;}
}
function closePopup(){popupGeneration++;if(!$('#overlay').hidden){$('#overlay').hidden=true;$('#web-preview')?.remove();call('overlay',false);}}
function menuItem(label,name,action,keys='',payload){return `<button class="menu-item" data-action="${action}" ${payload!==undefined?`data-payload="${esc(payload)}"`:''}>${icon(name)}<span>${label}</span><span class="keys">${keys}</span></button>`;}
function openMenu(){const divider='<div class="menu-divider"></div>';openPopup(`${menuItem('新标签页','plus','new-tab','⌘T')}${menuItem('新窗口','window','new-window','⌘N')}${menuItem('新建无痕窗口','private','private-window','⇧⌘N')}${menuItem('新建 Tor 窗口','shield','tor-window')}${divider}${menuItem('历史记录','history','page','','history')}${menuItem('下载内容','download','page','⇧⌘J','downloads')}${menuItem('书签和列表','star','page','','bookmarks')}${divider}<div class="menu-zoom"><span>缩放</span><button data-zoom="-0.1">−</button><span>${Math.round(tab().zoom*100)}%</span><button data-zoom="0.1">＋</button><button data-action="fullscreen" title="全屏">${icon('fullscreen')}</button></div>${divider}${menuItem('在网页中查找…','search','show-find','⌘F')}${menuItem('打印…','print','print','⌘P')}${menuItem('网页另存为…','save','save-page','⌘S')}${menuItem(tab().muted?'取消标签页静音':'标签页静音','sliders','mute')}${menuItem('开发者工具','code','devtools','⌥⌘I')}${divider}${menuItem('设置','settings','page','⌘,','settings')}`);}
function showFind(){if(state?.htmlFullscreen){pendingFocus='find';call('exit-html-fullscreen');return;}closePopup();findOpen=true;$('#findbar').hidden=false;$('#find-input').focus();$('#find-input').select();layout();}
function find(next=false,forward=true){const text=$('#find-input').value;if(text)call('find',{text,next,forward});else{call('stop-find');$('#find-count').textContent='';}}
$('#find-input').oninput=()=>find();$('#find-input').onkeydown=e=>{if(e.key==='Enter')find(true,!e.shiftKey);if(e.key==='Escape')closeFind();};
function closeFind(){findOpen=false;$('#findbar').hidden=true;call('stop-find');layout();call('focus-web');}
$('#find-close').onclick=closeFind;$('#find-next').onclick=()=>find(true);$('#find-prev').onclick=()=>find(true,false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePopup();if(findOpen)closeFind();}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='l'){e.preventDefault();focusAddress();}});
function shortcutEditor(id){
  const existing=id?state.shortcuts.find(s=>s.id===id):null;if(id&&!existing)return;
  openPopup(`<form id="shortcut-form" class="shortcut-form"><h3>${existing?'修改快捷方式':'添加快捷方式'}</h3><label for="shortcut-title">名称</label><input id="shortcut-title" maxlength="60" autocomplete="off" value="${esc(existing?.title||'')}" required><label for="shortcut-url">网址</label><input id="shortcut-url" maxlength="2048" autocomplete="off" spellcheck="false" value="${esc(existing?.url||'')}" placeholder="https://example.com" required><p>仅保存在这台设备上，最多 10 个。不会自动访问该网址。</p><div><button type="button" class="text-button" data-action="close-popup">取消</button><button type="submit" class="primary">完成</button></div></form>`);
  $('#shortcut-form').onsubmit=async e=>{e.preventDefault();const result=await call('save-shortcut',{id:existing?.id,title:$('#shortcut-title').value,url:$('#shortcut-url').value});if(result){closePopup();toast('快捷方式已保存');}};
  $('#shortcut-title').focus();$('#shortcut-title').select();
}
function newTabHTML(){
  if(state.tor){const s=state.tor,ready=s.phase==='connected',busy=['idle','connecting','verifying'].includes(s.phase);return `<div class="newtab tor-newtab"><div class="tor-emblem">${icon('shield')}</div><h1>${ready?'Tor 连接已验证':'Tor 私密窗口'}</h1><p id="tor-status" data-phase="${esc(s.phase)}">${esc(s.message)}</p><progress class="tor-progress" max="100" value="${s.progress||0}"></progress><div class="tor-actions">${!busy?`<button class="text-button" data-action="tor-retry">${ready?'重新建立连接':'重试连接'}</button>`:''}${busy||ready?'<button class="text-button" data-action="tor-disconnect">断开连接</button>':''}</div><form class="searchbox" id="search-form">${icon('search')}<input id="newtab-search" placeholder="${ready?'在 DuckDuckGo 中搜索，或输入网址':'连接验证完成后才能浏览'}" aria-label="新标签页搜索" ${ready?'':'disabled'}></form><div class="tor-notice"><p><strong>仅在此窗口走 Tor。</strong> 普通窗口和无痕窗口不会因此隐藏 IP。连接失败不回退直连；关闭此窗口会停止其 Tor 进程和临时存储。</p><p>Chromium 指纹与 Tor Browser 不同，不能保证匿名。登录实名账号会关联身份；下载后用外部应用打开文件可能绕过 Tor。Tor 模式禁用本地网络、硬件权限、打印和网页另存为。</p><p>连接直接使用 Tor 网络，不自动使用系统代理；当前未集成网桥。受限网络可能无法连接。</p></div></div>`;}
  if(state.private)return `<div class="newtab"><div class="shortcut-icon">${icon('private')}</div><div class="private-intro"><h2>你已进入无痕模式</h2><p>此窗口不会在本地保存浏览历史。关闭窗口后，Cookie 和网站数据会被清除。</p><p>无痕模式不会让你在互联网上匿名。网站、网络管理员和互联网服务提供商仍可能看到你的活动。</p><p>下载的文件和主动添加的书签仍会保留。</p></div><form class="searchbox" id="search-form"><span>${icon('search')}</span><input id="newtab-search" placeholder="搜索或输入网址" aria-label="新标签页搜索"></form></div>`;
  const shortcuts=state.shortcuts||[];
  return `<div class="newtab"><div class="wordmark"><span><span class="tom">Tom</span> <span class="chrome-word">chrome</span></span></div><form class="searchbox" id="search-form">${icon('search')}<input id="newtab-search" placeholder="${({bing:'在必应中搜索，或输入网址',google:'在 Google 中搜索，或输入网址',duckduckgo:'在 DuckDuckGo 中搜索，或输入网址'})[state.preferences.engine]}" aria-label="新标签页搜索">${icon('sliders')}</form><div class="shortcuts">${shortcuts.map(s=>`<div class="shortcut-tile" data-shortcut="${esc(s.id)}"><button class="shortcut" data-url="${esc(s.url)}" title="${esc(s.url)}"><span class="shortcut-icon">${esc([...s.title][0]||'•')}</span><span>${esc(s.title)}</span></button><button class="shortcut-more icon-button" data-action="shortcut-menu" data-payload="${esc(s.id)}" aria-label="编辑 ${esc(s.title)}">${icon('menu')}</button></div>`).join('')}${shortcuts.length<10?'<button class="shortcut" data-action="add-shortcut"><span class="shortcut-icon">'+icon('plus')+'</span><span>添加快捷方式</span></button>':''}</div><button class="customize-button" data-page="settings">${icon('settings')} 自定义 Tom chrome</button></div>`;
}
const titles={history:'历史记录',bookmarks:'书签管理器',downloads:'下载内容',settings:'设置'};
function pageFrame(page,body){
  const settingsLinks=[['privacy-settings','shield','隐私和安全'],['appearance-settings','sliders','外观'],['search-settings','search','搜索引擎'],['default-settings','globe','默认浏览器'],['appearance-settings','window','启动时'],['about-settings','info','关于 Tom chrome']];
  const sidebar=page==='downloads'?'':`<aside class="sidebar"><div class="sidebar-brand">${icon(page==='settings'?'settings':page==='bookmarks'?'star':'history')}<span>${titles[page]}</span></div>${page==='settings'?settingsLinks.map(([id,name,label],i)=>`<button class="side-link ${i===0?'current':''}" data-jump="${id}">${icon(name)}${label}</button>`).join(''):`<button class="side-link current" data-page="${page}">${icon(page==='bookmarks'?'folder':'history')}${page==='bookmarks'?'书签栏':'浏览历史记录'}</button>${page==='history'?'<button class="side-link" data-action="confirm-clear-history">'+icon('trash')+'删除浏览数据</button>':''}`}</aside>`;
  return `<div class="page-layout">${sidebar}<section class="page-main"><div class="page-heading"><h1>${titles[page]}</h1><input class="filter" id="${page==='settings'?'settings-filter':'page-filter'}" placeholder="搜索${titles[page]}" value="${esc(filter)}" aria-label="搜索${titles[page]}"></div>${body}</section></div>`;
}
function privacySettingsHTML(){const p=state.preferences;return `<div class="card" id="privacy-settings"><div class="card-title">隐私和安全</div>${[['adblock','自动拦截广告','EasyList + EasyList China 规则拦截广告请求并隐藏广告元素。规则离线内置，不向广告公司上传浏览记录。'],['blockPopups','拦截广告弹窗','阻止脚本新开的窗口和已知广告目标。拦截后可从工具栏盾牌按钮手动允许一次。'],['blockTrackers','拦截已知追踪器','阻止内置列表中的分析 / 广告追踪请求。不承诺拦截全部广告；关闭可排查网站兼容性。'],['blockThirdPartyCookies','阻止跨站网络 Cookie','跨站子资源请求不发送 Cookie，跨站响应不写入 Set-Cookie。不是完整的浏览器存储隔离。'],['privacySignals','发送拒绝追踪信号','发送 Global Privacy Control 和 Do Not Track 请求头，并移除跨站 Referer。'],['httpsOnly','优先使用安全连接','外部 HTTP 主页面升级为 HTTPS；失败时不静默降级。局域网和 .onion 地址除外。']].map(([key,title,description])=>`<label class="setting-row"><div>${title}<p>${description}</p></div><input type="checkbox" data-setting="${key}" ${p[key]?'checked':''} ${state.tor?'disabled':''}></label>`).join('')}<div class="setting-row"><div>Tor 私密窗口<p>真实 Tor 网络；连接失败阻断联网。不会保护其他窗口，也不是 Tor Browser 同等级的抗指纹实现。</p></div><button class="text-button" data-action="tor-window">打开 Tor 窗口</button></div><div class="setting-row"><div>WebRTC 网络保护<p>禁止非代理 UDP，防止该通道绕过 SOCKS。QUIC 已禁用。可能影响音视频通话。</p></div>${icon('shield')}</div></div>`;}
function settingsHTML(){const p=state.preferences;return `${privacySettingsHTML()}<div class="card" id="default-settings"><div class="setting-row"><div>默认浏览器<p>将网页链接交给 Tom chrome 打开，系统会询问确认。</p></div><button class="text-button" data-action="default-browser">设为默认浏览器</button></div></div><div class="card" id="search-settings"><div class="card-title">搜索引擎</div><div class="setting-row"><div>地址栏中使用的搜索引擎<p>输入关键词会使用此搜索引擎，输入网址则直接访问。</p></div><select data-setting="engine"><option value="bing" ${p.engine==='bing'?'selected':''}>必应 Bing</option><option value="google" ${p.engine==='google'?'selected':''}>Google</option><option value="duckduckgo" ${p.engine==='duckduckgo'?'selected':''}>DuckDuckGo</option></select></div></div><div class="card" id="appearance-settings"><div class="card-title">外观与启动</div><div class="setting-row"><div>主题</div><select data-setting="theme">${[['light','浅色'],['dark','深色'],['system','跟随系统']].map(([v,l])=>`<option value="${v}" ${p.theme===v?'selected':''}>${l}</option>`).join('')}</select></div><label class="setting-row"><div>显示书签栏</div><input type="checkbox" data-setting="bookmarksBar" ${p.bookmarksBar?'checked':''}></label><label class="setting-row"><div>继续浏览上次打开的网页<p>下次启动时恢复普通窗口的标签页。不会恢复无痕窗口。</p></div><input type="checkbox" data-setting="restore" ${p.restore?'checked':''}></label></div><div class="card"><div class="card-title">隐私与安全</div><div class="setting-row"><div>清除浏览历史记录<p>不会删除书签、下载的文件或网站 Cookie。</p></div><button class="text-button danger" data-action="confirm-clear-history">清除历史记录</button></div><div class="setting-row"><div>清除 Cookie 和缓存<p>会退出此窗口所在模式的所有网站账号，请谨慎操作。</p></div><button class="text-button danger" data-action="confirm-clear-data">清除网站数据</button></div></div><div class="card" id="about-settings"><div class="about"><img src="../assets/logo.svg" alt=""><div><h2>Tom chrome</h2><p>版本 ${esc(state.version)} · Chromium ${esc(state.chromium)}</p><p>无需浏览器账号 · 数据保存在本机</p></div></div></div><div class="notice">Tom chrome 是独立的 Chromium 内核浏览器，并非 Google Chrome。当前不提供 Google 账号同步、Chrome 网上应用店安装、Widevine DRM、Chrome 密码管理器与自动更新。访问网站不受浏览器账号限制；网站账号仍可正常登录。系统网络代理由 Chromium 使用，网站证书错误不会被忽略。</div>`;}
async function renderPage(){const request=++pageRequest,t=tab();if(!t)return;const key=pageKey;
  if(t.error){$('#content').innerHTML=`<div class="error-page">${icon('error')}<h1>无法访问此网站</h1><p>${esc(t.error.url||t.url)}</p><p>请检查网络连接、网址或系统代理，然后重试。</p><p>${esc(t.error.description)} (${esc(t.error.code)})</p><button class="primary" data-action="reload">重新加载</button></div>`;return;}
  if(t.url==='tom://newtab'){$('#content').innerHTML=newTabHTML();$('#search-form').onsubmit=e=>{e.preventDefault();navigate($('#newtab-search').value);};return;}
  if(!t.url.startsWith('tom:')){$('#content').innerHTML='';return;}
  const page=t.url.split('://')[1];
  if(page==='settings'){$('#content').innerHTML=pageFrame(page,settingsHTML());$('#settings-filter').oninput=e=>{const query=e.target.value.toLowerCase();for(const card of document.querySelectorAll('.page-main .card'))card.hidden=!card.textContent.toLowerCase().includes(query);};return;}
  const data=await call('data',page);if(pageKey!==key||request!==pageRequest||!data)return;pageData=data;
  $('#content').innerHTML=pageFrame(page,'<div id="page-list"></div>');renderList(page);
  $('#page-filter').oninput=e=>{filter=e.target.value;listLimit=100;renderList(page);};
}
function formatSize(n){return n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';}
function renderList(page){const q=filter.toLowerCase();const matches=pageData[page].filter(x=>[x.title,x.url,x.name].filter(Boolean).join(' ').toLowerCase().includes(q));const list=matches.slice(0,listLimit);let body='';
  if(page==='history')body=`<p class="page-subtitle">${state.private?'无痕窗口不会保存或显示历史记录。':'浏览记录仅保存在此设备上。'}</p><button class="text-button danger" data-action="confirm-clear-history">清除浏览历史记录</button>`;
  if(page==='bookmarks')body='<p class="page-subtitle">在网页上点击地址栏中的星标，或按 ⌘D 添加书签。</p>';
  if(page==='downloads')body=`<p class="page-subtitle">${state.private?'无痕下载不保存到列表中；下载的文件仍会留在磁盘上。':'下载时会询问文件保存位置。'}</p><button class="text-button" data-action="clear-downloads">清除已结束的下载记录</button>`;
  body+=list.length?`<div class="card">${list.map(x=>{
    if(page==='downloads'){const status=({completed:'已完成',cancelled:'已取消',interrupted:'已中断',progressing:'正在下载',paused:'已暂停'})[x.state]||'上次下载未完成';return `<div class="row"><span class="row-icon">${icon('download')}</span><div class="row-body"><div class="row-title">${esc(x.name)}</div><div class="row-sub">${esc(x.url)}</div><div class="row-sub">${status} · ${formatSize(x.received)}${x.total?' / '+formatSize(x.total):''}</div>${x.state==='progressing'?`<progress value="${x.received}" max="${x.total||1}"></progress>`:''}</div>${['progressing','paused'].includes(x.state)?`<button class="text-button" data-transfer="${x.state==='paused'?'resume':'pause'}" data-transfer-id="${esc(x.id)}">${x.state==='paused'?'继续下载':'暂停下载'}</button><button class="text-button danger" data-transfer="cancel" data-transfer-id="${esc(x.id)}">取消下载</button>`:''}${x.state==='completed'?`<button class="text-button" data-download="${esc(x.id)}">打开文件</button><button class="icon-button" data-reveal="${esc(x.id)}" title="在访达中显示">${icon('folder')}</button>`:''}</div>`;}
    return `<div class="row row-link"><span class="row-icon">${icon(page==='history'?'history':'star')}</span><div class="row-body" data-url="${esc(x.url)}"><div class="row-title">${esc(x.title||x.url)}</div><div class="row-sub">${page==='history'?esc(new Date(x.time).toLocaleString('zh-CN'))+' · ':''}${esc(x.url)}</div></div><button class="icon-button" data-delete-${page}="${esc(x.id)}" aria-label="删除 ${esc(x.title)}">${icon('trash')}</button></div>`;
  }).join('')}</div>`:`<div class="empty">${icon(page==='bookmarks'?'star':page==='history'?'history':'download')}${q?'没有找到匹配的记录':({history:'暂无浏览历史记录',bookmarks:'你添加的书签会显示在这里',downloads:'暂无下载内容'})[page]}</div>`;
  if(matches.length)body+=`<div class="list-summary" role="status">显示 ${list.length} / ${matches.length} 条记录</div>${list.length<matches.length?'<button class="text-button" data-action="more-records">加载更多</button>':''}`;
  $('#page-list').innerHTML=body;
}
document.addEventListener('change',e=>{const k=e.target.dataset.setting;if(k)call('preferences',{[k]:e.target.type==='checkbox'?e.target.checked:e.target.value});});
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-url],[data-page],[data-action],[data-select],[data-zoom],[data-delete-history],[data-delete-bookmarks],[data-download],[data-reveal],[data-jump],[data-transfer]');if(!el)return;
  if(el.dataset.jump){const target=document.getElementById(el.dataset.jump);if(target){target.hidden=false;target.scrollIntoView({behavior:'smooth',block:'start'});for(const item of document.querySelectorAll('.side-link'))item.classList.toggle('current',item===el);}return;}
  if(el.dataset.url)return navigate(el.dataset.url);
  if(el.dataset.page)return navigate('tom://'+el.dataset.page);
  if(el.dataset.select){closePopup();return call('select-tab',Number(el.dataset.select));}
  if(el.dataset.zoom){await call('zoom',Number(el.dataset.zoom));return openMenu();}
  if(el.dataset.deleteHistory){await call('remove-history',el.dataset.deleteHistory);return renderPage();}
  if(el.dataset.deleteBookmarks){await call('remove-bookmark',el.dataset.deleteBookmarks);return renderPage();}
  if(el.dataset.transfer){const {ok}=await action('download-control',{id:el.dataset.transferId,action:el.dataset.transfer});if(ok)refreshList('downloads');return;}
  if(el.dataset.download)return call('open-download',el.dataset.download);
  if(el.dataset.reveal)return call('show-download',el.dataset.reveal);
  const a=el.dataset.action,p=el.dataset.payload;
  if(a==='more-records'){listLimit+=100;return renderList(tab().url.split('://')[1]);}
  if(a==='page')return navigate('tom://'+p);
  if(a==='show-find')return showFind();
  if(a==='confirm-clear-history'||a==='confirm-clear-data'){const history=a.endsWith('history');openPopup(`<div class="popup-info"><h3>${history?'清除浏览历史记录？':'清除 Cookie 和缓存？'}</h3><p>${history?'所有普通窗口的历史记录将被删除，无法撤销。':'这会退出此模式中的网站账号，且无法撤销。'}</p></div><button class="menu-item danger" data-action="${history?'clear-history':'clear-site-data'}">${icon('trash')}确认清除</button><button class="menu-item" data-action="close-popup">取消</button>`);return;}
  if(a==='close-popup')return closePopup();
  if(a==='add-shortcut'||a==='edit-shortcut')return shortcutEditor(a==='edit-shortcut'?p:null);
  if(a==='shortcut-menu'){const s=state.shortcuts.find(s=>s.id===p);if(s)openPopup(`<div class="menu-caption">${esc(s.title)}</div>${menuItem('修改快捷方式','sliders','edit-shortcut','',s.id)}${menuItem('移除','trash','remove-shortcut','',s.id)}`);return;}
  if(a==='remove-shortcut'){closePopup();const {ok}=await action(a,p);if(ok)toast('已移除快捷方式');return;}
  closePopup();const {ok,result}=await action(a,p);if(!ok)return;
  if(a==='default-browser')toast(result?'Tom chrome 已是默认浏览器':'请在系统提示或系统设置中确认默认浏览器');
  if(a==='new-tab')focusAddress();
  if(['clear-history','clear-downloads','clear-site-data'].includes(a)){toast('已清除');renderPage();}
});
