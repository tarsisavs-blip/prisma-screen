const $ = (id) => document.getElementById(id);
const hhmmss = (t) => new Date(t).toLocaleTimeString('pt-BR');

function add(cls, text) {
  const d = document.createElement('div');
  d.className = 'e ' + cls;
  d.textContent = text;
  $('log').appendChild(d);
  $('log').scrollTop = $('log').scrollHeight;
}

const win = (w) => `hwnd=${w.hwnd} pid=${w.pid} proc=${w.proc} classe=${w.cls} ${w.visible ? 'visível' : 'oculta'} título="${w.title}"`;

function fillTargets(list) {
  const cur = $('target').value;
  $('target').innerHTML = '<option value="0">Automático</option>';
  (list || []).forEach((w) => {
    const o = document.createElement('option');
    o.value = w.hwnd;
    o.textContent = `${w.proc} · ${w.cls} · "${w.title || '(sem título)'}"${w.visible ? '' : ' (oculta)'}`;
    $('target').appendChild(o);
  });
  if ([...$('target').options].some((o) => o.value === cur)) $('target').value = cur;
}

dbg.onLog((e) => {
  const head = `[${hhmmss(e.t)}] `;
  if (e.kind === 'list') {
    add('m', head + `Janelas encontradas (${(e.windows || []).length}):\n` + (e.windows || []).map(win).join('\n'));
    fillTargets(e.windows);
  } else if (e.kind === 'press') {
    const lines = [head + `${e.key} (vk=0x${e.vk.toString(16)}) → ${e.ok ? 'ENVIADO' : 'FALHOU'}${e.error ? ': ' + e.error : ''}`];
    if (e.target) lines.push('alvo: ' + win(e.target));
    if (e.mode) lines.push('modo: ' + e.mode + ' · scancode=' + e.scan);
    (e.sent || []).forEach((s) => lines.push('  ' + s));
    if (e.fgBefore !== undefined) lines.push(`primeiro plano antes: "${e.fgBefore}" · depois: "${e.fgAfter}"`);
    if (!e.target && e.windows) lines.push('janelas vistas: ' + (e.windows.length ? e.windows.map(win).join(' | ') : 'nenhuma'));
    add(e.ok ? 'ok' : 'bad', lines.join('\n'));
  } else if (e.kind === 'api') {
    const lines = [head + `API ${e.action} → ${e.ok ? 'OK' : 'FALHOU'}${e.error ? ': ' + e.error : ''}`];
    if (e.url) lines.push(`requisição: ${e.method} ${e.url}\ncorpo: ${e.body}\ncabeçalho: Content-Type: application/json`);
    if (e.status !== undefined) lines.push(`resposta: HTTP ${e.status} em ${e.ms} ms\n${e.response || '(vazia)'}`);
    add(e.ok ? 'ok' : 'bad', lines.join('\n'));
  } else if (e.kind === 'stderr') add('bad', head + 'PowerShell: ' + e.text);
});

const send = (key) => dbg.send(key, $('mode').value, $('target').value);
$('bDown').onclick = () => send('PageDown');
$('bUp').onclick = () => send('PageUp');
$('bApiN').onclick = () => dbg.api('ActionNext');
$('bApiP').onclick = () => dbg.api('ActionPrevious');
$('bList').onclick = () => dbg.list();
$('bClear').onclick = () => ($('log').innerHTML = '');
dbg.list();
