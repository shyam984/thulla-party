// Thulla Party — app shell: home screen, coins, solo games and friend rooms.

import * as store from './store.js';
import { HostMatch } from './match.js';
import { TableView, tweenNumber, EMOTES, PHRASES } from './ui/table.js';
import { hostRoom, joinRoom, cleanCode } from './net.js';
import { initFx, confetti, coinShower, rectCenter } from './ui/fx.js';
import { sfx, setSoundEnabled, setMusicEnabled, setVolumes, setExternalMute, playMusic, duckMusic } from './audio.js';
import { suitSvg } from './ui/cards.js';
import { CHARACTERS, avatarHtml } from './ui/avatars.js';
import { initPlatform, platform } from './platform.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Math.round(n).toLocaleString();
const params = new URLSearchParams(location.search);
const SPEED = Number(params.get('speed')) || 1; // testing aid
const PLACES = ['1st', '2nd', '3rd', '4th', '5th'];
const MEDALS = ['🥇', '🥈', '🥉', '🏅', '🏅'];
const BIG_BET = 2500; // bets this size (or over half your coins) need a second tap
const ALLOWED_EMOTES = new Set([...EMOTES, ...PHRASES]);
const ACTIVE_KEY = 'thullaparty.active'; // sessionStorage: an online game this tab has a bet in

const screen = $('#screen');
const modalRoot = $('#modal-root');
const app = {
  mode: null, // 'solo' | 'host' | 'client'
  match: null,
  table: null,
  room: null,
  conn: null,
  lobby: null,
  soloConfig: { players: 4, stake: 250 },
  stakeInPlay: 0,
  mySeat: 0,
  seatsInfo: [],
  leaving: false,
  homeTimer: 0,
  resultsModal: null,
  reconnecting: false,
  pendingSettle: new Map(), // host: results owed to friends who dropped out
};

// ------------------------------------------------------------------ helpers
function coinIco() {
  return '<span class="coin-ico" aria-hidden="true"></span>';
}

function coins(n) {
  return `${coinIco()}<b>${fmt(n)}</b>`;
}

function toast(text, cls = '', ms = 2400) {
  const t = document.createElement('div');
  t.className = `toast ${cls}`;
  t.setAttribute('role', cls === 'bad' ? 'alert' : 'status');
  t.innerHTML = text;
  const root = $('#toast-root');
  while (root.children.length > 2) root.firstChild.remove();
  root.appendChild(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 450);
}

