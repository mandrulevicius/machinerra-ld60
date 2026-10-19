/**
 * Baked ground (P51): the pictures that lie on the ground and never sort with units (a broken prop's rubble today; floors and flat
 * decals when P47 adds them) are not one image each but stamps in 1024 px chunks of render texture, so the display list holds a
 * few chunks however many there are (the walls probe: CPU follows objects in the list, not what is on screen).
 * - Every stamp is kept as data (`add`), filed in each chunk its picture overlaps; a chunk gets a render texture only while it is
 *   in or near the view (`update`), from a small pool, and is drawn when it takes one (3-6 ms for ~1000 stamps, measured), so memory
 *   follows the view, not the land (4 MB a chunk). A chunk with nothing in it never takes one.
 * - A stamp added to a chunk that is up is stamped on (no re-bake). A stamp that must vanish (`remove`) re-bakes its chunk, at most
 *   one chunk a frame, the ones in view first.
 * - Render textures are lost with the WebGL context: on `restorewebgl` every chunk that is up is baked again.
 * Chunks are drawn at `res` render-texture pixels to a world pixel (1: 4 MB a chunk; the art is `S` times that, so a close zoom
 * softens a little). The bookkeeping (`ChunkIndex`, `plan`) is plain TS with tests beside it.
 */
import type Phaser from 'phaser';

/** One picture on the ground: a frame of the atlas `key` drawn with its origin at (x, y), world px. */
export interface Stamp {
  /** What it is, so it can be taken away (`remove`): unique. */
  id: number;
  frame: string;
  x: number;
  y: number;
  /** Origin, 0-1 (default 0.5, 0.5), scale, alpha and tint. */
  ox?: number;
  oy?: number;
  scale?: number;
  alpha?: number;
  tint?: number;
}

// ---------------------------------------------------------------- bookkeeping (pure)

/** Which stamps lie in which chunk of a `width` x `height` land cut into squares of `size` px. */
export class ChunkIndex<T> {
  readonly cols: number;
  readonly rows: number;
  private lists = new Map<number, T[]>();
  private where = new Map<number, number[]>();
  private byId = new Map<number, T>();

  constructor(width: number, height: number, readonly size: number) {
    this.cols = Math.max(1, Math.ceil(width / size));
    this.rows = Math.max(1, Math.ceil(height / size));
  }

  /** The chunks a box (world px) touches, in reading order. */
  span(x0: number, y0: number, x1: number, y1: number): number[] {
    const c0 = Math.max(0, Math.floor(x0 / this.size)), c1 = Math.min(this.cols - 1, Math.floor(x1 / this.size));
    const r0 = Math.max(0, Math.floor(y0 / this.size)), r1 = Math.min(this.rows - 1, Math.floor(y1 / this.size));
    const out: number[] = [];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(r * this.cols + c);
    return out;
  }

  /** Keep `item` (named `id`) in every chunk its box touches; returns those chunks. */
  add(id: number, item: T, x0: number, y0: number, x1: number, y1: number): number[] {
    if (this.where.has(id)) this.remove(id);
    const at = this.span(x0, y0, x1, y1);
    for (const ci of at) {
      const l = this.lists.get(ci);
      if (l) l.push(item);
      else this.lists.set(ci, [item]);
    }
    this.where.set(id, at);
    this.byId.set(id, item);
    return at;
  }

  /** Take `id` out of every chunk it was in; returns those chunks (none if it was not here). */
  remove(id: number): number[] {
    const at = this.where.get(id), item = this.byId.get(id) as T;
    if (!at) return [];
    this.where.delete(id);
    this.byId.delete(id);
    for (const ci of at) {
      const l = this.lists.get(ci)!;
      l.splice(l.indexOf(item), 1);
      if (!l.length) this.lists.delete(ci);
    }
    return at;
  }

  /** Stamps in a chunk, in the order they were added (later draws over earlier). */
  list(ci: number): readonly T[] {
    return this.lists.get(ci) ?? [];
  }
  /** The chunks in a box that have anything in them. */
  filled(x0: number, y0: number, x1: number, y1: number): number[] {
    return this.span(x0, y0, x1, y1).filter((ci) => this.lists.has(ci));
  }
  /** Stamps in all (one per id, not per chunk). */
  get count() {
    return this.where.size;
  }
  has(id: number) {
    return this.where.has(id);
  }
}

/**
 * What to do this frame about which chunks hold a render texture: `want` are the filled chunks in or near the view, `seen` the ones
 * in it, `up` the ones holding one now. Drop what is no longer wanted; bake every wanted chunk that is in view (a pop-in is worse than
 * a long frame) and at most `ahead` of the ones only near it, so a camera that moves meets chunks already drawn.
 */
export function plan(want: readonly number[], seen: ReadonlySet<number>, up: ReadonlySet<number>, ahead = 1): { drop: number[]; bake: number[] } {
  const wanted = new Set(want), drop = [...up].filter((ci) => !wanted.has(ci));
  const bake: number[] = [];
  let near = 0;
  for (const ci of want) if (!up.has(ci) && seen.has(ci)) bake.push(ci);
  for (const ci of want) if (!up.has(ci) && !seen.has(ci) && near < ahead) (bake.push(ci), near++);
  return { drop, bake };
}

// ---------------------------------------------------------------- render textures

export interface ChunkOpts {
  /** The land, px. */
  width: number;
  height: number;
  /** The texture (an atlas) every stamp's frame is of. */
  key: string;
  /** Draw depth of the chunks. */
  depth: number;
  /** Chunk side, world px (1024). */
  size?: number;
  /** Render-texture pixels per world pixel (1). */
  res?: number;
  /** A chunk this near the view (px) is kept up and drawn before it comes in (192). */
  margin?: number;
  /** Render textures kept idle for the next chunk to use (2). */
  spare?: number;
}

