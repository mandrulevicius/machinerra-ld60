/**
 * The biomes' own machines (`FOES` in sim/defs.ts, `BIOMES.<biome>.foes`), drawn in code in the house style (`art.ts`)
 * until painted ones arrive: modern tech, so white or coloured plastic over black joints, cyan eyes, LEDs. The Rustwood
 * Jungle's animatronic beasts (pounce-cat, ramjet boar, spanner monkey), the Hollow City's androids and robot horse
 * (commuter, officer unit, carousel charger), the Frostspine's goats and bird (ram-goat, bleater, talon kite), and each
 * one's part; and their dusk bosses' uniques (the bosses themselves are paintings: `art-src/foe/<kind>-boss.svg`, see
 * `Play.bossForms`). Every foe faces right (Play flips it), its feet at the bottom of its box. Play draws `foe-<kind>`
 * over any atlas painting.
 * Add one: a `BOX` line, a `canvas` call in `makeBiomeArt`, and its `part-<kind>`.
 */
import type Phaser from 'phaser';
import { COL, SIZE, canvas, circ, glow, rivets, rr, shape, type Ctx } from './art';
import { LINE } from './house';

const BOX: Record<string, [number, number]> = {
  'foe-cat': [46, 28],
  'foe-boar': [52, 34],
  'foe-monkey': [30, 32],
  'foe-commuter': [26, 44],
  'foe-officer': [28, 46],
  'foe-charger': [58, 46],
  'foe-goat': [42, 36],
  'foe-bleater': [28, 22],
  'foe-kite': [54, 30],
  'part-cat-haunches': [24, 20],
  'part-boar-tusk': [26, 14],
  'part-monkey-arm': [28, 14],
  'part-commuter-case': [22, 18],
  'part-officer-badge': [18, 20],
  'part-charger-legs': [24, 22],
  'part-goat-horns': [26, 18],
  'part-bleater-box': [20, 18],
  'part-kite-wings': [30, 16],
  'part-ironback-drum': [26, 24],
  'part-paladin-lance': [34, 14],
  'part-polaris-core': [26, 22],
};

/** A leg: a black strut from hip to foot, a joint at the knee, a foot pad. */
function leg(c: Ctx, x0: number, y0: number, kx: number, ky: number, x1: number, y1: number, w = 2.6, foot = COL.black) {
  c.strokeStyle = COL.soot;
  c.lineWidth = w + 1.4;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(kx, ky);
  c.lineTo(x1, y1);
  c.stroke();
  c.strokeStyle = COL.black;
  c.lineWidth = w;
  c.stroke();
  shape(c, '#3a4048', circ(c, kx, ky, w * 0.55), 0.5);
  shape(c, foot, rr(c, x1 - 2.4, y1 - 1.4, 4.8, 2.4, 1), 0.5);
}

/** A cyan eye with its glow. */
function eye(c: Ctx, x: number, y: number, r = 1.2, col = COL.cyan, halo = 'rgba(61,242,255,0.6)') {
  shape(c, col, circ(c, x, y, r), 0.4);
  glow(c, x, y, r * 3, halo);
}

/** The Pounce-cat: a clockwork jaguar, amber plates with black rosettes, crouched low, tail up and flicking. */
function cat(c: Ctx) {
  leg(c, 13, 16, 9, 21, 12, 27);
  leg(c, 32, 16, 35, 21, 33, 27);
  // The tail: a chain of segments curling up behind.
  for (let i = 0; i < 6; i++) shape(c, i % 2 ? '#d8902a' : COL.black, circ(c, 8 - i * 1.2, 14 - i * 1.9, 1.8 - i * 0.12), 0.5);
  shape(c, '#e8a43a', () => {
    c.moveTo(8, 16);
    c.quadraticCurveTo(10, 8, 22, 9);
    c.quadraticCurveTo(34, 8, 37, 13);
    c.quadraticCurveTo(36, 20, 24, 20);
    c.quadraticCurveTo(12, 21, 8, 16);
    c.closePath();
  }, 1.2);
  for (const [x, y] of [[14, 13], [19, 11], [24, 14], [29, 11], [18, 17], [28, 17]]) shape(c, COL.black, circ(c, x, y, 1.3), 0);
  leg(c, 16, 17, 19, 22, 17, 27, 2.8);
  leg(c, 30, 17, 27, 22, 30, 27, 2.8);
  // The head: a wedge, a white muzzle, ears, one cyan eye.
  shape(c, '#e8a43a', () => {
    c.moveTo(34, 9);
    c.lineTo(36, 4);
    c.lineTo(39, 7);
    c.lineTo(42, 6);
    c.lineTo(45, 12);
    c.lineTo(42, 16);
    c.lineTo(35, 16);
    c.closePath();
  }, 1.1);
  shape(c, COL.plastic, rr(c, 39, 11, 6, 4.5, 2), 0.6);
  shape(c, COL.black, circ(c, 44.3, 12, 0.9), 0);
  eye(c, 40, 9.2, 1.1);
}

