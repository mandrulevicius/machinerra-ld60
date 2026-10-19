/**
 * The workshop's rules, plain TS (no Phaser; tests beside): the robots you own (the `roster` slice; every one that is not a
 * wreck rides the lift down), building new bodies (each needs a free AI core), ranking them up, rebuilding the ones
 * left on the sands, salvaging, and the Communicator's chassis. Each rule takes and returns a `Shop` (the economy,
 * the hub and the roster) and throws with the reason when it cannot be paid, as `economy.ts` does; `Hub` commits it.
 *
 * The Sim fields `crewOf(roster)` (`Play`: `opts.crew`) and the chassis (`opts.chassis`); a robot's rank and the chassis
 * are gear stats (`sim/bots.ts`). When the lift docks, `landRoster` (from `carry.ts`'s `land`) wrecks every robot that
 * went down and did not ride back up: a wreck stays yours and is rebuilt here, rank kept. One that came up carried, downed
 * (P5), is `downed` beside `wreck` and repaired here for less (`repairDowned`).
 *
 * **Promotion** (P14): a robot of a type with specs (`sim/specs.ts`: not the Mule) takes one spec for good, once its deed
 * has unlocked it in the `deeds` profile (`deeds.ts`). Spec and relic ride on the `RosterBot`, so a wreck keeps them
 * through its rebuild.
 *
 * **Stoking:** `stoke` feeds a robot coal (`STOKE_COST`) for the next mission only; `landRoster` clears it as the lift docks (`sim/stoke.ts` has the effect).
 *
 * **Add a robot type:** its role in `defs.ts` (the skill's recipe), a `BODY` row (cost, and `unlock` when it is not
 * buildable from the start), a `NAMES` pool, and a `RANK_WORK` row in `sim/bots.ts`.
 */
import { PARTS, ROLES, START_CREW, type PartKind } from '../sim/defs';
import { CHASSIS, RANK_MAX, type ChassisId } from '../sim/bots';
import { CREW_ROLES, type CrewRole } from '../sim/gear';
import { SPECS, TYPES, isBotType, type SpecId } from '../sim/specs';
import type { CrewBot } from '../sim/sim';
import { FOUNDRY_DISCOUNT, REPAIR, pay, gain, partyRoom, type Economy } from './economy';
import { hasBuilding } from './buildings';
import { isUnlocked, profile, type Profile } from './deeds';
import { stow } from './relics';
import { persist } from './save';
import type { Haul, HubState } from './state';

export interface RosterBot {
  uid: string;
  name: string;
  role: CrewRole;
  /** 0..RANK_MAX (`sim/bots.ts`). */
  rank: number;
  /** Left on the sands: rebuilt before it rides again (`REBUILD`). */
  wreck: boolean;
  /** Carried home downed (P5): repaired before it rides again (`repairDowned`: `REPAIR.carried`). Never both this and `wreck`. */
  downed?: boolean;
  /** The specialisation it was promoted to, for good (`promote`; `sim/specs.ts`). Kept through a wreck. */
  spec?: SpecId;
  /** The relic fitted (P19), one socket. Kept through a wreck. */
  relic?: string;
  /** Fed coal for the next mission only (`stoke`; `sim/stoke.ts`): cleared when the lift docks (`landRoster`). */
  stoked?: boolean;
}
export interface Roster {
  bots: RosterBot[];
  next: number;
  /** The types found as wrecks (`BODY[role].found`): buildable from then on. Saved with the roster. */
  types: CrewRole[];
  /** The Communicator's chassis levels. */
  chassis: Partial<Record<ChassisId, number>>;
}

/**
 * What a body costs: scrap and any parts (the stores' most plentiful common ones). `found` when the type is not there from the start:
 * it is found as a wreck in a land (D2; `TYPE_WRECK` in `sim/defs/sites.ts`) and repaired in the field, and then buildable (`knownTypes`).
 * Robots are scrap and parts, never coal, copper or crude.
 */
