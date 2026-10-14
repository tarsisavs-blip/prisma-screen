const $ = (id) => document.getElementById(id);
const ask = (o) => chrome.runtime.sendMessage({ target: 'bg', ...o });
const DEFAULT_PWA = 'https://passador-de-slides.vercel.app/';
let showQr = false;
let lastQr = '';
let state = null;
let tab = null;

function dot(id, cls) { $(id).className = 'dot ' + (cls || ''); }

async function refresh() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  state = await ask({ kind: 'getState' });
  if (!state) return;

  dot('dBroker', state.broker ? 'ok' : 'warn');
  $('tBroker').textContent = state.broker
    ? 'Pronto para parear (ID ' + (state.peerId || '').slice(-4) + ')'
    : 'Sem servidor de pareamento' + (state.brokerErr ? ' (' + state.brokerErr + ')' : '…');
  dot('dPhone', state.phone ? 'ok' : '');
  $('tPhone').textContent = state.phone ? 'Celular conectado' : 'Celular desconectado';

  const here = state.auth && tab && state.auth.tabId === tab.id;
  dot('dAuth', state.auth ? 'ok' : '');
  $('tAuth').textContent = state.auth ? (here ? 'Esta aba está autorizada' : 'Outra aba está autorizada') : 'Nenhuma aba autorizada';
  $('bAuth').textContent = here ? 'Revogar autorização desta aba' : 'Autorizar esta aba';
  $('bAuth').className = here ? 'danger' : '';

  if (document.activeElement !== $('pwaUrl')) $('pwaUrl').value = state.pwaUrl || '';
  $('real').checked = !!state.realKeys;

  // QR de pareamento: só enquanto o celular não está conectado.
  const base = state.pwaUrl || DEFAULT_PWA;
  const url = state.peerId ? base.replace(/#.*$/, '') + '#' + state.peerId + '.' + state.token : '';
  if (url && (!state.phone || showQr)) {
    if (url !== lastQr) {
      const q = qrcode(0, 'M');
      q.addData(url);
      q.make();
      $('qrImg').src = q.createDataURL(6, 2);
      lastQr = url;
    }
    $('qr').style.display = 'block';
    $('qrHint').textContent = 'Escaneie com a câmera do celular (mesma rede Wi-Fi).';
  } else {
    $('qr').style.display = 'none';
    $('qrHint').textContent = state.phone ? '' : 'Aguardando o servidor de pareamento…';
  }
  $('bQr').textContent = showQr ? 'Ocultar QR code' : 'Mostrar QR code';
  $('bQr').style.display = state.phone ? 'block' : 'none';
}

$('bAuth').onclick = async () => {
  $('msg').style.color = '';
  $('msg').textContent = '';
  const here = state.auth && tab && state.auth.tabId === tab.id;
  const r = await ask({ kind: here ? 'revoke' : 'authorize', tab: here ? undefined : { id: tab.id, url: tab.url } });
  if (r && r.error) $('msg').textContent = r.error;
  refresh();
};

$('bPdf').onclick = () => {
  const isPdf = tab && /^(https?|file):.*\.pdf([?#].*)?$/i.test(tab.url || '');
  const u = chrome.runtime.getURL('viewer/viewer.html') + (isPdf ? '?url=' + encodeURIComponent(tab.url) : '');
  chrome.tabs.create({ url: u });
  window.close();
};

$('pwaUrl').onchange = async () => {
  let v = $('pwaUrl').value.trim();
  if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
  await chrome.storage.local.set({ pwaUrl: v });
  refresh();
};

$('real').onchange = async () => {
  const on = $('real').checked;
  if (on) {
    const ok = await chrome.permissions.request({ permissions: ['debugger'] });
    if (!ok) { $('real').checked = false; return; }
  }
  await ask({ kind: 'setRealKeys', on });
  refresh();
};

$('bQr').onclick = () => { showQr = !showQr; refresh(); };

$('bReset').onclick = async () => {
  $('msg').style.color = 'var(--lime-ink)';
  $('msg').textContent = 'Novo pareamento gerado. Escaneie o QR code abaixo.';
  await ask({ kind: 'resetPairing' });
  lastQr = '';
  showQr = true;
  $('qr').scrollIntoView();
  await refresh();
};

refresh();
setInterval(refresh, 1000);
