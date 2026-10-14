const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getCfg: () => ipcRenderer.invoke('cfg:get'),
  setCfg: (p) => ipcRenderer.invoke('cfg:set', p),
  phoneMsg: (d) => ipcRenderer.send('phone:msg', d),
  phoneConn: (on) => ipcRenderer.send('phone:conn', on),
  onToPhone: (cb) => ipcRenderer.on('to-phone', (_e, d) => cb(d)),
  onHolyrics: (cb) => ipcRenderer.on('holyrics-result', (_e, d) => cb(d)),
  testHolyrics: (a) => ipcRenderer.invoke('holyrics:test', a),
  testOverlay: () => ipcRenderer.invoke('overlay:test'),
  rotate: () => ipcRenderer.invoke('pairing:rotate'),
  onOverlay: (cb) => ipcRenderer.on('overlay', (_e, d) => cb(d)),
});
