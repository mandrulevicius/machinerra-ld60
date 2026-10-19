/**
 * The dusk bosses' arenas (`stage`, `plaza`, `lake` in sim/places.ts; their rules in sim/placeplay.ts `arena`), drawn in
 * code in the house style (`art.ts`): the Rustwood's Old Stage and its trees, the Hollow City's museum front, fountain,
 * statues and parked cars, the Frostspine's frozen lake, its rocks and the hangar in the glacier. Sizes (game px) go into
 * `SIZE` so `Play.place()` stands them on their feet; `arena-ice` lies flat on the ground. The view is `VIEWS` in
 * `src/places.ts` (`arenaView`). Add a prop: a `BOX` line, its drawing here, its `ARENA.props` radius (it crashes charges).
 */
import type Phaser from 'phaser';
import { COL, FLOOR, SIZE, canvas, circ, glow, grad, rivets, rr, shape, type Ctx } from './art';
import { LINE } from './house';

const BOX: Record<string, [number, number]> = {
  'arena-stage': [156, 96],
  'arena-tree': [60, 104],
  'arena-museum': [224, 132],
  'arena-fountain': [84, 52],
  'arena-statue': [38, 78],
  'arena-car': [66, 36],
  'arena-ice': [340, 230],
  'arena-rock': [50, 36],
  'arena-hangar': [224, 120],
  'arena-nave': [210, 176],
  'arena-candle': [18, 44],
  'arena-prison': [76, 100],
};

/** Which sprite stands for a part kind. */
export const ARENA_SPRITE: Record<string, string> = {
  stage: 'arena-stage', tree: 'arena-tree', museum: 'arena-museum', fountain: 'arena-fountain', statue: 'arena-statue', car: 'arena-car', rock: 'arena-rock', hangar: 'arena-hangar', nave: 'arena-nave', candle: 'arena-candle', prison: 'arena-prison',
};

function stage(c: Ctx) {
  const [w, h] = BOX['arena-stage'];
  // The boards and the skirt.
  shape(c, '#6a4326', rr(c, 6, h - 34, w - 12, 30, 3), 1.6);
  shape(c, '#8a5a32', rr(c, 4, h - 40, w - 8, 9, 2), 1.4);
  c.strokeStyle = 'rgba(29,26,23,0.5)';
  c.lineWidth = LINE.detail;
  for (let x = 14; x < w - 8; x += 12) {
    c.beginPath();
    c.moveTo(x, h - 32);
    c.lineTo(x, h - 6);
    c.stroke();
  }
  // Knuckle dents in the boards.
  for (const x of [40, 52, 100, 112]) shape(c, '#4a2e18', circ(c, x, h - 36, 2.4), 0);
  // The arch: rusted iron, a row of bulbs (two still lit), the park's sign.
  shape(c, COL.rust, rr(c, 12, 10, 8, h - 50, 2), 1.2);
  shape(c, COL.rust, rr(c, w - 20, 10, 8, h - 50, 2), 1.2);
  shape(c, COL.rust, () => {
    c.moveTo(12, 16);
    c.quadraticCurveTo(w / 2, -6, w - 12, 16);
    c.lineTo(w - 12, 24);
    c.quadraticCurveTo(w / 2, 4, 12, 24);
    c.closePath();
  }, 1.2);
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9, x = 12 + t * (w - 24), y = 20 - Math.sin(t * Math.PI) * 13;
    const lit = i === 2 || i === 6;
    shape(c, lit ? COL.glass : '#4a4038', circ(c, x, y, 2.2), 0.6);
    if (lit) glow(c, x, y, 7, 'rgba(255,217,138,0.7)');
  }
  // Red curtains, torn, hanging inside the arch.
  for (const [x0, dir] of [[20, 1], [w - 20, -1]] as const)
    shape(c, '#a02838', () => {
      c.moveTo(x0, 22);
      c.lineTo(x0 + dir * 26, 18);
      c.quadraticCurveTo(x0 + dir * 14, 40, x0 + dir * 18, h - 40);
      c.lineTo(x0, h - 40);
      c.closePath();
    }, 1);
  // Speakers on the boards.
  for (const x of [28, w - 44]) {
    shape(c, COL.black, rr(c, x, h - 62, 16, 22, 2), 1);
    shape(c, '#3a4048', circ(c, x + 8, h - 55, 4.4), 0.6);
    shape(c, '#3a4048', circ(c, x + 8, h - 45, 2.6), 0.5);
  }
  // Vines over everything.
  c.strokeStyle = '#4a7a38';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(14, 30);
  c.bezierCurveTo(30, 18, 50, 40, 70, 12);
  c.moveTo(w - 16, 50);
  c.bezierCurveTo(w - 40, 20, w - 70, 30, w - 90, 8);
  c.stroke();
}

