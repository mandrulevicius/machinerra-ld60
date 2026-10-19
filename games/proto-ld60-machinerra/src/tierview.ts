/**
 * What the tier abilities look like on the mission's screen (P12): every move that can hurt shows its tell before it lands
 * ("death never comes unexpectedly", decisions.md). It reads `sim/tiers.ts` state directly (`Hornet.ts` for the wind-ups, `Sim.tiers.patches`
 * for the ground, shots with a `blade`), so nothing is stored here and a frame allocates nothing: lines go into the scene's one
 * Graphics (`g`, over the units) and the ground patches into this view's own, under the units.
 *
 *  - Acid spit and Scythe throw: the rearing draws its lane from the enemy to where it will shoot, thin and dim while the aim
 *    still follows the robot, hot and white for the last `lock` seconds (the aim is fixed: step aside). A throw's lane also
 *    marks the turning point and the way back; the thrown blade is drawn here (a spinning crescent with a trail).
 *  - Burrow and ambush: a dust ring where it sinks, a ripple while it travels under, and the ring on the sand where it will come up
 *    (the disc fills as the time runs out).
 *  - The Mortar: a ring on the robot's spot with a second ring closing on it, a streak falling in the last moment.
 *  - Web carpets and Plasma puddles: shown at once, blinking while they arm (harmless yet), solid when live, fading as they wear off.
 *  - A twisted hornet's Dark streak (a smoky band along its dash) and a twisted rattler's acid pool (P13): the same rules as the puddle.
 *
 * Add a tier ability that shows: read its state in `tells`/`ground` here; colours are the module's constants (a trait's own colour
 * where it has one).
 */
import type Phaser from 'phaser';
import { SCREAM, TIER } from './sim/defs';
import { ViewBase, type PlayHost } from './playhost';
import type { Hornet, Sim } from './sim/sim';
import { DANGER, DANGER_HOT, DANGER_TWISTED, LINE } from './house';
import type { Patch } from './sim/tiers';

/** Every enemy tell is red (`DANGER`), its hot side orange; only the web's net and the hot core of a lock stay pale. */
const ACID = DANGER, BLADE = DANGER, DIG = DANGER_HOT, WEB = 0xe8f4ff, PLASMA = 0xff7a20, HOT = 0xfff4d0;
const MORTAR = DANGER_HOT;
const SPIT_LANE = TIER.spit.speed * TIER.spit.life, BLADE_LANE = TIER.scythe.speed * TIER.scythe.out;
const SPOKES = 8;

export class TierView extends ViewBase {
  private ground: Phaser.GameObjects.Graphics;

  constructor(host: PlayHost) {
    super(host);
    // Above the painted ground and the seeps (-10, -5), under every unit (depth is the unit's y).
    this.ground = host.scene.add.graphics().setDepth(-3);
  }

  destroy() {
    this.ground.destroy();
  }

  /** Draw one frame. `g` is the scene's lines-over-the-world Graphics (already cleared). */
  update(_dt: number, g: Phaser.GameObjects.Graphics) {
    const sim = this.sim, now = this.scene.time.now, view = this.scene.cameras.main.worldView;
    this.ground.clear();
    for (const p of sim.tiers.patches) {
      if (p.x < view.x - p.r || p.x > view.right + p.r || p.y < view.y - p.r || p.y > view.bottom + p.r) continue;
      if (p.kind === 'web') this.web(p, now);
      else if (p.kind === 'streak') this.streak(p, now);
      else if (p.kind === 'pool') this.pool(p, now);
      else if (p.kind === 'hooves') this.hooves(p, now);
      else this.puddle(p, now);
    }
    // P31: a bleater rearing to scream: a cold ring closing on its reach.
    for (const h of sim.hornets) {
      if (h.dead || h.scream === undefined || h.x < view.x - SCREAM.r || h.x > view.right + SCREAM.r || h.y < view.y - SCREAM.r || h.y > view.bottom + SCREAM.r) continue;
      const k = 1 - Math.max(0, h.scream) / SCREAM.tell;
      g.lineStyle(LINE.effect, DANGER, 0.4 + 0.5 * k).strokeCircle(h.x, h.y, SCREAM.r);
      g.lineStyle(LINE.effect, 0xcfe8ff, 0.3 + 0.5 * k).strokeCircle(h.x, h.y, SCREAM.r * (1.6 - 0.6 * k));
    }
    for (const h of sim.hornets) {
      if (h.dead || !h.ts) continue;
      if (h.x < view.x - 460 || h.x > view.right + 460 || h.y < view.y - 460 || h.y > view.bottom + 460) continue;
      this.tells(g, h, now);
    }
    for (const s of sim.shots) if (s.blade) this.blade(sim, g, s, now);
  }

