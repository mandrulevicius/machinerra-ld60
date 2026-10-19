/**
 * What the quests keep that no other system does (P38), as one persistent slice (`questBook` in `talkslice.ts`), plain TS here
 * so the rules stay importable without storage. Counts of hub deeds (wares sold and bought at the stall), the best haul of
 * robots on one lift, the princess's fragments heard, the Oracle's advice heeded and ignored, the First Scripture's sign in
 * the church. A mission's counters are `Sim.stats` (`sim/questcount.ts`); progress on a quest line's current step is `lineSave`.
 */
import type { Flags } from './dialog';
import type { Job } from './repeats';

export interface QuestBook {
  /** Wares sold to the Trader / bought off her shelf (`trader.1`, `trader.2`). */
  sold: number;
  bought: number;
  /** The most robots that rode home on one lift (act 1: two). */
  savedBest: number;
  /** The princess's signal fragments heard, one per source (`mast:<land>`, `oil:<land>`); three are act 5. */
  frags: string[];
  /** The Oracle's "go home" heard and not heeded / heeded within `OBEY.within` seconds (`oracle.3`). */
  ignored: number;
  obeyed: number;
  /** The haul the Oracle last dreamed again for (once a visit: `dreamAgain` perk). */
  dreamed: string | null;
  /** The First Scripture's sign hangs in the church. */
  signHung: boolean;
  /** Things bought at the stall for the next landing (`trade.ts` `BOONS`): kind -> how many. */
  pack: Record<string, number>;
  /** Star oil drunk, per land (the constellation view shows what was seen). */
  oilTrips: number;
  /** The land's repeatable job the lift went down for (`repeats.ts`), and how the last one ended (the hub says so on returning). */
  job: Job | null;
  lastJob: { text: string; done: boolean } | null;
  /** Repeatable jobs done, per giver (`repeats.ts`). */
  repeatsDone: Record<string, number>;
  /** Quest items carried home from the sands (P42): the Green Shoot's `boot`, the dog's Squeaky `toy`. Not junk: they fit no socket. */
  items: string[];
  /** Returns since the catsplosion began: the Oracle counts the cats in her church by it (`companions.ts`). */
  cats: number;
}

export const freshBook = (): QuestBook => ({ sold: 0, bought: 0, savedBest: 0, frags: [], ignored: 0, obeyed: 0, dreamed: null, signHung: false, pack: {}, oilTrips: 0, job: null, lastJob: null, repeatsDone: {}, items: [], cats: 0 });

/** Fragments the ending needs. */
export const FRAGMENTS = 3;
/** The Oracle's advice heeded when the lift is called within this many seconds (quests.md `oracle.3`). */
export const OBEY = { within: 20, times: 3 };

/** The quest book as facts for the dialog (`factsFor`). */
export function bookFacts(b: QuestBook): Flags {
  return {
    sold: b.sold,
    bought: b.bought,
    fragments: b.frags.length,
    obeyed: b.obeyed,
    adviceIgnored: b.ignored,
    signHung: b.signHung ? 1 : 0,
    oilTrips: b.oilTrips,
    'item.boot': b.items.includes('boot') ? 1 : 0,
    'item.toy': b.items.includes('toy') ? 1 : 0,
  };
}