function tree(c: Ctx) {
  const [w, h] = BOX['arena-tree'];
  shape(c, '#5a3a22', () => {
    c.moveTo(w / 2 - 6, h - 2);
    c.quadraticCurveTo(w / 2 - 3, h - 40, w / 2 - 4, 40);
    c.lineTo(w / 2 + 5, 40);
    c.quadraticCurveTo(w / 2 + 4, h - 40, w / 2 + 8, h - 2);
    c.closePath();
  }, 1.4);
  for (const [x, y, r, col] of [[w / 2 - 14, 34, 18, '#2e5a2a'], [w / 2 + 14, 30, 17, '#2e5a2a'], [w / 2, 20, 20, '#3a6e32'], [w / 2 - 6, 38, 14, '#3a6e32'], [w / 2 + 8, 42, 12, '#4a7a38']] as const)
    shape(c, col, circ(c, x, y, r), 1.2);
  c.strokeStyle = '#4a7a38';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(w / 2 - 12, 48);
  c.quadraticCurveTo(w / 2 - 16, 64, w / 2 - 10, 76);
  c.moveTo(w / 2 + 14, 50);
  c.quadraticCurveTo(w / 2 + 18, 62, w / 2 + 12, 70);
  c.stroke();
}

function museum(c: Ctx) {
  const [w, h] = BOX['arena-museum'];
  // Steps.
  for (let i = 0; i < 3; i++) shape(c, '#b8b0a4', rr(c, 8 + i * 6, h - 10 - i * 7, w - 16 - i * 12, 8, 1), 1);
  // The front: pediment, frieze, columns, the doors.
  shape(c, '#d8d0c4', rr(c, 26, 34, w - 52, h - 66, 2), 1.4);
  shape(c, '#e4dcd0', () => {
    c.moveTo(16, 36);
    c.lineTo(w / 2, 4);
    c.lineTo(w - 16, 36);
    c.closePath();
  }, 1.4);
  shape(c, '#c8c0b4', rr(c, 18, 32, w - 36, 8, 1), 1.2);
  c.fillStyle = '#5a5248';
  c.font = 'bold 8px serif';
  c.textAlign = 'center';
  c.fillText('MVSEVM', w / 2, 30);
  for (let i = 0; i < 6; i++) {
    const x = 36 + i * ((w - 72) / 5);
    shape(c, '#ece6dc', rr(c, x - 5, 42, 10, h - 76, 2), 1);
    c.strokeStyle = '#c8c0b4';
    c.lineWidth = LINE.detail;
    for (const dx of [-2, 0, 2]) {
      c.beginPath();
      c.moveTo(x + dx, 44);
      c.lineTo(x + dx, h - 36);
      c.stroke();
    }
  }
  shape(c, '#2a2622', rr(c, w / 2 - 14, h - 66, 28, 32, 2), 1);
  glow(c, w / 2, h - 50, 18, 'rgba(255,214,140,0.25)');
  // Cracks and a banner for an exhibition 300 years over.
  c.strokeStyle = 'rgba(29,26,23,0.6)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(60, 40);
  c.lineTo(66, 58);
  c.lineTo(62, 70);
  c.stroke();
  shape(c, '#a02838', rr(c, w - 64, 46, 14, 40, 1), 0.8);
  shape(c, COL.brassHi, rr(c, w - 62, 52, 10, 3, 0.5), 0);
}

function fountain(c: Ctx) {
  const [w, h] = BOX['arena-fountain'];
  shape(c, '#b8b0a4', () => c.ellipse(w / 2, h - 14, w / 2 - 3, 12, 0, 0, Math.PI * 2), 1.4);
  shape(c, '#4a6a7a', () => c.ellipse(w / 2, h - 16, w / 2 - 9, 8, 0, 0, Math.PI * 2), 0.8);
  shape(c, '#c8c0b4', rr(c, w / 2 - 5, 12, 10, h - 28, 2), 1.2);
  shape(c, '#d8d0c4', () => c.ellipse(w / 2, 14, 14, 5, 0, 0, Math.PI * 2), 1.2);
  // Dry: a rusted pipe where the water was, one drip.
  shape(c, COL.rust, rr(c, w / 2 - 1.5, 4, 3, 10, 1), 0.6);
  shape(c, '#9ad0e8', circ(c, w / 2 + 6, h - 18, 1.4), 0);
}

