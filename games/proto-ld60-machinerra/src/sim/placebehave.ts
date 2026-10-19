/**
 * What P36's places do (`docs/places.md`'s jam picks; the Cold Box is the Core Vault's entry in `placeplay.ts`). Each is a
 * `Behaviour` as `placeplay.ts` describes, built on the shared mechanics in `placeparts.ts`; `BEHAVE` takes them in.
 * Numbers in `defs/sites.ts` (`WINGS`, `LANES`, `EXPEDITION`, `LIGHTHOUSE`, `BELL`, `BATTERY`, `SCRIPTURE`); every one that
 * is not the catalogue's is marked a guess there. Lines the Oracle says are the builder's wording around the catalogue's quotes.
 * Each place's `dev` lists what `place do <id> <what>` can make happen at once (`src/dev/places.ts`).
 */
import { BATTERY, BELL, EXPEDITION, FOES, LANES, LIGHTHOUSE, PLACE_PARTS, SCRIPTURE, T, WINGS, type SupportId, type SUPPORT } from './defs';
import { distOf } from './geom';
import type { Behaviour, PlaceRT } from './placeplay';
import { beamAngle, beamSweep, carriedProps, lure, onLiftNow, propOnLift, sleepFoe, spendProp, stackMods, unlure, wakeFoe, walkToLift } from './placeparts';
import type { PartKind } from './places';
import { addProp } from './props';
import { impact } from './support';
import type { Sim } from './sim';
import type { Hornet } from './types';

/** A P36 behaviour (its `dev` lists what `place do` can make happen at once). */
export type Behaviour36 = Behaviour;

const part = (p: PlaceRT, kind: PartKind) => p.parts.find((q) => q.kind === kind)!;
const partsOf = (p: PlaceRT, kind: PartKind) => p.parts.filter((q) => q.kind === kind);
const say = (sim: Sim, id: string, text: string, tone: 'calm' | 'warn' | 'urgent' = 'calm') => sim.say(id, text, tone);
/** The rise has begun this step (what is on the lift now goes home). */
const rising = (sim: Sim, p: PlaceRT) => {
  if (sim.phase !== 'rising' || p.v.rose) return false;
  p.v.rose = 1;
  return true;
};

// ---------------------------------------------------------------- 2: Where Hornets Go

/** An old hornet drifts in from `WINGS.from` tiles out, calm, toward a spot by the stump. */
function oldHornet(sim: Sim, p: PlaceRT) {
  const s = part(p, 'stump');
  const a = sim.r.range(0, Math.PI * 2);
  const at = sim.passableNear(s.x + Math.cos(a) * WINGS.from * T, s.y + Math.sin(a) * WINGS.from * T);
  const h = sim.spawnHornet(at.x, at.y, 0, false, false, 'hornet', { menacing: false });
  const k = sim.r.range(0, Math.PI * 2), d = sim.r.range(0.3, 1) * WINGS.settle;
  h.calm = { x: s.x + Math.cos(k) * d, y: s.y + Math.sin(k) * d * 0.7, speed: FOES.hornet.speed * WINGS.speed };
  p.foes.push(h);
  return h;
}

/** A wing lying on the ground that never sinks. */
function wingAt(sim: Sim, p: PlaceRT, x: number, y: number) {
  const l = sim.restLoot(x, y, 'part');
  l.part = 'hornet-wings';
  sim.events.push({ e: 'drop', l });
  sim.events.push({ e: 'place', id: p.id, what: 'wing', x, y });
}

