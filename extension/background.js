// Service worker: roteia comandos do celular (via offscreen/WebRTC) para a ÚNICA aba autorizada.
const OFFSCREEN = 'offscreen.html';
const VIEWER_PREFIX = chrome.runtime.getURL('viewer/');
const FORWARD = new Set(['state', 'pos', 'key']);
const VK = { next: 34, prev: 33 }; // PageDown / PageUp

let auth = null; // { tabId, dbg }
let phone = false;
let broker = false;
let brokerErr = '';
let loaded = null;

function load() {
  return (loaded ||= chrome.storage.session
    .get(['auth', 'phone', 'broker'])
    .then((s) => {
      auth = s.auth || null;
      phone = !!s.phone;
      broker = !!s.broker;
    }));
}
const save = () => chrome.storage.session.set({ auth, phone, broker });

function rand(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  return [...a].map((b) => abc[b % abc.length]).join('');
}

async function ensureIds() {
  const s = await chrome.storage.local.get(['peerId', 'token']);
  if (!s.peerId || !s.token) {
    await chrome.storage.local.set({ peerId: 'psl-' + rand(12), token: rand(16) });
  }
}

async function ensureOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (ctx.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN,
    reasons: ['WEB_RTC'],
    justification: 'Conexão direta (WebRTC) com o celular',
  });
}

const boot = () => ensureIds().then(ensureOffscreen).catch(console.error);
chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
boot();

const toPhone = (obj) => chrome.runtime.sendMessage({ target: 'off', send: obj }).catch(() => {});

async function sendStatus() {
  let title = '';
  if (auth) {
    try {
      title = (await chrome.tabs.get(auth.tabId)).title || '';
    } catch {}
  }
  toPhone({ t: 'status', authorized: !!auth, title, real: !!(auth && auth.dbg) });
}

async function getState() {
  await load();
  const s = await chrome.storage.local.get(['peerId', 'token', 'pwaUrl', 'realKeys']);
  return { ...s, phone, broker, brokerErr, auth };
}

async function attachDebugger(tabId) {
  try {
    if (!(await chrome.permissions.contains({ permissions: ['debugger'] }))) return false;
    listenDebugger();
    await chrome.debugger.attach({ tabId }, '1.3');
    return true;
  } catch {
    return false;
  }
}
const detachDebugger = async (tabId) => {
  try { await chrome.debugger.detach({ tabId }); } catch {}
};

async function authorize(tab) {
  await load();
  if (!tab || !tab.id) return { error: 'Aba inválida.' };
  const url = tab.url || '';
  const isViewer = url.startsWith(VIEWER_PREFIX);
  if (!isViewer && !/^(https?|file):/.test(url)) {
    return { error: 'Esta página não aceita extensões (ex.: chrome://, Web Store, leitor de PDF nativo). Use "Abrir PDF no passador" para PDFs.' };
  }
  if (auth && auth.tabId !== tab.id) await revoke();
  try {
    if (!isViewer) {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['overlay.js'] });
    }
  } catch (e) {
    return { error: 'Não foi possível acessar a aba: ' + e.message };
  }
  const { realKeys } = await chrome.storage.local.get('realKeys');
  const dbg = realKeys ? await attachDebugger(tab.id) : false;
  auth = { tabId: tab.id, dbg };
  await save();
  await sendStatus();
  return { ok: true };
}

async function revoke() {
  await load();
  if (!auth) return;
  const { tabId, dbg } = auth;
  auth = null;
  await save();
  chrome.tabs.sendMessage(tabId, { psl: true, t: 'hide' }).catch(() => {});
  if (dbg) await detachDebugger(tabId);
  await sendStatus();
}

async function realKey(tabId, k) {
  const vk = VK[k];
  const key = k === 'next' ? 'PageDown' : 'PageUp';
  const p = { windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, key, code: key };
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', ...p });
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type: 'keyUp', ...p });
}

async function fromPhone(data) {
  await load();
  if (!data || !FORWARD.has(data.t) || !auth) return;
  if (data.t === 'key' && auth.dbg) {
    try {
      return await realKey(auth.tabId, data.k);
    } catch {}
  }
  chrome.tabs.sendMessage(auth.tabId, { psl: true, ...data }).catch(() => {});
}

chrome.runtime.onMessage.addListener((m, _sender, reply) => {
  if (!m || m.target !== 'bg') return;
  (async () => {
    await load();
    switch (m.kind) {
      case 'conn':
        phone = !!m.connected;
        await save();
        if (phone) sendStatus();
        return;
      case 'broker':
        broker = !!m.up;
        brokerErr = broker ? '' : m.err || brokerErr;
        return save();
      case 'msg':
        return fromPhone(m.data);
      case 'getState':
        return getState();
      case 'authorize':
        return authorize(m.tab);
      case 'revoke':
        return revoke();
      case 'setRealKeys': {
        await chrome.storage.local.set({ realKeys: !!m.on });
        if (auth) {
          if (m.on && !auth.dbg) auth.dbg = await attachDebugger(auth.tabId);
          if (!m.on && auth.dbg) {
            await detachDebugger(auth.tabId);
            auth.dbg = false;
          }
          await save();
          await sendStatus();
        }
        return { ok: true };
      }
      case 'resetPairing':
        await chrome.storage.local.remove(['peerId', 'token']);
        await ensureIds();
        chrome.runtime.sendMessage({ target: 'off', restart: true }).catch(() => {});
        return { ok: true };
    }
  })().then(reply, (e) => reply({ error: String(e) }));
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await load();
  if (auth && auth.tabId === tabId) {
    auth = null;
    await save();
    sendStatus();
  }
});

// Troca de hash (#1 → #2) e pushState não destroem a página: a autorização continua.
// Só revoga se a página foi realmente trocada/recarregada, ou seja, o script de controle sumiu.
async function verifyAlive(tabId) {
  await load();
  if (!auth || auth.tabId !== tabId) return;
  let alive = false;
  try {
    const r = await chrome.tabs.sendMessage(tabId, { psl: true, t: 'ping' });
    alive = !!(r && r.ok);
  } catch {}
  if (alive || !auth || auth.tabId !== tabId) return;
  if (auth.dbg) detachDebugger(tabId);
  auth = null;
  await save();
  sendStatus();
}

chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  await load();
  if (!auth || auth.tabId !== tabId) return;
  if (info.status === 'loading') setTimeout(() => verifyAlive(tabId), 600);
  else if (info.status === 'complete') verifyAlive(tabId);
});

// chrome.debugger só existe depois que o usuário concede a permissão opcional.
let dbgListening = false;
function listenDebugger() {
  if (dbgListening || !chrome.debugger) return;
  dbgListening = true;
  chrome.debugger.onDetach.addListener(async (src) => {
    await load();
    if (auth && auth.tabId === src.tabId && auth.dbg) {
      auth.dbg = false;
      await save();
      sendStatus();
    }
  });
}
listenDebugger();
chrome.permissions.onAdded.addListener(listenDebugger);
