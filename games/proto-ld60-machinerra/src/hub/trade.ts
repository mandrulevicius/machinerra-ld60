/**
 * The Trader's stall, plain TS (no Phaser): what is on the shelf, what it costs, and buying and selling. The shelf is
 * restocked every lift (seeded by the missions flown, so a run replays): robot parts by the handful and gear, never worse
 * than Fine. Helping her stocks it better (`TIERS`, by the steps of her quest line done): more kinds of part, more gear,
 * and from further afield: parts of the harder biomes' machines (`PART_GRADE`: the desert's, the Hollow City's track-
 * drones, the Demon Wastes' swarmers) and the dearer gear (`itemGrade`), Rare or better once the line is finished.
 * Each tier's shelf leads with something of its newest grade. Everything is paid in scrap. The Trader buys back spare parts at half price (never a
 * boss's unique). The Valued Customer title (the Trader's quest line) takes 10% off the shelf.
 *
 * What was bought from this lift's shelf is the `trade` slice (`Trade`): a new lift, a new shelf.
 */
import { ENEMY_PARTS, PARTS, type Enemy, type PartKind } from '../sim/defs';
import { ITEMS, QUALITIES, QUALITY_ORDER, addItem, itemIds, rollQuality, type Gear, type ItemId, type Quality } from '../sim/gear';

export type Ware = { kind: 'part'; part: PartKind; n: number; price: number } | { kind: 'item'; item: ItemId; q: Quality; n: 1; price: number };

/** What was bought off the shelf of the lift `at` (missions flown) at quest tier `tier`: `sold[i]` of ware `i`. */
export interface Trade { at: number; tier: number; sold: number[] }
export const freshTrade = (): Trade => ({ at: -1, tier: 0, sold: [] });

export const SHELF = { markup: 1.6, valued: 0.1 };
/** The shelf by the steps of her quest line done (`LINES.trader`): kinds of part, pieces of gear, the highest grade, the worst quality. */
export const TIERS: { parts: number; items: number; grade: number; floor: Quality }[] = [
  { parts: 2, items: 1, grade: 0, floor: 'fine' },
  { parts: 3, items: 2, grade: 1, floor: 'fine' },
  { parts: 3, items: 3, grade: 2, floor: 'fine' },
  { parts: 4, items: 3, grade: 2, floor: 'rare' },
];
/** How far afield a machine's parts come from: the desert's (0), the jungle's and the Hollow City's (1), the Demon Wastes' and the Frostspine's (2). */
export const PART_GRADE: Record<Enemy, number> = { hornet: 0, spider: 0, snake: 0, drone: 1, swarmer: 2, cat: 1, boar: 1, monkey: 1, commuter: 1, officer: 1, charger: 1, goat: 2, bleater: 2, kite: 2, gorilla: 1, knight: 1, bear: 2, wisp: 2, shade: 2, banshee: 2, evilOracle: 2, foreman: 0,
  piranha: 1, cupid: 1, croc: 1, mannequin: 1, cart: 1, copdrone: 1, mallcop: 1, leech: 2, veinworm: 2, bishop: 2, mite: 2, driller: 2, snowcat: 2 };
export const partGrade = (k: PartKind) => PART_GRADE[PARTS[k].from] ?? 0;
const tierOf = (t: number) => TIERS[Math.max(0, Math.min(TIERS.length - 1, Math.floor(t) || 0))];

const COMMON = new Set(Object.values(ENEMY_PARTS).map((e) => e.part));
/** A part's price at the stall: an enemy's own part is common, an elite's rarer. */
export const partPrice = (k: PartKind) => (COMMON.has(k) ? 10 : 20);
/** What the Trader pays for one. */
export const buyBack = (k: PartKind) => Math.floor(partPrice(k) / 2);
export const sellable = (k: PartKind) => !!PARTS[k] && !PARTS[k].unique;

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);
/** A piece of gear's worth in scrap: its recipe (scrap, and parts at the stall's price). */
const worth = (id: ItemId) => {
  const r = ITEMS[id].recipe;
  return r.scrap + Object.entries(r.parts ?? {}).reduce((a, [k, n]) => a + partPrice(k as PartKind) * (n ?? 0), 0);
};
/** A piece of gear's shelf price: its worth marked up, times its quality. */
export const itemPrice = (id: ItemId, q: Quality) => round5(worth(id) * SHELF.markup * QUALITIES[q].mult);
/** How good a piece of gear is to stock: the dearer it is and the further afield its parts, the higher. */
export function itemGrade(id: ItemId) {
  const w = worth(id);
  const parts = Object.keys(ITEMS[id].recipe.parts ?? {}).map((k) => partGrade(k as PartKind));
  return Math.max(w < 60 ? 0 : w < 100 ? 1 : 2, ...parts);
}

