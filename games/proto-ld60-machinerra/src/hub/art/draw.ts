/**
 * The drawing helpers every hub painter shares: `tex` (a canvas texture at `HS`x), seeded noise, gradients, `fillPath`,
 * rivets, and the small shapes (poly, puff, lines, wheel, shell, gauge). Add a helper here when two painters need it.
 */
import Phaser from 'phaser';
import { tune } from '../../../../../harness/kit/tune';
import { slot } from '../../../../../harness/kit/variants';
import { COL, S } from '../../art';
import { forgetCasts } from '../../castatlas';
import { house, LINE } from '../../house';

export type Ctx = CanvasRenderingContext2D;

/** Textures are drawn at 2x and shown at 0.5 (crisp on a zoomed camera). */
export const HS = 2;

export function tex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void, scale = HS) {
  if (scene.textures.exists(key)) return key;
  const t = scene.textures.createCanvas(key, Math.ceil(w * scale), Math.ceil(h * scale))!;
  const c = t.getContext();
  c.scale(scale, scale);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  t.refresh();
  return key;
}

/**
 * Variant `hubart` (`?v.hubart=house`, reload to flip): `plain` is Laimonas's hub art as drawn; `house` runs the fixed
 * props, booths and lot props through `house()` at the mission's density (`S` texels per game px, the soot fringe), drawn at
 * their shown size (`k`), with the stroke weights of the shared helpers snapped to the `LINE` ladder. Shapes, colours and
 * composition are his; only density, outline and scale change.
 *
 * How far it goes is `?t.hubart=<0..1>` (default `HUB_ART_DEFAULT`): the house-passed texture is mixed over his own drawn at
 * the same size, so 0 is his art and 1 the full pass (`hub art <0..1>` redraws live). A mix, not a gentler `house()`: what
 * reads as dented and 3D is the Kuwahara blobs and the 24-colour banding together (they turn his speckle and gradients into
 * flat patches and contour bands, worst on the gong and the rusted wood); the outline is not it and the blur matters little.
 */
export const hubArt = slot('hubart', { plain: 'plain', house: 'house' });
/** In between: Minos found the full pass too dented and 3D, "somewhere in between the two" (2026-10-19). */
export const HUB_ART_DEFAULT = 0.5;
const strengthTune = tune({ hubart: [HUB_ART_DEFAULT, 0, 1, 0.05] });
/** How much of the house pass shows, 0..1. */
export const hubStrength = () => strengthTune.hubart;
export const housed = () => hubArt.value === 'house' && hubStrength() > 0;
/** The scale an image of a texture made with `texH(..., k)` is shown at: housed textures already hold `k`. */
export const shownAt = (k: number) => (housed() ? 1 : k) / HS;
/** While a housed texture is drawn: its `k` (a stroke of `v` box px is `v * k` game px), else 0. */
let drawnAt = 0;
const weight = (v: number, min: number = LINE.detail, max: number = LINE.outline) => (drawnAt ? Math.min(max, Math.max(min, v * drawnAt)) / drawnAt : v);

/** The keys `texH` made, in either style, so `forgetHubArt` can drop them. */
const made = new Set<string>();

const canvasOf = (w: number, h: number) => {
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  return el;
};

/** `tex` for a thing shown at `k` x its box: plain as before, or in the house style with `k` baked in. */
export function texH(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void, k = 1) {
  made.add(key);
  if (!housed()) return tex(scene, key, w, h, draw);
  if (scene.textures.exists(key)) return key;
  const gw = w * k, gh = h * k, pw = Math.round(gw * S), ph = Math.round(gh * S), mix = hubStrength();
  const t = scene.textures.createCanvas(key, pw, ph)!;
  const out = t.getContext();
  drawnAt = k;
  house(out, gw, gh, S, (c) => {
    c.scale(k, k);
    draw(c);
  });
  drawnAt = 0;
  if (mix < 1) {
    // His own art at the same size and weights, then the lerp of the two (premultiplied, so 'lighter' adds them exactly).
    const own = canvasOf(pw, ph), c = own.getContext('2d')!;
    c.scale(S * k, S * k);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    draw(c);
    const full = canvasOf(pw, ph);
    full.getContext('2d')!.drawImage(out.canvas, 0, 0);
    out.save();
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.clearRect(0, 0, pw, ph);
    out.globalAlpha = 1 - mix;
    out.drawImage(own, 0, 0);
    out.globalCompositeOperation = 'lighter';
    out.globalAlpha = mix;
    out.drawImage(full, 0, 0);
    out.restore();
  }
  t.refresh();
  return key;
}

/** Drops every texture `texH` made (and its `~hub` dressing) so the next build uses the current strength (`hub art`). */
export function forgetHubArt(scene: Phaser.Scene) {
  // `<key>~hub` and the casts made from either (`<key>~ss...`, `<key>~hub~ss...`: `castatlas.ts`).
  const all = scene.textures.getTextureKeys();
  for (const key of made) {
    for (const k of all) if (k === key || k.startsWith(`${key}~`)) scene.textures.remove(k);
    forgetCasts(scene, `${key}~`);
  }
  made.clear();
}

