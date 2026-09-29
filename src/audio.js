// Sound effects, all synthesised with the Web Audio API (no audio files).

let ctx = null;
let master = null;
let enabled = true;
let noise = null;

export function setSoundEnabled(on) {
  enabled = !!on;
  if (master) master.gain.value = enabled ? 0.9 : 0;
}

/** Browsers only allow sound after a tap/click; call this from any input. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.9 : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      master.connect(comp);
      comp.connect(ctx.destination);
      const len = ctx.sampleRate;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

for (const t of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
  window.addEventListener(t, unlockAudio, { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().catch(() => {});
});

const ok = () => ctx && enabled && ctx.state === 'running';

function tone(f, dur, { type = 'sine', vol = 0.2, delay = 0, f2 = null, attack = 0.005 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hiss(dur, { vol = 0.2, freq = 2000, freq2 = null, q = 1, delay = 0, type = 'bandpass' } = {}) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freq2) f.frequency.exponentialRampToValueAtTime(freq2, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

const SFX = {
  click() {
    tone(900, 0.06, { type: 'triangle', vol: 0.12 });
  },
  card() {
    hiss(0.09, { vol: 0.35, freq: 3200, q: 0.8 });
    tone(220, 0.05, { type: 'sine', vol: 0.08 });
  },
  deal(i = 0) {
    hiss(0.05, { vol: 0.18, freq: 2600 + (i % 5) * 200, q: 1 });
  },
  clean() {
    hiss(0.35, { vol: 0.22, freq: 800, freq2: 4000, q: 0.7 });
  },
  thulla() {
    tone(90, 0.5, { type: 'sine', vol: 0.55, f2: 40 });
    tone(180, 0.25, { type: 'square', vol: 0.08, f2: 60 });
    hiss(0.5, { vol: 0.35, freq: 400, freq2: 90, q: 0.8, type: 'lowpass' });
    [0, 3, 7].forEach((s, i) => tone(330 * 2 ** (s / 12), 0.25, { type: 'sawtooth', vol: 0.05, delay: 0.05 + i * 0.03 }));
  },
  pickup() {
    hiss(0.5, { vol: 0.25, freq: 3000, freq2: 500, q: 0.6 });
    tone(300, 0.35, { type: 'triangle', vol: 0.1, f2: 150 });
  },
  safe() {
    [0, 4, 7, 12, 16].forEach((s, i) => tone(523 * 2 ** (s / 12), 0.35, { type: 'triangle', vol: 0.12, delay: i * 0.07 }));
  },
  win() {
    [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone(523 * 2 ** (s / 12), 0.3, { type: 'square', vol: 0.06, delay: i * 0.09 }));
    [0, 4, 7].forEach((s) => tone(262 * 2 ** (s / 12), 1.2, { type: 'triangle', vol: 0.08, delay: 0.72 }));
  },
  lose() {
    [0, -1, -2, -3].forEach((s, i) => tone(392 * 2 ** (s / 12), i === 3 ? 0.9 : 0.32, { type: 'sawtooth', vol: 0.07, delay: i * 0.33 }));
  },
  coins() {
    for (let i = 0; i < 7; i++) tone(1800 + Math.random() * 1400, 0.12, { type: 'sine', vol: 0.06, delay: i * 0.05 });
  },
  turn() {
    tone(660, 0.12, { type: 'sine', vol: 0.12 });
    tone(990, 0.2, { type: 'sine', vol: 0.1, delay: 0.1 });
  },
  tick() {
    tone(1200, 0.04, { type: 'square', vol: 0.05 });
  },
  pop() {
    tone(600, 0.1, { type: 'sine', vol: 0.15, f2: 1200 });
  },
  deny() {
    tone(200, 0.15, { type: 'square', vol: 0.06 });
  },
};

export function sfx(name, arg) {
  if (!ok() || !SFX[name]) return;
  try {
    SFX[name](arg);
  } catch {
    /* ignore */
  }
}

export function buzz(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch {
    /* ignore */
  }
}
