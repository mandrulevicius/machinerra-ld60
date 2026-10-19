/**
 * The NPCs: `npcImage` (painted from the atlas when there is a painting, else drawn here) and `makeNpcArt`, the drawn
 * robots. Add an NPC: a painter in `makeNpcArt`; a painting needs only the atlas.
 */
import Phaser from 'phaser';
import { COL } from '../../art';
import { type Ctx, fillPath, grad, lines, poly, rivet, tex } from './draw';

// ---------------------------------------------------------------- NPCs

/** Drawn robots, 60 x 90, feet at the bottom centre. */
/**
 * An NPC's image: painted from Laimonas's sheets (`art/npc/<id>`, Brushed flat, from the atlas) when there is one, else
 * drawn here (`npc-<id>`). In the hub painted ones stand `PAINTED_H` px tall (70 unless named) and drawn ones 90; `k`
 * scales that (the stranded pilgrim in a mission is smaller).
 */
/**
 * Painted NPCs' heights, against the Communicator's 74 (`sizes.json`; about 70 of it is him): only the Oracle, the Kicker
 * and the Trader stand taller than him (Minos); the others are shorter, and his wife (a robot vacuum) well under him. The
 * Evil Oracle (only in the blessing cut scene) towers over him too, a little under his seated sister.
 */
const PAINTED_H: Record<string, number> = { highPriest: 140, kicker: 92, trader: 88, cityPlanner: 60, expeditioner: 60, princess: 40, evilOracle: 120 };
export function npcImage(scene: Phaser.Scene, x: number, y: number, id: string, k = 1) {
  const painted = scene.textures.exists('atlas') && scene.textures.get('atlas').has(`npc/${id}`);
  const img = painted ? scene.add.image(x, y, 'atlas', `npc/${id}`) : scene.add.image(x, y, `npc-${id}`);
  return img.setScale(((painted ? PAINTED_H[id] ?? 70 : 90) * k) / img.height);
}

/** NPC sprites are 60 x 90, feet at the bottom centre. */
const NPC_W = 60, NPC_H = 90;
const npcFeet = (c: Ctx) => fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(30, 86, 20, 5, 0, 0, Math.PI * 2), 0);

/**
 * Hob, the barrelwright and gunsmith (P20): a barrel-chested robot (staves and iron hoops), a leather apron, welding goggles
 * pushed up on a riveted iron head, a brass ear trumpet (he is forge-deaf) and a gun barrel as long as he is tall.
 */
export function paintHob(c: Ctx) {
  npcFeet(c);
  fillPath(c, COL.iron, () => c.rect(20, 68, 9, 18), 1.5);
  fillPath(c, COL.iron, () => c.rect(32, 68, 9, 18), 1.5);
  fillPath(c, COL.soot, () => c.roundRect(17, 80, 14, 7, 3), 1.5);
  fillPath(c, COL.soot, () => c.roundRect(30, 80, 14, 7, 3), 1.5);
  // The long barrel at his right hand, brass at the muzzle.
  fillPath(c, grad(c, 49, 0, 57, 0, [[0, '#4a4a50'], [0.5, '#9a9aa2'], [1, '#4a4a50']]), () => c.roundRect(49, 24, 8, 52, 3), 1.8);
  fillPath(c, COL.brass, () => c.rect(48, 24, 10, 5), 1.2);
  fillPath(c, COL.brass, () => c.rect(48, 56, 10, 4), 1.2);
  // The barrel body: staves, hoops.
  fillPath(c, grad(c, 10, 0, 50, 0, [[0, '#4a2c16'], [0.5, '#9a6a3c'], [1, '#4a2c16']]), () => c.roundRect(10, 32, 40, 42, 12), 2.2);
  lines(c, 'rgba(30,16,8,0.5)', 1, [[22, 33, 21, 73], [30, 32, 30, 74], [38, 33, 39, 73]]);
  for (const y of [40, 66]) fillPath(c, COL.ironHi, () => c.rect(10, y, 40, 4), 1.2);
  rivet(c, 14, 42);
  rivet(c, 46, 42);
  rivet(c, 14, 68);
  rivet(c, 46, 68);
  // Apron, a pocket of tools.
  fillPath(c, '#4a2e18', () => c.roundRect(19, 48, 22, 26, 3), 1.5);
  fillPath(c, COL.brass, () => c.rect(19, 48, 22, 3), 0);
  lines(c, COL.ironHi, 2, [[25, 54, 25, 62], [30, 54, 30, 60], [35, 54, 35, 63]]);
  // The head: a riveted iron box, goggles pushed up, an amber slit, a grille.
  fillPath(c, grad(c, 18, 0, 42, 0, [[0, '#5a5650'], [0.5, '#8a847a'], [1, '#5a5650']]), () => c.roundRect(17, 10, 26, 24, 5), 2);
  rivet(c, 20, 13);
  rivet(c, 40, 13);
  fillPath(c, COL.brassLo, () => c.roundRect(17, 12, 26, 5, 2), 1);
  fillPath(c, COL.glass, () => c.arc(24, 13, 4, 0, Math.PI * 2), 1.2, COL.brass);
  fillPath(c, COL.glass, () => c.arc(36, 13, 4, 0, Math.PI * 2), 1.2, COL.brass);
  fillPath(c, '#2a2520', () => c.rect(20, 21, 20, 5), 0);
  fillPath(c, COL.amber, () => c.rect(23, 22, 14, 2.4), 0);
  lines(c, COL.soot, 1.2, [[24, 29, 24, 33], [28, 29, 28, 33], [32, 29, 32, 33], [36, 29, 36, 33]]);
  // The ear trumpet, bell out to his left.
  fillPath(c, grad(c, 0, 14, 0, 34, [[0, COL.brassHi], [1, COL.brassLo]]), () => poly(c, [18, 22, 3, 14, 3, 34, 18, 27]), 1.6);
  fillPath(c, COL.soot, () => c.ellipse(3.5, 24, 2.4, 9, 0, 0, Math.PI * 2), 0.8);
  // Soot on the cheek.
  fillPath(c, 'rgba(20,16,12,0.35)', () => c.ellipse(36, 28, 5, 3, 0.3, 0, Math.PI * 2), 0);
}

