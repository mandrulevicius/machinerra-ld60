/**
 * The four designed dungeons' art (games/ludum-dare-60/docs/dungeons.md, sim/dungeon.ts `KITS`), drawn in code in the
 * house style (`art.ts`) until painted art comes: each way down (`dungeon-way-<biome>`, the land's entrance), the foes
 * (`foe-<kind>`) and the parts (`part-<kind>`); the mini-bosses are paintings (`art-src/foe/<kind>-boss.svg`, see
 * `Play.bossForms`). Modern machines, so white or coloured plastic over black joints, cyan eyes, LEDs. Every foe faces
 * right (Play flips it), its feet at the bottom of its box. Add one: a `BOX` line and a `canvas` call in `makeDungeonFoeArt`.
 */
import type Phaser from 'phaser';
import { COL, SIZE, canvas, circ, glow, rivets, rr, shape, type Ctx } from './art';

const BOX: Record<string, [number, number]> = {
  'dungeon-way-jungle': [120, 104],
  'dungeon-way-city': [112, 110],
  'dungeon-way-demon': [104, 96],
  'dungeon-way-mountains': [112, 132],
  'foe-piranha': [34, 24],
  'foe-cupid': [34, 30],
  'foe-mannequin': [22, 46],
  'foe-cart': [40, 30],
  'foe-copdrone': [32, 24],
  'foe-leech': [28, 22],
  'foe-veinworm': [46, 22],
  'foe-mite': [24, 16],
  'foe-driller': [36, 34],
  'part-piranha-jaw': [22, 16],
  'part-swan-feather': [24, 14],
  'part-hookhand': [26, 20],
  'part-price-tag': [18, 20],
  'part-cart-wheel': [18, 18],
  'part-cop-whistle': [20, 12],
  'part-cop-megaphone': [28, 20],
  'part-leech-mouth': [18, 18],
  'part-vein-cable': [26, 14],
  'part-hemo-pump': [22, 26],
  'part-frost-carapace': [22, 16],
  'part-auger-bit': [24, 14],
  'part-ice-auger': [32, 14],
};

const PLATE = '#c8d0d8', GLOSS = '#202630', ICE = '#dceefc', ICE_LO = '#9fc8e8', BLOOD = '#b02030', BLOOD_HI = '#e04050';

/** A cyan eye with its glow (`col` for a red one). */
function eye(c: Ctx, x: number, y: number, r = 1.2, col = COL.cyan, halo = 'rgba(61,242,255,0.6)') {
  shape(c, col, circ(c, x, y, r), 0.4);
  glow(c, x, y, r * 3, halo);
}
const redEye = (c: Ctx, x: number, y: number, r = 1.2) => eye(c, x, y, r, COL.red, 'rgba(255,48,72,0.6)');

/** A black strut from hip to foot through a knee. */
function strut(c: Ctx, pts: [number, number][], w = 2.4) {
  c.strokeStyle = COL.soot;
  c.lineWidth = w + 1.4;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
  c.strokeStyle = COL.black;
  c.lineWidth = w;
  c.stroke();
}
/** A wheel: black tyre, grey hub. */
const wheel = (c: Ctx, x: number, y: number, r: number) => {
  shape(c, COL.black, circ(c, x, y, r), 0.8);
  shape(c, '#8a929a', circ(c, x, y, r * 0.45), 0.4);
};
/** A closed polygon. */
const poly = (c: Ctx, pts: [number, number][]) => () => {
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
};

// ---------------------------------------------------------------- the jungle: the Tunnel of Love

