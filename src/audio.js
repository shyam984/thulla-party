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

// ------------------------------------------------------------------ music
// A looping, upbeat groove made from oscillators (no audio files).
// Chords: Am - F - C - G, one bar each, 108 bpm.

let musicWanted = false;
let musicOn = true;
let musicGain = null;
let musicTimer = null;
let nextT = 0;
let step = 0;

const BPM = 108;
const STEP = 60 / BPM / 4;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const CHORDS = [
  { root: 45, notes: [57, 60, 64, 67] }, // Am7
  { root: 41, notes: [53, 57, 60, 64] }, // Fmaj7
  { root: 48, notes: [55, 60, 64, 67] }, // C
  { root: 43, notes: [55, 59, 62, 67] }, // G
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 1, 3, 2];
const MELODY = [
  [72, 76, 79, 76, 74, 72, 71, 72],
  [69, 72, 76, 72, 74, 72, 69, 67],
  [72, 76, 79, 84, 79, 76, 74, 76],
  [74, 71, 67, 71, 74, 79, 78, 74],
];

function mtone(f, t, dur, { type = 'sine', vol = 0.1, f2 = null } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(musicGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function mhat(t, vol) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(f);
  f.connect(g);
  g.connect(musicGain);
  s.start(t, Math.random() * 0.5);
  s.stop(t + 0.08);
}

function scheduleStep(i, t) {
  const bar = Math.floor(i / 16) % 4;
  const k = i % 16;
  const ch = CHORDS[bar];
  if (k % 4 === 0) mtone(120, t, 0.18, { type: 'sine', vol: 0.32, f2: 45 });
  if (k % 2 === 0 || k % 4 === 3) mhat(t, k % 4 === 2 ? 0.05 : 0.025);
  if (k === 4 || k === 12) mhat(t, 0.07);
  if (k === 0 || k === 6 || k === 8 || k === 14) mtone(midi(ch.root), t, STEP * 3, { type: 'triangle', vol: 0.2 });
  mtone(midi(ch.notes[ARP[k]] + 12), t, STEP * 1.6, { type: 'square', vol: 0.028 });
  if (k % 2 === 0) mtone(midi(MELODY[bar][k / 2]), t, STEP * 1.9, { type: 'triangle', vol: i >= 64 ? 0.075 : 0.05 });
  if (k === 0) ch.notes.slice(0, 3).forEach((n) => mtone(midi(n), t, STEP * 15, { type: 'sine', vol: 0.03 }));
}

function musicTick() {
  if (!ctx || !musicGain) return;
  if (ctx.state !== 'running') {
    nextT = 0;
    return;
  }
  if (!nextT || nextT < ctx.currentTime) nextT = ctx.currentTime + 0.05;
  while (nextT < ctx.currentTime + 0.3) {
    try {
      scheduleStep(step, nextT);
    } catch {
      /* ignore */
    }
    step = (step + 1) % 128;
    nextT += STEP;
  }
}

function applyMusic() {
  const play = musicWanted && musicOn;
  if (play) {
    unlockAudio();
    if (ctx && !musicGain) {
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.55;
      musicGain.connect(master);
    }
    if (!musicTimer) musicTimer = setInterval(musicTick, 100);
  } else if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
    nextT = 0;
  }
}

export function setMusicEnabled(on) {
  musicOn = !!on;
  applyMusic();
}

/** Start or stop the background music (the game table calls this). */
export function playMusic(on) {
  musicWanted = !!on;
  if (on) step = 0;
  applyMusic();
}

/** Lower the music briefly for big moments. */
export function duckMusic(sec = 2.5) {
  if (!ctx || !musicGain) return;
  const t = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.setValueAtTime(musicGain.gain.value, t);
  musicGain.gain.linearRampToValueAtTime(0.15, t + 0.1);
  musicGain.gain.linearRampToValueAtTime(0.55, t + sec);
}
