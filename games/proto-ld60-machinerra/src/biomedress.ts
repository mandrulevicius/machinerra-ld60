/**
 * Things standing in a land wear the land (`games/ludum-dare-60/docs/biome-look.md`, "Elements"): every static prop a
 * mission places (ruins, hives, the places' parts) is drawn once, then dressed per biome as a copy of its texture,
 * `<key>~<paint>` (`dressed`):
 *  - a grade toward the land's light (`DRESS.tint`), so a brown wreck sits in a green jungle instead of on it;
 *  - the house light: a lit rim on edges facing the top left, a cool shade on edges facing the bottom right, as the
 *    ground's mesas and cells have (`groundart.ts`);
 *  - a cap on every top surface: moss with hanging vines, snow, ash with embers, sand dust, city grime, the Ether's
 *    frost, in patches, so no two props wear it the same.
 * Under each one a mound of the land's own ground (`foot-<paint>`), and in front of the half-buried ones (`BURIED`) a lip
 * of it (`lip-<paint>`): nothing stands on the ground as a sticker. `Play.place` does all three; `places.ts` swaps
 * textures through `PlayHost.dress`.
 *
 * Add a biome: a `DRESS` row for its `paint`. Add a prop: draw it plain, without a sand base; `Play.place` dresses it.
 */
import Phaser from 'phaser';
import type { BiomeDef } from './sim/defs';
import { FLOOR, S, canvas, type Ctx } from './art';
import { outline } from './house';

type Paint = BiomeDef['paint'];
type RGB = [number, number, number];

export interface Dress {
  /** The land's light the props are graded toward (multiplied in by `grade`). */
  tint: RGB;
  grade: number;
  /** The rim's colour (top left) and the shade's multiplier (bottom right). */
  rim: RGB;
  shade: RGB;
  /** Old metal goes this colour in patches: rust, tarnish, char; `wearAmt` how far (default 0.55). */
  wear: RGB;
  wearAmt?: number;
  /** How wide a patch's bevel is, in texels (default 8; small figures want less). */
  bevel?: number;
  /** What settles on top: colour, thickness in texels, share of the top that wears it (0..1), vines hanging from it. */
  cap: RGB;
  capDepth: number;
  capShare: number;
  vines: boolean;
  /** Sparks in the cap (embers, the Ether's motes): share of cap texels. */
  spark: number;
  sparkCol: RGB;
  /** The ground a prop stands in: its base, lit side and shaded side, and the small things in it. */
  soil: RGB;
  soilHi: RGB;
  soilLo: RGB;
  bits: RGB;
}

export const DRESS: Record<Paint, Dress> = {
  desert: { tint: [1, 0.9, 0.72], grade: 0.12, rim: [255, 222, 160], shade: [0.7, 0.68, 0.86], wear: [128, 70, 38], cap: [232, 200, 146], capDepth: 5, capShare: 0.35, vines: false, spark: 0, sparkCol: [0, 0, 0], soil: [222, 182, 128], soilHi: [244, 212, 158], soilLo: [170, 130, 92], bits: [150, 104, 70] },
  jungle: { tint: [0.78, 1, 0.66], grade: 0.3, rim: [196, 226, 120], shade: [0.56, 0.7, 0.72], wear: [92, 86, 40], cap: [86, 136, 50], capDepth: 7, capShare: 0.6, vines: true, spark: 0, sparkCol: [0, 0, 0], soil: [88, 74, 44], soilHi: [118, 128, 58], soilLo: [50, 46, 32], bits: [64, 110, 44] },
  city: { tint: [0.88, 0.9, 1], grade: 0.22, rim: [214, 218, 228], shade: [0.62, 0.66, 0.82], wear: [112, 66, 42], cap: [128, 124, 116], capDepth: 4, capShare: 0.4, vines: false, spark: 0, sparkCol: [0, 0, 0], soil: [96, 94, 92], soilHi: [146, 144, 140], soilLo: [58, 58, 64], bits: [160, 156, 148] },
  snow: { tint: [0.86, 0.94, 1.06], grade: 0.25, rim: [255, 255, 255], shade: [0.66, 0.76, 0.96], wear: [96, 74, 66], cap: [240, 246, 255], capDepth: 10, capShare: 0.75, vines: false, spark: 0, sparkCol: [0, 0, 0], soil: [224, 232, 248], soilHi: [250, 252, 255], soilLo: [170, 188, 222], bits: [110, 116, 132] },
  demon: { tint: [1, 0.62, 0.6], grade: 0.42, rim: [210, 96, 70], shade: [0.56, 0.4, 0.5], wear: [44, 22, 22], cap: [104, 90, 92], capDepth: 5, capShare: 0.5, vines: false, spark: 0.06, sparkCol: [255, 120, 50], soil: [80, 46, 48], soilHi: [120, 72, 70], soilLo: [40, 20, 24], bits: [255, 100, 40] },
  ether: { tint: [0.8, 0.76, 1.1], grade: 0.45, rim: [200, 214, 255], shade: [0.5, 0.46, 0.8], wear: [92, 72, 150], cap: [184, 176, 250], capDepth: 5, capShare: 0.45, vines: false, spark: 0.05, sparkCol: [200, 250, 255], soil: [92, 80, 150], soilHi: [150, 140, 210], soilLo: [44, 34, 86], bits: [176, 186, 240] },
};

