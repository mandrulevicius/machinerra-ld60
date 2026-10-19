/**
 * The art of the authored places (`sim/places.ts`), drawn in code like the rest (`art.ts`): brass on soot iron, the Old
 * Way's relics against the modern world's litter. Textures at 2x, shown at half scale; sizes (game px) are added to
 * `SIZE` so `Play.place()` can stand them on their feet.
 */
import Phaser from 'phaser';
import { makeArenaArt } from './arenaart';
import { makePlaceArt36 } from './placeart36';
import { makePlaceArtQ } from './placeartq';
import { makeSpringArt } from './springart';
import { COL, SIZE, canvas, circ, glow, grad, radial, rivets, rr, shape, type Ctx } from './art';
import { LINE } from './house';

const BOX: Record<string, [number, number]> = {
  'shrine-case': [84, 92],
  'shrine-case-bare': [84, 92],
  'shrine-open': [84, 92],
  'shrine-floor': [240, 168],
  steamgun: [48, 22],
  'pilgrim-snare': [64, 44],
  'wreck-bellows': [72, 40],
  'wreck-sprocket': [112, 76],
  'grave-marker': [30, 50],
  'grave-lamp': [22, 64],
  mast: [96, 392],
  'castle-keep': [232, 250],
  'castle-tower': [64, 160],
  'vault-fridge': [64, 92],
  'vault-open': [64, 92],
  'ai-core': [22, 24],
};
Object.assign(SIZE, BOX);

/** A brass steam gun on its side, muzzle to the right, centred on (cx, cy): a copper boiler, a gauge, a long iron barrel, a wooden grip. */
function steamGun(c: Ctx, cx: number, cy: number, k = 1) {
  c.save();
  c.translate(cx, cy);
  c.scale(k, k);
  shape(c, '#6a4326', () => {
    c.moveTo(-14, 2);
    c.lineTo(-7, 2);
    c.lineTo(-5, 10);
    c.lineTo(-13, 10);
    c.closePath();
  }, 1);
  shape(c, grad(c, 0, -6, 0, 6, [[0, COL.iron], [1, COL.soot]]), rr(c, 6, -2.5, 20, 5, 2), 1);
  shape(c, COL.brassHi, rr(c, 22, -3.4, 4, 6.8, 1.5), 0.8);
  shape(c, grad(c, 0, -8, 0, 4, [[0, COL.copperHi], [0.5, COL.copper], [1, COL.rust]]), rr(c, -15, -7, 24, 11, 5), 1.2);
  shape(c, COL.brassHi, rr(c, -9, -7, 2.5, 11, 1), 0.6);
  shape(c, COL.brassHi, rr(c, 1, -7, 2.5, 11, 1), 0.6);
  shape(c, COL.steam, circ(c, -3, -9, 3), 0.9, COL.brassLo);
  c.strokeStyle = COL.soot;
  c.lineWidth = LINE.detail;
  c.beginPath();
  c.moveTo(-3, -9);
  c.lineTo(-1.6, -10.4);
  c.stroke();
  shape(c, COL.amber, rr(c, -13, -2, 15, 2.2, 1), 0);
  c.restore();
}

export function makePlaceArt(scene: Phaser.Scene) {
  makePlaceArt36(scene); // P36's places
  makeSpringArt(scene); // P31's Hot Spring
  makePlaceArtQ(scene); // P42's companions and quest places
  makeShrineArt(scene);
  makePilgrimArt(scene);
  makeWreckArt(scene);
  makeGraveyardArt(scene);
  makeMastArt(scene);
  makeCastleArt(scene);
  makeVaultArt(scene);
  makeArenaArt(scene); // the dusk bosses' arenas (arenaart.ts)
}