/** A piranha-tronic mid-leap: a round steel-blue fish, a white jaw full of teeth, a red eye, a fin. */
function piranha(c: Ctx) {
  shape(c, '#3a6a8a', poly(c, [[2, 6], [8, 11], [2, 17]]), 0.9);
  shape(c, '#5a8aaa', () => c.ellipse(17, 11, 12, 8.5, -0.15, 0, Math.PI * 2), 1.2);
  shape(c, '#3a6a8a', poly(c, [[12, 3], [18, 0.5], [21, 4]]), 0.7);
  shape(c, COL.plastic, () => {
    c.moveTo(20, 13);
    c.quadraticCurveTo(28, 19, 31, 12);
    c.lineTo(29, 11);
    c.quadraticCurveTo(26, 15, 21, 12);
    c.closePath();
  }, 0.8);
  for (let i = 0; i < 4; i++) shape(c, COL.steam, poly(c, [[22 + i * 2, 12.6], [23 + i * 2, 14.6], [24 + i * 2, 12.6]]), 0);
  redEye(c, 24, 8, 1.4);
  rivets(c, [[12, 9], [12, 13]]);
  // Water dripping off it.
  c.fillStyle = 'rgba(127,196,216,0.7)';
  for (const [x, y] of [[9, 19], [15, 21], [21, 20]]) c.fillRect(x, y, 1.4, 2.4);
}

/** A love-bot: a pink plastic cupid drone, white wings, a bow drawn with a heart-tipped arrow. */
function cupid(c: Ctx) {
  for (const s of [-1, 1]) shape(c, COL.plastic, () => c.ellipse(13 + s * 1.5, 8, 9, 4.5, -0.6 * s, 0, Math.PI * 2), 0.9);
  shape(c, '#f0a0c0', circ(c, 15, 15, 7), 1.2);
  shape(c, '#f8c8d8', circ(c, 15, 7.5, 4.5), 1);
  eye(c, 17, 7, 1);
  // The bow and its heart arrow.
  c.strokeStyle = COL.soot;
  c.lineWidth = 2.2;
  c.beginPath();
  c.arc(22, 15, 7, -1.2, 1.2);
  c.stroke();
  c.strokeStyle = '#c8963c';
  c.lineWidth = 1.2;
  c.stroke();
  c.strokeStyle = COL.soot;
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(16, 15);
  c.lineTo(31, 15);
  c.stroke();
  shape(c, COL.red, () => {
    c.moveTo(31, 17);
    c.bezierCurveTo(28, 14, 29, 11.5, 31, 13);
    c.bezierCurveTo(33, 11.5, 34, 14, 31, 17);
  }, 0.5);
  glow(c, 31, 14.5, 4, 'rgba(255,80,140,0.6)');
  // The rotor under it.
  shape(c, GLOSS, rr(c, 11, 22, 8, 3, 1.5), 0.6);
  shape(c, '#8a929a', rr(c, 6, 25.5, 18, 1.4, 0.7), 0.4);
}

// ---------------------------------------------------------------- the city: the Galleria

/** A mannequin: a smooth white store dummy, blank face, a price tag on a string from its wrist. */
function mannequin(c: Ctx) {
  strut(c, [[9, 30], [9, 44]], 2.6);
  strut(c, [[13, 30], [13, 44]], 2.6);
  shape(c, '#eef0f2', rr(c, 6, 13, 10, 18, 4), 1.1);
  shape(c, '#eef0f2', () => c.ellipse(11, 7, 4.6, 5.5, 0, 0, Math.PI * 2), 1);
  shape(c, '#d8dce0', rr(c, 9.5, 11.5, 3, 2.5, 1), 0.4);
  strut(c, [[6, 15], [3, 24], [4, 30]], 1.8);
  strut(c, [[16, 15], [19, 23], [18, 29]], 1.8);
  c.strokeStyle = COL.soot;
  c.lineWidth = 0.6;
  c.beginPath();
  c.moveTo(18, 29);
  c.lineTo(19, 33);
  c.stroke();
  shape(c, '#e03a3a', poly(c, [[17, 33], [21, 33], [21, 38], [17, 38]]), 0.5);
  shape(c, '#3a4048', rr(c, 7, 43, 9, 2.4, 1), 0.5);
}