/** Props sunk into the ground: a lip of the land is drawn in front of their foot. */
export const BURIED = new Set(['car', 'phone', 'panel', 'grave-marker', 'wreck']);
/** Never dressed: things lying flat. */
export const UNDRESSED = new Set(['seep', 'shrine-floor']);
/** The Wanderer's own things, fresh from the zeppelin: painted up and worn, but no land on them, no mound, no shadow (they ride up). */
export const OURS = new Set(['lift', 'dungeon-shaft']);

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const noise1 = (x: number, seed: number) => {
  const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - s) + hash(i + 1, seed) * s;
};

/** The dressed copy of `key` for a land (made the first time it is asked for); the key itself when it is not dressed. */
export function dressed(scene: Phaser.Scene, key: string, paint: Paint): string {
  if (UNDRESSED.has(key) || !scene.textures.exists(key)) return key;
  const out = `${key}~${paint}`;
  if (scene.textures.exists(out)) return out;
  const fr = scene.textures.getFrame(key);
  const w = fr.cutWidth, h = fr.cutHeight;
  const tex = scene.textures.createCanvas(out, w, h)!;
  const c = tex.getContext();
  c.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, w, h, 0, 0, w, h);
  const img = c.getImageData(0, 0, w, h);
  if (OURS.has(key)) paintUp(img.data, w, h, DRESS.desert, key.length * 131); // the Wanderer's brass rusts the same everywhere
  else dressPixels(img.data, w, h, DRESS[paint], key.length * 131 + key.charCodeAt(0));
  c.putImageData(img, 0, 0);
  tex.refresh();
  return out;
}

/** The pass itself, on RGBA texels (pure, so it is testable without a canvas). */
export function dressPixels(d: Uint8ClampedArray, w: number, h: number, o: Dress, seed: number) {
  paintUp(d, w, h, o, seed);
  const src = new Uint8ClampedArray(d);
  const A = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3]);
  const tmax = Math.max(...o.tint);
  const tr = o.tint[0] / tmax, tg = o.tint[1] / tmax, tb = o.tint[2] / tmax;
  // How far below the open air each texel sits (0 = transparent), for the caps.
  const depth = new Int16Array(w * h);
  for (let x = 0; x < w; x++) {
    let run = 0;
    for (let y = 0; y < h; y++) {
      // Counted from the first texel past the soot outline, so the cap lies on the surface, not in the line.
      const i = (y * w + x) * 4, bright = src[i] + src[i + 1] + src[i + 2] > 138;
      run = A(x, y) <= 60 ? 0 : run > 0 || bright ? run + 1 : 0;
      depth[y * w + x] = run;
    }
  }
  const vineLen = new Int16Array(w);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, a = src[i + 3];
      if (a < 60) continue;
      let r = src[i], g = src[i + 1], b = src[i + 2];
      const lum = (r + g + b) / 3;
      // Grade toward the land's light.
      r += (r * tr * 1.08 - r) * o.grade;
      g += (g * tg * 1.08 - g) * o.grade;
      b += (b * tb * 1.08 - b) * o.grade;
      // The house light: lit toward the top left, shaded toward the bottom right; the soot outline stays soot.
      if (lum > 46) {
        if (A(x - 3, y - 3) < 60 || A(x - 4, y - 1) < 60) {
          r += (o.rim[0] - r) * 0.32; g += (o.rim[1] - g) * 0.32; b += (o.rim[2] - b) * 0.32;
        } else if (A(x + 3, y + 3) < 60 || A(x + 4, y + 1) < 60) {
          r *= 1 - (1 - o.shade[0]) * 0.55; g *= 1 - (1 - o.shade[1]) * 0.55; b *= 1 - (1 - o.shade[2]) * 0.55;
        }
      }
      // The cap: on top surfaces, below the outline, in patches; vines hang from some of it.
      const dd = depth[y * w + x];
      const patch = noise1(x / 7, seed) * 0.7 + noise1(x / 2.5, seed + 9) * 0.3;
      const thick = 2 + Math.round(o.capDepth * (0.5 + patch));
      if (patch < o.capShare && dd >= 1 && dd <= thick - 2 && lum > 30) {
        const k = dd === thick - 2 ? 0.75 : 1; // its underside darker
        const v = (hash(x, y + seed) - 0.5) * 18;
        r = o.cap[0] * k + v; g = o.cap[1] * k + v; b = o.cap[2] * k + v;
        if (o.spark && hash(x + seed, y) < o.spark) [r, g, b] = o.sparkCol;
        if (o.vines && dd === thick - 2 && hash(x, seed) < 0.18) vineLen[x] = 4 + Math.floor(hash(x, seed + 1) * 12);
      } else if (o.vines && vineLen[x] > 0 && dd > thick - 2) {
        vineLen[x]--;
        r = o.cap[0] * 0.8; g = o.cap[1] * 0.85; b = o.cap[2] * 0.7;
        if (vineLen[x] === 0 && hash(x, y) < 0.5) [r, g, b] = o.soilHi; // a leaf at the end
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
}

