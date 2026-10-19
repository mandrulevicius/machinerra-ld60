/**
 * What the NPCs' conversations remember (`Talk` in `dialog.ts`: flags and quest steps) as its own persistent slice
 * (`persist`, `save.ts`), so a save, a reload and Continue keep them. Kept apart from `talk.ts` so the data stays
 * importable without storage (tests).
 */
import { freshTalk, type Talk } from './dialog';
import { persist } from './save';
import { freshTitles, type Titles } from './titles';
import type { LineProgress } from './lines';
import { freshBook, type QuestBook } from './questbook';

export const talkSave = persist<Talk>('talk', freshTalk, {
  sample: { flags: { 'met.trader': 1, 'oracle.blessed': 2 }, quests: { sprocket: 2, hob: 99 } },
});
/** Titles the quest lines earned and the one worn (`titles.ts`). */
export const titleSave = persist<Titles>('titles', freshTitles, { sample: { earned: ['queenBreaker', 'theBoot'], worn: 'theBoot' } });
/** The NPC quest lines' progress counted on the sands (`lines.ts`; `land` feeds it). */
export const lineSave = persist<LineProgress>('lines', () => ({}), {
  sample: { sprocket: { step: 2, n: 3 }, hob: { step: 1, n: 7 } },
});
/** What the quests keep besides the dialog's flags and the lines' progress: hub counts, the princess's fragments, the Oracle's advice, the sign in the church (`questbook.ts`). */
export const questBook = persist<QuestBook>('questbook', freshBook, {
  sample: {
    sold: 6, bought: 3, savedBest: 2, frags: ['mast:desert', 'oil:jungle'], ignored: 4, obeyed: 1, dreamed: '4242:1760000000000', signHung: true,
    pack: { biscuits: 1, starOil: 1 }, oilTrips: 1,
    job: { id: 'rep.kicker.crash', giver: 'kicker', line: 'Rock. Answer. Again.', task: 'Kill 8 machines by crash', goal: { stat: 'crashKills', mode: 'atLeast', n: 8 }, reward: 'kickCard' },
    lastJob: { text: 'Kill 8 machines by crash', done: true }, repeatsDone: { hob: 2 }, items: ['boot'], cats: 2,
  },
});
