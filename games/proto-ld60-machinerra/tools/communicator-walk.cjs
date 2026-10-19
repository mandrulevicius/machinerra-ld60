// Communicator walk cycles (cut-out animation of the painted views) and three detail-reduction passes.
// node games/proto-ld60-machinerra/tools/communicator-walk.cjs [outDir]  -> <outDir>/<pass>/<view>-<i>.png, <outDir>/sheet-<pass>.png
// The game uses pass p1 (Brushed flat): copy <outDir>/p1/*.png into art/communicator/. Sources: art-src/communicator/ (the
// sheet's views with a baked soot outline, which load() strips). p0 painted as is, p2 flat shapes, p3 pixel art: alternatives.
const sharp = require('sharp');
const fs = require('fs');
const SRC = __dirname + '/../art-src/communicator/';
const OUT = (process.argv[2] ?? require('os').tmpdir() + '/communicator-walk') + '/';
const N = 8; // frames per cycle
const PAD = 26; // side padding at source res (legs swing out)
const HALO = [29, 26, 23];

// ---------- image helpers (float RGBA, straight alpha 0..1) ----------
const img = (w, h) => ({ w, h, d: new Float32Array(w * h * 4) });
async function load(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const m = img(info.width, info.height);
  for (let i = 0; i < data.length; i += 4) {
    const halo = data[i] === HALO[0] && data[i + 1] === HALO[1] && data[i + 2] === HALO[2];
    m.d[i] = data[i]; m.d[i + 1] = data[i + 1]; m.d[i + 2] = data[i + 2]; m.d[i + 3] = halo ? 0 : data[i + 3] / 255;
  }
  return m;
}
function pad(m, p) {
  const o = img(m.w + 2 * p, m.h);
  for (let y = 0; y < m.h; y++) o.d.set(m.d.subarray(y * m.w * 4, (y + 1) * m.w * 4), (y * o.w + p) * 4);
  return o;
}
function sample(m, x, y) { // bilinear, premultiplied
  x -= 0.5; y -= 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const r = [0, 0, 0, 0];
  for (const [xx, yy, w] of [[x0, y0, (1 - fx) * (1 - fy)], [x0 + 1, y0, fx * (1 - fy)], [x0, y0 + 1, (1 - fx) * fy], [x0 + 1, y0 + 1, fx * fy]]) {
    if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h || w === 0) continue;
    const i = (yy * m.w + xx) * 4, a = m.d[i + 3] * w;
    r[0] += m.d[i] * a; r[1] += m.d[i + 1] * a; r[2] += m.d[i + 2] * a; r[3] += a;
  }
  return r;
}
/** Draw `src` onto `dst` through an inverse map (dst xy -> src xy), masked by `mask(sx, sy)` 0..1, tinted by `mul`. */
function draw(dst, src, inv, mask = () => 1, mul = 1) {
  for (let y = 0; y < dst.h; y++) for (let x = 0; x < dst.w; x++) {
    const [sx, sy] = inv(x + 0.5, y + 0.5);
    if (sx < -1 || sy < -1 || sx > src.w + 1 || sy > src.h + 1) continue;
    const k = mask(sx, sy);
    if (k <= 0) continue;
    const s = sample(src, sx, sy), a = s[3] * k;
    if (a <= 0.001) continue;
    const i = (y * dst.w + x) * 4, da = dst.d[i + 3], oa = a + da * (1 - a);
    for (let c = 0; c < 3; c++) dst.d[i + c] = ((s[c] / s[3]) * mul * a + dst.d[i + c] * da * (1 - a)) / oa;
    dst.d[i + 3] = oa;
  }
}
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The soot outline the painted views carry: dilate the alpha by r, put it underneath. */
function halo(m, r) {
  const o = img(m.w, m.h);
  const K = [];
  for (let dy = -r - 1; dy <= r + 1; dy++) for (let dx = -r - 1; dx <= r + 1; dx++) { const w = 1 - smooth(r - 0.5, r + 1, Math.hypot(dx, dy)); if (w > 0) K.push([dx, dy, w]); }
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    let best = m.d[(y * m.w + x) * 4 + 3] > 0.99 ? 1 : 0;
    for (const [dx, dy, w] of K) {
      if (best >= 1) break;
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
      const a = m.d[(yy * m.w + xx) * 4 + 3];
      if (a < 0.05) continue;
      best = Math.max(best, Math.min(a * 2, 1) * w);
    }
    const i = (y * m.w + x) * 4;
    o.d[i] = HALO[0]; o.d[i + 1] = HALO[1]; o.d[i + 2] = HALO[2]; o.d[i + 3] = best;
  }
  draw(o, m, (x, y) => [x, y]);
  return o;
}
const affine = (cx, cy, ang, sx, sy, tx = 0, ty = 0) => (x, y) => {
  // forward: p' = c + t + R(ang) * S * (p - c); inverse below
  const dx = x - cx - tx, dy = y - cy - ty, co = Math.cos(-ang), si = Math.sin(-ang);
  return [cx + (dx * co - dy * si) / sx, cy + (dx * si + dy * co) / sy];
};

