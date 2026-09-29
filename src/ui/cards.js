// Card faces and backs, drawn with SVG so they stay crisp at any size.

import { suitOf, rankOf, rankLabel } from '../engine.js';

const SUIT_PATH = {
  H: 'M50 90C22 68 5 51 5 31 5 16 16 6 29 6c10 0 17 6 21 14 4-8 11-14 21-14 13 0 24 10 24 25 0 20-17 37-45 59Z',
  D: 'M50 3 89 50 50 97 11 50Z',
  S: 'M50 5c10 17 43 35 43 56 0 14-11 22-22 22-8 0-14-4-17-9 1 9 5 16 13 21H33c8-5 12-12 13-21-3 5-9 9-17 9C18 83 7 75 7 61 7 40 40 22 50 5Z',
  C: 'M50 8a19 19 0 0 1 16 29 19 19 0 1 1-8 36c1 9 5 16 12 21H30c7-5 11-12 12-21a19 19 0 1 1-8-36A19 19 0 0 1 50 8Z',
};

export const SUIT_NAME = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };

export function suitSvg(s, cls = '') {
  return `<svg class="suit s-${s} ${cls}" viewBox="0 0 100 100" aria-hidden="true"><path d="${SUIT_PATH[s]}"/></svg>`;
}

const FACE_ICON = {
  11: '<path d="M30 70 50 30 70 70Z" opacity=".25"/><circle cx="50" cy="38" r="10"/><path d="M34 80c2-14 8-22 16-22s14 8 16 22Z"/>',
  12: '<path d="M28 44l8 10 7-16 7 16 7-16 7 16 8-10-4 22H32Z"/><circle cx="50" cy="30" r="5"/>',
  13: '<path d="M26 40l10 12 7-20 7 20 7-20 7 20 10-12-5 26H31Z"/><rect x="31" y="70" width="38" height="7" rx="3"/>',
};

export function cardHtml(id) {
  const s = suitOf(id);
  const r = rankOf(id);
  const label = rankLabel(r);
  let center;
  if (r >= 11 && r <= 13) {
    center = `<div class="c-face-art"><svg viewBox="0 0 100 100" class="crown">${FACE_ICON[r]}</svg><span class="c-big">${label}</span></div>`;
  } else if (r === 14) {
    center = `<div class="c-ace">${suitSvg(s, 'big')}</div>`;
  } else {
    center = `<div class="c-pips">${suitSvg(s, 'mid')}<span class="c-num">${label}</span></div>`;
  }
  return `<div class="c-face s-${s}">
    <div class="c-corner tl"><b>${label}</b>${suitSvg(s)}</div>
    ${center}
    <div class="c-corner br"><b>${label}</b>${suitSvg(s)}</div>
  </div>`;
}

export function makeCard(id, extra = '') {
  const el = document.createElement('div');
  if (id) {
    el.className = `card ${extra}`.trim();
    el.dataset.card = id;
    el.innerHTML = cardHtml(id);
    el.setAttribute('aria-label', `${rankLabel(rankOf(id))} of ${SUIT_NAME[suitOf(id)]}`);
  } else {
    el.className = `card back ${extra}`.trim();
    el.innerHTML = '<div class="c-back"><span></span></div>';
  }
  return el;
}

/** A card with both faces, for flip animations. */
export function makeFlipCard(id) {
  const el = document.createElement('div');
  el.className = 'card flip';
  el.innerHTML = `<div class="flip-inner"><div class="flip-front">${cardHtml(id)}</div><div class="flip-back"><div class="c-back"><span></span></div></div></div>`;
  return el;
}
