// Where the painted antenna's tip is in each of the Communicator's walk frames (art/communicator/<dir>-<i>.png, the stored 92 x 148 px):
// the centre of the topmost opaque pixels. `src/antennamounts.ts` (written here) is the table `commview.ts` hangs the chain antenna on.
// Run after the walk frames change:   node tools/antenna-mounts.cjs
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const A = path.join(__dirname, '../art/communicator/');
const DIRS = ['front', 'frontside', 'side', 'backside', 'back'];
(async () => {
  const rows = [];
  for (const d of DIRS) {
    const cells = [];
    for (let i = 0; i < 8; i++) {
      const { data, info } = await sharp(`${A}${d}-${i}.png`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const W = info.width, H = info.height;
      const opaque = (x, y) => data[(y * W + x) * 4 + 3] > 100;
      let top = 0;
      while (top < H && ![...Array(W).keys()].some((x) => opaque(x, top))) top++;
      let lo = W, hi = 0;
      for (let y = top; y < top + 2; y++) for (let x = 0; x < W; x++) if (opaque(x, y)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      cells.push(`[${(lo + hi + 1) / 2}, ${top + 1}]`);
    }
    rows.push(`  ${d}: [${cells.join(', ')}],`);
  }
  const src = `/**
 * Where the painted antenna's tip is in each Communicator walk frame (stored px of the 92 x 148 picture, left of the art as drawn, unflipped).
 * Written by \`tools/antenna-mounts.cjs\`; \`commview.ts\` hangs the chain antenna (\`antenna.ts\`) on it, so the chain starts at the painted tip in every view and step.
 */
import type { CommDir } from './comm';

export const MOUNTS: Record<CommDir, [number, number][]> = {
${rows.join('\n')}
};
`;
  fs.writeFileSync(path.join(__dirname, '../src/antennamounts.ts'), src);
  console.log(src);
})();