function statue(c: Ctx) {
  const [w, h] = BOX['arena-statue'];
  shape(c, '#b8b0a4', rr(c, 4, h - 22, w - 8, 20, 2), 1.3);
  // A bronze man looking at a phone, forever.
  const b = '#7a8a6a', bh = '#9aaa8a';
  shape(c, b, rr(c, w / 2 - 6, h - 54, 12, 30, 3), 1.2);
  shape(c, b, rr(c, w / 2 - 5, h - 26, 4, 6, 1), 0.8);
  shape(c, b, rr(c, w / 2 + 1, h - 26, 4, 6, 1), 0.8);
  shape(c, bh, circ(c, w / 2, h - 60, 6), 1.1);
  shape(c, b, () => {
    c.moveTo(w / 2 + 4, h - 50);
    c.lineTo(w / 2 + 12, h - 56);
    c.lineTo(w / 2 + 10, h - 58);
    c.lineTo(w / 2 + 3, h - 54);
    c.closePath();
  }, 0.9);
  shape(c, '#3a4048', rr(c, w / 2 + 9, h - 63, 4, 7, 1), 0.6);
  // A plaque, a lance dent.
  shape(c, COL.brass, rr(c, w / 2 - 7, h - 16, 14, 6, 1), 0.6);
  shape(c, '#6a6258', circ(c, 8, h - 10, 2), 0);
}

function car(c: Ctx) {
  const [w, h] = BOX['arena-car'];
  shape(c, '#c8ccd0', () => {
    c.moveTo(3, h - 10);
    c.lineTo(5, h - 20);
    c.lineTo(18, h - 22);
    c.lineTo(26, h - 32);
    c.lineTo(44, h - 32);
    c.lineTo(52, h - 22);
    c.lineTo(w - 3, h - 19);
    c.lineTo(w - 2, h - 10);
    c.closePath();
  }, 1.4);
  shape(c, '#3a4a5a', () => {
    c.moveTo(22, h - 22);
    c.lineTo(28, h - 29);
    c.lineTo(42, h - 29);
    c.lineTo(48, h - 22);
    c.closePath();
  }, 0.8);
  for (const x of [15, w - 15]) {
    shape(c, COL.black, circ(c, x, h - 9, 6.5), 1);
    shape(c, '#6a7480', circ(c, x, h - 9, 2.6), 0.5);
  }
  // A lance hole through the door, rust round it.
  shape(c, COL.rust, circ(c, 34, h - 16, 3.6), 0);
  shape(c, COL.black, circ(c, 34, h - 16, 2), 0);
  shape(c, COL.red, rr(c, w - 6, h - 18, 3, 3, 0.6), 0);
}

function ice(c: Ctx) {
  const [w, h] = BOX['arena-ice'];
  c.fillStyle = grad(c, 0, 0, 0, h, [[0, 'rgba(200,232,255,0.85)'], [1, 'rgba(150,200,235,0.85)']]);
  c.beginPath();
  c.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 4, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = 3;
  c.stroke();
  // Grooves from a belly slide, cracks, a few frozen bubbles.
  c.strokeStyle = 'rgba(90,130,170,0.55)';
  c.lineWidth = 1.4;
  for (const [x0, y0, x1, y1] of [[60, 140, 270, 80], [70, 150, 280, 92], [120, 60, 230, 190]]) {
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,0.7)';
  c.lineWidth = LINE.detail;
  c.beginPath();
  c.moveTo(w / 2, h / 2);
  c.lineTo(w / 2 + 30, h / 2 - 12);
  c.lineTo(w / 2 + 52, h / 2 - 6);
  c.moveTo(w / 2, h / 2);
  c.lineTo(w / 2 - 22, h / 2 + 18);
  c.stroke();
  for (const [x, y] of [[90, 90], [240, 150], [180, 50]]) {
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.beginPath();
    c.arc(x, y, 3, 0, Math.PI * 2);
    c.fill();
  }
}

