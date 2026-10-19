/**
 * The deck, painted in one texture (`paintDeck`: girders, rooms, walls, floors, catwalks, the empty lots) and the sky
 * below it (`makeSkyArt`). To change a room, edit its painter here; the layout itself is `../layout.ts`.
 */
import Phaser from 'phaser';
import { COL } from '../../art';
import {
  ALTAR,
  ARRIVE,
  DECK,
  GIRDER,
  GIRDER_X,
  GIRDER_Y,
  ROOMS,
  SLOTS,
  SPOTS,
  TABLE,
  WALKWAYS,
  WALL,
  WINDOW,
  type Rect,
  type Slot,
} from '../layout';
import { type Ctx, fillPath, grad, hash, radial, rivet, seeded, shade, tex } from './draw';

// ---------------------------------------------------------------- the deck


export function plates(c: Ctx, r: Rect, base: string, size = 64) {
  for (let y = r.y; y < r.y + r.h; y += size)
    for (let x = r.x; x < r.x + r.w; x += size) {
      const w = Math.min(size, r.x + r.w - x), h = Math.min(size, r.y + r.h - y);
      c.fillStyle = shade(base, 0.88 + hash(x, y) * 0.24);
      c.fillRect(x, y, w, h);
      c.strokeStyle = 'rgba(0,0,0,0.5)';
      c.lineWidth = 2;
      c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      c.strokeStyle = 'rgba(255,230,180,0.07)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + 2, y + h - 2);
      c.lineTo(x + 2, y + 2);
      c.lineTo(x + w - 2, y + 2);
      c.stroke();
      for (const [px, py] of [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]]) rivet(c, x + px, y + py, 1.4);
    }
}

function planks(c: Ctx, r: Rect, base: string, ph = 18) {
  let row = 0;
  for (let y = r.y; y < r.y + r.h; y += ph, row++) {
    let x = r.x - (row % 3) * 40;
    while (x < r.x + r.w) {
      const len = 90 + hash(x, row) * 90;
      const x0 = Math.max(r.x, x), x1 = Math.min(r.x + r.w, x + len), h = Math.min(ph, r.y + r.h - y);
      c.fillStyle = shade(base, 0.85 + hash(row, Math.floor(x)) * 0.3);
      c.fillRect(x0, y, x1 - x0, h);
      // Grain.
      c.strokeStyle = 'rgba(0,0,0,0.12)';
      c.lineWidth = 1;
      for (let g = 0; g < 2; g++) {
        const gy = y + 4 + g * 7 + hash(x, g) * 3;
        c.beginPath();
        c.moveTo(x0 + 3, gy);
        c.bezierCurveTo(x0 + (x1 - x0) * 0.3, gy + 2, x0 + (x1 - x0) * 0.6, gy - 2, x1 - 3, gy);
        c.stroke();
      }
      c.fillStyle = 'rgba(0,0,0,0.55)';
      c.fillRect(x1 - 1, y, 2, h);
      c.fillStyle = 'rgba(30,20,10,0.8)';
      c.fillRect(x1 - 6, y + h / 2 - 1, 2, 2);
      x += len;
    }
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(r.x, y + ph - 1, r.w, 1.5);
  }
}

function grating(c: Ctx, r: Rect) {
  c.fillStyle = '#0d0b09';
  c.fillRect(r.x, r.y, r.w, r.h);
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  c.strokeStyle = '#4a4038';
  c.lineWidth = 3;
  for (let k = -r.h; k < r.w + r.h; k += 12) {
    c.beginPath();
    c.moveTo(r.x + k, r.y);
    c.lineTo(r.x + k - r.h, r.y + r.h);
    c.stroke();
  }
  c.strokeStyle = '#2e2822';
  c.lineWidth = 2;
  for (let y = r.y; y < r.y + r.h; y += 24) {
    c.beginPath();
    c.moveTo(r.x, y);
    c.lineTo(r.x + r.w, y);
    c.stroke();
  }
  c.restore();
  // Brass edge strips.
  c.fillStyle = COL.brassLo;
  if (r.w < r.h) {
    c.fillRect(r.x, r.y, 4, r.h);
    c.fillRect(r.x + r.w - 4, r.y, 4, r.h);
  } else {
    c.fillRect(r.x, r.y, r.w, 4);
    c.fillRect(r.x, r.y + r.h - 4, r.w, 4);
  }
}