function makePilgrimArt(scene: Phaser.Scene) {
  // The cables of the hive, wound round the pilgrim's wheels: white plastic, black outline, a few LEDs, a chunk of black slab.
  canvas(scene, 'pilgrim-snare', ...BOX['pilgrim-snare'], (c) => {
    c.fillStyle = 'rgba(30,18,8,0.35)';
    c.beginPath();
    c.ellipse(32, 36, 28, 6, 0, 0, Math.PI * 2);
    c.fill();
    shape(c, grad(c, 0, 24, 0, 42, [[0, '#2a3038'], [1, '#0c0f12']]), () => {
      c.moveTo(2, 40);
      c.lineTo(6, 28);
      c.lineTo(18, 30);
      c.lineTo(20, 40);
      c.closePath();
    }, 1.4, '#000');
    const rope = (pts: [number, number][]) => {
      c.beginPath();
      c.moveTo(...pts[0]);
      for (let i = 1; i + 1 < pts.length; i += 2) c.quadraticCurveTo(...pts[i], ...pts[i + 1]);
      c.strokeStyle = '#000';
      c.lineWidth = 4.2;
      c.stroke();
      c.strokeStyle = COL.plastic;
      c.lineWidth = 2.4;
      c.stroke();
    };
    rope([[0, 22], [16, 10], [32, 22], [44, 34], [64, 24]]);
    rope([[6, 38], [22, 20], [38, 30], [50, 12], [62, 30]]);
    rope([[14, 40], [28, 26], [40, 40], [52, 30], [58, 42]]);
    rope([[2, 32], [24, 36], [44, 20], [60, 36], [64, 40]]);
    for (const [x, y, col] of [[16, 14, COL.red], [38, 31, COL.cyan], [50, 14, COL.red], [27, 28, COL.cyan]] as [number, number, string][]) {
      shape(c, col, circ(c, x, y, 1.5), 0.6, '#000');
      glow(c, x, y, 5, col === COL.red ? 'rgba(255,48,72,0.5)' : 'rgba(61,242,255,0.45)');
    }
  });
}

/** Level 1's wrecks (P9): a half-buried heap of hull plates under Bellows, and the toppled wall of plate and pipe that pins Sprocket. */
function makeWreckArt(scene: Phaser.Scene) {
  const plate = (c: Ctx, pts: [number, number][], from: string, to: string) =>
    shape(c, grad(c, 0, pts[0][1], 0, pts[2][1], [[0, from], [1, to]]), () => {
      c.moveTo(...pts[0]);
      for (const p of pts.slice(1)) c.lineTo(...p);
      c.closePath();
    }, 1.4, '#000');
  const shadow = (c: Ctx, cx: number, cy: number, rx: number) => {
    c.fillStyle = 'rgba(30,18,8,0.35)';
    c.beginPath();
    c.ellipse(cx, cy, rx, 6, 0, 0, Math.PI * 2);
    c.fill();
  };
  canvas(scene, 'wreck-bellows', ...BOX['wreck-bellows'], (c) => {
    shadow(c, 36, 32, 32);
    plate(c, [[4, 30], [10, 14], [30, 12], [34, 30]], '#8a6a48', '#4a3622');
    plate(c, [[26, 30], [34, 8], [56, 10], [68, 30]], '#6a5238', '#35261a');
    plate(c, [[16, 30], [22, 20], [44, 22], [50, 30]], '#a8845a', '#5a4630');
    rivets(c, [[14, 20], [40, 16], [58, 18]]);
  });
  canvas(scene, 'wreck-sprocket', ...BOX['wreck-sprocket'], (c) => {
    shadow(c, 56, 66, 52);
    plate(c, [[4, 66], [12, 24], [58, 18], [66, 66]], '#7a6246', '#3a2a1c');
    plate(c, [[48, 66], [60, 10], [100, 14], [108, 66]], '#6a5238', '#2f2216');
    plate(c, [[20, 52], [28, 36], [84, 34], [92, 52]], '#a8845a', '#5a4630');
    c.strokeStyle = '#000';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(6, 40);
    c.lineTo(108, 22);
    c.stroke();
    c.strokeStyle = COL.copper;
    c.lineWidth = 3.4;
    c.stroke();
    rivets(c, [[24, 30], [40, 28], [72, 26], [96, 24], [30, 46], [80, 44]]);
  });
}

