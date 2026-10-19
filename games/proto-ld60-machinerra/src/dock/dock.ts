/**
 * The Dry dock's rules, plain TS (tests beside: `dock.test.ts`); `dockview.ts` only draws. The dock is one place for the Communicator
 * and each robot type: what they wear, their cards, and (aboard) the robots themselves. It changes no rule: wearing is
 * `sim/gear.ts` `equip`, crafting the inventory's `make`, buying the Trader's `buy`, the robots `hub/workshop.ts`.
 *
 * Here: what goes in a slot's three drawer groups (`slotEntries`: in the stores, can be made, the Trader's shelf), each against what
 * the slot wears (`deltas`), which one gets the drawer's one main button (`bestOf`), the roster's rows (`rosterRows`), the bulk
 * buttons' counts and costs (`bulk`), where each station opens the dock (`openAt`), and the Recipes tab's list (`recipeList`).
 *
 * A selection is a string key, so the view, the dev commands and `debugState` share it:
 * `gear:comm.primary`, `gear:guard.head`, `lug:primary.0`, `card:comm:1`, `card:type:guard`, `relic:r3`, `bot:r3`.
 */
import { PARTS, WEAPONS, type PartKind } from '../sim/defs';
import { MODS } from '../sim/defs/mods';
import {
  BOT_SLOTS, CREW_ROLES, ITEMS, QUALITIES, commSlots, craftable, fitsBotSlot, fitsCommSlot, itemIds, lugCount, matches, modFitsWeapon, modsOn, owned, scaled, scrapCost,
  shortfall, wornAt, type BotSlot, type CommSlot, type CrewRole, type Gear, type GearStat, type ItemId, type Owned, type Quality, type Wallet,
} from '../sim/gear';
import { cardOf, fittedAt, slotsFor, FOURTH_SLOT, type Research, type SlotKey } from '../hub/research';
import { REBUILD, STOKE_COST, foundried, type Roster, type RosterBot } from '../hub/workshop';
import { REPAIR } from '../hub/economy';
import type { HubState } from '../hub/state';
import { itemWords, weaponNumbers } from '../manage/gearwords';

export type Who = 'comm' | CrewRole;
/** Where the dock was opened from (the header says it). */
export type From = 'forge' | 'clinic' | 'workshop' | 'key' | 'dev';
export const FROM_NAMES: Record<From, string> = { forge: "at Hob's forge", clinic: "at Gasket's clinic", workshop: "at Sprocket's workshop", key: '', dev: '' };

// ---- selection keys ----

export type Sel =
  | { kind: 'gear'; who: 'comm'; slot: CommSlot }
  | { kind: 'gear'; who: CrewRole; slot: BotSlot }
  | { kind: 'lug'; weapon: 'primary' | 'secondary'; i: number }
  | { kind: 'card'; key: SlotKey }
  | { kind: 'relic'; uid: string }
  | { kind: 'bot'; uid: string };

export const gearKey = (who: Who, slot: CommSlot | BotSlot) => `gear:${who}.${slot}`;
export function parseSel(key: string | null | undefined): Sel | null {
  if (!key) return null;
  const i = key.indexOf(':');
  const kind = key.slice(0, i), v = key.slice(i + 1);
  if (kind === 'gear') {
    const [who, slot] = v.split('.');
    if (who === 'comm') return COMM_SLOTS_ALL.includes(slot as CommSlot) ? { kind, who, slot: slot as CommSlot } : null;
    return CREW_ROLES.includes(who as CrewRole) && BOT_SLOTS.includes(slot as BotSlot) ? { kind, who: who as CrewRole, slot: slot as BotSlot } : null;
  }
  if (kind === 'lug') {
    const [w, n] = v.split('.');
    return w === 'primary' || w === 'secondary' ? { kind, weapon: w, i: Number(n) || 0 } : null;
  }
  if (kind === 'card') return { kind, key: v };
  if (kind === 'relic' || kind === 'bot') return { kind, uid: v };
  return null;
}
const COMM_SLOTS_ALL: CommSlot[] = ['primary', 'secondary', 'head', 'arm', 'core', 'legs', 'rear', 'pack', 'heart'];
/** Which roster entry a selection belongs to (a card slot `type:<role>` to that type, `comm:<n>` to the Communicator). */
export function selOwner(s: Sel, roster: Roster): Who | null {
  if (s.kind === 'gear') return s.who;
  if (s.kind === 'lug') return 'comm';
  if (s.kind === 'card') return s.key.startsWith('type:') ? (s.key.slice(5) as CrewRole) : 'comm';
  return roster.bots.find((b) => b.uid === s.uid)?.role ?? null;
}

