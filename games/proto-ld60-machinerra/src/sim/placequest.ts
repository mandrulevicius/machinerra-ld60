/**
 * The places that only quests ask for (P42, finishing P38; `docs/places.md` 5 and 10, `docs/quests.md` the dog, the cat and the
 * Green Shoot): the Kennel, a Stray, the dig Mounds, the Little Compactor, the Farthest Cairn. Each is a `Behaviour`
 * (`placeplay.ts`), built on `placeparts.ts`; `BEHAVE` takes them in. Their files carry a `presence.quest` rule (`hub/questplaces.ts`
 * says when it holds), so a land has one only while its step is active. Numbers: `defs/companions.ts` (marked guesses there).
 * Each place's `dev` lists what `place do <id> <what>` can make happen at once.
 */
import { CAIRN, CAT, COMPACTOR, DOG, KENNEL, MOUNDS, PLACE_PARTS, T } from './defs';
import { rng } from '../../../../harness/kit/rng';
import { digMound, makeDog, moundsOf } from './companions';
import { dist, distOf } from './geom';
import type { Signal } from './fog';
import type { Behaviour, PlaceRT } from './placeplay';
import { sleepFoe, wakeFoe } from './placeparts';
import type { PartKind } from './places';
import type { Sim } from './sim';

const part = (p: PlaceRT, kind: PartKind) => p.parts.find((q) => q.kind === kind)!;
const partsOf = (p: PlaceRT, kind: PartKind) => p.parts.filter((q) => q.kind === kind);
const tile = (px: number) => px / T - 0.5;

// ---------------------------------------------------------------- 5: the Kennel

/** The dog is out of its doghouse: it follows, the crawlcams in the yard wake. */
function freeDog(sim: Sim, p: PlaceRT) {
  p.state = 'freed';
  p.v.dug0 = 1;
  const h = part(p, 'doghouse');
  makeDog(sim, h.x, h.y + 36, 'The dog', true);
  for (const f of p.foes) wakeFoe(sim, f);
  sim.events.push({ e: 'place', id: p.id, what: 'free', x: h.x, y: h.y });
  sim.say('kennel-free', 'It bounds out as if it had been told to wait forever and is simply delighted that forever is over. It will follow you. The crawlcams in the yard have noticed, and they want it. Walk it to the lift.', 'urgent');
}

const kennel: Behaviour = {
  state: 'closed',
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
    tiles: KENNEL.sight,
    id: 'kennel-sight',
    text: () => 'A doghouse with a plaque on it: GOOD BOY. Something inside is wagging, and it will not come out for you. It wants its bone. There is a mound in the yard, and the antenna is warm to it. Dig.',
  },
  use: {
    verb: () => 'dig the mound',
    hold: KENNEL.hold,
    reach: KENNEL.reach,
    at: (_s, p) => part(p, 'mound'),
    ready: (sim, p) => p.state === 'closed' && !sim.dog,
    fire: freeDog,
  },
  status: (_s, p) => `${p.state}, ${p.foes.filter((h) => h.sleep && !h.dead).length} crawlcams asleep`,
  dev: {
    free: (sim, p) => (p.state === 'closed' ? (freeDog(sim, p), 'the dog is out') : 'already out'),
  },
};

// ---------------------------------------------------------------- the dig mounds

/** The mound nearest the Communicator that is not dug. */
const nearestMound = (sim: Sim, p: PlaceRT) => moundsOf(sim).filter((m) => m.p === p).sort((a, b) => distOf(a, sim.controller) - distOf(b, sim.controller))[0];