/**
 * Paint a flat drawing up to the painted NPCs (Laimonas's sheets; `tools/weather.py` does the same offline): every flat
 * patch of colour is bevelled (lit on its top-left side, shaded on the other, from the distance to its own edge), the
 * metal is mottled, worn in patches toward the land's `wear` colour, scratched and specked, grime settles in the creases
 * and darkens the foot, and the result is cut in the ground's colour steps. The soot outline stays soot.
 */
export function paintUp(d: Uint8ClampedArray, w: number, h: number, o: Dress, seed: number) {
  const n = w * h, BIG = 1e4;
  const lum = new Float32Array(n), solid = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    lum[p] = (d[p * 4] + d[p * 4 + 1] + d[p * 4 + 2]) / 3;
    solid[p] = +(d[p * 4 + 3] > 60);
  }
  const differs = (p: number, q: number) =>
    !solid[q] || Math.abs(d[p * 4] - d[q * 4]) + Math.abs(d[p * 4 + 1] - d[q * 4 + 1]) + Math.abs(d[p * 4 + 2] - d[q * 4 + 2]) > 40;
  // Distance to the edge of each flat patch (chamfer, two passes), and to the silhouette's own edge.
  const dist = new Float32Array(n), out = new Float32Array(n);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!solid[p]) { dist[p] = out[p] = 0; continue; }
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      dist[p] = edge || differs(p, p - 1) || differs(p, p + 1) || differs(p, p - w) || differs(p, p + w) ? 0 : BIG;
      out[p] = edge || !solid[p - 1] || !solid[p + 1] || !solid[p - w] || !solid[p + w] ? 0 : BIG;
    }
  for (const f of [dist, out]) {
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        f[p] = Math.min(f[p], f[p - 1] + 1, f[p - w] + 1, f[p - w - 1] + 1.41, f[p - w + 1] + 1.41);
      }
    for (let y = h - 2; y > 0; y--)
      for (let x = w - 2; x > 0; x--) {
        const p = y * w + x;
        f[p] = Math.min(f[p], f[p + 1] + 1, f[p + w] + 1, f[p + w + 1] + 1.41, f[p + w - 1] + 1.41);
      }
  }
  // Grime in the creases: darker than the neighbourhood (a box mean through an integral image).
  const R = 4, sum = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) sum[(y + 1) * (w + 1) + x + 1] = lum[y * w + x] * solid[y * w + x] + sum[y * (w + 1) + x + 1] + sum[(y + 1) * (w + 1) + x] - sum[y * (w + 1) + x];
  const mean = (x: number, y: number) => {
    const x0 = Math.max(0, x - R), y0 = Math.max(0, y - R), x1 = Math.min(w, x + R + 1), y1 = Math.min(h, y + R + 1);
    return (sum[y1 * (w + 1) + x1] - sum[y0 * (w + 1) + x1] - sum[y1 * (w + 1) + x0] + sum[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0));
  };
  const vnoise = (x: number, y: number, s: number) => {
    const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
    const sx = ax * ax * (3 - 2 * ax), sy = ay * ay * (3 - 2 * ay);
    const a = hash(ix + seed, iy), b = hash(ix + 1 + seed, iy), c = hash(ix + seed, iy + 1), e = hash(ix + 1 + seed, iy + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + e) * sx * sy;
  };
  const bev = o.bevel ?? 8;
  const height = (p: number) => Math.min(dist[p], bev) / bev;
  // A few scratches: short light strokes on a slant.
  const scratch = new Uint8Array(n);
  for (let k = 0; k < ((n / 900) | 0); k++) {
    let x = hash(k, seed + 70) * w, y = hash(k, seed + 71) * h;
    const len = 3 + hash(k, seed + 72) * 7, dx = 0.8, dy = -0.5 + hash(k, seed + 73);
    for (let t = 0; t < len; t++, x += dx, y += dy) {
      const p = Math.round(y) * w + Math.round(x);
      if (p >= 0 && p < n && dist[p] > 1.5) scratch[p] = 1;
    }
  }
  const src = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4;
      if (!solid[p] || lum[p] < 46) continue;
      let r = src[i], g = src[i + 1], b = src[i + 2];
      // Volume: the bevel's slope toward the top-left light.
      const hp = height(p);
      const slope = height(Math.min(n - 1, p + 2 * w + 2)) - height(Math.max(0, p - 2 * w - 2));
      const lit = hp < 1 ? slope * 0.7 : 0;
      let k = 1 + lit + (hp - 0.6) * 0.08;
      // Mottled light, grime in the creases and toward the edge and the foot.
      k *= 0.84 + 0.3 * (0.6 * vnoise(x, y, 13) + 0.4 * vnoise(x, y, 5));
      k *= 1 - Math.min(0.35, Math.max(0, mean(x, y) - lum[p]) / 90);
      k *= 1 - Math.max(0, 1 - out[p] / 7) * 0.12 - Math.max(0, (y / h - 0.7) / 0.3) * 0.16;
      r *= k; g *= k; b *= k;
      // Worn patches toward the land's wear colour (rust, tarnish, char), on the flat of a patch, not its rim.
      const wear = Math.max(0, Math.min(1, (vnoise(x, y, 14) * 0.7 + vnoise(x, y, 5) * 0.3 - 0.55) * 4)) * Math.min(1, dist[p] / 2) * (o.wearAmt ?? 0.55);
      r += (o.wear[0] - r) * wear; g += (o.wear[1] - g) * wear; b += (o.wear[2] - b) * wear;
      if (scratch[p]) { r += 40; g += 38; b += 34; }
      const sp = hash(x + seed * 3, y);
      if (sp < 0.025) { const s = (hash(y, x + seed) - 0.6) * 70; r += s; g += s; b += s; }
      r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
      d[i] = r - (r % 6);
      d[i + 1] = g - (g % 6);
      d[i + 2] = b - (b % 6);
    }
}