  // ---------------------------------------------------------------- the ground

  /** A web carpet: a pale net on the sand. Blinks while arming, solid when live, fades in its last second. */
  private web(p: { x: number; y: number; r: number; life: number; arm: number; id: number }, now: number) {
    const G = this.ground, live = p.arm <= 0;
    const a = (live ? 0.85 : 0.25 + 0.25 * (Math.floor(now / 90) % 2)) * Math.min(1, p.life);
    G.fillStyle(WEB, 0.07 * a).fillCircle(p.x, p.y, p.r);
    G.lineStyle(LINE.detail, WEB, a);
    for (let i = 0; i < SPOKES; i++) {
      const t = (i / SPOKES) * Math.PI * 2 + p.id;
      G.lineBetween(p.x, p.y, p.x + Math.cos(t) * p.r, p.y + Math.sin(t) * p.r);
    }
    for (let k = 1; k <= 3; k++) {
      const r = (p.r * k) / 3;
      for (let i = 0; i < SPOKES; i++) {
        const t0 = (i / SPOKES) * Math.PI * 2 + p.id, t1 = ((i + 1) / SPOKES) * Math.PI * 2 + p.id;
        // Each ring sags a little between the spokes, like a real web.
        const sag = 0.92;
        G.lineBetween(p.x + Math.cos(t0) * r, p.y + Math.sin(t0) * r, p.x + Math.cos((t0 + t1) / 2) * r * sag, p.y + Math.sin((t0 + t1) / 2) * r * sag);
        G.lineBetween(p.x + Math.cos((t0 + t1) / 2) * r * sag, p.y + Math.sin((t0 + t1) / 2) * r * sag, p.x + Math.cos(t1) * r, p.y + Math.sin(t1) * r);
      }
    }
    G.lineStyle(LINE.effect, DANGER, a * 0.6).strokeCircle(p.x, p.y, p.r); // the carpet is a hazard: its edge is red, its net stays pale
  }

  /** A twisted hornet's Dark streak (P13): a smoky band along its dash, rimmed in the twisted's red, fading as it wears off. */
  private streak(p: Patch, now: number) {
    const G = this.ground, fade = Math.min(1, p.life), pulse = 0.5 + 0.5 * Math.sin(now / 130 + p.id);
    const x2 = p.x2 ?? p.x, y2 = p.y2 ?? p.y;
    G.lineStyle(p.r * 2, 0x14061c, 0.5 * fade).lineBetween(p.x, p.y, x2, y2).fillStyle(0x14061c, 0.5 * fade).fillCircle(p.x, p.y, p.r).fillCircle(x2, y2, p.r);
    G.lineStyle(p.r * 1.1, 0x6a2a98, (0.25 + 0.15 * pulse) * fade).lineBetween(p.x, p.y, x2, y2);
    G.lineStyle(LINE.effect, DANGER_TWISTED, 0.55 * fade).strokeCircle(p.x, p.y, p.r).strokeCircle(x2, y2, p.r);
  }

