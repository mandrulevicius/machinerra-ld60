/**
 * Dev commands, group `mission`: the land, its loot and the mission itself (restart, seams, coal, copper, ruins, use, finish, god). Add one: a `command(...)` in this file's function; `dev/index.ts` registers it with the scene.
 */
import { command } from '../../../../harness/dev/commands';
import { S } from '../art';
import { SURFACES, type Surface } from '../footsteps';
import type { Play } from '../Play';
import { LANDS, LAND_IDS } from '../sim/lands';
import { ruinHealth } from '../sim/props';
import { uncoverCaches, weatherNow, weatherOff, weatherSummary } from '../sim/weather';
import { setCold, twistNow, twistOff, twistSummary } from '../sim/twists';
import { rushNow, rushSummary } from '../sim/commute';
import { ANOMALIES, BIOMES, TWISTS, COAL, PARTS, REVIVE, RUIN, T, TAP, WEAPONS, WEATHER, type AnomalyId, type BiomeId, type WeaponId } from '../sim/defs';

/** What a timed action is on, in a word: a ruin's kind, a place's id, a downed robot's fix, a graft or a seam. */
const actionName = (a: NonNullable<Play['sim']['action']>) => a.ruin ? a.ruin.kind : a.place ? a.place.id : a.bot ? `fix ${a.bot.name}` : a.graft ? 'graft' : 'coal seam';

