/**
 * The rows of a mission's results screen (`Play.end`): the one place that lists what the lift brought up (the Oracle's welcome
 * only comments, `hub/welcome.ts`). Pure: the mission's counts in, the kit's `ResultStat` rows out. A row that would read zero is
 * left out when it is a thing that may simply not have happened (copper, cores, guests); the crew and the haul always show.
 */
import type { ResultStat } from '../../../harness/kit';

export interface Came {
  scrap: number;
  copper: number;
  coal: number;
  /** AI cores found. */
  cores: number;
  insight: number;
  /** Pieces of old tech on the strip. */
  junk: number;
  /** The mission's counters (`Sim.stats`). */
  stats: Record<string, number>;
  /** Names of the stranded who made it onto the lift. */
  guests: string[];
  /** Scrap the colony pays for the guests it did not have aboard yet. */
  thanks: number;
}

export function resultRows(c: Came): ResultStat[] {
  const s = c.stats;
  const some = (n: number, label: string, value: number = n): ResultStat[] => (n > 0 ? [{ label, value }] : []);
  return [
    { label: 'Scrap brought up', value: Math.floor(c.scrap) },
    ...some(c.thanks, 'Scrap of thanks from the colony'),
    ...some(Math.floor(c.copper), 'Copper stripped'),
    ...some(Math.floor(c.coal), 'Coal mined'),
    ...some(c.cores, 'AI cores found'),
    { label: 'Enemy parts', value: s.parts ?? 0 },
    ...some(c.junk, 'Old tech on the strip'),
    ...some(c.insight, 'Insight found'),
    { label: 'Robots saved', value: s.saved ?? 0 },
    { label: 'Robots lost', value: s.lost ?? 0 },
    { label: 'Left on the sands', value: s.left ?? 0 },
    ...(c.guests.length ? [{ label: c.guests.length === 1 ? 'Guest' : 'Guests', value: c.guests.join(' and ') }] : []),
    { label: 'Mechahornets downed', value: s.killed ?? 0 },
    { label: 'Ruins searched', value: (s.ruins ?? 0) - (s.decoded ?? 0) },
    ...some(s.decoded ?? 0, 'Live ruins decoded'),
    ...some(Math.floor(s.tapped ?? 0), 'Oil mended at the tap'),
    { label: 'Times winched back', value: s.winched ?? 0 },
  ];
}
