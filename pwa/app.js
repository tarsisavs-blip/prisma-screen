'use strict';
const $ = (id) => document.getElementById(id);
const LS = {
  get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- Pareamento (QR code abre  https://.../#<peerId>.<token>) ----------
if (location.hash.length > 1) {
  const [id, token] = location.hash.slice(1).split('.');
  if (id && token) LS.set('pair', { id, token });
  history.replaceState(null, '', location.pathname);
}
let pair = LS.get('pair', null);
window.addEventListener('hashchange', () => location.reload());

// ---------- Estado ----------
const S = {
  laser: false,
  color: LS.get('color', 'red'),
  fade: false,
  blackout: false,
  radius: LS.get('radius', 15),
  mode: LS.get('mode', 'pad'),
  span: LS.get('span', 40),
  x: 0.5, y: 0.5,
  connected: false, authorized: false, touching: false,
};
const DIM = 0.75;

// ---------- Conexão ----------
let peer = null, conn = null, retry = null;

function setupScreen(msg) {
  $('setup').classList.toggle('show', !pair);
  $('setupMsg').textContent = msg || '';
}

const ICE = { iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
] };
const dbg = (t) => { $('dbg').textContent = t; };
const ERR = {
  'peer-unavailable': 'não achei o computador. Abra o prisma-screen no PC e escaneie o QR code atual de novo.',
  'network': 'sem internet ou servidor de pareamento fora do ar.',
  'server-error': 'servidor de pareamento indisponível.',
  'socket-error': 'falha de conexão com o servidor de pareamento.',
  'socket-closed': 'conexão com o servidor de pareamento caiu.',
  'webrtc': 'falha WebRTC (rede bloqueando conexão direta).',
};

function connect() {
  if (!pair) return setupScreen();
  clearTimeout(retry);
  if (peer) try { peer.destroy(); } catch {}
  dbg('1/3 Conectando ao servidor de pareamento…');
  peer = new Peer({ config: ICE });
  let opened = false;
  const again = (e) => {
    S.connected = false; S.authorized = false; S.preview = false; showFrame(null); syncPreview(); ui();
    if (!pair) return; // desconexão manual: não tenta reconectar
    if (e && e.type) dbg('Erro: ' + e.type + ' — ' + (ERR[e.type] || (e.message || '')));
    clearTimeout(retry); retry = setTimeout(connect, 3000);
  };
  peer.on('error', again);
  peer.on('open', () => {
    dbg('2/3 Procurando o computador…');
    conn = peer.connect(pair.id, { serialization: 'json', reliable: true });
    const pc = conn.peerConnection;
    if (pc) pc.addEventListener('iceconnectionstatechange', () => { if (!opened) dbg('2/3 Rede: ' + pc.iceConnectionState); });
    setTimeout(() => { if (!opened && conn && !conn.open) again({ type: 'timeout', message: 'o computador não respondeu em 15 s (rede bloqueando WebRTC ou QR antigo).' }); }, 15000);
    conn.on('open', () => { opened = true; dbg('3/3 Conectado'); conn.send({ t: 'hello', token: pair.token }); S.connected = true; ui(); });
    conn.on('data', (m) => {
      if (m && m.t === 'status') {
        const was = S.authorized;
        S.authorized = !!m.authorized;
        S.title = m.title || '';
        S.preview = !!m.preview; // só a ponte do Holyrics oferece a prévia da projeção
        if (!S.preview) showFrame(null);
        ui();
        syncPreview();
        if (S.authorized && !was) pushState(true);
      } else if (m && m.t === 'frame' && S.preview) showFrame(m.img);
    });
    conn.on('close', again);
    conn.on('error', again);
  });
}

const send = (o) => { if (conn && conn.open) conn.send(o); };

// ---------- Prévia da projeção (só com a ponte do Holyrics) ----------
// No lugar do touchpad vazio, mostra o que está sendo projetado, com laser/destaque/tela preta.
let previewTimer = null;
function showFrame(b64) {
  $('pad').classList.toggle('hasPv', !!b64);
  if (b64) $('pv').src = 'data:image/jpeg;base64,' + b64;
  else $('pv').removeAttribute('src');
}
function syncPreview() {
  clearInterval(previewTimer);
  previewTimer = null;
  const want = S.preview && S.authorized && !document.hidden;
  send({ t: 'preview', on: want });
  // A ponte desliga a prévia sozinha se parar de receber este sinal.
  if (want) previewTimer = setInterval(() => send({ t: 'preview', on: true }), 8000);
  else if (!S.preview || !S.authorized) showFrame(null);
}
function pushState(withPos) {
  send({
    t: 'state',
    // Laser e fade só aparecem enquanto o dedo está pressionando o touchpad.
    laser: { on: S.laser && S.touching, color: S.color },
    fade: { on: S.fade && S.touching, radius: S.radius / 100, dim: DIM },
    blackout: { on: S.blackout },
    ...(withPos ? { x: S.x, y: S.y } : {}),
  });
}

// ---------- UI ----------
function ui() {
  $('dConn').className = 'dot ' + (S.connected ? 'ok' : 'warn');
  $('tConn').textContent = S.connected ? 'Conectado' : 'Conectando…';
  $('dAuth').className = 'dot ' + (S.authorized ? 'ok' : '');
  $('tAuth').textContent = S.authorized ? (S.title || 'Tela autorizada') : 'Tela não autorizada';
  $('warn').textContent = S.connected && !S.authorized ? 'No computador: clique no ícone do prisma-screen e em "Autorizar esta aba".' : '';
  for (const [id, on] of [['laser', S.laser], ['fade', S.fade], ['blackout', S.blackout]]) {
    $(id).classList.toggle('on', on);
    $(id).setAttribute('aria-pressed', on);
  }
  document.querySelectorAll('.sw').forEach((b) => b.classList.toggle('sel', b.dataset.c === S.color));
  $('mGyro').classList.toggle('sel', S.mode === 'gyro');
  $('mPad').classList.toggle('sel', S.mode === 'pad');
  $('sensRow').style.display = S.mode === 'gyro' ? 'grid' : 'none';
  $('padHint').textContent = !S.laser && !S.fade
    ? 'ative o laser ou o destaque acima'
    : S.mode === 'gyro'
      ? 'segure o dedo aqui e mova o celular'
      : 'segure e deslize o dedo para mover';
  $('rad').value = S.radius;
  $('sens').value = S.span;
  $('bOff').disabled = !pair;
}

const buzz = () => { try { navigator.vibrate && navigator.vibrate(15); } catch {} };
$('next').onclick = () => { buzz(); send({ t: 'key', k: 'next' }); };
$('prev').onclick = () => { buzz(); send({ t: 'key', k: 'prev' }); };
// Laser e destaque são alternados: ligar um desliga o outro.
$('laser').onclick = () => { S.laser = !S.laser; if (S.laser) S.fade = false; ui(); pushState(true); };
$('fade').onclick = () => { S.fade = !S.fade; if (S.fade) S.laser = false; ui(); pushState(true); };
// Tela preta: apaga toda a apresentação até apertar de novo.
$('blackout').onclick = () => { buzz(); S.blackout = !S.blackout; ui(); pushState(true); };
document.querySelectorAll('.sw').forEach((b) => (b.onclick = () => setColor(b.dataset.c)));
const ORDER = ['green', 'red', 'blue'];
$('cycle').onclick = () => setColor(ORDER[(ORDER.indexOf(S.color) + 1) % 3]);
function setColor(c) { S.color = c; LS.set('color', c); ui(); pushState(); }
$('rad').oninput = (e) => { S.radius = +e.target.value; LS.set('radius', S.radius); pushState(); };
$('sens').oninput = (e) => { S.span = +e.target.value; LS.set('span', S.span); };

// ---------- Desconectar e ler QR code ----------
function disconnect() {
  // Apaga laser, destaque e tela preta no computador antes de sair.
  S.laser = S.fade = S.blackout = S.touching = false;
  pushState(true);
  send({ t: 'preview', on: false });
  clearInterval(previewTimer); previewTimer = null;
  S.preview = false; showFrame(null);
  pair = null;
  try { localStorage.removeItem('pair'); } catch {}
  clearTimeout(retry);
  const c = conn, p = peer;
  conn = peer = null;
  setTimeout(() => { try { c && c.close(); } catch {} try { p && p.destroy(); } catch {} }, 120);
  S.connected = false; S.authorized = false; S.title = '';
  dbg('');
  ui();
  setupScreen('Desconectado. Leia o QR code para conectar de novo.');
}
$('bOff').onclick = () => { buzz(); disconnect(); };

const scanEl = $('scan'), scanVideo = $('scanVideo');
let scanStream = null, scanning = false, jsQRLoad = null;
function loadJsQR() {
  return (jsQRLoad ||= new Promise((ok, no) => {
    if (window.jsQR) return ok();
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js';
    s.onload = () => ok(); s.onerror = () => { jsQRLoad = null; no(new Error('leitor indisponível')); };
    document.head.appendChild(s);
  }));
}
function stopScan() {
  scanning = false;
  scanEl.classList.remove('show');
  if (scanStream) { scanStream.getTracks().forEach((t) => t.stop()); scanStream = null; }
  scanVideo.srcObject = null;
}
// Aceita o endereço completo do QR (https://.../#id.token) ou só "id.token".
function parseQr(text) {
  const raw = String(text).trim();
  const h = raw.includes('#') ? raw.slice(raw.indexOf('#') + 1) : raw;
  const [id, token] = h.split('.');
  return /^[\w-]{4,}$/.test(id || '') && /^[\w-]{4,}$/.test(token || '') ? { id, token } : null;
}
function applyPair(p) {
  LS.set('pair', p);
  pair = p;
  S.connected = false; S.authorized = false;
  setupScreen();
  ui();
  connect();
}
async function startScan() {
  $('scanMsg').textContent = 'Aponte a câmera para o QR code do computador.';
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('câmera indisponível (precisa de HTTPS)');
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    const msg = e && e.name === 'NotAllowedError' ? 'Permita o uso da câmera para ler o QR code.' : 'Não consegui abrir a câmera: ' + (e.message || e.name);
    $('warn').textContent = msg; $('setupMsg').textContent = msg;
    return;
  }
  scanVideo.srcObject = scanStream;
  try { await scanVideo.play(); } catch {}
  scanEl.classList.add('show');
  scanning = true;
  let detector = null;
  if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch {} }
  if (!detector) {
    try { await loadJsQR(); } catch (e) { $('scanMsg').textContent = 'Sem internet para carregar o leitor de QR code.'; }
  }
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (!scanning) return;
    let text = null;
    try {
      if (scanVideo.readyState >= 2) {
        if (detector) {
          const r = await detector.detect(scanVideo);
          if (r.length) text = r[0].rawValue;
        } else if (window.jsQR) {
          const w = scanVideo.videoWidth, h = scanVideo.videoHeight, k = Math.min(1, 640 / w);
          cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          cx.drawImage(scanVideo, 0, 0, cv.width, cv.height);
          const img = cx.getImageData(0, 0, cv.width, cv.height);
          const r = window.jsQR(img.data, img.width, img.height);
          if (r) text = r.data;
        }
      }
    } catch {}
    if (text) {
      const p = parseQr(text);
      if (p) { buzz(); stopScan(); applyPair(p); return; }
      $('scanMsg').textContent = 'Esse QR code não é do prisma-screen. Tente o QR code do computador.';
    }
    setTimeout(tick, 200);
  };
  tick();
}
$('bScan').onclick = startScan;
$('bScan2').onclick = startScan;
$('scanCancel').onclick = stopScan;

