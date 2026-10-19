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
  TYPE_WRECK,
  WINCH,
  type Role,
} from './defs';
import { dist } from './geom';
import { say } from './oracle';
import { PERK_FX } from './perks';
import type { Sim } from './sim';
import { bloodlust } from './tiers';
import type { Bot } from './types';

export type DownedEvent =
  /** The Communicator is out of oil: a `revive` (from the reserve, back up in place) or a winch back to the lift. */
  | { e: 'downed'; revive: boolean }
  /** He is back up where he fell (a spare can spent). */
  | { e: 'revived'; cost: number }
  /** The winch hauled him to the lift (`cost` scrap). */
  | { e: 'winched'; cost: number }
  /** A crew robot ran out of oil and lies where it fell (P5). */
  | { e: 'botDown'; bot: Bot }
  /** `by` picked a downed robot up, or put it down (`putDown`). */
  | { e: 'carry'; bot: Bot; by: Bot }
  | { e: 'putDown'; bot: Bot }
  /** A downed robot was fixed in the field and stands up. */
  | { e: 'fixed'; bot: Bot };

/** A robot's oil ran out. The Communicator goes down (a revive from the reserve, or the winch); a crew robot lies down to be carried, fixed or left. */

export function botDown(sim: Sim, b: Bot) {
  if (b.dead || (b.role === 'controller' && sim.downT > 0)) return;
  b.hp = 0;
  if (b.role === 'controller') {
    // Leeway: a can in the reserve gets you back up where you fell; with none, the Oracle winches you back to the lift.
    const revive = sim.reserve >= REVIVE.cost;
    sim.downKind = revive ? 'revive' : 'winch';
    sim.downT = revive ? REVIVE.time : WINCH.time;
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
  if (sim.downT <= 0 && sim.downKind === 'revive') {
    sim.reserve -= REVIVE.cost;
    sim.stats.revived++;
    sim.engine.revive(c, sim.perks.has('goodOil') ? PERK_FX.goodOil : REVIVE.oil);
    sim.graceT = REVIVE.grace;
    sim.engine.emit({ kind: 'cast', self: c, via: 'spareOil' }); // Last Gasp (a punch card): spending the can releases a steam nova
    sim.drainFx();
    sim.events.push({ e: 'revived', cost: REVIVE.cost });
    say(sim, 'revive', 'Got you. A spare can off your pack, poured in where you lay. Oil you carry is oil you can fall on. Do not make a habit of it.', 'warn');
  } else if (sim.downT <= 0 && sim.dungeon) {
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
