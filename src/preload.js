const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('tom', {
  call: (action,payload) => ipcRenderer.invoke('browser',action,payload),
  on: (event,callback) => { if (['state','focus-address','show-find','find-result','downloads-changed','data-changed'].includes(event)) ipcRenderer.on(event,(_,data)=>callback(data)); }
});
