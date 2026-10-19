/**
 * What each place does while the mission runs (`places.ts` has where they go and what they are made of). A behaviour is
 * data plus a few functions: the state it starts in, `setup` (make the Sim's things from its parts), a `sight` line the
 * Oracle says the first time the Communicator comes near, an optional timed Use action (`use`), a passive `step`.
 * The Sim runs them all (`Sim.placesStep`, `Sim.usePlace`); nothing here knows about Phaser.
 */
import { ARENA, BOSSES, CALM, CASTLE, COLDBOX, GRAVEYARD, HOT_SPRING, INSIGHT, LEVEL1, MAST, PILGRIM, PLACE_PARTS, ROLES, SHRINE, T, TYPE_WRECK, VAULT, WEAPONS, type Enemy, type WeaponId } from './defs';
import { NPCS, type NpcDef } from '../hub/state';
import { NAMES } from '../hub/workshop';
import { layWreck } from './downed';
import type { Spot } from './mapgen';
import type { PartKind, PlaceId } from './places';
import type { Bot, Hornet, Nest, Sim } from './sim';
import { addProp, type Prop, type Zone } from './props';
import type { PropKind } from './defs';
import { distOf } from './geom';
import { mastSees } from './fogplay';
import { hearFragment } from './questcount';
import { spawnBoss } from './boss';
import { spawnHornet } from './foes';
import { tie } from './leash';
import { BEHAVE36 } from './placebehave';
import { BEHAVE_Q } from './placequest';
import { lure, sleepFoe, unlure } from './placeparts';

/** A place in a running mission: where it is (px), what it is made of, and how far it has got. */
export interface PlaceRT {
  id: PlaceId;
  /** Centre, px. */
  x: number;
  y: number;
  parts: { kind: PartKind; x: number; y: number; prop?: PropKind }[];
  /** Its stage, in a word (shown by `debugState()`): `sealed` -> `open`, `stuck` -> `follow`, `dark` -> `lit`... */
  state: string;
  /** The Communicator has come near once (its `sight` line is said). */
  visited: boolean;
  /** The hives it made. */
  nests: Nest[];
  /** Level 1: Bellows lying at the `wreck` place; the Foreman standing guard at the `sprocket` place. */
  bot?: Bot;
  boss?: Hornet;
  /** P36: the props its `prop` parts made (in file order), the foes and robots it owns, its alarm, and its counters and timers by name. */
  props: Prop[];
  foes: Hornet[];
  bots: Bot[];
  zone?: Zone | null;
  v: Record<string, number>;
}

/** The stranded NPC (the pilgrim place): a robot that is not one of the crews until it is freed, and then only follows. */
export interface Pilgrim {
  bot: Bot;
  npc: NpcDef;
  state: 'stuck' | 'follow';
}

export interface UseDef {
  verb(sim: Sim, p: PlaceRT): string;
  /** The hold in this land, when it is not `hold` (level 1's mast decode takes longer). */
  holdFor?(sim: Sim, p: PlaceRT): number;
  /** The press that starts the action (level 1's mast pings the hive then). */
  start?(sim: Sim, p: PlaceRT): void;
  /** While the action runs, every `DECODE.ping` s it calls the foes near to the Communicator, as a live ruin's decode does. */
  pulls?(sim: Sim, p: PlaceRT): boolean;
  /** Seconds the timed action takes once started with a press of Use (it runs while he stays in the zone: `ACTION`), and how near (px) he must stand to what `at` returns to start it. */
  hold: number;
  /** Not timed: the first press asks "<verb>?", a second within `ACTION.confirm` s does it (the way down into a dungeon). */
  confirm?: boolean;
  reach: number;
  at(sim: Sim, p: PlaceRT): Spot;
  ready(sim: Sim, p: PlaceRT): boolean;
  fire(sim: Sim, p: PlaceRT): void;
}
export interface Behaviour {
  state: string;
  setup?(sim: Sim, p: PlaceRT): void;
  step?(sim: Sim, p: PlaceRT, dt: number): void;
  /** The Oracle speaks when the Communicator first comes within `tiles`. */
  sight?: { tiles: number; id: string; text(sim: Sim, p: PlaceRT): string; tone?: 'calm' | 'warn' | 'urgent' };
  use?: UseDef;
  /**
   * What is made only once the Communicator first comes within `tiles` (P36: the pins, the husks, the wings), so a land
   * does not carry a place's crowd from the first step; `PLACE_NEAR` (defs/sites.ts) is beyond the screen's edge.
   */
  near?: { tiles: number; run(sim: Sim, p: PlaceRT): void };
  /** One line for `debugState()` and `place list`. */
  status?(sim: Sim, p: PlaceRT): string;
  /** Dev (P36): what `place do <id> <what>` makes happen at once; each returns its line. */
  dev?: Record<string, (sim: Sim, p: PlaceRT) => string>;
}

