// Player profile, coins and the free-coins meter. Saved in this browser.

const KEY = 'thullaparty.profile.v1';
export const START_COINS = 2500;
export const FREE_PER_MIN = 100;
export const FREE_CAP_MIN = 60; // free coins stop building after an hour
export const STAKES = [100, 250, 500, 1000, 2500, 10000];

export const AVATARS = ['🦁', '🐯', '🐼', '🦊', '🐸', '🐵', '🐨', '🐙', '🦄', '🐲', '🐧', '🦉', '🐻', '🐰', '🐶', '🐱'];
const NAMES = ['Ace', 'Blaze', 'Chai', 'Dhol', 'Ekka', 'Fizz', 'Guddu', 'Jugnu', 'Kiki', 'Laddoo', 'Mango', 'Nimbu', 'Pappu', 'Rocket', 'Sonu', 'Tikka', 'Zara'];

export const BOT_NAMES = ['Bunty', 'Pinky', 'Chintu', 'Rani', 'Golu', 'Mona', 'Tinku', 'Bablu', 'Dolly', 'Raju', 'Sweety', 'Munna'];

function newPid() {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function randomName() {
  return NAMES[Math.floor(Math.random() * NAMES.length)] + Math.floor(10 + Math.random() * 90);
}

function defaults() {
  return {
    name: randomName(),
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    coins: START_COINS,
    lastCollect: Date.now(),
    sound: true,
    music: true,
    sfxVol: 0.8,
    musicVol: 0.5,
    quickPlay: false, // play a card with one tap instead of tap-to-select
    pid: newPid(),
    vibrate: true,
    stats: { played: 0, safe: 0, bhabhi: 0, first: 0, bestStreak: 0, streak: 0, won: 0 },
    seenHelp: false,
  };
}

let data = null;
const listeners = new Set();

export function load() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    raw = null;
  }
  const d = defaults();
  data = raw && typeof raw === 'object' ? { ...d, ...raw, stats: { ...d.stats, ...(raw.stats || {}) } } : d;
  if (!Number.isFinite(data.coins) || data.coins < 0) data.coins = 0;
  data.coins = Math.round(data.coins);
  if (!Number.isFinite(data.lastCollect) || data.lastCollect > Date.now()) data.lastCollect = Date.now();
  for (const k of ['sfxVol', 'musicVol']) if (!Number.isFinite(data[k]) || data[k] < 0 || data[k] > 1) data[k] = d[k];
  if (typeof data.pid !== 'string' || data.pid.length < 8) data.pid = d.pid;
  save();
  return data;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* private mode: keep going in memory */
  }
  for (const fn of listeners) fn(data);
}

export const profile = () => data;
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export function setName(name) {
  data.name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 14) || data.name;
  save();
}

export function setAvatar(a) {
  if (AVATARS.includes(a)) data.avatar = a;
  save();
}

/**
 * Pick up coin changes made in another tab before changing coins here, so two
 * open tabs can't overwrite each other's balance (or collect free coins twice).
 */
function refreshShared() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && Number.isFinite(raw.coins)) data.coins = Math.max(0, Math.round(raw.coins));
    if (raw && Number.isFinite(raw.lastCollect)) data.lastCollect = Math.max(data.lastCollect, raw.lastCollect);
  } catch {
    /* storage unavailable: memory copy is the truth */
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY || !data) return;
    refreshShared();
    for (const fn of listeners) fn(data);
  });
}

export function addCoins(n) {
  refreshShared();
  data.coins = Math.max(0, Math.round(data.coins + n));
  save();
}

/** Free coins built up since the last collect: 100 per full minute, max 1 hour. */
export function freeCoins(now = Date.now()) {
  const mins = Math.min(FREE_CAP_MIN, Math.floor((now - data.lastCollect) / 60000));
  return Math.max(0, mins) * FREE_PER_MIN;
}

/** Progress (0..1) towards the next +100, or 1 when full. */
export function freeProgress(now = Date.now()) {
  const mins = (now - data.lastCollect) / 60000;
  if (mins >= FREE_CAP_MIN) return 1;
  return mins - Math.floor(mins);
}

export function collectFree(now = Date.now()) {
  refreshShared();
  const amt = freeCoins(now);
  if (amt <= 0) return 0;
  const mins = Math.min(FREE_CAP_MIN, Math.floor((now - data.lastCollect) / 60000));
  // Keep the partial minute that's already building up.
  data.lastCollect = mins >= FREE_CAP_MIN ? now : data.lastCollect + mins * 60000;
  data.coins += amt;
  save();
  return amt;
}

export function recordResult({ safe, place }) {
  const s = data.stats;
  s.played += 1;
  if (safe) {
    s.safe += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    if (place === 1) s.first += 1;
  } else {
    s.bhabhi += 1;
    s.streak = 0;
  }
  save();
}

export function setPref(key, value) {
  data[key] = value;
  save();
}
