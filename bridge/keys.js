// Envia teclas ao Holyrics sem API, como o AutoHotkey faz (ControlSend).
// Modo "direct": PostMessage direto na janela, sem ativá-la (não mexe nos outros programas).
// Modo "focus": traz o Holyrics à frente por um instante, aperta a tecla e devolve o foco à janela anterior.
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const VK = {
  PageDown: 0x22, PageUp: 0x21, Right: 0x27, Left: 0x25, Down: 0x28, Up: 0x26,
  Space: 0x20, Enter: 0x0d, Home: 0x24, End: 0x23,
};
const EXTENDED = new Set([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28]);
const KEY_NAMES = Object.keys(VK);
const events = new EventEmitter();

const PS = `
Add-Type -TypeDefinition @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class W {
  public delegate bool EP(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EP cb, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, uint fl, UIntPtr ex);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint c, uint t);
  [DllImport("kernel32.dll")] public static extern uint GetLastError();
  public static List<string[]> All() {
    var r = new List<string[]>();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      var t = new StringBuilder(256); GetWindowText(h, t, 256);
      var c = new StringBuilder(256); GetClassName(h, c, 256);
      r.Add(new string[] { h.ToInt64().ToString(), pid.ToString(), IsWindowVisible(h) ? "1" : "0", c.ToString(), t.ToString() });
      return true;
    }, IntPtr.Zero);
    return r;
  }
  public static string Title(IntPtr h) { var t = new StringBuilder(256); GetWindowText(h, t, 256); return t.ToString(); }
}
'@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
function Candidates {
  $procs = @{}
  Get-Process | ForEach-Object { $procs[[string]$_.Id] = $_.ProcessName }
  $out = @()
  foreach ($w in [W]::All()) {
    $pn = $procs[$w[1]]
    if (-not $pn) { continue }
    if ($pn -like 'holyrics*' -or $pn -like 'java*' -or $w[4] -like '*Holyrics*') {
      if ($w[4] -eq '' -and $w[2] -eq '0') { continue }
      $out += [pscustomobject]@{ hwnd = $w[0]; pid = $w[1]; proc = $pn; visible = ($w[2] -eq '1'); cls = $w[3]; title = $w[4]; likely = ($pn -like 'holyrics*' -or $w[4] -like '*Holyrics*') }
    }
  }
  return $out
}
function Out-Json($o) { [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 5)) }
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $a = $line.Split(' ')
  if ($a[0] -eq 'list') { Out-Json @{ cmd = 'list'; ok = $true; windows = @(Candidates) }; continue }
  $mode = $a[0]; $vk = [int]$a[1]; $ext = [int]$a[2]; $want = $a[3]
  $c = @(Candidates)
  if ($want -and $want -ne '0') { $t = $c | Where-Object { $_.hwnd -eq $want } | Select-Object -First 1 }
  else { $t = $c | Where-Object { $_.likely -and $_.visible } | Sort-Object @{Expression={ if ($_.title -like '*Holyrics*') { 0 } elseif ($_.title -ne '') { 1 } else { 2 } }} | Select-Object -First 1 }
  if (-not $t) { Out-Json @{ cmd = 'press'; ok = $false; error = 'Janela do Holyrics não encontrada (ele está aberto?)'; windows = $c }; continue }
  $h = [IntPtr][int64]$t.hwnd
  $sc = [W]::MapVirtualKey($vk, 0)
  $fgBefore = [W]::GetForegroundWindow()
  $info = @{ cmd = 'press'; ok = $true; mode = $mode; vk = $vk; scan = $sc; target = $t; fgBefore = [W]::Title($fgBefore); sent = @() }
  if ($mode -eq 'direct') {
    $lp = 1 -bor ($sc -shl 16) -bor ($ext -shl 24)
    $lu = $lp -bor (1 -shl 30) -bor ([int64]1 -shl 31)
    $r1 = [W]::PostMessage($h, 0x100, [IntPtr]$vk, [IntPtr][int64]$lp); $e1 = [W]::GetLastError()
    Start-Sleep -Milliseconds 30
    $r2 = [W]::PostMessage($h, 0x101, [IntPtr]$vk, [IntPtr][int64]$lu); $e2 = [W]::GetLastError()
    $info.sent = @("WM_KEYDOWN retorno=$r1 erro=$e1", "WM_KEYUP retorno=$r2 erro=$e2")
    if (-not ($r1 -and $r2)) { $info.ok = $false; $info.error = 'PostMessage falhou (o Windows recusou a mensagem).' }
  } else {
    if ([W]::IsIconic($h)) { [void][W]::ShowWindow($h, 9) }
    [W]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [W]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    $ok = [W]::SetForegroundWindow($h)
    Start-Sleep -Milliseconds 70
    $info.sent += "SetForegroundWindow retorno=$ok; em primeiro plano agora: '" + [W]::Title([W]::GetForegroundWindow()) + "'"
    $fl = if ($ext) { 1 } else { 0 }
    [W]::keybd_event([byte]$vk, [byte]$sc, $fl, [UIntPtr]::Zero)
    [W]::keybd_event([byte]$vk, [byte]$sc, ($fl -bor 2), [UIntPtr]::Zero)
    $info.sent += 'keybd_event keydown+keyup enviados'
    Start-Sleep -Milliseconds 50
    if ($fgBefore -ne [IntPtr]::Zero -and $fgBefore -ne $h) { [void][W]::SetForegroundWindow($fgBefore) }
    if (-not $ok) { $info.ok = $false; $info.error = 'O Windows não deixou ativar o Holyrics (SetForegroundWindow falhou).' }
  }
  $info.fgAfter = [W]::Title([W]::GetForegroundWindow())
  Out-Json $info
}`;

