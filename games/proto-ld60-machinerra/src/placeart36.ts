/**
 * The art of P36's places (`sim/placebehave.ts`), drawn in code in the house style like `placeart.ts` (which calls
 * `makePlaceArt36`): textures at 2x, shown at half scale, sizes (game px) added to `SIZE` so `Play.place()` stands them on
 * their feet. Brass and soot for the Old Way's things, sun-bleached paint for the old world's. Every look is a first pass
 * until Kamile's art arrives. The props (fridge, ball, shell, sign) are `propart.ts`.
 */
import type Phaser from 'phaser';
import { COL, FLOOR, SIZE, canvas, circ, glow, grad, rivets, rr, shape, type Ctx } from './art';
import { LINE } from './house';

export const BOX36: Record<string, [number, number]> = {
  'hornet-stump': [48, 100],
  'hornet-carcass': [36, 18],
  'wing-torn': [22, 12],
  'lane-foul': [24, 64],
  'lane-board': [76, 84],
  'fire-pit': [46, 26],
  'fire-pit-lit': [46, 40],
  lighthouse: [74, 236],
  buoy: [20, 32],
  'bell-frame': [66, 88],
  pew: [54, 24],
  'donation-box': [24, 30],
  'gun-base': [76, 44],
  'gun-barrel': [84, 18],
  'shell-depot': [70, 40],
  'cafe-table': [36, 28],
  'cafe-chair': [18, 28],
};

const line = (c: Ctx, w: number, col: string, pts: [number, number][]) => {
  c.strokeStyle = col;
  c.lineWidth = w;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.stroke();
};

/** A torn hornet wing: a pale membrane with dark veins. */
function wing(c: Ctx, x: number, y: number, a: number, k = 1) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.scale(k, k);
  shape(c, 'rgba(214,236,240,0.85)', () => {
    c.moveTo(0, 0);
    c.quadraticCurveTo(8, -6, 18, -2);
    c.lineTo(15, 1);
    c.lineTo(17, 4);
    c.quadraticCurveTo(8, 6, 0, 0);
  }, 1);
  line(c, 0.8, 'rgba(29,26,23,0.6)', [[1, 0], [16, 0]]);
  line(c, 0.6, 'rgba(29,26,23,0.5)', [[6, 0], [10, -4]]);
  c.restore();
}

