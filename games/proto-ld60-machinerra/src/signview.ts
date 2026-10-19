/**
 * The signs that a lasting effect leaves in the world (Minos, decisions.md "Minos on onboarding": lasting effects leave a sign in the world,
 * effects only, no new rules; the plan is `onboarding.md`). One view for the small ones:
 *  - a hive waking: a line of pulses from what woke it (the Communicator, a robot, the mast) to the hive and a ring at the hive, and the
 *    banner names where it is; a gatherer's noise shows its reach as a ring round each sleeping hive (`NEST.wakeTiles`) while it works near
 *    one or is picked in command mode;
 *  - a twisted halo's drain: the oil it took, a small dark number over the robot;
 *  - the winch's fee over him as he falls with no can;
 *  - the anomalies: the Mirage's heat shimmer over the view, and a dissolving false ring as a puff where it was; the Blood Moon's red ring where
 *    a foe is twisted and "x2 parts" where a twisted foe falls.
 * Berserk steps and menace levels are `hudfx.ts`'s, the Dinner Bell's lit bell `placeviews36.ts`'s. Add a sign: a `case` in `event`, or a drawing in `update`.
 */
import Phaser from 'phaser';
import { DANGER, DANGER_TWISTED } from './house';
import { ViewBase, ring, type G, type PlayHost } from './playhost';
import { NEST, T } from './sim/defs';
import { CLOCK, type SimEvent } from './sim/sim';
import { winchFee } from './tips';

/** A line of pulses running from a cause to the hive it woke, and how long it has run (s). */
interface Wake { x0: number; y0: number; x1: number; y1: number; t: number }
const WAKE = { life: 1.6, pace: 380, gap: 46 };
/** A puff of heat shimmer where a false ring dissolved. */
interface Puff { x: number; y: number; t: number }
const PUFF = { life: 1.4, r: 54 };
const BLOOD = 0xb02a30;

/** "north", "south-east": where `to` lies from `from`. */
export function compass(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  return dirs[(Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) + 8) % 8];
}

export class SignView extends ViewBase {
  private wakes: Wake[] = [];
  private puffs: Puff[] = [];
  private heat: Phaser.GameObjects.Graphics;
  private bloodT = 0;

  constructor(host: PlayHost) {
    super(host);
    // The Mirage's shimmer is on the screen, not the land: wavy lines over the view, under the HUD.
    this.heat = host.scene.add.graphics().setScrollFactor(0).setDepth(58000);
  }

  /** Who or what woke a hive, where it was (null for the clock). */
  private cause(by: string) {
    const sim = this.sim;
    if (by === CLOCK) return null;
    if (by === 'Communicator') return sim.controller;
    if (by === 'the mast') return sim.places.find((p) => p.id === 'mast')?.parts.find((q) => q.kind === 'mast') ?? null;
    return sim.bots.find((b) => b.name === by) ?? null;
  }

  /** Does a gatherer's work wake a sleeping hive now? Not in the morning, and not with Smokeless Combustion (`coal.ts`). */
  private noisy() {
    return this.sim.day.phase !== 'morning' && !this.sim.perks.has('smokeless');
  }

  update(dt: number, g: G) {
    const sim = this.sim, now = this.scene.time.now;
    // The reach of a gatherer's noise round each sleeping hive, while one works near it or a gatherer is picked in command mode.
    if (this.noisy()) {
      const gatherers = sim.bots.filter((b) => b.role === 'gatherer' && !b.dead && !b.downed && !b.place);
      const picked = this.host.cmd.on && gatherers.some((b) => this.host.pick.ids.has(b.id));
      const view = this.scene.cameras.main.worldView, R = NEST.wakeTiles * T;
      for (const n of sim.nests) {
        if (n.awake || n.dead || n.place || n.x < view.x - R || n.x > view.right + R || n.y < view.y - R || n.y > view.bottom + R) continue;
        const near = gatherers.some((b) => Math.hypot(b.x - n.x, b.y - n.y) < R + 5 * T);
        if (!near && !picked) continue;
        const inside = gatherers.some((b) => Math.hypot(b.x - n.x, b.y - n.y) < R);
        ring(g, n.x, n.y, R, DANGER, inside ? 0.8 : 0.4, now);
      }
    }
    // The pulses from what woke a hive to the hive: dots running along the line, brightest as they land.
    for (let i = this.wakes.length - 1; i >= 0; i--) {
      const w = this.wakes[i];
      w.t += dt;
      if (w.t >= WAKE.life) {
        this.wakes.splice(i, 1);
        continue;
      }
      const len = Math.hypot(w.x1 - w.x0, w.y1 - w.y0) || 1, ux = (w.x1 - w.x0) / len, uy = (w.y1 - w.y0) / len, fade = 1 - w.t / WAKE.life;
      for (let d = (w.t * WAKE.pace) % WAKE.gap; d < len; d += WAKE.gap) g.fillStyle(DANGER, 0.9 * fade).fillCircle(w.x0 + ux * d, w.y0 + uy * d, 3 + 2 * (d / len));
      const r = 20 + 70 * (w.t / WAKE.life);
      g.lineStyle(3, DANGER, 0.9 * fade).strokeEllipse(w.x1, w.y1, r * 2, r * 1.25);
    }
    this.mirage(dt, now);
  }

