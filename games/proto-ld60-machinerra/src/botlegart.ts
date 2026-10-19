/**
 * The textures of a robot's spider legs (P53, `botlegview.ts`): brass, in the house style like the rest of `art.ts`. A thigh, a shin and a knee
 * joint, drawn pointing right (+x) from the joint end, in the boxes the Crawlcam's own legs use (`spiderart.ts`), so one drawing scale serves both.
 */
import type Phaser from 'phaser';
import { COL, canvas, circ, grad, radial, rr, shape } from './art';
import { LINE } from './house';
import { SPIDER_ART } from './spiderart';

export const BOT_LEG_ART = { femur: SPIDER_ART.femur, tibia: SPIDER_ART.tibia, joint: SPIDER_ART.joint };

export function makeBotLegArt(scene: Phaser.Scene) {
  const F = SPIDER_ART.femur;
  canvas(scene, 'botleg-femur', F.w, F.h, (c) => {
    shape(c, grad(c, 0, 0, 0, F.h, [[0, COL.brassHi], [0.45, COL.brass], [1, COL.brassLo]]), () => {
      c.moveTo(1, 0.8);
      c.lineTo(22.5, 2.3);
      c.quadraticCurveTo(25.5, 4, 22.5, 5.7);
      c.lineTo(1, 7.2);
      c.quadraticCurveTo(-1, 4, 1, 0.8);
    }, 0.9, '#000');
    c.strokeStyle = 'rgba(255,240,190,0.55)';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(3, 2);
    c.lineTo(20, 3.1);
    c.stroke();
    shape(c, COL.copper, rr(c, 18, 1.6, 3, 4.8, 0.8), 0.6, '#000');
  });
  const T = SPIDER_ART.tibia;
  canvas(scene, 'botleg-tibia', T.w, T.h, (c) => {
    shape(c, grad(c, 0, 0, 0, T.h, [[0, COL.brassHi], [0.5, COL.brass], [1, COL.brassLo]]), () => {
      c.moveTo(0.5, 0.6);
      c.lineTo(22, 2.1);
      c.lineTo(27.4, 3);
      c.lineTo(22, 3.9);
      c.lineTo(0.5, 5.4);
      c.closePath();
    }, 0.8, '#000');
    shape(c, COL.iron, () => {
      c.moveTo(22, 2.1);
      c.lineTo(27.4, 3);
      c.lineTo(22, 3.9);
      c.closePath();
    }, 0.6, '#000');
  });
  const J = SPIDER_ART.joint;
  canvas(scene, 'botleg-joint', J.w, J.h, (c) => {
    shape(c, radial(c, 3, 3, 5, [[0, COL.brassHi], [1, COL.brassLo]]), circ(c, 4, 4, 3.3), 0.8, '#000');
    shape(c, COL.copper, circ(c, 4.2, 4.2, 0.9), 0);
  });
}
