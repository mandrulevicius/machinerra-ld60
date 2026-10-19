/**
 * The companions at home (P42), plain TS: the dog and the cat are perks of the hub (`PERKS`: `companionDog`, `companionCat`), so a save
 * keeps them with the rest of `HubState`, and the mission reads them from `Sim.perks`. What a lift brings home that makes them (or the quest
 * items of the special lines) is `companionsAfter`, called by `carry.ts` `landed`. The cat at home pays `CAT.home` scrap a return, and
 * with the Replicator the Oracle counts the cats in her church (`catLine`). Rules on the sands: `sim/companions.ts`, `sim/placequest.ts`.
 *
 * Add a companion: a perk, a stat the mission sets when it is won (`stats`), a branch here, its sim record in `sim/companions.ts`.
 */
import { CAT } from '../sim/defs';
import type { QuestBook } from './questbook';
import { hasBuilding } from './buildings';
import type { HubState, PerkId } from './state';

export const hasDog = (s: Pick<HubState, 'perks'>) => s.perks.includes('companionDog');
export const hasCat = (s: Pick<HubState, 'perks'>) => s.perks.includes('companionCat');

/** The Oracle's count of the cats in her church, by the returns since the Replicator began (quests.md Delights: 2, 5, 11, 23, 47, too many, then she stops). */
const COUNTS = ['2', '5', '11', '23', '47', 'too many'];
export const catLine = (n: number): string =>
  n > COUNTS.length ? 'I have stopped counting. They have not.' : `There are ${COUNTS[Math.max(1, n) - 1]} cats in my church.`;

/** The cat's scrap with a return: nothing without the cat. */
export const catHome = (s: Pick<HubState, 'perks'>) => (hasCat(s) ? CAT.home : 0);

const add = (s: HubState, perk: PerkId): HubState => (s.perks.includes(perk) ? s : { ...s, perks: [...s.perks, perk] });

/**
 * A lift has docked with these stats: the dog home on the lift is the dog's (`stats.dogHome`), the stray tamed is the cat's (`stats.catTamed`),
 * the boot and the toy go in the quest book. With the Replicator and the cat, the church's cat count goes up one. Returns what changed and
 * the banners; changes nothing for a mission that brought none of it.
 */
export function companionsAfter(s: HubState, b: QuestBook, stats: Record<string, number>): { hub: HubState; book: QuestBook; news: string[] } {
  const news: string[] = [];
  let hub = s;
  let book = b;
  if (stats.dogHome && !hasDog(hub)) {
    hub = add(hub, 'companionDog');
    news.push('The dog is yours. It goes down the lift with you now.');
  }
  if (stats.catTamed && !hasCat(hub)) {
    hub = add(hub, 'companionCat');
    news.push(`${CAT.name} is yours, or you are hers. She leaves ${CAT.home} scrap with every return.`);
  }
  if (stats.grafted) news.push('Dr. Gasket: "Splendid. I\'ll take that for study."'); // the graft fell off at the lift (`sim/graft.ts`)
  const items = [...book.items];
  for (const [stat, item, line] of [['got.boot', 'boot', 'A boot, and a green shoot in it. Take it to the Expeditioner.'], ['got.toy', 'toy', 'The Squeaky Toy is home. The Oracle wants a word about the dog.']] as const) {
    if (stats[stat] && !items.includes(item)) {
      items.push(item);
      news.push(line);
    }
  }
  if (items.length !== book.items.length) book = { ...book, items };
  if (hasCat(s) && hasBuilding(hub, 'replicator')) {
    book = { ...book, cats: book.cats + 1 };
    news.push(`The Oracle: "${catLine(book.cats)}"`);
  }
  return { hub, book, news };
}
