// The NPC portraits for the dialog frame (under glass): a bust cropped from each figure's source in art-src/npc/, in the
// house style (style.cjs: the Communicator's detail level for the portrait's on-screen size, Kuwahara blobs, 24 colours,
// a thin outline). node games/proto-ld60-machinerra/tools/portraits.cjs
// Output: art/npc/portrait-<id>.png at 2x the portrait window (W x H game px, art/sizes.json `npc/portrait-*`). To give a
// painted NPC a portrait: cut its figure into art-src/npc/<id>.png, add a CROP line (x, y, w, h in source px, aspect W:H,
// the figure's head at the top so the glass's bezel hides the bottom edge), run it, repack with `npm run assets`.
const sharp = require('sharp');
const { restyle, finish, fromSharp, toSharp } = require('./style.cjs');
const ROOT = __dirname + '/../';
/** The portrait window on screen, game px (talk.css `.tk-glass`). */
const W = 230, H = 276;
/** id: [x, y, width, height] of the bust in art-src/npc/<id>.png. */
const CROP = {
  highPriest: [10, 0, 495, 594],
  trader: [150, 0, 760, 912],
  kicker: [85, 55, 470, 564],
  cityPlanner: [60, 40, 500, 600],
  expeditioner: [40, 0, 560, 672],
};

(async () => {
  const only = process.argv[2];
  for (const [id, [left, top, width, height]] of Object.entries(CROP)) {
    if (only && only !== id) continue;
    const bust = await sharp(`${ROOT}art-src/npc/${id}.png`).ensureAlpha().extract({ left, top, width, height }).png().toBuffer();
    const k = finish(await restyle(await fromSharp(sharp(bust)), H));
    await (await toSharp(k)).png().toFile(`${ROOT}art/npc/portrait-${id}.png`);
    console.log(id, k.w, 'x', k.h, `(window ${W} x ${H})`);
  }
})();
