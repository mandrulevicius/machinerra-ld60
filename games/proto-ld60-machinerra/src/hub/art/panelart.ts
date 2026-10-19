/**
 * The pictures in the hub's panels, drawn on DOM canvases: the world map (`drawWorldMap`, the course table) and the city
 * view (`drawCity`, the window).
 */
import { COL } from '../../art';
import type { BuildingId } from '../buildings';
import { CITY_STAGES } from '../state';
import { fillPath, grad, hash, seeded } from './draw';
import { zeppelinShape } from './zeppelin';
import { drawDistrict, type DistrictView } from './districtart';

// ---------------------------------------------------------------- panel pictures (DOM canvases)

/** The command table's world map: sands, mesas, the zeppelin, a dashed course to the next landing. */
export function drawWorldMap(cv: HTMLCanvasElement, seed: number, missions: number) {
  const c = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  c.fillStyle = grad(c, 0, 0, 0, H, [[0, '#d8b880'], [1, '#c09060']]);
  c.fillRect(0, 0, W, H);
  // Mesas and dune fields from value noise.
  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  const vn = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const s = (t: number) => t * t * (3 - 2 * t);
    const a = hash(ix, iy), b = hash(ix + 1, iy), cc = hash(ix, iy + 1), dd = hash(ix + 1, iy + 1);
    return a + (b - a) * s(fx) + (cc - a) * s(fy) + (a - b - cc + dd) * s(fx) * s(fy);
  };
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2) {
      const n = vn(x / 60, y / 60) * 0.65 + vn(x / 17, y / 17) * 0.35;
      let k = 1;
      if (n > 0.68) k = 0.62;
      else if (n > 0.64) k = 0.45;
      else if (n < 0.3) k = 1.08;
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = ((y + oy) * W + x + ox) * 4;
        d[i] *= k;
        d[i + 1] *= k * (k < 1 ? 0.92 : 1);
        d[i + 2] *= k * (k < 1 ? 0.85 : 1);
      }
    }
  c.putImageData(img, 0, 0);
  // Grid and border, like a navigator's chart.
  c.strokeStyle = 'rgba(60,40,20,0.25)';
  c.lineWidth = 1;
  for (let x = 0; x < W; x += 50) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, H);
    c.stroke();
  }
  for (let y = 0; y < H; y += 50) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  // Past landings, then where the zeppelin is and where it goes.
  const r = seeded(1 + missions);
  const here = { x: W * 0.3, y: H * 0.55 };
  for (let i = 0; i < Math.min(missions, 8); i++) {
    const x = 40 + r() * (W - 80), y = 40 + r() * (H - 80);
    c.strokeStyle = 'rgba(60,40,20,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x - 5, y - 5);
    c.lineTo(x + 5, y + 5);
    c.moveTo(x + 5, y - 5);
    c.lineTo(x - 5, y + 5);
    c.stroke();
  }
  const rt = seeded(seed);
  const to = { x: W * (0.55 + rt() * 0.35), y: H * (0.2 + rt() * 0.6) };
  c.strokeStyle = '#2a8fa0';
  c.lineWidth = 3;
  c.setLineDash([10, 7]);
  c.beginPath();
  c.moveTo(here.x, here.y);
  c.quadraticCurveTo((here.x + to.x) / 2, Math.min(here.y, to.y) - 60, to.x, to.y);
  c.stroke();
  c.setLineDash([]);
  fillPath(c, '#2a8fa0', () => c.arc(to.x, to.y, 9, 0, Math.PI * 2), 2, '#0a2a30');
  c.font = '700 15px "Barlow Semi Condensed", sans-serif';
  c.fillStyle = '#2a1a0a';
  c.textAlign = 'center';
  c.fillText(`Landing ${seed}`, to.x, to.y - 16);
  // The zeppelin, small.
  c.save();
  c.translate(here.x, here.y);
  c.scale(0.09, 0.09);
  c.translate(-450, -210);
  zeppelinShape(c);
  c.restore();
  c.strokeStyle = '#2a1a0a';
  c.lineWidth = 6;
  c.strokeRect(3, 3, W - 6, H - 6);
}

