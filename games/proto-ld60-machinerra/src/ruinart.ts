/**
 * The old tech each biome leaves lying about (`BIOMES[...].ruins`, `RUIN_FINDS`): drawn in code like the desert's car,
 * phone, dish and panel (`art.ts`), each on a mound of its own ground. Jungle: a carousel horse, a trail camera, a golf
 * cart. City: a shopping cart, a traffic light, a vending machine. Mountains: a snowmobile, a cable car, skis. The live
 * ones' glow, hum and decode ring are `LiveRuins`, below.
 */
import type Phaser from 'phaser';
import { COL, SIZE, canvas, circ, grad, rr, shape, type Ctx } from './art';
import { LINE } from './house';
import { WEAR, wearItem } from './itemwear';
import { ViewBase, type PlayHost } from './playhost';
import { RUIN_FINDS } from './sim/defs';
import type { SimEvent } from './sim/sim';

export const RUIN_SIZE: Record<string, [number, number]> = {
  carousel: [64, 84], trailcam: [44, 64], golfcart: [92, 62],
  cart: [64, 52], trafficlight: [40, 96], vending: [56, 84],
  snowmobile: [96, 52], gondola: [72, 80], skis: [56, 72],
  dock: [56, 64],
};

const MUD = '#4a3a22', RUBBLE = '#6e6a64', SNOW = '#eef4fa';
const mound = (c: Ctx, x: number, y: number, rx: number, col: string) => shape(c, col, () => c.ellipse(x, y, rx, 7, 0, 0, Math.PI * 2), 0);
/** Vines over a ruin: a few green curls. */
function vines(c: Ctx, pts: [number, number, number, number][]) {
  c.strokeStyle = '#3f7a2a';
  c.lineWidth = 1.6;
  for (const [x0, y0, x1, y1] of pts) {
    c.beginPath();
    c.moveTo(x0, y0);
    c.bezierCurveTo(x0 + 8, y0 + 4, x1 - 8, y1 - 4, x1, y1);
    c.stroke();
    shape(c, '#5aa83a', () => c.ellipse(x1, y1, 3, 2, 0.6, 0, Math.PI * 2), 0.6);
  }
}

/** How each ruin wears (`itemwear.ts`): its `WEAR` row and how hard; the rust and dents keep off the mound at its foot. */
export const RUIN_WEAR: Record<string, [string, number]> = {
  carousel: ['paint', 0.8], trailcam: ['wood', 0.8], golfcart: ['paint', 1], cart: ['iron', 1], trafficlight: ['iron', 1], vending: ['paint', 1],
  snowmobile: ['paint', 1], gondola: ['paint', 1], skis: ['wood', 0.8], dock: ['iron', 0.8],
  car: ['paint', 1.2], phone: ['paint', 0.7], dish: ['iron', 0.9], panel: ['iron', 0.9],
};
/** The ruins that sit in a snow bank (a bigger mound: the wear keeps higher). */
const SNOWY = new Set(['snowmobile', 'gondola', 'skis']);
/** A ruin's wear, laid over its drawing (`wearItem`), seeded by its key. */
export function wornRuin(c: Ctx, key: string, w: number, h: number) {
  const [look, amount] = RUIN_WEAR[key] ?? ['iron', 1];
  wearItem(c, w, h, key, WEAR[look], amount, SNOWY.has(key) ? [0.05, 0.55] : [0.05, 0.78]);
}

