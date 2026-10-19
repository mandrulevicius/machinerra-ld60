/** Test helper for `daysources.test.ts` and `daysources.slow.test.ts`: the day's spawns counted by phase and source. */
import type { BiomeId } from './defs';
import { NO_INPUT, Sim } from './sim';

export type Phase = 'morning' | 'day' | 'evening' | 'midnight';
/** Spawns by source (hive: from a hive; rim: arrived from off the map) and what they rolled; `secs` is how long the phase lasted. */
export type Row = { hive: number; rim: number; elite: number; twisted: number; menacing: number; rimElite: number; rimTwisted: number; secs: number };
const blank = (): Row => ({ hive: 0, rim: 0, elite: 0, twisted: 0, menacing: 0, rimElite: 0, rimTwisted: 0, secs: 0 });
const done = new Map<string, Record<Phase, Row>>();

/**
 * Spawns per phase and source over a whole day plus two minutes past midnight (the menacing share reaches 1 at 3:00, 90 s), with a scripted killer that clears every enemy each second
 * (so no cap throttles the sources: the counts are the sources' own pace). `dt` is the step: the fast suite takes a coarse one (the sources
 * are timer-driven, and its checks are on their ordering), the slow suite the live game's 1/30. One run per land and step for the whole file.
 * Append the counts to the file in CENSUS: `CENSUS=out.txt npm test -- daysources`.
 */
export function census(biome: BiomeId, seed = 4, dt = 0.1) {
  const key = `${biome}/${seed}/${dt}`;
  const have = done.get(key);
  if (have) return have;
  const s = new Sim(seed, [], biome);
  s.bots = [s.controller];
  s.god = true;
  const rows: Record<Phase, Row> = { morning: blank(), day: blank(), evening: blank(), midnight: blank() };
  const total = s.day.at.midnight + 120; // this land's day
  const every = Math.round(1 / dt);
  for (let i = 0; i < total / dt; i++) {
    s.step(dt, NO_INPUT);
    rows[s.day.phase].secs += dt;
    for (const e of s.events) {
      if (e.e !== 'spawn' || e.h.boss || (!e.h.rim && !e.h.nest)) continue; // the boss's brood is neither a hive's nor an arrival
      const r = rows[s.day.phase];
      if (e.h.rim) r.rim++;
      else r.hive++;
      if (e.h.elite) r.elite++;
      if (e.h.twisted) r.twisted++;
      if (e.h.menacing) r.menacing++;
      if (e.h.rim && e.h.elite) r.rimElite++;
      if (e.h.rim && e.h.twisted) r.rimTwisted++;
    }
    s.events.length = 0;
    if (i % every === every - 1) for (const h of s.hornets) if (!h.dead && !h.boss) s.slay(h);
  }
  done.set(key, rows);
  return rows;
}
