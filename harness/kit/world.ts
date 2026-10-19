/**
 * World kit: helpers for levels bigger than the screen, in `world/`. Standalone (not part of `kit(scene)`: it needs the
 * level size). `createWorld(scene, { width, height })` gives one object that updates itself every frame (scene POST_UPDATE):
 *
 *   w.cull        grid cull + "near the camera" logic and bodies        (cull.ts)
 *   w.pool(opts)  pools that despawn at the world/screen edge           (pool.ts)
 *   w.marks       baked ground marks, fading prints, `at(x, y)`         (marks.ts)
 *   w.remains     corpses that decay into smudges                       (remains.ts)
 *   w.shadows     blob shadows, honoring quality.shadows                (shadows.ts)
 *   w.stagger()   far/idle logic every N frames, spread over frames    (stagger.ts)
 *
 * Origin: the level starts at (0, 0). Camera: the main camera only. Physics: Arcade only (Matter bodies are not handled).
 * Zones are computed from the camera at the end of the frame, so they lag it by one frame (the margins cover that);
 * after a camera jump call `w.update()`.
 *
 * Lab facts this rests on (games/lab GpuFx probe 4 and 5, Physics probe): Phaser 4 draws every visible object in or out of view
 * (5000 sprites: 13 -> 3.5 ms with a grid cull plus logic only near the camera); `world.disable(obj)` takes a pooled body out of
 * the simulation for free where `setVisible(false)` does not; a baked texture costs ~2-3 ms whatever it holds.
 * Verified in the lab World scene (`?scene=World`): see its top comment for numbers and gotchas.
 */
import Phaser from 'phaser';
import { Cull, type Obj } from './world/cull';
import { Pool, type PoolOpts } from './world/pool';
import { Marks } from './world/marks';
import { Remains } from './world/remains';
import { Shadows } from './world/shadows';
import { Stagger } from './world/stagger';

export interface WorldOpts {
  width: number;
  height: number;
  /** Grid cell, px (default 256). */
  cell?: number;
  /** Visible zone: camera view + this many px (default 64). */
  viewMargin?: number;
  /** Near zone, for logic and bodies: camera view + this many px (default 320). */
  nearMargin?: number;
  /** Mark layer chunk size, px (default 1024). */
  chunk?: number;
  /** Draw depths of the ground layers; objects should sit above them (default marks -100, shadows -50). */
  depth?: { marks?: number; shadows?: number };
}

export class World {
  readonly bounds: Phaser.Geom.Rectangle;
  readonly cull: Cull;
  readonly marks: Marks;
  readonly remains: Remains;
  readonly shadows: Shadows;
  private pools: Pool<Obj>[] = [];
  private staggers: Stagger<Obj>[] = [];
  private offs: (() => void)[] = [];

  constructor(readonly scene: Phaser.Scene, o: WorldOpts) {
    this.bounds = new Phaser.Geom.Rectangle(0, 0, o.width, o.height);
    this.cull = new Cull(scene, o.width, o.height, o.cell, o.viewMargin, o.nearMargin);
    this.marks = new Marks(scene, o.width, o.height, o.chunk, o.depth?.marks ?? -100);
    this.remains = new Remains(scene, this.marks);
    this.shadows = new Shadows(scene, o.depth?.shadows ?? -50);
    this.cull.update();
    const tick = (_t: number, dt: number) => this.tick(dt);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, tick);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, tick));
  }

  /** A pool whose objects are released when they leave the world (or the screen). */
  pool<T extends Obj>(opts: PoolOpts<T>): Pool<T> {
    const p = new Pool<T>(this.scene, opts, this.bounds);
    this.pools.push(p as unknown as Pool<Obj>);
    return p;
  }

  /**
   * Logic for entities that need not run every frame: `fn(obj, dt)` once per `every` frames per entity, spread so each frame
   * handles 1/every of them (dt = ms since its last turn). Entities in the near zone are skipped (run those in `cull.forNear`);
   * pass `skipNear = false` to include them. `add` entities to the returned Stagger; `remove` them when destroyed.
   */
  stagger<T extends Obj>(every: number, fn: (obj: T, dt: number) => void, skipNear = true): Stagger<T> {
    const s = new Stagger<T>(every, fn, skipNear ? (o) => this.cull.isNear(o) : undefined);
    this.staggers.push(s as unknown as Stagger<Obj>);
    return s;
  }

  /** Runs on its own each frame; call it by hand after a camera jump. */
  update(dt = 16) {
    this.tick(dt);
  }

  private tick(dt: number) {
    this.cull.update();
    for (const s of this.staggers) s.update(dt);
    for (const p of this.pools) p.update();
    this.remains.update(dt);
    this.shadows.update();
    this.marks.update(dt);
  }

  /** Counts for `debugState()`: what is tracked, visible, near, pooled, decaying, baked. */
  debugState() {
    return {
      cull: this.cull.stats,
      pools: Object.fromEntries(this.pools.map((p) => [p.name, { active: p.active.size, pooled: p.pooled, total: p.size }])),
      remains: this.remains.count,
      marks: this.marks.stats,
      shadows: { count: this.shadows.count, enabled: this.shadows.enabled },
    };
  }
}

export function createWorld(scene: Phaser.Scene, opts: WorldOpts): World {
  return new World(scene, opts);
}

export { Cull, Pool, Marks, Remains, Shadows, Stagger };
export type { Obj, PoolOpts };
export type { CullOpts } from './world/cull';
export { bodyOff, bodyOn } from './world/cull';
export type { MarkOpts, FeetOpts, Footprints } from './world/marks';
export type { RemainsOpts } from './world/remains';
export type { ShadowOpts, Shadow } from './world/shadows';
export type { Stage, MarkInfo } from './world/logic';
export { DEFAULT_STAGES } from './world/logic';
export { MARK_SOFT, MARK_SPLAT, MARK_FOOT } from './world/textures';
