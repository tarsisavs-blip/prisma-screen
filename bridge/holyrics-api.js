// Chamada à API do Holyrics (POST /api/<Ação>?token=...). Registra a requisição para a janela de debug.
const { events } = require('./keys');

const mask = (t) => (t.length <= 4 ? '••••' : t.slice(0, 3) + '•'.repeat(Math.min(t.length - 3, 8)));

async function call(h, action) {
  const t0 = Date.now();
  const log = { t: t0, kind: 'api', action, method: 'POST', body: '{}' };
  if (!h.token) {
    events.emit('log', { ...log, ok: false, error: 'Token da API não configurado.' });
    return { ok: false, error: 'Token da API não configurado.' };
  }
  const base = `http://${h.host}:${h.port}/api/${action}`;
  log.url = `${base}?token=${mask(h.token)}`;
  try {
    const r = await fetch(`${base}?token=${encodeURIComponent(h.token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(3000),
    });
    const text = await r.text();
    let j = {};
    try { j = JSON.parse(text); } catch {}
    const ok = r.ok && j.status !== 'error';
    const error = ok ? undefined : `Holyrics respondeu ${r.status}${j.error ? ': ' + j.error : ''}`;
    events.emit('log', { ...log, ok, error, status: r.status, response: text.slice(0, 400), ms: Date.now() - t0 });
    return { ok, error };
  } catch (e) {
    const error = 'Não alcançou o Holyrics (' + (e.name === 'TimeoutError' ? 'tempo esgotado' : e.message) + ').';
    events.emit('log', { ...log, ok: false, error, ms: Date.now() - t0 });
    return { ok: false, error };
  }
}

module.exports = { call };
