/**
 * The gatherers' work: coal seams (mined by robots and by hand), ruins stripped, the job a gatherer picks (`jobFor`), and the tap, the land's one healing shrine.
 * Add a job: a branch in `jobFor` and a work function like `mine` that the gatherer's AI calls (botai.ts).
 */

import {
  COAL,
  GATHER,
  NEST,
  RUIN_FINDS,
  T,
  TAP,
} from './defs';
import { wake } from './foes';
import { dist } from './geom';
import { PERK_FX } from './perks';
import { say } from './oracle';
import type { Sim } from './sim';
import type {
  Bot,
  Ruin,
  Seam,
  Seep,
} from './types';
import { search } from './use';

export type CoalEvent =
  /** A gatherer is working a ruin or a seam (throttled). */
  | { e: 'gather'; x: number; y: number; by: Bot }
  /** A pickaxe beat at a seam (by hand, or a gatherer's, throttled). */
  | { e: 'mine'; seam: Seam; by: Bot }
  /** Coal came out of a seam. */
  | { e: 'coal'; seam: Seam; n: number; by: Bot }
  /** The last coal came out: the seam collapses. */
  | { e: 'seamBare'; seam: Seam; by: Bot }
  /** The tap ran dry. */
  | { e: 'dry'; s: Seep }
  /** The tap (a healing shrine) is healing someone: a puff now and then. */
  | { e: 'tap'; s: Seep };

/** The seam with coal in it within reach of a point, if any. */
export function seamNear(sim: Sim, x: number, y: number) {
  return sim.seams.find((q) => q.amount > 0 && dist(x, y, q.x, q.y) < COAL.reach + 24) ?? null;
}

/** The job a gatherer picks near (x, y) within `r`: the nearest dead ruin to strip or seam with coal in it. */
export function jobFor(sim: Sim, x: number, y: number, r: number): { ruin?: Ruin; seam?: Seam; x: number; y: number } | null {
  const ruin = ruinToStrip(sim, x, y, r);
  let seam: Seam | null = null, sd = r;
  for (const q of sim.seams) {
    const d = dist(x, y, q.x, q.y);
    if (q.amount > 0 && d <= sd) (sd = d), (seam = q);
  }
  if (ruin && (!seam || dist(x, y, ruin.x, ruin.y) <= sd)) return { ruin, x: ruin.x, y: ruin.y };
  return seam ? { seam, x: seam.x, y: seam.y } : null;
}

/** `n` coal comes out of a seam (what is left of it at most) and into the hold. */
export function takeCoal(sim: Sim, seam: Seam, n: number, by: Bot) {
  const got = Math.min(n, seam.amount);
  if (got <= 0) return;
  seam.amount -= got;
  sim.coal += got;
  sim.events.push({ e: 'coal', seam, n: got, by });
  say(sim, 'coal', 'Coal. Honest, black, heavy. It is no use to a boiler of yours: it is fuel for the expeditions. Bring it home with the rest.');
  if (by.role === 'gatherer') {
    const before = Math.floor(sim.coalMined / COAL.perJob);
    sim.coalMined += got;
    sim.deed('gatherer', 'siphon', Math.floor(sim.coalMined / COAL.perJob) - before);
  }
  if (seam.amount <= 0) {
    sim.events.push({ e: 'seamBare', seam, by });
    say(sim, 'seam-dry', 'That seam is bare. There will be another.', 'calm');
  }
}

/** A gatherer mines a seam: one coal each `COAL.every` s of work (scaled by its work rate). Noise wakes a sleeping hive nearby, as stripping does (not in the morning). */
export function mine(sim: Sim, b: Bot, seam: Seam, dt: number) {
  b.mineT = (b.mineT ?? 0) + dt * sim.engine.stat(b, 'siphonRate', 1);
  b.state = 'gather';
  b.work = seam;
  sim.lastGatherer = b;
  if (b.fxT > 0.7) {
    b.fxT = 0;
    sim.events.push({ e: 'mine', seam, by: b });
    sim.engine.emit({ kind: 'siphon', self: b });
    sim.drainFx();
  }
  if (sim.day.phase !== 'morning' && !sim.perks.has('smokeless')) for (const n of sim.nests) if (!n.awake && !n.place && dist(n.x, n.y, b.x, b.y) < NEST.wakeTiles * T) wake(sim, n, b.name);
  if (b.mineT >= COAL.every) {
    b.mineT -= COAL.every;
    takeCoal(sim, seam, 1, b);
  }
}

