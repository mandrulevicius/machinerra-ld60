/**
 * The Wanderer seen from above: `zeppelinShape` (also the title and the ascent) and `makeZeppelinArt` (its texture and
 * shadow).
 */
import Phaser from 'phaser';
import { COL } from '../../art';
import { type Ctx, fillPath, grad, radial, rivet, seeded, tex } from './draw';

// ---------------------------------------------------------------- the zeppelin from above

/**
 * The Zeppelin Wanderer seen from above, nose to the right (the Antennae Wanderer, design 4 of
 * `games/lab/art/Zepelline/zeppeline desings.jfif`): a pale panelled envelope between two grey ones, the city's dark deck
 * under them, copper fins aft, and copper antenna arrays bristling at the nose and among the fins, warm with signal.
 * `solid` draws the silhouette only (the shadow).
 */
export function zeppelinShape(c: Ctx, solid?: string) {
  const f = (col: string | CanvasGradient) => solid ?? col;
  const line = solid ? 0 : 3;
  const cy = 210;
  // A mast of the array: a copper rod with crossbars and a knob at the tip; `solid` keeps the rod and knob.
  const mast = (x0: number, y0: number, x1: number, y1: number, bars: number) => {
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    c.lineCap = 'round';
    if (!solid) {
      c.strokeStyle = COL.soot;
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
    }
    c.strokeStyle = f(COL.copper);
    c.lineWidth = solid ? 6 : 4;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    for (let i = 1; i <= bars; i++) {
      const k = 0.35 + (i / (bars + 1)) * 0.6, w = 14 - i * 3;
      const x = x0 + dx * k, y = y0 + dy * k;
      c.lineWidth = solid ? 4 : 3;
      c.beginPath();
      c.moveTo(x - nx * w, y - ny * w);
      c.lineTo(x + nx * w, y + ny * w);
      c.stroke();
    }
    fillPath(c, f(COL.brassHi), () => c.arc(x1, y1, 5, 0, Math.PI * 2), solid ? 0 : 1.5);
  };
  // The arrays' warm glow, under everything else.
  if (!solid) {
    for (const [x, y, r] of [[770, cy, 150], [120, cy, 130]] as const) {
      c.fillStyle = radial(c, x, y, r, [[0, 'rgba(255,190,90,0.55)'], [0.5, 'rgba(255,150,50,0.18)'], [1, 'rgba(255,140,40,0)']]);
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // Fins at the tail (left): two swept out to the sides, a spike down the middle.
  for (const s of [-1, 1]) fillPath(c, f(solid ? COL.copper : grad(c, 0, cy, 0, cy + s * 150, [[0, '#c2703a'], [1, '#8a4422']])), () => {
    c.moveTo(190, cy + s * 50);
    c.lineTo(60, cy + s * 160);
    c.lineTo(100, cy + s * 160);
    c.lineTo(250, cy + s * 60);
    c.closePath();
  }, line);
  fillPath(c, f('#a85a2c'), () => {
    c.moveTo(150, cy - 12);
    c.lineTo(30, cy);
    c.lineTo(150, cy + 12);
    c.closePath();
  }, line);
  // The city's deck under the envelopes: dark iron, a few lit windows peeking out at the edges.
  fillPath(c, f('#4a3c2e'), () => c.ellipse(455, cy, 330, 150, 0, 0, Math.PI * 2), line);
  if (!solid) {
    const r = seeded(11);
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = 0.8 + r() * 0.15;
      const x = 455 + Math.cos(a) * 330 * d, y = cy + Math.sin(a) * 150 * d;
      fillPath(c, r() < 0.5 ? '#2e241c' : '#3a2e24', () => c.rect(x - 8, y - 6, 16, 12), 1.5);
      if (r() < 0.6) {
        c.fillStyle = COL.amber;
        c.fillRect(x - 4, y - 2, 3, 3);
      }
    }
  }
  // Engine mounts either side: an iron arm and a spinning disc.
  for (const s of [-1, 1]) {
    fillPath(c, f(COL.iron), () => c.rect(600, cy + s * 150 - 6, 50, 12), line);
    fillPath(c, f('rgba(220,210,190,0.5)'), () => c.ellipse(650, cy + s * 150, 8, 30, 0, 0, Math.PI * 2), solid ? 0 : 1.5);
  }
  // Envelopes: grey ones flanking, the pale panelled one in the middle; seams along and across.
  const env = (ecx: number, ey: number, rx: number, ry: number, light: string, mid: string, dark: string, seams: number) => {
    fillPath(c, solid ? solid : grad(c, 0, ey - ry, 0, ey + ry, [[0, light], [0.45, mid], [1, dark]]), () => c.ellipse(ecx, ey, rx, ry, 0, 0, Math.PI * 2), line);
    if (solid) return;
    c.save();
    c.beginPath();
    c.ellipse(ecx, ey, rx - 2, ry - 2, 0, 0, Math.PI * 2);
    c.clip();
    c.strokeStyle = 'rgba(50,40,30,0.3)';
    c.lineWidth = 1.5;
    for (let k = -seams; k <= seams; k++) {
      c.beginPath();
      c.ellipse(ecx, ey, rx, Math.abs(k) * (ry / seams) * 0.95 + 1, 0, 0, Math.PI * 2);
      c.stroke();
    }
    for (let x = ecx - rx + 30; x < ecx + rx - 20; x += 34) {
      c.beginPath();
      c.moveTo(x, ey - ry);
      c.lineTo(x, ey + ry);
      c.stroke();
    }
    c.restore();
  };
  env(450, cy - 108, 300, 52, '#c4c6c4', '#9a9c9a', '#55575a', 2);
  env(450, cy + 108, 300, 52, '#c4c6c4', '#9a9c9a', '#55575a', 2);
  env(470, cy, 380, 92, '#fbf6e8', '#e4dcc6', '#9a8e74', 4);
  // The antenna arrays: copper housings on the envelope, masts fanning out past the nose and back among the fins.
  for (const s of [-1, 1]) {
    fillPath(c, f(grad(c, 0, cy + s * 20, 0, cy + s * 56, [[0, '#d88a4a'], [1, '#8a4a24']])), () => c.roundRect(700, cy + s * 38 - 18, 70, 36, 5), line);
    fillPath(c, f(grad(c, 0, cy + s * 20, 0, cy + s * 56, [[0, '#d88a4a'], [1, '#8a4a24']])), () => c.roundRect(150, cy + s * 34 - 14, 56, 28, 5), line);
  }
  for (const [y0, x1, y1, n] of [[-38, 838, -112, 3], [-30, 848, -58, 2], [30, 848, 58, 2], [38, 838, 112, 3], [-46, 800, -150, 2], [46, 800, 150, 2]] as const) {
    mast(760, cy + y0, x1, cy + y1, n);
  }
  for (const [y0, x1, y1, n] of [[-34, 40, -96, 3], [-26, 22, -44, 2], [26, 22, 44, 2], [34, 40, 96, 3]] as const) {
    mast(160, cy + y0, x1, cy + y1, n);
  }
  if (!solid) {
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) rivet(c, 708 + k * 18, cy + s * 38, 2);
      // A lit signal lamp on each housing.
      c.fillStyle = radial(c, 776, cy + s * 38, 16, [[0, 'rgba(255,230,150,1)'], [0.4, 'rgba(255,170,60,0.7)'], [1, 'rgba(255,140,40,0)']]);
      c.fillRect(760, cy + s * 38 - 16, 32, 32);
    }
    for (const [x, y] of [[230, cy - 60], [230, cy + 60]]) fillPath(c, COL.soot, () => c.arc(x, y, 8, 0, Math.PI * 2), 2, COL.brassLo);
    c.font = '700 30px Rye, Georgia, serif';
    c.fillStyle = '#8a5a2a';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('WANDERER', 470, cy + 2);
  }
}

export function makeZeppelinArt(scene: Phaser.Scene) {
  tex(scene, 'zeppelin', 860, 420, (c) => zeppelinShape(c), 1);
  tex(scene, 'zeppelin-shadow', 900, 460, (c) => {
    c.filter = 'blur(10px)';
    c.translate(20, 20);
    zeppelinShape(c, 'rgba(10,6,4,1)');
  }, 1);
}