/** The Ramjet boar: a squat grey-brown tank on short legs, piston tusks forward, an exhaust stack on its back. */
function boar(c: Ctx) {
  leg(c, 14, 24, 12, 28, 13, 33, 3.4);
  leg(c, 36, 24, 38, 28, 37, 33, 3.4);
  shape(c, '#6a5a4c', rr(c, 20, 3, 5, 9, 1.5), 1);
  c.fillStyle = 'rgba(200,200,200,0.5)';
  c.beginPath();
  c.arc(22.5, 2.5, 2.5, 0, Math.PI * 2);
  c.fill();
  shape(c, '#8a7462', () => {
    c.moveTo(6, 20);
    c.quadraticCurveTo(6, 9, 22, 9);
    c.quadraticCurveTo(38, 8, 42, 14);
    c.lineTo(44, 24);
    c.quadraticCurveTo(26, 28, 8, 25);
    c.closePath();
  }, 1.3);
  // Plates and rivets along the flank, a bristle ridge of black spikes.
  shape(c, '#6a5a4c', rr(c, 14, 15, 20, 7, 2), 0.8);
  rivets(c, [[16, 18.5], [21, 18.5], [26, 18.5], [31, 18.5]]);
  for (let i = 0; i < 5; i++) shape(c, COL.black, () => {
    const x = 12 + i * 5;
    c.moveTo(x, 10.5 - (i === 2 ? 0 : 0));
    c.lineTo(x + 2, 6.5);
    c.lineTo(x + 4, 10);
    c.closePath();
  }, 0.5);
  leg(c, 18, 25, 20, 29, 18, 33, 3.4);
  leg(c, 32, 25, 30, 29, 32, 33, 3.4);
  // The snout: a steel drum with a grille, the piston tusks, a red eye.
  shape(c, '#9aa4ae', rr(c, 40, 14, 9, 9, 3), 1);
  for (let i = 0; i < 3; i++) shape(c, COL.black, rr(c, 46, 15.5 + i * 2.4, 2, 1.2, 0.5), 0);
  shape(c, COL.plastic, () => {
    c.moveTo(41, 22);
    c.quadraticCurveTo(50, 24, 51, 17);
    c.lineTo(49.5, 18);
    c.quadraticCurveTo(48, 21.5, 41, 20);
    c.closePath();
  }, 0.7);
  eye(c, 39, 13, 1.3, COL.red, 'rgba(255,48,72,0.6)');
}

/** The Spanner monkey: lanky, tan plastic, a big round face plate, long arms, one hand holding a spanner up. */
function monkey(c: Ctx) {
  leg(c, 12, 20, 9, 25, 11, 31, 2.2);
  leg(c, 18, 20, 21, 25, 19, 31, 2.2);
  // The tail, a coiled cable.
  c.strokeStyle = COL.black;
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(10, 20);
  c.bezierCurveTo(2, 22, 2, 12, 6, 12);
  c.stroke();
  shape(c, '#b98a58', rr(c, 9, 12, 12, 10, 4), 1.1);
  shape(c, '#e6d0a8', rr(c, 12, 14, 6, 6, 2.5), 0.5);
  // The arm up with the spanner, the other hanging long.
  leg(c, 19, 13, 24, 9, 25, 3, 2);
  shape(c, '#9aa4ae', rr(c, 23.5, 0.5, 3, 7, 1), 0.7);
  shape(c, '#9aa4ae', circ(c, 25, 1.5, 2.2), 0.7);
  shape(c, COL.black, circ(c, 25, 0.8, 0.9), 0);
  leg(c, 11, 14, 6, 20, 7, 26, 2);
  // The head: a round dark rim, a cream face plate, two cyan eyes, ears.
  shape(c, '#b98a58', circ(c, 9, 7, 2.2), 0.7);
  shape(c, '#b98a58', circ(c, 21, 7, 2.2), 0.7);
  shape(c, '#7a5a38', circ(c, 15, 7.5, 6), 1);
  shape(c, '#e6d0a8', rr(c, 11, 5, 8, 6.5, 3), 0.5);
  eye(c, 13.6, 7.4, 0.9);
  eye(c, 16.8, 7.4, 0.9);
  shape(c, COL.black, rr(c, 13.5, 9.8, 3.5, 0.9, 0.4), 0);
}

