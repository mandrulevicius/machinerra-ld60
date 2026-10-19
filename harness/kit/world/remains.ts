import Phaser from 'phaser';
import { DEFAULT_STAGES, stageAt, type Stage } from './logic';
import { bodyOff, type Obj } from './cull';
import { MARK_SPLAT } from './textures';
import type { Marks, MarkOpts } from './marks';

type Decaying = Obj & (Phaser.GameObjects.Image | Phaser.GameObjects.Sprite);

export interface RemainsOpts {
  /** Seconds from dead to smudge (default 8). */
  life?: number;
  /** Looks, evenly spaced over the life and blended (default: fresh, darker, rusty, dark husk). */
  stages?: Stage[];
  /** What is baked into the ground at the end (a `MarkOpts` plus `key`; `tint` defaults to the last stage, size to the object's). `false` = leave nothing. */
  smudge?: (MarkOpts & { key?: string }) | false;
  /** Out of sight: `'jump'` (default) finishes at once, still baking its smudge; `'keep'` decays like any other. */
  offscreen?: 'jump' | 'keep';
  /** Called when the remains end, instead of destroying the object (e.g. `(o) => pool.release(o)`). */
  done?(obj: Decaying): void;
}

interface Item {
  obj: Decaying;
  o: RemainsOpts;
  stages: Stage[];
  t: number;
  rate: number;
  sx: number;
  sy: number;
  a0: number;
}

const FAST = 6;

/**
 * Corpses and debris that do not just vanish: each decays through stages (tint, scale, alpha) and then turns into a
 * smudge in the mark layer. Only when nobody can see it does one end at once (`offscreen: 'jump'`).
 * Past `max` live remains the oldest ones decay 6x faster, in view, instead of popping.
 * The object's Arcade body is taken out of the simulation; its game logic is the caller's to stop.
 */
export class Remains {
  private list: Item[] = [];
  private look = { tint: 0, scale: 0, alpha: 0 };

  constructor(private scene: Phaser.Scene, private marks: Marks, public max = 120, public margin = 160) {}

  get count() {
    return this.list.length;
  }

  add(obj: Decaying, opts: RemainsOpts = {}) {
    bodyOff(this.scene, obj);
    this.list.push({ obj, o: opts, stages: opts.stages ?? DEFAULT_STAGES, t: 0, rate: 1, sx: obj.scaleX, sy: obj.scaleY, a0: obj.alpha });
    let slow = 0;
    for (const i of this.list) if (i.rate === 1) slow++;
    for (const i of this.list) {
      if (slow <= this.max) break;
      if (i.rate === 1) {
        i.rate = FAST;
        slow--;
      }
    }
  }

  update(dt: number) {
    const v = this.scene.cameras.main.worldView;
    let n = 0;
    for (const it of this.list) {
      const { obj, o } = it;
      const sees = obj.x > v.x - this.margin && obj.x < v.right + this.margin && obj.y > v.y - this.margin && obj.y < v.bottom + this.margin;
      it.t += (dt / 1000 / (o.life ?? 8)) * it.rate;
      if (it.t >= 1 || (!sees && (o.offscreen ?? 'jump') === 'jump') || !obj.scene) this.finish(it);
      else {
        const s = stageAt(it.stages, it.t, this.look);
        obj.setTint(s.tint).setScale(it.sx * s.scale, it.sy * s.scale).setAlpha(it.a0 * s.alpha);
        this.list[n++] = it;
      }
    }
    this.list.length = n;
  }

  private finish(it: Item) {
    const { obj, o } = it;
    if (!obj.scene) return;
    if (o.smudge !== false) {
      const { key = MARK_SPLAT, ...m } = o.smudge ?? {};
      const frame = this.scene.textures.getFrame(key, m.frame as string | number | undefined);
      const size = Math.max(obj.displayWidth / Math.abs(obj.scaleX) * it.sx, obj.displayHeight / Math.abs(obj.scaleY) * it.sy) * 1.2; // the object's size at the start
      const last = it.stages[it.stages.length - 1];
      this.marks.stamp(key, obj.x, obj.y, { tint: last.tint, alpha: 0.75, scale: size / Math.max(frame.width, frame.height), angle: Phaser.Math.Between(0, 359), ...m });
    }
    if (o.done) o.done(obj);
    else obj.destroy();
  }
}
