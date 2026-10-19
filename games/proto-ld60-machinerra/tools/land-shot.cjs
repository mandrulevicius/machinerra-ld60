// One whole generated land in one image (P47 part A's "before" pictures): boots the land for a seed in headless Chromium,
// freezes the mission clock, hides the HUD, shoots the land in camera-sized tiles at a fixed zoom and stitches them.
// Needs the dev server (npm run dev -- --port 5184) and Playwright (global is fine).
//   npm run land -- <seed> [biome] [--classes|--both] [--remnants] [--zoom 0.5] [--base http://localhost:5184] [--out dir] [--quality 85]
//   node games/proto-ld60-machinerra/tools/land-shot.cjs 2 jungle --classes
// biome: desert (default), jungle, city, mountains, demon, ether.
// --classes turns the class overlay on (`classes on`, `src/classview.ts`: scenery grey, loot gold, interact cyan,
// centre red over a dimmed land); --both shoots the land plain and then with the overlay, in one boot.
// --remnants: P47's buildings (`?remnants=1`; a land has them from the fourth mission).
// --zoom is output px per land px (0.5: a 100x75 land is 1600x1200; 1 is full detail, more tiles).
// The same seed, biome and zoom give the same land and framing. The jpg lands in
// `games/proto-ld60-machinerra/capture/land/land-<seed>-<biome>[-classes].jpg` (git-ignored).
// The caption (seed, biome, legend) is drawn on the picture. Exit code 1 on a page error.
const fs = require('fs');
const path = require('path');
let pw;
for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try {
    pw = require(m);
    break;
  } catch {}
}
if (!pw) throw new Error('playwright not found');
const sharp = require('sharp');

const args = [];
const flags = {};
const rest = process.argv.slice(2);
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--classes') flags.classes = true;
  else if (rest[i] === '--remnants') flags.remnants = true;
  else if (rest[i] === '--both') flags.both = true;
  else if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[++i];
  else args.push(rest[i]);
}
const seed = args[0] ?? '1';
const biome = args[1] ?? 'desert';
const ZOOM = Number(flags.zoom ?? 0.5);
const BASE = flags.base ?? 'http://localhost:5184';
const OUT = flags.out ?? path.join(__dirname, '..', 'capture', 'land');
const QUALITY = Number(flags.quality ?? 85);
const VW = 1280, VH = 720;
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const t0 = Date.now();
  const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${m}`);
  const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const fails = [];
  page.on('pageerror', (e) => fails.push(e.message));
  page.setDefaultTimeout(300000);
  await page.goto(`${BASE}/games/proto-ld60-machinerra/?scene=Play&seed=${seed}&biome=${biome}&bgvol=0${flags.remnants ? '&remnants=1' : ''}`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.scene('Play') && window.__game.scene('Play').sim, null, { timeout: 180000 });
  // Our own frames only: the rAF loop sleeps, the mission clock stops, the HUD hides, the camera is ours.
  const land = await page.evaluate(async (z) => {
    const G = window.__game, sc = G.scene('Play'), sim = sc.sim, cam = sc.cameras.main;
    G.game.loop.sleep();
    await G.cmd('timescale 0');
    sc.ui.style.visibility = 'hidden';
    cam.removeBounds();
    const view = { sx: 0, sy: 0 };
    for (const k of ['scrollX', 'scrollY']) Object.defineProperty(cam, k, { get: () => view[k === 'scrollX' ? 'sx' : 'sy'], set() {}, configurable: true });
    cam.setZoom = () => cam;
    cam.zoomX = cam.zoomY = z;
    let t = performance.now() + 1000;
    window.__frame = () => G.game.step((t += 1000 / 60), 1000 / 60);
    window.__look = (cx, cy) => {
      view.sx = cx - cam.width / 2;
      view.sy = cy - cam.height / 2;
      window.__frame();
      window.__frame();
      window.__frame();
    };
    return { w: sim.W * 32, h: sim.H * 32, biome: sim.biomeId };
  }, ZOOM);
  log(`land ${land.w}x${land.h} px, ${land.biome}`);
  const tw = VW / ZOOM, th = VH / ZOOM;
  const nx = Math.ceil(land.w / tw), ny = Math.ceil(land.h / th);
  const W = Math.round(land.w * ZOOM), H = Math.round(land.h * ZOOM);
  // --both: the plain land, then the same camera with the overlay on (one boot).
  for (const classes of flags.both ? [false, true] : [!!flags.classes]) {
    if (classes) log(await page.evaluate(() => window.__game.cmd('classes on')));
    const shots = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        await page.evaluate(([cx, cy]) => window.__look(cx, cy), [i * tw + tw / 2, j * th + th / 2]);
        shots.push({ input: await page.screenshot({ type: 'png' }), left: i * VW, top: j * VH });
        log(`tile ${i + 1},${j + 1} of ${nx},${ny}`);
      }
    const info = classes ? await page.evaluate(() => window.__game.scene('Play').classes.debug().classes) : null;
    const sheet = await sharp({ create: { width: nx * VW, height: ny * VH, channels: 3, background: '#000' } }).composite(shots).png().toBuffer();
    // The caption: what land it is, and the legend when the overlay is on.
    const legend = classes ? ['scenery', 'loot', 'interact', 'centre'].map((c, i) => `<rect x="${12 + i * 96}" y="34" width="14" height="14" rx="3" fill="${info.colors[c]}"/><text x="${32 + i * 96}" y="46" font-size="14" fill="#fff">${c}</text>`).join('') : '';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="6" y="6" width="${classes ? 404 : 250}" height="${classes ? 52 : 28}" rx="6" fill="#000" fill-opacity="0.65"/><text x="12" y="25" font-family="sans-serif" font-size="16" font-weight="bold" fill="#fff">seed ${seed}, ${land.biome}${classes ? ', classes' : ''}</text><g font-family="sans-serif">${legend}</g></svg>`;
    const file = path.join(OUT, `land-${seed}-${land.biome}${flags.remnants ? '-remnants' : ''}${classes ? '-classes' : ''}.jpg`);
    await sharp(sheet).extract({ left: 0, top: 0, width: W, height: H }).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: QUALITY, mozjpeg: true }).toFile(file);
    log(`${file}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB, ${W}x${H}${info ? ` ${JSON.stringify(info.total)}` : ''}`);
  }
  await browser.close();
  if (fails.length) {
    console.error(`page errors:\n${fails.join('\n')}`);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
