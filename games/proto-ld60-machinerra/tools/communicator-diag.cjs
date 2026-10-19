// The Communicator's two diagonal views (front-side and back-side, facing right; the game flips them for left), built from
// the same painted sources as the walk by tools/communicator-walk.cjs (which calls `diag()`): no new painting.
// Cut-out turn: the whole walking front (or back) figure, legs included, squeezed about its centre and shifted so the body looks
// turned, the head turned a little more, each leg's foot swung along the walk (the legs are the figure's own, so the outline and
// the hips match: no seam to join), and the backpack's side face from the side view, shaded, behind the body. Run alone for a
// preview of the views:  node tools/communicator-diag.cjs [outDir]  -> <outDir>/diag-preview.png
const W = require('./communicator-walk.cjs');
const { img, draw, smooth, halo } = W;

const P = W.PAD;
const X0 = 76.5 + P; // the front and back views' centre column
// Per view: body squeeze `k` and shift `dx` (output px), the head's extra shift `head` above row `headRow`, the feet's swing
// `shear` (px, along the walk), and the pack's side face: source columns `pk` and rows `pr` of the side view, its squeeze
// `pks`, where it starts in the output (`pkx`, from the centre column), its shade `shade` and the shade's slope across it `lit`
// (the part nearest the body is darkest: it is in the body's shadow).
const CFG = {
  front: { k: 0.8, dx: 4, head: 4, headRow: 100, shear: { d: 13, in: 3 }, pk: [20, 66], pr: [92, 182], pks: 0.8, pkx: -52, shade: 0.86, lit: 0.1 },
  back: { k: 0.8, dx: -8, head: 4, headRow: 100, shear: { d: 13, in: 3 }, arm: [108, 19], pk: [20, 67], pr: [88, 184], pks: 0.8, pkx: 5, shade: 0.84, lit: 0.1 },
};

/** The pack's side face (from the side view `sideF`), squeezed, shaded: the face the body turns away from the light. */
function packFace(c, sideF) {
  const L = img(sideF.w, sideF.h), [a, b] = c.pk, [r0, r1] = c.pr, x0 = X0 + c.pkx, wd = (b - a) * c.pks;
  draw(L, sideF, (x, y) => [a + P + (x - x0) / c.pks, y], (sx, sy) =>
    smooth(a + P - 1, a + P + 2, sx) * (1 - smooth(b + P - 3, b + P, sx)) * smooth(r0 - 3, r0 + 3, sy) * (1 - smooth(r1 - 10, r1, sy)));
  for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
    const i = (y * L.w + x) * 4;
    if (L.d[i + 3] <= 0) continue;
    const f = Math.min(1, Math.max(0, (x - x0) / wd)), m = c.shade + c.lit * (f - 0.5);
    for (let k = 0; k < 3; k++) L.d[i + k] *= m;
  }
  return L;
}

/**
 * One diagonal frame (`kind` 'front' or 'back'): `src` the padded near view, `sideF` the side view's walk frame at the same
 * phase `p` (0..1, for the pack's bob).
 */
function diag(kind, src, sideF, p) {
  const c = CFG[kind], o = img(sideF.w, sideF.h);
  draw(o, packFace(c, sideF), (x, y) => [x, y]);
  const fig = W.RIG.front(src, p, kind === 'back', c.shear);
  const shift = (y) => c.dx + c.head * (1 - smooth(c.headRow - 30, c.headRow + 10, y));
  if (!c.arm) { draw(o, fig, (x, y) => [X0 + (x - X0 - shift(y)) / c.k, y]); return o; }
  // the arm on the pack's side is pushed out, so the pack's side face shows between it and the body
  const [ax, push] = c.arm, cut = (sy) => ax + P + 14 * smooth(150, 185, sy); // the arm's inner edge slants out toward the hand, clear of the lantern
  const armMask = (sx, sy) => smooth(cut(sy) - 3, cut(sy) + 3, sx) * smooth(78, 88, sy) * (1 - smooth(212, 222, sy));
  draw(o, fig, (x, y) => [X0 + (x - X0 - shift(y)) / c.k, y], (sx, sy) => 1 - armMask(sx, sy));
  draw(o, fig, (x, y) => [X0 + (x - X0 - shift(y) - push) / c.k, y], armMask);
  return o;
}

module.exports = { diag, CFG };

if (require.main === module) {
  const sharp = require('sharp');
  const out = (process.argv[2] ?? require('os').tmpdir() + '/communicator-diag') + '/';
  require('fs').mkdirSync(out, { recursive: true });
  (async () => {
    const raw = {};
    for (const v of ['side', 'front', 'back']) raw[v] = W.pad(await W.load(W.SRC + v + '.png'), P);
    const ph = [0, 2, 4, 6];
    const side = ph.map((i) => W.RIG.side(raw.side, i / W.N));
    const rows = ['frontside', 'backside'];
    const fw = raw.side.w, fh = raw.side.h, cols = ph.length;
    const sheet = img(fw * cols, fh * rows.length);
    for (let r = 0; r < rows.length; r++) for (let i = 0; i < cols; i++) {
      const v = rows[r];
      let m = diag(v === 'frontside' ? 'front' : 'back', raw[v === 'frontside' ? 'front' : 'back'], side[i], ph[i] / W.N);
      m = halo(m, 6);
      for (let y = 0; y < fh; y++) sheet.d.set(m.d.subarray(y * fw * 4, (y + 1) * fw * 4), ((r * fh + y) * sheet.w + i * fw) * 4);
    }
    const buf = Buffer.alloc(sheet.w * sheet.h * 4); // on a mid grey so the soot outline shows
    for (let i = 0; i < sheet.d.length; i += 4) { const al = sheet.d[i + 3]; for (let k = 0; k < 3; k++) buf[i + k] = Math.round(sheet.d[i + k] * al + 110 * (1 - al)); buf[i + 3] = 255; }
    await sharp(buf, { raw: { width: sheet.w, height: sheet.h, channels: 4 } }).png().toFile(out + 'diag-preview.png');
    console.log('wrote', out + 'diag-preview.png');
  })();
}
