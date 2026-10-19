/**
 * Game art atlas, built by `npm run assets -- <game>` from `games/<game>/art/` (scripts/assets.mjs) into
 * `games/<game>/public/assets/atlas.json` + pages. Frame name = path under art/ without extension (`hero/idle-01`).
 *
 *   preload() { loadAtlas(this); }                          // once per scene that needs it; cached globally after the first load
 *   warmAtlas(game)                                        // optional, once the title is up: loads it behind the title so the first scene's loadAtlas finds it in
 *   create()  { const art = atlas(this);                    // art.anims() makes an animation per numbered sequence
 *               art.anims({ rates: { 'hero/idle': 8 } });   // key = name without the trailing number: 'hero/idle'
 *               art.sprite(x, y, 'hero/idle-01').play('hero/idle');
 *               art.image(x, y, 'ui/star'); }
 *
 * `art.image/sprite` apply the frame's display scale: frames built with `"scale": 2` in sizes.json are stored at 2x and
 * shown at `x0.5`, so they come out at their display size. Plain `this.add.image(x, y, 'atlas', name)` shows the stored
 * size (the same thing at scale 1). Trimmed frames keep their original size and origin, so animations do not jitter.
 *
 * Materials: a `material` in a `sizes.json` rule is written into the frame's atlas entry, and `loadAtlas` assigns it to that frame
 * when the atlas loads (a default for the lit shader; see Materials in the kit README). Code overrides it: `material(img, ...)`,
 * `L.lit(img, spec)` for one object's frame, `material(texture, ...)` for the whole atlas (replaces every default).
 */
import Phaser from 'phaser';
import { assignMaterial, materialFromRule, resolveMaterial, type MaterialRule } from './material';

/** Where the build puts public files, relative to the page: `public/` in dev (Vite serves the repo root), the zip's root in a build. */
export const assetBase = () => (import.meta.env.DEV ? 'public/assets/' : 'assets/');

const queued = new WeakMap<Phaser.Textures.TextureManager, Set<string>>();

/** In `preload()`: queue the game's atlas (all pages) under texture key `key`. */
export function loadAtlas(scene: Phaser.Scene, key = 'atlas', base = assetBase()) {
  if (scene.textures.exists(key)) return;
  const q = queued.get(scene.textures) ?? new Set<string>();
  queued.set(scene.textures, q.add(key));
  scene.load.multiatlas(key, `${base}atlas.json`, base);
  scene.textures.once(`addtexture-${key}`, applyAtlasMaterials);
}

/**
 * Fetch the atlas now, outside any scene (call it once the title is up), so the first scene's `loadAtlas` finds it in.
 * Needs no scene and cannot clash with `loadAtlas`: whichever finishes first adds the texture, and a warm-up that loses (a scene
 * had queued the same key, or the texture is in) drops its images. A scene that starts before it is done loads the atlas itself.
 */
export async function warmAtlas(game: Phaser.Game, key = 'atlas', base = assetBase()) {
  const tm = game.textures;
  if (tm.exists(key) || queued.get(tm)?.has(key)) return;
  try {
    const sheet = (await (await fetch(`${base}atlas.json`)).json()) as { textures: { image: string }[] };
    // onload, not decode(): decode() never settles in a tab that is not being drawn.
    const images = await Promise.all(sheet.textures.map((t) => new Promise<HTMLImageElement>((ok, no) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = no;
      img.src = `${base}${t.image}`;
    })));
    if (tm.exists(key) || queued.get(tm)?.has(key)) return;
    tm.once(`addtexture-${key}`, applyAtlasMaterials);
    tm.addAtlasJSONArray(key, images, sheet.textures as never);
  } catch {
    // offline or missing: the scene's own load reports it
  }
}

/** Give each frame the material its atlas entry carries (from `sizes.json`). The maps are made when the texture is first lit; atlases without materials change nothing. */
export function applyAtlasMaterials(texture: Phaser.Textures.Texture) {
  for (const name of texture.getFrameNames()) {
    const rule = (texture.get(name).customData as { material?: MaterialRule }).material;
    if (!rule) continue;
    const { spec, opts } = materialFromRule(rule);
    assignMaterial(texture, name, resolveMaterial(spec, opts));
  }
}

/** Numbered runs of frames (`a/b-01`, `a/b-02`, ...) as sequence name -> frame names in number order; runs of one frame are not sequences. */
export function sequences(names: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, { n: number; name: string }[]>();
  for (const name of names) {
    const m = /^(.*?)[-_ ]?(\d+)$/.exec(name);
    if (!m || !m[1]) continue;
    const g = groups.get(m[1]);
    const item = { n: Number(m[2]), name };
    if (g) g.push(item);
    else groups.set(m[1], [item]);
  }
  const out = new Map<string, string[]>();
  for (const [k, g] of groups) if (g.length > 1) out.set(k, g.sort((a, b) => a.n - b.n).map((i) => i.name));
  return out;
}

export interface AnimOpts {
  /** Default frames per second (12). */
  frameRate?: number;
  /** Default repeat, -1 = loop forever (default -1). */
  repeat?: number;
  /** Per sequence: a frame rate, or `{ frameRate, repeat }`. */
  rates?: Record<string, number | { frameRate?: number; repeat?: number }>;
}

export class Atlas {
  constructor(private scene: Phaser.Scene, readonly key = 'atlas') {}

  /** All frame names (without Phaser's `__BASE`). */
  frames(prefix = ''): string[] {
    return this.scene.textures.get(this.key).getFrameNames().filter((n) => n.startsWith(prefix));
  }

  /** Runtime scale that returns a frame to its display size (1 unless built with a `scale` above 1). */
  scaleOf(frame: string): number {
    return (this.scene.textures.getFrame(this.key, frame).customData as { scale?: number }).scale ?? 1;
  }

  image(x: number, y: number, frame: string): Phaser.GameObjects.Image {
    return this.scene.add.image(x, y, this.key, frame).setScale(this.scaleOf(frame));
  }

  sprite(x: number, y: number, frame: string): Phaser.GameObjects.Sprite {
    return this.scene.add.sprite(x, y, this.key, frame).setScale(this.scaleOf(frame));
  }

  /** One global animation per numbered sequence, keyed by its name; existing keys are left alone. Returns the keys. */
  anims(o: AnimOpts = {}): string[] {
    const keys: string[] = [];
    for (const [name, frames] of sequences(this.frames())) {
      keys.push(name);
      if (this.scene.anims.exists(name)) continue;
      const r = o.rates?.[name];
      const own = typeof r === 'number' ? { frameRate: r } : (r ?? {});
      this.scene.anims.create({
        key: name,
        frames: frames.map((frame) => ({ key: this.key, frame })),
        frameRate: own.frameRate ?? o.frameRate ?? 12,
        repeat: own.repeat ?? o.repeat ?? -1,
      });
    }
    return keys;
  }
}

/** The atlas loaded by `loadAtlas`, with helpers for frames, scaled images and animations. */
export const atlas = (scene: Phaser.Scene, key = 'atlas') => new Atlas(scene, key);