/** A dialog. Closes with ✕, Escape or a tap outside unless `dismiss` is false. */
function modal(html, { cls = '', dismiss = true, onClose = null } = {}) {
  const prevFocus = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = `modal-wrap ${cls}`;
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${dismiss ? '<button class="icon-btn m-close" aria-label="Close">✕</button>' : ''}${html}</div>`;
  modalRoot.appendChild(wrap);
  const h = $('h2', wrap);
  if (h) {
    h.id = `m${Math.random().toString(36).slice(2, 8)}`;
    $('.modal', wrap).setAttribute('aria-labelledby', h.id);
  }
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 200);
    if (onClose) onClose();
    if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  };
  if (dismiss) {
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap) close();
    });
    $('.m-close', wrap).addEventListener('click', () => {
      sfx('click');
      close();
    });
  }
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dismiss) {
      e.stopPropagation();
      close();
    }
    if (e.key === 'Tab') {
      // Keep keyboard focus inside the dialog.
      const f = $$('button:not([disabled]), input, [tabindex="0"]', wrap);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    }
  });
  requestAnimationFrame(() => {
    const target = $('[autofocus]', wrap) || $('.modal button:not(.m-close):not([disabled])', wrap) || $('.m-close', wrap);
    if (target && !wrap.classList.contains('out')) target.focus({ preventScroll: true });
  });
  return { el: wrap, close, get closed() { return closed; } };
}

function closeModals() {
  modalRoot.innerHTML = '';
  app.resultsModal = null;
}

function confirmBox(text, yes, { no = 'Cancel', title = 'Are you sure?', danger = true } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = modal(
      `<h2>${title}</h2><p class="m-text">${text}</p>
      <div class="row"><button class="btn ghost no">${no}</button><button class="btn ${danger ? 'danger' : 'primary'} yes">${yes}</button></div>`,
      { onClose: () => !answered && resolve(false) },
    );
    $('.no', m.el).onclick = () => (sfx('click'), (answered = true), m.close(), resolve(false));
    $('.yes', m.el).onclick = () => (sfx('click'), (answered = true), m.close(), resolve(true));
  });
}

/** Bet chips. Chips you can't afford stay visible but explain themselves. */
function stakeChips(selected) {
  const have = store.profile().coins;
  return `<div class="chips" role="radiogroup" aria-label="Bet">${store.STAKES.map((s) => {
    const locked = s > have;
    const cls = `chip ${s === selected ? 'on' : ''} ${locked ? 'locked' : ''} ${s >= 10000 ? 'vip' : ''}`;
    return `<button class="${cls}" data-stake="${s}" role="radio" aria-checked="${s === selected}" aria-disabled="${locked}">${locked ? '<span class="lock" aria-hidden="true">🔒</span>' : coinIco()}${fmt(s)}</button>`;
  }).join('')}</div>`;
}

function bindChips(root, onPick) {
  $$('.chip', root).forEach((b) =>
    b.addEventListener('click', () => {
      const s = Number(b.dataset.stake);
      const have = store.profile().coins;
      if (s > have) {
        sfx('deny');
        b.classList.remove('nope');
        void b.offsetWidth;
        b.classList.add('nope');
        toast(`You need ${coins(s - have)} more for this table. Free coins build up every minute on the home screen.`, 'bad', 3200);
        return;
      }
      sfx('bet');
      $$('.chip', root).forEach((c) => {
        c.classList.toggle('on', c === b);
        c.setAttribute('aria-checked', String(c === b));
      });
      onPick(s);
    }),
  );
}

function bestAffordable(stake) {
  const have = store.profile().coins;
  if (stake <= have) return stake;
  const ok = store.STAKES.filter((s) => s <= have);
  return ok.length ? ok[ok.length - 1] : 0;
}

const isBigBet = (stake) => stake >= BIG_BET || stake > store.profile().coins / 2;

/**
 * A button that needs a second tap for big bets, so nobody bets 10,000 by
 * accident. Calls `go` when the bet is confirmed.
 */
function bindBetButton(btn, getStake, label, go) {
  let armed = false;
  let t = 0;
  const reset = () => {
    armed = false;
    btn.classList.remove('armed');
    btn.innerHTML = label(getStake());
  };
  btn.innerHTML = label(getStake());
  btn.onclick = () => {
    const stake = getStake();
    if (!isBigBet(stake) || armed) {
      clearTimeout(t);
      return go(stake);
    }
    armed = true;
    sfx('pop');
    btn.classList.add('armed');
    btn.innerHTML = `<span class="bl">Tap again to bet ${coins(stake)}</span>`;
    clearTimeout(t);
    t = setTimeout(reset, 3500);
  };
  return reset;
}

function setActive(v) {
  try {
    if (v) sessionStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...v, t: Date.now() }));
    else sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

function getActive() {
  try {
    const v = JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || 'null');
    return v && Date.now() - v.t < 30 * 60000 ? v : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ home
function showHome() {
  teardownGame();
  app.mode = null;
  app.lobby = null;
  const p = store.profile();
  playMusic('home');
  screen.innerHTML = `
    <div class="home screen-in">
      <div class="bg-cards" aria-hidden="true">${['S', 'H', 'D', 'C', 'H', 'D'].map((s, i) => `<i style="--i:${i}">${suitSvg(s)}</i>`).join('')}</div>
      <header class="home-top">
        <button class="profile-chip" aria-label="Edit profile"><span class="av">${avatarHtml(p.avatar)}</span><span class="nm">${esc(p.name)}</span><span class="edit" aria-hidden="true">✎</span></button>
        <div class="pill coins-pill big" title="Your coins"><span class="coin-ico"></span><b class="home-coins" data-v="${p.coins}">${fmt(p.coins)}</b></div>
      </header>
      <div class="home-main">
        <div class="logo" role="img" aria-label="Thulla Party">
          <div class="logo-cards" aria-hidden="true">${['S', 'H', 'D', 'C'].map((s, i) => `<span class="lc s-${s}" style="--i:${i}">${suitSvg(s)}</span>`).join('')}</div>
          <h1><span class="l1">THULLA</span><span class="l2">PARTY</span></h1>
          <p class="tag">Don't get caught holding the cards!</p>
        </div>
        <div class="free-card">
          <div class="fc-ico" aria-hidden="true">🎁</div>
          <div class="fc-left">
            <div class="fc-title">Free coins</div>
            <div class="fc-bar" role="progressbar" aria-label="Next free coins" aria-valuemin="0" aria-valuemax="100"><i></i></div>
            <div class="fc-sub"></div>
          </div>
          <button class="btn gold collect">Collect</button>
        </div>
        <div class="menu">
          <button class="btn primary xl play-solo"><span class="bi" aria-hidden="true">🤖</span> Play vs Computer</button>
          <div class="row">
            <button class="btn pink lg create-room"><span class="bi" aria-hidden="true">👥</span> Create Room</button>
            <button class="btn cyan lg join-room"><span class="bi" aria-hidden="true">🔑</span> Join Room</button>
          </div>
        </div>
        <div class="stats" aria-label="Your stats">
          <div><b>${fmt(p.stats.played)}</b><span>Games</span></div>
          <div><b>${fmt(p.stats.safe)}</b><span>Safe</span></div>
          <div><b>${fmt(p.stats.bhabhi)}</b><span>Bhabhi</span></div>
          <div><b>${fmt(p.stats.bestStreak)}</b><span>Best streak</span></div>
        </div>
      </div>
      <div class="home-foot">
        <button class="link how">❓ How to play</button>
        <button class="link settings">⚙ Settings</button>
        <button class="link snd" aria-label="${p.sound || p.music ? 'Mute' : 'Unmute'}">${p.sound || p.music ? '🔊 Sound on' : '🔇 Muted'}</button>
      </div>
    </div>`;
  $('.profile-chip').onclick = () => (sfx('click'), editProfile());
  $('.play-solo').onclick = () => (sfx('click'), soloSetup());
  $('.create-room').onclick = () => (sfx('click'), createRoom());
  $('.join-room').onclick = () => (sfx('click'), joinDialog());
  $('.how').onclick = () => (sfx('click'), howToPlay());
  $('.settings').onclick = () => (sfx('click'), settingsDialog());
  $('.snd').onclick = () => {
    const on = !(store.profile().sound || store.profile().music);
    store.setPref('sound', on);
    store.setPref('music', on);
    if (on) sfx('click');
    const b = $('.snd');
    if (b) b.textContent = on ? '🔊 Sound on' : '🔇 Muted';
  };
  $('.collect').onclick = (e) => {
    const amt = store.collectFree();
    if (amt > 0) {
      sfx('coins');
      const c = rectCenter(e.currentTarget);
      coinShower(c.x, c.y, 36);
      toast(`+${coins(amt)} free coins!`, 'gold');
      updateHomeCoins();
      updateFree();
    } else {
      sfx('deny');
      toast('Nothing to collect yet — free coins arrive every minute.');
    }
  };
  updateFree();
  clearInterval(app.homeTimer);
  app.homeTimer = setInterval(updateFree, 1000);

  if (!p.seenHelp) {
    store.setPref('seenHelp', true);
    setTimeout(howToPlay, 400);
  }
}

function updateHomeCoins() {
  tweenNumber($('.home-coins'), store.profile().coins);
}

function updateFree() {
  const card = $('.free-card');
  if (!card) return clearInterval(app.homeTimer);
  const amt = store.freeCoins();
  const prog = store.freeProgress();
  $('.fc-bar i', card).style.width = `${Math.round(prog * 100)}%`;
  $('.fc-bar', card).setAttribute('aria-valuenow', String(Math.round(prog * 100)));
  const btn = $('.collect', card);
  btn.disabled = amt <= 0;
  btn.innerHTML = amt > 0 ? `Collect +${fmt(amt)}` : 'Collect';
  card.classList.toggle('ready', amt > 0);
  const full = amt >= store.FREE_CAP_MIN * store.FREE_PER_MIN;
  const secs = Math.max(0, Math.ceil(60 - prog * 60));
  $('.fc-sub', card).textContent = full ? 'Full! Collect your coins' : `+${store.FREE_PER_MIN} every minute · next in 0:${String(secs % 60).padStart(2, '0')}`;
}

function editProfile() {
  const p = store.profile();
  const pick = (a, label, cls) =>
    `<button class="av-pick ${cls} ${a === p.avatar ? 'on' : ''}" data-a="${esc(a)}" role="radio" aria-checked="${a === p.avatar}" aria-label="${esc(label)}">${avatarHtml(a)}${cls === 'char' ? `<span>${esc(label)}</span>` : ''}</button>`;
  const m = modal(`
    <h2>Your profile</h2>
    <div class="prof-preview"><span class="av big-av">${avatarHtml(p.avatar)}</span><div><div class="pp-name">${esc(p.name)}</div><div class="m-hint">This is you at the table</div></div></div>
    <label class="field"><span>Name</span><input class="nm-in" maxlength="14" value="${esc(p.name)}" autocomplete="nickname" /></label>
    <div class="m-label">Characters</div>
    <div class="char-grid" role="radiogroup" aria-label="Characters">${CHARACTERS.map((c) => pick(c.id, c.name, 'char')).join('')}</div>
    <div class="m-label">Or an emoji</div>
    <div class="av-grid" role="radiogroup" aria-label="Emoji avatars">${store.AVATARS.map((a) => pick(a, `Avatar ${a}`, 'emo')).join('')}</div>
    <button class="btn primary lg save">Save</button>`, { cls: 'profile' });
  let av = p.avatar;
  const preview = $('.big-av', m.el);
  const nameEl = $('.pp-name', m.el);
  $$('.av-pick', m.el).forEach((b) =>
    b.addEventListener('click', () => {
      sfx('pop');
      $$('.av-pick', m.el).forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      av = b.dataset.a;
      preview.innerHTML = avatarHtml(av);
      preview.classList.remove('bounce');
      void preview.offsetWidth;
      preview.classList.add('bounce');
    }),
  );
  $('.nm-in', m.el).addEventListener('input', (e) => (nameEl.textContent = e.target.value || p.name));
  const save = () => {
    store.setName($('.nm-in', m.el).value);
    store.setAvatar(av);
    sfx('click');
    m.close();
    if (!app.mode) showHome();
    else if (app.mode === 'host' && app.lobby && !app.lobby.inGame) {
      const me = app.lobby.seats[0];
      me.name = store.profile().name;
      me.avatar = store.profile().avatar;
      broadcastLobby();
    }
  };
  $('.save', m.el).onclick = save;
  $('.nm-in', m.el).addEventListener('keydown', (e) => e.key === 'Enter' && save());
}

function howToPlay() {
  const m = modal(`
    <h2>How to play</h2>
    <ol class="rules">
      <li><b>Get rid of all your cards.</b> The last player left holding cards is the <b class="red">Bhabhi</b> and loses.</li>
      <li>Whoever has the <b>${suitSvg('S', 'inline')}Ace of Spades</b> starts.</li>
      <li>Everyone must <b>follow the suit</b> that was led if they can.</li>
      <li>If everyone follows, the cards are thrown away and the <b>highest card</b> leads next.</li>
      <li>Can't follow suit? Play any card — that's a <b class="pink">THULLA!</b> The player with the highest card of the led suit <b>picks up the whole pile</b>.</li>
      <li>No thulla on the <b>first trick</b> — if you have no spades, any card is just thrown away.</li>
    </ol>
    <div class="payout-box">
      <div>🛡️ Out of cards = <b>SAFE</b>. Stay to win <b>2× your bet</b>, or leave early with your bet back.</div>
      <div>😭 The Bhabhi loses their bet.</div>
    </div>
    <p class="m-hint tip">On a phone: tap a card to pick it, tap again to play. On a computer: click, or use Tab and Enter.</p>
    <button class="btn primary lg got-it">Let's play!</button>`);
  $('.got-it', m.el).onclick = () => (sfx('click'), m.close());
}

