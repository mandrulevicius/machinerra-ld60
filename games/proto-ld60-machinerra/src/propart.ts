/**
 * The props' textures (P39, `sim/props.ts`), drawn in code: each kind whole and cracked (`prop-<kind>` and `prop-<kind>-cracked`;
 * a wall and a heap of debris per material, `prop-wall-<material>`), and the rubble a broken one leaves, one per material
 * (`prop-rubble-<material>`). Look: a prop's own paint, never a signal colour (red is for danger, so no red barrels).
 * Every picture is also a frame of `PROP_ATLAS` (named by its `propKey`): that is what the land's props draw from (`propview.ts`),
 * so a pooled sprite changes state by changing frame and everything batches as one texture. The separate textures stay for the
 * places that draw a prop by key (the bench, the Cold Box).
 * Add a kind: a `PAINT` entry and its `SIZE` row; add a material: a `MAT` row.
 */
import type Phaser from 'phaser';
import { COL, S, SIZE, canvas, circ, grad, rr, shape, type Ctx } from './art';
import { FURNITURE, FURNITURE_SIZE, classLook, makeFloorArt, wallFace } from './buildingart';
import { LINE } from './house';
import { WEAR, wearItem } from './itemwear';
import type { Material, PropKind } from './sim/defs';
import { MATERIALS, PROPS } from './sim/defs';

/** Light and shade of each material. */
export const MAT: Record<Material, [string, string]> = {
  wood: ['#b08650', '#6c4e2c'],
  tin: ['#c4cbd0', '#7a838a'],
  glass: ['#d6efec', '#8dbab6'],
  brass: ['#f0cf7a', '#7a5a22'],
  concrete: ['#aea89c', '#6c675d'],
  brick: ['#b0705a', '#6a3c2c'],
};

export const PROP_SIZE: Record<PropKind, [number, number]> = {
  wall: [32, 40], debris: [30, 18], crate: [30, 32], barrel: [22, 32], tank: [36, 46], tower: [50, 88],
  transformer: [34, 44], car: [78, 42], propane: [20, 30], vending: [32, 54],
  fridge: [40, 58], ball: [20, 20], shell: [14, 26], sign: [44, 34],
  ...FURNITURE_SIZE,
};

const body = (c: Ctx, m: Material, x0: number, y0: number, x1: number, y1: number) => grad(c, x0, y0, x1, y1, [[0, MAT[m][0]], [1, MAT[m][1]]]);

/** Cracks over a body: dark lines from a few points. */
function cracks(c: Ctx, pts: [number, number, number, number][]) {
  c.strokeStyle = COL.soot;
  c.lineWidth = LINE.detail * 1.3;
  for (const [x, y, dx, dy] of pts) {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + dx * 0.4, y + dy * 0.5 + 2);
    c.lineTo(x + dx * 0.7, y + dy * 0.6 - 2);
    c.lineTo(x + dx, y + dy);
    c.stroke();
  }
}

type Paint = (c: Ctx, m: Material, cr: boolean) => void;

