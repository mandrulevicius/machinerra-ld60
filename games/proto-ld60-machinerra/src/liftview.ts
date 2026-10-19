/**
 * The lift as drawn: its platform, the rise that carries it (and whoever stands on it, which `BotsView` reads from `host.rise()`)
 * up off the screen, the camera that follows the Communicator and a share of the rise, the platform's shadow left on the
 * ground, and a dungeon's climb-out fading to black as the platform leaves. The curve is `liftrise.ts` (pure, tested); the sim
 * only times the rise (`Sim.city.riseTime`, 3 s, the Tram Line 1 s; phase `rising` then `done`); the dungeon's exit gap (`sim.exitUsed`) is the platform
 * there. `update` applies `liftrise` to the platform, its shadow (`shade`, left behind on the ground) and, through `host.rise()`,
 * its lamp (`LightView`) and every robot `sim.onLift` counts (`BotsView`). `faded` (`riseFaded`) says a dungeon's climb-out has
 * already faded the screen, so `DungeonLink.climbOut` need not; after the results `MissionEnd.ascentData` hands the view the lift
 * left in to the Ascent.
 * Add a beat of the rise: a `case` in `event` (`phase`).
 */
import { MARK_SOFT } from '../../../harness/kit';
import { LIFT_SCALE, liftFoot } from './art';
import { LIFT, liftUp, reach } from './liftrise';
import { ViewBase, kick, type Img, type PlayHost } from './playhost';
import { leanAt } from './shadowview';
import { MISSION } from './sim/defs';
import type { SimEvent } from './sim/sim';

export class LiftView extends ViewBase {
  readonly spr: Img;
  /** The platform's shadow on the ground, which stays behind as it climbs. */
  private shade: Img;
  private key: 'dungeon-shaft' | 'lift';
  /** How far (px) the platform has risen this frame (the rise starts with its settle, which dips below 0). */
  now = 0;
  /** How far up the platform's drawing goes by the end of the rise, sized to the view when the rise starts; 0 while it is not rising. */
  private end = 0;
  /** A dungeon's climb-out has started its fade (the platform has left the screen), so `climbOut` need not. */
  faded = false;

  constructor(host: PlayHost) {
    super(host);
    const sim = host.sim;
    // Lifts are big enough for the whole party to ride (Laimonas): the land's deck and the shaft's foot below.
    this.key = host.down ? 'dungeon-shaft' : 'lift';
    this.spr = host.place(this.key, sim.lift.x, sim.lift.y + liftFoot(this.key), LIFT_SCALE).setDepth(-4);
    // What it casts on the ground: under the deck at rest (a soft shade), and left behind (drifting off, fading) as it climbs.
    this.shade = host.scene.add.image(sim.lift.x, sim.lift.y + 14, MARK_SOFT).setTint(host.w.shadows.tint).setDepth(-4.5).setVisible(false);
  }

  /**
   * A settle, then a climb from rest that carries the platform off the top of the view. The camera follows a share of it,
   * eased, so nothing snaps; the climb is sized to the view when the rise starts.
   */
  update(dt: number) {
    const sim = this.sim, cam = this.scene.cameras.main, c = sim.controller;
    const rising = sim.phase === 'rising' || sim.phase === 'done';
    if (rising && !this.end) this.end = reach(sim.lift.y + liftFoot(this.key) - cam.worldView.y);
    else if (!rising) this.end = 0;
    const rise = rising ? liftUp(sim.riseT, sim.city.riseTime, this.end) : 0;
    this.now = rise;
    cam.scrollX += (c.x - cam.width / 2 - cam.scrollX) * Math.min(1, dt * 6);
    cam.scrollY += (c.y - 20 - LIFT.follow * rise - cam.height / 2 - cam.scrollY) * Math.min(1, dt * 6);
    this.spr.y = sim.lift.y + liftFoot(this.key) - (sim.exitUsed ? 0 : rise);
    // On the ground it casts under the deck; left behind as it climbs, it shows how high the platform is: it slides off to the
    // light's side (the sun's, or the lamps' at night), spreads and fades.
    const high = Math.max(0, rise), lean = leanAt(this.w, sim.lift.x, sim.lift.y);
    this.shade.setVisible(this.w.shadows.enabled && !this.host.down && !sim.exitUsed).setPosition(sim.lift.x + lean.x * (high + 6), sim.lift.y + 14 + lean.y * (high + 6)).setScale(3.1 * (1 + high / 700), 2 * (1 + high / 700)).setAlpha(0.4 * lean.a * Math.max(0, 1 - high / (0.8 * (this.end || 1e9))));
    // A dungeon's climb-out fades to black as the platform leaves the screen, so the cut comes under the dark, not on a freeze.
    if (this.host.down && rising && !this.faded && (sim.exitUsed ? sim.run!.wallAt().y : sim.lift.y) - rise < cam.worldView.y) {
      this.faded = true;
      cam.fadeOut(400, 0, 0, 0);
    }
  }

  event(e: SimEvent) {
    if (e.e !== 'phase' || e.phase !== 'rising') return;
    const sim = this.sim;
    this.sfx(sim.city.riseTime < MISSION.riseTime ? 'liftFast' : 'lift', undefined, undefined, { gain: 0.7 }); // the Tram Line's rise is shorter than the sound
    this.k.juice.shake('medium');
    for (const v of this.bots.values()) kick(v.sq, -0.3);
    // Steam off the pad as it lifts: the puffs thin out as it climbs clear.
    const at = sim.exitUsed ? sim.run!.wallAt() : sim.lift;
    for (let i = 0; i < 6; i++) this.scene.time.delayedCall(i * 300, () => this.k.fx.burst(at.x + (i % 2 ? -50 : 50), at.y, { color: 0xf4efe6, size: 1.5 - i * 0.18 }));
  }
}
