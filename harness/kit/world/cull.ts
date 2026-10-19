import Phaser from 'phaser';
import { EMPTY, Grid, copyRange, diffRanges, type Range } from './grid';

/** Anything the world kit can cull, pool, shadow or turn into remains: an Image, Sprite, Arcade image... */
export type Obj = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible;

/** Arcade world of the scene, if the scene has Arcade physics (its config opts in). */
export const arcadeWorld = (scene: Phaser.Scene): Phaser.Physics.Arcade.World | undefined => (scene.physics as { world?: Phaser.Physics.Arcade.World } | undefined)?.world;

/** Takes an Arcade body out of the simulation (cheap: `world.disable`, see lab Physics probe). No-op without a body. */
export function bodyOff(scene: Phaser.Scene, obj: Obj) {
  const w = arcadeWorld(scene);
  if (w && (obj as { body?: unknown }).body) w.disable(obj);
}
/** Puts the body back; `at` also resets its position and zeroes velocity. */
export function bodyOn(scene: Phaser.Scene, obj: Obj, at?: { x: number; y: number }) {
  const w = arcadeWorld(scene);
  if (!w || !(obj as { body?: unknown }).body) return;
  w.enable(obj);
  if (at) (obj as unknown as { body: Phaser.Physics.Arcade.Body }).body.reset(at.x, at.y);
}

export interface CullOpts {
  /** The object moves by itself: its grid cell is re-checked every frame while it is near the camera (default false). */
  mobile?: boolean;
  /** Take its Arcade body out of the simulation while it is not near the camera (default false). */
  body?: boolean;
}

interface Entry {
  obj: Obj;
  mobile: boolean;
  body: boolean;
  vis: boolean;
  act: boolean;
  cell: number;
}

/**
 * Spatial grid over the world with two zones around the main camera:
 *  - visible: camera view + `viewMargin`. Objects outside have `visible = false` (Phaser 4 draws everything visible, in view or not).
 *  - near: camera view + `nearMargin`. Game logic should run only here (`forNear`), and Arcade bodies of `body: true`
 *    objects exist only here.
 * Only cells that entered or left a zone are touched per frame, so the cost follows the view, not the world.
 * Objects far from the camera do not move, so only mobile objects in the near zone are re-filed (`moved(obj)` for a
 * teleport or an outside push). Do not set `visible` on tracked objects yourself; the grid owns it.
 */
export class Cull {
  readonly grid: Grid<Entry>;
  private entries = new Map<Obj, Entry>();
  // Zones are double-buffered and the callbacks pre-bound, so `update()` allocates nothing.
  private view: Range = { ...EMPTY };
  private nearR: Range = { ...EMPTY };
  private nextView: Range = { ...EMPTY };
  private nextNear: Range = { ...EMPTY };
  private crossed: Entry[] = [];
  private nearFn: ((obj: Obj) => void) | null = null;
  private on = true;
  private nVis = 0;
  private nAct = 0;
  private nBodiesOff = 0;

  constructor(private scene: Phaser.Scene, width: number, height: number, cell = 256, public viewMargin = 64, public nearMargin = 320) {
    this.grid = new Grid<Entry>(width, height, cell);
  }

  /** false = everything visible and near (to compare cost, or for a cutscene); true = culling. */
  get enabled() {
    return this.on;
  }
  set enabled(v: boolean) {
    this.on = v;
    this.update();
  }

  get stats() {
    return { tracked: this.entries.size, visible: this.nVis, near: this.nAct, bodiesOff: this.nBodiesOff };
  }

  add<T extends Obj>(obj: T, opts: CullOpts = {}): T {
    if (this.entries.has(obj)) this.remove(obj);
    const e: Entry = { obj, mobile: !!opts.mobile, body: !!opts.body, vis: true, act: true, cell: 0 };
    this.entries.set(obj, e);
    this.nVis++;
    this.nAct++;
    e.cell = this.grid.add(e, obj.x, obj.y);
    this.apply(e);
    return obj;
  }

