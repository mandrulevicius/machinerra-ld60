/**
 * Every texture drawn in code with Canvas 2D (gradients allowed), at 2x and shown at half scale.
 * The look: warm steampunk robots (brass, copper, soot iron, amber glass, white steam) against the cold modern enemy
 * (black gloss, white plastic, cyan and red LEDs). Old tech is the hero; the modern world is the monster.
 * Robots "boil": each is drawn three times with its shapes nudged a fraction of a pixel, cycled at ~8 fps (line boil,
 * docs/findings/animation-and-juice.md), on top of the squash and stretch in Play.ts.
 * The ground is painted in groundart.ts (re-exported here); its live layer is groundlive.ts.
 */
import Phaser from 'phaser';
import { house, LINE } from './house';
import { makeSpiderArt } from './spiderart';
import { makeCaterpillarArt } from './caterpillarart';
import { makeBotLegArt } from './botlegart';
import { makeDungeonArt } from './dungeonart';
import { makeBiomeArt } from './biomeart';
import { makeEtherArt } from './etherart';
import { makeTraitArt } from './traitart';
import { makeRuinArt, wornRuin } from './ruinart';
import { makePropArt } from './propart';
import { makeRelicArt } from './relicart';
import { makeNestArt } from './nestart';

export { GROUND_PX, paintGround } from './groundart';

export const S = 2;

export const COL = {
  brass: '#c8963c', brassHi: '#f0cf7a', brassLo: '#7a5a22',
  copper: '#b8693a', copperHi: '#e09a62',
  iron: '#3d3833', ironHi: '#6a625a', soot: '#1d1a17',
  amber: '#ffb640', glass: '#ffd98a', steam: '#f4efe6', oil: '#14100c',
  black: '#101418', plastic: '#e8edf2', cyan: '#3df2ff', red: '#ff3048',
  rust: '#8a4a26', rust2: '#5a3018',
};

export type Ctx = CanvasRenderingContext2D;

/** Textures kept as drawn, out of the house style: light, shadows, marks, effects, the HUD's pointer, the unused drawn crew. */
const PLAIN = new Set(['glow', 'shadow', 'zep', 'bolt', 'pointer', 'beam', 'track', 'controller', 'gatherer', 'guard', 'repairer']);
/** House style without the outline: things lying flat on the ground. */
export const FLOOR = new Set(['shrine-floor']);

/** The lift's drawn size over its texture's: room for the whole party on the deck (`MISSION.liftTiles` matches it). */
export const LIFT_SCALE = 1.5;
/** Where a lift image's foot goes below the lift's centre, so its deck (the shaft's hole) stays centred there at any scale. */
export const liftFoot = (key: 'lift' | 'dungeon-shaft') => (key === 'lift' ? 7 + 37 * LIFT_SCALE : 22 + 22 * LIFT_SCALE);

/** A desert ruin's draw, then its wear (`ruinart.ts` `wornRuin`). */
const worn = (key: string, draw: (c: Ctx) => void) => (c: Ctx) => {
  draw(c);
  wornRuin(c, key, SIZE[key][0], SIZE[key][1]);
};

export function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void, scale = S) {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w * scale, h * scale)!;
  const c = t.getContext();
  if (scale === S && !PLAIN.has(key.split('~')[0])) {
    house(c, w, h, scale, draw, !FLOOR.has(key));
    t.refresh();
    return;
  }
  c.scale(scale, scale);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  t.refresh();
}

export const grad = (c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
};
export const radial = (c: Ctx, x: number, y: number, r: number, stops: [number, string][]) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
};
/** Line boil: while > 0, every shape is nudged by up to this many px (seeded, so the copies are stable). */
let jitter = 0;
let jseed = 1;
const jrand = () => ((jseed = (jseed * 16807) % 2147483647) / 2147483647) * 2 - 1;

export function shape(c: Ctx, fill: string | CanvasGradient, path: () => void, line: number = LINE.outline, stroke = COL.soot) {
  c.save();
  if (jitter) {
    c.translate(jrand() * jitter, jrand() * jitter);
    c.rotate(jrand() * jitter * 0.012);
  }
  c.beginPath();
  path();
  c.fillStyle = fill;
  c.fill();
  if (line > 0) {
    c.lineWidth = line;
    c.strokeStyle = stroke;
    c.stroke();
  }
  c.restore();
}

/** Boil keys of a robot texture: `key`, `key~1`, `key~2`. */
export const BOIL = 3;
export const boilKey = (key: string, i: number) => (i ? `${key}~${i}` : key);
function boil(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  for (let i = 0; i < BOIL; i++) {
    jitter = i ? 0.45 : 0;
    jseed = 1000 + i * 7919;
    canvas(scene, boilKey(key, i), w, h, draw);
  }
  jitter = 0;
}
export const rr = (c: Ctx, x: number, y: number, w: number, h: number, r: number) => () => c.roundRect(x, y, w, h, r);
export const circ = (c: Ctx, x: number, y: number, r: number) => () => c.arc(x, y, r, 0, Math.PI * 2);
export const rivets = (c: Ctx, pts: [number, number][]) => {
  for (const [x, y] of pts) shape(c, COL.brassHi, circ(c, x, y, 0.9), 0.5);
};
export const glow = (c: Ctx, x: number, y: number, r: number, col: string) => {
  c.fillStyle = radial(c, x, y, r, [[0, col], [1, 'rgba(0,0,0,0)']]);
  c.fillRect(x - r, y - r, r * 2, r * 2);
};

