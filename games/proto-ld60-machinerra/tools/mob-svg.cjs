// The small foes as drawings (art-src/foe/<kind>.svg), made here so they share one hand: the modern machines of
// games/ludum-dare-60/docs/biome-look.md ("Foes"): white or coloured plastic over black gloss joints, cyan eyes, red
// LEDs, panel lines, a lit edge on the top left. Each is drawn in its box in game px (the old `foe-<kind>` box, facing
// right, feet at the bottom) and scaled 10x into the SVG, outlined in soot at 0.9 px.
//   node games/proto-ld60-machinerra/tools/mob-svg.cjs [kind ...]
// then tools/svg-paint.cjs foe/<kind> (weathered into a painting), tools/brushed-flat.cjs foe/<kind> (the house style),
// a sizes.json line, and `npm run assets -- proto-ld60-machinerra`. Play uses `foe/<kind>` from the atlas.
const fs = require('fs');
const OUT = __dirname + '/../art-src/foe/';
const K = 10;

const DEFS = `<defs>
  <linearGradient id="plastic" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#dfe5ea"/><stop offset="1" stop-color="#97a3ae"/></linearGradient>
  <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a525c"/><stop offset="0.35" stop-color="#16191c"/><stop offset="1" stop-color="#0a0b0c"/></linearGradient>
  <linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef2f6"/><stop offset="0.5" stop-color="#9aa4ae"/><stop offset="1" stop-color="#4e5862"/></linearGradient>
  <linearGradient id="brass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d888"/><stop offset="0.5" stop-color="#c8963c"/><stop offset="1" stop-color="#6a4a1c"/></linearGradient>
  <linearGradient id="amber" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="0.5" stop-color="#e8a43a"/><stop offset="1" stop-color="#9a5a18"/></linearGradient>
  <linearGradient id="hornet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe05a"/><stop offset="0.6" stop-color="#f0b818"/><stop offset="1" stop-color="#9a6a08"/></linearGradient>
  <linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a6a"/><stop offset="0.5" stop-color="#d82a34"/><stop offset="1" stop-color="#6a0a14"/></linearGradient>
  <linearGradient id="blood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e05a5a"/><stop offset="0.5" stop-color="#a01828"/><stop offset="1" stop-color="#4a0610"/></linearGradient>
  <linearGradient id="pink" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd8e6"/><stop offset="0.5" stop-color="#f0a0c0"/><stop offset="1" stop-color="#a85078"/></linearGradient>
  <linearGradient id="navy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4e86"/><stop offset="1" stop-color="#121a36"/></linearGradient>
  <linearGradient id="suit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a848e"/><stop offset="1" stop-color="#363c44"/></linearGradient>
  <linearGradient id="fur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b07a4a"/><stop offset="1" stop-color="#5a3418"/></linearGradient>
  <linearGradient id="boar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a89280"/><stop offset="0.5" stop-color="#7a6452"/><stop offset="1" stop-color="#3e3026"/></linearGradient>
  <linearGradient id="fish" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ac0e0"/><stop offset="0.5" stop-color="#4a82a8"/><stop offset="1" stop-color="#1e3e5a"/></linearGradient>
  <linearGradient id="ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#d8eefc"/><stop offset="1" stop-color="#8ab4d4"/></linearGradient>
  <linearGradient id="digger" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd060"/><stop offset="0.5" stop-color="#d8a030"/><stop offset="1" stop-color="#7a5010"/></linearGradient>
  <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f0ff" stop-opacity="0.95"/><stop offset="1" stop-color="#9a86e0" stop-opacity="0.75"/></linearGradient>
  <linearGradient id="veil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8b4ff" stop-opacity="0.95"/><stop offset="1" stop-color="#5a3aa8" stop-opacity="0.8"/></linearGradient>
  <linearGradient id="dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2a5a"/><stop offset="1" stop-color="#0e0818"/></linearGradient>
  <linearGradient id="wing" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f8ff" stop-opacity="0.85"/><stop offset="1" stop-color="#8ab8d0" stop-opacity="0.55"/></linearGradient>
  <radialGradient id="cyanglow"><stop offset="0" stop-color="#3df2ff" stop-opacity="0.8"/><stop offset="1" stop-color="#3df2ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="redglow"><stop offset="0" stop-color="#ff3048" stop-opacity="0.8"/><stop offset="1" stop-color="#ff3048" stop-opacity="0"/></radialGradient>
  <radialGradient id="paleglow"><stop offset="0" stop-color="#e0f8ff" stop-opacity="0.8"/><stop offset="1" stop-color="#8af0ff" stop-opacity="0"/></radialGradient>
  <radialGradient id="violetglow"><stop offset="0" stop-color="#b08cff" stop-opacity="0.5"/><stop offset="1" stop-color="#b08cff" stop-opacity="0"/></radialGradient>
</defs>`;

