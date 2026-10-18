const $ = (id) => document.getElementById(id);
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

let cfg = null;
let peer = null, conn = null, gen = 0, retryTimer = null, idTaken = 0;

function dot(id, cls) { $(id).className = 'dot ' + (cls || ''); }

// ---------- QR ----------
function drawQr() {
  const url = cfg.pwaUrl.replace(/#.*$/, '') + '#' + cfg.peerId + '.' + cfg.token;
  const q = qrcode(0, 'M');
  q.addData(url);
  q.make();
  $('qrImg').src = q.createDataURL(6, 2);
}

// ---------- Conexão com o celular (WebRTC / PeerJS) ----------
function schedule(ms) { clearTimeout(retryTimer); retryTimer = setTimeout(startPeer, ms); }

async function rotate() {
  const r = await api.rotate();
  cfg.peerId = r.peerId; cfg.token = r.token;
  drawQr();
  startPeer();
}

function startPeer() {
  clearTimeout(retryTimer);
  const my = ++gen;
  if (peer) { const old = peer; peer = null; try { old.destroy(); } catch {} }
  conn = null;
  setPhone(false);
  dot('dBroker', 'warn');
  $('tBroker').textContent = 'Conectando ao servidor de pareamento…';

  const fail = (e) => {
    if (my !== gen) return;
    const type = e && (e.type || e.message);
    dot('dBroker', 'bad');
    $('tBroker').textContent = 'Sem servidor de pareamento' + (type ? ' (' + type + ')' : '');
    if (type === 'unavailable-id') {
      if (++idTaken >= 3) { idTaken = 0; rotate(); return; }
      return schedule(8000);
    }
    schedule(4000);
  };

  const p = new Peer(cfg.peerId, { config: ICE });
  peer = p;
  p.on('open', () => {
    if (my !== gen) return;
    idTaken = 0;
    dot('dBroker', 'ok');
    $('tBroker').textContent = 'Pronto para parear (ID ' + cfg.peerId.slice(-4) + ')';
  });
  p.on('disconnected', () => { if (my === gen) { try { p.reconnect(); } catch { fail({ type: 'disconnected' }); } } });
  p.on('close', () => fail({ type: 'closed' }));
  p.on('error', fail);
  p.on('connection', (c) => {
    c.on('data', (d) => {
      if (!c.authed) {
        if (d && d.t === 'hello' && d.token === cfg.token) {
          c.authed = true;
          if (conn && conn !== c) try { conn.close(); } catch {}
          conn = c;
          setPhone(true);
          api.phoneConn(true);
        } else c.close();
        return;
      }
      api.phoneMsg(d);
    });
    c.on('close', () => { if (conn === c) { conn = null; setPhone(false); } });
    c.on('error', () => {});
  });
}

function setPhone(on) {
  dot('dPhone', on ? 'ok' : '');
  $('tPhone').textContent = on ? 'Celular conectado' : 'Celular desconectado';
}

api.onToPhone((m) => { if (conn && conn.open) conn.send(m); });

// ---------- Holyrics ----------
api.onHolyrics((r) => {
  const name = r.action === 'ActionNext' ? 'Avançar' : 'Voltar';
  $('hres').innerHTML = '';
  const d = document.createElement('span');
  d.className = 'dot ' + (r.ok ? 'ok' : 'bad');
  const t = document.createElement('span');
  t.textContent = r.ok ? name + ': ok' : name + ': ' + r.error;
  $('hres').append(d, t);
});

// ---------- Captura de tecla ----------
const EXT_CODES = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Insert', 'Delete', 'NumpadEnter', 'NumpadDivide', 'ControlRight', 'AltRight']);
const MODS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock']);
function keyLabel(e) {
  if (e.key === ' ') return 'Espaço';
  return e.key.length === 1 ? e.key.toUpperCase() + (e.code.startsWith('Numpad') ? ' (numérico)' : '') : e.key;
}
function setCaptured(sel, value) {
  let o = [...sel.options].find((x) => x.value === value);
  if (!o) {
    o = document.createElement('option');
    o.value = value;
    o.textContent = 'Capturada: ' + value.split(':').slice(3).join(':');
    sel.appendChild(o);
  }
  sel.value = value;
}
function ensureOption(sel, value) { if (value && value.startsWith('vk:')) setCaptured(sel, value); else sel.value = value; }
function capture(btn, sel) {
  if (btn.classList.contains('cap')) return;
  const old = btn.textContent;
  btn.textContent = 'Pressione a tecla… (Esc cancela)';
  btn.classList.add('cap');
  const done = () => { btn.textContent = old; btn.classList.remove('cap'); window.removeEventListener('keydown', onKey, true); };
  function onKey(e) {
    if (MODS.has(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Escape') return done();
    if (!e.keyCode) return;
    setCaptured(sel, 'vk:' + e.keyCode + ':' + (EXT_CODES.has(e.code) ? 1 : 0) + ':' + keyLabel(e));
    done();
    saveHolyrics();
  }
  window.addEventListener('keydown', onKey, true);
}
$('bCapN').onclick = () => capture($('bCapN'), $('hKeyN'));
$('bCapP').onclick = () => capture($('bCapP'), $('hKeyP'));

function toggleApi() { $('apiBox').style.display = $('hMode').value === 'api' ? '' : 'none'; }
function saveHolyrics() {
  toggleApi();
  return api.setCfg({ holyrics: { keyNext: $('hKeyN').value, keyPrev: $('hKeyP').value, mode: $('hMode').value, host: $('aHost').value.trim() || '127.0.0.1', port: Number($('aPort').value) || 8091, token: $('aToken').value.trim() } });
}
['hKeyN', 'hKeyP', 'hMode', 'aHost', 'aPort', 'aToken'].forEach((id) => ($(id).onchange = saveHolyrics));
$('bNext').onclick = async () => { await saveHolyrics(); api.testHolyrics('ActionNext'); };
$('bDebug').onclick = () => api.openDebug();
$('bPrev').onclick = async () => { await saveHolyrics(); api.testHolyrics('ActionPrevious'); };

// ---------- Saída com efeitos ----------
function showStream(r) {
  $('sres').innerHTML = '';
  const d = document.createElement('span');
  const t = document.createElement('span');
  if (r.ok) { d.className = 'dot ok'; t.textContent = 'Servindo a saída com efeitos'; }
  else { d.className = 'dot ' + (cfg.stream && cfg.stream.source ? 'bad' : 'warn'); t.textContent = r.error || 'Cole o link do Holyrics para ligar.'; }
  $('sres').append(d, t);
  $('sUrls').innerHTML = '';
  (r.urls || []).forEach((u) => {
    const row = document.createElement('div');
    row.className = 'row mono';
    const span = document.createElement('span');
    span.textContent = u;
    const btn = document.createElement('button');
    btn.className = 'sec';
    btn.textContent = 'Copiar';
    btn.onclick = () => { navigator.clipboard.writeText(u); btn.textContent = 'Copiado'; setTimeout(() => (btn.textContent = 'Copiar'), 1500); };
    row.append(span, btn);
    $('sUrls').appendChild(row);
  });
}
api.onStream(showStream);
function saveStream() {
  const source = $('sSource').value.trim();
  const port = Number($('sPort').value) || 8765;
  cfg.stream = { source, port };
  return api.setCfg({ stream: { source, port } });
}
['sSource', 'sPort'].forEach((id) => ($(id).onchange = saveStream));

// ---------- Sistema ----------
$('autostart').onchange = () => api.setCfg({ autostart: $('autostart').checked });
$('bTest').onclick = () => api.testStream();
$('bFw').onclick = async () => {
  $('fwres').textContent = 'Aguardando a permissão do Windows…';
  const r = await api.openFirewall();
  $('fwres').innerHTML = '';
  const d = document.createElement('span'); d.className = 'dot ' + (r.ok ? 'ok' : 'bad');
  const t = document.createElement('span'); t.textContent = r.ok ? 'Porta liberada no firewall.' : r.error;
  $('fwres').append(d, t);
};
$('bRotate').onclick = () => rotate();

// ---------- Início ----------
(async () => {
  const r = await api.getCfg();
  cfg = r.cfg;
  ensureOption($('hKeyN'), cfg.holyrics.keyNext);
  ensureOption($('hKeyP'), cfg.holyrics.keyPrev);
  $('hMode').value = cfg.holyrics.mode;
  $('aHost').value = cfg.holyrics.host;
  $('aPort').value = cfg.holyrics.port;
  $('aToken').value = cfg.holyrics.token;
  toggleApi();
  $('sSource').value = cfg.stream.source;
  $('sPort').value = cfg.stream.port;
  api.streamInfo().then(showStream);
  $('autostart').checked = !!cfg.autostart;
  drawQr();
  startPeer();
})();
