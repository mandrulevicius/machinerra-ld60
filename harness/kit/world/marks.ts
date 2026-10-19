import Phaser from 'phaser';
import { MarkMap, Strider, type MarkInfo } from './logic';
import { MARK_FOOT, MARK_SOFT, ensureTextures } from './textures';
import type { Obj } from './cull';

export interface MarkOpts {
  /** Colour multiplied into the (white) stamp texture. */
  tint?: number;
  alpha?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  /** Degrees. */
  angle?: number;
  frame?: string | number;
  blend?: number;
  /**
   * What `marks.at()` reports here: 'smudge' by default for baked marks (`false` = not tracked, as for scorch you
   * do not want feet to pick up). A mark with `life` is untracked unless you name a kind.
   */
  kind?: string | false;
  /** Seconds to fade out as a live sprite, then gone. Omit for a permanent mark baked into the layer. */
  life?: number;
}

interface Chunk {
  rt: Phaser.GameObjects.RenderTexture;
  x: number;
  y: number;
  dirty: boolean;
}
interface Fade {
  im: Phaser.GameObjects.Image;
  age: number;
  life: number;
  a0: number;
}

export interface FeetOpts {
  /** Texture of one print (default: the built-in shoe print). */
  key?: string;
  /** Distance walked per print, px (default 28). */
  stride?: number;
  /** Gap between left and right print, px (default 12). */
  gap?: number;
  /** Prints left after the last contact with a mark (default 6): the trail fades over them. */
  steps?: number;
  /** Mark kinds that dirty the feet (default: any tracked mark). */
  picksUp?: string[];
  /** How much of a mark each contact wears off (default 0: marks stay as they are). */
  wear?: number;
  /** Seconds a print lasts before it fades away (default 5). `Infinity` bakes it permanently. */
  life?: number;
  scale?: number;
  /** Opacity of a fresh print (default 0.8). */
  alpha?: number;
}

/**
 * Handle for one walker's dirty feet. `dirty()` starts a trail by hand; stepping on a tracked mark does it automatically.
 */
export class Footprints {
  /** Prints left to make. */
  steps = 0;
  color = 0x442211;
  private strider: Strider;
  private o: Required<Omit<FeetOpts, 'picksUp'>> & { picksUp?: string[] };

  constructor(private marks: Marks, readonly obj: Obj, opts: FeetOpts) {
    this.o = { key: MARK_FOOT, stride: 28, gap: 12, steps: 6, wear: 0, life: 5, scale: 1, alpha: 0.8, picksUp: undefined, ...opts };
    this.strider = new Strider(this.o.stride, this.o.gap);
  }

  /** Dirty the feet by hand (default: full). */
  dirty(color = this.color, steps = this.o.steps) {
    this.color = color;
    this.steps = steps;
  }

  /** Marks calls this every frame. Returns false when the walker is gone. */
  update(): boolean {
    const obj = this.obj;
    if (!obj.scene) return false;
    if (!obj.active) {
      this.strider.reset();
      return true;
    }
    const m = this.marks.at(obj.x, obj.y, this.o.picksUp);
    if (m) {
      this.dirty(m.color);
      if (this.o.wear) this.marks.map.wear(obj.x, obj.y, this.o.wear);
    }
    const p = this.strider.step(obj.x, obj.y);
    if (p && this.steps > 0) {
      this.marks.stamp(this.o.key, p.x, p.y, {
        tint: this.color,
        alpha: this.o.alpha * (this.steps / this.o.steps),
        angle: Phaser.Math.RadToDeg(p.heading) + 90,
        scale: this.o.scale,
        kind: false,
        life: this.o.life === Infinity ? undefined : this.o.life,
      });
      this.steps--;
    }
    return true;
  }
}

/**
 * Persistent marks on the ground. Stamps are drawn into chunked RenderTextures (1024 px by default, created on first use,
 * 4 MB each), so cost stays flat however many marks there are (lab GpuFx probe 5: a baked layer is ~2-3 ms whatever it holds)
 * and off-screen chunks are hidden. Chunks are lost on WebGL context loss (marks vanish).
 * `life` marks (footprints) are live sprites that fade out, capped at `maxFading`.
 * `at(x, y)` answers what lies under a point from a coarse side record, never from the pixels.
 */
export class Marks {
  readonly map = new MarkMap(32);
  private chunks = new Map<number, Chunk>();
  private cols: number;
  private fades = new Set<Fade>();
  private freeIms: Phaser.GameObjects.Image[] = [];
  private feet = new Set<Footprints>();
  private stamps = 0;
  private brushes = new Map<string, Phaser.GameObjects.Image>();
  private layerAlpha = 1;

