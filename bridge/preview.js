// Prévia da projeção para o celular: abre a página de saída (/saida) numa janela invisível,
// tira "fotos" dela algumas vezes por segundo e manda para o app pela conexão já existente.
// Assim o app (HTTPS) não precisa abrir o link http:// da rede local, que o navegador bloquearia.
const { BrowserWindow } = require('electron');

const W = 480;          // largura do quadro enviado
const MIN_GAP = 120;    // ms entre quadros (~8 por segundo)
const IDLE_MS = 25000;  // sem sinal do celular por esse tempo, para sozinho

let win = null, send = null, url = '', last = 0, idleTimer = null, refreshTimer = null;

function stop() {
  clearTimeout(idleTimer); clearInterval(refreshTimer);
  idleTimer = refreshTimer = null;
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}

// Chamado a cada sinal do celular (ligar / manter ligado). `toPhone` envia mensagens ao celular.
function start(pageUrl, toPhone) {
  send = toPhone;
  clearTimeout(idleTimer);
  idleTimer = setTimeout(stop, IDLE_MS);
  if (win && !win.isDestroyed() && pageUrl === url) { win.webContents.invalidate(); return; }
  stop();
  url = pageUrl;
  idleTimer = setTimeout(stop, IDLE_MS);
  win = new BrowserWindow({
    show: false, width: 960, height: 540, frame: false, skipTaskbar: true, focusable: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.setFrameRate(10);
  let loaded = false;
  win.webContents.once('did-finish-load', () => { loaded = true; });
  win.webContents.on('paint', (_e, _dirty, image) => {
    const now = Date.now();
    if (!loaded || now - last < MIN_GAP || !send) return; // ignora a tela branca antes da página carregar
    last = now;
    try {
      const jpg = image.resize({ width: W, quality: 'good' }).toJPEG(55);
      send({ t: 'frame', img: jpg.toString('base64') });
    } catch {}
  });
  win.loadURL(pageUrl).catch(() => {});
  // A página só "pinta" quando algo muda: força um quadro por segundo para quem acabou de entrar.
  refreshTimer = setInterval(() => { if (win && !win.isDestroyed()) win.webContents.invalidate(); }, 1000);
}

module.exports = { start, stop };
