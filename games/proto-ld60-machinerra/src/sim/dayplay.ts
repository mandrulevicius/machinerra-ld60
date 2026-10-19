/**
 * The day in a mission: each step the clock moves the phase, the evening twists the foes, hives wake, the berserk steps tick past midnight, the dusk boss comes.
 * The numbers and the pure day state are defs/day.ts and clock.ts.
 * Add a beat of the day: a branch in `clockStep` keyed on the phase change.
 */

import {
  duskBoss,
  leaveArena,
} from './boss';
import {
  type DayPhase,
  berserkMul,
  dayState,
} from './clock';
import { ALARM, DAY, MENACE, NEST, T } from './defs';
import {
  morningRamp,
  spawnHornet,
  twist,
  wake,
} from './foes';
import { dist } from './geom';
import { advise, say } from './oracle';
import type { Sim } from './sim';
import { CLOCK } from './types';

export type DayEvent =
  /** The clock enters a phase. */
  | { e: 'day'; phase: DayPhase }
  /** A berserk step past midnight: the dial ticks (`level` changes every `BERSERK.perLevel`th). */
  | { e: 'berserk'; step: number; level: number }
  /** A hunter pack (menace level 5): it is `warn`ed `MENACE.pack.warn` s ahead, from (x, y); then it `come`s. */
  | { e: 'hunt'; what: 'warn' | 'come'; x: number; y: number; n: number };

/** The hunter pack: the clock second (`dayT`) it comes at (null before the first), the direction it comes from (radians from the Communicator), how many came, and whether this one is announced. */
export interface HuntState { at: number | null; a: number; n: number; warned: boolean }
export const huntState = (): HuntState => ({ at: null, a: 0, n: 0, warned: false });

/** Where the next pack comes in: `MENACE.pack.away` px from the Communicator, in its direction, on open ground inside the map. */
export function huntSpot(sim: Sim) {
  const c = sim.controller, A = MENACE.pack.away;
  const x = Math.min(sim.W * T - T, Math.max(T, c.x + Math.cos(sim.hunt.a) * A));
  const y = Math.min(sim.H * T - T, Math.max(T, c.y + Math.sin(sim.hunt.a) * A));
  return sim.passableNear(x, y);
}

/** Where an edge arrow points while the pack is announced (`MENACE.pack.warn` s ahead), or null. */
export function huntCue(sim: Sim) {
  const H = sim.hunt;
  return H.warned && H.at !== null && sim.dayT < H.at ? huntSpot(sim) : null;
}

/**
 * From menace level 5 (`MENACE.pack`) a pack of three twisted elites comes at the Communicator every minute: announced
 * `warn` s ahead by the Oracle and an edge arrow, then out of the dark `away` px from him, hunting him.
 */
function hunterPack(sim: Sim) {
  const H = sim.hunt, P = MENACE.pack;
  if (sim.day.level < P.from) return;
  H.at ??= sim.dayT + P.warn;
  if (!H.warned && sim.dayT >= H.at - P.warn) {
    H.warned = true;
    H.a = sim.tiers.r.range(0, Math.PI * 2);
    const s = huntSpot(sim);
    sim.events.push({ e: 'hunt', what: 'warn', x: s.x, y: s.y, n: H.n + 1 });
    say(sim, `hunt-${H.n + 1}`, H.n ? `Another hunter pack, ${P.warn} seconds out.` : `Something is hunting you now, Communicator: three of them, twisted, in ${P.warn} seconds. Look to the edge of the screen.`, 'urgent');
  }
  if (sim.dayT < H.at) return;
  const s = huntSpot(sim), c = sim.controller;
  const kind = sim.tiers.r.weighted(sim.biome.foes);
  for (let i = 0; i < P.count; i++) {
    const off = (i - (P.count - 1) / 2) * 40;
    const h = spawnHornet(sim, s.x - Math.sin(H.a) * off, s.y + Math.cos(H.a) * off, 0, true, true, kind);
    h.target = c.id;
    h.alertT = sim.time + ALARM.time; // they hunt farther for a while, as the whistled do: they come from beyond the screen
  }
  H.n++;
  H.at = Math.max(H.at + P.every, sim.dayT + P.warn); // a dev time jump never makes it catch up with a string of packs
  H.warned = false;
  sim.events.push({ e: 'hunt', what: 'come', x: s.x, y: s.y, n: H.n });
}

