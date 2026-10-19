/**
 * The Hot Spring's pool (P31, the Frostspine's place; `placeart.ts` calls `makeSpringArt`): a ring of dark wet stones round
 * steaming turquoise water, lying flat on the snow. Drawn in code in the house style like the other places, a first pass until
 * Kamile's art arrives. Its size is the pool's reach (`HOT_SPRING.pool`), so standing on the water is standing in it.
 */
import type Phaser from 'phaser';
import { COL, FLOOR, SIZE, canvas, grad, shape, type Ctx } from './art';
import { HOT_SPRING, T } from './sim/defs';

const W = Math.round(HOT_SPRING.pool * T * 2 + 16), H = Math.round(W * 0.66);

export function makeSpringArt(scene: Phaser.Scene) {
  SIZE['hot-spring'] = [W, H];
  FLOOR.add('hot-spring');
  canvas(scene, 'hot-spring', W, H, (c: Ctx) => {
    const cx = W / 2, cy = H / 2;
    const oval = (rx: number, ry: number) => () => c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    // The melt round it: wet dark ground.
    shape(c, 'rgba(70,82,92,0.55)', oval(W / 2 - 1, H / 2 - 1), 0);
    // The stones of its rim.
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2, r = 5 + ((i * 37) % 5);
      const x = cx + Math.cos(a) * (W / 2 - 12), y = cy + Math.sin(a) * (H / 2 - 9);
      shape(c, i % 3 ? '#5c6670' : '#6e7882', () => c.ellipse(x, y, r, r * 0.7, a, 0, Math.PI * 2), 1, COL.soot);
    }
    // The water: deep in the middle, pale at the edge.
    shape(c, grad(c, cx, cy - H / 3, cx, cy + H / 3, [[0, '#9fe6e0'], [0.5, '#48b4b8'], [1, '#2a7c8c']]), oval(W / 2 - 18, H / 2 - 14), 1.4);
    // Bubbles and the light on it.
    c.fillStyle = 'rgba(230,255,250,0.55)';
    for (const [x, y, r] of [[-20, -6, 3], [14, 4, 2.4], [2, -12, 1.8], [26, -4, 1.6], [-8, 10, 2]] as [number, number, number][]) {
      c.beginPath();
      c.arc(cx + x, cy + y, r, 0, Math.PI * 2);
      c.fill();
    }
    c.strokeStyle = 'rgba(240,255,255,0.45)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.ellipse(cx - 10, cy - 8, W / 5, H / 9, -0.15, Math.PI * 1.1, Math.PI * 1.7);
    c.stroke();
  });
}
