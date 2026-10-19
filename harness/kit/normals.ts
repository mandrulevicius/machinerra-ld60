/**
 * Automatic normal maps and materials. A texture's alpha, blurred into a rounded height field and run through Sobel, so lights
 * shade the FORM (a bevel along the silhouette) instead of lighting a flat pool. Fully opaque textures (floors, backgrounds) get
 * none, unless they were given a material. Lab facts (Lighting probe): a normal map costs nothing measurable at render time; the
 * cost is generating it, once per texture (numbers in README / findings). Phaser takes it from `texture.dataSource[i]`, one per
 * source image, sampled with the same UVs as the texture, so it may be smaller: it is capped at `maxSize` px on its long side,
 * which also bounds the cost.
 *
 * Materials (material.ts) ride in the same map. RGB is the normal; ALPHA is the shine (255 = none, so a normal map from an artist
 * or a flat default is neutral). The lit shader (material.frag) turns shine into specular and a rim that is tight and bright on metal,
 * wide and soft on wood. The bevel width, the art's own darkness (`relief`) and generated wear (wear.ts: scratches, stains, dents,
 * flakes) are added to the height before the normals are taken, so lights catch them, and wear also dulls the shine locally.
 * On high quality a second map goes with it (for textures with a material only; the rest share a neutral texel), `dataSource[n + i]` (n = number of sources): ORM + emissive in RGBA (R occlusion,
 * G roughness, B metalness, A emissive), found by the shader through `ormOf`. Maps are uploaded as raw bytes, not canvases:
 * Phaser premultiplies canvas uploads, which would scale the normal by the alpha.
 *
 *   ensureNormalMap(texture)                    // the lights rig calls this for every texture it lights
 *   ensureNormalMap(texture, { force: true })   // after redrawing a CanvasTexture
 *   material(img, 'metal', { wear: 0.5 })       // this image's frame; material(texture, ...) = every frame
 *   setMaterials({ on: false, wear: false, orm: true })   // global, live (regenerates the maps)
 *   normalOptions.radius = 6                    // bevel width in source px; strength = edge steepness (3: about 56 degrees at the silhouette)
 *
 * `normalFromAlpha` and `buildMaps` are the plain-array maths (tests in normals.test.ts).
 */
import type Phaser from 'phaser';
import { assignMaterial, markUsed, materialOptions, materialsOf, ormOf, resolveMaterial, type MaterialOpts, type MaterialSpec, type ResolvedMaterial } from './material';
import { wearFields } from './wear';

export const normalOptions = { on: true, radius: 5, strength: 3, maxSize: 512, /** High quality: also build the ORM + emissive map. Set by the lights rig. */ orm: false };

/** Two box-blur passes (about a gaussian) of `r` px, horizontal then vertical, edges clamped. In place on `a`, `tmp` is scratch. */
function blur(a: Float32Array, tmp: Float32Array, w: number, h: number, r: number) {
  const n = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += a[o + Math.min(w - 1, Math.max(0, i))];
      for (let x = 0; x < w; x++) {
        tmp[o + x] = sum / n;
        sum += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += tmp[Math.min(h - 1, Math.max(0, i)) * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = sum / n;
        sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
      }
    }
  }
}

/** Alpha (0..255) to a blurred 0..1 field. */
function softAlpha(alpha: ArrayLike<number>, w: number, h: number, radius: number) {
  const H = new Float32Array(w * h);
  for (let i = 0; i < H.length; i++) H[i] = alpha[i] / 255;
  blur(H, new Float32Array(w * h), w, h, Math.max(1, Math.round(radius)));
  return H;
}

/** Tangent-space normals (RGBA bytes, alpha 255) of a height field in px units. +X right, +Y up the screen. */
function normalsOf(H: Float32Array, w: number, h: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  const at = (x: number, y: number) => H[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1); // canvas y grows down: a rise going down faces up the screen
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out[i] = (-dx / l) * 127.5 + 127.5;
      out[i + 1] = (dy / l) * 127.5 + 127.5;
      out[i + 2] = (1 / l) * 127.5 + 127.5;
      out[i + 3] = 255;
    }
  return out;
}

/**
 * RGBA bytes of a tangent-space normal map from alpha (0..255, `w * h`). `radius` px of blur is the bevel width; `strength`
 * the edge steepness (slope across the bevel; 1 about 27 degrees, 2 about 45, 4 about 63). +X right, +Y up the screen.
 */
