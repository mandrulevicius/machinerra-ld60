// A contact sheet of the Communicator's eight directions from the packed frames in art/communicator/:
// row 1 the eight idle frames (down, down-right, right, up-right, up, up-left, left, down-left; the left half mirrored as the game does),
// rows 2 and 3 a walk cycle of each diagonal.
//   node tools/communicator-sheet.cjs [out.png]     (default: ../../ludum-dare-60/docs/art/comm-8dir.png)
const sharp = require('sharp');
const path = require('path');
const A = path.join(__dirname, '../art/communicator/');
const OUT = process.argv[2] ?? path.join(__dirname, '../../ludum-dare-60/docs/art/comm-8dir.png');
const S = 2, W = 92 * S, H = 148 * S, BG = { r: 92, g: 84, b: 72 };
const tile = async (name, flip) => {
  let s = sharp(A + name + '.png').resize(W, H, { kernel: 'nearest' });
  if (flip) s = s.flop();
  return s.png().toBuffer();
};
const label = (t) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="20"><text x="4" y="14" font-family="sans-serif" font-size="13" fill="#f4e2bc">${t}</text></svg>`);
(async () => {
  const idle = [['front-0', 0, 'down'], ['frontside-0', 0, 'down-right'], ['side-0', 0, 'right'], ['backside-0', 0, 'up-right'], ['back-0', 0, 'up'], ['backside-0', 1, 'up-left'], ['side-0', 1, 'left'], ['frontside-0', 1, 'down-left']];
  const items = [];
  for (let i = 0; i < 8; i++) {
    const [n, f, l] = idle[i];
    items.push({ input: await tile(n, f), left: i * W, top: 0 }, { input: label(l), left: i * W, top: 0 });
  }
  for (const [r, v] of [[1, 'frontside'], [2, 'backside']]) {
    for (let i = 0; i < 8; i++) items.push({ input: await tile(`${v}-${i}`, 0), left: i * W, top: r * H }, { input: label(`${v} ${i}`), left: i * W, top: r * H });
  }
  require('fs').mkdirSync(path.dirname(OUT), { recursive: true });
  await sharp({ create: { width: 8 * W, height: 3 * H, channels: 3, background: BG } }).composite(items).png().toFile(OUT);
  console.log('wrote', OUT);
})();