const PAINT: Record<PropKind, Paint> = {
  wall: (c, m, cr) => {
    // A length of wall, its face by material (P47: brick, slabs, planks, panes). Whole, its top is straight under a coping;
    // cracked, the top is ragged and it is split. Each tile's piece meets its neighbours', so a run reads as one wall.
    shape(c, body(c, m, 0, 0, 0, 40), () => {
      c.moveTo(0, 38);
      if (cr) {
        c.lineTo(1, 12);
        c.lineTo(8, 8);
        c.lineTo(14, 11);
        c.lineTo(20, 5);
        c.lineTo(27, 9);
        c.lineTo(32, 6);
      } else {
        c.lineTo(0, 6);
        c.lineTo(32, 6);
      }
      c.lineTo(32, 38);
      c.closePath();
    }, 1.4);
    wallFace(c, m);
    if (!cr) shape(c, MAT[m][0], rr(c, -1, 3, 34, 4, 1), 1);
    else cracks(c, [[8, 24, 10, 12], [22, 10, -6, 12]]);
  },
  debris: (c, m, cr) => {
    const n = cr ? 3 : 5;
    for (let i = 0; i < n; i++) shape(c, body(c, m, 0, 0, 0, 16), rr(c, 3 + i * 5, 8 - (i % 2) * 3, 8, 7, 2), 1);
  },
  crate: (c, m, cr) => {
    shape(c, body(c, 'wood', 0, 0, 0, 32), rr(c, 3, 6, 24, 24, 2), 1.4);
    c.strokeStyle = MAT.wood[1];
    c.lineWidth = LINE.detail * 1.5;
    c.beginPath();
    c.moveTo(3, 6);
    c.lineTo(27, 30);
    c.moveTo(27, 6);
    c.lineTo(3, 30);
    c.stroke();
    if (cr) cracks(c, [[6, 8, 10, 14], [20, 28, 4, -14]]);
    void m;
  },
  barrel: (c, m, cr) => {
    // Crude: black with a faded yellow band, never red.
    shape(c, grad(c, 2, 0, 20, 0, [[0, '#46413b'], [0.5, '#2c2824'], [1, '#14110e']]), rr(c, 3, 3, 16, 26, 4), 1.4);
    shape(c, '#c8a840', rr(c, 3, 12, 16, 4, 0), 0.6);
    c.strokeStyle = '#6a625a';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(3, 7);
    c.lineTo(19, 7);
    c.moveTo(3, 24);
    c.lineTo(19, 24);
    c.stroke();
    if (cr) cracks(c, [[7, 6, 5, 18], [14, 8, -3, 16]]);
    void m;
  },
  tank: (c, m, cr) => {
    // A brass pressure tank on its stand, a gauge, a valve.
    shape(c, COL.ironHi, rr(c, 6, 36, 24, 8, 2), 1.2);
    shape(c, grad(c, 0, 0, 36, 0, [[0, COL.brassHi], [0.5, COL.brass], [1, COL.brassLo]]), () => c.ellipse(18, 22, 16, 15, 0, 0, Math.PI * 2), 1.6);
    shape(c, '#f4efe6', circ(c, 18, 18, 4), 1);
    c.strokeStyle = COL.soot;
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(18, 18);
    c.lineTo(20, 15);
    c.stroke();
    shape(c, COL.iron, rr(c, 15, 4, 6, 6, 1), 1);
    if (cr) cracks(c, [[8, 22, 14, 10], [26, 14, -8, 14]]);
    void m;
  },
  tower: (c, m, cr) => {
    // A water tower: a wooden barrel on four legs.
    c.strokeStyle = MAT.wood[1];
    c.lineWidth = 3;
    c.beginPath();
    for (const x of [10, 18, 32, 40]) {
      c.moveTo(x, 44);
      c.lineTo(x < 25 ? x + 2 : x - 2, 84);
    }
    c.moveTo(12, 62);
    c.lineTo(38, 74);
    c.moveTo(38, 62);
    c.lineTo(12, 74);
    c.stroke();
    shape(c, body(c, 'wood', 0, 0, 50, 0), rr(c, 4, 12, 42, 34, 5), 1.6);
    for (const y of [20, 38]) shape(c, COL.ironHi, rr(c, 4, y, 42, 3, 1), 0.8);
    shape(c, body(c, 'wood', 0, 0, 50, 0), () => {
      c.moveTo(3, 12);
      c.lineTo(25, 2);
      c.lineTo(47, 12);
      c.closePath();
    }, 1.4);
    if (cr) cracks(c, [[14, 14, 4, 30], [32, 16, 6, 26]]);
    void m;
  },
  transformer: (c, m, cr) => {
    shape(c, grad(c, 0, 0, 34, 0, [[0, '#9aa2a8'], [1, '#5a6268']]), rr(c, 5, 10, 24, 30, 3), 1.4);
    for (let i = 0; i < 3; i++) {
      shape(c, '#d8d4cc', rr(c, 9 + i * 7, 2, 4, 9, 1), 0.8);
      shape(c, '#d8d4cc', rr(c, 8 + i * 7, 8, 6, 3, 1), 0.6);
    }
    shape(c, '#f0cf3a', () => {
      c.moveTo(17, 18);
      c.lineTo(13, 27);
      c.lineTo(17, 27);
      c.lineTo(15, 35);
      c.lineTo(22, 24);
      c.lineTo(18, 24);
      c.lineTo(21, 18);
      c.closePath();
    }, 0.6);
    if (cr) cracks(c, [[8, 14, 12, 22], [26, 12, -6, 24]]);
    void m;
  },
  car: (c, m, cr) => {
    // A wrecked car, dusty, a window gone: grey-blue paint (not red).
    shape(c, COL.soot, circ(c, 20, 38, 6), 1);
    shape(c, COL.soot, circ(c, 58, 38, 6), 1);
    shape(c, grad(c, 0, 12, 0, 38, [[0, '#8da0b4'], [1, '#56687a']]), () => {
      c.moveTo(4, 36);
      c.lineTo(4, 24);
      c.quadraticCurveTo(14, 20, 24, 14);
      c.lineTo(50, 12);
      c.quadraticCurveTo(62, 16, 72, 24);
      c.lineTo(74, 36);
      c.closePath();
    }, 1.6);
    shape(c, '#2c3238', () => {
      c.moveTo(26, 16);
      c.lineTo(36, 16);
      c.lineTo(36, 24);
      c.lineTo(22, 24);
      c.closePath();
    }, 0.8);
    shape(c, '#cfe6e6', () => {
      c.moveTo(40, 16);
      c.lineTo(50, 15);
      c.lineTo(58, 24);
      c.lineTo(40, 24);
      c.closePath();
    }, 0.8);
    shape(c, '#e8e0c8', circ(c, 8, 28, 2), 0.4);
    if (cr) cracks(c, [[14, 26, 20, 8], [52, 14, 14, 20]]);
    void m;
  },
  propane: (c, m, cr) => {
    shape(c, grad(c, 2, 0, 18, 0, [[0, '#f4f1ea'], [1, '#b8b4a8']]), rr(c, 3, 6, 14, 22, 6), 1.4);
    shape(c, COL.iron, rr(c, 7, 2, 6, 5, 1), 1);
    shape(c, '#e8b830', rr(c, 3, 14, 14, 4, 0), 0.6);
    if (cr) cracks(c, [[6, 10, 6, 14]]);
    void m;
  },
  vending: (c, m, cr) => {
    shape(c, grad(c, 0, 0, 32, 0, [[0, '#8a9aa6'], [1, '#56626c']]), rr(c, 3, 4, 26, 48, 3), 1.6);
    shape(c, '#2c3238', rr(c, 6, 8, 16, 26, 1), 0.8);
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) shape(c, ['#d8c050', '#9fe0a8', '#e8e8e8'][(r + k) % 3], rr(c, 8 + k * 5, 11 + r * 8, 3, 5, 1), 0.4);
    shape(c, COL.iron, rr(c, 7, 40, 18, 6, 1), 0.8);
    shape(c, '#cfd4d8', rr(c, 24, 14, 3, 8, 1), 0.6);
    if (cr) cracks(c, [[8, 8, 10, 24], [20, 30, -4, 14]]);
    void m;
  },
  // P36's: the Cold Box's fridge (its place draws it; this is the look a dev-spawned one has), the bowling ball, a shell, the sign.
  fridge: (c, m, cr) => {
    shape(c, grad(c, 0, 0, 40, 0, [[0, '#e4dfd2'], [1, '#a8a294']]), rr(c, 4, 3, 32, 53, 4), 1.6);
    c.strokeStyle = COL.soot;
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(4, 20);
    c.lineTo(36, 20);
    c.stroke();
    shape(c, COL.brassHi, rr(c, 30, 8, 3, 8, 1.4), 0.8);
    shape(c, COL.brassHi, rr(c, 30, 25, 3, 14, 1.4), 0.8);
    shape(c, COL.black, rr(c, 10, 7, 14, 7, 1.5), 1);
    if (cr) cracks(c, [[8, 24, 12, 20], [28, 40, -6, 12]]);
    void m;
  },
  ball: (c, m, cr) => {
    shape(c, grad(c, 4, 4, 18, 18, [[0, '#5a4a7a'], [1, '#221a33']]), circ(c, 10, 11, 8), 1.4);
    for (const [x, y] of [[8, 7], [12, 7], [10, 10]] as [number, number][]) shape(c, COL.soot, circ(c, x, y, 1.2), 0);
    if (cr) cracks(c, [[5, 10, 8, 6]]);
    void m;
  },
  shell: (c, m, cr) => {
    shape(c, grad(c, 0, 0, 14, 0, [[0, COL.brassHi], [1, COL.brassLo]]), () => {
      c.moveTo(2, 24);
      c.lineTo(2, 10);
      c.quadraticCurveTo(7, -1, 12, 10);
      c.lineTo(12, 24);
      c.closePath();
    }, 1.2);
    shape(c, COL.copper, rr(c, 2, 13, 10, 2.5, 1), 0.6);
    shape(c, COL.ironHi, rr(c, 1, 22, 12, 3, 1), 0.8);
    if (cr) cracks(c, [[4, 14, 5, 8]]);
    void m;
  },
  ...FURNITURE,
  sign: (c, m, cr) => {
    // NO WIFI. TALK TO EACH OTHER: a café's chalkboard on its two feet.
    c.strokeStyle = MAT.wood[1];
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(10, 30);
    c.lineTo(13, 18);
    c.moveTo(34, 30);
    c.lineTo(31, 18);
    c.stroke();
    shape(c, body(c, 'wood', 0, 0, 0, 24), rr(c, 3, 2, 38, 20, 2), 1.4);
    shape(c, '#2e3a32', rr(c, 6, 5, 32, 14, 1), 0.6);
    c.fillStyle = '#f4efe6';
    for (const [x, y, w] of [[9, 8, 9], [20, 8, 14], [9, 13, 26]] as [number, number, number][]) c.fillRect(x, y, w, 1.6);
    if (cr) cracks(c, [[8, 6, 12, 10]]);
    void m;
  },
};

