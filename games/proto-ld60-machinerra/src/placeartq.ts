/**
 * The art of the companions and their quest places (P42; `sim/companions.ts`, `sim/placequest.ts`), drawn in code in the house
 * style like `placeart36.ts` (which this follows; `placeart.ts` calls `makePlaceArtQ`): textures at 2x, shown at half scale, sizes
 * (game px) added to `SIZE` so `Play.place()` stands them on their feet. The sniffer dog and the stray cat are here too: the dog
 * brass and copper with a sniffer array on its nose, the cat copper-wire ribs and one ear. Every look is a first pass until
 * Kamile's art arrives. The dog faces right; the views flip it.
 */
import type Phaser from 'phaser';
import { COL, SIZE, canvas, circ, grad, rivets, rr, shape, type Ctx } from './art';

export const BOXQ: Record<string, [number, number]> = {
  doghouse: [76, 70],
  'dog-bowl': [24, 12],
  'dig-mound': [44, 22],
  'dig-mound-dug': [44, 22],
  'compactor-bot': [58, 50],
  'cube-tower': [34, 54],
  cairn: [48, 54],
  'cairn-flag': [22, 48],
  'dog-stand': [48, 34],
  'dog-point': [52, 34],
  'dog-run-0': [50, 32],
  'dog-run-1': [50, 32],
  'dog-dig': [46, 32],
  'cat-sit': [26, 26],
  'cat-walk-0': [30, 22],
  'cat-walk-1': [30, 22],
  'cat-sleep': [30, 18],
};

const line = (c: Ctx, w: number, col: string, pts: [number, number][]) => {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
};

type Pose = { head: [number, number]; legs: [number, number][]; tail: 'up' | 'wag' | 'down' };

/** The robot dog: a brass barrel body, a copper head with a long ear, an amber eye and a sniffer array (two little dishes) on its snout. */
function dog(c: Ctx, w: number, pose: Pose) {
  const by = 12; // the body's top
  // The far legs first (darker), then the body, the near legs, the head.
  const leg = (x: number, [dx, dy]: [number, number], col: string) => {
    line(c, 3, col, [[x, by + 12], [x + dx * 0.5, by + 18], [x + dx, by + 21 + dy]]);
    shape(c, COL.ironHi, rr(c, x + dx - 2, by + 20 + dy, 5, 3, 1), 0.8);
  };
  leg(w * 0.28, pose.legs[2], COL.iron);
  leg(w * 0.66, pose.legs[3], COL.iron);
  shape(c, grad(c, 0, by, 0, by + 14, [[0, COL.brassHi], [0.5, COL.brass], [1, COL.brassLo]]), rr(c, w * 0.2, by, w * 0.5, 14, 6), 1.4);
  rivets(c, [[w * 0.3, by + 3], [w * 0.4, by + 3], [w * 0.5, by + 3], [w * 0.6, by + 3]]);
  shape(c, COL.iron, rr(c, w * 0.36, by + 8, w * 0.12, 3, 1), 0.6);
  leg(w * 0.24, pose.legs[0], COL.ironHi);
  leg(w * 0.62, pose.legs[1], COL.ironHi);
  // The tail: a pipe with a puff of rust at the end.
  const t0: [number, number] = [w * 0.2, by + 4];
  const tail: [number, number][] = pose.tail === 'up' ? [t0, [w * 0.12, by - 4], [w * 0.14, by - 12]] : pose.tail === 'wag' ? [t0, [w * 0.1, by + 2], [w * 0.06, by - 5]] : [t0, [w * 0.1, by + 8], [w * 0.08, by + 14]];
  line(c, 2.4, COL.ironHi, tail);
  shape(c, COL.rust, circ(c, tail[2][0], tail[2][1], 2), 0.6);
  // The head, on a short neck, at the pose's place.
  const [hx, hy] = pose.head;
  line(c, 5, COL.copper, [[w * 0.62, by + 4], [hx - 4, hy + 4]]);
  shape(c, grad(c, hx - 8, hy - 8, hx + 8, hy + 8, [[0, COL.copperHi], [1, COL.copper]]), rr(c, hx - 9, hy - 7, 16, 13, 5), 1.4);
  shape(c, grad(c, hx + 4, hy, hx + 16, hy, [[0, COL.copper], [1, COL.brassLo]]), rr(c, hx + 4, hy - 1, 12, 7, 3), 1.2);
  shape(c, COL.soot, circ(c, hx + 15, hy + 1, 1.8), 0);
  // The sniffer array: two small dishes on the snout.
  shape(c, COL.brassHi, circ(c, hx + 9, hy - 3, 2.4), 0.8);
  shape(c, COL.brassHi, circ(c, hx + 13, hy - 4, 1.8), 0.8);
  shape(c, COL.amber, circ(c, hx, hy - 2, 2), 0.6);
  // The ear: long, hung back.
  shape(c, COL.copper, () => {
    c.moveTo(hx - 5, hy - 6);
    c.quadraticCurveTo(hx - 13, hy - 3, hx - 12, hy + 7);
    c.quadraticCurveTo(hx - 6, hy + 4, hx - 2, hy - 5);
    c.closePath();
  }, 1);
}