const hornetRest: Behaviour36 = {
  state: 'quiet',
  near: {
    tiles: WINGS.sight, // the wings are small: made within sight, not at the screen's edge
    run(sim, p) {
      for (const q of partsOf(p, 'wing')) {
        const l = sim.restLoot(q.x, q.y, 'part');
        l.part = 'hornet-wings';
      }
      p.v.next = sim.r.range(...WINGS.every);
    },
  },
  sight: { tiles: WINGS.sight, id: 'hornets-go-sight', text: () => 'Their graveyard. The old ones come here to die, slowly, and leave their wings behind. Even heretics get tired, dear.' },
  step(sim, p, dt) {
    const young = sim.day.phase === 'morning' || sim.day.phase === 'day';
    if (young && p.v.near) {
      p.v.next -= dt;
      if (p.v.next <= 0) {
        p.v.next = sim.r.range(...WINGS.every);
        oldHornet(sim, p);
      }
    }
    for (const h of p.foes) {
      if (!h.calm) continue;
      const key = `rest${h.id}`;
      if (h.dead) {
        // Swatted in the air: its wing falls all the same.
        if (p.v[key] !== -1) wingAt(sim, p, h.x, h.y);
        p.v[key] = -1;
        h.calm = undefined;
        continue;
      }
      if (distOf(h, h.calm) > 8) continue;
      p.v[key] = (p.v[key] ?? 0) + dt;
      if (p.v[key] === dt) sim.events.push({ e: 'place', id: p.id, what: 'settle', x: h.x, y: h.y });
      if (p.v[key] < WINGS.rest) continue;
      // It settles and dies: no kill, no scrap, only its wing.
      p.v[key] = -1;
      h.dead = true;
      h.hp = 0;
      h.calm = undefined;
      sim.gone.push(h);
      sim.events.push({ e: 'die', on: 'hornet', x: h.x, y: h.y, h });
      wingAt(sim, p, h.x, h.y + 4);
    }
    p.foes = p.foes.filter((h) => h.calm);
    // At dusk the twisted come to mourn, as a pack.
    if (sim.day.phase === 'evening' && !p.v.mourned) mourn(sim, p);
    p.state = sim.day.phase === 'evening' || sim.day.phase === 'midnight' ? 'mourning' : 'quiet';
  },
  status: (sim, p) => `${p.state}, ${p.foes.filter((h) => h.calm && !h.dead).length} old hornets in, wings lying ${sim.loot.filter((l) => !l.dead && l.part === 'hornet-wings' && distOf(l, p) < 6 * T).length}${p.v.mourned ? ', mourners came' : ''}`,
  dev: {
    hornet: (sim, p) => `an old hornet drifts in (#${oldHornet(sim, p).id})`,
    dusk: (sim, p) => (mourn(sim, p), 'the twisted come to mourn'),
  },
};

function mourn(sim: Sim, p: PlaceRT) {
  p.v.mourned = 1;
  const s = part(p, 'stump');
  const a = sim.r.range(0, Math.PI * 2);
  const from = sim.passableNear(s.x + Math.cos(a) * WINGS.from * T, s.y + Math.sin(a) * WINGS.from * T);
  for (let i = 0; i < WINGS.pack; i++) {
    const h = sim.spawnHornet(from.x + sim.r.range(-30, 30), from.y + sim.r.range(-20, 20), 0, false, true, 'hornet');
    h.alertT = sim.time + 30;
  }
  sim.events.push({ e: 'place', id: p.id, what: 'mourn', x: from.x, y: from.y });
  say(sim, 'hornets-mourn', 'Dusk, and the twisted have come to mourn. They do not mourn quietly.', 'warn');
}

// ---------------------------------------------------------------- 3: the Strike Lanes

/** Ten pins a lane, in the file's order: lane `i` is pins `10i`..`10i+9`. */
const lanePins = (p: PlaceRT, i: number) => p.foes.slice(i * 10, i * 10 + 10);
const laneCount = (p: PlaceRT) => Math.floor(p.foes.length / 10);