/** A humanised android: white face and hands, cyan eyes, a suit; the commuter carries a briefcase, the officer a cap, a taser and a light. */
function android(c: Ctx, w: number, suit: string, officer: boolean) {
  const x = w / 2;
  leg(c, x - 2.5, 30, x - 3.5, 36, x - 3, 43, 2.8);
  leg(c, x + 2.5, 30, x + 3.5, 36, x + 3.5, 43, 2.8);
  // Suit body, shirt and tie (commuter) or belt and badge (officer).
  shape(c, suit, rr(c, x - 6.5, 15, 13, 17, 3), 1.2);
  if (officer) {
    shape(c, COL.black, rr(c, x - 6.5, 27, 13, 2.4, 0.5), 0);
    shape(c, COL.brass, circ(c, x - 2.5, 19.5, 1.6), 0.5);
  } else {
    shape(c, COL.plastic, () => {
      c.moveTo(x - 3, 15);
      c.lineTo(x, 21);
      c.lineTo(x + 3, 15);
      c.closePath();
    }, 0.4);
    shape(c, COL.red, rr(c, x - 0.8, 16, 1.6, 7, 0.6), 0.3);
  }
  // The arm in front, and what it carries.
  leg(c, x + 4.5, 17, x + 7, 23, x + 7, 28, 2.4, COL.plastic);
  if (officer) {
    shape(c, '#2a2e36', rr(c, x + 6, 25, 6, 3, 1), 0.6);
    eye(c, x + 12.5, 26.5, 0.8);
  } else {
    shape(c, '#4a3020', rr(c, x + 3, 28, 9, 7, 1.2), 0.9);
    shape(c, COL.brass, rr(c, x + 6, 26.5, 3, 2, 0.6), 0.4);
  }
  // The head: an egg of white plastic, a black visor band, two cyan eyes, a smile line.
  shape(c, COL.plastic, () => c.ellipse(x, 9, 5.5, 6.5, 0, 0, Math.PI * 2), 1.1);
  shape(c, COL.black, rr(c, x - 4.5, 6.5, 9.5, 3.4, 1.6), 0);
  eye(c, x - 0.2, 8.2, 0.85);
  eye(c, x + 3, 8.2, 0.85);
  c.strokeStyle = '#8a929a';
  c.lineWidth = LINE.detail;
  c.beginPath();
  c.arc(x + 1.5, 11.5, 2, 0.2, Math.PI - 0.6);
  c.stroke();
  if (officer) {
    shape(c, '#1c2a4a', () => {
      c.moveTo(x - 6, 4.5);
      c.lineTo(x + 7.5, 4.5);
      c.lineTo(x + 5, 1);
      c.lineTo(x - 4, 1);
      c.closePath();
    }, 0.9);
    shape(c, COL.black, rr(c, x - 1, 4, 9, 1.6, 0.6), 0);
    shape(c, COL.red, circ(c, x - 1.5, 0.8, 1.1), 0.3);
    shape(c, '#4080ff', circ(c, x + 1.5, 0.8, 1.1), 0.3);
    glow(c, x, 0.8, 4, 'rgba(255,60,80,0.45)');
  } else {
    shape(c, '#3a3028', () => c.ellipse(x, 3.8, 5.2, 2.2, 0, Math.PI, Math.PI * 2), 0.6);
  }
}