// ---------- the rigs (source px of the 153x329 views, before padding) ----------
const P = PAD;
const RIG = {
  side: (src, p) => {
    const t = p * Math.PI * 2, A = 0.42; // leg swing, rad
    const bob = 3.2 * Math.cos(2 * t); // + is down: lowest on contact
    const hip = [80 + P, 206], cut = 226;
    const near = A * Math.sin(t), far = -near;
    const liftN = Math.max(0, Math.cos(t)) ** 1.4, liftF = Math.max(0, -Math.cos(t)) ** 1.4;
    const o = img(src.w, src.h);
    const legMask = (sx, sy) => smooth(cut - 10, cut - 4, sy);
    const leg = (ang, lift, mul) => {
      const len = (116 - bob) / 116 / Math.cos(ang) - 0.13 * lift; // the hip rides the bob; stretched so the foot reaches the ground at the extremes, shortened while it swings
      draw(o, src, affine(hip[0], hip[1], -ang, 1, len, 0, bob), legMask, mul);
    };
    leg(far, liftF, 0.55);
    leg(near, liftN, 1);
    const arm = 0.12 * Math.sin(t + Math.PI); // the near arm swings against the near leg
    draw(o, src, (x, y) => [x, y - bob], (sx, sy) => (1 - smooth(cut - 3, cut + 3, sy)) * (sx > 100 + P && sy > 150 && sy < 214 ? 0 : 1));
    draw(o, src, affine(97 + P, 158, -arm, 1, 1, 0, bob), (sx, sy) => (sx > 100 + P && sy > 150 && sy < 214 ? 1 : 0));
    return o;
  },
  // Front and back: a stepping leg lifts its whole shin and boot (the thigh folds), the planted one carries the weight; the
  // body bobs and sways over the planted foot and the arms swing against the legs. Big enough to read at 74 px.
  // `shear` (the diagonal views, communicator-diag.cjs): `{ d, in }` px a foot swings along the walk (the stepping leg ahead, the other
  // behind) and px both feet are drawn in toward the centre.
  front: (src, p, back, shear = null) => {
    const t = p * Math.PI * 2, s = Math.sin(t);
    const bob = 5 * Math.cos(2 * t); // + is down: lowest on contact (both feet down)
    const liftL = Math.max(0, s) ** 1.2, liftR = Math.max(0, -s) ** 1.2;
    const sway = 3 * s * (back ? 1 : -1); // weight over the planted foot (the image's left leg is the robot's right in front)
    const cut = 222, knee = 268, mid = 76.5 + P, foot = 322, LIFT = 30;
    const o = img(src.w, src.h);
    const leg = (side, lift) => {
      const L = LIFT * lift, top = cut + bob, kneeD = knee - L; // both legs hang from the hip, which rides the bob
      const inv = (x, y) => {
        // the hip goes with the body's sway; the planted foot stays put, a lifted one follows the hip halfway
        const k = Math.min(1, Math.max(0, (y - top) / (kneeD - top)));
        const sx = x - sway * (1 - k * (0.8 - 0.4 * lift)) - (shear ? (shear.d * Math.cos(t) * (side < 0 ? -1 : 1) + shear.in * (side < 0 ? 1 : -1)) * k : 0);
        if (y < kneeD) return [sx, cut + ((y - top) / (kneeD - top)) * (knee - cut)]; // thigh, folded or loaded
        return [sx, y + L]; // shin and boot, lifted whole
      };
      const mask = (sx, sy) => smooth(cut - 8, cut - 2, sy) * (side < 0 ? 1 - smooth(mid - 1, mid + 1, sx) : smooth(mid - 1, mid + 1, sx));
      draw(o, src, inv, mask);
    };
    // the lifted leg is drawn last: it comes forward
    if (liftL > liftR) { leg(1, liftR); leg(-1, liftL); } else { leg(-1, liftL); leg(1, liftR); }
    const armL = 36 + P, armR = 117 + P;
    const isArm = (sx, sy) => (1 - smooth(cut - 6, cut, sy)) * smooth(105, 118, sy) * Math.max(1 - smooth(armL - 4, armL + 2, sx), smooth(armR - 2, armR + 4, sx));
    draw(o, src, (x, y) => [x - sway, y - bob], (sx, sy) => (1 - smooth(cut - 3, cut + 3, sy)) * (1 - isArm(sx, sy)));
    // arms: the one opposite the stepping leg swings forward (rises), the other back (drops a little)
    const swingL = -7 * liftR + 3 * liftL, swingR = -7 * liftL + 3 * liftR;
    draw(o, src, (x, y) => [x - sway, y - bob - (x < mid ? swingL : swingR)], (sx, sy) => isArm(sx, sy));
    return o;
  },
};
RIG.back = (src, p) => RIG.front(src, p, true);

