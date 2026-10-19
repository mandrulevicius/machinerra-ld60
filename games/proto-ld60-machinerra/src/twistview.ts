/**
 * Laimonas's biome twists on screen (P31; rules in `sim/twists.ts`). Like the anomalies' weather (`weatherview.ts`), each passing
 * twist comes in three beats: its signal (`tell`), the weather over the view as it eases in (`ease`), and back out.
 *  - the rain (the jungle): the sky darkens and a few drips fall ahead of it, then rain in slanting streaks and a hiss.
 *  - the blizzard (the Frostspine): wind and thickening snow ahead of it, then a white veil and snow blowing sideways.
 *  - the cold: frost creeping in from the view's edges with each stack of Chill the cold has given him.
 * `LightView` owns one, feeds it the events and asks it to darken the sky (`ambient`). Drawn over the world, under the lamps' light.
 */
import Phaser from 'phaser';
import { mixColor } from './sim/clock';
import { COLD } from './sim/defs';
import type { Sim } from './sim/sim';
import type { SimEvent } from './sim/types';

/** The looks' colours and counts (guesses). `dark` is how far the rain darkens the sky toward `tint`. */
const RAIN = { tint: 0x30404c, dark: 0.35, streak: 0xb8d4e8, falling: 90, sound: 'rain', every: 2.6, gain: 0.5 };
const SNOW = { veil: 0xe8f0f8, veilK: 0.42, flake: 0xffffff, falling: 110, sound: 'wind', every: 2.3, gain: 0.55 };
const FROST = { color: 0xcfe8ff, k: 0.16 };

interface Fall { x: number; y: number; v: number; len: number; a: number; w: number }

export interface TwistOut {
  sfx(key: string, gain: number): void;
  banner(text: string): void;
  floater(x: number, y: number, text: string, color: string): void;
}

const BANNER = { rain: 'Rain is coming', blizzard: 'A blizzard is coming' } as const;

export class TwistView {
  private sky: Phaser.GameObjects.Graphics | null = null;
  private falls: Fall[] = [];
  private soundT = 0;

  constructor(private scene: Phaser.Scene, private o: TwistOut) {
    for (let i = 0; i < Math.max(RAIN.falling, SNOW.falling); i++) this.falls.push({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.6, len: 10 + Math.random() * 16, a: 0.35 + Math.random() * 0.55, w: Math.random() * Math.PI * 2 });
  }

  /** The sky darkened under the rain. */
  ambient(a: number, sim: Sim) {
    const r = sim.twists.now.rain, k = RAIN.dark * Math.max(r.ease, r.tell * 0.6);
    return k > 0 ? mixColor(a, RAIN.tint, k) : a;
  }

  event(e: SimEvent) {
    if (e.e === 'commute') {
      // The Hollow City's rush hour (P31): a banner as it starts, a cross word from each commuter that turns.
      if (e.what === 'start') this.o.banner('Rush hour');
      else if (e.what === 'turn') this.o.floater(e.x, e.y - 40, 'Excuse me!', '#ffb090');
      return;
    }
    if (e.e !== 'climate') return;
    if (e.kind === 'cold') return;
    if (e.what === 'warn') this.o.banner(BANNER[e.kind]);
  }

  update(dt: number, sim: Sim) {
    const W = sim.twists, rain = W.now.rain, snow = W.now.blizzard, frost = W.cold.on ? W.cold.stacks / COLD.cap : 0;
    if (rain.phase === 'idle' && snow.phase === 'idle' && !frost) {
      this.sky?.clear();
      return;
    }
    const cam = this.scene.cameras.main, w = cam.width, h = cam.height;
    const g = (this.sky ??= this.scene.add.graphics().setScrollFactor(0).setDepth(59000));
    g.clear();
    if (rain.phase !== 'idle') this.rain(g, dt, w, h, Math.max(rain.ease, rain.tell * 0.12));
    if (snow.phase !== 'idle') this.snow(g, dt, w, h, snow.ease, snow.tell);
    if (frost) this.frost(g, w, h, frost);
    const loud = Math.max(rain.ease, rain.tell * 0.3), windy = Math.max(snow.ease, snow.tell * 0.5);
    this.soundT -= dt;
    if (this.soundT <= 0 && (loud > 0.02 || windy > 0.02)) {
      const s = windy > loud ? SNOW : RAIN, k = Math.max(loud, windy);
      this.soundT = s.every * (1.3 - 0.5 * k);
      this.o.sfx(s.sound, s.gain * (0.25 + 0.75 * k));
    }
  }

  /** Slanting streaks; at the signal only a few drips. */
  private rain(g: Phaser.GameObjects.Graphics, dt: number, w: number, h: number, k: number) {
    const live = Math.round(4 + (RAIN.falling - 4) * k), speed = 1.4 * h;
    for (let i = 0; i < live; i++) {
      const f = this.falls[i];
      f.y += (dt * speed * f.v) / h;
      f.x += (dt * speed * f.v * 0.18) / w;
      if (f.y > 1.05) { f.y = -0.05; f.x = Math.random(); }
      if (f.x > 1) f.x -= 1;
      g.lineStyle(1.5, RAIN.streak, f.a * (0.25 + 0.5 * k));
      g.lineBetween(f.x * w, f.y * h, f.x * w - f.len * 0.18, f.y * h - f.len);
    }
  }

  /** A white veil as it eases in, flakes blowing across; at the signal the flakes thicken first. */
  private snow(g: Phaser.GameObjects.Graphics, dt: number, w: number, h: number, ease: number, tell: number) {
    if (ease > 0) g.fillStyle(SNOW.veil, SNOW.veilK * ease).fillRect(0, 0, w, h);
    const k = Math.max(ease, tell * 0.4), live = Math.round(6 + (SNOW.falling - 6) * k), speed = (0.12 + 0.5 * ease) * h;
    for (let i = 0; i < live; i++) {
      const f = this.falls[i];
      f.w += dt * 2;
      f.y += (dt * speed * f.v * 0.5) / h;
      f.x += (dt * speed * f.v * (0.9 + 0.3 * Math.sin(f.w))) / w;
      if (f.y > 1.05) { f.y = -0.05; f.x = Math.random(); }
      if (f.x > 1.02) { f.x = -0.02; f.y = Math.random(); }
      g.fillStyle(SNOW.flake, f.a * (0.4 + 0.5 * k)).fillCircle(f.x * w, f.y * h, 1 + f.len / 14);
    }
  }

  /** Frost from the edges, deeper with each stack of the cold's Chill. */
  private frost(g: Phaser.GameObjects.Graphics, w: number, h: number, k: number) {
    const bands = 10, reach = Math.min(w, h) * (0.06 + 0.08 * k);
    for (let i = 0; i < bands; i++) {
      const a = FROST.k * k * (1 - i / bands) ** 2, d = (reach * i) / bands, s = reach / bands + 1;
      g.fillStyle(FROST.color, a);
      g.fillRect(0, d, w, s).fillRect(0, h - d - s, w, s).fillRect(d, 0, s, h).fillRect(w - d - s, 0, s, h);
    }
  }

  destroy() {
    this.sky?.destroy();
  }
}
