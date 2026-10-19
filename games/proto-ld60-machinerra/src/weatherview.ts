/**
 * The anomalies on screen (P54): the sky's cast (`anomalyAmbient`: the Sandstorm's dust, the Ember Rain's glow, the Blood Moon's red night),
 * and each passing weather's look, which comes in three beats like the rules do (`Sim.fx`): the warning on the horizon (`tell`), the weather
 * over everything as it eases in (`ease`), and back out. `LightView` owns one and feeds it the events.
 *  - Sandstorm: `stormview.ts` (a wall of haze from the left, blown sand), the wind.
 *  - Ember Rain: a red glow down from the top edge, embers falling through the view, a low rumble; each marked circle on the ground
 *    closes in red for `EMBERS.warn` s, then the ember lands (sparks and a flash) and the sim has set what stood there alight.
 * Add a weather's look: a `paint` case here, its gust sound in `GUST`, its `cast` in `ANOMALIES`.
 * Lights cut through the weather: all of it is drawn over the world as haze and streaks, never over the lamps' light.
 */
import Phaser from 'phaser';
import { mixColor, type AnomalyFx } from './sim/clock';
import { ANOMALIES, EMBERS, type AnomalyId } from './sim/defs';
import type { Sim } from './sim/sim';
import type { SimEvent } from './sim/types';
import { DANGER_HOT } from './house';
import { StormView } from './stormview';

/** The sky's ambient colour with the anomaly's cast mixed in (`cast.night`: only as dark as the night is). */
export function anomalyAmbient(ambient: number, fx: Pick<AnomalyFx, 'id' | 'ease'>, night: number) {
  const c = ANOMALIES[fx.id].cast;
  if (!c) return ambient;
  const k = c.k * fx.ease * (c.night ? night : 1);
  return k > 0 ? mixColor(ambient, c.tint, k) : ambient;
}

/** Each weather's gust sound (a sound group) and how often it plays at full strength (s). */
const GUST: Partial<Record<AnomalyId, { sound: string; every: number; gain: number }>> = {
  sandstorm: { sound: 'wind', every: 2.3, gain: 0.55 },
  emberRain: { sound: 'rumble', every: 3, gain: 0.7 },
};
/** The Ember Rain's colours and how many embers fall through the view at most. */
const EMBER = { glow: 0xff5a24, haze: 0xd0401c, spark: 0xffb050, falling: 60 };

interface Fall { x: number; y: number; v: number; len: number; a: number }

export interface WeatherOut {
  /** A sound group at a gain, and where it is heard (not given: everywhere). */
  sfx(key: string, gain: number, x?: number, y?: number): void;
  banner(text: string): void;
  burst(x: number, y: number, o: { color: number; size: number }): void;
  flash(x: number, y: number, color: number, intensity?: number): void;
}

export class WeatherView {
  private storm: StormView;
  private sky: Phaser.GameObjects.Graphics | null = null;
  private ground: Phaser.GameObjects.Graphics;
  private falls: Fall[] = [];
  private n = -1;
  private gustT = 0;

  constructor(private scene: Phaser.Scene, private o: WeatherOut) {
    this.storm = new StormView(scene);
    // The marked circles lie on the ground in the world, above the units so they are never hidden.
    this.ground = scene.add.graphics().setDepth(89000);
    for (let i = 0; i < EMBER.falling; i++) this.falls.push({ x: Math.random(), y: Math.random(), v: 0.5 + Math.random() * 0.7, len: 8 + Math.random() * 18, a: 0.4 + Math.random() * 0.6 });
  }

  ambient(a: number, fx: AnomalyFx, night: number) {
    return anomalyAmbient(a, fx, night);
  }

  event(e: SimEvent) {
    if (e.e !== 'weather') return;
    if (e.what === 'ember') {
      this.o.burst(e.x, e.y, { color: EMBER.spark, size: 1.3 });
      this.o.burst(e.x, e.y - 6, { color: DANGER_HOT, size: 0.7 });
      this.o.flash(e.x, e.y, 0xff7a30, 1.1);
      this.o.sfx('hiss', 0.5, e.x, e.y);
    } else if (e.what === 'caches') this.o.banner('The storm has passed: something is showing on the map');
  }