// Taking a knee to siphon (side view): the near leg steps forward (thigh level, shin upright, foot planted), the far leg
// kneels (knee on the sand, shin back), the body sinks and leans in, which brings the near hand down to the sand to hold
// the hose (Play draws the hose from the backpack, through the hand, into the seep; `HAND`, `PACK` are its anchors). `kneel-<i>` goes down, `siphon-<i>` loops there.
const KNEE = { hip: [80, 206], knee: 250, thigh: 44, cut: 226, down: [72, 252], lean: 0.14, hand: [116, 192], pack: [30, 112] };
const deg = (d) => (d * Math.PI) / 180;
/** Source px (unpadded) of a point on the body after the kneel at `k`, with a bob: for Play's hose anchors. */
function kneelBody(k, bob, [x, y]) {
  const K = KNEE, hx = K.hip[0] + (K.down[0] - K.hip[0]) * k, hy = K.hip[1] + (K.down[1] - K.hip[1]) * k + bob, a = K.lean * k;
  const dx = x - K.hip[0], dy = y - K.hip[1];
  return [hx + dx * Math.cos(a) - dy * Math.sin(a), hy + dx * Math.sin(a) + dy * Math.cos(a)];
}
function kneelPose(src, k, bob = 0) {
  const K = KNEE, o = img(src.w, src.h);
  const hip = [K.hip[0] + P, K.hip[1]];
  const nh = [K.hip[0] + (K.down[0] - K.hip[0]) * k + P, K.hip[1] + (K.down[1] - K.hip[1]) * k + bob];
  const thighMask = (sx, sy) => smooth(K.cut - 22, K.cut - 16, sy) * (1 - smooth(K.knee - 3, K.knee + 3, sy));
  const shinMask = (sx, sy) => smooth(K.knee - 4, K.knee + 2, sy);
  const leg = (phi, psi, mul) => {
    // a segment pointing at screen angle phi (0 right, 90 down) is the source's downward one turned by phi - 90
    draw(o, src, affine(hip[0], hip[1], deg(phi - 90), 1, 1, nh[0] - hip[0], nh[1] - hip[1]), thighMask, mul);
    const kx = nh[0] + K.thigh * Math.cos(deg(phi)), ky = nh[1] + K.thigh * Math.sin(deg(phi));
    draw(o, src, affine(hip[0], K.knee, deg(psi - 90), 1, 1, kx - hip[0], ky - K.knee), shinMask, mul);
  };
  leg(90 + 12 * k, 90 + 78 * k, 0.55); // the far leg kneels
  // The body sinks with the hip and leans in over the knee.
  draw(o, src, affine(hip[0], hip[1], K.lean * k, 1, 1, nh[0] - hip[0], nh[1] - hip[1]), (sx, sy) => 1 - smooth(K.cut - 22, K.cut - 14, sy));
  leg(90 - 90 * k, 90, 1); // the near leg steps forward
  return o;
}
const ease = (x) => 1 - (1 - x) ** 2;
RIG.kneel = (src, p) => kneelPose(src, ease((p * N + 1) / N));
RIG.siphon = (src, p) => {
  const t = p * Math.PI * 2;
  return kneelPose(src, 1, 1.5 * (1 - Math.cos(t))); // a slow breath of a pump
};