const mounds: Behaviour = {
  state: 'fresh',
  sight: { tiles: MOUNDS.sight, id: 'mounds-sight', text: (sim) => (sim.dog ? '' : 'Heaps of fresh-turned dirt. Something was buried in them, and a nose would know. You have a shovel. I suppose that will do.') },
  use: {
    verb: () => 'dig the mound',
    hold: DOG.dig,
    reach: MOUNDS.reach,
    at: (sim, p) => nearestMound(sim, p) ?? part(p, 'mound'),
    ready: (sim, p) => !!nearestMound(sim, p),
    fire(sim, p) {
      const m = nearestMound(sim, p);
      if (m) digMound(sim, m);
      if (!nearestMound(sim, p)) p.state = 'dug';
    },
  },
  status: (sim, p) => `${p.state}, ${moundsOf(sim).filter((m) => m.p === p).length} mounds left`,
  dev: { dig: (sim, p) => { const m = nearestMound(sim, p); if (m) digMound(sim, m); return m ? 'dug one' : 'none left'; } },
};

// ---------------------------------------------------------------- the stray

/** The stray eats a scrap gob lying near its spot. */
function strayHome(p: PlaceRT) {
  return part(p, 'stray');
}

function tame(sim: Sim, p: PlaceRT) {
  p.state = 'tamed';
  sim.stats.catTamed = 1;
  const cat = p.bots[0];
  sim.events.push({ e: 'cat', what: 'tamed', x: cat?.x ?? p.x, y: cat?.y ?? p.y });
  sim.say('cat-tamed', `${CAT.name} has decided you are acceptable, the way a cat decides, which is to say she will deny it. She will be at home when you are. Leave her a little scrap.`, 'calm');
}

/** One more gob eaten, from the ground or from his hand: three tame her. */
function fed(sim: Sim, p: PlaceRT, x: number, y: number) {
  p.v.fed = (p.v.fed ?? 0) + 1;
  sim.stats.catFed = (sim.stats.catFed ?? 0) + 1;
  sim.events.push({ e: 'cat', what: 'eat', x, y });
  if (p.v.fed >= CAT.fed) tame(sim, p);
}

const stray: Behaviour = {
  state: 'wild',
  near: {
    tiles: PLACE_PARTS.near,
    run(sim, p) {
      const h = strayHome(p);
      const cat = sim.makeBot('gatherer', CAT.name, h.x, h.y, -6);
      sim.pace(cat, CAT.speed);
      p.bots.push(cat);
    },
  },
  sight: {
    tiles: CAT.sight,
    id: 'stray-sight',
    text: () => 'A cat. Copper-wire ribs, one ear, a tail with opinions. It is looking at your scrap. Then at you. Then at your scrap. Give it a few gobs of your scrap, and it may decide you are acceptable.',
  },
  step(sim, p, dt) {
    const cat = p.bots[0];
    if (!cat || p.state === 'tamed') return;
    const home = strayHome(p);
    const gob = sim.loot.filter((l) => !l.dead && l.kind === 'scrap' && dist(l.x, l.y, home.x, home.y) < CAT.eatTiles * T).sort((a, b) => dist(a.x, a.y, cat.x, cat.y) - dist(b.x, b.y, cat.x, cat.y))[0];
    cat.moving = false;
    if (!gob) {
      p.v.eat = 0;
      sim.go(cat, home.x, home.y, dt, 40);
      return;
    }
    if (!sim.go(cat, gob.x, gob.y, dt, 12)) return;
    p.v.eat = (p.v.eat ?? 0) + dt;
    if (p.v.eat < CAT.eat) return;
    p.v.eat = 0;
    gob.dead = true;
    fed(sim, p, gob.x, gob.y);
  },
  // Minos: standing by her with scrap carried, an E prompt gives her a gob; no more leaving gobs lying (a gob that lies near her is still eaten).
  use: {
    verb: () => `give ${CAT.name} a gob of scrap`,
    hold: CAT.give,
    reach: CAT.reach,
    at: (_s, p) => p.bots[0] ?? strayHome(p),
    ready: (sim, p) => p.state === 'wild' && !!p.bots[0] && sim.scrap >= CAT.gob,
    fire(sim, p) {
      sim.scrap -= CAT.gob;
      const cat = p.bots[0];
      fed(sim, p, cat.x, cat.y);
    },
  },
  status: (_s, p) => `${p.state}, fed ${p.v.fed ?? 0}/${CAT.fed}`,
  dev: {
    feed: (sim, p) => {
      const h = strayHome(p);
      sim.restLoot(h.x + 20, h.y + 10, 'scrap');
      return 'a gob of scrap lies by the cat';
    },
    tame: (sim, p) => (p.state === 'tamed' ? 'already tamed' : (tame(sim, p), 'tamed')),
  },
};

