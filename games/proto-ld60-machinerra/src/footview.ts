/**
 * Footsteps on screen and in the ear (rules and tables: `footsteps.ts`; sounds: `stepsounds.ts`).
 *
 * - Prints go on the world kit's mark layer as fading marks (`marks.stamp` with a `life`): they fade and recycle, and the layer's
 *   fading cap (`Marks.maxFading`) is the cap on live prints. Only walkers in view leave any; the Communicator's always land, the
 *   rest only while the layer has room (`STEP.room`) and last a shorter time, so a crowd cannot crowd out his.
 * - The Communicator and the legged robots land a step when their walk does (`BotsView` calls `land` where its footfall squash
 *   kicks); foes and rolling robots leave a print every stride they travel (`update`).
 * - In a fight (`host.fight`, the music's, eased by `TONE.open` / `TONE.close`) the sounds sink: `FIGHT_STEP` (the Communicator's a quarter, robots and foes silent).
 * - A step sound plays only for legs that make one: the Communicator's, a legged robot's (quieter), a heavy foe's (softer still: a
 *   boss coming is a tell). Wheels, tracks and everything else are silent here.
 * Dev: `steps` (`dev/mission.ts`): the surface under him, the counts, a forced surface.
 */
import { Strider } from '../../../harness/kit/world/logic';
import { BIOMES } from './sim/defs';
import type { Bot } from './sim/sim';
import { PRINT, STEP, botGait, fightLevel, stepMix, foeGait, footScale, surfaceOf, type Gait, type Surface } from './footsteps';
import { STEP_LEVEL, stepSound } from './stepsounds';
import { TONE } from './sound';
import { ViewBase } from './playhost';

type Walking = Exclude<Gait, 'none'>;
/** One walker's last print point and which foot is next. */
interface Walker { x: number; y: number; side: 1 | -1 }

export class FootView extends ViewBase {
  /** Forced by dev `steps <surface>`: everyone walks on it. */
  force: Surface | null = null;
  private walkers = new Map<string, Walker>();
  private rollers = new Map<string, Strider>();
  private count = { prints: 0, sounds: 0, last: '' };
  /** 0 calm .. 1 fight (the music's flag, eased): the step sounds sink with it. */
  private fightAmt = 0;

  /** What lies under a point now. */
  surface(x: number, y: number): Surface {
    if (this.force) return this.force;
    const sim = this.sim;
    return surfaceOf(BIOMES[sim.biomeId].paint, sim.map.ter, sim.W, x, y, { dungeon: !!sim.run, deck: sim.onLift({ x, y }, 0.9) });
  }

  /** In view, with a margin: what is off screen leaves nothing (the sim walks it anyway). */
  private seen(x: number, y: number) {
    const v = this.scene.cameras.main.worldView;
    return x > v.x - 64 && x < v.right + 64 && y > v.y - 64 && y < v.bottom + 64;
  }

  private get riding() {
    const p = this.sim.phase;
    return p === 'rising' || p === 'done';
  }

  /** A walking robot's foot comes down (the Communicator's, a marksman's): a print and a step. */
  land(b: Bot) {
    if (this.riding || b.dead || botGait(b.role, b.climbs) !== 'foot' || !this.seen(b.x, b.y)) return;
    const me = b.role === 'controller';
    const surf = this.surface(b.x, b.y);
    this.sound(surf, b.x, b.y, me ? STEP.gain.comm * stepMix('comm', this.fightAmt) : STEP.gain.robot * stepMix('robot', this.fightAmt));
    this.lay(`b${b.id}`, b.x, b.y, 'foot', surf, me ? 1 : 0.8, me);
  }

