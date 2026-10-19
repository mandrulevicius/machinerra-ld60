/**
 * The mesas' shadows (and a dungeon's walls'): a layer over the painted ground that leans with the light like every other
 * shadow (`sun.ts`: the sun by day, the lamps by night). The painted ground no longer carries a baked shadow (`groundart.ts`
 * keeps one only for the coarse far views); it hands the rock mask to `mesaMask`, once per land.
 *
 * The mask is the rocks at 2 game px per texel, blurred a little. The shadow is drawn in tiles (`TILE` game px): a tile's
 * canvas holds the mask swept along the lean (`HEIGHT` px of mesa per unit of lean) with the mask itself cut out, so the
 * shadow falls on the ground and never on a mesa's top. A tile is drawn again only when its lean (as `throwAt` gives it at
 * its centre) has changed by a step, a few tiles a frame, and only the tiles near the camera exist. The tiles are white; the
 * images are tinted by the land's shade and faded by the night like a prop's cast (`ALPHA.cast`).
 *
 * Use: `new MesaShadows(scene, groundKey, { depth, tint })`, `update(view, lean)` each frame; `parent` puts the images in a
 * container (a backdrop that moves its ground); `fixedLean` is a lean that never changes.
 */
import Phaser from 'phaser';
import { throwAt, type Vec } from './sun';

/** Game px per mask texel, tile size in game px, how tall a mesa stands (its shadow is this times the lean), the alpha. All guesses. */
const K = 2, TILE = 256, HEIGHT = 90, ALPHA = 0.42;
/** A tile is drawn again when its lean's angle moves by `STEP.a` degrees or its length by `STEP.l`; at most `BUDGET` per frame. */
const STEP = { a: 4, l: 0.06 }, BUDGET = 3;

interface Mask {
  /** The rocks, blurred (white, alpha). */
  cv: HTMLCanvasElement;
  w: number;
  h: number;
  /** Per tile: 1 if the tile or a neighbour holds rock (nothing else can cast into it). */
  near: Uint8Array;
  tw: number;
  th: number;
}
const masks = new Map<string, Mask>();

/** Keep the land's rock mask: `rocky` is W x H ground texels of `k` game px, 1 on rock. Called once per painted land. */
export function mesaMask(scene: Phaser.Scene, key: string, rocky: Uint8Array, W: number, H: number, k: number) {
  const step = Math.max(1, Math.round(K / k)), w = Math.ceil(W / step), h = Math.ceil(H / step);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  const img = c.createImageData(w, h);
  const d = img.data;
  const tile = TILE / K, tw = Math.ceil(w / tile), th = Math.ceil(h / tile);
  const has = new Uint8Array(tw * th);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = x * step, sy = y * step;
      // Rock if the texel or the one beside it is (a fringe a texel thin must survive the halving).
      if (rocky[sy * W + sx] || (sx + 1 < W && rocky[sy * W + sx + 1]) || (sy + 1 < H && rocky[(sy + 1) * W + sx])) {
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255;
        has[((y / tile) | 0) * tw + ((x / tile) | 0)] = 1;
      }
    }
  c.putImageData(img, 0, 0);
  // Soften the edge by a texel: blurred by a second pass so the sharp mask is not kept.
  const soft = document.createElement('canvas');
  soft.width = w;
  soft.height = h;
  const s = soft.getContext('2d')!;
  s.filter = 'blur(1px)';
  s.drawImage(cv, 0, 0);
  const near = new Uint8Array(tw * th);
  for (let j = 0; j < th; j++)
    for (let i = 0; i < tw; i++)
      for (let b = -1; b <= 1; b++)
        for (let a = -1; a <= 1; a++) if (has[Math.min(th - 1, Math.max(0, j + b)) * tw + Math.min(tw - 1, Math.max(0, i + a))]) near[j * tw + i] = 1;
  masks.set(key, { cv: soft, w, h, near, tw, th });
  scene.textures.once(Phaser.Textures.Events.REMOVE_KEY + key, () => masks.delete(key));
}

interface Tile {
  img: Phaser.GameObjects.Image;
  tex: Phaser.Textures.CanvasTexture;
  key: string;
  /** The quantized lean it shows (angle step, length step); NaN before the first draw. */
  qa: number;
  ql: number;
}

export class MesaShadows {
  private m: Mask | undefined;
  private tiles = new Map<number, Tile>();
  private o = { x: 0, y: 0, a: 1 };
  private id: string;
  private static n = 0;

