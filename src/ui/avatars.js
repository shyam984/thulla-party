// Ten original character avatars, drawn as SVG so they stay sharp at any
// size. A player's avatar is either one of these ids ('c1'…'c10') or an emoji.

const eyes = (x1, x2, y, r = 6, pupil = '#1b0c3f') =>
  `<circle cx="${x1}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x2}" cy="${y}" r="${r}" fill="#fff"/>` +
  `<circle cx="${x1 + 1}" cy="${y + 1}" r="${r * 0.55}" fill="${pupil}"/><circle cx="${x2 + 1}" cy="${y + 1}" r="${r * 0.55}" fill="${pupil}"/>` +
  `<circle cx="${x1 + 2.2}" cy="${y - 1.2}" r="${r * 0.2}" fill="#fff"/><circle cx="${x2 + 2.2}" cy="${y - 1.2}" r="${r * 0.2}" fill="#fff"/>`;
const blush = (x1, x2, y, c = '#ff6fa3') => `<ellipse cx="${x1}" cy="${y}" rx="5" ry="3" fill="${c}" opacity=".55"/><ellipse cx="${x2}" cy="${y}" rx="5" ry="3" fill="${c}" opacity=".55"/>`;
const bg = (a, b) => `<defs><radialGradient id="g" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/>`;