function settingsDialog() {
  const p = store.profile();
  const sw = (key, on, label, sub = '') => `
    <div class="set-row">
      <div class="set-l"><span>${label}</span>${sub ? `<small>${sub}</small>` : ''}</div>
      <button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" data-key="${key}"><i></i></button>
    </div>`;
  const slider = (key, v, label) => `<input class="vol" type="range" min="0" max="100" step="5" value="${Math.round(v * 100)}" data-key="${key}" aria-label="${label} volume" />`;
  const canFs = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !platform.active;
  const m = modal(`
    <h2>Settings</h2>
    ${sw('sound', p.sound, 'Sound effects')}
    ${slider('sfxVol', p.sfxVol, 'Sound effects')}
    ${sw('music', p.music, 'Music')}
    ${slider('musicVol', p.musicVol, 'Music')}
    ${sw('quickPlay', p.quickPlay, 'One-tap play', 'Off: tap a card to pick it, tap again to play (touch screens)')}
    ${sw('vibrate', p.vibrate, 'Vibration', 'On supported phones')}
    ${canFs ? '<button class="btn ghost fs">⛶ Full screen</button>' : ''}
    <button class="btn primary lg done">Done</button>`);
  $$('.switch', m.el).forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.key;
      const on = !store.profile()[key];
      store.setPref(key, on);
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      sfx('click');
      if (app.table) app.table.updateSound();
    }),
  );
  $$('.vol', m.el).forEach((r) => {
    const key = r.dataset.key;
    r.addEventListener('input', () => setVolumes({ [key === 'sfxVol' ? 'sfx' : 'music']: r.value / 100 }));
    r.addEventListener('change', () => {
      store.setPref(key, r.value / 100);
      if (key === 'sfxVol') sfx('card');
    });
  });
  const fs = $('.fs', m.el);
  if (fs) fs.onclick = () => (toggleFullscreen(), m.close());
  $('.done', m.el).onclick = () => (sfx('click'), m.close());
}

function toggleFullscreen() {
  const d = document;
  const el = d.documentElement;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      const r = req && req.call(el, { navigationUI: 'hide' });
      Promise.resolve(r)
        .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'))
        .catch(() => {});
    }
  } catch {
    toast("Full screen isn't available in this browser.");
  }
}

function needCoins(stake = store.STAKES[0]) {
  const have = store.profile().coins;
  const m = modal(`<div class="empty-state"><div class="es-ico" aria-hidden="true">🪙</div>
    <h2>Not enough coins</h2>
    <p class="m-text">You have ${coins(have)}. You need at least ${coins(stake)} to play. Free coins build up at <b>+${store.FREE_PER_MIN} every minute</b> — collect them on the home screen.</p></div>
    <button class="btn gold lg ok">OK</button>`);
  $('.ok', m.el).onclick = () => m.close();
}

// ------------------------------------------------------------------ solo
function soloSetup() {
  const cfg = app.soloConfig;
  cfg.stake = bestAffordable(cfg.stake);
  if (!cfg.stake) return needCoins();
  const m = modal(`
    <h2>Play vs Computer</h2>
    <div class="m-label">Players</div>
    <div class="seg" role="radiogroup" aria-label="Players">${[3, 4, 5].map((n) => `<button class="seg-b ${n === cfg.players ? 'on' : ''}" data-n="${n}" role="radio" aria-checked="${n === cfg.players}">${n}</button>`).join('')}</div>
    <div class="m-label">Your bet</div>
    ${stakeChips(cfg.stake)}
    <div class="bet-summary"></div>
    <button class="btn primary xl deal"></button>`);
  const upd = () => {
    const have = store.profile().coins;
    $('.bet-summary', m.el).innerHTML = `
      <div><span>Your bet</span><em>${coins(cfg.stake)}</em></div>
      <div class="win"><span>Get out safe</span><em>+${coins(cfg.stake)}</em></div>
      <div class="lose"><span>Be the Bhabhi</span><em>−${coins(cfg.stake)}</em></div>
      <div class="bal"><span>Your coins</span><em>${coins(have)}</em></div>`;
    resetBtn();
  };
  const resetBtn = bindBetButton($('.deal', m.el), () => cfg.stake, (s) => `<span class="bl">Deal · bet ${coins(s)}</span>`, () => {
    m.close();
    startSolo();
  });
  upd();
  $$('.seg-b', m.el).forEach((b) =>
    b.addEventListener('click', () => {
      sfx('click');
      $$('.seg-b', m.el).forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-checked', String(x === b));
      });
      cfg.players = Number(b.dataset.n);
    }),
  );
  bindChips(m.el, (s) => ((cfg.stake = s), upd()));
}

function botSeats(count, taken = []) {
  const names = store.BOT_NAMES.filter((n) => !taken.includes(n)).sort(() => Math.random() - 0.5);
  const avs = store.AVATARS.filter((a) => !taken.includes(a)).sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => ({ name: names[i], avatar: avs[i], kind: 'bot', coins: 1000 + Math.floor(Math.random() * 9) * 500 }));
}