/**
 * The shadow a prop casts on the ground toward the bottom right, as the mesas do: its silhouette laid flat behind its
 * foot, sheared, soft, in the land's shade. Key `<dressed key>~sh`; drawn with its top left at the foot's left end.
 */
export function castShadow(scene: Phaser.Scene, key: string, paint: Paint | RGB): string {
  const out = `${key}~sh`;
  if (scene.textures.exists(out)) return out;
  const fr = scene.textures.getFrame(key);
  const w = fr.cutWidth, h = fr.cutHeight, sh = Math.ceil(h * 0.4), pad = 4;
  const tex = scene.textures.createCanvas(out, Math.ceil(w + h * 0.32) + pad * 2, sh + pad * 2)!;
  const c = tex.getContext();
  const col: RGB = Array.isArray(paint) ? paint : DRESS[paint].soilLo.map((v, i) => Math.round(v * DRESS[paint].shade[i] * 0.55)) as RGB;
  c.filter = 'blur(2px)';
  // (x, y) -> (x + 0.32 (h - y), 0.4 (h - y)): the foot stays put, the top falls away to the bottom right.
  c.setTransform(1, 0, -0.32, -0.4, pad + 0.32 * h, pad + 0.4 * h);
  c.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, w, h, 0, 0, w, h);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.filter = 'none';
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = `rgb(${col.join(',')})`;
  c.fillRect(0, 0, tex.width, tex.height);
  tex.refresh();
  return out;
}

