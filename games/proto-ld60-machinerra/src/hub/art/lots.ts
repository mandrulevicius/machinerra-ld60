/**
 * What a station's lot is furnished with: the floor (`LOT_FLOOR` by NPC id), the props (`PROP_ART` by `PropKind`;
 * `layout.ts` `LOT_PROPS` places them), the lot's deck and grate textures. Add a lot: a `LOT_FLOOR` entry and its props
 * in `PROP_ART`.
 */
import Phaser from 'phaser';
import { COL } from '../../art';
import { PROP_SCALE, type PropKind, type Rect, type Slot } from '../layout';
import { catwalk, plates } from './deck';
import {
  type Ctx,
  fillPath,
  gauge,
  grad,
  hash,
  lines,
  planksIn,
  poly,
  puff,
  radial,
  seeded,
  shade,
  shell,
  tex,
  texH,
} from './draw';

/** The deck laid over a built lot, between its girders (which are walkable, so it joins the deck around it). */
export function lotDeckTex(scene: Phaser.Scene, lot: Slot, id: string) {
  const w = lot.w, h = lot.h;
  return tex(scene, `lot-floor-${lot.id}-${id}`, w, h, (c) => { // (keys renamed when the look changes: a texture lives on through hot reloads)
    // Copper plate edge to edge: the deck runs straight onto the girders around it, no rail between; the station's floor over it.
    plates(c, { x: 0, y: 0, w, h }, '#8a5434');
    LOT_FLOOR[id]?.(c, w, h);
  });
}
/** A bridge out to a built lot: the catwalk's grate, laid the same way, no rails (it joins the catwalk and the lot). */
export function bridgeTex(scene: Phaser.Scene, key: string, r: Rect, along: boolean) {
  return tex(scene, key, r.w, r.h, (c) => catwalk(c, { x: 0, y: 0, w: r.w, h: r.h }, false, along));
}
// ---------------------------------------------------------------- what each station's lot is furnished with

