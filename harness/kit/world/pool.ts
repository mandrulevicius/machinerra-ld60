import Phaser from 'phaser';
import { bodyOff, bodyOn, type Obj } from './cull';

export interface PoolOpts<T extends Obj> {
  /** Name shown in `debugState()`. */
  name?: string;
  /** Builds one object (with its Arcade body, if it has one). Called only when no pooled one is free. */
  create(): T;
  /** Most objects alive at once; `get` returns null beyond it (default 256). */
  max?: number;
  /** Release objects that leave the world (`'world'`, default), the camera view (`'screen'`) or never (`null`), by `margin` px. */
  leave?: 'world' | 'screen' | null;
  margin?: number;
  /** Called on every release (stop tweens, clear state). */
  onRelease?(obj: T): void;
}

/**
 * Object pool for things that come and go (projectiles, pickups, popups). A released object is inactive and invisible,
 * and its Arcade body leaves the world (`world.disable`, which costs nothing while pooled; setVisible(false) alone would keep
 * simulating it). `get` re-enables the body and resets it at the spawn point.
 */
export class Pool<T extends Obj> {
  /** Alive objects. Releasing the one you are looking at, while iterating, is safe. */
  readonly active = new Set<T>();
  private free: T[] = [];
  private total = 0;
  private bounds: () => Phaser.Geom.Rectangle;

  constructor(private scene: Phaser.Scene, private opts: PoolOpts<T>, worldBounds: Phaser.Geom.Rectangle) {
    const margin = opts.margin ?? 64;
    const tmp = new Phaser.Geom.Rectangle();
    this.bounds = () => {
      const leave = opts.leave ?? 'world';
      const r = leave === 'screen' ? this.scene.cameras.main.worldView : worldBounds;
      return tmp.setTo(r.x - margin, r.y - margin, r.width + margin * 2, r.height + margin * 2);
    };
  }

  get name() {
    return this.opts.name ?? 'pool';
  }
  /** Objects built so far that are waiting to be reused. */
  get pooled() {
    return this.free.length;
  }
  get size() {
    return this.total;
  }

  /** An object at (x, y), reused if one is free. `setup` runs after it is reset, before it is returned (set velocity, texture, tint). */
  get(x: number, y: number, setup?: (obj: T) => void): T | null {
    let o = this.free.pop();
    if (!o) {
      if (this.total >= (this.opts.max ?? 256)) return null;
      o = this.opts.create();
      this.total++;
    }
    o.setActive(true).setVisible(true).setPosition(x, y);
    bodyOn(this.scene, o, { x, y });
    this.active.add(o);
    setup?.(o);
    return o;
  }

  release(o: T) {
    if (!this.active.delete(o)) return;
    this.opts.onRelease?.(o);
    bodyOff(this.scene, o);
    o.setActive(false).setVisible(false);
    this.free.push(o);
  }

  releaseAll() {
    for (const o of [...this.active]) this.release(o);
  }

  /** Build `n` objects up front (they start pooled). */
  prewarm(n: number) {
    const made: T[] = [];
    for (let i = 0; i < n; i++) {
      const o = this.get(0, 0);
      if (o) made.push(o);
    }
    made.forEach((o) => this.release(o));
  }

  /** Releases active objects that left the area. The world calls this every frame. */
  update() {
    if (this.opts.leave === null) return;
    const r = this.bounds();
    for (const o of this.active) if (!r.contains(o.x, o.y)) this.release(o);
  }
}