/** The nearest dead ruin not yet searched within `r` of (x, y): what a gatherer strips (a live one is decoded by hand, loudly). */
export function ruinToStrip(sim: Sim, x: number, y: number, r: number) {
  let best: Ruin | null = null;
  let bd = r;
  for (const q of sim.ruins) {
    const d = dist(x, y, q.x, q.y);
    if (!q.searched && !q.live && !RUIN_FINDS[q.kind].pry && d <= bd) {
      best = q;
      bd = d;
    }
  }
  return best;
}

/**
 * A gatherer strips a dead ruin (`GATHER.strip` seconds of work, scaled by its work rate): done, it is searched like the
 * Communicator's, and the wiring comes off `GATHER.copperMore` richer. Working near a sleeping hive wakes it, as the
 * noise of a siphon once did (not in the morning).
 */
export function strip(sim: Sim, b: Bot, ruin: Ruin, dt: number) {
  ruin.stripT = (ruin.stripT ?? 0) + dt * sim.engine.stat(b, 'siphonRate', 1);
  b.state = 'gather';
  b.work = ruin;
  sim.lastGatherer = b;
  if (b.fxT > 0.7) {
    b.fxT = 0;
    sim.events.push({ e: 'gather', x: ruin.x, y: ruin.y, by: b });
    sim.engine.emit({ kind: 'siphon', self: b });
    sim.drainFx();
  }
  if (sim.day.phase !== 'morning' && !sim.perks.has('smokeless')) for (const n of sim.nests) if (!n.awake && !n.place && dist(n.x, n.y, b.x, b.y) < NEST.wakeTiles * T) wake(sim, n, b.name);
  if (ruin.stripT >= GATHER.strip) {
    sim.deed('gatherer', 'siphon', 1);
    search(sim, ruin, b);
  }
}

/**
 * The tap is a healing shrine (`TAP`): the Communicator and the robots within `reach` of it are healed `rate` oil a second
 * each while it holds oil; what it heals comes out of it. It never comes home (crude has no other use).
 */
export function tapStep(sim: Sim, dt: number) {
  for (const tap of sim.seeps) {
    if (tap.amount <= 0) continue;
    let healed = 0;
    for (const b of sim.bots) {
      if (b.dead || sim.engine.isDown(b) || dist(b.x, b.y, tap.x, tap.y) > TAP.reach) continue;
      const give = Math.min(b.maxHp - b.hp, TAP.rate * (sim.perks.has('hotWaterMains') ? PERK_FX.tap.rate : 1) * dt, tap.amount - healed);
      if (give <= 0) continue;
      sim.engine.heal(b, give, b);
      healed += give;
    }
    if (healed <= 0) continue;
    tap.amount -= healed;
    sim.stats.tapped = (sim.stats.tapped ?? 0) + healed;
    sim.tapT -= dt;
    if (sim.tapT <= 0) {
      sim.tapT = 0.7;
      sim.events.push({ e: 'tap', s: tap });
    }
    say(sim, 'tap-heal', 'The well is warm and clean: it mends whatever stands in its steam, you and your robots. Not forever. Use it when it counts.', 'calm');
    if (tap.amount <= 0) {
      sim.events.push({ e: 'dry', s: tap });
      say(sim, 'tap-dry', 'The well is dry. One tap a land, and you drank it. I am not judging.', 'calm');
    }
  }
}

/** `summary()`: the tap, the seams and the coal in the hold. */
export function coalSummary(sim: Sim) {
  return {
    seeps: sim.seeps.map((s) => `${s.kind} ${Math.round(s.amount)}`),
    seams: sim.seams.map((s) => `${Math.round(s.amount)} / ${s.max}`),
    coal: sim.coal,
  };
}