/** A cart crawler: a shopping cart walking on four little robot legs, a red LED eye on the handle. */
function cart(c: Ctx) {
  for (const x of [8, 15, 26, 33]) strut(c, [[x, 20], [x - 2, 24], [x, 28]], 1.8);
  shape(c, '#9aa4ae', poly(c, [[4, 6], [38, 8], [34, 20], [8, 20]]), 1.2);
  c.strokeStyle = COL.soot;
  c.lineWidth = 0.8;
  for (let i = 1; i < 6; i++) {
    c.beginPath();
    c.moveTo(4 + i * 5.6, 6.5 + i * 0.3);
    c.lineTo(8 + i * 4.4, 20);
    c.stroke();
  }
  for (const y of [10, 14]) {
    c.beginPath();
    c.moveTo(5, y);
    c.lineTo(37, y + 1);
    c.stroke();
  }
  shape(c, '#e03a3a', rr(c, 1, 3, 9, 3, 1.4), 0.7);
  redEye(c, 3, 4.5, 1.1);
}

/** A mall-cop drone: a white quadcopter with a blue-and-red light bar and a whistle on its chin. */
function copdrone(c: Ctx) {
  for (const x of [4, 28]) {
    shape(c, '#8a929a', rr(c, x - 4, 4, 8, 1.6, 0.8), 0.4);
    strut(c, [[x, 6], [16, 11]], 1.4);
  }
  shape(c, COL.plastic, () => c.ellipse(16, 13, 9, 6, 0, 0, Math.PI * 2), 1.1);
  shape(c, '#3a7fe0', rr(c, 9, 6, 7, 3, 1.2), 0.6);
  shape(c, COL.red, rr(c, 16, 6, 7, 3, 1.2), 0.6);
  glow(c, 12, 7.5, 5, 'rgba(80,140,255,0.6)');
  glow(c, 20, 7.5, 5, 'rgba(255,48,72,0.6)');
  eye(c, 21, 13, 1.4);
  shape(c, COL.brass, rr(c, 15, 18, 7, 2.6, 1.2), 0.5);
  shape(c, COL.black, rr(c, 13, 20, 6, 1.4, 0.6), 0);
}

// ---------------------------------------------------------------- the Demon Wastes: the Blood Cistern

/** A leech drone: a fat red segmented body on little buzzing wings, a ring mouth of brass teeth at the front. */
function leech(c: Ctx) {
  for (const s of [-1, 1]) {
    c.fillStyle = 'rgba(200,180,200,0.45)';
    c.beginPath();
    c.ellipse(12 + s * 3, 5, 6, 2.5, s * 0.4, 0, Math.PI * 2);
    c.fill();
  }
  for (let i = 0; i < 4; i++) shape(c, i % 2 ? BLOOD : BLOOD_HI, circ(c, 6 + i * 4.5, 12 + Math.sin(i) * 0.8, 4.4 - Math.abs(i - 1.5) * 0.5), 0.8);
  shape(c, '#5a1018', circ(c, 23, 12, 4), 1);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    shape(c, COL.brassHi, circ(c, 23 + Math.cos(a) * 2.6, 12 + Math.sin(a) * 2.6, 0.8), 0);
  }
  eye(c, 15, 8.5, 0.9);
  c.fillStyle = 'rgba(176,32,48,0.8)';
  c.fillRect(22, 16, 1.2, 3);
}