// ---------- Envio de posição (~60 Hz, só se mudou) ----------
let sentX = -1, sentY = -1;
function setPos(x, y) { S.x = Math.min(1, Math.max(0, x)); S.y = Math.min(1, Math.max(0, y)); }
setInterval(() => {
  if (S.x !== sentX || S.y !== sentY) { sentX = S.x; sentY = S.y; send({ t: 'pos', x: +S.x.toFixed(4), y: +S.y.toFixed(4) }); }
}, 16);

// ---------- Touchpad ----------
const pad = $('pad');
let last = null;
function touch(on) {
  if (S.touching === on) return;
  S.touching = on;
  pad.classList.toggle('hold', on);
  pushState(true);
}
pad.addEventListener('pointerdown', (e) => {
  try { pad.setPointerCapture(e.pointerId); } catch {}
  last = { x: e.clientX, y: e.clientY };
  // A cada toque o ponteiro volta ao centro da tela e o giroscópio é recalibrado ali.
  ref = null; smooth = null;
  setPos(0.5, 0.5);
  touch(true);
  if (S.mode === 'gyro' && lastO) onOrient(lastO);
});
pad.addEventListener('pointermove', (e) => {
  if (!last || S.mode !== 'pad') return;
  const w = pad.clientWidth;
  const dx = e.clientX - last.x, dy = e.clientY - last.y;
  last.x = e.clientX; last.y = e.clientY;
  const aspect = 16 / 9; // telas de apresentação: movimento isotrópico em pixels
  setPos(S.x + (dx / w) * 1.6, S.y + (dy / w) * 1.6 * aspect);
});
const release = () => { last = null; touch(false); };
pad.addEventListener('pointerup', release);
pad.addEventListener('pointercancel', release);
pad.addEventListener('lostpointercapture', release);
document.addEventListener('visibilitychange', () => { if (document.hidden) release(); syncPreview(); });

