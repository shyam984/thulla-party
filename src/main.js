// Thulla Party — app shell: home screen, coins, solo games and friend rooms.

import * as store from './store.js';
import { HostMatch } from './match.js';
import { TableView } from './ui/table.js';
import { hostRoom, joinRoom, cleanCode } from './net.js';
import { initFx, confetti, coinShower, rectCenter } from './ui/fx.js';
import { sfx, setSoundEnabled, setMusicEnabled, playMusic, duckMusic, unlockAudio } from './audio.js';
import { suitSvg } from './ui/cards.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => Math.round(n).toLocaleString();
const params = new URLSearchParams(location.search);
const SPEED = Number(params.get('speed')) || 1; // testing aid

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
  leaving: false,
  homeTimer: 0,
};

// ------------------------------------------------------------------ helpers
function coinIco() {
  return '<span class="coin-ico"></span>';
}

function toast(text, cls = '') {
  const t = document.createElement('div');
  t.className = `toast ${cls}`;
  t.innerHTML = text;
  $('#toast-root').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2700);
}

function modal(html, { cls = '', dismiss = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = `modal-wrap ${cls}`;
  wrap.innerHTML = `<div class="modal">${dismiss ? '<button class="icon-btn m-close" aria-label="Close">✕</button>' : ''}${html}</div>`;
  modalRoot.appendChild(wrap);
  const close = () => {
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 220);
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
  return { el: wrap, close };
}

function closeModals() {
  modalRoot.innerHTML = '';
}

function confirmBox(text, yes, no = 'Cancel') {
  return new Promise((resolve) => {
    const m = modal(`<h2>Are you sure?</h2><p class="m-text">${text}</p>
      <div class="row"><button class="btn ghost no">${no}</button><button class="btn danger yes">${yes}</button></div>`);
    $('.no', m.el).onclick = () => (m.close(), resolve(false));
    $('.yes', m.el).onclick = () => (m.close(), resolve(true));
  });
}

function stakeChips(selected, onPick) {
  const coins = store.profile().coins;
  return `<div class="chips">${store.STAKES.map(
    (s) => `<button class="chip ${s === selected ? 'on' : ''}" data-stake="${s}" ${s > coins ? 'disabled' : ''}>${coinIco()}${fmt(s)}</button>`,
  ).join('')}</div>`;
}

function bindChips(root, onPick) {
  root.querySelectorAll('.chip').forEach((b) =>
    b.addEventListener('click', () => {
      sfx('click');
      root.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
      b.classList.add('on');
      onPick(Number(b.dataset.stake));
    }),
  );
}

function bestAffordable(stake) {
  const coins = store.profile().coins;
  if (stake <= coins) return stake;
  const ok = store.STAKES.filter((s) => s <= coins);
  return ok.length ? ok[ok.length - 1] : 0;
}

// ------------------------------------------------------------------ home
function showHome() {
  teardownGame();
  app.mode = null;
  const p = store.profile();
  screen.innerHTML = `
    <div class="home">
      <div class="bg-cards" aria-hidden="true">${['14S', '13H', '12D', '11C', '10H', '14D'].map((c, i) => `<i style="--i:${i}">${suitSvg(c.slice(-1))}</i>`).join('')}</div>
      <header class="home-top">
        <button class="profile-chip"><span class="av">${p.avatar}</span><span class="nm">${esc(p.name)}</span><span class="edit">✎</span></button>
        <div class="pill coins-pill big"><span class="coin-ico"></span><b class="home-coins">${fmt(p.coins)}</b></div>
      </header>
      <div class="logo" aria-label="Thulla Party">
        <div class="logo-cards">${['S', 'H', 'D', 'C'].map((s, i) => `<span class="lc s-${s}" style="--i:${i}">${suitSvg(s)}</span>`).join('')}</div>
        <h1><span class="l1">THULLA</span><span class="l2">PARTY</span></h1>
        <p class="tag">Don't get caught holding the cards!</p>
      </div>
      <div class="free-card">
        <div class="fc-left">
          <div class="fc-title">🎁 Free coins</div>
          <div class="fc-bar"><i></i></div>
          <div class="fc-sub"></div>
        </div>
        <button class="btn gold collect">Collect</button>
      </div>
      <div class="menu">
        <button class="btn primary xl play-solo"><span class="bi">🤖</span> Play vs Computer</button>
        <div class="row">
          <button class="btn pink lg create-room"><span class="bi">👥</span> Create Room</button>
          <button class="btn cyan lg join-room"><span class="bi">🔑</span> Join Room</button>
        </div>
      </div>
      <div class="stats">
        <div><b>${fmt(p.stats.played)}</b><span>Games</span></div>
        <div><b>${fmt(p.stats.safe)}</b><span>Safe</span></div>
        <div><b>${fmt(p.stats.bhabhi)}</b><span>Bhabhi</span></div>
        <div><b>${fmt(p.stats.bestStreak)}</b><span>Best streak</span></div>
      </div>
      <div class="home-foot">
        <button class="link how">How to play</button>
        <button class="link snd">${p.sound ? '🔊 Sound on' : '🔇 Sound off'}</button>
        <button class="link mus">${p.music ? '🎵 Music on' : '🎵 Music off'}</button>
      </div>
    </div>`;
  $('.profile-chip').onclick = () => (sfx('click'), editProfile());
  $('.play-solo').onclick = () => (sfx('click'), soloSetup());
  $('.create-room').onclick = () => (sfx('click'), createRoom());
  $('.join-room').onclick = () => (sfx('click'), joinDialog());
  $('.how').onclick = () => (sfx('click'), howToPlay());
  $('.snd').onclick = () => {
    store.setPref('sound', !store.profile().sound);
    showHome();
  };
  $('.mus').onclick = () => {
    store.setPref('music', !store.profile().music);
    showHome();
  };
  $('.collect').onclick = (e) => {
    const amt = store.collectFree();
    if (amt > 0) {
      sfx('coins');
      const c = rectCenter(e.currentTarget);
      coinShower(c.x, c.y, 36);
      toast(`+${fmt(amt)} free coins!`, 'gold');
      updateHomeCoins();
    } else {
      sfx('deny');
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
  const el = $('.home-coins');
  if (el) el.textContent = fmt(store.profile().coins);
}

function updateFree() {
  const card = $('.free-card');
  if (!card) return clearInterval(app.homeTimer);
  const amt = store.freeCoins();
  const prog = store.freeProgress();
  $('.fc-bar i', card).style.width = `${Math.round(prog * 100)}%`;
  const btn = $('.collect', card);
  btn.disabled = amt <= 0;
  btn.textContent = amt > 0 ? `Collect +${fmt(amt)}` : 'Collect';
  card.classList.toggle('ready', amt > 0);
  const full = amt >= store.FREE_CAP_MIN * store.FREE_PER_MIN;
  const secs = Math.max(0, Math.ceil(60 - prog * 60));
  $('.fc-sub', card).textContent = full ? 'Full! Collect your coins' : `+${store.FREE_PER_MIN} every minute · next in 0:${String(secs % 60).padStart(2, '0')}`;
}

function editProfile() {
  const p = store.profile();
  const m = modal(`
    <h2>Your profile</h2>
    <label class="field"><span>Name</span><input class="nm-in" maxlength="14" value="${esc(p.name)}" /></label>
    <div class="av-grid">${store.AVATARS.map((a) => `<button class="av-pick ${a === p.avatar ? 'on' : ''}" data-a="${a}">${a}</button>`).join('')}</div>
    <button class="btn primary lg save">Save</button>`);
  let av = p.avatar;
  m.el.querySelectorAll('.av-pick').forEach((b) =>
    b.addEventListener('click', () => {
      sfx('pop');
      m.el.querySelectorAll('.av-pick').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      av = b.dataset.a;
    }),
  );
  $('.save', m.el).onclick = () => {
    store.setName($('.nm-in', m.el).value);
    store.setAvatar(av);
    sfx('click');
    m.close();
    if (!app.mode) showHome();
  };
}

function howToPlay() {
  modal(`
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
      <div>${coinIco()} Everyone who gets out safe wins <b>2× their bet</b></div>
      <div>😭 The Bhabhi loses their bet</div>
    </div>
    <button class="btn primary lg got-it">Let's play!</button>`).el.querySelector('.got-it').onclick = function () {
    sfx('click');
    this.closest('.modal-wrap').querySelector('.m-close').click();
  };
}

function needCoins() {
  const m = modal(`<h2>Out of coins!</h2><p class="m-text">You need at least ${coinIco()}${store.STAKES[0]} to play. Free coins build up at <b>+100 every minute</b> — collect them on the home screen.</p><button class="btn gold lg ok">OK</button>`);
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
    <div class="seg">${[3, 4, 5].map((n) => `<button class="seg-b ${n === cfg.players ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}</div>
    <div class="m-label">Your bet</div>
    ${stakeChips(cfg.stake)}
    <p class="m-hint">Get out safe to win <b class="win-amt"></b>. Be the Bhabhi and you lose your bet.</p>
    <button class="btn primary xl deal">Deal! 🃏</button>`);
  const upd = () => ($('.win-amt', m.el).innerHTML = `${coinIco()}${fmt(cfg.stake * 2)}`);
  upd();
  m.el.querySelectorAll('.seg-b').forEach((b) =>
    b.addEventListener('click', () => {
      sfx('click');
      m.el.querySelectorAll('.seg-b').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      cfg.players = Number(b.dataset.n);
    }),
  );
  bindChips(m.el, (s) => ((cfg.stake = s), upd()));
  $('.deal', m.el).onclick = () => {
    m.close();
    startSolo();
  };
}

function botSeats(count, taken = []) {
  const names = store.BOT_NAMES.filter((n) => !taken.includes(n)).sort(() => Math.random() - 0.5);
  const avs = store.AVATARS.filter((a) => !taken.includes(a)).sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => ({ name: names[i], avatar: avs[i], kind: 'bot', coins: 1000 + Math.floor(Math.random() * 9) * 500 }));
}

function startSolo() {
  const cfg = app.soloConfig;
  if (store.profile().coins < cfg.stake) return needCoins();
  teardownGame();
  app.mode = 'solo';
  const p = store.profile();
  const seats = [{ name: p.name, avatar: p.avatar, kind: 'human' }, ...botSeats(cfg.players - 1, [p.avatar])];
  mountTable({
    onPlay: (card) => app.match.submit(0, card),
    onEmote: (e) => {
      app.table.showEmote(0, e);
      botReply(seats);
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
function mountTable({ onPlay, onEmote }) {
  clearInterval(app.homeTimer);
  screen.innerHTML = '<div class="table-host"></div>';
  playMusic(true);
  app.table = new TableView($('.table-host'), {
    onPlay,
    onEmote,
    onLeave: leaveGame,
    onGameOver: showResults,
    speed: SPEED,
  });
}

/** Events for this player's seat. Handles the bet going in and paying out. */
function deliverToMe(ev) {
  if (ev.type === 'deal') {
    app.stakeInPlay = ev.stake;
    app.mySeat = ev.you;
    app.seatsInfo = ev.seats;
    store.addCoins(-ev.stake);
  }
  if (ev.type === 'over') {
    const pay = ev.payouts[app.mySeat] || 0;
    store.addCoins(pay);
    app.stakeInPlay = 0;
    const safe = ev.loser !== app.mySeat;
    store.recordResult({ safe, place: safe ? ev.order.indexOf(app.mySeat) + 1 : 0 });
    if (app.mode === 'client' && app.conn) app.conn.send({ t: 'coins', coins: store.profile().coins });
    if (app.mode === 'host') updateHostSeatCoins();
  }
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

function sendEmoteFrom(seat, e) {
  if (app.mode === 'host') hostBroadcastEmote(seat, e);
  else app.table && app.table.showEmote(seat, e);
}

function showResults(ev) {
  const seats = app.seatsInfo || [];
  const me = app.mySeat;
  const stake = ev.stake;
  const order = ev.order.concat([ev.loser]);
  const iLost = ev.loser === me;
  const rows = order
    .map((s, i) => {
      const lost = s === ev.loser;
      const place = lost ? 'BHABHI' : ['1st', '2nd', '3rd', '4th', '5th'][i];
      const delta = lost ? -stake : stake;
      return `<div class="res-row ${lost ? 'lost' : 'won'} ${s === me ? 'me' : ''}" style="--i:${i}">
        <span class="pl">${place}</span><span class="av">${seats[s] ? seats[s].avatar : '🙂'}</span>
        <span class="nm">${esc(seats[s] ? seats[s].name : 'Player')}${s === me ? ' <small>YOU</small>' : ''}</span>
        <span class="dl">${delta > 0 ? '+' : '−'}${coinIco()}${fmt(Math.abs(delta))}</span></div>`;
    })
    .join('');
  duckMusic(4);
  let actions = '';
  if (app.mode === 'solo') actions = `<button class="btn ghost lg go-home">🚪 Leave table</button><button class="btn primary lg again">Play again</button>`;
  else if (app.mode === 'host') actions = `<button class="btn ghost lg go-home">🚪 Leave &amp; close room</button><button class="btn primary lg lobby">Back to room</button>`;
  else actions = `<button class="btn ghost lg go-home">🚪 Leave room</button><div class="waiting">Waiting for the host…</div>`;
  const m = modal(
    `<div class="res-head ${iLost ? 'lost' : 'won'}">
      <div class="res-emoji">${iLost ? '😭' : '🏆'}</div>
      <h2>${iLost ? "You're the Bhabhi!" : 'You escaped!'}</h2>
      <div class="res-delta">${iLost ? '−' : '+'}${coinIco()}<b>${fmt(stake)}</b></div>
    </div>
    <div class="res-list">${rows}</div>
    <div class="res-coins">Your coins: ${coinIco()}<b class="rc">${fmt(store.profile().coins)}</b></div>
    <div class="row">${actions}</div>`,
    { cls: 'results', dismiss: false },
  );
  if (!iLost) {
    setTimeout(() => {
      confetti(innerWidth / 2, innerHeight * 0.35, 120, 1.4);
      coinShower(innerWidth / 2, innerHeight * 0.4, 40);
    }, 250);
  }
  const home = $('.go-home', m.el);
  if (home) home.onclick = () => (sfx('click'), m.close(), leaveToHome());
  const again = $('.again', m.el);
  if (again)
    again.onclick = () => {
      sfx('click');
      m.close();
      app.soloConfig.stake = bestAffordable(app.soloConfig.stake);
      if (!app.soloConfig.stake) return (showHome(), needCoins());
      startSolo();
    };
  const lob = $('.lobby', m.el);
  if (lob) lob.onclick = () => (sfx('click'), m.close(), hostBackToLobby());
  app.resultsModal = m;
}

async function leaveGame() {
  sfx('click');
  const inPlay = app.stakeInPlay > 0;
  const msg = inPlay ? `You'll lose your ${coinIco()}${fmt(app.stakeInPlay)} bet.` : app.mode === 'host' ? 'This closes the room for everyone.' : 'Leave this game?';
  if (!(await confirmBox(msg, 'Leave'))) return;
  if (inPlay) store.recordResult({ safe: false });
  app.stakeInPlay = 0;
  leaveToHome();
}

function leaveToHome() {
  app.leaving = true;
  if (app.room) app.room.close();
  if (app.conn) app.conn.close();
  app.room = null;
  app.conn = null;
  closeModals();
  showHome();
  app.leaving = false;
}

function teardownGame() {
  if (app.match) app.match.destroy();
  if (app.table) app.table.destroy();
  playMusic(false);
  app.match = null;
  app.table = null;
}

// ------------------------------------------------------------------ rooms: host
async function createRoom() {
  const stake = bestAffordable(250);
  if (!stake) return needCoins();
  const p = store.profile();
  const wait = modal('<h2>Creating room…</h2><div class="spinner"></div>', { dismiss: false });
  try {
    app.room = await hostRoom({ onJoin: hostOnJoin, onMessage: hostOnMessage, onLeave: hostOnLeave, onError: (e) => toast(esc(e.message), 'bad') });
  } catch (e) {
    wait.close();
    return modal(`<h2>Couldn't create a room</h2><p class="m-text">${esc(e.message)}</p>`);
  }
  wait.close();
  teardownGame();
  app.mode = 'host';
  app.lobby = { code: app.room.code, stake, seats: [{ id: 'host', name: p.name, avatar: p.avatar, coins: p.coins, kind: 'human', host: true }], inGame: false };
  renderLobby();
}

function publicSeats() {
  return app.lobby.seats.map(({ name, avatar, coins, kind, host }) => ({ name, avatar, coins, kind, host: !!host }));
}

function broadcastLobby() {
  const seats = publicSeats();
  app.lobby.seats.forEach((s, i) => {
    if (s.conn) app.room.send(s.conn, { t: 'lobby', code: app.lobby.code, stake: app.lobby.stake, seats, you: i });
  });
  renderLobby();
}

function hostOnJoin(conn, hello) {
  const L = app.lobby;
  if (!L) return;
  if (L.inGame) return kick(conn, 'A game is already in progress in this room. Try again when it ends.');
  if (L.seats.length >= 5) return kick(conn, 'This room is full (5 players max).');
  L.seats.push({
    id: conn.peer,
    conn,
    name: String(hello.name || 'Player').slice(0, 14),
    avatar: store.AVATARS.includes(hello.avatar) ? hello.avatar : '🙂',
    coins: Math.max(0, Number(hello.coins) || 0),
    kind: 'human',
  });
  sfx('pop');
  toast(`${esc(hello.name || 'A friend')} joined!`);
  broadcastLobby();
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
  const i = seatIndexOf(conn);
  if (i < 0) return;
  if (msg.t === 'play' && app.match) app.match.submit(i, String(msg.card));
  if (msg.t === 'emote') hostBroadcastEmote(i, String(msg.e).slice(0, 24));
  if (msg.t === 'coins') {
    app.lobby.seats[i].coins = Math.max(0, Number(msg.coins) || 0);
    if (!app.lobby.inGame) broadcastLobby();
  }
}

function hostOnLeave(conn) {
  const L = app.lobby;
  const i = seatIndexOf(conn);
  if (!L || i < 0) return;
  const name = L.seats[i].name;
  if (L.inGame && app.match) {
    L.seats[i].conn = null;
    L.seats[i].left = true;
    app.match.replaceWithBot(i);
    toast(`${esc(name)} left — a bot took over`);
  } else {
    L.seats.splice(i, 1);
    toast(`${esc(name)} left`);
    broadcastLobby();
  }
}

function hostBroadcastEmote(seat, e) {
  if (!app.lobby) return;
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
  L.seats.push({ id: `bot-${Math.random()}`, ...botSeats(1, taken)[0] });
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

function hostStart() {
  const L = app.lobby;
  if (L.seats.length < 3) return toast('You need at least 3 players — add a bot!', 'bad');
  const poor = L.seats.filter((s) => s.kind === 'human' && s.coins < L.stake);
  if (poor.length) return toast(`${esc(poor.map((s) => s.name).join(', '))} can't afford this bet`, 'bad');
  L.inGame = true;
  const seats = L.seats.map((s) => ({ name: s.name, avatar: s.avatar, kind: s.kind === 'bot' ? 'bot' : 'human' }));
  mountTable({
    onPlay: (card) => app.match.submit(0, card),
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
  teardownGame();
  L.inGame = false;
  // Friends who left mid-game were replaced by bots; drop those seats now.
  L.seats = L.seats.filter((s) => !s.left);
  L.stake = Math.min(L.stake, bestAffordable(L.stake) || store.STAKES[0]);
  updateHostSeatCoins();
  broadcastLobby();
}

// ------------------------------------------------------------------ lobby screen (host + client)
function renderLobby() {
  if (!app.lobby || (app.table && app.mode !== 'client')) return;
  if (app.table) return; // client mid-game
  const L = app.lobby;
  const isHost = app.mode === 'host';
  const seats = isHost ? publicSeats() : L.seats;
  const link = `${location.origin}${location.pathname}?room=${L.code}`;
  const slots = [];
  for (let i = 0; i < 5; i++) {
    const s = seats[i];
    if (s) {
      const short = s.kind === 'human' && s.coins < L.stake;
      slots.push(`<div class="slot filled ${s.kind}" style="--i:${i}">
        <span class="av">${s.avatar}</span>
        <span class="nm">${esc(s.name)}${i === (isHost ? 0 : L.you) ? ' <small>YOU</small>' : ''}</span>
        <span class="tagx">${s.host ? '👑 Host' : s.kind === 'bot' ? '🤖 Bot' : ''}</span>
        <span class="cc ${short ? 'short' : ''}">${coinIco()}${s.kind === 'bot' ? '∞' : fmt(s.coins)}</span>
        ${isHost && !s.host ? `<button class="icon-btn rm" data-i="${i}" aria-label="Remove">✕</button>` : ''}
      </div>`);
    } else {
      slots.push(`<div class="slot empty" style="--i:${i}">${isHost ? '<button class="add-bot">+ Add bot</button>' : '<span>Waiting for player…</span>'}</div>`);
    }
  }
  screen.innerHTML = `
    <div class="lobby">
      <header class="home-top">
        <button class="icon-btn back" aria-label="Leave room">←</button>
        <div class="pill coins-pill"><span class="coin-ico"></span><b>${fmt(store.profile().coins)}</b></div>
      </header>
      <h2 class="lob-title">${isHost ? 'Your room' : 'Friend room'}</h2>
      <div class="code-card">
        <div class="code-label">ROOM CODE</div>
        <div class="code">${L.code.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}</div>
        <div class="row">
          <button class="btn ghost copy">📋 Copy code</button>
          <button class="btn cyan share">📨 Invite friends</button>
        </div>
      </div>
      <div class="slots">${slots.join('')}</div>
      <div class="lob-bet">
        <div class="m-label">Bet ${isHost ? '' : '(set by host)'}</div>
        ${isHost ? stakeChips(L.stake) : `<div class="bet-show">${coinIco()}<b>${fmt(L.stake)}</b></div>`}
        <p class="m-hint">Safe players win ${coinIco()}<b>${fmt(L.stake * 2)}</b> · the Bhabhi loses ${coinIco()}${fmt(L.stake)}</p>
      </div>
      ${isHost ? `<button class="btn primary xl start" ${seats.length < 3 ? 'disabled' : ''}>${seats.length < 3 ? 'Need 3+ players' : 'Start game 🃏'}</button>` : '<div class="waiting big">Waiting for the host to start…</div>'}
    </div>`;
  $('.back').onclick = async () => {
    sfx('click');
    if (await confirmBox(isHost ? 'This closes the room for everyone.' : 'Leave this room?', 'Leave')) leaveToHome();
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
    screen.querySelectorAll('.add-bot').forEach((b) => (b.onclick = hostAddBot));
    screen.querySelectorAll('.rm').forEach((b) => (b.onclick = () => (sfx('click'), hostRemove(Number(b.dataset.i)))));
    bindChips(screen, (s) => {
      L.stake = s;
      broadcastLobby();
    });
    $('.start').onclick = () => (sfx('click'), hostStart());
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
    <input class="code-in" maxlength="8" placeholder="CODE" autocomplete="off" autocapitalize="characters" value="${esc(prefill)}" />
    <button class="btn cyan xl go">Join 🚀</button>
    <p class="err"></p>`);
  const input = $('.code-in', m.el);
  input.addEventListener('input', () => (input.value = cleanCode(input.value)));
  setTimeout(() => input.focus(), 50);
  const go = async () => {
    const code = cleanCode(input.value);
    if (code.length < 4) return ($('.err', m.el).textContent = 'Enter the room code');
    const btn = $('.go', m.el);
    btn.disabled = true;
    btn.textContent = 'Joining…';
    $('.err', m.el).textContent = '';
    try {
      await joinByCode(code);
      m.close();
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Join 🚀';
      $('.err', m.el).textContent = e.message;
    }
  };
  $('.go', m.el).onclick = go;
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
}

async function joinByCode(code) {
  const p = store.profile();
  const conn = await joinRoom(code, { name: p.name, avatar: p.avatar, coins: p.coins }, { onMessage: clientOnMessage, onClose: clientOnClose });
  teardownGame();
  app.mode = 'client';
  app.conn = conn;
  app.lobby = { code, stake: 0, seats: [], you: 0 };
  screen.innerHTML = '<div class="lobby"><div class="waiting big">Connecting…</div></div>';
}

function clientOnMessage(msg) {
  if (app.mode !== 'client') return;
  switch (msg.t) {
    case 'lobby':
      if (app.table) {
        if (app.resultsModal) app.resultsModal.close();
        teardownGame();
      }
      app.lobby = { code: msg.code, stake: msg.stake, seats: msg.seats, you: msg.you };
      renderLobby();
      break;
    case 'ev':
      if (msg.ev.type === 'deal' && !app.table) {
        closeModals();
        mountTable({
          onPlay: (card) => app.conn && app.conn.send({ t: 'play', card }),
          onEmote: (e) => app.conn && app.conn.send({ t: 'emote', e }),
        });
      }
      if (app.table) deliverToMe(msg.ev);
      break;
    case 'emote':
      app.table && app.table.showEmote(msg.seat, msg.e);
      break;
    case 'kick':
      app.leaving = true;
      app.conn && app.conn.close();
      app.conn = null;
      closeModals();
      showHome();
      modal(`<h2>Can't join</h2><p class="m-text">${esc(msg.reason)}</p>`);
      app.leaving = false;
      break;
    case 'closed':
      hostGone('The host closed the room.');
      break;
    default:
  }
}

function clientOnClose() {
  if (app.leaving || app.mode !== 'client') return;
  hostGone('Lost connection to the room.');
}

function hostGone(text) {
  if (app.mode !== 'client') return;
  const refund = app.stakeInPlay;
  if (refund) store.addCoins(refund); // game never finished: give the bet back
  app.stakeInPlay = 0;
  app.leaving = true;
  app.conn && app.conn.close();
  app.conn = null;
  closeModals();
  showHome();
  modal(`<h2>Room closed</h2><p class="m-text">${esc(text)}${refund ? ` Your ${coinIco()}${fmt(refund)} bet was returned.` : ''}</p>`);
  app.leaving = false;
}

// ------------------------------------------------------------------ boot
function boot() {
  store.load();
  setSoundEnabled(store.profile().sound);
  setMusicEnabled(store.profile().music);
  store.onChange((p) => {
    setSoundEnabled(p.sound);
    setMusicEnabled(p.music);
    updateHomeCoins();
  });
  initFx($('#fx'));
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  // Friends can't be warned if the host closes the tab, so try to tell them.
  window.addEventListener('pagehide', () => {
    if (app.room) app.room.close();
  });
  showHome();
  const room = cleanCode(params.get('room'));
  if (room) joinDialog(room);
  window.__tp = app; // for debugging and tests
}

boot();
