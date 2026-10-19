/**
 * P47's pictures drawn in code: the furniture that says what a building was, the small box and the hive village's turret
 * (painters for `propart.ts`'s `PAINT`), the floors and overgrowth stamped into the baked ground (`floorKey`, `GROWTH`), and the
 * one look per class every prop wears (`classLook`: scenery muted, loot smashables the brass trim and glint). Looks and sizes are
 * guesses (Directive 47). Add a furniture kind: a painter in `FURNITURE` and its `FURNITURE_SIZE`.
 */
import type Phaser from 'phaser';
import { COL, FLOOR, SIZE, canvas, circ, grad, rr, shape, type Ctx } from './art';
import { LINE } from './house';
import type { FloorKind, Material, PropKind, ThingClass } from './sim/defs';

type Paint = (c: Ctx, m: Material, cr: boolean) => void;
type Furniture = 'bed' | 'cabinet' | 'engine' | 'rack' | 'shelf' | 'counter' | 'pew' | 'server' | 'desk' | 'boiler' | 'pipes' | 'box' | 'turret';

export const FURNITURE_SIZE: Record<Furniture, [number, number]> = {
  bed: [36, 26], pew: [40, 22], desk: [34, 28], counter: [40, 30], pipes: [34, 40], cabinet: [24, 38], engine: [36, 28],
  rack: [32, 40], shelf: [34, 42], server: [24, 46], boiler: [40, 52], box: [18, 16], turret: [34, 42],
};

const WOOD = ['#b08650', '#6c4e2c'], TIN = ['#c4cbd0', '#7a838a'];
const crack = (c: Ctx, pts: [number, number, number, number][]) => {
  c.strokeStyle = COL.soot;
  c.lineWidth = LINE.detail * 1.3;
  c.beginPath();
  for (const [x, y, dx, dy] of pts) {
    c.moveTo(x, y);
    c.lineTo(x + dx * 0.45, y + dy * 0.5 + 1.5);
    c.lineTo(x + dx, y + dy);
  }
  c.stroke();
};
const lines = (c: Ctx, col: string, w: number, segs: [number, number, number, number][]) => {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.beginPath();
  for (const [a, b, x, y] of segs) {
    c.moveTo(a, b);
    c.lineTo(x, y);
  }
  c.stroke();
};
const vgrad = (c: Ctx, y0: number, y1: number, [hi, lo]: string[]) => grad(c, 0, y0, 0, y1, [[0, hi], [1, lo]]);

