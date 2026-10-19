// Headless smoke for the tier abilities' views (P12) and the engine's status views (P11): boots a tier III land in Chromium, puts
// each ability's enemy in front of the Communicator, steps frames until its tell shows, screenshots it, and fails on any error
// the game logged (`__game.errors`). Needs the dev server running (npm run dev -- --port 5199) and Playwright (global is fine).
//   node games/proto-ld60-machinerra/tools/tier-smoke.cjs [baseUrl=http://localhost:5199] [outDir=/tmp/tier-smoke]
// The game's rAF loop is put to sleep; frames are stepped by hand and, except for the ones screenshotted, without rendering: `fast(n)` runs the scene's update (all
// the view code under test) but submits nothing to the GL, because software GL spends seconds a frame on a fight's lights.
// Exit code 1 on any failure.
const fs = require('fs');
let pw;
for (const m of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try {
    pw = require(m);
    break;
  } catch {}
}
if (!pw) throw new Error('playwright not found');
const t0 = Date.now();
const log = (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s ${m}`);
const BASE = process.argv[2] || 'http://localhost:5199';
const OUT = process.argv[3] || '/tmp/tier-smoke';
fs.mkdirSync(OUT, { recursive: true });

/** What to field and what to wait for. `want` runs in the page with the enemy `h` and the sim `s`; `when` names the tell. */
const CASES = [
  { id: 'dig', kind: 'spider', tier: 2, tiles: 7, want: 'h.ts && h.ts.dig && h.ts.dig.mode === "sink"', also: ['h.ts.dig.mode === "under"', 'h.ts.dig.mode === "tell"'] },
  { id: 'carpet', kind: 'spider', tier: 3, tiles: 6, want: 's.tiers.patches.some((p) => p.kind === "web")' },
  { id: 'ambush', kind: 'snake', tier: 2, tiles: 7, want: 'h.ts && h.ts.dig && h.ts.dig.mode === "sink"', also: ['h.ts.dig.mode === "tell"'] },
  { id: 'spit', kind: 'snake', tier: 3, tiles: 6, want: 'h.ts && h.ts.spit', also: ['h.ts.spit && h.ts.spit.t < 0.15'] },
  { id: 'throw', kind: 'swarmer', tier: 3, tiles: 5, want: 'h.ts && h.ts.throw', also: ['s.shots.some((x) => x.blade)', 's.shots.some((x) => x.blade && x.blade.back)'] },
  { id: 'puddle', kind: 'drone', tier: 2, tiles: 6, want: 's.tiers.patches.some((p) => p.kind === "puddle" && p.arm <= 0)' },
  { id: 'mortar', kind: 'drone', tier: 1, trait: 'mortar', tiles: 6, want: 'h.ts && h.ts.shell' },
  { id: 'weaver', kind: 'spider', tier: 1, trait: 'weaver', tiles: 6, want: 's.tiers.patches.some((p) => p.kind === "web")' },
];

(async () => {
  const browser = await pw.chromium.launch({ executablePath: process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const fails = [];
  page.on('pageerror', (e) => fails.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/games/proto-ld60-machinerra/?scene=Play&tier=3&seed=42&bgvol=0`, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.scenes && window.__game.scene('Play') && window.__game.scene('Play').sim, null, { timeout: 180000 });
  page.setDefaultTimeout(300000);
  // fast(scene, n): n updates of a scene with no rendering.
  // Stop the game's own rAF loop: it would keep rendering (and stepping the clock) on top of ours, which in software GL means seconds a frame.
  await page.evaluate(() => window.__game.game.loop.sleep());
  await page.evaluate(() => window.__game.step(2)); // one rendered frame, so the first compile is out of the way
  await page.evaluate(() => {
    window.__t = performance.now() + 1000;
    window.__render = () => window.__game.game.step((window.__t += 1000 / 60), 1000 / 60);
    window.__fast = (n, key = 'Play') => {
      const sc = window.__game.scene(key);
      for (let i = 0; i < n; i++) sc.sys.step((window.__t += 1000 / 60), 1000 / 60);
    };
  });
  log('warm');
  const errors = () => page.evaluate(() => window.__game.errors.slice());

  for (const c of CASES) {
    // Nothing else is out, the enemy stands `tiles` tiles from the Communicator on open ground.
    log(`case ${c.id}`);
    await page.evaluate(() => { window.__free = false; });
    await page.evaluate(async (c) => {
      const G = window.__game, s = G.scene('Play').sim;
      // (No scene restart between cases: after a fight, a restart makes each later frame take seconds in software GL.)
      s.god = true;
      for (const h of s.hornets) h.dead = true;
      s.hornets.length = 0;
      s.shots.length = 0;
      s.tiers.patches.length = 0;
      s.controller.hp = s.controller.maxHp;
      await G.cmd(c.trait ? `elite ${c.trait}` : `foe ${c.kind} 1`);
      const h = s.hornets[s.hornets.length - 1];
      h.tier = c.tier;
      h.hp = h.maxHp = 1e9; // the crew would shoot it down before its tell
      if (c.trait) h.elite = true;
      const k = s.controller;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = k.x + dx * c.tiles * 32, y = k.y + dy * c.tiles * 32;
        if (!s.blocked(x, y)) {
          h.x = x;
          h.y = y;
          break;
        }
      }
      h.cd = 0.5;
      window.__smoke = h;
      window.__pin = { x: h.x, y: h.y };
    }, c);
    log('  placed');
    // Step until the tell shows (at most 20 s of game time), screenshot it, then see the later phases.
    const stages = [c.want, ...(c.also || [])];
    let stage = 0, shots = 0;
    for (let i = 0; i < 400 && stage < stages.length; i++) {
      const hit = await page.evaluate((expr) => {
        const G = window.__game, s = G.scene('Play').sim, h = window.__smoke;
        // Held where it was put until its first wind-up shows (a snake would run up and bite before it spat); then let it finish.
        if (!window.__free && !h.dead) {
          h.x = window.__pin.x;
          h.y = window.__pin.y;
          h.vx = h.vy = 0;
        }
        window.__fast(3);
        // eslint-disable-next-line no-new-func
        return !h.dead && new Function('s', 'h', `return !!(${expr})`)(s, h);
      }, stages[stage]);
      if (hit) {
        await page.evaluate(() => window.__render());
        await page.evaluate(() => { window.__free = true; });
        await page.screenshot({ path: `${OUT}/${c.id}-${stage}.png` });
        log(`  ${c.id} stage ${stage} at poll ${i}`);
        shots++;
        stage++;
      }
    }
    const errs = await errors();
    if (stage < stages.length) fails.push(`${c.id}: never reached stage ${stage} (${stages[stage]})`);
    if (errs.length) fails.push(`${c.id}: errors ${JSON.stringify(errs.slice(0, 3))}`);
    console.log(`${c.id}: ${shots}/${stages.length} tells seen${errs.length ? ' WITH ERRORS' : ''}`);
  }

  // P11's status views: pips on a robot and an enemy, the words (a status, Parry, Shatter) through the event path.
  await page.evaluate(async () => {
    const G = window.__game, s = G.scene('Play').sim;
    await G.cmd('foe hornet 2');
    const h = s.hornets[s.hornets.length - 1];
    for (const id of ['burning', 'chilled', 'rooted', 'corroded', 'haste']) await G.cmd(`status h${h.id} ${id} 2 6`);
    for (const id of ['burning', 'shocked', 'frozen']) await G.cmd(`status Communicator ${id} 1 6`);
    const c = s.controller;
    s.events.push({ e: 'parry', x: c.x, y: c.y }, { e: 'shatter', x: h.x, y: h.y, r: 60 });
    window.__fast(20);
    window.__render();
  });
  await page.screenshot({ path: `${OUT}/statuses.png` });
  const errs = await errors();
  if (errs.length) fails.push(`statuses: errors ${JSON.stringify(errs.slice(0, 3))}`);
  console.log(`statuses: ${errs.length ? 'ERRORS' : 'ok'}`);

  // An Echoing dungeon (P29): a noise rings out and the foes that heard it show their "!".
  await page.evaluate(() => {
    window.__game.goto('Dungeon', { seed: 'smoke', biome: 'desert', dungeon: { spec: { tier: 2, twist: 'echoing', handcrafted: null }, dayT: 300, hp: 100, steam: 50, reserve: 0, free: 0, scrap: 0, party: [], followers: [] } });
  });
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__render(); }); // the scene manager starts it on a step
  await page.waitForFunction(() => window.__game.scene('Dungeon') && window.__game.scene('Dungeon').sim && window.__game.scene('Dungeon').sim.run);
  await page.evaluate(() => window.__fast(30, 'Dungeon'));
  const echoes = await page.evaluate(async () => {
    const G = window.__game, s = G.scene('Dungeon').sim;
    s.god = true;
    const from = s.run.d.chain[0], to = s.run.d.chain[1];
    s.controller.x = (from.cx + 0.5) * 32;
    s.controller.y = (from.cy + 0.5) * 32;
    // A foe in the next room, idle; then a noise by the Communicator.
    const foe = s.spawnHornet((to.cx + 0.5) * 32, (to.cy + 0.5) * 32, 0, false, false, 'snake');
    foe.hp = foe.maxHp = 1e9;
    await G.cmd('dungeon noise');
    window.__fast(20, 'Dungeon');
    window.__render();
    return s.run.echoes;
  });
  if (echoes < 1) fails.push('echo: the noise reached no one');
  await page.screenshot({ path: `${OUT}/echo.png` });
  const echoErrs = await errors();
  if (echoErrs.length) fails.push(`echo: errors ${JSON.stringify(echoErrs.slice(0, 3))}`);
  log(`echo: ${echoErrs.length ? 'ERRORS' : 'ok'}`);

  await browser.close();
  if (fails.length) {
    console.error(fails.join('\n'));
    process.exit(1);
  }
  console.log(`ok, screenshots in ${OUT}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