function startSolo() {
  const cfg = app.soloConfig;
  if (store.profile().coins < cfg.stake) return needCoins(cfg.stake);
  teardownGame();
  app.mode = 'solo';
  const p = store.profile();
  const seats = [{ name: p.name, avatar: p.avatar, kind: 'human' }, ...botSeats(cfg.players - 1, [p.avatar])];
  mountTable({
    onPlay: (card) => app.match && app.match.submit(0, card),
    onEmote: (e) => {
      app.table.showEmote(0, e);
      botReply(seats);
    },
    onFastForward: () => {
      if (app.match) app.match.speed = SPEED * 6;
    },
  });
  app.match = new HostMatch({ seats, stake: cfg.stake, deliver: (i, ev) => i === 0 && deliverToMe(ev), speed: SPEED });
  app.match.start();
}

function botReply(seats) {
  if (Math.random() < 0.55) {
    const bots = seats.map((s, i) => (s.kind === 'bot' ? i : -1)).filter((i) => i >= 0);
    const b = bots[Math.floor(Math.random() * bots.length)];
    const e = ['😂', '😎', '🔥', '😏', 'Good game!', '😱'][Math.floor(Math.random() * 6)];
    setTimeout(() => app.table && app.table.showEmote(b, e), 900 + Math.random() * 900);
  }
}

// ------------------------------------------------------------------ table + coins
function mountTable({ onPlay, onEmote, onFastForward = null }) {
  clearInterval(app.homeTimer);
  closeModals();
  screen.innerHTML = '<div class="table-host screen-in"></div>';
  playMusic(true);
  platform.gameplayStart();
  app.table = new TableView($('.table-host'), {
    onPlay,
    onEmote,
    onLeave: leaveGame,
    onLeaveSafe: leaveSafely,
    onFastForward,
    onSettings: settingsDialog,
    onGameOver: showResults,
    isHost: app.mode === 'host',
    speed: 1 / SPEED,
  });
}

/** Events for this player's seat. Handles the bet going in and paying out. */
function deliverToMe(ev) {
  if (ev.type === 'deal') {
    app.stakeInPlay = ev.stake;
    app.mySeat = ev.you;
    app.seatsInfo = ev.seats;
    store.addCoins(-ev.stake);
    sfx('bet');
    if (app.mode === 'client') setActive({ code: app.lobby && app.lobby.code, stake: ev.stake, seat: ev.you });
  }
  if (ev.type === 'sync') {
    // Back after a dropped connection or a page refresh: the bet was already
    // taken from this browser when the cards were dealt, so don't take it again.
    const act = getActive();
    if (!app.stakeInPlay && act && act.code === (app.lobby && app.lobby.code)) app.stakeInPlay = act.stake;
    app.mySeat = ev.you;
    app.seatsInfo = ev.seats;
  }
  if (ev.type === 'over') settleGame(ev);
  if (ev.type === 'seat' && app.seatsInfo[ev.seat]) app.seatsInfo[ev.seat].status = ev.status;
  // Bots react to big moments now and then (solo and host only).
  if (app.mode !== 'client' && app.match && ev.type === 'thulla' && Math.random() < 0.45) {
    const seats = app.match.seats;
    const who = Math.random() < 0.5 ? ev.seat : ev.picker;
    if (seats[who] && seats[who].kind === 'bot') {
      const e = who === ev.seat ? ['😈', '😂', '🔥', 'Thulla time! 😈'][Math.floor(Math.random() * 4)] : ['😭', '😡', '😱', 'Nooo! 😭'][Math.floor(Math.random() * 4)];
      setTimeout(() => sendEmoteFrom(who, e), 1400);
    }
  }
  app.table && app.table.push(ev);
}

/** Pay out a finished game exactly once. */
function settleGame(ev) {
  if (!app.stakeInPlay) return;
  const me = app.mySeat;
  const pay = ev.payouts[me] || 0;
  store.addCoins(pay);
  app.stakeInPlay = 0;
  setActive(null);
  const safe = ev.loser !== me;
  store.recordResult({ safe, place: safe ? ev.order.indexOf(me) + 1 : 0 });
  platform.gameplayStop();
  if (safe) platform.happytime();
  if (app.mode === 'client' && app.conn) app.conn.send({ t: 'coins', coins: store.profile().coins });
  if (app.mode === 'host') updateHostSeatCoins();
}

function sendEmoteFrom(seat, e) {
  if (app.mode === 'host') hostBroadcastEmote(seat, e);
  else app.table && app.table.showEmote(seat, e);
}

function showResults(ev) {
  const seats = app.seatsInfo || [];
  const me = app.mySeat;
  const stake = ev.stake;
  const statuses = ev.statuses || [];
  const order = ev.order.concat([ev.loser]);
  const iLost = ev.loser === me;
  const rows = order
    .map((s, i) => {
      const lost = s === ev.loser;
      const status = statuses[s];
      let tag;
      let delta;
      if (lost) (tag = '<span class="rtag bhabhi">BHABHI</span>'), (delta = -stake);
      else if (status === 'leftSafe') (tag = '<span class="rtag left">LEFT SAFE</span>'), (delta = 0);
      else if (status === 'quit') (tag = '<span class="rtag left">LEFT</span>'), (delta = -stake);
      else (tag = '<span class="rtag safe">SAFE</span>'), (delta = (ev.payouts[s] || 0) - stake);
      const dl = delta > 0 ? `+${coins(delta)}` : delta < 0 ? `−${coins(-delta)}` : '<span class="even">bet back</span>';
      return `<div class="res-row ${lost ? 'lost' : 'won'} ${s === me ? 'me' : ''}" style="--i:${i}">
        <span class="pl">${lost ? '😭' : MEDALS[i]}<small>${lost ? '' : PLACES[i]}</small></span>
        <span class="av">${avatarHtml(seats[s] ? seats[s].avatar : '🙂')}</span>
        <span class="nm">${esc(seats[s] ? seats[s].name : 'Player')}${s === me ? ' <small>YOU</small>' : ''}${tag}</span>
        <span class="dl">${dl}</span></div>`;
    })
    .join('');
  duckMusic(4);
  let actions = '';
  if (app.mode === 'solo') actions = `<button class="btn ghost lg go-home">🚪 Leave table</button><button class="btn primary lg again">Play again</button>`;
  else if (app.mode === 'host') actions = `<button class="btn ghost lg go-home">🚪 Leave &amp; close room</button><button class="btn primary lg to-lobby">Back to room</button>`;
  else actions = `<button class="btn ghost lg go-home">🚪 Leave room</button><div class="waiting">Waiting for the host…</div>`;
  // Count from the balance before this game's bet to the balance now.
  const now = store.profile().coins;
  const before = iLost ? now + stake : now - stake;
  const winnerSeat = ev.order[0];
  const m = modal(
    `<div class="res-head ${iLost ? 'lost' : 'won'}">
      <div class="res-emoji" aria-hidden="true">${iLost ? '😭' : '🏆'}</div>
      <div class="res-title">
        <h2>${iLost ? "You're the Bhabhi!" : 'You escaped!'}</h2>
        <div class="res-delta">${iLost ? '−' : '+'}${coins(stake)}</div>
      </div>
    </div>
    <div class="res-meta"><span>Table bet ${coins(stake)}</span><span>First out: <b>${esc(seats[winnerSeat] ? seats[winnerSeat].name : '')}</b></span></div>
    <div class="res-list">${rows}</div>
    <div class="res-coins">Your coins ${coinIco()}<b class="rc" data-v="${Math.max(0, before)}">${fmt(Math.max(0, before))}</b></div>
    <div class="row res-actions">${actions}</div>`,
    { cls: 'results', dismiss: false },
  );
  setTimeout(() => tweenNumber($('.rc', m.el), now, 900), 450);
  if (!iLost) {
    setTimeout(() => {
      const h = $('.res-head', m.el);
      const c = h ? rectCenter(h) : { x: innerWidth / 2, y: innerHeight * 0.3 };
      confetti(c.x, c.y, 100, 1.4);
      coinShower(c.x, c.y + 20, 30);
      sfx('coins');
    }, 250);
  }
  const home = $('.go-home', m.el);
  if (home)
    home.onclick = () => {
      sfx('leave');
      if (app.mode === 'client' && app.conn) app.conn.send({ t: 'leave' });
      m.close();
      leaveToHome();
    };
  const again = $('.again', m.el);
  if (again)
    again.onclick = () => {
      sfx('click');
      m.close();
      app.soloConfig.stake = bestAffordable(app.soloConfig.stake);
      if (!app.soloConfig.stake) return (showHome(), needCoins());
      startSolo();
    };
  const lob = $('.to-lobby', m.el);
  if (lob) lob.onclick = () => (sfx('click'), m.close(), hostBackToLobby());
  app.resultsModal = m;
}