// ---------- Giroscópio ----------
let ref = null, smooth = null, lastO = null;
const rad = Math.PI / 180;
function onOrient(e) {
  if (e.alpha == null || e.beta == null) return;
  lastO = e;
  if (S.mode !== 'gyro' || !S.touching) return; // só acompanha o celular enquanto o dedo está no touchpad
  const a = e.alpha * rad, b = e.beta * rad;
  // Vetor "para frente" (aresta superior do celular) no referencial do mundo.
  const fx = -Math.sin(a) * Math.cos(b), fy = Math.cos(a) * Math.cos(b), fz = Math.sin(b);
  const yaw = Math.atan2(fx, fy), pitch = Math.asin(Math.max(-1, Math.min(1, fz)));
  if (!ref) ref = { yaw, pitch };
  let dyaw = yaw - ref.yaw;
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  const dpitch = pitch - ref.pitch;
  const span = S.span * rad;
  const tx = 0.5 + dyaw / span, ty = 0.5 - dpitch / (span * 0.5625);
  smooth = smooth ? { x: smooth.x + (tx - smooth.x) * 0.4, y: smooth.y + (ty - smooth.y) * 0.4 } : { x: tx, y: ty };
  setPos(smooth.x, smooth.y);
}

async function enableGyro() {
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission(); // iOS exige toque do usuário
      if (r !== 'granted') throw new Error('negado');
    }
    if (!window.isSecureContext) throw new Error('precisa de HTTPS');
    window.removeEventListener('deviceorientation', onOrient);
    window.addEventListener('deviceorientation', onOrient);
    return true;
  } catch (e) {
    $('warn').textContent = 'Giroscópio indisponível: ' + e.message + '. Usando touchpad.';
    return false;
  }
}
$('mGyro').onclick = async () => {
  if (await enableGyro()) { S.mode = 'gyro'; LS.set('mode', S.mode); ref = null; smooth = null; ui(); }
  else { S.mode = 'pad'; ui(); }
};
$('mPad').onclick = () => { S.mode = 'pad'; LS.set('mode', S.mode); ui(); };

// ---------- Tela sempre acesa ----------
let lock = null;
async function keepAwake() { try { lock = await navigator.wakeLock.request('screen'); } catch {} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { keepAwake(); if (!S.connected) connect(); } });
document.addEventListener('pointerdown', function once() { keepAwake(); document.removeEventListener('pointerdown', once); }, { once: true });

// Em modo giroscópio salvo, o iOS só libera o sensor após um toque: o usuário aperta o botão de novo.
if (S.mode === 'gyro') S.mode = 'pad';

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
ui();
setupScreen();
connect();
