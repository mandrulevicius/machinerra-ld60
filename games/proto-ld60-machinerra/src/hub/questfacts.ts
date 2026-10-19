/**
 * The hub facts the quest lines read (P38), gathered from the saves: what stands on the deck, what the stores hold of each
 * kind of hand-in, the robots specialised, the body slots fitted, the quest book's counts and the acts (`acts.ts`).
 * `factsFor` (`talk.ts`) spreads them into every script's facts; a goal of kind `fact` or `hand` names one of them
 * (`lines.ts`). Add a fact: a line here.
 */
import { COMM_SLOTS, owned } from '../sim/gear';
import { PARTS, type PartKind } from '../sim/defs';
import type { Flags } from './dialog';
import { actFacts, standing } from './acts';
import { bookFacts, type QuestBook } from './questbook';
import { PART_FILTERS } from './lines';
import type { HubState } from './state';
import type { Gear } from '../sim/gear';
import type { Roster } from './workshop';

/** Body slots (everything the Communicator wears but his two weapons): Dr. Gasket's "augments". */
const BODY = COMM_SLOTS.filter((s) => s !== 'primary' && s !== 'secondary');

/** Parts in the stores that a hand-in may take (a boss's unique never). */
const held = (s: HubState) => (Object.entries(s.parts) as [PartKind, number][]).filter(([k, n]) => (n ?? 0) > 0 && !PARTS[k]?.unique);

export function questFacts(s: HubState, o: { book: QuestBook; roster: Pick<Roster, 'bots'>; gear: Gear; copper: number }): Flags {
  const have = held(s);
  const sum = (f: (k: PartKind) => boolean) => have.reduce((a, [k, n]) => a + (f(k) ? n : 0), 0);
  const st = standing(s);
  return {
    'parts.kinds': have.filter(([k]) => PART_FILTERS.kinds(k)).length,
    'parts.wings': sum(PART_FILTERS.wings),
    'parts.eliteArms': sum(PART_FILTERS.eliteArms),
    copper: o.copper,
    buildings: st.buildings,
    npcStations: st.stations,
    specialised: o.roster.bots.filter((b) => b.spec).length,
    augments: BODY.filter((slot) => owned(o.gear, o.gear.comm[slot])).length,
    expeditions: s.expedition?.sent ?? 0,
    cityBuildings: s.buildings?.built.length ?? 0,
    replicator: s.buildings?.built.includes('replicator') ? 1 : 0,
    oilFragments: o.book.frags.filter((f) => f.startsWith('oil:')).length,
    ...bookFacts(o.book),
    ...actFacts(s, o.book),
  };
}