/** The stray cat: copper-wire ribs, one ear, a tail with opinions. `sit`, `walk` (a step) or `sleep` (curled). */
function cat(c: Ctx, kind: 'sit' | 'walk0' | 'walk1' | 'sleep') {
  if (kind === 'sleep') {
    shape(c, grad(c, 0, 2, 0, 16, [[0, COL.copperHi], [1, COL.copper]]), () => c.ellipse(15, 11, 12, 6, 0, 0, Math.PI * 2), 1.2);
    shape(c, COL.copper, circ(c, 22, 10, 4), 1);
    line(c, 1.4, COL.copperHi, [[6, 8], [12, 6]]);
    line(c, 1.4, COL.copperHi, [[9, 14], [16, 15]]);
    return;
  }
  const sit = kind === 'sit';
  const bx = sit ? 11 : 14, by = sit ? 12 : 8;
  shape(c, grad(c, 0, by, 0, by + 10, [[0, COL.copperHi], [1, COL.copper]]), () => c.ellipse(bx, by + 5, sit ? 6 : 9, sit ? 8 : 5, 0, 0, Math.PI * 2), 1.2);
  // Wire ribs.
  for (let i = -1; i <= 1; i++) line(c, 0.9, COL.brassHi, [[bx + i * 3 - 2, by + 2], [bx + i * 3 + 2, by + 8]]);
  // Legs.
  if (sit) {
    line(c, 2, COL.iron, [[bx - 3, by + 11], [bx - 3, by + 14]]);
    line(c, 2, COL.iron, [[bx + 3, by + 11], [bx + 3, by + 14]]);
  } else {
    const s = kind === 'walk0' ? 3 : -3;
    for (const [x, d] of [[bx - 6, s], [bx - 3, -s], [bx + 4, -s], [bx + 7, s]] as [number, number][]) line(c, 1.8, COL.iron, [[x, by + 8], [x + d, by + 13]]);
  }
  // The head, one ear, an amber eye.
  const hx = sit ? bx + 1 : bx + 10, hy = sit ? by - 2 : by - 1;
  shape(c, COL.copper, circ(c, hx, hy, 4.6), 1.1);
  shape(c, COL.copper, () => {
    c.moveTo(hx - 3, hy - 3);
    c.lineTo(hx - 4, hy - 8);
    c.lineTo(hx, hy - 4);
    c.closePath();
  }, 0.9);
  shape(c, COL.amber, circ(c, hx + 2, hy - 0.5, 1.1), 0);
  // The tail, up and curled.
  line(c, 2, COL.copper, sit ? [[bx - 5, by + 12], [bx - 10, by + 10], [bx - 10, by + 3], [bx - 7, by + 1]] : [[bx - 9, by + 4], [bx - 13, by - 1], [bx - 12, by - 6]]);
}