function checker(c: Ctx, r: Rect) {
  plates(c, r, '#4a4640', 80);
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  c.strokeStyle = 'rgba(255,240,210,0.08)';
  c.lineWidth = 2;
  for (let y = r.y + 6; y < r.y + r.h; y += 12)
    for (let x = r.x + ((y / 12) % 2) * 6; x < r.x + r.w; x += 12) {
      c.beginPath();
      c.moveTo(x - 3, y + 2);
      c.lineTo(x + 3, y - 2);
      c.stroke();
    }
  c.restore();
}

/** The wall face of a room's north side (the view is a little tilted: north walls show their face), with pipes and gauges. */
function northWall(c: Ctx, r: Rect, doors: [number, number][]) {
  const y0 = r.y - WALL;
  c.fillStyle = grad(c, 0, y0, 0, r.y, [[0, '#1a1511'], [1, '#3a322a']]);
  c.fillRect(r.x, y0, r.w, WALL);
  const open = (x: number) => doors.some(([a, b]) => x > a && x < b);
  // Two pipes, copper and iron, with flanges; gauges now and then.
  for (const [py, col, w] of [[y0 + 8, COL.copper, 6], [y0 + 17, '#5a524a', 5]] as [number, string, number][]) {
    for (let x = r.x; x < r.x + r.w; x += 4) {
      if (open(x)) continue;
      c.fillStyle = col;
      c.fillRect(x, py - w / 2, 4, w);
    }
    c.fillStyle = 'rgba(255,230,180,0.35)';
    for (let x = r.x; x < r.x + r.w; x += 4) if (!open(x)) c.fillRect(x, py - w / 2 + 1, 4, 1.2);
    for (let x = r.x + 40; x < r.x + r.w; x += 90) {
      if (open(x)) continue;
      c.fillStyle = COL.brassLo;
      c.fillRect(x, py - w / 2 - 2, 5, w + 4);
    }
  }
  for (let x = r.x + 70; x < r.x + r.w - 30; x += 170) {
    if (open(x)) continue;
    fillPath(c, '#e8dcc0', () => c.arc(x, y0 + 13, 7, 0, Math.PI * 2), 2, COL.brass);
    c.strokeStyle = COL.red;
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x, y0 + 13);
    c.lineTo(x + 4 * Math.cos(hash(x, 1) * 3 + 3.6), y0 + 13 + 4 * Math.sin(hash(x, 1) * 3 + 3.6));
    c.stroke();
  }
  c.fillStyle = COL.brass;
  c.fillRect(r.x, r.y - 3, r.w, 3);
}

function hatch(c: Ctx, x: number, y: number) {
  fillPath(c, '#2a2520', () => c.arc(x, y, 58, 0, Math.PI * 2), 4, COL.soot);
  // Hazard ring.
  for (let i = 0; i < 24; i++) {
    c.beginPath();
    c.arc(x, y, 52, (i / 24) * Math.PI * 2, ((i + 0.5) / 24) * Math.PI * 2);
    c.lineWidth = 8;
    c.strokeStyle = '#d8a030';
    c.stroke();
  }
  fillPath(c, grad(c, x - 44, y - 44, x + 44, y + 44, [[0, '#5a524a'], [1, '#2a2520']]), () => c.arc(x, y, 44, 0, Math.PI * 2), 2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    c.strokeStyle = '#1a1612';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos(a) * 44, y + Math.sin(a) * 44);
    c.stroke();
    rivet(c, x + Math.cos(a + 0.5) * 38, y + Math.sin(a + 0.5) * 38, 2);
  }
  fillPath(c, COL.brass, () => c.arc(x, y, 8, 0, Math.PI * 2), 2);
}

