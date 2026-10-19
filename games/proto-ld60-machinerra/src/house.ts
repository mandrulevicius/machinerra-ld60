/**
 * The house style for textures drawn in code, the same pass the painted figures go through (`tools/style.cjs`, calibrated
 * on the Communicator's frames) so the world and the figures share one pixel size and one line: drawn at his detail
 * (`DETAIL` px per game px, softened), Kuwahara-flattened into blobs, down to the 2x texture, cut to 24 colours, and
 * fringed with his 1 texture px soot outline. Ground-like art (floors, decals) skips the outline.
 *
 * A new texture goes through `canvas()` (`art.ts`, stored at `S`x, shown at 1/`S`); only light, shadow, marks and effects
 * stay out of the style (`PLAIN`), and things lying flat skip the outline (`FLOOR`). Runtime `Graphics` lines use `LINE.*`,
 * never a bare number; colours that signal use the tokens below, never a hex.
 */

/** Source px per game px the Communicator's painting kept, and its softness (style.cjs). */
export const DETAIL = 3;
const SOFT = 1.1;
/** The Kuwahara radius at `DETAIL` px, the same reach in game px as his frames' (3 px at 329/74). */
const RADIUS = 2;
export const COLOURS = 24;
/** The soot fringe (communicator-walk.cjs `HALO`). */
const HALO = [29, 26, 23];

/**
 * The line-weight ladder, in game px (a line is `weight x zoom` screen px: 0.6 to 1.5 in a mission). Every line the
 * game draws, in a texture or at run time, takes one of these; none is thinner than `detail`. Painted art keeps its own.
 *  - `outline`: the edge of anything that stands (a `shape()` stroke; the soot fringe on a mesa).
 *  - `detail`: lines inside a shape: seams, rivets, panel lines, wire.
 *  - `effect`: lines over the world: telegraphs, rings, beams, hoses, selection.
 *  - `accent`: the strongest lines, and the dark underlay of a two-colour stroke (soot 3 under a 1.5 light line).
 */
export const LINE = { detail: 1, outline: 1.6, effect: 2, accent: 3 } as const;

/**
 * Colour is a signal (Minos, 2026-10-18): pick by meaning, never by hex. Mirrored in `style.css` (`--danger`, `--friend`).
 *  - `DANGER`: red, and only red-leaning hues, marks what threatens the Communicator or his robots: enemy attacks and their
 *    telegraphs, hazards, enemy auras, enemies on the map, low oil and other urgent states. `DANGER_HOT` is its orange side
 *    (a hit's flash, a wind-up burning), `DANGER_TWISTED` the twisted's magenta-red, `DANGER_TEXT` red for text on dark.
 *  - `FRIEND`: cyan marks what is on our side: the D-city's air support and its target rings, our shots and blasts, crew rings,
 *    order markers, pickups, signals, command mode. `FRIEND_SOFT` for lines and ground washes, `FRIEND_HI` for glints, `FRIEND_TEXT` on dark.
 * Cyan is the one friendly family because the crew's beams, the command wash and the pickups already were, and it is the far
 * side of red on the wheel. It is pale, so a ring in it sits on a soot underlay (`LINE.accent`) to read on snow and sand.
 * Brass, amber and white stay what they always were: light, lamps, the lift, neutral prompts and refusals. What is not a
 * signal keeps its own colour: a prop's paint, an enemy's body and eyes, an item's icon, a status pip's damage type.
 */
export const DANGER = 0xff3048;
export const DANGER_HOT = 0xff6a40;
export const DANGER_TWISTED = 0xff2a78;
export const DANGER_TEXT = '#ff8090';
export const FRIEND = 0x3df2ff;
export const FRIEND_SOFT = 0x9fe0ff;
export const FRIEND_HI = 0xdff4ff;
export const FRIEND_TEXT = '#8ff6ff';
/** The soot of the fringe and of every two-colour line's underlay, as a Phaser colour. */
export const SOOT = 0x1d1a17;
/** A Phaser colour number as a CSS string, for the canvas and DOM. */
export const css = (n: number) => '#' + n.toString(16).padStart(6, '0');

type Draw = (c: CanvasRenderingContext2D) => void;

const make = (w: number, h: number) => {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return [el, el.getContext('2d', { willReadFrequently: true })!] as const;
};

/** Draws `draw` (game px, `w` x `h`) in the house style into `out`, a 2d context `scale` px per game px. */
export function house(out: CanvasRenderingContext2D, w: number, h: number, scale: number, draw: Draw, edge = true) {
  const W = Math.round(w * DETAIL), H = Math.round(h * DETAIL);
  const [src, s] = make(W, H);
  s.scale(DETAIL, DETAIL);
  s.lineJoin = 'round';
  s.lineCap = 'round';
  draw(s);
  const [soft, b] = make(W, H);
  b.filter = `blur(${SOFT}px)`;
  b.drawImage(src, 0, 0);
  const img = b.getImageData(0, 0, W, H);
  b.putImageData(kuwahara(img, RADIUS), 0, 0);
  out.save();
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.imageSmoothingEnabled = true;
  out.imageSmoothingQuality = 'high';
  out.drawImage(soft, 0, 0, W, H, 0, 0, Math.round(w * scale), Math.round(h * scale));
  const fin = out.getImageData(0, 0, Math.round(w * scale), Math.round(h * scale));
  quantize(fin, palette(fin, COLOURS));
  if (edge) outline(fin);
  out.putImageData(fin, 0, 0);
  out.restore();
}