export interface BodyDef { scrap: number; parts: number; found?: string }
export const BODY: Record<CrewRole, BodyDef> = {
  gatherer: { scrap: 45, parts: 0 },
  guard: { scrap: 40, parts: 1 },
  repairer: { scrap: 40, parts: 1 },
  mule: { scrap: 35, parts: 0 },
  marksman: { scrap: 60, parts: 2, found: 'Frozen snipers lie on the Frostspine: mend one in the field and the bench can build more.' },
  boilermancer: { scrap: 55, parts: 2, found: 'A steam mage lies cold in the Demon Wastes: mend it in the field and the bench can build more.' },
  lamplighter: { scrap: 50, parts: 1, found: 'A lamp-bearer lies dark in the Rustwood Jungle: mend it in the field and the bench can build more.' },
  stalker: { scrap: 55, parts: 2, found: 'A cloaked blade lies still in the Hollow City: mend it in the field and the bench can build more.' },
};
/**
 * Cost to reach rank i (index 1..RANK_MAX). Copper, not scrap: a rank is a one-time, permanent upgrade (Minos: "bot upgrades
 * - copper also, yes? a one time thing"); scrap stays for what recurs. The later ranks also keep their parts. First guesses.
 */
export const RANK_COST: { copper: number; parts: number }[] = [{ copper: 0, parts: 0 }, { copper: 12, parts: 0 }, { copper: 25, parts: 1 }, { copper: 45, parts: 2 }];
/** A promotion to a spec: copper and one part (the commonest in the stores). Copper, not scrap: it is a one-time upgrade like a rank (Minos, 2026-10-19: "bot upgrades should cost copper rather than scrap"); the copper is a first guess in line with `RANK_COST`. */
export const PROMOTE = { copper: 20, parts: 1 };
/** Cost to reach chassis level i (index 1..3): copper and parts, a one-time upgrade like a rank. First guesses. */
export const CHASSIS_COST: { copper: number; parts: number }[] = [{ copper: 0, parts: 0 }, { copper: 15, parts: 0 }, { copper: 30, parts: 1 }, { copper: 50, parts: 2 }];
/** A wreck rebuilt: cheaper than a new body, and it keeps its rank. Scrap only (Minos recorded 30 scrap and 60 crude; crude is not a price any more, decisions.md "Minos on oil rarity and resources"; the same as `REPAIR.rebuilt`). */
export const REBUILD = { scrap: 30 };
/** Stoking a robot for the next mission (Minos, decisions.md "Minos on stoking"): coal, a fixed price, on or off. The coal is a guess; a seam holds 24 and an expedition turns a coal into 2 scrap (`EXPEDITION`). */
export const STOKE_COST = { coal: 5 };
/** Salvaging a robot gives back this share of its body's scrap. */
export const SALVAGE = 0.5;

export const NAMES: Record<CrewRole, string[]> = {
  gatherer: ['Ladle', 'Funnel', 'Sump', 'Gurgle', 'Bucket', 'Slurp', 'Wick'],
  guard: ['Anvil', 'Bolt', 'Grit', 'Hammer', 'Bulwark', 'Clank', 'Rampart'],
  repairer: ['Solder', 'Wrench', 'Tinker', 'Grease', 'Patch', 'Splint', 'Ratchet'],
  mule: ['Biscuit', 'Clover', 'Haybale', 'Old Bess', 'Cart', 'Dobbin', 'Jenny'],
  marksman: ['Monocle', 'Longshot', 'Plumb', 'Sightline', 'Squint', 'Bead', 'Farsight'],
  boilermancer: ['Kettle', 'Simmer', 'Hiss', 'Samovar', 'Cauldron', 'Whistle', 'Percolate'],
  lamplighter: ['Spill', 'Ember', 'Glim', 'Lumen', 'Taper', 'Candle', 'Sconce'],
  stalker: ['Shiv', 'Hush', 'Tiptoe', 'Whisper', 'Needle', 'Shade', 'Creep'],
};

/** A new game owns no robots (Minos; `docs/level-1.md`): the first land is played alone until P9's wreck (Bellows) joins. `START_CREW` stays the Sim's default for tests and dev boots. */
export const freshRoster = (): Roster => ({
  bots: [],
  next: 1,
  types: [],
  chassis: {},
});