function compass(c: Ctx, x0: number, y0: number, k = 0.85) {
  c.save();
  c.translate(x0, y0);
  c.scale(k, k);
  const x = 0, y = 0;
  c.strokeStyle = COL.brass;
  c.lineWidth = 3;
  for (const r of [170, 150]) {
    c.beginPath();
    c.ellipse(x, y, r, r * 0.62, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.fillStyle = 'rgba(200,150,60,0.35)';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const L = i % 2 ? 150 : 205;
    c.beginPath();
    c.moveTo(x + Math.cos(a) * L, y + Math.sin(a) * L * 0.62);
    c.lineTo(x + Math.cos(a + 0.1) * 150, y + Math.sin(a + 0.1) * 150 * 0.62);
    c.lineTo(x + Math.cos(a - 0.1) * 150, y + Math.sin(a - 0.1) * 150 * 0.62);
    c.fill();
  }
  c.restore();
}

/** The altar of the Oracle: a boiler with her cyan eye, candles and a red carpet up to it. */
function altar(c: Ctx, x: number, y: number) {
  fillPath(c, grad(c, x - 50, 0, x + 50, 0, [[0, COL.rust2], [0.5, COL.copperHi], [1, COL.rust2]]), () => c.roundRect(x - 48, y - 70, 96, 70, 10), 3);
  for (let i = 0; i < 3; i++) {
    c.fillStyle = COL.brass;
    c.fillRect(x - 48, y - 60 + i * 22, 96, 4);
  }
  fillPath(c, '#0a1418', () => c.arc(x, y - 36, 18, 0, Math.PI * 2), 3, COL.brass);
  c.fillStyle = radial(c, x, y - 36, 16, [[0, '#ffffff'], [0.35, COL.cyan], [1, 'rgba(61,242,255,0)']]);
  c.beginPath();
  c.arc(x, y - 36, 16, 0, Math.PI * 2);
  c.fill();
  for (const dx of [-80, -64, 64, 80]) {
    fillPath(c, '#f4efe6', () => c.rect(x + dx - 3, y - 26, 6, 18), 1);
    c.fillStyle = radial(c, x + dx, y - 30, 10, [[0, '#fff3c4'], [1, 'rgba(255,182,64,0)']]);
    c.fillRect(x + dx - 10, y - 40, 20, 20);
  }
}

function rug(c: Ctx, x: number, y: number, w: number, h: number, col: string) {
  fillPath(c, col, () => c.roundRect(x, y, w, h, 6), 2, COL.soot);
  c.strokeStyle = COL.brass;
  c.lineWidth = 2;
  c.setLineDash([6, 4]);
  c.strokeRect(x + 8, y + 8, w - 16, h - 16);
  c.setLineDash([]);
}

/** A girder between cells: two iron flanges with X bracing; the sky shows through between the braces. */
function truss(c: Ctx, r: Rect) {
  const along = r.w >= r.h;
  const L = along ? r.w : r.h, T = along ? r.h : r.w;
  c.save();
  c.translate(r.x, r.y);
  if (!along) c.transform(0, 1, 1, 0, 0, 0); // draw it lying along x
  c.strokeStyle = '#231d18';
  c.lineWidth = 5;
  for (let x = 0; x < L; x += T) {
    c.beginPath();
    c.moveTo(x, 5);
    c.lineTo(Math.min(L, x + T), T - 5);
    c.moveTo(Math.min(L, x + T), 5);
    c.lineTo(x, T - 5);
    c.stroke();
  }
  for (const y of [0, T - 8]) {
    c.fillStyle = '#3a322a';
    c.fillRect(0, y, L, 8);
    c.fillStyle = 'rgba(255,230,180,0.12)';
    c.fillRect(0, y + 1, L, 1.5);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fillRect(0, y + 7, L, 1);
  }
  for (let x = 0; x <= L; x += T) {
    rivet(c, x + 3, 4, 1.4);
    rivet(c, x + 3, T - 4, 1.4);
  }
  c.restore();
}

/** Where girders cross: a gusset plate. */
function node(c: Ctx, x: number, y: number) {
  fillPath(c, '#3a322a', () => c.rect(x, y, GIRDER, GIRDER), 2, '#14100c');
  for (const [px, py] of [[7, 7], [GIRDER - 7, 7], [7, GIRDER - 7], [GIRDER - 7, GIRDER - 7]]) rivet(c, x + px, y + py, 2);
}

/** A grated catwalk over the drop: bars with gaps you can see the land through, brass rails and posts along both sides. */
export function catwalk(c: Ctx, r: Rect, rails = true, along = r.w >= r.h) {
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  c.strokeStyle = '#3e362e';
  c.lineWidth = 3;
  // Bars across the way, a stringer down it every 30 px.
  for (let k = 0; k < (along ? r.w : r.h); k += 9) {
    c.beginPath();
    if (along) {
      c.moveTo(r.x + k, r.y);
      c.lineTo(r.x + k, r.y + r.h);
    } else {
      c.moveTo(r.x, r.y + k);
      c.lineTo(r.x + r.w, r.y + k);
    }
    c.stroke();
  }
  c.strokeStyle = '#2a241e';
  c.lineWidth = 4;
  for (let k = 15; k < (along ? r.h : r.w); k += 30) {
    c.beginPath();
    if (along) {
      c.moveTo(r.x, r.y + k);
      c.lineTo(r.x + r.w, r.y + k);
    } else {
      c.moveTo(r.x + k, r.y);
      c.lineTo(r.x + k, r.y + r.h);
    }
    c.stroke();
  }
  c.restore();
  if (!rails) return;
  // Rails: a brass tube on posts along both long edges.
  const rail = (x0: number, y0: number, x1: number, y1: number) => {
    c.strokeStyle = '#14100c';
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
    c.strokeStyle = COL.brass;
    c.lineWidth = 4;
    c.stroke();
    c.strokeStyle = 'rgba(255,240,200,0.45)';
    c.lineWidth = 1;
    c.stroke();
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 60));
    for (let i = 0; i <= n; i++) fillPath(c, COL.brassLo, () => c.arc(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, 4, 0, Math.PI * 2), 1.5);
  };
  if (along) {
    rail(r.x, r.y + 3, r.x + r.w, r.y + 3);
    rail(r.x, r.y + r.h - 3, r.x + r.w, r.y + r.h - 3);
  } else {
    rail(r.x + 3, r.y, r.x + 3, r.y + r.h);
    rail(r.x + r.w - 3, r.y, r.x + r.w - 3, r.y + r.h);
  }
}