  constructor(private scene: Phaser.Scene, private groundKey: string, private opt: { depth: number; tint: number; parent?: Phaser.GameObjects.Container }) {
    this.m = masks.get(groundKey);
    this.id = `mesashadow${MesaShadows.n++}`;
  }

  /** Lean the shadows for this frame: `view` the camera's world view (ground game px), `lean` the same as `throwAt`'s (per unit of height); `on` false hides them (shadows off in the quality menu). */
  update(view: Phaser.Geom.Rectangle, lean: (x: number, y: number, out: { x: number; y: number; a: number }) => void, on = true) {
    const m = this.m;
    if (!m) return;
    const o = this.o, tile = TILE;
    const x0 = Math.max(0, Math.floor((view.x - HEIGHT) / tile)), x1 = Math.min(m.tw - 1, Math.floor((view.right + HEIGHT) / tile));
    const y0 = Math.max(0, Math.floor((view.y - HEIGHT) / tile)), y1 = Math.min(m.th - 1, Math.floor((view.bottom + HEIGHT) / tile));
    const seen = new Set<number>();
    let budget = BUDGET;
    if (on)
      for (let j = y0; j <= y1; j++)
        for (let i = x0; i <= x1; i++) {
          const id = j * m.tw + i;
          if (!m.near[id]) continue;
          seen.add(id);
          let t = this.tiles.get(id);
          if (!t) this.tiles.set(id, (t = this.make(i, j, id)));
          lean((i + 0.5) * tile, (j + 0.5) * tile, o);
          const len = Math.hypot(o.x, o.y), qa = Math.round(((Math.atan2(o.y, o.x) * 180) / Math.PI) / STEP.a), ql = Math.round(len / STEP.l);
          if ((qa !== t.qa || ql !== t.ql) && (budget > 0 || Number.isNaN(t.qa))) {
            budget--;
            this.draw(t, i, j, o.x, o.y, m);
            t.qa = qa;
            t.ql = ql;
          }
          t.img.setVisible(!Number.isNaN(t.qa)).setAlpha(ALPHA * o.a);
        }
    for (const [id, t] of this.tiles) if (!seen.has(id)) t.img.setVisible(false);
  }

  private make(i: number, j: number, id: number): Tile {
    const n = TILE / K, key = `${this.id}-${id}`;
    const tex = this.scene.textures.createCanvas(key, n, n)!;
    const img = this.scene.add.image(i * TILE, j * TILE, key).setOrigin(0).setScale(K).setTint(this.opt.tint).setDepth(this.opt.depth).setVisible(false);
    this.opt.parent?.add(img);
    return { img, tex, key, qa: NaN, ql: NaN };
  }

  /** The mask swept along the lean over this tile, the mask itself cut out. */
  private draw(t: Tile, i: number, j: number, lx: number, ly: number, m: Mask) {
    const n = TILE / K, c = t.tex.getContext(), len = Math.hypot(lx, ly);
    const ox = (lx * HEIGHT) / K, oy = (ly * HEIGHT) / K, steps = Math.max(1, Math.ceil((len * HEIGHT) / K / 3));
    const tx = i * n, ty = j * n;
    c.clearRect(0, 0, n, n);
    c.globalCompositeOperation = 'source-over';
    const blit = (dx: number, dy: number) => {
      // The mask's rect that lands in this tile when shifted by (dx, dy), clipped to the mask.
      let sx = tx - dx, sy = ty - dy, w = n, h = n, px = 0, py = 0;
      if (sx < 0) { px = -sx; w += sx; sx = 0; }
      if (sy < 0) { py = -sy; h += sy; sy = 0; }
      if (sx + w > m.w) w = m.w - sx;
      if (sy + h > m.h) h = m.h - sy;
      if (w > 0 && h > 0) c.drawImage(m.cv, Math.round(sx), Math.round(sy), Math.round(w), Math.round(h), Math.round(px), Math.round(py), Math.round(w), Math.round(h));
    };
    for (let s = 1; s <= steps; s++) blit((ox * s) / steps, (oy * s) / steps);
    c.globalCompositeOperation = 'destination-out';
    blit(0, 0);
    c.globalCompositeOperation = 'source-over';
    t.tex.refresh();
  }

  destroy() {
    for (const t of this.tiles.values()) {
      t.img.destroy();
      if (this.scene.textures.exists(t.key)) this.scene.textures.remove(t.key);
    }
    this.tiles.clear();
  }
}

/** A lean that never changes, for a backdrop (`MesaShadows` with `lean` = this). */
export function fixedLean(sun: Vec) {
  return (_x: number, _y: number, out: { x: number; y: number; a: number }) => {
    throwAt(0, 0, sun, 0, [], out);
  };
}
