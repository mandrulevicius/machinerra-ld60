/**
 * The Ether's art (P44, the secret sixth biome): its ghosts (wisp, shade, banshee), their parts, and in the hub the Princess
 * and the Evil Oracle as NPC sprites (`npc-princess`, `npc-evilOracle`, 60x90 like `makeNpcArt`'s). The Evil Oracle as the boss
 * is Laimonas's painting (`foe/evilOracle`, unveiled `foe/evilOracle-unveiled`, Play) and in the hub `npc/evilOracle`. Ghosts are drawn half see-through, cold violet and white; Play makes them
 * flicker and fade more while nothing of yours can touch them. The Princess drawn here (a robot vacuum with a tiara, the lore's
 * vacuum princess) is only the fallback: Laimonas's paintings `npc/princess` and
 * `npc/evilOracle` in the atlas win (`npcImage`).
 */
import type Phaser from 'phaser';
import { COL, SIZE, canvas, circ, glow, rr, shape, type Ctx } from './art';
import { LINE } from './house';

const BOX: Record<string, [number, number]> = {
  'foe-wisp': [34, 36],
  'foe-shade': [30, 52],
  'foe-banshee': [36, 42],
  'part-wisp-lantern': [16, 22],
  'part-shade-cloak': [24, 22],
  'part-banshee-vent': [22, 18],
  'part-false-halo': [26, 22],
};

const VIOLET = 'rgba(176,140,255,0.55)';
const MIST = 'rgba(226,220,255,0.55)';

function eye(c: Ctx, x: number, y: number, r: number, col: string, halo: string) {
  shape(c, col, circ(c, x, y, r), 0.3);
  glow(c, x, y, r * 3.4, halo);
}

/** A sheet of mist over an old robot's face plate, a lantern eye, tatters below. */
function wisp(c: Ctx) {
  glow(c, 17, 16, 17, 'rgba(176,140,255,0.35)');
  shape(c, MIST, () => {
    c.moveTo(6, 30);
    c.quadraticCurveTo(3, 6, 17, 4);
    c.quadraticCurveTo(31, 6, 28, 30);
    for (let i = 0; i < 4; i++) c.lineTo(28 - (i + 0.5) * 5.5, i % 2 ? 30 : 35);
    c.closePath();
  }, 1, 'rgba(60,40,110,0.7)');
  shape(c, 'rgba(40,30,70,0.7)', rr(c, 10, 11, 14, 8, 3), 0.6);
  eye(c, 14, 15, 1.4, '#e0f8ff', 'rgba(140,240,255,0.7)');
  eye(c, 20, 15, 1.4, '#e0f8ff', 'rgba(140,240,255,0.7)');
}

/** A shadow person robot: tall, thin, all dark, two white points for eyes, a hint of joints. */
function shade(c: Ctx) {
  glow(c, 15, 26, 18, 'rgba(90,40,160,0.35)');
  shape(c, 'rgba(18,10,34,0.82)', () => {
    c.moveTo(9, 50);
    c.lineTo(11, 22);
    c.quadraticCurveTo(8, 12, 12, 8);
    c.quadraticCurveTo(15, 2, 19, 7);
    c.quadraticCurveTo(22, 12, 19, 22);
    c.lineTo(22, 50);
    c.closePath();
  }, 1, 'rgba(120,80,200,0.7)');
  // Long arms, hanging.
  c.strokeStyle = 'rgba(18,10,34,0.8)';
  c.lineWidth = 2.6;
  c.beginPath();
  c.moveTo(11, 20);
  c.quadraticCurveTo(5, 30, 6, 40);
  c.moveTo(19, 20);
  c.quadraticCurveTo(26, 30, 25, 40);
  c.stroke();
  eye(c, 13.6, 10, 1.1, '#ffffff', 'rgba(255,255,255,0.7)');
  eye(c, 17.4, 10, 1.1, '#ffffff', 'rgba(255,255,255,0.7)');
}

/** A banshee: a hood of steam over a gaping vent of a mouth, wisps for hands. */
function banshee(c: Ctx) {
  glow(c, 18, 18, 20, 'rgba(176,140,255,0.3)');
  shape(c, VIOLET, () => {
    c.moveTo(4, 40);
    c.quadraticCurveTo(0, 14, 18, 3);
    c.quadraticCurveTo(36, 14, 32, 40);
    c.quadraticCurveTo(25, 34, 18, 41);
    c.quadraticCurveTo(11, 34, 4, 40);
    c.closePath();
  }, 1, 'rgba(60,40,110,0.7)');
  shape(c, 'rgba(20,12,40,0.85)', () => c.ellipse(18, 18, 8, 10, 0, 0, Math.PI * 2), 0.6);
  // The vent mouth, open, a cold glow inside.
  shape(c, 'rgba(10,6,20,0.9)', () => c.ellipse(18, 23, 3.6, 4.6, 0, 0, Math.PI * 2), 0.4);
  glow(c, 18, 23, 6, 'rgba(160,230,255,0.5)');
  eye(c, 15, 15, 1, '#e0f8ff', 'rgba(140,240,255,0.7)');
  eye(c, 21, 15, 1, '#e0f8ff', 'rgba(140,240,255,0.7)');
}