/** Each pixel takes the mean of its calmest quadrant: paint blobs with crisp edges between them. */
export function kuwahara(m: ImageData, r: number) {
  const { width: w, height: h, data: d } = m;
  const o = new ImageData(w, h);
  const q = o.data;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      q[i + 3] = d[i + 3];
      q[i] = d[i];
      q[i + 1] = d[i + 1];
      q[i + 2] = d[i + 2];
      if (d[i + 3] < 5) continue;
      let best = Infinity, br = 0, bg = 0, bb = 0, found = false;
      for (let qy = -1; qy <= 1; qy += 2)
        for (let qx = -1; qx <= 1; qx += 2) {
          let n = 0, sr = 0, sg = 0, sb = 0, sl = 0, sl2 = 0;
          for (let dy = 0; dy <= r; dy++) {
            const yy = y + dy * qy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = 0; dx <= r; dx++) {
              const xx = x + dx * qx;
              if (xx < 0 || xx >= w) continue;
              const j = (yy * w + xx) * 4;
              if (d[j + 3] < 128) continue;
              const l = d[j] * 0.3 + d[j + 1] * 0.59 + d[j + 2] * 0.11;
              sr += d[j]; sg += d[j + 1]; sb += d[j + 2]; sl += l; sl2 += l * l; n++;
            }
          }
          if (n < 2) continue;
          const ml = sl / n, v = sl2 / n - ml * ml;
          if (v < best) { best = v; br = sr / n; bg = sg / n; bb = sb / n; found = true; }
        }
      if (found) { q[i] = br; q[i + 1] = bg; q[i + 2] = bb; }
    }
  return o;
}

// The palette as in communicator-walk.cjs: k-means in a rough perceptual space where value counts double, the brightest
// glow kept as a colour of its own so eyes and lamps survive.
const lin = (r: number, g: number, b: number) => { const l = r * 0.3 + g * 0.59 + b * 0.11; return [l * 2, r - l, b - l]; };
const dist = (p: number[], q: number[]) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;

/** `k` colours for the opaque pixels of `m` (seeded, so a texture is the same every run). */
export function palette(m: ImageData, k: number) {
  const d = m.data, px: number[][] = [];
  const step = Math.max(1, Math.floor(d.length / 4 / 6000));
  for (let i = 0; i < d.length; i += 4 * step) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
  if (!px.length) return [];
  let rnd = 12345;
  const rand = () => (rnd = (rnd * 16807) % 2147483647) / 2147483647;
  const L = px.map((p) => lin(p[0], p[1], p[2]));
  const glow = px.reduce((b, c) => (c[0] + c[1] > b[0] + b[1] ? c : b));
  const C = [glow.slice()];
  const CL = [lin(glow[0], glow[1], glow[2])];
  const near = L.map((p) => dist(p, CL[0]));
  while (C.length < Math.min(k, px.length)) {
    let r = rand() * near.reduce((a, b) => a + b), j = 0;
    while ((r -= near[j]) > 0 && j < px.length - 1) j++;
    C.push(px[j].slice());
    CL.push(L[j]);
    for (let i = 0; i < L.length; i++) near[i] = Math.min(near[i], dist(L[i], CL[CL.length - 1]));
  }
  for (let it = 0; it < 10; it++) {
    const s = C.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < px.length; i++) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < CL.length; c++) { const e = dist(L[i], CL[c]); if (e < bd) { bd = e; bi = c; } }
      s[bi][0] += px[i][0]; s[bi][1] += px[i][1]; s[bi][2] += px[i][2]; s[bi][3]++;
    }
    for (let c = 1; c < C.length; c++) if (s[c][3]) { C[c] = [s[c][0] / s[c][3], s[c][1] / s[c][3], s[c][2] / s[c][3]]; CL[c] = lin(C[c][0], C[c][1], C[c][2]); }
  }
  return C;
}

/** Every visible pixel to its nearest palette colour; alpha kept (soft edges stay soft). */
export function quantize(m: ImageData, C: number[][]) {
  if (!C.length) return;
  const d = m.data, CL = C.map((c) => lin(c[0], c[1], c[2]));
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 5) { d[i + 3] = 0; continue; }
    const p = lin(d[i], d[i + 1], d[i + 2]);
    let bi = 0, bd = Infinity;
    for (let c = 0; c < CL.length; c++) { const e = dist(p, CL[c]); if (e < bd) { bd = e; bi = c; } }
    d[i] = C[bi][0]; d[i + 1] = C[bi][1]; d[i + 2] = C[bi][2];
  }
}

/** The Communicator's fringe: every clear pixel touching an opaque one (4-neighbour) turns soot. */
export function outline(m: ImageData) {
  const { width: w, height: h, data: d } = m;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 128 ? 1 : 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (a[p]) continue;
      if ((x > 0 && a[p - 1]) || (x < w - 1 && a[p + 1]) || (y > 0 && a[p - w]) || (y < h - 1 && a[p + w])) {
        const i = p * 4;
        d[i] = HALO[0]; d[i + 1] = HALO[1]; d[i + 2] = HALO[2]; d[i + 3] = 255;
      }
    }
}
