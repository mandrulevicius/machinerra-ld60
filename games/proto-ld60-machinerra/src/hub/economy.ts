/**
 * The economy's rules, plain TS (no Phaser): the run state that outlives a mission (scrap, AI cores, copper), what
 * each source pays, and every sink that spends it. Parts stay in `HubState`; a rule that touches both takes and returns
 * `Books`. Nothing here writes: a caller keeps what comes back with `commit` (or `economy.set` and `hub.set`).
 *
 * What each thing is for (decisions.md, "Minos on oil rarity and resources"): **scrap** is the main currency and the
 * constant need (robots, repairs, crafting, trade); **copper** the building material, and what one-time, permanent upgrades
 * cost (stations, your house, the Wanderer's improvements, the city's blueprints, robot ranks, the chassis); **coal** fuels
 * expeditions (`expeditions.ts`; gatherers mine it from seams); **oil** is health and lives and nothing else, and none of it comes home; the
 * land's one **crude** tap is a healing shrine in the field (`Sim.tapStep`) and is not a stock at all. The lift and the
 * landings cost nothing.
 *
 * A rule that cannot be paid throws with the reason (as `buildStation` does) and leaves the books as they were. Amounts are
 * whole and never negative.
 *
 * Spare oil is not a stock: every lift goes down with `spareCap` cans (`depart`), the unspent ones are not banked, and the
 * hub refills the pack for the next lift. Air support works the other way: the charges a mission left come back in
 * `Haul.charges` (at most `CHARGES_KEPT` a call) and the next mission starts with them on top of its own.
 *
 * `Play.create` calls `depart` and `land()` (carry.ts) calls `bank`; the Sim counts scrap, cores and copper and
 * `haulFrom` (state.ts) hands them over. The workshop (`workshop.ts`) asks `partyRoom` whether a core is free for a new body.
 */
import { cleanJunk, type RelicId } from '../sim/junk';
import { COPPER, SCRAP, START_CORES, SUPPORT, type PartKind, type SupportId } from '../sim/defs';
import { persist, hub } from './save';
import { BUILDINGS, PRICE_STOCK, draw, priceOf, type BuildingId } from './buildings';
import { build, npc, stationCost, type Haul, type HubState } from './state';
import type { Titles } from './titles';
import { freshTrade, type Trade } from './trade';

export interface Economy {
  /** The main currency and the constant need: robots, parts, repairs, crafting, trade. */
  scrap: number;
  /** AI cores held: one per robot owned, so a new body needs a free one. A bot lost on the sands brings its core home, so cores are never spent. */
  cores: number;
  /** Copper in the hold: for building and one-time upgrades (`buildStation`, ranks, the chassis). */
  copper: number;
  /** Coal in the hold: fuel for expeditions only (`expeditions.ts`: fed at the Expedition office). */
  coal: number;
  /** Misread junk at home, not fitted (`sim/junk.ts` relic ids): fitted at the workshop bench, sold to the Trader, or a duplicate offered to the Oracle (`relics.ts`). */
  junk: RelicId[];
  /** Air support charges the last mission left (taken at departure): the next one starts with them. */
  charges: Partial<Record<SupportId, number>>;
  /** The last haul banked: banking it again changes nothing. */
  haul: string | null;
}

/**
 * A new game has `COPPER.start` copper (the first station is reachable before any ruin is stripped) and no cores
 * (`START_CORES`; level 1's wreck brings the first, P9).
 */
export const freshEconomy = (): Economy => ({ scrap: 0, cores: START_CORES, copper: COPPER.start, coal: 0, junk: [], charges: {}, haul: null });

const isWhole = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
// Version 7: insight is no stock: a stage's first insight earns its one card pick (`research.ts` `bankPick`); an old stock is dropped.
// Version 4: cores cap the party (P17). A save from before has the crew it built and no cores to show for it, so it keeps at least the starting crew's.
// Version 6: coal is back as the expeditions' fuel (a field resource the Gatherer mines): old saves have none.
// Version 5: the oil rework. Wood, coal and the can stock are gone (cans refill at the lift); copper is new and starts as a new game's.
const economySample: Economy = {
  scrap: 57,
  cores: 2,
  copper: 38,
  coal: 9,
  junk: ['toaster', 'fan', 'satnav'],
  charges: { barrage: 1, lance: 1 },
  haul: '4242:1760000000000',
};
export const economy = persist<Economy>('economy', freshEconomy, {
  version: 7,
  sample: economySample,
  migrate: (old, from) => {
    if (!old || typeof old !== 'object') return old;
    // Before v5 a save held wood, crude-era coal and a can stock: all gone. From v6 coal is a stock again, so only v5 and older drop it (and start at none).
    const { wood: _w, coal: oldCoal, spare: _s, insight: _i, ...e } = old as Economy & { wood?: number; spare?: number; insight?: number };
    return { ...e, coal: from >= 6 && Number.isFinite(oldCoal) ? oldCoal : 0, ...(from < 4 && { cores: Math.max(Number(e.cores) || 0, 6) }) /* a save from before cores kept the old six robots */, ...(from < 5 && { copper: Number.isFinite(e.copper) ? e.copper : COPPER.start }) };
  },
  valid: (e) => [e.scrap, e.cores, e.copper, e.coal].every(isWhole) && !!e.charges && Object.values(e.charges).every(isWhole) && Array.isArray(e.junk),
});

