/**
 * The Trader's specials (P38; quests.md proposals 9 and 11, kept as the lead's call), plain TS: boons bought at the stall for the next
 * landing. **Brass biscuits** (her first story step done): eaten when the lift goes down, +15 oil at most for that mission.
 * **Star oil** (the special shelf, her second step): drunk on the sands with Use, it stops the clock for `STAR_OIL.seconds` and
 * shows the land from above as a constellation, and on a land that has not told one it pays a fragment of the princess's signal.
 * On the shelf every other lift once her second step is done, every lift after her third. Prices are guesses (scrap).
 * What is bought is `QuestBook.pack` (kind -> how many); a mission takes it down (`QuestOpts.pack`) and `bookAfter` (`carry.ts`) spends what it used.
 */
import { DONE, stepOf, type Talk } from './dialog';
import type { QuestBook } from './questbook';

export type Boon = 'biscuits' | 'starOil';
export const BOONS: Record<Boon, { name: string; price: number; text: string }> = {
  biscuits: { name: 'Brass biscuits', price: 40, text: 'Honest brass, walnut-shaped. Eaten on the way down: 15 more oil at most for the next landing.' },
  starOil: { name: 'Star oil', price: 90, text: 'One drop and you see the whole land from above. Time stops for a while. Do not operate heavy machinery: you are heavy machinery.' },
};
export { BISCUIT, STAR_OIL } from '../sim/questcount';

/** The Trader's story line: its third step opens when step 2 is done, the line done is `DONE`. */
const done = (talk: Talk, step: number) => {
  const s = stepOf(talk, 'trader.story');
  return s === DONE || s > step;
};

/** What is on the specials shelf this lift (`missions` flown). */
export function offered(talk: Talk, missions: number): Boon[] {
  const out: Boon[] = [];
  if (done(talk, 1)) out.push('biscuits');
  if (done(talk, 3) || (done(talk, 2) && missions % 2 === 0)) out.push('starOil');
  return out;
}

/** Buy one: its price in scrap off the stock, one more in the pack. Throws with the reason. */
export function buyBoon(book: QuestBook, scrap: number, boon: Boon, valued = false): { book: QuestBook; scrap: number; price: number } {
  const price = valued ? Math.ceil(BOONS[boon].price * 0.9) : BOONS[boon].price;
  if (scrap < price) throw new Error(`costs ${price} scrap; you have ${scrap}`);
  return { book: { ...book, pack: { ...book.pack, [boon]: (book.pack[boon] ?? 0) + 1 } }, scrap: scrap - price, price };
}