/** Floor dressing on a built lot, painted over its copper deck: the dojo's tatami, the stall's rug, the expedition map, blueprints. */
const LOT_FLOOR: Record<string, (c: Ctx, w: number, h: number) => void> = {
  kicker(c, w, h) {
    // Tatami, 60 x 120 each, laid in pairs that turn every block (the classic pattern), with dark cloth edges.
    const x0 = 14, y0 = 14, B = 120;
    for (let by = 0; y0 + by * B < h - 14; by++)
      for (let bx = 0; x0 + bx * B < w - 14; bx++) {
        const across = (bx + by) % 2 === 0;
        for (let k = 0; k < 2; k++) {
          const x = x0 + bx * B + (across ? 0 : k * 60), y = y0 + by * B + (across ? k * 60 : 0);
          const mw = Math.min(across ? B : 60, w - 14 - x), mh = Math.min(across ? 60 : B, h - 14 - y);
          if (mw < 8 || mh < 8) continue;
          c.fillStyle = shade('#c9b77a', 0.92 + hash(x, y) * 0.14);
          c.fillRect(x, y, mw, mh);
          c.strokeStyle = 'rgba(90,70,30,0.25)';
          c.lineWidth = 1;
          for (let s = 3; s < (across ? mh : mw); s += 3) {
            c.beginPath();
            if (across) {
              c.moveTo(x, y + s);
              c.lineTo(x + mw, y + s);
            } else {
              c.moveTo(x + s, y);
              c.lineTo(x + s, y + mh);
            }
            c.stroke();
          }
          // The heri: cloth binding along the long edges.
          c.fillStyle = '#1e2a20';
          if (across) {
            c.fillRect(x, y, mw, 3);
            c.fillRect(x, y + mh - 3, mw, 3);
          } else {
            c.fillRect(x, y, 3, mh);
            c.fillRect(x + mw - 3, y, 3, mh);
          }
          c.strokeStyle = 'rgba(0,0,0,0.45)';
          c.strokeRect(x + 0.5, y + 0.5, mw - 1, mh - 1);
        }
      }
    // A sparring circle in red paint where the Kicker stands, at the counter (`stationAt`).
    c.strokeStyle = 'rgba(176,42,32,0.75)';
    c.lineWidth = 4;
    c.beginPath();
    c.ellipse(w / 2, Math.min(184, h - 14), 64, 30, 0, 0, Math.PI * 2);
    c.stroke();
  },
  trader(c, w, h) {
    // A woven rug in the trader's oranges, straw spilled about.
    const rw = Math.min(w - 60, 260), rh = Math.min(h - 70, 170);
    const x = (w - rw) / 2, y = h - rh - 20;
    fillPath(c, '#7a2a1a', () => c.roundRect(x, y, rw, rh, 4), 2);
    c.strokeStyle = '#d8a030';
    c.lineWidth = 3;
    c.strokeRect(x + 8, y + 8, rw - 16, rh - 16);
    for (let i = 0; i < 6; i++) {
      const cx = x + 24 + ((rw - 48) * i) / 5;
      fillPath(c, i % 2 ? '#c8642a' : '#f4e2bc', () => {
        c.moveTo(cx, y + rh / 2 - 14);
        c.lineTo(cx + 9, y + rh / 2);
        c.lineTo(cx, y + rh / 2 + 14);
        c.lineTo(cx - 9, y + rh / 2);
        c.closePath();
      }, 1);
    }
    c.strokeStyle = '#f4e2bc';
    c.lineWidth = 1.5;
    for (let k = x + 4; k < x + rw; k += 6) {
      c.beginPath();
      c.moveTo(k, y);
      c.lineTo(k, y - 5);
      c.moveTo(k, y + rh);
      c.lineTo(k, y + rh + 5);
      c.stroke();
    }
    c.strokeStyle = 'rgba(230,200,120,0.6)';
    c.lineWidth = 1.2;
    const r = seeded(17);
    for (let i = 0; i < 40; i++) {
      const sx = r() * w, sy = r() * h, a = r() * Math.PI;
      c.beginPath();
      c.moveTo(sx, sy);
      c.lineTo(sx + Math.cos(a) * 7, sy + Math.sin(a) * 7);
      c.stroke();
    }
  },
  expeditioner(c, w, h) {
    // A big map of the sands spread on the deck, weighted at the corners, a route dashed to an X.
    const mw = Math.min(w - 70, 240), mh = Math.min(h - 80, 150);
    const x = 30, y = h - mh - 24;
    fillPath(c, '#d8c090', () => {
      c.moveTo(x, y + 4);
      c.lineTo(x + mw, y);
      c.lineTo(x + mw - 3, y + mh);
      c.lineTo(x + 2, y + mh - 3);
      c.closePath();
    }, 2, '#5a4020');
    c.strokeStyle = 'rgba(122,74,40,0.55)';
    c.lineWidth = 1.5;
    const r = seeded(23);
    for (let k = 0; k < 4; k++) {
      const cx = x + 30 + r() * (mw - 60), cy = y + 25 + r() * (mh - 50);
      c.beginPath();
      c.ellipse(cx, cy, 16 + r() * 18, 8 + r() * 10, r() * 3, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = COL.red;
    c.lineWidth = 2.5;
    c.setLineDash([6, 5]);
    c.beginPath();
    c.moveTo(x + 20, y + mh - 20);
    c.bezierCurveTo(x + mw * 0.4, y + 10, x + mw * 0.6, y + mh, x + mw - 30, y + 30);
    c.stroke();
    c.setLineDash([]);
    c.lineWidth = 3.5;
    c.beginPath();
    c.moveTo(x + mw - 38, y + 22);
    c.lineTo(x + mw - 22, y + 38);
    c.moveTo(x + mw - 22, y + 22);
    c.lineTo(x + mw - 38, y + 38);
    c.stroke();
    for (const [px, py] of [[x + 6, y + 8], [x + mw - 8, y + 6], [x + mw - 10, y + mh - 8], [x + 8, y + mh - 8]]) fillPath(c, '#6a625a', () => c.arc(px, py, 6, 0, Math.PI * 2), 1.5);
  },
  cityPlanner(c, w, h) {
    // Blueprints spread about, crumpled drafts beside them.
    const r = seeded(41);
    for (let i = 0; i < 4; i++) {
      const bw = 90 + r() * 40, bh = 62 + r() * 20;
      const x = 20 + r() * (w - bw - 40), y = h * 0.45 + r() * (h * 0.55 - bh - 16), a = (r() - 0.5) * 0.5;
      c.save();
      c.translate(x + bw / 2, y + bh / 2);
      c.rotate(a);
      fillPath(c, '#2a5a9a', () => c.rect(-bw / 2, -bh / 2, bw, bh), 1.5, '#14284a');
      c.strokeStyle = 'rgba(224,232,240,0.7)';
      c.lineWidth = 1;
      c.strokeRect(-bw / 2 + 5, -bh / 2 + 5, bw - 10, bh - 10);
      for (let k = 0; k < 3; k++) {
        const bx = -bw / 2 + 12 + r() * (bw - 50), by = -bh / 2 + 10 + r() * (bh - 34);
        c.strokeRect(bx, by, 16 + r() * 22, 12 + r() * 12);
      }
      c.beginPath();
      c.moveTo(-bw / 2 + 8, bh / 2 - 10);
      c.lineTo(bw / 2 - 8, bh / 2 - 10);
      c.stroke();
      c.restore();
    }
    for (let i = 0; i < 5; i++) {
      const x = 16 + r() * (w - 32), y = h * 0.5 + r() * (h * 0.45);
      fillPath(c, '#efe8da', () => c.arc(x, y, 5 + r() * 3, 0, Math.PI * 2), 1, '#8a8070');
    }
  },
  home(c, w, h) {
    // Floorboards over the copper, an oval rag rug before the door, a pair of slippers.
    fillPath(c, '#6a4a32', () => c.rect(14, 14, w - 28, h - 28), 0);
    planksIn(c, 14, 14, w - 28, h - 28, 16);
    const r = seeded(53);
    const segs: number[][] = [];
    for (let y = 30; y < h - 14; y += 16) for (let x = 14 + r() * 60; x < w - 14; x += 70 + r() * 60) segs.push([x, y - 16, x, y]);
    lines(c, 'rgba(0,0,0,0.25)', 1, segs);
    const cx = w / 2, cy = h - 64;
    ['#7a4a8a', '#e8dcc0', '#c87a9a', '#5a2e4a', '#e8c070'].forEach((col, i) => fillPath(c, col, () => c.ellipse(cx, cy, 96 - i * 16, 40 - i * 7, 0, 0, Math.PI * 2), i ? 0 : 1.5));
    for (const x of [w - 70, w - 54]) fillPath(c, '#8a4a7a', () => c.ellipse(x, h - 40, 6, 12, 0.2, 0, Math.PI * 2), 1.2);
  },
  magazine(c, w, h) {
    // Steel plate inside a hazard-striped border, AMMUNITION stencilled on it, scuffs where the crates are dragged.
    plates(c, { x: 10, y: 10, w: w - 20, h: h - 20 }, '#6a6a70');
    c.save();
    c.beginPath();
    c.rect(10, 10, w - 20, h - 20);
    c.rect(26, 26, w - 52, h - 52);
    c.clip('evenodd');
    for (let x = -h, i = 0; x < w + h; x += 18, i++) fillPath(c, i % 2 ? COL.soot : '#e0b030', () => poly(c, [x, h, x + h, 0, x + h + 18, 0, x + 18, h]), 0);
    c.restore();
    c.font = 'bold 26px "Share Tech Mono", monospace';
    c.fillStyle = 'rgba(224,176,48,0.35)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('AMMUNITION', w / 2, h * 0.62);
    c.font = 'bold 15px "Share Tech Mono", monospace';
    c.fillText('NO NAKED FLAMES', w / 2, h * 0.62 + 26);
    const r = seeded(61);
    for (let i = 0; i < 14; i++) {
      const x = 40 + r() * (w - 80), y = 40 + r() * (h - 80);
      lines(c, 'rgba(200,200,190,0.18)', 2, [[x, y, x + 20 + r() * 30, y + (r() - 0.5) * 6]]);
    }
  },
  boilers(c, w, h) {
    // Soot and ash about the firebox, a drift of bark and chips, a water drain grate.
    const r = seeded(67);
    for (let i = 0; i < 9; i++) fillPath(c, `rgba(20,16,12,${0.15 + r() * 0.2})`, () => c.ellipse(w / 2 + (r() - 0.5) * w * 0.7, h * 0.35 + r() * h * 0.5, 30 + r() * 40, 12 + r() * 18, r(), 0, Math.PI * 2), 0);
    for (let i = 0; i < 16; i++) {
      const x = 20 + r() * (w - 40), y = h * 0.6 + r() * (h * 0.35), a = r() * Math.PI;
      lines(c, r() > 0.5 ? '#8a5a30' : '#c8a070', 2, [[x, y, x + Math.cos(a) * 7, y + Math.sin(a) * 7]]);
    }
    const gx = w - 70, gy = h - 64;
    fillPath(c, COL.iron, () => c.rect(gx, gy, 44, 44), 2);
    lines(c, COL.soot, 3, Array.from({ length: 5 }, (_, i) => [gx + 6 + i * 8, gy + 4, gx + 6 + i * 8, gy + 40]));
  },
  sprocket(c, w, h) {
    // Oil stains and filings round the bench, a chalked outline of the part being made, a drain grate.
    const r = seeded(29);
    for (let i = 0; i < 8; i++) fillPath(c, `rgba(20,16,12,${0.15 + r() * 0.2})`, () => c.ellipse(30 + r() * (w - 60), h * 0.3 + r() * h * 0.6, 14 + r() * 26, 8 + r() * 12, r(), 0, Math.PI * 2), 0);
    c.strokeStyle = 'rgba(240,235,220,0.5)';
    c.lineWidth = 2;
    c.setLineDash([8, 6]);
    c.beginPath();
    c.arc(w * 0.5, h * 0.62, 34, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    for (let i = 0; i < 20; i++) {
      const x = 20 + r() * (w - 40), y = h * 0.4 + r() * (h * 0.55);
      lines(c, 'rgba(200,205,210,0.5)', 1.5, [[x, y, x + 3, y + 2]]);
    }
  },
  hob(c, w, h) {
    // Soot-black iron plate scorched round the hearth, coal and clinker spilled, a few embers still glowing.
    const r = seeded(73);
    for (let i = 0; i < 10; i++) fillPath(c, `rgba(14,10,8,${0.25 + r() * 0.25})`, () => c.ellipse(w / 2 + (r() - 0.5) * w * 0.8, h * 0.25 + r() * h * 0.55, 30 + r() * 44, 12 + r() * 20, r(), 0, Math.PI * 2), 0);
    fillPath(c, 'rgba(255,120,40,0.16)', () => c.ellipse(w / 2, h * 0.3, 110, 40, 0, 0, Math.PI * 2), 0);
    for (let i = 0; i < 26; i++) {
      const x = 20 + r() * (w - 40), y = h * 0.3 + r() * (h * 0.65);
      fillPath(c, '#1a1612', () => c.ellipse(x, y, 3 + r() * 4, 2 + r() * 3, r(), 0, Math.PI * 2), 0);
    }
    for (let i = 0; i < 12; i++) fillPath(c, i % 3 ? '#ff8a30' : '#ffd060', () => c.arc(30 + r() * (w - 60), h * 0.3 + r() * (h * 0.6), 1.6, 0, Math.PI * 2), 0);
    // Chalked barrel circles where he sets the gun he is boring.
    c.strokeStyle = 'rgba(240,235,220,0.45)';
    c.lineWidth = 2;
    c.setLineDash([8, 6]);
    c.beginPath();
    c.ellipse(w * 0.5, h - 56, 64, 26, 0, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
  },
  gasket(c, w, h) {
    // Cream and teal checkered tile, a drain in the middle, a chalked-off patient's outline by the table.
    const T = 28;
    const x0 = 12, y0 = 12;
    for (let y = y0, j = 0; y < h - 12; y += T, j++)
      for (let x = x0, i = 0; x < w - 12; x += T, i++) {
        c.fillStyle = (i + j) % 2 ? '#d8d4c4' : '#8fc4b8';
        c.fillRect(x, y, Math.min(T, w - 12 - x), Math.min(T, h - 12 - y));
      }
    c.strokeStyle = 'rgba(40,60,56,0.3)';
    c.lineWidth = 1;
    c.strokeRect(x0, y0, w - 2 * x0, h - 2 * y0);
    const gx = w / 2, gy = h * 0.58;
    fillPath(c, COL.iron, () => c.arc(gx, gy, 12, 0, Math.PI * 2), 2);
    lines(c, COL.soot, 2, [[gx - 8, gy, gx + 8, gy], [gx, gy - 8, gx, gy + 8]]);
    const r = seeded(83);
    for (let i = 0; i < 6; i++) fillPath(c, `rgba(90,60,30,${0.12 + r() * 0.12})`, () => c.ellipse(30 + r() * (w - 60), 30 + r() * (h - 60), 8 + r() * 14, 5 + r() * 8, r(), 0, Math.PI * 2), 0);
  },
  mast(c, w, h) {
    // A painted bearing ring round the mast's foot, its cardinal ticks, cable runs to the deck's edge.
    const cx = w / 2, cy = h * 0.42;
    c.strokeStyle = 'rgba(240,220,160,0.55)';
    c.lineWidth = 3;
    for (const rr of [70, 100]) {
      c.beginPath();
      c.ellipse(cx, cy, rr * 1.2, rr * 0.75, 0, 0, Math.PI * 2);
      c.stroke();
    }
    const segs: number[][] = [];
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, k = i % 9 === 0 ? 22 : 10;
      segs.push([cx + Math.cos(a) * 100 * 1.2, cy + Math.sin(a) * 75, cx + Math.cos(a) * (100 - k) * 1.2, cy + Math.sin(a) * (75 - k * 0.75)]);
    }
    lines(c, 'rgba(240,220,160,0.55)', 2, segs);
    c.font = 'bold 16px Georgia, serif';
    c.fillStyle = 'rgba(240,220,160,0.7)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const [t, a] of [['N', -Math.PI / 2], ['E', 0], ['S', Math.PI / 2], ['W', Math.PI]] as [string, number][]) c.fillText(t, cx + Math.cos(a) * 140, cy + Math.sin(a) * 92);
  },
};

/** The things standing on a station's lot (`LOT_PROPS` in layout.ts places them): drawn 2x, feet at the bottom centre. */
const PROP_ART: Record<PropKind, [number, number, (c: Ctx) => void]> = {
  // The dojo.
  bag: [110, 170, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(55, 164, 46, 6, 0, 0, Math.PI * 2), 0);
    for (const x of [14, 96]) fillPath(c, '#6a4428', () => c.rect(x - 5, 16, 10, 150), 2);
    fillPath(c, '#7a5030', () => c.rect(4, 10, 102, 12), 2);
    c.strokeStyle = '#5a524a';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(55, 22);
    c.lineTo(55, 44);
    c.stroke();
    fillPath(c, grad(c, 36, 0, 74, 0, [[0, '#5a2a18'], [0.45, '#9a5a34'], [1, '#4a2214']]), () => c.roundRect(36, 44, 38, 92, 16), 2.5);
    for (const y of [58, 118]) fillPath(c, COL.brass, () => c.rect(36, y, 38, 6), 1.5);
    fillPath(c, '#3a1a10', () => c.ellipse(55, 92, 6, 9, 0, 0, Math.PI * 2), 0); // a dent from a good kick
  }],
  rack: [110, 150, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(55, 144, 50, 6, 0, 0, Math.PI * 2), 0);
    fillPath(c, '#6a4428', () => c.rect(8, 40, 94, 10), 2);
    fillPath(c, '#6a4428', () => c.rect(8, 110, 94, 10), 2);
    for (const x of [12, 98]) fillPath(c, '#5a3a20', () => c.rect(x - 5, 20, 10, 126), 2);
    // Bo staffs, a wrench-tipped spear (the Old Way's own), a pair of nunchaku hanging.
    for (const [x, col] of [[28, '#c89a60'], [44, '#b08050'], [60, '#c89a60']] as [number, string][]) fillPath(c, col, () => c.roundRect(x - 3, 6, 6, 136, 3), 1.5);
    fillPath(c, '#8a8a90', () => c.roundRect(73, 18, 6, 124, 3), 1.5);
    fillPath(c, '#9aa0a8', () => {
      c.arc(76, 14, 9, Math.PI * 0.2, Math.PI * 1.8);
    }, 2);
    c.strokeStyle = '#5a524a';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(86, 52);
    c.quadraticCurveTo(92, 58, 90, 64);
    c.stroke();
    fillPath(c, '#2a1a10', () => c.roundRect(84, 64, 6, 30, 2), 1);
    fillPath(c, '#2a1a10', () => c.roundRect(90, 60, 6, 30, 2), 1);
  }],
  dummy: [90, 170, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(45, 164, 36, 6, 0, 0, Math.PI * 2), 0);
    // A wooden kicking dummy on a steam piston: arms out, one leg, a gauge on its base.
    fillPath(c, grad(c, 14, 0, 76, 0, [[0, '#3d3833'], [0.5, '#6a625a'], [1, '#3d3833']]), () => c.roundRect(14, 128, 62, 36, 6), 2);
    fillPath(c, '#e8dcc0', () => c.arc(60, 146, 8, 0, Math.PI * 2), 1.5, COL.brass);
    fillPath(c, '#9aa0a8', () => c.rect(38, 112, 14, 18), 1.5);
    fillPath(c, grad(c, 30, 0, 60, 0, [[0, '#6a4428'], [0.5, '#b07a48'], [1, '#5a3a20']]), () => c.roundRect(30, 16, 30, 100, 12), 2.5);
    for (const [y, a] of [[44, -0.35], [44, 0.35], [70, 0]] as [number, number][])
      for (const s of a ? [Math.sign(a)] : [-1]) {
        c.save();
        c.translate(45, y);
        c.rotate(a);
        fillPath(c, '#8a5a34', () => c.roundRect(s > 0 ? 6 : -40, -4, 34, 8, 4), 1.5);
        c.restore();
      }
    fillPath(c, '#8a5a34', () => {
      c.moveTo(48, 96);
      c.lineTo(78, 110);
      c.lineTo(74, 118);
      c.lineTo(46, 106);
      c.closePath();
    }, 1.5);
    c.fillStyle = 'rgba(244,239,230,0.5)';
    c.beginPath();
    c.arc(30, 120, 6, 0, Math.PI * 2);
    c.arc(22, 112, 4, 0, Math.PI * 2);
    c.fill();
  }],
  // The Goodies & More stall.
  crates: [130, 140, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(65, 134, 58, 6, 0, 0, Math.PI * 2), 0);
    const crate = (x: number, y: number, s: number, mark: string) => {
      fillPath(c, '#8a5a30', () => c.rect(x, y, s, s), 2);
      c.strokeStyle = '#5a3a1a';
      c.lineWidth = 2;
      c.strokeRect(x + 5, y + 5, s - 10, s - 10);
      c.beginPath();
      c.moveTo(x + 5, y + 5);
      c.lineTo(x + s - 5, y + s - 5);
      c.stroke();
      c.font = '700 13px "Share Tech Mono", monospace';
      c.fillStyle = 'rgba(30,20,10,0.75)';
      c.textAlign = 'center';
      c.fillText(mark, x + s / 2, y + s / 2 + 18);
    };
    crate(6, 76, 58, 'GEARS');
    crate(66, 80, 54, 'TEA');
    crate(34, 22, 56, 'FRAGILE');
  }],
  barrels: [120, 130, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(60, 124, 54, 6, 0, 0, Math.PI * 2), 0);
    const barrel = (x: number, y: number, top: string) => {
      fillPath(c, grad(c, x - 24, 0, x + 24, 0, [[0, '#5a3a1a'], [0.5, '#a06a40'], [1, '#4a2a14']]), () => c.roundRect(x - 24, y - 70, 48, 70, 10), 2);
      for (const yy of [y - 58, y - 14]) fillPath(c, '#5a524a', () => c.rect(x - 25, yy, 50, 5), 1);
      fillPath(c, '#6a4428', () => c.ellipse(x, y - 70, 24, 8, 0, 0, Math.PI * 2), 1.5);
      c.fillStyle = top;
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.arc(x - 12 + (i % 3) * 12, y - 74 + Math.floor(i / 3) * 6, 5, 0, Math.PI * 2);
        c.fill();
      }
    };
    barrel(32, 122, '#d8a030'); // brass bolts
    barrel(88, 116, '#c03a2a'); // apples
  }],
  goods: [140, 110, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(70, 104, 64, 6, 0, 0, Math.PI * 2), 0);
    for (const x of [16, 124]) fillPath(c, '#5a3a20', () => c.rect(x - 4, 60, 8, 44), 1.5);
    fillPath(c, '#8a5a30', () => c.roundRect(4, 52, 132, 14, 3), 2);
    // A teapot, a jar of sweets, gears, a pocket watch, a sock (snacks, tools, trinkets).
    fillPath(c, COL.copperHi, () => c.ellipse(28, 40, 16, 13, 0, 0, Math.PI * 2), 1.5);
    fillPath(c, COL.copper, () => c.rect(42, 34, 10, 4), 1);
    fillPath(c, 'rgba(200,230,255,0.55)', () => c.roundRect(56, 22, 22, 30, 4), 1.5);
    for (const [x, y, col] of [[62, 42, '#d04050'], [70, 36, '#40a060'], [66, 30, '#e0b030']] as [number, number, string][]) fillPath(c, col, () => c.arc(x, y, 3.5, 0, Math.PI * 2), 0);
    for (const [x, r] of [[92, 9], [108, 6]]) fillPath(c, COL.brass, () => {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r : r * 0.78;
        if (i) c.lineTo(x + Math.cos(a) * rr, 44 + Math.sin(a) * rr);
        else c.moveTo(x + Math.cos(a) * rr, 44 + Math.sin(a) * rr);
      }
      c.closePath();
    }, 1.2);
    fillPath(c, '#e8dcc0', () => c.arc(124, 44, 7, 0, Math.PI * 2), 1.5, COL.brass);
    fillPath(c, '#d8a030', () => c.roundRect(94, 70, 34, 16, 3), 1.2);
    c.font = '700 11px Georgia, serif';
    c.fillStyle = COL.soot;
    c.textAlign = 'center';
    c.fillText('2 bolts', 111, 82);
  }],
  // The expedition office.
  tent: [170, 130, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(85, 122, 80, 8, 0, 0, Math.PI * 2), 0);
    c.strokeStyle = '#8a7c6a';
    c.lineWidth = 1.2;
    for (const [x0, x1] of [[38, 4], [132, 166]]) {
      c.beginPath();
      c.moveTo(x0, 40);
      c.lineTo(x1, 120);
      c.stroke();
    }
    fillPath(c, grad(c, 0, 20, 0, 120, [[0, '#d8c8a0'], [1, '#9a8a64']]), () => {
      c.moveTo(85, 16);
      c.lineTo(160, 120);
      c.lineTo(10, 120);
      c.closePath();
    }, 2.5);
    fillPath(c, '#2a2016', () => {
      c.moveTo(85, 40);
      c.lineTo(110, 120);
      c.lineTo(60, 120);
      c.closePath();
    }, 0);
    fillPath(c, '#b8a87c', () => {
      c.moveTo(85, 40);
      c.lineTo(60, 120);
      c.lineTo(44, 120);
      c.closePath();
    }, 1.5);
    fillPath(c, '#5a4a30', () => c.rect(83, 6, 4, 14), 1);
    fillPath(c, '#4a7a3a', () => {
      c.moveTo(87, 6);
      c.lineTo(104, 10);
      c.lineTo(87, 14);
    }, 1);
  }],
  scope: [90, 160, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(45, 154, 40, 6, 0, 0, Math.PI * 2), 0);
    c.strokeStyle = '#4a3a28';
    c.lineWidth = 5;
    for (const x of [12, 45, 78]) {
      c.beginPath();
      c.moveTo(45, 80);
      c.lineTo(x, 152);
      c.stroke();
    }
    fillPath(c, COL.brassLo, () => c.arc(45, 78, 7, 0, Math.PI * 2), 1.5);
    c.save();
    c.translate(45, 70);
    c.rotate(-0.55);
    fillPath(c, grad(c, 0, -10, 0, 10, [[0, COL.brassHi], [0.5, COL.brass], [1, COL.brassLo]]), () => c.roundRect(-34, -9, 76, 18, 4), 2);
    fillPath(c, COL.brass, () => c.roundRect(40, -12, 14, 24, 3), 2);
    fillPath(c, '#2a3a4a', () => c.ellipse(54, 0, 3, 10, 0, 0, Math.PI * 2), 1);
    for (const x of [-20, 0, 20]) fillPath(c, COL.brassLo, () => c.rect(x, -10, 3, 20), 0);
    c.restore();
  }],
  pack: [130, 120, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(65, 114, 60, 6, 0, 0, Math.PI * 2), 0);
    // A pickaxe leaning on it, a bedroll on top, a lantern beside.
    c.strokeStyle = '#6a4428';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(18, 112);
    c.lineTo(46, 20);
    c.stroke();
    fillPath(c, '#7a7a80', () => {
      c.moveTo(22, 26);
      c.quadraticCurveTo(46, 10, 72, 26);
      c.lineTo(68, 30);
      c.quadraticCurveTo(46, 20, 26, 32);
      c.closePath();
    }, 1.5);
    fillPath(c, grad(c, 40, 0, 100, 0, [[0, '#4a5a32'], [0.5, '#6a7a44'], [1, '#3e4a2a']]), () => c.roundRect(42, 46, 58, 66, 12), 2.5);
    fillPath(c, '#5a6a3a', () => c.roundRect(50, 74, 42, 26, 6), 1.5);
    fillPath(c, COL.brass, () => c.rect(68, 80, 6, 8), 1);
    fillPath(c, '#a03a2a', () => c.roundRect(38, 30, 66, 22, 11), 2);
    c.strokeStyle = '#3a2414';
    c.lineWidth = 2;
    for (const x of [54, 88]) {
      c.beginPath();
      c.moveTo(x, 30);
      c.lineTo(x, 52);
      c.stroke();
    }
    fillPath(c, COL.brassLo, () => c.rect(108, 80, 16, 30), 1.5);
    fillPath(c, '#ffd98a', () => c.roundRect(110, 84, 12, 20, 3), 1);
    fillPath(c, COL.brass, () => c.arc(116, 76, 6, Math.PI, 0), 1.5);
  }],
  // The drafting office.
  drafting: [140, 150, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(70, 144, 62, 6, 0, 0, Math.PI * 2), 0);
    for (const x of [24, 116]) fillPath(c, '#4a3a28', () => c.rect(x - 4, 80, 8, 64), 1.5);
    fillPath(c, '#3a2a1a', () => c.rect(20, 120, 100, 6), 1);
    // The tilted board, a blueprint pinned on it, a T-square, a lamp on an arm.
    fillPath(c, '#8a6a44', () => {
      c.moveTo(12, 92);
      c.lineTo(128, 92);
      c.lineTo(118, 30);
      c.lineTo(22, 30);
      c.closePath();
    }, 2);
    fillPath(c, '#2a5a9a', () => {
      c.moveTo(26, 86);
      c.lineTo(112, 86);
      c.lineTo(105, 38);
      c.lineTo(32, 38);
      c.closePath();
    }, 1.2, '#14284a');
    c.strokeStyle = 'rgba(224,232,240,0.75)';
    c.lineWidth = 1;
    c.strokeRect(48, 50, 26, 20);
    c.strokeRect(78, 46, 18, 30);
    c.beginPath();
    c.moveTo(40, 80);
    c.lineTo(100, 80);
    c.stroke();
    for (const [x, y] of [[34, 42], [102, 42], [30, 82], [108, 82]]) fillPath(c, COL.red, () => c.arc(x, y, 2.5, 0, Math.PI * 2), 0);
    fillPath(c, '#e8dcc0', () => c.rect(36, 62, 70, 4), 1);
    c.strokeStyle = '#3a322a';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(122, 92);
    c.lineTo(132, 20);
    c.lineTo(108, 10);
    c.stroke();
    fillPath(c, COL.brass, () => c.ellipse(106, 16, 10, 6, 0.4, 0, Math.PI * 2), 1.5);
  }],
  tubes: [80, 120, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(40, 114, 34, 6, 0, 0, Math.PI * 2), 0);
    // Rolled blueprints standing in a basket.
    for (const [x, top, a] of [[22, 14, -0.2], [34, 6, -0.05], [46, 12, 0.1], [58, 20, 0.25], [40, 24, 0]] as [number, number, number][]) {
      c.save();
      c.translate(x, 80);
      c.rotate(a);
      fillPath(c, '#3a6aaa', () => c.roundRect(-6, top - 80, 12, 84 - top, 4), 1.5, '#14284a');
      fillPath(c, '#e0e8f0', () => c.ellipse(0, top - 80, 6, 3, 0, 0, Math.PI * 2), 1, '#14284a');
      c.restore();
    }
    fillPath(c, grad(c, 10, 0, 70, 0, [[0, '#6a4428'], [0.5, '#a07040'], [1, '#5a3a20']]), () => {
      c.moveTo(10, 66);
      c.lineTo(70, 66);
      c.lineTo(64, 112);
      c.lineTo(16, 112);
      c.closePath();
    }, 2);
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 1.5;
    for (const y of [78, 90, 102]) {
      c.beginPath();
      c.moveTo(12, y);
      c.lineTo(68, y);
      c.stroke();
    }
  }],
  model: [120, 130, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(60, 124, 54, 6, 0, 0, Math.PI * 2), 0);
    fillPath(c, grad(c, 12, 0, 108, 0, [[0, '#3a322a'], [0.5, '#5a524a'], [1, '#3a322a']]), () => c.rect(14, 80, 92, 44), 2);
    fillPath(c, COL.brass, () => c.rect(10, 74, 100, 8), 1.5);
    // A white card model of the city to come: a balloon over towers, a chimney.
    for (const [x, w, h] of [[22, 18, 30], [42, 22, 46], [66, 16, 24], [84, 18, 36]]) {
      fillPath(c, '#efe8da', () => c.rect(x, 74 - h, w, h), 1.5, '#8a8070');
      c.fillStyle = '#c8bfae';
      c.fillRect(x + w - 5, 74 - h, 5, h);
      c.fillStyle = 'rgba(255,182,64,0.9)';
      for (let y = 74 - h + 6; y < 70; y += 9) c.fillRect(x + 4, y, 3, 3);
    }
    fillPath(c, '#efe8da', () => c.ellipse(52, 16, 26, 12, 0, 0, Math.PI * 2), 1.5, '#8a8070');
    c.strokeStyle = '#8a8070';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(40, 25);
    c.lineTo(48, 28);
    c.moveTo(64, 25);
    c.lineTo(56, 28);
    c.stroke();
    fillPath(c, '#d8cfbc', () => c.rect(46, 26, 12, 6), 1, '#8a8070');
  }],
  // Your house.
  armchair: [110, 120, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(55, 114, 50, 6, 0, 0, Math.PI * 2), 0);
    for (const x of [18, 92]) fillPath(c, '#3a2214', () => c.rect(x - 3, 98, 6, 16), 1);
    fillPath(c, grad(c, 0, 10, 0, 70, [[0, '#8a4a7a'], [1, '#5a2e4a']]), () => c.roundRect(18, 10, 74, 66, [24, 24, 4, 4]), 2);
    lines(c, 'rgba(0,0,0,0.25)', 1.5, [[40, 20, 40, 66], [70, 20, 70, 66]]);
    for (const [x, y] of [[40, 40], [70, 40], [55, 28]]) fillPath(c, COL.brass, () => c.arc(x, y, 2.4, 0, Math.PI * 2), 0.8);
    fillPath(c, '#7a4070', () => c.roundRect(14, 66, 82, 34, 6), 2);
    for (const x of [4, 86]) fillPath(c, '#6a3462', () => c.roundRect(x, 46, 20, 56, 8), 2);
    fillPath(c, '#e8dcc0', () => poly(c, [60, 60, 86, 56, 84, 72, 62, 74]), 1.2, '#8a8070'); // a newspaper left on it
    lines(c, 'rgba(60,50,40,0.6)', 1, [[66, 62, 80, 60], [66, 66, 80, 64]]);
  }],
  stove: [90, 140, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(45, 134, 40, 6, 0, 0, Math.PI * 2), 0);
    fillPath(c, COL.iron, () => c.rect(40, 0, 12, 50), 2);
    fillPath(c, grad(c, 14, 0, 76, 0, [[0, '#2a2622'], [0.5, '#5a524a'], [1, '#24201c']]), () => c.roundRect(14, 46, 62, 80, 8), 2);
    for (const x of [18, 72]) fillPath(c, COL.iron, () => c.rect(x - 3, 122, 6, 12), 1);
    fillPath(c, radial(c, 45, 96, 20, [[0, '#fff0a0'], [0.5, '#ff9a30'], [1, '#8a2a10']]), () => c.roundRect(28, 82, 34, 26, 4), 2);
    lines(c, COL.soot, 2, [[36, 82, 36, 108], [45, 82, 45, 108], [54, 82, 54, 108]]);
    fillPath(c, COL.brass, () => c.rect(10, 46, 70, 6), 1.5);
    fillPath(c, COL.copperHi, () => c.ellipse(58, 38, 14, 10, 0, 0, Math.PI * 2), 1.5); // the kettle
    lines(c, COL.copper, 2.5, [[70, 34, 80, 28]]);
    puff(c, 'rgba(244,239,230,0.6)', [[82, 22, 4], [86, 14, 5]]);
  }],
  plant: [70, 130, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(35, 124, 28, 5, 0, 0, Math.PI * 2), 0);
    const leaf = (x: number, y: number, a: number, l: number) => fillPath(c, a > 0 ? '#4a8a4a' : '#3a7a3e', () => {
      c.moveTo(35, 84);
      c.quadraticCurveTo(x - Math.sin(a) * l * 0.3, y + Math.cos(a) * 10, x, y);
      c.quadraticCurveTo(x + Math.sin(a) * l * 0.3, y + 16, 35, 84);
    }, 1.2, '#1e3a1e');
    leaf(8, 30, -1, 50);
    leaf(62, 26, 1, 50);
    leaf(26, 6, -0.4, 70);
    leaf(48, 10, 0.4, 70);
    leaf(4, 64, -1.2, 40);
    leaf(66, 60, 1.2, 40);
    fillPath(c, grad(c, 14, 0, 56, 0, [[0, COL.copper], [0.5, COL.copperHi], [1, COL.rust]]), () => poly(c, [14, 82, 56, 82, 50, 124, 20, 124]), 2);
    fillPath(c, COL.brass, () => c.rect(12, 80, 46, 7), 1.5);
  }],
  // The shell magazine.
  ammo: [130, 110, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(65, 104, 60, 6, 0, 0, Math.PI * 2), 0);
    const box = (x: number, y: number, w: number) => {
      fillPath(c, '#4a5a3a', () => c.rect(x, y, w, 34), 2);
      fillPath(c, '#3a4a2e', () => c.rect(x, y, w, 8), 1.5);
      fillPath(c, COL.ironHi, () => c.rect(x + w / 2 - 8, y + 2, 16, 4), 1);
      c.font = '700 10px "Share Tech Mono", monospace';
      c.fillStyle = '#e0d070';
      c.textAlign = 'center';
      c.fillText('SHELL', x + w / 2, y + 26);
    };
    box(6, 66, 58);
    box(66, 66, 58);
    box(34, 32, 58);
    shell(c, 108, 64, 40, 12);
  }],
  shells: [110, 110, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(55, 104, 50, 6, 0, 0, Math.PI * 2), 0);
    // A pyramid of shells lying down, their brass bases towards you, chocked with wedges.
    for (let row = 0; row < 4; row++)
      for (let i = 0; i < 4 - row; i++) {
        const x = 22 + i * 22 + row * 11, y = 88 - row * 19;
        fillPath(c, radial(c, x - 3, y - 3, 12, [[0, COL.brassHi], [0.7, COL.brass], [1, COL.brassLo]]), () => c.arc(x, y, 10.5, 0, Math.PI * 2), 1.5);
        fillPath(c, COL.copper, () => c.arc(x, y, 3.5, 0, Math.PI * 2), 1);
      }
    for (const x of [10, 96]) fillPath(c, '#6a4428', () => poly(c, [x - 8, 104, x + 8, 104, x, 86]), 1.5);
  }],
  hoist: [110, 170, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(55, 164, 50, 6, 0, 0, Math.PI * 2), 0);
    lines(c, COL.iron, 7, [[20, 164, 55, 14, 90, 164]]);
    lines(c, COL.ironHi, 2, [[34, 104, 76, 104]]);
    fillPath(c, COL.brass, () => c.arc(55, 18, 9, 0, Math.PI * 2), 2);
    lines(c, '#5a524a', 2, [[55, 18, 55, 92], [60, 18, 60, 70]]);
    fillPath(c, COL.ironHi, () => c.roundRect(46, 90, 18, 10, 3), 1.5);
    lines(c, COL.ironHi, 3, [[55, 100, 55, 108]]);
    c.save();
    c.translate(55, 140);
    c.rotate(0.06);
    shell(c, 0, 26, 46, 16);
    c.restore();
    fillPath(c, '#5a524a', () => c.rect(54, 106, 2, 14), 0);
  }],
  // The pressure boilers: wood is the only fuel that grows back.
  woodpile: [140, 100, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(70, 94, 66, 6, 0, 0, Math.PI * 2), 0);
    for (const x of [10, 130]) fillPath(c, '#4a3a28', () => c.rect(x - 4, 20, 8, 74), 1.5);
    const r = seeded(91);
    for (let row = 0; row < 4; row++)
      for (let i = 0; i < 6; i++) {
        const x = 22 + i * 19 + (row % 2) * 6, y = 82 - row * 18, rr = 8 + r() * 2;
        fillPath(c, '#8a5a30', () => c.arc(x, y, rr, 0, Math.PI * 2), 1.5, '#3a2214');
        fillPath(c, '#c8a070', () => c.arc(x, y, rr - 3, 0, Math.PI * 2), 0);
        c.strokeStyle = 'rgba(90,60,30,0.6)';
        c.lineWidth = 0.8;
        c.beginPath();
        c.arc(x, y, rr - 6, 0, Math.PI * 2);
        c.stroke();
      }
    // An axe in the top log.
    lines(c, '#6a4428', 4, [[118, 26, 96, 6]]);
    fillPath(c, '#8a8a90', () => poly(c, [112, 20, 124, 14, 128, 28, 118, 32]), 1.5);
  }],
  valve: [100, 120, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(50, 114, 46, 6, 0, 0, Math.PI * 2), 0);
    // Pipes rising out of the deck, a big valve wheel, a gauge.
    fillPath(c, grad(c, 14, 0, 34, 0, [[0, COL.rust2], [0.5, COL.copperHi], [1, COL.rust2]]), () => c.rect(14, 30, 20, 84), 2);
    fillPath(c, grad(c, 0, 50, 0, 70, [[0, COL.rust2], [0.5, COL.copperHi], [1, COL.rust2]]), () => c.rect(24, 50, 66, 20), 2);
    fillPath(c, grad(c, 70, 0, 90, 0, [[0, COL.rust2], [0.5, COL.copperHi], [1, COL.rust2]]), () => c.rect(70, 60, 20, 54), 2);
    for (const [x, y, w, h] of [[10, 106, 28, 8], [66, 106, 28, 8], [10, 30, 28, 8]]) fillPath(c, COL.brass, () => c.rect(x, y, w, h), 1.5);
    fillPath(c, COL.red, () => c.arc(56, 42, 22, 0, Math.PI * 2), 0);
    fillPath(c, COL.soot, () => c.arc(56, 42, 17, 0, Math.PI * 2), 0);
    c.strokeStyle = '#c03a2a';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(56, 42, 19, 0, Math.PI * 2);
    c.stroke();
    lines(c, '#c03a2a', 3, [[56, 25, 56, 59], [39, 42, 73, 42]]);
    fillPath(c, COL.brass, () => c.arc(56, 42, 5, 0, Math.PI * 2), 1.5);
    lines(c, COL.brassLo, 4, [[56, 62, 56, 54]]);
    gauge(c, 24, 18, 12, -0.3);
  }],
  // The rangefinder mast.
  signal: [80, 160, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(40, 154, 34, 6, 0, 0, Math.PI * 2), 0);
    lines(c, COL.iron, 6, [[40, 150, 40, 60]]);
    fillPath(c, COL.ironHi, () => poly(c, [20, 154, 60, 154, 50, 140, 30, 140]), 2);
    fillPath(c, COL.brass, () => c.roundRect(14, 22, 52, 42, 6), 2);
    fillPath(c, radial(c, 40, 43, 22, [[0, '#fff6d0'], [0.5, COL.amber], [1, '#a06a10']]), () => c.arc(40, 43, 16, 0, Math.PI * 2), 2);
    lines(c, COL.brassLo, 3, [[18, 22, 18, 64], [62, 22, 62, 64]]);
    for (let i = 0; i < 4; i++) lines(c, COL.soot, 1.5, [[24, 30 + i * 9, 56, 30 + i * 9]]); // the shutter slats
    fillPath(c, COL.iron, () => c.roundRect(20, 12, 40, 12, 4), 1.5);
    lines(c, '#6a4428', 3, [[62, 50, 74, 76]]);
    fillPath(c, '#2a1a12', () => c.arc(74, 78, 4, 0, Math.PI * 2), 1);
  }],
  spool: [120, 100, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(60, 94, 56, 6, 0, 0, Math.PI * 2), 0);
    // A cable drum on its side: two flanges, wound cable, the loose end trailing off.
    fillPath(c, '#7a5232', () => c.ellipse(26, 54, 16, 38, 0, 0, Math.PI * 2), 2);
    fillPath(c, grad(c, 0, 24, 0, 84, [[0, '#2a2622'], [0.5, '#5a524a'], [1, '#1d1a17']]), () => c.rect(26, 24, 66, 60), 1.5);
    const segs: number[][] = [];
    for (let x = 30; x < 92; x += 5) segs.push([x, 24, x + 3, 84]);
    lines(c, 'rgba(0,0,0,0.4)', 1, segs);
    fillPath(c, '#8a5a3a', () => c.ellipse(92, 54, 16, 38, 0, 0, Math.PI * 2), 2);
    fillPath(c, '#5a3a20', () => c.ellipse(92, 54, 6, 14, 0, 0, Math.PI * 2), 1.5);
    c.strokeStyle = '#2a2622';
    c.lineWidth = 3.5;
    c.beginPath();
    c.moveTo(60, 84);
    c.bezierCurveTo(70, 100, 100, 82, 118, 96);
    c.stroke();
  }],
  // Hob's forge.
  anvil: [100, 110, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(50, 104, 44, 6, 0, 0, Math.PI * 2), 0);
    // A stump, an anvil with a horn, a hammer leaning, a cooling bar.
    fillPath(c, grad(c, 26, 0, 74, 0, [[0, '#4a2c16'], [0.5, '#8a5a30'], [1, '#4a2c16']]), () => c.roundRect(26, 66, 48, 40, 5), 2);
    c.strokeStyle = 'rgba(30,16,8,0.5)';
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(50, 66, 24, 6, 0, 0, Math.PI * 2);
    c.stroke();
    fillPath(c, grad(c, 0, 40, 0, 68, [[0, '#8a8a92'], [1, '#3a3a40']]), () => poly(c, [14, 46, 80, 46, 76, 54, 62, 58, 64, 68, 36, 68, 38, 58, 24, 54]), 2);
    fillPath(c, '#8a8a92', () => poly(c, [80, 46, 98, 50, 80, 55]), 1.5);
    lines(c, COL.ironHi, 1.4, [[20, 49, 76, 49]]);
    lines(c, '#6a4428', 4, [[68, 100, 90, 60]]);
    fillPath(c, COL.iron, () => c.roundRect(82, 52, 18, 10, 2), 1.5);
    fillPath(c, '#ff8a30', () => c.roundRect(30, 40, 22, 5, 2), 1);
  }],
  barrelrack: [110, 150, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(55, 144, 50, 6, 0, 0, Math.PI * 2), 0);
    // A frame holding five gun barrels upright, brass bands, one bored through (a light shows).
    for (const y of [40, 120]) fillPath(c, '#6a4428', () => c.rect(8, y, 94, 10), 2);
    for (const x of [12, 98]) fillPath(c, '#5a3a20', () => c.rect(x - 5, 20, 10, 126), 2);
    for (const [i, x] of [20, 36, 52, 68, 84].entries()) {
      fillPath(c, grad(c, x - 5, 0, x + 5, 0, [[0, '#4a4a50'], [0.5, '#a0a0a8'], [1, '#4a4a50']]), () => c.roundRect(x - 5, 8 + (i % 2) * 8, 10, 132 - (i % 2) * 8, 3), 1.6);
      fillPath(c, COL.brass, () => c.rect(x - 6, 62 + (i % 3) * 8, 12, 4), 1);
      fillPath(c, COL.soot, () => c.ellipse(x, 9 + (i % 2) * 8, 3.4, 1.8, 0, 0, Math.PI * 2), 0);
    }
  }],
  trough: [120, 80, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(60, 74, 56, 6, 0, 0, Math.PI * 2), 0);
    // The quenching trough: an iron-bound tub of black water, steam rising, tongs on the rim.
    fillPath(c, grad(c, 8, 0, 112, 0, [[0, '#4a2c16'], [0.5, '#8a5a30'], [1, '#4a2c16']]), () => c.roundRect(8, 30, 104, 40, 8), 2.2);
    for (const x of [26, 94]) fillPath(c, COL.ironHi, () => c.rect(x, 30, 5, 40), 1.2);
    fillPath(c, '#1a2830', () => c.ellipse(60, 32, 50, 8, 0, 0, Math.PI * 2), 2);
    fillPath(c, 'rgba(120,160,180,0.35)', () => c.ellipse(52, 31, 24, 3, 0, 0, Math.PI * 2), 0);
    puff(c, 'rgba(244,239,230,0.55)', [[44, 18, 7], [54, 8, 9], [66, 0, 7]]);
    lines(c, COL.ironHi, 3, [[92, 34, 112, 18], [96, 36, 116, 24]]);
  }],
  // Dr. Gasket's clinic.
  limbs: [110, 150, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(55, 144, 50, 6, 0, 0, Math.PI * 2), 0);
    // A rack of spare limbs on hooks: two arms with claw hands, a leg with a piston, a hanging foot.
    for (const x of [10, 100]) fillPath(c, '#5a3a20', () => c.rect(x - 4, 14, 8, 130), 2);
    fillPath(c, '#6a4428', () => c.rect(6, 12, 98, 9), 2);
    for (const x of [28, 56, 84]) lines(c, COL.iron, 2, [[x, 21, x, 32]]);
    for (const x of [28, 56]) {
      fillPath(c, grad(c, x - 6, 0, x + 6, 0, [[0, COL.copper], [0.5, COL.copperHi], [1, COL.copper]]), () => c.roundRect(x - 6, 32, 12, 54, 5), 1.8);
      fillPath(c, COL.brass, () => c.arc(x, 56, 6, 0, Math.PI * 2), 1.4);
      lines(c, COL.iron, 3, [[x - 6, 90, x - 8, 108], [x, 90, x, 110], [x + 6, 90, x + 8, 108]]);
      fillPath(c, COL.ironHi, () => c.roundRect(x - 8, 84, 16, 8, 3), 1.4);
    }
    fillPath(c, grad(c, 78, 0, 90, 0, [[0, COL.ironHi], [0.5, '#a0a0a8'], [1, COL.ironHi]]), () => c.roundRect(78, 32, 12, 64, 4), 1.8);
    fillPath(c, COL.brass, () => c.rect(76, 60, 16, 5), 1.2);
    fillPath(c, COL.iron, () => c.roundRect(72, 96, 24, 12, 4), 1.8);
    lines(c, '#3a8a7a', 3, [[10, 128, 100, 128]]);
  }],
  trolley: [100, 110, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(50, 104, 44, 6, 0, 0, Math.PI * 2), 0);
    // An instrument trolley on casters: a steel tray with a saw, a scalpel, a bottle and a folded cloth; a drawer below.
    for (const x of [18, 82]) lines(c, COL.ironHi, 4, [[x, 56, x, 96]]);
    for (const x of [18, 82]) fillPath(c, COL.soot, () => c.arc(x, 98, 5, 0, Math.PI * 2), 1.4);
    fillPath(c, '#c8ccd0', () => c.roundRect(8, 54, 84, 6, 2), 1.8);
    fillPath(c, '#8a949e', () => c.roundRect(12, 70, 76, 14, 2), 1.8);
    fillPath(c, COL.brass, () => c.rect(44, 75, 12, 3), 1);
    fillPath(c, '#e8e4da', () => c.roundRect(10, 34, 80, 20, 3), 1.8);
    lines(c, '#e8e4da', 2, [[14, 34, 14, 54]]);
    fillPath(c, '#cfd8dc', () => poly(c, [18, 46, 40, 40, 42, 44, 20, 50]), 1.2);
    lines(c, COL.iron, 1.5, [[26, 46, 34, 44]]);
    fillPath(c, 'rgba(120,200,190,0.7)', () => c.roundRect(52, 22, 10, 22, 3), 1.4);
    fillPath(c, '#e8dcc0', () => c.roundRect(66, 38, 18, 12, 3), 1.2);
    fillPath(c, '#3a8a7a', () => c.rect(66, 44, 18, 3), 0);
    fillPath(c, COL.amber, () => c.arc(82, 28, 5, 0, Math.PI * 2), 1.2);
  }],
  jar: [70, 130, (c) => {
    fillPath(c, 'rgba(0,0,0,0.35)', () => c.ellipse(35, 124, 32, 6, 0, 0, Math.PI * 2), 0);
    // A tall bell jar on a plinth holding a Gasket heart in amber oil, a hose out the top, a little gauge.
    fillPath(c, '#5a5a62', () => c.roundRect(8, 100, 54, 22, 4), 2);
    fillPath(c, COL.brass, () => c.rect(10, 96, 50, 6), 1.5);
    fillPath(c, 'rgba(180,225,230,0.5)', () => c.roundRect(14, 24, 42, 74, [18, 18, 3, 3]), 2);
    fillPath(c, 'rgba(255,170,60,0.4)', () => c.roundRect(16, 52, 38, 44, 3), 0);
    fillPath(c, radial(c, 35, 74, 18, [[0, '#ff6a40'], [1, '#a02a1e']]), () => c.ellipse(35, 74, 12, 15, 0, 0, Math.PI * 2), 1.5);
    lines(c, '#a02a1e', 3, [[35, 60, 35, 48]]);
    fillPath(c, COL.brass, () => c.roundRect(24, 14, 22, 12, 3), 1.8);
    lines(c, COL.iron, 4, [[35, 14, 35, 6, 56, 2]]);
    gauge(c, 60, 82, 7, -0.4);
  }],
};

/** Room round every prop's drawing (left, right and above; the feet stay at the bottom), so a telescope tube or a staff that pokes past its box is not cut off. */
const PROP_PAD = 32;
/** A station's prop texture. */
export function propTex(scene: Phaser.Scene, kind: PropKind) {
  const [w, h, draw] = PROP_ART[kind];
  return texH(scene, `lot-prop-padded-${kind}`, w + PROP_PAD * 2, h + PROP_PAD, (c) => {
    c.translate(PROP_PAD, PROP_PAD);
    draw(c);
  }, PROP_SCALE);
}
