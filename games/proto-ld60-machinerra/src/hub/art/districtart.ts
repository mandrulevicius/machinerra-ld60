/**
 * The Rising District in the D-city window (P55 part B): one silhouette per stage, hung above the building row, with its crowd of civilians walking its
 * streets. A stage that is paid but not up yet is a faint outline inside a scaffold, like a building going up (`panelart.ts` `drawBuilding`).
 * Until the bustle polish exists this is the whole of its art: a silhouette a stage (the plan says so).
 */
import { COL } from '../../art';
import { seeded } from './draw';

/** What the window shows of the district: stages standing, whether the next is going up, and how many civilians live in the standing ones. */
export interface DistrictView { stage: number; raising: boolean; crowd: number }

const DARK = '#2a2034';
const RIM = 'rgba(255,170,90,0.7)';

/** A box a stage is drawn in (window px, 720x380). */
interface Box { x: number; y: number; w: number; h: number }

/** One stage's silhouette: paints the dark shape and its lit parts in the box; `up` is false while it is only a scaffold. */
type Paint = (c: CanvasRenderingContext2D, b: Box, rs: () => number) => void;

const windows = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rs: () => number) => {
  for (let wy = y + 6; wy < y + h - 8; wy += 11)
    for (let wx = x + 5; wx < x + w - 6; wx += 9)
      if (rs() < 0.7) {
        c.fillStyle = rs() < 0.8 ? COL.amber : '#fff3c4';
        c.fillRect(wx, wy, 4, 6);
      }
};

/** 1. Tenements: four tall blocks, many lit windows, chimneys and a washing line. */
const tenements: Paint = (c, b, rs) => {
  const blocks = [[0, 44, 120], [48, 38, 92], [90, 52, 140], [146, 40, 104]];
  for (const [dx, w, h] of blocks) {
    c.fillStyle = DARK;
    c.fillRect(b.x + dx, b.y + b.h - h, w, h);
    c.fillRect(b.x + dx + w - 12, b.y + b.h - h - 14, 6, 14);
    windows(c, b.x + dx, b.y + b.h - h, w, h, rs);
  }
  c.strokeStyle = 'rgba(240,226,188,0.55)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(b.x + 40, b.y + b.h - 70);
  c.quadraticCurveTo(b.x + 62, b.y + b.h - 60, b.x + 88, b.y + b.h - 72);
  c.stroke();
};

/** 2. The Market Bridge: a long deck between the blocks on arched supports, stalls under awnings, a string of lanterns. */
const market: Paint = (c, b, rs) => {
  const y = b.y + b.h * 0.5;
  c.fillStyle = DARK;
  c.fillRect(b.x, y, b.w, 8);
  c.strokeStyle = DARK;
  c.lineWidth = 3;
  for (let x = b.x + 20; x < b.x + b.w; x += 60) {
    c.beginPath();
    c.arc(x + 30, y + 8, 30, Math.PI, 0, true);
    c.stroke();
  }
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(b.x, y - 14);
  c.lineTo(b.x + b.w, y - 14);
  c.stroke();
  const awning = ['#a8452e', COL.brass, '#2f7f86'];
  for (let i = 0, x = b.x + 30; x < b.x + b.w - 30; i++, x += 46) {
    c.fillStyle = awning[i % awning.length];
    c.beginPath();
    c.moveTo(x - 14, y - 22);
    c.lineTo(x + 14, y - 22);
    c.lineTo(x + 18, y - 12);
    c.lineTo(x - 18, y - 12);
    c.fill();
    c.fillStyle = DARK;
    c.fillRect(x - 12, y - 12, 24, 12);
  }
  c.strokeStyle = 'rgba(240,226,188,0.5)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(b.x, y - 38);
  c.quadraticCurveTo(b.x + b.w / 2, y - 18, b.x + b.w, y - 38);
  c.stroke();
  c.fillStyle = '#fff3c4';
  for (let i = 1; i < 14; i++) {
    const k = i / 14;
    c.beginPath();
    c.arc(b.x + b.w * k, y - 38 + 20 * Math.sin(k * Math.PI) - 1 * rs(), 2.2, 0, Math.PI * 2);
    c.fill();
  }
};

