const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const keys = require('./keys');
const stream = require('./stream');
const preview = require('./preview');
const hapi = require('./holyrics-api');
const { spawn } = require('child_process');

// O app foi renomeado para prisma-screen, mas as configurações (pareamento, link do Holyrics) ficam na pasta antiga.
app.setPath('userData', path.join(app.getPath('appData'), 'Passador Holyrics'));

if (!app.requestSingleInstanceLock()) app.quit();

const DEFAULT_PWA = 'https://passador-de-slides.vercel.app/';
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
let cfg = {};
let ui = null, tray = null;
let quitting = false;

const rnd = (n) => {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(n), (b) => a[b % a.length]).join('');
};

function loadCfg() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(cfgFile(), 'utf8')); } catch {}
  c.peerId ||= 'psl-' + rnd(12);
  c.token ||= rnd(16);
  c.pwaUrl ||= DEFAULT_PWA;
  c.holyrics = { keyNext: 'PageDown', keyPrev: 'PageUp', mode: 'direct', host: '127.0.0.1', port: 8091, token: '', ...(c.holyrics || {}) };
  c.stream = { source: '', port: 8765, ...(c.stream || {}) };
  delete c.overlayOn; delete c.displayId;
  c.autostart ??= false;
  return c;
}
function saveCfg() {
  fs.mkdirSync(path.dirname(cfgFile()), { recursive: true });
  fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2));
}

// ---------- Holyrics (API ou teclas) ----------
async function holyrics(action) {
  const h = cfg.holyrics;
  const r = h.mode === 'api' ? await hapi.call(h, action) : await keys.press(action === 'ActionNext' ? h.keyNext : h.keyPrev, h.mode);
  return report({ ok: r.ok, error: r.error, action });
}
function report(r) {
  if (ui && !ui.isDestroyed()) ui.webContents.send('holyrics-result', r);
  return r;
}