// ---- the roster ----

export interface RosterRow { who: Who; n: number; wreck: number; down: number; cold: number; empty: BotSlot[] }
/** The Communicator, then each robot type owned (in the game's type order), with its count and its state. */
export function rosterRows(r: Roster, g: Gear): RosterRow[] {
  const rows: RosterRow[] = [{ who: 'comm', n: 1, wreck: 0, down: 0, cold: 0, empty: [] }];
  for (const role of CREW_ROLES) {
    const bots = r.bots.filter((b) => b.role === role);
    if (!bots.length) continue;
    rows.push({
      who: role,
      n: bots.length,
      wreck: bots.filter((b) => b.wreck).length,
      down: bots.filter((b) => b.downed && !b.wreck).length,
      cold: bots.filter((b) => !b.wreck && !b.downed && !b.stoked).length,
      empty: BOT_SLOTS.filter((s) => g.bots[role][s] === undefined),
    });
  }
  return rows;
}
export const botsOf = (r: Roster, role: CrewRole): RosterBot[] => r.bots.filter((b) => b.role === role);

/** The bulk buttons: how many robots each would touch and what it costs (the workshop's own prices; Great Foundry included). */
export function bulk(r: Roster, h: HubState) {
  const cold = r.bots.filter((b) => !b.wreck && !b.downed && !b.stoked).length;
  const down = r.bots.filter((b) => b.downed && !b.wreck).length;
  const wreck = r.bots.filter((b) => b.wreck).length;
  const repair = foundried(h, { scrap: REPAIR.carried.scrap }).scrap ?? 0;
  const rebuild = foundried(h, REBUILD).scrap ?? 0;
  return { stoke: { n: cold, coal: cold * STOKE_COST.coal }, repair: { n: down, scrap: down * repair, each: repair }, rebuild: { n: wreck, scrap: wreck * rebuild, each: rebuild } };
}

// ---- where a station opens it ----

/** The first empty gear slot of a roster entry, or null. */
export function firstEmpty(g: Gear, who: Who): string | null {
  if (who === 'comm') {
    const s = commSlots(g).find((x) => g.comm[x] === undefined);
    return s ? gearKey('comm', s) : null;
  }
  const s = BOT_SLOTS.find((x) => g.bots[who][x] === undefined);
  return s ? gearKey(who, s) : null;
}

/**
 * Where each way in opens the dock (the brief's stations, "one press"): Hob's forge on the primary weapon; Gasket's clinic on the first
 * type with a robot to mend (a downed one or a wreck), else the first type; the workshop on the first type and its first empty slot;
 * I on the Communicator with nothing picked. With no robots the clinic and workshop open on the Communicator.
 */
export function openAt(from: From, r: Roster, g: Gear): { sel: Who; slot: string | null } {
  const rows = rosterRows(r, g).filter((x) => x.who !== 'comm');
  if (from === 'forge') return { sel: 'comm', slot: gearKey('comm', 'primary') };
  if (from === 'clinic') {
    const hurt = rows.find((x) => x.down || x.wreck) ?? rows[0];
    return hurt ? { sel: hurt.who, slot: null } : { sel: 'comm', slot: null };
  }
  if (from === 'workshop') {
    const first = rows[0];
    return first ? { sel: first.who, slot: firstEmpty(g, first.who) } : { sel: 'comm', slot: null };
  }
  return { sel: 'comm', slot: null };
}

