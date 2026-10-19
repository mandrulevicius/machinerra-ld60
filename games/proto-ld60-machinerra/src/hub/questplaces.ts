/**
 * When a quest-only place is in a land (P42; the `presence.quest` rule of a place file, `sim/places.ts`), plain TS over the saves. A rule names
 * a step as `<quest id>.<step>` (`dog.1`, `cat.1`, `shoot.1`, `expeditioner.story.3`): the place is in a land while that step is the current one
 * and open, or, for a special line that has not started (`lines.ts` `auto`), while it is about to. `dog.dig` is the dig mounds: they are on every
 * land once the dog is yours, and while the dog's second step wants them.
 * A place stops coming once its thing is home but not yet handed in (the dog, the cat, the boot), so a land never offers what you hold.
 * `installPresence` is called once at boot (`main.ts`): the hub, the ascent and the mission all generate lands through the same checks.
 *
 * Add a quest place: its file's `presence.quest`, a line in `HAVE` if holding its thing ends its coming, the place's behaviour (`sim/placequest.ts`).
 */
import { presence } from '../sim/places';
import { actFacts } from './acts';
import { holds, stepOf } from './dialog';
import { hasCat, hasDog } from './companions';
import { hub } from './save';
import { LINES, isOpen } from './lines';
import { DOCK_BIOMES } from './princessdocks';
import { questBook, talkSave } from './talkslice';
import type { QuestBook } from './questbook';
import { aboardFacts, type HubState } from './state';
import type { BiomeId } from '../sim/defs';
import { generate } from '../sim/mapgen';

/** Holding the thing ends the step's place: the dog and the cat are perks, the boot is a quest item. */
const HAVE: Record<string, (s: HubState, b: QuestBook) => boolean> = {
  'dog.1': (s) => hasDog(s),
  'cat.1': (s) => hasCat(s),
  'shoot.1': (_s, b) => b.items.includes('boot'),
};

/** The facts a special line's `auto` and a step's `open` read here: the acts, the missions flown and who is aboard. */
export const autoFacts = (s: HubState, b: QuestBook) => ({ ...actFacts(s, b), ...aboardFacts(s), missions: s.missions });

/**
 * P58 H: does the Princess's ladder want an old dock on a land of this biome (`dock.<biome>` in `mapgen.ts`)? She is home and the step she is on
 * is that biome's. The roll that follows (one land in `DOCK.oneIn`) is the generator's.
 */
export function dockWanted(biome: string, s: HubState, talk = talkSave.get()): boolean {
  if (s.story?.wife !== 'home') return false;
  const g = LINES.princess.steps[stepOf(talk, 'princess') - 1]?.goal;
  return !!g && 'biome' in g && g.biome === biome;
}

/** Is this step the current one, open, and its thing not held yet? (Pure over the saves; tests pass their own.) */
export function stepActive(id: string, s: HubState, b: QuestBook, talk = talkSave.get()): boolean {
  if (id.startsWith('dock.')) return dockWanted(id.slice(5), s, talk);
  if (id === 'dog.dig') return hasDog(s) || stepOf(talk, 'dog') === 2;
  const m = /^(.+)\.(\d+)$/.exec(id);
  if (!m) return false;
  const [, quest, n] = m, step = Number(n), line = LINES[quest];
  if (!line || HAVE[id]?.(s, b)) return false;
  const facts = autoFacts(s, b);
  const now = stepOf(talk, quest);
  const current = now === step || (step === 1 && now === 0 && !!line.auto && holds(talk, facts, line.auto));
  return current && isOpen(line.steps[step - 1], talk, facts);
}

export const questActive = (id: string) => stepActive(id, hub.get(), questBook.get());

const SEEN = new Map<string, string[]>();
/**
 * The place ids a land holds, for the course table's pips (a pip is a promise: the Kennel's paw shows only where a Kennel stands). It generates
 * the land (about 30 ms), so it is cached by land and by which quest places are asked for now; a land is regenerated only when a quest moves.
 */
export function placesOf(seed: number | string, biome: BiomeId): string[] {
  const sig = [...QUEST_PLACES, ...DOCK_ASKS].map((id) => (questActive(id) ? 1 : 0)).join('');
  const key = `${biome}/${seed}/${sig}`;
  let got = SEEN.get(key);
  if (!got) {
    const m = generate(seed, undefined, undefined, biome);
    got = [...m.places.map((p) => p.id), ...(m.ruins.some((r) => r.kind === 'dock') ? ['dock'] : [])]; // an old dock (P58 H) is a ruin, shown as a place for the pips
    if (SEEN.size > 40) SEEN.clear();
    SEEN.set(key, got);
  }
  return got;
}
export const QUEST_PLACES = ['dog.1', 'cat.1', 'shoot.1', 'expeditioner.story.3', 'dog.dig'];
/** What else a land's make depends on (P58 H): whether the ladder asks for a dock on each biome. */
const DOCK_ASKS = DOCK_BIOMES.map((b) => `dock.${b}`);

/** Make the places' `presence.quest` rules read the saves. */
export const installPresence = () => presence.set({ questActive });
