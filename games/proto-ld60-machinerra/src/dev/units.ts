/**
 * Dev commands, group `units`: enemies, robots and where the Communicator stands. Add one: a `command(...)` in this file's function; `dev/index.ts` registers it with the scene.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { kickLook } from '../commkick';
import { explain } from '../sim/botai';
import { carriedBy, downedNear, fixed, layWreck, pickUp, putDown } from '../sim/downed';
import { BEAST_MODS, BOSSES, BREAK, ELITE_TRAITS, FOES, ROLES, RUIN, TIER, TYPE_WRECK, type BeastModId, type Enemy, type Role, type TraitId } from '../sim/defs';
import { dist } from '../sim/geom';
import { breakCheck, breakable, warden } from '../sim/tiers';
import { setMods } from '../sim/beasts';
import { STATUSES, type StatusId } from '../sim/effects';
import { DEV_SOURCES } from '../sim/missionfx';
import type { PlaceId } from '../sim/places';
import type { Bot, SimEvent } from '../sim/sim';
import { spawnAtRim } from '../sim/spider';
import { devBlow, graftOn, graftSummary, layGraft } from '../sim/graft';
import type { LimbKind } from '../sim/limbs';
import { goPlace, placeIds } from './places';

export function unitsCommands(play: Play) {
  const sim = play.sim;
  command('elite', ([what, kind]) => {
    const c = sim.controller;
    const trait = what && what in ELITE_TRAITS ? (what as TraitId) : undefined;
    if (what && !trait && !Number.isFinite(Number(what))) return `error: elite [n|trait] ([kind]); traits: ${Object.keys(ELITE_TRAITS).join(', ')}`;
    const k = (trait ? ELITE_TRAITS[trait].kind : kind ?? 'hornet') as Enemy;
    if (!(k in FOES)) return `error: no kind "${kind}"`;
    for (let i = 0; i < (trait ? 1 : Number(what ?? 1)); i++) sim.spawnHornet(c.x + sim.r.range(-250, 250), c.y - 200, 0, true, undefined, k, trait ? { traits: [trait] } : {});
    return `${sim.hornets.filter((h) => h.elite).length} elites${trait ? ` (${trait})` : ''}`;
  }, 'elite [n|trait] [kind]: spawn n elites of a kind (default mechahornets), or one with a named trait (a trait picks its own kind); they always drop a part, and a trait\'s elite drops that trait\'s part', { group: 'units', args: () => ['3', ...Object.keys(ELITE_TRAITS)] });
  command('break', () => {
    const c = sim.controller;
    const h = sim.hornets.filter((x) => !x.dead && breakable(x)).sort((p, q) => dist(p.x, p.y, c.x, c.y) - dist(q.x, q.y, c.x, c.y))[0];
    if (!h) return 'error: no elite or boss without a form is out (elite 1 spawns one)';
    const next = BREAK.at[h.breaks?.length ?? 0];
    if (next === undefined) return `${FOES[h.kind].name} has broken twice: ${h.breaks!.join(', ')}`;
    h.hp = h.maxHp * next - 0.01; // just under it (a blow would be blunted by guards)
    breakCheck(sim, h);
    return `${FOES[h.kind].name} at ${Math.round((h.hp / h.maxHp) * 100)}%: ${h.breaks?.join(', ') ?? 'not broken'}`;
  }, 'break: take the nearest elite or boss (without a second form) to its next break (66%, then 33% of its oil): what it loses, a part, the `break` event', { group: 'units' });
  command('tier', ([n]) => {
    if (n === undefined) return `land tier ${sim.tier} (traits on an elite: ${TIER.traits[sim.tier - 1]})`;
    const t = Number(n);
    if (![1, 2, 3].includes(t)) return 'error: tier 1, 2 or 3';
    sim.setTier(t);
    return `tier ${t}: ${sim.hornets.filter((h) => !h.boss).length} living enemies re-tiered, new ones roll from it`;
  }, 'tier [1|2|3]: the land\'s threat tier now (no argument: show it): re-tiers the living enemies; later spawns roll from it, and an elite rolls two traits at III', { group: 'units', args: () => ['1', '2', '3'] });
  command('hornets', ([n]) => {
    const c = sim.controller;
    for (let i = 0; i < Number(n ?? 5); i++) sim.spawnHornet(c.x + sim.r.range(-300, 300), c.y + sim.r.range(-300, -150));
    return `${sim.hornets.length} hornets`;
  }, 'hornets [n]: spawn n mechahornets near the Communicator', { group: 'units' });
  command('foe', ([kind, ...rest]) => {
    if (!kind || !(kind in FOES)) return `error: foe <kind> [n] [elite] [twisted] [menacing] [warden] | boss; kinds: ${Object.keys(FOES).join(' ')}`;
    const how = new Set(rest.filter((a) => Number.isNaN(Number(a))));
    const n = rest.find((a) => !Number.isNaN(Number(a)));
    const c = sim.controller;
    const k = kind as Enemy;
    if (how.has('boss')) {
      if (!BOSSES[k]) return `error: ${k} has no boss`;
      sim.spawnBoss(k, { x: c.x + 220, y: c.y });
      return `${BOSSES[k]!.name} beside you`;
    }
    for (let i = 0; i < Number(n ?? 1); i++) {
      const h = sim.spawnHornet(c.x + sim.r.range(-220, 220), c.y + sim.r.range(-200, -100), 0, how.has('elite'), how.has('twisted') || how.has('menacing'), k, how.has('menacing') ? { menacing: true } : {});
      if (how.has('warden')) warden(sim, h); // P18's Wardens are not built: this makes one (Heavy at tier III)
      const mods = [...how].filter((a): a is BeastModId => a in BEAST_MODS);
      if (mods.length) setMods(sim, h, mods); // P31: its beast mods (D32), forced
    }
    return `${sim.hornets.filter((h) => h.kind === k && !h.dead).length} ${FOES[k].name}`;
  }, `foe <kind> [n] [elite] [twisted] [menacing] [warden] [mod...] | boss: spawn any enemy near the Communicator (the dungeon foes too); \`warden\` makes it a Warden (Heavy at \`tier 3\`); \`elite twisted\` grows claws, \`elite menacing\` tentacles (P50); a beast mod forces it (P31: ${Object.keys(BEAST_MODS).join(' ')})`, { group: 'units' });
  command('twisted', ([n]) => {
    const c = sim.controller;
    for (let i = 0; i < Number(n ?? 3); i++) sim.spawnHornet(c.x + sim.r.range(-300, 300), c.y + sim.r.range(-300, -150), 0, false, true);
    return `${sim.twistedAlive} twisted`;
  }, 'twisted [n]: spawn n twisted mechahornets near the Communicator (any time of day)', { group: 'units' });
  command('spiders', ([n, how]) => {
    const c = sim.controller;
    const mode = how ?? 'plain';
    if (!['plain', 'twisted', 'elite', 'rim'].includes(mode)) return 'error: spiders [n] [plain|twisted|elite|rim]';
    for (let i = 0; i < Number(n ?? 3); i++) {
      if (mode === 'rim') spawnAtRim(sim, 'spider', c.x + sim.r.range(-400, 400), c.y + sim.r.range(-400, 400));
      else sim.spawnHornet(c.x + sim.r.range(-260, 260), c.y + sim.r.range(150, 320), 0, mode === 'elite', mode === 'twisted', 'spider');
    }
    return `${sim.hornets.filter((h) => h.spider).length} spiders (${sim.twistedAlive} twisted in all)`;
  }, 'spiders [n] [plain|twisted|elite|rim]: spawn n crawlcam spiders south of the Communicator (rim: leaping in over the nearest edge of the map)', { group: 'units', args: () => ['3', 'twisted', 'elite', 'rim'] });
  command('rim', ([n, kind]) => {
    const k = (kind ?? sim.biome.edge ?? sim.biome.foes[0][0]) as Enemy;
    if (!FOES[k]) return `error: rim [n] [kind]: no enemy ${kind}`;
    const c = sim.controller;
    for (let i = 0; i < Number(n ?? 1); i++) spawnAtRim(sim, k, c.x + sim.r.range(-400, 400), c.y + sim.r.range(-400, 400));
    return `${sim.hornets.filter((h) => h.rim && !h.dead).length} arrivals from off the map`;
  }, 'rim [n] [kind]: enemies arriving from off the map at the nearest edge (kind: any enemy; this land’s own by default)', { group: 'units', args: () => ['3', sim.biome.edge ?? sim.biome.foes[0][0]] });
  command('queen', () => {
    if (sim.boss) return 'error: the queen is already here';
    sim.spawnBoss(sim.biome.dusk ?? 'hornet');
    return 'the Hornet Queen arrives';
  }, 'queen: bring this land\'s dusk boss now (the Hornet Queen in the desert; the Ironback, Sir Lancelot-9, Ursa Polaris), from the nearest hive', { group: 'units' });
  command('hurt', ([name, n]) => {
    const b = sim.bots.find((x) => !x.dead && x.name.toLowerCase() === String(name ?? '').toLowerCase());
    if (!b) return `error: no robot named ${name} (${sim.bots.map((x) => x.name).join(', ')})`;
    sim.hurt(b, Number(n ?? 30));
    return `${b.name} oil ${Math.round(b.hp)}`;
  }, 'hurt <name> [oil]: drain a robot\'s oil by name (Communicator, Bellows, ...)', { group: 'units', args: () => sim.bots.map((b) => b.name) });
  // Downed robots (P5): one lies down at 0 oil; carry, fix and drop are the same rules the keys run (`sim/downed.ts`, `sim/use.ts`).
  const crewNamed = (name?: string) => (name === 'all' ? sim.fielded : sim.fielded.filter((x) => x.name.toLowerCase() === String(name ?? '').toLowerCase()));
  command('down', ([name]) => {
    const who = crewNamed(name).filter((b) => !b.downed);
    if (!who.length) return `error: down <name|all>: a robot not yet down (${sim.crew.map((x) => x.name).join(', ')})`;
    for (const b of who) sim.hurt(b, b.maxHp * 10);
    return who.map((b) => `${b.name} lies down`).join(', ');
  }, 'down <name|all>: a crew robot runs out of oil: it lies where it is (never destroyed); press Use beside it to fix it (8 s) or press again to carry it', { group: 'units', args: () => ['all', ...sim.crew.map((b) => b.name)] });
  command('carry', ([name]) => {
    const c = sim.controller;
    const b = name ? crewNamed(name).find((x) => x.downed) : downedNear(sim, c.x, c.y, 400);
    if (!b) return `error: carry [name]: a downed robot (${sim.fielded.filter((x) => x.downed).map((x) => x.name).join(', ') || 'none down; `down <name>` first'})`;
    pickUp(sim, c, b);
    return `carrying ${b.name}`;
  }, 'carry [name]: the Communicator picks up a downed robot (the nearest within 400 px, or by name, wherever it lies); Use puts it down', { group: 'units', args: () => sim.fielded.filter((b) => b.downed).map((b) => b.name) });
  command('drop', () => {
    const n = carriedBy(sim, sim.controller).length;
    putDown(sim, sim.controller);
    return n ? `put ${n} down` : 'nothing carried';
  }, 'drop: the Communicator puts down what he carries', { group: 'units' });
  command('fix', ([name]) => {
    const who = crewNamed(name).filter((b) => b.downed);
    if (!who.length) return `error: fix <name|all>: a downed robot (${sim.fielded.filter((x) => x.downed).map((x) => x.name).join(', ') || 'none down'})`;
    for (const b of who) fixed(sim, b);
    return who.map((b) => `${b.name} is back up`).join(', ');
  }, 'fix <name|all>: a downed robot stands up at once (no 8 s work)', { group: 'units', args: () => ['all', ...sim.fielded.filter((b) => b.downed).map((b) => b.name)] });
  command('wreck', ([role]) => {
    const r = (role || TYPE_WRECK.role[sim.biomeId] || 'lamplighter') as Role;
    if (!ROLES[r] || r === 'controller') return `error: wreck [role]: ${Object.keys(ROLES).filter((k) => k !== 'controller').join(', ')}`;
    const c = sim.controller;
    const b = layWreck(sim, r, `${ROLES[r].name} wreck`, c.x + 70, c.y);
    return `a ${ROLES[r].name} wreck lies beside you; Use mends it (${TYPE_WRECK.fix} s), its type is found when the lift docks`;
  }, 'wreck [role]: a type wreck of a robot type (default: this land\'s) lies beside the Communicator; mend it with Use as in the field', { group: 'units', args: () => Object.keys(ROLES).filter((k) => k !== 'controller') });
  command('ai', ([name, spec]) => {
    const b = sim.crew.find((x) => x.name.toLowerCase() === String(name ?? '').toLowerCase() || String(x.id) === name);
    if (!b) return `error: ai <bot> [spec|off]: ${sim.crew.map((x) => x.name).join(', ')}`;
    if (spec) sim.setSpec(b, spec === 'off' ? undefined : (spec as Bot['spec']));
    return explain(sim, b);
  }, 'ai <bot> [spec|off]: a robot\'s mind: its goal, what it does and why, its reaction delay, and the scores that chose its target (a spec, e.g. medic, sets its spec for this mission)', { group: 'units', args: () => sim.crew.map((b) => b.name) });
  command('stoke', ([name, on]) => {
    const who = String(name ?? '').toLowerCase() === 'all' ? sim.crew : sim.crew.filter((x) => x.name.toLowerCase() === String(name ?? '').toLowerCase() || String(x.id) === name);
    if (!who.length) return `error: stoke <bot|all> [on|off]: ${sim.crew.map((x) => x.name).join(', ')}`;
    for (const b of who) sim.setStoked(b, on ? on !== 'off' : !b.stoked);
    return who.map((b) => `${b.name} ${b.stoked ? 'stoked: +30% speed' + (b.spec === 'firebrand' ? ', damage and fire +30%' : '') : 'cold'}`).join('; ');
  }, 'stoke <bot|all> [on|off]: stoke a robot for this mission (+30% move speed, a Firebrand also +30% damage and a hotter fire), or let it go cold; the hub\'s `workshop stoke <uid>` pays the coal', { group: 'units', args: () => ['all', ...sim.crew.map((b) => b.name)] });
  command('source', ([name, what, id]) => {
    const u = sim.unitNamed(String(name ?? ''));
    if (!u) return `error: no unit "${name}" (a robot's name, or h<id> for an enemy: ${sim.hornets.slice(0, 4).map((h) => `h${h.id}`).join(' ')})`;
    if (what === 'remove') return sim.removeSource(u, String(id)), `removed ${id}`;
    const src = DEV_SOURCES[String(what)];
    if (!src) return `error: sources are ${Object.keys(DEV_SOURCES).join(', ')}`;
    sim.addSource(u, src);
    return `${what} on ${name}: ${JSON.stringify(sim.engine.inspect(u).sources)}`;
  }, 'source <unit> <id|remove <source id>>: add an effect source to a robot or enemy (a title, armour50, plating3, parry50, riders, lamp, ghostly); debugState().fx lists what each unit holds', { group: 'units', args: () => [...sim.bots.map((b) => b.name), ...Object.keys(DEV_SOURCES)] });
  command('status', ([name, id, stacks, secs, by]) => {
    const u = sim.unitNamed(String(name ?? ''));
    if (!u) return `error: no unit "${name}"`;
    if (!id || !(id in STATUSES)) return `error: statuses are ${Object.keys(STATUSES).join(', ')}`;
    const who = by ? sim.unitNamed(String(by)) : undefined;
    if (by && !who) return `error: no unit "${by}"`;
    sim.engine.apply(u, id as StatusId, { stacks: Number(stacks ?? 1), duration: secs ? Number(secs) : undefined, by: who });
    sim.drainFx();
    return JSON.stringify(sim.engine.inspect(u).statuses);
  }, 'status <unit> <id> [stacks] [seconds] [by]: apply a status (burning, chilled, frozen, wet, lit, blinded, marked, taunted ...) to a robot or enemy, optionally applied by another unit (taunted: the enemy goes for it; frozen: kick it to shatter it)', { group: 'units', args: () => [...sim.bots.map((b) => b.name), ...Object.keys(STATUSES)] });
  command('crew', ([name, n]) => {
    const b = sim.bots.find((x) => x.name.toLowerCase() === String(name ?? '').toLowerCase());
    if (!b) return 'error: no such robot';
    sim.assign(b.id, Number(n ?? 1));
    return `${b.name} in crew ${b.crew}`;
  }, 'crew <name> <0-3>: move a robot to a crew', { group: 'units', args: () => sim.crew.map((b) => b.name) });
  command('bot', ([role, spec, crew]) => {
    const r = String(role ?? '') as Role;
    if (!ROLES[r] || r === 'controller') return `error: bot <role> [spec] [crew 0-3]: ${(Object.keys(ROLES) as Role[]).filter((x) => x !== 'controller').join(', ')}`;
    const c = sim.controller, a = sim.crew.length * 2.4;
    const add = (sim as unknown as { addBot(r: Role, name: string, x: number, y: number, crew: number): Bot }).addBot.bind(sim);
    const b = add(r, `${ROLES[r].name} ${sim.crew.length + 1}`, c.x + Math.cos(a) * 80, c.y + Math.sin(a) * 60, Number(crew ?? 0));
    sim.setSpec(b, spec && spec !== 'off' ? (spec as Bot['spec']) : undefined); // dresses it: its type's and spec's effects go on
    play.botsView.add(b);
    return `${b.name} (${b.role}${b.spec ? ', ' + b.spec : ''}) joins crew ${b.crew}`;
  }, 'bot <role> [spec] [crew 0-3]: add a robot of any role (boilermancer, lamplighter, stalker ...) with a spec (scalder, beacon, executioner ...) beside the Communicator', { group: 'units', args: () => (Object.keys(ROLES) as Role[]).filter((x) => x !== 'controller') });
  command('party', ([n]) => {
    const want = Number(n ?? 20), roles: Role[] = ['gatherer', 'guard', 'repairer', 'marksman', 'mule', 'boilermancer', 'lamplighter', 'stalker'];
    if (!Number.isFinite(want) || want < 0) return 'error: party <n>';
    // Grow the party to n robots (3 crews round robin) beside the Communicator; a smaller n needs `seed` to restart the mission.
    const c = sim.controller, add = (sim as unknown as { addBot(r: Role, name: string, x: number, y: number, crew: number): Bot }).addBot.bind(sim);
    while (sim.crew.length < want) {
      const i = sim.crew.length, a = i * 2.4, ring = 70 + (i % 6) * 18;
      const b = add(roles[i % roles.length], `Test ${i + 1}`, c.x + Math.cos(a) * ring, c.y + Math.sin(a) * ring * 0.8, 1 + (i % 3));
      sim.setSpec(b, undefined); // dressed: its type's effects go on
      play.botsView.add(b);
    }
    return `${sim.crew.length} robots`;
  }, 'party <n>: grow the party to n robots (mixed roles, 3 crews) beside the Communicator; a smaller n needs `seed` to restart', { group: 'units', args: () => ['6', '12', '20', '30'] });
  command('send', ([n, what]) => {
    const crew = Number(n ?? 1);
    const p = what === 'lift' ? sim.lift : what === 'nest' ? sim.nests[0] : sim.seeps[Number(what ?? 0)] ?? sim.seeps[0];
    sim.order(crew, p.x, p.y);
    return `crew ${crew} to ${what ?? 'seep 0'}`;
  }, 'send <crew> [lift|nest|seep index]: order a crew somewhere', { group: 'units' });
  command('follow', ([n]) => {
    const crew = Number(n ?? 1);
    sim.follow(crew);
    return sim.following[crew] ? `crew ${crew} follows the Communicator` : 'error: follow <1-3>';
  }, 'follow <crew>: make a crew trail the Communicator (a right click on him in command mode); the next order ends it', { group: 'units' });
  command('kicklook', ([look, deg, hits]) => {
    if (look === 'pose' || look === 'legs') kickLook.now = look;
    else if (look) return 'error: kicklook [pose|legs] [degrees [hits]]';
    if (deg !== undefined) {
      // Play the kick's drawing alone (no hit): 0 is right, 90 down the screen, 180 left, 270 up.
      const a = (Number(deg) * Math.PI) / 180, c = sim.controller;
      c.face = Math.cos(a) >= 0 ? 1 : -1;
      play['commView'].event({ e: 'swing', by: c, a, hits: Number(hits ?? 0), kick: true } as unknown as SimEvent);
    }
    return `kick look: ${kickLook.now}`;
  }, 'kicklook [pose|legs] [degrees [hits]]: the kick\'s look (pose: his painted stride frame; legs: code-drawn legs; also ?kicklook=); with degrees (0 right, 90 down, 180 left, 270 up) plays the drawing alone, hits 1 shows the contact ring', { group: 'units', args: () => ['pose', 'legs'] });
  command('graft', ([what, kind]) => {
    const c = sim.controller;
    if (!what) return JSON.stringify(graftSummary(sim));
    if (what === 'grant') {
      sim.perks.add('grafting');
      return 'grafting granted for this mission (the perk comes with Gasket\'s capstone, gasket.3)';
    }
    if (what === 'off') {
      sim.graft = null;
      sim.grafts.length = 0;
      return 'no graft, no parts';
    }
    const k = (what === 'drop' || what === 'on' ? kind : what) as LimbKind;
    if (k !== 'claw' && k !== 'whip') return 'error: graft [grant|off|drop <claw|whip>|on <claw|whip>|claw|whip]';
    // A cat's limb at an elite's strength, lying 40 px east of him (`drop`), grafted on at once (`on`, or a bare kind).
    const g = layGraft(sim, k, 'cat', c.x + 40, c.y, devBlow(k));
    if (what === 'drop') return `a ${k} lies beside you (hold Use over it)`;
    graftOn(sim, g);
    return `a ${k} is grafted on`;
  }, 'graft [grant|off|drop <claw|whip>|on <claw|whip>]: Gasket\'s capstone (sim/graft.ts): `grant` the ability for this mission (the drops from broken elites need it), `drop` a limb lying beside him, `on` (or a bare `claw` / `whip`) graft one at once, `off` clear it; no argument shows the state', { group: 'units', args: () => ['grant', 'drop', 'on', 'claw', 'whip', 'off'] });
  command('tp', ([what]) => {
    if (placeIds.includes(what as PlaceId)) return goPlace(play, what as PlaceId);
    const p = what === 'lift' ? sim.lift : what === 'nest' ? sim.nests[0] : what === 'ruin' ? sim.ruins[0] : sim.seeps[Number(what ?? 0)] ?? sim.seeps[0];
    sim.controller.x = p.x;
    sim.controller.y = p.y + (what === 'ruin' ? RUIN.reach * 0.5 : 40);
    play.w.update();
    return `Communicator at ${Math.round(p.x)},${Math.round(p.y)}`;
  }, `tp [lift|nest|ruin|seep index|${placeIds.join('|')}]: move the Communicator there (a place: beside its thing)`, { group: 'units', args: () => ['lift', 'nest', 'ruin', ...placeIds] });
}
