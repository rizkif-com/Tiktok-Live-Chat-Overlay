const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('overlay', {
  connect: (platform, target) => ipcRenderer.invoke('source:connect', { platform, target }),
  disconnect: id => ipcRenderer.invoke('source:disconnect', id),
  disconnectAll: () => ipcRenderer.invoke('source:disconnect-all'),
  onSources: fn => ipcRenderer.on('sources:update', (_e, data) => fn(data)),
  onSourceError: fn => ipcRenderer.on('source:error', (_e, data) => fn(data)),
  onNotice: fn => ipcRenderer.on('source:notice', (_e, data) => fn(data)),
  getMobileInfo: () => ipcRenderer.invoke('mobile:info'),
  onMobileInfo: fn => ipcRenderer.on('mobile:info', (_e, data) => fn(data)),
  onChat: fn => ipcRenderer.on('live:chat', (_e, data) => fn(data)),
  onMember: fn => ipcRenderer.on('live:member', (_e, data) => fn(data)),
  onStats: fn => ipcRenderer.on('live:stats', (_e, data) => fn(data)),
  onActivity: fn => ipcRenderer.on('live:activity', (_e, data) => fn(data)),
  onClickThroughState: fn => ipcRenderer.on('window:click-through-state', (_e, enabled) => fn(enabled)),
  close: () => ipcRenderer.send('window:close'),
  minimize: () => ipcRenderer.send('window:minimize'),
  clickThrough: enabled => ipcRenderer.send('window:click-through', enabled),
  alwaysOnTop: enabled => ipcRenderer.send('window:top', enabled),
  setSize: preset => ipcRenderer.send('window:size', preset)
});