/** A door sill where a catwalk goes through a room's wall. */
function sill(c: Ctx, r: Rect) {
  fillPath(c, '#4a4038', () => c.rect(r.x, r.y, r.w, r.h), 2, '#14100c');
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  for (let k = -r.h; k < r.w + r.h; k += 16) {
    c.fillStyle = '#d8a030';
    c.beginPath();
    c.moveTo(r.x + k, r.y);
    c.lineTo(r.x + k + 8, r.y);
    c.lineTo(r.x + k + 8 - r.h, r.y + r.h);
    c.lineTo(r.x + k - r.h, r.y + r.h);
    c.fill();
  }
  c.restore();
  c.globalAlpha = 0.55;
  fillPath(c, '#2a241e', () => c.rect(r.x + 3, r.y + 3, r.w - 6, r.h - 6), 0);
  c.globalAlpha = 1;
}

/** An empty building slot: open air, a dashed lot line and corner brackets, its number on a plate on the girder above. */
function slot(c: Ctx, s: Slot) {
  c.strokeStyle = 'rgba(240,207,122,0.28)';
  c.lineWidth = 2;
  c.setLineDash([14, 10]);
  c.strokeRect(s.x + 14, s.y + 14, s.w - 28, s.h - 28);
  c.setLineDash([]);
  c.strokeStyle = 'rgba(240,207,122,0.55)';
  c.lineWidth = 4;
  const k = 26;
  for (const [x, y, sx, sy] of [[s.x + 8, s.y + 8, 1, 1], [s.x + s.w - 8, s.y + 8, -1, 1], [s.x + 8, s.y + s.h - 8, 1, -1], [s.x + s.w - 8, s.y + s.h - 8, -1, -1]]) {
    c.beginPath();
    c.moveTo(x + sx * k, y);
    c.lineTo(x, y);
    c.lineTo(x, y + sy * k);
    c.stroke();
  }
  const px = s.x + 18, py = s.y - GIRDER / 2 - 11;
  fillPath(c, grad(c, 0, py, 0, py + 22, [[0, COL.brassHi], [1, COL.brassLo]]), () => c.roundRect(px, py, 56, 22, 3), 2, COL.soot);
  rivet(c, px + 6, py + 11, 1.6);
  rivet(c, px + 50, py + 11, 1.6);
  c.font = '700 13px "Share Tech Mono", monospace';
  c.fillStyle = COL.soot;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(`LOT ${s.n}`, px + 28, py + 12);
}