/** A vein-crawler: a red cable worm with a steel head, half out of the rock. */
function veinworm(c: Ctx) {
  shape(c, '#3a322c', () => c.ellipse(10, 18, 9, 3.5, 0, 0, Math.PI * 2), 0.8);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 10; i++) pts.push([8 + i * 3, 16 - Math.sin(i * 0.8) * 4 - i * 0.4]);
  c.strokeStyle = COL.soot;
  c.lineWidth = 6.4;
  c.lineCap = 'round';
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
  c.strokeStyle = BLOOD;
  c.lineWidth = 4.6;
  c.stroke();
  c.strokeStyle = BLOOD_HI;
  c.lineWidth = 1.2;
  c.stroke();
  const [hx, hy] = pts[pts.length - 1];
  shape(c, '#9aa4ae', () => c.ellipse(hx + 2, hy, 5, 3.6, -0.2, 0, Math.PI * 2), 1);
  for (let i = 0; i < 3; i++) shape(c, COL.steam, poly(c, [[hx + 5, hy - 1.5 + i * 1.5], [hx + 7.5, hy - 1 + i * 1.5], [hx + 5, hy - 0.5 + i * 1.5]]), 0);
  redEye(c, hx + 1.5, hy - 1.4, 1);
}

// ---------------------------------------------------------------- the mountains: the Glacier Hangar

/** A frost mite: a small round tracked robot, white shell rimed with frost, a cold blue eye. */
function mite(c: Ctx) {
  shape(c, COL.black, rr(c, 3, 10, 18, 5, 2.4), 0.8);
  for (let i = 0; i < 4; i++) shape(c, '#3a4048', circ(c, 6 + i * 4, 12.5, 1.2), 0);
  shape(c, ICE, () => c.ellipse(12, 8, 8, 5.5, 0, Math.PI, Math.PI * 2), 1.1);
  shape(c, ICE, rr(c, 4, 7, 16, 4, 1), 0.8);
  for (const x of [8, 12, 16]) shape(c, ICE_LO, poly(c, [[x - 1, 3.5], [x, 1], [x + 1, 3.5]]), 0.3);
  eye(c, 17, 7, 1.1, '#bfe4ff', 'rgba(191,228,255,0.7)');
}

/** An ice-auger driller: a squat tracked digger with a big spiral auger out front. */
function driller(c: Ctx) {
  shape(c, COL.black, rr(c, 2, 25, 24, 8, 3.6), 0.9);
  for (let i = 0; i < 5; i++) shape(c, '#3a4048', circ(c, 5.5 + i * 4.3, 29, 1.6), 0);
  shape(c, '#d8a030', rr(c, 4, 12, 20, 14, 3), 1.2);
  shape(c, '#2a2622', rr(c, 6, 15, 8, 5, 1.4), 0.6);
  for (let i = 0; i < 4; i++) shape(c, COL.black, poly(c, [[5 + i * 5, 26], [7 + i * 5, 23], [9 + i * 5, 26]]), 0);
  eye(c, 10, 17.5, 1.2);
  // The auger: a cone with its flighting.
  shape(c, '#9aa4ae', poly(c, [[22, 12], [35, 19], [22, 26]]), 1.1);
  c.strokeStyle = COL.soot;
  c.lineWidth = 0.9;
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(23 + i * 3, 13 + i * 1.6);
    c.lineTo(25 + i * 3, 25 - i * 1.6);
    c.stroke();
  }
  shape(c, ICE_LO, circ(c, 33, 22, 1.2), 0);
  shape(c, ICE_LO, circ(c, 30, 26, 1), 0);
}

// ---------------------------------------------------------------- the ways down