export function normalFromAlpha(alpha: ArrayLike<number>, w: number, h: number, radius = normalOptions.radius, strength = normalOptions.strength) {
  const r = Math.max(1, Math.round(radius));
  const H = softAlpha(alpha, w, h, r);
  const k = 0.5 * r * strength; // the central difference across a blurred edge is about 1 / r, so the edge slope comes out as strength / 2
  for (let i = 0; i < H.length; i++) H[i] *= k;
  return normalsOf(H, w, h);
}

export interface MapsOpts {
  radius: number;
  strength: number;
  /** Also make the ORM + emissive map. */
  orm: boolean;
  /** Include generated wear (the material's wear mix). */
  wear: boolean;
  /** Wear depth multiplier. */
  gain: number;
  /** Seed for the wear pattern. */
  seed: string;
}

export interface Maps {
  /** RGBA: normal, alpha = 255 minus shine. */
  normal: Uint8ClampedArray;
  /** RGBA: occlusion, roughness, metalness, emissive. Null unless asked for. */
  orm: Uint8ClampedArray | null;
}

const lum = (px: ArrayLike<number>, i: number) => (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;

/** Emissive mask value 0..1 of one pixel (rgba 0..255). */
function emissiveAt(m: ResolvedMaterial, px: ArrayLike<number>, i: number): number {
  const e = m.emissive;
  if (!e) return 0;
  if (typeof e === 'number') return e;
  const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255, a = px[i + 3] / 255;
  const where = e.where ?? 'all';
  const mask = where === 'all' ? 1 : where === 'bright' ? Math.min(1, Math.max(0, (Math.max(r, g, b) - (e.threshold ?? 0.7)) / 0.15)) : where(r, g, b, a);
  return e.amount * mask;
}

/**
 * The maps of one image region from its RGBA pixels. No material: the plain bevel, alpha 255 (what the kit always made).
 * With one: bevel scaled by its `bevel`, wear and relief added to the height, shine = gloss lowered by wear.
 */
export function buildMaps(px: ArrayLike<number>, w: number, h: number, mat: ResolvedMaterial | null, o: MapsOpts): Maps {
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
  const r = Math.max(1, Math.round(o.radius * (mat?.bevel ?? 1)));
  const H = softAlpha(alpha, w, h, r);
  const k = 0.5 * r * o.strength;
  const tot = new Float32Array(w * h);
  for (let i = 0; i < tot.length; i++) tot[i] = H[i] * k;
  if (!mat) {
    const normal = normalsOf(tot, w, h);
    return { normal, orm: o.orm ? neutralOrm(w * h) : null };
  }

  const wear = o.wear ? wearFields(w, h, mat.wear, o.seed) : null;
  const dull = new Float32Array(w * h);
  const dirt = new Float32Array(w * h);
  for (let i = 0; i < tot.length; i++) {
    const soft = H[i] * H[i]; // wear and relief fade out toward the silhouette, where the bevel is
    let extra = 0;
    if (wear) {
      extra += wear.height[i] * o.gain;
      dull[i] = wear.dull[i];
      dirt[i] = wear.dirt[i];
    }
    if (mat.relief > 0) {
      const dark = 1 - lum(px, i * 4); // 0 white .. 1 black: dark art is cut into the surface
      extra -= mat.relief * dark * 2 * o.gain;
      dull[i] = Math.max(dull[i], mat.relief * dark * 0.6);
    }
    tot[i] += extra * soft;
  }
  const normal = normalsOf(tot, w, h);
  const orm = o.orm ? neutralOrm(w * h) : null;
  for (let i = 0; i < tot.length; i++) {
    if (alpha[i] === 0) continue; // transparent: leave neutral, so filtering at the edge does not bleed shine or glow outward
    const shine = mat.gloss * (1 - dull[i]);
    normal[i * 4 + 3] = 255 - Math.round(shine * 255);
    if (orm) {
      orm[i * 4] = 255 * (1 - dirt[i]);
      orm[i * 4 + 1] = 255 * (1 - shine);
      orm[i * 4 + 2] = 255 * mat.metal * (1 - dull[i]);
      orm[i * 4 + 3] = 255 * Math.min(1, emissiveAt(mat, px, i * 4));
    }
  }
  return { normal, orm };
}

/** No occlusion, fully rough, not metal, not glowing. */
function neutralOrm(n: number) {
  const a = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    a[i * 4] = 255;
    a[i * 4 + 1] = 255;
  }
  return a;
}