/** The lift room's floor: plates, a hazard border, the hatch, cable guides up to the lever. */
function liftFloor(c: Ctx, r: Rect) {
  plates(c, r, '#4a463f', 60);
  c.strokeStyle = '#d8a030';
  c.lineWidth = 10;
  c.setLineDash([18, 14]);
  c.strokeRect(r.x + 18, r.y + 18, r.w - 36, r.h - 36);
  c.setLineDash([]);
  for (const dx of [-70, 70]) {
    fillPath(c, '#2a241e', () => c.rect(ARRIVE.x + dx - 6, r.y + 40, 12, ARRIVE.y - r.y - 60), 2);
    for (let y = r.y + 50; y < ARRIVE.y - 30; y += 20) rivet(c, ARRIVE.x + dx, y, 1.8);
  }
  hatch(c, ARRIVE.x, ARRIVE.y);
}

/** The whole deck in one texture (DECK size, 1x): girders, rooms with walls and floors, catwalks, the empty lots. Open air is left transparent. */
export function paintDeck(scene: Phaser.Scene) {
  return tex(scene, 'hub-deck-v2', DECK.w, DECK.h, (c) => {
    // The girder lattice: every cell edge, the wide lots' middle girder left out; gusset plates where girders cross.
    for (const x of GIRDER_X) truss(c, { x, y: 0, w: GIRDER, h: DECK.h });
    for (const y of GIRDER_Y) truss(c, { x: 0, y, w: DECK.w, h: GIRDER });
    for (const s of SLOTS) if (s.w > 400) c.clearRect(s.x, s.y, s.w, s.h);
    for (const x of GIRDER_X) for (const y of GIRDER_Y) node(c, x, y);
    // Rooms: a thick soot-iron band of wall, then the floor.
    for (const r of ROOMS) fillPath(c, '#2b2520', () => c.roundRect(r.x - WALL, r.y - WALL, r.w + WALL * 2, r.h + WALL * 2, 12), 3, '#050403');
    for (const r of ROOMS) {
      c.strokeStyle = COL.brassLo;
      c.lineWidth = 2;
      c.strokeRect(r.x - WALL + 6, r.y - WALL + 6, r.w + WALL * 2 - 12, r.h + WALL * 2 - 12);
      for (let x = r.x - WALL + 14; x < r.x + r.w + WALL - 8; x += 60) {
        rivet(c, x, r.y - WALL + 12);
        rivet(c, x, r.y + r.h + WALL - 12);
      }
    }
    const room = (id: string) => ROOMS.find((r) => r.id === id)!;
    checker(c, room('workshop'));
    liftFloor(c, room('lift'));
    plates(c, room('planner'), '#55493c');
    planks(c, room('church'), '#4a2a1c', 16);
    plates(c, room('colony'), '#8a5434'); // copper plate (only the church keeps its wood)
    // North wall faces (the doorways are cut next).
    for (const r of ROOMS) northWall(c, r, []);
    // Catwalks: cut the wall and girder away between rooms (open air), grate it, a hazard sill in each doorway.
    for (const w of WALKWAYS) {
      const along = w.w >= w.h;
      const open = along ? { x: w.x + 10, y: w.y, w: w.w - 20, h: w.h } : { x: w.x, y: w.y + 10, w: w.w, h: w.h - 20 };
      c.clearRect(open.x, open.y, open.w, open.h);
      const inner = along ? { ...open, x: open.x + WALL, w: open.w - WALL * 2 } : { ...open, y: open.y + WALL, h: open.h - WALL * 2 };
      catwalk(c, inner);
      if (along) {
        sill(c, { x: open.x - 4, y: open.y, w: WALL + 4, h: open.h });
        sill(c, { x: open.x + open.w - WALL, y: open.y, w: WALL + 4, h: open.h });
      } else {
        sill(c, { x: open.x, y: open.y - 4, w: open.w, h: WALL + 4 });
        sill(c, { x: open.x, y: open.y + open.h - WALL, w: open.w, h: WALL + 4 });
      }
    }
    // The planner: brass inlay and the compass rose under the course table.
    const pl = room('planner');
    c.strokeStyle = COL.brassLo;
    c.lineWidth = 4;
    c.strokeRect(pl.x + 20, pl.y + 20, pl.w - 40, pl.h - 40);
    compass(c, TABLE.x, TABLE.y);
    // The church: a carpet from the west door to the altar.
    const ch = room('church');
    const cy = ch.y + ch.h / 2 + 15;
    fillPath(c, '#7a1e1a', () => {
      c.rect(ch.x, cy - 30, ALTAR.x - ch.x + 30, 60);
      c.rect(ALTAR.x - 30, ALTAR.y + 10, 60, cy + 30 - ALTAR.y - 10);
    }, 0);
    c.fillStyle = COL.brass;
    c.fillRect(ch.x, cy - 34, ALTAR.x - ch.x - 30, 4);
    c.fillRect(ch.x, cy + 30, ALTAR.x - ch.x + 34, 4);
    c.fillRect(ALTAR.x - 34, ALTAR.y + 10, 4, cy - 34 - ALTAR.y - 10 + 4);
    c.fillRect(ALTAR.x + 30, ALTAR.y + 10, 4, cy + 34 - ALTAR.y - 10);
    altar(c, ALTAR.x, ALTAR.y);
    // The workshop: oil stains.
    const ws = room('workshop');
    for (let i = 0; i < 9; i++) {
      const x = ws.x + 30 + hash(i, 3) * (ws.w - 60), y = ws.y + 120 + hash(i, 7) * (ws.h - 150);
      c.fillStyle = 'rgba(8,6,4,0.45)';
      c.beginPath();
      c.ellipse(x, y, 10 + hash(i, 9) * 24, 6 + hash(i, 11) * 12, hash(i, 2) * 3, 0, Math.PI * 2);
      c.fill();
    }
    // The colony manager: a rug before the window.
    rug(c, WINDOW.x - 200, WINDOW.y - 80, 130, 160, '#3a4a5a');
    for (const s of SLOTS) slot(c, s);
    // NPC spots: a small brass plaque, a place waiting for someone.
    for (const p of Object.values(SPOTS)) {
      fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(p.x, p.y + 4, 26, 12, 0, 0, Math.PI * 2), 0);
      fillPath(c, COL.brassLo, () => c.ellipse(p.x, p.y + 2, 20, 9, 0, 0, Math.PI * 2), 1.5);
    }
  }, 1);
}

/** The land far below, seen through the open lots and the grates: soft clouds drifting between. */
export function makeSkyArt(scene: Phaser.Scene) {
  tex(scene, 'hub-cloud', 320, 160, (c) => {
    const r = seeded(5);
    for (let i = 0; i < 9; i++) {
      const x = 70 + r() * 180, y = 60 + r() * 40, rr = 40 + r() * 40;
      c.fillStyle = radial(c, x, y, rr, [[0, 'rgba(255,248,236,0.55)'], [1, 'rgba(255,248,236,0)']]);
      c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
  }, 1);
}
