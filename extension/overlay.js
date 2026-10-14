// Injetado SOMENTE na aba autorizada (ou incluído no visualizador de PDF).
// Desenha o laser e o "fade" (tela escurecida com um círculo de destaque) e simula PgUp/PgDn.
(() => {
  if (window.__pslLoaded) return;
  window.__pslLoaded = true;

  const COLORS = { green: '#22ff55', red: '#ff2a2a', blue: '#2a8bff' };
  const IS_VIEWER = location.protocol === 'chrome-extension:';
  const st = {
    laser: { on: false, color: 'red' },
    fade: { on: false, radius: 0.15, dim: 0.75 },
    blackout: { on: false },
    x: 0.5,
    y: 0.5,
  };
  let host = null, fadeEl = null, dotEl = null, blackEl = null, raf = 0;

  function build() {
    host = document.createElement('div');
    host.style.cssText =
      'all:initial;position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;';
    const root = host.attachShadow({ mode: 'closed' });
    fadeEl = document.createElement('div');
    fadeEl.style.cssText = 'position:absolute;inset:0;display:none;';
    dotEl = document.createElement('div');
    dotEl.style.cssText =
      'position:absolute;left:0;top:0;width:20px;height:20px;border-radius:50%;display:none;border:2px solid rgba(255,255,255,.9);will-change:transform;';
    blackEl = document.createElement('div');
    blackEl.style.cssText = 'position:absolute;inset:0;background:#000;display:none;';
    root.append(fadeEl, dotEl, blackEl);
  }

  // Em tela cheia só o elemento em fullscreen é visível: leva o overlay junto.
  function place() {
    if (!host) return;
    const parent = document.fullscreenElement || document.documentElement;
    if (host.parentNode !== parent) parent.appendChild(host);
  }

  function render() {
    raf = 0;
    const active = st.laser.on || st.fade.on || st.blackout.on;
    if (!active) {
      if (host && host.parentNode) host.remove();
      return;
    }
    if (!host) build();
    place();
    const w = window.innerWidth, h = window.innerHeight;
    const px = st.x * w, py = st.y * h;
    if (st.fade.on) {
      const r = st.fade.radius * Math.min(w, h);
      const f = Math.max(8, r * 0.12);
      fadeEl.style.display = 'block';
      fadeEl.style.background = `radial-gradient(circle at ${px}px ${py}px, rgba(0,0,0,0) ${r}px, rgba(0,0,0,${st.fade.dim}) ${r + f}px)`;
    } else fadeEl.style.display = 'none';
    if (st.laser.on) {
      const c = COLORS[st.laser.color] || COLORS.red;
      dotEl.style.display = 'block';
      dotEl.style.background = c;
      dotEl.style.boxShadow = `0 0 10px 4px ${c}`;
      dotEl.style.transform = `translate(${px - 10}px,${py - 10}px)`;
    } else dotEl.style.display = 'none';
    blackEl.style.display = st.blackout.on ? 'block' : 'none';
  }
  const schedule = () => raf || (raf = requestAnimationFrame(render));

  function sendKey(k) {
    const key = k === 'next' ? 'PageDown' : 'PageUp';
    const kc = k === 'next' ? 34 : 33;
    const init = { key, code: key, keyCode: kc, which: kc, bubbles: true, cancelable: true, composed: true, view: window };
    // Campo de texto/botão focado engole a tecla: manda para o corpo da página nesse caso.
    let target = document.activeElement;
    if (!target || target === document.documentElement || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) || target.isContentEditable) {
      target = document.body || document.documentElement;
    }
    const notPrevented = target.dispatchEvent(new KeyboardEvent('keydown', init));
    target.dispatchEvent(new KeyboardEvent('keyup', init));
    // Eventos sintéticos não rolam a página sozinhos: se ninguém tratou a tecla, rola como o PgUp/PgDn faria.
    if (notPrevented && !IS_VIEWER) {
      const dy = window.innerHeight * 0.9 * (k === 'next' ? 1 : -1);
      window.scrollBy({ top: dy, behavior: 'smooth' });
    }
  }

  function hide() {
    st.laser.on = false;
    st.fade.on = false;
    st.blackout.on = false;
    render();
  }

  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (!m || !m.psl) return;
    switch (m.t) {
      case 'state':
        if (m.laser) Object.assign(st.laser, m.laser);
        if (m.fade) Object.assign(st.fade, m.fade);
        if (m.blackout) Object.assign(st.blackout, m.blackout);
        if (typeof m.x === 'number') { st.x = m.x; st.y = m.y; }
        schedule();
        break;
      case 'pos':
        st.x = Math.min(1, Math.max(0, m.x));
        st.y = Math.min(1, Math.max(0, m.y));
        schedule();
        break;
      case 'key':
        sendKey(m.k);
        break;
      case 'hide':
        hide();
        break;
      case 'ping':
        reply({ ok: true });
        break;
    }
  });

  document.addEventListener('fullscreenchange', schedule);
  window.addEventListener('resize', schedule);
})();