/** Gear the Trader can get hold of: not the shovel, nothing made from a boss's unique part. */
const STOCKED = itemIds.filter((id) => id !== 'shovel' && !Object.keys(ITEMS[id].recipe.parts ?? {}).some((k) => PARTS[k as PartKind]?.unique));
const PART_KINDS = (Object.keys(PARTS) as PartKind[]).filter(sellable);

const seeded = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
/** `n` of `from` at grade `top` or below, the first of them at `top` when there is one. */
function pick<T>(r: () => number, from: T[], grade: (x: T) => number, top: number, n: number): T[] {
  const pool = from.filter((x) => grade(x) <= top), out: T[] = [];
  const best = pool.filter((x) => grade(x) === top);
  if (best.length && n > 0) out.push(pool.splice(pool.indexOf(best[Math.floor(r() * best.length)]), 1)[0]);
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

/** This lift's shelf at quest tier `tier` (prices before any discount). */
export function shelf(missions: number, tier = 0): Ware[] {
  const T = tierOf(tier);
  const r = seeded(7919 * (missions + 1) + 13);
  const parts: Ware[] = pick(r, PART_KINDS, partGrade, T.grade, T.parts).map((part) => ({ kind: 'part', part, n: 2 + Math.floor(r() * 3), price: partPrice(part) }));
  const items: Ware[] = pick(r, STOCKED, itemGrade, T.grade, T.items).map((item) => {
    const rolled = rollQuality(r());
    const q = QUALITY_ORDER.indexOf(rolled) < QUALITY_ORDER.indexOf(T.floor) ? T.floor : rolled;
    return { kind: 'item', item, q, n: 1, price: itemPrice(item, q) };
  });
  return [...parts, ...items];
}

export const discounted = (price: number, valued: boolean) => (valued ? Math.ceil(price * (1 - SHELF.valued)) : price);
/** What was sold off this shelf (a trade from an older lift or tier counts as nothing: the shelf was restocked). */
export const soldNow = (t: Trade, missions: number, tier = 0) => (t.at === missions && (t.tier ?? 0) === tier ? t.sold : []);
export const left = (t: Trade, missions: number, i: number, tier = 0) => {
  const w = shelf(missions, tier)[i];
  return w ? w.n - (soldNow(t, missions, tier)[i] ?? 0) : 0;
};

/** What a trade touches: the economy's scrap, the hub's parts, the gear; `tier` is her quest line's steps done. */
export interface Stall { missions: number; tier: number; trade: Trade; scrap: number; parts: Partial<Record<PartKind, number>>; gear: Gear; valued: boolean }

/** Buy one of ware `i`. Throws with the reason (sold out, short of scrap). */
export function buy(s: Stall, i: number): Stall & { ware: Ware } {
  const ware = shelf(s.missions, s.tier)[i];
  if (!ware) throw new Error(`no ware ${i} on the shelf`);
  if (left(s.trade, s.missions, i, s.tier) < 1) throw new Error('sold out');
  const price = discounted(ware.price, s.valued);
  if (s.scrap < price) throw new Error(`costs ${price} scrap; you have ${s.scrap}`);
  const sold = [...soldNow(s.trade, s.missions, s.tier)];
  sold[i] = (sold[i] ?? 0) + 1;
  const base = { ...s, trade: { at: s.missions, tier: s.tier, sold: Array.from(sold, (n) => n ?? 0) }, scrap: s.scrap - price, ware };
  if (ware.kind === 'part') return { ...base, parts: { ...s.parts, [ware.part]: (s.parts[ware.part] ?? 0) + 1 } };
  return { ...base, gear: addItem(s.gear, ware.item, ware.q).gear };
}

/** Sell `n` of a part kind from the stores. Throws when there are not that many, or it is a boss's own. */
export function sell(s: Stall, k: PartKind, n = 1): Stall & { scrap: number } {
  if (!sellable(k)) throw new Error(PARTS[k] ? `the Trader will not touch ${PARTS[k].name}` : `no part "${k}"`);
  if (!Number.isInteger(n) || n < 1) throw new Error(`cannot sell ${n}`);
  const have = s.parts[k] ?? 0;
  if (have < n) throw new Error(`you have ${have} ${PARTS[k].plural}`);
  return { ...s, scrap: s.scrap + buyBack(k) * n, parts: { ...s.parts, [k]: have - n } };
}
