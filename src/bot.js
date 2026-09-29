// Computer players.
//
// Bots only use information a real player would have: their own hand, the
// cards on the table, and what they've seen happen (who couldn't follow which
// suit, which cards have been discarded). A Memory object tracks that from the
// public event stream.

import { suitOf, rankOf, legalMoves, SUITS, activeSeats } from './engine.js';

export class Memory {
  constructor(n) {
    this.n = n;
    this.voids = Array.from({ length: n }, () => new Set());
    this.gone = new Set(); // cards discarded in clean tricks
  }

  observe(ev, trickSuit) {
    if (ev.type === 'play' && ev.offSuit && trickSuit) this.voids[ev.seat].add(trickSuit);
    if (ev.type === 'clean') ev.cards.forEach((c) => this.gone.add(c));
    if (ev.type === 'thulla') {
      // The picker now holds these suits again.
      for (const c of ev.cards) this.voids[ev.picker].delete(suitOf(c));
    }
  }
}

/** Choose a card. `level` 0..1 adds a little human-like imperfection. */
export function chooseCard(st, seat, mem, level = 0.85) {
  const legal = legalMoves(st, seat);
  if (legal.length <= 1) return legal[0];
  const hand = st.hands[seat];
  const trick = st.trick;
  const bySuit = {};
  for (const s of SUITS) bySuit[s] = hand.filter((c) => suitOf(c) === s);
  const sloppy = Math.random() > level;

  // ---- Leading a new trick
  if (trick.plays.length === 0) {
    const others = activeSeats(st).filter((s) => s !== seat);
    let best = null;
    let bestScore = -Infinity;
    for (const s of SUITS) {
      const mine = bySuit[s];
      if (!mine.length) continue;
      const voidCount = others.filter((o) => mem.voids[o].has(s)).length;
      // How many cards of this suit could still be out there?
      let unseen = 0;
      for (let r = 2; r <= 14; r++) {
        const c = `${r}${s}`;
        if (!mem.gone.has(c) && !hand.includes(c)) unseen++;
      }
      const low = mine[0];
      let score = 0;
      score -= voidCount * 40; // someone will thulla us
      score += Math.min(unseen, others.length * 2) * 4; // others likely to follow
      score -= rankOf(low) * 1.6; // lead low so someone else is highest
      if (mine.length === 1) score += 10; // empties a suit, setting up our own thullas
      if (unseen === 0) score -= 80; // nobody else holds this suit: they'd all thulla us
      score += Math.random() * (sloppy ? 30 : 6);
      if (score > bestScore) {
        bestScore = score;
        best = low;
      }
    }
    return best || legal[0];
  }

  const suit = trick.suit;
  const canFollow = legal.every((c) => suitOf(c) === suit);

  // ---- Can't follow: throw a thulla (or any card on the first trick)
  if (!canFollow) {
    let best = legal[0];
    let bestScore = -Infinity;
    for (const c of legal) {
      const s = suitOf(c);
      // Dump high cards, especially from short suits.
      const score = rankOf(c) * 2 + (6 - Math.min(6, bySuit[s].length)) * 2 + Math.random() * (sloppy ? 8 : 2);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  // ---- Following suit
  const topRank = Math.max(...trick.plays.filter((p) => suitOf(p.card) === suit).map((p) => rankOf(p.card)));
  const played = new Set(trick.plays.map((p) => p.seat));
  const later = trick.participants.filter((s) => s !== seat && !played.has(s));
  const lastToPlay = later.length === 0;
  const threat = later.some((s) => mem.voids[s].has(suit)) || st.trickNo > 6;

  if (lastToPlay || st.firstTrick) {
    // Clean trick guaranteed: get rid of our highest card of the suit.
    return legal[legal.length - 1];
  }
  const under = legal.filter((c) => rankOf(c) < topRank);
  if (under.length && (threat || !sloppy)) {
    // Stay under the current top card so a thulla hits someone else.
    return under[under.length - 1];
  }
  // Every card we have beats the top card (or we're gambling): if a thulla is
  // likely we'll be picking up anyway, so dump the highest.
  return threat ? legal[legal.length - 1] : sloppy ? legal[0] : legal[legal.length - 1];
}