  /** A fire-hoofed charger's trail (P31): a band of embers along its charge, rimmed in red, fading as it wears off. */
  private hooves(p: Patch, now: number) {
    const G = this.ground, fade = Math.min(1, p.life), pulse = 0.5 + 0.5 * Math.sin(now / 80 + p.id);
    const x2 = p.x2 ?? p.x, y2 = p.y2 ?? p.y;
    G.lineStyle(p.r * 2, 0x2a1008, 0.45 * fade).lineBetween(p.x, p.y, x2, y2);
    G.lineStyle(p.r * 1.1, 0xff7a20, (0.35 + 0.25 * pulse) * fade).lineBetween(p.x, p.y, x2, y2);
    G.lineStyle(p.r * 0.4, 0xffd060, (0.3 + 0.3 * pulse) * fade).lineBetween(p.x, p.y, x2, y2);
    G.lineStyle(LINE.effect, DANGER, 0.5 * fade).strokeCircle(p.x, p.y, p.r).strokeCircle(x2, y2, p.r);
  }

  /** A twisted rattler's acid pool (P13): a green-black pool, outline only and blinking while it arms. */
  private pool(p: Patch, now: number) {
    const G = this.ground, live = p.arm <= 0, fade = Math.min(1, p.life), pulse = 0.5 + 0.5 * Math.sin(now / 160 + p.id);
    if (!live) {
      G.lineStyle(LINE.effect, DANGER, 0.35 + 0.4 * (Math.floor(now / 80) % 2)).strokeCircle(p.x, p.y, p.r);
      G.fillStyle(0x6a9a20, 0.08).fillCircle(p.x, p.y, p.r);
      return;
    }
    G.fillStyle(0x1a2408, 0.55 * fade).fillCircle(p.x, p.y, p.r);
    G.fillStyle(0x7ab030, (0.3 + 0.1 * pulse) * fade).fillCircle(p.x, p.y, p.r * 0.85);
    G.lineStyle(LINE.effect, DANGER, 0.8 * fade).strokeCircle(p.x, p.y, p.r);
  }

  /** A plasma puddle: a burning pool with tongues. Outline only and blinking while it arms. */
  private puddle(p: { x: number; y: number; r: number; life: number; arm: number; id: number }, now: number) {
    const G = this.ground, live = p.arm <= 0, fade = Math.min(1, p.life);
    const pulse = 0.5 + 0.5 * Math.sin(now / 90 + p.id);
    if (!live) {
      G.lineStyle(LINE.effect, PLASMA, 0.35 + 0.4 * (Math.floor(now / 80) % 2)).strokeCircle(p.x, p.y, p.r);
      G.fillStyle(PLASMA, 0.08).fillCircle(p.x, p.y, p.r);
      return;
    }
    G.fillStyle(0x3a1408, 0.45 * fade).fillCircle(p.x, p.y, p.r);
    G.fillStyle(PLASMA, (0.28 + 0.12 * pulse) * fade).fillCircle(p.x, p.y, p.r * 0.92);
    G.fillStyle(0xffc060, (0.3 + 0.15 * pulse) * fade).fillCircle(p.x, p.y, p.r * 0.55);
    G.lineStyle(LINE.effect, PLASMA, 0.9 * fade).strokeCircle(p.x, p.y, p.r);
    for (let i = 0; i < 4; i++) {
      const t = i * 1.6 + p.id * 0.7, w = 0.5 + 0.5 * Math.sin(now / 140 + t * 3);
      const fx = p.x + Math.cos(t) * p.r * 0.55, fy = p.y + Math.sin(t) * p.r * 0.4;
      G.fillStyle(HOT, 0.55 * w * fade).fillTriangle(fx - 4, fy, fx + 4, fy, fx, fy - 5 - 7 * w);
    }
  }

  // ---------------------------------------------------------------- the winding-up

