/**
 * Gear art, drawn in code (Canvas 2D) until painted art comes: one icon per item (`ICONS`), used by the inventory as an
 * image and by Play as a texture (`gear-<id>`) for what the Communicator wears and swings. Every icon is drawn on a 64 px
 * square, facing right, the business end up-right. Add an item's icon: a line in `ICONS` built from the helpers below.
 */
import type Phaser from 'phaser';
import { itemIds, ITEMS, NIGHT_BASES, type BaseItemId, type ItemId, type NightBase } from './sim/gear';
import type { ModId } from './sim/defs/mods';
import { house, LINE } from './house';

type C = CanvasRenderingContext2D;
const SOOT = '#1d1a17', BRASS = '#c8963c', BRASS_HI = '#f0cf7a', COPPER = '#b8643a', IRON = '#6c6660', IRON_HI = '#a8a098', LEATHER = '#6a4528', GLOSS = '#141418', CYAN = '#3df2ff', RED = '#ff3a3a', STEAM = 'rgba(240,240,240,0.85)', WOOD = '#8a5a2e', GOLD = '#ffd760';

const path = (c: C, pts: number[][], fill: string, close = true) => {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  if (close) c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.stroke();
};
const rect = (c: C, x: number, y: number, w: number, h: number, fill: string, r = 2) => {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fillStyle = fill;
  c.fill();
  c.stroke();
};
const circ = (c: C, x: number, y: number, r: number, fill: string, stroke = true) => {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
  if (stroke) c.stroke();
};
/** A stick from (x0, y0) to (x1, y1) of width w. */
const rod = (c: C, x0: number, y0: number, x1: number, y1: number, w: number, fill: string) => {
  c.save();
  c.lineCap = 'round';
  c.lineWidth = w + 3;
  c.strokeStyle = SOOT;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
  c.lineWidth = w;
  c.strokeStyle = fill;
  c.stroke();
  c.restore();
};
const puff = (c: C, x: number, y: number, r: number) => {
  c.save();
  c.lineWidth = 0;
  c.strokeStyle = 'transparent';
  for (const [dx, dy, k] of [[0, 0, 1], [r * 0.8, -r * 0.3, 0.75], [-r * 0.7, -r * 0.4, 0.7]]) circ(c, x + dx, y + dy, r * k, STEAM, false);
  c.restore();
};
const hornetHead = (c: C, x: number, y: number, s: number) => {
  path(c, [[x - 14 * s, y + 6 * s], [x - 12 * s, y - 8 * s], [x, y - 14 * s], [x + 12 * s, y - 8 * s], [x + 14 * s, y + 6 * s], [x, y + 12 * s]], GLOSS);
  circ(c, x - 6 * s, y - 2 * s, 4 * s, CYAN);
  circ(c, x + 6 * s, y - 2 * s, 4 * s, CYAN);
  circ(c, x, y - 9 * s, 1.6 * s, RED, false);
  rod(c, x - 6 * s, y + 8 * s, x - 9 * s, y + 15 * s, 2, IRON_HI);
  rod(c, x + 6 * s, y + 8 * s, x + 9 * s, y + 15 * s, 2, IRON_HI);
};
const stinger = (c: C, x0: number, y0: number, x1: number, y1: number) => {
  const a = Math.atan2(y1 - y0, x1 - x0), n = a + Math.PI / 2;
  path(c, [[x0 + Math.cos(n) * 4, y0 + Math.sin(n) * 4], [x1, y1], [x0 - Math.cos(n) * 4, y0 - Math.sin(n) * 4]], GLOSS);
  circ(c, x0, y0, 2, CYAN, false);
};
const wing = (c: C, x: number, y: number, flip = 1) => {
  c.save();
  c.globalAlpha = 0.85;
  c.beginPath();
  c.ellipse(x + 10 * flip, y - 4, 13, 6, -0.4 * flip, 0, Math.PI * 2);
  c.fillStyle = 'rgba(160,230,255,0.55)';
  c.fill();
  c.stroke();
  c.restore();
};
const gear = (c: C, x: number, y: number, r: number, fill = BRASS) => {
  c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, rr = i % 2 ? r : r * 0.78;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  c.stroke();
  circ(c, x, y, r * 0.3, SOOT, false);
};
const boot = (c: C, x: number, y: number, fill: string) => {
  path(c, [[x - 8, y - 18], [x + 2, y - 18], [x + 3, y - 4], [x + 14, y], [x + 14, y + 6], [x - 8, y + 6]], fill);
};