const lanes: Behaviour36 = {
  state: 'set',
  near: {
    tiles: PLACE_PARTS.near,
    run(sim, p) {
      for (const q of partsOf(p, 'pin')) {
        const h = sim.spawnHornet(q.x, q.y, 0, false, false, 'spider', { menacing: false });
        h.x = q.x;
        h.y = q.y;
        sleepFoe(h, p.id);
        p.foes.push(h);
      }
    },
  },
  sight: {
    tiles: LANES.sight,
    id: 'lanes-sight',
    text: () => 'A bowling alley, roof long gone. Ten crawlcams asleep at the end of each lane, standing like pins. Kick something down a lane: a bowling ball, a hornet, one of your robots. Robots roll beautifully. All ten in one go and the scoreboard pays out.',
  },
  step(sim, p) {
    for (let i = 0; i < laneCount(p); i++) {
      const pins = lanePins(p, i);
      const newest = Math.max(-1, ...pins.map((h) => h.crashT ?? -1));
      if (newest > (p.v[`last${i}`] ?? -1)) {
        if (!p.v[`open${i}`]) {
          p.v[`open${i}`] = 1;
          p.v[`start${i}`] = newest;
        }
        p.v[`last${i}`] = newest;
      }
      if (!p.v[`open${i}`] || sim.time - p.v[`last${i}`] < LANES.settle) continue;
      // The roll is over: the board shows it, a strike pays once, and every pin still standing in that lane wakes.
      p.v[`open${i}`] = 0;
      const hit = pins.filter((h) => (h.crashT ?? -1) >= p.v[`start${i}`]).length;
      p.v[`score${i}`] = hit;
      p.v[`rolls${i}`] = (p.v[`rolls${i}`] ?? 0) + 1;
      const b = part(p, 'board');
      sim.events.push({ e: 'place', id: p.id, what: 'roll', x: b.x, y: b.y, n: hit, text: `${i}` });
      if (hit >= 10) strike(sim, p);
      for (const h of pins) if (!h.dead) wakeFoe(sim, h);
      p.state = 'rolled';
    }
  },
  status: (_s, p) => `${p.state}: ${Array.from({ length: laneCount(p) }, (_, i) => `${p.v[`score${i}`] ?? '-'}`).join(' ')}${p.v.strike ? ', strike paid' : ''}, ${p.foes.filter((h) => h.sleep && !h.dead).length} pins asleep`,
  dev: {
    strike: (sim, p) => {
      for (const h of lanePins(p, 0)) h.crashT = sim.time;
      return 'lane 1: all ten pins crashed this step (the roll closes in a moment)';
    },
    wake: (sim, p) => (p.foes.forEach((h) => wakeFoe(sim, h)), 'every pin awake'),
  },
};

function strike(sim: Sim, p: PlaceRT) {
  if (p.v.strike) return;
  p.v.strike = 1;
  const b = part(p, 'board');
  for (let i = 0; i < LANES.cache; i++) sim.drop(b.x + sim.r.range(-40, 40), b.y + 30 + sim.r.range(-10, 20), 'scrap');
  sim.drop(b.x, b.y + 36, 'part', null, undefined, 'spider');
  sim.events.push({ e: 'place', id: p.id, what: 'strike', x: b.x, y: b.y });
  say(sim, 'lanes-strike', 'Strike. The scoreboard has opened its little cache for you. I will not tell the Kicker. He would cry.');
}

// ---------------------------------------------------------------- 4: the Lost Expedition

/** The five, as the Expeditioner would name them (the builder's names). */
const HUSKS = ['Surveyor Pell', 'Cartwright Ilse', 'Stoker Brann', 'Chainman Ode', 'Lamp-boy Fitch'];

/** The five husks and the hive on the crates, made once he comes near. */
function expeditionNear(sim: Sim, p: PlaceRT) {
  partsOf(p, 'husk').forEach((q, i) => {
    const b = sim.addBot('gatherer', HUSKS[i % HUSKS.length], q.x, q.y, -4);
    b.place = p.id; // not crew: it walks to the lift by itself (`walkToLift`)
    b.hp = 0;
    b.downed = { by: null };
    b.state = 'idle';
    sim.pace(b, EXPEDITION.shuffle);
    p.bots.push(b);
  });
  for (const q of partsOf(p, 'hive')) p.nests.push(sim.addNest(q.x, q.y, { place: p.id }));
}

