// Match host: runs the authoritative game and feeds every seat its events.
//
// The same class runs solo games (you + computer players) and friend rooms.
// Each seat gets events through a `deliver(seatIndex, event)` callback; the
// UI never touches the engine directly, so local and online play look and
// behave identically.
//
// Seat status (humans only):
//   'here'     connected and playing
//   'away'     connection dropped; a bot plays for them until they come back
//   'quit'     left the game for good; a bot plays the rest of their hand
//   'leftSafe' was already safe and left with their bet returned

import { createGame, playCard, legalMoves, viewFor } from './engine.js';
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
    this.seats = seats.map((s) => ({ ...s, status: s.kind === 'bot' ? 'bot' : 'here' }));
    this.stake = stake;
    this.deliver = deliver;
    this.speed = speed;
    this.timers = new Set();
    this.dead = false;
    this.st = null;
    this.mem = null;
    this.turnTimer = 0;
    this.deadline = 0;
    this.overEv = null;
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

  /** Does a computer play this seat right now? */
  botControls(seat) {
    return this.seats[seat].status !== 'here';
  }

  publicSeats() {
    return this.seats.map(({ name, avatar, kind, status }) => ({ name, avatar, kind, status }));
  }

  start(seed) {
    const n = this.seats.length;
    this.st = createGame(n, seed);
    this.mem = new Memory(n);
    const seatsInfo = this.publicSeats();
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
    if (!st || st.phase !== 'play') return;
    const seat = st.turn;
    const human = !this.botControls(seat);
    this.deadline = human ? Date.now() + (TURN_SECONDS * 1000) / this.speed : 0;
    this.broadcast({ type: 'turn', seat, newTrick: ev ? !!ev.newTrick : st.trick.plays.length === 0, deadline: this.deadline, seconds: human ? TURN_SECONDS / this.speed : 0 });
    clearTimeout(this.turnTimer);
    if (human) {
      this.turnTimer = this.later(TURN_SECONDS * 1000 + 400, () => this.autoPlay(seat));
    } else {
      const think = 350 + Math.random() * 500 + (st.trick.plays.length === 0 ? 250 : 0);
      this.turnTimer = this.later(think, () => this.botMove(seat));
    }
  }

  botMove(seat) {
    const st = this.st;
    if (st.phase !== 'play' || st.turn !== seat) return;
    if (!this.botControls(seat)) return this.announceTurn(); // they came back in time
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
    if (this.botControls(seat)) return false;
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
          this.overEv = { ...ev, payouts: this.payouts(ev.loser), stake: this.stake, statuses: this.seats.map((s) => s.status) };
          this.broadcast(this.overEv);
          continue;
        }
        this.broadcast(ev);
      }
    }
    if (this.st.phase === 'play') this.later(wait, () => this.announceTurn(turnEv));
  }

  /**
   * What each seat gets back at the end. Safe players get double their bet,
   * the Bhabhi gets nothing, and anyone who left safely already had their bet
   * returned (shown as the bet, so their net change is zero).
   */
  payouts(loser) {
    return this.seats.map((s, i) => (i === loser ? 0 : s.status === 'leftSafe' ? this.stake : this.stake * 2));
  }

  isSafe(seat) {
    return !!(this.st && this.st.out[seat] && this.st.phase === 'play');
  }

  setStatus(seat, status) {
    const s = this.seats[seat];
    if (!s || s.kind === 'bot' || s.status === status) return;
    // Leaving for good (or safely) is final; a dropped connection is not.
    if ((s.status === 'quit' || s.status === 'leftSafe') && status !== 'leftSafe') return;
    s.status = status;
    this.broadcast({ type: 'seat', seat, status });
    if (this.st && this.st.phase === 'play' && this.st.turn === seat) {
      clearTimeout(this.turnTimer);
      if (status === 'here') this.announceTurn();
      else this.turnTimer = this.later(600, () => this.botMove(seat));
    }
  }

  /** A player lost their connection: a bot covers until they return. */
  markAway(seat) {
    if (this.seats[seat] && this.seats[seat].status === 'here') this.setStatus(seat, 'away');
  }

  /** A player left for good. Returns 'safe' if they were already out (bet returned), else 'quit'. */
  leave(seat) {
    const s = this.seats[seat];
    if (!s || s.kind === 'bot') return null;
    if (s.status === 'leftSafe') return 'safe';
    if (this.isSafe(seat)) {
      this.setStatus(seat, 'leftSafe');
      return 'safe';
    }
    if (!this.st || this.st.phase !== 'play') return 'done';
    this.setStatus(seat, 'quit');
    return 'quit';
  }

  /** Can this seat be picked up again by a reconnecting player? */
  canRejoin(seat) {
    const s = this.seats[seat];
    return !!s && s.status === 'away';
  }

  rejoin(seat) {
    if (!this.canRejoin(seat)) return false;
    this.setStatus(seat, 'here');
    return true;
  }

  /** Everything a seat needs to redraw the table after reconnecting. */
  snapshot(seat) {
    const v = viewFor(this.st, seat);
    return {
      type: 'sync',
      you: seat,
      seats: this.publicSeats(),
      stake: this.stake,
      hand: v.hand,
      counts: v.counts,
      out: v.out,
      finishOrder: v.finishOrder,
      trick: v.trick,
      firstTrick: v.firstTrick,
      discarded: v.discarded,
      turn: v.turn,
      phase: v.phase,
      seconds: this.deadline ? Math.max(0, (this.deadline - Date.now()) / 1000) : 0,
    };
  }
}