// ---------- Janela de debug das teclas ----------
let dbgWin = null;
const dbgLog = [];
keys.events.on('log', (e) => {
  dbgLog.push(e);
  if (dbgLog.length > 200) dbgLog.shift();
  if (dbgWin && !dbgWin.isDestroyed()) dbgWin.webContents.send('dbg-log', e);
});
function showDebug() {
  if (dbgWin && !dbgWin.isDestroyed()) { dbgWin.show(); dbgWin.focus(); return; }
  dbgWin = new BrowserWindow({
    width: 760, height: 560, title: 'prisma-screen · debug das teclas', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  dbgWin.loadFile(path.join(__dirname, 'debug.html'));
  dbgWin.webContents.once('did-finish-load', () => dbgLog.forEach((e) => dbgWin.webContents.send('dbg-log', e)));
}
ipcMain.handle('dbg:open', showDebug);
ipcMain.handle('dbg:list', () => keys.listWindows());
ipcMain.handle('dbg:api', (_e, action) => hapi.call(cfg.holyrics, action));
ipcMain.handle('fw:open', () => new Promise((resolve) => {
  const port = Number(cfg.stream.port) || 8765;
  const name = 'prisma-screen saida ' + port;
  const args = `advfirewall firewall add rule name="${name}" dir=in action=allow protocol=TCP localport=${port} profile=any`;
  const ps = `try { Start-Process netsh -ArgumentList '${args}' -Verb RunAs -Wait -WindowStyle Hidden -ErrorAction Stop } catch { exit 2 }; if (Get-NetFirewallRule -DisplayName '${name}' -ErrorAction SilentlyContinue) { exit 0 } else { exit 3 }`;
  const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
  p.on('exit', (c) => resolve(c === 0 ? { ok: true } : { ok: false, error: c === 2 ? 'A permissão do Windows foi negada ou cancelada.' : 'Não consegui confirmar a regra no firewall.' }));
  p.on('error', (e) => resolve({ ok: false, error: e.message }));
}));
ipcMain.handle('dbg:send', (_e, key, mode, hwnd) => keys.press(key, mode, hwnd));

// ---------- Saída com efeitos (link para navegador/OBS) ----------
let streamInfo = { ok: false, error: '' };
async function startStream() {
  streamInfo = await stream.start(Number(cfg.stream.port) || 8765, cfg.stream.source);
  preview.stop(); // o celular pede de novo e a prévia reabre já com a nova fonte
  if (ui && !ui.isDestroyed()) ui.webContents.send('stream-info', streamInfo);
  toPhone(status());
  return streamInfo;
}

// ---------- Mensagens do celular ----------
function status() {
  return { t: 'status', authorized: !!streamInfo.ok, preview: !!streamInfo.ok, title: 'Holyrics' + (streamInfo.ok ? ' · efeitos no link de saída' : '') };
}
function toPhone(m) { if (ui && !ui.isDestroyed()) ui.webContents.send('to-phone', m); }

ipcMain.on('phone:msg', (_e, d) => {
  if (!d) return;
  if (d.t === 'key') holyrics(d.k === 'next' ? 'ActionNext' : 'ActionPrevious');
  else if (d.t === 'state' || d.t === 'pos') stream.applyFx(d);
  else if (d.t === 'preview') {
    // O celular pede a prévia da projeção (e renova o pedido de tempos em tempos).
    if (d.on && streamInfo.ok) preview.start(`http://127.0.0.1:${Number(cfg.stream.port) || 8765}/saida`, toPhone);
    else preview.stop();
  }
});
ipcMain.on('phone:conn', (_e, on) => { if (on) toPhone(status()); });

ipcMain.handle('cfg:get', () => ({ cfg }));
ipcMain.handle('cfg:set', async (_e, p) => {
  if (p.holyrics) cfg.holyrics = { ...cfg.holyrics, ...p.holyrics };
  const restream = !!p.stream;
  if (p.stream) cfg.stream = { ...cfg.stream, ...p.stream };
  for (const k of ['pwaUrl', 'autostart']) if (k in p) cfg[k] = p[k];
  saveCfg();
  app.setLoginItemSettings({ openAtLogin: !!cfg.autostart });
  if (restream) await startStream();
  toPhone(status());
  return true;
});
ipcMain.handle('stream:info', () => streamInfo);
ipcMain.handle('holyrics:test', (_e, action) => holyrics(action));
ipcMain.handle('stream:test', () => {
  const s = (o) => stream.applyFx({ t: 'state', ...o });
  s({ laser: { on: true, color: 'red' }, fade: { on: false }, blackout: { on: false }, x: 0.5, y: 0.5 });
  setTimeout(() => s({ laser: { on: false }, fade: { on: true, radius: 0.15, dim: 0.75 } }), 1500);
  setTimeout(() => s({ fade: { on: false }, blackout: { on: true } }), 3000);
  setTimeout(() => s({ blackout: { on: false } }), 4200);
  return true;
});
ipcMain.handle('pairing:rotate', () => {
  cfg.peerId = 'psl-' + rnd(12);
  cfg.token = rnd(16);
  saveCfg();
  return { peerId: cfg.peerId, token: cfg.token };
});

// ---------- Janela principal e bandeja ----------
function showUi() {
  if (ui && !ui.isDestroyed()) { ui.show(); ui.focus(); return; }
  ui = new BrowserWindow({
    width: 480, height: 820, title: 'prisma-screen', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  });
  ui.loadFile(path.join(__dirname, 'ui.html'));
  ui.on('close', (e) => { if (!quitting) { e.preventDefault(); ui.hide(); } });
}

app.on('second-instance', showUi);
app.whenReady().then(() => {
  cfg = loadCfg();
  saveCfg();
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('prisma-screen');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir', click: showUi },
    { label: 'Sair', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showUi);
  showUi();
  if (cfg.stream.source) startStream();
});
app.on('before-quit', () => { quitting = true; keys.stop(); preview.stop(); stream.stop(); });
app.on('window-all-closed', () => {});