function makeShrineArt(scene: Phaser.Scene) {
  // Both shrine textures share the plinth and the case's frame; the open one has its lid propped and the gun gone.
  const plinth = (c: Ctx) => {
    c.fillStyle = 'rgba(30,18,8,0.4)';
    c.beginPath();
    c.ellipse(42, 88, 38, 6, 0, 0, Math.PI * 2);
    c.fill();
    shape(c, grad(c, 0, 62, 0, 88, [[0, COL.ironHi], [1, COL.soot]]), rr(c, 5, 64, 74, 24, 4), 1.6);
    shape(c, grad(c, 0, 62, 0, 70, [[0, COL.brassHi], [1, COL.brassLo]]), rr(c, 3, 60, 78, 7, 2), 1.4);
    shape(c, grad(c, 0, 46, 0, 62, [[0, '#4a403a'], [1, COL.iron]]), rr(c, 9, 46, 66, 16, 2), 1.4);
    rivets(c, [[8, 63], [76, 63], [8, 84], [76, 84], [14, 49], [70, 49]]);
    // The Old Way's plaque: a gear and three lines of dots.
    shape(c, COL.brass, rr(c, 28, 71, 28, 11, 2), 1);
    c.fillStyle = COL.soot;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) c.fillRect(33 + j * 4, 73 + i * 3, 2, 1.3);
  };
  const frame = (c: Ctx) => {
    for (const x of [10, 74]) shape(c, grad(c, x - 3, 0, x + 3, 0, [[0, COL.brassLo], [0.5, COL.brassHi], [1, COL.brassLo]]), rr(c, x - 3, 14, 6, 34, 2), 1.2);
    shape(c, grad(c, 0, 44, 0, 49, [[0, COL.brassHi], [1, COL.brassLo]]), rr(c, 7, 44, 70, 5, 2), 1.2);
  };
  // The closed case: with the desert's steam gun under glass, or bare (`shrine-case-bare`: the view lays the land's own
  // shrine gun, its gear icon, inside it, places.ts).
  const closed = (key: string, gun: boolean) => canvas(scene, key, ...BOX[key], (c) => {
    plinth(c);
    // The cloth and the gun under glass.
    shape(c, '#5a1a14', rr(c, 13, 38, 58, 7, 2), 1);
    glow(c, 42, 32, 30, 'rgba(255,190,90,0.5)');
    if (gun) steamGun(c, 42, 33, 1.35);
    // Glass: pale panes with a slanting glint, and the roof.
    c.fillStyle = 'rgba(190,230,255,0.2)';
    c.fillRect(13, 15, 58, 30);
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(18, 40);
    c.lineTo(30, 18);
    c.moveTo(24, 41);
    c.lineTo(32, 26);
    c.stroke();
    frame(c);
    shape(c, grad(c, 0, 2, 0, 18, [[0, COL.brassHi], [1, COL.brassLo]]), () => {
      c.moveTo(4, 17);
      c.lineTo(42, 3);
      c.lineTo(80, 17);
      c.lineTo(76, 21);
      c.lineTo(8, 21);
      c.closePath();
    }, 1.6);
    shape(c, COL.copper, circ(c, 42, 3, 3.4), 1.2);
    shape(c, COL.brassHi, rr(c, 41, -4, 2, 6, 1), 0.8);
  });
  closed('shrine-case', true);
  closed('shrine-case-bare', false);
  canvas(scene, 'shrine-open', ...BOX['shrine-open'], (c) => {
    plinth(c);
    // The dent where it lay, the cloth, an amber afterglow.
    shape(c, '#5a1a14', rr(c, 13, 38, 58, 7, 2), 1);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(42, 41, 22, 2.5, 0, 0, Math.PI * 2);
    c.fill();
    glow(c, 42, 38, 26, 'rgba(255,190,90,0.55)');
    frame(c);
    // The lid, thrown back on its hinge at the left.
    c.save();
    c.translate(6, 19);
    c.rotate(-1.05);
    shape(c, grad(c, 0, -10, 0, 8, [[0, COL.brassHi], [1, COL.brassLo]]), () => {
      c.moveTo(-2, 0);
      c.lineTo(36, -14);
      c.lineTo(76, 0);
      c.lineTo(72, 4);
      c.lineTo(2, 4);
      c.closePath();
    }, 1.6);
    c.fillStyle = 'rgba(190,230,255,0.22)';
    c.fillRect(6, 4, 62, 24);
    c.restore();
  });
  canvas(scene, 'steamgun', ...BOX.steamgun, (c) => {
    glow(c, 24, 11, 20, 'rgba(255,200,110,0.55)');
    steamGun(c, 24, 11, 1.3);
  });
  // The floor of the shrine: dark flags with a brass ring of gear teeth inlaid, seen from above (flattened).
  canvas(scene, 'shrine-floor', ...BOX['shrine-floor'], (c) => {
    const cx = 120, cy = 84;
    c.save();
    c.translate(cx, cy);
    c.scale(1, 0.7);
    c.fillStyle = radial(c, 0, 0, 108, [[0, 'rgba(40,30,22,0.7)'], [0.8, 'rgba(40,30,22,0.55)'], [1, 'rgba(40,30,22,0)']]);
    c.beginPath();
    c.arc(0, 0, 108, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(200,150,60,0.55)';
    c.lineWidth = 2.4;
    c.beginPath();
    c.arc(0, 0, 76, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 1.2;
    c.beginPath();
    c.arc(0, 0, 60, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      c.fillStyle = 'rgba(200,150,60,0.5)';
      c.save();
      c.rotate(a);
      c.fillRect(76, -3, 8, 6);
      c.restore();
    }
    c.strokeStyle = 'rgba(200,150,60,0.28)';
    c.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      c.beginPath();
      c.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
      c.lineTo(Math.cos(a) * 60, Math.sin(a) * 60);
      c.stroke();
    }
    c.restore();
  });
}

