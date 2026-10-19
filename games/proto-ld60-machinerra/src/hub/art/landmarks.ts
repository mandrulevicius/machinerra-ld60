/**
 * Each station's centrepiece (`LANDMARK_ART` by NPC id, `stationTex`), drawn in a `LANDMARK` box with its feet at
 * `foot`. Add one: an entry in `LANDMARK_ART`.
 */
import Phaser from 'phaser';
import { COL } from '../../art';
import {
  cottageWindow,
  type Ctx,
  fillPath,
  gauge,
  grad,
  lines,
  planksIn,
  poly,
  puff,
  radial,
  rivet,
  seeded,
  shell,
  texH,
  wheel,
} from './draw';
import { BOOTH_SCALE } from '../layout';

// ---------------------------------------------------------------- each station's centrepiece (no market stalls)

/** A station's centrepiece: drawn in a `w` x `h` box, its feet at `foot` (the image's origin). */
export const LANDMARK = { w: 220, h: 236, foot: 226 };
const plaque = (c: Ctx, text: string, x: number, y: number) => {
  c.font = `bold ${text.length > 10 ? 12 : 15}px Georgia, serif`;
  const w = c.measureText(text).width + 22;
  fillPath(c, '#2a1c12', () => c.roundRect(x - w / 2, y - 12, w, 24, 5), 2, COL.brass);
  c.fillStyle = COL.brassHi;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, x, y + 1);
};
const footShadow = (c: Ctx, w: number) => fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(110, LANDMARK.foot - 2, w, 12, 0, 0, Math.PI * 2), 0);

