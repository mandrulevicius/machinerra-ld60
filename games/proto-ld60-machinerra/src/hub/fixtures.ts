/**
 * Test fixtures for the hub rules (not imported by the game). A new game starts alone (`freshRoster()`: no robots,
 * `freshEconomy()`: no AI cores); a test that needs a crew builds the old one here: the six of `START_CREW`
 * ride, and a core for each.
 */
import { START_CREW } from '../sim/defs';
import { freshEconomy, type Economy } from './economy';
import type { CrewRole } from '../sim/gear';
import { freshRoster, type Roster } from './workshop';

/** The six robots a game used to start with (`START_CREW`), uids r1..r6, all riding. */
export const oldCrewRoster = (): Roster => ({
  ...freshRoster(),
  bots: START_CREW.map((c, i) => ({ uid: `r${i + 1}`, name: c.name, role: c.role as CrewRole, rank: 0, wreck: false })),
  next: START_CREW.length + 1,
});

/** A stock with a core for each of the old crew. */
export const oldCrewEconomy = (o: Partial<Economy> = {}): Economy => ({ ...freshEconomy(), cores: START_CREW.length, ...o });
