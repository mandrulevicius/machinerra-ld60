/**
 * A land's one work site, plain TS: the generator puts `SEEPS.count` points on the map (`mapgen.ts`, the old seeps, kept so
 * every land replays as it did) and the farthest from the lift is the land's one crude tap, a healing shrine (`TAP`,
 * `Sim.tapStep`): a trip with a hive nearby. The other points are nothing: scrap comes from kills, not heaps.
 */
export type SiteKind = 'crude';
interface At { x: number; y: number }

/** The tap's point: the one farthest from the lift (the first of equals), or null when the land has none (a dungeon). */
export function tapOf<T extends At>(seeps: T[], lift: At): T | null {
  let far: T | null = null;
  for (const s of seeps) if (!far || Math.hypot(s.x - lift.x, s.y - lift.y) > Math.hypot(far.x - lift.x, far.y - lift.y)) far = s;
  return far;
}
