/**
 * Each land's hive (`Sim.nests`): the building its machines come out of, drawn in code in the house style (`art.ts`),
 * one per `BIOMES.<biome>.paint`, in the same 84 x 84 box as the desert's (`nest`, art.ts: a dead server rack), its
 * dark mouth low in the middle, its feet at the bottom. What the Oracle and the map call it is `BIOMES.<biome>.talk.hive`.
 * The jungle's den is a toppled theme-park mascot head grown over with vines; the city's metro stop an escalator going
 * down under a lit sign; the Frostspine's a snowed-in cell tower and its equipment hut; the Wastes' blood pit a ring
 * of black spikes round a red well; the Ether's haunt a stack of old televisions full of static.
 * Add one: a `canvas` call in `makeNestArt` and a `NEST_LOOK` line (its texture and the colour it glows awake).
 */
import type Phaser from 'phaser';
import { COL, SIZE, canvas, circ, glow, grad, rr, shape, type Ctx } from './art';
import type { BiomeDef } from './sim/defs';

/** The texture a land's hives are drawn with and the light an awake one glows. */
export const NEST_LOOK: Record<BiomeDef['paint'], { key: string; light: number }> = {
  desert: { key: 'nest', light: 0xff3048 },
  jungle: { key: 'nest-jungle', light: 0xffa040 },
  city: { key: 'nest-city', light: 0x60d0ff },
  snow: { key: 'nest-snow', light: 0xff3048 },
  demon: { key: 'nest-demon', light: 0xff2030 },
  ether: { key: 'nest-ether', light: 0xb090ff },
};

const shadow = (c: Ctx, w = 36) => {
  c.fillStyle = 'rgba(20,12,6,0.35)';
  c.beginPath();
  c.ellipse(42, 80, w, 4.5, 0, 0, Math.PI * 2);
  c.fill();
};
const led = (c: Ctx, x: number, y: number, col: string, r = 1.2) => {
  shape(c, col, circ(c, x, y, r), 0);
  glow(c, x, y, r * 4, col === COL.red ? 'rgba(255,48,72,0.45)' : 'rgba(61,242,255,0.4)');
};
const vine = (c: Ctx, pts: [number, number][], w = 2.4) => {
  c.beginPath();
  c.moveTo(...pts[0]);
  for (let i = 1; i + 1 < pts.length; i += 2) c.quadraticCurveTo(...pts[i], ...pts[i + 1]);
  c.lineCap = 'round';
  c.strokeStyle = '#1d2a14';
  c.lineWidth = w + 1.6;
  c.stroke();
  c.strokeStyle = '#4f7a34';
  c.lineWidth = w;
  c.stroke();
};
const leaf = (c: Ctx, x: number, y: number, a: number) => {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  shape(c, '#5f9a3c', () => c.ellipse(4, 0, 5, 2.4, 0, 0, Math.PI * 2), 0.8, '#1d2a14');
  c.restore();
};

