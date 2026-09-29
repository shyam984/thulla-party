// Thulla / Bhabhi rules engine.
//
// Pure game logic with no DOM or network code, so the host, the computer
// players and the tests all share exactly the same rules.
//
// Rules:
//  - 3 to 5 players, one 52-card deck, all cards dealt out.
//  - Whoever holds the Ace of Spades starts by playing it.
//  - Everyone must follow the suit that was led if they can.
//  - If everyone follows suit, the trick is discarded ("clean") and whoever
//    played the highest card of that suit leads next.
//  - If someone can't follow suit they play any other card: a THULLA. The trick
//    stops at once and whoever played the highest card of the led suit picks up
//    every card in the trick, then leads next.
//  - First trick exception: nobody can be thulla'd. A player without spades may
//    play any card, but the trick is simply discarded.
//  - Players who run out of cards are safe. The last player still holding cards
//    is the Bhabhi and loses.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
export const START_CARD = '14S';

export const suitOf = (c) => c[c.length - 1];
export const rankOf = (c) => parseInt(c, 10);
export const rankLabel = (r) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[r] || String(r);

export function fullDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(`${r}${s}`);
  return d;
}

/** Small seeded RNG so a host can reproduce a deal from its seed. */
export function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };
/** Sort a hand by suit (alternating colours) then rank. */
export function sortHand(hand) {
  return hand.slice().sort((a, b) => SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)] || rankOf(a) - rankOf(b));
}

export function createGame(n, seed = (Math.random() * 2 ** 32) >>> 0) {
  if (n < 3 || n > 5) throw new Error('Thulla needs 3 to 5 players');
  const deck = shuffle(fullDeck(), rng(seed));
  const hands = Array.from({ length: n }, () => []);
  deck.forEach((c, i) => hands[i % n].push(c));
  const starter = hands.findIndex((h) => h.includes(START_CARD));
  return {
    n,
    seed,
    hands: hands.map(sortHand),
    out: Array(n).fill(false),
    finishOrder: [],
    turn: starter,
    trick: { leader: starter, suit: null, plays: [], participants: activeSeats({ n, out: Array(n).fill(false) }) },
    firstTrick: true,
    trickNo: 0,
    discarded: 0,
    phase: 'play',
    loser: null,
  };
}

export function activeSeats(st) {
  const r = [];
  for (let i = 0; i < st.n; i++) if (!st.out[i]) r.push(i);
  return r;
}

export function legalMoves(st, seat) {
  if (st.phase !== 'play' || seat !== st.turn) return [];
  const hand = st.hands[seat];
  if (st.trick.plays.length === 0) {
    if (st.firstTrick && hand.includes(START_CARD)) return [START_CARD];
    return hand.slice();
  }
  const follow = hand.filter((c) => suitOf(c) === st.trick.suit);
  return follow.length ? follow : hand.slice();
}

function highestOfSuit(plays, suit) {
  let best = null;
  for (const p of plays) {
    if (suitOf(p.card) !== suit) continue;
    if (!best || rankOf(p.card) > rankOf(best.card)) best = p;
  }
  return best;
}

function nextActiveAfter(st, seat, exclude = new Set()) {
  for (let k = 1; k <= st.n; k++) {
    const s = (seat + k) % st.n;
    if (!st.out[s] && !exclude.has(s)) return s;
  }
  return -1;
}

/**
 * Apply a move. Mutates `st` and returns the list of events that happened,
 * in order, for the UI and the network to replay.
 */
export function playCard(st, seat, card) {
  const legal = legalMoves(st, seat);
  if (!legal.includes(card)) throw new Error(`Illegal move ${card} by seat ${seat}`);
  const ev = [];
  const hand = st.hands[seat];
  hand.splice(hand.indexOf(card), 1);
  const trick = st.trick;
  if (trick.plays.length === 0) trick.suit = suitOf(card);
  const offSuit = suitOf(card) !== trick.suit;
  const thulla = offSuit && !st.firstTrick;
  trick.plays.push({ seat, card });
  ev.push({ type: 'play', seat, card, thulla, offSuit, left: hand.length });

  if (thulla) {
    const top = highestOfSuit(trick.plays, trick.suit);
    const picker = top.seat;
    const cards = trick.plays.map((p) => p.card);
    st.hands[picker] = sortHand(st.hands[picker].concat(cards));
    ev.push({ type: 'thulla', seat, picker, cards, left: st.hands[picker].length });
    finishTrick(st, ev, trick.plays, picker, true);
    return ev;
  }

  const played = new Set(trick.plays.map((p) => p.seat));
  const waiting = trick.participants.filter((s) => !played.has(s));
  if (waiting.length === 0) {
    const top = highestOfSuit(trick.plays, trick.suit);
    st.discarded += trick.plays.length;
    ev.push({ type: 'clean', winner: top.seat, cards: trick.plays.map((p) => p.card) });
    finishTrick(st, ev, trick.plays, top.seat, false);
    return ev;
  }
  // Next participant clockwise who hasn't played yet.
  let nxt = seat;
  for (let k = 1; k <= st.n; k++) {
    const s = (seat + k) % st.n;
    if (waiting.includes(s)) {
      nxt = s;
      break;
    }
  }
  st.turn = nxt;
  ev.push({ type: 'turn', seat: nxt });
  return ev;
}

function finishTrick(st, ev, plays, leadSeat, wasThulla) {
  st.trickNo += 1;
  st.firstTrick = false;
  // Anyone who has emptied their hand is safe, in the order they played.
  for (const p of plays) {
    if (!st.out[p.seat] && st.hands[p.seat].length === 0) {
      st.out[p.seat] = true;
      st.finishOrder.push(p.seat);
      ev.push({ type: 'out', seat: p.seat, place: st.finishOrder.length });
    }
  }
  const active = activeSeats(st);
  if (active.length <= 1) {
    // Normally exactly one player is left holding cards. In the rare case that
    // everyone runs out on the same clean trick, the trick winner is the Bhabhi.
    const loser = active.length === 1 ? active[0] : leadSeat;
    if (active.length === 0) {
      st.finishOrder = st.finishOrder.filter((s) => s !== loser);
    }
    st.out[loser] = false;
    st.phase = 'over';
    st.loser = loser;
    st.turn = -1;
    ev.push({ type: 'over', loser, order: st.finishOrder.slice() });
    return;
  }
  let leader = leadSeat;
  if (st.out[leader]) leader = nextActiveAfter(st, leader);
  st.turn = leader;
  st.trick = { leader, suit: null, plays: [], participants: active };
  ev.push({ type: 'turn', seat: leader, newTrick: true, wasThulla });
}

/** Public view of the game for one seat: own hand, everyone's card counts. */
export function viewFor(st, seat) {
  return {
    n: st.n,
    hand: seat >= 0 ? st.hands[seat].slice() : [],
    counts: st.hands.map((h) => h.length),
    out: st.out.slice(),
    finishOrder: st.finishOrder.slice(),
    turn: st.turn,
    trick: { leader: st.trick.leader, suit: st.trick.suit, plays: st.trick.plays.map((p) => ({ ...p })) },
    firstTrick: st.firstTrick,
    discarded: st.discarded,
    phase: st.phase,
    loser: st.loser,
  };
}