const p0 = (sim: Sim) => sim.places.find((q) => q.id === 'sprocket');
const part = (p: PlaceRT, kind: PartKind) => p.parts.find((q) => q.kind === kind)!;

/** The nearest hive still asleep to a point (the hives that belong to a place are not the land's own). */
function nearestSleeper(sim: Sim, at: Spot) {
  return sim.nests.filter((n) => !n.awake && !n.dead && !n.place).sort((a, b) => distOf(a, at) - distOf(b, at))[0] ?? null;
}

/** What the Oracle says of each land's shrine gun (`BIOMES.<biome>.shrine`) when the case opens; how to fire it follows. */
const SHRINE_GUN: Partial<Record<WeaponId, string>> = {
  steamGun: 'A steam gun, brass and loud. It spends steam, and steam comes back.',
  arcGun: 'A Leyden arc-gun: two glass jars and a copper horn. It spits lightning, and a lucky bolt jumps to the next beast. The boars hate it.',
  pistonCannon: 'A piston cannon. Slow, heavy, and every slug lands like a falling tram. The commuters will not get up from it.',
  kettleScalder: 'A kettle scalder: a spray of boiling water, close in. Up here the warmest thing you own, and the white bear hates it.',
  censerGun: 'A censer gun. It shoots blessed embers, and the vampires of the Wastes burn like old paper.',
  ectoRepeater: 'An Ecto-repeater, under glass all this time. Its bolts are wisp-light: they land on ghosts.',
};
/** "a steam gun", "an ecto-repeater". */
const aName = (w: WeaponId) => {
  const n = WEAPONS[w].name.toLowerCase();
  return `${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n}`;
};

const tileOf = (px: number) => px / T - 0.5;
/** "north", "south-east": where `to` lies from `from`. */
function compass(from: Spot, to: Spot) {
  const dirs = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
  return dirs[(Math.round(Math.atan2(to.y - from.y, to.x - from.x) / (Math.PI / 4)) + 8) % 8];
}

/**
 * Level 1's mast, decoded: the map lights the hive, the tap and Sprocket's signal; the Oracle says where she is pinned and whose nest this is
 * (the Hornet Queen, the desert's, who is not in level 1).
 */
function level1Reveal(sim: Sim, p: PlaceRT, m: Spot) {
  mastSees(sim, m.x, m.y);
  const R = LEVEL1.reveal;
  for (const n of sim.nests) if (!n.dead && !n.place) sim.fog.reveal(tileOf(n.x), tileOf(n.y), R.hive);
  for (const s of sim.seeps) if (s.kind === 'crude') sim.fog.reveal(tileOf(s.x), tileOf(s.y), R.tap);
  const sp = sim.places.find((q) => q.id === 'sprocket');
  sim.releaseSignals();
  sim.events.push({ e: 'place', id: 'mast', what: 'climb', x: m.x, y: m.y });
  sim.say('mast-decoded', sp ? `Done: the ${sim.biome.talk.hive}, the tap and a signal ${compass(m, sp)} of here. Someone is pinned under a wreck, and a foreman sits on it. That nest is the Hornet Queen's: bring her down one day, and the Wanderer flies on.` : `Done: the ${sim.biome.talk.hive} and the tap are on your map.`, 'warn');
}

/**
 * The Hot Spring (P31; `HOT_SPRING`): while the Communicator stands in its pool (`HOT_SPRING.pool` tiles) his Chill is stripped and
 * his oil mends `HOT_SPRING.heal` a second. No "no enemy near" rule (the graveyard's). `p.state` is `calm` while he is in it.
 */
export function hotSpring(sim: Sim, p: PlaceRT, dt: number) {
  const c = sim.controller;
  const inside = !c.dead && c.hp > 0 && sim.downT <= 0 && distOf(c, p) <= HOT_SPRING.pool * T;
  if (inside !== (p.state === 'calm')) {
    p.state = inside ? 'calm' : 'quiet';
    sim.events.push({ e: 'place', id: p.id, what: inside ? 'calm' : 'quiet', x: p.x, y: p.y });
  }
  if (!inside) return;
  if (sim.engine.stacks(c, 'chilled')) sim.engine.strip(c, 'chilled');
  sim.engine.heal(c, HOT_SPRING.heal * dt, c);
}

/**
 * The graveyard's calm (P36; `CALM`): while the Communicator stands in it (`GRAVEYARD.rest` tiles) with no enemy within
 * `CALM.calm` tiles of him, his oil refills and a grave lights every `CALM.light` s of it; the third lit gives him
 * `CALM.maxOil` max oil for the rest of the mission. Time keeps passing. `p.state` is `calm` while it holds.
 */
