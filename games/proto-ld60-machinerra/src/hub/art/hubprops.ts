/**
 * The fixed stations' props (course table, workbench, lever, crate, lamp; `makeHubArt`) and the D-city window
 * (`windowTex`).
 */
import Phaser from 'phaser';
import { COL } from '../../art';
import { fillPath, grad, radial, rivet, seeded, tex, texH } from './draw';

// ---------------------------------------------------------------- stations and props

export function makeHubArt(scene: Phaser.Scene) {
  // The command table: a round brass rim around amber map glass (seen a little from above).
  texH(scene, 'hub-table', 240, 160, (c) => {
    fillPath(c, 'rgba(0,0,0,0.4)', () => c.ellipse(120, 112, 112, 44, 0, 0, Math.PI * 2), 0);
    fillPath(c, grad(c, 0, 50, 0, 140, [[0, COL.brassHi], [0.5, COL.brass], [1, COL.brassLo]]), () => c.ellipse(120, 92, 112, 56, 0, 0, Math.PI * 2), 3);
    fillPath(c, '#4a3a28', () => c.rect(18, 92, 204, 22), 0);
    fillPath(c, grad(c, 0, 92, 0, 140, [[0, COL.brass], [1, COL.brassLo]]), () => c.ellipse(120, 112, 102, 32, 0, 0, Math.PI), 2);
    fillPath(c, '#1a120a', () => c.ellipse(120, 88, 96, 44, 0, 0, Math.PI * 2), 2);
    c.save();
    c.beginPath();
    c.ellipse(120, 88, 94, 42, 0, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = radial(c, 120, 88, 100, [[0, 'rgba(255,182,64,0.55)'], [1, 'rgba(255,120,30,0.1)']]);
    c.fillRect(0, 0, 240, 160);
    c.strokeStyle = 'rgba(255,220,140,0.85)';
    c.lineWidth = 1.4;
    const r = seeded(7);
    for (let k = 0; k < 5; k++) {
      const cx = 50 + r() * 140, cy = 60 + r() * 56;
      c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = (i / 12) * Math.PI * 2, rr = 10 + r() * 14;
        const px = cx + Math.cos(a) * rr * 1.5, py = cy + Math.sin(a) * rr * 0.7;
        if (i) c.lineTo(px, py);
        else c.moveTo(px, py);
      }
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,240,200,0.25)';
    for (let x = 30; x < 220; x += 24) {
      c.beginPath();
      c.moveTo(x, 40);
      c.lineTo(x, 140);
      c.stroke();
    }
    c.restore();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      rivet(c, 120 + Math.cos(a) * 104, 92 + Math.sin(a) * 52, 2);
    }
  });
  // The zeppelin's marker on the table: a little brass dirigible (moves on the map glass).
  tex(scene, 'hub-marker', 30, 14, (c) => {
    fillPath(c, COL.brassHi, () => c.ellipse(14, 7, 12, 5, 0, 0, Math.PI * 2), 1.2);
    fillPath(c, COL.brass, () => {
      c.moveTo(2, 7);
      c.lineTo(-1, 2);
      c.lineTo(-1, 12);
    }, 1);
  });
  // The workbench: wood top, a vise, a lamp, tools and gears.
  texH(scene, 'hub-bench', 200, 110, (c) => {
    fillPath(c, 'rgba(0,0,0,0.4)', () => c.rect(8, 70, 190, 36), 0);
    fillPath(c, '#2b2520', () => c.rect(10, 78, 180, 26), 2);
    fillPath(c, grad(c, 0, 30, 0, 80, [[0, '#a06a40'], [1, '#6a4428']]), () => c.roundRect(6, 30, 188, 50, 4), 3);
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let y = 40; y < 78; y += 10) {
      c.beginPath();
      c.moveTo(10, y);
      c.lineTo(190, y);
      c.stroke();
    }
    fillPath(c, '#5a524a', () => c.rect(18, 22, 30, 22), 2);
    fillPath(c, '#7a726a', () => c.rect(14, 18, 38, 8), 1.5);
    for (const [x, y, r] of [[90, 52, 11], [112, 60, 7], [140, 48, 9]]) {
      fillPath(c, COL.brass, () => {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r : r * 0.78;
          if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7);
          else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7);
        }
        c.closePath();
      }, 1.2);
      fillPath(c, '#3a2a1a', () => c.ellipse(x, y, r * 0.3, r * 0.22, 0, 0, Math.PI * 2), 0);
    }
    fillPath(c, '#9aa0a8', () => c.rect(60, 60, 26, 4), 1);
    fillPath(c, COL.rust, () => c.rect(56, 58, 8, 8), 1);
    // A lamp on an arm.
    c.strokeStyle = '#3a322a';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(178, 40);
    c.lineTo(170, 8);
    c.lineTo(150, 14);
    c.stroke();
    fillPath(c, COL.brass, () => c.ellipse(150, 18, 10, 6, 0.3, 0, Math.PI * 2), 1.5);
    c.fillStyle = radial(c, 150, 22, 14, [[0, 'rgba(255,240,190,0.9)'], [1, 'rgba(255,182,64,0)']]);
    c.fillRect(136, 8, 28, 28);
  });
  // A wall lamp: a brass bracket with amber glass.
  tex(scene, 'hub-lamp', 22, 30, (c) => {
    fillPath(c, COL.brassLo, () => c.rect(8, 0, 6, 8), 1);
    fillPath(c, grad(c, 0, 6, 0, 26, [[0, '#fff3c4'], [1, COL.amber]]), () => c.roundRect(4, 6, 14, 18, 5), 1.5);
    fillPath(c, COL.brass, () => c.rect(3, 22, 16, 5), 1);
    c.strokeStyle = COL.brassLo;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(11, 7);
    c.lineTo(11, 23);
    c.stroke();
  });
  // The lift's lever: an iron post with a dial, a brass arm and a red knob, chains down to the winch.
  texH(scene, 'hub-lever', 70, 100, (c) => {
    fillPath(c, 'rgba(0,0,0,0.4)', () => c.ellipse(35, 92, 30, 7, 0, 0, Math.PI * 2), 0);
    fillPath(c, '#2b2520', () => c.roundRect(10, 78, 50, 16, 3), 2);
    fillPath(c, grad(c, 18, 0, 52, 0, [[0, '#3d3833'], [0.5, '#6a625a'], [1, '#3d3833']]), () => c.roundRect(20, 30, 30, 52, 4), 2);
    fillPath(c, '#e8dcc0', () => c.arc(35, 46, 9, 0, Math.PI * 2), 2, COL.brass);
    c.strokeStyle = COL.red;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(35, 46);
    c.lineTo(40, 41);
    c.stroke();
    fillPath(c, '#14100c', () => c.rect(32, 60, 6, 18), 0);
    c.strokeStyle = COL.soot;
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(35, 70);
    c.lineTo(56, 14);
    c.stroke();
    c.strokeStyle = COL.brass;
    c.lineWidth = 4;
    c.stroke();
    fillPath(c, radial(c, 55, 12, 10, [[0, '#fff0a0'], [1, COL.amber]]), () => c.arc(57, 12, 8, 0, Math.PI * 2), 2);
    for (const x of [24, 46]) rivet(c, x, 86, 1.8);
  });
  // A crate of parts beside the bench.
  texH(scene, 'hub-crate', 60, 50, (c) => {
    fillPath(c, '#6a4428', () => c.rect(4, 10, 52, 36), 2);
    c.strokeStyle = '#3a2414';
    c.lineWidth = 2;
    for (const y of [22, 34]) {
      c.beginPath();
      c.moveTo(4, y);
      c.lineTo(56, y);
      c.stroke();
    }
    fillPath(c, COL.plastic, () => c.ellipse(20, 10, 9, 7, 0, 0, Math.PI * 2), 1.2, '#000');
    fillPath(c, COL.red, () => c.arc(23, 9, 2, 0, Math.PI * 2), 0);
    fillPath(c, COL.black, () => {
      c.moveTo(34, 12);
      c.lineTo(54, 6);
      c.lineTo(36, 3);
    }, 1, '#000');
  });
}