  /** Stop tracking. A hidden or body-less object stays as it is; the caller is destroying or pooling it. */
  remove(obj: Obj) {
    const e = this.entries.get(obj);
    if (!e) return;
    this.grid.remove(e);
    this.entries.delete(obj);
    if (e.vis) this.nVis--;
    if (e.act) this.nAct--;
    else if (e.body) this.nBodiesOff--;
  }

  has(obj: Obj) {
    return this.entries.has(obj);
  }
  isVisible(obj: Obj) {
    return !!this.entries.get(obj)?.vis;
  }
  isNear(obj: Obj) {
    return !!this.entries.get(obj)?.act;
  }

  /** Re-file an object after teleporting it (mobile objects near the camera are re-filed on their own). */
  moved(obj: Obj) {
    const e = this.entries.get(obj);
    if (e) this.relocate(e);
  }

  /** Runs fn for every tracked object in the near zone: put per-object game logic (AI, timers) here. Removing the current object inside fn is safe. */
  forNear(fn: (obj: Obj) => void) {
    const outer = this.nearFn;
    this.nearFn = fn;
    this.grid.each(this.nearR, this.eachNear);
    this.nearFn = outer;
  }
  private eachNear = (e: Entry) => this.nearFn!(e.obj);
  private gather = (e: Entry) => {
    if (e.mobile && this.grid.cellAt(e.obj.x, e.obj.y) !== e.cell) this.crossed.push(e);
  };
  private viewIn = (c: number) => this.setCell(c, true, undefined);
  private viewOut = (c: number) => this.setCell(c, false, undefined);
  private nearIn = (c: number) => this.setCell(c, undefined, true);
  private nearOut = (c: number) => this.setCell(c, undefined, false);

  /** Recompute both zones from the main camera. The world calls this every frame; call it yourself after a camera jump. */
  update() {
    const g = this.grid;
    // 1. mobile objects that were near may have crossed into another cell
    const crossed = this.crossed;
    crossed.length = 0;
    g.each(this.nearR, this.gather);
    for (let i = 0; i < crossed.length; i++) this.relocate(crossed[i]);
    // 2. zones
    const v = this.zone(this.viewMargin, this.nextView);
    const a = this.zone(this.nearMargin, this.nextNear);
    diffRanges(this.view, v, g.cols, this.viewIn, this.viewOut);
    diffRanges(this.nearR, a, g.cols, this.nearIn, this.nearOut);
    this.nextView = this.view;
    this.nextNear = this.nearR;
    this.view = v;
    this.nearR = a;
  }

  private zone(margin: number, out: Range): Range {
    if (!this.on) return copyRange(out, this.grid.fullRange);
    const v = this.scene.cameras.main.worldView;
    return this.grid.rangeInto(out, v.x - margin, v.y - margin, v.right + margin, v.bottom + margin);
  }

  private setCell(cell: number, vis?: boolean, act?: boolean) {
    for (const e of this.grid.itemsIn(cell)) {
      if (vis !== undefined) this.setVis(e, vis);
      if (act !== undefined) this.setAct(e, act);
    }
  }
  private relocate(e: Entry) {
    const cell = this.grid.move(e, e.obj.x, e.obj.y);
    if (cell < 0) return;
    e.cell = cell;
    this.apply(e);
  }
  /** Bring an entry's flags in line with the zones its cell is in. */
  private apply(e: Entry) {
    this.setVis(e, this.grid.cellInRange(this.view, e.cell));
    this.setAct(e, this.grid.cellInRange(this.nearR, e.cell));
  }
  private setVis(e: Entry, v: boolean) {
    if (e.vis === v) return;
    e.vis = v;
    e.obj.visible = v;
    this.nVis += v ? 1 : -1;
  }
  private setAct(e: Entry, v: boolean) {
    if (e.act === v) return;
    e.act = v;
    this.nAct += v ? 1 : -1;
    if (!e.body) return;
    this.nBodiesOff += v ? -1 : 1;
    if (v) bodyOn(this.scene, e.obj);
    else bodyOff(this.scene, e.obj);
  }
}
