/**
 * A robot out of oil.
 * A crew robot goes down, never destroyed (P5; `DOWNED` in defs/crew.ts): it lies where it fell (`Bot.downed`), foes skip it
 * (no oil, so nothing targets it, and the engine ignores damage to a downed unit), and it is carried (`pickUp`, `putDown`,
 * `carryStep`: the Communicator as many as he likes, a Mule as many as it reaches), fixed in the field (`startFix`, `fixed`: the timed
 * action `actionStep` runs) or left behind (it comes home a wreck: `hub/workshop.ts` `landRoster`; carried home it is `downed` there).
 * The Communicator goes down (`botDown`) and `downStep` runs the count.
 * Then a spare can revives him in place, or the winch hauls him to the lift (`REVIVE`, `WINCH` in defs/comm.ts).
 */

import { noteDown } from './botai';
import {
  DOWNED,
  REVIVE,
  bossKnock,
  TYPE_WRECK,
  WINCH,
  type Role,
} from './defs';
import { dist } from './geom';
import { INTRO } from './intro';
import { say } from './oracle';
import { PERK_FX } from './perks';
import type { Sim } from './sim';
import { bloodlust } from './tiers';
import type { Bot } from './types';

export type DownedEvent =
  /** The Communicator is out of oil: a `revive` (from the reserve, back up in place) or a winch back to the lift. */
  | { e: 'downed'; revive: boolean }
  /** He is back up where he fell (a spare can spent). */
  | { e: 'revived'; cost: number; pushed: number }
  /** The winch hauled him to the lift (`cost` scrap). */
  | { e: 'winched'; cost: number }
  /** A crew robot ran out of oil and lies where it fell (P5). */
  | { e: 'botDown'; bot: Bot }
  /** `by` picked a downed robot up, or put it down (`putDown`). */
  | { e: 'carry'; bot: Bot; by: Bot }
  | { e: 'putDown'; bot: Bot }
  /** A downed robot was fixed in the field and stands up. */
  | { e: 'fixed'; bot: Bot }
  /** The Roll-call (Sprocket's gift): a downed robot lying at (x, y) is brought up to the platform as the lift rises. */
  | { e: 'rollCall'; bot: Bot; x: number; y: number };

/**
 * The Homing Signal (P52, the Princess's gift at the fifth step of her track): once a mission, with her home (her voice is on the antenna),
 * the Communicator going down is not a spare can or a winch: her voice comes over the antenna and he stands again where he fell at
 * `PERK_FX.homingSignal.oil` of his oil. It stops the moment she is taken (the voice is then static: `princessvoice.ts`). Not down a dungeon.
 */
export const homingReady = (sim: Sim) => sim.perks.has('homingSignal') && sim.voice?.wife === 'home' && !sim.dungeon && !sim.stats.homing;

/** A robot's oil ran out. The Communicator goes down (a revive from the reserve, or the winch); a crew robot lies down to be carried, fixed or left. */

export function botDown(sim: Sim, b: Bot) {
  if (b.dead || (b.role === 'controller' && sim.downT > 0)) return;
  b.hp = 0;
  if (b.role === 'controller') {
    // Leeway: the Princess's signal first, once a mission (P52: it costs nothing); then a can in the reserve gets you back up where you fell; with none, the Oracle winches you back to the lift.
    // The intro's old works: a fall costs nothing, he stands up at the last checkpoint (`intro.ts` `respawn`).
    if (sim.intro) {
      sim.downKind = 'respawn';
      sim.downT = INTRO.down;
      sim.events.push({ e: 'downed', revive: true });
      return;
    }
    const homing = homingReady(sim);
    const revive = homing || sim.reserve >= REVIVE.cost;
    sim.downKind = homing ? 'homing' : revive ? 'revive' : 'winch';
    sim.downT = revive ? REVIVE.time : WINCH.time;
    if (homing) sim.stats.homing = 1;
    if (!revive) sim.stats.winched++;
    sim.events.push({ e: 'downed', revive });
    return;
  }
  if (b.downed) return;
  if (sim.crew.includes(b)) {
    layDown(sim, b);
    say(sim, `down-${b.id}`, `${b.name} is down. Carry it, or stand by it and fix it.`, 'warn');
    return;
  }
  // A called robot (the Brass Guard) and the like are not crew: they are only gone.
  b.dead = true;
  sim.gone.push(b);
  sim.events.push({ e: 'die', on: 'bot', x: b.x, y: b.y, bot: b });
  bloodlust(sim, b.x, b.y);
  noteDown(sim);
}