export function makePlaceArt36(scene: Phaser.Scene) {
  Object.assign(SIZE, BOX36);
  FLOOR.add('lane-foul'); // it lies flat on the ground: no outline
  const B = (k: string) => BOX36[k];

  // Where Hornets Go: a dead phone-mast stump, its lattice snapped off, hung with torn wings.
  canvas(scene, 'hornet-stump', ...B('hornet-stump'), (c) => {
    shape(c, COL.iron, rr(c, 8, 90, 32, 8, 2), 1.2);
    for (const [x0, x1] of [[12, 19], [36, 29]] as [number, number][]) line(c, 3, COL.ironHi, [[x0, 92], [x1, 18]]);
    for (let y = 30; y < 90; y += 12) line(c, 1.6, COL.ironHi, [[14 + (90 - y) * 0.02, y], [34 - (90 - y) * 0.02, y + 10]]);
    // The snapped top: jagged.
    line(c, 3, COL.ironHi, [[19, 18], [22, 10], [24, 16], [27, 8], [29, 18]]);
    shape(c, '#6a625a', rr(c, 16, 40, 16, 6, 1), 1);
    wing(c, 30, 30, 0.6, 1);
    wing(c, 18, 52, 2.6, 0.9);
    wing(c, 30, 64, 0.3, 0.8);
    wing(c, 16, 76, 2.9, 1);
    c.fillStyle = 'rgba(138,74,38,0.4)';
    c.fillRect(14, 70, 18, 6);
  });
  canvas(scene, 'hornet-carcass', ...B('hornet-carcass'), (c) => {
    // A hornet's shell half sunk in the sand: its back, a dead eye, a leg up.
    shape(c, grad(c, 0, 4, 0, 16, [[0, '#5d6a72'], [1, '#2c3238']]), () => c.ellipse(18, 12, 14, 7, 0, Math.PI, 0), 1.2);
    shape(c, '#1d1a17', circ(c, 9, 9, 2), 0);
    line(c, 1.4, '#3d3833', [[24, 8], [30, 2], [32, 4]]);
    c.fillStyle = 'rgba(222,196,140,0.9)';
    c.fillRect(2, 12, 32, 6);
  });
  canvas(scene, 'wing-torn', ...B('wing-torn'), (c) => wing(c, 2, 6, -0.1, 1));

  // The Strike Lanes: the foul line (a painted strip across the lane, lying flat) and the scoreboard on its posts.
  canvas(scene, 'lane-foul', ...B('lane-foul'), (c) => {
    shape(c, 'rgba(240,226,188,0.85)', rr(c, 9, 2, 6, 60, 2), 0.8);
    for (let y = 10; y < 58; y += 14) shape(c, '#b03a28', () => {
      c.moveTo(12, y);
      c.lineTo(15, y + 4);
      c.lineTo(12, y + 8);
      c.lineTo(9, y + 4);
      c.closePath();
    }, 0.6);
  });
  canvas(scene, 'lane-board', ...B('lane-board'), (c) => {
    for (const x of [14, 62]) shape(c, COL.ironHi, rr(c, x - 2, 40, 4, 44, 1), 1);
    shape(c, grad(c, 0, 4, 0, 44, [[0, '#4a3d5e'], [1, '#2a2236']]), rr(c, 4, 4, 68, 40, 4), 1.6);
    shape(c, COL.black, rr(c, 9, 12, 58, 26, 2), 1);
    // Four lanes' slots on the screen, and the old neon name over it.
    for (let i = 0; i < 4; i++) shape(c, '#2a2a20', rr(c, 12 + i * 14, 16, 11, 18, 1), 0.6);
    c.fillStyle = '#ff9ad0';
    c.fillRect(14, 6, 48, 3);
    glow(c, 38, 7, 22, 'rgba(255,154,208,0.35)');
    rivets(c, [[8, 8], [68, 8], [8, 40], [68, 40]]);
  });

  // The Lost Expedition's fire pit: a ring of stones, cold ash, a kettle on a tripod; lit, flames.
  const pit = (c: Ctx, lit: boolean, oy: number) => {
    shape(c, '#3a332c', () => c.ellipse(23, 16 + oy, 19, 8, 0, 0, Math.PI * 2), 1.2);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      shape(c, '#8a8070', () => c.ellipse(23 + Math.cos(a) * 19, 16 + oy + Math.sin(a) * 8, 4, 3, 0, 0, Math.PI * 2), 0.8);
    }
    line(c, 1.6, COL.ironHi, [[12, 18 + oy], [23, 2 + oy], [34, 18 + oy]]);
    shape(c, COL.copper, () => c.ellipse(23, 8 + oy, 6, 4, 0, 0, Math.PI * 2), 1);
    if (!lit) {
      c.fillStyle = 'rgba(160,150,140,0.7)';
      c.fillRect(16, 14 + oy, 14, 3);
      return;
    }
    glow(c, 23, 12 + oy, 20, 'rgba(255,170,60,0.6)');
    shape(c, '#ff9a30', () => {
      c.moveTo(14, 17 + oy);
      c.quadraticCurveTo(16, 2 + oy, 20, 8 + oy);
      c.quadraticCurveTo(23, -6 + oy, 26, 8 + oy);
      c.quadraticCurveTo(30, 2 + oy, 32, 17 + oy);
      c.closePath();
    }, 1);
    shape(c, '#ffe080', () => {
      c.moveTo(19, 17 + oy);
      c.quadraticCurveTo(23, 4 + oy, 27, 17 + oy);
      c.closePath();
    }, 0);
  };
  canvas(scene, 'fire-pit', ...B('fire-pit'), (c) => pit(c, false, 2));
  canvas(scene, 'fire-pit-lit', ...B('fire-pit-lit'), (c) => pit(c, true, 16));

  // The Lighthouse: a white and red tower, a gallery, the lamp room's glass; its door.
  canvas(scene, 'lighthouse', ...B('lighthouse'), (c) => {
    shape(c, '#8a8070', rr(c, 8, 222, 58, 12, 3), 1.2);
    const body = () => {
      c.moveTo(16, 224);
      c.lineTo(24, 54);
      c.lineTo(50, 54);
      c.lineTo(58, 224);
      c.closePath();
    };
    shape(c, grad(c, 16, 0, 58, 0, [[0, '#f4efe6'], [1, '#b8b0a2']]), body, 1.6);
    c.save();
    c.beginPath();
    body();
    c.clip();
    c.fillStyle = 'rgba(176,58,40,0.9)';
    for (const y of [76, 130, 184]) c.fillRect(0, y, 74, 22);
    c.restore();
    shape(c, COL.iron, rr(c, 26, 196, 12, 26, 5), 1.2);
    shape(c, COL.iron, rr(c, 18, 46, 38, 8, 1), 1.2);
    line(c, 1.2, COL.soot, [[18, 40], [56, 40]]);
    for (let x = 20; x <= 54; x += 6) line(c, 1, COL.soot, [[x, 40], [x, 46]]);
    shape(c, 'rgba(255,217,138,0.75)', rr(c, 26, 22, 22, 18, 2), 1.2);
    line(c, 1, COL.soot, [[37, 22], [37, 40]]);
    shape(c, COL.iron, () => {
      c.moveTo(22, 22);
      c.lineTo(37, 6);
      c.lineTo(52, 22);
      c.closePath();
    }, 1.2);
    shape(c, COL.brassHi, circ(c, 37, 5, 2.5), 0.8);
    c.fillStyle = 'rgba(138,74,38,0.3)';
    c.fillRect(20, 150, 10, 30);
  });
  canvas(scene, 'buoy', ...B('buoy'), (c) => {
    shape(c, grad(c, 0, 8, 0, 30, [[0, '#d84a30'], [1, '#7a2418']]), () => {
      c.moveTo(3, 28);
      c.quadraticCurveTo(10, 4, 17, 28);
      c.closePath();
    }, 1.2);
    c.fillStyle = '#f4efe6';
    c.fillRect(5, 18, 10, 3);
    line(c, 1.4, COL.ironHi, [[10, 10], [10, 2]]);
    shape(c, COL.brassHi, circ(c, 10, 2, 1.8), 0.6);
    c.fillStyle = 'rgba(222,196,140,0.9)';
    c.fillRect(1, 26, 18, 6);
  });

  // The Dinner Bell: a timber frame, the bell and its rope; the chapel's pews; the donation box.
  canvas(scene, 'bell-frame', ...B('bell-frame'), (c) => {
    for (const [x0, x1] of [[8, 16], [58, 50]] as [number, number][]) line(c, 5, '#6c4e2c', [[x0, 86], [x1, 10]]);
    shape(c, grad(c, 0, 6, 0, 16, [[0, '#b08650'], [1, '#6c4e2c']]), rr(c, 6, 6, 54, 9, 2), 1.4);
    shape(c, grad(c, 18, 0, 48, 0, [[0, COL.brassHi], [0.6, COL.brass], [1, COL.brassLo]]), () => {
      c.moveTo(22, 46);
      c.quadraticCurveTo(22, 18, 33, 17);
      c.quadraticCurveTo(44, 18, 44, 46);
      c.lineTo(47, 50);
      c.lineTo(19, 50);
      c.closePath();
    }, 1.6);
    shape(c, COL.iron, circ(c, 33, 52, 3), 1);
    line(c, 1.6, '#c8b088', [[33, 54], [36, 70], [33, 84]]);
    rivets(c, [[12, 10], [54, 10]]);
  });
  canvas(scene, 'pew', ...B('pew'), (c) => {
    shape(c, grad(c, 0, 2, 0, 12, [[0, '#b08650'], [1, '#6c4e2c']]), rr(c, 2, 2, 50, 8, 2), 1.2);
    shape(c, '#8a6a40', rr(c, 4, 12, 46, 5, 1.5), 1);
    for (const x of [6, 46]) shape(c, '#6c4e2c', rr(c, x, 10, 4, 12, 1), 0.8);
    c.fillStyle = 'rgba(29,26,23,0.35)';
    c.fillRect(30, 3, 8, 2);
  });
  canvas(scene, 'donation-box', ...B('donation-box'), (c) => {
    line(c, 2.4, '#6c4e2c', [[12, 28], [12, 16]]);
    shape(c, grad(c, 0, 2, 0, 16, [[0, COL.brassHi], [1, COL.brassLo]]), rr(c, 3, 3, 18, 14, 2), 1.2);
    shape(c, COL.soot, rr(c, 8, 6, 8, 2, 1), 0);
    rivets(c, [[5, 5], [19, 5]]);
  });

  // The Old Battery: the gun's turntable and carriage (the barrel is its own image, turned by the view), the shell depot.
  canvas(scene, 'gun-base', ...B('gun-base'), (c) => {
    shape(c, grad(c, 0, 20, 0, 44, [[0, '#6a625a'], [1, '#3d3833']]), () => c.ellipse(38, 32, 34, 11, 0, 0, Math.PI * 2), 1.6);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      shape(c, COL.brassLo, circ(c, 38 + Math.cos(a) * 30, 32 + Math.sin(a) * 9, 1.5), 0);
    }
    shape(c, grad(c, 20, 0, 56, 0, [[0, '#7a8a5a'], [1, '#4a5534']]), rr(c, 22, 10, 32, 20, 4), 1.4);
    shape(c, COL.iron, circ(c, 38, 18, 6), 1.2);
    // The wheel.
    c.strokeStyle = COL.brass;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(60, 22, 7, 0, Math.PI * 2);
    c.stroke();
    line(c, 1.2, COL.brass, [[53, 22], [67, 22]]);
    line(c, 1.2, COL.brass, [[60, 15], [60, 29]]);
  });
  canvas(scene, 'gun-barrel', ...B('gun-barrel'), (c) => {
    shape(c, grad(c, 0, 3, 0, 15, [[0, '#8a9a6a'], [0.5, '#5a6a40'], [1, '#3a4428']]), () => {
      c.moveTo(4, 3);
      c.lineTo(76, 6);
      c.lineTo(76, 12);
      c.lineTo(4, 15);
      c.closePath();
    }, 1.4);
    shape(c, COL.iron, rr(c, 74, 4, 8, 10, 2), 1.2);
    shape(c, COL.brassLo, rr(c, 12, 2, 6, 14, 1), 0.8);
    shape(c, COL.brassLo, rr(c, 40, 4, 4, 10, 1), 0.6);
  });
  canvas(scene, 'shell-depot', ...B('shell-depot'), (c) => {
    shape(c, grad(c, 0, 8, 0, 38, [[0, '#9a7a4a'], [1, '#5a4228']]), rr(c, 4, 12, 62, 26, 3), 1.4);
    line(c, 1.2, COL.soot, [[4, 24], [66, 24]]);
    c.fillStyle = '#f4efe6';
    c.fillRect(24, 28, 22, 6);
    c.fillStyle = COL.soot;
    c.fillRect(27, 30, 16, 2);
    shape(c, '#6a5a3a', () => {
      c.moveTo(2, 12);
      c.lineTo(35, 2);
      c.lineTo(68, 12);
      c.closePath();
    }, 1.2);
  });

  // The First Scripture's café: a round table, two chairs (the sign is the `sign` prop's picture, `propart.ts`).
  canvas(scene, 'cafe-table', ...B('cafe-table'), (c) => {
    line(c, 2.4, COL.ironHi, [[18, 10], [18, 26]]);
    line(c, 2, COL.ironHi, [[10, 26], [26, 26]]);
    shape(c, grad(c, 0, 4, 0, 12, [[0, '#e8e0cc'], [1, '#a8a090']]), () => c.ellipse(18, 8, 16, 5, 0, 0, Math.PI * 2), 1.2);
    shape(c, COL.steam, rr(c, 20, 3, 5, 4, 1), 0.6);
  });
  canvas(scene, 'cafe-chair', ...B('cafe-chair'), (c) => {
    line(c, 1.6, COL.ironHi, [[4, 26], [5, 16], [14, 16], [15, 26]]);
    line(c, 1.6, COL.ironHi, [[4, 16], [3, 4]]);
    shape(c, '#c8b088', rr(c, 3, 14, 13, 3, 1), 0.8);
    shape(c, '#c8b088', rr(c, 2, 3, 4, 10, 1), 0.8);
  });
  void LINE;
}
