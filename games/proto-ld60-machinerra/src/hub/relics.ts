/**
 * Misread junk at home (P19; `sim/junk.ts` has the relics themselves): the stock a mission brings (`Economy.junk`), fitting
 * one to a robot's relic socket by hand (D10: no auto-fit; one socket per robot, D4), selling it to the Trader, and offering
 * a duplicate of a worn relic to the Oracle for insight. Plain TS, no Phaser; each rule takes and returns a `Shop`
 * (`workshop.ts`) and throws with the reason when it cannot, as the workshop's do. `Hub` commits it.
 *
 * The two uniques are a boss's own parts in the stores (`HubState.parts`): fitting one takes it from there, taking it off
 * (or salvaging the robot) puts it back, so it is never lost and never sold. Common junk goes back to the stock.
 *
 * Where a relic can be fitted from (`Source`): a stock index, a unique part, or another robot's socket (the two swap).
 */
import { PARTS, type PartKind } from '../sim/defs';
import { JUNK, RELICS, duplicates, isRelic, isUnique, relicName, type RelicId } from '../sim/junk';
import { gain, type Economy } from './economy';
import type { HubState } from './state';
import { titleStat, type Titles } from './titles';
import type { RosterBot, Shop } from './workshop';

export type Source = { junk: number } | { part: PartKind } | { bot: string };

const bot = (s: Shop, uid: string): RosterBot => {
  const b = s.roster.bots.find((x) => x.uid === uid);
  if (!b) throw new Error(`no robot "${uid}"`);
  return b;
};
const setRelic = (s: Shop, uid: string, relic: string | undefined): Shop => ({
  ...s,
  roster: { ...s.roster, bots: s.roster.bots.map((b) => (b.uid === uid ? (({ relic: _, ...rest }) => (relic ? { ...rest, relic } : rest))(b) : b)) },
});

/** A relic put back where it lives: a unique in the stores' parts, common junk in the stock. */
export function stow(s: { eco: Economy; hub: HubState }, id: string | undefined): { eco: Economy; hub: HubState } {
  if (!id) return s;
  if (isUnique(id)) return { ...s, hub: { ...s.hub, parts: { ...s.hub.parts, [id]: (s.hub.parts[id as PartKind] ?? 0) + 1 } } };
  if (isRelic(id)) return { ...s, eco: { ...s.eco, junk: [...s.eco.junk, id] } };
  return s;
}

/** What the bench can fit now: each piece of junk in the stock (its index), then each unique in the stores. */
export function benchRelics(s: { eco: Pick<Economy, 'junk'>; hub: Pick<HubState, 'parts'> }): ({ id: RelicId; junk: number } | { id: RelicId; part: PartKind })[] {
  const uniques = (Object.keys(PARTS) as PartKind[]).filter((k) => isUnique(k) && (s.hub.parts[k] ?? 0) > 0).flatMap((k) => Array.from({ length: s.hub.parts[k]! }, () => ({ id: k as RelicId, part: k })));
  return [...s.eco.junk.map((id, i) => ({ id, junk: i })), ...uniques];
}

/**
 * Fit a relic to a robot (a wreck keeps its socket too). Whatever it wore goes back to the stock, or, when it came from
 * another robot's socket, to that robot.
 */
export function fit(s: Shop, uid: string, from: Source): Shop {
  const to = bot(s, uid);
  let id: string;
  let next: Shop;
  if ('bot' in from) {
    const o = bot(s, from.bot);
    if (!o.relic) throw new Error(`${o.name} wears no relic`);
    if (o.uid === uid) return s;
    id = o.relic;
    next = setRelic(s, o.uid, to.relic); // the two swap (the other ends up bare if this one was)
  } else if ('junk' in from) {
    id = s.eco.junk[from.junk];
    if (!id) throw new Error('no such junk in the stock');
    next = { ...s, eco: { ...s.eco, junk: s.eco.junk.filter((_, i) => i !== from.junk) } };
    next = { ...next, ...stow(next, to.relic) };
  } else {
    if (!isUnique(from.part) || (s.hub.parts[from.part] ?? 0) < 1) throw new Error(`no ${PARTS[from.part]?.name ?? from.part} in the stores`);
    id = from.part;
    next = { ...s, hub: { ...s.hub, parts: { ...s.hub.parts, [from.part]: s.hub.parts[from.part]! - 1 } } };
    next = { ...next, ...stow(next, to.relic) };
  }
  return setRelic(next, uid, id);
}

/** Take a robot's relic off, back to the stock (a unique back to the stores). */
export function unfit(s: Shop, uid: string): Shop {
  const b = bot(s, uid);
  if (!b.relic) throw new Error(`${b.name} wears no relic`);
  const bare = setRelic(s, uid, undefined);
  return { ...bare, ...stow(bare, b.relic) };
}

/** What the Trader pays for a piece of junk: `JUNK.sell`, 10% more with The Haggler (the Trader's ladder title). */
export const junkPrice = (titles?: Titles) => Math.round(titles ? titleStat(titles, 'hub', 'junkSell', JUNK.sell) : JUNK.sell);

/** What the Trader pays for a piece of junk in the stock. */
export function sellJunk(s: Shop, index: number, titles?: Titles): Shop & { scrap: number; id: RelicId } {
  const id = s.eco.junk[index];
  if (!id) throw new Error('no such junk in the stock');
  const pay = junkPrice(titles);
  const eco = gain({ ...s.eco, junk: s.eco.junk.filter((_, i) => i !== index) }, 'scrap', pay);
  return { ...s, eco, scrap: pay, id };
}

/** The pieces of junk in the stock that a robot already wears one of (the Oracle takes these for insight). */
export const offerable = (s: { eco: Pick<Economy, 'junk'>; roster: { bots: readonly { relic?: string }[] } }) => duplicates(s.eco.junk, s.roster.bots.map((b) => b.relic));

/** A duplicate of a worn relic, offered to the Oracle: gone, for `JUNK.offer` insight. */
export function offerJunk(s: Shop, index: number): Shop & { insight: number; id: RelicId } {
  const id = s.eco.junk[index];
  if (!id) throw new Error('no such junk in the stock');
  if (!offerable(s).includes(index)) throw new Error(`the Oracle wants a second ${RELICS[id].item.toLowerCase()} only while a robot already wears one`);
  const eco = gain({ ...s.eco, junk: s.eco.junk.filter((_, i) => i !== index) }, 'insight', JUNK.offer);
  return { ...s, eco, insight: JUNK.offer, id };
}

/** "Bread cannon (toaster)" for banners. */
export const relicLabel = (id: string) => (isRelic(id) ? `${RELICS[id].reading} (${RELICS[id].item.toLowerCase()})` : relicName(id));
