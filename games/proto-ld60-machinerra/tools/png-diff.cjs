/**
 * Pixel diff of two sets of stills from render-shots.js: `node games/proto-ld60-machinerra/tools/png-diff.cjs before after`.
 * Prints, per view, the pixels that differ by more than a few levels and the biggest difference; writes <after>-<view>-diff.png
 * (red = difference x8) beside them.
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const dir = path.join(__dirname, '..', 'capture');
const [a, b] = process.argv.slice(2);

(async () => {
  const views = fs.readdirSync(dir).filter((f) => f.startsWith(`${a}-`) && f.endsWith('.png') && !f.endsWith('-diff.png')).map((f) => f.slice(a.length + 1, -4));
  for (const v of views) {
    const fa = path.join(dir, `${a}-${v}.png`), fb = path.join(dir, `${b}-${v}.png`);
    if (!fs.existsSync(fb)) {
      console.log(v, 'missing in', b);
      continue;
    }
    const A = await sharp(fa).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const B = await sharp(fb).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (A.info.width !== B.info.width || A.info.height !== B.info.height) {
      console.log(v, 'size differs');
      continue;
    }
    const out = Buffer.alloc(A.data.length);
    let n = 0, max = 0, sum = 0;
    for (let i = 0; i < A.data.length; i += 4) {
      const d = Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2]));
      if (d > 6) n++;
      max = Math.max(max, d);
      sum += d;
      out[i] = Math.min(255, d * 8);
      out[i + 3] = 255;
    }
    await sharp(out, { raw: { width: A.info.width, height: A.info.height, channels: 4 } }).png().toFile(path.join(dir, `${b}-${v}-diff.png`));
    console.log(v.padEnd(12), `differing px (>6): ${n} of ${A.info.width * A.info.height}`.padEnd(42), `max ${max}`, `mean ${(sum / (A.data.length / 4)).toFixed(3)}`);
  }
})();