/** Texture box per sprite, game px; feet at the bottom centre. */
export const SIZE: Record<string, [number, number]> = {
  controller: [40, 54], gatherer: [48, 40], guard: [48, 42], repairer: [38, 40],
  hornet: [30, 24], oilcan: [18, 22], scrapgob: [20, 16], coppergob: [20, 16], 'part-hornet-head': [20, 18], 'part-hornet-stinger': [26, 12], 'part-hornet-wings': [28, 16], 'part-queens-crown': [32, 24], 'part-swarmer-wing': [28, 18], 'part-swarmer-scythe': [26, 16], 'part-drone-optics': [22, 18], 'part-drone-cannon': [28, 12], 'part-harbinger-heart': [24, 28], nest: [84, 84], lift: [120, 104], tap: [76, 70], wreck: [40, 24], seam: [76, 58],
  zep: [320, 104], car: [96, 54], phone: [52, 84], dish: [80, 72], panel: [96, 60], shadow: [48, 18], bolt: [20, 10],
};

export function makeArt(scene: Phaser.Scene) {
  const [cw, ch] = SIZE.controller;
  boil(scene, 'controller', cw, ch, (c) => {
    // Bipedal: copper legs, a brass boiler body, a round head with an amber visor and a little smokestack.
    shape(c, COL.iron, rr(c, 11, 34, 6, 18, 2));
    shape(c, COL.iron, rr(c, 23, 34, 6, 18, 2));
    shape(c, COL.copper, rr(c, 9, 48, 9, 5, 2));
    shape(c, COL.copper, rr(c, 22, 48, 9, 5, 2));
    shape(c, grad(c, 6, 0, 34, 0, [[0, COL.brassLo], [0.45, COL.brassHi], [1, COL.brass]]), rr(c, 7, 18, 26, 20, 6));
    shape(c, COL.copper, rr(c, 7, 27, 26, 4, 1), 1);
    rivets(c, [[10, 21], [30, 21], [10, 35], [30, 35]]);
    shape(c, COL.iron, rr(c, 2, 20, 6, 14, 3));
    shape(c, COL.iron, rr(c, 32, 20, 6, 14, 3));
    shape(c, grad(c, 0, 0, 0, 18, [[0, COL.copperHi], [1, COL.copper]]), circ(c, 20, 11, 9));
    shape(c, COL.soot, rr(c, 13, 8, 14, 6, 3), 1);
    shape(c, grad(c, 0, 8, 0, 14, [[0, '#fff3c4'], [1, COL.amber]]), rr(c, 14, 9, 12, 4, 2), 0);
    shape(c, COL.iron, rr(c, 25, 0, 4, 6, 1), 1);
  });
  const [gw, gh] = SIZE.gatherer;
  boil(scene, 'gatherer', gw, gh, (c) => {
    // A wheeled oil tank with a glass gauge and a siphon hose arm.
    shape(c, COL.iron, circ(c, 12, 33, 6));
    shape(c, COL.iron, circ(c, 34, 33, 6));
    shape(c, COL.brassLo, circ(c, 12, 33, 2.5), 0.8);
    shape(c, COL.brassLo, circ(c, 34, 33, 2.5), 0.8);
    shape(c, grad(c, 0, 10, 0, 32, [[0, COL.copperHi], [0.5, COL.copper], [1, COL.rust]]), rr(c, 4, 12, 36, 18, 8));
    shape(c, grad(c, 0, 15, 0, 26, [[0, '#4a3a20'], [1, '#1a120a']]), rr(c, 12, 16, 14, 8, 3), 1);
    shape(c, COL.amber, rr(c, 13, 20, 12, 3, 1), 0);
    rivets(c, [[7, 16], [37, 16], [7, 26], [37, 26]]);
    c.strokeStyle = COL.soot;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(38, 16);
    c.quadraticCurveTo(46, 12, 44, 28);
    c.stroke();
    c.strokeStyle = COL.brass;
    c.lineWidth = 1.6;
    c.stroke();
    shape(c, COL.brassHi, rr(c, 41, 27, 6, 4, 1), 1);
    shape(c, COL.iron, rr(c, 9, 6, 5, 7, 1), 1);
  });
  const [ww, wh] = SIZE.guard;
  boil(scene, 'guard', ww, wh, (c) => {
    // Tracks, a riveted hull and a steam cannon.
    shape(c, COL.soot, rr(c, 3, 29, 40, 11, 5));
    for (let x = 8; x <= 38; x += 6) shape(c, COL.ironHi, circ(c, x, 34.5, 2.2), 0.6);
    shape(c, grad(c, 0, 14, 0, 31, [[0, COL.ironHi], [1, COL.iron]]), rr(c, 5, 16, 36, 15, 4));
    shape(c, grad(c, 0, 6, 0, 20, [[0, COL.brassHi], [1, COL.brassLo]]), rr(c, 12, 7, 20, 13, 5));
    shape(c, COL.copper, rr(c, 28, 10, 18, 5, 2));
    shape(c, COL.soot, rr(c, 43, 9, 4, 7, 1), 1);
    shape(c, COL.amber, rr(c, 15, 11, 7, 3, 1.5), 0.8);
    rivets(c, [[8, 19], [38, 19], [8, 28], [38, 28], [14, 9], [30, 9]]);
  });
  const [rw, rh] = SIZE.repairer;
  boil(scene, 'repairer', rw, rh, (c) => {
    // A hovering drone: twin rotors, a brass sphere, two wrench arms.
    c.fillStyle = 'rgba(244,239,230,0.35)';
    c.beginPath();
    c.ellipse(9, 7, 9, 2.5, 0, 0, Math.PI * 2);
    c.ellipse(29, 7, 9, 2.5, 0, 0, Math.PI * 2);
    c.fill();
    shape(c, COL.iron, rr(c, 8, 7, 2, 7, 1), 0.8);
    shape(c, COL.iron, rr(c, 28, 7, 2, 7, 1), 0.8);
    shape(c, COL.iron, rr(c, 6, 13, 26, 3, 1.5), 1);
    shape(c, grad(c, 8, 14, 30, 34, [[0, COL.brassHi], [0.6, COL.brass], [1, COL.brassLo]]), circ(c, 19, 24, 9));
    shape(c, '#9fe0ff', circ(c, 19, 23, 3), 1);
    c.strokeStyle = COL.ironHi;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(11, 27);
    c.lineTo(5, 34);
    c.moveTo(27, 27);
    c.lineTo(33, 34);
    c.stroke();
    shape(c, COL.copper, circ(c, 5, 35, 2.4), 0.8);
    shape(c, COL.copper, circ(c, 33, 35, 2.4), 0.8);
  });
  for (const f of [0, 1]) {
    const [hw, hh] = SIZE.hornet;
    canvas(scene, `hornet${f}`, hw, hh, (c) => {
      // Modern and wrong: black gloss, white plastic, a cyan LED strip and a red eye. Wings flicker between frames.
      c.fillStyle = 'rgba(190,240,255,0.45)';
      c.strokeStyle = 'rgba(61,242,255,0.8)';
      c.lineWidth = LINE.detail;
      const wy = f ? 3 : 7;
      c.beginPath();
      c.ellipse(11, wy + 2, 8, f ? 3 : 5, -0.4, 0, Math.PI * 2);
      c.ellipse(19, wy + 2, 8, f ? 3 : 5, 0.4, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      shape(c, grad(c, 0, 8, 0, 20, [[0, '#3a4048'], [1, COL.black]]), () => c.ellipse(15, 14, 9, 5, 0, 0, Math.PI * 2), 1, '#000');
      shape(c, COL.plastic, () => c.ellipse(24, 13, 4, 3.5, 0, 0, Math.PI * 2), 1, '#000');
      shape(c, COL.red, circ(c, 25.5, 12.5, 1.3), 0);
      c.strokeStyle = COL.cyan;
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(9, 13);
      c.lineTo(19, 13);
      c.stroke();
      shape(c, COL.plastic, () => {
        c.moveTo(6, 14);
        c.lineTo(1, 16);
        c.lineTo(6, 16);
      }, 0.8, '#000');
    });
  }
  const [nw, nh] = SIZE.nest;
  canvas(scene, 'nest', nw, nh, (c) => {
    // A hive grown from a dead server rack: black slabs, white cable vines, red LEDs, a dark mouth.
    shape(c, grad(c, 0, 10, 0, 84, [[0, '#2a3038'], [1, '#0c0f12']]), () => {
      c.moveTo(14, 82);
      c.lineTo(8, 40);
      c.lineTo(22, 14);
      c.lineTo(44, 4);
      c.lineTo(64, 16);
      c.lineTo(76, 42);
      c.lineTo(70, 82);
      c.closePath();
    }, 2, '#000');
    for (let y = 26; y < 76; y += 9) {
      c.strokeStyle = '#4a525c';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(16, y);
      c.lineTo(68, y + 2);
      c.stroke();
      for (let x = 22; x < 64; x += 11) shape(c, (x + y) % 3 ? COL.red : COL.cyan, circ(c, x, y + 4, 1.1), 0);
    }
    c.strokeStyle = COL.plastic;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(20, 18);
    c.bezierCurveTo(4, 40, 30, 52, 12, 76);
    c.moveTo(62, 14);
    c.bezierCurveTo(80, 38, 56, 56, 72, 78);
    c.stroke();
    shape(c, '#000', () => c.ellipse(42, 62, 11, 15, 0, 0, Math.PI * 2), 0);
    glow(c, 42, 62, 12, 'rgba(255,48,72,0.55)');
  });
  const [lw, lh] = SIZE.lift;
  canvas(scene, 'lift', lw, lh, (c) => {
    // The lift platform: a brass deck with hazard stripes, four posts and the chain going up to the city.
    shape(c, COL.iron, rr(c, 4, 34, 112, 66, 6), 2);
    shape(c, grad(c, 0, 30, 0, 96, [[0, COL.brassHi], [0.5, COL.brass], [1, COL.brassLo]]), rr(c, 10, 38, 100, 56, 4), 1.4);
    c.save();
    c.beginPath();
    c.roundRect(4, 34, 112, 66, 6);
    c.roundRect(12, 42, 96, 50, 3);
    c.clip('evenodd');
    for (let x = -60; x < 140; x += 12) {
      c.fillStyle = '#ffcc33';
      c.beginPath();
      c.moveTo(x, 100);
      c.lineTo(x + 6, 100);
      c.lineTo(x + 46, 30);
      c.lineTo(x + 40, 30);
      c.fill();
    }
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 1;
    for (let y = 46; y < 92; y += 8) {
      c.beginPath();
      c.moveTo(14, y);
      c.lineTo(106, y);
      c.stroke();
    }
    for (const [x, y] of [[8, 36], [112, 36], [8, 96], [112, 96]]) {
      shape(c, COL.iron, rr(c, x - 3, y - 34, 6, 36, 2), 1.2);
      shape(c, COL.copper, circ(c, x, y - 34, 3.5), 1);
    }
    c.strokeStyle = COL.soot;
    c.lineWidth = 3;
    c.setLineDash([4, 3]);
    c.beginPath();
    c.moveTo(60, 0);
    c.lineTo(60, 66);
    c.stroke();
    c.setLineDash([]);
    shape(c, COL.copper, circ(c, 60, 66, 6), 1.4);
  });
  // The work sites. The tap: the land's one crude well, a black pool with a rainbow sheen and a brass standpipe, valve wheel
  // and a cold lamp on top, so it reads as made, not natural (it is the only one).
  const [sw, sh] = SIZE.tap;
  canvas(scene, 'tap', sw, sh, (c) => {
    c.fillStyle = radial(c, 38, 52, 38, [[0, 'rgba(30,20,12,0.55)'], [1, 'rgba(30,20,12,0)']]);
    c.fillRect(0, 20, 76, 50);
    shape(c, grad(c, 0, 44, 0, 62, [[0, '#2a2018'], [1, COL.oil]]), () => c.ellipse(38, 54, 26, 11, 0, 0, Math.PI * 2), 1.4, '#000');
    c.globalAlpha = 0.5;
    c.strokeStyle = grad(c, 20, 0, 56, 0, [[0, '#ff6ad5'], [0.5, '#6affd2'], [1, '#ffd36a']]);
    c.lineWidth = 1.6;
    c.beginPath();
    c.ellipse(34, 52, 12, 3.4, -0.2, Math.PI * 1.1, Math.PI * 1.9);
    c.stroke();
    c.globalAlpha = 1;
    // The standpipe, its flange, the valve wheel and a gauge.
    shape(c, grad(c, 32, 0, 44, 0, [[0, COL.brassLo], [0.45, COL.brassHi], [1, COL.brass]]), rr(c, 33, 14, 10, 40, 2), 1.4);
    shape(c, COL.iron, rr(c, 28, 50, 20, 6, 2), 1.2);
    shape(c, COL.iron, rr(c, 30, 10, 16, 6, 2), 1.2);
    shape(c, COL.copper, circ(c, 38, 30, 7), 1.2);
    c.strokeStyle = COL.soot;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(31, 30);
    c.lineTo(45, 30);
    c.moveTo(38, 23);
    c.lineTo(38, 37);
    c.stroke();
    shape(c, COL.steam, circ(c, 48, 22, 3.2), 1);
    shape(c, COL.red, () => { c.moveTo(48, 22); c.lineTo(50, 20.4); }, 0.8, COL.red);
    shape(c, COL.cyan, circ(c, 38, 8, 2.4), 0.8);
    glow(c, 38, 8, 7, 'rgba(61,242,255,0.45)');
  });
  // Loose piles: what a downed machine, a ruin or a boss leaves. Scrap (grey plates) and copper (an orange coil).
  const [pw, ph] = SIZE.scrapgob;
  canvas(scene, 'scrapgob', pw, ph, (c) => {
    shape(c, COL.ironHi, () => { c.moveTo(3, 13); c.lineTo(6, 6); c.lineTo(13, 5); c.lineTo(17, 13); c.closePath(); }, 1.2);
    shape(c, COL.rust, rr(c, 6, 3, 8, 5, 1), 1);
    shape(c, COL.brassHi, circ(c, 9, 10, 2.2), 0.8);
    shape(c, 'rgba(255,255,255,0.5)', () => c.ellipse(8, 7, 2, 0.8, -0.3, 0, Math.PI * 2), 0);
  });
  canvas(scene, 'coppergob', SIZE.coppergob[0], SIZE.coppergob[1], (c) => {
    shape(c, grad(c, 2, 4, 2, 14, [[0, COL.copperHi], [1, COL.copper]]), () => c.ellipse(10, 9, 7.5, 5, 0, 0, Math.PI * 2), 1.2);
    c.strokeStyle = COL.soot;
    c.lineWidth = 0.8;
    for (const r of [5, 3]) { c.beginPath(); c.ellipse(10, 9, r, r * 0.65, 0, 0, Math.PI * 2); c.stroke(); }
    shape(c, 'rgba(255,255,255,0.5)', () => c.ellipse(7, 6, 2, 0.8, -0.4, 0, Math.PI * 2), 0);
  });
  // A coal seam: a black outcrop of glossy lumps heaped round a brass-handled pick, pale glints on the edges. It shrinks as it is mined (Play scales it).
  const [mw, mh] = SIZE.seam;
  canvas(scene, 'seam', mw, mh, (c) => {
    c.fillStyle = radial(c, 38, 46, 36, [[0, 'rgba(20,16,12,0.5)'], [1, 'rgba(20,16,12,0)']]);
    c.fillRect(0, 14, 76, 44);
    const lump = (pts: number[][], hi = COL.ironHi) => shape(c, grad(c, 0, pts[0][1] - 6, 0, pts[0][1] + 16, [[0, hi], [1, '#15110e']]), () => { pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); }, 1.4);
    lump([[10, 50], [14, 36], [26, 30], [34, 40], [32, 52]]);
    lump([[30, 52], [34, 30], [46, 18], [58, 28], [64, 42], [62, 52]], '#7c746b');
    lump([[22, 40], [28, 26], [38, 24], [42, 36], [38, 46]], '#59514a');
    lump([[48, 50], [54, 40], [66, 40], [70, 50]]);
    shape(c, 'rgba(255,255,255,0.5)', () => c.ellipse(44, 24, 4, 1.4, -0.5, 0, Math.PI * 2), 0);
    shape(c, 'rgba(255,255,255,0.4)', () => c.ellipse(28, 30, 3, 1.1, -0.4, 0, Math.PI * 2), 0);
    shape(c, 'rgba(255,255,255,0.35)', () => c.ellipse(60, 33, 2.6, 1, -0.3, 0, Math.PI * 2), 0);
    // The pick leaning on it: a brass haft and an iron head.
    c.strokeStyle = COL.soot;
    c.lineWidth = 4.4;
    c.beginPath(); c.moveTo(12, 52); c.lineTo(24, 22); c.stroke();
    c.strokeStyle = COL.brass;
    c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(12, 52); c.lineTo(24, 22); c.stroke();
    shape(c, COL.iron, () => { c.moveTo(16, 22); c.lineTo(24, 17); c.lineTo(34, 20); c.lineTo(26, 24); c.closePath(); }, 1.2);
  });
  canvas(scene, 'oilcan', SIZE.oilcan[0], SIZE.oilcan[1], (c) => {
    // A brass oil can with a black drop on its label.
    shape(c, grad(c, 2, 0, 16, 0, [[0, COL.brassLo], [0.45, COL.brassHi], [1, COL.brass]]), rr(c, 3, 6, 12, 15, 2), 1.2);
    shape(c, COL.iron, rr(c, 7, 2, 4, 5, 1), 1);
    shape(c, COL.steam, rr(c, 5, 10, 8, 7, 1), 0.8);
    shape(c, COL.oil, () => {
      c.moveTo(9, 11);
      c.quadraticCurveTo(12, 15, 9, 16);
      c.quadraticCurveTo(6, 15, 9, 11);
    }, 0);
  });
  // Robot parts, one sprite each, drawn as pieces to fit onto a robot later (head, arms, back...). Modern, glossy, unclean.
  canvas(scene, 'part-hornet-head', 20, 18, (c) => {
    shape(c, COL.plastic, () => c.ellipse(10, 10, 8, 7, 0, 0, Math.PI * 2), 1.2, '#000');
    shape(c, COL.black, () => c.ellipse(12, 9, 4, 3, 0, 0, Math.PI * 2), 0);
    shape(c, COL.red, circ(c, 13, 9, 1.8), 0);
    glow(c, 13, 9, 5, 'rgba(255,48,72,0.5)');
    c.strokeStyle = COL.black;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(7, 4);
    c.quadraticCurveTo(4, 0, 2, 1);
    c.moveTo(10, 3);
    c.quadraticCurveTo(11, 0, 13, 0);
    c.stroke();
  });
  canvas(scene, 'part-hornet-stinger', 26, 12, (c) => {
    shape(c, grad(c, 0, 0, 26, 0, [[0, COL.black], [0.65, '#5a6470'], [1, COL.plastic]]), () => {
      c.moveTo(1, 3);
      c.lineTo(25, 6);
      c.lineTo(1, 10);
      c.closePath();
    }, 1, '#000');
    shape(c, COL.cyan, rr(c, 3, 5, 7, 2, 1), 0);
    glow(c, 6, 6, 5, 'rgba(61,242,255,0.4)');
  });
  canvas(scene, 'part-hornet-wings', 28, 16, (c) => {
    c.fillStyle = 'rgba(190,240,255,0.6)';
    c.strokeStyle = COL.cyan;
    c.lineWidth = LINE.detail;
    for (const [x, a] of [[9, -0.5], [19, 0.5]] as [number, number][]) {
      c.beginPath();
      c.ellipse(x, 8, 9, 5, a, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    shape(c, COL.black, rr(c, 12, 6, 4, 5, 1), 0.8, '#000');
  });
  // The queen's crown: black gloss with white plastic points, cyan LEDs along the band and a red eye of a stone, still lit.
  canvas(scene, 'part-queens-crown', 32, 24, (c) => {
    glow(c, 16, 12, 15, 'rgba(255,48,72,0.25)');
    shape(c, grad(c, 0, 0, 0, 24, [[0, COL.plastic], [0.5, '#5a6470'], [1, COL.black]]), () => {
      c.moveTo(3, 20);
      c.lineTo(2, 6);
      c.lineTo(9, 13);
      c.lineTo(12, 3);
      c.lineTo(16, 12);
      c.lineTo(20, 3);
      c.lineTo(23, 13);
      c.lineTo(30, 6);
      c.lineTo(29, 20);
      c.closePath();
    }, 1.3, '#000');
    shape(c, COL.black, rr(c, 3, 17, 26, 5, 1.5), 1, '#000');
    for (const x of [7, 11, 21, 25]) shape(c, COL.cyan, circ(c, x, 19.5, 1), 0);
    shape(c, COL.red, circ(c, 16, 19.5, 2), 0.8, '#000');
    glow(c, 16, 19.5, 6, 'rgba(255,48,72,0.6)');
    for (const x of [2, 12, 20, 30]) shape(c, COL.cyan, circ(c, x, x === 12 || x === 20 ? 3 : 6, 1), 0);
  });
  // The Demon Wastes' parts: dark iron gone to rust, bat-leather, blood-red glass.
  const IRON = '#3a2c2e', IRON_HI = '#7a6060', BLOOD = '#c0182c';
  canvas(scene, 'part-swarmer-wing', 28, 18, (c) => {
    shape(c, '#5a2a30', () => {
      c.moveTo(2, 4);
      c.lineTo(26, 2);
      c.lineTo(22, 9);
      c.lineTo(18, 7);
      c.lineTo(15, 14);
      c.lineTo(11, 9);
      c.lineTo(7, 16);
      c.lineTo(5, 9);
      c.closePath();
    }, 1, '#000');
    c.strokeStyle = IRON_HI;
    c.lineWidth = 1;
    c.beginPath();
    for (const [x, y] of [[22, 9], [15, 14], [7, 16]]) {
      c.moveTo(3, 4);
      c.lineTo(x, y);
    }
    c.stroke();
  });
  canvas(scene, 'part-swarmer-scythe', 26, 16, (c) => {
    shape(c, grad(c, 0, 0, 26, 0, [[0, IRON], [1, IRON_HI]]), () => {
      c.moveTo(2, 13);
      c.quadraticCurveTo(10, 1, 24, 2);
      c.quadraticCurveTo(14, 5, 6, 14);
      c.closePath();
    }, 1, '#000');
    shape(c, BLOOD, circ(c, 5, 12, 2), 0.8, '#000');
  });
  canvas(scene, 'part-drone-optics', 22, 18, (c) => {
    shape(c, IRON, () => c.ellipse(11, 10, 9, 7, 0, 0, Math.PI * 2), 1.2, '#000');
    for (const [x, y, r] of [[8, 8, 3.2], [14, 8, 3.2], [11, 13, 2.6], [5, 13, 1.8], [17, 13, 1.8]] as [number, number, number][]) {
      shape(c, '#b8c8d0', circ(c, x, y, r), 0.8, '#000');
      shape(c, '#20282c', circ(c, x, y, r * 0.55), 0);
    }
  });
  canvas(scene, 'part-drone-cannon', 28, 12, (c) => {
    shape(c, grad(c, 0, 0, 0, 12, [[0, IRON_HI], [1, IRON]]), rr(c, 2, 2, 22, 8, 2), 1, '#000');
    for (const y of [3.5, 6, 8.5]) shape(c, '#1a1214', rr(c, 20, y - 1, 7, 2, 1), 0.6, '#000');
    shape(c, BLOOD, rr(c, 6, 4, 8, 4, 1), 0);
    glow(c, 10, 6, 6, 'rgba(255,32,64,0.4)');
  });
  // The Harbinger's heart: a ribcage behind glass, a red heartbeat line on its little screen, still lit.
  canvas(scene, 'part-harbinger-heart', 24, 28, (c) => {
    glow(c, 12, 15, 13, 'rgba(255,24,48,0.3)');
    shape(c, grad(c, 0, 0, 24, 0, [[0, IRON], [0.5, IRON_HI], [1, IRON]]), rr(c, 2, 4, 20, 22, 3), 1.3, '#000');
    shape(c, '#1a0c10', rr(c, 5, 3, 14, 4, 1), 0.8, '#000');
    c.strokeStyle = '#ff3040';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(6, 5);
    c.lineTo(10, 5);
    c.lineTo(11, 3.5);
    c.lineTo(12.5, 6.5);
    c.lineTo(14, 5);
    c.lineTo(18, 5);
    c.stroke();
    shape(c, 'rgba(160,190,200,0.35)', rr(c, 5, 9, 14, 14, 2), 0.8, '#000');
    c.strokeStyle = '#e8d8c8';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(12, 10);
    c.lineTo(12, 22);
    for (const y of [12, 15, 18]) {
      c.moveTo(12, y);
      c.quadraticCurveTo(8, y, 7, y + 2);
      c.moveTo(12, y);
      c.quadraticCurveTo(16, y, 17, y + 2);
    }
    c.stroke();
    shape(c, BLOOD, circ(c, 12, 16, 2.2), 0);
  });
  // A fallen steam robot, on its side: a riveted copper boiler, a brass dome head with its lens gone dark, a wheel, a bent pipe arm.
  canvas(scene, 'wreck', SIZE.wreck[0], SIZE.wreck[1], (c) => {
    shape(c, COL.iron, () => {
      c.moveTo(4, 18);
      c.quadraticCurveTo(2, 10, 9, 9);
      c.lineTo(12, 13);
      c.quadraticCurveTo(8, 13, 8, 18);
      c.closePath();
    }, 1);
    shape(c, COL.soot, circ(c, 30, 18, 4.6), 1);
    shape(c, COL.ironHi, circ(c, 30, 18, 1.8), 0.6);
    shape(c, grad(c, 0, 7, 0, 21, [[0, COL.copperHi], [0.5, COL.copper], [1, COL.rust2]]), rr(c, 9, 8, 19, 13, 5), 1.2);
    c.strokeStyle = COL.rust2;
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(15, 8.5);
    c.lineTo(15, 20.5);
    c.moveTo(22, 8.5);
    c.lineTo(22, 20.5);
    c.stroke();
    rivets(c, [[12, 11], [12, 18], [18.5, 11], [25, 11], [25, 18]]);
    shape(c, grad(c, 28, 4, 36, 14, [[0, COL.brassHi], [1, COL.brassLo]]), circ(c, 32, 10, 5.4), 1.2);
    shape(c, '#1a2026', circ(c, 33.5, 10.5, 2.4), 0.8);
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.beginPath();
    c.moveTo(32.6, 9.2);
    c.lineTo(34, 11.6);
    c.stroke();
  });
  canvas(scene, 'car', SIZE.car[0], SIZE.car[1], worn('car', (c) => {
    // A modern hatchback, rusted through, half swallowed by a dune.
    shape(c, grad(c, 0, 10, 0, 50, [[0, '#a85a30'], [1, COL.rust2]]), () => {
      c.moveTo(6, 44);
      c.lineTo(10, 28);
      c.lineTo(30, 26);
      c.lineTo(42, 10);
      c.lineTo(72, 10);
      c.lineTo(86, 26);
      c.lineTo(92, 44);
      c.closePath();
    }, 1.6);
    shape(c, '#2a3036', () => {
      c.moveTo(46, 14);
      c.lineTo(70, 14);
      c.lineTo(80, 26);
      c.lineTo(38, 26);
      c.closePath();
    }, 1);
    c.strokeStyle = 'rgba(255,255,255,0.35)';
    c.beginPath();
    c.moveTo(50, 16);
    c.lineTo(58, 24);
    c.stroke();
    shape(c, COL.soot, circ(c, 26, 44, 8), 1.4);
    shape(c, COL.soot, circ(c, 72, 44, 8), 1.4);
  }));
  canvas(scene, 'phone', SIZE.phone[0], SIZE.phone[1], worn('phone', (c) => {
    // A giant smartphone stuck in the sand, its screen cracked: the old world's most modern relic.
    c.save();
    c.translate(26, 44);
    c.rotate(0.18);
    shape(c, '#1c2024', rr(c, -18, -38, 36, 70, 7), 2, '#000');
    shape(c, grad(c, 0, -34, 0, 28, [[0, '#26394a'], [1, '#0d1620']]), rr(c, -15, -33, 30, 58, 3), 0);
    c.strokeStyle = 'rgba(220,240,255,0.55)';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(-6, -12);
    c.lineTo(-14, -26);
    c.moveTo(-6, -12);
    c.lineTo(10, -20);
    c.moveTo(-6, -12);
    c.lineTo(2, 10);
    c.moveTo(-6, -12);
    c.lineTo(-13, 4);
    c.stroke();
    shape(c, '#000', rr(c, -5, -36, 10, 2, 1), 0);
    c.restore();
  }));
  canvas(scene, 'dish', SIZE.dish[0], SIZE.dish[1], worn('dish', (c) => {
    // A fallen satellite dish on a bent mast.
    shape(c, COL.ironHi, rr(c, 36, 34, 6, 36, 2), 1.2);
    shape(c, grad(c, 10, 6, 70, 50, [[0, '#f2f4f6'], [1, '#9aa2aa']]), () => c.ellipse(38, 30, 32, 20, -0.5, 0, Math.PI * 2), 1.6);
    shape(c, 'rgba(0,0,0,0.12)', () => c.ellipse(40, 32, 22, 12, -0.5, 0, Math.PI * 2), 0);
    c.strokeStyle = COL.iron;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(38, 30);
    c.lineTo(56, 14);
    c.stroke();
    shape(c, COL.red, circ(c, 57, 13, 2.4), 1);
    shape(c, COL.rust, () => c.ellipse(24, 40, 7, 4, -0.5, 0, Math.PI * 2), 0);
  }));
  canvas(scene, 'panel', SIZE.panel[0], SIZE.panel[1], worn('panel', (c) => {
    // A broken solar array: the power that failed.
    for (let i = 0; i < 3; i++) {
      c.save();
      c.translate(16 + i * 30, 30);
      c.rotate(-0.2 + i * 0.25);
      shape(c, '#1a2a4a', rr(c, -13, -18, 26, 30, 1), 1.4);
      c.strokeStyle = 'rgba(160,200,255,0.4)';
      c.lineWidth = LINE.detail;
      for (let k = -12; k < 12; k += 6) {
        c.beginPath();
        c.moveTo(k, -18);
        c.lineTo(k, 12);
        c.stroke();
      }
      c.restore();
    }
  }));
  canvas(scene, 'shadow', SIZE.shadow[0], SIZE.shadow[1], (c) => {
    c.fillStyle = radial(c, 24, 9, 24, [[0, 'rgba(40,20,5,0.45)'], [1, 'rgba(40,20,5,0)']]);
    c.scale(1, 0.375);
    c.beginPath();
    c.arc(24, 24, 24, 0, Math.PI * 2);
    c.fill();
  });
  // The Zeppelin Wanderer's shadow, nose to the right: a black silhouette (Play sets how dark), softened at the edge.
  // From above, with the sun low: the envelope, tail fins, a gondola bulge, four propeller discs, the antenna masts.
  canvas(scene, 'zep', SIZE.zep[0], SIZE.zep[1], (c) => {
    c.filter = 'blur(1.2px)';
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(168, 52, 140, 34, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath(); // the tail fins
    c.moveTo(60, 40); c.lineTo(14, 8); c.lineTo(34, 8); c.lineTo(96, 36);
    c.moveTo(60, 64); c.lineTo(14, 96); c.lineTo(34, 96); c.lineTo(96, 68);
    c.fill();
    c.beginPath(); // the gondola, hanging off the belly
    c.roundRect(140, 70, 62, 16, 7);
    c.fill();
    for (const [x, y] of [[120, 22], [120, 82], [210, 22], [210, 82]]) {
      c.beginPath();
      c.ellipse(x, y, 5, 11, 0, 0, Math.PI * 2);
      c.fill();
    }
    // The antenna arrays (the Antennae Wanderer): masts fanning past the nose and back among the fins.
    c.strokeStyle = '#000';
    c.lineWidth = 2;
    c.lineCap = 'round';
    for (const [x0, y0, x1, y1] of [[280, 44, 312, 26], [284, 48, 316, 42], [284, 56, 316, 62], [280, 60, 312, 78], [44, 48, 20, 40], [44, 56, 20, 64]]) {
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
  });
  // A soft white round glow, tinted and added for auras and eyes (night).
  canvas(scene, 'glow', 64, 64, (c) => {
    c.fillStyle = radial(c, 32, 32, 32, [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
    c.fillRect(0, 0, 64, 64);
  });
  canvas(scene, 'bolt', SIZE.bolt[0], SIZE.bolt[1], (c) => {
    glow(c, 12, 5, 8, 'rgba(255,190,90,0.9)');
    shape(c, '#fff4d0', () => c.ellipse(12, 5, 6, 2, 0, 0, Math.PI * 2), 0);
  });
  // A crew's order flag, planted in the world where the map sent it (white cloth, tinted per crew).
  canvas(scene, 'flag', 26, 44, (c) => {
    shape(c, COL.iron, rr(c, 3, 2, 3, 42, 1), 1);
    shape(c, '#ffffff', () => {
      c.moveTo(6, 4);
      c.quadraticCurveTo(16, 0, 24, 6);
      c.quadraticCurveTo(18, 12, 24, 18);
      c.quadraticCurveTo(14, 14, 6, 18);
      c.closePath();
    }, 1.2);
    shape(c, COL.brass, circ(c, 4.5, 2.5, 2.5), 1);
  });
  // Off-screen pointer: a brass arrowhead, pointing right.
  canvas(scene, 'pointer', 30, 30, (c) => {
    shape(c, grad(c, 0, 4, 0, 26, [[0, COL.brassHi], [1, COL.brassLo]]), () => {
      c.moveTo(4, 4);
      c.lineTo(27, 15);
      c.lineTo(4, 26);
      c.lineTo(10, 15);
      c.closePath();
    }, 2);
  });
  // Wheel and track prints for dirty wheels (the kit's mark layer stamps these).
  canvas(scene, 'track', 16, 10, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(1, 1, 4, 8);
    c.fillRect(11, 1, 4, 8);
  }, 1);
  canvas(scene, 'beam', 8, 8, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 8, 8);
  }, 1);
  makeSpiderArt(scene); // the crawlcam's body, legs and parts (spiderart.ts)
  makeCaterpillarArt(scene); // the caterpillars' pods, heads, legs and the mother's jaw (caterpillarart.ts)
  makeBotLegArt(scene); // a robot's spider legs (botlegart.ts)
  makeTraitArt(scene); // the elite traits' parts (traitart.ts)
  makeEtherArt(scene); // the Ether's ghosts, the Evil Oracle, the Princess (etherart.ts)
  makeBiomeArt(scene); // the jungle's, the city's and the mountains' machines and their parts (biomeart.ts)
  makeDungeonArt(scene); // the dungeons' entrance, rattlers, Old Rattlejaw and their parts (dungeonart.ts)
  makeRuinArt(scene); // each biome's old tech (ruinart.ts)
  makePropArt(scene); // walls, crates and the effect props, whole, cracked and rubble (propart.ts)
  makeRelicArt(scene); // the relics' pictograms (relicart.ts)
  makeNestArt(scene); // each biome's own hive (nestart.ts)
}