/** Deterministic noise: same picture every load. */
export const hash = (x: number, y: number) => {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const seeded = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

export const grad = (c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
};
export const radial = (c: Ctx, x: number, y: number, r: number, stops: [number, string][]) => {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
};
export function fillPath(c: Ctx, fill: string | CanvasGradient, path: () => void, line = 1.5, stroke = COL.soot) {
  c.beginPath();
  path();
  c.fillStyle = fill;
  c.fill();
  if (line > 0) {
    c.lineWidth = drawnAt ? weight(line, LINE.detail, LINE.outline) : line;
    c.strokeStyle = stroke;
    c.stroke();
  }
}
export const rivet = (c: Ctx, x: number, y: number, r = 1.6) => {
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath();
  c.arc(x + 0.6, y + 0.8, r, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#9a8a70';
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
};
export const shade = (hex: string, k: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
export const poly = (c: Ctx, pts: number[]) => {
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
};
export const puff = (c: Ctx, col: string, pts: [number, number, number][]) => {
  c.fillStyle = col;
  c.beginPath();
  for (const [x, y, r] of pts) {
    c.moveTo(x + r, y);
    c.arc(x, y, r, 0, Math.PI * 2);
  }
  c.fill();
};
export const lines = (c: Ctx, col: string, w: number, segs: number[][]) => {
  c.strokeStyle = col;
  c.lineWidth = weight(w, LINE.detail, LINE.accent);
  c.beginPath();
  for (const s of segs) {
    c.moveTo(s[0], s[1]);
    for (let i = 2; i < s.length; i += 2) c.lineTo(s[i], s[i + 1]);
  }
  c.stroke();
};
/** Planks across a rectangle (a floor or a wall). */
export function planksIn(c: Ctx, x: number, y: number, w: number, h: number, step = 10) {
  const segs: number[][] = [];
  for (let yy = y + step; yy < y + h; yy += step) segs.push([x, yy, x + w, yy]);
  lines(c, 'rgba(0,0,0,0.3)', 1, segs);
}
export const wheel = (c: Ctx, x: number, y: number, r: number) => {
  fillPath(c, '#3a2614', () => c.arc(x, y, r, 0, Math.PI * 2), 2);
  fillPath(c, '#6a4428', () => c.arc(x, y, r - 5, 0, Math.PI * 2), 1.5);
  lines(c, '#3a2614', 3, Array.from({ length: 8 }, (_, i) => [x, y, x + Math.cos((i / 8) * Math.PI * 2) * (r - 5), y + Math.sin((i / 8) * Math.PI * 2) * (r - 5)]));
  fillPath(c, COL.brass, () => c.arc(x, y, 5, 0, Math.PI * 2), 1.5);
};
/** A standing brass shell, base at `y`. */
export const shell = (c: Ctx, x: number, y: number, h: number, w = 14) => {
  fillPath(c, grad(c, x - w / 2, 0, x + w / 2, 0, [[0, COL.brassLo], [0.45, COL.brassHi], [1, COL.brassLo]]), () => c.roundRect(x - w / 2, y - h * 0.62, w, h * 0.62, 2), 1.5);
  fillPath(c, grad(c, x - w / 2, 0, x + w / 2, 0, [[0, '#5a5a60'], [0.45, '#b0b0b8'], [1, '#4a4a50']]), () => {
    c.moveTo(x - w / 2, y - h * 0.62);
    c.lineTo(x - w / 2, y - h * 0.78);
    c.quadraticCurveTo(x - w / 2, y - h, x, y - h);
    c.quadraticCurveTo(x + w / 2, y - h, x + w / 2, y - h * 0.78);
    c.lineTo(x + w / 2, y - h * 0.62);
    c.closePath();
  }, 1.5);
  fillPath(c, COL.copper, () => c.rect(x - w / 2, y - h * 0.66, w, 4), 0);
};
export const gauge = (c: Ctx, x: number, y: number, r: number, a = -0.6) => {
  fillPath(c, COL.brass, () => c.arc(x, y, r, 0, Math.PI * 2), 2);
  fillPath(c, '#efe6d0', () => c.arc(x, y, r - 3, 0, Math.PI * 2), 0);
  c.strokeStyle = COL.red;
  c.lineWidth = 3;
  c.beginPath();
  c.arc(x, y, r - 5, -0.4, 0.3);
  c.stroke();
  lines(c, COL.soot, 1.8, [[x, y, x + Math.cos(a) * (r - 4), y + Math.sin(a) * (r - 4)]]);
};
/** A lit window with curtains (and a flower box under it). */
export function cottageWindow(c: Ctx, x: number, y: number) {
  fillPath(c, radial(c, x + 16, y + 16, 26, [[0, '#fff0c0'], [1, '#e09a40']]), () => c.rect(x, y, 32, 34), 2);
  lines(c, COL.soot, 2, [[x + 16, y, x + 16, y + 34], [x, y + 17, x + 32, y + 17]]);
  fillPath(c, '#c87a9a', () => { c.moveTo(x, y); c.lineTo(x + 12, y); c.quadraticCurveTo(x + 4, y + 14, x + 6, y + 30); c.lineTo(x, y + 30); c.closePath(); }, 1);
  fillPath(c, '#c87a9a', () => { c.moveTo(x + 32, y); c.lineTo(x + 20, y); c.quadraticCurveTo(x + 28, y + 14, x + 26, y + 30); c.lineTo(x + 32, y + 30); c.closePath(); }, 1);
  fillPath(c, '#5a3a20', () => c.rect(x - 3, y + 34, 38, 9), 1.5);
  ['#e04a5a', '#f0d040', '#e88ac0', '#ffffff'].forEach((col, k) => fillPath(c, col, () => c.arc(x + 4 + k * 9, y + 32, 3.5, 0, Math.PI * 2), 0.8));
}
