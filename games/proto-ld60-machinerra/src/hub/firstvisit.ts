/**
 * The first hub visit (`docs/level-1.md`, "Hand-off to the hub"), guided by light, not text: one place glows at a time, the rest
 * of the deck stays dim until it is done. In order: the church (the Oracle's step 1 and the research picks), Sprocket's workshop
 * (her first lesson: D29), the course table, the lift. Plain TS; `Hub` draws the glow (`guideTarget`) and holds the one fact that
 * is not in the save, that the course table was opened.
 * It runs only for the visit after the first mission (`missions === 1`), and ends the moment the lift lowers.
 */
import { S } from './story';

export type GuideTarget = 'highPriest' | 'sprocket' | 'command' | 'lift';

export interface GuideFacts {
  /** `HubState.missions`. */
  missions: number;
  /** The main quest's step (`stepOf`: 0 before the Oracle has spoken, `DONE` at the end). */
  mainStep: number;
  /** Research picks waiting (`picksWaiting`). */
  picks: number;
  /** Sprocket aboard, and her first lesson taken (her station, the workbench, stands the day she is aboard). */
  sprocketAboard: boolean;
  sprocketTaught: boolean;
  /** The course table was opened this visit. */
  tableSeen: boolean;
}

/** What glows now, or null when the guide is over (not the first visit, or everything done and the lift is the only thing left to do, which still glows). */
export function guideTarget(f: GuideFacts): GuideTarget | null {
  if (f.missions !== 1) return null;
  const heard = f.mainStep >= S.scrap;
  if (!heard || f.picks > 0) return 'highPriest';
  if (f.sprocketAboard && !f.sprocketTaught) return 'sprocket';
  if (!f.tableSeen) return 'command';
  return 'lift';
}