/** Props with a painted body (they wear as painted metal: rust at the edges, flakes of paint gone, dents), whatever their material says. */
const PAINTED = new Set<PropKind>(['car', 'vending', 'propane', 'barrel', 'transformer', 'cabinet', 'server', 'turret', 'engine']);

/** The texture of a prop in a state; `material` matters for walls and debris, whose look is the land's. */
export function propKey(kind: PropKind, material: Material, state: 'whole' | 'cracked' | 'rubble') {
  if (state === 'rubble') return `prop-rubble-${material}`;
  const base = kind === 'wall' || kind === 'debris' ? `prop-${kind}-${material}` : `prop-${kind}`;
  return state === 'cracked' ? `${base}-cracked` : base;
}

/** The one texture the props on the land are drawn from: a frame per picture, named by its `propKey`. */
export const PROP_ATLAS = 'prop-atlas';
const GAP = 2;

/** Pack the pictures (`keys`, each its own canvas texture, `SIZE` x `S` px) into `PROP_ATLAS`: one texture to bind and batch, however many kinds, materials and states. */
function packAtlas(scene: Phaser.Scene, keys: string[]) {
  if (scene.textures.exists(PROP_ATLAS)) return;
  const PAGE = 1024;
  const boxes = keys.map((k) => ({ k, w: Math.ceil(SIZE[k][0] * S), h: Math.ceil(SIZE[k][1] * S), x: 0, y: 0 })).sort((a, b) => b.h - a.h);
  let x = 0, y = 0, row = 0;
  for (const b of boxes) {
    if (x + b.w + GAP > PAGE) {
      y += row + GAP;
      x = 0;
      row = 0;
    }
    b.x = x;
    b.y = y;
    x += b.w + GAP;
    row = Math.max(row, b.h);
  }
  const tex = scene.textures.createCanvas(PROP_ATLAS, PAGE, 2 ** Math.ceil(Math.log2(y + row + GAP)))!;
  const c = tex.getContext();
  for (const b of boxes) {
    c.drawImage(scene.textures.get(b.k).getSourceImage() as CanvasImageSource, b.x, b.y);
    tex.add(b.k, 0, b.x, b.y, b.w, b.h);
  }
  tex.refresh();
}