/** The jungle's: a white swan-boat on its rail, nosing into a dark tunnel mouth under a heart sign. */
function wayJungle(c: Ctx) {
  shape(c, '#4a3a2a', () => {
    c.moveTo(8, 100);
    c.lineTo(10, 40);
    c.quadraticCurveTo(60, 8, 110, 40);
    c.lineTo(112, 100);
    c.closePath();
  }, 1.4);
  shape(c, '#05070a', () => {
    c.moveTo(24, 100);
    c.lineTo(26, 54);
    c.quadraticCurveTo(60, 30, 94, 54);
    c.lineTo(96, 100);
    c.closePath();
  }, 0.8);
  for (let i = 0; i < 8; i++) shape(c, i % 2 ? '#5a8a3a' : '#3a6a2a', circ(c, 12 + i * 14, 38 - Math.sin((i / 7) * Math.PI) * 22, 7), 0.8);
  // The heart sign, its bulbs half dead.
  shape(c, COL.red, () => {
    c.moveTo(60, 30);
    c.bezierCurveTo(48, 20, 50, 8, 60, 14);
    c.bezierCurveTo(70, 8, 72, 20, 60, 30);
  }, 1);
  glow(c, 60, 20, 14, 'rgba(255,80,140,0.6)');
  // The channel and the boat.
  shape(c, '#2a5a6a', rr(c, 20, 88, 80, 12, 3), 0.8);
  shape(c, '#e8edf2', () => {
    c.moveTo(34, 92);
    c.quadraticCurveTo(36, 80, 58, 80);
    c.lineTo(78, 82);
    c.quadraticCurveTo(84, 92, 70, 96);
    c.lineTo(40, 96);
    c.closePath();
  }, 1.2);
  shape(c, '#e8edf2', () => {
    c.moveTo(74, 82);
    c.quadraticCurveTo(84, 70, 80, 60);
    c.quadraticCurveTo(86, 56, 88, 62);
    c.quadraticCurveTo(88, 74, 80, 84);
    c.closePath();
  }, 1);
  shape(c, '#e0a030', poly(c, [[88, 60], [94, 62], [88, 64]]), 0.5);
  shape(c, COL.black, circ(c, 85, 60.5, 0.9), 0);
}

/** The city's: escalators going down into a lit pit, a steel frame, a METRO sign on a post. */
function wayCity(c: Ctx) {
  shape(c, '#3a4048', rr(c, 6, 50, 100, 56, 4), 1.4);
  shape(c, '#0a0c10', rr(c, 14, 56, 84, 44, 3), 0.8);
  glow(c, 56, 92, 34, 'rgba(255,214,140,0.35)');
  for (const x of [22, 58]) {
    shape(c, '#9aa4ae', poly(c, [[x, 58], [x + 30, 58], [x + 26, 100], [x + 4, 100]]), 1);
    for (let i = 0; i < 7; i++) shape(c, '#5a6068', rr(c, x + 2 + i * 0.6, 62 + i * 5.6, 26 - i * 1.2, 2, 0.6), 0);
    shape(c, COL.black, rr(c, x - 2, 56, 4, 46, 2), 0.6);
    shape(c, COL.black, rr(c, x + 28, 56, 4, 46, 2), 0.6);
  }
  // The sign.
  shape(c, '#3a4048', rr(c, 52, 10, 4, 42, 1.4), 0.9);
  shape(c, '#e8edf2', rr(c, 34, 6, 40, 14, 3), 1.1);
  shape(c, '#2a5ab0', rr(c, 37, 9, 34, 8, 2), 0.5);
  c.fillStyle = COL.plastic;
  c.font = 'bold 7px sans-serif';
  c.fillText('METRO', 42, 15.6);
  glow(c, 54, 13, 18, 'rgba(120,170,255,0.4)');
}

