// A drawing made as an SVG (art-src/<path>.svg) turned into a "painting" source for the house style, like the hub's
// Kicker, City Planner and Expeditioner: rendered by sharp, then weathered by weather.py (mottled light, rust, grime).
// Output art-src/<path>.png; then tools/brushed-flat.cjs <path> makes the game's art/<path>.png, and `npm run assets`.
//   node games/proto-ld60-machinerra/tools/svg-paint.cjs foe/gorilla-boss [more paths]   (WEATHER=0.45 weathers less: the small foes)
// Bosses are drawn at 4.8 SVG units per on-screen game px with a 3.5 stroke, the Kicker's scale, so every drawing comes
// out with the same line and detail after the house style.
const sharp = require('sharp');
const { execFileSync } = require('child_process');
const os = require('os');
const path = require('path');
const ROOT = __dirname + '/../';

(async () => {
  for (const p of process.argv.slice(2)) {
    const tmp = path.join(os.tmpdir(), `svg-paint-${p.replace(/\W/g, '_')}.png`);
    await sharp(`${ROOT}art-src/${p}.svg`, { density: 144 }).png().toFile(tmp);
    execFileSync(process.env.PYTHON ?? 'python', [path.join(__dirname, 'weather.py'), tmp, `${ROOT}art-src/${p}.png`, process.env.WEATHER ?? '1'], { stdio: 'inherit' });
    console.log(p);
  }
})();