export function makeRuinArt(scene: Phaser.Scene) {
  Object.assign(SIZE, RUIN_SIZE); // here, not at load: art.ts imports this file
  const art = (key: string, draw: (c: Ctx) => void) =>
    canvas(scene, key, ...RUIN_SIZE[key], (c) => {
      draw(c);
      wornRuin(c, key, RUIN_SIZE[key][0], RUIN_SIZE[key][1]);
    });

  // ---------- jungle ----------
  art('carousel', (c) => {
    // A theme-park carousel horse, fallen from its ride, its brass pole still through it.
    mound(c, 32, 78, 28, MUD);
    c.save();
    c.translate(32, 50);
    c.rotate(-0.25);
    shape(c, grad(c, -3, 0, 3, 0, [[0, COL.brassHi], [1, COL.brassLo]]), rr(c, -2.5, -44, 5, 72, 2), 1);
    shape(c, '#e8dccb', () => {
      c.moveTo(-20, 4);
      c.quadraticCurveTo(-18, -12, 2, -10);
      c.lineTo(12, -24);
      c.quadraticCurveTo(22, -22, 20, -12);
      c.lineTo(14, -6);
      c.quadraticCurveTo(16, 8, 4, 10);
      c.lineTo(-16, 10);
      c.closePath();
    }, 1.4);
    shape(c, '#c04848', rr(c, -8, -12, 12, 6, 2), 1); // the saddle
    shape(c, COL.rust, () => c.ellipse(-10, 4, 5, 3, 0, 0, Math.PI * 2), 0);
    shape(c, '#e8dccb', rr(c, -16, 8, 4, 12, 2), 1);
    shape(c, '#e8dccb', rr(c, 6, 8, 4, 10, 2), 1);
    shape(c, COL.soot, circ(c, 14, -18, 1.4), 0);
    c.restore();
    vines(c, [[10, 72, 22, 56], [50, 74, 44, 50], [34, 20, 40, 34]]);
  });
  art('trailcam', (c) => {
    // A camouflage trail camera strapped to a rotten post: it watched the animals, then the animals watched back.
    mound(c, 22, 58, 18, MUD);
    shape(c, '#6a4a2a', rr(c, 17, 14, 10, 46, 2), 1.2);
    shape(c, '#556b3a', rr(c, 9, 20, 26, 22, 4), 1.4);
    shape(c, '#3d4f2a', () => c.ellipse(16, 26, 5, 3, 0.4, 0, Math.PI * 2), 0);
    shape(c, '#6f7f45', () => c.ellipse(28, 36, 5, 3, -0.3, 0, Math.PI * 2), 0);
    shape(c, COL.black, circ(c, 22, 31, 5), 1);
    shape(c, '#26394a', circ(c, 22, 31, 3), 0);
    shape(c, COL.red, circ(c, 30, 24, 1.4), 0);
    shape(c, COL.soot, rr(c, 9, 26, 26, 3, 1), 0);
    vines(c, [[18, 56, 12, 44], [26, 52, 34, 46]]);
  });
  art('golfcart', (c) => {
    // A park's golf cart, its canopy caved in, the jungle growing through the seats.
    mound(c, 46, 56, 42, MUD);
    shape(c, COL.ironHi, rr(c, 22, 8, 4, 34, 1), 1);
    shape(c, COL.ironHi, rr(c, 68, 12, 4, 30, 1), 1);
    shape(c, '#e6e2d6', () => {
      c.moveTo(14, 12);
      c.lineTo(78, 6);
      c.lineTo(82, 14);
      c.lineTo(18, 20);
      c.closePath();
    }, 1.4);
    shape(c, grad(c, 0, 30, 0, 50, [[0, '#f0ece2'], [1, '#a8a294']]), () => {
      c.moveTo(8, 48);
      c.lineTo(12, 32);
      c.lineTo(80, 32);
      c.lineTo(86, 48);
      c.closePath();
    }, 1.6);
    shape(c, '#2a4a2a', rr(c, 30, 26, 30, 8, 2), 1);
    shape(c, COL.soot, circ(c, 24, 48, 7), 1.4);
    shape(c, COL.soot, circ(c, 70, 48, 7), 1.4);
    vines(c, [[30, 28, 40, 12], [52, 30, 60, 16], [10, 46, 6, 36], [84, 44, 88, 32]]);
  });

  // ---------- city ----------
  art('cart', (c) => {
    // A shopping cart on its side: the old world's chariot of plenty.
    mound(c, 32, 46, 28, RUBBLE);
    c.strokeStyle = '#b8c0c8';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(8, 12);
    c.lineTo(52, 8);
    c.lineTo(48, 38);
    c.lineTo(14, 40);
    c.closePath();
    for (let x = 14; x < 52; x += 6) {
      c.moveTo(x, 10 - (x - 8) * 0.09);
      c.lineTo(x - 2, 40);
    }
    for (let y = 18; y < 40; y += 6) {
      c.moveTo(10 + (y - 12) * 0.2, y);
      c.lineTo(51 - (y - 8) * 0.13, y - 1);
    }
    c.stroke();
    shape(c, '#c03030', rr(c, 50, 4, 12, 4, 2), 1); // the handle
    shape(c, COL.soot, circ(c, 18, 44, 3.5), 1);
    shape(c, COL.soot, circ(c, 44, 42, 3.5), 1);
  });
  art('trafficlight', (c) => {
    // A traffic light, bent, its red still faintly lit: the old world's commandments, in three colours.
    mound(c, 20, 90, 16, RUBBLE);
    c.save();
    c.translate(20, 90);
    c.rotate(0.12);
    shape(c, '#5a6068', rr(c, -2.5, -60, 5, 60, 2), 1.2);
    shape(c, '#1c2024', rr(c, -9, -86, 18, 34, 3), 1.6, '#000');
    shape(c, '#ff4040', circ(c, 0, -78, 4), 0.8, '#000');
    shape(c, '#5a4a14', circ(c, 0, -69, 4), 0.8, '#000');
    shape(c, '#14402a', circ(c, 0, -60, 4), 0.8, '#000');
    c.restore();
    shape(c, 'rgba(255,80,80,0.25)', circ(c, 29, 12, 8), 0);
  });
  art('vending', (c) => {
    // A vending machine, glass cracked, the last cans still inside: the old world's offering box.
    mound(c, 28, 78, 26, RUBBLE);
    c.save();
    c.translate(28, 76);
    c.rotate(-0.08);
    shape(c, grad(c, -20, 0, 20, 0, [[0, '#d03a30'], [1, '#8a2018']]), rr(c, -20, -70, 40, 70, 3), 1.6, '#000');
    shape(c, '#1a2a36', rr(c, -16, -64, 22, 50, 2), 1);
    const cans = ['#e04040', '#40a0e0', '#e0c040', '#60c060'];
    for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) shape(c, cans[(r + k) % 4], rr(c, -14 + k * 7, -60 + r * 12, 5, 8, 1), 0.6);
    c.strokeStyle = 'rgba(220,240,255,0.6)';
    c.lineWidth = LINE.detail;
    c.beginPath();
    c.moveTo(-6, -40);
    c.lineTo(-14, -56);
    c.moveTo(-6, -40);
    c.lineTo(4, -30);
    c.stroke();
    shape(c, '#c8c8c8', rr(c, 9, -56, 7, 16, 1), 1);
    shape(c, COL.soot, rr(c, -14, -10, 22, 6, 1), 0.8);
    c.restore();
  });

  // ---------- mountains ----------
  art('snowmobile', (c) => {
    // A snowmobile half under a drift: a sled that needed no dogs, and so no friends.
    shape(c, '#2a2a2e', rr(c, 8, 40, 80, 4, 2), 1); // the ski
    shape(c, grad(c, 0, 14, 0, 40, [[0, '#f0c020'], [1, '#a07810']]), () => {
      c.moveTo(10, 40);
      c.quadraticCurveTo(12, 22, 30, 20);
      c.lineTo(52, 18);
      c.lineTo(84, 30);
      c.lineTo(86, 40);
      c.closePath();
    }, 1.6);
    shape(c, 'rgba(160,210,240,0.6)', () => {
      c.moveTo(30, 20);
      c.lineTo(36, 8);
      c.lineTo(42, 19);
      c.closePath();
    }, 1);
    shape(c, COL.soot, rr(c, 44, 14, 30, 7, 3), 1.2); // the seat
    shape(c, '#2a2a2e', rr(c, 34, 12, 3, 8, 1), 1);
    shape(c, SNOW, () => c.ellipse(64, 44, 36, 10, 0, 0, Math.PI * 2), 0);
    shape(c, SNOW, () => c.ellipse(80, 34, 14, 8, 0, 0, Math.PI * 2), 0);
  });
  art('gondola', (c) => {
    // A cable car, fallen from the lift line, its cable still hanging from the roof hook.
    mound(c, 36, 74, 32, SNOW);
    c.strokeStyle = '#3a3a3a';
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(36, 4);
    c.lineTo(36, 18);
    c.moveTo(20, 4);
    c.lineTo(56, 8);
    c.stroke();
    c.save();
    c.translate(36, 46);
    c.rotate(0.14);
    shape(c, grad(c, 0, -26, 0, 26, [[0, '#d83a2a'], [1, '#8a2018']]), rr(c, -26, -26, 52, 50, 6), 1.6, '#000');
    for (const x of [-20, -4, 12]) shape(c, 'rgba(170,215,240,0.75)', rr(c, x, -20, 12, 18, 2), 1);
    shape(c, '#e8e8e8', rr(c, -26, 6, 52, 4, 1), 0.8);
    c.restore();
    shape(c, SNOW, () => c.ellipse(20, 70, 16, 6, 0, 0, Math.PI * 2), 0);
  });
  art('skis', (c) => {
    // A pair of skis and poles stuck in the snow: someone meant to come back for them.
    mound(c, 28, 66, 24, SNOW);
    const ski = (x: number, rot: number, col: string) => {
      c.save();
      c.translate(x, 64);
      c.rotate(rot);
      shape(c, col, () => {
        c.moveTo(-3, 0);
        c.lineTo(-3, -50);
        c.quadraticCurveTo(0, -60, 3, -50);
        c.lineTo(3, 0);
        c.closePath();
      }, 1.2);
      shape(c, '#2a2a2e', rr(c, -3.5, -26, 7, 6, 1), 0.8);
      c.restore();
    };
    ski(22, -0.18, '#2a7ad0');
    ski(32, 0.14, '#d03a7a');
    c.strokeStyle = '#a0a8b0';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(10, 64);
    c.lineTo(6, 18);
    c.moveTo(46, 64);
    c.lineTo(50, 20);
    c.stroke();
    shape(c, COL.soot, circ(c, 6, 18, 2), 0.6);
    shape(c, COL.soot, circ(c, 50, 20, 2), 0.6);
    shape(c, SNOW, () => c.ellipse(28, 62, 22, 5, 0, 0, Math.PI * 2), 0);
  });

  // ---------- any land (P58 H) ----------
  art('dock', (c) => {
    // An old charging dock: a round bay in the floor, two brass contacts, a post with its one lamp still lit. The old world's berth for something that came home each night.
    mound(c, 28, 56, 24, RUBBLE);
    shape(c, '#2c2824', () => c.ellipse(28, 52, 21, 8, 0, 0, Math.PI * 2), 1.2); // the bay
    shape(c, grad(c, 8, 0, 48, 0, [[0, COL.brassHi], [1, COL.brassLo]]), () => c.ellipse(28, 52, 21, 8, 0, 0, Math.PI * 2), 0.8); // its brass rim
    shape(c, '#1c1916', () => c.ellipse(28, 52, 16, 5.5, 0, 0, Math.PI * 2), 0);
    shape(c, COL.brassHi, rr(c, 21, 45, 4, 9, 1), 1); // the contacts
    shape(c, COL.brassHi, rr(c, 31, 45, 4, 9, 1), 1);
    shape(c, '#5a6068', rr(c, 24, 18, 8, 34, 2), 1.2); // the post
    shape(c, grad(c, 0, 4, 0, 22, [[0, '#6a7078'], [1, '#3a3e44']]), rr(c, 17, 4, 22, 17, 4), 1.4); // its housing
    shape(c, 'rgba(120,255,150,0.28)', circ(c, 28, 12, 9), 0); // the lamp's glow
    shape(c, '#7dff9a', circ(c, 28, 12, 4), 0.8);
    shape(c, '#e8ffee', circ(c, 27, 11, 1.4), 0);
    c.strokeStyle = COL.soot;
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(24, 40);
    c.bezierCurveTo(10, 40, 8, 50, 16, 54);
    c.stroke(); // a cut cable
  });
}