/** A crew robot lies down where it is: what it carried falls, its work stops, the others notice. */
export function layDown(sim: Sim, b: Bot) {
  putDown(sim, b);
  b.hp = 0;
  b.downed = { by: null };
  b.path = [];
  b.moving = false;
  b.state = 'idle';
  b.target = 0;
  b.work = undefined;
  sim.stats.downed = (sim.stats.downed ?? 0) + 1;
  sim.events.push({ e: 'botDown', bot: b });
  bloodlust(sim, b.x, b.y);
  noteDown(sim);
}

// ---- Carrying and fixing --------------------------------------------------------------------------------------------

/** The robots `carrier` carries. */
export const carriedBy = (sim: Sim, carrier: Bot) => sim.bots.filter((b) => !b.dead && b.downed?.by === carrier.id);

/** The speed share of a carrier with `n` downed robots on it: `base` (60%, `DOWNED.carry`) for one, over the square root of n for more, never under `floor` (the Communicator's 50%; a Mule's is 0: the walk's own tenth is its stop). */
export const loadSpeed = (n: number, base = DOWNED.carry, floor = 0) => (n > 0 ? Math.min(1, Math.max(floor, base / Math.sqrt(n))) : 1);

/** A carrier's speed share now: the engine's `carry` and `carryFloor` stats (gear, augments, relics can change them) under its load. */
export function carrySpeed(sim: Sim, carrier: Bot, n: number) {
  const floor = sim.engine.stat(carrier, 'carryFloor', carrier.role === 'controller' ? DOWNED.floor : 0);
  return loadSpeed(n, sim.engine.stat(carrier, 'carry', DOWNED.carry), floor);
}

/** The nearest robot lying downed (not carried) within `r` px of a point, if any. */
export function downedNear(sim: Sim, x: number, y: number, r = DOWNED.reach): Bot | null {
  let best: Bot | null = null, bd = r;
  for (const b of sim.bots) {
    const d = dist(x, y, b.x, b.y);
    if (!b.dead && b.downed && b.downed.by === null && d <= bd) (bd = d), (best = b);
  }
  return best;
}

/** `carrier` picks a downed robot up (it comes along with him, `carryStep`). */
export function pickUp(sim: Sim, carrier: Bot, b: Bot) {
  if (!b.downed || b.dead) return;
  b.downed.by = carrier.id;
  if (sim.action?.bot === b) sim.action = null;
  sim.events.push({ e: 'carry', bot: b, by: carrier });
}

/** `carrier` puts everything it carries down beside it. */
export function putDown(sim: Sim, carrier: Bot) {
  for (const b of carriedBy(sim, carrier)) {
    b.downed = { by: null };
    const at = sim.passableNear(carrier.x + carrier.face * 14, carrier.y + 6);
    b.x = at.x;
    b.y = at.y;
    sim.events.push({ e: 'putDown', bot: b });
  }
  sim.engine.release(carrier, 'carry');
}

/**
 * Each step: what a carrier carries rides on it, and weighs on its speed (a held change on the speed stat, `loadSpeed`). A carrier
 * that is down, or the Communicator out of play, drops its load.
 */
export function carryStep(sim: Sim) {
  for (const carrier of [sim.controller, ...sim.crew.filter((b) => b.role === 'mule')]) {
    const load = carriedBy(sim, carrier);
    if (!load.length) {
      sim.engine.release(carrier, 'carry');
      continue;
    }
    if (carrier.dead || carrier.hp <= 0 || (carrier.role === 'controller' && sim.downT > 0)) {
      putDown(sim, carrier);
      continue;
    }
    sim.engine.hold(carrier, 'carry', { stat: 'speed', more: carrySpeed(sim, carrier, load.length) });
    load.forEach((b, i) => {
      b.x = carrier.x + (i - (load.length - 1) / 2) * 10;
      b.y = carrier.y;
    });
  }
}