/** What was bought off the Trader's shelf this lift (`trade.ts`). */
export const tradeSave = persist<Trade>('trade', freshTrade, { sample: { at: 5, tier: 1, sold: [0, 2] } });

/** Both slices a cross-slice rule touches. */
export interface Books { eco: Economy; hub: HubState }
export const load = (): Books => ({ eco: economy.get(), hub: hub.get() });
export const commit = (b: Books): Books => ({ eco: economy.set(b.eco), hub: hub.set(b.hub) });

const clean = (n: number | undefined) => (Number.isFinite(n) ? Math.max(0, Math.floor(n!)) : 0);

// ---- Sources -------------------------------------------------------------------------------------------------------

export { SCRAP };

export type KillTier = keyof typeof SCRAP.kill;
export const scrapForKill = (tier: KillTier) => SCRAP.kill[tier];

type Stock = 'scrap' | 'cores' | 'copper' | 'coal';

/** Add to a stock (kills, quests, the Trader, the Reliquary, dev). A junk amount counts as 0. */
export const gain = (e: Economy, what: Stock, n: number): Economy => ({ ...e, [what]: e[what] + clean(n) });

/** Spend from a stock; throws when it is not enough or the amount is not a whole number >= 0. */
export function pay(e: Economy, what: Stock, n: number): Economy {
  if (!isWhole(n)) throw new Error(`cannot spend ${n} ${what}`);
  if (e[what] < n) throw new Error(`needs ${n} ${what}; you have ${e[what]}`);
  return { ...e, [what]: e[what] - n };
}

/** Air support charges that come home with a mission: at most this many of a call (its own `charges` a mission). */
export const CHARGES_KEPT = (id: SupportId) => SUPPORT[id].charges;
const keptCharges = (c: Haul['charges']): Economy['charges'] =>
  Object.fromEntries((Object.keys(c ?? {}) as SupportId[]).filter((id) => id in SUPPORT).map((id) => [id, Math.min(CHARGES_KEPT(id), clean(c![id]))]).filter(([, n]) => n));

/**
 * The lift docks: the haul's scrap, cores, copper and coal join the stock (`thanks` is the colony's scrap for the NPCs
 * this lift freed, `RESCUE_THANKS` each), and the charges it left replace the ones kept (the mission started with those).
 * The same haul id twice changes nothing.
 */
export function bank(e: Economy, h: Haul, thanks = 0): Economy {
  if (e.haul === h.id) return e;
  // The colony's expedition (`expeditions.ts`) comes home in the same haul: its scrap and its junk join the mission's.
  const ex = h.expedition;
  return { scrap: e.scrap + clean(h.scrap) + clean(thanks) + clean(ex?.scrap), cores: e.cores + clean(h.cores), copper: e.copper + clean(h.copper), coal: e.coal + clean(h.coal), junk: [...cleanJunk(e.junk), ...cleanJunk(h.junk), ...cleanJunk(ex?.junk ? [ex.junk] : [])], charges: h.charges ? keptCharges(h.charges) : e.charges, haul: h.id };
}

// ---- Cores ---------------------------------------------------------------------------------------------------------

/** Free AI cores: the cores held less the robots owned (a wreck keeps its core). */
export const partyRoom = (e: Economy, owned: number) => Math.max(0, e.cores - clean(owned));

// ---- Oil cans ------------------------------------------------------------------------------------------------------

/** Most cans a mission starts with; `extra` is the Can Rack augment and the Oracle's capstone (+1 each). */
export const SPARE_MAX = 3;
export const spareCap = (extra = 0) => SPARE_MAX + clean(extra);
/** What raises the cap, as perks (state.ts): the Can Rack body part (P23) and the Oracle's capstone (`oracle.2`, P38), a can each. */
export const CAP_PERKS: Record<string, number> = { canRack: 1, oracleCans: 1 };
/** The cans over `SPARE_MAX` a hub with these perks carries: `depart`'s `capExtra`, and the Sim's `capExtra`. */
export const capExtraOf = (perks: readonly string[], built: readonly string[] = []) => perks.reduce((n, p) => n + (CAP_PERKS[p] ?? 0), 0) + built.reduce((n, b) => n + (CAP_BUILDINGS[b] ?? 0), 0);
/** A building that raises the cap: the Greenhouse's free can (P42). */
export const CAP_BUILDINGS: Record<string, number> = { greenhouse: 1 };