/** The ✕ button at the table. */
async function leaveGame() {
  sfx('click');
  if (app.table && app.table.out[app.table.you] && app.stakeInPlay) return leaveSafely();
  const inPlay = app.stakeInPlay > 0;
  let msg;
  if (app.mode === 'host') msg = inPlay ? `This closes the room for everyone. Your friends get their bets back, but you lose your ${coins(app.stakeInPlay)} bet.` : 'This closes the room for everyone.';
  else msg = inPlay ? `You haven't finished your cards, so you'll lose your ${coins(app.stakeInPlay)} bet. A computer player will finish your hand.` : 'Leave this game?';
  if (!(await confirmBox(msg, 'Leave', { title: inPlay ? 'Leave and lose your bet?' : 'Leave the game?' }))) return;
  if (inPlay) store.recordResult({ safe: false });
  if (app.mode === 'client' && app.conn) app.conn.send({ t: 'leave' });
  app.stakeInPlay = 0;
  setActive(null);
  sfx('leave');
  platform.gameplayStop();
  leaveToHome();
}

/** You're out of cards: take your bet back and leave the others to finish. */
async function leaveSafely() {
  const stake = app.stakeInPlay;
  if (!stake || !app.table || !app.table.out[app.table.you]) return;
  if (app.mode === 'host') {
    const ok = await confirmBox(`You're hosting, so leaving ends the game for everyone. Everyone gets their ${coins(stake)} bet back, including you.`, 'End game & leave', { title: 'End the game?' });
    if (!ok || !app.stakeInPlay) return;
  }
  app.stakeInPlay = 0;
  setActive(null);
  store.addCoins(stake);
  store.recordResult({ safe: true, place: app.table.places[app.table.you] || 0 });
  if (app.mode === 'client' && app.conn) app.conn.send({ t: 'leave', safe: true });
  platform.gameplayStop();
  sfx('safe');
  const back = app.mode;
  setTimeout(
    () => {
      leaveToHome();
      toast(`🛡️ You left safely — your ${coins(stake)} bet was returned.`, 'gold', 3200);
      if (back === 'host') toast('The room was closed and everyone got their bet back.', '', 3200);
    },
    app.mode === 'client' ? 250 : 0,
  );
}

function leaveToHome() {
  app.leaving = true;
  if (app.room) app.room.close();
  if (app.conn) app.conn.close();
  app.room = null;
  app.conn = null;
  app.reconnecting = false;
  app.pendingSettle.clear();
  setActive(null);
  closeModals();
  showHome();
  app.leaving = false;
}

function teardownGame() {
  if (app.match) app.match.destroy();
  if (app.table) app.table.destroy();
  if (app.table || app.match) platform.gameplayStop();
  playMusic(false);
  app.match = null;
  app.table = null;
}

// ------------------------------------------------------------------ rooms: host
async function createRoom() {
  const stake = bestAffordable(250);
  if (!stake) return needCoins();
  const p = store.profile();
  const wait = modal('<h2>Creating your room…</h2><div class="spinner" role="status" aria-label="Loading"></div><p class="m-hint center">Connecting to the online service</p>', { dismiss: false });
  try {
    app.room = await hostRoom({ onJoin: hostOnJoin, onMessage: hostOnMessage, onLeave: hostOnLeave, onError: (e) => toast(esc(e.message), 'bad') });
  } catch (e) {
    wait.close();
    return modal(`<div class="empty-state"><div class="es-ico" aria-hidden="true">📡</div><h2>Couldn't create a room</h2><p class="m-text">${esc(e.message)}</p></div>`);
  }
  wait.close();
  teardownGame();
  app.mode = 'host';
  app.pendingSettle.clear();
  app.lobby = { code: app.room.code, stake, seats: [{ id: 'host', pid: p.pid, name: p.name, avatar: p.avatar, coins: p.coins, kind: 'human', host: true, ready: true }], inGame: false };
  sfx('join');
  renderLobby();
}

function publicSeats() {
  return app.lobby.seats.map(({ name, avatar, coins: c, kind, host, ready }) => ({ name, avatar, coins: c, kind, host: !!host, ready: !!ready }));
}

function broadcastLobby() {
  const seats = publicSeats();
  app.lobby.seats.forEach((s, i) => {
    if (s.conn) app.room.send(s.conn, { t: 'lobby', code: app.lobby.code, stake: app.lobby.stake, seats, you: i });
  });
  renderLobby();
}

const cleanName = (n) => String(n || 'Player').replace(/\s+/g, ' ').trim().slice(0, 14) || 'Player';

function hostOnJoin(conn, hello) {
  const L = app.lobby;
  if (!L) return;
  const pid = String(hello.pid || '').slice(0, 64);
  const name = cleanName(hello.name);

  // A friend reconnecting to a game in progress gets their seat back.
  if (L.inGame && app.match && pid) {
    const i = L.seats.findIndex((s) => s.pid === pid);
    if (i > 0 && app.match.canRejoin(i)) {
      L.seats[i].conn = conn;
      app.match.rejoin(i);
      app.room.send(conn, { t: 'lobby', code: L.code, stake: L.stake, seats: publicSeats(), you: i, inGame: true });
      app.room.send(conn, { t: 'ev', ev: app.match.snapshot(i) });
      if (app.match.overEv) app.room.send(conn, { t: 'ev', ev: app.match.overEv });
      toast(`${esc(name)} is back!`);
      sfx('join');
      return;
    }
  }
  if (L.inGame) return kick(conn, 'A game is already being played in this room. Try again when it ends.');
  // Same player connecting twice (e.g. refreshed the page): replace the old seat.
  const dup = pid ? L.seats.findIndex((s) => s.pid === pid && !s.host) : -1;
  if (dup > 0) {
    const old = L.seats[dup].conn;
    L.seats.splice(dup, 1);
    if (old) {
      try {
        old.close();
      } catch {
        /* ignore */
      }
    }
  }
  if (L.seats.length >= 5) return kick(conn, 'This room is full (5 players max).');
  L.seats.push({
    id: conn.peer,
    pid,
    conn,
    name,
    avatar: store.isAvatar(hello.avatar) ? hello.avatar : '🙂',
    coins: Math.max(0, Math.floor(Number(hello.coins)) || 0),
    kind: 'human',
    ready: false,
  });
  sfx('join');
  toast(`${esc(name)} joined!`);
  broadcastLobby();
  const owed = pid && app.pendingSettle.get(pid);
  if (owed) {
    app.pendingSettle.delete(pid);
    app.room.send(conn, { t: 'settle', ev: owed.ev, seat: owed.seat });
  }
}

