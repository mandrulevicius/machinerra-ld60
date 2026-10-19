/**
 * The companions in a mission (P42; `docs/systems.md` "Companions"). Neither takes an AI core and neither is crew.
 *
 * **The sniffer dog** (`Sim.dog`, made when the hub's perk `companionDog` is held, or freed at the Kennel this mission): it follows
 * the Communicator, points toward the nearest ruin, dig mound or place he has not found within its smell (`pointTargets`: the
 * stat `pointRange`), leads him toward it, sees farther than he does (`SIGHT.dog`, `fogplay.ts`), and barks `DOG.barkWarning` s
 * before the twisted arrive at dusk (the stat `barkWarning`; the first twisted come with the evening, `dayState().twist`). The cards
 * ride the Communicator's engine unit like every card: Good Nose (`dogDigs`: it digs the mounds it points at by itself), Loud Bark
 * (`barkBlind`: it also barks at a twisted foe that closes in and Blinds it). It is never hurt, never a target and never left behind.
 * Its stats are the Communicator's (cards slot there; the titles Good Boy's Friend is `barkWarning`).
 *
 * **Mounds** (`places` `mounds` and the Kennel's): a hold of E digs one (`digMound`): scrap, and the Squeaky Toy from the first mound
 * of a land while the dog's third step wants it (`QuestOpts.toyHunt`). Digs are `stats.dug`.
 *
 * **The cat** is a place (`placequest.ts`); here only the Replicator's kill bonus reads it (`catKill`).
 *
 * Add a companion: a `Dog`-like record on `Sim`, its step here, its view in `companionview.ts`, its hub side in `hub/companions.ts`.
 */
import { DOG, T } from './defs';
import { dist } from './geom';
import type { Source } from './effects';
import type { Sim } from './sim';
import type { Bot } from './types';

/** What the dog points at. */
export interface Point {
  kind: 'ruin' | 'mound' | 'place';
  x: number;
  y: number;
  /** `ruin:<id>`, `mound:<place index>:<part index>`, `place:<id>`: stable while it stands. */
  id: string;
}

export interface Dog {
  /** Where it stands (made like a robot, never on `sim.bots`). */
  bot: Bot;
  name: string;
  /** Freed at the Kennel this mission and not yet home: it is yours once the lift rises with it aboard (`stats.dogHome`). */
  fresh: boolean;
  target: Point | null;
  /** Standing with its nose out, toward `aim` (radians). */
  pointing: boolean;
  aim: number;
  sniffT: number;
  /** The dusk bark is done. */
  barked: boolean;
  /** Loud Bark: the next time it may bark at a twisted foe (`Sim.time`). */
  barkAt: number;
  /** Good Nose: the seconds it has dug at the mound it points at. */
  digT: number;
}

export type CompanionEvent =
  /** The dog joins (`join`), catches a scent (`point`), barks (`bark`: `text` says at what), digs (`dig` begins, `dug` done) or is home. */
  | { e: 'dog'; what: 'join' | 'point' | 'bark' | 'dig' | 'dug' | 'home'; x: number; y: number; text?: string }
  /** The stray cat eats a scrap gob (`eat`) or is tamed (`tamed`). */
  | { e: 'cat'; what: 'eat' | 'tamed'; x: number; y: number };

const tile = (px: number) => px / T - 0.5;

/** The dog's better nose (dog.2, perk `dogNose`): it smells half as far again. */
export const DOG_NOSE: Source = { id: 'perk:dogNose', kind: 'rescue', name: 'A better nose', effects: [{ when: 'always', do: { do: 'stat', stat: 'pointRange', pct: 0.5 } }] };

/** The dog, by the Communicator's side. */
export function makeDog(sim: Sim, x: number, y: number, name: string, fresh: boolean): Dog {
  const bot = sim.makeBot('gatherer', name, x, y, -5);
  sim.pace(bot, DOG.speed);
  const dog: Dog = { bot, name, fresh, target: null, pointing: false, aim: 0, sniffT: 0, barked: false, barkAt: 0, digT: 0 };
  sim.dog = dog;
  sim.events.push({ e: 'dog', what: 'join', x: bot.x, y: bot.y });
  return dog;
}

