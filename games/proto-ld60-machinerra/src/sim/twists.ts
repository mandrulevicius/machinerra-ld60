/**
 * Laimonas's biome twists at work (P31; `docs/biomes.md` "Twists", numbers in `defs/twists.ts`). A land's own weather and cold, under
 * any anomaly (`weather.ts` is the anomaly's). Each passing twist is a schedule of `Gust`s in the clock's seconds, read with the
 * anomalies' `weatherLevel` (warning, ease in, hold, ease out), so a dev `time` jump lands in the right place.
 *  - the rain (the jungle): one shower a day phase; while it holds, everything outside is Wet (ours and theirs: Shock chains).
 *  - the blizzard (the Frostspine): one a day; sight shrinks to `BLIZZARD.tiles` (`blizzardSight`, read by `Sim.sightMul`).
 *  - the cold (the Frostspine): out of warmth he gains a Chilled stack every `COLD.every` s, up to `COLD.cap`; warmth clears them.
 * Events `climate` (warn, start, end; chill, warm) for the view and the Oracle. Not down a dungeon.
 * Add a twist: its numbers in `defs/twists.ts`, a `TWISTS` flag, its rule here, its look in `twistview.ts`.
 */
import { rng, type Rng } from '../../../../harness/kit/rng';
import { BLIZZARD, COLD, HOT_SPRING, RAIN, T, TWISTS, WEATHER, type BiomeId, type PassingDef } from './defs';
import { SIGHT } from './fog';
import { dist } from './geom';
import { commuteStep, rushSummary } from './commute';
import type { Sim } from './sim';
import { type Gust, weatherLevel, type WeatherLevel } from './weather';

export type PassingKind = 'rain' | 'blizzard';
export type TwistEvent =
  | { e: 'climate'; kind: PassingKind; what: 'warn' | 'start' | 'end'; n: number }
  | { e: 'climate'; kind: 'cold'; what: 'chill' | 'warm'; stacks: number };

export interface ColdState {
  on: boolean;
  /** The Chilled stacks the cold has given him (0 .. `COLD.cap`). */
  stacks: number;
  /** Seconds out of warmth toward the next stack. */
  t: number;
  warm: boolean;
  checkT: number;
}

export interface TwistWorld {
  rain: Gust[];
  blizzard: Gust[];
  /** Where each passing twist is at the clock's second (refreshed each step). */
  now: Record<PassingKind, WeatherLevel>;
  wetT: number;
  cold: ColdState;
}

const IDLE: WeatherLevel = { phase: 'idle', tell: 0, ease: 0, n: 0, left: 0, bar: 0 };

/** The showers or storms of a passing twist: one in each span (`per`), at a random place in it, never before the anomalies' first warning. */
export function passing(r: Rng, d: PassingDef, at: { day: number; evening: number; midnight: number }): Gust[] {
  const spans: [number, number][] = d.per === 'phase' ? [[0, at.day], [at.day, at.evening], [at.evening, at.midnight]] : [[at.day, at.evening]];
  return spans.map(([a, b], n) => {
    const lo = Math.max(a, WEATHER.from) + d.warn;
    const on = r.range(lo, Math.max(lo, b - d.hold));
    return { n, warn: on - d.warn, on, off: on + d.hold };
  });
}

export function twistWorld(seed: number | string, biome: BiomeId, at: { day: number; evening: number; midnight: number }, dungeon: boolean): TwistWorld {
  const tw = dungeon ? {} : TWISTS[biome] ?? {};
  const r = rng(`twists/${seed}/${biome}`);
  return {
    rain: tw.rain ? passing(r.fork('rain'), RAIN, at) : [],
    blizzard: tw.blizzard ? passing(r.fork('blizzard'), BLIZZARD, at) : [],
    now: { rain: IDLE, blizzard: IDLE },
    wetT: 0,
    cold: { on: !!tw.cold, stacks: 0, t: 0, warm: true, checkT: 0 },
  };
}

/** The share of his sight the blizzard leaves now (1 when none): `BLIZZARD.tiles` of the Communicator's at full strength. */
export const blizzardSight = (sim: Sim) => 1 + (BLIZZARD.tiles / SIGHT.communicator.r - 1) * sim.twists.now.blizzard.ease;

