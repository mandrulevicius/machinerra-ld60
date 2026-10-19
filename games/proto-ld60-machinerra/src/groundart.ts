/**
 * The land's ground, painted once per land into a canvas (`paintGround`), per texel, then dressed with buried old tech
 * (`buryTech`). The live layer over it (clouds, the D-city's shadow, glints, motes) is `groundlive.ts`.
 *
 * The look (`games/ludum-dare-60/docs/biome-look.md`): the painted NPCs are the reference. Every land is old tech under
 * sediment: mesas are the tops of things that were built (sandstone over brass hull, rooftops, glass, obsidian), open
 * ground hides cogs, pipes and plates. Light comes from the top left: every mesa top has a lit rim there and every
 * clump, cobble and facet is lit on that side; shadows lean cool (blue, teal, violet), light warm. Detail lives at three
 * scales: the land's shapes (mapgen), material cells (Voronoi: clay plates, leaf clumps, facets, slabs, plating) and
 * scattered things (rivets, litter, buried tech). Colour is still cut in steps (`BAND`) and mesas keep the soot ring, so
 * the ground matches the house style of what stands on it.
 *
 * A mesa's shadow is not painted here (the house-style ground): `mesashadow.ts` draws it leaning with the light.
 * Wear (cracks, ruts, stains, debris, worn paths) is a separate layer laid over this paint by `wear.ts`; it never edits what is painted here.
 *
 * Add a biome: its `paint` in `BiomeDef` and a case in `paintGround`'s paint switch (open ground by kind, the mesa's top, cliff, rim), and
 * a `TECH` row (what its buried things are made of), and its `WEAR` and `MIX` rows in `wear.ts`.
 */
import Phaser from 'phaser';
import { BIOMES, T, type BiomeDef } from './sim/defs';
import { Ter, type MapData } from './sim/mapgen';
import { LINE } from './house';
import { wearGround } from './wear';
import { mesaMask } from './mesashadow';

/** The ground's colour steps (a texel's channel is cut to a multiple of this): flat blobs of paint, not a smooth gradient. */
const BAND = 6;

/**
 * Game px per ground texel in the mission and the Ascent (draw the image at this scale). The art is 0.5 (2x, shown at
 * half), but a land is 3200 x 2400 game px: 1 keeps its edges under a screen px at zoom 1 and the paint under about 2 s.
 */
export const GROUND_PX = 1;

/** The soot ring round every mesa (`width` texels, outside it), the house fringe; `rocky` marks the mesas and is used up. */
function fringe(d: Uint8ClampedArray, rocky: Uint8Array, W: number, H: number, width: number) {
  for (let r = 0; r < width; r++) {
    const hit: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (!rocky[p] && ((x > 0 && rocky[p - 1]) || (x < W - 1 && rocky[p + 1]) || (y > 0 && rocky[p - W]) || (y < H - 1 && rocky[p + W]))) hit.push(p);
      }
    for (const p of hit) {
      rocky[p] = 1;
      d[p * 4] = 29; d[p * 4 + 1] = 26; d[p * 4 + 2] = 23;
    }
  }
}

/** A seed (number or string) as a 32-bit mix, so every land's paint is its own (not only its seed's length). */
function seedHash(seed: number | string) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** The cast shadow's tint by paint: cool, as the painted figures' shadows are. */
const SHADOW: Record<BiomeDef['paint'], [number, number, number]> = {
  desert: [0.64, 0.66, 0.86], jungle: [0.52, 0.66, 0.72], city: [0.6, 0.64, 0.8],
  snow: [0.72, 0.8, 0.96], demon: [0.58, 0.42, 0.52], ether: [0.52, 0.46, 0.78],
};

/**
 * Paint the land once into a canvas, `px` game px per texel (draw the image at that scale; the hub's far view keeps the
 * coarse 2); returns its key. At `GROUND_PX` it is in the house style: colour in steps (`BAND`), the soot fringe round
 * every mesa, and the buried tech.
 */