// ---------------------------------------------------------------- the Little Compactor

const compactor: Behaviour = {
  state: 'idle',
  sight: {
    tiles: COMPACTOR.sight,
    id: 'compactor-sight',
    text: () => 'A small boxy robot on treads, binocular eyes, stacking cubes of crushed machine into towers. It has been at this for a very long time. It stops when it sees you, and its eyes tilt.',
  },
  use: {
    verb: () => 'take what it holds out',
    hold: COMPACTOR.hold,
    reach: COMPACTOR.reach,
    at: (_s, p) => part(p, 'compactor'),
    ready: (sim, p) => p.state === 'idle' && !sim.stats['got.boot'],
    fire(sim, p) {
      p.state = 'given';
      sim.stats['got.boot'] = 1;
      const c = part(p, 'compactor');
      sim.events.push({ e: 'place', id: p.id, what: 'give', x: c.x, y: c.y, text: 'A boot, and in it a green shoot.' });
      sim.say('compactor-boot', 'It opened its hatch and held out an old boot. In the boot: a green shoot. That is... green. Bring it up. Do not drop it. Do not breathe on it.', 'urgent');
    },
  },
  status: (_s, p) => p.state,
  dev: { give: (sim, p) => (compactor.use!.fire(sim, p), 'the boot is yours') },
};

// ---------------------------------------------------------------- 10: the Farthest Cairn

/** Every place on the land shows as a rough area on the map (the old expedition's map), the ones he has not found. */
function charts(sim: Sim, p: PlaceRT) {
  const r = rng(`cairn/${sim.map.biome}/${sim.map.seed}`);
  for (const o of sim.places) {
    if (o === p || o.visited || sim.signals.some((s) => dist((s.at.x + 0.5) * T, (s.at.y + 0.5) * T, o.x, o.y) < T)) continue;
    const at = { x: Math.round(tile(o.x)), y: Math.round(tile(o.y)) };
    const f = r.fork(o.id), a = f.range(0, Math.PI * 2), d = Math.max(2, CAIRN.r * f.range(0.25, 0.65));
    const s: Signal = { id: `place:${o.id}`, kind: 'place', x: +(at.x + Math.cos(a) * d).toFixed(2), y: +(at.y + Math.sin(a) * d).toFixed(2), r: CAIRN.r, at };
    sim.signals.push(s);
  }
}

const cairn: Behaviour = {
  state: 'standing',
  sight: {
    tiles: CAIRN.sight,
    id: 'cairn-sight',
    text: () => 'A cairn, and a frayed flag, at the very edge of the land: where the last expedition turned back. There is a satchel in the stones. The old expedition drew everything.',
  },
  use: {
    verb: () => 'plant the D-city flag',
    hold: CAIRN.hold,
    reach: CAIRN.reach,
    at: (_s, p) => part(p, 'cairn'),
    ready: (_s, p) => p.state === 'standing',
    fire(sim, p) {
      p.state = 'planted';
      charts(sim, p);
      const c = part(p, 'cairn');
      sim.events.push({ e: 'place', id: p.id, what: 'plant', x: c.x, y: c.y });
      sim.say('cairn-planted', 'Planted, and the satchel is yours: the old expedition drew every place on this land, and now so does your map. The Expeditioner will tell a tall tale about this. Let him.', 'urgent');
    },
  },
  status: (_s, p) => p.state,
  dev: { plant: (sim, p) => (cairn.use!.fire(sim, p), 'planted') },
};

/** The quest-only places' behaviours, by place id (`BEHAVE` takes them in). */
export const BEHAVE_Q = { kennel, mounds, stray, compactor, cairn } satisfies Record<string, Behaviour>;
