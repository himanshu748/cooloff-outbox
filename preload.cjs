require('@smartspectra/node-sdk/preload');
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cooloff', {
  consent: (value) => ipcRenderer.invoke('cooloff:consent', value),
  key: () => ipcRenderer.invoke('cooloff:key'),
  readiness: (options) => ipcRenderer.invoke('cooloff:readiness', options),
  send: (fields) => ipcRenderer.invoke('cooloff:send', fields),
  counter: (action, seconds) =>
    ipcRenderer.invoke('cooloff:counter', action, seconds),
});