/** The cast-shadow texture's margin (texels), as `castShadow` draws it. */
const SH_PAD = 4;

/**
 * Lay a prop image's cast shadow on the floor under it (same position, origin and scale as the image; its origin is its
 * foot): returns the shadow image at `depth`. Mission props and the hub's both use it.
 */
export function shadowUnder(scene: Phaser.Scene, img: Phaser.GameObjects.Image, colour: Paint | RGB, alpha: number, depth: number, lift = 6) {
  const key = castShadow(scene, img.texture.key, colour), s = img.scaleX;
  // The image's origin is its foot: the texture row there lands on the foot, rows below it (a rug, a pad) fall behind.
  const below = (1 - img.originY) * img.height;
  const left = img.x - img.originX * img.width * s - (0.32 * below + SH_PAD) * s, top = img.y - (0.4 * below + SH_PAD + lift) * s;
  return scene.add.image(left, top, key).setOrigin(0).setScale(s).setAlpha(alpha).setDepth(depth);
}

/**
 * The D-hub's light on its props (`hubDressed`): warm lamp light on brass, cool shadows, verdigris in the wear (the
 * Oracle's patina), a little dust on top. The Wanderer is home, not a land: no mound, no moss.
 */
export const HUB_DRESS: Dress = { tint: [1, 0.88, 0.7], grade: 0.12, rim: [255, 214, 150], shade: [0.6, 0.68, 0.82], wear: [80, 140, 124], wearAmt: 0.3, cap: [150, 132, 106], capDepth: 3, capShare: 0.22, vines: false, spark: 0, sparkCol: [0, 0, 0], soil: [90, 70, 50], soilHi: [130, 104, 74], soilLo: [40, 30, 24], bits: [0, 0, 0] };
/** The hub's cast shadows: warm dark, on the deck plates. */
export const HUB_SHADOW: RGB = [26, 18, 14];

/**
 * A hub prop painted in the house style, as the mission's are (`<key>~hub`): the baked foot shadows dropped (a cast
 * shadow replaces them, `shadowUnder`), the soot outline round it (`fringe`; a texture already in the house style has its own),
 * then painted up and lit (`dressPixels`).
 */
export function hubDressed(scene: Phaser.Scene, key: string, fringe = true): string {
  const out = `${key}~hub`;
  if (scene.textures.exists(out) || !scene.textures.exists(key)) return scene.textures.exists(out) ? out : key;
  const fr = scene.textures.getFrame(key);
  const w = fr.cutWidth, h = fr.cutHeight;
  const tex = scene.textures.createCanvas(out, w, h)!;
  const c = tex.getContext();
  c.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, w, h, 0, 0, w, h);
  const img = c.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // A baked shadow: dark and see-through. Gone; a soft edge of a line (dark, partly opaque) is hardened instead.
    if (d[i + 3] < 150 && d[i] + d[i + 1] + d[i + 2] < 90) d[i + 3] = 0;
    else if (d[i + 3] > 0 && d[i + 3] < 128) d[i + 3] = 0;
  }
  if (fringe) outline(img);
  dressPixels(d, w, h, HUB_DRESS, key.length * 131 + key.charCodeAt(key.length - 1));
  c.putImageData(img, 0, 0);
  tex.refresh();
  return out;
}

/**
 * The modern machines (every small foe drawn in code, the hornet's two wing frames, the Crawlcam's body and legs): the
 * same paint-up as the props, but as what they are, the cold new world: no land graded in, a cool glossy rim on the top
 * left, grime rather than rust, a narrow bevel for small parts. Their shadows are the world's blob shadows.
 */
export const FOE_DRESS: Dress = { tint: [1, 1, 1], grade: 0, rim: [236, 246, 255], shade: [0.55, 0.6, 0.76], wear: [42, 40, 46], wearAmt: 0.3, bevel: 4, cap: [0, 0, 0], capDepth: 0, capShare: 0, vines: false, spark: 0, sparkCol: [0, 0, 0], soil: [0, 0, 0], soilHi: [0, 0, 0], soilLo: [0, 0, 0], bits: [0, 0, 0] };
/** The foes' textures drawn in code that are not `foe-<kind>`. */
const FOE_KEYS = ['hornet0', 'hornet1', 'spider-body', 'spider-femur', 'spider-tibia', 'spider-joint'];