// Shapes in game px.
const P = (d, fill, more = '') => `<path d="${d}" fill="${fill}" ${more}/>`;
const C = (x, y, r, fill, more = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${more}/>`;
const E = (x, y, rx, ry, fill, more = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${more}/>`;
const R = (x, y, w, h, r, fill, more = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${more}/>`;
const NO = 'stroke="none"';
/** A line of the panel work inside a shape (no outline of its own). */
const seam = (d, col = '#1d1a17', w = 0.45) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
/** The lit edge along the top left of a shape. */
const shine = (d, w = 0.7, a = 0.85) => `<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="${a}" stroke-width="${w}"/>`;
/** A jointed limb: soot under, black gloss over, a glint along it. */
const limb = (pts, w = 2.6) => {
  const d = 'M' + pts.map((p) => p.join(' ')).join(' L');
  return `<path d="${d}" fill="none" stroke="#1d1a17" stroke-width="${w + 0.9}"/><path d="${d}" fill="none" stroke="url(#gloss)" stroke-width="${w}"/><path d="${d}" fill="none" stroke="#6a7480" stroke-width="${w * 0.25}" transform="translate(-${w * 0.18} -${w * 0.18})"/>` + pts.slice(1, -1).map(([x, y]) => C(x, y, w * 0.42, '#3a4048', 'stroke-width="0.4"')).join('');
};
const eye = (x, y, r = 1.2) => C(x, y, r * 3, 'url(#cyanglow)', NO) + C(x, y, r, '#3df2ff', 'stroke-width="0.4"') + C(x - r * 0.35, y - r * 0.35, r * 0.35, '#ffffff', NO);
const led = (x, y, r = 1.2) => C(x, y, r * 3, 'url(#redglow)', NO) + C(x, y, r, '#ff3048', 'stroke-width="0.4"') + C(x - r * 0.35, y - r * 0.35, r * 0.3, '#ffd0d0', NO);
const pale = (x, y, r = 1.2) => C(x, y, r * 3.2, 'url(#paleglow)', NO) + C(x, y, r, '#e0f8ff', 'stroke-width="0.3"');
const rivets = (pts, r = 0.55) => pts.map(([x, y]) => C(x, y, r, 'url(#brass)', 'stroke-width="0.3"')).join('');

// The four-legged foes' legs (P7, data in src/rigs.json: each is one limb, hip, knee, foot; far ones drawn behind the body, near
// ones over it). The whole painting draws them with `limb()` as ever; the rig (src/quad.ts) cuts each into a thigh (hip to knee)
// and a shin (knee to foot), each a frame of its own in a box just big enough (`boneBox`) with its pivot at the bone's first point:
// the thigh swings from the hip, the shin from the knee. A bone has round caps and the shin carries the knee's joint, so the two
// meet at any bend.
const RIGS = require('../src/rigs.json');
delete RIGS._;
/** The legs of one side (far: behind the body, near: over it) as drawn in the whole painting. */
const legs = (kind, far) => RIGS[kind].legs.filter((l) => !!l.far === far).map((l) => limb(l.pts, l.w));
/** A bone's box in its frame (game px, after the kind's scale `k`): its points' extent and a margin for the stroke, and its pivot (its first point). */
function boneBox(pts, w, k = 1) {
  const m = (w / 2 + 1.2) * k;
  const xs = pts.map((p) => p[0] * k), ys = pts.map((p) => p[1] * k);
  const x0 = Math.min(...xs) - m, y0 = Math.min(...ys) - m;
  const bw = Math.max(...xs) + m - x0, bh = Math.max(...ys) + m - y0;
  return { w: Math.round(bw * 10) / 10, h: Math.round(bh * 10) / 10, pivot: [xs[0] - x0, ys[0] - y0], x0, y0 };
}
/** The two bones of a leg: the thigh's points, then the shin's. */
const bonesOf = (l) => [[l.pts[0], l.pts[1]], [l.pts[1], l.pts[2]]];
/** A bone as `limb()` draws a limb (soot under, black gloss over, a glint); the shin gets the knee's joint on top. */
function bone([a, b], w, joint) {
  if (a[0] === b[0] || a[1] === b[1]) throw new Error('a bone along an axis has no gradient box: nudge its points');
  const d = `M${a.join(' ')} L${b.join(' ')}`;
  return `<path d="${d}" fill="none" stroke="#1d1a17" stroke-width="${w + 0.9}"/><path d="${d}" fill="none" stroke="url(#gloss)" stroke-width="${w}"/><path d="${d}" fill="none" stroke="#6a7480" stroke-width="${w * 0.25}" transform="translate(-${w * 0.18} -${w * 0.18})"/>` + (joint ? C(a[0], a[1], w * 0.42, '#3a4048', 'stroke-width="0.4"') : '');
}
/** The MOBS rows `<kind>-leg-<id>-thigh` and `-shin` of a rig. */
function legFrames(kind) {
  const o = {}, k = RIGS[kind].k ?? 1;
  for (const l of RIGS[kind].legs) {
    ['thigh', 'shin'].forEach((part, i) => {
      const pts = bonesOf(l)[i], b = boneBox(pts, l.w, k);
      o[`${kind}-leg-${l.id}-${part}`] = [b.w, b.h, () => `<g transform="translate(${-b.x0} ${-b.y0}) scale(${k})">${bone(pts, l.w, i === 1)}</g>`];
    });
  }
  return o;
}
/**
 * The MOBS row `<kind>-head`: the head cut out of the body, in the box `head.box` of src/rigs.json (the kind's scale applied),
 * its pivot the neck. `box`/`pivot` as `boneBox` (the quad rig repeats them; quad.test.ts checks).
 */
function headBox(kind) {
  const { head, k = 1 } = RIGS[kind], [x0, y0, x1, y1] = head.box;
  return { w: Math.round((x1 - x0) * k * 10) / 10, h: Math.round((y1 - y0) * k * 10) / 10, pivot: [(head.neck[0] - x0) * k, (head.neck[1] - y0) * k], x0: x0 * k, y0: y0 * k };
}
const headFrame = (kind, draw) => {
  const b = headBox(kind), k = RIGS[kind].k ?? 1;
  return [b.w, b.h, () => `<g transform="translate(${-b.x0} ${-b.y0}) scale(${k})">${draw().join('')}</g>`];
};
const CAT_BODY = () => [
  ...[0, 1, 2, 3, 4, 5].map((i) => C(8 - i * 1.2, 14 - i * 1.9, 1.9 - i * 0.12, i % 2 ? 'url(#amber)' : 'url(#gloss)', 'stroke-width="0.45"')),
  P('M8 16 Q10 8 22 9 Q34 8 37 13 Q36 20 24 20 Q12 21 8 16 Z', 'url(#amber)'),
  seam('M14 10.5 Q14.5 15 13 19.5 M21 9.3 Q21.6 14.5 20.6 20 M28 9.2 Q28.6 14.5 27.6 19.8'),
  ...[[16.5, 13], [19.5, 11.5], [24.5, 14], [30.5, 11.5], [17.5, 17], [31, 16.5], [24.5, 18]].map(([x, y]) => C(x, y, 1.25, '#2a1a0c', NO) + C(x, y, 0.5, '#e8a43a', NO)),
  shine('M10 13 Q14 9.5 22 9.6 Q30 9.2 34 11'),
];
const CAT_HEAD = () => [
  P('M34 9 L36 4 L39 7 L42 6 L45.5 12 L42 16 L35 16 Z', 'url(#amber)'),
  P('M36 5.4 L37 7.6 L38.3 7 Z', '#2a1a0c', NO),
  R(39, 11, 6.5, 4.6, 2, 'url(#plastic)', 'stroke-width="0.5"'), C(44.8, 12, 0.8, '#141618', NO),
  seam('M40 15.6 L44 15.6', '#1d1a17', 0.35), eye(40.4, 9.2, 1.1),
];

const BOAR_BODY = () => [
  R(20, 2, 5, 10, 1.5, 'url(#steel)'), E(22.5, 1.6, 3, 1.6, 'rgba(230,230,230,0.6)', NO),
  P('M6 20 Q6 9 22 9 Q38 8 42 14 L44 24 Q26 28 8 25 Z', 'url(#boar)'),
  R(13, 14.5, 22, 7.5, 2, 'url(#steel)', 'stroke-width="0.6"'), seam('M20 14.5 L20 22 M27.5 14.5 L27.5 22'),
  rivets([[15, 16.5], [15, 20], [33, 16.5], [33, 20], [22, 18], [25.5, 18]]),
  ...[0, 1, 2, 3, 4, 5].map((i) => P(`M${10 + i * 5} 10.6 L${12 + i * 5} 5.6 L${14 + i * 5} 10.2 Z`, 'url(#gloss)', 'stroke-width="0.5"')),
  shine('M8 16 Q10 10.5 22 10.2 Q34 9.6 39 12'),
];
const BOAR_HEAD = () => [
  R(40, 13.5, 9.5, 10, 3, 'url(#steel)'), ...[0, 1, 2].map((i) => R(46, 15.5 + i * 2.4, 2.4, 1.2, 0.5, '#141618', NO)),
  P('M41 22 Q50 24.5 51.5 17 L49.6 18 Q48 21.6 41 20 Z', 'url(#plastic)', 'stroke-width="0.6"'),
  R(43, 20.3, 4, 1.6, 0.6, 'url(#brass)', 'stroke-width="0.35"'),
  led(39, 12.6, 1.3),
];

const CHARGER_BODY = () => [
  R(26, 2, 3, 14, 1.2, 'url(#brass)'), C(27.5, 2, 1.8, 'url(#brass)', 'stroke-width="0.5"'),
  P('M12 22 Q4 22 3 30 Q8 28 12 27 Z', 'url(#brass)'), P('M12 23 Q6 25 4 32 Q9 29 12 28 Z', 'url(#brass)', 'stroke-width="0.4"'),
  P('M10 22 Q10 14 24 14 L40 14 Q48 15 47 23 Q46 30 36 30 L18 30 Q10 30 10 22 Z', 'url(#plastic)'),
  P('M10.6 25 Q24 27.6 46.6 25', 'none', 'stroke="#c8963c" stroke-width="1.6"'), seam('M10.6 25 Q24 27.6 46.6 25', '#1d1a17', 0.35),
  P('M21 14 Q28 12 34 14 L34 22 Q28 24 21 22 Z', 'url(#red)', 'stroke-width="0.6"'), rivets([[22.5, 18], [32.5, 18]]),
  shine('M12 20 Q14 15 24 15 L40 15'),
];
const CHARGER_HEAD = () => [
  P('M42 18 L46 8 Q47 4 51 4 L56 6 L57 11 L52 12 L48 22 Z', 'url(#plastic)'),
  ...[0, 1, 2, 3, 4].map((i) => P(`M${45 + i * 1.6} ${9 - i * 1.2} L${42 + i * 1.6} ${4 - i * 1.4} L${47 + i * 1.6} ${7 - i * 1.2} Z`, 'url(#brass)', 'stroke-width="0.4"')),
  R(51, 5.4, 4, 1.4, 0.6, '#c8963c', NO), eye(51.4, 7.6, 1.1), led(56.2, 9.6, 0.7),
];
// The cart's "head" is its handle with the red LED eye, hinged where it meets the basket.
const CART_BODY = () => [
  P('M4 6 L38 8 L34 20 L8 20 Z', 'url(#steel)', 'fill-opacity="0.35"'),
  ...[1, 2, 3, 4, 5].map((i) => seam(`M${4 + i * 5.6} ${6.5 + i * 0.3} L${8 + i * 4.4} 20`, '#3a4048', 0.7)),
  ...[10, 14].map((y) => seam(`M5 ${y} L37 ${y + 1}`, '#3a4048', 0.7)),
  P('M4 6 L38 8 L34 20 L8 20 Z', 'none', 'stroke="#c8d0d8" stroke-width="1.2"'), P('M4 6 L38 8 L34 20 L8 20 Z', 'none', 'stroke-width="0.5"'),
  shine('M5 6.4 L37 8.2', 0.5),
];
const CART_HEAD = () => [R(0.6, 2.6, 9.6, 3.4, 1.4, 'url(#red)', 'stroke-width="0.6"'), led(3, 4.3, 1.1)];
/** The goat's body and head (the bleater's are the same, drawn at 0.66 in its group): the legs go between, far ones first. */
const GOAT_BODY = () => [
  P('M6 18 Q6 9 20 9 Q32 8 34 14 Q35 24 22 25 Q8 26 6 18 Z', 'url(#plastic)'),
  ...[[10, 13], [16, 11], [22, 11], [28, 12], [12, 19], [19, 19], [26, 19]].map(([x, y]) => P(`M${x - 3} ${y} Q${x} ${y - 3} ${x + 3} ${y} Q${x} ${y + 2.6} ${x - 3} ${y} Z`, '#e8edf2', 'stroke-width="0.4"')),
  shine('M8 14 Q11 9.6 20 9.8'), P('M6 14 L3 12 L4 16 Z', '#e8edf2', 'stroke-width="0.4"'),
];
const GOAT_HEAD = (small) => [
  P('M31 13 Q34 7 39 8 Q42 10 41 15 Q38 18 33 17 Z', 'url(#plastic)'),
  P('M36 17 L37 22 M38 16.4 L39.6 21', 'none', 'stroke="#3a4048" stroke-width="0.9"'),
  small ? P('M35 8.4 L36 5.6 L37.4 8 Z', '#9aa4ae', 'stroke-width="0.4"')
    : `<path d="M34 9 Q31 1 37 1 Q42 2 40 7 Q38.6 9 37 7.4" fill="none" stroke="#1d1a17" stroke-width="3.6" stroke-linecap="round"/><path d="M34 9 Q31 1 37 1 Q42 2 40 7 Q38.6 9 37 7.4" fill="none" stroke="url(#steel)" stroke-width="2.6" stroke-linecap="round"/>`,
  eye(38, 11.4, 1),
];
/** The goat: whole, or (`part`) its body or head alone, the head's frame drawn at the kind's own scale by `headFrame`. */
const goat = (small, part) => {
  const k = small ? 0.66 : 1, kind = small ? 'bleater' : 'goat';
  if (part === 'body') return `<g transform="scale(${k})">${GOAT_BODY().join('')}</g>`;
  if (part === 'head') return GOAT_HEAD(small);
  return `<g transform="scale(${k})">${[...legs(kind, true), ...GOAT_BODY(), ...legs(kind, false), ...GOAT_HEAD(small)].join('')}</g>`;
};

// The arms painted foes already have, cut at the elbow (P50, data in src/arms.json: each arm is one limb of the drawing, shoulder,
// elbow, hand, with whatever the hand holds). The whole painting draws them as ever (`armsOf`); `<kind>-body` is the painting without
// them; `armFrames` cuts each into an upper arm (shoulder to elbow) and a forearm with its item (elbow to hand). A frame is the
// box in arms.json (game px), pivot the shoulder / the elbow; src/arms.ts rigs them from the same file.
const ARMS = require('../src/arms.json');
delete ARMS._;
const ARM_ITEMS = {
  'commuter-near': () => R(17.4, 29, 7.6, 6, 1, 'url(#fur)', 'stroke-width="0.6"') + R(20, 28, 2.4, 1.6, 0.6, 'url(#brass)', 'stroke-width="0.3"'),
  'officer-near': () => R(19.4, 26, 1.8, 9, 0.6, '#222', 'stroke-width="0.4"') + C(20.3, 25.6, 1.4, 'url(#cyanglow)', NO),
  'monkey-raised': () => P('M22 3 L24.2 1 L26.4 3.2 L25.6 4.2 L24.6 3.4 L23.6 4.4 L24.6 5.4 L25.6 4.6 L26.6 5.4 L24.4 7.6 Z', 'url(#steel)', 'stroke-width="0.4"') + R(23.3, 6.6, 1.6, 4, 0.6, 'url(#steel)', 'stroke-width="0.4"'),
  'mannequin-right': () => P('M18 29 L19.4 33', 'none', 'stroke="#1d1a17" stroke-width="0.5"') + P('M17 33 L21.2 33 L21.2 38 L17 38 Z', 'url(#red)', 'stroke-width="0.5"') + C(19.1, 34.2, 0.45, '#ffffff', NO) + seam('M17.8 36.2 L20.4 36.2', '#ffffff', 0.35),
};
/** The arms of a kind as the whole painting draws them: each limb, then what it holds. */
const armsOf = (kind) => ARMS[kind].arms.map((a) => limb(a.pts, a.w) + (ARM_ITEMS[`${kind}-${a.id}`]?.() ?? '')).join('');
/** The MOBS rows `<kind>-arm-<id>-upper` and `-lower`. */
function armFrames(kind) {
  const o = {};
  for (const a of ARMS[kind].arms)
    [['upper', 'up', 0], ['lower', 'low', 1]].forEach(([part, key, i]) => {
      const [x0, y0, x1, y1] = a[key], pts = [a.pts[i], a.pts[i + 1]];
      o[`${kind}-arm-${a.id}-${part}`] = [x1 - x0, y1 - y0, () => `<g transform="translate(${-x0} ${-y0})">${bone(pts, a.w, i === 1)}${i === 1 ? (ARM_ITEMS[`${kind}-${a.id}`]?.() ?? '') : ''}</g>`];
    });
  return o;
}
/** The spanner monkey, whole or without its arms (`noArms`). Its arms are between its body and its head. */
const MONKEY = (noArms) => [
  `<path d="M9 22 Q2 24 3 17 Q4 12 8 14 Q10 16 7 18" fill="none" stroke="#1d1a17" stroke-width="2.6" stroke-linecap="round"/><path d="M9 22 Q2 24 3 17 Q4 12 8 14 Q10 16 7 18" fill="none" stroke="#3a4048" stroke-width="1.6" stroke-linecap="round"/>`,
  limb([[11, 25], [10, 28.5], [12, 31]], 2.2), limb([[17, 25], [18, 28.5], [17, 31]], 2.2),
  E(14, 21, 6.4, 6, 'url(#fur)'), E(14.6, 22.5, 3.6, 3.4, '#e8d8b8', 'stroke-width="0.5"'), shine('M9 19 Q11 15.8 15 15.6'),
  noArms ? '' : armsOf('monkey'),
  C(14.5, 10, 6, 'url(#gloss)'), C(8.6, 9, 2, 'url(#fur)', 'stroke-width="0.5"'), C(20.4, 9, 2, 'url(#fur)', 'stroke-width="0.5"'),
  E(14.6, 11, 4.4, 3.8, '#e8d8b8', 'stroke-width="0.5"'), shine('M9.5 7.5 Q12 4.5 16.5 4.4'),
  eye(12.6, 10, 1), eye(16.6, 10, 1), seam('M13 13.4 Q14.6 14.4 16.2 13.4', '#1d1a17', 0.4),
].join('');
/** The display model, whole or without its arms. */
const MANNEQUIN = (noArms) => [
  limb([[9, 30], [9, 37], [9, 44]], 2.8), limb([[13, 30], [13, 37], [13, 44]], 2.8),
  R(5.6, 12.6, 10.8, 19, 4.4, 'url(#plastic)'), seam('M7 22 Q11 23.4 15 22', '#9aa4ae', 0.4), shine('M7 16 Q8 13.6 11 13.4'),
  E(11, 7, 4.8, 5.8, 'url(#plastic)'), R(9.4, 11.4, 3.2, 2.6, 1, 'url(#plastic)', 'stroke-width="0.4"'), shine('M7.6 5.6 Q8.6 2.4 11.4 2'),
  E(12.6, 6.6, 1.2, 0.6, '#c8d0d8', NO),
  noArms ? '' : armsOf('mannequin'),
  R(6.6, 43, 9.6, 2.6, 1, 'url(#gloss)', 'stroke-width="0.5"'),
].join('');

const MOBS = {
  // The desert's hornet: a yellow-and-black plastic drone, a gloss thorax, one big cyan compound eye, a needle sting.
  hornet: [30, 24, (flap) => {
    const wings = flap
      ? P('M13 9 Q8 0 2 1 Q4 7 12 11 Z', 'url(#wing)', 'stroke-width="0.5"') + P('M15 9 Q16 -1 23 0 Q22 6 16 11 Z', 'url(#wing)', 'stroke-width="0.5"')
      : P('M13 10 Q4 12 1 17 Q8 17 13 12 Z', 'url(#wing)', 'stroke-width="0.5"') + P('M15 10 Q22 13 25 18 Q18 18 15 12 Z', 'url(#wing)', 'stroke-width="0.5"');
    return [
      limb([[11, 15], [9, 19], [10, 22]], 1.1), limb([[15, 15], [15, 19], [17, 22]], 1.1),
      P('M2 13 Q1 9 6 8 Q12 8 13 12 Q12 17 6 17 Q2 17 2 13 Z', 'url(#hornet)'),
      P('M4.5 8.3 Q5.5 12 4.6 16.6 M8 8 Q9 12 8.2 17 M11 9 Q11.8 12.5 11 16', 'none', 'stroke="#141618" stroke-width="1.5"'),
      P('M0 13 L2.4 12 L2.4 14 Z', '#141618', 'stroke-width="0.4"'),
      E(16, 12, 4.4, 3.8, 'url(#gloss)'), shine('M12.6 10.6 Q14.5 8.4 17.5 8.5'),
      P('M19 7 Q26 6.5 27.5 11.5 Q26.5 16 20 15.5 Q17.5 12 19 7 Z', 'url(#gloss)'),
      C(23.6, 10.6, 3, 'url(#cyanglow)', NO), E(23.6, 10.6, 2.6, 2.2, '#2ac8e0', 'stroke-width="0.4"'),
      seam('M21.4 9.4 L25.8 11.8 M21.6 11.8 L25.6 9.4', '#0e5a6a', 0.35), C(22.8, 9.8, 0.7, '#ffffff', NO),
      P('M26 14 L29 16 L26.4 15.6 Z', '#9aa4ae', 'stroke-width="0.3"'),
      limb([[19, 15], [21, 19], [23, 22]], 1.1),
      wings,
    ].join('');
  }],
  // The rattler: white plastic plates on black joints along an S, a red LED rattle raised, the head raised to strike.
  snake: [48, 30, () => {
    const pts = [];
    for (let i = 0; i <= 9; i++) pts.push([5 + i * 3.4, 24 - Math.sin(i * 0.7) * 3.6 - (i > 6 ? (i - 6) * 1.6 : 0)]);
    const body = 'M' + pts.map((p) => p.join(' ')).join(' L');
    return [
      E(22, 27.5, 18, 2.2, 'rgba(0,0,0,0)', NO),
      `<path d="${body}" fill="none" stroke="#1d1a17" stroke-width="7.2" stroke-linecap="round"/>`,
      `<path d="${body}" fill="none" stroke="url(#gloss)" stroke-width="6" stroke-linecap="round"/>`,
      ...pts.slice(1, -1).map(([x, y], i) => R(x - 1.5, y - 3.2, 3, 4.6, 1.2, 'url(#plastic)', 'stroke-width="0.45"') + (i % 2 ? '' : C(x, y + 1.6, 0.45, '#3df2ff', NO))),
      ...[0, 1, 2].map((i) => E(4 - i * 0.6, 20 - i * 2.6, 2.4 - i * 0.3, 1.5, 'url(#red)', 'stroke-width="0.45"') + C(4 - i * 0.6, 20 - i * 2.6, 2.5, 'url(#redglow)', NO)),
      P('M33 12 Q36 5 42 5 Q47.5 6 47.5 10 Q46 13.5 40 13.5 L36 14 Z', 'url(#gloss)'),
      P('M38 11.5 Q44 13 47.5 10.6 Q46 14.6 39 14.2 Z', 'url(#plastic)', 'stroke-width="0.45"'),
      P('M44 12.4 L44.8 14 L45.6 12.2 M41.5 12.6 L42.2 14.2 L43 12.5', '#ffffff', 'stroke-width="0.3"'),
      shine('M35 9 Q38 5.6 42.5 5.6'), eye(41, 8.6, 1.1), eye(44.2, 8.4, 0.8),
      P('M47.5 10.5 L50 9.6 M47.5 10.5 L50 11.6', 'none', 'stroke="#ff3048" stroke-width="0.5"'),
    ].join('');
  }],
  // The rattler's parts (P7, `src/chain.ts`): the body is a chain of procedural segments, so the drawing is cut into a head, a
  // plate and a tail, in the same plastic over gloss. A piece's long axis is +x; the head faces right, the tail's rattle points
  // along +x (away from the body), a segment is the same either way round. Each ends at a joint the next one joins (`JOINT`).
  'snake-head': [20, 14, () => [
    E(3.4, 9.2, 3, 3.1, 'url(#gloss)'),
    `<g transform="translate(-31 -2)">`,
    P('M33 12 Q36 5 42 5 Q47.5 6 47.5 10 Q46 13.5 40 13.5 L36 14 Z', 'url(#gloss)'),
    P('M38 11.5 Q44 13 47.5 10.6 Q46 14.6 39 14.2 Z', 'url(#plastic)', 'stroke-width="0.45"'),
    P('M44 12.4 L44.8 14 L45.6 12.2 M41.5 12.6 L42.2 14.2 L43 12.5', '#ffffff', 'stroke-width="0.3"'),
    shine('M35 9 Q38 5.6 42.5 5.6'), eye(41, 8.6, 1.1), eye(44.2, 8.4, 0.8),
    P('M47.5 10.5 L50 9.6 M47.5 10.5 L50 11.6', 'none', 'stroke="#ff3048" stroke-width="0.5"'),
    `</g>`,
  ].join('')],
  'snake-seg': [8, 8, () => [
    E(4, 3.9, 2.9, 3.2, 'url(#gloss)'),
    R(2.1, 0.9, 3.8, 5.4, 1.3, 'url(#plastic)', 'stroke-width="0.45"'), shine('M2.8 2.2 Q3 1.4 4.8 1.4', 0.5, 0.8),
  ].join('')],
  'snake-seg2': [8, 8, () => [
    E(4, 3.9, 2.9, 3.2, 'url(#gloss)'),
    R(2.1, 0.9, 3.8, 5.4, 1.3, 'url(#plastic)', 'stroke-width="0.45"'), shine('M2.8 2.2 Q3 1.4 4.8 1.4', 0.5, 0.8), C(4, 5.1, 0.45, '#3df2ff', NO),
  ].join('')],
  'snake-tail': [14, 8, () => [
    P('M1 0.9 Q4.4 1.8 6.6 3.2 L6.6 4.8 Q4.4 6.2 1 7.1 Z', 'url(#gloss)'),
    ...[[8, 2.4, 1.8], [10.3, 2.1, 1.5], [12.2, 1.7, 1.2]].map(([x, ry, rx]) => E(x, 4, rx, ry, 'url(#red)', 'stroke-width="0.45"') + C(x, 4, 2.5, 'url(#redglow)', NO)),
  ].join('')],
  // The vein-crawler's parts: a steel head, red cable rings, a tapering tail.
  'veinworm-head': [14, 14, () => [
    E(2.4, 7, 2.6, 2.9, 'url(#blood)'),
    E(7.4, 7, 5.2, 3.8, 'url(#steel)', 'transform="rotate(-8 7.4 7)"'),
    ...[0, 1, 2].map((i) => P(`M${10.8} ${5.4 + i * 1.6} L${13.4} ${6 + i * 1.6} L${10.8} ${6.6 + i * 1.6} Z`, '#ffffff', 'stroke-width="0.25"')),
    led(6.6, 5.6, 1),
  ].join('')],
  'veinworm-seg': [8, 8, () => [
    E(4, 4, 2.5, 2.9, 'url(#blood)'), seam('M4 1.4 L4 6.6', '#4a0610', 0.5),
    `<path d="M2.4 2.6 Q3 1.6 4.6 1.6" fill="none" stroke="#ff8a8a" stroke-opacity="0.7" stroke-width="0.7"/>`,
  ].join('')],
  'veinworm-tail': [10, 8, () => [
    P('M1 1.2 Q4 1.8 8.8 4 Q4 6.2 1 6.8 Z', 'url(#blood)'), seam('M3 2.2 L3 5.8', '#4a0610', 0.5),
    `<path d="M1.6 2.4 Q4 2.2 6.4 3.4" fill="none" stroke="#ff8a8a" stroke-opacity="0.6" stroke-width="0.6"/>`,
  ].join('')],
  // The pounce-cat: a clockwork jaguar, amber plates with black rosettes, crouched, its tail a chain of segments.
  cat: [46, 28, () => [
    ...legs('cat', true),
    ...CAT_BODY(),
    ...legs('cat', false),
    ...CAT_HEAD(),
  ].join('')],
  // The cat and the boar rigged (P7, `src/quad.ts`): the body without its legs, in the whole painting's own box, and each leg
  // alone with its hip at a known point (`RIGS`), so the game hangs the legs on the body and swings them from the hip.
  'cat-body': [46, 28, () => CAT_BODY().join('')],
  'cat-head': headFrame('cat', CAT_HEAD),
  ...legFrames('cat'),
  // The ramjet boar: a squat riveted tank on short legs, a bristle ridge, piston tusks, a steel drum snout.
  boar: [52, 34, () => [
    ...legs('boar', true),
    ...BOAR_BODY(),
    ...legs('boar', false),
    ...BOAR_HEAD(),
  ].join('')],
  'boar-body': [52, 34, () => BOAR_BODY().join('')],
  'boar-head': headFrame('boar', BOAR_HEAD),
  ...legFrames('boar'),
  // The spanner monkey: brown plastic, a cream face plate in a dark rim, a cable tail coiled, the spanner raised.
  monkey: [30, 32, () => MONKEY(false)],
  'monkey-body': [30, 32, () => MONKEY(true)],
  ...armFrames('monkey'),
  // The commuter: an android in a grey suit, white egg head, a black visor band with cyan eyes, the briefcase.
  commuter: [26, 44, () => android('commuter', 'url(#suit)', false, false)],
  'commuter-body': [26, 44, () => android('commuter', 'url(#suit)', false, true)],
  ...armFrames('commuter'),
  // The officer unit: navy, a cap, a badge, a belt, the taser.
  officer: [28, 46, () => android('officer', 'url(#navy)', true, false)],
  'officer-body': [28, 46, () => android('officer', 'url(#navy)', true, true)],
  ...armFrames('officer'),
  // The carousel charger: a white barrel horse with gold trim and a red saddle, a gold mane of spikes, its pole stub.
  charger: [58, 46, () => [...legs('charger', true), ...CHARGER_BODY(), ...legs('charger', false), ...CHARGER_HEAD()].join('')],
  'charger-body': [58, 46, () => CHARGER_BODY().join('')],
  'charger-head': headFrame('charger', CHARGER_HEAD),
  ...legFrames('charger'),
  // The ram-goat: shaggy white panels, steel horns curled, a cable beard, black legs.
  goat: [42, 36, () => goat(false)],
  // The goat, the bleater, the charger and the cart rigged like the cat (src/quad.ts): the body without legs, then each leg's thigh and shin.
  'goat-body': [42, 36, () => goat(false, 'body')],
  'goat-head': headFrame('goat', () => goat(false, 'head')),
  ...legFrames('goat'),
  // The bleater: a kid of the herd, no horns to speak of.
  bleater: [28, 22, () => goat(true)],
  'bleater-body': [28, 22, () => goat(true, 'body')],
  'bleater-head': headFrame('bleater', () => goat(true, 'head')),
  ...legFrames('bleater'),
  // The talon kite: a mech eagle in flight, white plates stepping out along the wings, talons hung, a hook beak.
  kite: [54, 30, () => [
    P('M22 12 Q14 2 2 4 Q8 9 14 10 Q8 11 4 15 Q14 15 22 14 Z', '#8a96a2', 'stroke-width="0.7"'),
    P('M8 16 L2 13 L1 19 L6 18 L3 22 L10 18 Z', 'url(#plastic)', 'stroke-width="0.6"'),
    P('M10 14 Q20 9 34 11 Q40 12.5 41 16 Q36 19.5 22 19 Q12 18.6 10 14 Z', 'url(#plastic)'),
    seam('M18 11.2 Q19 15 18 18.8 M26 10.6 Q27 15 26 19'), shine('M12 13.6 Q20 10 32 11.4'),
    P('M24 15 Q30 24 50 26 Q44 22 46 20 Q40 20 41 17 Q34 18 30 14 Z', 'url(#plastic)', 'stroke-width="0.7"'),
    seam('M30 18 L33 22 M35 19 L38 23.4 M40 19.6 L43 24.6'),
    limb([[22, 19], [21, 23], [23, 26]], 1.4), limb([[27, 19], [27, 23], [29, 26]], 1.4),
    P('M21 26 L23 28 M23 26 L24.6 28.2 M28.4 26 L30.4 28 M29.6 26 L31.6 27.4', 'none', 'stroke="#1d1a17" stroke-width="0.9"'),
    P('M38 10 Q43 7.5 47 9.5 Q49 11 48 13.6 Q44 15.4 40 14 Z', 'url(#plastic)'),
    P('M47 10.4 Q52 11 53 14.6 Q50.4 13 48 13.6 Z', 'url(#gloss)', 'stroke-width="0.5"'), eye(44.4, 10.8, 1),
  ].join('')],
  // The piranha: a blue-steel fish of the Tunnel of Love, a white jaw of teeth, a red eye, dripping.
  piranha: [34, 24, () => [
    P('M2 6 L9 11 L2 17 L4 11 Z', 'url(#fish)', 'stroke-width="0.7"'),
    P('M11 4 L17 0.6 L21 4.6 Z', 'url(#fish)', 'stroke-width="0.6"'), P('M13 18 L17 22 L19 17 Z', 'url(#fish)', 'stroke-width="0.6"'),
    E(17, 11, 12, 8.6, 'url(#fish)'), seam('M10 5.6 Q12.6 11 10 16.4 M15 3.4 Q17.6 11 15 18.6'), rivets([[11.6, 9], [11.6, 13]], 0.45),
    shine('M7 9 Q10 4 17 3.2'),
    P('M20 13 Q28 19.4 31.6 12 L29.4 11 Q26 15 21 12 Z', 'url(#plastic)', 'stroke-width="0.6"'),
    ...[0, 1, 2, 3].map((i) => P(`M${22 + i * 2} 12.6 L${23 + i * 2} 14.8 L${24 + i * 2} 12.6 Z`, '#ffffff', 'stroke-width="0.25"')),
    ...[0, 1, 2].map((i) => P(`M${23 + i * 2.4} 15.6 L${24 + i * 2.4} 13.8 L${25 + i * 2.4} 15.6 Z`, '#ffffff', 'stroke-width="0.25"')),
    led(24.4, 7.8, 1.4),
    ...[[9, 19.6], [15, 21.4], [21, 20.4]].map(([x, y]) => E(x, y, 0.7, 1.3, '#7fc4d8', 'stroke-width="0.25"')),
  ].join('')],
  // The love-bot: a pink plastic cupid drone, white wings, a bow drawn with a heart-tipped arrow, a rotor below.
  cupid: [34, 30, () => [
    E(11, 8, 9, 4.6, 'url(#plastic)', 'stroke-width="0.6" transform="rotate(-30 11 8)"'), E(16, 8, 9, 4.6, 'url(#plastic)', 'stroke-width="0.6" transform="rotate(30 16 8)"'),
    seam('M6 6 L12 9 M8 3.6 L13 7.6', '#9aa4ae', 0.4),
    C(15, 15, 7, 'url(#pink)'), seam('M8.4 15.6 Q15 18 21.6 15.6', '#a85078', 0.5), shine('M10 12 Q12.6 8.8 16.4 8.6'),
    C(15, 7.6, 4.6, 'url(#pink)', 'stroke-width="0.7"'), C(13.4, 5.6, 1.4, '#ffe8f0', NO), eye(17, 7.2, 1),
    `<path d="M22 8 A7 7 0 0 1 22 22" fill="none" stroke="#1d1a17" stroke-width="2.2"/><path d="M22 8 A7 7 0 0 1 22 22" fill="none" stroke="url(#brass)" stroke-width="1.3"/>`,
    seam('M22 8 L16 15 L22 22', '#e8e8e8', 0.3), P('M16 15 L31 15', 'none', 'stroke="#1d1a17" stroke-width="0.9"'),
    P('M31 17.4 C28 14 29 11.4 31 13 C33 11.4 34 14 31 17.4 Z', '#ff3048', 'stroke-width="0.5"'), C(31, 14.6, 4, 'url(#redglow)', NO),
    R(11, 22, 8, 3, 1.5, 'url(#gloss)', 'stroke-width="0.5"'), R(5, 25.4, 20, 1.5, 0.7, 'url(#steel)', 'stroke-width="0.4"'),
  ].join('')],
  // The display model: a smooth white store dummy, a blank face, a price tag on a string at its wrist.
  mannequin: [22, 46, () => MANNEQUIN(false)],
  'mannequin-body': [22, 46, () => MANNEQUIN(true)],
  ...armFrames('mannequin'),
  // The cart crawler: a shopping cart walking on four little robot legs, a red LED eye on the handle.
  cart: [40, 30, () => [...legs('cart', true), ...CART_BODY(), ...CART_HEAD()].join('')],
  'cart-body': [40, 30, () => CART_BODY().join('')],
  'cart-head': headFrame('cart', CART_HEAD),
  ...legFrames('cart'),
  // The mall-cop drone: a white quadcopter with a blue-and-red light bar and a whistle on its chin.
  copdrone: [32, 24, () => [
    ...[4, 28].map((x) => R(x - 4.4, 3.6, 8.8, 1.6, 0.8, 'url(#steel)', 'stroke-width="0.4"') + limb([[x, 6], [16, 11]], 1.4)),
    E(16, 13, 9.4, 6.4, 'url(#plastic)'), seam('M7.6 14.6 Q16 17.6 24.4 14.6', '#9aa4ae', 0.45), shine('M8.6 11 Q11 7.6 16 7.4'),
    R(8.6, 5.6, 7.4, 3.2, 1.2, '#3a7fe0', 'stroke-width="0.6"'), R(16, 5.6, 7.4, 3.2, 1.2, '#ff3048', 'stroke-width="0.6"'),
    C(12, 7.2, 5, 'url(#cyanglow)', NO), C(20, 7.2, 5, 'url(#redglow)', NO),
    eye(21, 12.8, 1.4), R(15, 17.6, 7, 2.8, 1.2, 'url(#brass)', 'stroke-width="0.5"'), R(13, 20, 6, 1.4, 0.6, '#141618', NO),
  ].join('')],
  // The leech drone: a fat red segmented body on buzzing wings, a ring mouth of brass teeth.
  leech: [28, 22, () => [
    E(9, 5, 6, 2.6, 'url(#wing)', 'stroke-width="0.4" transform="rotate(-20 9 5)"'), E(15, 5, 6, 2.6, 'url(#wing)', 'stroke-width="0.4" transform="rotate(20 15 5)"'),
    ...[0, 1, 2, 3].map((i) => C(6 + i * 4.5, 12 + Math.sin(i) * 0.8, 4.6 - Math.abs(i - 1.5) * 0.5, 'url(#blood)', 'stroke-width="0.6"')),
    shine('M3 10 Q6 7 10 7.4', 0.6), C(23, 12, 4.2, '#4a0610', 'stroke-width="0.7"'),
    ...[0, 1, 2, 3, 4, 5].map((i) => { const a = (i / 6) * Math.PI * 2; return P(`M${23 + Math.cos(a) * 3.4} ${12 + Math.sin(a) * 3.4} L${23 + Math.cos(a) * 1.6} ${12 + Math.sin(a) * 1.6}`, 'none', 'stroke="#f6d888" stroke-width="0.9"'); }),
    eye(15, 8.6, 0.9), E(22.6, 18, 0.7, 1.6, '#b02030', 'stroke-width="0.25"'),
  ].join('')],
  // The vein-crawler: a red cable worm with a steel head, half out of its hole in the rock.
  veinworm: [46, 22, () => {
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push([8 + i * 3, 16 - Math.sin(i * 0.8) * 4 - i * 0.4]);
    const d = 'M' + pts.map((p) => p.join(' ')).join(' L');
    const [hx, hy] = pts[pts.length - 1];
    return [
      E(10, 18.4, 9.4, 3.6, '#1e1814', 'stroke-width="0.8"'), E(10, 17.6, 7, 2.2, '#3a322c', NO),
      `<path d="${d}" fill="none" stroke="#1d1a17" stroke-width="6.6" stroke-linecap="round"/><path d="${d}" fill="none" stroke="url(#blood)" stroke-width="5"/>`,
      ...pts.slice(1, -1).map(([x, y]) => seam(`M${x} ${y - 2.4} L${x} ${y + 2.4}`, '#4a0610', 0.5)),
      `<path d="${d}" fill="none" stroke="#ff8a8a" stroke-opacity="0.7" stroke-width="0.8" transform="translate(-0.4 -1.4)"/>`,
      E(hx + 2, hy, 5.2, 3.8, 'url(#steel)', `transform="rotate(-12 ${hx + 2} ${hy})"`),
      ...[0, 1, 2].map((i) => P(`M${hx + 5.4} ${hy - 1.6 + i * 1.6} L${hx + 8} ${hy - 1 + i * 1.6} L${hx + 5.4} ${hy - 0.4 + i * 1.6} Z`, '#ffffff', 'stroke-width="0.25"')),
      led(hx + 1.4, hy - 1.4, 1),
    ].join('');
  }],
  // The frost mite: a small round tracked robot, its white shell rimed with frost, a cold blue eye.
  mite: [24, 16, () => [
    R(3, 10, 18, 5.4, 2.6, 'url(#gloss)'), ...[0, 1, 2, 3].map((i) => C(6 + i * 4, 12.7, 1.3, '#3a4048', 'stroke-width="0.3"')),
    P('M4 10.6 Q4 3 12 3 Q20 3 20 10.6 Z', 'url(#ice)'), seam('M8 4.4 Q7.4 8 8 10.6 M16 4.4 Q16.6 8 16 10.6', '#8ab4d4', 0.45),
    ...[8, 12, 16].map((x) => P(`M${x - 1} 3.6 L${x} 0.8 L${x + 1} 3.6 Z`, '#ffffff', 'stroke-width="0.3"')),
    shine('M5.6 8 Q6.6 4.4 11 4'), pale(17, 7.4, 1.1),
  ].join('')],
  // The ice-auger driller: a squat yellow tracked digger, a big spiral auger out front, ice chips flying.
  driller: [36, 34, () => [
    R(2, 25, 24, 8, 3.8, 'url(#gloss)'), ...[0, 1, 2, 3, 4].map((i) => C(5.6 + i * 4.3, 29, 1.7, '#3a4048', 'stroke-width="0.3"')),
    R(4, 11.6, 20, 14.4, 3, 'url(#digger)'), R(6, 14.6, 8.4, 5.4, 1.4, '#22201c', 'stroke-width="0.6"'), eye(10.2, 17.3, 1.2),
    ...[0, 1, 2, 3].map((i) => P(`M${5 + i * 5} 26 L${7 + i * 5} 23 L${9 + i * 5} 26 Z`, '#141618', NO)),
    shine('M5.4 15 Q6 12.6 9 12.4'), rivets([[17, 14], [21, 14], [17, 22], [21, 22]]),
    R(21, 16, 3, 6, 1, 'url(#steel)', 'stroke-width="0.4"'),
    P('M22 12 L35.4 19 L22 26 Z', 'url(#steel)'),
    ...[0, 1, 2, 3].map((i) => P(`M${23 + i * 3} ${13 + i * 1.6} L${25.4 + i * 3} ${25 - i * 1.6}`, 'none', 'stroke="#1d1a17" stroke-width="0.9"')),
    C(33, 22.6, 1.2, '#d8eefc', 'stroke-width="0.3"'), C(30, 27, 1, '#d8eefc', 'stroke-width="0.3"'), C(34.6, 15.6, 0.8, '#d8eefc', 'stroke-width="0.3"'),
  ].join('')],
  // The wisp: a sheet of mist over an old robot's face plate, two lantern eyes, tatters below.
  wisp: [34, 36, () => [
    C(17, 16, 17, 'url(#violetglow)', NO),
    P('M6 30 Q3 6 17 4 Q31 6 28 30 L25.2 35 L22.2 30 L19.4 35 L16.6 30 L13.8 35 L11 30 L8.2 34 Z', 'url(#mist)', 'stroke="#3c286e" stroke-width="0.8"'),
    shine('M7 20 Q6.6 8 15 5.6', 0.9, 0.9), R(9.6, 10.6, 14.8, 8.6, 3, '#2a1e48', 'stroke-width="0.6"'), seam('M10.6 17 L23.4 17', '#5a4a8a', 0.4),
    pale(14, 15, 1.5), pale(20, 15, 1.5),
  ].join('')],
  // The shade: a shadow person robot, tall and thin and all dark, two white points of eyes, a hint of joints.
  shade: [30, 52, () => [
    C(15, 26, 18, 'url(#violetglow)', NO),
    P('M11 20 Q5 30 6 41', 'none', 'stroke="#1d1a17" stroke-width="3.4" stroke-linecap="round"'), P('M19 20 Q26 30 25 41', 'none', 'stroke="#1d1a17" stroke-width="3.4" stroke-linecap="round"'),
    P('M11 20 Q5 30 6 41', 'none', 'stroke="url(#dark)" stroke-width="2.4" stroke-linecap="round"'), P('M19 20 Q26 30 25 41', 'none', 'stroke="url(#dark)" stroke-width="2.4" stroke-linecap="round"'),
    P('M9 51 L11 22 Q8 12 12 8 Q15 2 19 7 Q22 12 19 22 L22 51 L18 49 L15.4 51 L12.6 49 Z', 'url(#dark)', 'stroke="#7a50c8" stroke-width="0.7"'),
    seam('M12 30 L19 30 M12.4 38 L19.6 38', '#5a3a98', 0.4), shine('M11.6 18 Q10 11 13.6 7.6', 0.6, 0.5),
    pale(13.6, 10, 1.1), pale(17.4, 10, 1.1),
  ].join('')],
  // The banshee: a hood of steam over a gaping vent of a mouth, a cold glow inside, wisps for hands.
  banshee: [36, 42, () => [
    C(18, 18, 20, 'url(#violetglow)', NO),
    P('M4 40 Q0 14 18 3 Q36 14 32 40 Q25 34 18 41 Q11 34 4 40 Z', 'url(#veil)', 'stroke="#3c286e" stroke-width="0.8"'),
    shine('M5 26 Q4 12 14 5.4', 0.9, 0.8),
    E(18, 18, 8, 10, '#140c28', 'stroke-width="0.6"'), E(18, 23, 3.6, 4.6, '#0a0614', 'stroke-width="0.4"'), C(18, 23, 6, 'url(#paleglow)', NO),
    pale(15, 15, 1), pale(21, 15, 1),
    P('M3 30 Q-1 34 2 38 M33 30 Q37 34 34 38', 'none', 'stroke="#c8b4ff" stroke-width="1.2" stroke-opacity="0.8"'),
  ].join('')],
};

function android(kind, suit, officer, noArms) {
  return [
    limb([[10, 33], [10, 38], [9, 43]], 2.6), limb([[16, 33], [16, 38], [17, 43]], 2.6),
    R(5.6, 15, 14.8, 19, 3, suit), shine('M7 19 Q7.4 16 10.4 15.8'),
    officer ? R(5.6, 28, 14.8, 2.6, 0.6, '#141618', 'stroke-width="0.4"') + R(11.6, 27.8, 3, 3, 0.6, 'url(#brass)', 'stroke-width="0.4"') + P('M15 18 L17 18 L17.6 20.6 L16 22 L14.4 20.6 Z', 'url(#brass)', 'stroke-width="0.4"')
      : P('M10.6 15 L13 22 L15.4 15 Z', '#ffffff', 'stroke-width="0.4"') + P('M12.4 16.4 L13.6 16.4 L14.2 23 L13 24.6 L11.8 23 Z', '#d82a34', 'stroke-width="0.35"'),
    noArms ? '' : armsOf(kind),
    E(13, 8.6, 5.6, 6.8, 'url(#plastic)'), shine('M8.6 6 Q10 2.6 14 2.2'),
    R(7.6, 7, 10.8, 3.2, 1.4, '#141618', 'stroke-width="0.4"'), eye(11, 8.6, 0.9), eye(15.4, 8.6, 0.9), seam('M11.6 12.6 Q13.4 13.4 15.2 12.6', '#9aa4ae', 0.4),
    officer ? P('M6.6 4.4 Q13 0 19.6 4.4 L19.6 6 L6.6 6 Z', 'url(#navy)', 'stroke-width="0.6"') + R(6, 5.4, 15, 1.6, 0.6, '#141618', 'stroke-width="0.4"') + C(13, 3.4, 0.9, 'url(#brass)', 'stroke-width="0.3"') : '',
  ].join('');
}

function svg(kind, [w, h, draw], flap) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-K * 2} ${-K * 2} ${(w + 4) * K} ${(h + 4) * K}" width="${(w + 4) * K}" height="${(h + 4) * K}">
  <!-- ${kind}${flap ? ' (wings up)' : ''}: tools/mob-svg.cjs. Faces right, feet at the bottom; game px x ${K}. -->
  ${DEFS}
  <g transform="scale(${K})" stroke="#1d1a17" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round">${draw(flap)}</g>
</svg>
`;
}

// P50's elite limbs, one set for every foe (src/limbview.ts hangs them on the foe at its `SOCKETS` row): a claw is an upper arm
// from the shoulder and a forearm with a pincer from the elbow (the two-bone solve turns them); a tentacle is a rope of these
// plates with a lens at its tip. Every piece lies along +x with its pivot at the point given (a fraction of its frame is
// (2 + px) / (w + 4), which `limbview.ts` repeats in `PARTS`). Steel and gloss, never red: red is only the danger telegraph.
const LIMB_PARTS = {
  'limb-claw-upper': [11, 5, () => [
    R(2.5, 0.9, 7.8, 3.2, 1.4, 'url(#steel)'), shine('M3.6 1.8 L9.6 1.8', 0.6, 0.8),
    rivets([[5, 2.5], [8, 2.5]], 0.5), seam('M6.4 1 L6.4 4', '#1d1a17', 0.35),
    C(2.5, 2.5, 2.1, 'url(#gloss)'), C(2.5, 2.5, 0.8, '#6a7480', 'stroke-width="0.3"'),
  ].join('')],
  'limb-claw-fore': [18, 10, () => [
    C(2.5, 5, 1.9, 'url(#gloss)'), C(2.5, 5, 0.7, '#6a7480', 'stroke-width="0.3"'),
    R(2.5, 3.6, 7.4, 2.8, 1.2, 'url(#steel)'), shine('M3.4 4.3 L9 4.3', 0.55, 0.8), rivets([[5, 5], [7.6, 5]], 0.45),
    R(9.4, 2.8, 3.2, 4.4, 1, 'url(#brass)', 'stroke-width="0.7"'),
    P('M11.6 3 Q15.8 -0.4 17.6 4 Q14.8 3.4 12.6 5 Z', 'url(#steel)', 'stroke-width="0.8"'),
    P('M11.8 7 Q15 9.6 17.4 7.2 Q14.4 6.6 12.6 5 Z', 'url(#steel)', 'stroke-width="0.8"'),
    ...[0, 1].map((i) => P(`M${14.2 + i * 1.7} ${2.3 + i * 0.9} L${14.6 + i * 1.7} ${3.6 + i * 0.5} L${15.6 + i * 1.5} ${2.9 + i * 0.7} Z`, '#ffffff', 'stroke-width="0.25"')),
  ].join('')],
  'limb-tentacle-plate': [6, 4, () => [
    R(0.4, 0.5, 5.2, 3, 1.4, 'url(#steel)'), shine('M1.4 1.2 L4.6 1.2', 0.5, 0.8),
    seam('M3 0.7 L3 3.3', '#1d1a17', 0.35), C(0.9, 2, 0.5, 'url(#gloss)', NO), C(5.1, 2, 0.5, 'url(#gloss)', NO),
  ].join('')],
  'limb-tentacle-tip': [9, 6, () => [
    P('M0.6 0.9 L5 0.9 Q8.4 3 5 5.1 L0.6 5.1 Z', 'url(#brass)', 'stroke-width="0.8"'), seam('M2.6 1 L2.6 5', '#1d1a17', 0.35),
    C(5.4, 3, 1.5, 'url(#paleglow)', NO), C(5.4, 3, 0.9, '#e0f8ff', 'stroke-width="0.35"'),
    P('M7.2 3 L8.6 3', 'none', 'stroke="#1d1a17" stroke-width="0.5"'),
  ].join('')],
};
Object.assign(MOBS, LIMB_PARTS);

/** The on-screen height of each foe's whole drawing (its box and margin), a little over the old box so they read. */
const mobHeight = ([, h, , scale]) => Math.round((h + 4) * (scale ?? 1.15));
/** The rattler's and the vein-crawler's parts all come out at one scale, so a head and its segments match. */
const PART = 7 / 6;
for (const k of Object.keys(MOBS)) if (/-(head|seg2?|tail)$/.test(k)) MOBS[k][3] = PART;
module.exports = { MOBS, mobHeight, RIGS, boneBox, bonesOf };
if (require.main !== module) return;
const only = process.argv.slice(2);
for (const [kind, def] of Object.entries(MOBS)) {
  if (only.length && !only.includes(kind)) continue;
  fs.writeFileSync(`${OUT}${kind}.svg`, svg(kind, def, false));
  if (kind === 'hornet') fs.writeFileSync(`${OUT}hornet-flap.svg`, svg('hornet', def, true));
  console.log(kind);
}