/** The Carousel charger: a white carousel horse gone feral, gold mane and saddle, the stub of its brass pole, mid-gallop. */
function charger(c: Ctx) {
  leg(c, 16, 28, 10, 35, 8, 44, 3.2);
  leg(c, 42, 28, 50, 34, 54, 41, 3.2);
  // The pole stub through its back.
  shape(c, COL.brass, rr(c, 27, 4, 3, 16, 1), 0.9);
  shape(c, COL.brassHi, circ(c, 28.5, 4, 2.2), 0.6);
  // The body, a white barrel with painted trim.
  shape(c, COL.plastic, () => c.ellipse(29, 24, 16, 7.5, -0.08, 0, Math.PI * 2), 1.3);
  shape(c, '#c03040', rr(c, 22, 17.5, 12, 6, 2), 0.7);
  shape(c, COL.brass, rr(c, 21, 22, 14, 2, 0.8), 0.5);
  rivets(c, [[24, 20.5], [28, 20.5], [32, 20.5]]);
  // Neck and head reaching forward, a gold mane of spikes, a cyan eye and a red LED nostril.
  shape(c, COL.plastic, () => {
    c.moveTo(40, 22);
    c.quadraticCurveTo(44, 12, 48, 8);
    c.lineTo(56, 13);
    c.lineTo(55, 17);
    c.lineTo(49, 16);
    c.quadraticCurveTo(48, 22, 45, 27);
    c.closePath();
  }, 1.2);
  for (let i = 0; i < 4; i++) shape(c, COL.brassHi, () => {
    const x = 40 + i * 2.6, y = 20 - i * 3.4;
    c.moveTo(x, y);
    c.lineTo(x - 3, y - 2.5);
    c.lineTo(x + 1.5, y - 2.5);
    c.closePath();
  }, 0.5);
  shape(c, COL.plastic, () => {
    c.moveTo(47, 9);
    c.lineTo(47.5, 4.5);
    c.lineTo(50, 8);
    c.closePath();
  }, 0.6);
  eye(c, 50.5, 10.5, 1.1);
  shape(c, COL.red, circ(c, 55, 14.5, 0.8), 0);
  // The tail, a sweep of gold.
  shape(c, COL.brass, () => {
    c.moveTo(13, 21);
    c.quadraticCurveTo(4, 20, 3, 30);
    c.quadraticCurveTo(8, 25, 14, 25);
    c.closePath();
  }, 0.8);
  leg(c, 20, 29, 22, 36, 18, 44, 3.2);
  leg(c, 38, 29, 37, 36, 40, 44, 3.2);
}

/** The Ram-goat: blocky white plastic, black curled horns of ribbed rubber, a lowered head, a cyan eye. */
function goat(c: Ctx, w: number, h: number, small: boolean) {
  const k = small ? 0.62 : 1;
  c.save();
  c.translate(0, h - 36 * k);
  c.scale(k, k);
  leg(c, 10, 22, 8, 28, 9, 35, 3);
  leg(c, 28, 22, 30, 28, 29, 35, 3);
  shape(c, small ? '#f0f4f8' : '#dce2e8', rr(c, 4, 11, 30, 13, 5), 1.3);
  // Shaggy panels on the flank.
  for (let i = 0; i < 4; i++) shape(c, '#c4ccd4', rr(c, 8 + i * 6, 17, 5, 6, 2), 0.5);
  leg(c, 13, 23, 15, 29, 13, 35, 3);
  leg(c, 25, 23, 23, 29, 26, 35, 3);
  // The head, low and forward, a beard of cable, horns.
  shape(c, '#dce2e8', rr(c, 31, 10, 9, 10, 3), 1.1);
  shape(c, COL.black, rr(c, 33, 19, 3, 4, 1), 0.4);
  if (small) {
    shape(c, COL.black, circ(c, 33, 8, 2), 0.4);
    shape(c, COL.red, circ(c, 39.5, 17, 1.4), 0.3);
    glow(c, 39.5, 17, 4, 'rgba(255,48,72,0.5)');
  } else {
    c.strokeStyle = COL.soot;
    c.lineWidth = 4.4;
    c.beginPath();
    c.arc(32, 10, 5, Math.PI * 0.9, Math.PI * 2.25);
    c.stroke();
    c.strokeStyle = COL.black;
    c.lineWidth = 3.2;
    c.stroke();
    c.strokeStyle = '#3a4048';
    c.lineWidth = LINE.detail;
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1 + i * 0.25);
      c.beginPath();
      c.moveTo(32 + Math.cos(a) * 3.4, 10 + Math.sin(a) * 3.4);
      c.lineTo(32 + Math.cos(a) * 6.6, 10 + Math.sin(a) * 6.6);
      c.stroke();
    }
  }
  eye(c, 36.5, 13, 1.1);
  c.restore();
  void w;
}