type Rt = Phaser.GameObjects.RenderTexture;

export class GroundChunks {
  private index: ChunkIndex<Stamp>;
  private up = new Map<number, Rt>();
  private idle: Rt[] = [];
  /** Chunks up that must be drawn again (a stamp was taken away) or have stamps waiting to be drawn. */
  private redo = new Set<number>();
  private fresh = new Set<number>();
  private size: number;
  private res: number;
  private margin: number;
  private spare: number;
  private bakes = 0;
  private rebakes = 0;
  private restores = 0;
  private bakeMs = 0;
  private restore = () => this.rebakeAll();

  constructor(private scene: Phaser.Scene, private o: ChunkOpts) {
    this.size = o.size ?? 1024;
    this.res = o.res ?? 1;
    this.margin = o.margin ?? 192;
    this.spare = o.spare ?? 2;
    this.index = new ChunkIndex(o.width, o.height, this.size);
    const gl = scene.game.renderer;
    gl.on('restorewebgl', this.restore);
    scene.events.once('shutdown', () => this.destroy());
  }

  /** Put a picture on the ground. In a chunk that is up it is stamped on at once. */
  add(s: Stamp) {
    const fr = this.scene.textures.getFrame(this.o.key, s.frame), k = s.scale ?? 1, ox = s.ox ?? 0.5, oy = s.oy ?? 0.5;
    const w = fr.width * k, h = fr.height * k;
    for (const ci of this.index.add(s.id, s, s.x - ox * w, s.y - oy * h, s.x + (1 - ox) * w, s.y + (1 - oy) * h)) {
      const rt = this.up.get(ci);
      if (!rt || this.redo.has(ci)) continue;
      this.stamp(rt, ci, s);
      this.fresh.add(ci);
    }
  }

  /** Take a picture off the ground: the chunks it was in are drawn again (one a frame). */
  remove(id: number) {
    for (const ci of this.index.remove(id)) if (this.up.has(ci)) this.redo.add(ci);
  }

  has(id: number) {
    return this.index.has(id);
  }

  /** Once a frame, with the camera's view (world px): chunks that came into reach are drawn, those that left give their render texture back. */
  update(view: Phaser.Geom.Rectangle) {
    const m = this.margin, ix = this.index;
    const want = ix.filled(view.x - m, view.y - m, view.right + m, view.bottom + m);
    const seen = new Set(ix.filled(view.x, view.y, view.right, view.bottom));
    const { drop, bake } = plan(want, seen, new Set(this.up.keys()));
    for (const ci of drop) this.release(ci);
    for (const ci of bake) this.take(ci);
    // One chunk a frame is drawn again for a stamp taken away: those in view first.
    let again: number | undefined;
    for (const ci of this.redo) {
      if (!this.up.has(ci)) this.redo.delete(ci);
      else if (again === undefined || (seen.has(ci) && !seen.has(again))) again = ci;
    }
    if (again !== undefined) {
      this.redo.delete(again);
      this.rebakes++;
      this.bake(again);
    }
    for (const ci of this.fresh) this.up.get(ci)?.render();
    this.fresh.clear();
  }

  /** The WebGL context came back: render textures are empty, so draw every chunk that is up again. */
  rebakeAll() {
    this.restores++;
    for (const ci of this.up.keys()) this.bake(ci);
  }

  private take(ci: number) {
    let rt = this.idle.pop();
    const x = (ci % this.index.cols) * this.size, y = Math.floor(ci / this.index.cols) * this.size;
    if (rt) rt.setPosition(x, y).setVisible(true);
    else {
      const px = this.size * this.res;
      rt = this.scene.add.renderTexture(x, y, px, px).setOrigin(0).setDepth(this.o.depth);
      if (this.res !== 1) rt.setScale(1 / this.res);
    }
    this.up.set(ci, rt);
    this.bakes++;
    this.bake(ci);
  }

  private release(ci: number) {
    const rt = this.up.get(ci);
    if (!rt) return;
    this.up.delete(ci);
    this.redo.delete(ci);
    this.fresh.delete(ci);
    rt.setVisible(false);
    this.idle.push(rt);
    while (this.idle.length > this.spare) this.idle.shift()!.destroy();
  }

  /** Clear a chunk's render texture and stamp everything in it. */
  private bake(ci: number) {
    const rt = this.up.get(ci);
    if (!rt) return;
    const t0 = performance.now();
    rt.clear();
    for (const s of this.index.list(ci)) this.stamp(rt, ci, s);
    rt.render();
    this.bakeMs = performance.now() - t0;
    this.redo.delete(ci);
    this.fresh.delete(ci);
  }

  private stamp(rt: Rt, ci: number, s: Stamp) {
    const cols = this.index.cols, r = this.res, ox = (ci % cols) * this.size, oy = Math.floor(ci / cols) * this.size;
    rt.stamp(this.o.key, s.frame, (s.x - ox) * r, (s.y - oy) * r, { originX: s.ox ?? 0.5, originY: s.oy ?? 0.5, scale: (s.scale ?? 1) * r, alpha: s.alpha ?? 1, tint: s.tint ?? 0xffffff });
  }

  get stats() {
    return { stamps: this.index.count, up: this.up.size, idle: this.idle.length, bakes: this.bakes, rebakes: this.rebakes, restores: this.restores, lastBakeMs: +this.bakeMs.toFixed(2) };
  }

  destroy() {
    this.scene.game.renderer.off('restorewebgl', this.restore);
    for (const rt of [...this.up.values(), ...this.idle]) rt.destroy();
    this.up.clear();
    this.idle = [];
  }
}