/**
 * Dr. Gasket, the augmenter (P20): a tall, thin, cheerful surgeon in a cream coat, a head mirror, a loupe, a teal mask, a
 * stethoscope round the neck and a brass syringe in hand.
 */
export function paintGasket(c: Ctx) {
  npcFeet(c);
  fillPath(c, COL.iron, () => c.rect(24, 64, 5, 22), 1.5);
  fillPath(c, COL.iron, () => c.rect(33, 64, 5, 22), 1.5);
  fillPath(c, COL.soot, () => c.roundRect(21, 81, 10, 6, 3), 1.5);
  fillPath(c, COL.soot, () => c.roundRect(31, 81, 10, 6, 3), 1.5);
  // The coat: cream, long, buttoned in brass, a pocket of pens.
  fillPath(c, grad(c, 16, 0, 46, 0, [[0, '#b8b2a2'], [0.5, '#efe9da'], [1, '#b8b2a2']]), () => poly(c, [19, 34, 43, 34, 48, 76, 14, 76]), 2);
  lines(c, 'rgba(60,50,40,0.45)', 1, [[31, 36, 31, 75]]);
  for (const y of [42, 50, 58, 66]) fillPath(c, COL.brass, () => c.arc(31, y, 1.6, 0, Math.PI * 2), 0.6);
  fillPath(c, '#e0d9c8', () => c.rect(34, 52, 8, 9), 1);
  lines(c, '#3a8a7a', 1.6, [[36, 50, 36, 55], [39, 50, 39, 55]]);
  // The stethoscope: a loop round the neck, the bell hanging.
  c.strokeStyle = COL.soot;
  c.lineWidth = 2.2;
  c.beginPath();
  c.moveTo(24, 34);
  c.quadraticCurveTo(22, 52, 31, 54);
  c.quadraticCurveTo(40, 52, 38, 34);
  c.stroke();
  fillPath(c, COL.brass, () => c.arc(31, 55, 3, 0, Math.PI * 2), 1.2);
  // An arm out with a syringe: a glass barrel, a brass plunger, a long needle.
  lines(c, '#cfc9b8', 5, [[43, 40, 52, 56]]);
  lines(c, COL.soot, 1.2, [[43, 40, 52, 56]]);
  c.save();
  c.translate(53, 60);
  c.rotate(-0.12);
  fillPath(c, 'rgba(200,235,255,0.75)', () => c.roundRect(-4, -4, 8, 22, 2), 1.4);
  fillPath(c, COL.amber, () => c.rect(-3, 4, 6, 12), 0);
  fillPath(c, COL.brass, () => c.rect(-5, -6, 10, 3), 1);
  lines(c, COL.ironHi, 1.4, [[0, 18, 0, 30]]);
  c.restore();
  // The head: round, copper, a head mirror on a band, a loupe over one eye, a teal mask with a vent.
  fillPath(c, grad(c, 20, 0, 42, 0, [[0, COL.copper], [0.5, COL.copperHi], [1, COL.copper]]), () => c.roundRect(20, 10, 22, 24, 10), 2);
  fillPath(c, '#2a1a0a', () => c.rect(20, 11, 22, 3), 0);
  fillPath(c, grad(c, 25, 0, 37, 0, [[0, '#8a949e'], [0.5, '#e8f0f4'], [1, '#8a949e']]), () => c.arc(31, 9, 6.5, 0, Math.PI * 2), 1.6, COL.brassLo);
  fillPath(c, COL.soot, () => c.arc(31, 9, 1.6, 0, Math.PI * 2), 0);
  fillPath(c, COL.glass, () => c.arc(26, 21, 2.6, 0, Math.PI * 2), 1);
  fillPath(c, COL.glass, () => c.arc(36, 21, 4, 0, Math.PI * 2), 1.4, COL.brass);
  fillPath(c, '#3a8a7a', () => c.roundRect(23, 26, 16, 7, 3), 1.4);
  lines(c, 'rgba(0,0,0,0.4)', 1, [[27, 28, 27, 31], [31, 28, 31, 31], [35, 28, 35, 31]]);
}