export const FURNITURE: Record<Furniture, Paint> = {
  bed: (c, _m, cr) => {
    // A hospital cot: a tin frame on legs, a grey mattress, a pillow.
    lines(c, COL.iron, 2, [[5, 16, 5, 25], [31, 16, 31, 25]]);
    shape(c, vgrad(c, 8, 20, TIN), rr(c, 2, 10, 32, 9, 2), 1.3);
    shape(c, '#9a968c', rr(c, 4, 6, 28, 7, 2), 1.1);
    shape(c, '#e4dfd2', rr(c, 5, 5, 8, 5, 2), 0.8);
    if (cr) crack(c, [[14, 7, 10, 4], [22, 12, 6, 6]]);
  },
  pew: (c, _m, cr) => {
    // A long wooden bench with a back.
    shape(c, vgrad(c, 2, 12, WOOD), rr(c, 2, 2, 36, 8, 1.5), 1.3);
    shape(c, vgrad(c, 10, 16, WOOD), rr(c, 1, 11, 38, 5, 1.5), 1.3);
    lines(c, '#4a3420', 2, [[5, 16, 5, 21], [35, 16, 35, 21], [20, 16, 20, 21]]);
    if (cr) crack(c, [[10, 3, 8, 6], [26, 12, 6, 4]]);
  },
  desk: (c, _m, cr) => {
    shape(c, vgrad(c, 6, 27, WOOD), rr(c, 3, 10, 28, 16, 1.5), 1.4);
    shape(c, '#c8a06a', rr(c, 1, 6, 32, 5, 1.5), 1.2);
    shape(c, '#6c4e2c', rr(c, 19, 14, 9, 4, 1), 0.6);
    shape(c, '#6c4e2c', rr(c, 19, 20, 9, 4, 1), 0.6);
    shape(c, '#e8e0c8', rr(c, 6, 2, 9, 5, 0.5), 0.6); // papers
    if (cr) crack(c, [[6, 14, 8, 10]]);
  },
  counter: (c, _m, cr) => {
    // A shop counter: a long front panel and a top, a register on it.
    shape(c, vgrad(c, 10, 30, WOOD), rr(c, 2, 12, 36, 17, 1.5), 1.4);
    shape(c, '#c8a06a', rr(c, 1, 9, 38, 5, 1.5), 1.2);
    lines(c, 'rgba(29,26,23,0.5)', LINE.detail, [[12, 14, 12, 28], [24, 14, 24, 28]]);
    shape(c, grad(c, 0, 0, 12, 0, [[0, '#8a9aa6'], [1, '#56626c']]), rr(c, 25, 2, 11, 8, 1), 1);
    shape(c, '#2c3238', rr(c, 27, 3, 7, 3, 0.5), 0.4);
    if (cr) crack(c, [[6, 16, 10, 10], [30, 14, -4, 12]]);
  },
  pipes: (c, _m, cr) => {
    // Brass pipes up from the floor with a valve wheel and a gauge.
    for (const x of [6, 14, 24]) shape(c, grad(c, x, 0, x + 6, 0, [[0, COL.brassHi], [1, COL.brassLo]]), rr(c, x, 6, 5, 33, 2), 1.1);
    shape(c, grad(c, 0, 0, 0, 8, [[0, COL.brassHi], [1, COL.brassLo]]), rr(c, 4, 4, 27, 5, 2), 1.1);
    c.strokeStyle = COL.iron;
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(16.5, 20, 5, 0, Math.PI * 2);
    c.moveTo(11.5, 20);
    c.lineTo(21.5, 20);
    c.moveTo(16.5, 15);
    c.lineTo(16.5, 25);
    c.stroke();
    shape(c, '#f4efe6', circ(c, 27, 14, 3), 0.8);
    if (cr) crack(c, [[7, 12, 2, 14], [25, 24, 2, 10]]);
  },
  cabinet: (c, _m, cr) => {
    // A filing cabinet: three drawers with handles.
    shape(c, grad(c, 0, 0, 24, 0, [[0, '#a8b0b6'], [1, '#62696f']]), rr(c, 2, 3, 20, 34, 1.5), 1.4);
    for (const y of [5, 16, 27]) {
      shape(c, '#8e979d', rr(c, 4, y, 16, 9, 1), 0.8);
      shape(c, '#2c3238', rr(c, 9, y + 3, 6, 2, 0.8), 0.4);
    }
    if (cr) crack(c, [[5, 6, 8, 12], [16, 22, -4, 12]]);
  },
  engine: (c, _m, cr) => {
    // An engine block on the floor: cylinders, a manifold, a belt wheel.
    shape(c, vgrad(c, 8, 27, ['#7a838a', '#3d4246']), rr(c, 3, 10, 30, 17, 2), 1.5);
    for (let i = 0; i < 4; i++) shape(c, vgrad(c, 2, 11, ['#9aa2a8', '#5a6268']), rr(c, 5 + i * 7, 3, 6, 8, 1), 1);
    shape(c, COL.iron, circ(c, 30, 20, 5), 1.1);
    shape(c, '#6a625a', circ(c, 30, 20, 2), 0.6);
    lines(c, '#2a221c', 1.4, [[6, 16, 26, 16], [6, 21, 22, 21]]);
    if (cr) crack(c, [[8, 12, 12, 12], [22, 4, 2, 12]]);
  },
  rack: (c, _m, cr) => {
    // A pegboard of tools: spanners, a saw, a hammer.
    shape(c, vgrad(c, 2, 38, ['#8a7a5a', '#5a4a30']), rr(c, 2, 2, 28, 36, 1.5), 1.4);
    lines(c, COL.ironHi, 2, [[7, 8, 7, 22], [13, 7, 13, 18], [20, 8, 26, 22]]);
    shape(c, COL.iron, rr(c, 5, 6, 5, 3, 1), 0.6);
    shape(c, '#c8c8c0', rr(c, 16, 24, 11, 6, 1), 0.8);
    shape(c, '#6c4e2c', rr(c, 6, 27, 3, 9, 1), 0.6);
    shape(c, COL.iron, rr(c, 4, 25, 7, 3, 1), 0.6);
    if (cr) crack(c, [[4, 10, 10, 16], [22, 6, 4, 18]]);
  },
  shelf: (c, _m, cr) => {
    // A shop shelf: three boards with tins and boxes on them.
    shape(c, vgrad(c, 2, 42, WOOD), rr(c, 2, 2, 30, 39, 1.5), 1.4);
    for (const y of [12, 24, 36]) shape(c, '#c8a06a', rr(c, 3, y, 28, 3, 0.8), 0.6);
    const goods = ['#d8c050', '#9fe0a8', '#e8e8e8', '#e09a62', '#8da0b4'];
    for (let row = 0; row < 3; row++) for (let k = 0; k < 4; k++) if ((row * 3 + k) % 5 !== 3) shape(c, goods[(row + k * 2) % 5], rr(c, 5 + k * 7, 5 + row * 12, 5, 7, 1), 0.5);
    if (cr) crack(c, [[6, 8, 12, 20], [24, 30, -6, 10]]);
  },
  server: (c, _m, cr) => {
    // A server rack: dark, slots, a few lights still on (amber: ours to break, not a threat).
    shape(c, grad(c, 0, 0, 24, 0, [[0, '#4a5258'], [1, '#22282c']]), rr(c, 2, 2, 20, 43, 1.5), 1.4);
    for (let i = 0; i < 7; i++) {
      shape(c, '#30383e', rr(c, 4, 5 + i * 5.5, 16, 4, 0.6), 0.4);
      if (i % 2 === 0) shape(c, COL.amber, circ(c, 17, 7 + i * 5.5, 0.8), 0);
    }
    if (cr) crack(c, [[5, 8, 10, 16], [16, 28, -6, 12]]);
  },
  boiler: (c, _m, cr) => {
    // A steam boiler: a riveted brass drum on a firebox, a stack, a gauge.
    shape(c, COL.iron, rr(c, 6, 38, 28, 13, 2), 1.4);
    shape(c, '#ffb640', rr(c, 15, 42, 10, 5, 1), 0.6);
    shape(c, grad(c, 0, 0, 40, 0, [[0, COL.brassHi], [0.5, COL.brass], [1, COL.brassLo]]), rr(c, 3, 12, 34, 28, 9), 1.6);
    shape(c, COL.iron, rr(c, 26, 1, 6, 13, 1), 1.1);
    for (const x of [8, 14, 20, 26, 32]) shape(c, COL.brassHi, circ(c, x, 16, 0.9), 0.4);
    shape(c, '#f4efe6', circ(c, 13, 27, 4), 0.9);
    lines(c, COL.soot, LINE.detail, [[13, 27, 15, 24]]);
    if (cr) crack(c, [[8, 18, 12, 14], [28, 22, -6, 14]]);
  },
  box: (c, _m, cr) => {
    // A small crate of odds and ends.
    shape(c, vgrad(c, 3, 15, WOOD), rr(c, 2, 4, 14, 11, 1), 1.2);
    lines(c, '#6c4e2c', LINE.detail, [[2, 9, 16, 9]]);
    shape(c, TIN[0], rr(c, 5, 1, 4, 4, 1), 0.6);
    if (cr) crack(c, [[4, 6, 8, 6]]);
  },
  turret: (c, _m, cr) => {
    // A modern turret on a tripod: a grey dome, a barrel, one red lens (a threat: red is theirs).
    lines(c, COL.iron, 2.4, [[17, 30, 6, 41], [17, 30, 28, 41], [17, 30, 17, 41]]);
    shape(c, vgrad(c, 22, 32, ['#7a838a', '#3d4246']), rr(c, 9, 22, 16, 9, 2), 1.3);
    shape(c, grad(c, 0, 4, 0, 24, [[0, '#d0d6da'], [1, '#6a737a']]), () => c.ellipse(17, 16, 11, 9, 0, Math.PI, 0), 1.4);
    shape(c, '#56626c', rr(c, 6, 15, 22, 7, 2), 1.2);
    shape(c, COL.iron, rr(c, 22, 14, 11, 4, 1), 1.1);
    shape(c, '#e8402c', circ(c, 14, 12, 2.6), 0.8);
    shape(c, '#ffd0c0', circ(c, 13.3, 11.3, 0.8), 0);
    if (cr) crack(c, [[10, 8, 10, 8], [20, 22, -6, 6]]);
  },
};