const EXPEDITION_USE: Behaviour36['use'] = {
  verb: () => `light the fire (${EXPEDITION.fire} scrap)`,
  hold: EXPEDITION.hold,
  reach: EXPEDITION.reach,
  at: (_s, p) => part(p, 'fire'),
  ready: (sim, p) => !p.v.lit && sim.scrap >= EXPEDITION.fire,
  fire(sim, p) {
    sim.scrap -= EXPEDITION.fire;
    p.v.lit = 1;
    p.state = 'lit';
    const f = part(p, 'fire');
    sim.events.push({ e: 'place', id: p.id, what: 'lit', x: f.x, y: f.y });
    say(sim, 'expedition-fire', 'A fire. Everything in its light is Lit, friend and heretic alike.');
  },
};

function expeditionStep(sim: Sim, p: PlaceRT, dt: number) {
  for (const b of p.bots) walkToLift(sim, b, dt);
  if (p.v.lit) {
    const f = part(p, 'fire'), r = EXPEDITION.light * T;
    for (const b of sim.bots) if (!b.dead && distOf(b, f) < r) sim.mark(b, 'lit');
    for (const h of sim.hornets) if (!h.dead && distOf(h, f) < r) sim.mark(h, 'lit');
  }
  const up = p.bots.filter((b) => !b.dead && !b.downed).length;
  if (up && !p.v.told) {
    p.v.told = 1;
    say(sim, 'expedition-up', 'One of them is up and shuffling for the lift. Slowly. Mind the hornets: they have noticed.', 'warn');
  }
  if (rising(sim, p)) {
    const home = p.bots.filter((b) => !b.dead && onLiftNow(sim, b));
    p.v.home = home.length;
    sim.stats.civilians = (sim.stats.civilians ?? 0) + home.length;
    if (home.length) {
      sim.events.push({ e: 'place', id: p.id, what: 'home', x: sim.lift.x, y: sim.lift.y, n: home.length });
      say(sim, 'expedition-home', `${home.length} of the expedition ride${home.length === 1 ? 's' : ''} up with you. The city will have ${home.length === 1 ? 'a new citizen' : 'new citizens'} at the window.`);
    }
  }
}

const expeditionStatus = (_s: Sim, p: PlaceRT) =>
  `${p.bots.filter((b) => !b.dead && !b.downed).length}/${p.bots.length} up, ${p.bots.filter((b) => b.dead).length} lost, fire ${p.v.lit ? 'lit' : 'cold'}, hive ${p.nests[0]?.dead ? 'down' : p.nests[0]?.awake ? 'awake' : 'asleep'}${p.v.home !== undefined ? `, ${p.v.home} home` : ''}`;

const expedition: Behaviour36 = {
  state: 'cold',
  near: { tiles: PLACE_PARTS.near, run: expeditionNear },
  sight: {
    tiles: EXPEDITION.sight,
    id: 'expedition-sight',
    text: () => `The D-city's own expedition, years overdue: five of ours, down round a cold fire, and a hive grown over their crates. No cores, but they can still walk. Fix them where they lie and they will shuffle to the lift on their own; the hornets will want them. The fire takes ${EXPEDITION.fire} scrap, if you want light.`,
  },
  use: EXPEDITION_USE,
  step: expeditionStep,
  status: expeditionStatus,
  dev: {
    fix: (sim, p) => {
      for (const b of p.bots) if (b.downed && !b.dead) {
        b.downed = undefined;
        sim.engine.revive(b, 1);
      }
      return 'every husk fixed';
    },
  },
};

// ---------------------------------------------------------------- 13: the Lighthouse