function makeGraveyardArt(scene: Phaser.Scene) {
  // A Communicator's marker: a mound with the shovel stuck upright in it, a scrap of ribbon on the grip, and the dead antenna bent beside it.
  canvas(scene, 'grave-marker', ...BOX['grave-marker'], (c) => {
    c.fillStyle = 'rgba(40,24,10,0.35)';
    c.beginPath();
    c.ellipse(15, 46, 13, 3.6, 0, 0, Math.PI * 2);
    c.fill();
    shape(c, COL.ironHi, rr(c, 13.8, 8, 2.6, 34, 1), 1);
    shape(c, COL.iron, rr(c, 10.5, 5, 9, 4, 2), 1);
    shape(c, COL.iron, () => {
      c.moveTo(11, 33);
      c.lineTo(19.5, 33);
      c.lineTo(17.5, 42);
      c.lineTo(13, 42);
      c.closePath();
    }, 1);
    shape(c, '#9a3a2a', () => {
      c.moveTo(16.4, 10);
      c.quadraticCurveTo(22, 11, 24, 18);
      c.lineTo(22, 17);
      c.quadraticCurveTo(20, 13, 16.4, 13);
      c.closePath();
    }, 0.6);
    c.strokeStyle = COL.soot;
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(23, 44);
    c.lineTo(24, 28);
    c.quadraticCurveTo(24.5, 22, 28, 20);
    c.stroke();
    c.strokeStyle = COL.ironHi;
    c.lineWidth = 1;
    c.stroke();
    shape(c, COL.brass, circ(c, 28, 19.5, 1.8), 0.8);
  });
  // A lantern on a post, the graveyard's only light.
  canvas(scene, 'grave-lamp', ...BOX['grave-lamp'], (c) => {
    c.fillStyle = 'rgba(40,24,10,0.35)';
    c.beginPath();
    c.ellipse(11, 60, 8, 2.6, 0, 0, Math.PI * 2);
    c.fill();
    shape(c, COL.iron, rr(c, 9.5, 14, 3, 46, 1), 1);
    shape(c, COL.ironHi, rr(c, 5, 57, 12, 4, 2), 1);
    glow(c, 11, 12, 14, 'rgba(255,190,90,0.6)');
    shape(c, grad(c, 0, 4, 0, 22, [[0, COL.brassHi], [1, COL.brassLo]]), rr(c, 5, 5, 12, 17, 3), 1.2);
    shape(c, grad(c, 0, 8, 0, 20, [[0, '#fff3c4'], [1, COL.amber]]), rr(c, 7.5, 8, 7, 11, 2), 0.6);
    shape(c, COL.iron, () => {
      c.moveTo(4, 6);
      c.lineTo(11, 0);
      c.lineTo(18, 6);
      c.closePath();
    }, 1);
  });
}