/** Start the field fix of a downed robot lying within reach: 8 s of work while he stays near (`actionStep`; a hit does not break it). */
export function startFix(sim: Sim, b: Bot) {
  sim.action = { bot: b, t: 0, need: b.downed?.fix ?? DOWNED.fix, reach: DOWNED.reach, paused: false };
}

/** The fix is done: it stands up at a share of its oil. */
export function fixed(sim: Sim, b: Bot) {
  if (sim.action?.bot === b) sim.action = null;
  if (b.downed?.wreck) sim.cores++; // a repaired wreck brings its own core (`START_CORES`)
  if (b.downed?.found && !sim.found.some((f) => f.role === b.role)) sim.found.push({ name: b.name, role: b.role }); // a type wreck: its type is found
  b.downed = undefined;
  sim.engine.revive(b, DOWNED.oil);
  // Field Tinker (a punch card): a repairer in the party wears it, and the fix clears what was wrong with the robot besides.
  if (sim.bots.some((r) => r.role === 'repairer' && !r.dead && !!sim.engine.source(r, 'card:fieldTinker'))) sim.engine.cleanse(b);
  sim.stats.fixed = (sim.stats.fixed ?? 0) + 1;
  sim.events.push({ e: 'fixed', bot: b });
  sim.drainFx();
}

/**
 * A type wreck: a robot of `role` lying downed at a spot (`TYPE_WRECK`), mended by the free field fix; standing up gives its own
 * core and finds the type (`fixed`). The wreck place makes one, and the dev command `wreck`.
 */
export function layWreck(sim: Sim, role: Role, name: string, x: number, y: number): Bot {
  const b = sim.addBot(role, name, x, y, 0);
  b.hp = 0;
  b.downed = { by: null, fix: TYPE_WRECK.fix, wreck: true, found: true };
  b.state = 'idle';
  return b;
}

/**
 * The Roll-call (P52, Sprocket's gift, `PERK_FX.rollCall`): as the lift rises, every robot of ours lying downed on the land, wherever it lies,
 * is brought to the platform and comes up with it ("Count them out, count them in"). Not a carried one (it rides with its carrier), not
 * a type wreck (not yet one of ours), not down a dungeon. Returns how many came.
 */
export function rollCall(sim: Sim): number {
  if (!sim.perks.has('rollCall') || sim.dungeon) return 0;
  const lying = sim.fielded.filter((b) => b.downed && b.downed.by === null && !sim.onLift(b, 1.6));
  lying.forEach((b, i) => {
    const a = (i / lying.length) * Math.PI * 2;
    const at = sim.passableNear(sim.lift.x + Math.cos(a) * PERK_FX.rollCall.ring, sim.lift.y + Math.sin(a) * PERK_FX.rollCall.ring * 0.75);
    sim.events.push({ e: 'rollCall', bot: b, x: b.x, y: b.y });
    b.x = at.x;
    b.y = at.y;
  });
  if (lying.length) say(sim, 'rollcall', `Count them out, count them in. ${lying.length === 1 ? `${lying[0].name} is` : `${lying.length} robots are`} coming up with you, dears.`, 'calm');
  return lying.length;
}

/** `summary().fallen`: each robot lying down or carried. */
export function downedSummary(sim: Sim) {
  return sim.bots
    .filter((b) => !b.dead && b.downed)
    .map((b) => ({ name: b.name, role: b.role, by: b.downed!.by === null ? null : sim.bot(b.downed!.by)?.name ?? null, x: Math.round(b.x), y: Math.round(b.y) }));
}