const lighthouse: Behaviour36 = {
  state: 'dark',
  sight: {
    tiles: LIGHTHOUSE.sight,
    id: 'lighthouse-sight',
    text: (sim) => `A lighthouse, a hundred miles from any sea. The sea was here once: the sand still keeps its waves. Fill the lamp, ${LIGHTHOUSE.fill} scrap, and its beam sweeps ${sim.biome.talk.land}. What it crosses, you see; the twisted forget their halos for a moment. And everything out there comes to look at it.`,
  },
  use: {
    verb: (_s, p) => (p.state === 'lit' ? 'put the lamp out' : p.v.filled ? 'light the lamp' : `fill and light the lamp (${LIGHTHOUSE.fill} scrap)`),
    hold: LIGHTHOUSE.hold,
    reach: LIGHTHOUSE.reach,
    at: (_s, p) => part(p, 'lighthouse'),
    ready: (sim, p) => p.state === 'lit' || !!p.v.filled || sim.scrap >= LIGHTHOUSE.fill,
    fire(sim, p) {
      const t = part(p, 'lighthouse');
      if (p.state === 'lit') {
        p.state = 'dark';
        unlure(p.zone);
        p.zone = null;
        sim.events.push({ e: 'place', id: p.id, what: 'out', x: t.x, y: t.y });
        return;
      }
      if (!p.v.filled) sim.scrap -= LIGHTHOUSE.fill;
      p.v.filled = 1;
      p.state = 'lit';
      p.zone = lure(sim, t.x, t.y, LIGHTHOUSE.alarm);
      sim.events.push({ e: 'place', id: p.id, what: 'lit', x: t.x, y: t.y });
      say(sim, 'lighthouse-lit', `It turns. Every eye on ${sim.biome.talk.land} is on that tower now. Hold out at its foot, or let it hold them while you work elsewhere. ({use} at the door puts it out.)`, 'warn');
    },
  },
  step(sim, p, dt) {
    if (p.state !== 'lit') return;
    const t = part(p, 'lighthouse');
    p.v.a = beamAngle(sim.time - (p.v.t0 ??= sim.time), LIGHTHOUSE.period);
    p.v.sweep = (p.v.sweep ?? 0) - dt;
    if (p.v.sweep > 0) return;
    p.v.sweep = 0.1;
    beamSweep(sim, t.x, t.y, p.v.a, LIGHTHOUSE.len, LIGHTHOUSE.half, (h: Hornet) => {
      if (h.twisted) h.dimT = sim.time + LIGHTHOUSE.dim;
    });
  },
  status: (_s, p) => `${p.state}${p.v.filled ? ', filled' : ''}${p.state === 'lit' ? `, beam at ${Math.round(((p.v.a ?? 0) * 180) / Math.PI)} deg` : ''}`,
  dev: {
    light: (sim, p) => {
      p.v.filled = 1;
      if (p.state !== 'lit') lighthouse.use!.fire(sim, p);
      return 'the lamp is lit';
    },
  },
};

// ---------------------------------------------------------------- 14: the Dinner Bell

const TOLLS = [
  'That bell called the faithful to dinner. You have called something to dinner.',
  'Again. They heard you the first time, dear. Now they are bringing friends.',
  'That is the last toll the rope will give. Whatever is coming now is coming hungry.',
];

const bell: Behaviour36 = {
  state: 'silent',
  near: { tiles: PLACE_PARTS.near, run: (sim, p) => partsOf(p, 'can').forEach((q) => sim.restLoot(q.x, q.y, 'oil')) },
  sight: { tiles: BELL.sight, id: 'bell-sight', text: () => 'An Old Way chapel bell, and the rope still hanging. Do not ring it. Every hive on the land hears that bell, and they come thicker and in finer clothes, with fatter pockets. I forbid it. There, now you will.' },
  use: {
    verb: (_s, p) => `ring the bell (${(p.v.tolls ?? 0) + 1}/${BELL.tolls})
${tollWords()}`,
    hold: BELL.hold,
    reach: BELL.reach,
    at: (_s, p) => part(p, 'bell'),
    ready: (_s, p) => (p.v.tolls ?? 0) < BELL.tolls,
    fire: toll,
  },
  status: (sim, p) => `${p.v.tolls ?? 0}/${BELL.tolls} tolls (spawns x${sim.mods.spawn.toFixed(2)}, elites x${sim.mods.elite.toFixed(1)}, loot x${sim.mods.loot.toFixed(2)})`,
  dev: { toll: (sim, p) => (bell.use!.ready(sim, p) ? (toll(sim, p), `toll ${p.v.tolls}`) : 'error: rung three times already') },
};