/** Drop what this build does not know and keep the invariants (known roles, ranks in range); a `bays` or `field` an old save wrote is dropped. */
export function cleanRoster(r: Roster): Roster {
  const seen = new Set<string>();
  const bots = (Array.isArray(r.bots) ? r.bots : [])
    .filter((b) => b && typeof b.uid === 'string' && !seen.has(b.uid) && seen.add(b.uid) && CREW_ROLES.includes(b.role))
    .map((b) => {
      const out: RosterBot = { uid: b.uid, name: String(b.name || b.role), role: b.role, rank: Math.max(0, Math.min(RANK_MAX, Math.floor(b.rank) || 0)), wreck: !!b.wreck };
      if (b.downed && !b.wreck) out.downed = true;
      // A spec of another type (or one this build dropped) goes; a relic is kept as written.
      if (b.spec && SPECS[b.spec] && SPECS[b.spec].type === b.role) out.spec = b.spec;
      if (typeof b.relic === 'string' && b.relic) out.relic = b.relic;
      if (b.stoked && !b.wreck && !b.downed) out.stoked = true;
      return out;
    });
  const chassis: Roster['chassis'] = {};
  for (const id of Object.keys(CHASSIS) as ChassisId[]) {
    const v = Math.floor(r.chassis?.[id] ?? 0);
    if (v > 0) chassis[id] = Math.min(CHASSIS[id].max, v);
  }
  const next = Math.max(Number.isFinite(r.next) ? r.next : 0, ...bots.map((b) => Number(b.uid.slice(1)) + 1 || 0), 1);
  const types = [...new Set((Array.isArray(r.types) ? r.types : []).filter((t) => CREW_ROLES.includes(t)))];
  return { bots, next, types, chassis };
}

const rosterSample: Roster = {
  bots: [
    { uid: 'r1', name: 'Bellows', role: 'gatherer', rank: 2, wreck: false, spec: 'siphoner', relic: 'toaster' },
    { uid: 'r4', name: 'Rivet', role: 'guard', rank: 1, wreck: true, spec: 'bulwark' },
    { uid: 'r6', name: 'Spanner', role: 'repairer', rank: 0, wreck: false, downed: true },
    { uid: 'r9', name: 'Biscuit', role: 'mule', rank: 0, wreck: false, stoked: true },
  ],
  next: 10,
  types: ['marksman'],
  chassis: { tank: 2, plating: 1 },
};
const rosterSlice = persist<Roster>('roster', freshRoster, { sample: rosterSample });
export const roster = { get: () => cleanRoster(rosterSlice.get()), set: (r: Roster) => rosterSlice.set(cleanRoster(r)) };

/** The robots that ride down: every one you own that is not a wreck or carried home downed (Minos on D24: no bays, no staying home). */
export const riders = (r: Roster) => r.bots.filter((b) => !b.wreck && !b.downed);

// ---- AI cores (P17) ------------------------------------------------------------------------------------------------

/** AI cores not in any robot: a robot needs its core to exist (a wreck keeps its own), so a new body needs one free. */
export const freeCores = (r: Roster, eco: Pick<Economy, 'cores'>) => partyRoom(eco as Economy, r.bots.length);
/** Why no new body can be built, or null when a core is free. */
export function noCore(r: Roster, eco: Pick<Economy, 'cores'>): string | null {
  if (freeCores(r, eco) > 0) return null;
  const n = r.bots.length;
  return `no free AI core: ${eco.cores} held, ${n} robot${n === 1 ? '' : 's'} owned. Cores come from Core Vaults and from bosses`;
}

/** The robots that ride down: every one you own that is not a wreck. */
export const crewOf = (r: Roster): CrewBot[] =>
  riders(r).map((b) => ({ uid: b.uid, name: b.name, role: b.role, rank: b.rank, ...(b.spec && { spec: b.spec }), ...(b.relic && { relic: b.relic }), ...(b.stoked && { stoked: true }) }));

/**
 * The lift docks: every robot that went down and did not come back up is a wreck; one that came up downed (carried, P5) is
 * `downed`, to be repaired. A haul without roster ids (an old one) changes nothing.
 */