/**
 * The lift goes down: `cans` is what the pack holds, always `spareCap(capExtra)` (cans refill at home and nothing is
 * spent to fill them, so lives are scarce in the field, not at the lift). The charges kept leave the stock for the mission.
 */
export function depart(e: Economy, o: { capExtra?: number } = {}): { eco: Economy; cans: number; charges: Economy['charges'] } {
  return { eco: { ...e, charges: {} }, cans: spareCap(o.capExtra), charges: e.charges };
}

// ---- Repairs, building ---------------------------------------------------------------------------------------------

/**
 * A bot carried home mends for scrap; one left behind is rebuilt for more of it and a part. Scrap only: oil is health and
 * lives, so no repair costs a can (Minos). The workshop's wreck rebuild is the second (`workshop.ts` `REBUILD`, the same figure).
 */
export const REPAIR = { carried: { scrap: 15, part: false }, rebuilt: { scrap: 30, part: true } };
export type RepairKind = keyof typeof REPAIR;
/** The Great Foundry takes this share off the scrap. */
export const FOUNDRY_DISCOUNT = 0.3;

export const repairCost = (kind: RepairKind, foundry = false) => ({ ...REPAIR[kind], scrap: Math.ceil(REPAIR[kind].scrap * (foundry ? 1 - FOUNDRY_DISCOUNT : 1)) });

/** `part` is the kind the bot last fitted: a rebuild takes one from the stores. */
export function repair(b: Books, kind: RepairKind, o: { part?: PartKind; foundry?: boolean } = {}): Books {
  const c = repairCost(kind, o.foundry);
  const eco = pay(b.eco, 'scrap', c.scrap);
  if (!c.part) return { eco, hub: b.hub };
  if (!o.part) throw new Error('a rebuild needs the part it last fitted');
  const have = b.hub.parts[o.part] ?? 0;
  if (!have) throw new Error(`needs a ${o.part} in the stores`);
  return { eco, hub: { ...b.hub, parts: { ...b.hub.parts, [o.part]: have - 1 } } };
}

/** A dialog reward's scrap: what it `take`s is handed over first (at most what is held), what it gives joins the stock. */
export function settleScrap(e: Economy, r: { scrap?: number; take?: { scrap?: number; copper?: number } }): Economy {
  const took = Math.min(e.scrap, clean(r.take?.scrap));
  const copper = Math.min(e.copper, clean(r.take?.copper)); // P42: the Expeditioner's and the Planner's timber is copper
  return { ...e, scrap: e.scrap - took + clean(r.scrap), copper: e.copper - copper };
}

/**
 * Draw up a blueprint the City Planner offers (`buildings.ts`): its price (`PRICE_STOCK`, less the Planner's title when `titles`
 * is given) leaves the stock and the building goes up as scaffolding on a free city slot. Throws with the reason and changes
 * nothing when it cannot (not offered, no slot, one a visit already, not enough).
 */
export function buildBlueprint(b: Books, id: string, titles?: Titles, all = false): Books {
  const hubNext = draw(b.hub, id, all);
  const cost = priceOf(id as BuildingId, titles);
  const short = b.eco[PRICE_STOCK] < cost ? `${BUILDINGS[id as BuildingId].name} costs ${cost} ${PRICE_STOCK}; you have ${b.eco[PRICE_STOCK]}` : null;
  if (short) throw new Error(short);
  return { eco: cost ? pay(b.eco, PRICE_STOCK, cost) : b.eco, hub: hubNext };
}

/** Why the books cannot pay `cost` copper to build, or null. */
export const copperBlock = (e: Pick<Economy, 'copper'>, cost: number) => (e.copper < cost ? `costs ${cost} copper; you have ${e.copper}` : null);

/**
 * Build an NPC's station (or your house, or a Wanderer improvement) on a free lot: its price in copper (`stationCost`, each
 * one dearer) leaves the stock. `free` skips the price (dev). Throws with the reason and changes nothing when it cannot.
 */
export function buildStation(b: Books, id: string, lot: string, all = false, free = false, titles?: Titles): Books {
  const cost = free ? 0 : stationCost(b.hub, titles);
  const hubNext = build(b.hub, id, lot, all);
  if (copperBlock(b.eco, cost)) throw new Error(`${npc(id)?.station?.name ?? 'It'} ${copperBlock(b.eco, cost)}`);
  return { eco: cost ? pay(b.eco, 'copper', cost) : b.eco, hub: hubNext };
}