const BASE_ICONS: Record<BaseItemId, (c: C) => void> = {
  // The Princess's Main Brush (P58): a roller brush on a brass pole, bristles fanned, a copper hub.
  mainBrush: (c) => {
    rod(c, 8, 58, 40, 24, 5, BRASS);
    c.save();
    c.translate(46, 18);
    c.rotate(-0.8);
    rect(c, -14, -6, 28, 12, COPPER, 5);
    c.lineWidth = 2;
    c.strokeStyle = '#d8cdb8';
    for (let i = -12; i <= 12; i += 3) {
      c.beginPath();
      c.moveTo(i, -6);
      c.lineTo(i + 2, -12);
      c.moveTo(i, 6);
      c.lineTo(i - 2, 12);
      c.stroke();
    }
    c.restore();
    circ(c, 46, 18, 3.5, BRASS_HI);
  },
  // Hob's Old Earful (P52): two bell mouths on a stave stock, an ear trumpet at the breech.
  oldEarful: (c) => {
    rect(c, 8, 34, 30, 10, WOOD, 3);
    for (const y of [22, 32]) {
      rod(c, 22, y + 6, 46, y + 2, 5, BRASS);
      path(c, [[44, y - 3], [58, y - 9], [58, y + 15], [44, y + 9]], BRASS_HI);
    }
    path(c, [[10, 36], [2, 28], [6, 22], [14, 30]], COPPER);
    puff(c, 60, 24, 6);
  },
  // The Ether's ghostly things (P44): cold violet and wisp-blue over brass.
  ectoRepeater: (c) => {
    rect(c, 12, 34, 10, 16, BRASS, 3);
    for (let i = 0; i < 3; i++) rect(c, 18, 22 + i * 7, 34, 6, i % 2 ? '#7a6aa8' : '#9a8ad0', 3);
    for (let i = 0; i < 3; i++) circ(c, 54, 25 + i * 7, 3, 'rgba(160,240,255,0.9)', false);
    circ(c, 26, 30, 6, 'rgba(200,240,255,0.8)');
  },
  ectoGauntlet: (c) => {
    path(c, [[18, 52], [16, 30], [22, 20], [30, 18], [30, 30], [36, 16], [42, 18], [40, 32], [46, 24], [50, 28], [44, 44], [40, 52]], 'rgba(40,24,70,0.9)');
    rect(c, 16, 50, 26, 8, BRASS, 2);
    circ(c, 30, 38, 5, 'rgba(180,140,255,0.8)', false);
  },
  ectoCoating: (c) => {
    rect(c, 18, 22, 26, 30, '#6a7480', 5);
    rod(c, 44, 30, 54, 18, 4, BRASS);
    puff(c, 54, 14, 6);
    circ(c, 31, 37, 7, 'rgba(180,140,255,0.85)', false);
  },
  shadeVent: (c) => {
    rect(c, 14, 24, 22, 22, IRON, 4);
    path(c, [[36, 26], [56, 16], [52, 34], [58, 50], [36, 44]], 'rgba(30,18,56,0.85)');
    circ(c, 25, 35, 5, 'rgba(180,140,255,0.8)', false);
  },
  // The designed dungeons' pieces and mini-boss weapons (sim/gear.ts, dungeons.md).
  hookhand: (c) => {
    rect(c, 8, 34, 24, 12, BRASS, 4);
    gear(c, 18, 40, 7, BRASS_HI);
    c.save();
    c.setLineDash([3, 3]);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(32, 38);
    c.lineTo(46, 22);
    c.stroke();
    c.restore();
    c.save();
    c.lineCap = 'round';
    c.lineWidth = 7;
    c.strokeStyle = SOOT;
    c.beginPath();
    c.arc(50, 22, 8, Math.PI * 0.9, Math.PI * 2.3);
    c.stroke();
    c.lineWidth = 4;
    c.strokeStyle = IRON_HI;
    c.stroke();
    c.restore();
    path(c, [[56, 26], [60, 18], [58, 30]], IRON_HI);
  },
  megaphone: (c) => {
    path(c, [[18, 26], [50, 10], [56, 12], [56, 52], [50, 54], [18, 38]], '#eef2f6');
    rect(c, 10, 26, 10, 12, '#d03030', 2);
    rect(c, 20, 36, 8, 14, GLOSS, 2);
    path(c, [[50, 16], [54, 18], [54, 46], [50, 48]], '#9aa4ae');
    circ(c, 34, 24, 2, CYAN, false);
  },
  hemoFlail: (c) => {
    rod(c, 10, 54, 26, 34, 4, WOOD);
    c.save();
    c.setLineDash([3, 2]);
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(26, 34);
    c.quadraticCurveTo(38, 30, 42, 22);
    c.stroke();
    c.restore();
    rect(c, 38, 8, 12, 22, '#8a7a5a', 3);
    rect(c, 50, 12, 7, 16, '#6a5a3a', 2);
    circ(c, 44, 30, 5, '#b02030');
    rect(c, 12, 40, 4, 10, '#b02030', 1);
  },
  iceLance: (c) => {
    rod(c, 6, 58, 40, 24, 5, '#5a6a7a');
    rect(c, 10, 48, 10, 6, BRASS, 2);
    c.save();
    c.translate(48, 16);
    c.rotate(-Math.PI / 4);
    path(c, [[-6, 10], [0, -14], [6, 10]], '#cfeaff');
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.moveTo(-5 + i * 0.8, 6 - i * 5);
      c.lineTo(5 - i * 0.8, 3 - i * 5);
      c.stroke();
    }
    c.restore();
    puff(c, 56, 8, 4);
  },
  swanGlider: (c) => {
    for (const [x, y, a] of [[32, 34, -0.5], [32, 34, 0.5]] as [number, number, number][]) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      path(c, [[0, 0], [-6, -26], [4, -30], [12, -22], [8, 0]], '#f4f0ea');
      for (let i = 0; i < 3; i++) {
        c.beginPath();
        c.moveTo(2, -6 - i * 7);
        c.lineTo(9, -10 - i * 6);
        c.stroke();
      }
      c.restore();
    }
    rect(c, 22, 32, 20, 12, COPPER, 3);
    rect(c, 26, 44, 12, 8, LEATHER, 2);
  },
  saleSticker: (c) => {
    path(c, [[10, 22], [22, 10], [56, 10], [56, 40], [22, 40]], '#e03a3a');
    circ(c, 20, 25, 3, '#f4efe6');
    c.fillStyle = '#f4efe6';
    c.font = 'bold 15px sans-serif';
    c.fillText('10%', 27, 31);
    rod(c, 20, 25, 12, 50, 1.4, IRON_HI);
  },
  leechGauntlet: (c) => {
    rect(c, 14, 20, 30, 32, BRASS, 6);
    rect(c, 10, 44, 38, 12, LEATHER, 4);
    circ(c, 30, 30, 10, '#5a1018');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      path(c, [[30 + Math.cos(a) * 9, 30 + Math.sin(a) * 9], [30 + Math.cos(a + 0.2) * 5, 30 + Math.sin(a + 0.2) * 5], [30 + Math.cos(a - 0.2) * 5, 30 + Math.sin(a - 0.2) * 5]], '#f4efe6');
    }
    rect(c, 46, 22, 8, 12, COPPER, 2);
  },
  frostPauldrons: (c) => {
    for (const x of [18, 46]) {
      c.save();
      c.beginPath();
      c.ellipse(x, 30, 14, 10, 0, Math.PI, Math.PI * 2);
      c.lineTo(x + 14, 36);
      c.lineTo(x - 14, 36);
      c.closePath();
      c.fillStyle = '#dceefc';
      c.fill();
      c.stroke();
      c.restore();
      for (let i = -1; i <= 1; i++) rod(c, x + i * 6, 22, x + i * 6, 34, 1, '#9fc8e8');
    }
    rect(c, 18, 36, 28, 16, '#5a6a7a', 4);
    puff(c, 32, 14, 5);
  },
  shovel: (c) => {
    rod(c, 14, 50, 40, 24, 4, WOOD);
    path(c, [[38, 16], [52, 12], [50, 26], [44, 32], [34, 28]], IRON_HI);
  },
  steamGun: (c) => {
    rect(c, 10, 30, 40, 8, BRASS, 3);
    rect(c, 46, 28, 8, 12, BRASS_HI, 2);
    rect(c, 14, 36, 8, 14, LEATHER);
    circ(c, 28, 26, 6, COPPER);
    puff(c, 56, 22, 5);
  },
  arcGun: (c) => {
    rect(c, 10, 32, 34, 8, BRASS, 3);
    rect(c, 12, 38, 8, 14, LEATHER);
    for (const x of [20, 32]) {
      rect(c, x - 5, 14, 10, 18, 'rgba(160,230,255,0.55)', 4);
      rect(c, x - 3, 20, 6, 10, COPPER, 1);
    }
    path(c, [[42, 32], [58, 24], [58, 48], [42, 40]], COPPER);
    c.save();
    c.strokeStyle = CYAN;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(20, 12);
    c.lineTo(25, 6);
    c.lineTo(28, 10);
    c.lineTo(32, 4);
    c.stroke();
    c.restore();
  },
  pistonCannon: (c) => {
    rect(c, 8, 26, 44, 14, IRON, 5);
    rect(c, 48, 24, 8, 18, IRON_HI, 2);
    rect(c, 12, 18, 22, 8, BRASS, 2);
    rod(c, 16, 22, 30, 22, 3, BRASS_HI);
    rect(c, 14, 38, 9, 16, WOOD);
    puff(c, 58, 20, 5);
  },
  kettleScalder: (c) => {
    path(c, [[12, 44], [14, 26], [28, 20], [40, 26], [42, 44]], COPPER);
    rod(c, 40, 32, 54, 24, 5, COPPER);
    path(c, [[52, 20], [60, 16], [60, 30]], BRASS);
    rod(c, 20, 20, 36, 20, 3, IRON);
    rect(c, 20, 44, 9, 12, WOOD);
    puff(c, 60, 14, 5);
  },
  censerGun: (c) => {
    rect(c, 10, 32, 40, 7, BRASS, 3);
    rect(c, 12, 37, 8, 14, LEATHER);
    rod(c, 30, 32, 30, 44, 1.5, IRON_HI);
    circ(c, 30, 48, 7, BRASS_HI);
    rect(c, 24, 46, 12, 3, SOOT, 1);
    circ(c, 54, 34, 4, '#ff8a3a', false);
    circ(c, 58, 30, 2.5, GOLD, false);
    puff(c, 32, 58, 4);
  },
  slingshot: (c) => {
    rod(c, 30, 54, 30, 34, 5, IRON);
    rod(c, 30, 34, 18, 14, 4, IRON);
    rod(c, 30, 34, 44, 14, 4, IRON);
    c.save();
    c.strokeStyle = 'rgba(160,230,255,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(18, 14);
    c.quadraticCurveTo(31, 30, 44, 14);
    c.stroke();
    c.restore();
    rect(c, 24, 42, 12, 10, COPPER, 4);
    puff(c, 40, 46, 4);
  },
  hornetSpear: (c) => {
    rod(c, 6, 58, 44, 20, 4, IRON);
    rod(c, 34, 30, 40, 24, 6, COPPER);
    stinger(c, 42, 22, 60, 4);
    stinger(c, 38, 22, 52, 2);
  },
  pipeWrench: (c) => {
    rod(c, 12, 54, 38, 22, 7, '#b83a2a');
    path(c, [[34, 14], [50, 10], [54, 18], [44, 22], [48, 28], [38, 30], [32, 22]], IRON_HI);
  },
  tazer: (c) => {
    rod(c, 12, 52, 44, 20, 8, GLOSS);
    rod(c, 18, 46, 26, 38, 9, '#e8e0c8');
    c.save();
    c.strokeStyle = CYAN;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(44, 20);
    c.lineTo(50, 12);
    c.lineTo(46, 10);
    c.lineTo(56, 2);
    c.stroke();
    c.restore();
    circ(c, 46, 18, 3, CYAN, false);
  },
  rivetScatter: (c) => {
    rect(c, 10, 30, 32, 9, IRON, 3);
    path(c, [[40, 28], [56, 20], [56, 48], [40, 40]], BRASS);
    rect(c, 18, 20, 12, 10, COPPER);
    rect(c, 12, 37, 8, 14, WOOD);
  },
  fangWhip: (c) => {
    c.save();
    c.lineCap = 'round';
    c.lineWidth = 7;
    c.strokeStyle = SOOT;
    c.beginPath();
    c.moveTo(10, 54);
    c.bezierCurveTo(30, 50, 14, 24, 36, 22);
    c.bezierCurveTo(50, 20, 48, 10, 56, 6);
    c.stroke();
    c.lineWidth = 4;
    c.strokeStyle = BRASS;
    c.stroke();
    c.restore();
    for (let i = 0; i < 3; i++) circ(c, 10 + i * 3, 54 - i * 2, 3, BRASS_HI);
    path(c, [[54, 4], [62, 2], [57, 12]], '#f4efe6');
    circ(c, 60, 14, 1.6, '#7cd46a', false);
  },
  hornetHead: (c) => hornetHead(c, 32, 30, 1.6),
  kettleHelm: (c) => {
    path(c, [[14, 44], [16, 24], [32, 16], [48, 24], [50, 44]], COPPER);
    rod(c, 48, 32, 60, 22, 5, COPPER);
    rod(c, 22, 16, 42, 16, 3, IRON);
    puff(c, 60, 16, 5);
  },
  monocle: (c) => {
    circ(c, 28, 30, 14, 'rgba(180,220,255,0.35)');
    c.save();
    c.lineWidth = 4;
    c.strokeStyle = BRASS;
    c.beginPath();
    c.arc(28, 30, 14, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    circ(c, 28, 30, 4, CYAN, false);
    rod(c, 40, 38, 54, 54, 3, BRASS);
  },
  autoTrigger: (c) => {
    rect(c, 12, 22, 40, 22, BRASS, 6);
    for (let i = 0; i < 4; i++) rect(c, 16 + i * 9, 26, 6, 6, i % 2 ? RED : '#5ad06a', 1);
    rect(c, 18, 36, 28, 5, '#e8e0c8', 1);
    gear(c, 50, 18, 8, COPPER);
  },
  pistonFist: (c) => {
    rect(c, 8, 28, 30, 10, IRON);
    rect(c, 36, 30, 10, 6, IRON_HI);
    path(c, [[46, 22], [58, 22], [60, 44], [46, 44]], BRASS);
    puff(c, 12, 22, 5);
  },
  gatlingCuff: (c) => {
    for (let i = 0; i < 3; i++) rect(c, 18, 22 + i * 7, 34, 5, IRON_HI, 2);
    circ(c, 16, 30, 12, BRASS);
    gear(c, 16, 30, 7, COPPER);
  },
  bellowsLungs: (c) => {
    path(c, [[14, 16], [30, 22], [30, 46], [14, 52], [10, 34]], LEATHER);
    path(c, [[50, 16], [34, 22], [34, 46], [50, 52], [54, 34]], LEATHER);
    rod(c, 32, 10, 32, 22, 4, BRASS);
    puff(c, 32, 8, 5);
  },
  boilerCorset: (c) => {
    path(c, [[16, 10], [48, 10], [44, 32], [50, 54], [14, 54], [20, 32]], IRON);
    for (let y = 16; y < 52; y += 8) circ(c, 20 + (y % 16 ? 2 : 0), y, 1.6, BRASS_HI, false);
    for (let y = 16; y < 52; y += 6) rod(c, 30, y, 34, y + 3, 1.5, LEATHER);
  },
  gasketHeart: (c) => {
    circ(c, 32, 32, 20, BRASS);
    circ(c, 32, 32, 13, '#1a120c');
    c.save();
    c.beginPath();
    c.arc(32, 32, 13, 0.2, Math.PI - 0.2);
    c.fillStyle = '#3a2a18';
    c.fill();
    c.restore();
    circ(c, 26, 26, 3, 'rgba(255,255,255,0.5)', false);
  },
  snakeskinPlating: (c) => {
    path(c, [[14, 10], [50, 10], [54, 54], [10, 54]], LEATHER);
    for (let row = 0; row < 5; row++)
      for (let i = 0; i < 4 + (row % 2); i++) {
        const x = 16 + i * 9 - (row % 2) * 4.5, y = 16 + row * 8;
        path(c, [[x - 5, y - 3], [x + 5, y - 3], [x, y + 5]], row % 2 ? BRASS : BRASS_HI);
      }
  },
  brassShins: (c) => {
    boot(c, 24, 40, BRASS);
    boot(c, 44, 44, BRASS_HI);
  },
  springHeels: (c) => {
    boot(c, 30, 28, LEATHER);
    c.save();
    c.strokeStyle = IRON_HI;
    c.lineWidth = 2.5;
    c.beginPath();
    for (let i = 0; i <= 8; i++) c.lineTo(24 + (i % 2) * 14, 36 + i * 3);
    c.stroke();
    c.restore();
  },
  magBoots: (c) => {
    boot(c, 30, 32, IRON);
    path(c, [[18, 42], [46, 42], [46, 52], [40, 52], [40, 46], [24, 46], [24, 52], [18, 52]], RED);
  },
  rearVent: (c) => {
    rect(c, 10, 22, 24, 22, BRASS, 6);
    path(c, [[32, 26], [48, 20], [48, 46], [32, 40]], COPPER);
    puff(c, 54, 32, 7);
  },
  afterburner: (c) => {
    rect(c, 8, 18, 22, 28, IRON, 6);
    path(c, [[28, 20], [40, 16], [40, 30], [28, 28]], COPPER);
    path(c, [[28, 36], [40, 34], [40, 48], [28, 44]], COPPER);
    path(c, [[40, 18], [58, 22], [44, 26]], '#ff8a30');
    path(c, [[40, 36], [60, 41], [44, 46]], '#ff8a30');
  },
  supportAntenna: (c) => {
    rod(c, 32, 58, 32, 14, 4, COPPER);
    rod(c, 22, 30, 42, 30, 3, COPPER);
    rod(c, 25, 22, 39, 22, 3, COPPER);
    c.save();
    c.beginPath();
    c.ellipse(44, 14, 10, 5, -0.5, 0, Math.PI * 2);
    c.fillStyle = IRON_HI;
    c.fill();
    c.stroke();
    c.restore();
    circ(c, 32, 10, 4, '#ffc070');
  },
  steamWhistle: (c) => {
    rect(c, 24, 14, 16, 34, BRASS, 4);
    rect(c, 20, 44, 24, 8, BRASS_HI, 2);
    rod(c, 40, 22, 54, 40, 2, IRON);
    puff(c, 32, 10, 7);
  },
  scrapMagnet: (c) => {
    c.save();
    c.lineWidth = 12;
    c.strokeStyle = SOOT;
    c.beginPath();
    c.arc(32, 30, 16, Math.PI, 0);
    c.stroke();
    c.lineWidth = 9;
    c.strokeStyle = RED;
    c.stroke();
    c.restore();
    rect(c, 12, 30, 9, 16, IRON_HI, 1);
    rect(c, 43, 30, 9, 16, IRON_HI, 1);
    gear(c, 50, 54, 5, IRON);
  },
  rivetRepeater: (c) => {
    rect(c, 8, 26, 46, 10, IRON_HI, 3);
    rect(c, 14, 34, 10, 14, BRASS);
    for (let i = 0; i < 5; i++) circ(c, 20 + i * 6, 18, 2.4, BRASS_HI);
  },
  autoloader: (c) => {
    circ(c, 30, 32, 18, BRASS);
    for (let i = 0; i < 6; i++) circ(c, 30 + Math.cos(i) * 10, 32 + Math.sin(i) * 10, 3.5, SOOT, false);
    gear(c, 50, 14, 8, COPPER);
  },
  deepHose: (c) => {
    c.save();
    c.lineWidth = 9;
    c.strokeStyle = SOOT;
    c.beginPath();
    c.moveTo(8, 10);
    c.bezierCurveTo(50, 10, 10, 50, 44, 46);
    c.stroke();
    c.lineWidth = 6;
    c.strokeStyle = LEATHER;
    c.stroke();
    c.restore();
    path(c, [[42, 40], [58, 34], [58, 60], [42, 52]], BRASS);
  },
  wideNozzle: (c) => {
    rect(c, 6, 28, 24, 8, IRON);
    path(c, [[28, 26], [52, 12], [56, 52], [28, 38]], BRASS);
    c.save();
    c.fillStyle = 'rgba(40,30,20,0.6)';
    for (let i = 0; i < 6; i++) c.fillRect(56 + (i % 2) * 3, 14 + i * 7, 2, 2);
    c.restore();
  },
  lampOfFaith: (c) => {
    c.save();
    const g = c.createRadialGradient(32, 28, 2, 32, 28, 28);
    g.addColorStop(0, 'rgba(255,200,110,0.9)');
    g.addColorStop(1, 'rgba(255,200,110,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    c.restore();
    rod(c, 32, 60, 32, 42, 3, IRON);
    path(c, [[22, 42], [42, 42], [38, 18], [26, 18]], 'rgba(255,220,140,0.9)');
    path(c, [[24, 18], [40, 18], [32, 8]], BRASS);
  },
  boilerHalo: (c) => {
    c.save();
    c.strokeStyle = 'rgba(240,240,240,0.7)';
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(32, 36, 26, 10, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
    for (let i = 0; i < 5; i++) rect(c, 8 + i * 10, 22 + (i % 2) * 6, 8, 14, COPPER, 3);
    rod(c, 32, 56, 32, 20, 3, IRON);
  },
  scrapPlating: (c) => {
    path(c, [[10, 14], [40, 10], [42, 36], [12, 40]], '#5a7a8a');
    circ(c, 44, 42, 13, IRON_HI);
    circ(c, 44, 42, 5, IRON, false);
    rect(c, 14, 20, 12, 6, '#e8d040', 1);
  },
  tankTreads: (c) => {
    rect(c, 6, 24, 52, 22, IRON, 11);
    for (let i = 0; i < 4; i++) circ(c, 15 + i * 11, 35, 5, IRON_HI);
  },
  pramWheels: (c) => {
    for (const x of [20, 46]) {
      circ(c, x, 36, 14, IRON);
      circ(c, x, 36, 10, '#2a2420');
      c.save();
      c.strokeStyle = IRON_HI;
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.moveTo(x, 36);
        c.lineTo(x + Math.cos(i) * 10, 36 + Math.sin(i) * 10);
        c.stroke();
      }
      c.restore();
    }
  },
  spiderLegs: (c) => {
    for (const s of [-1, 1])
      for (const k of [0, 1]) {
        const x0 = 32 + s * (4 + k * 6);
        rod(c, x0, 26, x0 + s * (10 + k * 4), 14, 2.5, BRASS);
        rod(c, x0 + s * (10 + k * 4), 14, x0 + s * (18 + k * 6), 54, 2.5, BRASS);
      }
    rect(c, 22, 22, 20, 12, COPPER, 5);
    circ(c, 32, 28, 3, CYAN, false);
  },
  wingRig: (c) => {
    wing(c, 30, 30, -1);
    wing(c, 34, 30, 1);
    rect(c, 26, 26, 12, 20, BRASS, 3);
  },

  // Each land's crew set (sim/gear.ts): the land's own colours over brass.
  // The desert: sand, hornet black and cyan, Crawlcam lenses, snake-skin.
  dowserEyes: (c) => {
    rect(c, 14, 30, 36, 20, IRON, 6);
    for (const [x, y, r] of [[24, 26, 7], [38, 24, 8], [31, 36, 5], [44, 36, 4]]) {
      circ(c, x, y, r, GLOSS);
      circ(c, x, y, r * 0.5, CYAN, false);
    }
    rod(c, 32, 50, 32, 60, 3, BRASS);
  },
  stingerBayonet: (c) => {
    rect(c, 6, 30, 34, 10, IRON_HI, 3);
    rect(c, 12, 38, 9, 12, BRASS);
    stinger(c, 36, 34, 60, 22);
    stinger(c, 34, 42, 58, 40);
  },
  sunParasol: (c) => {
    c.save();
    c.beginPath();
    c.ellipse(32, 28, 26, 14, 0, Math.PI, Math.PI * 2);
    c.closePath();
    c.fillStyle = 'rgba(160,230,255,0.7)';
    c.fill();
    c.stroke();
    c.restore();
    for (let i = -2; i <= 2; i++) rod(c, 32, 16, 32 + i * 11, 28, 1, GLOSS);
    rod(c, 32, 14, 32, 58, 3, BRASS);
    rect(c, 24, 46, 16, 10, COPPER, 3);
  },
  crawlerLegs: (c) => {
    for (let i = 0; i < 3; i++) {
      const x = 16 + i * 16;
      rod(c, x, 30, x - 6, 18, 2.5, GLOSS);
      rod(c, x - 6, 18, x - 10, 46, 2.5, GLOSS);
    }
    rect(c, 8, 26, 48, 10, BRASS, 3);
    for (let i = 0; i < 3; i++) circ(c, 16 + i * 16, 31, 2, CYAN, false);
  },
  snakeEyeScope: (c) => {
    rect(c, 6, 26, 46, 14, '#9a8a4a', 6);
    for (let i = 0; i < 6; i++) path(c, [[10 + i * 7, 26], [14 + i * 7, 33], [10 + i * 7, 40]], '#7a6a34', false);
    circ(c, 54, 33, 8, BRASS);
    c.save();
    c.beginPath();
    c.ellipse(54, 33, 2, 6, 0, 0, Math.PI * 2);
    c.fillStyle = '#ffb030';
    c.fill();
    c.restore();
  },
  // The Rustwood Jungle: moss green, rust, pink and white for the Tunnel of Love.
  tuskBore: (c) => {
    rect(c, 6, 28, 22, 10, LEATHER, 4);
    path(c, [[26, 22], [52, 30], [26, 34]], '#efe6d0');
    path(c, [[26, 32], [56, 40], [26, 44]], '#efe6d0');
    gear(c, 26, 33, 7, '#8a6a3a');
  },
  jawMantle: (c) => {
    path(c, [[8, 40], [16, 22], [48, 22], [56, 40], [32, 50]], '#4a5a3a');
    for (const x of [18, 32, 46]) {
      path(c, [[x - 6, 26], [x + 6, 26], [x, 36]], '#f4efe6');
      path(c, [[x - 6, 44], [x + 6, 44], [x, 36]], '#f4efe6');
    }
  },
  swanDown: (c) => {
    c.save();
    c.beginPath();
    c.moveTo(32, 50);
    c.bezierCurveTo(4, 30, 14, 6, 32, 20);
    c.bezierCurveTo(50, 6, 60, 30, 32, 50);
    c.fillStyle = '#f4efe6';
    c.fill();
    c.stroke();
    c.restore();
    for (const x of [22, 32, 42]) rod(c, x, 22, x, 34, 1, '#d8c8c0');
    circ(c, 32, 40, 4, '#ff7aa8', false);
    rod(c, 32, 50, 32, 60, 3, BRASS);
  },
  grabberArms: (c) => {
    rect(c, 22, 26, 20, 20, BRASS, 4);
    rod(c, 22, 32, 6, 16, 3, '#6a4a2e');
    rod(c, 42, 32, 58, 16, 3, '#6a4a2e');
    for (const [x, d] of [[6, -1], [58, 1]]) {
      rod(c, x, 16, x + d * 4, 10, 2, IRON_HI);
      rod(c, x, 16, x - d * 2, 9, 2, IRON_HI);
    }
  },
  leydenSights: (c) => {
    rect(c, 18, 26, 28, 18, IRON, 5);
    for (const x of [10, 54]) {
      rect(c, x - 6, 20, 12, 22, 'rgba(160,220,255,0.6)', 4);
      rect(c, x - 5, 16, 10, 5, BRASS, 1);
    }
    c.save();
    c.strokeStyle = '#7ad8ff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(10, 14);
    c.lineTo(20, 8);
    c.lineTo(28, 14);
    c.lineTo(38, 6);
    c.lineTo(54, 14);
    c.stroke();
    c.restore();
    circ(c, 32, 35, 5, CYAN, false);
  },
  // The Hollow City: office grey, police blue, mall red.
  briefcaseTank: (c) => {
    rect(c, 8, 22, 22, 30, '#5a3a24', 3);
    rect(c, 34, 22, 22, 30, '#5a3a24', 3);
    for (const x of [19, 45]) {
      rect(c, x - 5, 16, 10, 6, IRON_HI, 1);
      rect(c, x - 3, 34, 6, 5, BRASS, 1);
    }
    rod(c, 30, 30, 34, 30, 3, IRON);
  },
  riotBadge: (c) => {
    path(c, [[12, 44], [12, 24], [32, 14], [52, 24], [52, 44]], '#2a3a5a');
    rect(c, 16, 30, 32, 10, 'rgba(160,200,240,0.7)', 3);
    for (const x of [22, 42]) path(c, [[x, 16], [x + 5, 20], [x + 3, 27], [x - 3, 27], [x - 5, 20]], GOLD);
  },
  whistleSiren: (c) => {
    rect(c, 18, 34, 28, 16, IRON, 4);
    path(c, [[14, 30], [40, 26], [48, 34], [14, 38]], IRON_HI);
    circ(c, 22, 34, 5, IRON_HI);
    rect(c, 26, 12, 12, 12, '#3a7aff', 4);
    circ(c, 32, 18, 3, '#d0e8ff', false);
  },
  cartChassis: (c) => {
    path(c, [[6, 16], [54, 16], [48, 40], [14, 40]], 'rgba(180,180,190,0.35)');
    c.save();
    c.strokeStyle = IRON_HI;
    for (let i = 1; i < 5; i++) {
      c.beginPath();
      c.moveTo(6 + i * 10, 16);
      c.lineTo(12 + i * 8, 40);
      c.stroke();
    }
    c.restore();
    rect(c, 14, 40, 36, 4, '#e03a3a', 1);
    circ(c, 18, 52, 6, '#2a2420');
    circ(c, 46, 52, 6, '#2a2420');
  },
  destrierStilts: (c) => {
    rect(c, 18, 10, 28, 12, IRON, 4);
    for (const x of [22, 42]) {
      rod(c, x, 22, x - 4, 40, 3, '#5a5a66');
      rod(c, x - 4, 40, x + 2, 56, 3, '#5a5a66');
      rect(c, x - 2, 54, 10, 4, IRON_HI, 1);
    }
  },
  // The Frostspine: ice blue and white, goat brown.
  augerSiphon: (c) => {
    rect(c, 6, 28, 20, 10, LEATHER, 4);
    for (const y of [20, 38]) {
      path(c, [[26, y], [56, y + 4], [26, y + 10]], '#a8b8c8');
      for (let i = 0; i < 3; i++) rod(c, 30 + i * 8, y + 1 + i, 32 + i * 8, y + 9 - i, 1, IRON);
    }
    for (let i = 0; i < 4; i++) circ(c, 58 - i * 3, 14 + i * 12, 1.6, '#dceefc', false);
  },
  ramHelm: (c) => {
    rect(c, 18, 24, 28, 26, IRON, 8);
    for (const d of [-1, 1]) {
      c.save();
      c.lineWidth = 9;
      c.strokeStyle = SOOT;
      c.beginPath();
      c.arc(32 + d * 18, 26, 10, d > 0 ? -Math.PI : 0, d > 0 ? Math.PI * 0.6 : Math.PI * 1.4, d < 0);
      c.stroke();
      c.lineWidth = 6;
      c.strokeStyle = '#a88a5a';
      c.stroke();
      c.restore();
    }
    rect(c, 24, 34, 16, 5, '#2a2420', 2);
  },
  bleatBeacon: (c) => {
    rod(c, 32, 60, 32, 26, 3, IRON);
    rect(c, 10, 16, 18, 16, '#d8c8a8', 4);
    rect(c, 36, 16, 18, 16, '#d8c8a8', 4);
    for (const x of [19, 45]) circ(c, x, 24, 4, '#e03a3a');
    c.save();
    c.strokeStyle = 'rgba(240,240,240,0.7)';
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(32, 42, 22, 7, 0, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  },
  kiteRig: (c) => {
    path(c, [[32, 6], [56, 26], [32, 34]], '#dceefc');
    path(c, [[32, 6], [8, 26], [32, 34]], '#b8d0e8');
    rod(c, 32, 6, 32, 58, 3, WOOD);
    rect(c, 22, 50, 20, 8, BRASS, 2);
  },
  frostBore: (c) => {
    rect(c, 8, 26, 46, 12, '#9fc8e8', 4);
    for (let i = 0; i < 5; i++) rod(c, 14 + i * 8, 27, 18 + i * 8, 37, 1, '#dceefc');
    rect(c, 14, 36, 10, 14, BRASS);
    puff(c, 58, 30, 4);
  },
  // The Demon Wastes: blood red, ash black, ember orange.
  veinHose: (c) => {
    c.save();
    c.lineWidth = 9;
    c.strokeStyle = SOOT;
    c.beginPath();
    c.moveTo(8, 12);
    c.bezierCurveTo(48, 6, 12, 54, 46, 48);
    c.stroke();
    c.lineWidth = 6;
    c.strokeStyle = '#a01828';
    c.stroke();
    c.restore();
    for (const [x, y] of [[22, 14], [24, 34], [38, 46]]) circ(c, x, y, 3, '#ff4050', false);
    path(c, [[44, 42], [58, 38], [58, 58], [44, 52]], BRASS);
  },
  scytheBracers: (c) => {
    rect(c, 8, 32, 40, 12, IRON, 4);
    for (const x of [18, 34]) {
      c.save();
      c.beginPath();
      c.moveTo(x, 32);
      c.quadraticCurveTo(x + 6, 4, x + 26, 8);
      c.quadraticCurveTo(x + 12, 14, x + 10, 32);
      c.closePath();
      c.fillStyle = '#6a2028';
      c.fill();
      c.stroke();
      c.restore();
      rod(c, x + 8, 14, x + 22, 9, 1, '#ff6a6a');
    }
  },
  leechNozzle: (c) => {
    rect(c, 6, 28, 22, 10, IRON);
    path(c, [[26, 24], [46, 18], [46, 48], [26, 42]], '#5a1018');
    circ(c, 48, 33, 10, '#3a0810');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      circ(c, 48 + Math.cos(a) * 7, 33 + Math.sin(a) * 7, 1.5, '#f4efe6', false);
    }
  },
  swarmerHarness: (c) => {
    for (const d of [-1, 1]) path(c, [[32, 30], [32 + d * 28, 12], [32 + d * 22, 30], [32 + d * 26, 46]], '#3a1a22');
    rect(c, 24, 24, 16, 22, BRASS, 4);
  },
  obsessionScope: (c) => {
    rect(c, 6, 28, 36, 12, GLOSS, 5);
    circ(c, 46, 34, 13, GLOSS);
    circ(c, 46, 34, 7, '#ff2a2a');
    circ(c, 46, 34, 2.5, '#ffd0d0', false);
  },
  // The Ether: cold violet and wisp blue.
  wispHood: (c) => {
    c.save();
    const g = c.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(160,240,255,0.6)');
    g.addColorStop(1, 'rgba(160,240,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    c.restore();
    path(c, [[16, 52], [14, 26], [32, 12], [50, 26], [48, 52]], '#3a2a5a');
    for (const x of [12, 52]) {
      rect(c, x - 5, 30, 10, 14, 'rgba(160,240,255,0.85)', 4);
      rect(c, x - 4, 26, 8, 4, BRASS, 1);
    }
  },
  shadeMantle: (c) => {
    path(c, [[8, 22], [56, 22], [52, 40], [56, 56], [44, 46], [32, 58], [20, 46], [8, 56], [12, 40]], 'rgba(30,18,56,0.9)');
    for (const x of [18, 32, 46]) circ(c, x, 28, 2.4, BRASS_HI, false);
  },
  bansheeMister: (c) => {
    rect(c, 6, 28, 24, 10, IRON);
    path(c, [[28, 24], [42, 20], [42, 46], [28, 42]], '#6a5a8a');
    c.save();
    c.globalAlpha = 0.7;
    for (const [x, y, r] of [[50, 26, 7], [56, 38, 6], [48, 44, 5]]) circ(c, x, y, r, 'rgba(200,170,255,0.8)', false);
    c.restore();
  },
  ghostGlide: (c) => {
    c.save();
    const g = c.createRadialGradient(32, 52, 2, 32, 52, 22);
    g.addColorStop(0, 'rgba(160,240,255,0.8)');
    g.addColorStop(1, 'rgba(160,240,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 30, 64, 34);
    c.restore();
    path(c, [[14, 18], [50, 18], [56, 48], [46, 42], [38, 50], [32, 44], [24, 50], [16, 42], [8, 48]], 'rgba(30,18,56,0.88)');
    rect(c, 20, 12, 24, 8, BRASS, 2);
  },
  howlBarrel: (c) => {
    rect(c, 8, 28, 30, 10, IRON, 3);
    rect(c, 14, 36, 9, 12, BRASS);
    path(c, [[34, 26], [50, 16], [50, 50], [34, 40]], '#6a5a8a');
    c.save();
    c.strokeStyle = 'rgba(200,170,255,0.8)';
    c.lineWidth = 2;
    for (const r of [5, 10]) {
      c.beginPath();
      c.arc(50, 33, r, -0.8, 0.8);
      c.stroke();
    }
    c.restore();
  },

  // The newest three types' pieces (sim/gear.ts), a land at a time: a steam mage's bellows and boilers, a lamplighter's lanterns, a stalker's blades and legs.
  // A lantern: a cage of brass on a hook, the light inside.
  ...(() => {
    const lantern = (c: C, glow: string, top: () => void) => {
      c.save();
      const g = c.createRadialGradient(32, 36, 2, 32, 36, 26);
      g.addColorStop(0, glow);
      g.addColorStop(1, 'rgba(255,240,180,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      c.restore();
      rod(c, 32, 8, 32, 16, 3, BRASS);
      rect(c, 22, 16, 20, 28, 'rgba(255,230,150,0.8)', 4);
      rect(c, 20, 12, 24, 6, BRASS, 2);
      rect(c, 20, 42, 24, 6, BRASS, 2);
      top();
    };
    return {
      waspLantern: (c: C) => lantern(c, 'rgba(160,220,255,0.7)', () => { wing(c, 14, 30, -1); wing(c, 42, 30, 1); }),
      swanLantern: (c: C) => lantern(c, 'rgba(255,255,255,0.7)', () => { path(c, [[14, 40], [22, 26], [24, 44]], '#f4efe6'); path(c, [[50, 40], [42, 26], [40, 44]], '#f4efe6'); }),
      kiteLantern: (c: C) => lantern(c, 'rgba(255,240,180,0.7)', () => { path(c, [[8, 22], [32, 6], [56, 22], [32, 16]], '#c8d0d8'); }),
      wispLantern: (c: C) => lantern(c, 'rgba(160,240,255,0.8)', () => { circ(c, 32, 30, 6, 'rgba(200,250,255,0.95)', false); }),
      badgeLamp: (c: C) => {
        rect(c, 14, 22, 36, 24, IRON, 5);
        path(c, [[32, 10], [44, 20], [40, 34], [32, 40], [24, 34], [20, 20]], BRASS);
        circ(c, 32, 26, 5, 'rgba(255,255,255,0.95)', false);
        rod(c, 32, 40, 32, 56, 2, 'rgba(255,255,255,0.5)');
      },
      droneLamp: (c: C) => {
        rect(c, 8, 24, 48, 20, IRON, 5);
        for (const x of [22, 42]) {
          circ(c, x, 34, 9, GLOSS);
          circ(c, x, 34, 5, 'rgba(235,245,255,0.95)', false);
        }
      },
    };
  })(),
  gaugeEyes: (c) => {
    rect(c, 10, 34, 44, 16, IRON, 5);
    for (const x of [20, 44]) {
      rod(c, x, 34, x, 20, 3, BRASS);
      circ(c, x, 18, 8, GLOSS);
      circ(c, x, 18, 4, CYAN, false);
    }
  },
  tuskBellows: (c) => {
    rect(c, 6, 26, 26, 18, LEATHER, 4);
    for (let i = 0; i < 3; i++) rod(c, 10 + i * 8, 26, 10 + i * 8, 44, 1.5, GLOSS);
    path(c, [[30, 28], [56, 22], [40, 34]], '#efe6d0');
    path(c, [[30, 40], [56, 46], [40, 36]], '#efe6d0');
    puff(c, 52, 34, 5);
  },
  commuterBoiler: (c) => {
    rect(c, 12, 18, 40, 32, '#4a3a2c', 5);
    rect(c, 26, 14, 12, 6, BRASS, 2);
    circ(c, 32, 34, 8, BRASS);
    circ(c, 32, 34, 4, '#f6e2a8', false);
    puff(c, 32, 10, 5);
  },
  frostPlate: (c) => {
    path(c, [[10, 44], [14, 22], [32, 12], [50, 22], [54, 44], [32, 54]], '#cfe6f0');
    for (const [x, y] of [[22, 26], [42, 28], [32, 40]]) circ(c, x, y, 3, '#ffffff', false);
    puff(c, 32, 8, 5);
  },
  veinManifold: (c) => {
    rect(c, 8, 22, 30, 24, IRON, 4);
    c.save();
    c.strokeStyle = '#a02828';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(38, 30);
    c.bezierCurveTo(48, 20, 52, 40, 58, 34);
    c.moveTo(38, 40);
    c.bezierCurveTo(46, 50, 52, 30, 58, 38);
    c.stroke();
    c.restore();
    circ(c, 22, 34, 7, '#7a1818');
  },
  bansheeBellows: (c) => {
    rect(c, 6, 28, 26, 14, '#5a4a7a', 4);
    path(c, [[30, 24], [54, 14], [54, 54], [30, 46]], '#8a7ab0');
    c.save();
    c.strokeStyle = 'rgba(200,170,255,0.8)';
    c.lineWidth = 2;
    for (const r of [5, 10]) {
      c.beginPath();
      c.arc(54, 34, r, -0.8, 0.8);
      c.stroke();
    }
    c.restore();
  },
  stingerBlades: (c) => {
    rect(c, 6, 40, 20, 10, LEATHER, 3);
    stinger(c, 22, 44, 58, 14);
    stinger(c, 20, 38, 56, 28);
  },
  hornDaggers: (c) => {
    rect(c, 6, 40, 20, 10, LEATHER, 3);
    path(c, [[22, 38], [52, 12], [46, 40]], '#e8dcc0');
    path(c, [[22, 46], [58, 34], [40, 50]], '#e8dcc0');
  },
  scytheKnives: (c) => {
    rect(c, 6, 40, 18, 10, LEATHER, 3);
    path(c, [[20, 38], [34, 14], [58, 10], [44, 24], [30, 44]], '#b83030');
    path(c, [[20, 48], [40, 36], [58, 38], [44, 50]], '#8a2020');
  },
  monkeyRunners: (c) => {
    for (const x of [20, 44]) {
      rod(c, x, 14, x - 4, 36, 4, '#6a4528');
      rod(c, x - 4, 36, x + 6, 54, 4, '#6a4528');
      circ(c, x + 6, 55, 4, BRASS);
    }
    rect(c, 10, 10, 44, 8, BRASS, 3);
  },
  chargerLegs: (c) => {
    for (const x of [20, 44]) {
      rod(c, x, 12, x + 8, 32, 5, IRON_HI);
      rod(c, x + 8, 32, x - 2, 54, 5, IRON_HI);
      circ(c, x - 2, 55, 4, GLOSS);
    }
    rect(c, 10, 8, 44, 8, BRASS, 3);
  },
  shadeShroud: (c) => {
    path(c, [[8, 20], [56, 20], [50, 38], [56, 56], [44, 46], [32, 58], [20, 46], [8, 56], [14, 38]], 'rgba(30,18,56,0.9)');
    circ(c, 24, 28, 2.4, BRASS_HI, false);
    circ(c, 40, 28, 2.4, BRASS_HI, false);
  },

  // P23: the old augment list as body parts.
  radarScope: (c) => {
    rect(c, 10, 40, 28, 14, BRASS, 3);
    rod(c, 24, 40, 30, 32, 4, IRON_HI);
    circ(c, 36, 26, 16, '#16342a');
    c.save();
    c.strokeStyle = 'rgba(80,255,150,0.8)';
    c.lineWidth = 1.5;
    for (const r of [5, 10]) {
      c.beginPath();
      c.arc(36, 26, r, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    rod(c, 36, 26, 47, 17, 2, '#6dffb0');
    circ(c, 42, 30, 2, '#c8ffe0', false);
  },
  lanternEyes: (c) => {
    rect(c, 8, 24, 48, 16, IRON, 5);
    for (const x of [20, 44]) {
      circ(c, x, 32, 9, BRASS_HI);
      circ(c, x, 32, 5, '#fff0a0', false);
      c.save();
      c.fillStyle = 'rgba(255,220,120,0.35)';
      c.beginPath();
      c.arc(x, 32, 15, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  },
  listeningHorn: (c) => {
    path(c, [[10, 40], [14, 34], [46, 14], [52, 26], [20, 46]], BRASS);
    path(c, [[46, 14], [56, 10], [58, 28], [52, 26]], BRASS_HI);
    circ(c, 54, 20, 4, SOOT, false);
    rect(c, 6, 38, 12, 14, LEATHER, 3);
    for (const r of [4, 8]) {
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.beginPath();
      c.arc(56, 20, 6 + r, -0.9, 0.9);
      c.stroke();
      c.restore();
    }
  },
  thirdHand: (c) => {
    rod(c, 10, 52, 24, 30, 6, IRON);
    rod(c, 24, 30, 42, 24, 5, IRON_HI);
    circ(c, 24, 30, 5, BRASS);
    rod(c, 42, 24, 52, 14, 3, BRASS);
    rod(c, 42, 24, 56, 28, 3, BRASS);
    rect(c, 6, 50, 16, 8, LEATHER, 2);
  },
  grapple: (c) => {
    rect(c, 8, 38, 22, 14, IRON, 4);
    gear(c, 18, 45, 6, BRASS_HI);
    c.save();
    c.setLineDash([3, 3]);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(30, 42);
    c.quadraticCurveTo(40, 18, 50, 20);
    c.stroke();
    c.restore();
    rod(c, 50, 20, 58, 12, 3, IRON_HI);
    rod(c, 50, 20, 59, 24, 3, IRON_HI);
    rod(c, 50, 20, 52, 30, 3, IRON_HI);
  },
  furnaceCore: (c) => {
    path(c, [[14, 14], [50, 14], [54, 52], [10, 52]], IRON);
    rect(c, 22, 26, 20, 16, '#2a1008', 2);
    c.save();
    c.fillStyle = '#ff7a20';
    for (const x of [25, 31, 37]) c.fillRect(x, 29, 3, 10);
    c.restore();
    circ(c, 32, 20, 3, BRASS_HI);
  },
  smokeStack: (c) => {
    rect(c, 14, 36, 24, 16, IRON, 4);
    rect(c, 22, 14, 10, 24, GLOSS, 2);
    rect(c, 20, 12, 14, 5, IRON_HI, 2);
    c.save();
    c.globalAlpha = 0.8;
    for (const [x, y, r] of [[40, 20, 7], [48, 12, 8], [56, 22, 7], [50, 30, 6]]) circ(c, x, y, r, '#3a3834', false);
    c.restore();
  },
  canRack: (c) => {
    for (const x of [14, 44]) rod(c, x, 14, x, 56, 3, IRON);
    rod(c, 14, 20, 44, 20, 3, IRON);
    rod(c, 14, 48, 44, 48, 3, IRON);
    rect(c, 20, 24, 18, 22, '#8a2a1c', 3);
    rect(c, 22, 20, 14, 6, IRON_HI, 2);
    rect(c, 24, 30, 10, 8, '#e8dcc0', 1);
  },
  botHarness: (c) => {
    rod(c, 20, 10, 20, 54, 5, LEATHER);
    rod(c, 44, 10, 44, 54, 5, LEATHER);
    rod(c, 20, 20, 44, 34, 5, LEATHER);
    rod(c, 44, 20, 20, 34, 5, LEATHER);
    rect(c, 22, 38, 20, 16, IRON, 4);
    circ(c, 32, 46, 3, CYAN, false);
    circ(c, 20, 20, 3, BRASS);
    circ(c, 44, 20, 3, BRASS);
  },
  rivetMail: (c) => {
    path(c, [[14, 14], [24, 10], [40, 10], [50, 14], [56, 28], [46, 30], [46, 54], [18, 54], [18, 30], [8, 28]], LEATHER);
    for (let y = 18; y < 52; y += 7) for (let x = 22; x < 44; x += 7) circ(c, x + (y % 2 ? 3 : 0), y, 2, BRASS_HI, false);
  },
  rivetedBuckler: (c) => {
    circ(c, 32, 32, 22, IRON);
    circ(c, 32, 32, 8, BRASS);
    for (let i = 0; i < 10; i++) circ(c, 32 + Math.cos((i / 10) * Math.PI * 2) * 17, 32 + Math.sin((i / 10) * Math.PI * 2) * 17, 2, BRASS_HI, false);
  },
  valveManifold: (c) => {
    rect(c, 6, 36, 22, 12, BRASS, 3);
    for (const [y, col] of [[16, COPPER], [26, BRASS], [36, IRON_HI]] as const) {
      rod(c, 22, y + 12, 52, y, 4, col);
      circ(c, 52, y, 4, SOOT, false);
    }
    gear(c, 16, 42, 6, BRASS_HI);
    puff(c, 56, 14, 4);
  },
  longWick: (c) => {
    rod(c, 10, 56, 40, 18, 4, BRASS);
    path(c, [[40, 18], [34, 8], [42, 12], [48, 4], [50, 16]], '#ffb020');
    circ(c, 43, 16, 3, '#fff0a0', false);
    rect(c, 6, 50, 14, 8, LEATHER, 2);
  },
  muffledKnuckles: (c) => {
    rect(c, 10, 26, 32, 22, '#c9bfa8', 6);
    for (const x of [14, 22, 30, 38]) rect(c, x, 20, 7, 10, '#b0a690', 3);
    rect(c, 8, 44, 22, 8, LEATHER, 3);
    circ(c, 52, 34, 4, '#c9bfa8');
  },
  longRail: (c) => {
    rect(c, 6, 34, 16, 12, LEATHER, 3);
    rect(c, 18, 36, 40, 6, IRON_HI, 2);
    rect(c, 22, 30, 28, 4, IRON, 1);
    rod(c, 34, 44, 28, 56, 3, IRON);
    rod(c, 34, 44, 42, 56, 3, IRON);
    circ(c, 58, 39, 2.5, SOOT, false);
  },
  bracingYoke: (c) => {
    rod(c, 8, 28, 56, 28, 8, IRON);
    rod(c, 14, 28, 14, 50, 5, IRON_HI);
    rod(c, 50, 28, 50, 50, 5, IRON_HI);
    rod(c, 14, 46, 50, 46, 4, IRON);
    circ(c, 32, 28, 5, BRASS);
  },
  hawkLens: (c) => {
    rod(c, 10, 52, 26, 30, 3, IRON_HI);
    circ(c, 34, 26, 15, BRASS);
    circ(c, 34, 26, 11, '#bfe8ff');
    c.save();
    c.strokeStyle = RED;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(34, 18); c.lineTo(34, 34);
    c.moveTo(26, 26); c.lineTo(42, 26);
    c.stroke();
    c.restore();
  },
  stokerGloves: (c) => {
    path(c, [[16, 54], [14, 30], [20, 22], [24, 28], [26, 14], [32, 14], [32, 28], [36, 12], [42, 14], [40, 30], [46, 20], [50, 24], [44, 44], [42, 54]], '#5a4a40');
    rect(c, 14, 50, 30, 8, LEATHER, 2);
    c.save();
    c.fillStyle = '#ff7a20';
    c.beginPath();
    c.arc(30, 40, 4, 0, Math.PI * 2);
    c.fill();
    c.restore();
  },
  pressureVest: (c) => {
    path(c, [[16, 10], [26, 10], [32, 20], [38, 10], [48, 10], [50, 54], [14, 54]], COPPER);
    circ(c, 40, 36, 8, '#f0e8d0');
    rod(c, 40, 36, 44, 30, 2, RED);
    rod(c, 22, 20, 22, 50, 3, BRASS);
  },
  leydenSpurs: (c) => {
    for (const x of [18, 42]) {
      rect(c, x - 7, 20, 14, 28, '#cfe8ff', 5);
      rect(c, x - 5, 16, 10, 6, IRON, 2);
      c.save();
      c.strokeStyle = '#ffe860';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(x - 3, 28); c.lineTo(x + 1, 34); c.lineTo(x - 2, 38); c.lineTo(x + 2, 44);
      c.stroke();
      c.restore();
    }
    rod(c, 25, 18, 35, 18, 2, BRASS);
  },
  etchingTip: (c) => {
    rect(c, 6, 32, 24, 12, IRON, 4);
    path(c, [[28, 34], [58, 38], [28, 42]], '#9ad060');
    circ(c, 56, 38, 2, '#d8ff90', false);
    for (const x of [36, 44, 50]) circ(c, x, 38, 1.4, '#58a030', false);
  },
};

/** The weapon mods' icons (P57): each a small thing bolted to a bracket (the lug), so a row of them reads as one family. */
const lugPlate = (c: C, x = 8, y = 40) => {
  rect(c, x, y, 18, 14, BRASS, 3);
  circ(c, x + 5, y + 7, 2.2, SOOT, false);
  circ(c, x + 13, y + 7, 2.2, SOOT, false);
};
const MOD_ICONS: Record<ModId, (c: C) => void> = {
  bayonetLug: (c) => {
    lugPlate(c, 8, 38);
    path(c, [[22, 42], [58, 18], [34, 48]], IRON_HI);
    rod(c, 22, 45, 34, 47, 4, BRASS_HI);
  },
  ricochetCog: (c) => {
    gear(c, 22, 40, 13, BRASS);
    c.save();
    c.strokeStyle = CYAN;
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(34, 52);
    c.lineTo(50, 36);
    c.lineTo(40, 24);
    c.lineTo(58, 12);
    c.stroke();
    c.restore();
    circ(c, 22, 40, 4, IRON_HI);
  },
  condenserCoil: (c) => {
    for (let i = 0; i < 4; i++) {
      c.beginPath();
      c.ellipse(26 + i * 8, 30, 5, 14, 0, 0, Math.PI * 2);
      c.lineWidth = 4.5;
      c.strokeStyle = SOOT;
      c.stroke();
      c.lineWidth = 2.6;
      c.strokeStyle = COPPER;
      c.stroke();
    }
    c.lineWidth = 1.6;
    c.strokeStyle = SOOT;
    circ(c, 24, 52, 3, 'rgba(160,230,255,0.9)');
    circ(c, 38, 56, 2.4, 'rgba(160,230,255,0.9)');
    wing(c, 44, 14);
  },
  pressureValve: (c) => {
    rod(c, 8, 52, 56, 52, 6, IRON);
    rod(c, 32, 52, 32, 30, 5, BRASS);
    circ(c, 32, 24, 14, BRASS_HI);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      rod(c, 32 - Math.cos(a) * 13, 24 - Math.sin(a) * 13, 32 + Math.cos(a) * 13, 24 + Math.sin(a) * 13, 3, BRASS);
    }
    circ(c, 32, 24, 4, RED, false);
  },
  flywheel: (c) => {
    circ(c, 30, 34, 22, IRON);
    circ(c, 30, 34, 15, IRON_HI);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      rod(c, 30, 34, 30 + Math.cos(a) * 15, 34 + Math.sin(a) * 15, 4, IRON);
    }
    circ(c, 30, 34, 5, BRASS_HI);
    c.save();
    c.strokeStyle = 'rgba(240,240,240,0.7)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(30, 34, 27, -0.9, 0.3);
    c.stroke();
    c.restore();
  },
  tuningFork: (c) => {
    rod(c, 32, 56, 32, 34, 6, IRON_HI);
    path(c, [[22, 8], [27, 8], [28, 32], [36, 32], [37, 8], [42, 8], [42, 38], [22, 38]], IRON_HI);
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.6;
    for (const dx of [-1, 1]) {
      c.beginPath();
      c.arc(32 + dx * 3, 6, 9 + dx * 0, dx > 0 ? -0.9 : Math.PI + 0.9, dx > 0 ? 0.0 : Math.PI + 0.0, dx < 0);
      c.stroke();
    }
    c.restore();
  },
  magnetHead: (c) => {
    c.save();
    c.lineCap = 'butt';
    c.lineWidth = 15;
    c.strokeStyle = SOOT;
    c.beginPath();
    c.arc(32, 32, 16, Math.PI, 0, false);
    c.lineTo(48, 52);
    c.moveTo(16, 32);
    c.lineTo(16, 52);
    c.stroke();
    c.lineWidth = 11;
    c.strokeStyle = RED;
    c.stroke();
    c.restore();
    rect(c, 10, 46, 12, 10, IRON_HI, 1);
    rect(c, 42, 46, 12, 10, IRON_HI, 1);
    puff(c, 32, 8, 5);
  },
  bootSpur: (c) => {
    path(c, [[8, 20], [24, 20], [26, 40], [52, 46], [52, 56], [8, 56]], LEATHER);
    rod(c, 8, 44, 26, 44, 4, BRASS);
    gear(c, 54, 50, 7, BRASS_HI);
    path(c, [[50, 44], [62, 40], [56, 50]], IRON_HI);
  },
  gramophoneHorn: (c) => {
    path(c, [[10, 30], [14, 26], [30, 30], [58, 8], [60, 52], [30, 36], [14, 38]], BRASS_HI);
    c.save();
    c.beginPath();
    c.ellipse(59, 30, 5, 22, 0, 0, Math.PI * 2);
    c.fillStyle = '#4a3418';
    c.fill();
    c.stroke();
    c.restore();
    rod(c, 8, 34, 8, 54, 4, IRON);
    rod(c, 8, 54, 30, 54, 4, IRON);
  },
  pigeonLoft: (c) => {
    path(c, [[10, 30], [32, 12], [54, 30]], COPPER);
    rect(c, 14, 30, 36, 24, BRASS, 2);
    circ(c, 32, 40, 8, SOOT);
    circ(c, 32, 40, 6, '#e8e0cc');
    circ(c, 34, 38, 1.5, SOOT, false);
    path(c, [[37, 40], [43, 41], [37, 43]], BRASS_HI);
    rod(c, 14, 54, 50, 54, 3, IRON);
  },
  echoChamber: (c) => {
    rect(c, 6, 28, 20, 14, BRASS, 3);
    c.save();
    c.lineWidth = 3;
    c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = `rgba(61,242,255,${0.95 - i * 0.28})`;
      c.beginPath();
      c.arc(30 + i * 7, 35, 8 + i * 6, -1.0, 1.0);
      c.stroke();
    }
    c.restore();
    circ(c, 30, 35, 3, CYAN, false);
  },
  boomerangGimbal: (c) => {
    path(c, [[8, 14], [20, 10], [34, 38], [58, 30], [60, 42], [32, 56], [24, 52]], BRASS);
    c.save();
    c.beginPath();
    c.arc(34, 38, 9, 0, Math.PI * 2);
    c.lineWidth = 3.4;
    c.strokeStyle = SOOT;
    c.stroke();
    c.lineWidth = 2;
    c.strokeStyle = BRASS_HI;
    c.stroke();
    c.restore();
    circ(c, 34, 38, 3, IRON_HI);
  },
  grandfatherClock: (c) => {
    rect(c, 18, 6, 28, 52, '#6a4528', 3);
    circ(c, 32, 22, 10, '#e8e0cc');
    rod(c, 32, 22, 32, 15, 2, SOOT);
    rod(c, 32, 22, 38, 25, 2, SOOT);
    rect(c, 23, 36, 18, 16, '#3a2410', 2);
    rod(c, 32, 38, 32, 47, 2, BRASS_HI);
    circ(c, 32, 48, 3.5, BRASS_HI);
    path(c, [[14, 8], [18, 6], [18, 12]], 'rgba(200,240,255,0.8)');
    path(c, [[50, 52], [46, 58], [46, 50]], 'rgba(200,240,255,0.8)');
  },
  teapotGovernor: (c) => {
    c.beginPath();
    c.ellipse(30, 40, 20, 15, 0, 0, Math.PI * 2);
    c.fillStyle = COPPER;
    c.fill();
    c.stroke();
    path(c, [[48, 38], [60, 22], [62, 26], [52, 42]], COPPER);
    c.beginPath();
    c.arc(10, 38, 8, Math.PI * 0.5, Math.PI * 1.5);
    c.lineWidth = 4;
    c.strokeStyle = SOOT;
    c.stroke();
    c.lineWidth = 1.6;
    rect(c, 22, 22, 16, 6, BRASS_HI, 2);
    circ(c, 30, 20, 3, BRASS_HI);
    puff(c, 60, 14, 5);
  },
  lightningRod: (c) => {
    rod(c, 32, 56, 32, 24, 6, COPPER);
    path(c, [[28, 26], [32, 4], [36, 26]], IRON_HI);
    circ(c, 32, 40, 5, 'rgba(160,230,255,0.9)');
    c.save();
    c.fillStyle = '#ffe566';
    c.beginPath();
    c.moveTo(44, 4);
    c.lineTo(34, 24);
    c.lineTo(42, 24);
    c.lineTo(34, 44);
    c.lineTo(52, 20);
    c.lineTo(44, 20);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
  },
};

/** The night versions' icons: the base item's, under a dark violet wash, with a dim violet eye in the corner. */
const NIGHT_ICONS = Object.fromEntries(
  NIGHT_BASES.map((b) => [
    `${b}Night`,
    (c: C) => {
      BASE_ICONS[b](c);
      c.save();
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(40,14,70,0.5)';
      c.fillRect(0, 0, 64, 64);
      c.restore();
      circ(c, 54, 10, 5, '#2a1448');
      circ(c, 54, 10, 2, '#c08bff', false);
    },
  ]),
) as Record<`${NightBase}Night`, (c: C) => void>;
export const ICONS: Record<ItemId, (c: C) => void> = { ...BASE_ICONS, ...NIGHT_ICONS, ...MOD_ICONS };

const cache = new Map<string, HTMLCanvasElement>();
/** An item's icon at `size` px, with a soot outline. */
export function iconCanvas(id: ItemId, size = 64): HTMLCanvasElement {
  const key = `${id}:${size}`;
  let cv = cache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  c.scale(size / 64, size / 64);
  c.lineJoin = 'round';
  c.lineWidth = 1.6;
  c.strokeStyle = SOOT;
  ICONS[id](c);
  cache.set(key, cv);
  return cv;
}
const urls = new Map<ItemId, string>();
/** The icon as a data URL, for the inventory's DOM. */
export const iconUrl = (id: ItemId) => urls.get(id) ?? (urls.set(id, iconCanvas(id, 96).toDataURL()), urls.get(id)!);

const texUrls = new Map<string, string>();
/** A texture (or atlas frame) as a data URL, made once per boot: `getBase64` draws a canvas. A missing texture is not kept. */
export function texUrl(scene: Phaser.Scene, key: string, frame?: string) {
  const id = frame ? `${key}#${frame}` : key;
  const kept = texUrls.get(id);
  if (kept !== undefined) return kept;
  const url = scene.textures.getBase64(key, frame);
  if (scene.textures.exists(key)) texUrls.set(id, url);
  return url;
}

/**
 * Every icon as a Phaser texture `gear-<id>` (128 px: a weapon's swing, about 0.5 game px a texel like everything else),
 * and as `worn-<id>`: the same icon as worn on a body, in the house style (a piece is about 32 game px, so its 64 units
 * are 2 texels per game px, and its outline is the ladder's, `LINE.outline`); draw it at scale `WORN`.
 */
export const WORN = 0.5;
export function makeGearArt(scene: Phaser.Scene) {
  for (const id of itemIds) {
    if (!scene.textures.exists(`gear-${id}`)) scene.textures.addCanvas(`gear-${id}`, iconCanvas(id, 128));
    if (ITEMS[id].mod || scene.textures.exists(`worn-${id}`)) continue; // a mod is fitted on a weapon, never worn on the body
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    house(cv.getContext('2d', { willReadFrequently: true })!, 32, 32, 2, (c) => {
      c.scale(0.5, 0.5);
      c.lineWidth = LINE.outline / 0.5;
      c.strokeStyle = SOOT;
      ICONS[id](c);
    });
    scene.textures.addCanvas(`worn-${id}`, cv);
  }
}
export { GOLD };