  update(dt: number) {
    this.fightAmt = fightLevel(this.fightAmt, this.host.fight, dt, TONE.open, TONE.close);
    if (this.riding) return;
    const sim = this.sim;
    // Rolling robots lay tracks: a dash of two bars each stride.
    for (const b of sim.bots) {
      const gait = botGait(b.role, b.climbs);
      if (!b.dead && (gait === 'tread' || gait === 'paw')) this.roll(`b${b.id}`, b.x, b.y, gait, gait === 'tread' ? 0.7 : 0.8, b.moving && this.seen(b.x, b.y)); // a robot in spider legs leaves paws (P53)
    }
    for (const h of sim.hornets) {
      const gait = foeGait(h.kind);
      if (h.dead || gait === 'none' || h.under) continue;
      const seen = this.seen(h.x, h.y);
      // A heavy foe's step is soft, and a tell.
      if (this.roll(`h${h.id}`, h.x, h.y, gait, gait === 'tread' ? 0.8 : footScale(h.r) / 0.5, seen) && h.r >= STEP.heavy && gait !== 'tread') this.sound(this.surface(h.x, h.y), h.x, h.y, STEP.gain.heavy * stepMix('heavy', this.fightAmt), 0.78);
    }
    // Forget the dead and the gone.
    if (this.rollers.size > 80) {
      const live = new Set<string>([...sim.bots.map((b) => `b${b.id}`), ...sim.hornets.filter((h) => !h.dead).map((h) => `h${h.id}`)]);
      for (const m of [this.rollers, this.walkers]) for (const k of m.keys()) if (!live.has(k)) m.delete(k);
    }
  }

  /** A walker that travels: a print each stride. Returns whether it landed one. */
  private roll(key: string, x: number, y: number, gait: Walking, scale: number, on: boolean) {
    let r = this.rollers.get(key);
    if (!r) this.rollers.set(key, (r = new Strider(STEP.stride[gait], 0)));
    if (!on) {
      r.reset();
      this.walkers.delete(key);
      return false;
    }
    return !!r.step(x, y) && this.lay(key, x, y, gait, this.surface(x, y), scale, false);
  }

  /** Put one print at (x, y), heading from the walker's last one (the first of a trail only marks its start). */
  private lay(key: string, x: number, y: number, gait: Walking, surf: Surface, scale: number, strong: boolean) {
    const w = this.walkers.get(key);
    if (!w || Math.hypot(x - w.x, y - w.y) > 4 * STEP.stride[gait]) {
      this.walkers.set(key, { x, y, side: 1 });
      return false;
    }
    const d = Math.hypot(x - w.x, y - w.y);
    if (d < 2) return false;
    const heading = Math.atan2(y - w.y, x - w.x);
    w.x = x;
    w.y = y;
    w.side = (w.side === 1 ? -1 : 1) as 1 | -1;
    const look = PRINT[surf];
    const marks = this.w.marks;
    if (!look || (!strong && marks.stats.fading >= marks.maxFading * STEP.room)) return true;
    const off = STEP.gap[gait] * scale * 0.5 * w.side;
    const px = x + Math.cos(heading + Math.PI / 2) * off, py = y + Math.sin(heading + Math.PI / 2) * off;
    const angle = (heading * 180) / Math.PI + 90;
    const life = look.life * (strong ? 1 : STEP.crowdLife);
    this.count.prints++;
    if (gait === 'foot') marks.stamp('world-foot', px, py, { tint: look.tint, alpha: look.alpha, angle, scale: 0.5 * scale, kind: false, life });
    else if (gait === 'paw') marks.stamp('world-soft', px, py, { tint: look.tint, alpha: look.alpha * 1.1, angle, scaleX: 0.1 * scale, scaleY: 0.14 * scale, kind: false, life });
    else marks.stamp('track', x, y, { tint: look.tint, alpha: look.alpha * 0.7, angle, scale: scale * 1.2, kind: false, life });
    return true;
  }

  private sound(surf: Surface, x: number, y: number, gain: number, rate = 1) {
    if (gain < 0.01) return; // a silent step is not played at all (a voice saved)
    this.count.sounds++;
    this.count.last = `${surf}@${gain}`;
    this.k.audio.sfx.play(stepSound(surf), { at: { x, y }, gain: gain * STEP_LEVEL, rate });
  }

  /** Play a surface's step once (dev). */
  sample(surf: Surface) {
    this.k.audio.sfx.play(stepSound(surf), {});
  }

  debug() {
    const c = this.sim.controller;
    return { steps: { surface: this.surface(c.x, c.y), forced: this.force, ...this.count, fight: +this.fightAmt.toFixed(2), commMix: +stepMix('comm', this.fightAmt).toFixed(2), fading: this.w.marks.stats.fading } };
  }
}