/** Textures asked for, so maps can be made when the switch goes on. */
const requested = new Set<Phaser.Textures.Texture>();
/** Generated sources per texture, so the maps can be switched off and on live. */
const made = new Map<Phaser.Textures.Texture, Phaser.Textures.TextureSource[]>();

type Img = HTMLImageElement | HTMLCanvasElement | ImageBitmap;
type Gl = Phaser.Renderer.WebGL.Wrappers.WebGLTextureWrapper;
interface Built { w: number; h: number; normal: Uint8ClampedArray; orm: Uint8ClampedArray | null }

/** Copy a w x h block at (x, y) of a `W`-wide RGBA array. */
function crop(src: ArrayLike<number>, W: number, x: number, y: number, w: number, h: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let row = 0; row < h; row++) for (let i = 0; i < w * 4; i++) out[row * w * 4 + i] = src[((y + row) * W + x) * 4 + i];
  return out;
}
function paste(dst: Uint8ClampedArray, W: number, x: number, y: number, w: number, h: number, src: ArrayLike<number>) {
  for (let row = 0; row < h; row++) for (let i = 0; i < w * 4; i++) dst[((y + row) * W + x) * 4 + i] = src[row * w * 4 + i];
}

/** One source image to its maps, or null when it has no transparency and no material (flat) or is not readable. */
function mapFor(texture: Phaser.Textures.Texture, index: number, o: typeof normalOptions): Built | null {
  const src = texture.source[index];
  const img = src.image as Img | null;
  if (!img || src.isRenderTexture || src.isGLTexture || src.isVideo) return null;
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  if (!iw || !ih) return null;
  const s = Math.min(1, o.maxSize / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * s));
  const h = Math.max(1, Math.round(ih * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  const assigned = materialOptions.on ? materialsOf(texture) : undefined;
  let opaque = true;
  if (!assigned) for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { opaque = false; break; }
  if (!assigned && opaque) return null;

  const opts = (seed: string): MapsOpts => ({ radius: Math.max(1, o.radius * s), strength: o.strength, orm: o.orm && !!assigned, wear: materialOptions.wear, gain: materialOptions.gain, seed: `${texture.key}:${seed}` });
  const whole = buildMaps(px, w, h, assigned?.all ?? null, opts(String(assigned?.all?.seed ?? '')));
  for (const [name, mat] of assigned ? assigned.frames : new Map<string, ResolvedMaterial>()) {
    const f = (texture.frames as Record<string, Phaser.Textures.Frame>)[name];
    if (!f || f.sourceIndex !== index) continue;
    const x = Math.max(0, Math.round(f.cutX * s)), y = Math.max(0, Math.round(f.cutY * s));
    const fw = Math.min(w - x, Math.max(1, Math.round(f.cutWidth * s))), fh = Math.min(h - y, Math.max(1, Math.round(f.cutHeight * s)));
    if (fw < 1 || fh < 1) continue;
    const part = buildMaps(crop(px, w, x, y, fw, fh), fw, fh, mat, opts(`${name}:${mat.seed}`));
    paste(whole.normal, w, x, y, fw, fh, part.normal);
    if (whole.orm && part.orm) paste(whole.orm, w, x, y, fw, fh, part.orm);
  }
  return { w, h, normal: whole.normal, orm: whole.orm };
}

/** Upload raw RGBA bytes as a texture the lit shader samples (linear unless the game is pixel art), without premultiplying. */
function upload(renderer: Phaser.Renderer.WebGL.WebGLRenderer, data: Uint8ClampedArray, w: number, h: number): Gl {
  const gl = renderer.gl;
  const f = (renderer as any).config.antialias ? gl.LINEAR : gl.NEAREST;
  return (renderer as any).createTexture2D(0, f, f, gl.CLAMP_TO_EDGE, gl.CLAMP_TO_EDGE, gl.RGBA, new Uint8Array(data.buffer), w, h, false, false, true);
}

const gameOf = (t: Phaser.Textures.Texture) => (t.manager as any).game as Phaser.Game;

/** Generate and attach a normal map for the texture unless it has one (or `normalOptions.on` is false). Returns whether one was made. */
export function ensureNormalMap(texture: Phaser.Textures.Texture, o: { force?: boolean } = {}): boolean {
  if (texture.key.startsWith('__')) return false;
  const seen = requested.has(texture);
  requested.add(texture);
  if (!normalOptions.on || (seen && !o.force)) return false;
  if (texture.dataSource.length && !made.has(texture)) return false; // the artist supplied one
  const renderer = gameOf(texture).renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (!renderer?.gl) return false;
  const built = texture.source.map((_, i) => mapFor(texture, i, normalOptions));
  if (!built.some(Boolean)) {
    if (made.delete(texture)) { // had maps from a material that is now off: back to none
      texture.dataSource.forEach((d) => d.destroy());
      texture.dataSource.length = 0;
    }
    return false;
  }
  const withOrm = built.some((b) => b?.orm); // only art with a material gets ORM data: the shader gives the rest a neutral texel
  const flat = (): Built => ({ w: 1, h: 1, normal: new Uint8ClampedArray([127, 127, 255, 255]), orm: null }); // a source with no map needs a placeholder so the indices line up
  const all = built.map((b) => b ?? flat());
  texture.dataSource.forEach((d) => d.destroy());
  texture.dataSource.length = 0;
  const normals = all.map((b) => upload(renderer, b.normal, b.w, b.h));
  const orms = withOrm ? all.map((b) => (b.orm ? upload(renderer, b.orm, b.w, b.h) : upload(renderer, neutralOrm(1), 1, 1))) : [];
  texture.setDataSource([...normals, ...orms]); // the ORM maps ride at the end of the list: destroyed with the texture, ignored by Phaser
  normals.forEach((n, i) => orms[i] && ormOf.set(n, orms[i]));
  if (withOrm) markUsed('orm');
  made.set(texture, texture.dataSource.slice());
  return true;
}

/** Regenerate every map made so far (after a global switch). */
function regenerate() {
  for (const tex of [...requested]) {
    if (tex.manager?.get(tex.key) !== tex) requested.delete(tex);
    else if (made.has(tex) || materialsOf(tex)) ensureNormalMap(tex, { force: true });
  }
}

/** Switch every generated map off or on (lit objects then shade flat); maps made while off wait for the switch. */
export function setNormalMaps(on: boolean) {
  normalOptions.on = on;
  for (const tex of [...requested]) {
    if (tex.manager?.get(tex.key) !== tex) requested.delete(tex);
    else if (made.has(tex)) tex.dataSource = on ? made.get(tex)! : [];
    else if (on) ensureNormalMap(tex, { force: true });
  }
}

/**
 * Global material switches, live (every generated map is rebuilt, a few ms each): `on` false = every map neutral (no gloss, no
 * material bevel, no wear), `wear` false = materials without their wear, `orm` = the high-quality ORM + emissive map (the lights
 * rig sets it from quality), `gain` = wear depth.
 */
export function setMaterials(o: Partial<{ on: boolean; wear: boolean; orm: boolean; gain: number }>) {
  const was = JSON.stringify([materialOptions, normalOptions.orm]);
  if (o.on !== undefined) materialOptions.on = o.on;
  if (o.wear !== undefined) materialOptions.wear = o.wear;
  if (o.gain !== undefined) materialOptions.gain = o.gain;
  if (o.orm !== undefined) normalOptions.orm = o.orm;
  if (was !== JSON.stringify([materialOptions, normalOptions.orm])) regenerate();
}

/**
 * Give art a material. `target` is an Image or Sprite (its current frame: in an atlas, only that frame's art) or a Texture
 * (every frame). `spec` is a preset name (metal, wood, stone, cloth, skin, painted, matte) or numbers, see material.ts.
 * Applies at once (maps are rebuilt, a few ms) and survives scene restarts with the texture. Only generated maps carry
 * materials: a texture with an artist-supplied normal map keeps it. Call it before the first render to avoid a rebuild.
 */
export function material(target: Phaser.GameObjects.GameObject | Phaser.Textures.Texture, spec: MaterialSpec, opts?: MaterialOpts) {
  const obj = target as Phaser.GameObjects.Image;
  const texture = (obj.texture ?? target) as Phaser.Textures.Texture;
  const frame = obj.texture ? obj.frame.name : null;
  if (assignMaterial(texture, frame === '__BASE' ? null : frame, resolveMaterial(spec, opts))) ensureNormalMap(texture, { force: true });
  return target;
}