/** A wall's look by era (P47, Minos): brick courses for the steampunk ruins, plain cast slabs for the modern ones. */
export function wallFace(c: Ctx, m: Material) {
  c.strokeStyle = 'rgba(29,26,23,0.5)';
  c.lineWidth = LINE.detail;
  c.beginPath();
  if (m === 'brick') {
    for (let y = 12, row = 0; y < 38; y += 5, row++) {
      c.moveTo(2, y);
      c.lineTo(30, y);
      for (let x = row % 2 ? 6 : 10; x < 30; x += 8) {
        c.moveTo(x, y);
        c.lineTo(x, y + 5);
      }
    }
  } else if (m === 'glass') {
    for (const x of [10, 22]) {
      c.moveTo(x, 8);
      c.lineTo(x, 38);
    }
    c.moveTo(2, 22);
    c.lineTo(30, 22);
  } else if (m === 'wood') {
    for (let x = 6; x < 30; x += 5) {
      c.moveTo(x, 8);
      c.lineTo(x, 38);
    }
  } else {
    c.moveTo(2, 20);
    c.lineTo(30, 20);
    c.moveTo(16, 20);
    c.lineTo(16, 38);
    c.moveTo(9, 8);
    c.lineTo(9, 20);
  }
  c.stroke();
}

