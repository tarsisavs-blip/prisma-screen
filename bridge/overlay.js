// Desenha o laser e o fade sobre o monitor escolhido (mesma lógica da extensão).
const COLORS = { green: '#22ff55', red: '#ff2a2a', blue: '#2a8bff' };
const st = { laser: { on: false, color: 'red' }, fade: { on: false, radius: 0.15, dim: 0.75 }, blackout: { on: false }, x: 0.5, y: 0.5 };
const fadeEl = document.getElementById('fade');
const blackEl = document.getElementById('black');
const dotEl = document.getElementById('dot');
let raf = 0;

function render() {
  raf = 0;
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

window.api.onOverlay((m) => {
  if (m.t === 'state') {
    if (m.laser) Object.assign(st.laser, m.laser);
    if (m.fade) Object.assign(st.fade, m.fade);
    if (m.blackout) Object.assign(st.blackout, m.blackout);
    if (typeof m.x === 'number') { st.x = m.x; st.y = m.y; }
  } else if (m.t === 'pos') {
    st.x = Math.min(1, Math.max(0, m.x));
    st.y = Math.min(1, Math.max(0, m.y));
  }
  schedule();
});
window.addEventListener('resize', schedule);