const painted = new WeakSet<Phaser.Textures.Texture>();
/** Paint every small foe drawn in code up, in place, once (`Play.create`); bosses are paintings and left alone. */
export function paintFoes(scene: Phaser.Scene) {
  const keys = [...scene.textures.getTextureKeys().filter((k) => k.startsWith('foe-') && !k.includes('~') && !k.includes('boss')), ...FOE_KEYS];
  for (const key of keys) {
    const t = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
    if (!(t instanceof Phaser.Textures.CanvasTexture) || painted.has(t)) continue;
    painted.add(t);
    const c = t.getContext(), img = c.getImageData(0, 0, t.width, t.height);
    dressPixels(img.data, t.width, t.height, FOE_DRESS, key.length * 97 + key.charCodeAt(4));
    c.putImageData(img, 0, 0);
    t.refresh();
  }
}

/** The mound under a prop and the lip in front of a buried one, per land (house style, no outline: they are ground). */
export function makeDressArt(scene: Phaser.Scene) {
  for (const paint of Object.keys(DRESS) as Paint[]) {
    const o = DRESS[paint];
    const css = (c: RGB, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const blob = (c: Ctx, cx: number, cy: number, rx: number, ry: number, seed: number) => {
      c.beginPath();
      for (let i = 0; i <= 24; i++) {
        const t = (i / 24) * Math.PI * 2, j = 1 + (hash(i % 24, seed) - 0.5) * 0.22;
        c.lineTo(cx + Math.cos(t) * rx * j, cy + Math.sin(t) * ry * j);
      }
      c.closePath();
    };
    const dress = (c: Ctx, w: number, h: number, seed: number) => {
      c.fillStyle = css(o.soil);
      blob(c, w / 2, h / 2, w / 2 - 6, h / 2 - 4, seed + 1);
      c.fill();
      c.fillStyle = css(o.soilHi, 0.7);
      blob(c, w / 2 - w * 0.12, h / 2 - h * 0.14, w * 0.22, h * 0.16, seed + 2);
      c.fill();
      // Small things in it: tufts, pebbles, embers, ice chips.
      c.fillStyle = css(o.bits);
      for (let i = 0; i < 9; i++) {
        const a = hash(i, seed + 3) * Math.PI * 2, rr = 0.55 + hash(i, seed + 4) * 0.35;
        c.beginPath();
        c.ellipse(w / 2 + Math.cos(a) * (w / 2 - 4) * rr, h / 2 + Math.sin(a) * (h / 2 - 3) * rr, 1.4, 0.9, a, 0, Math.PI * 2);
        c.fill();
      }
    };
    FLOOR.add(`foot-${paint}`).add(`lip-${paint}`);
    // The mound: soft at its edge, so it sinks into the ground rather than lying on it like a plate.
    canvas(scene, `foot-${paint}`, 64, 22, (c) => {
      c.globalAlpha = 0.55;
      c.fillStyle = css(o.soilLo);
      blob(c, 33.5, 12, 30, 9, 5);
      c.fill();
      c.globalAlpha = 1;
      dress(c, 64, 22, 11);
    });
    // The lip: a row of lumps of the land over the prop's foot, each lit on top.
    canvas(scene, `lip-${paint}`, 64, 14, (c) => {
      for (let i = 0; i < 6; i++) {
        const x = 7 + i * 10 + (hash(i, 31) - 0.5) * 5, rx = 7 + hash(i, 32) * 4, ry = 3 + hash(i, 33) * 2.5, y = 14 - ry - 0.5;
        c.fillStyle = css(o.soilLo);
        blob(c, x + 1, y + 1, rx, ry, 40 + i);
        c.fill();
        c.fillStyle = css(o.soil);
        blob(c, x, y, rx - 0.5, ry - 0.5, 50 + i);
        c.fill();
        c.fillStyle = css(o.soilHi);
        blob(c, x - rx * 0.25, y - ry * 0.35, rx * 0.45, ry * 0.35, 60 + i);
        c.fill();
      }
    });
  }
}

/** Game px of a foot texture (`canvas` stores it at `S`). */
export const FOOT = { w: 64, h: 22, lip: 14, s: S };