// ---------------------------------------------------------------- floors and overgrowth (stamped into the baked ground)

/** A floor tile's frame: two variants of each kind, picked by the tile. */
export const floorKey = (f: FloorKind, v: number) => `floor-${f}-${v % 2}`;
/** Overgrowth decals over a faded floor (`GROWTH` frames: grass, a vine, moss, a bush). */
export const GROWTH = ['grow-0', 'grow-1', 'grow-2', 'grow-3'];
/** A wall's footing: the low course of stones left where a wall stood, so a building's rooms read even with its walls gone. */
export const FOOTING = { h: 'footing-h', v: 'footing-v' };

function footing(c: Ctx, w: number, h: number) {
  c.fillStyle = 'rgba(70,62,52,0.55)';
  c.fillRect(0, 0, w, h);
  const along = w > h, n = 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * (along ? w : h), len = (along ? w : h) / n - 1.5;
    c.fillStyle = i % 2 ? '#8a8274' : '#9a9282';
    c.beginPath();
    if (along) c.roundRect(a + 0.5, 1.5, len, h - 3, 1.5);
    else c.roundRect(1.5, a + 0.5, w - 3, len, 1.5);
    c.fill();
  }
}

const FLOOR_LOOK: Record<FloorKind, (c: Ctx, v: number) => void> = {
  tile: (c, v) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      c.fillStyle = (x + y + v) % 2 ? '#d8d2c4' : '#b8b2a4';
      c.fillRect(x * 16, y * 16, 16, 16);
    }
    c.strokeStyle = 'rgba(40,34,28,0.35)';
    c.lineWidth = 0.8;
    c.strokeRect(0.5, 0.5, 31, 31);
    c.beginPath();
    c.moveTo(16, 0);
    c.lineTo(16, 32);
    c.moveTo(0, 16);
    c.lineTo(32, 16);
    c.stroke();
  },
  concrete: (c, v) => {
    c.fillStyle = v ? '#a29c90' : '#9a9488';
    c.fillRect(0, 0, 32, 32);
    c.strokeStyle = 'rgba(40,34,28,0.35)';
    c.lineWidth = 1;
    c.strokeRect(0.5, 0.5, 31, 31);
    c.fillStyle = 'rgba(60,54,46,0.25)';
    for (let i = 0; i < 6; i++) c.fillRect((i * 13 + v * 7) % 30, (i * 7 + v * 11) % 30, 2, 1.5);
  },
  boards: (c, v) => {
    for (let i = 0; i < 4; i++) {
      c.fillStyle = ['#8a6a44', '#7c5e3a', '#94744c', '#806240'][(i + v) % 4];
      c.fillRect(0, i * 8, 32, 8);
    }
    c.strokeStyle = 'rgba(40,28,18,0.5)';
    c.lineWidth = 0.8;
    c.beginPath();
    for (let i = 0; i <= 4; i++) {
      c.moveTo(0, i * 8);
      c.lineTo(32, i * 8);
      const x = (i * 11 + v * 5) % 28 + 2;
      c.moveTo(x, i * 8);
      c.lineTo(x, i * 8 + 8);
    }
    c.stroke();
  },
  flags: (c, v) => {
    c.fillStyle = '#8c8478';
    c.fillRect(0, 0, 32, 32);
    const stones: [number, number, number, number][] = v ? [[1, 1, 18, 13], [20, 1, 11, 13], [1, 15, 11, 16], [13, 15, 18, 16]] : [[1, 1, 12, 15], [14, 1, 17, 15], [1, 17, 19, 14], [21, 17, 10, 14]];
    for (const [x, y, w, h] of stones) {
      c.fillStyle = (x + y) % 3 ? '#a49c8e' : '#9a9284';
      c.beginPath();
      c.roundRect(x, y, w, h, 2);
      c.fill();
    }
  },
};