// ---------- detail passes (on the 2x game texture, 148 px tall) ----------
const H2 = 148;
async function toSharp(m) {
  const b = Buffer.alloc(m.w * m.h * 4);
  for (let i = 0; i < m.d.length; i += 4) { for (let c = 0; c < 3; c++) b[i + c] = Math.max(0, Math.min(255, Math.round(m.d[i + c]))); b[i + 3] = Math.round(Math.max(0, Math.min(1, m.d[i + 3])) * 255); }
  return sharp(b, { raw: { width: m.w, height: m.h, channels: 4 } });
}
async function fromSharp(s) {
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  const m = img(info.width, info.height);
  for (let i = 0; i < data.length; i += 4) { m.d[i] = data[i]; m.d[i + 1] = data[i + 1]; m.d[i + 2] = data[i + 2]; m.d[i + 3] = data[i + 3] / 255; }
  return m;
}
const resize = async (m, h) => fromSharp((await toSharp(m)).resize({ height: h, kernel: 'lanczos3' }));
/** Kuwahara: each pixel takes the mean of its calmest quadrant; flattens texture, keeps edges. */
function kuwahara(m, r) {
  const o = img(m.w, m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = (y * m.w + x) * 4;
    o.d[i + 3] = m.d[i + 3];
    if (m.d[i + 3] < 0.02) { o.d[i] = m.d[i]; o.d[i + 1] = m.d[i + 1]; o.d[i + 2] = m.d[i + 2]; continue; }
    let best = Infinity, bm = null;
    for (const [qx, qy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      let n = 0, s = [0, 0, 0], s2 = 0;
      for (let dy = 0; dy <= r; dy++) for (let dx = 0; dx <= r; dx++) {
        const xx = x + dx * qx, yy = y + dy * qy;
        if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
        const j = (yy * m.w + xx) * 4;
        if (m.d[j + 3] < 0.5) continue;
        const l = m.d[j] * 0.3 + m.d[j + 1] * 0.59 + m.d[j + 2] * 0.11;
        s[0] += m.d[j]; s[1] += m.d[j + 1]; s[2] += m.d[j + 2]; s2 += l * l; n++;
      }
      if (n < 2) continue;
      const mean = s.map((v) => v / n), ml = mean[0] * 0.3 + mean[1] * 0.59 + mean[2] * 0.11, v = s2 / n - ml * ml;
      if (v < best) { best = v; bm = mean; }
    }
    const c = bm || [m.d[i], m.d[i + 1], m.d[i + 2]];
    o.d[i] = c[0]; o.d[i + 1] = c[1]; o.d[i + 2] = c[2];
  }
  return o;
}
// palette: k-means in a rough perceptual space, the brightest glow pinned so eyes and lanterns survive
// value counts double: the browns split into light and dark rather than into hues (camouflage)
const lin = (c) => { const l = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11; return [l * 2, c[0] - l, c[2] - l]; };
const dist = (a, b) => { const p = lin(a), q = lin(b); return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; };
function palette(ms, k, pins = null) {
  const px = [];
  for (const m of ms) for (let i = 0; i < m.d.length; i += 4) if (m.d[i + 3] > 0.5) px.push([m.d[i], m.d[i + 1], m.d[i + 2]]);
  let rnd = 12345; const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const glow = px.reduce((b, c) => (c[0] + c[1] > b[0] + b[1] ? c : b));
  const C = pins ? pins.map((c) => c.slice()) : [glow.slice()];
  const fixed = C.length;
  k += pins ? pins.length : 0;
  while (C.length < k) { // k-means++
    const d = px.map((p) => Math.min(...C.map((c) => dist(p, c))));
    let r = rand() * d.reduce((a, b) => a + b), j = 0;
    while ((r -= d[j]) > 0) j++;
    C.push(px[j].slice());
  }
  for (let it = 0; it < 14; it++) {
    const s = C.map(() => [0, 0, 0, 0]);
    for (const p of px) { let bi = 0, bd = Infinity; C.forEach((c, i) => { const d = dist(p, c); if (d < bd) { bd = d; bi = i; } }); s[bi][0] += p[0]; s[bi][1] += p[1]; s[bi][2] += p[2]; s[bi][3]++; }
    s.forEach((v, i) => { if (i >= fixed && v[3]) C[i] = [v[0] / v[3], v[1] / v[3], v[2] / v[3]]; });
  }
  C.pinned = !!pins; // with pins, the glows only come from glows(), never from a lit brown
  return C;
}
function quantize(m, C, hard) {
  const idx = new Int16Array(m.w * m.h).fill(-1);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const i = (y * m.w + x) * 4;
    if (m.d[i + 3] < (hard ? 0.5 : 0.02)) { m.d[i + 3] = 0; continue; }
    let bi = 0, bd = Infinity;
    C.forEach((c, j) => { if (j < 2 && C.pinned) return; const d = dist([m.d[i], m.d[i + 1], m.d[i + 2]], c); if (d < bd) { bd = d; bi = j; } });
    idx[y * m.w + x] = bi;
    m.d[i] = C[bi][0]; m.d[i + 1] = C[bi][1]; m.d[i + 2] = C[bi][2];
    if (hard) m.d[i + 3] = 1;
  }
  return idx;
}
/** Majority filter on palette indices: speckle goes, the glow (index 0) stays. */
function majority(m, idx, C, passes, keep = 1) {
  for (let p = 0; p < passes; p++) {
    const nx = idx.slice();
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const k = idx[y * m.w + x];
      if (k < keep) continue;
      const cnt = new Map();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h) continue;
        const j = idx[yy * m.w + xx];
        if (j < 0) continue;
        cnt.set(j, (cnt.get(j) || 0) + (dx || dy ? 1 : 1.5));
      }
      let bj = k, bc = 0;
      for (const [j, c] of cnt) if (c > bc) { bc = c; bj = j; }
      nx[y * m.w + x] = bj;
    }
    idx.set(nx);
  }
  for (let i = 0; i < idx.length; i++) if (idx[i] >= 0) { const c = C[idx[i]]; m.d[i * 4] = c[0]; m.d[i * 4 + 1] = c[1]; m.d[i * 4 + 2] = c[2]; }
}
/** The character's accents, never merged into the browns: eye/lantern glow (hot, warm), the red scarf, the blue cloth. */
const PINS = [[250, 236, 165], [228, 140, 30], [140, 52, 38], [70, 84, 104]];
const isGlow = (d, i) => d[i + 3] > 0.5 && d[i] > 200 && d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 > 140;
/** Glows the flattening smeared away come back from the unflattened image. */
function glows(m, idx, b, C) {
  for (let p = 0; p < idx.length; p++) {
    const i = p * 4;
    if (!isGlow(b.d, i) || m.d[i + 3] < 0.5) continue;
    const hot = b.d[i + 1] > 190;
    idx[p] = hot ? 0 : 1; const c = C[idx[p]]; m.d[i] = c[0]; m.d[i + 1] = c[1]; m.d[i + 2] = c[2];
  }
}
/** Half size, but a glow anywhere in a 2x2 block survives. */
function maxGlow(b) {
  const o = img(b.w >> 1, b.h >> 1);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    let best = -1;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const j = ((y * 2 + dy) * b.w + x * 2 + dx) * 4; if (isGlow(b.d, j) && (best < 0 || b.d[j + 1] > b.d[best + 1])) best = j; }
    if (best >= 0) o.d.set(b.d.subarray(best, best + 4), (y * o.w + x) * 4);
  }
  return o;
}
/** More saturation and value contrast before the palette, so the browns separate instead of going to mud. */
function punch(m) {
  const o = img(m.w, m.h); o.d.set(m.d);
  for (let i = 0; i < o.d.length; i += 4) {
    const l = o.d[i] * 0.3 + o.d[i + 1] * 0.59 + o.d[i + 2] * 0.11, l2 = Math.max(0, (l - 70) * 1.35 + 70);
    for (let c = 0; c < 3; c++) o.d[i + c] = Math.max(0, Math.min(255, l2 + (o.d[i + c] - l) * 1.3));
  }
  return o;
}
function outline(m, w) {
  const a = m.d.filter((_, i) => i % 4 === 3);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (a[y * m.w + x] > 0.5) continue;
    let near = false;
    for (let dy = -w; dy <= w && !near; dy++) for (let dx = -w; dx <= w; dx++) {
      if (Math.abs(dx) + Math.abs(dy) > w) continue;
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < m.w && yy < m.h && a[yy * m.w + xx] > 0.5) { near = true; break; }
    }
    if (near) { const i = (y * m.w + x) * 4; m.d[i] = HALO[0]; m.d[i + 1] = HALO[1]; m.d[i + 2] = HALO[2]; m.d[i + 3] = 1; }
  }
}
function nearestUp(m, s) {
  const o = img(m.w * s, m.h * s);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) o.d.set(m.d.subarray((((y / s) | 0) * m.w + ((x / s) | 0)) * 4, (((y / s) | 0) * m.w + ((x / s) | 0)) * 4 + 4), (y * o.w + x) * 4);
  return o;
}

