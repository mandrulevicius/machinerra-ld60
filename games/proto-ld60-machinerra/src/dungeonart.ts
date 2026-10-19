/**
 * The dungeons' art (`sim/dungeon.ts`), drawn in code in the house style (`art.ts`): the desert shaft's mine-lift
 * head-frame (the way down on the land, and the way back up below), the rattler (a modern machine: white plastic scales,
 * black joints, cyan eyes, a red LED rattle; Old Rattlejaw is a painting, `art-src/foe/snake-boss.svg`) and its parts.
 * Sizes go into `SIZE`. The other four dungeons' art is `dungeonfoeart.ts`.
 */
import type Phaser from 'phaser';
import { COL, SIZE, canvas, circ, glow, rivets, rr, shape, type Ctx } from './art';
import { makeDungeonFoeArt } from './dungeonfoeart';

const BOX: Record<string, [number, number]> = {
  'dungeon-headframe': [104, 132],
  'dungeon-shaft': [76, 44],
  'foe-snake': [48, 30],
  'part-snake-skin': [22, 18],
  'part-rattlejaw-fang': [30, 18],
  // The rooms' rules on screen (`dungeonview.ts`): the lever's gate across a tunnel (tall or wide), the lever in two positions.
  'dungeon-gate-v': [64, 160],
  'dungeon-gate-h': [160, 64],
  // The den's wall plug (`dungeonview.ts`): plain stone, then the same split open.
  'dungeon-wall': [64, 160],
  'dungeon-wall-cracked': [64, 160],
  'dungeon-lever-0': [28, 34],
  'dungeon-lever-1': [28, 34],
};

/** A locked slab across a tunnel: riveted iron plates in a frame, hazard stripes, a red lock lamp. */
function gate(c: Ctx, w: number, h: number) {
  shape(c, COL.iron, rr(c, 2, 2, w - 4, h - 4, 4), 1.6);
  const tall = h > w;
  const n = tall ? 4 : 4;
  for (let i = 0; i < n; i++) {
    const x = tall ? 6 : 6 + (i * (w - 12)) / n, y = tall ? 6 + (i * (h - 12)) / n : 6;
    shape(c, i % 2 ? COL.ironHi : '#524b44', rr(c, x, y, tall ? w - 12 : (w - 12) / n - 2, tall ? (h - 12) / n - 2 : h - 12, 2), 0.8);
  }
  c.save();
  c.beginPath();
  c.rect(4, 4, w - 8, h - 8);
  c.clip();
  c.strokeStyle = COL.amber;
  c.globalAlpha = 0.55;
  c.lineWidth = 4;
  for (let i = -h; i < w + h; i += 14) {
    c.beginPath();
    c.moveTo(i, h);
    c.lineTo(i + h, 0);
    c.stroke();
  }
  c.restore();
  shape(c, COL.black, circ(c, w / 2, h / 2, 7), 1);
  shape(c, COL.red, circ(c, w / 2, h / 2, 4), 0.5);
  glow(c, w / 2, h / 2, 12, 'rgba(255,48,72,0.6)');
  rivets(c, [[7, 7], [w - 7, 7], [7, h - 7], [w - 7, h - 7]]);
}

/** The den's wall plug: courses of dressed stone, each block its own tone; cracked, a split runs down it with a glint in the seam. */
function wall(c: Ctx, w: number, h: number, cracked: boolean) {
  const rows = 5, bh = h / rows;
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? w / 4 : 0;
    for (let x = -off; x < w; x += w / 2) {
      const x0 = Math.max(0, x), x1 = Math.min(w, x + w / 2);
      shape(c, (r * 7 + Math.round(x / 8)) % 3 ? '#6a6157' : '#5b534a', rr(c, x0 + 0.5, r * bh + 0.5, x1 - x0 - 1, bh - 1, 2), 1);
    }
  }
  if (!cracked) return;
  const zig: [number, number][] = [[34, 0], [28, 22], [38, 44], [30, 70], [37, 96], [29, 122], [35, 160]];
  c.save();
  c.lineJoin = 'round';
  for (const [col, lw, a] of [[COL.amber, 7, 0.35], ['#0c0a08', 4, 1], ['#ffd98a', 1.4, 0.9]] as const) {
    c.strokeStyle = col;
    c.globalAlpha = a;
    c.lineWidth = lw;
    c.beginPath();
    zig.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.stroke();
  }
  c.restore();
  glow(c, 33, 80, 26, 'rgba(255,200,120,0.3)');
}