export function paintGround(scene: Phaser.Scene, m: MapData, px = 2) {
  const key = `ground-${m.biome}-${m.seed}${px === 2 ? '' : `@${px}`}`;
  const paint = BIOMES[m.biome].paint;
  if (scene.textures.exists(key)) return key;
  const k = px;
  const flat = px < 2; // the house style's flat paint and fringe
  const W = (m.w * T) / k, H = (m.h * T) / k;
  const tex = scene.textures.createCanvas(key, W, H)!;
  const c = tex.getContext();
  const img = c.createImageData(W, H);
  const d = img.data;
  const seedMix = seedHash(m.seed);
  const hash = (x: number, y: number) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) ^ seedMix;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const vnoise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy), b = hash(ix + 1, iy), cc = hash(ix, iy + 1), dd = hash(ix + 1, iy + 1);
    return a + (b - a) * sx + (cc - a) * sy + (a - b - cc + dd) * sx * sy;
  };
  // Voronoi cells of a jittered grid `size` px: the nearest seed's id (0..1), the offset to it in cell units (light
  // from the top left falls on the side whose seed lies down-right: vx + vy > 0), and the edge distance in px.
  let vId = 0, vx = 0, vy = 0, vEdge = 0;
  const cells = (x: number, y: number, size: number) => {
    const fx = x / size, fy = y / size, ix = Math.floor(fx), iy = Math.floor(fy);
    let f1 = 9, f2 = 9;
    for (let j = -1; j <= 1; j++)
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, h = hash(cx, cy);
        const ox = cx + 0.15 + h * 0.7 - fx, oy = cy + 0.15 + hash(cx + 911, cy - 377) * 0.7 - fy;
        const dd = ox * ox + oy * oy;
        if (dd < f1) { f2 = f1; f1 = dd; vId = h; vx = ox; vy = oy; } else if (dd < f2) f2 = dd;
      }
    vEdge = (Math.sqrt(f2) - Math.sqrt(f1)) * size * 0.5;
  };
  // The kind of ground here: each kind's share, blended between tile centres, so outlines are smooth curves, not steps.
  // The tiles sit in a grid with a ring of rock round it (off the map is rock), so a lookup never leaves it.
  const KW = m.w + 2;
  const kinds = new Uint8Array(KW * (m.h + 2)).fill(Ter.Rock);
  for (let y = 0; y < m.h; y++) kinds.set(m.ter.subarray(y * m.w, (y + 1) * m.w), (y + 1) * KW + 1);
  const ground = (gx: number, gy: number) => {
    const fx = gx / T - 0.5, fy = gy / T - 0.5;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const o = Math.min(m.h - 1, Math.max(-1, iy)) * KW + KW + Math.min(m.w - 1, Math.max(-1, ix)) + 1;
    const a = kinds[o], b = kinds[o + 1], c = kinds[o + KW], d = kinds[o + KW + 1];
    if (a === b && b === c && c === d) return a;
    const ax = fx - ix, ay = fy - iy;
    const wa = (1 - ax) * (1 - ay), wb = ax * (1 - ay), wc = (1 - ax) * ay, wd = ax * ay;
    const share = (t: number) => (a === t ? wa : 0) + (b === t ? wb : 0) + (c === t ? wc : 0) + (d === t ? wd : 0);
    return share(Ter.Rock) > 0.5 ? Ter.Rock : share(Ter.Dune) > 0.5 ? Ter.Dune : share(Ter.Hardpan) > 0.5 ? Ter.Hardpan : Ter.Sand;
  };
  const rocky = new Uint8Array(W * H);
  // The smooth fields are made every 2 game px and blended between (as a texel is 1 to 2 game px, it is near enough, and
  // an eighth of the noise calls).
  const TW = Math.ceil((m.w * T) / 2) + 2, TH = Math.ceil((m.h * T) / 2) + 2;
  const field = (f: (gx: number, gy: number) => number) => {
    const a = new Float32Array(TW * TH);
    for (let j = 0; j < TH; j++) for (let i = 0; i < TW; i++) a[j * TW + i] = f(i * 2, j * 2);
    return a;
  };
  // Wobble the tile lookup so edges are organic.
  const fjx = field((gx, gy) => (vnoise(gx / 23, gy / 23) - 0.5) * T * 0.7 + (vnoise(gx / 7, gy / 7) - 0.5) * 6);
  const fjy = field((gx, gy) => (vnoise(gx / 23 + 50, gy / 23) - 0.5) * T * 0.7 + (vnoise(gx / 7 + 30, gy / 7) - 0.5) * 6);
  const fn = field((gx, gy) => vnoise(gx / 60, gy / 60) * 0.6 + vnoise(gx / 9, gy / 9) * 0.3);
  const fdune = field((gx, gy) => vnoise(gx / 40, gy / 40));
  // Brush strokes: long thin streaks on a slant, the grain a painted surface has.
  const fstroke = field((gx, gy) => vnoise((gx * 0.8 + gy * 0.6) / 17, (gy * 0.8 - gx * 0.6) / 3.5) - 0.5);
  // Where the mesa's material changes: patches of hull, snow caps, glowing seams, puddles (big, slow).
  const fpatch = field((gx, gy) => vnoise(gx / 150 + 3, gy / 150 - 7) * 0.75 + vnoise(gx / 31, gy / 31) * 0.25);
  const [shR, shG, shB] = SHADOW[paint];
  let o = 0, w00 = 0, w10 = 0, w01 = 0, w11 = 0, r = 0, g = 0, b = 0;
  const lerp = (f: Float32Array) => f[o] * w00 + f[o + 1] * w10 + f[o + TW] * w01 + f[o + TW + 1] * w11;
  // Mixes the texel toward a colour (a = 0..1).
  const mix = (cr: number, cg: number, cb: number, a: number) => {
    r += (cr - r) * a; g += (cg - g) * a; b += (cb - b) * a;
  };
  for (let py = 0; py < H; py++)
    for (let pxx = 0; pxx < W; pxx++) {
      const gx = pxx * k, gy = py * k;
      const u = gx / 2, v = gy / 2, ti = Math.floor(u), tj = Math.floor(v), fx = u - ti, fy = v - tj;
      o = tj * TW + ti;
      w00 = (1 - fx) * (1 - fy); w10 = fx * (1 - fy); w01 = (1 - fx) * fy; w11 = fx * fy;
      const jx = lerp(fjx), jy = lerp(fjy);
      const wx = gx + jx, wy = gy + jy;
      const t = ground(wx, wy);
      const n = lerp(fn) + (flat ? 0.05 : hash(pxx, py) * 0.1);
      const st = lerp(fstroke) * 2, pa = lerp(fpatch);
      const rock = t === Ter.Rock;
      const cliff = rock && ground(wx, wy + T * 0.55) !== Ter.Rock; // the mesa's south face
      const rim = rock && !cliff && ground(wx - 3 * k, wy - 3 * k) !== Ter.Rock; // its top's lit edge
      switch (paint) {
        case 'desert':
        case 'demon': {
          const demon = paint === 'demon';
          if (cliff) {
            const streak = (vnoise(gx / 3, gy / 38) - 0.5) * 26;
            [r, g, b] = demon ? [34 + streak * 0.4, 16, 20] : [124 + n * 24 + streak, 70 + n * 16 + streak * 0.6, 44 + n * 10 + streak * 0.4];
          } else if (rim) [r, g, b] = demon ? [150, 62, 48] : [252, 210, 150];
          else if (rock) {
            if (demon) {
              // Obsidian facets; some seams still glow.
              cells(gx, gy, 26);
              const tone = (vId - 0.5) * 26;
              [r, g, b] = [42 + tone, 22 + tone * 0.6, 28 + tone * 0.7];
              if (vEdge < 1.2) [r, g, b] = pa > 0.66 ? [255, 80, 34] : [18, 9, 12];
            } else if (pa > 0.7) {
              // Brass hull breaking through the sandstone: riveted plates, verdigris in the seams.
              const row = Math.floor(gy / 26), uu = (gx + (row & 1) * 20) % 40, vv = gy % 26;
              [r, g, b] = [184 + n * 24 + st * 6, 132 + n * 18 + st * 4, 70 + n * 10];
              if (vnoise(gx / 22 + 9, gy / 22) > 0.66) mix(86, 150, 136, 0.65);
              if (uu < 1.4 || vv < 1.4) [r, g, b] = [64, 44, 30];
              else if (uu < 2.8 || vv < 2.8) mix(246, 214, 150, 0.6);
              const rx = Math.abs(uu - 5) < Math.abs(uu - 35) ? uu - 5 : uu - 35, ry = vv - 5;
              if (rx * rx + ry * ry < 3.2) [r, g, b] = rx + ry < -0.4 ? [250, 226, 170] : [70, 48, 30];
              if (pa < 0.715) [r, g, b] = [70, 45, 30]; // the hull's broken edge
            } else {
              // Sandstone in layered blocks, lit on the top left.
              const strata = Math.sin((gy + jy * 0.5) / 7) * 0.5 + 0.5;
              cells(gx, gy * 1.7, 34);
              const bev = (vx + vy) * 14;
              [r, g, b] = [178 + n * 30 - strata * 14 + bev + st * 5, 106 + n * 22 - strata * 9 + bev * 0.7 + st * 3, 64 + n * 14 - strata * 5 + bev * 0.4];
              if (vEdge < 1.3) [r, g, b] = [128, 72, 44];
            }
          } else if (t === Ter.Dune) {
            const ripple = Math.sin((gx * 0.35 + gy * 0.9 + lerp(fdune) * 40) / 3.2);
            [r, g, b] = demon ? [112 + ripple * 6 + n * 14, 70 + ripple * 4, 70 + ripple * 3] : [236 + n * 14 + ripple * 7, 198 + n * 12 + ripple * 6, 142 + n * 10 + ripple * 4];
          } else if (t === Ter.Hardpan) {
            // Cracked clay (or ash) plates, each curled a little toward the light.
            cells(wx * 0.6 + gx * 0.4, wy * 0.6 + gy * 0.4, 22);
            const bev = (vx + vy) * 12, tone = (vId - 0.5) * 14;
            [r, g, b] = demon ? [86 + tone + bev * 0.6, 50 + tone * 0.6 + bev * 0.3, 52 + tone * 0.6 + bev * 0.3] : [208 + n * 12 + tone + bev, 170 + n * 10 + tone + bev * 0.8, 122 + n * 8 + tone * 0.8 + bev * 0.5];
            if (vEdge < 1.4) [r, g, b] = demon ? (vnoise(gx / 90 + 7, gy / 90) > 0.7 ? [255, 120, 50] : [40, 20, 22]) : [150, 110, 80];
          } else {
            [r, g, b] = demon ? [92 + n * 16 + st * 4, 56 + n * 8, 58 + n * 8] : [224 + n * 16 + st * 7, 184 + n * 13 + st * 6, 130 + n * 10 + st * 4];
          }
          break;
        }
        case 'jungle': {
          if (cliff) [r, g, b] = [30 + n * 10, 46 + n * 12 + (vnoise(gx / 3, gy / 30) - 0.5) * 16, 28];
          else if (rim) [r, g, b] = [176, 206, 92];
          else if (rock) {
            // Canopy: leaf clumps, each a pillow lit from the top left; dark teal in the gaps.
            cells(gx, gy, 30);
            const big = 0.45 + (vx + vy) * 0.8, id = vId, edge = vEdge;
            cells(gx, gy, 9);
            const lit = Math.max(0, Math.min(1, big * 0.65 + (0.45 + (vx + vy) * 0.8) * 0.35)), tone = (id - 0.5) * 30 + (pa - 0.5) * 44 + (hash(gx >> 1, gy >> 1) - 0.5) * 10;
            [r, g, b] = [20 + lit * 96 + tone * 0.6, 54 + lit * 110 + tone, 36 + lit * 24];
            if (edge < 1.6 && big < 0.5) [r, g, b] = [12, 34, 30];
          } else if (t === Ter.Dune) {
            // Ferns and undergrowth: small clumps.
            cells(gx, gy, 22);
            const big = 0.45 + (vx + vy) * 0.8, edge = vEdge;
            cells(gx, gy, 7);
            const lit = Math.max(0, Math.min(1, big * 0.6 + (0.45 + (vx + vy) * 0.8) * 0.4));
            [r, g, b] = [34 + lit * 56 + n * 10, 66 + lit * 66 + n * 14, 34 + lit * 16];
            if (edge < 1.4 && big < 0.5) [r, g, b] = [22, 46, 30];
          } else if (t === Ter.Hardpan) {
            // Mud, and puddles of rain with a sky glint on their far edge.
            [r, g, b] = [96 + n * 16 + st * 6, 72 + n * 12 + st * 4, 46 + n * 8];
            const pool = vnoise(gx / 46 + 21, gy / 46);
            if (pool > 0.63) {
              [r, g, b] = [42 + n * 10, 66 + n * 10, 74 + n * 12];
              if (vnoise((gx + 3) / 46 + 21, (gy + 3) / 46) <= 0.63) [r, g, b] = [150, 196, 196];
              else if (vnoise((gx - 3) / 46 + 21, (gy - 3) / 46) <= 0.63) [r, g, b] = [56, 40, 28];
            }
          } else {
            // Forest floor: moss and earth, leaf litter.
            [r, g, b] = [70 + n * 18 + st * 4, 86 + n * 18 + st * 4, 44 + n * 8];
            if (hash(gx >> 1, gy >> 1) > 0.982) [r, g, b] = [156, 98, 44];
          }
          break;
        }
        case 'city': {
          if (cliff) {
            // A building's south wall: rows of windows, a few still lit.
            const win = gx % 14 < 6 && (gy + 3) % 11 < 5;
            [r, g, b] = [62 + n * 10, 62 + n * 10, 72 + n * 12];
            if (win) [r, g, b] = hash(Math.floor(gx / 14), Math.floor(gy / 11)) > 0.82 ? [214, 170, 96] : [34, 40, 52];
          } else if (rim) [r, g, b] = [196, 198, 206];
          else if (rock) {
            // Rooftops: panels, vent boxes, skylights.
            const iy = Math.floor(gy / 72), sx = gx + hash(iy, 77) * 110, ix = Math.floor(sx / 110), uu = sx - ix * 110, vv = gy - iy * 72, id = hash(ix, iy + 500);
            const tone = (id - 0.5) * 34, warm = id > 0.6 ? 10 : 0;
            [r, g, b] = [116 + tone + warm + n * 12 + st * 4, 118 + tone + n * 12 + st * 4, 126 + tone - warm + n * 12 + st * 4];
            if (hash(gx >> 1, gy >> 1) > 0.95) mix(70, 70, 76, 0.35); // gravel
            const ax = uu - 30 - id * 40, ay = vv - 20 - id * 20;
            if (id > 0.45 && ax > 0 && ax < 18 && ay > 0 && ay < 13) {
              [r, g, b] = ax < 2 || ay < 2 ? [184, 186, 194] : ax > 16 || ay > 11 ? [46, 48, 56] : [92, 94, 102];
              if (ax > 5 && ax < 13 && ay > 3 && ay < 10 && (ax + ay) % 3 < 1) [r, g, b] = [52, 54, 62]; // the fan's grille
            } else if (id < 0.2 && uu > 14 && uu < 90 && vv > 26 && vv < 44) {
              [r, g, b] = (uu % 12) < 1.2 ? [60, 64, 74] : [74, 108, 132];
              if (Math.abs((uu % 12) - (vv - 26) * 0.5) < 1.5) mix(200, 230, 245, 0.55);
            }
            if (uu < 1.6 || vv < 1.6) [r, g, b] = [50, 50, 58];
            else if (uu < 4 || vv < 4) [r, g, b] = [170 + tone * 0.4, 170 + tone * 0.4, 178 + tone * 0.4]; // the parapet, lit
            else if (uu > 106 || vv > 68) mix(60, 62, 72, 0.5);
          } else if (t === Ter.Hardpan) {
            // Paving slabs, a few cracked.
            const ix = Math.floor(gx / 32), iy = Math.floor(gy / 32), uu = gx - ix * 32, vv = gy - iy * 32, id = hash(ix, iy);
            [r, g, b] = [138 + (id - 0.5) * 18 + n * 10, 136 + (id - 0.5) * 18 + n * 10, 132 + (id - 0.5) * 16 + n * 8];
            if (uu < 1.2 || vv < 1.2) [r, g, b] = [96, 94, 92];
            else if (uu < 2.4 || vv < 2.4) mix(196, 192, 182, 0.5);
            if (id > 0.86 && Math.abs(uu - vv * (0.5 + id) - 2) < 0.8) [r, g, b] = [100, 96, 92];
          } else if (t === Ter.Dune) {
            // Rubble: broken stones.
            cells(gx, gy, 7);
            const lit = Math.max(0, Math.min(1, 0.45 + (vx + vy) * 0.8));
            [r, g, b] = [78 + lit * 70 + (vId - 0.5) * 20, 74 + lit * 66 + (vId - 0.5) * 20, 72 + lit * 58];
            if (vEdge < 0.7) [r, g, b] = [52, 50, 52];
          } else {
            // Asphalt.
            [r, g, b] = [66 + n * 14 + st * 3, 66 + n * 14 + st * 3, 74 + n * 14 + st * 3];
            if (hash(gx >> 1, gy >> 1) > 0.97) mix(120, 120, 126, 0.6);
          }
          break;
        }
        case 'snow': {
          if (cliff) [r, g, b] = [70 + n * 12 + (vnoise(gx / 3, gy / 36) - 0.5) * 20, 74 + n * 12, 92 + n * 14];
          else if (rim) [r, g, b] = [255, 255, 255];
          else if (rock) {
            // Granite facets under snow caps; the snow's shadow side blue.
            cells(gx, gy, 28);
            const tone = (vId - 0.5) * 40;
            [r, g, b] = [98 + tone, 104 + tone, 118 + tone];
            if (vEdge < 1.2) [r, g, b] = [50, 54, 68];
            if (pa - (vx + vy) * 0.12 > 0.52) [r, g, b] = vx + vy < -0.15 ? [188, 204, 232] : [232, 238, 250];
          } else if (t === Ter.Dune) {
            const ripple = Math.sin((gx * 0.35 + gy * 0.9 + lerp(fdune) * 40) / 3.6);
            [r, g, b] = [222 + ripple * 8 + n * 8, 230 + ripple * 7 + n * 8, 246 + ripple * 4];
          } else if (t === Ter.Hardpan) {
            // Ice: blue, cracked white, glossy streaks.
            cells(gx, gy, 34);
            [r, g, b] = [146 + n * 16 + st * 14, 194 + n * 12 + st * 12, 226 + n * 8 + st * 8];
            if (vEdge < 1) [r, g, b] = [236, 248, 255];
          } else [r, g, b] = [230 + n * 10 + st * 4, 236 + n * 9 + st * 4, 250 + n * 4];
          break;
        }
        case 'ether': {
          if (cliff) [r, g, b] = [26 + n * 12, 18 + n * 8 + (vnoise(gx / 3, gy / 30) - 0.5) * 12, 52 + n * 20];
          else if (rim) [r, g, b] = [214, 226, 255];
          else if (rock) {
            // Dark glass facets with cold edges.
            cells(gx, gy, 34);
            const lit = Math.max(0, Math.min(1, 0.4 + (vx + vy) * 0.7));
            [r, g, b] = [36 + vId * 40 + lit * 30, 26 + vId * 30 + lit * 20, 78 + vId * 60 + lit * 40];
            if (vEdge < 1.3) [r, g, b] = pa > 0.6 ? [176, 186, 240] : [58, 46, 104];
          } else if (t === Ter.Dune) [r, g, b] = [146 + n * 30 + st * 8, 136 + n * 28 + st * 8, 200 + n * 30 + st * 8];
          else if (t === Ter.Hardpan) {
            // Veins of cold light.
            cells(gx, gy, 40);
            [r, g, b] = [56 + n * 18 + (vId - 0.5) * 18, 50 + n * 16, 112 + n * 26 + (vId - 0.5) * 20];
            if (vEdge < 1.1) [r, g, b] = vnoise(gx / 70, gy / 70) > 0.55 ? [176, 186, 240] : [40, 34, 84];
          } else {
            [r, g, b] = [98 + n * 24 + st * 8, 84 + n * 20 + st * 6, 158 + n * 26 + st * 8];
            if (hash(gx >> 1, gy >> 1) > 0.996) [r, g, b] = [220, 232, 255];
          }
          break;
        }
      }
      // The coarse far views keep a mesa's shadow baked, toward the south-east, cool; the house-style ground has the live layer (`mesashadow.ts`).
      if (!flat && !rock && ground(wx - T * 0.5, wy - T * 0.6) === Ter.Rock) {
        r *= shR; g *= shG; b *= shB;
      }
      const i = (py * W + pxx) * 4;
      if (flat) {
        r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
        r -= r % BAND; g -= g % BAND; b -= b % BAND;
        rocky[py * W + pxx] = +rock;
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  if (flat) fringe(d, rocky, W, H, Math.round(LINE.outline / k));
  c.putImageData(img, 0, 0);
  if (flat) wearGround(c, m, k, rocky, W, H, paint, seedMix);
  buryTech(c, m, k, rocky, W, H, paint, seedMix);
  if (flat) mesaMask(scene, key, rocky, W, H, k);
  tex.refresh();
  return key;
}

/** What each land's buried things are made of: metal, its light edge, its rust or patina. */
const TECH: Record<BiomeDef['paint'], { metal: string; hi: string; worn: string; lip: number }> = {
  desert: { metal: '#a8783c', hi: '#f2d08a', worn: '#5f9a8a', lip: 0.6 },
  jungle: { metal: '#7a4a2a', hi: '#c8865a', worn: '#4f7a3a', lip: 0.5 },
  city: { metal: '#6a6e78', hi: '#c4c8d2', worn: '#8a5a3a', lip: 0.4 },
  snow: { metal: '#5a6274', hi: '#dfe8f6', worn: '#9ab4d4', lip: 0.6 },
  demon: { metal: '#2a1a1c', hi: '#b04a32', worn: '#5a2a24', lip: 0.5 },
  ether: { metal: '#3a3070', hi: '#a8f4ff', worn: '#6a58b0', lip: 0.5 },
};

/**
 * Old tech half buried in the open ground: cogs, pipes, riveted plates, cables and bolts, in the land's metal, outlined
 * in soot, lit on the top left, and part covered by a lip of the ground they lie in. Never on a mesa or its ring.
 */
function buryTech(c: CanvasRenderingContext2D, m: MapData, k: number, rocky: Uint8Array, W: number, H: number, paint: BiomeDef['paint'], seed: number) {
  let s = seed || 1;
  const rnd = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296;
  const tech = TECH[paint];
  const count = Math.round((W * H * k * k) / 60000);
  const d = c.getImageData(0, 0, W, H).data;
  const free = (x: number, y: number, r: number) => {
    for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const xx = Math.round(x + ox), yy = Math.round(y + oy);
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || rocky[yy * W + xx]) return false;
    }
    return true;
  };
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const soot = '#1d1a17';
  for (let n = 0; n < count; n++) {
    const x = rnd() * W, y = rnd() * H, size = (9 + rnd() * 14) / k;
    if (!free(x, y, size * 1.6)) continue;
    const p = (Math.round(y) * W + Math.round(x)) * 4;
    const here = `rgb(${d[p]},${d[p + 1]},${d[p + 2]})`;
    const kind = rnd();
    c.save();
    c.translate(x, y);
    c.rotate(rnd() * Math.PI * 2);
    c.lineWidth = LINE.detail / k;
    c.strokeStyle = soot;
    c.fillStyle = rnd() < 0.35 ? tech.worn : tech.metal;
    if (kind < 0.34) {
      // A cog: teeth, a rim, a hub.
      const teeth = 8 + Math.floor(rnd() * 5), ro = size, ri = size * 0.78;
      c.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2, rr = i % 2 ? ri : ro;
        c.lineTo(Math.cos(a - 0.12) * rr, Math.sin(a - 0.12) * rr);
        c.lineTo(Math.cos(a + 0.12) * rr, Math.sin(a + 0.12) * rr);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(0, 0, size * 0.28, 0, Math.PI * 2);
      c.fillStyle = soot;
      c.fill();
    } else if (kind < 0.58) {
      // A pipe, banded, its open end dark.
      const len = size * (2 + rnd() * 2.5), w = size * 0.45;
      c.beginPath();
      c.roundRect(-len / 2, -w / 2, len, w, w * 0.4);
      c.fill();
      c.stroke();
      c.fillStyle = soot;
      c.beginPath();
      c.ellipse(len / 2 - w * 0.2, 0, w * 0.22, w * 0.38, 0, 0, Math.PI * 2);
      c.fill();
      for (let b = -len / 2 + w; b < len / 2 - w; b += w * 1.6) c.fillRect(b, -w / 2, LINE.detail / k, w);
    } else if (kind < 0.78) {
      // A riveted plate.
      const pw = size * 1.6, ph = size * 1.1;
      c.beginPath();
      c.rect(-pw / 2, -ph / 2, pw, ph);
      c.fill();
      c.stroke();
      c.fillStyle = soot;
      for (const [rx, ry] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        c.beginPath();
        c.arc(rx * (pw / 2 - size * 0.22), ry * (ph / 2 - size * 0.22), size * 0.1, 0, Math.PI * 2);
        c.fill();
      }
    } else if (kind < 0.92) {
      // A cable, snaking out of the ground and back in.
      const len = size * 3;
      c.lineWidth = (2.2 * LINE.detail) / k + size * 0.12;
      c.beginPath();
      c.moveTo(-len / 2, 0);
      c.bezierCurveTo(-len / 6, -size * 1.2, len / 6, size * 1.2, len / 2, 0);
      c.stroke();
      c.lineWidth = size * 0.12;
      c.strokeStyle = tech.metal;
      c.stroke();
    } else {
      // A bolt head.
      c.beginPath();
      for (let i = 0; i < 6; i++) c.lineTo(Math.cos((i / 6) * Math.PI * 2) * size * 0.45, Math.sin((i / 6) * Math.PI * 2) * size * 0.45);
      c.closePath();
      c.fill();
      c.stroke();
    }
    c.restore();
    // The lit edge (top left), then the ground's lip over part of it: buried, not lying on top.
    c.save();
    c.translate(x, y);
    c.strokeStyle = tech.hi;
    c.globalAlpha = 0.8;
    c.lineWidth = LINE.detail / k;
    c.beginPath();
    c.arc(0, 0, size * 0.62, Math.PI * 1.05, Math.PI * 1.45);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = here;
    const la = rnd() * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const a = la + (i - 1) * 0.5, rr = size * (0.7 + tech.lip * 0.6);
      c.beginPath();
      c.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, size * (0.55 + rnd() * 0.3), size * (0.35 + rnd() * 0.2), a, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
  c.restore();
}
