/**
 * What a stride looks like (Minos: "when player is moving fast in base, add a visual effect to signify speed"): dust kicked
 * up at the heels on each footfall, a few pale streaks trailing behind, a slight lean into the run. All of it scales with
 * `strideLevel`, which is 0 while a step is still starting and 1 at full stride, and eases in and out. Warm paper and
 * dust only: red is for danger, cyan for ours. Cheap: a handful of short-lived tweened objects a second, no textures made.
 * The hub scene feeds it each frame (`Hub.walk`); it owns nothing that outlives the scene.
 */
import Phaser from 'phaser';
import { LINE } from '../house';
import { strideLevel } from './layout';

/** The most the Communicator leans into a run, degrees (a guess: slight). */
const LEAN = 5;
/** Below this level nothing is spawned. */
const MIN = 0.2;

export class StrideFx {
  /** The eased level: rises with the stride, falls when he slows. */
  level = 0;
  private tilt = 0;
  private streak = 0;

  constructor(private scene: Phaser.Scene, private unlit: (o: Phaser.GameObjects.GameObject) => void) {}

  /** Each frame: `speed` px/s, and the unit direction he moved. Returns the lean in degrees. */
  update(dt: number, speed: number, moving: boolean, ux: number, uy: number, x: number, y: number) {
    const want = moving ? strideLevel(speed) : 0;
    this.level += (want - this.level) * Math.min(1, dt * (want > this.level ? 7 : 5));
    this.tilt += (Math.sign(ux) * this.level * LEAN - this.tilt) * Math.min(1, dt * 10);
    if (!moving || this.level < MIN) return this.tilt;
    // A streak every ~0.07 s at full stride, behind him at chest height, along his path.
    this.streak -= dt * this.level;
    if (this.streak <= 0) {
      this.streak = 0.05;
      this.line(x, y, ux, uy);
    }
    return this.tilt;
  }

  /** A footfall at stride: a small cloud of dust at the heel, drifting back. */
  dust(x: number, y: number, ux: number, uy: number) {
    if (this.level < MIN) return;
    const k = this.level;
    const px = x - ux * 10 + Phaser.Math.Between(-5, 5), py = y - 4 - uy * 4;
    const p = this.scene.add.image(px, py, 'hub-cloud').setScale(0.07 + 0.04 * k).setAlpha(0.9 * k).setDepth(py - 1).setTint(0xd8c19a);
    this.unlit(p);
    this.scene.tweens.add({
      targets: p,
      x: px - ux * 26,
      y: py - 8 - uy * 10,
      scale: 0.22 + 0.08 * k,
      alpha: 0,
      duration: 520,
      ease: 'Sine.easeOut',
      onComplete: () => p.destroy(),
    });
  }

  private line(x: number, y: number, ux: number, uy: number) {
    const k = this.level;
    const side = Phaser.Math.FloatBetween(-22, 22);
    const sx = x - ux * 24 - uy * side, sy = y - 26 + Phaser.Math.Between(-16, 10) + ux * side * 0.3;
    const s = this.scene.add.rectangle(sx, sy, 36 + 24 * k, LINE.accent, 0xf6eedd).setRotation(Math.atan2(uy, ux)).setAlpha(0.6 * k).setDepth(y - 1);
    this.unlit(s);
    this.scene.tweens.add({
      targets: s,
      x: sx - ux * 30,
      y: sy - uy * 30,
      scaleX: 0.3,
      alpha: 0,
      duration: 260,
      ease: 'Quad.easeOut',
      onComplete: () => s.destroy(),
    });
  }
}