/**
 * Live ruins on screen (P30, D9 row 1; the rules are `Sim.decodeStep`): a ruin that still works (`RUIN_FINDS[kind].live`:
 * a glowing screen, a turning dish, a lit traffic light) gives off a cyan glow that breathes, a small light on the ground and a
 * low hum you can hear from across the land; the dead ones are plain. While it is decoded a ring fills round it; a hit breaks
 * the ring, a decoded one dims and goes quiet, a broken one flickers out. A view of the mission (`playhost.ts`): `update` each
 * frame, `event` for the sim's `decode` events.
 */
interface Live { id: number; light: { set(i: number): void; off(): void } | null; humT: number; /** An old dock's lamp (P58 H): green, its own small light, no hum. */ dock: boolean }

const CYAN = 0x3df2ff, DOCK_GREEN = 0x7dff9a;

export class LiveRuins extends ViewBase {
  private g: Phaser.GameObjects.Graphics;
  private live = new Map<number, Live>();

  constructor(host: PlayHost) {
    super(host);
    this.g = this.scene.add.graphics().setDepth(-4.5).setBlendMode(1 /* ADD */);
    for (const r of this.sim.ruins) {
      const dock = !!RUIN_FINDS[r.kind].pry;
      if (r.live || dock) this.live.set(r.id, { id: r.id, light: this.light(r.x, r.y - 24, dock ? DOCK_GREEN : CYAN), humT: (r.id % 7) * 0.4, dock });
    }
  }