export function graveyardCalm(sim: Sim, p: PlaceRT, dt: number) {
  const c = sim.controller;
  const graves = p.parts.filter((q) => q.kind === 'grave').length;
  const inside = !c.dead && c.hp > 0 && sim.downT <= 0 && distOf(c, p) < GRAVEYARD.rest * T;
  const calm = inside && !sim.hornets.some((h) => !h.dead && distOf(h, c) < CALM.calm * T);
  if (calm !== (p.state === 'calm')) {
    p.state = calm ? 'calm' : 'quiet';
    if (calm) sim.events.push({ e: 'place', id: p.id, what: 'calm', x: p.x, y: p.y });
  }
  if (!calm) return;
  sim.engine.heal(c, CALM.refill * sim.engine.stat(c, 'graveyardHeal', 1) * dt, c); // Keeper of the Shoot
  const lit = p.v.lit ?? 0;
  if (lit >= graves) return;
  p.v.t = (p.v.t ?? 0) + dt;
  if (p.v.t < CALM.light) return;
  p.v.t = 0;
  p.v.lit = lit + 1;
  const g = p.parts.filter((q) => q.kind === 'grave')[lit];
  sim.events.push({ e: 'place', id: p.id, what: 'grave', x: g.x, y: g.y, n: p.v.lit });
  if (p.v.lit === 1) sim.say('grave-lit', 'A light on a grave. They do that when someone sits with them a while. Stay, if you can spare the time.', 'calm');
  if (p.v.lit >= CALM.lit && !p.v.granted) {
    p.v.granted = 1;
    sim.engine.addSource(c, { id: 'place:graveyard', effects: [{ when: 'always', do: { do: 'stat', stat: 'maxHp', add: CALM.maxOil } }] });
    sim.say('graves-lit', `All three lit. They have lent you room for ${CALM.maxOil} more oil, for the rest of today. Seven would have made a speech. Be grateful I do not.`, 'calm');
  }
}

/** The first in-mission rescue: the next NPC of the hub's roster who is not aboard yet, held at the rim of a far hive. */
const pilgrimBehaviour: Behaviour = {
  state: 'absent',
  setup(sim, p) {
    const npc = sim.pilgrimId === undefined ? NPCS.find((n) => !n.always && !n.story && !sim.aboard.includes(n.id)) : NPCS.find((n) => n.id === sim.pilgrimId);
    if (!npc) return; // everyone is aboard already
    const at = part(p, 'pilgrim');
    const bot = sim.makeBot('gatherer', npc.name, at.x, at.y, -2);
    sim.pace(bot, PILGRIM.speed);
    sim.pilgrim = { bot, npc, state: 'stuck' };
    p.state = 'stuck';
  },
  sight: {
    tiles: PILGRIM.sight,
    id: 'pilgrim-sight',
    text: (sim) =>
      sim.pilgrim
        ? `${sim.pilgrim.npc.name} is wedged in the cables at the edge of that ${sim.biome.talk.hive}: damaged, praying, and in no condition to run. Free it and walk it to the lift. It will keep up, if you do not hurry.`
        : '',
  },
  use: {
    verb: (sim) => `free ${sim.pilgrim?.npc.name ?? 'the pilgrim'}`,
    hold: PILGRIM.hold,
    reach: PILGRIM.reach,
    at: (sim, p) => sim.pilgrim?.bot ?? p,
    ready: (sim) => sim.pilgrim?.state === 'stuck',
    fire(sim, p) {
      const pil = sim.pilgrim!;
      pil.state = 'follow';
      p.state = 'follow';
      sim.events.push({ e: 'place', id: 'pilgrim', what: 'free', x: pil.bot.x, y: pil.bot.y, text: pil.npc.intro });
      sim.say('pilgrim-free', `${pil.npc.name} is loose and will follow you. Get it onto the lift before you rise, or it stays on ${sim.biome.talk.land}.`);
    },
  },
  step(sim, p, dt) {
    const pil = sim.pilgrim;
    if (!pil || pil.state !== 'follow') return;
    const b = pil.bot;
    b.moving = false;
    if (sim.phase === 'rising' && !sim.onLift(b, 1.6)) sim.say('pilgrim-left', `${pil.npc.name} did not make the lift. I will light a candle. A small one.`, 'warn');
    if (sim.phase === 'rising' || sim.phase === 'done' || sim.controller.dead) return;
    const c = sim.controller;
    if (distOf(b, c) > PILGRIM.follow) sim.go(b, c.x, c.y, dt, PILGRIM.follow);
    if (b.moving && Math.abs(c.x - b.x) > 2) b.face = c.x > b.x ? 1 : -1;
    else if (!b.moving) b.face = c.x >= b.x ? 1 : -1;
  },
  status: (sim, p) => (sim.pilgrim ? `${p.state} (${sim.pilgrim.npc.id}${sim.rescued.length ? ', aboard' : ''})` : 'absent (everyone is aboard)'),
};