function rock(c: Ctx) {
  const [w, h] = BOX['arena-rock'];
  shape(c, '#6a6a72', () => {
    c.moveTo(4, h - 4);
    c.lineTo(8, 14);
    c.lineTo(20, 6);
    c.lineTo(36, 8);
    c.lineTo(46, 18);
    c.lineTo(w - 3, h - 4);
    c.closePath();
  }, 1.4);
  shape(c, '#8a8a92', () => {
    c.moveTo(12, 14);
    c.lineTo(20, 8);
    c.lineTo(32, 10);
    c.lineTo(24, 18);
    c.closePath();
  }, 0);
  shape(c, '#eef4f8', () => {
    c.moveTo(9, 13);
    c.lineTo(20, 5);
    c.lineTo(37, 7);
    c.lineTo(30, 11);
    c.lineTo(18, 10);
    c.closePath();
  }, 0.8);
}

function hangar(c: Ctx) {
  const [w, h] = BOX['arena-hangar'];
  // The glacier around it.
  shape(c, '#dcecf8', () => {
    c.moveTo(0, h - 2);
    c.lineTo(10, 30);
    c.lineTo(50, 8);
    c.lineTo(110, 2);
    c.lineTo(170, 10);
    c.lineTo(214, 34);
    c.lineTo(w, h - 2);
    c.closePath();
  }, 1.4);
  // The door: a ribbed steel shutter half open, darkness and one red light inside.
  shape(c, '#7a828a', () => {
    c.moveTo(40, h - 2);
    c.lineTo(46, 36);
    c.quadraticCurveTo(w / 2, 14, w - 46, 36);
    c.lineTo(w - 40, h - 2);
    c.closePath();
  }, 1.6);
  shape(c, '#0a0c10', rr(c, 54, 66, w - 108, h - 68, 2), 1);
  glow(c, w / 2 + 30, h - 24, 14, 'rgba(255,48,72,0.6)');
  shape(c, COL.red, circ(c, w / 2 + 30, h - 24, 1.8), 0);
  shape(c, '#9aa4ae', rr(c, 52, 40, w - 104, 28, 2), 1.2);
  c.strokeStyle = '#6a7480';
  c.lineWidth = 1;
  for (let y = 46; y < 66; y += 5) {
    c.beginPath();
    c.moveTo(54, y);
    c.lineTo(w - 54, y);
    c.stroke();
  }
  // Stencil and hazard stripes.
  c.fillStyle = '#e4e8ec';
  c.font = 'bold 9px sans-serif';
  c.textAlign = 'center';
  c.fillText('HANGAR 7', w / 2, 34);
  for (let i = 0; i < 6; i++) shape(c, i % 2 ? COL.black : COL.amber, rr(c, 54 + i * ((w - 108) / 6), 62, (w - 108) / 6, 4, 0), 0);
  rivets(c, [[48, 40], [w - 48, 40], [46, h - 10], [w - 46, h - 10]]);
}

/** The Ether's false church (P44): the Oracle's church built backwards in black brass, a rose window of violet light. */
function nave(c: Ctx) {
  const [w, h] = BOX['arena-nave'];
  glow(c, w / 2, h / 2, w / 2, 'rgba(140,60,255,0.25)');
  shape(c, '#1a1424', rr(c, 20, 60, w - 40, h - 64, 3), 1.6, '#000000');
  shape(c, '#221a30', () => {
    c.moveTo(10, 64);
    c.lineTo(w / 2, 8);
    c.lineTo(w - 10, 64);
    c.closePath();
  }, 1.6, '#000000');
  // A spire with a crooked halo instead of a gear.
  shape(c, '#1a1424', rr(c, w / 2 - 6, 0, 12, 20, 2), 1, '#000000');
  c.strokeStyle = '#9040ff';
  c.lineWidth = 1.6;
  c.beginPath();
  c.ellipse(w / 2, 4, 9, 3, -0.3, 0.3, Math.PI * 2 - 0.2);
  c.stroke();
  // The rose window and the door, glowing violet.
  shape(c, 'rgba(150,80,255,0.8)', circ(c, w / 2, 46, 14), 1.2, '#000000');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.strokeStyle = '#1a1424';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(w / 2, 46);
    c.lineTo(w / 2 + Math.cos(a) * 14, 46 + Math.sin(a) * 14);
    c.stroke();
  }
  glow(c, w / 2, 46, 24, 'rgba(150,80,255,0.5)');
  shape(c, '#0a0610', () => {
    c.moveTo(w / 2 - 18, h - 4);
    c.lineTo(w / 2 - 18, h - 50);
    c.quadraticCurveTo(w / 2, h - 72, w / 2 + 18, h - 50);
    c.lineTo(w / 2 + 18, h - 4);
    c.closePath();
  }, 1.2, '#000000');
  glow(c, w / 2, h - 30, 22, 'rgba(150,80,255,0.4)');
  for (const x of [44, w - 52]) shape(c, 'rgba(150,80,255,0.6)', rr(c, x, 86, 10, 34, 5), 1, '#000000');
}