/** The Wastes': a round iron grate open over a spiral stair, a spiked fence round it, a red lamp. */
function wayDemon(c: Ctx) {
  shape(c, '#2a1c1c', () => c.ellipse(52, 70, 44, 22, 0, 0, Math.PI * 2), 1.4);
  shape(c, '#05070a', () => c.ellipse(52, 70, 34, 15, 0, 0, Math.PI * 2), 0.8);
  for (let i = 0; i < 6; i++) {
    const a = 0.3 + i * 0.5;
    shape(c, '#5a4a40', rr(c, 52 + Math.cos(a) * 18 - 6, 70 + Math.sin(a) * 7 - 1.5, 12, 3, 1), 0.5);
  }
  glow(c, 52, 76, 22, 'rgba(208,64,64,0.4)');
  // The grate, swung open, and the fence.
  shape(c, COL.iron, () => c.ellipse(20, 52, 12, 18, -0.4, 0, Math.PI * 2), 1.2);
  for (let i = -2; i <= 2; i++) shape(c, '#1c1714', rr(c, 18 + i * 4, 38, 1.6, 28, 0.6), 0);
  for (let i = 0; i < 9; i++) {
    const x = 10 + i * 10.5;
    shape(c, COL.black, rr(c, x, 76 - Math.abs(4 - i) * 0 + 4, 2.4, 14, 0.8), 0.5);
    shape(c, COL.black, poly(c, [[x - 1, 80], [x + 1.2, 74], [x + 3.4, 80]]), 0.4);
  }
  shape(c, COL.black, rr(c, 8, 86, 90, 2.4, 1), 0.5);
  shape(c, '#3a3430', rr(c, 86, 28, 3, 50, 1), 0.7);
  shape(c, COL.red, circ(c, 87.5, 26, 3.4), 0.7);
  glow(c, 87.5, 26, 12, 'rgba(255,48,72,0.6)');
}

/** The mountains': a freight elevator's steel doors set in a wall of ice, hazard stripes, a call lamp. */
function wayMountains(c: Ctx) {
  shape(c, ICE, () => {
    c.moveTo(2, 128);
    c.lineTo(8, 30);
    c.lineTo(30, 8);
    c.lineTo(64, 2);
    c.lineTo(96, 12);
    c.lineTo(110, 40);
    c.lineTo(110, 128);
    c.closePath();
  }, 1.4);
  for (const [x, y, w] of [[16, 40, 18], [80, 30, 20], [90, 70, 14], [12, 90, 14]]) shape(c, ICE_LO, rr(c, x, y, w, 3, 1.5), 0);
  shape(c, '#3a4048', rr(c, 24, 36, 64, 92, 3), 1.4);
  shape(c, '#6a7480', rr(c, 30, 46, 25, 80, 1.4), 0.8);
  shape(c, '#6a7480', rr(c, 57, 46, 25, 80, 1.4), 0.8);
  c.save();
  c.beginPath();
  c.rect(26, 38, 60, 7);
  c.clip();
  c.strokeStyle = COL.amber;
  c.lineWidth = 3;
  for (let i = 0; i < 80; i += 8) {
    c.beginPath();
    c.moveTo(20 + i, 46);
    c.lineTo(28 + i, 38);
    c.stroke();
  }
  c.restore();
  shape(c, COL.amber, circ(c, 94, 80, 3.4), 0.7);
  glow(c, 94, 80, 12, 'rgba(255,182,64,0.6)');
  shape(c, ICE, rr(c, 22, 30, 68, 6, 3), 0.8);
}

// ---------------------------------------------------------------- parts