export const BEHAVE: Record<PlaceId, Behaviour> = {
  // P36's places (`placebehave.ts`).
  ...BEHAVE36,
  // P42's quest-only places (`placequest.ts`).
  ...BEHAVE_Q,
  // The first weapon find. The case is an old-Way relic; opening it takes a long, loud job, and the hives around it wake.
  shrine: {
    state: 'sealed',
    setup(sim, p) {
      for (const q of p.parts) if (q.kind === 'hive') p.nests.push(sim.addNest(q.x, q.y, { place: 'shrine', hp: SHRINE.hiveHp, scale: SHRINE.hiveScale }));
    },
    sight: {
      tiles: SHRINE.sight,
      id: 'shrine-sight',
      text: (sim) => `That is an Old Way shrine: ${aName(sim.biome.shrine)} under glass, and four small ${sim.biome.talk.hives} that fell asleep guarding it. Open the case and they wake. I would open the case. It is a gun.`,
    },
    use: {
      verb: () => 'open the case',
      hold: SHRINE.hold,
      reach: SHRINE.reach,
      at: (_s, p) => part(p, 'case'),
      ready: (_s, p) => p.state === 'sealed',
      fire(sim, p) {
        p.state = 'open';
        const gun = sim.biome.shrine;
        sim.give(gun);
        sim.said.add('wake'); // this wake has its own line
        const c = part(p, 'case');
        sim.events.push({ e: 'place', id: 'shrine', what: 'open', x: c.x, y: c.y, text: gun });
        const how = sim.secondary === gun ? '{fire2} to shoot it.' : sim.weapon === gun ? '{fire} to shoot it.' : 'It is in your pack ({inventory}).';
        sim.say('shrine-open', `${SHRINE_GUN[gun] ?? `${WEAPONS[gun].name}.`} ${how} The ${sim.biome.talk.hives} have woken: do not stand there admiring it.`, 'warn');
        for (const n of p.nests) {
          sim.wake(n, 'the shrine');
          for (let i = 0; i < SHRINE.burst; i++) sim.spawnHornet(n.x + sim.r.range(-14, 14), n.y - 10, n.id);
        }
      },
    },
    status: (_s, p) => p.state,
  },

  pilgrim: pilgrimBehaviour,

  // A resting place: old Communicators, one can left lying (the first; the other two tins hold scrap), lanterns. The Oracle is dry about it.
  graveyard: {
    state: 'quiet',
    setup(sim, p) {
      p.parts.filter((q) => q.kind === 'can').forEach((q, i) => sim.restLoot(q.x, q.y, i === 0 ? 'oil' : 'scrap'));
    },
    sight: {
      tiles: GRAVEYARD.sight,
      id: 'graveyard-sight',
      text: () => 'The Communicators who came before you. That was Seven. He liked you very much, and ignored every word I said. Do take his oil, dear: he is not using it.',
    },
    // The calm (P36; systems.md, Calm and secrets): no enemy near him in the graveyard, and his oil refills, the graves light one by one, three lit raise his oil.
    step: graveyardCalm,
    dev: {
      light: (_s, p) => ((p.v.t = CALM.light), 'the next grave lights at the next calm step (stand in the graveyard)'),
      lightall: (sim, p) => {
        p.v.lit = p.parts.filter((q) => q.kind === 'grave').length - 1;
        p.v.t = CALM.light;
        return 'every grave but one lit: the last lights at the next calm step, and the max oil comes with it';
      },
    },
    status: (_s, p) => `${p.visited ? 'visited' : 'quiet'}${p.state === 'calm' ? ', calm' : ''}, ${p.v.lit ?? 0}/${p.parts.filter((q) => q.kind === 'grave').length} graves lit${p.v.granted ? `, +${CALM.maxOil} max oil` : ''}`,
  },

  // The Parable Trail is three ordinary ruins in a row (`TRAIL` in defs.ts, the search in `Sim.search`): nothing to run.
  trail: {
    state: 'verse 0/3',
    status: (sim) => `verse ${sim.ruins.filter((r) => r.trail !== undefined && r.searched).length}/3`,
  },

  // A landmark phone mast. Climbing it shows every hive; the light wakes the nearest.
  // The way down into the biome's dungeon (sim/dungeon.ts). Pressing Use twice goes down: Play puts the land to sleep and runs
  // the dungeon as its own scene; climbing back out wakes the land (`cleared` once its mini-boss is down).
  dungeon: {
    state: 'open',
    sight: { tiles: 8, id: 'dungeon-sight', text: (sim) => sim.entranceDef().sight, tone: 'warn' },
    use: {
      verb: (sim) => sim.entranceDef().verb,
      hold: 0,
      confirm: true,
      reach: 74,
      at: (_s, p) => part(p, 'shaft'),
      ready: (_s, p) => p.state === 'open',
      fire(sim, p) {
        const at = part(p, 'shaft');
        sim.events.push({ e: 'place', id: 'dungeon', what: 'descend', x: at.x, y: at.y });
      },
    },
    status: (_s, p) => p.state,
  },

  // The Core Vault (P17): a smart icebox whose brain is an AI core. Prying the door open is a long, loud job: the core
  // comes out, the nearest sleeping hive wakes, and one elite comes with it. The core is one more bot on the lift.
  // P36 (places.md 1, the Cold Box): the fridge is a kickable prop, and once pried its alarm calls every foe near to it until it is kicked over or broken.
  'core-vault': {
    state: 'sealed',
    setup(sim, p) {
      const v = part(p, 'vault');
      p.props.push(addProp(sim, { kind: 'fridge', x: 0, y: 0, wear: 1 }, undefined, { x: v.x, y: v.y }));
    },
    step(sim, p) {
      const f = p.props[0];
      if (!p.v.alarm || !f || (!f.fling && !f.broken)) return;
      p.v.alarm = 0;
      unlure(p.zone);
      p.zone = null;
      sim.events.push({ e: 'place', id: p.id, what: 'quiet', x: f.x, y: f.y });
      sim.say('vault-quiet', f.broken ? 'Broken, and quiet at last.' : 'Over it goes, and quiet at last. It was out of milk anyway.');
    },
    sight: {
      tiles: VAULT.sight,
      id: 'vault-sight',
      text: (sim) => `An icebox, out here, still humming. Its brain is an AI core, and a core is one more robot on the lift. It will not give it up quietly: pry the door open and the nearest ${sim.biome.talk.hive} wakes, with something bigger than the rest. And it will complain until you kick it over.`,
    },
    use: {
      verb: () => 'pry the door open',
      hold: VAULT.hold,
      reach: VAULT.reach,
      at: (_s, p) => p.props[0] ?? part(p, 'vault'),
      ready: (_s, p) => p.state === 'sealed' && !p.props[0]?.broken,
      fire(sim, p) {
        p.state = 'open';
        const f = p.props[0];
        const v = f ? { x: f.x, y: f.y } : part(p, 'vault');
        sim.dropCore(v.x, v.y + 30);
        const n = nearestSleeper(sim, v);
        sim.said.add('wake'); // this wake has its own line
        sim.events.push({ e: 'place', id: 'core-vault', what: 'open', x: v.x, y: v.y });
        sim.say('vault-open', `The door gave. There: a core, warm as bread. Take it before it thinks better of it. ${n ? `The ${sim.biome.talk.hive} nearby has heard, and it is sending one of its best.` : 'Something big has heard the door.'}`, 'warn');
        const from = n ?? { x: v.x + 120, y: v.y - 60 };
        if (n) sim.wake(n, 'the vault');
        sim.spawnHornet(from.x + sim.r.range(-14, 14), from.y - 10, n?.id ?? 0, true);
        // The alarm (P36): "You are out of milk." on a loop, calling every foe near with no one to hunt, until the fridge is kicked over.
        p.v.alarm = 1;
        p.zone = lure(sim, v.x, v.y, COLDBOX.alarm);
        sim.events.push({ e: 'place', id: p.id, what: 'alarm', x: v.x, y: v.y });
      },
    },
    status: (_s, p) => `${p.state}${p.v.alarm ? ', alarm on' : ''}${p.props[0]?.broken ? ', fridge broken' : p.props[0]?.fling ? ', kicked' : ''}`,
  },

  mast: {
    state: 'dark',
    sight: {
      tiles: MAST.sight,
      id: 'mast-sight',
      text: (sim) => `A phone mast. Heresy, but useful. Climb it and every ${sim.biome.talk.hive} on ${sim.biome.talk.land} shows on your map; the light will wake the nearest one, naturally.`,
    },
    use: {
      verb: (sim) => (sim.land?.id === 'level1' ? 'wake the mast' : 'climb the mast'),
      hold: MAST.hold,
      holdFor: (sim) => (sim.land?.id === 'level1' ? LEVEL1.decode : MAST.hold),
      pulls: (sim) => sim.land?.id === 'level1',
      start(sim, p) {
        if (sim.land?.id !== 'level1') return;
        // Level 1's decode is loud from the first second: it wakes the nearest hive, whatever the hour, and calls its hornets in.
        const m = part(p, 'mast');
        const n = nearestSleeper(sim, m);
        sim.said.add('wake');
        if (!n) return;
        sim.wake(n, 'the mast');
        for (let i = 0; i < LEVEL1.burst; i++) sim.spawnHornet(n.x + sim.r.range(-14, 14), n.y - 10, n.id);
      },
      reach: MAST.reach,
      at: (_s, p) => part(p, 'mast'),
      ready: (_s, p) => p.state === 'dark',
      fire(sim, p) {
        p.state = 'lit';
        sim.addInsight(INSIGHT.mast);
        const m = part(p, 'mast');
        if (sim.land?.id === 'level1') return void level1Reveal(sim, p, m);
        const n = nearestSleeper(sim, m);
        sim.said.add('wake');
        sim.events.push({ e: 'place', id: 'mast', what: 'climb', x: m.x, y: m.y });
        mastSees(sim, m.x, m.y);
        hearFragment(sim, 'mast');
        sim.say('mast-climb', `There. Every ${sim.biome.talk.hive} is on your map ({map}), and one of them is looking at you. I did say the light carries.`, 'warn');
        if (n) {
          sim.wake(n, 'the mast');
          for (let i = 0; i < MAST.burst; i++) sim.spawnHornet(n.x + sim.r.range(-14, 14), n.y - 10, n.id);
        }
      },
    },
    status: (_s, p) => p.state,
  },

  // Level 1's first friend (P9): Bellows, a gatherer, lies at his wreck as a downed robot with two hornets pecking at him. A free
  // 3 s field fix stands him up (E, stay in the zone: the downed fix, `LEVEL1.fix`); he brings his own core and is always aboard after.
  wreck: {
    state: 'down',
    step(sim, p) {
      const w = part(p, 'wreck');
      if (!p.bot) {
        const b = (p.bot = sim.addBot('gatherer', 'Bellows', w.x, w.y + 8, 0));
        b.hp = 0;
        b.downed = { by: null, fix: LEVEL1.fix, wreck: true };
        b.state = 'idle';
        for (let i = 0; i < LEVEL1.strays.count; i++) {
          const h = spawnHornet(sim, w.x + (i ? 34 : -30), w.y - 34 + i * 10, 0, false, false, 'hornet');
          tie(h, w, LEVEL1.strays);
        }
        return;
      }
      if (p.state === 'down' && !p.bot.downed) {
        p.state = 'up';
        sim.events.push({ e: 'place', id: 'wreck', what: 'free', x: p.bot.x, y: p.bot.y, text: 'Praise the visible gear! I am... a gatherer, I think.' });
      }
    },
    status: (_s, p) => p.state,
  },

  // A type wreck (D2): the biome's new robot type lies downed here (`TYPE_WRECK.role`), mended by the same free field fix as Bellows;
  // standing up gives its core, the type is found (`Sim.found`, the haul's `fetched`) and buildable at the bench from then on.
  // A type already found leaves only the heap: nothing lies here, and the map shows no signal.
  'type-wreck': {
    state: 'down',
    step(sim, p) {
      const role = TYPE_WRECK.role[sim.biomeId];
      if (!role || sim.typesKnown.has(role)) {
        p.state = 'empty';
        return;
      }
      const w = part(p, 'wreck');
      if (!p.bot) {
        p.bot = layWreck(sim, role, NAMES[role][0], w.x, w.y + 8);
        return;
      }
      if (p.state === 'down' && !p.bot.downed) {
        p.state = 'up';
        sim.events.push({ e: 'place', id: 'type-wreck', what: 'free', x: p.bot.x, y: p.bot.y, text: `${p.bot.name} stands up: ${ROLES[role].name} plans are ours now.` });
      }
    },
    sight: {
      tiles: TYPE_WRECK.sight,
      id: 'type-wreck-sight',
      text: (sim) => {
        const role = TYPE_WRECK.role[sim.biomeId];
        return role && !sim.typesKnown.has(role) ? `A ${ROLES[role].name} lies here, down but whole. Stand beside it and mend it (E), and the bench can build more of its kind.` : '';
      },
    },
    status: (_s, p) => `${p.state}${p.bot ? ` (${p.bot.name}, ${p.bot.role})` : ''}`,
  },

  // Level 1's rescue (P9): Sprocket, pinned under a wreck guarded by the Hive Foreman (`leash.ts`: it wakes when a robot comes near
  // and never follows off its ground). Beat it and her cables fall; then she is freed as any pilgrim is, and follows. Level 1 is
  // guided: she is aboard even if the lift left her (`Sim.rescued`).
  sprocket: {
    state: 'absent',
    setup(sim, p) {
      pilgrimBehaviour.setup!(sim, p);
      if (sim.pilgrim) p.state = 'guarded';
    },
    sight: { tiles: PILGRIM.sight, id: 'sprocket-sight', text: (sim) => (sim.pilgrim && p0(sim)?.state === 'guarded' ? 'A hornet the size of a tram, sitting on a wreck, and someone pinned under it. That is the Foreman. He rears before he rams.' : ''), tone: 'warn' },
    step(sim, p, dt) {
      const at = part(p, 'wreck');
      if (p.state === 'guarded') {
        const f = (p.boss ??= spawnBoss(sim, 'foreman', { x: at.x, y: at.y }, { leash: LEVEL1.foreman }));
        if (f.target && !sim.said.has('foreman-wake')) sim.say('foreman-wake', BOSSES.foreman!.arrive, 'warn');
        if (f.dead) {
          p.state = 'pinned';
          sim.events.push({ e: 'place', id: 'sprocket', what: 'cables', x: at.x, y: at.y });
          sim.say('foreman-down', 'The Foreman is scrap, and the cables have gone slack. Go and let her out.', 'warn');
        }
      }
      if (sim.land?.guided && sim.phase === 'rising') sim.said.add('pilgrim-left'); // the Wanderer's grapple fetches her
      pilgrimBehaviour.step!(sim, p, dt);
    },
    use: {
      ...pilgrimBehaviour.use!,
      verb: () => 'free Sprocket',
      ready: (sim, p) => p.state === 'pinned' && sim.pilgrim?.state === 'stuck',
    },
    status: (sim, p) => `${p.state}${p.boss ? (p.boss.dead ? ', foreman down' : ', foreman up') : ''}${sim.pilgrim ? '' : ' (aboard already)'}`,
  },

  stage: arena('gorilla', 'An old stage in a clearing, a spotlight still flickering. Something has been performing here: the boards are dented in the shape of knuckles. Whatever it is, it comes back at dusk.'),
  plaza: arena('knight', 'A museum, and a plaza with a fountain. Hoofprints in the dust, and a lance mark in every parked car. Its keeper rides back at dusk. If he charges you here, stand in front of something hard and step aside.'),
  lake: arena('bear', 'A frozen lake below a hangar in the glacier. Something huge slides across it: there are grooves in the ice, ending in the rocks. It comes back at dusk. Kick anything on the ice and it goes far.'),

  // The Frostspine's Hot Spring (P31; biomes.md Places; Minos, D46 r22): a warm pool. Standing in it clears Chill and heals; it is
  // warmth for the cold (`twists.ts` `warmAt`). Bleaters graze round it, asleep until a hit or a noise.
  spring: {
    state: 'quiet',
    near: {
      tiles: PLACE_PARTS.near,
      run(sim, p) {
        for (let i = 0; i < HOT_SPRING.herd; i++) {
          const a = sim.r.range(0, Math.PI * 2), d = sim.r.range(...HOT_SPRING.graze) * T;
          const at = sim.passableNear(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * 0.8);
          const h = sim.spawnHornet(at.x, at.y, 0, false, undefined, 'bleater', { menacing: false });
          sleepFoe(h, 'spring');
          p.foes.push(h);
        }
      },
    },
    sight: {
      tiles: HOT_SPRING.sight,
      id: 'spring-sight',
      text: () => 'Steam, up here? A hot spring. Stand in it a while: the cold comes off you, and the warm water mends what it can. The bleaters know it too. Let them graze.',
      tone: 'calm',
    },
    step: hotSpring,
    status: (_s, p) => `${p.visited ? 'visited' : 'quiet'}${p.state === 'calm' ? ', bathing' : ''}, ${p.foes.filter((h) => !h.dead && h.sleep).length} bleaters grazing`,
  },

  // The Ether's false church (P44): the Evil Oracle waits inside and comes out when the Communicator reaches the candles.
  church: {
    state: 'waiting',
    sight: {
      tiles: CASTLE.sight,
      id: 'church-sight',
      text: (sim) =>
        sim.ghostTouch
          ? 'His church. A copy of mine, built backwards. He is inside, and he has her. Walk up to the candles and he will come out. You can touch him now.'
          : 'His church. He is inside, and he has her. Do not go near it yet: nothing of yours can touch him. Find the Esteemed Ghost first.',
      tone: 'warn',
    },
    step(sim, p) {
      const nave = part(p, 'nave');
      if (p.state === 'waiting' && distOf(sim.controller, nave) < CASTLE.wake * T) {
        p.state = 'awake';
        sim.events.push({ e: 'place', id: 'church', what: 'open', x: nave.x, y: nave.y });
        sim.spawnBoss('evilOracle', { x: nave.x, y: nave.y + 50 });
      } else if (p.state === 'awake' && sim.bossDown) {
        p.state = 'fallen';
        sim.say('church-fallen', 'He is gone. The candles went out with him. Your wife is free: the Wanderer has her signal. Go home, Communicator.', 'warn');
      }
    },
    status: (_s, p) => p.state,
  },
  // The Esteemed Ghost (P44): an old robot's ghost in a cage of cold light. Free him and he lends you his touch: every hit
  // lands on the ethereal, this mission and every one after (the hub keeps it). Freed once, the cage stands empty on every later visit.
  ghost: {
    state: 'caged',
    setup(sim, p) {
      if (sim.ghostTouch) p.state = 'free';
    },
    sight: {
      tiles: 11,
      id: 'ghost-sight',
      text: (sim) => (sim.ghostTouch ? '' : 'A cage of cold light, and someone in it. That is the Esteemed Ghost. He is older than the Oracle and politer than me. Free him.'),
      tone: 'warn',
    },
    use: {
      verb: () => 'free the Esteemed Ghost',
      hold: 2.6,
      reach: 80,
      at: (_s, p) => part(p, 'prison'),
      ready: (_s, p) => p.state === 'caged',
      fire(sim, p) {
        p.state = 'free';
        const q = part(p, 'prison');
        sim.freeGhost(q.x, q.y);
        sim.events.push({ e: 'place', id: 'ghost', what: 'free', x: q.x, y: q.y, text: 'Most kind. Allow me: your tools will remember they were once ghosts too.' });
      },
    },
    status: (_s, p) => p.state,
  },

  // The Demon Wastes' castle: the Harbinger sleeps in its keep and wakes when the Communicator comes to the gate, with the
  // two blood pits at the gate. It never strays far from home (`CASTLE.leash`); killing it is the Wastes' great prize.
  castle: {
    state: 'sleeping',
    setup(sim, p) {
      for (const q of p.parts) if (q.kind === 'pit') p.nests.push(sim.addNest(q.x, q.y, { place: 'castle', hp: CASTLE.pits.hp, scale: CASTLE.pits.scale }));
    },
    sight: {
      tiles: CASTLE.sight,
      id: 'castle-sight',
      text: () => 'A castle, out here. Built from the old world’s server racks, and it hums. Whatever sleeps in there commands every swarm in the Wastes. Walk up to that gate and it wakes. Kill it and its heart is yours. I would bring everyone.',
      tone: 'warn',
    },
    step(sim, p) {
      const keep = part(p, 'keep');
      if (p.state === 'sleeping' && distOf(sim.controller, keep) < CASTLE.wake * T) {
        p.state = 'awake';
        sim.events.push({ e: 'place', id: 'castle', what: 'open', x: keep.x, y: keep.y });
        sim.spawnBoss('drone', { x: keep.x, y: keep.y + 40 });
        for (const n of p.nests) sim.wake(n, 'the Harbinger');
      } else if (p.state === 'awake' && sim.bossDown) {
        p.state = 'fallen';
        sim.say('castle-fallen', 'The Harbinger is down. Take its heart and whatever it hoarded, then go: the Wastes will not stay quiet for long.', 'warn');
      }
    },
    status: (_s, p) => p.state,
  },
};

