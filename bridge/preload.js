const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getCfg: () => ipcRenderer.invoke('cfg:get'),
  setCfg: (p) => ipcRenderer.invoke('cfg:set', p),
  phoneMsg: (d) => ipcRenderer.send('phone:msg', d),
  phoneConn: (on) => ipcRenderer.send('phone:conn', on),
  onToPhone: (cb) => ipcRenderer.on('to-phone', (_e, d) => cb(d)),
  onHolyrics: (cb) => ipcRenderer.on('holyrics-result', (_e, d) => cb(d)),
  testHolyrics: (a) => ipcRenderer.invoke('holyrics:test', a),
  onStream: (cb) => ipcRenderer.on('stream-info', (_e, d) => cb(d)),
  streamInfo: () => ipcRenderer.invoke('stream:info'),
  openFirewall: () => ipcRenderer.invoke('fw:open'),
  openDebug: () => ipcRenderer.invoke('dbg:open'),
  testStream: () => ipcRenderer.invoke('stream:test'),
  rotate: () => ipcRenderer.invoke('pairing:rotate'),
});

contextBridge.exposeInMainWorld('dbg', {
  onLog: (cb) => ipcRenderer.on('dbg-log', (_e, d) => cb(d)),
  list: () => ipcRenderer.invoke('dbg:list'),
  api: (action) => ipcRenderer.invoke('dbg:api', action),
  send: (key, mode, hwnd) => ipcRenderer.invoke('dbg:send', key, mode, hwnd),
});