export function landRoster(r0: Roster, h: Pick<Haul, 'robots' | 'downed'> & { went?: string[] }): Roster {
  // Stoking lasts one mission: every robot goes cold as the lift docks, whether or not the haul names who went.
  const r = r0.bots.some((b) => b.stoked) ? { ...r0, bots: r0.bots.map(({ stoked: _s, ...b }) => b) } : r0;
  if (!h.went) return r;
  const home = new Set(h.robots.map((b) => b.uid).filter(Boolean));
  const carried = new Set(h.downed);
  const went = new Set(h.went);
  return {
    ...r,
    bots: r.bots.map((b) => {
      if (!went.has(b.uid)) return b;
      if (carried.has(b.uid)) return { ...b, downed: true };
      return home.has(b.uid) ? b : { ...b, wreck: true };
    }),
  };
}

/**
 * The Wanderer's grapple (level 1): a robot of the haul's `fetched` list is aboard and whole afterwards, rode the lift or not, once (one of that name already
 * owned is mended instead: not a wreck, not downed). Its AI core came with it (`bank` brings the one it repaired; `economy.cores` is never below the robots owned).
 */
export function fetchRobots(r: Roster, fetched: { name: string; role: string }[] | undefined): Roster {
  let { bots, next, types } = r;
  for (const f of fetched ?? []) {
    if (!CREW_ROLES.includes(f.role as CrewRole)) continue;
    const role = f.role as CrewRole;
    if (BODY[role].found && !types.includes(role)) types = [...types, role]; // a type wreck mended: its plans are ours
    const own = bots.find((b) => b.name === f.name);
    if (own) bots = bots.map((b) => (b === own ? { ...b, wreck: false, downed: undefined } : b));
    else bots = [...bots, { uid: `r${next++}`, name: f.name, role, rank: 0, wreck: false }];
  }
  return bots === r.bots && types === r.types ? r : { ...r, bots, next, types };
}

// ---- The shop ------------------------------------------------------------------------------------------------------

export interface Shop { eco: Economy; hub: HubState; roster: Roster }

/** A body's price with Sprocket's traced patterns (P38 `sprocket.story` 1): a fifth less scrap. */
export const bodyCost = (role: CrewRole, h: Pick<HubState, 'perks'>): BodyDef => (h.perks.includes('cheapBodies') ? { ...BODY[role], scrap: Math.ceil(BODY[role].scrap * 0.8) } : BODY[role]);

/** The types whose plans are ours: the ones with no `found` rule, the ones a type wreck was mended for (`Roster.types`), and any type already owned (an older save). */
export const knownTypes = (r: Roster): CrewRole[] => CREW_ROLES.filter((role) => !BODY[role].found || r.types.includes(role) || r.bots.some((b) => b.role === role));
/** Types you can build now. */
export const canBuild = (role: CrewRole, r: Roster) => knownTypes(r).includes(role);

/** Take `n` common parts from the stores, the most plentiful first. Throws when there are not enough. */
export function takeParts(parts: HubState['parts'], n: number): HubState['parts'] {
  const out = { ...parts };
  for (let i = 0; i < n; i++) {
    const k = (Object.keys(out) as PartKind[]).filter((p) => !PARTS[p]?.unique && (out[p] ?? 0) > 0).sort((a, b) => (out[b] ?? 0) - (out[a] ?? 0))[0];
    if (!k) throw new Error(`needs ${n} part${n > 1 ? 's' : ''} from the sands`);
    out[k] = out[k]! - 1;
  }
  return out;
}

/** A body's or a repair's price at this hub: the Great Foundry (`buildings.ts`) takes `FOUNDRY_DISCOUNT` off its scrap, rounded up. */
export function foundried<C extends { scrap?: number }>(h: HubState, c: C): C {
  return hasBuilding(h, 'foundry') && c.scrap ? { ...c, scrap: Math.ceil(c.scrap * (1 - FOUNDRY_DISCOUNT)) } : c;
}

function charge(s: Shop, c: { scrap?: number; copper?: number; parts?: number }): Shop {
  let eco = s.eco;
  if (c.scrap) eco = pay(eco, 'scrap', c.scrap);
  if (c.copper) eco = pay(eco, 'copper', c.copper);
  let hub = s.hub;
  if (c.parts) hub = { ...hub, parts: takeParts(hub.parts, c.parts) };
  return { ...s, eco, hub };
}