/**
 * A dusk boss's arena: empty by day (its sight line tells you whose it is); at dusk the boss arrives here (`Sim.duskBoss`
 * looks for the place whose `boss` it is) and holds it; at midnight it leaves; once it falls the arena is `fallen`.
 */
function arena(boss: Enemy, sight: string): Behaviour & { boss: Enemy } {
  return {
    boss,
    state: 'empty',
    sight: { tiles: ARENA.sight, id: `arena-${boss}`, text: (sim) => (sim.bossDown ? '' : sight), tone: 'warn' },
    step(sim, p) {
      if (p.state === 'held' && sim.bossDown) {
        p.state = 'fallen';
        sim.events.push({ e: 'place', id: p.id, what: 'fallen', x: p.x, y: p.y });
      }
    },
    status: (_s, p) => `${p.state} (${BOSSES[boss]?.name})`,
  };
}
/** The arena a boss of this kind holds, in a running mission. */
export const arenaOf = (sim: Sim, kind: Enemy) => sim.places.find((p) => (BEHAVE[p.id] as { boss?: Enemy }).boss === kind);

/** The Sim's side of building a place: its record, in px, then its behaviour's setup. */
export function makePlace(sim: Sim, id: PlaceId, x: number, y: number, parts: { kind: PartKind; x: number; y: number; prop?: PropKind }[]): PlaceRT {
  const px = (v: number) => (v + 0.5) * T;
  const p: PlaceRT = { id, x: px(x), y: px(y), parts: parts.map((q) => ({ kind: q.kind, x: px(q.x), y: px(q.y), ...(q.prop && { prop: q.prop }) })), state: BEHAVE[id].state, visited: false, nests: [], props: [], foes: [], bots: [], v: {} };
  // A `prop` part stands as that prop (P39's system: it breaks, a kickable one slides, a carryable one is carried).
  for (const q of p.parts) if (q.kind === 'prop' && q.prop) p.props.push(addProp(sim, { kind: q.prop, x: 0, y: 0, wear: 1 }, undefined, sim.passableNear(q.x, q.y)));
  BEHAVE[id].setup?.(sim, p);
  return p;
}