function makeMastArt(scene: Phaser.Scene) {
  // A phone mast: a lattice tower of pale steel gone to rust, platforms with antenna panels, a dish, a red beacon, a ladder
  // up one leg. Foot at the bottom centre; the tower is 48 px wide at its base, tapering to 12.
  canvas(scene, 'mast', ...BOX.mast, (c) => {
    const cx = 48, base = 384, top = 40;
    const half = (y: number) => 6 + ((y - top) / (base - top)) * 18;
    c.fillStyle = 'rgba(30,18,8,0.35)';
    c.beginPath();
    c.ellipse(cx, base + 3, 34, 7, 0, 0, Math.PI * 2);
    c.fill();
    shape(c, grad(c, 0, base - 12, 0, base + 6, [[0, '#8a8a84'], [1, '#4a4844']]), rr(c, cx - 30, base - 10, 60, 14, 3), 1.6);
    const steel = grad(c, cx - 30, 0, cx + 30, 0, [[0, '#7c848c'], [0.5, '#d4dae0'], [1, '#7c848c']]);
    const bar = (x0: number, y0: number, x1: number, y1: number, w = 2.4) => {
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.strokeStyle = COL.soot;
      c.lineWidth = w + 1.6;
      c.stroke();
      c.strokeStyle = steel;
      c.lineWidth = w;
      c.stroke();
    };
    // The lattice: zigzag bracing between two legs.
    for (let y = base - 10; y > top + 18; y -= 28) {
      const y2 = y - 28;
      bar(cx - half(y), y, cx + half(y2), y2, 1.6);
      bar(cx + half(y), y, cx - half(y2), y2, 1.6);
      bar(cx - half(y2), y2, cx + half(y2), y2, 1.8);
    }
    bar(cx - half(base - 10), base - 10, cx - half(top), top, 3.4);
    bar(cx + half(base - 10), base - 10, cx + half(top), top, 3.4);
    // Rust where the weather gets in, and a ladder on the right leg.
    c.globalAlpha = 0.5;
    for (const [y, h] of [[330, 40], [210, 30], [120, 24]] as [number, number][]) shape(c, COL.rust, rr(c, cx - half(y) - 1, y, 5, h, 2), 0);
    c.globalAlpha = 1;
    c.strokeStyle = COL.brassLo;
    c.lineWidth = 1.2;
    for (let y = base - 24; y > base - 150; y -= 9) {
      c.beginPath();
      c.moveTo(cx + half(y) - 7, y);
      c.lineTo(cx + half(y) + 1, y);
      c.stroke();
    }
    // Platforms with antenna panels (white plastic) and a dish.
    for (const y of [250, 168, 96]) {
      const w = half(y) + 7;
      shape(c, grad(c, 0, y - 3, 0, y + 3, [[0, '#b8c0c8'], [1, '#5a5e62']]), rr(c, cx - w, y - 2.5, w * 2, 5, 1.5), 1.2);
      for (const sx of [-1, 1]) shape(c, grad(c, 0, y - 24, 0, y, [[0, '#f4f6f8'], [1, '#b8c0c8']]), rr(c, cx + sx * w - 3, y - 25, 6, 23, 1.5), 1);
    }
    shape(c, grad(c, 0, 0, 40, 40, [[0, '#f4f6f8'], [1, '#9aa2aa']]), () => c.ellipse(cx + 22, 128, 15, 9, -0.4, 0, Math.PI * 2), 1.4);
    bar(cx + half(128), 128, cx + 18, 128, 1.4);
    // The head: a panel stack, a spike, the beacon.
    shape(c, grad(c, cx - 8, 0, cx + 8, 0, [[0, '#9aa2aa'], [0.5, '#f4f6f8'], [1, '#9aa2aa']]), rr(c, cx - 8, top - 22, 16, 26, 2), 1.4);
    bar(cx, top - 22, cx, 8, 2);
    shape(c, '#5a0c14', circ(c, cx, 7, 4.2), 1.2);
    shape(c, COL.red, circ(c, cx, 7, 2.6), 0);
  });
}