/** What the window shows of the city's building: the slots in all, the buildings (standing or going up as scaffolding) in the order of the slots, and the civilians walking about. */
export interface CityView { slots: number; buildings: { id: BuildingId; done: boolean }[]; civilians: number; /** The catsplosion (the Replicator and the cat): cats on the roofs. */ cats?: boolean; /** The Rising District's stages (P55 B), hung above the building row. */ district?: DistrictView }

/** Each building's box (px, drawn at the window's 720x380) and its silhouette: filled in the dark, lit by a few amber windows. */
const SHAPES: Record<BuildingId, { w: number; h: number; paint: (c: CanvasRenderingContext2D) => void }> = {
  foundry: {
    w: 84, h: 70,
    paint: (c) => {
      c.fillRect(-38, -40, 76, 40);
      c.fillRect(18, -70, 12, 32);
      c.fillRect(-30, -46, 16, 8);
      c.fillStyle = COL.amber;
      c.fillRect(-24, -26, 18, 12);
      c.fillStyle = 'rgba(200,190,180,0.25)';
      c.beginPath();
      c.ellipse(26, -78, 12, 7, 0, 0, Math.PI * 2);
      c.fill();
    },
  },
  cathedral: {
    w: 86, h: 80,
    paint: (c) => {
      c.fillRect(-38, -46, 30, 46);
      c.fillRect(6, -54, 32, 54);
      for (const [x, w, y] of [[-23, 15, -46], [22, 16, -54]]) {
        c.beginPath();
        c.arc(x, y, w, Math.PI, 0);
        c.fill();
      }
      c.fillRect(-8, -30, 14, 5);
      c.fillStyle = COL.amber;
      for (let i = 0; i < 3; i++) c.fillRect(-32 + i * 9, -34, 4, 9);
      for (let i = 0; i < 3; i++) c.fillRect(14 + i * 9, -42, 4, 9);
    },
  },
  aviary: {
    w: 80, h: 70,
    paint: (c) => {
      c.beginPath();
      c.arc(0, -4, 36, Math.PI, 0);
      c.fill();
      c.fillRect(-36, -6, 72, 6);
      c.strokeStyle = COL.amber;
      c.lineWidth = 1;
      for (const x of [-20, 0, 20]) {
        c.beginPath();
        c.moveTo(x, -6);
        c.lineTo(x * 0.5, -38);
        c.stroke();
      }
      c.strokeStyle = '#fff3c4';
      for (const [x, y] of [[-12, -18], [10, -26], [24, -14]]) {
        c.beginPath();
        c.moveTo(x - 4, y);
        c.lineTo(x, y + 3);
        c.lineTo(x + 4, y);
        c.stroke();
      }
    },
  },
  aqueducts: {
    w: 100, h: 56,
    paint: (c) => {
      c.fillRect(-50, -56, 100, 9);
      for (let i = 0; i < 4; i++) c.fillRect(-48 + i * 32, -48, 12, 48);
      c.fillStyle = '#4fa0c0';
      c.fillRect(-50, -61, 100, 5);
    },
  },
  spire: {
    w: 44, h: 100,
    paint: (c) => {
      c.beginPath();
      c.moveTo(-9, 0);
      c.lineTo(0, -92);
      c.lineTo(9, 0);
      c.fill();
      c.fillRect(-18, -8, 36, 8);
      c.fillStyle = COL.amber;
      c.beginPath();
      c.arc(0, -96, 4, 0, Math.PI * 2);
      c.fill();
    },
  },
  scrapyard: {
    w: 90, h: 44,
    paint: (c) => {
      c.beginPath();
      c.moveTo(-44, 0);
      c.lineTo(-26, -22);
      c.lineTo(-8, -14);
      c.lineTo(6, -42);
      c.lineTo(22, -20);
      c.lineTo(44, 0);
      c.fill();
      c.strokeStyle = COL.rust;
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-20, -8);
      c.lineTo(-6, -22);
      c.moveTo(10, -10);
      c.lineTo(24, -4);
      c.stroke();
    },
  },
  curfew: {
    w: 40, h: 84,
    paint: (c) => {
      c.fillRect(-14, -66, 28, 66);
      c.beginPath();
      c.moveTo(-18, -66);
      c.lineTo(0, -84);
      c.lineTo(18, -66);
      c.fill();
      c.fillStyle = COL.amber;
      c.beginPath();
      c.arc(0, -50, 7, Math.PI, 0);
      c.lineTo(8, -44);
      c.lineTo(-8, -44);
      c.fill();
    },
  },
  // P42's two: the Replicator (a copier's hopper and a roller) and the Greenhouse (a glass house).
  replicator: {
    w: 74, h: 62,
    paint: (c) => {
      c.fillRect(-34, -40, 68, 40);
      c.beginPath();
      c.moveTo(-26, -40);
      c.lineTo(-14, -62);
      c.lineTo(14, -62);
      c.lineTo(26, -40);
      c.fill();
      c.fillStyle = COL.amber;
      c.fillRect(-22, -30, 14, 10);
      c.fillRect(8, -30, 14, 10);
      c.fillRect(-4, -54, 8, 6);
    },
  },
  greenhouse: {
    w: 70, h: 56,
    paint: (c) => {
      c.fillRect(-32, -26, 64, 26);
      c.beginPath();
      c.moveTo(-36, -26);
      c.lineTo(-18, -56);
      c.lineTo(18, -56);
      c.lineTo(36, -26);
      c.fill();
      c.strokeStyle = '#8ad88a';
      c.lineWidth = 2;
      c.beginPath();
      for (const x of [-18, 0, 18]) {
        c.moveTo(x, -4);
        c.lineTo(x, -22);
      }
      c.stroke();
      c.fillStyle = '#8ad88a';
      c.fillRect(-2, -30, 4, 8);
    },
  },
  tram: {
    w: 84, h: 52,
    paint: (c) => {
      // A station hall with a rail running out of it and a car on the rail.
      c.fillRect(-38, -30, 44, 30);
      c.beginPath();
      c.moveTo(-42, -30);
      c.lineTo(-16, -44);
      c.lineTo(10, -30);
      c.fill();
      c.fillRect(6, -8, 38, 4);
      c.fillRect(14, -20, 22, 14);
      c.fillStyle = COL.amber;
      for (let i = 0; i < 3; i++) c.fillRect(17 + i * 7, -17, 4, 6);
      c.fillRect(-30, -22, 10, 12);
    },
  },
  lampFoundry: {
    w: 80, h: 76,
    paint: (c) => {
      // A casting hall with a chimney, and a row of lamps on posts along its roof, burning.
      c.fillRect(-36, -34, 72, 34);
      c.fillRect(-30, -76, 10, 44);
      for (const x of [-8, 8, 24]) c.fillRect(x - 1, -48, 2, 16);
      c.fillStyle = COL.amber;
      for (const x of [-8, 8, 24]) {
        c.beginPath();
        c.arc(x, -51, 5, 0, Math.PI * 2);
        c.fill();
      }
      c.fillRect(-28, -22, 14, 10);
      c.fillStyle = 'rgba(200,190,180,0.25)';
      c.beginPath();
      c.ellipse(-25, -82, 10, 6, 0, 0, Math.PI * 2);
      c.fill();
    },
  },
  grandAqueduct: {
    w: 132, h: 90,
    paint: (c) => {
      // Two tiers of arches carrying a long channel, the water lit blue along the top.
      c.fillRect(-66, -84, 132, 10);
      for (const [y, h] of [[-74, 34], [-40, 40]]) {
        c.fillRect(-66, y, 132, 6);
        for (let i = 0; i < 6; i++) c.fillRect(-64 + i * 24, y, 10, h);
      }
      c.fillStyle = '#4fa0c0';
      c.fillRect(-66, -90, 132, 6);
    },
  },
  reliquary: {
    w: 80, h: 58,
    paint: (c) => {
      c.fillRect(-36, -48, 72, 48);
      c.beginPath();
      c.moveTo(-42, -48);
      c.lineTo(0, -58);
      c.lineTo(42, -48);
      c.fill();
      c.strokeStyle = COL.amber;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, -24, 12, 0, Math.PI * 2);
      c.moveTo(-12, -24);
      c.lineTo(12, -24);
      c.moveTo(0, -36);
      c.lineTo(0, -12);
      c.stroke();
    },
  },
};

