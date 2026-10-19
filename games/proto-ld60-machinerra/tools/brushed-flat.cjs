// The house style (the Communicator's look, `style.cjs`) for still art: his detail level, Kuwahara smoothing, 24 colours,
// a thin outline, the 2x game texture. node games/proto-ld60-machinerra/tools/brushed-flat.cjs
// Sources: art-src/<path>.png (cut out of Laimonas's sheets in games/lab/art/Characters/, labels and leader lines removed);
// output: art/<path>.png at twice its on-screen height (the `height` in art/sizes.json, `scale: 2`).
const sharp = require('sharp');
const { restyle, finish, fromSharp, toSharp } = require('./style.cjs');
const ROOT = __dirname + '/../';
/** path under art-src and art: on-screen height in game px. */
// (crew/gatherer is made by gatherer-gather.cjs with its siphoning frames, on one palette.)
const { MOBS, mobHeight } = require('./mob-svg.cjs');
const JOBS = { 'crew/guard': 50, 'crew/mule': 46, 'crew/marksman': 52, 'crew/boilermancer': 48, 'crew/lamplighter': 56, 'crew/stalker': 50, 'crew/repairer': 48, 'npc/trader': 100, 'npc/kicker': 92, 'npc/cityPlanner': 96, 'npc/expeditioner': 94, 'npc/highPriest': 150, 'npc/oracle-face': 64, 'npc/princess': 96, 'foe/swarmer': 42, 'foe/drone': 46, 'foe/harbinger': 128, 'foe/evilOracle': 132, 'npc/evilOracle': 120, 'foe/evilOracle-unveiled': 144, 'foe/hornet-boss': 100, 'foe/hornet-boss-flap': 100, 'foe/gorilla-boss': 96, 'foe/knight-boss': 124, 'foe/knight-boss2': 84, 'foe/bear-boss': 84, 'foe/bear-boss2': 64, 'foe/snake-boss': 74, 'foe/croc-boss': 76, 'foe/mallcop-boss': 112, 'foe/bishop-boss': 118, 'foe/snowcat-boss': 88 };
// Old Rattlejaw's parts (tools/snake-boss-parts.cjs).
for (const [path, h] of Object.entries(require('./snake-boss-parts.cjs').PARTS)) JOBS[path] = Math.round(h);
// The small foes (tools/mob-svg.cjs, through svg-paint.cjs), the hornet's wing frame with it.
for (const [kind, def] of Object.entries(MOBS)) {
  JOBS[`foe/${kind}`] = mobHeight(def);
  if (kind === 'hornet') JOBS['foe/hornet-flap'] = mobHeight(def);
}
/**
 * A job made from another job's source, through a sharp step first: the Evil Oracle unveiled (his boss's second form) is his
 * painting turned to the Ether's violet, brighter; both forms are made more saturated first. (`art-src/foe/evilOracle.png` and `npc/` are TheEvilOracle.png cut out
 * with rembg isnet-general-use, the staff's head, which it dropped, restored from the painting by a hand-drawn mask.)
 */
const LIVELY = (img) => img.modulate({ saturation: 1.4, brightness: 1.08 }); // his crimson sinew and blue lenses survive the 24 colours
const FROM = {
  'foe/evilOracle': ['foe/evilOracle', LIVELY],
  'npc/evilOracle': ['npc/evilOracle', LIVELY],
  'foe/evilOracle-unveiled': ['foe/evilOracle', (img) => img.modulate({ hue: 250, saturation: 1.6, brightness: 1.15 })],
};

(async () => {
  // `node brushed-flat.cjs npc/princess` redoes only the paths named.
  const only = process.argv.slice(2);
  for (const [path, h] of Object.entries(JOBS)) {
    if (only.length && !only.includes(path)) continue;
    const [from, step] = FROM[path] ?? [path, (img) => img];
    const src = await fromSharp(step(sharp(`${ROOT}art-src/${from}.png`).ensureAlpha()));
    const k = finish(await restyle(src, h)); // the Communicator's detail and outline (style.cjs)
    await (await toSharp(k)).png().toFile(`${ROOT}art/${path}.png`);
    console.log(path, k.w, 'x', k.h);
  }
})();