/** The lever: a base plate and a post, the handle up (0) or thrown (1). */
function lever(c: Ctx, thrown: boolean) {
  shape(c, COL.iron, rr(c, 3, 24, 22, 8, 2), 1.2);
  shape(c, COL.ironHi, rr(c, 11, 16, 6, 10, 1), 0.8);
  c.save();
  c.translate(14, 18);
  c.rotate(thrown ? 0.9 : -0.9);
  shape(c, COL.brass, rr(c, -2, -16, 4, 17, 1.5), 0.9);
  shape(c, thrown ? COL.cyan : COL.red, circ(c, 0, -17, 3.4), 0.7);
  c.restore();
  shape(c, COL.brassHi, circ(c, 14, 18, 2.4), 0.6);
  glow(c, 14, 4, 8, thrown ? 'rgba(61,242,255,0.5)' : 'rgba(255,48,72,0.5)');
}

/** A coiled robot rattlesnake seen from the side and above, head raised to the right, its rattle up at the left; `k` scales it. */
function snake(c: Ctx, w: number, h: number) {
  const k = w / 48;
  c.save();
  c.scale(k, k);
  // The body: segments along an S from the tail (left) to the neck (right), white plates on black joints.
  const pts: [number, number][] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    pts.push([6 + t * 30, 22 - Math.sin(t * Math.PI * 1.6) * 5 + t * 2]);
  }
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const r = 3.2 + Math.sin((i / pts.length) * Math.PI) * 1.8;
    shape(c, COL.black, circ(c, x, y, r + 0.6), 0.8);
    shape(c, i % 2 ? COL.plastic : '#c8d0d8', circ(c, x, y - 0.6, r - 0.4), 0.6);
  }
  // The rattle: stacked LED rings, red, raised at the tail.
  for (let i = 0; i < 3; i++) shape(c, COL.red, rr(c, 2 + i * 0.6, 10 - i * 3.2, 5 - i * 0.8, 3, 1.2), 0.7);
  glow(c, 4, 6, 4, 'rgba(255,48,72,0.7)');
  // The neck and head, raised to strike: a wedge of black gloss with a white jaw and cyan eyes.
  shape(c, COL.plastic, () => {
    c.moveTo(34, 23);
    c.quadraticCurveTo(40, 18, 38, 11);
    c.lineTo(42, 10);
    c.quadraticCurveTo(45, 18, 38, 25);
    c.closePath();
  }, 0.8);
  shape(c, COL.black, () => {
    c.moveTo(36, 12);
    c.lineTo(46, 9);
    c.lineTo(47, 12);
    c.lineTo(40, 15);
    c.closePath();
  }, 0.8);
  shape(c, COL.plastic, () => {
    c.moveTo(39, 14);
    c.lineTo(47, 12.5);
    c.lineTo(45, 15.5);
    c.closePath();
  }, 0.6);
  shape(c, COL.cyan, circ(c, 42, 10.8, 1.1), 0.4);
  glow(c, 42, 10.8, 3, 'rgba(61,242,255,0.6)');
  c.restore();
}

