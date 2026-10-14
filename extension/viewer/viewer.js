import * as pdfjs from '../lib/pdf.min.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.mjs');

const $ = (id) => document.getElementById(id);
const cv = $('cv');
const ctx = cv.getContext('2d');
let doc = null, n = 1, task = null, pending = null;

async function openData(data, name) {
  try {
    $('err').textContent = '';
    doc = await pdfjs.getDocument({ data }).promise;
    n = 1;
    document.title = (name || 'PDF') + ' - prisma-screen';
    $('open').style.display = 'none';
    if (document.activeElement) document.activeElement.blur();
    $('stage').style.display = 'grid';
    $('bar').style.display = 'flex';
    render();
  } catch (e) {
    $('err').textContent = 'Não foi possível abrir o PDF: ' + (e.message || e);
  }
}

async function render() {
  if (!doc) return;
  if (task) { pending = true; try { task.cancel(); } catch {} return; }
  const page = await doc.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const fit = Math.min(innerWidth / base.width, innerHeight / base.height);
  const dpr = window.devicePixelRatio || 1;
  const vp = page.getViewport({ scale: fit * dpr });
  cv.width = Math.floor(vp.width);
  cv.height = Math.floor(vp.height);
  cv.style.width = Math.floor(vp.width / dpr) + 'px';
  cv.style.height = Math.floor(vp.height / dpr) + 'px';
  $('pg').textContent = n + ' / ' + doc.numPages;
  task = page.render({ canvasContext: ctx, viewport: vp });
  try { await task.promise; } catch {}
  task = null;
  if (pending) { pending = null; render(); }
}

function go(to) {
  if (!doc) return;
  const m = Math.min(doc.numPages, Math.max(1, to));
  if (m !== n) { n = m; render(); }
}

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  const next = ['PageDown', 'ArrowRight', 'ArrowDown', ' ', 'Enter'].includes(e.key);
  const prev = ['PageUp', 'ArrowLeft', 'ArrowUp', 'Backspace'].includes(e.key);
  if (next) go(n + 1);
  else if (prev) go(n - 1);
  else if (e.key === 'Home') go(1);
  else if (e.key === 'End') go(doc ? doc.numPages : 1);
  else if (e.key === 'f' || e.key === 'F') toggleFs();
  else return;
  e.preventDefault();
});

function toggleFs() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
$('fs').onclick = toggleFs;
window.addEventListener('resize', render);

$('file').onchange = async (e) => {
  const f = e.target.files[0];
  if (f) openData(new Uint8Array(await f.arrayBuffer()), f.name);
};

async function openUrl(u) {
  try {
    $('err').textContent = 'Baixando…';
    const r = await fetch(u);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    openData(new Uint8Array(await r.arrayBuffer()), decodeURIComponent(u.split('/').pop().split('?')[0]));
  } catch (e) {
    $('err').textContent = 'Falha ao baixar o PDF (' + (e.message || e) + '). Para arquivos locais (file://), use o seletor acima ou ative "Permitir acesso a URLs de arquivo" na extensão.';
  }
}
$('go').onclick = () => $('url').value.trim() && openUrl($('url').value.trim());

const q = new URLSearchParams(location.search).get('url');
if (q) openUrl(q);
