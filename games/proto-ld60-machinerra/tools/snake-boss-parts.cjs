// Old Rattlejaw's parts (P7, `src/chain.ts`): the painting `art-src/foe/snake-boss.svg` cut into a head with its hood, a plate and
// a tail with the rattle, drawn with the same shapes and gradients, so the procedural body is his drawing in pieces.
// Faces right (a piece's long axis is +x). The drawing's 4.8 units to a game px, here a fifth more (`UP`): the chain is bigger than the coil was.
//   node games/proto-ld60-machinerra/tools/snake-boss-parts.cjs
// then tools/svg-paint.cjs foe/snake-boss-head ... (weathered), tools/brushed-flat.cjs foe/snake-boss-head ... (the house style), `npm run assets`.
const fs = require('fs');
const OUT = __dirname + '/../art-src/foe/';
const src = fs.readFileSync(OUT + 'snake-boss.svg', 'utf8');
const defs = /<defs>[\s\S]*?<\/defs>/.exec(src)[0];
/** On-screen game px per drawing unit. */
const PX = (1 / 4.8) * 1.4;
exports.PARTS = { 'foe/snake-boss-head': 190 * PX, 'foe/snake-boss-seg': 66 * PX, 'foe/snake-boss-tail': 66 * PX };
if (require.main !== module) return;

const wrap = (name, x, y, w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">
  <!-- ${name}: tools/snake-boss-parts.cjs, from snake-boss.svg. Faces right; ${(1 / PX).toFixed(2)} units a game px. -->
  ${defs}
  <g stroke-linejoin="round" stroke-linecap="round">${body}</g>
</svg>
`;
const neck = (d) => `<path d="${d}" fill="none" stroke="#1d1a17" stroke-width="58"/><path d="${d}" fill="none" stroke="#1a1c20" stroke-width="50"/><path d="${d}" fill="none" stroke="url(#plate)" stroke-width="46" stroke-dasharray="26 8" stroke-linecap="butt"/>`;

// The head: the hood flared behind a wedge of white plate, black jaw, brass fangs, two cyan eyes, on a stub of neck.
const head = wrap('snake-boss-head', 395, 8, 205, 190, [
  neck('M456 200 L456 128'),
  '<path d="M410 150 Q380 70 440 30 Q480 10 512 40 Q560 90 520 160 Q470 190 410 150 Z" fill="url(#hood)" stroke="#1d1a17" stroke-width="3.5"/>',
  '<path d="M432 140 Q414 80 452 50 M500 54 Q526 96 506 146" fill="none" stroke="#5a646e" stroke-width="4"/>',
  '<g fill="#1d1a17"><circle cx="440" cy="60" r="4"/><circle cx="424" cy="104" r="4"/><circle cx="512" cy="70" r="4"/><circle cx="520" cy="114" r="4"/></g>',
  '<path d="M440 58 Q500 40 560 66 Q594 84 588 104 Q560 120 500 118 Q448 114 440 58 Z" fill="url(#plate)" stroke="#1d1a17" stroke-width="3.5"/>',
  '<path d="M450 100 Q520 126 586 104 L570 132 Q510 146 462 126 Z" fill="#1a1c20" stroke="#1d1a17" stroke-width="3.5"/>',
  '<path d="M552 106 L560 136 L566 108 Z M530 110 L536 132 L542 112 Z" fill="url(#brass)" stroke="#1d1a17" stroke-width="2.5"/>',
  '<path d="M556 140 L566 150 M564 138 L578 144" fill="none" stroke="#ff3048" stroke-width="3"/>',
  '<rect x="502" y="66" width="56" height="14" rx="6" fill="#0d0f12" stroke="#1d1a17" stroke-width="3"/>',
  '<circle cx="516" cy="73" r="5" fill="#3df2ff"/><circle cx="544" cy="73" r="5" fill="#3df2ff"/>',
  '<path d="M466 64 L480 90" fill="none" stroke="#9aa4ae" stroke-width="4"/>',
  '<ellipse cx="530" cy="73" rx="40" ry="18" fill="url(#glow)" stroke="none"/>',
].join(''));

// A plate: a black joint with one white plate on it, as the dashes along the coil.
const seg = wrap('snake-boss-seg', 0, 0, 56, 66, [
  '<rect x="3" y="1" width="50" height="64" rx="16" fill="#1d1a17"/><rect x="6" y="4" width="44" height="58" rx="13" fill="#1a1c20"/>',
  '<rect x="10" y="8" width="36" height="50" rx="9" fill="url(#plate)" stroke="#1d1a17" stroke-width="2"/>',
  '<path d="M16 16 Q18 12 34 12" fill="none" stroke="#ffffff" stroke-opacity="0.85" stroke-width="3"/>',
  '<path d="M16 42 L40 42" fill="none" stroke="#9aa4ae" stroke-width="2.5"/>',
].join(''));

// The tail: thinning to the rattle, four red rings; it points along +x, away from the body.
const tail = wrap('snake-boss-tail', 0, 0, 200, 66, [
  '<ellipse cx="150" cy="33" rx="56" ry="30" fill="url(#redglow)" stroke="none"/>',
  '<path d="M4 6 Q40 14 74 26 L74 40 Q40 52 4 60 Z" fill="#1d1a17"/><path d="M8 11 Q40 18 72 28 L72 38 Q40 48 8 55 Z" fill="url(#plate)" stroke="#1d1a17" stroke-width="2"/>',
  '<g fill="url(#red)" stroke="#1d1a17" stroke-width="3.5">',
  '<rect x="70" y="11" width="34" height="44" rx="12"/><rect x="102" y="14" width="30" height="38" rx="11"/><rect x="130" y="17" width="26" height="32" rx="10"/><rect x="154" y="20" width="22" height="26" rx="9"/></g>',
  '<path d="M88 18 L88 48 M118 20 L118 46 M144 23 L144 43" fill="none" stroke="#ffb0b8" stroke-width="3"/>',
].join(''));

fs.writeFileSync(OUT + 'snake-boss-head.svg', head);
fs.writeFileSync(OUT + 'snake-boss-seg.svg', seg);
fs.writeFileSync(OUT + 'snake-boss-tail.svg', tail);
console.log('snake-boss parts');