/** Is the rain falling hard enough to wet things now? */
export const raining = (sim: Sim) => sim.twists.now.rain.phase === 'on' && sim.twists.now.rain.ease >= RAIN.from;

// ---------------------------------------------------------------- the step

const LINES: Record<PassingKind, { warn: string; again: string; end: string }> = {
  rain: {
    warn: 'Rain is coming: the sky is going dark. Everything out there will be Wet, yours and theirs, and Shock runs through the Wet. Mind your arc-guns, and use them.',
    again: 'Another shower coming. Everything gets Wet again.',
    end: 'The rain has passed. Things will dry.',
  },
  blizzard: {
    warn: 'A blizzard is coming down the ridge. You will see five tiles ahead, no more. Keep your robots close.',
    again: 'Snow again, thick. Keep close.',
    end: 'The blizzard has blown over. You can see again.',
  },
};

function announce(sim: Sim, kind: PassingKind, gusts: Gust[]) {
  const t = sim.dayT;
  for (const g of gusts) {
    if (!g.told && t >= g.warn) {
      g.told = true;
      sim.events.push({ e: 'climate', kind, what: 'warn', n: g.n });
      sim.say(`${kind}-warn-${g.n}`, sim.said.has(`${kind}-warned`) ? LINES[kind].again : LINES[kind].warn, 'warn');
      sim.said.add(`${kind}-warned`);
    }
    if (!g.started && t >= g.on) {
      g.started = true;
      sim.events.push({ e: 'climate', kind, what: 'start', n: g.n });
    }
    if (!g.done && t >= g.off) {
      g.done = true;
      sim.events.push({ e: 'climate', kind, what: 'end', n: g.n });
      if (g.n === 0) sim.say(`${kind}-end`, LINES[kind].end, 'calm');
    }
  }
}

/** The rain: while it falls, every unit on the land is Wet, laid on again every `RAIN.every` s. */
function rainStep(sim: Sim, dt: number) {
  const W = sim.twists;
  if (!raining(sim)) {
    W.wetT = 0;
    return;
  }
  W.wetT -= dt;
  if (W.wetT > 0) return;
  W.wetT = RAIN.every;
  for (const b of sim.bots) if (!b.dead) sim.engine.apply(b, 'wet', { duration: RAIN.wet });
  for (const h of sim.hornets) if (!h.dead && !h.under) sim.engine.apply(h, 'wet', { duration: RAIN.wet });
}

/** Warmth at a point (`COLD`): the lift, a crew robot's lamp, a fire, the Hot Spring's pool. Not his own lamp. */
export function warmAt(sim: Sim, x: number, y: number) {
  if (dist(x, y, sim.lift.x, sim.lift.y) <= COLD.lift) return true;
  for (const b of sim.crew) {
    if (b.dead || sim.engine.isDown(b)) continue;
    if (dist(x, y, b.x, b.y) <= Math.max(COLD.lamp, sim.engine.stat(b, 'lamp', 0))) return true;
  }
  for (const z of sim.props.zones) if (z.kind === 'fire' && dist(x, y, z.x, z.y) <= z.r + COLD.fire) return true;
  for (const p of sim.places) if (p.id === 'spring' && dist(x, y, p.x, p.y) <= HOT_SPRING.pool * T) return true;
  return false;
}

/** The cold: out of warmth a Chilled stack every `COLD.every` s up to `COLD.cap`, held on him while he stays out; warmth strips them. */
function coldStep(sim: Sim, dt: number) {
  const C = sim.twists.cold, c = sim.controller;
  if (!C.on || c.dead || sim.engine.isDown(c)) return;
  C.checkT -= dt;
  if (C.checkT <= 0) {
    C.checkT = COLD.check;
    C.warm = warmAt(sim, c.x, c.y);
  }
  if (C.warm) {
    if (C.stacks > 0) {
      sim.engine.strip(c, 'chilled');
      C.stacks = 0;
      sim.events.push({ e: 'climate', kind: 'cold', what: 'warm', stacks: 0 });
    }
    C.t = 0;
    return;
  }
  C.t += dt;
  if (C.t >= COLD.every) {
    C.t -= COLD.every;
    if (C.stacks < COLD.cap) {
      C.stacks++;
      sim.events.push({ e: 'climate', kind: 'cold', what: 'chill', stacks: C.stacks });
      if (C.stacks === 1) sim.say('cold-first', 'You are cold. Stay out here and it slows you down. A lamp, a fire or the lift will warm you: your robots\' lamps count.', 'warn');
    }
  }
  if (C.stacks > 0) holdChill(sim, C.stacks);
}