  private tells(g: Phaser.GameObjects.Graphics, h: Hornet, now: number) {
    const S = h.ts!;
    if (S.spit) this.lane(g, h, S.spit, TIER.spit.tell, TIER.spit.lock, SPIT_LANE, 10, ACID, false, now);
    if (S.throw) this.lane(g, h, S.throw, TIER.scythe.tell, TIER.scythe.lock, BLADE_LANE, TIER.scythe.radius * 2, BLADE, true, now);
    if (S.dig) this.dig(g, h, S.dig, now);
    if (S.shell) this.shell(g, S.shell, now);
  }

  /**
   * The lane of a spit or a throw, from the muzzle to the end of its reach. Thin and dim while the aim still follows (the whole
   * wind-up before `lock`), hot and wide for the last `lock` seconds. `back` also marks the turning point and the way home.
   */
  private lane(g: Phaser.GameObjects.Graphics, h: Hornet, R: { t: number; ax: number; ay: number }, tell: number, lock: number, reach: number, width: number, col: number, back: boolean, now: number) {
    const a = Math.atan2(R.ay - h.y, R.ax - h.x), c = Math.cos(a), s = Math.sin(a);
    const ox = h.x + c * 16, oy = h.y - 10 + s * 16, ex = ox + c * reach, ey = oy + s * reach;
    const k = 1 - Math.max(0, R.t) / tell; // 0 at the rear, 1 at the release
    const locked = R.t <= lock;
    const pulse = locked ? 1 : 0.7 + 0.3 * Math.sin(now / 60);
    g.lineStyle(width * (locked ? 1.3 : 0.9), col, (0.06 + 0.16 * k) * pulse).lineBetween(ox, oy, ex, ey);
    g.lineStyle(LINE.effect, locked ? HOT : col, (locked ? 0.95 : 0.35 + 0.35 * k) * pulse).lineBetween(ox, oy, ex, ey);
    // The charge at the muzzle, growing to the release.
    g.fillStyle(col, 0.35 + 0.4 * k).fillCircle(ox, oy, 3 + 5 * k);
    g.lineStyle(LINE.effect, locked ? HOT : col, 0.8).strokeCircle(ox, oy, 4 + 8 * (1 - k));
    if (back) {
      // The turning point, and chevrons home: the blade comes back along the same line.
      g.lineStyle(LINE.accent, col, 0.7).strokeCircle(ex, ey, TIER.scythe.radius * 0.8);
      for (let i = 1; i <= 3; i++) {
        const f = i / 4, px = ox + (ex - ox) * f, py = oy + (ey - oy) * f;
        g.lineStyle(LINE.detail, col, 0.55 * pulse).lineBetween(px + c * 5 - s * 5, py + s * 5 + c * 5, px, py).lineBetween(px + c * 5 + s * 5, py + s * 5 - c * 5, px, py);
      }
    }
  }

  /** A dig: dust where it sinks, a ripple while it is under, and the ring on the sand where it comes up. */
  private dig(g: Phaser.GameObjects.Graphics, h: Hornet, D: { mode: string; t: number; tx: number; ty: number }, now: number) {
    const B = TIER.burrow;
    if (D.mode === 'sink') {
      const k = 1 - Math.max(0, D.t) / B.down;
      g.lineStyle(LINE.effect, DIG, 0.7 * (1 - k)).strokeCircle(h.x, h.y, 10 + 22 * k);
      g.fillStyle(0x15110e, 0.4 * k).fillEllipse(h.x, h.y, 26, 10);
    } else if (D.mode === 'under') {
      const w = (now / 400 + h.id) % 1;
      g.lineStyle(LINE.effect, DIG, 0.55 * (1 - w)).strokeEllipse(h.x, h.y, 24 + 34 * w, 10 + 14 * w);
    } else if (D.mode === 'tell') {
      const k = 1 - Math.max(0, D.t) / B.up, r = B.radius;
      const hot = 0.5 + 0.5 * Math.sin(now / 55);
      g.fillStyle(0xff4a2a, 0.08 + 0.22 * k).fillCircle(D.tx, D.ty, r);
      g.lineStyle(LINE.accent, DIG, 0.25 + 0.2 * hot).strokeCircle(D.tx, D.ty, r * (1.5 - 0.5 * k));
      g.lineStyle(LINE.effect, HOT, 0.6 + 0.4 * k).strokeCircle(D.tx, D.ty, r);
      for (let i = 0; i < 6; i++) {
        const t = i * 1.047 + 0.3, r0 = r * 0.25, r1 = r * (0.5 + 0.5 * k);
        g.lineStyle(LINE.detail, 0x1d1a17, 0.8).lineBetween(D.tx + Math.cos(t) * r0, D.ty + Math.sin(t) * r0, D.tx + Math.cos(t + 0.15) * r1, D.ty + Math.sin(t + 0.15) * r1);
      }
    } else {
      // Resting after the blow: the opening to hit it. A dust ring that fades.
      const k = 1 - Math.max(0, D.t) / B.rest;
      g.lineStyle(LINE.effect, DIG, 0.5 * (1 - k)).strokeCircle(h.x, h.y, B.radius * (0.5 + 0.5 * k));
    }
  }