// ---- the drawer for a gear slot ----

export interface Cost { scrap: number; parts: [PartKind, number, number][] }
export type Src = 'owned' | 'swap' | 'move' | 'craft' | 'buy';
export interface Entry {
  src: Src;
  id: ItemId;
  q: Quality;
  tuned?: boolean;
  /** The owned item (owned, swap, move). */
  uid?: number;
  /** Where it is worn now (swap: the other weapon slot; move: another type's socket). */
  from?: string;
  /** The shelf's ware index and price (buy). */
  shelf?: number;
  price?: number;
  /** The recipe's cost with what the stores hold of each part (craft). */
  cost?: Cost;
  /** Cannot be taken now: short of scrap or parts (the button is greyed). */
  short: boolean;
  /** One per chip of `itemWords(id, q).chips`, then one per stat only the worn piece has: the arrow against the worn piece. */
  deltas: number[];
}

/** A piece on the Trader's shelf this lift that the dock may sell: its index, item and quality, price after any discount, how many left. */
export interface Ware { i: number; item: ItemId; q: Quality; price: number; left: number }

export interface Ctx {
  gear: Gear;
  /** Scrap and parts in the stores. */
  wallet: Wallet;
  /** Aboard the Wanderer: crafting, buying, cards, mods and relics work only there. */
  aboard: boolean;
  /** A recipe the workbench knows (`hub/taught.ts`); absent: all. */
  taught?: (id: ItemId) => boolean;
  /** This lift's shelf (empty: no stall, or in a mission). */
  shelf?: Ware[];
}

/** Does item `id` go in this gear slot. */
export const fitsSel = (id: ItemId, s: Extract<Sel, { kind: 'gear' }>) =>
  s.who === 'comm' ? fitsCommSlot(ITEMS[id], s.slot as CommSlot) : fitsBotSlot(ITEMS[id], s.slot as BotSlot, s.who as CrewRole);
export const wornIn = (g: Gear, s: Extract<Sel, { kind: 'gear' }>): Owned | undefined =>
  owned(g, s.who === 'comm' ? g.comm[s.slot as CommSlot] : g.bots[s.who as CrewRole][s.slot as BotSlot]);

const val = (id: ItemId, q: Quality, tuned: boolean | undefined, k: GearStat) => scaled(ITEMS[id].stats, q, tuned)[k] ?? 0;
/** A weapon's damage a second against another's: hit (times its rivets) over its rate. */
const perHit = (id: ItemId, q: Quality) => {
  const n = weaponNumbers(id, q);
  return n.hit * Math.max(1, n.pellets);
};

/**
 * The arrow for each chip of a candidate against what the slot wears (positive: better). Weapons: damage a hit, hits a second, reach or
 * range (the type has none); stats: the candidate's value less the worn one's, then a chip for each stat only the worn piece has.
 * With nothing worn every bonus is up and every drawback down.
 */