function kick(conn, reason) {
  app.room.send(conn, { t: 'kick', reason });
  setTimeout(() => {
    try {
      conn.close();
    } catch {
      /* ignore */
    }
  }, 300);
}

function seatIndexOf(conn) {
  return app.lobby ? app.lobby.seats.findIndex((s) => s.conn === conn) : -1;
}

function hostOnMessage(conn, msg) {
  const L = app.lobby;
  const i = seatIndexOf(conn);
  if (!L || i < 0) return;
  const seat = L.seats[i];
  switch (msg.t) {
    case 'play':
      if (app.match) app.match.submit(i, String(msg.card).slice(0, 4));
      break;
    case 'emote': {
      const e = String(msg.e);
      const now = Date.now();
      if (!ALLOWED_EMOTES.has(e) || now - (seat.lastEmote || 0) < 1200) return; // no spam
      seat.lastEmote = now;
      hostBroadcastEmote(i, e);
      break;
    }
    case 'coins':
      seat.coins = Math.max(0, Math.floor(Number(msg.coins)) || 0);
      if (!L.inGame) {
        if (seat.coins < L.stake) seat.ready = false;
        broadcastLobby();
      }
      break;
    case 'ready':
      if (L.inGame) return;
      seat.ready = !!msg.ready && seat.coins >= L.stake;
      if (seat.ready) sfx('pop');
      broadcastLobby();
      break;
    case 'leave': {
      seat.conn = null;
      if (L.inGame && app.match) {
        const r = app.match.leave(i);
        if (r === 'safe') toast(`🛡️ ${esc(seat.name)} left safely with their bet`);
        else if (r === 'quit') toast(`${esc(seat.name)} left — a bot will finish their cards`);
        else toast(`${esc(seat.name)} left`);
      } else {
        L.seats.splice(i, 1);
        toast(`${esc(seat.name)} left`);
        broadcastLobby();
      }
      setTimeout(() => {
        try {
          conn.close();
        } catch {
          /* ignore */
        }
      }, 200);
      break;
    }
    default:
  }
}

function hostOnLeave(conn) {
  const L = app.lobby;
  const i = seatIndexOf(conn);
  if (!L || i < 0) return;
  const s = L.seats[i];
  s.conn = null;
  if (L.inGame && app.match && app.match.st && app.match.st.phase === 'play') {
    // Keep the seat: a bot covers until they reconnect.
    app.match.markAway(i);
    if (app.match.seats[i].status === 'away') toast(`📶 ${esc(s.name)} lost connection — a bot is covering`);
  } else if (L.inGame) {
    toast(`${esc(s.name)} left`); // game over: their seat is dropped when you go back to the room
  } else {
    L.seats.splice(i, 1);
    toast(`${esc(s.name)} left`);
    broadcastLobby();
  }
}

function hostBroadcastEmote(seat, e) {
  if (!app.lobby || !app.room) return;
  for (const s of app.lobby.seats) if (s.conn) app.room.send(s.conn, { t: 'emote', seat, e });
  app.table && app.table.showEmote(seat, e);
}

function updateHostSeatCoins() {
  if (app.lobby) app.lobby.seats[0].coins = store.profile().coins;
}

function hostAddBot() {
  const L = app.lobby;
  if (L.seats.length >= 5) return;
  const taken = L.seats.map((s) => s.avatar).concat(L.seats.map((s) => s.name));
  L.seats.push({ id: `bot-${Math.random()}`, ...botSeats(1, taken)[0], ready: true });
  sfx('pop');
  broadcastLobby();
}

function hostRemove(i) {
  const s = app.lobby.seats[i];
  if (!s || s.host) return;
  if (s.conn) kick(s.conn, 'The host removed you from the room.');
  app.lobby.seats.splice(i, 1);
  broadcastLobby();
}

function hostSetStake(stake) {
  const L = app.lobby;
  if (L.stake === stake) return;
  L.stake = stake;
  // Everyone has to agree to a new bet.
  for (const s of L.seats) if (!s.host && s.kind === 'human') s.ready = false;
  for (const s of L.seats) if (s.conn) app.room.send(s.conn, { t: 'notice', text: `The host changed the bet to ${fmt(stake)}. Tap Ready if you're in.` });
  broadcastLobby();
}

function hostStart() {
  const L = app.lobby;
  if (L.inGame) return;
  if (L.seats.length < 3) return toast('You need at least 3 players — add a bot!', 'bad');
  if (store.profile().coins < L.stake) return needCoins(L.stake);
  const poor = L.seats.filter((s) => s.kind === 'human' && !s.host && s.coins < L.stake);
  if (poor.length) return toast(`${esc(poor.map((s) => s.name).join(', '))} can't afford this bet`, 'bad');
  const notReady = L.seats.filter((s) => s.kind === 'human' && !s.host && !s.ready);
  if (notReady.length) return toast(`Waiting for ${esc(notReady.map((s) => s.name).join(', '))} to tap Ready`, 'bad');
  L.inGame = true;
  app.pendingSettle.clear();
  const seats = L.seats.map((s) => ({ name: s.name, avatar: s.avatar, kind: s.kind === 'bot' ? 'bot' : 'human' }));
  mountTable({
    onPlay: (card) => app.match && app.match.submit(0, card),
    onEmote: (e) => hostBroadcastEmote(0, e),
  });
  app.match = new HostMatch({
    seats,
    stake: L.stake,
    speed: SPEED,
    deliver: (i, ev) => {
      if (i === 0) return deliverToMe(ev);
      const s = L.seats[i];
      if (s && s.conn) app.room.send(s.conn, { t: 'ev', ev });
    },
  });
  app.match.start();
}

function hostBackToLobby() {
  const L = app.lobby;
  const m = app.match;
  if (m && m.overEv) {
    // Friends who dropped out and never saw the result get paid if they come back.
    L.seats.forEach((s, i) => {
      if (i > 0 && s.pid && m.seats[i] && m.seats[i].status === 'away') app.pendingSettle.set(s.pid, { ev: m.overEv, seat: i });
    });
  }
  teardownGame();
  L.inGame = false;
  L.seats = L.seats.filter((s, i) => i === 0 || s.kind === 'bot' || s.conn);
  for (const s of L.seats) if (!s.host && s.kind === 'human') s.ready = false;
  L.stake = Math.min(L.stake, bestAffordable(L.stake) || store.STAKES[0]);
  updateHostSeatCoins();
  broadcastLobby();
}