/** The catsplosion: a cat on a roof, a small dark shape with two ears and a tail (the window is dark, so it needs a warm rim to read). */
function drawRoofCat(c: CanvasRenderingContext2D, x: number, y: number) {
  c.save();
  c.translate(x, y);
  c.fillStyle = '#3a2a30';
  c.shadowColor = 'rgba(255,190,110,0.9)';
  c.shadowBlur = 4;
  c.beginPath();
  c.ellipse(0, -4, 5, 4, 0, 0, Math.PI * 2);
  c.moveTo(3, -7);
  c.lineTo(4, -12);
  c.lineTo(7, -8);
  c.moveTo(-1, -7);
  c.lineTo(0, -12);
  c.lineTo(3, -8);
  c.fill();
  c.strokeStyle = '#3a2a30';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(-5, -4);
  c.quadraticCurveTo(-10, -4, -9, -11);
  c.stroke();
  c.restore();
}

/** A building at `x` on the gantry's line `y`: the dark silhouette, or, going up, a faint one inside a scaffold of poles, braces and rails with a crane and a few sparks. */
export function drawBuilding(c: CanvasRenderingContext2D, id: BuildingId, x: number, y: number, done: boolean) {
  const S = SHAPES[id];
  c.save();
  c.translate(x, y);
  // A warm rim of the city's own lights, so the dark silhouette reads against the sky.
  c.fillStyle = '#241a2c';
  c.shadowColor = 'rgba(255,170,90,0.8)';
  c.shadowBlur = done ? 8 : 3;
  c.globalAlpha = done ? 1 : 0.3;
  S.paint(c);
  c.globalAlpha = 1;
  c.shadowBlur = 0;
  if (!done) {
    const w = S.w, h = S.h;
    c.strokeStyle = 'rgba(232,206,150,0.8)';
    c.lineWidth = 1.5;
    c.beginPath();
    for (const px of [-w / 2, w / 2]) {
      c.moveTo(px, 0);
      c.lineTo(px, -h);
    }
    for (let ry = -16; ry > -h; ry -= 16) {
      c.moveTo(-w / 2, ry);
      c.lineTo(w / 2, ry);
    }
    for (let ry = 0, k = 0; ry > -h + 16; ry -= 16, k++) {
      c.moveTo(k % 2 ? w / 2 : -w / 2, ry);
      c.lineTo(k % 2 ? -w / 2 : w / 2, ry - 16);
    }
    c.stroke();
    // A crane over the top and a hanging load.
    c.strokeStyle = COL.brass;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(w / 2 - 4, -h);
    c.lineTo(w / 2 - 4, -h - 18);
    c.lineTo(-w / 4, -h - 18);
    c.moveTo(-w / 4, -h - 18);
    c.lineTo(-w / 4, -h - 4);
    c.stroke();
    c.fillStyle = COL.amber;
    for (const [sx, sy] of [[-w / 3, -h * 0.4], [w / 4, -h * 0.7], [w / 6, -h * 0.2]]) c.fillRect(sx, sy, 3, 3);
  }
  c.restore();
}