export function deltas(c: { id: ItemId; q: Quality; tuned?: boolean }, worn?: { id: ItemId; q: Quality; tuned?: boolean }): number[] {
  const words = itemWords(c.id, c.q, c.tuned);
  const w = worn;
  return [
    ...words.chips.map((ch) => {
      const k = ch.key ?? '';
      if (ITEMS[c.id].weapon && ['type', 'hit', 'rate', 'dist'].includes(k)) {
        if (k === 'type') return 0;
        const a = weaponNumbers(c.id, c.q), b = w && ITEMS[w.id].weapon ? weaponNumbers(w.id, w.q) : null;
        if (k === 'hit') return perHit(c.id, c.q) - (b ? perHit(w!.id, w!.q) : 0);
        if (k === 'rate') return a.rate - (b?.rate ?? 0);
        return a.dist - (b?.dist ?? 0);
      }
      return val(c.id, c.q, c.tuned, k as GearStat) - (w ? val(w.id, w.q, w.tuned, k as GearStat) : 0);
    }),
    ...wornOnly(c, w).map(([, v]) => -v),
  ];
}
/** The stats only the worn piece has (shown after the candidate's chips, each with its down arrow). */
export function wornOnly(c: { id: ItemId }, worn?: { id: ItemId; q: Quality; tuned?: boolean }): [GearStat, number][] {
  if (!worn) return [];
  const mine = new Set(Object.keys(ITEMS[c.id].stats ?? {}));
  return (Object.entries(scaled(ITEMS[worn.id].stats, worn.q, worn.tuned)) as [GearStat, number][]).filter(([k]) => !mine.has(k));
}

/** A recipe's cost against the stores (with the gear's discount). */
export function costOf(id: ItemId, w: Wallet, g?: Gear): Cost {
  return { scrap: scrapCost(id, g), parts: (Object.entries(ITEMS[id].recipe.parts ?? {}) as [PartKind, number][]).map(([k, n]) => [k, n, w.parts[k] ?? 0]) };
}

/**
 * What can go in a gear slot, in three groups. In the stores: owned and worn nowhere, the other weapon slot's (they swap), and another
 * type's piece (it moves: one piece is worn by one type); best quality first. Can be made: the taught recipes for the slot (aboard;
 * a mod one-of-a-kind already owned is left out). The Trader's shelf: her wares for the slot with some left (aboard).
 */
export function slotEntries(ctx: Ctx, s: Extract<Sel, { kind: 'gear' }>) {
  const g = ctx.gear;
  const worn = wornIn(g, s);
  const ref = worn ? { id: worn.id, q: worn.q, tuned: worn.tuned } : undefined;
  const qOrder = (q: Quality) => -Object.keys(QUALITIES).indexOf(q);
  const ownedE: Entry[] = [];
  for (const o of g.items) {
    if (o.uid === worn?.uid || !fitsSel(o.id, s)) continue;
    const at = wornAt(g, o.uid);
    let src: Src = 'owned', from: string | undefined;
    if (at) {
      if (at.who === 'comm' && s.who === 'comm' && (at.slot === 'primary' || at.slot === 'secondary')) src = 'swap';
      else if (at.who !== 'comm' && at.who !== s.who) src = 'move';
      else continue; // worn by him elsewhere, or by this type in another socket: not offered
      from = gearKey(at.who, at.slot);
    }
    ownedE.push({ src, id: o.id, q: o.q, tuned: o.tuned, uid: o.uid, from, short: false, deltas: deltas(o, ref) });
  }
  ownedE.sort((a, b) => (a.src === 'owned' ? 0 : 1) - (b.src === 'owned' ? 0 : 1) || qOrder(a.q) - qOrder(b.q) || ITEMS[a.id].name.localeCompare(ITEMS[b.id].name));
  const craftE: Entry[] = !ctx.aboard
    ? []
    : itemIds
        .filter((id) => fitsSel(id, s) && craftable(id) && !ITEMS[id].gift && (!ctx.taught || ctx.taught(id)) && !(ITEMS[id].mod && g.items.some((o) => o.id === id)))
        .map((id) => ({ src: 'craft' as const, id, q: 'standard' as Quality, cost: costOf(id, ctx.wallet, g), short: shortfall(id, ctx.wallet, g).length > 0, deltas: deltas({ id, q: 'standard' }, ref) }));
  const buyE: Entry[] = !ctx.aboard
    ? []
    : (ctx.shelf ?? [])
        .filter((w) => w.left > 0 && fitsSel(w.item, s))
        .map((w) => ({ src: 'buy' as const, id: w.item, q: w.q, shelf: w.i, price: w.price, short: ctx.wallet.scrap < w.price, deltas: deltas({ id: w.item, q: w.q }, ref) }));
  return { worn, owned: ownedE, craft: craftE, buy: buyE };
}

