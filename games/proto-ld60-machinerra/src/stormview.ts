/**
 * The Sandstorm on screen (P40, P54): a wall of brown haze creeping in from the windward edge at the warning, blowing sand over the
 * whole view as it eases in, and a warm cast on the light. It only draws; `weatherview.ts` owns it, says the banner, plays the wind and
 * hides it between gusts. Everything follows `Sim.fx` (`tell` 0..1 then `ease` 0..1, `sim/clock.ts` `anomalyFx`), so nothing arrives at
 * once. The haze and the sand are drawn over the world but never over the lamps' own light: the cast is the ambient colour
 * (`anomalyAmbient`), which the lamps shine through.
 */
import Phaser from 'phaser';
import type { AnomalyFx } from './sim/clock';

/** The storm's haze, its sand and how many streaks of it blow. */
export const STORM = { haze: 0x8a5a2e, wall: 0x5e3718, sand: 0xf0d09a, streaks: 90 };

const smooth = (k: number) => k * k * (3 - 2 * k);

interface Streak { x: number; y: number; v: number; len: number; a: number }

export class StormView {
  private g: Phaser.GameObjects.Graphics | null = null;
  private streaks: Streak[] = [];

  constructor(private scene: Phaser.Scene) {
    for (let i = 0; i < STORM.streaks; i++) this.streaks.push({ x: Math.random(), y: Math.random(), v: 0.6 + Math.random() * 0.8, len: 18 + Math.random() * 46, a: 0.35 + Math.random() * 0.65 });
  }

  /** Draw one frame of the storm; `fx.phase` is not idle. */
  update(dt: number, fx: AnomalyFx) {
    const strength = Math.max(fx.ease, fx.tell * 0.35);
    const cam = this.scene.cameras.main;
    const w = cam.width, h = cam.height;
    const g = (this.g ??= this.scene.add.graphics().setScrollFactor(0).setDepth(59000));
    g.clear();
    // The wall on the horizon: a dark brown front banded in from the left edge, solid behind and soft at its front, deeper and reaching
    // further as the tell goes on, then as it eases in (pale haze on pale sand did not read: it has to be darker than the ground).
    const reach = w * (0.08 + 0.32 * fx.tell + 0.9 * fx.ease);
    const depth = 0.3 + 0.35 * fx.tell - 0.4 * fx.ease;
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const m = (i + 0.5) / bands, k = m < 0.55 ? 1 : 1 - smooth((m - 0.55) / 0.45);
      g.fillStyle(STORM.wall, depth * k);
      const x0 = Math.floor((reach * i) / bands), x1 = Math.floor((reach * (i + 1)) / bands); // whole pixels, no overlap: an overlap draws a seam
      g.fillRect(x0, 0, x1 - x0, h);
    }
    // The storm itself over everything: a thin veil of haze.
    if (fx.ease > 0) {
      g.fillStyle(STORM.haze, 0.36 * fx.ease);
      g.fillRect(0, 0, w, h);
    }
    // Blown sand: streaks across the view, more and faster as it eases in.
    const live = Math.round(8 + (STORM.streaks - 8) * Math.max(fx.ease, fx.tell * 0.25));
    const speed = (0.25 + 1.6 * fx.ease + 0.3 * fx.tell) * w;
    g.lineStyle(1.5, STORM.sand, 1);
    for (let i = 0; i < live; i++) {
      const s = this.streaks[i];
      s.x += (dt * speed * s.v) / w;
      s.y += (dt * speed * s.v * 0.16) / h;
      if (s.x > 1.1) { s.x = -0.1; s.y = Math.random(); }
      if (s.y > 1) s.y -= 1;
      g.lineStyle(1.5, STORM.sand, s.a * (0.16 + 0.5 * strength));
      g.lineBetween(s.x * w, s.y * h, s.x * w - s.len * (0.5 + fx.ease), s.y * h - s.len * 0.16 * (0.5 + fx.ease));
    }
  }

  /** Clear the view between gusts. */
  hide() {
    this.g?.clear();
  }

  destroy() {
    this.g?.destroy();
    this.g = null;
  }
}