export function makeNpcArt(scene: Phaser.Scene) {
  const W = 60, H = 90;
  const feet = (c: Ctx) => fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(30, 86, 20, 5, 0, 0, Math.PI * 2), 0);
  // The High Priest: a red-robed boiler with a gear halo, one amber lens, a censer on a chain.
  tex(scene, 'npc-highPriest', W, H, (c) => {
    feet(c);
    c.strokeStyle = COL.brass;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(30, 22, 17, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      fillPath(c, COL.brass, () => c.rect(30 + Math.cos(a) * 18 - 2, 22 + Math.sin(a) * 18 - 2, 4, 4), 0);
    }
    fillPath(c, grad(c, 10, 0, 50, 0, [[0, '#5a1410'], [0.5, '#a02a20'], [1, '#5a1410']]), () => {
      c.moveTo(22, 34);
      c.lineTo(38, 34);
      c.lineTo(50, 86);
      c.lineTo(10, 86);
      c.closePath();
    }, 2);
    fillPath(c, COL.brass, () => c.rect(27, 36, 6, 50), 0);
    fillPath(c, grad(c, 18, 0, 42, 0, [[0, COL.copper], [0.5, COL.copperHi], [1, COL.copper]]), () => c.roundRect(20, 12, 20, 24, 6), 2);
    fillPath(c, '#2a1a0a', () => c.arc(30, 22, 6, 0, Math.PI * 2), 1.5, COL.brass);
    fillPath(c, COL.amber, () => c.arc(30, 22, 3.5, 0, Math.PI * 2), 0);
    c.strokeStyle = '#5a524a';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(46, 50);
    c.lineTo(52, 64);
    c.stroke();
    fillPath(c, COL.brass, () => c.ellipse(52, 68, 5, 5, 0, 0, Math.PI * 2), 1.2);
  });
  // The Expeditioner: a khaki box with a pith helmet, goggles, a rucksack and a telescope.
  tex(scene, 'npc-expeditioner', W, H, (c) => {
    feet(c);
    fillPath(c, '#5a4a30', () => c.roundRect(12, 34, 12, 30, 4), 1.5);
    fillPath(c, '#3d3833', () => c.rect(20, 66, 8, 20), 1.5);
    fillPath(c, '#3d3833', () => c.rect(33, 66, 8, 20), 1.5);
    fillPath(c, grad(c, 16, 0, 46, 0, [[0, '#8a7a50'], [0.5, '#c8b480'], [1, '#8a7a50']]), () => c.roundRect(17, 34, 28, 34, 5), 2);
    fillPath(c, COL.brass, () => c.rect(17, 54, 28, 4), 0);
    fillPath(c, '#b8a878', () => c.roundRect(20, 16, 22, 20, 5), 2);
    fillPath(c, '#2a2520', () => c.rect(20, 22, 22, 6), 0);
    fillPath(c, COL.glass, () => c.arc(26, 25, 3, 0, Math.PI * 2), 1);
    fillPath(c, COL.glass, () => c.arc(36, 25, 3, 0, Math.PI * 2), 1);
    fillPath(c, '#e8dcb0', () => c.ellipse(31, 14, 16, 6, 0, 0, Math.PI * 2), 1.5);
    fillPath(c, '#e8dcb0', () => c.ellipse(31, 10, 10, 8, 0, Math.PI, 0), 1.5);
    fillPath(c, COL.brass, () => c.roundRect(44, 40, 14, 5, 2), 1.2);
  });
  // The City Planner: a slim copper robot with a monocle, rolled blueprints and a drafting compass.
  tex(scene, 'npc-cityPlanner', W, H, (c) => {
    feet(c);
    fillPath(c, COL.iron, () => c.rect(23, 64, 6, 22), 1.5);
    fillPath(c, COL.iron, () => c.rect(32, 64, 6, 22), 1.5);
    fillPath(c, grad(c, 20, 0, 42, 0, [[0, COL.copper], [0.5, COL.copperHi], [1, COL.copper]]), () => c.roundRect(20, 34, 22, 32, 8), 2);
    fillPath(c, COL.copper, () => c.roundRect(22, 12, 18, 22, 4), 2);
    fillPath(c, '#2a1a0a', () => c.rect(25, 20, 12, 4), 0);
    fillPath(c, COL.glass, () => c.arc(34, 22, 4, 0, Math.PI * 2), 1.5, COL.brass);
    fillPath(c, '#2a2a30', () => c.rect(22, 8, 18, 6), 1.5);
    fillPath(c, '#4a7ab8', () => c.roundRect(6, 40, 20, 8, 4), 1.5);
    fillPath(c, '#4a7ab8', () => c.roundRect(8, 47, 20, 8, 4), 1.5);
    c.strokeStyle = '#c0c4c8';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(48, 36);
    c.lineTo(44, 60);
    c.moveTo(48, 36);
    c.lineTo(54, 60);
    c.stroke();
  });
  // Sprocket (level 1's rescue, P9): a small mechanic, a leather apron, welding goggles pushed up, a spanner as long as her arm.
  tex(scene, 'npc-sprocket', W, H, (c) => {
    feet(c);
    fillPath(c, COL.iron, () => c.rect(23, 66, 6, 20), 1.5);
    fillPath(c, COL.iron, () => c.rect(33, 66, 6, 20), 1.5);
    fillPath(c, grad(c, 18, 0, 44, 0, [[0, '#6a7480'], [0.5, '#9aa4b0'], [1, '#6a7480']]), () => c.roundRect(18, 36, 26, 32, 7), 2);
    fillPath(c, '#6b4426', () => c.roundRect(21, 46, 20, 24, 3), 1.5);
    fillPath(c, COL.brass, () => c.rect(21, 46, 20, 3), 0);
    fillPath(c, grad(c, 20, 0, 42, 0, [[0, '#8a949e'], [0.5, '#b8c0c8'], [1, '#8a949e']]), () => c.roundRect(20, 14, 22, 22, 6), 2);
    fillPath(c, '#2a2520', () => c.rect(21, 22, 20, 6), 0);
    fillPath(c, COL.amber, () => c.arc(27, 25, 2.4, 0, Math.PI * 2), 0);
    fillPath(c, COL.amber, () => c.arc(35, 25, 2.4, 0, Math.PI * 2), 0);
    fillPath(c, COL.brass, () => c.roundRect(20, 11, 22, 6, 3), 1.2);
    fillPath(c, COL.glass, () => c.arc(26, 12, 3.2, 0, Math.PI * 2), 1, COL.brass);
    fillPath(c, COL.glass, () => c.arc(36, 12, 3.2, 0, Math.PI * 2), 1, COL.brass);
    c.strokeStyle = COL.iron;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(46, 44);
    c.lineTo(54, 78);
    c.stroke();
    fillPath(c, COL.brass, () => c.roundRect(50, 74, 10, 8, 3), 1.2);
  });
  // The Kicker: squat iron, a headband, one huge riveted boot.
  tex(scene, 'npc-kicker', W, H, (c) => {
    feet(c);
    fillPath(c, COL.iron, () => c.rect(18, 62, 8, 20), 1.5);
    fillPath(c, COL.soot, () => c.roundRect(12, 78, 16, 8, 3), 1.5);
    fillPath(c, COL.iron, () => c.rect(34, 58, 9, 16), 1.5);
    fillPath(c, grad(c, 30, 70, 58, 90, [[0, COL.brassHi], [1, COL.brassLo]]), () => c.roundRect(30, 70, 28, 16, 6), 2);
    rivet(c, 38, 77);
    rivet(c, 46, 77);
    rivet(c, 54, 77);
    fillPath(c, grad(c, 12, 0, 50, 0, [[0, '#3d3833'], [0.5, '#6a625a'], [1, '#3d3833']]), () => c.roundRect(12, 30, 36, 32, 8), 2);
    fillPath(c, '#6a625a', () => c.roundRect(19, 12, 22, 20, 4), 2);
    fillPath(c, COL.red, () => c.rect(18, 16, 24, 4), 0);
    fillPath(c, COL.amber, () => c.rect(24, 23, 12, 3), 0);
  });
  // Hob and Gasket (P20): their sprites are the painters above, so their portraits (`portraits.ts`) are the same figures drawn large.
  tex(scene, 'npc-hob', NPC_W, NPC_H, paintHob);
  tex(scene, 'npc-gasket', NPC_W, NPC_H, paintGasket);
}