/**
 * The Harbinger's castle (the Demon Wastes): a keep stacked from the old world's server racks, gone black and rusted,
 * battlements and a bat-winged spire, red light in the slits and behind the portcullis; towers to match.
 */
function makeCastleArt(scene: Phaser.Scene) {
  const STONE = '#2c2226', STONE_HI = '#5a4448', STONE_LO = '#140e10', EMBER = '#ff2a3c';
  /** A rack face: vertical bays with tiny status lights (most dead, a few still red). */
  const rack = (c: Ctx, x: number, y: number, w: number, h: number, seed: number) => {
    shape(c, grad(c, x, 0, x + w, 0, [[0, STONE_LO], [0.5, STONE], [1, STONE_LO]]), rr(c, x, y, w, h, 2), 1.4);
    c.strokeStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = 1;
    for (let yy = y + 8; yy < y + h - 4; yy += 9) {
      c.beginPath();
      c.moveTo(x + 3, yy);
      c.lineTo(x + w - 3, yy);
      c.stroke();
    }
    let k = seed;
    for (let yy = y + 5; yy < y + h - 4; yy += 9)
      for (let xx = x + 5; xx < x + w - 4; xx += 7) {
        k = (k * 16807) % 2147483647;
        const v = k / 2147483647;
        if (v < 0.12) shape(c, v < 0.04 ? '#60ff90' : EMBER, rr(c, xx, yy, 2, 1.6, 0.5), 0);
      }
  };
  const merlons = (c: Ctx, x: number, y: number, w: number) => {
    for (let xx = x; xx < x + w - 4; xx += 12) shape(c, STONE, rr(c, xx, y - 8, 8, 10, 1), 1.2);
  };
  const slit = (c: Ctx, x: number, y: number, h = 14) => {
    glow(c, x, y + h / 2, 10, 'rgba(255,42,60,0.45)');
    shape(c, EMBER, rr(c, x - 2, y, 4, h, 2), 0.8, STONE_LO);
  };
  const W = BOX['castle-keep'][0], H = BOX['castle-keep'][1];
  canvas(scene, 'castle-keep', W, H, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath();
    c.ellipse(W / 2, H - 14, W / 2 - 6, 13, 0, 0, Math.PI * 2);
    c.fill();
    // Side turrets with spiked cones.
    for (const x of [14, W - 58]) {
      rack(c, x, 70, 44, H - 84, x * 31 + 7);
      merlons(c, x, 70, 44);
      shape(c, grad(c, x, 0, x + 44, 0, [[0, STONE_LO], [0.6, STONE_HI], [1, STONE_LO]]), () => {
        c.moveTo(x - 4, 64);
        c.lineTo(x + 22, 14);
        c.lineTo(x + 48, 64);
        c.closePath();
      }, 1.4);
      slit(c, x + 22, 100);
      slit(c, x + 22, 140);
    }
    // The body.
    rack(c, 50, 92, W - 100, H - 106, 991);
    merlons(c, 50, 92, W - 100);
    // The spire: a tall rack crowned with bat wings and a horned cap.
    rack(c, W / 2 - 22, 30, 44, 70, 4421);
    for (const s of [-1, 1]) {
      shape(c, '#4a1c24', () => {
        c.moveTo(W / 2 + s * 18, 40);
        c.lineTo(W / 2 + s * 70, 18);
        c.lineTo(W / 2 + s * 58, 34);
        c.lineTo(W / 2 + s * 66, 46);
        c.lineTo(W / 2 + s * 46, 44);
        c.lineTo(W / 2 + s * 46, 58);
        c.closePath();
      }, 1.3);
      shape(c, STONE_HI, () => {
        c.moveTo(W / 2 + s * 10, 32);
        c.quadraticCurveTo(W / 2 + s * 22, 20, W / 2 + s * 16, 6);
        c.quadraticCurveTo(W / 2 + s * 12, 20, W / 2 + s * 2, 30);
        c.closePath();
      }, 1.2);
    }
    shape(c, STONE, rr(c, W / 2 - 26, 26, 52, 10, 2), 1.4);
    slit(c, W / 2 - 8, 52, 10);
    slit(c, W / 2 + 8, 52, 10);
    // The gate: an arch of red light behind a portcullis.
    const gx = W / 2, gy = H - 20;
    glow(c, gx, gy - 30, 46, 'rgba(255,32,56,0.5)');
    shape(c, '#2a0408', () => {
      c.moveTo(gx - 26, gy);
      c.lineTo(gx - 26, gy - 40);
      c.quadraticCurveTo(gx, gy - 72, gx + 26, gy - 40);
      c.lineTo(gx + 26, gy);
      c.closePath();
    }, 2, STONE_LO);
    shape(c, 'rgba(255,40,60,0.55)', () => c.ellipse(gx, gy - 18, 18, 22, 0, 0, Math.PI * 2), 0);
    c.strokeStyle = STONE_LO;
    c.lineWidth = 2.4;
    c.beginPath();
    for (let x = gx - 20; x <= gx + 20; x += 8) {
      c.moveTo(x, gy - 50 + Math.abs(x - gx) * 0.5);
      c.lineTo(x, gy);
    }
    for (let y = gy - 40; y < gy; y += 10) {
      c.moveTo(gx - 24, y);
      c.lineTo(gx + 24, y);
    }
    c.stroke();
    for (const [x, y] of [[80, 130], [W - 80, 130], [80, 175], [W - 80, 175], [W / 2 - 42, 120], [W / 2 + 42, 120]]) slit(c, x, y);
  });
  const TW = BOX['castle-tower'][0], TH = BOX['castle-tower'][1];
  canvas(scene, 'castle-tower', TW, TH, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath();
    c.ellipse(TW / 2, TH - 8, TW / 2 - 4, 7, 0, 0, Math.PI * 2);
    c.fill();
    rack(c, 10, 50, TW - 20, TH - 58, 77);
    merlons(c, 10, 50, TW - 20);
    shape(c, grad(c, 6, 0, TW - 6, 0, [[0, STONE_LO], [0.6, STONE_HI], [1, STONE_LO]]), () => {
      c.moveTo(4, 44);
      c.lineTo(TW / 2, 4);
      c.lineTo(TW - 4, 44);
      c.closePath();
    }, 1.4);
    slit(c, TW / 2, 72);
    slit(c, TW / 2, 108);
  });
}