/** The Communicator is out of oil: the count runs, then a spare can pours back in (the revive) or the winch hauls him out (down a dungeon) or home to the lift. */
export function downStep(sim: Sim, dt: number) {
  const c = sim.controller;
  c.moving = false;
  sim.downT -= dt;
  if (sim.downT <= 0 && (sim.downKind === 'revive' || sim.downKind === 'homing')) {
    const homing = sim.downKind === 'homing';
    if (!homing) {
      sim.reserve -= REVIVE.cost;
      sim.stats.revived++;
    }
    sim.engine.revive(c, homing ? PERK_FX.homingSignal.oil : sim.perks.has('goodOil') ? PERK_FX.goodOil : REVIVE.oil);
    sim.graceT = graceFor(REVIVE.grace);
    sim.slowT = SLOW_TOTAL;
    sim.standT = REVIVE.stand;
    const pushed = revivePush(sim, c);
    sim.engine.emit({ kind: 'cast', self: c, via: 'spareOil' }); // Last Gasp (a punch card): spending the can releases a steam nova
    sim.drainFx();
    sim.events.push({ e: 'revived', cost: homing ? 0 : REVIVE.cost, pushed });
    if (homing) sim.events.push({ e: 'oracle', id: 'princess:homing', text: 'Get up. I just cleaned this floor.', tone: 'warn', who: 'princess' });
    else say(sim, 'revive', 'Got you. A spare can off your pack, poured in where you lay. Oil you carry is oil you can fall on. Do not make a habit of it.', 'warn');
  } else if (sim.downT <= 0 && sim.downKind === 'respawn') sim.intro?.respawn();
  else if (sim.downT <= 0 && sim.dungeon) {
    // Down a dungeon the winch hauls you all the way out, and what you found down there stays down there.
    sim.engine.revive(c, WINCH.oil);
    sim.events.push({ e: 'winched', cost: 0 });
    sim.setPhase('lost');
  } else if (sim.downT <= 0) {
    const cost = Math.floor(sim.scrap * WINCH.cost);
    sim.dayT += WINCH.clock; // the night comes closer
    sim.scrap -= cost;
    c.x = sim.lift.x;
    c.y = sim.lift.y + 6;
    sim.engine.revive(c, WINCH.oil);
    c.path = [];
    sim.events.push({ e: 'winched', cost });
    sim.events.push({ e: 'oracle', id: `winch-${sim.stats.winched}`, text: `Got you. Winching your carcass back cost me ${cost ? `${cost} scrap and ` : ''}${WINCH.clock} seconds of daylight. Keep a spare can on your pack and I will not have to.`, tone: 'warn' });
  }
}

// ---- The revive's moment ---------------------------------------------------------------------------------------------

const SLOW_TOTAL = REVIVE.slow.hold + REVIVE.slow.ease;

/** The time scale `elapsed` real seconds into the revive's slow: `factor` for `hold`, then eased back to 1 over `ease`. */
export function slowAt(elapsed: number) {
  const { factor, hold, ease } = REVIVE.slow;
  if (elapsed <= hold) return factor;
  if (elapsed >= hold + ease) return 1;
  const k = (elapsed - hold) / ease;
  return factor + (1 - factor) * k * k * (3 - 2 * k);
}

/** The sim's time scale now (1 outside the slow). */
export const slowScale = (sim: Sim) => (sim.slowT > 0 ? slowAt(SLOW_TOTAL - sim.slowT) : 1);

/** The sim seconds that `real` real seconds from the start of the slow take: the grace is real time (a second of it), the engine counts sim time. */
export function graceFor(real: number) {
  let sim = 0;
  for (let t = 0; t < real; t += 0.01) sim += slowAt(t + 0.005) * Math.min(0.01, real - t);
  return sim;
}

/** Run the revive's real-time clocks and return the step's sim dt (`raw` scaled by the slow). Called first in `Sim.step`. */
export function slowStep(sim: Sim, raw: number) {
  sim.standT = Math.max(0, sim.standT - raw);
  if (sim.slowT <= 0) return raw;
  const k = slowScale(sim);
  sim.slowT = Math.max(0, sim.slowT - raw);
  return raw * k;
}

/** Foes close to the revived Communicator are shoved away (a shove, no damage; a Steady foe stays, a boss barely budges, a stagger holds them off for a beat). Returns how many moved. */
export function revivePush(sim: Sim, c: Bot) {
  let n = 0;
  for (const h of sim.hornets) {
    if (h.dead) continue;
    const d = dist(c.x, c.y, h.x, h.y);
    if (d > REVIVE.push.radius) continue;
    if (sim.engine.flag(h, 'steady') && !sim.stunned(h)) continue;
    const k = REVIVE.push.force * bossKnock(h), a = d || 1;
    h.vx += d ? ((h.x - c.x) / a) * k : k;
    h.vy += d ? ((h.y - c.y) / a) * k : 0;
    h.cd = Math.max(h.cd, 0.5);
    n++;
  }
  return n;
}