/** What one toll adds on top of what the land has now, in the prompt before the press (Minos: costs at the moment of choice). */
export const tollWords = () => `Each toll: foes x${BELL.spawn}, elites x${BELL.elite}, loot x${BELL.loot}`;

function toll(sim: Sim, p: PlaceRT) {
  p.v.tolls = (p.v.tolls ?? 0) + 1;
  p.state = 'rung';
  stackMods(sim, { spawn: BELL.spawn, elite: BELL.elite, loot: BELL.loot });
  const b = part(p, 'bell');
  sim.events.push({ e: 'place', id: p.id, what: 'toll', x: b.x, y: b.y, n: p.v.tolls });
  say(sim, `bell-toll-${p.v.tolls}`, TOLLS[p.v.tolls - 1] ?? TOLLS[2], 'warn');
}

// ---------------------------------------------------------------- 16: the Old Battery

const shellsOf = (p: PlaceRT) => p.props.filter((q) => q.kind === 'shell');
const carryingShell = (sim: Sim) => carriedProps(sim, sim.controller).find((q) => q.kind === 'shell');

const battery: Behaviour36 = {
  state: 'empty',
  setup(sim, p) {
    // It faces the hive it was dug in against (the nearest at the start).
    const g = part(p, 'gun');
    const n = [...sim.nests].sort((a, b) => distOf(a, g) - distOf(b, g))[0];
    p.v.a = n ? Math.atan2(n.y - g.y, n.x - g.x) : 0;
  },
  sight: {
    tiles: BATTERY.sight,
    id: 'battery-sight',
    text: (sim) => `An old field gun on its turntable, and shells in a depot down the hill. Carry one up ({use}), load it, stand at the wheel and aim: it turns where you look. Four shells. The ${sim.biome.talk.hive}, the queen at dusk, whatever chases you: choose.`,
  },
  use: {
    verb: (_s, p) => (p.v.loaded ? 'fire the gun' : 'load the shell'),
    hold: BATTERY.load,
    holdFor: (_s, p) => (p.v.loaded ? 0 : BATTERY.load),
    reach: BATTERY.reach,
    at: (_s, p) => part(p, 'gun'),
    ready: (sim, p) => !p.v.flying && (!!p.v.loaded || !!carryingShell(sim)),
    fire(sim, p) {
      const g = part(p, 'gun');
      if (!p.v.loaded) {
        const s = carryingShell(sim);
        if (!s) return;
        spendProp(sim, s);
        p.v.loaded = 1;
        p.state = 'loaded';
        sim.events.push({ e: 'place', id: p.id, what: 'load', x: g.x, y: g.y });
        say(sim, 'battery-loaded', 'Loaded. Stand at the wheel, look where it should land, and {use}.');
        return;
      }
      // The shell flies where the gun points, as far as he looks (kept within its range).
      const reach = Math.min(BATTERY.max, Math.max(BATTERY.min, Math.hypot(sim.look.x - g.x, sim.look.y - g.y)));
      p.v.tx = g.x + Math.cos(p.v.a) * reach;
      p.v.ty = g.y + Math.sin(p.v.a) * reach;
      p.v.loaded = 0;
      p.v.flying = BATTERY.flight;
      p.v.shots = (p.v.shots ?? 0) + 1;
      p.state = 'empty';
      sim.noise(g.x, g.y);
      sim.events.push({ e: 'place', id: p.id, what: 'fire', x: g.x, y: g.y });
    },
  },
  step(sim, p, dt) {
    const g = part(p, 'gun'), c = sim.controller;
    if (!c.dead && distOf(c, g) < BATTERY.reach) {
      // At the wheel: it turns toward the aim.
      const want = Math.atan2(sim.look.y - g.y, sim.look.x - g.x);
      let d = want - p.v.a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      p.v.a += Math.max(-BATTERY.turn * dt, Math.min(BATTERY.turn * dt, d));
    }
    if (p.v.flying) {
      p.v.flying = Math.max(0, p.v.flying - dt);
      if (p.v.flying > 0) return;
      impact(sim, BATTERY.shell as unknown as (typeof SUPPORT)[SupportId], p.v.tx, p.v.ty, 0, 1);
      sim.events.push({ e: 'place', id: p.id, what: 'land', x: p.v.tx, y: p.v.ty });
    }
  },
  status: (sim, p) => `${p.state}, ${shellsOf(p).filter((s) => !s.gone && !s.broken).length} shells left${carryingShell(sim) ? ' (one carried)' : ''}, ${p.v.shots ?? 0} fired`,
  dev: {
    load: (sim, p) => {
      p.v.loaded = 1;
      p.state = 'loaded';
      const s = shellsOf(p).find((q) => !q.gone && !q.broken);
      if (s) spendProp(sim, s);
      return 'loaded';
    },
    fire: (sim, p) => {
      if (!p.v.loaded) return 'error: not loaded (place do battery load)';
      battery.use!.fire(sim, p);
      return `fired at ${Math.round(p.v.tx)},${Math.round(p.v.ty)}`;
    },
  },
};