const find = (r: Roster, uid: string) => {
  const b = r.bots.find((x) => x.uid === uid);
  if (!b) throw new Error(`no robot "${uid}"`);
  return b;
};
const put = (r: Roster, b: RosterBot): Roster => ({ ...r, bots: r.bots.map((x) => (x.uid === b.uid ? b : x)) });

/** A name not in use: the role's pool first, then numbered. */
export function freshName(r: Roster, role: CrewRole) {
  const used = new Set(r.bots.map((b) => b.name));
  const pool = NAMES[role];
  for (let i = 0; ; i++) {
    const n = i < pool.length ? pool[i] : `${pool[i % pool.length]} ${Math.floor(i / pool.length) + 1}`;
    if (!used.has(n)) return n;
  }
}

/** Build a new body. Refused when no AI core is free (`noCore`); nothing is spent on a refusal. */
export function buy(s: Shop, role: CrewRole): Shop & { bot: RosterBot } {
  if (!CREW_ROLES.includes(role)) throw new Error(`no robot type "${role}"`);
  if (!canBuild(role, s.roster)) throw new Error(BODY[role].found!);
  const why = noCore(s.roster, s.eco);
  if (why) throw new Error(why);
  const paid = charge(s, foundried(s.hub, bodyCost(role, s.hub)));
  const bot: RosterBot = { uid: `r${s.roster.next}`, name: freshName(s.roster, role), role, rank: 0, wreck: false };
  return { ...paid, roster: { ...s.roster, bots: [...s.roster.bots, bot], next: s.roster.next + 1 }, bot };
}

/** Why a robot cannot be worked on yet, or null: a wreck is rebuilt first, a robot carried home repaired first. */
const notReady = (b: RosterBot) => (b.wreck ? `${b.name} is a wreck: rebuild it first` : b.downed ? `${b.name} is down: repair it first` : null);

/** Rank a robot up (not a wreck). */
export function rankUp(s: Shop, uid: string): Shop {
  const b = find(s.roster, uid);
  if (notReady(b)) throw new Error(notReady(b)!);
  if (b.rank >= RANK_MAX) throw new Error(`${b.name} is as good as it gets`);
  const paid = charge(s, RANK_COST[b.rank + 1]);
  return { ...paid, roster: put(s.roster, { ...b, rank: b.rank + 1 }) };
}

/** Rebuild a wreck; it needs no new core (it kept its own) and rides again. */
export function rebuild(s: Shop, uid: string): Shop {
  const b = find(s.roster, uid);
  if (!b.wreck) throw new Error(`${b.name} is not a wreck`);
  const paid = charge(s, foundried(s.hub, REBUILD));
  return { ...paid, roster: put(s.roster, { ...b, wreck: false }) };
}

/** Repair a robot carried home downed (P5): `REPAIR.carried`, scrap only (never a can or crude); it rides again, rank, spec and relic as they were. */
export function repairDowned(s: Shop, uid: string): Shop {
  const b = find(s.roster, uid);
  if (!b.downed) throw new Error(`${b.name} is not down`);
  const paid = charge(s, foundried(s.hub, { scrap: REPAIR.carried.scrap }));
  const { downed: _d, ...whole } = b;
  return { ...paid, roster: put(s.roster, whole) };
}

/**
 * Promote a robot to a spec of its type, for good: the deeds' profile must have the spec unlocked (`p`, default the saved
 * one); costs `PROMOTE` (copper and a part). A wreck is rebuilt first; nothing is spent on a refusal.
 */
export function promote(s: Shop, uid: string, spec: SpecId, p: Profile = profile.get()): Shop {
  const b = find(s.roster, uid);
  if (!SPECS[spec]) throw new Error(`no spec "${spec}"`);
  const def = SPECS[spec];
  if (!isBotType(b.role) || def.type !== b.role) throw new Error(`${def.name} is a ${TYPES[def.type].name} spec; ${b.name} is a ${ROLES[b.role].name}`);
  if (notReady(b)) throw new Error(notReady(b)!);
  if (b.spec) throw new Error(`${b.name} is a ${SPECS[b.spec].name} for good`);
  if (!isUnlocked(p, spec)) throw new Error(`${def.name} is not unlocked: ${TYPES[def.type].name} deeds fill its gauge`);
  const paid = charge(s, PROMOTE);
  return { ...paid, roster: put(s.roster, { ...b, spec }) };
}

