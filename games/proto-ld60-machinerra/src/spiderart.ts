/**
 * The Crawlcam's textures, drawn in code (Canvas 2D, the house style like the rest of art.ts) and its three parts.
 * A modern machine: black gloss, white plastic, cyan and red LEDs. A smart-speaker puck for an abdomen with a friendly
 * face on its little screen, a camera for a head, ethernet plugs for fangs; worn, scuffed and grimy like everything that
 * has been out in the sand (docs/design/art-direction.md). Body, thigh, shin and joint are drawn pointing right (+x);
 * `spider.ts` places them. Part sprites are made with the rest of the art (`makeArt`) so the hub's workshop has them too.
 */
import type Phaser from 'phaser';
import { COL, canvas, circ, glow, grad, radial, rr, shape, type Ctx } from './art';
import { LINE } from './house';

/** Body texture box (game px) and where the body's centre is in it; the leg pieces' boxes (their joint end is at x = 0, mid-height). */
export const SPIDER_ART = {
  body: { w: 52, h: 34, cx: 26, cy: 17 },
  femur: { w: 26, h: 8 },
  tibia: { w: 28, h: 6 },
  joint: { w: 8, h: 8 },
};

const WHITE = '#f2f5f8', PLASTIC = '#e8edf2', GREY = '#aab4bd', GLOSS = '#0c0f12';

/** Scratches and scuffs on a surface, deterministic: `n` short strokes inside the box, light on dark, dark on light. */
function scuffs(c: Ctx, seed: number, x: number, y: number, w: number, h: number, n: number, col: string, len = 4) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  c.save();
  c.strokeStyle = col;
  c.lineWidth = LINE.detail;
  for (let i = 0; i < n; i++) {
    const px = x + r() * w, py = y + r() * h, a = r() * Math.PI;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px + Math.cos(a) * len * (0.4 + r()), py + Math.sin(a) * len * (0.4 + r()));
    c.stroke();
  }
  c.restore();
}