export function missionCommands(play: Play) {
  const sim = play.sim;
  const g = { group: 'mission' };
  command('live', ([what]) => {
    const live = play.light.live, cam = play.cameras.main;
    if (!live) return 'error: no live ground';
    if (what === 'on' || what === 'off') live.on = what === 'on';
    else if (what === 'zep') live.sky.passNow(cam.midPoint.x, cam.midPoint.y);
    else if (what === 'gust') live.sky.gustNow();
    return JSON.stringify(live.state());
  }, 'live [on|off|zep|gust]: the live ground (groundlive.ts): show it or not, send the D-city\'s shadow across the view, blow a gust; no argument: the wind, gust and pass now', { ...g, args: () => ['on', 'off', 'zep', 'gust'] });
  command('seed', ([n]) => {
    play.scene.restart({ seed: n ?? Math.floor(Date.now() % 1e6), biome: play.biome, tier: play.tier, anomaly: play.anomaly });
    return `new sands from seed ${n ?? '(random)'}`;
  }, 'seed [n]: restart the mission on these sands', g);
  command('biome', ([id, n]) => {
    if (!id || !(id in BIOMES)) return `biome ${play.biome} (${Object.keys(BIOMES).join(', ')})`;
    play.scene.restart({ seed: n ?? play.seed, biome: id as BiomeId, tier: play.tier, anomaly: play.anomaly });
    return `lift down into ${BIOMES[id as BiomeId].name}`;
  }, `biome [${Object.keys(BIOMES).join('|')}] [seed]: restart the mission in a biome (the Demon Wastes: demon), same seed unless given`, { ...g, args: () => Object.keys(BIOMES) });
  command('land', ([id]) => {
    if (!id || !LAND_IDS().includes(id)) return `land ${play.landId ?? 'none (generated)'} (${LAND_IDS().join(', ')}); land level1 is the first mission's handcrafted land`;
    play.scene.restart({ land: id, seed: id, biome: LANDS[id].biome, tier: play.tier, anomaly: play.anomaly });
    return `restarting on the land file ${id}`;
  }, `land [${LAND_IDS().join('|')}]: restart the mission on a handcrafted land file (levels/lands/; also ?land=level1; a new game plays intro, then level1)`, { ...g, args: () => LAND_IDS() });
  command('anomaly', ([id]) => {
    if (!id || !(id in ANOMALIES)) return `anomaly ${play.anomaly} (${Object.keys(ANOMALIES).join(', ')}); now ${JSON.stringify(sim.summary().anomaly)}`;
    play.scene.restart({ seed: play.seed, biome: play.biome, tier: play.tier, anomaly: id as AnomalyId });
    return `restarting under ${ANOMALIES[id as AnomalyId].name}`;
  }, `anomaly [${Object.keys(ANOMALIES).join('|')}]: restart this land under an anomaly (also ?anomaly=sandstorm); a weather one passes on the clock (\`weather now\` starts it, \`time\` skips ahead)`, { ...g, args: () => Object.keys(ANOMALIES) });
  command('weather', ([what]) => {
    const A = ANOMALIES[sim.anomaly];
    if (what === 'caches') {
      uncoverCaches(sim, { n: 90 + sim.weather.windows.length });
      return JSON.stringify(weatherSummary(sim));
    }
    if (what === 'now' || what === 'off') {
      if (!A.weather) return `error: ${A.name} is a land anomaly, all day; run anomaly sandstorm or emberRain first`;
      if (what === 'now') weatherNow(sim);
      else weatherOff(sim);
      return `${A.name}: ${what === 'now' ? `warns now, starts in ${WEATHER.warn} s, ${A.weather.hold} s long` : 'ending'}; ${JSON.stringify(weatherSummary(sim))}`;
    }
    return `${A.name} (${A.weather ? `passing, ${A.weather.count} times` : 'all day'}): ${JSON.stringify(weatherSummary(sim))}`;
  }, "weather [now|off|caches]: the anomaly's weather (anomalies.ts): now starts a passing one's warning, off ends it, caches uncovers the Sandstorm's now; no argument: where it is (also in debugState().sim.anomaly)", { group: 'mission', args: () => ['now', 'off', 'caches'] });
  command('twist', ([kind, what]) => {
    if (kind === 'rain' || kind === 'blizzard') {
      if (what === 'now' && !twistNow(sim, kind)) return `error: ${BIOMES[sim.biomeId].name} has no ${kind} (the jungle rains, the Frostspine snows)`;
      if (what === 'off') twistOff(sim, kind);
    }
    return JSON.stringify(twistSummary(sim));
  }, "twist [rain|blizzard] [now|off]: the land's own twists (P31, twists.ts): now warns one now, off ends it; no argument: where they are and the cold (also debugState().sim.twists)", { group: 'mission', args: () => ['rain now', 'rain off', 'blizzard now', 'blizzard off'] });
  command('rush', () => {
    if (!TWISTS[sim.biomeId]?.commute) return `error: no commute on ${BIOMES[sim.biomeId].name} (the Hollow City's)`;
    rushNow(sim);
    return JSON.stringify(rushSummary(sim));
  }, "rush: the Hollow City's rush hour now (P31, commute.ts): a crowd of commuters walks across, past you; bump one and its crowd turns", { group: 'mission' });
  command('cold', ([n]) => {
    if (!sim.twists.cold.on) return `error: no cold on ${BIOMES[sim.biomeId].name} (the Frostspine's)`;
    if (n !== undefined) setCold(sim, n === 'warm' ? 0 : Number(n) || 0);
    return JSON.stringify(twistSummary(sim).cold);
  }, "cold [0|1|2|warm]: the Frostspine's cold on him now (its Chill stacks, D22: never past 2 by the cold alone); no argument: the stacks, warm or not, seconds to the next", { group: 'mission', args: () => ['0', '1', '2', 'warm'] });
  command('retier', ([n]) => {
    const t = Number(n);
    if (!Number.isInteger(t) || t < 1 || t > 3) return `tier ${play.tier} (1-3); \`tier <n>\` restarts the land at that threat tier (also ?tier=2). \`dungeon tier\` sets only the dungeon`;
    play.scene.restart({ seed: play.seed, biome: play.biome, tier: t, anomaly: play.anomaly });
    return `restarting at threat tier ${t}`;
  }, 'retier [1-3]: restart this land at a threat tier (it sets the length of its dungeon; ?tier= too)', g);
  command('steps', ([what]) => {
    const f = play.feet;
    if (what === 'auto' || what === 'off') f.force = null;
    else if (what && (SURFACES as string[]).includes(what)) {
      f.force = what as Surface;
      f.sample(f.force);
    } else if (what) return `error: steps [auto|${SURFACES.join('|')}]`;
    return JSON.stringify(f.debug().steps);
  }, `steps [auto|${SURFACES.join('|')}]: footsteps (footview.ts): a surface makes everyone walk on it and plays its step once; auto lets the land decide; no argument: the surface under him, prints and steps so far`, { ...g, args: () => ['auto', ...SURFACES] });
  command('fog', ([what, n]) => {
    const f = sim.fog;
    if (what === 'all') f.revealAll();
    else if (what === 'clear') f.clear();
    else if (what === 'here') f.reveal(sim.controller.x / T - 0.5, sim.controller.y / T - 0.5, Number(n) || 12);
    return JSON.stringify(sim.summary().fog);
  }, 'fog [all|clear|here <r>]: the map fog (P6): see the whole land, forget it, or reveal r tiles around you; then what is seen and which signals are still open', { ...g, args: () => ['all', 'clear', 'here'] });
  command('coal', ([n]) => {
    sim.coal = Math.max(0, Number(n ?? sim.coal + 10) || 0);
    return `coal carried ${sim.coal} (comes home with the haul: fuel for expeditions)`;
  }, 'coal [n]: set the coal carried this mission (default: 10 more); the haul banks it at home', g);
  command('seam', ([what, n]) => {
    const c = sim.controller;
    if (what === 'spawn') {
      const at = sim.passableNear(c.x + 90, c.y + 20);
      const s = { id: sim.seams.length + 1, x: at.x, y: at.y, amount: COAL.amount, max: COAL.amount };
      sim.seams.push(s);
      play.world.addSeam(s);
      return `a coal seam at ${Math.round(s.x)},${Math.round(s.y)} (${COAL.amount} coal), beside you: press Use at it to mine by hand, or send a gatherer`;
    }
    const s = sim.seams.find((q) => q.amount > 0) ?? sim.seams[0];
    if (!s) return 'no seams on this land (`seam spawn` makes one)';
    if (what === 'tp') {
      const at = sim.passableNear(s.x - 50, s.y + 30);
      c.x = at.x;
      c.y = at.y;
    } else if (what === 'set') s.amount = Math.max(0, Math.min(s.max, Number(n ?? s.max)));
    return sim.seams.map((q) => `#${q.id} ${Math.round(q.amount)} / ${q.max} at ${Math.round(q.x)},${Math.round(q.y)} (${Math.round(Math.hypot(q.x - c.x, q.y - c.y) / T)} tiles)`).join('; ');
  }, "seam [spawn|tp|set <n>]: the land's coal seams (list with no argument); `spawn` makes one beside the Communicator, `tp` stands beside the first one with coal, `set <n>` sets its coal", g);
  command('scrap', ([n]) => {
    sim.scrap = Math.max(0, Number(n ?? sim.scrap + 50) || 0);
    return `scrap carried ${sim.scrap} (comes home with the haul: the main currency)`;
  }, 'scrap [n]: set the scrap carried this mission (default: 50 more); the haul banks it at home', g);
  command('copper', ([n]) => {
    sim.copper = Math.max(0, Number(n ?? sim.copper + 20) || 0);
    return `copper carried ${sim.copper} (comes home with the haul: the building material)`;
  }, 'copper [n]: set the copper carried this mission (default: 20 more); the haul banks it at home', g);
  command('cans', ([n]) => {
    const cans = Math.max(0, Math.min(sim.canCap / REVIVE.cost, Number(n ?? sim.canCap / REVIVE.cost) || 0));
    sim.reserve = cans * REVIVE.cost;
    return `the pack holds ${sim.spareCans} / ${Math.floor(sim.canCap / REVIVE.cost)} cans (every lift goes down full: cans refill at home)`;
  }, 'cans [n]: set the spare cans on the pack (default: full)', g);
  command('tap', () => {
    const t = sim.seeps.find((q) => q.kind === 'crude');
    if (!t) return 'error: this land has no tap';
    const at = sim.passableNear(t.x - 40, t.y + 30);
    sim.controller.x = at.x;
    sim.controller.y = at.y;
    return `at the tap (${Math.round(t.amount)} of ${t.max} oil left; it mends everyone within ${TAP.reach} px)`;
  }, "tap: stand the Communicator beside the land's one tap, a healing shrine", g);
  command('steam', ([n]) => {
    sim.controller.steam = Number(n ?? sim.controller.maxSteam);
    return `steam ${sim.controller.steam}`;
  }, "steam [n]: set the Communicator's steam", g);
  const slots = () => `primary (left click) ${sim.weapon}, secondary (right click) ${sim.secondary ?? 'free'}; owned ${[...sim.weapons].join(', ')}`;
  command('weapon', ([id, slot]) => {
    const ids = Object.keys(WEAPONS) as WeaponId[];
    if (!id) return slots();
    if (!(id in WEAPONS)) return `error: weapons are ${ids.join(', ')}`;
    sim.give(id as WeaponId);
    if (slot === 'primary' || slot === 'secondary') {
      if (!sim.equip(id as WeaponId, slot)) return `error: cannot put ${id} in the ${slot} slot`;
    }
    return slots();
  }, "weapon [shovel|steamGun] [primary|secondary]: give the Communicator a weapon (it fills the free slot, like a find; name a slot to put it there, swapping); no name: show the two slots", { ...g, args: () => [...Object.keys(WEAPONS), 'primary', 'secondary'] });
  command('ruin', ([what, kind]) => {
    const open = sim.ruins.filter((r) => !r.searched);
    const near = (live: boolean) => open.filter((r) => r.live === live).sort((p, q) => Math.hypot(p.x - sim.controller.x, p.y - sim.controller.y) - Math.hypot(q.x - sim.controller.x, q.y - sim.controller.y))[0];
    if (what === 'tp') {
      const r = kind === 'dock' ? open.find((x) => x.kind === 'dock') : near(kind !== 'dead'); // `dock`: the old charging dock (P58 H), pried not searched
      if (kind === 'dock' && !r) return 'no old dock in this land (`?t.docks=1` makes every land have one)';
      if (!r) return `no ${kind === 'dead' ? 'dead' : 'live'} ruin left to search`;
      sim.controller.x = r.x;
      sim.controller.y = r.y + RUIN.reach * 0.5;
      return `beside a ${r.live ? 'live' : 'dead'} ${r.kind}: press Use`;
    }
    if (what === 'break') {
      const r = open.filter((x) => !x.broken).sort((p, q) => Math.hypot(p.x - sim.controller.x, p.y - sim.controller.y) - Math.hypot(q.x - sim.controller.x, q.y - sim.controller.y))[0];
      if (!r) return 'no ruin to break';
      sim.flatten(r);
      return `the ${r.kind}'s walls are down${r.live ? ' (its heart stands: it still decodes)' : ''}`;
    }
    return sim.ruins.map((r) => `${r.id} ${r.kind} ${r.size ?? '-'} ${r.broken ? 'broken' : r.live ? 'live' : 'dead'} health ${ruinHealth(sim, r).toFixed(2)}${r.searched ? ' (done)' : ''}`).join('; ') + (sim.decoding ? `; decoding ${Math.round(sim.decodeProgress * 100)}%` : '');
  }, 'ruin [list|tp [live|dead|dock]|break]: the land\'s ruins (live ones are decoded: press Use, then stay near six seconds, loud; dead ones searched quietly for junk); `tp` goes beside the nearest unsearched one; `break` knocks down every piece of the nearest one (a dead one gives up what is left of its find; a live one still decodes); `prop` is for the props', { group: 'mission', args: () => ['list', 'tp', 'break', 'live', 'dead'] });
  command('use', ([what]) => {
    if (what === 'press') {
      sim.pressUse(sim.controller);
      return sim.action ? `started: ${actionName(sim.action)} (${sim.action.need.toFixed(1)} s)` : sim.armed ? `asked: ${sim.armed.verb}` : 'nothing in reach to use';
    }
    if (what === 'finish') {
      if (!sim.action) return 'no timed action running (`use press` beside a ruin or a place first)';
      sim.action.t = sim.action.need;
      return 'finishes on the next step (if he is within the zone)';
    }
    if (what === 'cancel') sim.action = sim.armed = null;
    const a = sim.action;
    return a ? `${actionName(a)}: ${a.t.toFixed(1)} / ${a.need.toFixed(1)} s${a.paused ? ' (paused: out of the zone)' : ''}` : sim.armed ? `asked ${sim.armed.verb} ${sim.armed.t.toFixed(1)} s` : 'idle';
  }, 'use [press|finish|cancel]: the Use key as a command. `press` is one press (starts the action in reach, or asks the lift/way down; a second `press` confirms), `finish` completes the running timed action, no argument shows it', { group: 'mission', args: () => ['press', 'finish', 'cancel'] });
  command('wake', () => {
    for (const n of sim.nests) sim.wake(n, 'a dev');
    return `${sim.awake} hives awake`;
  }, 'wake: wake every hive', g);
  command('evac', () => {
    sim.evacuate();
    return 'every crew ordered to the lift';
  }, 'evac: order every crew to the lift', g);
  command('finish', ([how]) => {
    if (sim.phase === 'done' || sim.phase === 'lost') return `error: the mission is already ${sim.phase}`;
    if (how !== undefined && how !== 'hub') return 'error: finish [hub]';
    sim.finish();
    if (how === 'hub') {
      // Straight on to the zeppelin and the hub, as the results screen's primary button would.
      play.scene.start('Ascent', play.finale.ascentData());
      return 'finished: on to the zeppelin';
    }
    return 'finished: as if the lift rose; the results screen shows (its first button goes up to the zeppelin; `finish hub` skips it)';
  }, 'finish [hub]: end the mission as if the lift rose (whoever stands on it is saved) and show the results; `hub` goes straight on to the zeppelin and the hub', { ...g, args: () => ['hub'] });
  command('drop', ([kind]) => {
    const c = sim.controller;
    const l = kind === 'core' ? sim.dropCore(c.x + 120, c.y) : kind in PARTS ? sim.drop(c.x + 120, c.y, 'part', kind as never) : sim.drop(c.x + 120, c.y, (['scrap', 'copper', 'oil', 'part'].includes(kind) ? kind : undefined) as never);
    return `${l.part ?? l.kind} dropped`;
  }, 'drop [scrap|copper|oil|part|core|<part kind>]: drop loot beside the Communicator (part kinds: hornet-head, hornet-stinger, hornet-wings, queens-crown)', g);
  command('god', () => {
    sim.god = !sim.god;
    return `god ${sim.god}`;
  }, 'god: the Communicator takes no damage (toggle)', g);
}