/** The D-city window at a city stage: a tall brass-framed bay in the colony manager's east wall, its glass showing the lights outside. */
export function windowTex(scene: Phaser.Scene, stage: number) {
  return tex(scene, `hub-window-${stage}`, 56, 260, (c) => {
    fillPath(c, grad(c, 0, 0, 56, 0, [[0, COL.brassLo], [0.5, COL.brassHi], [1, COL.brassLo]]), () => c.roundRect(4, 0, 48, 260, 20), 3);
    c.save();
    c.beginPath();
    c.roundRect(12, 10, 32, 240, 14);
    c.clip();
    c.fillStyle = grad(c, 0, 0, 0, 260, [[0, '#14182a'], [0.6, '#3a2840'], [1, '#7a4030']]);
    c.fillRect(0, 0, 56, 260);
    const r = seeded(31 + stage);
    const n = [0, 10, 26, 60][stage];
    for (let i = 0; i < n; i++) {
      const y = 24 + r() * 220, x = 14 + r() * 28;
      c.fillStyle = r() < 0.7 ? COL.amber : '#fff3c4';
      c.fillRect(x, y, 2, 2.5);
    }
    if (!stage) {
      c.strokeStyle = 'rgba(200,190,170,0.35)';
      c.beginPath();
      c.moveTo(20, 10);
      c.lineTo(30, 250);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(14, 10, 6, 240);
    c.restore();
    for (let y = 60; y < 250; y += 60) {
      c.fillStyle = COL.brass;
      c.fillRect(10, y, 36, 4);
    }
  });
}