/**
 * The building row hung under the city: a gantry across the window with a post for each slot, the buildings on their slots (the ones
 * going up as scaffolding) and the civilians (the Lost Expedition's husks brought home) walking it.
 */
function drawGantry(c: CanvasRenderingContext2D, W: number, H: number, v: CityView) {
  const y = Math.round(H * 0.8);
  c.strokeStyle = 'rgba(42,34,48,0.9)';
  c.lineWidth = 2;
  for (const x of [W * 0.12, W * 0.5, W * 0.88]) {
    c.beginPath();
    c.moveTo(x, y + 4);
    c.lineTo(x + (x < W / 2 ? -10 : 10), 0);
    c.stroke();
  }
  c.fillStyle = '#2a2230';
  c.fillRect(14, y, W - 28, 9);
  c.fillStyle = COL.brassLo;
  c.fillRect(14, y, W - 28, 2);
  const at = (i: number) => (W * (i + 0.5)) / v.slots;
  for (let i = 0; i < v.slots; i++) {
    if (v.buildings[i]) {
      drawBuilding(c, v.buildings[i].id, at(i), y, v.buildings[i].done);
      if (v.cats && v.buildings[i].done) drawRoofCat(c, at(i) + ((i * 17) % 13) - 6, y - SHAPES[v.buildings[i].id].h);
    }
    else {
      c.fillStyle = '#1a1420';
      c.fillRect(at(i) - 2, y - 14, 4, 14);
      c.fillStyle = 'rgba(255,182,64,0.5)';
      c.fillRect(at(i) - 3, y - 18, 6, 4);
    }
  }
  // Civilians: little brass bots, a few to the row, always the same places for the same number.
  const r = seeded(77);
  for (let i = 0; i < Math.min(v.civilians, 14); i++) {
    const x = 24 + r() * (W - 48);
    c.fillStyle = COL.brass;
    c.fillRect(x - 3, y - 13, 6, 13);
    c.beginPath();
    c.arc(x, y - 16, 3.6, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff3c4';
    c.fillRect(x - 1.5, y - 17, 3, 1.5);
  }
}

/** The view out of the D-city window at a stage (CITY_STAGES): empty sky, or decks and lights hung from balloons; with a `view`, the building row. */
export function drawCity(cv: HTMLCanvasElement, stage: number, view?: CityView) {
  const c = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  c.fillStyle = grad(c, 0, 0, 0, H, [[0, '#121628'], [0.55, '#3a2840'], [0.85, '#a04a30'], [1, '#e08a40']]);
  c.fillRect(0, 0, W, H);
  const r = seeded(5);
  for (let i = 0; i < 60; i++) {
    c.fillStyle = `rgba(255,240,220,${0.2 + r() * 0.5})`;
    c.fillRect(r() * W, r() * H * 0.5, 1.5, 1.5);
  }
  // Clouds far below.
  for (let i = 0; i < 6; i++) {
    c.fillStyle = 'rgba(240,160,110,0.18)';
    c.beginPath();
    c.ellipse(r() * W, H * 0.86 + r() * 40, 120 + r() * 120, 18, 0, 0, Math.PI * 2);
    c.fill();
  }
  // The underside of the zeppelin's own deck frames the view (we look out from the command deck at the bottom).
  const build = (n: number, rs: () => number) => {
    for (let i = 0; i < n; i++) {
      // With the building row below (`view`), the hanging decks keep to the upper sky.
      const x = 40 + rs() * (W - 80), y = 60 + rs() * (H * (view ? 0.28 : 0.5)), s = 0.5 + rs() * 0.9;
      const bw = 70 * s, bh = 40 * s;
      // Balloon over a little deck with buildings and lit windows.
      c.fillStyle = grad(c, 0, y - bh * 1.65, 0, y - bh * 0.55, [[0, '#6a5260'], [1, '#2e2434']]);
      c.beginPath();
      c.ellipse(x, y - bh * 1.1, bw * 0.7, bh * 0.55, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(255,170,90,0.35)';
      c.lineWidth = 1.5;
      c.stroke();
      c.strokeStyle = '#2a2230';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x - bw * 0.4, y - bh * 0.7);
      c.lineTo(x - bw * 0.45, y);
      c.moveTo(x + bw * 0.4, y - bh * 0.7);
      c.lineTo(x + bw * 0.45, y);
      c.stroke();
      c.fillStyle = '#1a1420';
      c.fillRect(x - bw / 2, y, bw, 6 * s);
      for (let b = 0; b < 4; b++) {
        const bx = x - bw / 2 + b * (bw / 4) + 2, bhh = (10 + rs() * 22) * s;
        c.fillStyle = '#1e1824';
        c.fillRect(bx, y - bhh, bw / 4 - 4, bhh);
        for (let k = 0; k < 3; k++)
          if (rs() < 0.75) {
            c.fillStyle = rs() < 0.8 ? COL.amber : '#fff3c4';
            c.fillRect(bx + 3 + rs() * (bw / 4 - 10), y - bhh + 3 + rs() * (bhh - 6), 2.5 * s + 1, 3 * s + 1);
          }
      }
      if (rs() < 0.5) {
        c.fillStyle = 'rgba(200,190,180,0.2)';
        c.beginPath();
        c.ellipse(x + bw * 0.3, y - bh * 0.9 - 20 * s, 16 * s, 8 * s, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  };
  const rs = seeded(17);
  if (stage === 0) {
    // Desolate: mooring lines hanging into nothing, one broken girder.
    c.strokeStyle = 'rgba(200,180,160,0.35)';
    c.lineWidth = 2;
    for (const x of [W * 0.2, W * 0.45, W * 0.8]) {
      c.beginPath();
      c.moveTo(x, 0);
      c.quadraticCurveTo(x + 20, H * 0.3, x - 10, H * 0.55);
      c.stroke();
    }
    c.fillStyle = '#1e1824';
    c.save();
    c.translate(W * 0.62, H * 0.38);
    c.rotate(-0.4);
    c.fillRect(-80, -5, 160, 10);
    c.restore();
  } else build([0, 4, 10, 22][stage], rs);
  if (stage >= 3) {
    // A cathedral of boilers and a tram on the girders.
    c.fillStyle = '#1a1420';
    c.fillRect(W * 0.42, H * 0.22, 90, 120);
    c.beginPath();
    c.arc(W * 0.42 + 45, H * 0.22, 45, Math.PI, 0);
    c.fill();
    c.fillStyle = COL.amber;
    for (let i = 0; i < 5; i++) c.fillRect(W * 0.42 + 12 + i * 15, H * 0.22 + 30, 6, 14);
    c.strokeStyle = '#2a2230';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, H * 0.62);
    c.lineTo(W, H * 0.58);
    c.stroke();
    c.fillStyle = '#fff3c4';
    c.fillRect(W * 0.7, H * 0.585 - 10, 30, 10);
  }
  if (view?.district?.stage || view?.district?.raising) drawDistrict(c, view.district);
  if (view && (view.buildings.length || stage > 0)) drawGantry(c, W, H, view);
  // The window frame: brass mullions.
  c.strokeStyle = COL.brass;
  c.lineWidth = 8;
  c.strokeRect(4, 4, W - 8, H - 8);
  c.lineWidth = 5;
  for (const x of [W / 3, (2 * W) / 3]) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, H);
    c.stroke();
  }
  c.font = '700 18px "Barlow Semi Condensed", sans-serif';
  c.fillStyle = '#f4e2bc';
  c.textAlign = 'left';
  c.fillText(CITY_STAGES[stage].name, 18, H - 18);
}
