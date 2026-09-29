// Sound effects and background music, all synthesised with the Web Audio API
// (no audio files to download).
//
// Signal chain:  sfx voices ─► sfxBus ─┐
//                music voices ─► lowpass ─► musicBus ─┴─► compressor ─► speakers
//
// Browsers only allow audio after the player taps or presses a key, so the
// AudioContext is created inside the first input event and never before.

let ctx = null;
let sfxBus = null;
let musicBus = null;
let musicFilter = null;
let noise = null;

const vol = { sfxOn: true, musicOn: true, sfx: 0.8, music: 0.5, externalMute: false };

const sfxLevel = () => (vol.sfxOn && !vol.externalMute ? vol.sfx : 0);
const musicLevel = () => (vol.musicOn && !vol.externalMute ? vol.music * 0.7 : 0);

function applyLevels() {
  if (!ctx) return;
  const t = ctx.currentTime;
  sfxBus.gain.setTargetAtTime(sfxLevel(), t, 0.03);
  musicBus.gain.setTargetAtTime(musicLevel(), t, 0.08);
}

export function setSoundEnabled(on) {
  vol.sfxOn = !!on;
  applyLevels();
}

export function setMusicEnabled(on) {
  vol.musicOn = !!on;
  applyLevels();
  applyMusic();
}

/** Volumes from 0 to 1. */
export function setVolumes({ sfx, music }) {
  if (Number.isFinite(sfx)) vol.sfx = Math.max(0, Math.min(1, sfx));
  if (Number.isFinite(music)) vol.music = Math.max(0, Math.min(1, music));
  applyLevels();
  applyMusic();
}

/** Muting requested by the hosting site (e.g. CrazyGames' mute setting). */
export function setExternalMute(m) {
  vol.externalMute = !!m;
  applyLevels();
  applyMusic();
}

/** Browsers only allow sound after a tap/click; this runs on any input. */
export function unlockAudio() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = sfxLevel();
      sfxBus.connect(comp);
      musicBus = ctx.createGain();
      musicBus.gain.value = musicLevel();
      musicBus.connect(comp);
      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = 4200;
      musicFilter.Q.value = 0.5;
      musicFilter.connect(musicBus);
      const len = ctx.sampleRate;
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state !== 'running' && !document.hidden) ctx.resume().then(applyMusic, () => {});
    applyMusic();
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

const ok = () => ctx && sfxLevel() > 0 && ctx.state === 'running';