// ------------------------------------------------------------------ lobby screen (host + client)
function renderLobby() {
  if (!app.lobby || app.table) return;
  const L = app.lobby;
  const isHost = app.mode === 'host';
  const seats = isHost ? publicSeats() : L.seats;
  const me = isHost ? 0 : L.you;
  const link = platform.inviteLink(L.code, `${location.origin}${location.pathname}?room=${L.code}`);
  const slots = [];
  for (let i = 0; i < 5; i++) {
    const s = seats[i];
    if (s) {
      const short = s.kind === 'human' && s.coins < L.stake;
      let state = '';
      if (s.host) state = '<span class="tagx host">👑 Host</span>';
      else if (s.kind === 'bot') state = '<span class="tagx">🤖 Bot</span>';
      else if (short) state = '<span class="tagx bad">Not enough coins</span>';
      else state = s.ready ? '<span class="tagx ok">✓ Ready</span>' : '<span class="tagx wait">Not ready</span>';
      slots.push(`<div class="slot filled ${s.kind} ${i === me ? 'me' : ''}" style="--i:${i}">
        <span class="av">${avatarHtml(s.avatar)}</span>
        <span class="nm">${esc(s.name)}${i === me ? ' <small>YOU</small>' : ''}</span>
        ${state}
        <span class="cc ${short ? 'short' : ''}">${coinIco()}${s.kind === 'bot' ? '∞' : fmt(s.coins)}</span>
        ${isHost && !s.host ? `<button class="icon-btn rm" data-i="${i}" aria-label="Remove ${esc(s.name)}">✕</button>` : ''}
      </div>`);
    } else {
      slots.push(`<div class="slot empty" style="--i:${i}">${isHost ? '<button class="add-bot">+ Add computer player</button>' : '<span>Open seat</span>'}</div>`);
    }
  }
  const friends = seats.filter((s) => s.kind === 'human' && !s.host);
  const notReady = friends.filter((s) => !s.ready).length;
  let startLabel = 'Start game 🃏';
  let canStart = true;
  if (seats.length < 3) (startLabel = 'Need 3+ players'), (canStart = false);
  else if (notReady) (startLabel = `Waiting for ${notReady} to be ready`), (canStart = false);
  const mine = seats[me];
  const iCanAfford = store.profile().coins >= L.stake;
  const clientBtn = !iCanAfford
    ? `<button class="btn ghost xl" disabled>Not enough coins for this bet</button>`
    : mine && mine.ready
      ? `<button class="btn ghost xl ready-btn" data-r="0">✓ Ready — tap to cancel</button>`
      : `<button class="btn primary xl ready-btn" data-r="1"><span class="bl">I'm in · bet ${coins(L.stake)}</span></button>`;
  playMusic('home');
  screen.innerHTML = `
    <div class="lobby screen-in">
      <header class="home-top">
        <button class="icon-btn back" aria-label="Leave room">←</button>
        <h2 class="lob-title">${isHost ? 'Your room' : 'Friend room'}</h2>
        <div class="pill coins-pill"><span class="coin-ico"></span><b>${fmt(store.profile().coins)}</b></div>
      </header>
      <div class="lobby-main">
        <div class="lob-col">
          <div class="code-card">
            <div class="code-label">ROOM CODE</div>
            <div class="code" aria-label="Room code ${L.code.split('').join(' ')}">${L.code.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div>
            <div class="row">
              <button class="btn ghost copy">📋 Copy code</button>
              <button class="btn cyan share">📨 Invite</button>
            </div>
          </div>
          <div class="lob-bet">
            <div class="m-label">Bet ${isHost ? '' : '· set by the host'}</div>
            ${isHost ? stakeChips(L.stake) : `<div class="bet-show">${coins(L.stake)}</div>`}
            <p class="m-hint">Safe players win ${coins(L.stake)} · the Bhabhi loses ${coins(L.stake)}</p>
          </div>
        </div>
        <div class="lob-col">
          <div class="slots">${slots.join('')}</div>
          ${isHost ? `<button class="btn primary xl start" ${canStart ? '' : 'disabled'}>${startLabel}</button>` : clientBtn}
          ${isHost ? '' : '<div class="waiting">The host starts the game when everyone is ready</div>'}
        </div>
      </div>
    </div>`;
  $('.back').onclick = async () => {
    sfx('click');
    if (await confirmBox(isHost ? 'This closes the room for everyone.' : 'Leave this room?', 'Leave', { title: 'Leave the room?' })) {
      if (!isHost && app.conn) app.conn.send({ t: 'leave' });
      sfx('leave');
      leaveToHome();
    }
  };
  $('.copy').onclick = () => {
    sfx('click');
    copyText(L.code).then(() => toast('Code copied!'));
  };
  $('.share').onclick = () => {
    sfx('click');
    const text = `Join my Thulla Party room! Code: ${L.code}`;
    if (navigator.share) navigator.share({ title: 'Thulla Party', text, url: link }).catch(() => {});
    else copyText(`${text}\n${link}`).then(() => toast('Invite link copied!'));
  };
  if (isHost) {
    $$('.add-bot').forEach((b) => (b.onclick = hostAddBot));
    $$('.rm').forEach((b) => (b.onclick = () => (sfx('click'), hostRemove(Number(b.dataset.i)))));
    bindChips(screen, hostSetStake);
    const start = $('.start');
    if (canStart) bindBetButton(start, () => L.stake, (s) => `<span class="bl">Start game · bet ${coins(s)}</span>`, () => (sfx('click'), hostStart()));
  } else {
    const rb = $('.ready-btn');
    if (rb)
      rb.onclick = () => {
        sfx(rb.dataset.r === '1' ? 'bet' : 'click');
        rb.disabled = true;
        app.conn && app.conn.send({ t: 'ready', ready: rb.dataset.r === '1' });
      };
  }
}

function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).catch(() => fallbackCopy(t));
  return Promise.resolve(fallbackCopy(t));
}

function fallbackCopy(t) {
  const ta = document.createElement('textarea');
  ta.value = t;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    /* ignore */
  }
  ta.remove();
}

// ------------------------------------------------------------------ rooms: client
function joinDialog(prefill = '') {
  const m = modal(`
    <h2>Join a room</h2>
    <p class="m-text">Ask your friend for their room code.</p>
    <input class="code-in" maxlength="8" placeholder="CODE" autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Room code" value="${esc(prefill)}" autofocus />
    <button class="btn cyan xl go">Join 🚀</button>
    <p class="err" role="alert"></p>`);
  const input = $('.code-in', m.el);
  input.addEventListener('input', () => (input.value = cleanCode(input.value)));
  let busy = false;
  const go = async () => {
    if (busy) return;
    const code = cleanCode(input.value);
    if (code.length < 4) return ($('.err', m.el).textContent = 'Enter the room code');
    busy = true;
    const btn = $('.go', m.el);
    btn.disabled = true;
    btn.innerHTML = '<span class="mini-spin" aria-hidden="true"></span> Connecting…';
    $('.err', m.el).textContent = '';
    try {
      await joinByCode(code);
      m.close();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Join 🚀';
      $('.err', m.el).textContent = e.message;
      sfx('deny');
    }
    busy = false;
  };
  $('.go', m.el).onclick = go;
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
}

function hello() {
  const p = store.profile();
  return { name: p.name, avatar: p.avatar, coins: p.coins, pid: p.pid };
}