/** A stat of the Communicator that the dog reads (cards and titles are sources on him). */
const stat = (sim: Sim, name: 'pointRange' | 'barkWarning' | 'barkRange' | 'barkBlind' | 'dogDigs', base: number) => sim.engine.stat(sim.controller, name, base);

/** How far it smells now, px. */
export const pointRange = (sim: Sim) => stat(sim, 'pointRange', DOG.pointTiles) * T;
/** The seconds its dusk bark comes before the twisted. */
export const barkWarning = (sim: Sim) => stat(sim, 'barkWarning', DOG.barkWarning);

/** The dig mounds not dug yet, with the place and part they belong to. */
export function moundsOf(sim: Sim) {
  const out: { x: number; y: number; id: string; p: Sim['places'][number]; i: number }[] = [];
  sim.places.forEach((p, pi) => {
    let i = 0;
    for (const q of p.parts) {
      if (q.kind !== 'mound') continue;
      if (!p.v[`dug${i}`]) out.push({ x: q.x, y: q.y, id: `mound:${pi}:${i}`, p, i });
      i++;
    }
  });
  return out;
}

/** Everything the dog could point at: ruins not searched, mounds not dug, places he has not come near. */
export function pointTargets(sim: Sim): Point[] {
  const out: Point[] = [];
  for (const r of sim.ruins) if (!r.searched) out.push({ kind: 'ruin', x: r.x, y: r.y, id: `ruin:${r.id}` });
  for (const m of moundsOf(sim)) out.push({ kind: 'mound', x: m.x, y: m.y, id: m.id });
  for (const p of sim.places) if (!p.visited && p.id !== 'dungeon') out.push({ kind: 'place', x: p.x, y: p.y, id: `place:${p.id}` });
  return out;
}

/** The nearest of them to the Communicator within the dog's smell, or null. */
export function nearestPoint(sim: Sim): Point | null {
  const c = sim.controller, range = pointRange(sim);
  let best: Point | null = null, bd = range;
  for (const t of pointTargets(sim)) {
    const d = dist(c.x, c.y, t.x, t.y);
    if (d < bd) {
      best = t;
      bd = d;
    }
  }
  return best;
}

/** Dig a mound: the scrap, the toy if it lies here, the count. */
export function digMound(sim: Sim, m: { x: number; y: number; p: Sim['places'][number]; i: number }) {
  m.p.v[`dug${m.i}`] = 1;
  for (let k = 0; k < DOG.moundScrap; k++) sim.drop(m.x + (k - 0.5) * 18, m.y + 22, 'scrap');
  sim.stats.dug = (sim.stats.dug ?? 0) + 1;
  if (m.i === 0 && m.p.id === 'mounds' && sim.quest.toyHunt && !sim.stats['got.toy']) {
    sim.stats['got.toy'] = 1;
    sim.say('toy', 'Something squeaks under there. A rubber bone, older than the hornets. It screams when bitten. I have never heard an honest machine before.', 'calm');
  }
  sim.events.push({ e: 'dog', what: 'dug', x: m.x, y: m.y });
}

/** A dog freed this mission and standing on the lift as it goes up is home (`stats.dogHome`; `Sim.tally` asks too, for a mission ended without the ride). */
export function dogHome(sim: Sim) {
  const d = sim.dog;
  if (!d || !d.fresh || sim.stats.dogHome || !sim.onLift(d.bot, 1.6)) return;
  sim.stats.dogHome = 1;
  sim.events.push({ e: 'dog', what: 'home', x: d.bot.x, y: d.bot.y });
}