export function makeNestArt(scene: Phaser.Scene) {
  const [w, h] = SIZE.nest;
  for (const l of Object.values(NEST_LOOK)) SIZE[l.key] ??= [w, h];

  // The Rustwood's den: a theme-park mascot's head (a grinning fibreglass bear, one eye still lit), fallen on its side
  // in the ferns; its open mouth is the way in. Vines over everything.
  canvas(scene, 'nest-jungle', w, h, (c) => {
    shadow(c, 38);
    shape(c, grad(c, 0, 10, 0, 82, [[0, '#e8d8b8'], [1, '#a88c64']]), () => c.ellipse(42, 50, 36, 31, 0, 0, Math.PI * 2), 2, '#1d1a17');
    for (const [x, y] of [[14, 24], [70, 24]]) {
      shape(c, '#c8b08a', circ(c, x, y, 10), 1.8, '#1d1a17');
      shape(c, '#e8a8a0', circ(c, x, y, 5), 0.8, '#1d1a17');
    }
    // A painted muzzle, the eyes (one dead, one cyan) and a big open mouth.
    shape(c, '#f4ead8', () => c.ellipse(42, 60, 20, 15, 0, 0, Math.PI * 2), 1.4, '#1d1a17');
    shape(c, '#000', () => c.ellipse(42, 64, 13, 10, 0, 0, Math.PI * 2), 0);
    glow(c, 42, 66, 12, 'rgba(255,160,64,0.5)');
    for (let i = 0; i < 4; i++) shape(c, '#fff', rr(c, 33 + i * 5, 54, 4, 4, 1), 0.6, '#1d1a17');
    shape(c, '#1d1a17', circ(c, 28, 38, 5), 0);
    shape(c, '#1d1a17', circ(c, 56, 38, 5), 0);
    led(c, 56, 38, COL.cyan, 2.4);
    c.strokeStyle = '#1d1a17';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(24, 34);
    c.lineTo(32, 42);
    c.moveTo(32, 34);
    c.lineTo(24, 42);
    c.stroke();
    // A crack and rust where the paint flaked.
    c.strokeStyle = '#6a4a2a';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(48, 20);
    c.lineTo(52, 30);
    c.lineTo(48, 34);
    c.stroke();
    vine(c, [[6, 76], [10, 50], [22, 28], [34, 14], [46, 22]]);
    vine(c, [[78, 78], [80, 56], [68, 44], [62, 30], [74, 14]], 2);
    vine(c, [[20, 80], [30, 74], [36, 78], [52, 72], [64, 80]], 2);
    for (const [x, y, a] of [[10, 52, -1], [22, 30, -0.4], [44, 20, 0.6], [70, 44, 2.6], [74, 16, -2.2], [32, 75, -0.3], [56, 74, 0.4]] as [number, number, number][]) leaf(c, x, y, a);
  });

  // The Hollow City's metro stop: a glass canopy on iron posts over an escalator going down into the dark, the line's
  // sign still lit, a turnstile beside it.
  canvas(scene, 'nest-city', w, h, (c) => {
    shadow(c, 38);
    // The pit of the stair, seen from above and in front.
    shape(c, '#1a1c22', () => {
      c.moveTo(14, 82);
      c.lineTo(20, 44);
      c.lineTo(64, 44);
      c.lineTo(70, 82);
      c.closePath();
    }, 1.8, '#000');
    for (let i = 0; i < 6; i++) {
      const y = 50 + i * 5.6, inset = 2 + i * 0.9;
      c.fillStyle = i % 2 ? '#2c3038' : '#3a3e48';
      c.fillRect(22 + inset - i * 1.2, y, 40 - inset * 2 + i * 2.4, 4);
    }
    shape(c, '#000', () => c.ellipse(42, 54, 16, 6, 0, 0, Math.PI * 2), 0);
    glow(c, 42, 56, 14, 'rgba(96,208,255,0.45)');
    // Handrails, white plastic over black.
    for (const [x0, x1] of [[18, 22], [66, 62]]) {
      c.strokeStyle = '#000';
      c.lineWidth = 4;
      c.beginPath();
      c.moveTo(x0, 82);
      c.lineTo(x1, 44);
      c.stroke();
      c.strokeStyle = COL.plastic;
      c.lineWidth = 2.2;
      c.stroke();
    }
    // The canopy: posts and a glass roof.
    for (const x of [12, 72]) shape(c, COL.iron, rr(c, x - 2, 20, 4, 60, 1.5), 1.2);
    shape(c, 'rgba(180,220,240,0.35)', () => {
      c.moveTo(6, 22);
      c.lineTo(42, 12);
      c.lineTo(78, 22);
      c.lineTo(74, 26);
      c.lineTo(10, 26);
      c.closePath();
    }, 1.6, '#1d1a17');
    // The sign: a white M on blue, glowing; and a tiny red "out of order" LED.
    shape(c, '#2a6ad8', rr(c, 30, 0, 24, 13, 2), 1.4, '#000');
    glow(c, 42, 6, 18, 'rgba(96,208,255,0.35)');
    c.strokeStyle = '#fff';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(35, 10);
    c.lineTo(37, 3);
    c.lineTo(42, 8);
    c.lineTo(47, 3);
    c.lineTo(49, 10);
    c.stroke();
    shape(c, COL.iron, rr(c, 41, 12, 2, 4, 1), 0.6);
    // A turnstile at the left, black gloss with a cyan arrow.
    shape(c, '#141418', rr(c, 0, 58, 10, 22, 2), 1.2, '#000');
    led(c, 5, 64, COL.cyan);
    led(c, 64, 30, COL.red, 1);
  });

  // The Frostspine's cell tower: a lattice mast snapped halfway, ice on every strut, panels hanging off it, and the
  // equipment hut at its foot half under the snow, its door torn open.
  canvas(scene, 'nest-snow', w, h, (c) => {
    shadow(c, 36);
    // The lattice.
    c.strokeStyle = '#000';
    c.lineWidth = 3;
    const lattice = () => {
      c.beginPath();
      c.moveTo(30, 56);
      c.lineTo(38, 6);
      c.moveTo(54, 56);
      c.lineTo(46, 6);
      for (let y = 10; y < 56; y += 9) {
        const k = (y - 6) / 50;
        c.moveTo(38 - 8 * k, y);
        c.lineTo(46 + 8 * k, y + 9);
        c.moveTo(46 + 8 * k, y);
        c.lineTo(38 - 8 * k, y + 9);
      }
    };
    lattice();
    c.stroke();
    c.strokeStyle = '#8a929c';
    c.lineWidth = 1.4;
    lattice();
    c.stroke();
    // Panels: two still up, one hanging by its cable.
    shape(c, '#e8ecf0', rr(c, 30, 8, 6, 14, 1), 1.2, '#000');
    shape(c, '#e8ecf0', rr(c, 48, 8, 6, 14, 1), 1.2, '#000');
    c.save();
    c.translate(58, 26);
    c.rotate(0.5);
    shape(c, '#e8ecf0', rr(c, 0, 0, 6, 14, 1), 1.2, '#000');
    c.restore();
    led(c, 42, 4, COL.red, 1.6);
    // The hut: grey plastic, a dark open door, snow on the roof.
    shape(c, grad(c, 0, 44, 0, 82, [[0, '#b8c0c8'], [1, '#6c747c']]), rr(c, 12, 46, 60, 34, 3), 1.8, '#000');
    shape(c, '#000', rr(c, 32, 54, 20, 26, 2), 0);
    glow(c, 42, 66, 12, 'rgba(255,48,72,0.45)');
    shape(c, '#9aa2aa', () => {
      c.moveTo(52, 54);
      c.lineTo(60, 58);
      c.lineTo(60, 82);
      c.lineTo(52, 80);
      c.closePath();
    }, 1.2, '#000');
    for (let i = 0; i < 3; i++) led(c, 18 + i * 4, 52, i === 1 ? COL.cyan : COL.red, 0.9);
    shape(c, '#f4f8ff', () => {
      c.moveTo(8, 48);
      c.quadraticCurveTo(20, 38, 42, 42);
      c.quadraticCurveTo(64, 38, 76, 48);
      c.lineTo(72, 50);
      c.lineTo(12, 50);
      c.closePath();
    }, 1.2, '#7a8ea4');
    // Icicles off the roof and a drift against the walls.
    c.fillStyle = '#dff0ff';
    for (const x of [16, 24, 60, 68]) {
      c.beginPath();
      c.moveTo(x - 2, 50);
      c.lineTo(x + 2, 50);
      c.lineTo(x, 56 + (x % 3) * 2);
      c.fill();
    }
    shape(c, '#f4f8ff', () => {
      c.moveTo(4, 82);
      c.quadraticCurveTo(12, 70, 26, 76);
      c.quadraticCurveTo(30, 82, 26, 82);
      c.closePath();
      c.moveTo(80, 82);
      c.quadraticCurveTo(74, 68, 62, 76);
      c.lineTo(62, 82);
      c.closePath();
    }, 1, '#7a8ea4');
  });

  // The Demon Wastes' blood pit: a ring of black spikes round a well of red, cables of the old world sunk into it, a
  // phone's screen glowing at the bottom.
  canvas(scene, 'nest-demon', w, h, (c) => {
    shadow(c, 40);
    shape(c, '#2a1414', () => c.ellipse(42, 64, 38, 16, 0, 0, Math.PI * 2), 2, '#000');
    shape(c, grad(c, 0, 52, 0, 76, [[0, '#ff3040'], [1, '#600810']]), () => c.ellipse(42, 64, 26, 10, 0, 0, Math.PI * 2), 1.4, '#000');
    glow(c, 42, 62, 26, 'rgba(255,40,56,0.6)');
    shape(c, '#000', () => c.ellipse(42, 64, 10, 4, 0, 0, Math.PI * 2), 0);
    shape(c, '#3df2ff', rr(c, 39, 62, 6, 3, 0.6), 0);
    // Cables dropping in.
    c.strokeStyle = COL.plastic;
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(14, 58);
    c.bezierCurveTo(22, 44, 30, 70, 36, 64);
    c.moveTo(70, 56);
    c.bezierCurveTo(62, 46, 56, 70, 50, 64);
    c.stroke();
    // The spikes: tall at the back, short in front, glossy black with a red edge.
    const spike = (x: number, base: number, tall: number, lean: number) => shape(c, grad(c, x - 4, 0, x + 4, 0, [[0, '#1a1418'], [0.6, '#3a2830'], [1, '#0a0608']]), () => {
      c.moveTo(x - 4, base);
      c.lineTo(x + lean, base - tall);
      c.lineTo(x + 4, base);
      c.closePath();
    }, 1.2, '#000');
    for (const [x, b, t, l] of [[12, 60, 30, -4], [22, 52, 44, -2], [34, 50, 52, 0], [50, 50, 50, 1], [62, 52, 42, 3], [72, 60, 30, 5]]) spike(x, b, t, l);
    for (const [x, b, t, l] of [[16, 76, 16, -2], [30, 80, 12, 0], [54, 80, 12, 1], [68, 76, 16, 2]]) spike(x, b, t, l);
    c.strokeStyle = 'rgba(255,48,72,0.7)';
    c.lineWidth = 0.8;
    c.beginPath();
    c.moveTo(34, 50);
    c.lineTo(34, 2);
    c.moveTo(50, 50);
    c.lineTo(51, 4);
    c.stroke();
  });

  // The Ether's haunt: old televisions stacked like a cairn, every screen static, one showing a face; cold mist at the
  // foot, and the bottom set's screen torn out: the way in.
  canvas(scene, 'nest-ether', w, h, (c) => {
    c.fillStyle = 'rgba(176,144,255,0.25)';
    c.beginPath();
    c.ellipse(42, 78, 40, 7, 0, 0, Math.PI * 2);
    c.fill();
    const tv = (x: number, y: number, tw: number, th: number, screen: 'static' | 'face' | 'hole', tilt = 0) => {
      c.save();
      c.translate(x + tw / 2, y + th / 2);
      c.rotate(tilt);
      c.translate(-tw / 2, -th / 2);
      shape(c, grad(c, 0, 0, 0, th, [[0, '#5a5068'], [1, '#2a2434']]), rr(c, 0, 0, tw, th, 4), 1.6, '#000');
      const sx = 4, sy = 4, sw = tw - 12, sh = th - 8;
      if (screen === 'hole') shape(c, '#000', rr(c, sx, sy, sw, sh, 5), 0);
      else {
        shape(c, '#c8c0e0', rr(c, sx, sy, sw, sh, 5), 0.8, '#000');
        c.fillStyle = 'rgba(40,30,60,0.6)';
        for (let i = 0; i < 26; i++) c.fillRect(sx + ((i * 37) % sw), sy + ((i * 23) % sh), 2, 1);
        if (screen === 'face') {
          c.fillStyle = '#2a2434';
          c.fillRect(sx + sw * 0.3, sy + sh * 0.35, 2.4, 2.4);
          c.fillRect(sx + sw * 0.62, sy + sh * 0.35, 2.4, 2.4);
          c.fillRect(sx + sw * 0.38, sy + sh * 0.68, sw * 0.28, 1.4);
        }
      }
      for (let i = 0; i < 2; i++) shape(c, COL.brass, circ(c, tw - 4, 6 + i * 6, 1.6), 0.6, '#000');
      c.restore();
    };
    tv(14, 50, 56, 30, 'hole');
    tv(10, 26, 32, 25, 'static', -0.06);
    tv(42, 28, 32, 23, 'face', 0.05);
    tv(26, 4, 30, 23, 'static', -0.1);
    // Rabbit ears on top.
    c.strokeStyle = COL.ironHi;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(41, 6);
    c.lineTo(32, 0);
    c.moveTo(43, 6);
    c.lineTo(54, 0);
    c.stroke();
    glow(c, 37, 66, 16, 'rgba(176,144,255,0.6)');
    glow(c, 56, 38, 14, 'rgba(200,190,255,0.35)');
  });
}