async function joinByCode(code) {
  const conn = await joinRoom(code, hello(), { onMessage: clientOnMessage, onClose: clientOnClose });
  teardownGame();
  app.mode = 'client';
  app.conn = conn;
  app.lobby = { code, stake: 0, seats: [], you: 0 };
  setActive(getActive() && getActive().code === code ? getActive() : null);
  screen.innerHTML = '<div class="lobby screen-in"><div class="loading-state"><div class="spinner" role="status"></div><div class="waiting big">Joining room…</div></div></div>';
}

function clientOnMessage(msg) {
  if (app.mode !== 'client') return;
  switch (msg.t) {
    case 'lobby': {
      const prevStake = app.lobby ? app.lobby.stake : 0;
      if (app.table && !msg.inGame) {
        if (app.resultsModal) app.resultsModal.close();
        teardownGame();
        toast('Back in the room');
      }
      app.lobby = { code: msg.code, stake: msg.stake, seats: msg.seats, you: msg.you };
      if (prevStake && prevStake !== msg.stake && !app.table) sfx('pop');
      if (!msg.inGame) renderLobby();
      break;
    }
    case 'ev':
      if ((msg.ev.type === 'deal' || msg.ev.type === 'sync') && !app.table) {
        closeModals();
        mountTable({
          onPlay: (card) => app.conn && app.conn.send({ t: 'play', card }),
          onEmote: (e) => app.conn && app.conn.send({ t: 'emote', e }),
        });
      }
      if (app.table) deliverToMe(msg.ev);
      break;
    case 'settle': {
      // Result of a game that finished while we were disconnected.
      const act = getActive();
      if (act && act.code === app.lobby.code && !app.table) {
        app.stakeInPlay = act.stake;
        app.mySeat = msg.seat;
        const before = store.profile().coins;
        settleGame(msg.ev);
        const got = store.profile().coins - before;
        toast(got > 0 ? `The game you dropped out of finished — you got ${coins(got)}` : "The game you dropped out of finished — you were the Bhabhi 😭", got > 0 ? 'gold' : '', 4000);
        renderLobby();
      }
      break;
    }
    case 'notice':
      toast(esc(String(msg.text).slice(0, 140)));
      break;
    case 'emote':
      if (ALLOWED_EMOTES.has(msg.e) || typeof msg.e === 'string') app.table && app.table.showEmote(msg.seat, String(msg.e).slice(0, 24));
      break;
    case 'kick':
      app.leaving = true;
      app.conn && app.conn.close();
      app.conn = null;
      setActive(null);
      closeModals();
      showHome();
      modal(`<div class="empty-state"><div class="es-ico" aria-hidden="true">🚪</div><h2>Can't join</h2><p class="m-text">${esc(msg.reason)}</p></div>`);
      app.leaving = false;
      break;
    case 'closed':
      hostGone('The host closed the room.');
      break;
    default:
  }
}

function clientOnClose() {
  if (app.leaving || app.mode !== 'client' || app.reconnecting) return;
  reconnect();
}

/** The connection dropped: try to get back into the same room for ~30s. */
async function reconnect() {
  const code = app.lobby && app.lobby.code;
  if (!code) return hostGone('Lost connection to the room.');
  app.reconnecting = true;
  app.conn = null;
  const m = modal(
    `<div class="empty-state"><div class="spinner" role="status"></div><h2>Reconnecting…</h2>
    <p class="m-text">Your connection dropped. ${app.table ? 'A computer player is covering your cards until you are back.' : 'Trying to get you back into the room.'}</p></div>
    <button class="btn ghost give-up">Leave</button>`,
    { dismiss: false, cls: 'reconnect' },
  );
  let giveUp = false;
  $('.give-up', m.el).onclick = () => {
    giveUp = true;
    m.close();
  };
  const until = Date.now() + 30000;
  while (!giveUp && Date.now() < until && app.mode === 'client') {
    try {
      const conn = await joinRoom(code, hello(), { onMessage: clientOnMessage, onClose: clientOnClose, timeoutMs: 8000 });
      if (giveUp || app.mode !== 'client') {
        conn.close();
        break;
      }
      app.conn = conn;
      app.reconnecting = false;
      m.close();
      toast("You're back! 👋", 'gold');
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  app.reconnecting = false;
  m.close();
  if (app.mode === 'client') hostGone(giveUp ? 'You left the room.' : "Couldn't reconnect to the room.");
}

function hostGone(text) {
  if (app.mode !== 'client') return;
  const refund = app.stakeInPlay;
  if (refund) store.addCoins(refund); // the game can't finish for us: give the bet back
  app.stakeInPlay = 0;
  setActive(null);
  app.leaving = true;
  app.conn && app.conn.close();
  app.conn = null;
  closeModals();
  showHome();
  modal(`<div class="empty-state"><div class="es-ico" aria-hidden="true">📡</div><h2>Room closed</h2><p class="m-text">${esc(text)}${refund ? ` Your ${coins(refund)} bet was returned.` : ''}</p></div>`);
  app.leaving = false;
}

// ------------------------------------------------------------------ boot
function applyAudioPrefs(p) {
  setSoundEnabled(p.sound);
  setMusicEnabled(p.music);
  setVolumes({ sfx: p.sfxVol, music: p.musicVol });
}

function setupRotateScreen() {
  const r = $('#rotate');
  if (!r) return;
  try {
    if (sessionStorage.getItem('thullaparty.portrait') === '1') document.body.classList.add('allow-portrait');
  } catch {
    /* ignore */
  }
  const fs = $('.rot-fs', r);
  if (fs && (document.fullscreenEnabled || document.webkitFullscreenEnabled) && !platform.active) {
    fs.hidden = false;
    fs.onclick = toggleFullscreen;
  }
  $('.rot-anyway', r).onclick = () => {
    document.body.classList.add('allow-portrait');
    try {
      sessionStorage.setItem('thullaparty.portrait', '1');
    } catch {
      /* ignore */
    }
  };
}

let lastOops = 0;
function oops() {
  if (Date.now() - lastOops < 8000) return;
  lastOops = Date.now();
  toast('Something went wrong. If the game looks stuck, go back to the home screen.', 'bad', 4000);
}

async function boot() {
  store.load();
  applyAudioPrefs(store.profile());
  store.onChange((p) => {
    applyAudioPrefs(p);
    updateHomeCoins();
    if (app.table) app.table.updateSound();
  });
  initFx($('#fx'));
  window.addEventListener('error', (e) => {
    if (e.filename && e.filename.includes(location.host)) oops();
  });
  window.addEventListener('unhandledrejection', oops);
  // Friends can't be warned if the host closes the tab, so try to tell them.
  window.addEventListener('pagehide', () => {
    if (app.room) app.room.close();
  });
  window.__tpBooted = true;
  await initPlatform({ onMute: setExternalMute });
  platform.loadingStop();
  setupRotateScreen();
  showHome();
  const room = cleanCode(params.get('room') || platform.inviteRoom());
  const act = getActive();
  if (room) joinDialog(room);
  else if (act && act.code) {
    const ok = await confirmBox(`You were playing in room <b>${esc(act.code)}</b> with a ${coins(act.stake)} bet. Jump back in?`, 'Rejoin', { title: 'Rejoin your game?', no: 'No thanks', danger: false });
    if (ok) joinDialog(act.code);
    else setActive(null);
  }
  window.__tp = app; // for debugging and tests
}

boot();