/** He wears at least the cold's stacks of Chilled while out in it (a foe's Cold hit can add a third: Frozen). */
function holdChill(sim: Sim, stacks: number) {
  const c = sim.controller, have = sim.engine.stacks(c, 'chilled');
  if (have < stacks) sim.engine.apply(c, 'chilled', { stacks: stacks - have, duration: 1 });
  else sim.engine.renew(c, 'chilled', 1);
}

/** Each frame while the clock runs: announce the passing twists, wet the land in the rain, chill him in the cold. */
export function twistStep(sim: Sim, dt: number) {
  const W = sim.twists, t = sim.dayT;
  W.now.rain = W.rain.length ? weatherLevel(W.rain, t) : IDLE;
  W.now.blizzard = W.blizzard.length ? weatherLevel(W.blizzard, t) : IDLE;
  announce(sim, 'rain', W.rain);
  announce(sim, 'blizzard', W.blizzard);
  rainStep(sim, dt);
  coldStep(sim, dt);
  commuteStep(sim);
}

// ---------------------------------------------------------------- dev

/** Dev `twist <rain|blizzard> now`: one warns now (the schedule's own stay). False when the land has none. */
export function twistNow(sim: Sim, kind: PassingKind) {
  const W = sim.twists, d = kind === 'rain' ? RAIN : BLIZZARD;
  if (!TWISTS[sim.biomeId]?.[kind] || sim.dungeon) return false;
  const t = sim.dayT, list = W[kind].filter((g) => t < g.warn || t >= g.off);
  const on = t + d.warn;
  list.push({ n: list.length + 100, warn: t, on, off: on + d.hold });
  W[kind] = list.sort((a, b) => a.warn - b.warn);
  return true;
}

/** Dev `twist <rain|blizzard> off`: the one now warned or holding ends (eased out). */
export function twistOff(sim: Sim, kind: PassingKind) {
  const W = sim.twists, t = sim.dayT;
  for (const g of W[kind]) {
    if (t < g.warn || t >= g.off) continue;
    if (t < g.on) g.off = g.on = g.warn = -1;
    else g.off = Math.min(g.off, t + WEATHER.ease * weatherLevel([g], t).ease);
  }
  W[kind] = W[kind].filter((g) => g.off > 0);
}

/** Dev `cold <0-2|warm>`: set the cold's stacks on him now. */
export function setCold(sim: Sim, stacks: number) {
  const C = sim.twists.cold;
  C.stacks = Math.max(0, Math.min(COLD.cap, stacks));
  C.t = 0;
  sim.engine.strip(sim.controller, 'chilled');
  if (C.stacks) holdChill(sim, C.stacks);
}

export function twistSummary(sim: Sim) {
  const W = sim.twists, row = (g: Gust) => `${g.n}: warn ${Math.round(g.warn)} on ${Math.round(g.on)} off ${Math.round(g.off)}${g.done ? ' done' : ''}`;
  return {
    ...(W.rain.length && { rain: { phase: W.now.rain.phase, ease: +W.now.rain.ease.toFixed(2), showers: W.rain.map(row) } }),
    ...(W.blizzard.length && { blizzard: { phase: W.now.blizzard.phase, ease: +W.now.blizzard.ease.toFixed(2), sight: +blizzardSight(sim).toFixed(2), storms: W.blizzard.map(row) } }),
    ...(sim.rush.length && { rush: rushSummary(sim) }),
    ...(W.cold.on && { cold: { stacks: W.cold.stacks, warm: W.cold.warm, next: +(COLD.every - W.cold.t).toFixed(1) } }),
  };
}
