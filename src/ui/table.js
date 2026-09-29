// The game table: seats, the card fan, the trick in the middle and every
// animation. It is driven purely by the event stream from the match host,
// so it works the same for solo games and friend rooms.

import { makeCard, suitSvg, SUIT_NAME } from './cards.js';
import { sortHand, suitOf, rankOf, rankLabel, START_CARD } from '../engine.js';
import { sfx, buzz } from '../audio.js';
import { confetti, sparks, coinShower, rectCenter, motion } from './fx.js';
import * as store from '../store.js';

const EMOTES = ['😂', '😡', '😎', '😭', '🔥', '👏', '🤣', '😱'];
const PHRASES = ['Thulla time! 😈', 'Oops 😅', 'Good game!', 'Hurry up ⏰', 'Nooo! 😭', 'Too easy 😎'];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class TableView {
  constructor(root, { onPlay, onEmote, onLeave, onGameOver, speed = 1 }) {
    this.root = root;
    this.onPlay = onPlay;
    this.onEmote = onEmote;
    this.onLeave = onLeave;
    this.onGameOver = onGameOver;
    this.speed = speed;
    this.queue = [];
    this.busy = false;
    this.dead = false;
    this.locked = false;
    this.handEls = new Map();
    this.resetState();
    this.build();
    this.resizeHandler = () => this.layout();
    window.addEventListener('resize', this.resizeHandler);
    this.unsub = store.onChange(() => this.updateCoins());
  }

  resetState() {
    this.seats = [];
    this.you = 0;
    this.n = 0;
    this.hand = [];
    this.counts = [];
    this.out = [];
    this.places = [];
    this.trick = { suit: null, plays: [] };
    this.firstTrick = true;
    this.turn = -1;
    this.discarded = 0;
    this.stake = 0;
  }

  destroy() {
    this.dead = true;
    window.removeEventListener('resize', this.resizeHandler);
    clearInterval(this.tickTimer);
    this.unsub && this.unsub();
    this.root.innerHTML = '';
  }

  // ------------------------------------------------------------------ DOM
  build() {
    this.root.innerHTML = `
      <div class="table-screen">
        <header class="t-top">
          <button class="icon-btn t-leave" aria-label="Leave game">✕</button>
          <div class="pill pot"><span class="coin-ico"></span><span class="pot-v">0</span><small>BET</small></div>
          <div class="pill coins-pill"><span class="coin-ico"></span><b class="my-coins">0</b></div>
          <button class="icon-btn t-sound" aria-label="Sound"></button>
        </header>
        <div class="felt-wrap">
          <div class="felt">
            <div class="felt-ring"></div>
            <div class="felt-logo">THULLA<br/>PARTY</div>
            <div class="discard"><div class="pile"></div><span class="disc-n">0</span></div>
            <div class="trick"></div>
            <div class="suit-lead"></div>
          </div>
          <div class="seats"></div>
        </div>
        <div class="hint"></div>
        <div class="hand-area">
          <div class="me-bar">
            <div class="seat me" data-rel="0">
              <div class="av-wrap"><svg class="timer" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/></svg><div class="av"></div></div>
              <div class="badge"></div>
            </div>
            <div class="me-name"></div>
            <button class="icon-btn emote-btn" aria-label="Emotes">😀</button>
          </div>
          <div class="hand"></div>
        </div>
        <div class="emote-tray" hidden>
          <div class="em-row">${EMOTES.map((e) => `<button class="em" data-e="${e}">${e}</button>`).join('')}</div>
          <div class="em-row phrases">${PHRASES.map((p) => `<button class="em ph" data-e="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        </div>
        <div class="banner" aria-live="polite"></div>
        <div class="fly-layer"></div>
      </div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      screen: q('.table-screen'),
      felt: q('.felt'),
      feltWrap: q('.felt-wrap'),
      seats: q('.seats'),
      trick: q('.trick'),
      discard: q('.discard'),
      pile: q('.pile'),
      discN: q('.disc-n'),
      hand: q('.hand'),
      handArea: q('.hand-area'),
      hint: q('.hint'),
      banner: q('.banner'),
      fly: q('.fly-layer'),
      mySeat: q('.seat.me'),
      meName: q('.me-name'),
      pot: q('.pot-v'),
      coins: q('.my-coins'),
      sound: q('.t-sound'),
      tray: q('.emote-tray'),
      suitLead: q('.suit-lead'),
    };
    q('.t-leave').addEventListener('click', () => this.onLeave());
    this.el.sound.addEventListener('click', () => {
      store.setPref('sound', !store.profile().sound);
      this.updateSound();
    });
    q('.emote-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.el.tray.hidden = !this.el.tray.hidden;
    });
    this.el.tray.addEventListener('click', (e) => {
      const b = e.target.closest('.em');
      if (!b) return;
      this.el.tray.hidden = true;
      this.onEmote(b.dataset.e);
    });
    this.el.screen.addEventListener('click', (e) => {
      if (!this.el.tray.hidden && !e.target.closest('.emote-tray, .emote-btn')) this.el.tray.hidden = true;
    });
    this.el.hand.addEventListener('click', (e) => {
      const c = e.target.closest('.card');
      if (c) this.tryPlay(c.dataset.card, c);
    });
    this.updateSound();
    this.updateCoins();
  }

  updateSound() {
    const on = store.profile().sound;
    this.el.sound.textContent = on ? '🔊' : '🔇';
  }

  updateCoins() {
    if (this.el) this.el.coins.textContent = store.profile().coins.toLocaleString();
  }

  // ------------------------------------------------------------------ geometry
  relOf(seat) {
    return (seat - this.you + this.n) % this.n;
  }

  angleOf(seat) {
    return ((90 + (this.relOf(seat) * 360) / this.n) * Math.PI) / 180;
  }

  seatEl(seat) {
    if (seat === this.you) return this.el.mySeat;
    return this.el.seats.querySelector(`.seat[data-seat="${seat}"]`);
  }

  layout() {
    if (!this.n) return;
    const wrap = this.el.feltWrap.getBoundingClientRect();
    const felt = this.el.felt.getBoundingClientRect();
    const cx = felt.left + felt.width / 2 - wrap.left;
    const cy = felt.top + felt.height / 2 - wrap.top;
    const rx = felt.width / 2 + 6;
    const ry = felt.height / 2 + 4;
    for (let s = 0; s < this.n; s++) {
      if (s === this.you) continue;
      const el = this.seatEl(s);
      const a = this.angleOf(s);
      let x = cx + Math.cos(a) * rx;
      let y = cy + Math.sin(a) * ry;
      // Keep seats on screen.
      x = Math.max(44, Math.min(wrap.width - 44, x));
      y = Math.max(40, Math.min(wrap.height - 30, y));
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
    this.layoutHand(false);
  }

  /** Where a seat's card lands in the middle, as % of the felt. */
  slotFor(seat) {
    const a = this.angleOf(seat);
    const j = () => (Math.random() - 0.5) * 0.05;
    return { x: 50 + (Math.cos(a) * 0.2 + j()) * 100, y: 50 + (Math.sin(a) * 0.24 + j()) * 100, r: (Math.random() - 0.5) * 30 };
  }

  feltPoint(pct) {
    const f = this.el.felt.getBoundingClientRect();
    return { x: f.left + (pct.x / 100) * f.width, y: f.top + (pct.y / 100) * f.height };
  }

  // ------------------------------------------------------------------ seats
  renderSeats() {
    this.el.seats.innerHTML = '';
    for (let s = 0; s < this.n; s++) {
      if (s === this.you) continue;
      const info = this.seats[s];
      const d = document.createElement('div');
      d.className = 'seat';
      d.dataset.seat = s;
      d.innerHTML = `
        <div class="av-wrap"><svg class="timer" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/></svg><div class="av">${info.avatar}</div>
          <div class="cnt"><i></i><b>0</b></div></div>
        <div class="nm">${esc(info.name)}${info.kind === 'bot' ? ' <small>BOT</small>' : ''}</div>
        <div class="badge"></div>`;
      d.style.setProperty('--hue', String((s * 67 + 280) % 360));
      this.el.seats.appendChild(d);
    }
    const me = this.seats[this.you];
    this.el.mySeat.dataset.seat = this.you;
    this.el.mySeat.querySelector('.av').textContent = me.avatar;
    this.el.meName.innerHTML = `${esc(me.name)} <span class="me-count"></span>`;
    this.layout();
  }

  setCount(seat, n) {
    this.counts[seat] = n;
    const el = this.seatEl(seat);
    if (seat === this.you) {
      const mc = this.el.meName.querySelector('.me-count');
      if (mc) mc.textContent = n ? `· ${n} cards` : '';
      return;
    }
    const b = el && el.querySelector('.cnt b');
    if (b) b.textContent = n;
    if (el) el.classList.toggle('empty', n === 0);
  }

  setTurn(seat, seconds = 0) {
    this.turn = seat;
    for (const el of this.root.querySelectorAll('.seat')) el.classList.remove('turn', 'urgent');
    clearInterval(this.tickTimer);
    const el = seat >= 0 ? this.seatEl(seat) : null;
    if (!el) return;
    el.classList.add('turn');
    const circle = el.querySelector('.timer circle');
    if (circle) {
      circle.style.transition = 'none';
      circle.style.strokeDashoffset = '0';
      if (seconds > 0) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            circle.style.transition = `stroke-dashoffset ${seconds}s linear`;
            circle.style.strokeDashoffset = '289';
          }),
        );
        const end = Date.now() + seconds * 1000;
        this.tickTimer = setInterval(() => {
          const left = (end - Date.now()) / 1000;
          if (left <= 6) el.classList.add('urgent');
          if (seat === this.you && left <= 5 && left > 0) sfx('tick');
          if (left <= 0) clearInterval(this.tickTimer);
        }, 1000);
      }
    }
  }

  badge(seat, html, cls) {
    const el = this.seatEl(seat);
    if (!el) return;
    const b = el.querySelector('.badge');
    b.className = `badge show ${cls || ''}`;
    b.innerHTML = html;
  }

  // ------------------------------------------------------------------ hand
  legalCards() {
    const h = this.hand;
    if (this.turn !== this.you || this.out[this.you]) return [];
    if (!this.trick.plays.length) return this.firstTrick && h.includes(START_CARD) ? [START_CARD] : h.slice();
    const f = h.filter((c) => suitOf(c) === this.trick.suit);
    return f.length ? f : h.slice();
  }

  renderHand(newCards = []) {
    this.hand = sortHand(this.hand);
    const keep = new Set(this.hand);
    for (const [id, el] of this.handEls) {
      if (!keep.has(id)) {
        el.remove();
        this.handEls.delete(id);
      }
    }
    for (const id of this.hand) {
      if (!this.handEls.has(id)) {
        const el = makeCard(id, 'in-hand');
        if (newCards.includes(id)) el.classList.add('fresh');
        this.handEls.set(id, el);
        this.el.hand.appendChild(el);
        setTimeout(() => el.classList.remove('fresh'), 1400);
      }
    }
    // DOM order = visual order so overlaps stack correctly.
    for (const id of this.hand) this.el.hand.appendChild(this.handEls.get(id));
    this.layoutHand(true);
    this.setCount(this.you, this.hand.length);
    this.refreshPlayable();
  }

  layoutHand(animate = true) {
    const els = this.hand.map((id) => this.handEls.get(id)).filter(Boolean);
    const n = els.length;
    if (!n) return;
    const W = this.el.hand.clientWidth;
    const cw = els[0].offsetWidth || 70;
    const step = n > 1 ? Math.min(cw * 0.66, (W - cw - 8) / (n - 1)) : 0;
    const total = cw + step * (n - 1);
    const start = (W - total) / 2;
    const mid = (n - 1) / 2;
    const spread = Math.min(2.2, 26 / Math.max(n, 1));
    els.forEach((el, i) => {
      const off = i - mid;
      const rot = off * spread;
      const lift = Math.min(12, Math.abs(off) * Math.abs(off) * 0.22);
      el.style.transition = animate ? '' : 'none';
      el.style.left = `${start + i * step}px`;
      el.style.setProperty('--rot', `${rot}deg`);
      el.style.setProperty('--dy', `${lift}px`);
      el.style.zIndex = String(i + 1);
    });
    if (!animate) requestAnimationFrame(() => els.forEach((el) => (el.style.transition = '')));
  }

  refreshPlayable() {
    const myTurn = this.turn === this.you && !this.locked;
    const legal = new Set(myTurn ? this.legalCards() : []);
    for (const [id, el] of this.handEls) {
      el.classList.toggle('playable', legal.has(id));
      el.classList.toggle('dim', myTurn && !legal.has(id));
    }
    this.el.handArea.classList.toggle('my-turn', myTurn);
    this.updateHint();
  }

  updateHint() {
    const h = this.el.hint;
    let txt = '';
    let cls = '';
    if (this.out[this.you]) {
      txt = "You're safe! Watch who ends up as the Bhabhi 👀";
      cls = 'safe';
    } else if (this.turn === this.you) {
      cls = 'go';
      const s = this.trick.suit;
      if (!this.trick.plays.length) {
        txt = this.firstTrick && this.hand.includes(START_CARD) ? 'Your turn — start with the Ace of Spades!' : 'Your lead! Play any card';
      } else if (this.hand.some((c) => suitOf(c) === s)) {
        txt = `Your turn — follow ${suitSvg(s, 'inline')} ${SUIT_NAME[s]}`;
      } else if (this.firstTrick) {
        txt = `No ${SUIT_NAME[s]} — play any card (no thulla on the first trick)`;
      } else {
        txt = `No ${SUIT_NAME[s]}! Play any card to <b>THULLA</b> 😈`;
        cls = 'go thulla-hint';
      }
    } else if (this.turn >= 0 && this.seats[this.turn]) {
      txt = `${esc(this.seats[this.turn].name)} is thinking…`;
    }
    h.className = `hint ${cls}`;
    h.innerHTML = txt;
  }

  tryPlay(card, el) {
    if (this.turn !== this.you || this.locked || this.dead) return;
    if (!this.legalCards().includes(card)) {
      sfx('deny');
      el.classList.remove('nope');
      void el.offsetWidth;
      el.classList.add('nope');
      return;
    }
    this.locked = true;
    el.classList.add('picked');
    this.refreshPlayable();
    sfx('click');
    this.onPlay(card);
    clearTimeout(this.unlockTimer);
    this.unlockTimer = setTimeout(() => {
      // The host didn't accept it (e.g. connection hiccup): let them try again.
      if (this.locked && this.hand.includes(card)) {
        this.locked = false;
        el.classList.remove('picked');
        this.refreshPlayable();
      }
    }, 4000);
  }

  // ------------------------------------------------------------------ flying cards
  fly({ id = null, from, to, r0 = 0, r1 = 0, s0 = 1, s1 = 1, dur = 380, cls = '', keep = false, ease = 'cubic-bezier(.2,.85,.25,1)' }) {
    const el = makeCard(id, `flying ${cls}`);
    this.el.fly.appendChild(el);
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const tf = (p, r, s) => `translate(${p.x - w / 2}px, ${p.y - h / 2}px) rotate(${r}deg) scale(${s})`;
    const d = Math.max(1, dur * this.speed);
    const anim = el.animate([{ transform: tf(from, r0, s0) }, { transform: tf(to, r1, s1) }], { duration: d, easing: ease, fill: 'forwards' });
    return anim.finished.then(() => {
      if (!keep) el.remove();
      return el;
    });
  }

  handCenter() {
    const r = this.el.hand.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  seatPoint(seat) {
    if (seat === this.you) return this.handCenter();
    return rectCenter(this.seatEl(seat).querySelector('.av'));
  }

  placeTrickCard(id, slot, cls = '') {
    const el = makeCard(id, `in-trick ${cls}`);
    el.style.left = `${slot.x}%`;
    el.style.top = `${slot.y}%`;
    el.style.setProperty('--rot', `${slot.r}deg`);
    this.el.trick.appendChild(el);
    return el;
  }

  renderPile() {
    const n = Math.min(7, Math.ceil(this.discarded / 4));
    this.el.pile.innerHTML = Array.from({ length: n }, (_, i) => `<i style="--i:${i}"></i>`).join('');
    this.el.discN.textContent = this.discarded;
    this.el.discard.classList.toggle('has', this.discarded > 0);
  }

  showSuitLead(s) {
    const el = this.el.suitLead;
    if (!s) {
      el.classList.remove('show');
      return;
    }
    el.className = `suit-lead show s-${s}`;
    el.innerHTML = suitSvg(s);
  }

  async showBanner(html, cls = '', ms = 1100) {
    const b = this.el.banner;
    b.className = `banner ${cls}`;
    b.innerHTML = `<div class="b-inner">${html}</div>`;
    void b.offsetWidth;
    b.classList.add('show');
    await wait(ms * this.speed);
    b.classList.remove('show');
  }

  shake(el = this.el.feltWrap) {
    if (motion.reduced) return;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  // ------------------------------------------------------------------ events
  push(ev) {
    this.queue.push(ev);
    if (!this.busy) this.run();
  }

  async run() {
    this.busy = true;
    while (this.queue.length && !this.dead) {
      const ev = this.queue.shift();
      const saved = this.speed;
      if (this.queue.length > 3) this.speed = Math.min(this.speed, 0.3); // catch up if behind
      try {
        await this.handle(ev);
      } catch (err) {
        console.error('[table]', err);
      }
      this.speed = saved;
    }
    this.busy = false;
  }

  async handle(ev) {
    switch (ev.type) {
      case 'deal':
        return this.onDeal(ev);
      case 'turn':
        return this.onTurn(ev);
      case 'play':
        return this.onPlayEv(ev);
      case 'clean':
        return this.onClean(ev);
      case 'thulla':
        return this.onThulla(ev);
      case 'out':
        return this.onOut(ev);
      case 'over':
        return this.onOver(ev);
      case 'seat':
        return this.onSeat(ev);
      case 'emote':
        return this.showEmote(ev.seat, ev.e);
      default:
    }
  }

  async onDeal(ev) {
    this.resetState();
    this.seats = ev.seats;
    this.n = ev.seats.length;
    this.you = ev.you;
    this.stake = ev.stake;
    this.counts = Array(this.n).fill(0);
    this.out = Array(this.n).fill(false);
    this.places = Array(this.n).fill(0);
    this.el.pot.textContent = ev.stake.toLocaleString();
    this.el.trick.innerHTML = '';
    for (const el of this.handEls.values()) el.remove();
    this.handEls.clear();
    this.renderSeats();
    this.renderPile();
    this.showSuitLead(null);
    this.el.hint.innerHTML = 'Dealing…';
    this.el.hint.className = 'hint';

    const center = rectCenter(this.el.felt);
    const mine = ev.hand.slice();
    const total = ev.counts.reduce((a, b) => a + b, 0);
    const got = Array(this.n).fill(0);
    const flights = [];
    const stagger = Math.max(8, 1500 / total) * this.speed;
    let order = 0;
    for (let k = 0; k < total; k++) {
      const seat = k % this.n;
      if (got[seat] >= ev.counts[seat]) continue;
      got[seat]++;
      const i = order++;
      const delay = i * stagger;
      flights.push(
        wait(delay).then(async () => {
          if (this.dead) return;
          if (i % 2 === 0) sfx('deal', i);
          await this.fly({ from: center, to: this.seatPoint(seat), r0: Math.random() * 40 - 20, r1: seat === this.you ? 0 : Math.random() * 60 - 30, s1: seat === this.you ? 1 : 0.45, dur: 330 });
          if (seat === this.you) {
            const c = mine.shift();
            if (c) {
              this.hand.push(c);
              this.renderHand();
            }
          } else {
            this.setCount(seat, this.counts[seat] + 1);
          }
        }),
      );
    }
    await Promise.all(flights);
    for (let s = 0; s < this.n; s++) this.setCount(s, ev.counts[s]);
    this.hand = ev.hand.slice();
    this.renderHand();
    const starter = ev.turn;
    await this.showBanner(
      starter === this.you ? `You have the ${suitSvg('S', 'inline')}A — you start!` : `${esc(this.seats[starter].name)} has the ${suitSvg('S', 'inline')}A`,
      'info',
      900,
    );
  }

  onTurn(ev) {
    this.setTurn(ev.seat, ev.seconds || 0);
    if (ev.seat === this.you) {
      this.locked = false;
      sfx('turn');
      if (store.profile().vibrate) buzz(30);
    }
    this.refreshPlayable();
  }

  async onPlayEv(ev) {
    const { seat, card } = ev;
    const isMe = seat === this.you;
    if (this.trick.plays.length === 0) {
      this.trick.suit = suitOf(card);
      this.showSuitLead(this.trick.suit);
    }
    this.trick.plays.push({ seat, card });
    this.setTurn(-1);
    const slot = this.slotFor(seat);
    const to = this.feltPoint(slot);
    let from;
    let s0 = 0.5;
    if (isMe) {
      const el = this.handEls.get(card);
      from = el ? rectCenter(el) : this.handCenter();
      s0 = 1;
      if (el) {
        el.remove();
        this.handEls.delete(card);
      }
      this.hand = this.hand.filter((c) => c !== card);
      this.locked = false;
      clearTimeout(this.unlockTimer);
      this.renderHand();
    } else {
      from = this.seatPoint(seat);
      this.setCount(seat, Math.max(0, this.counts[seat] - 1));
    }
    this.refreshPlayable();
    if (ev.thulla) {
      sfx('card');
      await this.fly({ id: card, from, to, r0: 0, r1: slot.r * 2 + 25, s0, s1: 1.9, dur: 300, cls: 'hot' });
      const el = this.placeTrickCard(card, slot, 'thulla-card');
      sfx('thulla');
      buzz([40, 30, 80]);
      this.shake(this.el.screen);
      sparks(to.x, to.y, '#ff4fa3', 40);
      sparks(to.x, to.y, '#ffd23f', 30);
      el.animate([{ transform: `translate(-50%,-50%) rotate(${slot.r}deg) scale(1.9)` }, { transform: `translate(-50%,-50%) rotate(${slot.r}deg) scale(1)` }], { duration: 260 * this.speed, easing: 'cubic-bezier(.3,1.6,.5,1)' });
      await this.showBanner(`<span class="big">THULLA!</span><small>${esc(this.seats[seat].name)} can't follow ${suitSvg(this.trick.suit, 'inline')}</small>`, 'thulla', 900);
    } else {
      sfx('card');
      await this.fly({ id: card, from, to, r0: isMe ? 0 : Math.random() * 40 - 20, r1: slot.r, s0, s1: 1, dur: 360 });
      this.placeTrickCard(card, slot);
      if (ev.offSuit) this.flashNote(seat, 'No spades');
    }
  }

  flashNote(seat, text) {
    const p = seat === this.you ? this.handCenter() : this.seatPoint(seat);
    const n = document.createElement('div');
    n.className = 'float-note';
    n.textContent = text;
    n.style.left = `${p.x}px`;
    n.style.top = `${p.y - 40}px`;
    this.el.fly.appendChild(n);
    setTimeout(() => n.remove(), 1400);
  }

  async onClean(ev) {
    await wait(450 * this.speed);
    const winnerEl = this.seatEl(ev.winner);
    const cards = [...this.el.trick.querySelectorAll('.card')];
    const target = rectCenter(this.el.discard);
    sfx('clean');
    await Promise.all(
      cards.map((el, i) => {
        const c = rectCenter(el);
        const dx = target.x - c.x;
        const dy = target.y - c.y;
        const r = el.style.getPropertyValue('--rot') || '0deg';
        return el
          .animate(
            [
              { transform: `translate(-50%,-50%) rotate(${r})`, opacity: 1 },
              { transform: `translate(-50%,-50%) translate(${dx}px, ${dy}px) rotate(${parseFloat(r) + 90}deg) scale(.4)`, opacity: 0.3 },
            ],
            { duration: 480 * this.speed, delay: i * 50 * this.speed, easing: 'cubic-bezier(.5,0,.4,1)', fill: 'forwards' },
          )
          .finished.then(() => el.remove());
      }),
    );
    this.discarded += ev.cards.length;
    this.renderPile();
    this.trick = { suit: null, plays: [] };
    this.firstTrick = false;
    this.showSuitLead(null);
    if (winnerEl) {
      winnerEl.classList.remove('lead-pulse');
      void winnerEl.offsetWidth;
      winnerEl.classList.add('lead-pulse');
    }
  }

  async onThulla(ev) {
    await wait(250 * this.speed);
    const picker = ev.picker;
    const isMe = picker === this.you;
    const dest = this.seatPoint(picker);
    const cards = [...this.el.trick.querySelectorAll('.card')];
    sfx('pickup');
    await Promise.all(
      cards.map((el, i) => {
        const id = el.dataset.card;
        const from = rectCenter(el);
        el.remove();
        return wait(i * 70 * this.speed).then(() => this.fly({ id, from, to: dest, r0: 0, r1: isMe ? 0 : 200, s1: isMe ? 1 : 0.4, dur: 520 }));
      }),
    );
    this.trick = { suit: null, plays: [] };
    this.firstTrick = false;
    this.showSuitLead(null);
    const plus = `+${ev.cards.length}`;
    if (isMe) {
      this.hand = this.hand.concat(ev.cards);
      this.renderHand(ev.cards);
      this.shake(this.el.handArea);
      this.flashNote(this.you, `${plus} cards 😩`);
      buzz(120);
    } else {
      this.setCount(picker, ev.left);
      const el = this.seatEl(picker);
      if (el) {
        el.classList.remove('picked-up');
        void el.offsetWidth;
        el.classList.add('picked-up');
      }
      this.flashNote(picker, `${plus} cards!`);
    }
  }

  async onOut(ev) {
    this.out[ev.seat] = true;
    this.places[ev.seat] = ev.place;
    this.setCount(ev.seat, 0);
    const p = this.seatPoint(ev.seat);
    const place = ['1st', '2nd', '3rd', '4th', '5th'][ev.place - 1];
    this.badge(ev.seat, `SAFE · ${place}`, 'safe');
    this.seatEl(ev.seat).classList.add('is-out');
    sfx('safe');
    if (ev.seat === this.you) {
      confetti(innerWidth / 2, innerHeight * 0.6, 140, 1.2);
      coinShower(innerWidth / 2, innerHeight * 0.55, 30);
      buzz([30, 40, 30]);
      this.updateHint();
      await this.showBanner(`<span class="big">YOU'RE SAFE!</span><small>${place} out of the game 🎉</small>`, 'safe', 1300);
    } else {
      confetti(p.x, p.y, 45, 0.9);
      await wait(350 * this.speed);
    }
  }

  async onOver(ev) {
    this.setTurn(-1);
    this.el.handArea.classList.remove('my-turn');
    const loser = ev.loser;
    const el = this.seatEl(loser);
    this.badge(loser, 'BHABHI 😭', 'bhabhi');
    if (el) el.classList.add('is-bhabhi');
    this.el.screen.classList.add('game-over');
    const me = loser === this.you;
    if (me) {
      sfx('lose');
      buzz([200, 80, 200]);
    } else {
      sfx('win');
      const p = this.seatPoint(this.you);
      coinShower(p.x, p.y - 60, 40);
    }
    await this.showBanner(
      me ? `<span class="big">BHABHI!</span><small>You were left holding the cards 😭</small>` : `<span class="big">BHABHI!</span><small>${esc(this.seats[loser].name)} is the Bhabhi!</small>`,
      'bhabhi',
      1700,
    );
    this.el.screen.classList.remove('game-over');
    if (this.onGameOver) this.onGameOver(ev);
  }

  onSeat(ev) {
    if (ev.left && this.seats[ev.seat]) {
      this.seats[ev.seat].kind = 'bot';
      const nm = this.seatEl(ev.seat)?.querySelector('.nm');
      if (nm) nm.innerHTML = `${esc(this.seats[ev.seat].name)} <small>BOT</small>`;
      this.flashNote(ev.seat, 'Left — a bot took over');
    }
  }

  showEmote(seat, e) {
    if (seat == null || seat < 0 || seat >= this.n) return;
    const p = seat === this.you ? rectCenter(this.el.mySeat) : this.seatPoint(seat);
    const b = document.createElement('div');
    const isEmoji = [...e].length <= 2;
    b.className = `emote-bubble ${isEmoji ? 'emoji' : ''}`;
    b.textContent = e;
    b.style.left = `${p.x}px`;
    b.style.top = `${p.y - 50}px`;
    this.el.fly.appendChild(b);
    sfx('pop');
    setTimeout(() => b.remove(), 2400);
  }
}

export { rankLabel, rankOf };
