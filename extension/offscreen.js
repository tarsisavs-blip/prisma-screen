// Documento offscreen: mantém o peer WebRTC (service workers MV3 não têm WebRTC).
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

let peer = null;
let conn = null;
let token = '';
let retryTimer = null;
let gen = 0; // geração: eventos de peers antigos (já destruídos) são ignorados
let idTaken = 0;

const bg = (o) => chrome.runtime.sendMessage({ target: 'bg', ...o }).catch(() => {});

function schedule(ms) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(start, ms);
}

async function start() {
  clearTimeout(retryTimer);
  const my = ++gen;
  if (peer) {
    const old = peer;
    peer = null;
    try { old.destroy(); } catch {}
  }
  const s = (await chrome.runtime.sendMessage({ target: 'bg', kind: 'getState' }).catch(() => null)) || {};
  if (my !== gen) return;
  if (!s.peerId) return schedule(1000);
  token = s.token;

  const fail = (e) => {
    if (my !== gen) return;
    const type = e && (e.type || e.message);
    bg({ kind: 'broker', up: false, err: type });
    if (type === 'unavailable-id') {
      // ID ainda preso no servidor (sessão anterior): espera e, se persistir, troca de ID.
      if (++idTaken >= 3) {
        idTaken = 0;
        bg({ kind: 'resetPairing' });
        return;
      }
      return schedule(8000);
    }
    schedule(4000);
  };

  const p = new Peer(s.peerId, { config: ICE });
  peer = p;
  p.on('open', () => {
    if (my !== gen) return;
    idTaken = 0;
    bg({ kind: 'broker', up: true });
  });
  p.on('disconnected', () => {
    if (my !== gen) return;
    bg({ kind: 'broker', up: false });
    try { p.reconnect(); } catch { fail({ type: 'disconnected' }); }
  });
  p.on('close', () => fail({ type: 'closed' }));
  p.on('error', fail);
  p.on('connection', (c) => {
    c.on('data', (d) => {
      if (!c.authed) {
        if (d && d.t === 'hello' && d.token === token) {
          c.authed = true;
          if (conn && conn !== c) try { conn.close(); } catch {}
          conn = c;
          bg({ kind: 'conn', connected: true });
        } else {
          c.close();
        }
        return;
      }
      bg({ kind: 'msg', data: d });
    });
    c.on('close', () => {
      if (conn === c) {
        conn = null;
        bg({ kind: 'conn', connected: false });
      }
    });
    c.on('error', () => {});
  });
}

chrome.runtime.onMessage.addListener((m) => {
  if (!m || m.target !== 'off') return;
  if (m.restart) { idTaken = 0; start(); }
  if (m.send && conn && conn.open) conn.send(m.send);
});

start();
