/**
 * The mission's light: the sky that follows the clock (the ambient colour, the night every lamp and the dial read through
 * `host.night()`; no sky down a dungeon, only the dark of a mine), the weather over it (`weatherview.ts`) and the live ground, the lift's
 * lamp, the flashes every blast and hit borrows (`host.flash`), and the budget the crew's lamps are spent from.
 * Add a flash: call `flash`. Add a role's lamp: a `LAMP` line in `lamps.ts` (a new robot role needs one; `BotsView` reads it).
 * `lampPass` runs last in the frame (`late`), after every other view has set its lights, so it counts them.
 */
import { GroundLive } from './groundlive';
import { chooseSpots, follow, inView, lampLook, type Spot } from './lamps';
import { ViewBase, type Light, type PlayHost } from './playhost';
import { BIOMES, T } from './sim/defs';
import { sky } from './sim/clock';
import { ambientOf } from './sim/dungeon';
import { WeatherView } from './weatherview';
import { TwistView } from './twistview';
import type { SimEvent } from './sim/types';

/** Below this a light is hidden (it takes no slot of the light cap); the share of the cap kept free for lamps still fading out. */
const LAMP_OFF = 0.015, LAMP_SPARE = 0.2;
/** How fast a crew light eases to what `lamps.ts` chose (per second), brightening and dimming. */
const LAMP_RATE = { move: 12, on: 10, off: 18 };

export class LightView extends ViewBase {
  /** The live ground over the painted land (groundlive.ts): cloud and D-city shadows, drift, glints, motes. */
  readonly live: GroundLive;
  private weather: WeatherView | null = null;
  private twist: TwistView | null = null;
  private flashes: Light[] = [];
  private flashI = 0;
  private lift: Light;
  /** 0 bright .. 1 deep night (the sky at the clock's hour). */
  night = 0;
  /** Which lamp led each one's spot last frame (`lampPass`). */
  private lead = new Map<number, number>();

  constructor(host: PlayHost) {
    super(host);
    const sim = host.sim, L = host.k.lights;
    this.live = new GroundLive(host.scene, { w: sim.W * T, h: sim.H * T, seed: host.land.seed, paint: BIOMES[host.land.biome].paint, below: !!host.down, depth: -9.5 });
    this.lift = L.add(sim.lift.x, sim.lift.y - 10, { color: 0xffd070, radius: 200, intensity: 0.5 });
    for (let i = 0; i < 3; i++) this.flashes.push(L.add(-999, -999, { color: 0xffc070, radius: 160, intensity: 0 }));
    if (!host.down) this.weather = new WeatherView(host.scene, {
      sfx: (key, gain, x, y) => this.sfx(key, x, y, { gain }),
      banner: (text) => this.hud.banner(text, 4200),
      burst: (x, y, o) => this.k.fx.burst(x, y, o),
      flash: (x, y, color, i) => this.flash(x, y, color, i),
    });
    if (!host.down) this.twist = new TwistView(host.scene, { sfx: (key, gain) => this.sfx(key, undefined, undefined, { gain }), banner: (text) => this.hud.banner(text, 4200), floater: (x, y, text, color) => this.floater(x, y, text, color, 1200, 14) });
  }

  event(e: SimEvent) {
    this.weather?.event(e);
    this.twist?.event(e);
  }

  /** A light that flares where something happened and dies away (the three take turns). */
  flash(x: number, y: number, color: number, intensity = 1.6) {
    const l = this.flashes[this.flashI++ % this.flashes.length];
    l.setPosition(x, y).setColor(color).setIntensity(intensity);
  }

  update(dt: number) {
    const sim = this.sim, lights = this.scene.lights;
    for (const f of this.flashes) f.intensity = Math.max(0, f.intensity - dt * 9);
    // The sky follows the clock: the ambient light, and the lamps burn brighter as it darkens.
    // Down a dungeon there is no sky: the dark of a mine, only lamps.
    const sk = this.host.down ? { night: 1, ambient: ambientOf(sim.run!.d.def) } : sky(sim.day.hour);
    this.night = sk.night;
    const sky0 = this.weather ? this.weather.ambient(sk.ambient, sim.fx, sk.night) : sk.ambient;
    const amb = this.twist ? this.twist.ambient(sky0, sim) : sky0;
    lights.setAmbientColor(amb);
    this.weather?.update(dt, sim);
    this.twist?.update(dt, sim);
    const cam = this.scene.cameras.main;
    this.live.update(dt, this.night, amb, cam.midPoint.x, cam.midPoint.y);
    const { glow, wide } = lampLook(this.night);
    this.lift.y = sim.lift.y - 10 - (sim.exitUsed ? 0 : this.host.rise());
    this.lift.setIntensity(0.5 * glow).setRadius(200 * wide);
  }

  /**
   * Spend the light budget on the crew's lamps (`lamps.ts`): near lamps share one light, the farthest go dark if the rest
   * still do not fit, and every light eases to its target, so none pops at the screen's edge when the party grows.
   * Runs after everything else has set its lights this frame, so it counts them: what they take, the crew cannot.
   */
  late(dt: number) {
    this.lampPass(dt);
  }

  private lampPass(dt: number) {
    const lm = this.scene.lights, view = this.scene.cameras.main.worldView, lamps = this.host.lamps, bots = this.bots;
    const cap = lm.maxLights > 0 ? lm.maxLights : 8;
    if (!this.host.t.lampBudget) {
      for (const m of lamps) bots.get(m.id)?.light.setPosition(m.x, m.y).setRadius(m.r).setIntensity(m.i).setVisible(true);
      return;
    }
    const mine = new Set<Light>();
    for (const v of bots.values()) mine.add(v.light);
    // Lights that burn at nothing take no slot of the cap.
    for (const l of [...this.flashes, ...this.host.foeLights(), this.comm?.tip]) if (l) l.setVisible(l.intensity > LAMP_OFF);
    let others = 0;
    for (const l of lm.lights) if (!mine.has(l) && l.visible && l.intensity > LAMP_OFF && inView({ x: l.x, y: l.y, r: l.radius }, view)) others++;
    const budget = Math.max(1, cap - others - Math.ceil(cap * LAMP_SPARE));
    const { spots } = chooseSpots(lamps, { view, budget, focus: { x: view.centerX, y: view.centerY }, prev: this.lead });
    const lead = new Map<number, Spot>();
    this.lead.clear();
    for (const s of spots) {
      lead.set(s.lead, s);
      for (const id of s.ids) this.lead.set(id, s.lead);
    }
    for (const [id, v] of bots) {
      const l = v.light, s = lead.get(id);
      if (s && s.i > 0) {
        // A light that is coming on appears where it belongs and brightens; one that is on glides.
        if (l.intensity < LAMP_OFF || s.solo) l.setPosition(s.x, s.y).setRadius(s.r);
        else l.setPosition(follow(l.x, s.x, dt, LAMP_RATE.move), follow(l.y, s.y, dt, LAMP_RATE.move)).setRadius(follow(l.radius, s.r, dt, LAMP_RATE.move));
        l.setIntensity(s.solo ? s.i : follow(l.intensity, s.i, dt, LAMP_RATE.on));
      } else l.setIntensity(follow(l.intensity, 0, dt, LAMP_RATE.off));
      l.setVisible(l.intensity > LAMP_OFF);
    }
  }

  debug() {
    return { night: +this.night.toFixed(2), live: this.live.state() };
  }
}