export function makeDungeonArt(scene: Phaser.Scene) {
  // Here, not at the top: art.ts imports this module, so SIZE exists only once it has run.
  Object.assign(SIZE, BOX);
  makeDungeonFoeArt(scene); // the other four dungeons' ways down, foes and parts
  // The desert shaft's mine lift: two timber legs and braces, an iron wheel on top with the cable down into the shaft, a
  // lamp on a hook, a cage halfway down. Its feet stand at the bottom of the box.
  canvas(scene, 'dungeon-headframe', ...BOX['dungeon-headframe'], (c) => {
    const timber = '#7a5230', dark = '#4a3018';
    shape(c, COL.black, rr(c, 22, 106, 60, 22, 4), 1.2);
    shape(c, '#05070a', rr(c, 28, 110, 48, 14, 3), 0);
    shape(c, timber, () => {
      c.moveTo(18, 128);
      c.lineTo(46, 14);
      c.lineTo(52, 14);
      c.lineTo(26, 128);
      c.closePath();
    }, 1.2);
    shape(c, timber, () => {
      c.moveTo(86, 128);
      c.lineTo(58, 14);
      c.lineTo(52, 14);
      c.lineTo(78, 128);
      c.closePath();
    }, 1.2);
    for (const y of [50, 82]) shape(c, dark, rr(c, 30 + (y - 50) * -0.15, y, 44 + (y - 50) * 0.3, 4, 1), 0.9);
    shape(c, COL.iron, circ(c, 52, 16, 13), 1.4);
    shape(c, COL.ironHi, circ(c, 52, 16, 9), 0.8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.strokeStyle = COL.soot;
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(52, 16);
      c.lineTo(52 + Math.cos(a) * 9, 16 + Math.sin(a) * 9);
      c.stroke();
    }
    shape(c, COL.brass, circ(c, 52, 16, 2.5), 0.8);
    c.strokeStyle = '#2a2622';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(63, 18);
    c.lineTo(63, 104);
    c.stroke();
    shape(c, COL.ironHi, rr(c, 56, 62, 15, 18, 2), 1);
    shape(c, '#2a2622', rr(c, 58, 64, 11, 14, 1), 0.6);
    shape(c, COL.amber, circ(c, 34, 40, 3), 0.8);
    glow(c, 34, 40, 10, 'rgba(255,182,64,0.6)');
  });
  // The shaft's mouth seen from below (the way back up in a dungeon): a square of timber framing round a dark hole, a ladder.
  canvas(scene, 'dungeon-shaft', ...BOX['dungeon-shaft'], (c) => {
    shape(c, '#7a5230', rr(c, 4, 4, 68, 36, 4), 1.4);
    shape(c, '#05070a', rr(c, 12, 10, 52, 24, 3), 0.8);
    glow(c, 38, 22, 22, 'rgba(255,214,140,0.35)');
    for (let i = 0; i < 4; i++) shape(c, '#a07040', rr(c, 30, 12 + i * 5.5, 16, 2, 1), 0.6);
  });
  canvas(scene, 'dungeon-gate-v', ...BOX['dungeon-gate-v'], (c) => gate(c, 64, 160));
  canvas(scene, 'dungeon-gate-h', ...BOX['dungeon-gate-h'], (c) => gate(c, 160, 64));
  canvas(scene, 'dungeon-wall', ...BOX['dungeon-wall'], (c) => wall(c, 64, 160, false));
  canvas(scene, 'dungeon-wall-cracked', ...BOX['dungeon-wall-cracked'], (c) => wall(c, 64, 160, true));
  canvas(scene, 'dungeon-lever-0', ...BOX['dungeon-lever-0'], (c) => lever(c, false));
  canvas(scene, 'dungeon-lever-1', ...BOX['dungeon-lever-1'], (c) => lever(c, true));
  canvas(scene, 'foe-snake', ...BOX['foe-snake'], (c) => snake(c, 48, 30));
  canvas(scene, 'part-snake-skin', ...BOX['part-snake-skin'], (c) => {
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 3; i++) shape(c, i % 2 ? COL.plastic : '#c8d0d8', () => {
        const x = 4 + i * 6 + (row % 2) * 3, y = 4 + row * 4.5;
        c.moveTo(x - 3, y);
        c.lineTo(x + 3, y);
        c.lineTo(x, y + 5);
        c.closePath();
      }, 0.7);
  });
  canvas(scene, 'part-rattlejaw-fang', ...BOX['part-rattlejaw-fang'], (c) => {
    c.strokeStyle = COL.soot;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(3, 14);
    c.bezierCurveTo(10, 4, 18, 16, 26, 6);
    c.stroke();
    c.strokeStyle = COL.plastic;
    c.lineWidth = 2.4;
    c.stroke();
    for (let i = 0; i < 3; i++) shape(c, COL.red, rr(c, 1 + i * 2, 12 - i, 3, 4, 1), 0.5);
    shape(c, COL.steam, () => {
      c.moveTo(25, 5);
      c.lineTo(30, 3);
      c.lineTo(27, 10);
      c.closePath();
    }, 0.6);
  });
}