/** 3. The Tram Loop: an oval of rail on posts, with a lit car. */
const tramLoop: Paint = (c, b) => {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2 - 6, ry = b.h / 2 - 10;
  c.strokeStyle = DARK;
  c.lineWidth = 7;
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.stroke();
  c.lineWidth = 2;
  for (const a of [0.3, 1.2, 2.2, 3.4, 4.3, 5.4]) {
    const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
    c.beginPath();
    c.moveTo(px, py);
    c.lineTo(px, b.y + b.h + 24);
    c.stroke();
  }
  c.strokeStyle = COL.brassLo;
  c.lineWidth = 1;
  c.beginPath();
  c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  c.stroke();
  const a = -0.6, tx = cx + Math.cos(a) * rx, ty = cy + Math.sin(a) * ry;
  c.fillStyle = DARK;
  c.fillRect(tx - 17, ty - 15, 34, 14);
  c.fillStyle = COL.amber;
  for (let i = 0; i < 4; i++) c.fillRect(tx - 14 + i * 8, ty - 12, 5, 6);
  c.fillStyle = 'rgba(200,190,180,0.3)';
  c.beginPath();
  c.ellipse(tx + 12, ty - 24, 8, 4, 0, 0, Math.PI * 2);
  c.fill();
};

/** 4. The Aqueduct Terraces: three tiers of arches, narrowing upward, water falling from one to the next and green in the cracks. */
const terraces: Paint = (c, b, rs) => {
  const tiers = 3, th = b.h / tiers;
  for (let t = 0; t < tiers; t++) {
    const inset = t * (b.w / 8), x = b.x + inset, w = b.w - inset * 2, y = b.y + b.h - (t + 1) * th;
    c.fillStyle = DARK;
    c.fillRect(x, y, w, th - 4);
    c.globalCompositeOperation = 'destination-out';
    const n = 4 - t;
    for (let i = 0; i < n; i++) {
      const ax = x + (w * (i + 0.5)) / n;
      c.beginPath();
      c.arc(ax, y + th - 4, w / n / 2 - 7, Math.PI, 0);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#4fc3e8';
    c.fillRect(x, y, w, 2);
    c.fillStyle = '#76c07a';
    for (let i = 0; i < 6; i++) c.fillRect(x + 4 + rs() * (w - 10), y + 3 + rs() * 4, 3, 2);
    c.strokeStyle = 'rgba(100,200,240,0.7)';
    c.lineWidth = 1.5;
    for (const sx of [x + 6, x + w - 6]) {
      c.beginPath();
      c.moveTo(sx, y);
      c.lineTo(sx, y - 6);
      c.stroke();
    }
  }
};

/** 5. The Upper Hatch: a patch of the dirigible's hull in the sky with a round hatch in it, wheel and bolts; it does not open. */
const hatch: Paint = (c, b) => {
  const cx = b.x + b.w / 2, cy = b.y + b.h * 0.45, r = Math.min(b.w, b.h) / 2 - 16;
  c.fillStyle = '#5b4a64';
  c.beginPath();
  c.moveTo(b.x, b.y);
  c.lineTo(b.x + b.w, b.y);
  c.lineTo(b.x + b.w, b.y + b.h * 0.75);
  c.quadraticCurveTo(cx, b.y + b.h + 8, b.x, b.y + b.h * 0.75);
  c.fill();
  c.strokeStyle = 'rgba(210,190,210,0.4)';
  c.lineWidth = 1;
  c.beginPath();
  for (const x of [b.x + b.w * 0.33, b.x + b.w * 0.66]) {
    c.moveTo(x, b.y);
    c.lineTo(x, b.y + b.h * 0.8);
  }
  c.stroke();
  c.fillStyle = '#4a3a50';
  c.strokeStyle = COL.brass;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(cx, cy, r, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(cx - r * 0.7, cy);
  c.lineTo(cx + r * 0.7, cy);
  c.moveTo(cx, cy - r * 0.7);
  c.lineTo(cx, cy + r * 0.7);
  c.stroke();
  c.fillStyle = COL.brass;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.beginPath();
    c.arc(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4), 1.8, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = COL.amber;
  c.beginPath();
  c.arc(cx, cy, 3, 0, Math.PI * 2);
  c.fill();
  // The ledge below it where its people stand and look up.
  c.fillStyle = COL.brassLo;
  c.fillRect(b.x + 8, b.y + b.h * 0.86, b.w - 16, 4);
};

/** Each stage's box and silhouette, in the order they go up. Boxes sit above the building row (the gantry at 80% of the window). */
const PIECES: { box: Box; paint: Paint; /** Where its civilians walk: a line (x from, x to, y). */ walk: [number, number, number] }[] = [
  { box: { x: 22, y: 150, w: 190, h: 150 }, paint: tenements, walk: [26, 200, 299] },
  { box: { x: 170, y: 150, w: 400, h: 90 }, paint: market, walk: [190, 550, 195] },
  { box: { x: 500, y: 100, w: 200, h: 130 }, paint: tramLoop, walk: [520, 680, 238] },
  { box: { x: 270, y: 70, w: 190, h: 100 }, paint: terraces, walk: [290, 440, 166] },
  { box: { x: 40, y: 0, w: 170, h: 118 }, paint: hatch, walk: [60, 190, 101] },
];

/** A scaffold over a box: poles, rails and braces, with a crane. */
function scaffold(c: CanvasRenderingContext2D, b: Box) {
  c.strokeStyle = 'rgba(232,206,150,0.8)';
  c.lineWidth = 1.5;
  c.beginPath();
  for (const px of [b.x, b.x + b.w]) {
    c.moveTo(px, b.y);
    c.lineTo(px, b.y + b.h);
  }
  for (let ry = b.y + b.h; ry > b.y; ry -= 18) {
    c.moveTo(b.x, ry);
    c.lineTo(b.x + b.w, ry);
  }
  for (let ry = b.y + b.h, k = 0; ry - 18 >= b.y; ry -= 18, k++) {
    c.moveTo(k % 2 ? b.x + b.w : b.x, ry);
    c.lineTo(k % 2 ? b.x : b.x + b.w, ry - 18);
  }
  c.stroke();
  c.strokeStyle = COL.brass;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(b.x + b.w - 6, b.y);
  c.lineTo(b.x + b.w - 6, b.y - 16);
  c.lineTo(b.x + b.w * 0.3, b.y - 16);
  c.lineTo(b.x + b.w * 0.3, b.y - 4);
  c.stroke();
  c.fillStyle = COL.amber;
  for (const [fx, fy] of [[0.3, 0.4], [0.7, 0.65], [0.5, 0.2]]) c.fillRect(b.x + b.w * fx, b.y + b.h * fy, 3, 3);
}

/** A civilian: a small lit-headed brass figure standing on `y`. */
function figure(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = COL.brass;
  c.fillRect(x - 3, y - 11, 6, 11);
  c.beginPath();
  c.arc(x, y - 14, 3.4, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#fff3c4';
  c.fillRect(x - 1.5, y - 15, 3, 1.5);
}

/** The district as the window shows it: stages standing as dark silhouettes with their crowds, the one going up as a scaffold. */
export function drawDistrict(c: CanvasRenderingContext2D, v: DistrictView) {
  const rs = seeded(31);
  PIECES.forEach((p, i) => {
    const up = i < v.stage, going = i === v.stage && v.raising;
    if (!up && !going) return;
    c.save();
    c.fillStyle = DARK;
    c.shadowColor = RIM;
    c.shadowBlur = up ? 8 : 3;
    c.globalAlpha = up ? 1 : 0.3;
    // Painted in its own layer so the terraces' arch cut-outs (destination-out) do not eat what is behind it.
    const layer = document.createElement('canvas');
    layer.width = c.canvas.width;
    layer.height = c.canvas.height;
    p.paint(layer.getContext('2d')!, p.box, rs);
    c.drawImage(layer, 0, 0);
    c.restore();
    if (going) scaffold(c, p.box);
  });
  // The crowd: the standing stages each get an equal share of the people, on their own walk.
  const per = v.stage ? Math.floor(v.crowd / v.stage) : 0;
  const rc = seeded(91);
  PIECES.slice(0, v.stage).forEach((p) => {
    for (let k = 0; k < per; k++) figure(c, p.walk[0] + rc() * (p.walk[1] - p.walk[0]), p.walk[2]);
  });
}