let proc = null, waiters = [];

function shell() {
  if (proc && !proc.killed) return proc;
  proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS], { windowsHide: true });
  let buf = '', err = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!l) continue;
      const w = waiters.shift();
      let j;
      try { j = JSON.parse(l); } catch { j = { ok: false, error: 'Resposta inesperada: ' + l.slice(0, 200) }; }
      if (w) w(j);
    }
  });
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (d) => { err += d; events.emit('log', { t: Date.now(), kind: 'stderr', text: d.trim() }); });
  proc.on('exit', () => { proc = null; waiters.splice(0).forEach((w) => w({ ok: false, error: 'PowerShell encerrou. ' + err.slice(0, 300) })); });
  proc.on('error', () => { proc = null; });
  return proc;
}

function ask(cmd, timeout = 6000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: 'Tempo esgotado esperando o PowerShell' }), timeout);
    waiters.push((j) => { clearTimeout(t); resolve(j); });
    try { shell().stdin.write(cmd + '\n'); } catch (e) { clearTimeout(t); waiters.pop(); resolve({ ok: false, error: e.message }); }
  });
}

// Retorna { ok } ou { ok:false, error }. hwnd (opcional) força a janela alvo.
async function press(keyName, mode, hwnd) {
  // Tecla capturada: "vk:<código>:<extendida 0/1>:<nome>". Senão, um nome da lista.
  const cap = /^vk:(\d+):([01]):/.exec(keyName || '');
  const vk = cap ? Number(cap[1]) : VK[keyName];
  const ext = cap ? Number(cap[2]) : EXTENDED.has(vk) ? 1 : 0;
  if (!vk) return { ok: false, error: 'Tecla desconhecida: ' + keyName };
  const m = mode === 'focus' ? 'focus' : 'direct';
  const j = await ask(`${m} ${vk} ${ext} ${hwnd || 0}`);
  events.emit('log', { t: Date.now(), kind: 'press', key: cap ? keyName.split(':').slice(3).join(':') : keyName, vk, ...j });
  return j;
}

async function listWindows() {
  const j = await ask('list', 10000);
  events.emit('log', { t: Date.now(), kind: 'list', ...j });
  return j;
}

function stop() { if (proc) proc.kill(); }

module.exports = { press, listWindows, stop, events, KEY_NAMES };
