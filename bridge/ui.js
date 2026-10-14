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

function saveHolyrics() {
  api.setCfg({ holyrics: { host: $('hHost').value.trim() || '127.0.0.1', port: Number($('hPort').value) || 8091, token: $('hToken').value.trim() } });
}
['hHost', 'hPort', 'hToken'].forEach((id) => ($(id).onchange = saveHolyrics));
$('bNext').onclick = async () => { await saveHolyrics(); api.testHolyrics('ActionNext'); };
$('bPrev').onclick = async () => { await saveHolyrics(); api.testHolyrics('ActionPrevious'); };

// ---------- Overlay / sistema ----------
$('display').onchange = () => api.setCfg({ displayId: Number($('display').value) });
$('overlayOn').onchange = () => api.setCfg({ overlayOn: $('overlayOn').checked });
$('autostart').onchange = () => api.setCfg({ autostart: $('autostart').checked });
$('bTest').onclick = () => api.testOverlay();
$('bRotate').onclick = () => rotate();

// ---------- Início ----------
(async () => {
  const r = await api.getCfg();
  cfg = r.cfg;
  $('hHost').value = cfg.holyrics.host;
  $('hPort').value = cfg.holyrics.port;
  $('hToken').value = cfg.holyrics.token;
  $('overlayOn').checked = !!cfg.overlayOn;
  $('autostart').checked = !!cfg.autostart;
  const sel = $('display');
  r.displays.forEach((d) => {
    const o = document.createElement('option');
    o.value = d.id; o.textContent = d.label;
    sel.appendChild(o);
  });
  if (cfg.displayId && r.displays.some((d) => d.id === cfg.displayId)) sel.value = cfg.displayId;
  else {
    const secondary = r.displays.length > 1 ? r.displays[r.displays.length - 1] : r.displays[0];
    sel.value = secondary.id;
    api.setCfg({ displayId: secondary.id });
  }
  drawQr();
  startPeer();
})();