/** Each prop picture as drawn, before its class's look (P47 part A), so the dev toggle can take the looks off and put them back. */
const PLAIN = new Map<string, { data: ImageData; kind: PropKind }>();
const looks = { on: true };

/** Dev (`looks [on|off]`): the classes' looks on every prop picture, or the pictures as drawn; the atlas is drawn again in place, so the land's sprites change at once. */
export function classLooks(scene: Phaser.Scene, on: boolean) {
  looks.on = on;
  const atlas = scene.textures.get(PROP_ATLAS) as Phaser.Textures.CanvasTexture, ac = atlas.getContext();
  for (const [key, p] of PLAIN) {
    const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
    tex.getContext().putImageData(p.data, 0, 0);
    if (on) classLook(scene, key, PROPS[p.kind].cls, p.kind);
    else tex.refresh();
    const f = atlas.get(key);
    ac.clearRect(f.cutX, f.cutY, f.cutWidth, f.cutHeight);
    ac.drawImage(tex.getSourceImage() as CanvasImageSource, f.cutX, f.cutY);
  }
  atlas.refresh();
  return looks.on;
}

export function makePropArt(scene: Phaser.Scene) {
  Object.assign(SIZE, Object.fromEntries(Object.entries(PROP_SIZE).map(([k, v]) => [`prop-${k}`, v])));
  const made: string[] = [];
  for (const kind of Object.keys(PROPS) as PropKind[]) {
    const [w, h] = PROP_SIZE[kind];
    const mats: Material[] = kind === 'wall' || kind === 'debris' ? (Object.keys(MATERIALS) as Material[]) : [PROPS[kind].material];
    for (const m of mats)
      for (const cr of [false, true]) {
        const key = propKey(kind, m, cr ? 'cracked' : 'whole');
        made.push(key);
        SIZE[key] = [w, h];
        canvas(scene, key, w, h, (c) => {
          PAINT[kind](c, m, cr);
          wearItem(c, w, h, key, WEAR[PAINTED.has(kind) ? 'paint' : m] ?? WEAR.concrete, cr ? 1.35 : 1);
        });
        const tex = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
        PLAIN.set(key, { data: tex.getContext().getImageData(0, 0, tex.width, tex.height), kind });
        if (looks.on) classLook(scene, key, PROPS[kind].cls, kind); // P47 part A: one look per class
      }
  }
  for (const m of Object.keys(MATERIALS) as Material[]) {
    SIZE[`prop-rubble-${m}`] = [34, 16];
    made.push(`prop-rubble-${m}`);
    canvas(scene, `prop-rubble-${m}`, 34, 16, (c) => {
      const chips: [number, number, number, number][] = [[2, 8, 9, 6], [10, 4, 8, 7], [18, 8, 7, 6], [24, 5, 8, 8], [14, 10, 8, 5]];
      for (const [x, y, w2, h2] of chips) shape(c, body(c, m, 0, y, 0, y + h2), rr(c, x, y, w2, h2, 2), 1);
      wearItem(c, 34, 16, `prop-rubble-${m}`, { ...(WEAR[m] ?? WEAR.concrete), dents: 0 }, 0.8, [0.1, 0.95]);
    });
  }
  made.push(...makeFloorArt(scene)); // P47's floors and overgrowth, stamped into the baked ground
  packAtlas(scene, made);
}
