/**
 * The relics' pictograms (`sim/junk.ts`): the old tech as it was, drawn small in the house style for the carry strip, the
 * workshop bench and the cards. `relic-<id>` for the junk relics; the two uniques are their boss parts' own sprites
 * (`part-queens-crown`, `part-harbinger-heart`), so `relicTex(id)` names the texture for any id.
 */
import type Phaser from 'phaser';
import { COL, canvas, circ, rr, shape, type Ctx } from './art';
import { isUnique } from './sim/junk';

export const RELIC_SIZE = 28;

/** The texture key of a relic's picture. */
export const relicTex = (id: string) => (isUnique(id) ? `part-${id}` : `relic-${id}`);

const SILVER = '#cfd3d6', SILVER_LO = '#8c9296', WHITE = '#e8edf2', LCD = '#7fd6a0';

/** A short stroked line, for details inside a shape. */
const line = (c: Ctx, pts: [number, number][], col: string, w = 1.2) => {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = col;
  c.lineWidth = w;
  c.stroke();
};

export function makeRelicArt(scene: Phaser.Scene) {
  const make = (id: string, draw: (c: Ctx) => void) => canvas(scene, `relic-${id}`, RELIC_SIZE, RELIC_SIZE, draw);

  make('toaster', (c) => {
    shape(c, '#f0c878', rr(c, 8, 4, 5, 8, 1), 1); // two slices of bread
    shape(c, '#f0c878', rr(c, 15, 5, 5, 8, 1), 1);
    shape(c, SILVER, rr(c, 3, 10, 22, 13, 4), 1.4);
    shape(c, SILVER_LO, rr(c, 5, 10, 18, 2.4, 1), 0);
    shape(c, COL.iron, rr(c, 25, 14, 3, 2, 1), 1); // the lever
    line(c, [[7, 17], [21, 17]], COL.ironHi, 1);
    shape(c, COL.iron, rr(c, 5, 23, 3, 2, 1), 0);
    shape(c, COL.iron, rr(c, 20, 23, 3, 2, 1), 0);
  });

  make('smartphone', (c) => {
    shape(c, COL.black, rr(c, 8, 2, 12, 24, 3), 1.4);
    shape(c, '#3df2ff', rr(c, 9.5, 5, 9, 15, 1), 0);
    shape(c, '#bff9ff', rr(c, 10.5, 6, 3.5, 3, 0.5), 0);
    shape(c, COL.iron, circ(c, 14, 23, 1.2), 0.5);
  });

  make('microwave', (c) => {
    shape(c, WHITE, rr(c, 2, 6, 24, 16, 2), 1.4);
    shape(c, COL.black, rr(c, 4, 8, 14, 12, 1.5), 1);
    shape(c, COL.amber, rr(c, 5.5, 10, 11, 8, 1), 0);
    for (const y of [9.5, 13, 16.5]) shape(c, COL.iron, circ(c, 22, y, 1.3), 0.4);
    shape(c, SILVER_LO, rr(c, 4, 22, 4, 2, 1), 0);
    shape(c, SILVER_LO, rr(c, 20, 22, 4, 2, 1), 0);
  });

  make('hairdryer', (c) => {
    shape(c, '#d9534f', () => c.ellipse(13, 10, 10, 6.5, -0.15, 0, Math.PI * 2), 1.4);
    shape(c, COL.black, () => c.ellipse(22, 9, 2.5, 5, -0.15, 0, Math.PI * 2), 1);
    shape(c, '#a83c38', rr(c, 8, 14, 6, 12, 2), 1.2);
    for (const y of [7.5, 10, 12.5]) line(c, [[5, y], [14, y - 0.8]], '#ffffff55', 0.8);
  });

  make('fan', (c) => {
    shape(c, COL.iron, rr(c, 11, 22, 6, 3, 1), 1); // the stand
    shape(c, COL.ironHi, rr(c, 13, 18, 2, 5, 0.5), 0);
    shape(c, SILVER_LO, circ(c, 14, 11, 10.5), 1.4);
    for (let i = 0; i < 4; i++) {
      c.save();
      c.translate(14, 11);
      c.rotate((i * Math.PI) / 2 + 0.5);
      shape(c, '#9fb8c8', () => c.ellipse(0, -5, 2.6, 5, 0, 0, Math.PI * 2), 0.8);
      c.restore();
    }
    shape(c, COL.brass, circ(c, 14, 11, 2), 0.8);
  });

  make('satnav', (c) => {
    shape(c, COL.iron, rr(c, 3, 5, 22, 14, 2), 1.4);
    shape(c, LCD, rr(c, 5, 7, 18, 10, 1), 0);
    line(c, [[6, 15], [11, 11], [15, 13], [21, 8]], '#2f7a4a', 1.3);
    shape(c, COL.red, () => { c.moveTo(21, 8); c.lineTo(18.5, 8.5); c.lineTo(20.5, 10.5); c.closePath(); }, 0);
    shape(c, COL.iron, rr(c, 12, 19, 4, 4, 1), 1);
    shape(c, COL.black, () => c.ellipse(14, 25, 6, 2, 0, 0, Math.PI * 2), 1);
  });

  make('speaker', (c) => {
    shape(c, '#2a4a8a', rr(c, 5, 3, 18, 22, 5), 1.4);
    shape(c, COL.black, circ(c, 14, 10, 5), 1);
    shape(c, COL.iron, circ(c, 14, 10, 2.2), 0.6);
    shape(c, COL.black, circ(c, 14, 19, 3), 1);
    shape(c, '#3df2ff', circ(c, 14, 19, 1), 0);
    line(c, [[23, 8], [26, 6]], '#3df2ff', 1);
    line(c, [[23, 11], [27, 11]], '#3df2ff', 1);
  });

  make('smokedetector', (c) => {
    shape(c, WHITE, circ(c, 14, 14, 11), 1.4);
    shape(c, SILVER, circ(c, 14, 14, 7.5), 0.8);
    for (let i = 0; i < 6; i++) line(c, [[14 + Math.cos(i) * 3, 14 + Math.sin(i) * 3], [14 + Math.cos(i) * 7, 14 + Math.sin(i) * 7]], COL.iron, 0.8);
    shape(c, COL.red, circ(c, 14, 14, 1.8), 0.4);
    shape(c, COL.iron, rr(c, 22, 20, 4, 3, 1), 0);
  });

  make('remote', (c) => {
    shape(c, COL.black, rr(c, 9, 2, 10, 24, 3), 1.4);
    shape(c, COL.red, circ(c, 14, 6, 1.8), 0.4);
    for (const [x, y] of [[12, 11], [16, 11], [12, 15], [16, 15], [12, 19], [16, 19]]) shape(c, '#a8b0b8', circ(c, x, y, 1.3), 0.3);
    line(c, [[14, 23], [14, 24.5]], '#3df2ff', 1);
  });

  make('powerbank', (c) => {
    shape(c, '#2a4a8a', rr(c, 4, 7, 20, 14, 3), 1.4);
    for (let i = 0; i < 4; i++) shape(c, i < 3 ? '#7fd6a0' : '#5a6a5a', rr(c, 7 + i * 4, 10, 2.6, 6, 0.6), 0);
    shape(c, COL.iron, rr(c, 22, 12, 4, 4, 1), 1);
    line(c, [[10, 19.5], [18, 19.5]], '#ffffff66', 0.8);
    line(c, [[26, 14], [27.5, 14]], COL.amber, 1.2);
  });

  make('quadcopter', (c) => {
    line(c, [[6, 6], [22, 22]], COL.iron, 2);
    line(c, [[22, 6], [6, 22]], COL.iron, 2);
    shape(c, COL.black, rr(c, 10.5, 10.5, 7, 7, 2), 1.2);
    shape(c, '#3df2ff', circ(c, 14, 14, 1.4), 0);
    for (const [x, y] of [[6, 6], [22, 6], [6, 22], [22, 22]]) {
      shape(c, '#9fb8c866', circ(c, x, y, 4.2), 0.8);
      shape(c, COL.iron, circ(c, x, y, 1), 0);
    }
  });

  make('toothbrush', (c) => {
    c.save();
    c.translate(14, 14);
    c.rotate(-0.7);
    shape(c, '#58b0d8', rr(c, -2.5, -4, 5, 20, 2.5), 1.4);
    shape(c, WHITE, rr(c, -3, -13, 6, 10, 2), 1.2);
    for (const x of [-2, 0, 2]) line(c, [[x, -13], [x, -17]], COL.red, 1.1);
    shape(c, COL.iron, circ(c, 0, 6, 1.2), 0.4);
    c.restore();
  });

  // The biome relics (D50): the old thing as it was.
  const WATER = '#6fc8ee';

  make('sprinkler', (c) => {
    shape(c, COL.iron, rr(c, 13, 18, 2.4, 8, 1), 0.8); // the stake
    shape(c, '#5aa86a', rr(c, 8, 14, 12, 6, 2.5), 1.3); // the base
    shape(c, COL.ironHi, rr(c, 11, 11, 6, 4, 1.5), 1); // the head
    line(c, [[8, 10], [20, 11.5]], COL.iron, 1.8); // the arm
    for (const [x, y] of [[4, 5], [7, 3], [21, 3.5], [24, 6], [14, 2], [5, 9.5]]) shape(c, WATER, circ(c, x, y, 1.4), 0.5);
  });

  make('zapper', (c) => {
    c.save();
    c.translate(14, 14);
    c.rotate(-0.6);
    shape(c, '#e8d65a', rr(c, -2, 4, 4, 11, 1.5), 1.2); // the handle
    shape(c, '#e8d65a', () => c.ellipse(0, -5, 7, 9.5, 0, 0, Math.PI * 2), 1.5); // the hoop
    shape(c, '#2a2f38', () => c.ellipse(0, -5, 5.4, 7.9, 0, 0, Math.PI * 2), 0.5);
    for (const x of [-3, 0, 3]) line(c, [[x, -12], [x, 2]], SILVER, 0.7);
    for (const y of [-9, -5, -1]) line(c, [[-5, y], [5, y]], SILVER, 0.7);
    c.restore();
    line(c, [[22, 4], [19, 8], [23, 9], [20, 13]], '#ffe15a', 1.4); // the spark
  });

  make('tamagotchi', (c) => {
    shape(c, '#6fb8e8', () => c.ellipse(14, 15, 10, 11.5, 0, 0, Math.PI * 2), 1.5);
    shape(c, LCD, rr(c, 8.5, 8, 11, 9, 1.5), 1);
    shape(c, '#2f7a4a', rr(c, 11, 11, 2, 2, 0.4), 0); // the pet: a few pixels
    shape(c, '#2f7a4a', rr(c, 15, 11, 2, 2, 0.4), 0);
    shape(c, '#2f7a4a', rr(c, 11, 14, 6, 1.4, 0.4), 0);
    for (const x of [9.5, 14, 18.5]) shape(c, COL.red, circ(c, x, 21.3, 1.3), 0.5);
    shape(c, COL.iron, circ(c, 14, 3.4, 1.4), 0.8); // the key ring
  });

  make('trafficlight', (c) => {
    shape(c, COL.iron, rr(c, 12.5, 22, 3, 5, 1), 0.8); // the pole
    shape(c, '#3a3d3a', rr(c, 7, 2, 14, 21, 3), 1.4);
    shape(c, COL.red, circ(c, 14, 7, 3.1), 0.8);
    shape(c, COL.amber, circ(c, 14, 12.5, 3.1), 0.8);
    shape(c, '#58d27a', circ(c, 14, 18, 3.1), 0.8);
    line(c, [[5, 3], [7, 4.5]], '#3a3d3a', 1.5);
    line(c, [[23, 3], [21, 4.5]], '#3a3d3a', 1.5);
  });

  make('selfiestick', (c) => {
    line(c, [[6, 26], [19, 8]], COL.ironHi, 2.6); // the pole
    line(c, [[6, 26], [10, 20.5]], COL.black, 3.6); // the grip
    c.save();
    c.translate(21, 6);
    c.rotate(0.55);
    shape(c, COL.black, rr(c, -4.5, -7, 9, 14, 2), 1.3);
    shape(c, '#3df2ff', rr(c, -3.4, -5.4, 6.8, 9.6, 1), 0);
    shape(c, '#fff3a8', circ(c, 0, 5.2, 0.9), 0);
    c.restore();
    line(c, [[25, 12], [27, 13.5]], '#fff3a8', 1);
    line(c, [[26, 8], [27.5, 8]], '#fff3a8', 1);
  });

  make('beacon', (c) => {
    shape(c, '#e8742a', rr(c, 4, 9, 20, 15, 3), 1.4);
    shape(c, COL.black, rr(c, 7, 12, 10, 7, 1.2), 1);
    shape(c, LCD, rr(c, 8.2, 13.2, 7.6, 4.6, 0.6), 0);
    shape(c, COL.iron, circ(c, 20.5, 14, 1.8), 0.6);
    shape(c, COL.red, circ(c, 20.5, 19.5, 1.2), 0.4);
    line(c, [[10, 9], [10, 2.5]], COL.ironHi, 1.4); // the antenna
    shape(c, COL.red, circ(c, 10, 2.4, 1.3), 0.4);
    line(c, [[14, 5], [16.5, 2.5]], COL.red, 0.9);
    line(c, [[16, 7], [20, 3.5]], COL.red, 0.9);
  });

  make('handwarmer', (c) => {
    shape(c, '#e8742a', rr(c, 4, 6, 20, 16, 5), 1.4);
    shape(c, '#f6a052', rr(c, 6, 8, 16, 5, 2.5), 0);
    shape(c, '#ffd98a', circ(c, 14, 15, 3.6), 0.8); // the little sun
    for (let i = 0; i < 8; i++) line(c, [[14 + Math.cos((i * Math.PI) / 4) * 4.8, 15 + Math.sin((i * Math.PI) / 4) * 4.8], [14 + Math.cos((i * Math.PI) / 4) * 6.4, 15 + Math.sin((i * Math.PI) / 4) * 6.4]], '#ffd98a', 1);
    line(c, [[9, 4], [10, 1.5], [9, 0.2]], '#ffffff88', 1); // steam
    line(c, [[18, 4], [19, 1.5], [18, 0.2]], '#ffffff88', 1);
  });

  make('thermos', (c) => {
    shape(c, '#c8403a', rr(c, 8, 8, 12, 17, 3), 1.4); // the flask
    shape(c, SILVER, rr(c, 8, 17, 12, 8, 3), 1.2);
    shape(c, SILVER_LO, rr(c, 9, 4, 10, 5, 2), 1.2); // the cup
    shape(c, COL.iron, rr(c, 21, 10, 3, 9, 1.5), 1); // the handle
    line(c, [[10.5, 12], [10.5, 22]], '#ffffff66', 1);
    line(c, [[12, 3], [13, 1], [12, 0]], '#ffffff88', 1);
    line(c, [[16, 3], [17, 1], [16, 0]], '#ffffff88', 1);
  });
}