  /** The Mortar's shell: the blast's disc on the robot's spot, a ring closing on it, a streak falling at the end. */
  private shell(g: Phaser.GameObjects.Graphics, sh: { x: number; y: number; t: number }, now: number) {
    const M = TIER.mortar;
    const k = Math.max(0, sh.t) / M.tell; // 1 at the lob, 0 at the landing
    g.fillStyle(MORTAR, 0.06 + 0.2 * (1 - k)).fillCircle(sh.x, sh.y, M.radius);
    g.lineStyle(LINE.effect, MORTAR, 0.5 + 0.4 * (1 - k)).strokeCircle(sh.x, sh.y, M.radius);
    g.lineStyle(LINE.accent, HOT, 0.35 + 0.5 * (1 - k)).strokeCircle(sh.x, sh.y, M.radius * (0.35 + 0.65 * k));
    const blink = Math.floor(now / 70) % 2 === 0;
    g.fillStyle(blink ? HOT : MORTAR, 0.9).fillCircle(sh.x, sh.y, 3);
    if (k < 0.4) {
      const top = sh.y - 520 * (k / 0.4);
      g.lineStyle(5, 0xffd890, 0.3).lineBetween(sh.x, top - 90, sh.x, top);
      g.lineStyle(LINE.effect, 0xffffff, 0.95).lineBetween(sh.x, top - 90, sh.x, top);
    }
  }

  // ---------------------------------------------------------------- the blade

  /** A thrown scythe: a spinning crescent with a trail, and a tether home on the way back. */
  private blade(sim: Sim, g: Phaser.GameObjects.Graphics, s: { x: number; y: number; vx: number; vy: number; blade?: { back: boolean; owner: number } }, now: number) {
    const B = s.blade!;
    const spin = now / 45;
    for (let i = 3; i >= 0; i--) {
      const f = i * 0.35, a = spin - f * 2;
      const x = s.x - s.vx * f * 0.04, y = s.y - s.vy * f * 0.04;
      g.lineStyle(i === 0 ? 4 : 3, i === 0 ? 0xe8eef4 : BLADE, i === 0 ? 1 : 0.4 - i * 0.09);
      g.beginPath().arc(x, y, 11, a, a + 3.6).strokePath();
    }
    g.lineStyle(LINE.detail, 0x1d1a17, 0.9).beginPath().arc(s.x, s.y, 11, spin, spin + 3.6).strokePath();
    if (B.back) {
      for (let i = 0; i < sim.hornets.length; i++) {
        const o = sim.hornets[i];
        if (o.id !== B.owner || o.dead) continue;
        g.lineStyle(LINE.detail, BLADE, 0.35).lineBetween(s.x, s.y, o.x, o.y - 10);
        break;
      }
    }
  }
}