export function makePlaceArtQ(scene: Phaser.Scene) {
  Object.assign(SIZE, BOXQ);
  const B = (k: string) => BOXQ[k];

  // The Kennel: a little timber doghouse with an arched door and a plaque, GOOD BOY.
  canvas(scene, 'doghouse', ...B('doghouse'), (c) => {
    shape(c, grad(c, 0, 22, 0, 66, [[0, '#b08650'], [1, '#6c4e2c']]), rr(c, 8, 26, 60, 40, 3), 1.6);
    for (const x of [22, 38, 54]) line(c, 1, 'rgba(29,26,23,0.35)', [[x, 28], [x, 64]]);
    shape(c, '#6a5a3a', () => {
      c.moveTo(2, 28);
      c.lineTo(38, 6);
      c.lineTo(74, 28);
      c.closePath();
    }, 1.6);
    shape(c, COL.soot, () => {
      c.moveTo(28, 66);
      c.lineTo(28, 46);
      c.quadraticCurveTo(38, 34, 48, 46);
      c.lineTo(48, 66);
      c.closePath();
    }, 1.2);
    shape(c, COL.amber, circ(c, 36, 54, 1.4), 0);
    shape(c, COL.amber, circ(c, 41, 54, 1.4), 0);
    shape(c, COL.brass, rr(c, 20, 14, 36, 9, 1), 1.2);
    c.fillStyle = COL.soot;
    c.font = 'bold 7px sans-serif';
    c.textAlign = 'center';
    c.fillText('GOOD BOY', 38, 21);
    rivets(c, [[22, 18], [54, 18]]);
  });
  // A dig mound: a heap of dirt with a bone's end sticking out; dug, a hole.
  canvas(scene, 'dig-mound', ...B('dig-mound'), (c) => {
    shape(c, grad(c, 0, 4, 0, 20, [[0, '#a07a4c'], [1, '#6a4c2c']]), () => {
      c.moveTo(2, 20);
      c.quadraticCurveTo(10, 3, 22, 3);
      c.quadraticCurveTo(34, 3, 42, 20);
      c.closePath();
    }, 1.4);
    c.fillStyle = 'rgba(29,26,23,0.25)';
    for (const [x, y] of [[12, 14], [26, 10], [32, 16], [18, 17]]) c.fillRect(x, y, 3, 2);
    shape(c, '#f0e6cc', rr(c, 24, 4, 8, 3, 1.4), 0.8);
  });
  canvas(scene, 'dig-mound-dug', ...B('dig-mound-dug'), (c) => {
    shape(c, '#6a4c2c', () => c.ellipse(22, 14, 18, 6, 0, 0, Math.PI * 2), 1.2);
    shape(c, COL.soot, () => c.ellipse(22, 14, 11, 3.4, 0, 0, Math.PI * 2), 0);
    c.fillStyle = 'rgba(160,122,76,0.9)';
    for (const [x, y] of [[4, 16], [38, 17], [30, 20], [10, 20]]) c.fillRect(x, y, 4, 2);
  });
  // The Little Compactor: a boxy robot on treads with binocular eyes.
  canvas(scene, 'compactor-bot', ...B('compactor-bot'), (c) => {
    shape(c, COL.iron, rr(c, 4, 36, 50, 12, 6), 1.4);
    for (let x = 10; x < 50; x += 8) shape(c, COL.ironHi, circ(c, x, 42, 3), 0.6);
    shape(c, grad(c, 0, 12, 0, 38, [[0, '#d8c8a0'], [1, '#8a7a58']]), rr(c, 8, 14, 42, 26, 3), 1.6);
    shape(c, COL.iron, rr(c, 14, 20, 30, 12, 2), 1);
    c.fillStyle = COL.soot;
    c.fillRect(20, 24, 18, 1.4);
    // The binocular eyes on a neck.
    line(c, 3, COL.ironHi, [[29, 14], [29, 8]]);
    shape(c, COL.brassLo, rr(c, 16, 2, 26, 9, 4), 1.2);
    shape(c, COL.glass, circ(c, 23, 6, 3.2), 0.8);
    shape(c, COL.glass, circ(c, 35, 6, 3.2), 0.8);
    shape(c, COL.soot, circ(c, 23, 6, 1.4), 0);
    shape(c, COL.soot, circ(c, 35, 6, 1.4), 0);
    rivets(c, [[12, 18], [46, 18]]);
  });
  canvas(scene, 'cube-tower', ...B('cube-tower'), (c) => {
    const cube = (x: number, y: number, s: number, tone: string) => {
      shape(c, tone, rr(c, x, y, s, s, 1.5), 1.2);
      line(c, 0.8, 'rgba(29,26,23,0.4)', [[x + 2, y + s * 0.4], [x + s - 2, y + s * 0.6]]);
    };
    cube(2, 38, 16, '#8a8478');
    cube(16, 40, 16, '#a09478');
    cube(8, 24, 16, '#7a8a8a');
    cube(18, 22, 14, '#9a7a58');
    cube(10, 8, 14, '#8a8478');
  });
  // The Farthest Cairn: stacked stones; a satchel against them; the frayed flag is its own image (planted by the view).
  canvas(scene, 'cairn', ...B('cairn'), (c) => {
    shape(c, grad(c, 0, 30, 0, 52, [[0, '#8a8478'], [1, '#5a564e']]), rr(c, 4, 36, 40, 16, 6), 1.5);
    shape(c, grad(c, 0, 20, 0, 40, [[0, '#9a9488'], [1, '#6a665e']]), rr(c, 10, 22, 28, 16, 5), 1.5);
    shape(c, grad(c, 0, 8, 0, 24, [[0, '#a8a296'], [1, '#76726a']]), rr(c, 16, 8, 16, 15, 4), 1.4);
    shape(c, '#7a5a38', rr(c, 34, 40, 11, 9, 2), 1.2);
    line(c, 1, COL.soot, [[34, 43], [45, 43]]);
  });
  canvas(scene, 'cairn-flag', ...B('cairn-flag'), (c) => {
    line(c, 2, COL.ironHi, [[4, 46], [4, 3]]);
    shape(c, COL.brass, () => {
      c.moveTo(5, 4);
      c.lineTo(20, 8);
      c.lineTo(15, 13);
      c.lineTo(20, 18);
      c.lineTo(5, 16);
      c.closePath();
    }, 1.2);
    shape(c, COL.copper, circ(c, 10, 11, 2), 0.6);
  });
  makeCompanionArt(scene);
}

