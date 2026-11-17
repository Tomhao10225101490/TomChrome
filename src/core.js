const fs = require('node:fs');
const path = require('node:path');
const { initialShortcuts,validateShortcut } = require('./shortcuts');
const engines = {
  bing: 'https://www.bing.com/search?q=',
  google: 'https://www.google.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q='
};
function resolveInput(input, engine = 'bing') {
  const value = String(input || '').trim();
  if (!value || value === 'tom://newtab') return 'tom://newtab';
  if (/^tom:\/\/(newtab|history|bookmarks|downloads|settings)$/.test(value)) return value;
  if (/^https?:\/\//i.test(value)) { try { return new URL(value).href; } catch {} }
  if (/^[a-z][\w+.-]*:/i.test(value) && !/^localhost:\d/i.test(value) && !/^[\w.-]+:\d+(\/|$)/.test(value)) throw new Error('仅支持 http、https 和 Tom 内置页面');
  if (!/\s/.test(value) && (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(value))) return new URL('http://' + value).href;
  if (!/\s/.test(value) && /^[\w\p{L}-]+(\.[\w\p{L}-]+)+(:\d+)?([/?#]|$)/u.test(value)) return new URL('https://' + value).href;
  return (engines[engine] || engines.bing) + encodeURIComponent(value);
}
const defaults = { engine: 'bing', restore: true, bookmarksBar: true, theme: 'light', blockTrackers: true, blockThirdPartyCookies: true, privacySignals: true, httpsOnly: true, adblock: true, blockPopups: true, adblockAllowlist: [] };
function readData(file){
  const text=fs.readFileSync(file,'utf8');const data=JSON.parse(text);
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid profile');
  for(const key of ['bookmarks','history','downloads','tabs','shortcuts'])if(key in data&&!Array.isArray(data[key]))throw Error('Invalid '+key);
  if(data.shortcuts){
    if(data.shortcuts.length>10)throw Error('Invalid shortcuts');const ids=new Set();
    for(const shortcut of data.shortcuts){if(!shortcut||typeof shortcut.id!=='string'||!shortcut.id||shortcut.id.length>128||ids.has(shortcut.id)||typeof shortcut.title!=='string'||typeof shortcut.url!=='string')throw Error('Invalid shortcut');validateShortcut(shortcut);ids.add(shortcut.id);}
  }
  if('preferences' in data&&(!data.preferences||typeof data.preferences!=='object'||Array.isArray(data.preferences)))throw Error('Invalid preferences');
  for(const key of ['bookmarks','history','downloads'])for(const row of data[key]||[]){
    if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid '+key+' record');
    for(const field of ['url','title','name','path','id'])if(field in row&&typeof row[field]!=='string')throw Error('Invalid '+key+' '+field);
  }
  if(data.tabs?.some(url=>typeof url!=='string'||!/^https?:\/\//i.test(url)&&url!=='tom://newtab'))throw Error('Invalid tabs');
  const p=data.preferences;if(p){
    for(const [key,value]of Object.entries(defaults))if(key in p&&typeof value==='boolean'&&typeof p[key]!=='boolean')throw Error('Invalid preference '+key);
    if('adblockAllowlist' in p&&(!Array.isArray(p.adblockAllowlist)||p.adblockAllowlist.some(host=>typeof host!=='string')))throw Error('Invalid site exceptions');
    if('engine' in p&&!Object.hasOwn(engines,p.engine)||'theme' in p&&!['light','dark','system'].includes(p.theme))throw Error('Invalid preference selection');
  }
  return {text,data};
}
class Store {
  constructor(dir) {
    this.file = path.join(dir, 'browser-data.json');this.recovery=null;
    this.data = { bookmarks: [], history: [], downloads: [], tabs: [], shortcuts:structuredClone(initialShortcuts), preferences:structuredClone(defaults) };
    let loaded;
    try{loaded=readData(this.file);}catch(error){
      if(error.code!=='ENOENT'){
        try{loaded=readData(this.file+'.bak');this.recovery='本地资料损坏，已从上次有效备份恢复。损坏原件已保留。';}
        catch{throw Error('本地资料损坏，且没有可读取的备份。为防止覆盖，已停止启动。请保留资料目录进行恢复。');}
        const preserved=this.file+'.corrupt-'+Date.now();fs.copyFileSync(this.file,preserved);fs.chmodSync(preserved,0o600);
      }else{
        try{loaded=readData(this.file+'.bak');this.recovery='主资料文件缺失，已从上次有效备份恢复。';}catch(error){if(error.code!=='ENOENT')throw Error('资料备份无法读取，已停止启动以防止覆盖。');}
      }
    }
    if(loaded){const d=loaded.data;for(const key of ['bookmarks','history','downloads','tabs','shortcuts'])if(Array.isArray(d[key]))this.data[key]=d[key];this.data.preferences={...structuredClone(defaults),...d.preferences};}
    for(const download of this.data.downloads)if(['progressing','paused'].includes(download.state))download.state='interrupted';
    this.lastGoodText=loaded?.text||null;this.backupReady=false;this.pendingWrite=null;this.saveTimer=null;this.dirty=false;
    this.onError=error=>console.error('Profile save failed:',error.code||error.message);
  }
  // Coalesce background history/title/tab changes without holding up the UI thread.
  saveSoon(){if(this.saveTimer)return;this.saveTimer=setTimeout(()=>{this.saveTimer=null;this.flush().catch(error=>this.onError(error));},250);this.saveTimer.unref();}
  flush(){
    clearTimeout(this.saveTimer);this.saveTimer=null;this.dirty=true;
    if(!this.pendingWrite)this.pendingWrite=this.drain().finally(()=>{this.pendingWrite=null;});
    return this.pendingWrite;
  }
  async atomicAsync(file,text){
    const temporary=file+'.tmp';const handle=await fs.promises.open(temporary,'w',0o600);
    try{await handle.chmod(0o600);await handle.writeFile(text);await handle.sync();}finally{await handle.close();}
    await fs.promises.rename(temporary,file);
  }
  async drain(){
    while(this.dirty){
      this.dirty=false;const text=JSON.stringify(this.data);
      if(text===this.lastGoodText&&this.backupReady)continue;
      await fs.promises.mkdir(path.dirname(this.file),{recursive:true});
      if(this.lastGoodText){await this.atomicAsync(this.file+'.bak',this.lastGoodText);this.backupReady=true;}
      await this.atomicAsync(this.file,text);this.lastGoodText=text;
      if(!this.backupReady){await this.atomicAsync(this.file+'.bak',text);this.backupReady=true;}
    }
  }
  atomic(file,text){
    const temporary=file+'.tmp';let fd;
    try{fd=fs.openSync(temporary,'w',0o600);fs.fchmodSync(fd,0o600);fs.writeFileSync(fd,text);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temporary,file);}
    finally{if(fd!==undefined)fs.closeSync(fd);}
  }
  // Synchronous administrative/test API only. The running browser uses flush/saveSoon.
  save() {
    if(this.pendingWrite)throw Error('Cannot synchronously save during an asynchronous write');
    clearTimeout(this.saveTimer);this.saveTimer=null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const text=JSON.stringify(this.data,null,2);let previous;
    try{previous=readData(this.file).text;}catch{}
    if(previous)this.atomic(this.file+'.bak',previous);
    this.atomic(this.file,text);
    if(!fs.existsSync(this.file+'.bak'))this.atomic(this.file+'.bak',text);
    this.lastGoodText=text;this.backupReady=true;
  }
}
module.exports = { resolveInput, Store, defaults };