export const CHARACTERS = [
  {
    id: 'c1',
    name: 'Robo Raja',
    art:
      bg('#8ff3ff', '#1b8fd6') +
      '<line x1="50" y1="14" x2="50" y2="24" stroke="#1b0c3f" stroke-width="3"/><circle cx="50" cy="12" r="5" fill="#ff3d8b"/>' +
      '<rect x="24" y="24" width="52" height="46" rx="12" fill="#e9eef7" stroke="#1b0c3f" stroke-width="3"/>' +
      '<rect x="31" y="34" width="38" height="16" rx="8" fill="#1b0c3f"/><circle cx="41" cy="42" r="4" fill="#35f5c0"/><circle cx="59" cy="42" r="4" fill="#35f5c0"/>' +
      '<rect x="38" y="56" width="24" height="6" rx="3" fill="#1b0c3f"/><rect x="41" y="57.5" width="4" height="3" fill="#ffc93c"/><rect x="48" y="57.5" width="4" height="3" fill="#ffc93c"/><rect x="55" y="57.5" width="4" height="3" fill="#ffc93c"/>' +
      '<rect x="18" y="38" width="6" height="16" rx="3" fill="#ff3d8b"/><rect x="76" y="38" width="6" height="16" rx="3" fill="#ff3d8b"/>' +
      '<path d="M30 78h40v10H30z" fill="#e9eef7" stroke="#1b0c3f" stroke-width="3"/>',
  },
  {
    id: 'c2',
    name: 'Mango Monster',
    art:
      bg('#ffe27a', '#ff8a1f') +
      '<path d="M30 30 24 12l14 12M70 30l6-18-14 12" fill="#fff4d6" stroke="#1b0c3f" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M18 62c0-24 14-38 32-38s32 14 32 38c0 16-14 26-32 26S18 78 18 62Z" fill="#ffb21f" stroke="#1b0c3f" stroke-width="3"/>' +
      '<circle cx="50" cy="50" r="13" fill="#fff" stroke="#1b0c3f" stroke-width="3"/><circle cx="52" cy="51" r="7" fill="#1b0c3f"/><circle cx="55" cy="48" r="2.5" fill="#fff"/>' +
      '<path d="M36 70q14 10 28 0" fill="#7a1f3d" stroke="#1b0c3f" stroke-width="3"/><path d="M42 72v5l4-4M58 72v5l-4-4" fill="#fff"/>' +
      blush(28, 72, 64),
  },
  {
    id: 'c3',
    name: 'Boo Buddy',
    art:
      bg('#c9b8ff', '#6a3ee8') +
      '<path d="M24 86V48c0-16 12-28 26-28s26 12 26 28v38l-7-6-6 6-7-6-6 6-7-6-6 6-6-6Z" fill="#fff" stroke="#1b0c3f" stroke-width="3" stroke-linejoin="round"/>' +
      '<ellipse cx="41" cy="48" rx="5" ry="7" fill="#1b0c3f"/><ellipse cx="59" cy="48" rx="5" ry="7" fill="#1b0c3f"/><circle cx="43" cy="45" r="2" fill="#fff"/><circle cx="61" cy="45" r="2" fill="#fff"/>' +
      '<path d="M42 62q8 6 16 0" fill="none" stroke="#1b0c3f" stroke-width="3" stroke-linecap="round"/><path d="M48 64.5q2 7 6 0" fill="#ff5b8a"/>' +
      blush(33, 67, 58),
  },
  {
    id: 'c4',
    name: 'Cool Cat',
    art:
      bg('#ff9ad0', '#c21f7a') +
      '<path d="M24 40 22 14l20 14M76 40l2-26-20 14" fill="#8a5cff" stroke="#1b0c3f" stroke-width="3" stroke-linejoin="round"/>' +
      '<ellipse cx="50" cy="56" rx="30" ry="27" fill="#8a5cff" stroke="#1b0c3f" stroke-width="3"/>' +
      '<path d="M26 46h48v3c0 7-5 11-11 11s-9-4-11-8h-4c-2 4-5 8-11 8s-11-4-11-11Z" fill="#1b0c3f"/><path d="M31 49l6 0M58 49l6 0" stroke="#35d6f5" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M47 64h6l-3 3Z" fill="#ff6fa3"/><path d="M50 67q-4 5-8 2M50 67q4 5 8 2" fill="none" stroke="#1b0c3f" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M22 64l-10-2M22 69l-10 2M78 64l10-2M78 69l10 2" stroke="#1b0c3f" stroke-width="2" stroke-linecap="round"/>',
  },
  {
    id: 'c5',
    name: 'Panda Prince',
    art:
      bg('#b6ffd9', '#18b979') +
      '<circle cx="28" cy="32" r="10" fill="#1b0c3f"/><circle cx="72" cy="32" r="10" fill="#1b0c3f"/>' +
      '<circle cx="50" cy="56" r="30" fill="#fff" stroke="#1b0c3f" stroke-width="3"/>' +
      '<ellipse cx="38" cy="54" rx="8" ry="10" fill="#1b0c3f" transform="rotate(-20 38 54)"/><ellipse cx="62" cy="54" rx="8" ry="10" fill="#1b0c3f" transform="rotate(20 62 54)"/>' +
      '<circle cx="39" cy="53" r="3.5" fill="#fff"/><circle cx="61" cy="53" r="3.5" fill="#fff"/>' +
      '<ellipse cx="50" cy="66" rx="5" ry="3.5" fill="#1b0c3f"/><path d="M45 72q5 4 10 0" fill="none" stroke="#1b0c3f" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M34 28l4-14 7 9 5-12 5 12 7-9 4 14Z" fill="#ffc93c" stroke="#1b0c3f" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="22" r="2.5" fill="#ff3d8b"/>',
  },
  {
    id: 'c6',
    name: 'Zee the Alien',
    art:
      bg('#3b2a8f', '#120828') +
      '<circle cx="18" cy="22" r="1.5" fill="#fff"/><circle cx="82" cy="30" r="1.2" fill="#fff"/><circle cx="76" cy="80" r="1.4" fill="#fff"/>' +
      '<path d="M36 22l-6-10M64 22l6-10" stroke="#1b0c3f" stroke-width="3"/><circle cx="30" cy="11" r="4" fill="#ffc93c"/><circle cx="70" cy="11" r="4" fill="#ffc93c"/>' +
      '<path d="M20 50c0-18 13-30 30-30s30 12 30 30c0 20-14 36-30 36S20 70 20 50Z" fill="#6bf57a" stroke="#1b0c3f" stroke-width="3"/>' +
      eyes(36, 64, 50, 7) +
      '<circle cx="50" cy="36" r="6" fill="#fff"/><circle cx="51" cy="37" r="3.3" fill="#1b0c3f"/>' +
      '<path d="M40 68q10 8 20 0" fill="none" stroke="#1b0c3f" stroke-width="3" stroke-linecap="round"/>',
  },
  {
    id: 'c7',
    name: 'Dino Dhol',
    art:
      bg('#ffd0a8', '#ff6a3d') +
      '<path d="M30 26l6-10 6 8 6-10 6 10 6-8 6 10" fill="#ffc93c" stroke="#1b0c3f" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M18 58c0-20 14-34 32-34s32 12 32 30v8c0 14-14 24-32 24S18 76 18 58Z" fill="#35c46a" stroke="#1b0c3f" stroke-width="3"/>' +
      eyes(38, 62, 46, 7) +
      '<path d="M28 64q22 14 44 0" fill="#fff" stroke="#1b0c3f" stroke-width="3" stroke-linejoin="round"/><path d="M34 66l3 5 3-4 3 5 3-4 3 5 3-4 3 5 3-4 3 5 3-4" fill="none" stroke="#1b0c3f" stroke-width="1.5"/>' +
      '<circle cx="44" cy="58" r="1.8" fill="#1b0c3f"/><circle cx="56" cy="58" r="1.8" fill="#1b0c3f"/>',
  },
  {
    id: 'c8',
    name: 'Queen Bee',
    art:
      bg('#fff4a8', '#ffb21f') +
      '<path d="M40 24q-6-12-14-12M60 24q6-12 14-12" fill="none" stroke="#1b0c3f" stroke-width="3" stroke-linecap="round"/><circle cx="25" cy="12" r="4" fill="#1b0c3f"/><circle cx="75" cy="12" r="4" fill="#1b0c3f"/>' +
      '<ellipse cx="22" cy="44" rx="12" ry="8" fill="#e6f7ff" opacity=".9" stroke="#1b0c3f" stroke-width="2.5" transform="rotate(-25 22 44)"/><ellipse cx="78" cy="44" rx="12" ry="8" fill="#e6f7ff" opacity=".9" stroke="#1b0c3f" stroke-width="2.5" transform="rotate(25 78 44)"/>' +
      '<clipPath id="bb"><circle cx="50" cy="56" r="28"/></clipPath><circle cx="50" cy="56" r="28" fill="#ffd23f"/>' +
      '<g clip-path="url(#bb)"><rect x="18" y="66" width="64" height="8" fill="#1b0c3f"/><rect x="18" y="80" width="64" height="8" fill="#1b0c3f"/></g>' +
      '<circle cx="50" cy="56" r="28" fill="none" stroke="#1b0c3f" stroke-width="3"/>' +
      eyes(41, 59, 50, 6) + blush(34, 66, 60) +
      '<path d="M45 60q5 4 10 0" fill="none" stroke="#1b0c3f" stroke-width="2.5" stroke-linecap="round"/>' +
      '<path d="M40 30l3-8 4 5 3-7 3 7 4-5 3 8Z" fill="#ff3d8b" stroke="#1b0c3f" stroke-width="2" stroke-linejoin="round"/>',
  },
  {
    id: 'c9',
    name: 'Ninja Nimbu',
    art:
      bg('#a8f0ff', '#2f8fe0') +
      '<circle cx="50" cy="52" r="32" fill="#2a1463" stroke="#1b0c3f" stroke-width="3"/>' +
      '<path d="M22 44h56v16H22z" fill="#ffe0bd"/><path d="M22 44h56M22 60h56" stroke="#1b0c3f" stroke-width="3"/>' +
      '<path d="M32 50l10 3M68 50l-10 3" stroke="#1b0c3f" stroke-width="3" stroke-linecap="round"/><circle cx="39" cy="54" r="3" fill="#1b0c3f"/><circle cx="61" cy="54" r="3" fill="#1b0c3f"/>' +
      '<path d="M20 36h60" stroke="#e8174c" stroke-width="7"/><path d="M78 36l14-6M78 36l12 8" stroke="#e8174c" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M44 72l6 4 6-4" fill="none" stroke="#6a5a9a" stroke-width="2"/>',
  },
  {
    id: 'c10',
    name: 'Wizard Owl',
    art:
      bg('#d8c9ff', '#7c5cff') +
      '<ellipse cx="50" cy="62" rx="28" ry="26" fill="#b0773f" stroke="#1b0c3f" stroke-width="3"/>' +
      '<ellipse cx="50" cy="70" rx="15" ry="15" fill="#f3d7b0"/>' +
      '<circle cx="38" cy="56" r="11" fill="#fff" stroke="#1b0c3f" stroke-width="3"/><circle cx="62" cy="56" r="11" fill="#fff" stroke="#1b0c3f" stroke-width="3"/>' +
      '<circle cx="39" cy="57" r="5" fill="#1b0c3f"/><circle cx="61" cy="57" r="5" fill="#1b0c3f"/><circle cx="41" cy="55" r="1.8" fill="#fff"/><circle cx="63" cy="55" r="1.8" fill="#fff"/>' +
      '<path d="M46 64l4 7 4-7Z" fill="#ffb21f" stroke="#1b0c3f" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M22 42 50 4l28 38Z" fill="#35177d" stroke="#1b0c3f" stroke-width="3" stroke-linejoin="round"/><path d="M18 42h64" stroke="#1b0c3f" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M50 18l2 5 5 .5-4 3 1.5 5-4.5-3-4.5 3 1.5-5-4-3 5-.5Z" fill="#ffc93c"/><circle cx="38" cy="32" r="1.8" fill="#ffc93c"/><circle cx="62" cy="30" r="1.5" fill="#ffc93c"/>',
  },
];

const BY_ID = new Map(CHARACTERS.map((c) => [c.id, c]));
export const CHARACTER_IDS = CHARACTERS.map((c) => c.id);
export const isCharacter = (a) => BY_ID.has(a);
export const characterName = (a) => (BY_ID.get(a) || {}).name || '';

let uid = 0;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** HTML for any avatar: a character drawing or an emoji. */
export function avatarHtml(a) {
  const c = BY_ID.get(a);
  if (!c) return esc(a || '🙂');
  // Gradient/clip ids must be unique on the page.
  const n = ++uid;
  const art = c.art.replace(/id="(g|bb)"/g, `id="$1${n}"`).replace(/url\(#(g|bb)\)/g, `url(#$1${n})`);
  return `<svg class="av-art" viewBox="0 0 100 100" role="img" aria-label="${esc(c.name)}">${art}</svg>`;
}