/** The clock: phase changes (the Oracle, the hives), the evening's twisting, the dusk boss's arrival. */
export function clockStep(sim: Sim, dt: number) {
  sim.refreshFx();
  const d = (sim.day = dayState(sim.dayT, sim.dayCfg));
  if (!sim.morningHive && d.phase === 'morning' && !sim.dungeon) {
    // The morning's hive is awake from the first second, quietly (no beat: it is a trickle); `morningSwarm` 0 keeps every hive asleep.
    sim.morningHive = true;
    if (sim.cfg.morningSwarm > 0) {
      wakeNests(sim, DAY.hives.morning, true);
      for (const n of sim.nests) if (n.awake && !n.place) n.spawnT = Math.min(n.spawnT, NEST.interval[0] / morningRamp(sim));
    }
  }
  if (d.phase !== sim.dayPhase) {
    sim.dayPhase = d.phase;
    sim.engine.setPhase(d.phase);
    sim.drainFx();
    sim.events.push({ e: 'day', phase: d.phase });
    if (d.phase !== 'morning') wakeNests(sim, d.phase === 'midnight' ? DAY.hives.midnight : sim.biome.wake[d.phase]);
    // Midnight is no game over and forces nothing: you may stay, and it only gets worse a step every ten seconds.
    if (d.phase === 'midnight') advise(sim, 'midnight', 'Midnight. I will not order you home, but every ten seconds the machines out here come stronger, and it will not stop. Go while you can.', 'urgent');
  }
  if (d.step !== sim.stepSeen) {
    // Steps come one at a time, but a dev `time` jump may skip many: the events say where it landed.
    sim.stepSeen = d.step;
    sim.bzNow = berserkMul(d.step, sim.cfg.berserk);
    sim.events.push({ e: 'berserk', step: d.step, level: d.level });
  }
  if (d.twist > 0) {
    sim.twistT -= dt;
    if (sim.twistT <= 0) {
      sim.twistT = 0.5;
      const live = sim.hornets.filter((h) => !h.dead && !h.boss);
      const plain = live.filter((h) => !h.twisted);
      const want = d.twist >= 1 ? live.length : Math.ceil((d.twist - 0.05) * live.length);
      const short = want - (live.length - plain.length);
      for (let i = 0; i < Math.min(short, plain.length); i++) twist(sim, plain.splice(sim.r.int(0, plain.length - 1), 1)[0]);
    }
  }
  hunterPack(sim);
  if (sim.biome.dusk && sim.land?.duskBoss !== false && sim.dayT >= d.at.boss && !sim.bossSpawned) duskBoss(sim, sim.biome.dusk);
  if (d.phase === 'midnight') for (const h of sim.hornets) if (h.arena && !h.dead) leaveArena(sim, h);
}

/** Wake sleeping hives, the nearest to the Communicator first, until `count` are awake. */
export function wakeNests(sim: Sim, count: number, quiet = false) {
  const c = sim.controller;
  const sleepers = sim.nests.filter((n) => !n.awake && !n.dead && !n.place).sort((p, q) => dist(p.x, p.y, c.x, c.y) - dist(q.x, q.y, c.x, c.y));
  for (let i = sim.nests.filter((n) => n.awake && !n.place).length; i < count && sleepers.length; i++) {
    const n = sleepers.shift()!;
    if (quiet) n.awake = true; // the morning's: no beat, no Oracle line
    else wake(sim, n, CLOCK);
  }
}