function tone(f, dur, { type = 'sine', vol: v = 0.2, delay = 0, f2 = null, attack = 0.005 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function hiss(dur, { vol: v = 0.2, freq = 2000, freq2 = null, q = 1, delay = 0, type = 'bandpass' } = {}) {
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
  g.gain.exponentialRampToValueAtTime(v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(sfxBus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

const semi = (base, s) => base * 2 ** (s / 12);

const SFX = {
  click() {
    tone(1100, 0.045, { type: 'triangle', vol: 0.08 });
    tone(700, 0.05, { type: 'sine', vol: 0.05, delay: 0.01 });
  },
  select() {
    hiss(0.05, { vol: 0.12, freq: 4200, q: 1.2 });
    tone(880, 0.07, { type: 'sine', vol: 0.06, f2: 1180 });
  },
  card() {
    // A soft slap: short filtered noise plus a low thump.
    hiss(0.08, { vol: 0.26, freq: 2600, freq2: 1400, q: 0.9 });
    tone(170, 0.06, { type: 'sine', vol: 0.09, f2: 90 });
  },
  deal(i = 0) {
    hiss(0.04, { vol: 0.12, freq: 2800 + (i % 5) * 180, q: 1.1 });
  },
  shuffle() {
    for (let i = 0; i < 9; i++) hiss(0.05, { vol: 0.1, freq: 2400 + (i % 3) * 400, q: 1, delay: i * 0.045 });
  },
  start() {
    [0, 4, 7, 12].forEach((s, i) => tone(semi(392, s), 0.22, { type: 'triangle', vol: 0.09, delay: 0.05 + i * 0.07 }));
    tone(semi(392, 16), 0.5, { type: 'sine', vol: 0.07, delay: 0.33 });
  },
  bet() {
    for (let i = 0; i < 4; i++) tone(2200 + i * 260, 0.08, { type: 'sine', vol: 0.05, delay: i * 0.045 });
    hiss(0.06, { vol: 0.08, freq: 5000, q: 2, delay: 0.02 });
  },
  clean() {
    hiss(0.3, { vol: 0.14, freq: 900, freq2: 3600, q: 0.7 });
  },
  thulla() {
    tone(90, 0.45, { type: 'sine', vol: 0.45, f2: 42 });
    hiss(0.4, { vol: 0.24, freq: 420, freq2: 100, q: 0.8, type: 'lowpass' });
    [0, 3, 7].forEach((s, i) => tone(semi(330, s), 0.22, { type: 'sawtooth', vol: 0.035, delay: 0.05 + i * 0.03 }));
  },
  pickup() {
    hiss(0.42, { vol: 0.18, freq: 3000, freq2: 600, q: 0.6 });
    tone(300, 0.3, { type: 'triangle', vol: 0.07, f2: 150 });
  },
  safe() {
    [0, 4, 7, 12, 16].forEach((s, i) => tone(semi(523, s), 0.3, { type: 'triangle', vol: 0.09, delay: i * 0.06 }));
    tone(semi(523, 19), 0.6, { type: 'sine', vol: 0.06, delay: 0.32 });
  },
  win() {
    [0, 4, 7, 12, 7, 12, 16, 19].forEach((s, i) => tone(semi(523, s), 0.26, { type: 'triangle', vol: 0.08, delay: i * 0.08 }));
    [0, 4, 7].forEach((s) => tone(semi(262, s), 1.1, { type: 'sine', vol: 0.07, delay: 0.64 }));
  },
  lose() {
    [0, -1, -2, -3].forEach((s, i) => tone(semi(392, s), i === 3 ? 0.8 : 0.28, { type: 'triangle', vol: 0.09, delay: i * 0.3 }));
    tone(98, 0.9, { type: 'sine', vol: 0.08, delay: 0.9 });
  },
  coins() {
    for (let i = 0; i < 6; i++) tone(1800 + Math.random() * 1200, 0.1, { type: 'sine', vol: 0.045, delay: i * 0.05 });
  },
  turn() {
    tone(660, 0.1, { type: 'sine', vol: 0.09 });
    tone(990, 0.18, { type: 'sine', vol: 0.08, delay: 0.09 });
  },
  tick() {
    tone(1250, 0.035, { type: 'triangle', vol: 0.05 });
  },
  pop() {
    tone(600, 0.09, { type: 'sine', vol: 0.1, f2: 1150 });
  },
  deny() {
    tone(210, 0.12, { type: 'triangle', vol: 0.09 });
    tone(160, 0.14, { type: 'triangle', vol: 0.07, delay: 0.07 });
  },
  leave() {
    [7, 4, 0].forEach((s, i) => tone(semi(440, s), 0.16, { type: 'triangle', vol: 0.07, delay: i * 0.07 }));
  },
  join() {
    [0, 7].forEach((s, i) => tone(semi(587, s), 0.16, { type: 'triangle', vol: 0.08, delay: i * 0.08 }));
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
// A relaxed, upbeat loop built from oscillators. Two 4-bar sections
// (Am–F–C–G, then F–G–Em–Am) at 104 bpm, scheduled a little ahead of time.

let musicWanted = false;
let musicTimer = null;
let nextT = 0;
let step = 0;

const BPM = 104;
const STEP = 60 / BPM / 4;
const LOOP = 16 * 8;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);
const CHORDS = [
  { root: 45, notes: [57, 60, 64, 67] }, // Am7
  { root: 41, notes: [53, 57, 60, 64] }, // Fmaj7
  { root: 48, notes: [55, 60, 64, 67] }, // C
  { root: 43, notes: [55, 59, 62, 67] }, // G
  { root: 41, notes: [53, 57, 60, 65] }, // F
  { root: 43, notes: [55, 59, 62, 67] }, // G
  { root: 40, notes: [55, 59, 64, 67] }, // Em
  { root: 45, notes: [57, 60, 64, 69] }, // Am
];
const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 1, 3, 2];
const MELODY = [
  [72, 76, 79, 76, 74, 72, 71, 72],
  [69, 72, 76, 72, 74, 72, 69, 67],
  [72, 76, 79, 84, 79, 76, 74, 76],
  [74, 71, 67, 71, 74, 79, 78, 74],
  [77, 0, 76, 74, 72, 0, 74, 76],
  [79, 0, 78, 76, 74, 0, 71, 74],
  [76, 79, 83, 79, 76, 74, 71, 67],
  [69, 0, 72, 76, 81, 79, 76, 72],
];

function mtone(f, t, dur, { type = 'sine', v = 0.1, f2 = null } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(musicFilter);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function mhat(t, v) {
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  s.connect(f);
  f.connect(g);
  g.connect(musicBus); // hats skip the lowpass so they stay crisp
  s.start(t, Math.random() * 0.5);
  s.stop(t + 0.08);
}

function scheduleStep(i, t) {
  const bar = Math.floor(i / 16) % CHORDS.length;
  const k = i % 16;
  const ch = CHORDS[bar];
  if (k % 4 === 0) mtone(115, t, 0.16, { v: 0.26, f2: 45 });
  if (k % 2 === 0) mhat(t, k % 4 === 2 ? 0.035 : 0.018);
  if (k === 4 || k === 12) mhat(t, 0.05);
  if (k === 0 || k === 6 || k === 8 || k === 14) mtone(midi(ch.root), t, STEP * 3, { type: 'triangle', v: 0.17 });
  mtone(midi(ch.notes[ARP[k]] + 12), t, STEP * 1.5, { type: 'triangle', v: 0.03 });
  const note = MELODY[bar][k >> 1];
  if (k % 2 === 0 && note) mtone(midi(note), t, STEP * 1.9, { type: 'sine', v: 0.06 });
  if (k === 0) ch.notes.slice(0, 3).forEach((n) => mtone(midi(n), t, STEP * 15, { v: 0.025 }));
}

function musicTick() {
  if (!ctx || ctx.state !== 'running') {
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
    step = (step + 1) % LOOP;
    nextT += STEP;
  }
}

function applyMusic() {
  const play = musicWanted && ctx && musicLevel() > 0;
  if (play) {
    if (!musicTimer) musicTimer = setInterval(musicTick, 100);
  } else if (musicTimer) {
    clearInterval(musicTimer);
    musicTimer = null;
    nextT = 0;
  }
}

/** Start or stop the background music (the game table calls this). */
export function playMusic(on) {
  if (on && !musicWanted) step = 0;
  musicWanted = !!on;
  applyMusic();
}

/** Lower the music briefly for big moments. */
export function duckMusic(sec = 2.5) {
  if (!ctx || !musicBus) return;
  const t = ctx.currentTime;
  const full = musicLevel();
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setValueAtTime(musicBus.gain.value, t);
  musicBus.gain.linearRampToValueAtTime(full * 0.3, t + 0.1);
  musicBus.gain.linearRampToValueAtTime(full, t + sec);
}

/** For tests: is music currently being scheduled? */
export const musicPlaying = () => !!musicTimer;