  /** The Mirage's shimmer: pale wavering lines across the view by day, and the puffs where a false ring dissolved. */
  private mirage(dt: number, now: number) {
    const h = this.heat;
    h.clear();
    const on = this.sim.fx.id === 'mirage';
    for (let i = this.puffs.length - 1; i >= 0; i--) if ((this.puffs[i].t += dt) >= PUFF.life) this.puffs.splice(i, 1);
    if (!on && !this.puffs.length) return;
    const cam = this.scene.cameras.main, W = cam.width, H = cam.height, day = 1 - this.host.night() * 0.8;
    if (on) {
      for (let i = 0; i < 9; i++) {
        const y0 = H * (0.3 + i * 0.07);
        h.lineStyle(3, 0xfff0c8, 0.11 * day);
        h.beginPath().moveTo(0, y0);
        for (let x = 24; x <= W; x += 24) h.lineTo(x, y0 + Math.sin(now / 650 + x / 70 + i * 1.7) * (3 + i * 0.4));
        h.strokePath();
      }
    }
    for (const p of this.puffs) {
      const k = p.t / PUFF.life, sx = (p.x - cam.worldView.x) * cam.zoom, sy = (p.y - cam.worldView.y) * cam.zoom;
      for (let j = 0; j < 3; j++) {
        h.lineStyle(2, 0xfff0c8, 0.5 * (1 - k)).strokeEllipse(sx, sy - 10 - j * 7 * k, (PUFF.r + 40 * k) * 2 * cam.zoom, (10 + 6 * j) * cam.zoom);
      }
    }
  }

  event(e: SimEvent) {
    const sim = this.sim, fx = this.k.fx;
    switch (e.e) {
      case 'wake': {
        if (e.n.place) break; // a place wakes its own hives, with its own beat
        fx.burst(e.n.x, e.n.y - 10, { color: DANGER, size: 1 });
        const from = this.cause(e.by);
        if (e.by === CLOCK) break; // the clock's own wakings come with the day's banner
        if (from) this.wakes.push({ x0: from.x, y0: from.y - 14, x1: e.n.x, y1: e.n.y, t: 0 });
        const who = e.by === 'Communicator' ? 'You woke' : `${e.by[0].toUpperCase()}${e.by.slice(1)} woke`;
        this.host.banner(`${who} a ${sim.biome.talk.hive}, ${compass(sim.controller, e.n)} of you`, 2800);
        break;
      }
      case 'halo':
        // The halo's drain, a Dark hit that draws no hit of its own: a small dark -1 over the robot.
        this.statuses.pop(e.bot.x, e.bot.y - 46, `−${Math.round(e.dmg * 10) / 10}`, '#d890ff', 0.8, e.bot.role === 'controller' ? 15 : 12);
        fx.burst(e.bot.x, e.bot.y - 16, { color: DANGER_TWISTED, size: 0.3 });
        break;
      case 'downed':
        // No can on the pack: the winch's fee, said over him before it is paid (`downed.ts`).
        if (!e.revive && !sim.intro && !sim.dungeon) {
          const f = winchFee(sim);
          this.floater(sim.controller.x, sim.controller.y - 80, `Winch: ${f.scrap ? `−${f.scrap} scrap, ` : ''}−${f.clock} s of day`, '#ffd98a', 2400, 16);
        }
        break;
      case 'weather':
        if (e.what === 'mirage') {
          this.puffs.push({ x: e.x, y: e.y, t: 0 });
          fx.burst(e.x, e.y - 12, { color: 0xfff0c8, size: 0.8 });
          this.floater(e.x, e.y - 50, 'A mirage', '#ffe8b0', 1800, 16);
          this.sfx('hiss', e.x, e.y, { gain: 0.25 });
        }
        break;
      case 'twist':
        // The Blood Moon twists them faster: a red ring where the dark gets in, and its name now and then.
        if (sim.fx.id === 'bloodMoon') {
          fx.burst(e.h.x, e.h.y - 18, { color: BLOOD, size: 1.2 });
          this.flash(e.h.x, e.h.y - 18, BLOOD, 1.2);
          if (this.scene.time.now - this.bloodT > 15000) {
            this.bloodT = this.scene.time.now;
            this.floater(e.h.x, e.h.y - 54, 'Blood Moon', '#ff8a90', 1800, 16);
          }
        }
        break;
      case 'die':
        // A twisted foe under the Blood Moon drops its part twice: the sign is a second burst and the count.
        if (e.on === 'hornet' && e.h?.twisted && !e.h.boss && sim.fx.id === 'bloodMoon' && Math.round(sim.fx.twistedParts) > 1) {
          fx.burst(e.x, e.y - 18, { color: BLOOD, size: 0.9 });
          this.floater(e.x, e.y - 44, `×${Math.round(sim.fx.twistedParts)} parts`, '#ff8a90', 1400, 14);
        }
        break;
    }
  }
}