function parts(scene: Phaser.Scene) {
  const P = (key: string, draw: (c: Ctx) => void) => canvas(scene, `part-${key}`, ...BOX[`part-${key}`], draw);
  P('piranha-jaw', (c) => {
    shape(c, COL.plastic, () => c.ellipse(11, 8, 9, 6, 0, 0, Math.PI), 1);
    for (let i = 0; i < 5; i++) shape(c, COL.steam, poly(c, [[4 + i * 3.4, 8], [5.7 + i * 3.4, 4.5], [7.4 + i * 3.4, 8]]), 0.4);
  });
  P('swan-feather', (c) => {
    shape(c, '#f4f0ea', () => c.ellipse(12, 7, 10, 4, -0.2, 0, Math.PI * 2), 1);
    c.strokeStyle = COL.copper;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(1, 10);
    c.lineTo(22, 4);
    c.stroke();
  });
  P('hookhand', (c) => {
    shape(c, COL.brass, rr(c, 2, 10, 12, 8, 2), 1);
    c.strokeStyle = COL.soot;
    c.lineWidth = 3.6;
    c.beginPath();
    c.arc(19, 9, 5, Math.PI * 0.8, Math.PI * 2.3);
    c.stroke();
    c.strokeStyle = COL.ironHi;
    c.lineWidth = 2;
    c.stroke();
  });
  P('price-tag', (c) => {
    shape(c, '#e03a3a', poly(c, [[3, 7], [8, 2], [16, 2], [16, 18], [8, 18], [3, 13]]), 1);
    shape(c, COL.steam, circ(c, 7, 10, 1.4), 0.4);
  });
  P('cart-wheel', (c) => wheel(c, 9, 9, 7));
  P('cop-whistle', (c) => {
    shape(c, COL.brass, rr(c, 2, 3, 12, 7, 3), 1);
    shape(c, COL.brassHi, circ(c, 14, 6.5, 3.4), 0.8);
  });
  P('cop-megaphone', (c) => {
    shape(c, '#eef2f6', poly(c, [[6, 7], [24, 2], [26, 3], [26, 17], [24, 18], [6, 13]]), 1);
    shape(c, '#d03030', rr(c, 2, 7, 5, 6, 1), 0.6);
  });
  P('leech-mouth', (c) => {
    shape(c, '#5a1018', circ(c, 9, 9, 7), 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      shape(c, COL.brassHi, circ(c, 9 + Math.cos(a) * 4.6, 9 + Math.sin(a) * 4.6, 1.1), 0);
    }
  });
  P('vein-cable', (c) => {
    c.strokeStyle = COL.soot;
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(3, 10);
    c.bezierCurveTo(9, 0, 15, 14, 23, 4);
    c.stroke();
    c.strokeStyle = BLOOD;
    c.lineWidth = 3;
    c.stroke();
  });
  P('hemo-pump', (c) => {
    shape(c, '#8a7a5a', rr(c, 6, 2, 10, 16, 3), 1);
    shape(c, BLOOD, circ(c, 11, 20, 5), 1);
    glow(c, 11, 20, 7, 'rgba(208,64,64,0.6)');
  });
  P('frost-carapace', (c) => {
    shape(c, ICE, () => c.ellipse(11, 10, 9, 6, 0, Math.PI, Math.PI * 2), 1);
    shape(c, ICE, rr(c, 2, 9, 18, 4, 1.4), 0.7);
  });
  P('auger-bit', (c) => {
    shape(c, '#9aa4ae', poly(c, [[2, 2], [22, 7], [2, 12]]), 1);
    c.strokeStyle = COL.soot;
    c.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(4 + i * 4, 3 + i);
      c.lineTo(6 + i * 4, 11 - i);
      c.stroke();
    }
  });
  P('ice-auger', (c) => {
    shape(c, '#5a6a7a', rr(c, 1, 5, 16, 4, 2), 0.9);
    shape(c, ICE, poly(c, [[16, 1], [31, 7], [16, 13]]), 1);
  });
}

export function makeDungeonFoeArt(scene: Phaser.Scene) {
  // Here, not at the top: art.ts imports this module (through dungeonart.ts), so SIZE exists only once it has run.
  Object.assign(SIZE, BOX);
  const draw: [string, (c: Ctx) => void][] = [
    ['dungeon-way-jungle', wayJungle],
    ['dungeon-way-city', wayCity],
    ['dungeon-way-demon', wayDemon],
    ['dungeon-way-mountains', wayMountains],
    ['foe-piranha', piranha],
    ['foe-cupid', cupid],
    ['foe-mannequin', mannequin],
    ['foe-cart', cart],
    ['foe-copdrone', copdrone],
    ['foe-leech', leech],
    ['foe-veinworm', veinworm],
    ['foe-mite', mite],
    ['foe-driller', driller],
  ];
  for (const [key, fn] of draw) canvas(scene, key, ...BOX[key], fn);
  parts(scene);
}