/**
 * The Core Vault's smart icebox (P17): a tall, faded cream cabinet with a dead little screen, magnets that no longer hold
 * anything up and a door that still wants to be shut. Closed, a cold blue light leaks round the seam; open, the door hangs
 * on its hinge and the shelf inside holds the empty cradle where the core sat.
 */
function makeVaultArt(scene: Phaser.Scene) {
  // An AI core as loot: a small brass cage round a cold blue sphere, three cable ends below.
  canvas(scene, 'ai-core', ...BOX['ai-core'], (c) => {
    glow(c, 11, 10, 11, 'rgba(61,242,255,0.5)');
    for (const x of [7, 11, 15]) {
      c.strokeStyle = COL.soot;
      c.lineWidth = 2.6;
      c.beginPath();
      c.moveTo(x, 17);
      c.lineTo(x + (x - 11) * 0.4, 23);
      c.stroke();
      c.strokeStyle = COL.cyan;
      c.lineWidth = 1.2;
      c.stroke();
    }
    shape(c, grad(c, 4, 2, 18, 16, [[0, '#e8fdff'], [0.45, COL.cyan], [1, '#157a88']]), circ(c, 11, 10, 7), 1.2);
    c.strokeStyle = COL.brassHi;
    c.lineWidth = 1.1;
    c.beginPath();
    c.ellipse(11, 10, 7.6, 3, 0, 0, Math.PI * 2);
    c.moveTo(11, 2.4);
    c.quadraticCurveTo(15, 10, 11, 17.6);
    c.moveTo(11, 2.4);
    c.quadraticCurveTo(7, 10, 11, 17.6);
    c.stroke();
  });
  const body = (c: Ctx) => {
    c.fillStyle = 'rgba(30,18,8,0.4)';
    c.beginPath();
    c.ellipse(32, 88, 28, 5, 0, 0, Math.PI * 2);
    c.fill();
    shape(c, grad(c, 8, 0, 56, 0, [[0, '#d9d3c4'], [0.6, '#c6bfae'], [1, '#9c9484']]), rr(c, 8, 6, 48, 80, 6), 1.6);
    shape(c, COL.iron, rr(c, 11, 84, 8, 5, 1), 1);
    shape(c, COL.iron, rr(c, 45, 84, 8, 5, 1), 1);
    // Rust where the weather got in, and the dents of a long wait.
    c.fillStyle = 'rgba(138,74,38,0.35)';
    c.fillRect(10, 74, 20, 10);
    c.fillRect(44, 20, 10, 6);
  };
  const screen = (c: Ctx, lit: boolean) => {
    shape(c, COL.black, rr(c, 20, 14, 24, 11, 2), 1.2);
    if (lit) {
      c.fillStyle = COL.amber;
      for (let j = 0; j < 3; j++) c.fillRect(23 + j * 6, 18, 4, 3);
      glow(c, 32, 19, 16, 'rgba(255,182,64,0.45)');
    }
  };
  canvas(scene, 'vault-fridge', ...BOX['vault-fridge'], (c) => {
    body(c);
    // The door, a freezer line, two handles, magnets.
    shape(c, grad(c, 0, 28, 0, 84, [[0, '#cfc8b8'], [1, '#b0a998']]), rr(c, 11, 28, 42, 55, 3), 1.2);
    c.strokeStyle = COL.soot;
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(11, 46);
    c.lineTo(53, 46);
    c.stroke();
    shape(c, COL.brassHi, rr(c, 46, 32, 3, 10, 1.4), 0.8);
    shape(c, COL.brassHi, rr(c, 46, 52, 3, 18, 1.4), 0.8);
    shape(c, COL.red, circ(c, 20, 58, 2.6), 0.8);
    shape(c, COL.cyan, rr(c, 26, 62, 6, 5, 1), 0.8);
    screen(c, true);
    // The cold light along the seam: the core is still on.
    glow(c, 53, 56, 12, 'rgba(61,242,255,0.4)');
    c.fillStyle = 'rgba(160,240,255,0.7)';
    c.fillRect(52.5, 30, 1.2, 52);
  });
  canvas(scene, 'vault-open', ...BOX['vault-open'], (c) => {
    body(c);
    // The inside: pale blue light, two shelves, the empty cradle with its cables.
    shape(c, grad(c, 0, 28, 0, 84, [[0, '#9fe6f2'], [1, '#2a5b66']]), rr(c, 11, 28, 42, 55, 3), 1.2);
    c.strokeStyle = COL.soot;
    c.lineWidth = LINE.detail;
    for (const y of [44, 62]) {
      c.beginPath();
      c.moveTo(12, y);
      c.lineTo(52, y);
      c.stroke();
    }
    shape(c, COL.iron, rr(c, 24, 47, 16, 12, 3), 1);
    for (const x of [27, 32, 37]) {
      c.strokeStyle = COL.cyan;
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(x, 59);
      c.quadraticCurveTo(x + 2, 66, x - 2, 74);
      c.stroke();
    }
    glow(c, 32, 53, 18, 'rgba(61,242,255,0.5)');
    screen(c, false);
    // The door, swung back on the left hinge.
    shape(c, grad(c, 0, 28, 0, 84, [[0, '#cfc8b8'], [1, '#b0a998']]), () => {
      c.moveTo(11, 28);
      c.lineTo(2, 24);
      c.lineTo(2, 80);
      c.lineTo(11, 83);
      c.closePath();
    }, 1.2);
    shape(c, COL.brassHi, rr(c, 3.5, 40, 2, 16, 1), 0.8);
  });
}