  constructor(private scene: Phaser.Scene, private width: number, private height: number, private chunk = 1024, private depth = -100, public maxFading = 128) {
    ensureTextures(scene);
    this.cols = Math.ceil(width / chunk);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.clearState());
  }

  get stats() {
    return { chunks: this.chunks.size, fading: this.fades.size, stamps: this.stamps, tracked: this.map.size, feet: this.feet.size };
  }

  /**
   * Stamp a texture into the ground at world (x, y). `key` is any loaded texture; the built-ins are
   * 'world-soft' (scorch), 'world-splat' (blood, mud) and 'world-foot'.
   */
  stamp(key: string, x: number, y: number, o: MarkOpts = {}) {
    const frame = this.scene.textures.getFrame(key, o.frame as string | number | undefined);
    const sx = o.scaleX ?? o.scale ?? 1;
    const sy = o.scaleY ?? o.scale ?? 1;
    const w = frame.width * sx;
    const h = frame.height * sy;
    const alpha = o.alpha ?? 1;
    this.stamps++;
    if (o.life !== undefined) return this.fade(key, x, y, o, sx, sy, alpha);
    const reach = Math.hypot(w, h) / 2;
    const c0 = Math.max(0, Math.floor((x - reach) / this.chunk));
    const c1 = Math.min(this.cols - 1, Math.floor((x + reach) / this.chunk));
    const r0 = Math.max(0, Math.floor((y - reach) / this.chunk));
    const r1 = Math.min(Math.ceil(this.height / this.chunk) - 1, Math.floor((y + reach) / this.chunk));
    const cfg = { alpha, tint: o.tint ?? 0xffffff, angle: o.angle ?? 0, scaleX: sx, scaleY: sy, ...(o.blend !== undefined && { blendMode: o.blend }) };
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const ch = this.chunkAt(c, r);
        ch.rt.stamp(key, o.frame as string | number | undefined, x - ch.x, y - ch.y, cfg);
        ch.dirty = true;
      }
    if (o.kind !== false) this.map.add(o.kind ?? 'smudge', x, y, Math.min(w, h) * 0.4, alpha, o.tint ?? 0xffffff);
  }

  /**
   * Wipe a round patch out of the baked marks at world (x, y): the brush `key` (default the soft blob) drawn in ERASE mode,
   * `scale` times its size, `alpha` how much it takes (a broom, a rag). The tracked record under it goes too.
   */
  erase(x: number, y: number, scale = 1, alpha = 1, key = MARK_SOFT) {
    let brush = this.brushes.get(key);
    if (!brush) this.brushes.set(key, (brush = this.scene.make.image({ key } as Phaser.Types.GameObjects.Sprite.SpriteConfig, false)));
    brush.setScale(scale).setAlpha(alpha);
    const reach = (Math.max(brush.width, brush.height) * scale) / 2;
    for (const ch of this.chunks.values()) {
      if (x + reach < ch.x || x - reach > ch.x + ch.rt.width || y + reach < ch.y || y - reach > ch.y + ch.rt.height) continue;
      brush.setPosition(x - ch.x, y - ch.y);
      ch.rt.erase(brush);
      ch.dirty = true;
    }
    if (alpha >= 1) this.map.wear(x, y, 1);
  }

  /** Every baked mark gone (the chunks are kept, empty). */
  clear() {
    for (const ch of this.chunks.values()) {
      ch.rt.clear();
      ch.dirty = true;
    }
    this.map.clear();
  }

  /** The whole layer's opacity (a fade before a `clear`). */
  get alpha() {
    return this.layerAlpha;
  }
  set alpha(a: number) {
    this.layerAlpha = a;
    for (const ch of this.chunks.values()) ch.rt.setAlpha(a);
  }

  /** What tracked mark lies under a point (optionally of the listed kinds), or null. */
  at(x: number, y: number, kinds?: readonly string[]): MarkInfo | null {
    return this.map.at(x, y, kinds);
  }

  /** Make `obj` leave fading prints after stepping on tracked marks (or after `feet.dirty()`). */
  footprints(obj: Obj, opts: FeetOpts = {}): Footprints {
    const f = new Footprints(this, obj, opts);
    this.feet.add(f);
    return f;
  }

  /** Per frame: feet, fading marks, then one render() per chunk that was stamped, and hide chunks out of view. */
  update(dt: number) {
    for (const f of this.feet) if (!f.update()) this.feet.delete(f);
    for (const f of this.fades) {
      f.age += dt / 1000;
      if (f.age >= f.life) this.dropFade(f);
      else f.im.setAlpha(f.a0 * (1 - f.age / f.life));
    }
    const v = this.scene.cameras.main.worldView;
    for (const ch of this.chunks.values()) {
      if (ch.dirty) {
        ch.rt.render();
        ch.dirty = false;
      }
      ch.rt.visible = ch.x < v.right && ch.x + ch.rt.width > v.x && ch.y < v.bottom && ch.y + ch.rt.height > v.y;
    }
  }

  private fade(key: string, x: number, y: number, o: MarkOpts, sx: number, sy: number, alpha: number) {
    if (this.fades.size >= this.maxFading) this.dropFade(this.fades.values().next().value!);
    const im = this.freeIms.pop() ?? this.scene.add.image(0, 0, key);
    im.setTexture(key, o.frame).setPosition(x, y).setScale(sx, sy).setAngle(o.angle ?? 0).setTint(o.tint ?? 0xffffff).setAlpha(alpha).setDepth(this.depth + 1).setVisible(true);
    im.setBlendMode(o.blend ?? Phaser.BlendModes.NORMAL);
    this.fades.add({ im, age: 0, life: Math.max(0.01, o.life!), a0: alpha });
    if (o.kind) this.map.add(o.kind, x, y, Math.min(im.displayWidth, im.displayHeight) * 0.4, alpha, o.tint ?? 0xffffff);
  }
  private dropFade(f: Fade) {
    this.fades.delete(f);
    f.im.setVisible(false);
    this.freeIms.push(f.im);
  }

  private chunkAt(c: number, r: number): Chunk {
    const k = r * this.cols + c;
    let ch = this.chunks.get(k);
    if (!ch) {
      const x = c * this.chunk;
      const y = r * this.chunk;
      const rt = this.scene.add.renderTexture(x, y, Math.min(this.chunk, this.width - x), Math.min(this.chunk, this.height - y)).setOrigin(0, 0).setDepth(this.depth).setAlpha(this.layerAlpha);
      ch = { rt, x, y, dirty: false };
      this.chunks.set(k, ch);
    }
    return ch;
  }

  private clearState() {
    this.chunks.clear();
    this.fades.clear();
    this.freeIms = [];
    this.feet.clear();
    this.map.clear();
    this.brushes.clear();
  }
}