const main = async () => {
  const base = ['side', 'front', 'back', 'kneel', 'siphon'], DIAG = ['frontside', 'backside']; // the diagonals (tools/communicator-diag.cjs) go through the same passes but never into the palettes
  const views = [...base, ...DIAG];
  const raw = {};
  for (const v of ['side', 'front', 'back']) raw[v] = pad(await load(SRC + v + '.png'), PAD);
  raw.kneel = raw.siphon = raw.side;
  // frames at source res, no halo yet
  const frames = {};
  for (const v of base) frames[v] = Array.from({ length: N }, (_, i) => RIG[v](raw[v], i / N));
  const { diag } = require('./communicator-diag.cjs');
  frames.frontside = frames.front.map((_, i) => diag('front', raw.front, frames.side[i], i / N));
  frames.backside = frames.back.map((_, i) => diag('back', raw.back, frames.side[i], i / N));
  const passes = { p0: [], p1: [], p2: [], p3: [] };
  const all = [];
  for (const v of views) for (let i = 0; i < N; i++) all.push({ v, i, f: frames[v][i] });
  // p0: the current painted look (halo re-baked, scaled to the 2x texture)
  for (const a of all) a.p0 = await resize(halo(a.f, 6), H2);
  // p1: kuwahara at source res, then 24 colours with soft edges
  for (const a of all) a.k1 = await resize(kuwahara(a.f, 3), H2);
  const C1 = palette(all.filter((a) => a.i === 0 && ['side', 'front', 'back'].includes(a.v)).map((a) => a.k1), 24);
  for (const a of all) { a.p1 = img(a.k1.w, a.k1.h); a.p1.d.set(a.k1.d); quantize(a.p1, C1, false); }
  // p2: from p1's flattened image, stronger flattening, 12 colours, hard edges, clean 1px outline
  for (const a of all) a.k2 = kuwahara(kuwahara(a.k1, 2), 1);
  for (const a of all) a.b2 = await resize(a.f, H2); // the unflattened image, for the glows
  const C2 = palette(all.filter((a) => a.i === 0 && base.includes(a.v)).map((a) => punch(a.k2)), 7, PINS);
  for (const a of all) { a.p2 = punch(a.k2); const ix = quantize(a.p2, C2, true); glows(a.p2, ix, a.b2, C2); majority(a.p2, ix, C2, 2, PINS.length); outline(a.p2, 1); }
  // p3: pixel art at game size (74 px), 6 colours, 1px outline, doubled
  for (const a of all) { a.k3 = kuwahara(await resize(a.k2, H2 / 2), 1); a.b3 = maxGlow(a.b2); }
  const C3 = palette(all.filter((a) => a.i === 0 && base.includes(a.v)).map((a) => punch(a.k3)), 4, PINS);
  for (const a of all) { const m = punch(a.k3); const ix = quantize(m, C3, true); majority(m, ix, C3, 2, PINS.length); glows(m, ix, a.b3, C3); outline(m, 1); a.p3 = nearestUp(m, 2); }
  for (const p of Object.keys(passes)) {
    fs.mkdirSync(OUT + p, { recursive: true });
    for (const a of all) await (await toSharp(a[p])).png().toFile(`${OUT}${p}/${a.v}-${a.i}.png`);
    // a contact sheet: rows = views, cols = frames
    const fw = all[0][p].w, fh = all[0][p].h;
    const sheet = img(fw * N, fh * views.length);
    for (const a of all) for (let y = 0; y < fh; y++) sheet.d.set(a[p].d.subarray(y * fw * 4, (y + 1) * fw * 4), ((views.indexOf(a.v) * fh + y) * sheet.w + a.i * fw) * 4);
    await (await toSharp(sheet)).png().toFile(`${OUT}sheet-${p}.png`);
  }
  console.log('frame', all[0].p0.w, 'x', all[0].p0.h, 'palettes', C1.length, C2.length, C3.length);
};
if (require.main === module) main();
// The Brushed flat pass for other art (tools/brushed-flat.cjs) uses the same filters.
module.exports = { RIG, load, pad, PAD, N, SRC, KNEE, kneelBody, halo, outline, img, draw, smooth, affine, fromSharp, toSharp, resize, kuwahara, palette, quantize };
