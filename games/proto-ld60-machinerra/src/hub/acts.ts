/**
 * The earlier draft's five acts (`docs/quests.md`) as facts the NPC story lines open on, plain TS. P38 reconciles them with the
 * Oracle's main quest (P44, `story.ts`): the two acts quests.md already ties to a boss are that boss (act 2: the Hornet Queen,
 * main step 3; act 4: the Harbinger, main step 8); the others keep their own goals, counted from the saves.
 *
 * | act | done when |
 * |---|---|
 * | 1 Two by Two | two robots rode home on one lift (`QuestBook.savedBest`) |
 * | 2 The Queen's Errand | the Hornet Queen is down |
 * | 3 A Dock in Pencil | two NPC stations and a building stand |
 * | 4 The Jammer in the Castle | the Harbinger is down |
 * | 5 Three Fragments | three fragments of the princess's signal heard |
 *
 * Each act opens when the one before it is done (act 1 is open once the first return is home); act 5 also waits for the blessing:
 * her signal is the wife's, calling from the Ether once the Evil Oracle has taken her (P44, `story.wife` is `stolen`), not before. A step reads `act.<n>.open` or
 * `act.<n>.done` in its `open` condition (`lines.ts`); the relationship table in quests.md says which.
 */
import type { Flags } from './dialog';
import { FRAGMENTS, type QuestBook } from './questbook';
import { isBuilding, npc, type HubState } from './state';

/** Act 0 (quests.md "Static"): the first return home brings a faint voice over the antenna, and the Oracle's answer. */
export const STATIC_BEAT = {
  princess: '(faint, through static) ...returning to... dock...',
  oracle: 'Static, Communicator. The old world still mutters in its sleep. Ignore it.',
};

/** NPC stations standing, and the buildings (your house, the Wanderer's improvements) on lots. */
export function standing(s: Pick<HubState, 'stations'>) {
  const ids = Object.keys(s.stations);
  return { stations: ids.filter((id) => !isBuilding(id) && npc(id)).length, buildings: ids.filter(isBuilding).length };
}

export function actFacts(s: HubState, b: QuestBook): Flags {
  const down = s.story?.bosses ?? [];
  const st = standing(s);
  const done = [
    b.savedBest >= 2,
    down.includes('hornet'),
    st.stations >= 2 && st.buildings >= 1,
    down.includes('drone'),
    b.frags.length >= FRAGMENTS,
  ];
  const f: Flags = {};
  done.forEach((d, i) => {
    f[`act.${i + 1}.done`] = d ? 1 : 0;
    f[`act.${i + 1}.open`] = i === 0 ? (s.missions >= 1 ? 1 : 0) : done[i - 1] && (i < 4 || s.story?.wife === 'stolen') ? 1 : 0;
  });
  return f;
}