/**
 * Stoke a robot for the next mission, or let it go cold again (the same click): stoking pays `STOKE_COST.coal`, going cold
 * gives it back (the lift has not left). A wreck or a robot carried home down is mended first. Nothing is spent on a refusal.
 */
export function stoke(s: Shop, uid: string): Shop & { on: boolean } {
  const b = find(s.roster, uid);
  if (notReady(b)) throw new Error(notReady(b)!);
  if (b.stoked) {
    const { stoked: _s, ...cold } = b;
    return { ...s, eco: gain(s.eco, 'coal', STOKE_COST.coal), roster: put(s.roster, cold), on: false };
  }
  return { ...s, eco: pay(s.eco, 'coal', STOKE_COST.coal), roster: put(s.roster, { ...b, stoked: true }), on: true };
}

/**
 * Run `one` on each robot that `eligible` picks, in roster order, as a click on each would: the same costs, nothing new. Stops at the first
 * one the stores cannot pay (`stopped`); when not even the first can be paid, that refusal is thrown. `n` is how many were done.
 */
function eachInOrder(s: Shop, eligible: (b: RosterBot) => boolean, one: (s: Shop, uid: string) => Shop): Shop & { n: number; stopped: boolean } {
  let cur = s, n = 0;
  for (const b of s.roster.bots.filter(eligible)) {
    try {
      cur = one(cur, b.uid);
      n++;
    } catch (e) {
      if (!n) throw e;
      return { ...cur, n, stopped: true };
    }
  }
  return { ...cur, n, stopped: false };
}

/** Stoke every robot that rides and is still cold (the "Stoke all" button): one `stoke` each, in order, until the coal runs out. Never cools one. */
export const stokeAll = (s: Shop) => eachInOrder(s, (b) => !b.wreck && !b.downed && !b.stoked, stoke);

/** Repair every robot carried home down (the "Repair all" button): one `repairDowned` each, in order, until the scrap runs out. A wreck is rebuilt on its own row. */
export const repairAll = (s: Shop) => eachInOrder(s, (b) => !!b.downed && !b.wreck, repairDowned);

/** Fit a relic (or clear it with null). One socket per robot; the relic stays through a wreck. */
export function fitRelic(r: Roster, uid: string, relic: string | null): Roster {
  const { relic: _old, ...b } = find(r, uid);
  return put(r, relic ? { ...b, relic } : b);
}

/** Take a robot apart: some of its body's scrap back. */
export function salvage(s: Shop, uid: string): Shop & { scrap: number } {
  const b = find(s.roster, uid);
  const scrap = Math.floor(BODY[b.role].scrap * SALVAGE);
  // Its relic is not scrap: it goes back to the stock (a unique to the stores). Coal it was fed comes back too.
  const back = stow({ eco: b.stoked ? gain(gain(s.eco, 'scrap', scrap), 'coal', STOKE_COST.coal) : gain(s.eco, 'scrap', scrap), hub: s.hub }, b.relic);
  return { ...s, ...back, roster: { ...s.roster, bots: s.roster.bots.filter((x) => x.uid !== uid) }, scrap };
}

/** The next level of a chassis part. */
export function chassisUp(s: Shop, id: ChassisId): Shop {
  if (!CHASSIS[id]) throw new Error(`no chassis part "${id}"`);
  const lv = s.roster.chassis[id] ?? 0;
  if (lv >= CHASSIS[id].max) throw new Error(`the ${CHASSIS[id].name.toLowerCase()} is as good as it gets`);
  const paid = charge(s, CHASSIS_COST[lv + 1]);
  return { ...paid, roster: { ...s.roster, chassis: { ...s.roster.chassis, [id]: lv + 1 } } };
}

/** "30 scrap, 1 part" */
export const costText = (c: { scrap?: number; copper?: number; parts?: number }) =>
  [c.scrap && `${c.scrap} scrap`, c.copper && `${c.copper} copper`, c.parts && `${c.parts} part${c.parts > 1 ? 's' : ''}`].filter(Boolean).join(', ') || 'free';