  /** A ruin's own small light, which a decoded or broken one lets go. */
  private light(x: number, y: number, color = CYAN) {
    const l = this.k.lights.add(x, y, { color, radius: 120, intensity: 0.4 });
    return { set: (i: number) => (l.intensity = i), off: () => this.k.lights.remove(l) };
  }

  update(dt: number) {
    const time = this.scene.time.now;
    const g = this.g;
    g.clear();
    const c = this.sim.controller;
    for (const r of this.sim.ruins) {
      const v = this.live.get(r.id);
      if (!v) continue;
      const on = (r.live || v.dock) && !r.searched;
      if (!on) {
        // Decoded, or broken: the glow goes (a broken one stutters once).
        v.light?.off();
        v.light = null;
        continue;
      }
      const breathe = 0.5 + 0.5 * Math.sin(time / 420 + r.id);
      v.light?.set(0.28 + 0.22 * breathe);
      if (v.dock) {
        // An old dock keeps one green lamp lit: a small breathing glow high on its post, no hum.
        g.fillStyle(DOCK_GREEN, 0.1 + 0.08 * breathe).fillEllipse(r.x, r.y - 44, 34 + 6 * breathe, 28 + 4 * breathe);
        g.fillStyle(0xe8ffee, 0.14 + 0.1 * breathe).fillEllipse(r.x, r.y - 46, 12, 10);
        continue;
      }
      g.fillStyle(0x3df2ff, 0.1 + 0.1 * breathe).fillEllipse(r.x, r.y - 20, 70 + 10 * breathe, 56 + 8 * breathe);
      g.fillStyle(0xbff9ff, 0.12 + 0.08 * breathe).fillEllipse(r.x, r.y - 24, 28, 22);
      // The hum: heard from across the land, louder near.
      v.humT -= dt;
      const d = Math.hypot(c.x - r.x, c.y - r.y);
      if (v.humT <= 0 && d < 700) {
        v.humT = 2.6;
        this.sfx('ruinhum', r.x, r.y, { gain: 0.5 });
      }
    }
    // The progress ring at the ruin: it fills while he stays near, dims when he steps out of the zone (the work waits).
    const a = this.sim.action;
    if (a?.ruin) {
      const d = a.ruin, p = Math.min(1, a.t / a.need), live = d.live, dim = a.paused ? 0.4 : 1;
      g.lineStyle(5, live ? 0x3df2ff : 0xffd98a, 0.25 * dim).strokeCircle(d.x, d.y - 24, 46);
      g.lineStyle(5, live ? 0xbff9ff : 0xfff0c0, 0.95 * dim).beginPath().arc(d.x, d.y - 24, 46, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2).strokePath();
    }
  }

  event(e: SimEvent) {
    if (e.e !== 'decode') return;
    const { ruin: r } = e;
    switch (e.what) {
      case 'start':
        this.sfx('warn', r.x, r.y, { gain: 0.4 });
        break;
      case 'done':
        this.k.fx.burst(r.x, r.y - 30, { color: 0x3df2ff, size: 1.2 });
        this.sfx('unlock', r.x, r.y, { gain: 0.6 });
        break;
    }
  }
}
