// The gatherer siphoning: an 8-frame pump cycle cut from its painting, then the Brushed flat pass.
// node games/proto-ld60-machinerra/tools/gatherer-gather.cjs  -> art/crew/gatherer-gather-<i>.png and the still art/crew/gatherer.png
// (made here, not by brushed-flat.cjs, so the still and the frames share one palette and do not flicker between them).
// Its forearm is the suction tube and the glass hose runs from its wrist to the nozzle on the ground: the arm and hose
// sweep the nozzle across the seep like a vacuum (pivoting at the shoulder; what they covered is filled in from around it),
// slugs of crude ride up the hose, and the core flares green as each one arrives. Coordinates are source px of
// art-src/crew/gatherer.png (602x849).
const sharp = require('sharp');
const { img, draw, smooth, affine, fromSharp, toSharp } = require('./communicator-walk.cjs');
const { restyle, finish, palette } = require('./style.cjs');
const ROOT = __dirname + '/../';
const N = 8;
const H = 48; // on-screen height, as `crew/gatherer` (brushed-flat.cjs, sizes.json)
const PAD = 40; // room for the sweep
const SHOULDER = [100, 340];
const SWEEP = 0.16; // radians either way
// The arm (the suction tube) as a polygon, and the glass hose's centreline from the nozzle up to the wrist; the core.
const ARM = [[0, 345], [100, 325], [160, 410], [245, 505], [250, 585], [150, 590], [0, 470]];
const HOSE = [[330, 810], [318, 770], [305, 720], [290, 665], [270, 615], [240, 575], [205, 545], [175, 525]];
const HOSE_R = 24;
const CORE = [312, 340];

const inPoly = (x, y, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const segDist = (x, y, [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};
/** 1 on the arm and hose (unpadded source px), 0 elsewhere, soft at the edge. */
function pieceMask(x, y) {
  if (inPoly(x, y, ARM)) return 1;
  let d = Infinity;
  for (let i = 0; i < HOSE.length - 1; i++) d = Math.min(d, segDist(x, y, HOSE[i], HOSE[i + 1]));
  return 1 - smooth(HOSE_R - 3, HOSE_R + 1, d);
}

/** The painting without the arm and hose: their pixels filled by diffusion from around them (behind them is wheel, leg, air). */
function withoutPiece(src) {
  const o = img(src.w, src.h);
  o.d.set(src.d);
  const holes = [];
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) if (pieceMask(x - PAD, y) > 0.2) holes.push(y * src.w + x);
  const known = new Uint8Array(src.w * src.h).fill(1);
  for (const i of holes) {
    known[i] = 0;
    o.d[i * 4 + 3] = 0;
  }
  // Grow inward: each pass, a hole pixel with known neighbours takes their premultiplied mean.
  let left = holes;
  for (let pass = 0; pass < 400 && left.length; pass++) {
    const next = [], done = [];
    for (const i of left) {
      const x = i % src.w, y = (i / src.w) | 0;
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= src.w || yy >= src.h) continue;
        const j = yy * src.w + xx;
        if (!known[j]) continue;
        const aj = o.d[j * 4 + 3];
        r += o.d[j * 4] * aj; g += o.d[j * 4 + 1] * aj; b += o.d[j * 4 + 2] * aj; a += aj; n++;
      }
      if (!n) next.push(i);
      else done.push([i, r, g, b, a, n]);
    }
    for (const [i, r, g, b, a, n] of done) {
      o.d[i * 4 + 3] = a / n;
      if (a > 0) { o.d[i * 4] = r / a; o.d[i * 4 + 1] = g / a; o.d[i * 4 + 2] = b / a; }
      known[i] = 1;
    }
    left = next;
  }
  for (const i of holes) if (o.d[i * 4 + 3] < 0.5) o.d[i * 4 + 3] = 0; // air stays air
  return o;
}

function along(t) {
  const seg = t * (HOSE.length - 1), i = Math.min(HOSE.length - 2, Math.floor(seg)), f = seg - i;
  return [HOSE[i][0] + (HOSE[i + 1][0] - HOSE[i][0]) * f, HOSE[i][1] + (HOSE[i + 1][1] - HOSE[i][1]) * f];
}

function frame(src, base, p) {
  const t = p * Math.PI * 2;
  const ang = SWEEP * Math.sin(t);
  const o = img(src.w, src.h);
  o.d.set(base.d);
  const P = PAD, [px, py] = SHOULDER;
  draw(o, src, affine(px + P, py, ang, 1, 1), (sx, sy) => pieceMask(sx - P, sy));
  const turn = ([x, y]) => {
    const dx = x - px, dy = y - py, c = Math.cos(ang), s = Math.sin(ang);
    return [px + P + dx * c - dy * s, py + dx * s + dy * c];
  };
  // Crude in the hose: three slugs climbing from the nozzle to the wrist.
  for (let k = 0; k < 3; k++) {
    const [x, y] = turn(along((p * 2 + k / 3) % 1));
    blob(o, x, y, 13, [24, 16, 10], 0.95);
  }
  // The core flares as each slug arrives (twice a sweep).
  const flare = Math.max(0, Math.cos(2 * t - Math.PI * 1.7)) ** 3;
  glow(o, CORE[0] + P, CORE[1], 70, [120, 255, 170], 0.25 + 0.75 * flare);
  return o;
}

/** A dark slug of crude, only where the hose (or anything) is drawn. */
function blob(m, cx, cy, r, c, a) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
    const i = (y * m.w + x) * 4, k = (1 - smooth(r * 0.6, r, Math.hypot(x - cx, y - cy))) * a * Math.min(1, m.d[i + 3] * 1.5);
    for (let q = 0; q < 3; q++) m.d[i + q] += (c[q] - m.d[i + q]) * k;
  }
}
/** An additive glow on what is drawn. */
function glow(m, cx, cy, r, c, a) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
    const i = (y * m.w + x) * 4, k = (1 - smooth(0, r, Math.hypot(x - cx, y - cy))) ** 2 * a * m.d[i + 3];
    for (let q = 0; q < 3; q++) m.d[i + q] = Math.min(255, m.d[i + q] + c[q] * k);
  }
}

(async () => {
  const raw = await fromSharp(sharp(`${ROOT}art-src/crew/gatherer.png`).ensureAlpha().extend({ left: PAD, right: PAD, background: { r: 0, g: 0, b: 0, alpha: 0 } }));
  const base = withoutPiece(raw);
  const frames = [];
  for (let i = 0; i < N; i++) frames.push(await restyle(frame(raw, base, i / N), H)); // the house style (style.cjs)
  const still = await restyle(raw, H);
  const C = palette([still, ...frames], 24);
  finish(still, C);
  await (await toSharp(still)).png().toFile(`${ROOT}art/crew/gatherer.png`);
  for (let i = 0; i < N; i++) {
    finish(frames[i], C);
    await (await toSharp(frames[i])).png().toFile(`${ROOT}art/crew/gatherer-gather-${i}.png`);
  }
  console.log('gatherer-gather', N, 'frames', frames[0].w, 'x', frames[0].h);
})();