/** The Talon kite: a mech eagle seen side-on in a glide, wide grey wings with feather plates, talons out, a cyan eye. */
function kite(c: Ctx) {
  // The far wing, darker.
  shape(c, '#6a727a', () => {
    c.moveTo(24, 12);
    c.lineTo(10, 2);
    c.lineTo(34, 9);
    c.closePath();
  }, 0.9);
  shape(c, '#b8c0c8', () => c.ellipse(26, 15, 13, 5, -0.05, 0, Math.PI * 2), 1.2);
  // Tail fan.
  shape(c, '#8a929a', () => {
    c.moveTo(14, 14);
    c.lineTo(3, 11);
    c.lineTo(3, 19);
    c.closePath();
  }, 0.8);
  // The near wing: plates stepping out to the tip.
  shape(c, '#dce2e8', () => {
    c.moveTo(20, 15);
    c.lineTo(8, 27);
    c.lineTo(16, 26);
    c.lineTo(20, 29);
    c.lineTo(26, 25);
    c.lineTo(32, 16);
    c.closePath();
  }, 1.1);
  for (let i = 0; i < 3; i++) shape(c, '#8a929a', rr(c, 13 + i * 5, 22 - i * 2.5, 4, 1.4, 0.5), 0);
  // Talons.
  leg(c, 28, 19, 30, 23, 29, 27, 1.8);
  // The head: white plastic, a black beak hook, a cyan eye.
  shape(c, COL.plastic, circ(c, 40, 12, 4.6), 1);
  shape(c, '#e0a020', () => {
    c.moveTo(43.5, 10.5);
    c.lineTo(50, 12.5);
    c.lineTo(46, 16);
    c.lineTo(43.5, 14);
    c.closePath();
  }, 0.8);
  eye(c, 41.5, 11, 1.1);
}