/** The Evil Oracle (in a 48x62 frame): the Oracle's dark twin, black robes, a crooked black-brass halo, one red lens. */
function evilOracle(c: Ctx, unveiled: boolean) {
  glow(c, 24, 30, 30, unveiled ? 'rgba(150,60,255,0.45)' : 'rgba(120,60,200,0.3)');
  // The halo, crooked: a gear ring on a tilt, a tooth missing.
  c.save();
  c.translate(24, 9);
  c.rotate(-0.25);
  c.strokeStyle = '#2a2018';
  c.lineWidth = 3.2;
  c.beginPath();
  c.ellipse(0, 0, unveiled ? 15 : 12, unveiled ? 5.5 : 4.4, 0, 0.3, Math.PI * 2 - 0.2);
  c.stroke();
  c.strokeStyle = unveiled ? '#9040ff' : '#5a4a3a';
  c.lineWidth = 1.4;
  c.stroke();
  c.restore();
  // The robes: a boiler cloaked in black, a violet trim.
  shape(c, '#14101c', () => {
    c.moveTo(10, 60);
    c.quadraticCurveTo(8, 30, 16, 20);
    c.lineTo(32, 20);
    c.quadraticCurveTo(40, 30, 38, 60);
    c.closePath();
  }, 1.6, '#000000');
  shape(c, '#5a2a8a', rr(c, 22, 22, 4, 36, 1), 0);
  // The head: a dome of dark iron, one red lens, a cracked grille.
  shape(c, '#2a2630', circ(c, 24, 17, 7.4), 1.4, '#000000');
  eye(c, 26, 16.4, 2.2, COL.red, 'rgba(255,40,70,0.75)');
  c.strokeStyle = '#000000';
  c.lineWidth = LINE.detail;
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.moveTo(20 + i * 2.4, 20.5);
    c.lineTo(20 + i * 2.4, 23);
    c.stroke();
  }
  // Arms: in the veil they hold the censer; unveiled they are raised.
  c.strokeStyle = '#14101c';
  c.lineWidth = 3.6;
  c.beginPath();
  if (unveiled) {
    c.moveTo(16, 26);
    c.lineTo(6, 14);
    c.moveTo(32, 26);
    c.lineTo(42, 14);
  } else {
    c.moveTo(16, 26);
    c.lineTo(12, 38);
    c.moveTo(32, 26);
    c.lineTo(38, 36);
  }
  c.stroke();
  if (unveiled) {
    glow(c, 6, 13, 6, 'rgba(160,80,255,0.7)');
    glow(c, 42, 13, 6, 'rgba(160,80,255,0.7)');
  } else {
    c.strokeStyle = '#2a2018';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(38, 36);
    c.lineTo(38, 46);
    c.stroke();
    shape(c, '#3a3040', circ(c, 38, 48, 3), 0.8, '#000000');
    glow(c, 38, 48, 5, 'rgba(150,60,255,0.6)');
  }
}

/** The Princess (60x90, an NPC sprite): a round robot vacuum, white and lilac, a brass tiara, cyan lights, a side brush. */
function princess(c: Ctx) {
  c.fillStyle = 'rgba(0,0,0,0.35)';
  c.beginPath();
  c.ellipse(30, 84, 22, 5, 0, 0, Math.PI * 2);
  c.fill();
  // The body: a low disc seen from the front and a little above.
  shape(c, '#c8c0d8', () => c.ellipse(30, 74, 24, 9, 0, 0, Math.PI * 2), 1.4);
  shape(c, '#f0ecf8', () => c.ellipse(30, 68, 24, 12, 0, 0, Math.PI * 2), 1.4);
  shape(c, '#d8c8f0', () => c.ellipse(30, 66, 15, 7, 0, 0, Math.PI * 2), 0.8);
  // The bumper's lights, a smile of cyan dots.
  for (let i = 0; i < 5; i++) {
    const x = 20 + i * 5, y = 74 + Math.sin((i / 4) * Math.PI) * 2;
    shape(c, COL.cyan, circ(c, x, y, 1.1), 0);
    glow(c, x, y, 3, 'rgba(61,242,255,0.5)');
  }
  // The side brush.
  c.strokeStyle = '#8a7a9a';
  c.lineWidth = LINE.detail;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    c.beginPath();
    c.moveTo(9, 76);
    c.lineTo(9 + Math.cos(a) * 6, 76 + Math.sin(a) * 2.4);
    c.stroke();
  }
  // Two eyes on the lid, lashes, and the tiara on top.
  for (const x of [25, 35]) {
    shape(c, '#2a2438', () => c.ellipse(x, 64, 2.6, 3, 0, 0, Math.PI * 2), 0.5);
    shape(c, '#ffffff', circ(c, x + 0.8, 63, 0.9), 0);
  }
  c.strokeStyle = '#2a2438';
  c.lineWidth = LINE.detail;
  c.beginPath();
  c.moveTo(22.5, 60.5);
  c.lineTo(21.5, 59);
  c.moveTo(37.5, 60.5);
  c.lineTo(38.5, 59);
  c.stroke();
  shape(c, COL.brassHi, () => {
    c.moveTo(22, 58);
    c.lineTo(23, 50);
    c.lineTo(26.5, 54);
    c.lineTo(30, 47);
    c.lineTo(33.5, 54);
    c.lineTo(37, 50);
    c.lineTo(38, 58);
    c.closePath();
  }, 0.9);
  shape(c, '#ff70b0', circ(c, 30, 52, 1.6), 0.4);
}