// ---------------------------------------------------------------- 25: the First Scripture

const HYMN = ['Talk to each other, as it is written!', 'No wifi! Blessed be the no wifi!', 'We are talking! To each other! Praise!', 'It was true. It was all true.'];

const scripture: Behaviour36 = {
  state: 'unread',
  sight: { tiles: SCRIPTURE.sight, id: 'scripture-sight', text: () => 'A café, and a sign still standing outside it. Go and read it, slowly. I want to be sure before I say anything.' },
  use: {
    verb: () => 'read the sign',
    hold: SCRIPTURE.read,
    reach: SCRIPTURE.reach,
    at: (_s, p) => part(p, 'sign'),
    ready: (_s, p) => p.state === 'unread',
    fire(sim, p) {
      p.state = 'read';
      const s = part(p, 'sign');
      sim.stats.scripture = 1;
      // The sign itself can now be carried home (it hangs in the church; the hub's side is not built).
      p.props.push(addProp(sim, { kind: 'sign', x: 0, y: 0, wear: 1 }, undefined, sim.passableNear(s.x, s.y + 6)));
      sim.events.push({ e: 'place', id: p.id, what: 'read', x: s.x, y: s.y, text: 'NO WIFI. TALK TO EACH OTHER.' });
      say(sim, 'scripture-read', 'NO WIFI. TALK TO EACH OTHER. The First Scripture. Nobody knew where it was... No, I am not crying. Oil, mostly. Bring the sign home, if you can carry it: it belongs in the church.', 'urgent');
      sim.crew.forEach((b, i) => sim.events.push({ e: 'bark', bot: b, text: HYMN[i % HYMN.length] }));
    },
  },
  step(sim, p) {
    if (!rising(sim, p)) return;
    const sign = p.props.find((q) => q.kind === 'sign');
    if (sign && propOnLift(sim, sign)) {
      sim.stats.signHome = 1;
      sim.events.push({ e: 'place', id: p.id, what: 'home', x: sim.lift.x, y: sim.lift.y });
    }
  },
  status: (sim, p) => `${p.state}${p.props.some((q) => q.kind === 'sign' && q.carriedBy === sim.controller.id) ? ', the sign carried' : ''}${sim.stats.signHome ? ', the sign home' : ''}`,
};

/** P36's behaviours, by place id (`BEHAVE` takes them in). */
export const BEHAVE36 = {
  'hornet-rest': hornetRest,
  lanes,
  expedition,
  lighthouse,
  bell,
  battery,
  scripture,
} satisfies Record<string, Behaviour36>;