/** The net of an entry's arrows: ups less downs. */
export const netOf = (e: Entry) => e.deltas.reduce((n, d) => n + (d > 0.001 ? 1 : d < -0.001 ? -1 : 0), 0);

/**
 * The entry whose button is the drawer's one main button (attention: one strong signal a state): the takeable entry with the best net
 * of arrows against what is worn, ties to the first in drawer order (the stores, then made, then the shelf). A guess at "best"; null
 * when nothing can be taken.
 */
export function bestOf(groups: { owned: Entry[]; craft: Entry[]; buy: Entry[] }): Entry | null {
  let best: Entry | null = null;
  for (const e of [...groups.owned, ...groups.craft, ...groups.buy]) if (!e.short && (!best || netOf(e) > netOf(best))) best = e;
  return best;
}

// ---- lugs, cards, relics ----

/** The mods that fit a weapon's lug: owned, not on this lug already (one fitted elsewhere moves). */
export function lugEntries(g: Gear, s: Extract<Sel, { kind: 'lug' }>) {
  const w = owned(g, g.comm[s.weapon]);
  if (!w || s.i >= lugCount(g)) return { weapon: w, on: undefined, mods: [] as Owned[] };
  const on = modsOn(g, w.uid)[s.i];
  const mods = g.items.filter((o) => ITEMS[o.id].mod && modFitsWeapon(o, w) && o.uid !== on?.uid);
  return { weapon: w, on, mods };
}
/** The mod recipes for a weapon's kind that are not owned yet (a mod is one of a kind). */
export const lugRecipes = (g: Gear, w: Owned, taught?: (id: ItemId) => boolean) =>
  itemIds.filter((id) => ITEMS[id].mod && craftable(id) && (!taught || taught(id)) && !g.items.some((o) => o.id === id) && modFitsWeapon({ uid: -1, id, q: 'standard' }, w));

/** The loose cards (owned, fitted nowhere) that fit a card slot, and the one in it. */
export function cardsFor(r: Research, key: SlotKey) {
  const inSlot = r.fit[key] ? cardOf(r.fit[key]) : undefined;
  const loose = r.owned.map(cardOf).filter((c) => !!c && !fittedAt(r, c.id) && slotsFor(c).includes(key) && (key !== FOURTH_SLOT || !!r.fourth));
  return { inSlot, loose: loose as NonNullable<ReturnType<typeof cardOf>>[] };
}

// ---- the Recipes tab ----

const ORDER = (id: ItemId) => (ITEMS[id].weapon ? 0 : ITEMS[id].mod ? 1 : ITEMS[id].comm ? 2 : 3);
/** Every recipe the workbench knows, matching the search (a name or what it is made of), weapons first, then mods, body parts, robot pieces. */
export function recipeList(ctx: Ctx, text = '') {
  return itemIds
    .filter((id) => craftable(id) && !ITEMS[id].gift && (!ctx.taught || ctx.taught(id)) && matches(id, null, { text }) && !(ITEMS[id].mod && ctx.gear.items.some((o) => o.id === id)))
    .sort((a, b) => ORDER(a) - ORDER(b))
    .map((id) => ({ id, cost: costOf(id, ctx.wallet, ctx.gear), short: shortfall(id, ctx.wallet, ctx.gear).length > 0 }));
}

/** Where a crafted piece would go with one press from the Recipes tab: nowhere; it lands in the stores (the slot's drawer offers it). */
export const partName = (k: PartKind, n: number) => (n === 1 ? PARTS[k].name : PARTS[k].plural);
export const modText = (id: ItemId) => (ITEMS[id].mod ? MODS[ITEMS[id].mod!].text : '');
export const isWeapon = (id: ItemId) => !!ITEMS[id].weapon && !!WEAPONS[ITEMS[id].weapon!];