export function makeEtherArt(scene: Phaser.Scene) {
  Object.assign(SIZE, BOX);
  const draw = (key: string, f: (c: Ctx) => void) => canvas(scene, key, ...BOX[key], f);
  draw('foe-wisp', wisp);
  draw('foe-shade', shade);
  draw('foe-banshee', banshee);
  draw('part-wisp-lantern', (c) => {
    shape(c, COL.brass, rr(c, 4, 2, 8, 3, 1), 0.7);
    shape(c, 'rgba(200,240,255,0.7)', rr(c, 3, 5, 10, 14, 3), 1);
    glow(c, 8, 12, 7, 'rgba(140,240,255,0.7)');
  });
  draw('part-shade-cloak', (c) => {
    shape(c, 'rgba(18,10,34,0.9)', () => {
      c.moveTo(4, 3);
      c.lineTo(20, 3);
      c.lineTo(22, 20);
      c.lineTo(16, 17);
      c.lineTo(12, 21);
      c.lineTo(8, 17);
      c.lineTo(2, 20);
      c.closePath();
    }, 1, 'rgba(120,80,200,0.8)');
  });
  draw('part-banshee-vent', (c) => {
    shape(c, '#6a7480', rr(c, 2, 4, 18, 10, 3), 1);
    shape(c, '#14101c', () => c.ellipse(11, 9, 4, 3, 0, 0, Math.PI * 2), 0.5);
    glow(c, 11, 9, 6, 'rgba(160,230,255,0.6)');
  });
  draw('part-false-halo', (c) => {
    c.strokeStyle = '#2a2018';
    c.lineWidth = 4;
    c.beginPath();
    c.ellipse(13, 11, 10, 6, -0.25, 0.3, Math.PI * 2 - 0.2);
    c.stroke();
    c.strokeStyle = '#9040ff';
    c.lineWidth = 1.6;
    c.stroke();
    glow(c, 13, 11, 10, 'rgba(150,60,255,0.4)');
  });
  // Hub sprites (the NPC size, `makeNpcArt`): plain canvas so they match the drawn NPCs.
  if (!scene.textures.exists('npc-princess')) canvas(scene, 'npc-princess', 60, 90, princess);
  // The Esteemed Ghost, free (a follower in the Ether): a tall polite old robot's ghost, monocle and moustache.
  if (!scene.textures.exists('npc-esteemedGhost'))
    canvas(scene, 'npc-esteemedGhost', 60, 90, (c) => {
      glow(c, 30, 44, 30, 'rgba(180,230,255,0.35)');
      shape(c, 'rgba(220,240,255,0.6)', () => {
        c.moveTo(16, 84);
        c.quadraticCurveTo(10, 30, 30, 26);
        c.quadraticCurveTo(50, 30, 44, 84);
        for (let i = 0; i < 4; i++) c.lineTo(44 - (i + 0.5) * 7, i % 2 ? 84 : 89);
        c.closePath();
      }, 1, 'rgba(80,110,160,0.8)');
      shape(c, 'rgba(220,240,255,0.65)', rr(c, 19, 10, 22, 18, 6), 1, 'rgba(80,110,160,0.8)');
      shape(c, '#1a2030', circ(c, 26, 18, 1.8), 0);
      shape(c, '#1a2030', circ(c, 34, 18, 1.8), 0);
      c.strokeStyle = COL.brassHi;
      c.lineWidth = 1;
      c.beginPath();
      c.arc(34, 18, 3.6, 0, Math.PI * 2);
      c.moveTo(37.5, 19);
      c.lineTo(39, 28);
      c.stroke();
      c.strokeStyle = 'rgba(80,110,160,0.9)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(24, 24);
      c.quadraticCurveTo(30, 21, 36, 24);
      c.stroke();
    });
  if (!scene.textures.exists('npc-evilOracle'))
    canvas(scene, 'npc-evilOracle', 60, 90, (c) => {
      c.save();
      c.translate(-4, 6);
      c.scale(1.4, 1.35);
      evilOracle(c, false);
      c.restore();
    });
}