/** The dog's step: follow, point, bark, dig. */
export function dogStep(sim: Sim, dt: number) {
  const dog = sim.dog;
  if (!dog) return;
  const c = sim.controller, b = dog.bot;
  b.moving = false;
  if (sim.phase === 'rising' || sim.phase === 'done' || c.dead) {
    if (sim.phase === 'rising') dogHome(sim);
    return;
  }
  // Smell: look for something to point at now and then.
  dog.sniffT -= dt;
  if (dog.sniffT <= 0) {
    dog.sniffT = DOG.sniff;
    const was = dog.target?.id;
    dog.target = nearestPoint(sim);
    if (dog.target && dog.target.id !== was) sim.events.push({ e: 'dog', what: 'point', x: dog.target.x, y: dog.target.y, text: dog.target.kind });
    if (!dog.target) dog.digT = 0;
  }
  // Where to stand: ahead of him toward what it smells, else by his side.
  const t = dog.target;
  let gx = c.x - c.face * 36, gy = c.y + 22;
  if (t) {
    // With Good Nose it goes right to the mound it will dig; otherwise it stands short of the thing, nose out.
    const digs = t.kind === 'mound' && stat(sim, 'dogDigs', 0) > 0;
    const d = dist(c.x, c.y, t.x, t.y), a = Math.atan2(t.y - c.y, t.x - c.x), lead = digs ? d - DOG.digReach * 0.5 : Math.min(DOG.lead, Math.max(0, d - 36));
    gx = c.x + Math.cos(a) * lead;
    gy = c.y + Math.sin(a) * lead;
  }
  const arrived = sim.go(b, gx, gy, dt, t ? 14 : DOG.follow * 0.5);
  dog.pointing = !!t && arrived && dist(b.x, b.y, c.x, c.y) < DOG.lead + 80;
  if (dog.pointing && t) dog.aim = Math.atan2(t.y - b.y, t.x - b.x);
  // A dog that has fallen far behind (a long dash, a lift ride) catches up at once.
  if (dist(b.x, b.y, c.x, c.y) > DOG.follow * 10) {
    const p = sim.passableNear(c.x - 30, c.y + 20);
    b.x = p.x;
    b.y = p.y;
    b.path = [];
  }
  // Good Nose: it digs the mound it points at by itself.
  if (t?.kind === 'mound' && stat(sim, 'dogDigs', 0) > 0 && dist(b.x, b.y, t.x, t.y) < DOG.digReach) {
    if (dog.digT === 0) sim.events.push({ e: 'dog', what: 'dig', x: t.x, y: t.y });
    dog.digT += dt;
    if (dog.digT >= DOG.dig) {
      const m = moundsOf(sim).find((q) => q.id === t.id);
      dog.digT = 0;
      dog.target = null;
      if (m) digMound(sim, m);
    }
  } else dog.digT = 0;
  bark(sim, dog);
}

/** The bark that warns of the twisted: once at dusk, and with Loud Bark again at any twisted foe closing in (which it Blinds). */
function bark(sim: Sim, dog: Dog) {
  const b = dog.bot;
  if (!dog.barked && !sim.dungeon) {
    const warn = barkWarning(sim);
    if (sim.dayT >= sim.day.at.evening - warn) {
      dog.barked = true;
      if (sim.day.twist <= 0) {
        sim.events.push({ e: 'dog', what: 'bark', x: b.x, y: b.y, text: 'dusk' });
        sim.say('dog-bark', `${dog.name} is barking at the east. At nothing, yet. In ${Math.round(warn)} seconds it will not be nothing: the twisted are coming with the dusk.`, 'warn');
      }
    }
  }
  if (stat(sim, 'barkBlind', 0) > 0 && sim.time >= dog.barkAt) {
    const r = DOG.barkTiles * T * stat(sim, 'barkRange', 1);
    const near = sim.hornets.filter((h) => !h.dead && h.twisted && !h.sleep && dist(h.x, h.y, b.x, b.y) < r);
    if (near.length) {
      dog.barkAt = sim.time + DOG.barkEvery;
      for (const h of near) sim.engine.apply(h, 'blinded', { duration: DOG.blind });
      sim.events.push({ e: 'dog', what: 'bark', x: b.x, y: b.y, text: 'twisted' });
    }
  }
}

/** The map's fog is cleared around the dog (`fogStep` calls it with the seer's radius). */
export function dogSees(sim: Sim, radius: number) {
  const d = sim.dog;
  if (d) sim.fog.reveal(tile(d.bot.x), tile(d.bot.y), radius);
}

/** `summary().dog`. */
export function dogSummary(sim: Sim) {
  const d = sim.dog;
  return d ? { name: d.name, fresh: d.fresh, x: Math.round(d.bot.x), y: Math.round(d.bot.y), pointing: d.pointing, target: d.target?.id ?? null, barked: d.barked } : null;
}
