// Match host: runs the authoritative game and feeds every seat its events.
//
// The same class runs solo games (you + computer players) and friend rooms.
// Each seat gets events through a `deliver(seatIndex, event)` callback; the
// UI never touches the engine directly, so local and online play look and
// behave identically.

import { createGame, playCard, legalMoves } from './engine.js';
import { chooseCard, Memory } from './bot.js';

export const TURN_SECONDS = 25;

const PACE = {
  deal: 2600,
  play: 750,
  clean: 1500,
  thulla: 2300,
  out: 900,
};

export class HostMatch {
  /**
   * @param {object} o
   * @param {Array<{name:string, avatar:string, kind:'human'|'bot'}>} o.seats
   * @param {number} o.stake
   * @param {(seat:number, ev:object) => void} o.deliver
   */
  constructor({ seats, stake, deliver, speed = 1 }) {
    this.seats = seats.map((s) => ({ ...s }));
    this.stake = stake;
    this.deliver = deliver;
    this.speed = speed;
    this.timers = new Set();
    this.dead = false;
    this.st = null;
    this.mem = null;
    this.turnTimer = 0;
    this.botLevel = seats.map(() => 0.72 + Math.random() * 0.25);
  }

  later(ms, fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.dead) fn();
    }, ms / this.speed);
    this.timers.add(id);
    return id;
  }

  destroy() {
    this.dead = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  broadcast(ev) {
    for (let i = 0; i < this.seats.length; i++) this.deliver(i, ev);
  }

  start(seed) {
    const n = this.seats.length;
    this.st = createGame(n, seed);
    this.mem = new Memory(n);
    const seatsInfo = this.seats.map(({ name, avatar, kind }) => ({ name, avatar, kind }));
    for (let i = 0; i < n; i++) {
      this.deliver(i, {
        type: 'deal',
        you: i,
        seats: seatsInfo,
        stake: this.stake,
        hand: this.st.hands[i].slice(),
        counts: this.st.hands.map((h) => h.length),
        turn: this.st.turn,
      });
    }
    this.later(PACE.deal, () => this.announceTurn());
  }

  /** Tell everyone whose turn it is, then let a bot move or start the clock. */
  announceTurn(ev = null) {
    const st = this.st;
    if (st.phase !== 'play') return;
    const seat = st.turn;
    const human = this.seats[seat].kind === 'human';
    const deadline = human ? Date.now() + TURN_SECONDS * 1000 : 0;
    this.broadcast({ type: 'turn', seat, newTrick: ev ? !!ev.newTrick : st.trick.plays.length === 0, deadline, seconds: human ? TURN_SECONDS : 0 });
    clearTimeout(this.turnTimer);
    if (human) {
      this.turnTimer = this.later(TURN_SECONDS * 1000 + 400, () => this.autoPlay(seat));
    } else {
      const think = 350 + Math.random() * 500 + (st.trick.plays.length === 0 ? 250 : 0);
      this.later(think, () => this.botMove(seat));
    }
  }

  botMove(seat) {
    const st = this.st;
    if (st.phase !== 'play' || st.turn !== seat) return;
    const card = chooseCard(st, seat, this.mem, this.botLevel[seat]);
    this.apply(seat, card);
  }

  autoPlay(seat) {
    const st = this.st;
    if (!st || st.phase !== 'play' || st.turn !== seat) return;
    const card = chooseCard(st, seat, this.mem, 1);
    this.apply(seat, card, true);
  }

  /** A human seat wants to play a card. Returns false if it wasn't allowed. */
  submit(seat, card) {
    const st = this.st;
    if (!st || st.phase !== 'play' || st.turn !== seat) return false;
    if (!legalMoves(st, seat).includes(card)) return false;
    this.apply(seat, card);
    return true;
  }

  apply(seat, card, auto = false) {
    clearTimeout(this.turnTimer);
    const suitBefore = this.st.trick.suit;
    const events = playCard(this.st, seat, card);
    let wait = PACE.play;
    let turnEv = null;
    for (const ev of events) {
      if (ev.type === 'play') {
        this.mem.observe(ev, suitBefore);
        this.broadcast({ ...ev, auto });
      } else if (ev.type === 'turn') {
        turnEv = ev; // announced after the pause below
      } else {
        this.mem.observe(ev);
        if (ev.type === 'thulla') wait = Math.max(wait, PACE.thulla);
        if (ev.type === 'clean') wait = Math.max(wait, PACE.clean);
        if (ev.type === 'out') wait += PACE.out;
        if (ev.type === 'over') {
          this.broadcast({ ...ev, payouts: this.payouts(ev.loser), stake: this.stake });
          continue;
        }
        this.broadcast(ev);
      }
    }
    if (this.st.phase === 'play') this.later(wait, () => this.announceTurn(turnEv));
  }

  /** Everyone except the Bhabhi gets double their bet back; the Bhabhi gets nothing. */
  payouts(loser) {
    return this.seats.map((_, i) => (i === loser ? 0 : this.stake * 2));
  }

  /** A player left mid-game: a computer player takes over their seat. */
  replaceWithBot(seat) {
    const s = this.seats[seat];
    if (!s || s.kind === 'bot') return;
    s.kind = 'bot';
    s.left = true;
    this.broadcast({ type: 'seat', seat, kind: 'bot', left: true });
    if (this.st && this.st.phase === 'play' && this.st.turn === seat) {
      clearTimeout(this.turnTimer);
      this.later(600, () => this.botMove(seat));
    }
  }
}