export function makeBiomeArt(scene: Phaser.Scene) {
  Object.assign(SIZE, BOX);
  const draw = (key: string, f: (c: Ctx, w: number, h: number) => void) => canvas(scene, key, ...BOX[key], (c) => f(c, ...BOX[key]));
  draw('foe-cat', cat);
  draw('foe-boar', boar);
  draw('foe-monkey', monkey);
  draw('foe-commuter', (c, w) => android(c, w, '#4a525c', false));
  draw('foe-officer', (c, w) => android(c, w, '#1c2a4a', true));
  draw('foe-charger', charger);
  draw('foe-goat', (c, w, h) => goat(c, w, h, false));
  draw('foe-bleater', (c, w, h) => goat(c, w, h, true));
  draw('foe-kite', kite);
  draw('part-ironback-drum', (c) => {
    shape(c, COL.brass, rr(c, 3, 6, 20, 14, 3), 1.1);
    shape(c, COL.plastic, () => c.ellipse(13, 6.5, 10, 3.5, 0, 0, Math.PI * 2), 0.8);
    for (let i = 0; i < 4; i++) shape(c, COL.red, rr(c, 5 + i * 5, 10, 1.4, 9, 0.5), 0);
    leg(c, 6, 1, 9, 3, 11, 5, 1.4);
  });
  draw('part-paladin-lance', (c) => {
    shape(c, '#e8edf2', () => {
      c.moveTo(4, 6);
      c.lineTo(33, 7);
      c.lineTo(4, 9);
      c.closePath();
    }, 0.9);
    for (let i = 0; i < 3; i++) shape(c, '#c03040', rr(c, 12 + i * 6, 6.3, 2.6, 2.2, 0.3), 0);
    shape(c, '#9aa4ae', () => {
      c.moveTo(4, 2);
      c.lineTo(11, 7.5);
      c.lineTo(4, 13);
      c.closePath();
    }, 0.8);
  });
  draw('part-polaris-core', (c) => {
    shape(c, '#e4e8ec', rr(c, 2, 8, 22, 9, 3), 1.1);
    for (let i = 0; i < 4; i++) shape(c, COL.black, circ(c, 5 + i * 5.3, 18, 2.2), 0.5);
    shape(c, COL.black, circ(c, 13, 8, 5), 0.8);
    glow(c, 13, 8, 6, 'rgba(255,170,80,0.8)');
    shape(c, '#ffd070', circ(c, 13, 8, 2), 0);
  });

  draw('part-cat-haunches', (c) => {
    leg(c, 8, 6, 4, 12, 7, 18, 3);
    leg(c, 16, 6, 20, 12, 17, 18, 3);
    shape(c, '#e8a43a', rr(c, 4, 2, 16, 7, 3), 1);
    shape(c, COL.brass, circ(c, 12, 5.5, 2.2), 0.6);
  });
  draw('part-boar-tusk', (c) => {
    shape(c, '#9aa4ae', rr(c, 2, 4, 10, 7, 2), 1);
    shape(c, COL.plastic, () => {
      c.moveTo(11, 9);
      c.quadraticCurveTo(22, 12, 24, 3);
      c.lineTo(21.5, 4.5);
      c.quadraticCurveTo(19, 9, 11, 6.5);
      c.closePath();
    }, 0.8);
  });
  draw('part-monkey-arm', (c) => {
    leg(c, 3, 10, 12, 4, 22, 9, 2.4);
    shape(c, '#9aa4ae', circ(c, 24, 8, 3), 0.8);
    shape(c, COL.black, circ(c, 24.5, 7.5, 1.2), 0);
  });
  draw('part-commuter-case', (c) => {
    shape(c, '#4a3020', rr(c, 2, 5, 18, 12, 2), 1.1);
    shape(c, COL.brass, rr(c, 8, 2, 6, 4, 1), 0.7);
    shape(c, COL.brass, rr(c, 4, 9, 3, 2, 0.5), 0.4);
    shape(c, COL.brass, rr(c, 15, 9, 3, 2, 0.5), 0.4);
  });
  draw('part-officer-badge', (c) => {
    shape(c, COL.brass, () => {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 4.5 : 8;
        if (i) c.lineTo(9 + Math.cos(a) * r, 10 + Math.sin(a) * r);
        else c.moveTo(9 + Math.cos(a) * r, 10 + Math.sin(a) * r);
      }
      c.closePath();
    }, 1);
    shape(c, COL.brassHi, circ(c, 9, 10, 2.6), 0.5);
    eye(c, 9, 10, 0.9);
  });
  draw('part-charger-legs', (c) => {
    leg(c, 8, 3, 4, 10, 6, 20, 3);
    leg(c, 16, 3, 20, 11, 17, 20, 3);
    shape(c, COL.brass, rr(c, 4, 18, 5, 3, 1), 0.6);
    shape(c, COL.brass, rr(c, 15, 18, 5, 3, 1), 0.6);
  });
  draw('part-goat-horns', (c) => {
    for (const [x, dir] of [[8, -1], [18, 1]] as const) {
      c.strokeStyle = COL.soot;
      c.lineWidth = 4.2;
      c.beginPath();
      c.arc(x, 10, 5, dir < 0 ? Math.PI * 0.3 : Math.PI * 0.7, dir < 0 ? Math.PI * 1.6 : Math.PI * -0.6, dir < 0);
      c.stroke();
      c.strokeStyle = COL.black;
      c.lineWidth = 3;
      c.stroke();
    }
    shape(c, '#dce2e8', rr(c, 9, 12, 8, 5, 2), 0.8);
  });
  draw('part-bleater-box', (c) => {
    shape(c, '#f0f4f8', rr(c, 2, 3, 16, 13, 3), 1.1);
    for (let i = 0; i < 3; i++) shape(c, COL.black, rr(c, 5, 6 + i * 3, 7, 1.2, 0.5), 0);
    shape(c, COL.red, circ(c, 14.5, 7, 1.6), 0.4);
    glow(c, 14.5, 7, 4, 'rgba(255,48,72,0.5)');
  });
  draw('part-kite-wings', (c) => {
    for (const dir of [-1, 1]) shape(c, dir < 0 ? '#b8c0c8' : '#dce2e8', () => {
      c.moveTo(15, 8);
      c.lineTo(15 + dir * 13, 2);
      c.lineTo(15 + dir * 11, 9);
      c.lineTo(15 + dir * 13, 14);
      c.closePath();
    }, 1);
    shape(c, COL.black, circ(c, 15, 8, 2.2), 0.5);
  });
}