function candle(c: Ctx) {
  const [w, h] = BOX['arena-candle'];
  shape(c, '#2a2018', rr(c, 3, h - 8, w - 6, 6, 1), 1);
  shape(c, '#d8d0e8', rr(c, 5, 12, w - 10, h - 20, 2), 1);
  shape(c, '#b0a0ff', () => {
    c.moveTo(w / 2, 2);
    c.quadraticCurveTo(w / 2 + 5, 9, w / 2, 12);
    c.quadraticCurveTo(w / 2 - 5, 9, w / 2, 2);
    c.closePath();
  }, 0.5);
  glow(c, w / 2, 8, 9, 'rgba(170,140,255,0.8)');
}

/** The Esteemed Ghost in his cage of cold light: a polite old robot's ghost, monocle and moustache, bars of light round him. */
function prison(c: Ctx) {
  const [w, h] = BOX['arena-prison'];
  shape(c, '#2a2438', () => c.ellipse(w / 2, h - 8, w / 2 - 4, 7, 0, 0, Math.PI * 2), 1.2);
  // The ghost: a tall rounded robot, half see-through.
  glow(c, w / 2, h / 2, 34, 'rgba(180,230,255,0.35)');
  shape(c, 'rgba(220,240,255,0.55)', () => {
    c.moveTo(w / 2 - 14, h - 14);
    c.quadraticCurveTo(w / 2 - 18, 24, w / 2, 20);
    c.quadraticCurveTo(w / 2 + 18, 24, w / 2 + 14, h - 14);
    c.closePath();
  }, 1, 'rgba(80,110,160,0.8)');
  shape(c, 'rgba(220,240,255,0.6)', rr(c, w / 2 - 10, 8, 20, 16, 5), 1, 'rgba(80,110,160,0.8)');
  shape(c, '#1a2030', circ(c, w / 2 - 4, 15, 1.6), 0);
  shape(c, '#1a2030', circ(c, w / 2 + 4, 15, 1.6), 0);
  c.strokeStyle = COL.brassHi;
  c.lineWidth = LINE.detail;
  c.beginPath();
  c.arc(w / 2 + 4, 15, 3.2, 0, Math.PI * 2);
  c.moveTo(w / 2 + 7, 16);
  c.lineTo(w / 2 + 9, 24);
  c.stroke();
  c.strokeStyle = 'rgba(80,110,160,0.9)';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(w / 2 - 6, 20);
  c.quadraticCurveTo(w / 2, 18, w / 2 + 6, 20);
  c.stroke();
  // The bars: violet light, top and bottom rings.
  for (let i = 0; i < 7; i++) {
    const x = 8 + i * ((w - 16) / 6);
    c.strokeStyle = 'rgba(170,120,255,0.85)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, 4);
    c.lineTo(x, h - 10);
    c.stroke();
  }
  glow(c, w / 2, 4, 30, 'rgba(170,120,255,0.3)');
}

export function makeArenaArt(scene: Phaser.Scene) {
  Object.assign(SIZE, BOX);
  FLOOR.add('arena-ice');
  const draw = (key: string, f: (c: Ctx) => void) => canvas(scene, key, ...BOX[key], f);
  draw('arena-stage', stage);
  draw('arena-tree', tree);
  draw('arena-museum', museum);
  draw('arena-fountain', fountain);
  draw('arena-statue', statue);
  draw('arena-car', car);
  draw('arena-ice', ice);
  draw('arena-rock', rock);
  draw('arena-hangar', hangar);
  draw('arena-nave', nave);
  draw('arena-candle', candle);
  draw('arena-prison', prison);
}
