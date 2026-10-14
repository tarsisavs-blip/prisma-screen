const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// O app foi renomeado para prisma-screen, mas as configurações (token do Holyrics, pareamento) ficam na pasta antiga.
app.setPath('userData', path.join(app.getPath('appData'), 'Passador Holyrics'));

if (!app.requestSingleInstanceLock()) app.quit();

const DEFAULT_PWA = 'https://passador-de-slides.vercel.app/';
const cfgFile = () => path.join(app.getPath('userData'), 'config.json');
let cfg = {};
let ui = null, overlay = null, tray = null;
let quitting = false;
const st = { laser: { on: false }, fade: { on: false }, blackout: { on: false } };

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
  c.holyrics = { host: '127.0.0.1', port: 8091, token: '', ...(c.holyrics || {}) };
  c.overlayOn ??= false;
  c.displayId ??= null;
  c.autostart ??= false;
  return c;
}
function saveCfg() {
  fs.mkdirSync(path.dirname(cfgFile()), { recursive: true });
  fs.writeFileSync(cfgFile(), JSON.stringify(cfg, null, 2));
}

// ---------- Monitores ----------
function displaysInfo() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `Monitor ${i + 1} (${d.bounds.width}×${d.bounds.height})${d.id === primary ? ' · principal' : ''}`,
  }));
}
function targetDisplay() {
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === cfg.displayId) || all.find((d) => d.id !== screen.getPrimaryDisplay().id) || all[0];
}

// ---------- Janela de overlay (transparente, sem foco, não captura cliques) ----------
function ensureOverlay() {
  const d = targetDisplay();
  if (overlay && !overlay.isDestroyed()) {
    overlay.setBounds(d.bounds);
    return overlay;
  }
  overlay = new BrowserWindow({
    ...d.bounds,
    transparent: true, frame: false, resizable: false, movable: false, focusable: false,
    skipTaskbar: true, hasShadow: false, show: false, alwaysOnTop: true, fullscreenable: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setIgnoreMouseEvents(true);
  overlay.loadFile(path.join(__dirname, 'overlay.html'));
  overlay.on('closed', () => (overlay = null));
  return overlay;
}
function overlaySend(d) {
  if (!cfg.overlayOn) return;
  const w = ensureOverlay();
  if (!w.webContents.isLoading()) w.webContents.send('overlay', d);
  else w.webContents.once('did-finish-load', () => w.webContents.send('overlay', d));
  if (d.t === 'state') {
    if (d.laser) st.laser = d.laser;
    if (d.fade) st.fade = d.fade;
    if (d.blackout) st.blackout = d.blackout;
    const active = st.laser.on || st.fade.on || st.blackout.on;
    if (active && !w.isVisible()) w.showInactive();
    if (!active && w.isVisible()) w.hide();
  }
}
function overlayOff() {
  st.laser.on = false; st.fade.on = false; st.blackout.on = false;
  if (overlay && !overlay.isDestroyed()) overlay.hide();
}

// ---------- Holyrics ----------
async function holyrics(action) {
  const h = cfg.holyrics;
  if (!h.token) return report({ ok: false, action, error: 'Token do Holyrics não configurado.' });
  const url = `http://${h.host}:${h.port}/api/${action}?token=${encodeURIComponent(h.token)}`;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(3000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status === 'error') {
      return report({ ok: false, action, error: `Holyrics respondeu ${r.status}${j.error ? ': ' + j.error : ''}` });
    }
    return report({ ok: true, action });
  } catch (e) {
    return report({ ok: false, action, error: 'Não alcançou o Holyrics (' + (e.name === 'TimeoutError' ? 'tempo esgotado' : e.message) + ').' });
  }
}
function report(r) {
  if (ui && !ui.isDestroyed()) ui.webContents.send('holyrics-result', r);
  return r;
}

// ---------- Mensagens do celular ----------
function status() {
  const d = targetDisplay();
  return { t: 'status', authorized: !!cfg.overlayOn, title: 'Holyrics' + (cfg.overlayOn ? ' · overlay no ' + displaysInfo().find((x) => x.id === d.id)?.label.split(' (')[0] : '') };
}
function toPhone(m) { if (ui && !ui.isDestroyed()) ui.webContents.send('to-phone', m); }

ipcMain.on('phone:msg', (_e, d) => {
  if (!d) return;
  if (d.t === 'key') holyrics(d.k === 'next' ? 'ActionNext' : 'ActionPrevious');
  else if (d.t === 'state' || d.t === 'pos') overlaySend(d);
});
ipcMain.on('phone:conn', (_e, on) => { if (on) toPhone(status()); });

ipcMain.handle('cfg:get', () => ({ cfg, displays: displaysInfo() }));
ipcMain.handle('cfg:set', (_e, p) => {
  const was = cfg.overlayOn;
  if (p.holyrics) cfg.holyrics = { ...cfg.holyrics, ...p.holyrics };
  for (const k of ['pwaUrl', 'overlayOn', 'displayId', 'autostart']) if (k in p) cfg[k] = p[k];
  saveCfg();
  if (!cfg.overlayOn && was) overlayOff();
  if (cfg.overlayOn) ensureOverlay();
  app.setLoginItemSettings({ openAtLogin: !!cfg.autostart });
  toPhone(status());
  return true;
});
ipcMain.handle('holyrics:test', (_e, action) => holyrics(action));
ipcMain.handle('overlay:test', async () => {
  const was = cfg.overlayOn;
  cfg.overlayOn = true;
  overlaySend({ t: 'state', laser: { on: true, color: 'red' }, fade: { on: false, radius: 0.15, dim: 0.75 }, x: 0.5, y: 0.5 });
  setTimeout(() => overlaySend({ t: 'state', laser: { on: false }, fade: { on: true, radius: 0.15, dim: 0.75 }, x: 0.5, y: 0.5 }), 1800);
  setTimeout(() => { overlaySend({ t: 'state', laser: { on: false }, fade: { on: false } }); cfg.overlayOn = was; if (!was) overlayOff(); }, 3600);
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
});
app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {});
