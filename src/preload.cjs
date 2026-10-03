const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('overlay', {
  connect: username => ipcRenderer.invoke('live:connect', username),
  disconnect: () => ipcRenderer.invoke('live:disconnect'),
  onChat: fn => ipcRenderer.on('live:chat', (_e, data) => fn(data)),
  onMember: fn => ipcRenderer.on('live:member', (_e, data) => fn(data)),
  onStats: fn => ipcRenderer.on('live:stats', (_e, data) => fn(data)),
  onActivity: fn => ipcRenderer.on('live:activity', (_e, data) => fn(data)),
  onStatus: fn => ipcRenderer.on('live:status', (_e, data) => fn(data)),
  onClickThroughState: fn => ipcRenderer.on('window:click-through-state', (_e, enabled) => fn(enabled)),
  close: () => ipcRenderer.send('window:close'),
  minimize: () => ipcRenderer.send('window:minimize'),
  clickThrough: enabled => ipcRenderer.send('window:click-through', enabled),
  alwaysOnTop: enabled => ipcRenderer.send('window:top', enabled),
  setSize: preset => ipcRenderer.send('window:size', preset)
});
