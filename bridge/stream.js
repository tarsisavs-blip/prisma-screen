// Servidor local: repassa a transmissão do Holyrics (/view/widescreen) e entrega uma página de saída
// com laser, destaque e tela preta desenhados por cima. O link da página serve para navegador ou OBS.
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const os = require('os');
const fs = require('fs');
const path = require('path');

let server = null, target = null, cur = { port: 0, source: '' };
const clients = new Set();
const fx = { laser: { on: false, color: 'red' }, fade: { on: false, radius: 0.15, dim: 0.75 }, blackout: { on: false }, x: 0.5, y: 0.5 };

function parseSource(s) {
  try {
    const u = new URL(String(s).trim());
    return /^https?:$/.test(u.protocol) ? u : null;
  } catch { return null; }
}

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}

function broadcast() {
  const data = `data: ${JSON.stringify(fx)}\n\n`;
  for (const res of clients) res.write(data);
}

// Atualiza o estado dos efeitos e avisa as páginas abertas.
function applyFx(m) {
  if (m.t === 'state') {
    if (m.laser) Object.assign(fx.laser, m.laser);
    if (m.fade) Object.assign(fx.fade, m.fade);
    if (m.blackout) Object.assign(fx.blackout, m.blackout);
    if (typeof m.x === 'number') { fx.x = m.x; fx.y = m.y; }
  } else if (m.t === 'pos') {
    fx.x = Math.min(1, Math.max(0, m.x));
    fx.y = Math.min(1, Math.max(0, m.y));
  } else return;
  broadcast();
}
function resetFx() {
  fx.laser.on = false; fx.fade.on = false; fx.blackout.on = false;
  broadcast();
}

function proxyHeaders(h, u) {
  const o = { ...h, host: u.host };
  delete o.origin; delete o.referer;
  return o;
}

function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.writeHead(302, { Location: '/saida' }); return res.end(); }
  if (url.pathname === '/saida') {
    const html = fs.readFileSync(path.join(__dirname, 'stream.html'), 'utf8')
      .replace('__SRC__', () => JSON.stringify(target.pathname + target.search));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(html);
  }
  if (url.pathname === '/_fx/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`data: ${JSON.stringify(fx)}\n\n`);
    clients.add(res);
    const ka = setInterval(() => res.write(': ka\n\n'), 20000);
    req.on('close', () => { clearInterval(ka); clients.delete(res); });
    return;
  }
  const mod = target.protocol === 'https:' ? https : http;
  const up = mod.request({
    hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: req.url, method: req.method, headers: proxyHeaders(req.headers, target), rejectUnauthorized: false,
  }, (r) => {
    const h = { ...r.headers };
    delete h['x-frame-options']; delete h['content-security-policy'];
    if (h.location) h.location = h.location.replace(target.origin, '');
    res.writeHead(r.statusCode, h);
    r.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Não alcançou o Holyrics.'); });
  req.pipe(up);
}

function upgrade(req, socket, head) {
  const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);
  const secure = target.protocol === 'https:';
  const up = (secure ? tls : net).connect(
    secure ? { host: target.hostname, port, rejectUnauthorized: false } : { host: target.hostname, port },
    () => {
      let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
      for (const [k, v] of Object.entries(proxyHeaders(req.headers, target))) raw += `${k}: ${v}\r\n`;
      up.write(raw + '\r\n');
      if (head && head.length) up.write(head);
      up.pipe(socket); socket.pipe(up);
    });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
}

function stop() {
  for (const r of clients) r.end();
  clients.clear();
  if (server) { server.close(); server.closeAllConnections?.(); server = null; }
}

function info(port) {
  return { ok: true, urls: ['127.0.0.1', ...lanIps()].map((ip) => `http://${ip}:${port}/saida`) };
}

// Liga (ou reinicia) o servidor. Retorna { ok, urls } ou { ok:false, error }.
function start(port, source) {
  const u = parseSource(source);
  if (!u) {
    stop();
    return Promise.resolve({ ok: false, error: 'Cole o link da transmissão do Holyrics (ex.: http://192.168.1.200:80/view/widescreen).' });
  }
  if (server && cur.port === port && cur.source === source) return Promise.resolve(info(port));
  stop();
  target = u; cur = { port, source };
  return new Promise((resolve) => {
    const s = http.createServer(handle);
    s.on('upgrade', upgrade);
    s.on('error', (e) => { server = null; resolve({ ok: false, error: e.code === 'EADDRINUSE' ? `A porta ${port} já está em uso.` : e.message }); });
    s.listen(port, '0.0.0.0', () => { server = s; resolve(info(port)); });
  });
}

module.exports = { start, stop, applyFx, resetFx };