export function makeSpiderArt(scene: Phaser.Scene) {
  const B = SPIDER_ART.body;
  canvas(scene, 'spider-body', B.w, B.h, (c) => {
    c.translate(B.cx, B.cy);
    // The cable tail: a white cable with a black plug, dragging behind.
    c.lineCap = 'round';
    c.strokeStyle = '#000';
    c.lineWidth = 3.4;
    c.beginPath();
    c.moveTo(-17, 0);
    c.quadraticCurveTo(-22, 3, -25, 1.5);
    c.stroke();
    c.strokeStyle = PLASTIC;
    c.lineWidth = 2.2;
    c.stroke();
    shape(c, GLOSS, rr(c, -26.5, -0.5, 4, 4, 1), 0.7, '#000');
    shape(c, COL.brassHi, rr(c, -27, 0.8, 1.2, 1.4, 0.3), 0);
    // The neck, between abdomen and head.
    shape(c, '#14181d', circ(c, 1, 0, 6), 0.8, '#000');
    // The abdomen: a white smart-speaker puck, ringed with cyan LEDs, a friendly face on its screen.
    shape(c, radial(c, -11, -5, 17, [[0, '#ffffff'], [0.55, '#dfe5ea'], [1, '#98a3ad']]), () => c.ellipse(-8, 0, 13, 11.5, 0, 0, Math.PI * 2), 1.1, '#000');
    c.save();
    c.strokeStyle = 'rgba(120,132,142,0.7)';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.ellipse(-8, 0, 10.6, 9.2, 0, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([4.5, 1.6]);
    c.strokeStyle = COL.cyan;
    c.lineWidth = 1.3;
    c.beginPath();
    c.ellipse(-8, 0, 9.4, 8, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    glow(c, -8, 0, 15, 'rgba(61,242,255,0.22)');
    shape(c, '#0b1418', rr(c, -14.5, -4.3, 13, 8.6, 2.4), 0.8, '#000');
    shape(c, COL.cyan, circ(c, -11.6, -1.2, 1), 0);
    shape(c, COL.cyan, circ(c, -7.2, -1.2, 1), 0);
    c.strokeStyle = COL.cyan;
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(-12.8, 1.1);
    c.quadraticCurveTo(-9.4, 4.2, -6, 1.1); // the smile, a little too wide
    c.stroke();
    // Wear: a dent, a chipped rim, grime where the sand gets in, scratches.
    c.fillStyle = 'rgba(70,64,58,0.3)';
    c.beginPath();
    c.ellipse(-15.5, -6, 4.5, 2.2, 0.7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = radial(c, -16, 6, 8, [[0, 'rgba(40,30,22,0.55)'], [1, 'rgba(40,30,22,0)']]);
    c.fillRect(-24, -2, 16, 16);
    shape(c, GLOSS, () => {
      c.moveTo(-3, -10);
      c.lineTo(-0.5, -8.8);
      c.lineTo(-3.4, -8);
    }, 0, '#000');
    scuffs(c, 11, -19, -9, 18, 17, 9, 'rgba(70,74,80,0.55)', 5);
    // The head: a black camera housing with a white bezel and one big red lens.
    shape(c, grad(c, 0, -8, 0, 8, [[0, '#566069'], [0.3, '#1d2329'], [1, '#07090b']]), rr(c, 2, -8, 18.5, 16, 6.5), 1.1, '#000');
    c.strokeStyle = 'rgba(255,255,255,0.4)';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(5, -6.2);
    c.quadraticCurveTo(12, -8.4, 17, -5.8);
    c.stroke();
    shape(c, WHITE, circ(c, 13, 0, 6.6), 1, '#000');
    shape(c, '#07080a', circ(c, 13, 0, 5.2), 0.6, '#000');
    shape(c, radial(c, 13, 0, 4.2, [[0, '#ff9aa6'], [0.35, '#ff2a40'], [1, '#55050f']]), circ(c, 13, 0, 4.1), 0);
    shape(c, '#050203', circ(c, 13, 0, 1.7), 0);
    shape(c, '#ffffff', circ(c, 11.6, -1.5, 0.95), 0);
    shape(c, 'rgba(255,255,255,0.7)', circ(c, 14.8, 1.4, 0.5), 0);
    glow(c, 13, 0, 11, 'rgba(255,48,72,0.38)');
    for (const y of [-6, 6]) {
      shape(c, WHITE, circ(c, 6.5, y, 2.1), 0.6, '#000');
      shape(c, y < 0 ? COL.red : COL.cyan, circ(c, 6.5, y, 1.1), 0);
    }
    // Fangs: two ethernet plugs, brass contacts at the tips.
    for (const y of [-3.2, 3.2]) {
      shape(c, PLASTIC, () => {
        c.moveTo(19.5, y - 1.4);
        c.lineTo(26.5, y - 0.3 * Math.sign(y));
        c.lineTo(19.5, y + 1.4);
      }, 0.7, '#000');
      shape(c, COL.brassHi, circ(c, 25.6, y - 0.25 * Math.sign(y), 0.55), 0);
    }
    scuffs(c, 29, 3, -7, 15, 14, 6, 'rgba(210,218,226,0.45)', 3.5);
  });

  const F = SPIDER_ART.femur;
  canvas(scene, 'spider-femur', F.w, F.h, (c) => {
    shape(c, grad(c, 0, 0, 0, F.h, [[0, '#59626c'], [0.35, '#1a1f25'], [1, '#07090b']]), () => {
      c.moveTo(1, 0.8);
      c.lineTo(22.5, 2.3);
      c.quadraticCurveTo(25.5, 4, 22.5, 5.7);
      c.lineTo(1, 7.2);
      c.quadraticCurveTo(-1, 4, 1, 0.8);
    }, 0.9, '#000');
    c.strokeStyle = 'rgba(255,255,255,0.38)';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(3, 2);
    c.lineTo(20, 3.1);
    c.stroke();
    c.save();
    c.setLineDash([2.6, 1.8]);
    c.strokeStyle = COL.cyan;
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(4.5, 4.6);
    c.lineTo(17, 4.2);
    c.stroke();
    c.restore();
    shape(c, PLASTIC, rr(c, 18, 1.6, 3, 4.8, 0.8), 0.6, '#000');
    scuffs(c, 5, 2, 1.5, 16, 5, 4, 'rgba(210,216,224,0.45)', 3);
  });

  const Ti = SPIDER_ART.tibia;
  canvas(scene, 'spider-tibia', Ti.w, Ti.h, (c) => {
    shape(c, grad(c, 0, 0, 0, Ti.h, [[0, '#505a64'], [0.4, '#161b20'], [1, '#07090b']]), () => {
      c.moveTo(0.5, 0.6);
      c.lineTo(22, 2.1);
      c.lineTo(27.4, 3);
      c.lineTo(22, 3.9);
      c.lineTo(0.5, 5.4);
      c.closePath();
    }, 0.8, '#000');
    shape(c, PLASTIC, () => {
      c.moveTo(22, 2.1);
      c.lineTo(27.4, 3);
      c.lineTo(22, 3.9);
      c.closePath();
    }, 0.6, '#000');
    c.strokeStyle = 'rgba(255,255,255,0.32)';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(2, 1.6);
    c.lineTo(18, 2.5);
    c.stroke();
    shape(c, COL.cyan, circ(c, 8, 3, 0.7), 0);
    scuffs(c, 17, 2, 1, 16, 4, 3, 'rgba(210,216,224,0.4)', 3);
  });

  const J = SPIDER_ART.joint;
  canvas(scene, 'spider-joint', J.w, J.h, (c) => {
    shape(c, radial(c, 3, 3, 5, [[0, '#ffffff'], [1, '#aeb8c1']]), circ(c, 4, 4, 3.3), 0.8, '#000');
    shape(c, COL.cyan, circ(c, 4.2, 4.2, 0.7), 0);
  });

  makeSpiderParts(scene);
}

/** The three parts a Crawlcam drops (`PARTS`): sprites like every part's, modern and glossy and unclean. */
export function makeSpiderParts(scene: Phaser.Scene) {
  // Lens cluster (head): one big red lens and four small ones on a black plate.
  canvas(scene, 'part-spider-lens', 22, 20, (c) => {
    shape(c, grad(c, 0, 1, 0, 19, [[0, '#4d565f'], [0.4, '#181d22'], [1, '#07090b']]), rr(c, 1.5, 2, 19, 16, 5), 1.1, '#000');
    shape(c, WHITE, circ(c, 11, 10, 5.6), 0.9, '#000');
    shape(c, radial(c, 11, 10, 4.2, [[0, '#ff9aa6'], [0.4, '#ff2a40'], [1, '#55050f']]), circ(c, 11, 10, 4.2), 0.4, '#000');
    shape(c, '#ffffff', circ(c, 9.8, 8.7, 0.9), 0);
    glow(c, 11, 10, 9, 'rgba(255,48,72,0.35)');
    for (const [x, y, red] of [[5, 5.5, false], [17, 5.5, false], [5, 14.5, true], [17, 14.5, true]] as [number, number, boolean][]) {
      shape(c, PLASTIC, circ(c, x, y, 2.3), 0.6, '#000');
      shape(c, red ? COL.red : COL.cyan, circ(c, x, y, 1.2), 0);
    }
    scuffs(c, 41, 2, 3, 18, 14, 6, 'rgba(210,218,226,0.4)', 3);
  });
  // Spinneret (arms): a black nozzle with a brass collar, a white cable curling out of it, a cyan tip.
  canvas(scene, 'part-spider-spinneret', 26, 14, (c) => {
    c.strokeStyle = '#000';
    c.lineWidth = 3.6;
    c.beginPath();
    c.moveTo(15, 7);
    c.bezierCurveTo(19, 1, 24, 3, 22, 8);
    c.stroke();
    c.strokeStyle = PLASTIC;
    c.lineWidth = 2.3;
    c.stroke();
    shape(c, grad(c, 0, 2, 0, 12, [[0, '#59626c'], [0.4, '#1a1f25'], [1, '#07090b']]), rr(c, 1.5, 3, 14, 8, 2.5), 1, '#000');
    shape(c, COL.brass, rr(c, 10, 2.6, 2.6, 8.8, 0.8), 0.7, '#000');
    shape(c, COL.cyan, circ(c, 3.4, 7, 1.3), 0);
    glow(c, 3.4, 7, 6, 'rgba(61,242,255,0.4)');
    scuffs(c, 53, 3, 3, 11, 8, 4, 'rgba(210,218,226,0.4)', 3);
  });
  // Legs (back): a pair of folded legs, black gloss with white joints and a cyan strip.
  canvas(scene, 'part-spider-legs', 30, 16, (c) => {
    for (const [y, sgn] of [[3, 1], [11, -1]] as [number, number][]) {
      const pts: [number, number][] = [[2, 8 + sgn * 3], [10, y], [18, 8 - sgn * 1], [28, 8 + sgn * 4]];
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = '#000';
      c.lineWidth = 4.2;
      c.beginPath();
      pts.forEach(([x, yy], i) => (i ? c.lineTo(x, yy) : c.moveTo(x, yy)));
      c.stroke();
      c.strokeStyle = '#1c2228';
      c.lineWidth = 2.8;
      c.stroke();
      c.strokeStyle = COL.cyan;
      c.lineWidth = LINE.detail;
      c.setLineDash([2, 2]);
      c.stroke();
      c.setLineDash([]);
      for (const [x, yy] of pts.slice(1, 3)) shape(c, WHITE, circ(c, x, yy, 1.9), 0.7, '#000');
    }
    scuffs(c, 67, 2, 2, 26, 12, 5, 'rgba(210,218,226,0.4)', 3);
  });
}