  update(dt: number, sim: Sim) {
    const fx = sim.fx, W = ANOMALIES[fx.id].weather;
    this.rings(sim);
    if (!W) return;
    if (fx.phase === 'idle') {
      this.storm.hide();
      this.sky?.clear();
      this.n = -1;
      return;
    }
    if (this.n !== fx.n) {
      this.n = fx.n;
      this.o.banner(W.banner);
    }
    // The gusts of sound: a little now and then at the warning, steady when it holds.
    const g = GUST[fx.id], strength = Math.max(fx.ease, fx.tell * 0.35);
    this.gustT -= dt;
    if (g && this.gustT <= 0) {
      this.gustT = g.every * (1.3 - 0.5 * strength);
      this.o.sfx(g.sound, g.gain * (0.25 + 0.75 * strength));
    }
    if (fx.id === 'sandstorm') this.storm.update(dt, fx);
    else if (fx.id === 'emberRain') this.rain(dt, fx);
  }

  /** The Ember Rain over the view: the sky glowing red from the top edge, embers falling through. */
  private rain(dt: number, fx: AnomalyFx) {
    const cam = this.scene.cameras.main, w = cam.width, h = cam.height;
    const g = (this.sky ??= this.scene.add.graphics().setScrollFactor(0).setDepth(59000));
    g.clear();
    const reach = h * (0.06 + 0.16 * fx.tell + 0.3 * fx.ease), depth = 0.12 + 0.22 * fx.tell + 0.1 * fx.ease, bands = 14;
    for (let i = 0; i < bands; i++) {
      const k = 1 - i / bands;
      g.fillStyle(EMBER.glow, depth * k * k);
      g.fillRect(0, (reach * i) / bands, w, reach / bands + 1);
    }
    if (fx.ease > 0) {
      g.fillStyle(EMBER.haze, 0.1 * fx.ease);
      g.fillRect(0, 0, w, h);
    }
    const live = Math.round(6 + (EMBER.falling - 6) * Math.max(fx.ease, fx.tell * 0.2));
    const speed = (0.28 + 0.5 * fx.ease) * h;
    for (let i = 0; i < live; i++) {
      const f = this.falls[i];
      f.y += (dt * speed * f.v) / h;
      f.x += (dt * speed * f.v * 0.25) / w;
      if (f.y > 1.05) { f.y = -0.05; f.x = Math.random(); }
      if (f.x > 1) f.x -= 1;
      g.lineStyle(2, i % 3 ? EMBER.spark : DANGER_HOT, f.a * (0.3 + 0.6 * Math.max(fx.ease, fx.tell * 0.4)));
      g.lineBetween(f.x * w, f.y * h, f.x * w - f.len * 0.25, f.y * h - f.len);
    }
  }

  /** The marked circles: a ring closing on the mark, the disc filling red, and in the last moment the ember streaking down. */
  private rings(sim: Sim) {
    const g = this.ground, E = sim.weather.embers;
    g.clear();
    if (!E.length) return;
    const view = this.scene.cameras.main.worldView;
    for (const e of E) {
      if (e.x < view.x - 120 || e.x > view.right + 120 || e.y < view.y - 120 || e.y > view.bottom + 120) continue;
      const k = 1 - Math.max(0, e.t) / EMBERS.warn;
      g.fillStyle(DANGER_HOT, 0.08 + 0.2 * k).fillCircle(e.x, e.y, EMBERS.r);
      g.lineStyle(2, DANGER_HOT, 0.5 + 0.5 * k).strokeCircle(e.x, e.y, EMBERS.r);
      g.lineStyle(2, 0xfff0c0, 0.35 + 0.5 * k).strokeCircle(e.x, e.y, EMBERS.r * (1 + 1.6 * (1 - k)));
      if (e.t < 0.35) {
        const up = (e.t / 0.35) * 340;
        g.lineStyle(3, 0xfff0c0, 0.9).lineBetween(e.x - up * 0.25, e.y - up, e.x - up * 0.25 + 4, e.y - up + 70);
      }
    }
  }

  destroy() {
    this.storm.destroy();
    this.sky?.destroy();
    this.ground.destroy();
  }
}