const LANDMARK_ART: Record<string, (c: Ctx) => void> = {
  // The dojo: a raised plank floor under a red gate with a curved lintel, a brass gong hung between the posts, a scroll, a mallet.
  kicker(c) {
    footShadow(c, 100);
    fillPath(c, '#6a4428', () => c.roundRect(14, 186, 192, 34, 4), 2);
    planksIn(c, 16, 188, 188, 30, 8);
    for (const x of [34, 186]) {
      fillPath(c, grad(c, x - 9, 0, x + 9, 0, [[0, '#5a1a12'], [0.5, '#a02a1e'], [1, '#4a140e']]), () => c.rect(x - 9, 40, 18, 150), 2);
      fillPath(c, COL.soot, () => c.rect(x - 11, 178, 22, 12), 1.5);
    }
    fillPath(c, '#2a1a12', () => { c.moveTo(4, 26); c.quadraticCurveTo(110, 44, 216, 26); c.lineTo(212, 42); c.quadraticCurveTo(110, 56, 8, 42); c.closePath(); }, 2);
    fillPath(c, '#a02a1e', () => c.rect(20, 64, 180, 12), 2);
    plaque(c, 'DOJO', 110, 70);
    lines(c, '#5a524a', 2, [[96, 76, 104, 98], [124, 76, 116, 98]]);
    fillPath(c, radial(c, 102, 120, 34, [[0, COL.brassHi], [0.6, COL.brass], [1, COL.brassLo]]), () => c.arc(110, 128, 30, 0, Math.PI * 2), 2.5);
    c.strokeStyle = 'rgba(90,60,20,0.6)';
    c.lineWidth = 1.5;
    for (const r of [10, 20]) {
      c.beginPath();
      c.arc(110, 128, r, 0, Math.PI * 2);
      c.stroke();
    }
    lines(c, '#6a4428', 4, [[160, 184, 172, 142]]);
    fillPath(c, '#e8dcc0', () => c.ellipse(173, 138, 7, 6, 0, 0, Math.PI * 2), 1.5);
    fillPath(c, '#f0e6cc', () => c.rect(46, 92, 22, 64), 1.5, '#5a4020');
    fillPath(c, '#2a1a12', () => c.rect(44, 89, 26, 5), 1);
    lines(c, COL.soot, 3, [[57, 102, 57, 128], [50, 112, 64, 112], [52, 142, 62, 134]]);
  },
  // The Trader: a steam wagon with its side let down as a counter, shelves of goods inside, a bell, a stovepipe smoking.
  trader(c) {
    footShadow(c, 104);
    fillPath(c, '#5a3a20', () => c.rect(14, 176, 192, 10), 2);
    fillPath(c, grad(c, 0, 70, 0, 180, [[0, '#7a5232'], [1, '#5a3a20']]), () => c.roundRect(18, 70, 184, 108, 6), 2.5);
    fillPath(c, '#2e5a4a', () => { c.moveTo(10, 74); c.quadraticCurveTo(110, 30, 210, 74); c.closePath(); }, 2.5);
    c.strokeStyle = COL.brass;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(16, 70);
    c.quadraticCurveTo(110, 30, 204, 70);
    c.stroke();
    fillPath(c, '#24160e', () => c.rect(40, 88, 140, 64), 2);
    for (const y of [110, 132]) fillPath(c, '#8a5a30', () => c.rect(40, y, 140, 5), 1);
    const r = seeded(77);
    for (const sy of [109, 131, 151])
      for (let x = 46; x < 170; x += 14 + r() * 8) {
        const col = ['#c03a2a', '#d8a030', '#4a8a5a', '#e8dcc0', COL.copperHi, '#3a6a9a'][Math.floor(r() * 6)];
        const hh = 8 + r() * 10;
        const round = r() > 0.5;
        fillPath(c, col, () => (round ? c.arc(x + 5, sy - 6, 6, 0, Math.PI * 2) : c.roundRect(x, sy - hh, 9, hh, 3)), 1);
      }
    fillPath(c, '#8a5a30', () => c.roundRect(32, 150, 156, 12, 3), 2);
    for (const x of [40, 180]) fillPath(c, '#5a3a20', () => c.rect(x - 2, 162, 4, 14), 1);
    wheel(c, 50, 194, 26);
    wheel(c, 170, 194, 26);
    fillPath(c, COL.iron, () => c.rect(168, 22, 12, 40), 2);
    fillPath(c, COL.ironHi, () => c.rect(164, 18, 20, 7), 1.5);
    puff(c, 'rgba(240,235,225,0.55)', [[178, 10, 7], [190, 3, 9]]);
    lines(c, COL.brassLo, 2, [[196, 74, 196, 84]]);
    fillPath(c, COL.brass, () => { c.moveTo(196, 82); c.quadraticCurveTo(204, 84, 206, 98); c.lineTo(186, 98); c.quadraticCurveTo(188, 84, 196, 82); }, 1.5);
    plaque(c, 'GOODIES & MORE!', 96, 56);
  },
  // The expeditions: a chart board on two legs (the sands, pins, a red route) and a great brass globe on a tripod beside it.
  expeditioner(c) {
    footShadow(c, 100);
    for (const x of [36, 132]) fillPath(c, '#4a3a28', () => c.rect(x - 4, 60, 8, 160), 1.5);
    fillPath(c, '#5a4a30', () => c.rect(18, 50, 132, 110), 2.5);
    fillPath(c, '#d8c090', () => c.rect(26, 58, 116, 94), 1.5, '#5a4020');
    c.strokeStyle = 'rgba(122,74,40,0.55)';
    c.lineWidth = 1.5;
    for (const [x, y, rx, ry] of [[60, 86, 22, 12], [108, 120, 18, 14], [70, 130, 12, 8]]) {
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2);
      c.stroke();
    }
    c.setLineDash([4, 4]);
    c.strokeStyle = COL.red;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(40, 140);
    c.bezierCurveTo(70, 70, 100, 140, 128, 72);
    c.stroke();
    c.setLineDash([]);
    for (const [x, y, col] of [[40, 140, '#3a6a9a'], [84, 104, COL.amber], [128, 72, COL.red]] as [number, number, string][]) fillPath(c, col, () => c.arc(x, y, 4, 0, Math.PI * 2), 1.2);
    plaque(c, 'EXPEDITIONS', 84, 40);
    lines(c, COL.brassLo, 5, [[179, 168, 156, 222], [179, 168, 202, 222], [179, 168, 179, 222]]);
    fillPath(c, COL.brass, () => c.rect(175, 150, 8, 22), 1.5);
    fillPath(c, radial(c, 170, 112, 40, [[0, '#e8d8a8'], [0.7, '#b89a5a'], [1, '#6a5028']]), () => c.arc(179, 122, 30, 0, Math.PI * 2), 2);
    c.fillStyle = 'rgba(90,110,70,0.75)';
    c.beginPath();
    c.ellipse(170, 112, 12, 8, 0.5, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(190, 132, 9, 12, -0.3, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = COL.brass;
    c.lineWidth = 4;
    c.beginPath();
    c.arc(179, 122, 37, Math.PI * 0.6, Math.PI * 2.4);
    c.stroke();
  },
  // The drafting wall: a plank scaffold holding a great blueprint of the city to be, rolls racked below, a lamp on an arm.
  cityPlanner(c) {
    footShadow(c, 100);
    for (const x of [20, 200]) fillPath(c, '#5a4a38', () => c.rect(x - 5, 30, 10, 192), 1.5);
    fillPath(c, '#5a4a38', () => c.rect(10, 168, 200, 8), 1.5);
    fillPath(c, '#2a5a9a', () => c.rect(28, 40, 164, 120), 2, '#14284a');
    c.strokeStyle = 'rgba(224,232,240,0.75)';
    c.lineWidth = 1.2;
    c.strokeRect(34, 46, 152, 108);
    c.beginPath();
    c.ellipse(110, 74, 50, 16, 0, 0, Math.PI * 2);
    c.moveTo(60, 74);
    c.lineTo(160, 74);
    for (const [x, h] of [[54, 34], [74, 48], [96, 40], [124, 56], [148, 36], [168, 44]]) c.rect(x, 148 - h, 14, h);
    c.stroke();
    c.setLineDash([3, 3]);
    c.beginPath();
    c.moveTo(42, 148);
    c.lineTo(178, 148);
    c.stroke();
    c.setLineDash([]);
    for (const [x, y] of [[32, 44], [188, 44], [32, 156], [188, 156]]) fillPath(c, COL.brass, () => c.arc(x, y, 3, 0, Math.PI * 2), 1);
    for (let i = 0; i < 6; i++) fillPath(c, i % 2 ? '#2a5a9a' : '#efe8da', () => c.roundRect(30 + i * 27, 178 + (i % 2) * 6, 22, 40 - (i % 2) * 6, 10), 1.5);
    lines(c, COL.brassLo, 3, [[200, 40, 214, 20, 188, 14]]);
    fillPath(c, COL.brass, () => poly(c, [176, 12, 198, 12, 192, 24, 182, 24]), 1.5);
    fillPath(c, COL.glass, () => c.arc(187, 27, 4, 0, Math.PI * 2), 0);
    plaque(c, 'DRAFTING', 92, 24);
  },
  // Your house: a plank cottage under a shingle roof, a round-windowed door, curtained windows lit up, a stovepipe, flowers.
  home(c) {
    footShadow(c, 104);
    fillPath(c, grad(c, 0, 96, 0, 220, [[0, '#6a4a32'], [1, '#4a3222']]), () => c.rect(24, 100, 172, 120), 2.5);
    planksIn(c, 26, 102, 168, 116);
    fillPath(c, COL.iron, () => c.rect(160, 34, 12, 46), 2);
    fillPath(c, COL.brass, () => c.rect(156, 28, 20, 8), 1.5);
    puff(c, 'rgba(240,235,225,0.5)', [[170, 18, 7], [180, 8, 9]]);
    fillPath(c, '#5a2e4a', () => poly(c, [8, 104, 110, 26, 212, 104]), 2.5);
    const segs: number[][] = [];
    for (let y = 44, row = 0; y <= 100; y += 10, row++) {
      const half = ((y - 26) / 78) * 102;
      segs.push([110 - half, y, 110 + half, y]);
      for (let x = 110 - half + (row % 2) * 6 + 6; x < 110 + half - 2; x += 12) segs.push([x, y, x, y - 10]);
    }
    lines(c, 'rgba(0,0,0,0.3)', 1.2, segs);
    fillPath(c, '#7a4a8a', () => c.rect(6, 100, 208, 8), 2);
    fillPath(c, COL.brass, () => c.arc(110, 70, 14, 0, Math.PI * 2), 2);
    fillPath(c, radial(c, 110, 70, 12, [[0, '#fff0c0'], [1, '#e0a040']]), () => c.arc(110, 70, 10, 0, Math.PI * 2), 0);
    fillPath(c, '#3a2214', () => c.roundRect(90, 142, 40, 80, [18, 18, 0, 0]), 2);
    fillPath(c, COL.brass, () => c.arc(110, 162, 8, 0, Math.PI * 2), 1.5);
    fillPath(c, '#ffd98a', () => c.arc(110, 162, 5, 0, Math.PI * 2), 0);
    fillPath(c, COL.brassHi, () => c.arc(122, 188, 3, 0, Math.PI * 2), 1);
    fillPath(c, '#7a4a8a', () => c.roundRect(84, 218, 52, 7, 3), 1.5);
    plaque(c, 'HOME', 110, 126);
    cottageWindow(c, 38, 146);
    cottageWindow(c, 150, 146);
  },
  // The shell magazine: a riveted rack of standing brass shells behind sandbags, hazard stripes on the frame, a red lamp.
  magazine(c) {
    footShadow(c, 104);
    fillPath(c, '#3a3a3e', () => c.rect(18, 50, 184, 140), 2.5);
    c.save();
    c.beginPath();
    c.rect(18, 50, 184, 14);
    c.clip();
    for (let x = 0, i = 0; x < 230; x += 16, i++) fillPath(c, i % 2 ? COL.soot : '#e0b030', () => poly(c, [x, 64, x + 8, 50, x + 24, 50, x + 16, 64]), 0);
    c.restore();
    fillPath(c, 'rgba(0,0,0,0)', () => c.rect(18, 50, 184, 140), 2.5);
    for (const [x, y] of [[24, 70], [196, 70], [24, 184], [196, 184]]) rivet(c, x, y, 2);
    fillPath(c, '#24242a', () => c.rect(30, 70, 160, 112), 1.5);
    for (const y of [124, 178]) {
      fillPath(c, COL.ironHi, () => c.rect(30, y, 160, 5), 1);
      for (let x = 42; x < 186; x += 18) shell(c, x, y, 48);
    }
    plaque(c, 'SHELLS', 110, 38);
    fillPath(c, '#5a1a14', () => c.arc(196, 36, 8, 0, Math.PI * 2), 1.5);
    fillPath(c, radial(c, 196, 36, 7, [[0, '#ffb0a0'], [1, COL.red]]), () => c.arc(196, 36, 6, 0, Math.PI * 2), 0);
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < (row ? 6 : 7); i++) {
        const x = 12 + i * 28 + (row ? 14 : 0), y = 222 - row * 16;
        fillPath(c, '#9a8a62', () => c.ellipse(x + 13, y - 8, 15, 10, 0, 0, Math.PI * 2), 1.5, '#4a3a22');
        lines(c, 'rgba(74,58,34,0.6)', 1, [[x + 4, y - 8, x + 22, y - 8]]);
      }
  },
  // The pressure boilers: a riveted drum on saddles, its firebox roaring, gauges, a stack, a safety valve letting off.
  boilers(c) {
    footShadow(c, 104);
    for (const x of [50, 170]) fillPath(c, COL.iron, () => poly(c, [x - 20, 222, x - 14, 176, x + 14, 176, x + 20, 222]), 2);
    fillPath(c, COL.iron, () => c.rect(38, 20, 22, 90), 2);
    fillPath(c, COL.ironHi, () => c.rect(32, 14, 34, 9), 1.5);
    puff(c, 'rgba(80,70,60,0.5)', [[54, 6, 9], [68, 0, 7]]);
    fillPath(c, grad(c, 0, 96, 0, 186, [[0, '#c86a3a'], [0.35, '#a84a2a'], [1, '#5a2414']]), () => c.roundRect(16, 96, 188, 90, 44), 2.5);
    for (const x of [64, 156]) {
      lines(c, 'rgba(0,0,0,0.35)', 2, [[x, 98, x, 184]]);
      for (let y = 108; y < 182; y += 12) rivet(c, x + 4, y, 1.4);
    }
    fillPath(c, COL.iron, () => c.roundRect(86, 146, 48, 44, 4), 2);
    fillPath(c, radial(c, 110, 176, 22, [[0, '#fff0a0'], [0.4, '#ffa030'], [1, '#a02a10']]), () => c.roundRect(92, 154, 36, 30, 3), 1.5);
    lines(c, COL.soot, 2, [[101, 154, 101, 184], [110, 154, 110, 184], [119, 154, 119, 184]]);
    fillPath(c, COL.brass, () => c.ellipse(150, 98, 20, 14, 0, Math.PI, 0), 2);
    fillPath(c, COL.brassLo, () => c.rect(146, 68, 8, 18), 1.5);
    puff(c, 'rgba(244,239,230,0.7)', [[150, 60, 7], [158, 50, 9]]);
    gauge(c, 182, 136, 14, -0.9);
    gauge(c, 40, 140, 11, 0.2);
    plaque(c, 'BOILERS', 110, 122);
  },
  // Sprocket's workshop: a lathe and a bench under a tin awning, a wheel of spanners, a lamp, a stack of salvaged plate.
  sprocket(c) {
    footShadow(c, 100);
    fillPath(c, '#4a4a50', () => c.rect(22, 206, 176, 18), 2);
    for (const x of [30, 190]) fillPath(c, COL.iron, () => c.rect(x - 5, 70, 10, 140), 2);
    fillPath(c, grad(c, 0, 50, 0, 80, [[0, '#8a949e'], [1, '#4a5058']]), () => poly(c, [14, 82, 28, 48, 192, 48, 206, 82]), 2.5);
    lines(c, 'rgba(0,0,0,0.3)', 2, [[60, 50, 54, 80], [110, 48, 110, 80], [160, 50, 166, 80]]);
    fillPath(c, '#6b4426', () => c.roundRect(34, 150, 152, 20, 3), 2);
    fillPath(c, COL.iron, () => c.rect(44, 170, 8, 38), 2);
    fillPath(c, COL.iron, () => c.rect(168, 170, 8, 38), 2);
    fillPath(c, grad(c, 0, 118, 0, 150, [[0, COL.brassHi], [1, COL.brassLo]]), () => c.roundRect(52, 120, 70, 30, 6), 2.5);
    fillPath(c, COL.iron, () => c.rect(122, 128, 24, 12), 2);
    fillPath(c, COL.brass, () => c.ellipse(60, 135, 9, 12, 0, 0, Math.PI * 2), 2);
    gauge(c, 160, 108, 14, 0.4);
    lines(c, COL.ironHi, 3, [[86, 96, 86, 120], [100, 92, 100, 120], [114, 96, 114, 120]]);
    for (const x of [86, 100, 114]) fillPath(c, COL.brass, () => c.ellipse(x, 92, 6, 4, 0, 0, Math.PI * 2), 1.2);
    fillPath(c, radial(c, 190, 86, 8, [[0, '#ffe0a0'], [1, COL.amber]]), () => c.arc(190, 86, 6, 0, Math.PI * 2), 1);
    plaque(c, 'WORKSHOP', 110, 196);
  },
  // Hob's forge: a brick hearth under an iron hood and a tall chimney, the fire roaring in its mouth, a leather bellows, gun barrels leaning on the wall.
  hob(c) {
    footShadow(c, 100);
    fillPath(c, '#4a4640', () => c.rect(14, 198, 192, 26), 2);
    // The chimney and its smoke.
    fillPath(c, grad(c, 90, 0, 130, 0, [[0, '#6a3222'], [0.5, '#8a4a30'], [1, '#5a2a1c']]), () => c.rect(92, 10, 36, 44), 2);
    for (const y of [22, 34, 46]) lines(c, 'rgba(0,0,0,0.3)', 1, [[92, y, 128, y]]);
    fillPath(c, COL.ironHi, () => c.rect(88, 6, 44, 8), 1.5);
    puff(c, 'rgba(70,62,56,0.55)', [[104, -2, 8], [118, -8, 10]]);
    // The hood.
    fillPath(c, grad(c, 0, 50, 0, 110, [[0, '#7a746a'], [1, '#3d3833']]), () => poly(c, [24, 108, 196, 108, 130, 50, 90, 50]), 2.5);
    for (const [x, y] of [[40, 102], [180, 102], [100, 58], [120, 58]]) rivet(c, x, y, 2);
    // The hearth: brick courses, the mouth with fire.
    fillPath(c, grad(c, 0, 106, 0, 200, [[0, '#8a4a30'], [1, '#5a2a1c']]), () => c.roundRect(30, 106, 160, 96, 5), 2.5);
    const bricks: number[][] = [];
    for (let y = 120, row = 0; y < 200; y += 14, row++) {
      bricks.push([30, y, 190, y]);
      for (let x = 30 + (row % 2) * 12; x < 190; x += 24) bricks.push([x, y - 14, x, y]);
    }
    lines(c, 'rgba(0,0,0,0.3)', 1, bricks);
    fillPath(c, '#1a0e08', () => c.roundRect(62, 138, 96, 64, [34, 34, 0, 0]), 2.5);
    fillPath(c, radial(c, 110, 190, 56, [[0, '#fff3b0'], [0.35, '#ffa030'], [0.75, '#c8401a'], [1, '#3a1208']]), () => c.roundRect(68, 146, 84, 56, [30, 30, 0, 0]), 0);
    for (const [x, h] of [[88, 26], [104, 38], [122, 30], [138, 22]]) fillPath(c, '#ffd870', () => { c.moveTo(x - 8, 200); c.quadraticCurveTo(x - 4, 200 - h, x, 200 - h - 6); c.quadraticCurveTo(x + 6, 200 - h * 0.5, x + 8, 200); c.closePath(); }, 0);
    fillPath(c, COL.iron, () => c.rect(62, 198, 96, 5), 1.5);
    plaque(c, 'FORGE', 110, 84);
    // The bellows at the right: a leather bag with wooden boards and a handle, its nozzle to the fire.
    fillPath(c, '#4a3220', () => poly(c, [194, 168, 214, 150, 218, 184, 194, 190]), 2);
    fillPath(c, '#7a4e2c', () => poly(c, [194, 172, 208, 160, 210, 182, 194, 186]), 1.5);
    lines(c, 'rgba(0,0,0,0.35)', 1.2, [[198, 172, 200, 186], [203, 168, 204, 184]]);
    lines(c, '#6a4428', 5, [[214, 154, 220, 126]]);
    lines(c, COL.ironHi, 3, [[194, 180, 160, 184]]);
    // Gun barrels leaning on the wall, brass bands.
    for (const [x, tilt] of [[14, 0], [24, 3], [34, -2]]) {
      fillPath(c, grad(c, x - 4, 0, x + 4, 0, [[0, '#4a4a50'], [0.5, '#a0a0a8'], [1, '#4a4a50']]), () => c.roundRect(x - 4 + tilt, 96, 8, 108, 3), 1.6);
      for (const y of [112, 160]) fillPath(c, COL.brass, () => c.rect(x - 5 + tilt, y, 10, 4), 1);
    }
  },
  // Dr. Gasket's clinic: a tiled alcove with a teal curtain, a surgical lamp on a jointed arm over a padded table, a glass cabinet of bottles.
  gasket(c) {
    footShadow(c, 100);
    // The tiled wall.
    fillPath(c, '#d8d4c4', () => c.rect(20, 40, 180, 156), 2.5);
    const tiles: number[][] = [];
    for (let x = 20; x <= 200; x += 18) tiles.push([x, 40, x, 196]);
    for (let y = 40; y <= 196; y += 18) tiles.push([20, y, 200, y]);
    lines(c, 'rgba(70,90,84,0.35)', 1, tiles);
    fillPath(c, '#3a8a7a', () => c.rect(20, 40, 180, 10), 2);
    fillPath(c, '#3a8a7a', () => c.rect(20, 160, 180, 6), 1.5);
    plaque(c, 'CLINIC', 66, 28);
    // The curtain rail and curtain.
    lines(c, COL.iron, 4, [[14, 54, 80, 54]]);
    fillPath(c, '#3a8a7a', () => { c.moveTo(16, 54); c.lineTo(76, 54); c.quadraticCurveTo(66, 100, 72, 160); c.lineTo(20, 160); c.quadraticCurveTo(28, 100, 16, 54); c.closePath(); }, 2);
    lines(c, 'rgba(0,0,0,0.25)', 1.5, [[30, 56, 32, 160], [46, 56, 46, 160], [60, 56, 62, 160]]);
    // The glass cabinet on the right: bottles.
    fillPath(c, '#5a4a38', () => c.roundRect(138, 62, 54, 84, 3), 2);
    fillPath(c, 'rgba(190,230,235,0.55)', () => c.rect(143, 67, 44, 74), 1.2);
    for (const y of [92, 118]) lines(c, '#5a4a38', 2.5, [[143, y, 187, y]]);
    for (const [x, y, col] of [[150, 90, '#e0b030'], [162, 90, '#c03a2a'], [174, 90, '#4a9a6a'], [152, 116, '#6a8ad0'], [168, 116, '#e0b030'], [180, 116, '#c03a2a'], [158, 140, '#e8dcc0']] as [number, number, string][]) fillPath(c, col, () => c.roundRect(x - 4, y - 16, 8, 16, 2), 1);
    // The operating table: a padded top, straps, a steel pedestal.
    fillPath(c, '#5a5a62', () => c.rect(100, 186, 20, 36), 2);
    fillPath(c, COL.ironHi, () => c.roundRect(82, 218, 56, 8, 3), 1.5);
    fillPath(c, '#8a949e', () => poly(c, [26, 176, 194, 176, 206, 192, 14, 192]), 2.5);
    fillPath(c, '#e8e4da', () => c.roundRect(32, 160, 156, 20, 6), 2.5);
    for (const x of [74, 146]) fillPath(c, COL.brass, () => c.rect(x, 158, 8, 24), 1.5);
    // The surgical lamp: a jointed arm from the ceiling, a brass dome, its warm beam on the table.
    lines(c, COL.iron, 5, [[110, 0, 110, 22, 140, 46, 118, 70]]);
    fillPath(c, COL.brass, () => c.arc(140, 46, 5, 0, Math.PI * 2), 1.5);
    fillPath(c, grad(c, 90, 0, 150, 0, [[0, COL.brassLo], [0.45, COL.brassHi], [1, COL.brassLo]]), () => c.ellipse(112, 74, 34, 14, 0, Math.PI, 0), 2.2);
    fillPath(c, radial(c, 112, 76, 26, [[0, '#fffbe0'], [1, '#ffd070']]), () => c.ellipse(112, 77, 28, 7, 0, 0, Math.PI * 2), 1);
    c.fillStyle = 'rgba(255,230,150,0.16)';
    c.beginPath();
    c.moveTo(86, 80);
    c.lineTo(138, 80);
    c.lineTo(174, 162);
    c.lineTo(50, 162);
    c.closePath();
    c.fill();
  },
  // The rangefinder mast: a lattice tower, a platform up top with the twin-lensed finder, guy wires, a signal lamp.
  mast(c) {
    footShadow(c, 80);
    const top = 92, at = (y: number) => (222 - y) / (222 - top);
    const segs: number[][] = [[58, 222, 92, top], [162, 222, 128, top]];
    for (let y = 222, i = 0; y > top; y -= 26, i++) {
      const y2 = Math.max(top, y - 26);
      const l = 58 + 34 * at(y), r = 162 - 34 * at(y), l2 = 58 + 34 * at(y2), r2 = 162 - 34 * at(y2);
      segs.push([l, y, r, y], i % 2 ? [l, y, r2, y2] : [r, y, l2, y2]);
    }
    lines(c, COL.soot, 5.5, segs);
    lines(c, COL.ironHi, 2.5, segs);
    lines(c, 'rgba(30,26,23,0.7)', 1.2, [[96, top + 4, 12, 222], [124, top + 4, 208, 222]]);
    fillPath(c, COL.iron, () => c.rect(70, top - 8, 80, 10), 2);
    fillPath(c, COL.brassLo, () => c.rect(106, top - 24, 8, 16), 1.5);
    fillPath(c, grad(c, 0, top - 40, 0, top - 24, [[0, COL.brassHi], [0.5, COL.brass], [1, COL.brassLo]]), () => c.roundRect(40, top - 40, 140, 16, 6), 2);
    for (const x of [40, 180]) {
      fillPath(c, COL.brass, () => c.roundRect(x - 8, top - 44, 16, 24, 4), 2);
      fillPath(c, '#3a6a8a', () => c.ellipse(x, top - 32, 4, 8, 0, 0, Math.PI * 2), 1);
    }
    fillPath(c, '#5a1a14', () => c.arc(110, top + 14, 7, 0, Math.PI * 2), 1.5);
    fillPath(c, radial(c, 110, top + 14, 6, [[0, '#ffe0a0'], [1, COL.amber]]), () => c.arc(110, top + 14, 5, 0, Math.PI * 2), 0);
    fillPath(c, '#4a4a50', () => c.rect(48, 206, 124, 18), 2);
    plaque(c, 'RANGEFINDER', 110, 215);
  },
};
/** A station's centrepiece texture (`LANDMARK`, feet at `foot`); a station without its own art shares the Trader's wagon. */
export function stationTex(scene: Phaser.Scene, id: string) {
  return texH(scene, `landmark-${id}`, LANDMARK.w, LANDMARK.h, LANDMARK_ART[id] ?? LANDMARK_ART.trader, BOOTH_SCALE);
}