/** The dog, the cat and the dog's bowl: also the hub's (`hub/companionview.ts`), so a scene without the quest places can have them. */
export function makeCompanionArt(scene: Phaser.Scene) {
  Object.assign(SIZE, BOXQ);
  const B = (k: string) => BOXQ[k];
  canvas(scene, 'dog-bowl', ...B('dog-bowl'), (c) => {
    shape(c, grad(c, 0, 2, 0, 10, [[0, COL.brassHi], [1, COL.brassLo]]), () => {
      c.moveTo(2, 4);
      c.lineTo(22, 4);
      c.quadraticCurveTo(20, 11, 12, 11);
      c.quadraticCurveTo(4, 11, 2, 4);
    }, 1.2);
    shape(c, COL.soot, () => c.ellipse(12, 4, 9, 1.8, 0, 0, Math.PI * 2), 0);
  });
  // The dog: standing, pointing (head down and forward, a foreleg raised, the tail stiff), running (two frames), digging.
  const stand: Pose = { head: [38, 8], legs: [[0, 0], [0, 0], [0, 0], [0, 0]], tail: 'wag' };
  canvas(scene, 'dog-stand', ...B('dog-stand'), (c) => dog(c, 48, stand));
  canvas(scene, 'dog-point', ...B('dog-point'), (c) => dog(c, 52, { head: [44, 13], legs: [[0, 0], [8, -6], [0, 0], [0, 0]], tail: 'up' }));
  canvas(scene, 'dog-run-0', ...B('dog-run-0'), (c) => dog(c, 50, { head: [40, 6], legs: [[8, -2], [-6, 0], [-7, 0], [8, -2]], tail: 'up' }));
  canvas(scene, 'dog-run-1', ...B('dog-run-1'), (c) => dog(c, 50, { head: [40, 8], legs: [[-6, 0], [8, -2], [8, -2], [-7, 0]], tail: 'up' }));
  canvas(scene, 'dog-dig', ...B('dog-dig'), (c) => dog(c, 46, { head: [34, 18], legs: [[2, 0], [10, -4], [0, 0], [0, 0]], tail: 'wag' }));

  // The cat.
  canvas(scene, 'cat-sit', ...B('cat-sit'), (c) => cat(c, 'sit'));
  canvas(scene, 'cat-walk-0', ...B('cat-walk-0'), (c) => cat(c, 'walk0'));
  canvas(scene, 'cat-walk-1', ...B('cat-walk-1'), (c) => cat(c, 'walk1'));
  canvas(scene, 'cat-sleep', ...B('cat-sleep'), (c) => cat(c, 'sleep'));
}
