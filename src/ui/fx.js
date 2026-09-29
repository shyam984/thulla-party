// Particle effects (confetti, sparks, coin showers) on one full-screen canvas.

const COLORS = ['#ff2e93', '#ffd23f', '#3ee6ff', '#7c4dff', '#35f59a', '#ff7a1a', '#ffffff'];

let canvas;
let ctx;
let parts = [];
let running = false;
let dpr = 1;
export const motion = { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };

const MAX_PARTS = 420; // keeps weaker phones smooth when effects overlap
let coinImg = null;

/** One pre-drawn coin, reused for every coin particle. */
function coinSprite() {
  if (coinImg) return coinImg;
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(17, 17, 2, 24, 24, 24);
  grad.addColorStop(0, '#fff6c2');
  grad.addColorStop(0.5, '#ffcc2e');
  grad.addColorStop(1, '#e08a00');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(24, 24, 22, 0, 7);
  g.fill();
  g.strokeStyle = 'rgba(160,80,0,.6)';
  g.lineWidth = 3;
  g.stroke();
  coinImg = c;
  return c;
}

function add(p) {
  if (parts.length >= MAX_PARTS) parts.shift();
  parts.push(p);
}

export function initFx(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  const size = () => {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
  };
  size();
  window.addEventListener('resize', size);
}

function loop() {
  if (!parts.length) {
    running = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  running = true;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const now = performance.now();
  parts = parts.filter((p) => now - p.t0 < p.life);
  for (const p of parts) {
    const k = (now - p.t0) / p.life;
    p.vy += p.g;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1 - k) * 2.2);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    if (p.kind === 'confetti') {
      ctx.fillStyle = p.color;
      ctx.scale(1, Math.abs(Math.sin(p.rot * 2)) + 0.2);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    } else if (p.kind === 'coin') {
      ctx.scale(Math.abs(Math.cos(p.rot)) + 0.15, 1);
      ctx.drawImage(coinSprite(), -p.size, -p.size, p.size * 2, p.size * 2);
    } else {
      // Sparks: a soft halo plus a bright core (cheaper than shadowBlur).
      const r = p.size * (1 - k * 0.7);
      ctx.fillStyle = p.color;
      ctx.globalAlpha *= 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2.2, 0, 7);
      ctx.fill();
      ctx.globalAlpha /= 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }
  requestAnimationFrame(loop);
}

function kick() {
  if (!running) requestAnimationFrame(loop);
}

export function confetti(x, y, count = 80, spread = 1) {
  if (!ctx) return;
  const n = motion.reduced ? Math.round(count / 4) : count;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread;
    const v = 6 + Math.random() * 9;
    add({
      kind: 'confetti', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.28, drag: 0.985,
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, size: 7 + Math.random() * 7,
      color: COLORS[(Math.random() * COLORS.length) | 0], t0: performance.now(), life: 1800 + Math.random() * 1200,
    });
  }
  kick();
}

export function sparks(x, y, color = '#ffd23f', count = 26) {
  if (!ctx) return;
  const n = motion.reduced ? Math.round(count / 4) : count;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 2 + Math.random() * 7;
    add({
      kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.05, drag: 0.93,
      rot: 0, vr: 0, size: 2 + Math.random() * 3.5, color, t0: performance.now(), life: 500 + Math.random() * 500,
    });
  }
  kick();
}

export function coinShower(x, y, count = 30) {
  if (!ctx) return;
  const n = motion.reduced ? 8 : count;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;
    const v = 7 + Math.random() * 8;
    add({
      kind: 'coin', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.4, drag: 0.99,
      rot: Math.random() * 6, vr: 0.2 + Math.random() * 0.2, size: 7 + Math.random() * 5, t0: performance.now(), life: 1600 + Math.random() * 600,
    });
  }
  kick();
}

export function rectCenter(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