const GROWTH_LOOK: ((c: Ctx) => void)[] = [
  (c) => {
    // A tuft of grass.
    c.strokeStyle = '#6a8a3a';
    c.lineWidth = 1.4;
    c.beginPath();
    for (let i = 0; i < 9; i++) {
      const x = 6 + i * 2.4;
      c.moveTo(x, 22);
      c.lineTo(x + (i % 3) - 1, 10 + (i % 4) * 2);
    }
    c.stroke();
  },
  (c) => {
    // A creeping vine with leaves.
    c.strokeStyle = '#4e6a2c';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(2, 18);
    c.bezierCurveTo(10, 8, 18, 24, 30, 12);
    c.stroke();
    c.fillStyle = '#7a9a44';
    for (const [x, y] of [[7, 13], [13, 15], [19, 18], [25, 14]]) {
      c.beginPath();
      c.ellipse(x, y, 3, 1.8, 0.6, 0, Math.PI * 2);
      c.fill();
    }
  },
  (c) => {
    // A patch of moss.
    c.fillStyle = 'rgba(92,120,58,0.75)';
    for (const [x, y, r] of [[10, 14, 7], [18, 12, 6], [22, 17, 5], [13, 18, 5]]) {
      c.beginPath();
      c.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
      c.fill();
    }
  },
  (c) => {
    // A small bush.
    for (const [x, y, r, col] of [[12, 15, 7, '#4e6a2c'], [20, 14, 6, '#5e7a34'], [16, 10, 6, '#6e8a3c']] as [number, number, number, string][]) {
      c.fillStyle = col;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  },
];

/** The floor and growth pictures, plain (no outline: they lie on the ground); `propart.ts` packs them into its atlas. */
export function makeFloorArt(scene: Phaser.Scene): string[] {
  const made: string[] = [];
  for (const f of Object.keys(FLOOR_LOOK) as FloorKind[])
    for (const v of [0, 1]) {
      const k = floorKey(f, v);
      FLOOR.add(k);
      SIZE[k] = [32, 32];
      canvas(scene, k, 32, 32, (c) => FLOOR_LOOK[f](c, v));
      made.push(k);
    }
  for (const [k, w, h] of [[FOOTING.h, 32, 10], [FOOTING.v, 10, 32]] as [string, number, number][]) {
    FLOOR.add(k);
    SIZE[k] = [w, h];
    canvas(scene, k, w, h, (c) => footing(c, w, h));
    made.push(k);
  }
  GROWTH.forEach((k, i) => {
    FLOOR.add(k);
    SIZE[k] = [32, 26];
    canvas(scene, k, 32, 26, GROWTH_LOOK[i]);
    made.push(k);
  });
  return made;
}

// ---------------------------------------------------------------- one look per class (P47 part A)

/**
 * How much colour each class keeps: scenery is muted (walls a little less, so their material still reads), the rest keep theirs.
 * Loot smashables wear one cue, the same on every kind (lead's guess): a brass trim along the foot and a faint glint up on the
 * body. The turret is a threat and wears its red, not the cue.
 */
export const CLASS_LOOK = { mute: 0.5, muteWall: 0.3, darken: 0.9, trim: '#e8c060', trimLo: '#8a6420', glint: '#fff6d8' };

/** Apply a class's look to a finished prop texture (its canvas, after the house pass). */
export function classLook(scene: Phaser.Scene, key: string, cls: ThingClass, kind: PropKind) {
  const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  const c = tex.getContext(), W = tex.width, H = tex.height;
  if (cls === 'scenery') {
    const k = kind === 'wall' ? CLASS_LOOK.muteWall : CLASS_LOOK.mute;
    const img = c.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
      for (let j = 0; j < 3; j++) d[i + j] = (d[i + j] + (l - d[i + j]) * k) * CLASS_LOOK.darken;
    }
    c.putImageData(img, 0, 0);
  } else if (cls === 'loot' && kind !== 'turret') {
    // The opaque box: the trim follows the foot of the picture, the glint sits near its top right.
    const img = c.getImageData(0, 0, W, H), d = img.data;
    let x0 = W, x1 = 0, y0 = H, y1 = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 128) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    if (x1 <= x0) return;
    const s = W / SIZE[key][0], band = Math.max(2, Math.round(2.4 * s));
    c.save();
    c.globalCompositeOperation = 'source-atop';
    const g = c.createLinearGradient(0, y1 - band * 2, 0, y1);
    g.addColorStop(0, CLASS_LOOK.trim);
    g.addColorStop(1, CLASS_LOOK.trimLo);
    c.fillStyle = g;
    c.fillRect(x0, y1 - band * 2 - s, x1 - x0 + 1, band);
    c.restore();
    c.save();
    const gx = x1 - (x1 - x0) * 0.22, gy = y0 + (y1 - y0) * 0.2, r = 2.6 * s;
    c.fillStyle = CLASS_LOOK.glint;
    c.globalAlpha = 0.9;
    c.beginPath();
    c.moveTo(gx, gy - r);
    c.lineTo(gx + r * 0.25, gy - r * 0.25);
    c.lineTo(gx + r, gy);
    c.lineTo(gx + r * 0.25, gy + r * 0.25);
    c.lineTo(gx, gy + r);
    c.lineTo(gx - r * 0.25, gy + r * 0.25);
    c.lineTo(gx - r, gy);
    c.lineTo(gx - r * 0.25, gy - r * 0.25);
    c.closePath();
    c.fill();
    c.restore();
  }
  tex.refresh();
}
