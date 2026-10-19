/**
 * The Rising District (P55 part B; Minos on D48 rows 31 and 32: "rising district - cool, combine with regular housing"), plain TS: housing above the
 * D-city's deck, built in five stages in poured copper. It is the late game's sink once every city slot stands full (Rebuild, `buildings.ts`, is the other).
 *
 * - **Opens** when every city slot holds a standing building (`whyLocked`); a district already begun stays open if a slot is torn down for Rebuild.
 * - **Pour** (`pour`): the panel's lever pays copper into the stage in progress, up to what it still needs. A full stage goes up as scaffolding (`raising`)
 *   and stands when the next lift docks (`finishDistrict`, called by `carry.ts` `landed`), like a building.
 * - **A stage standing** brings `DISTRICT.crowd` civilians into the window (`crowdOf`), makes kills and smashed props drop `DISTRICT.scrap` more
 *   scrap each (`scrapMul`, the Communicator's `scrapRate`: shown on the stats screen as "The Rising District"), and owes a pick of three city perks.
 * - **The perks** (`CITY_PERKS`): three of the pool not yet taken, seeded by how many are held (`offerPerks`); the pick is kept for good. Sim-side ones ride with
 *   the mission as sources (`stat` effects) or flags in `Sim.perks` (`districtFx`, into `CityFx`); their numbers are `PERK_FX` (`sim/perks.ts`). The Chapel's is read by
 *   `researchCtx` (one more card on the Oracle's pick).
 *
 * All the numbers are guesses (P55): prices, crowd, +10% a stage, the perks' strengths.
 */
import { rng } from '../../../../harness/kit/rng';
import type { Effect, Source, Stat } from '../sim/effects';
import { PERK_FX } from '../sim/perks';
import { slotsOf, type CityFx } from './buildings';
import { pay, type Books } from './economy';
import { isWorking, type HubState } from './state';

/** The five stages, in the order they go up. */
export const STAGES = [
  { id: 'tenements', name: 'Tenements', price: 150, text: 'Rows of lit windows hung under the keel, with people behind them.' },
  { id: 'market', name: 'The Market Bridge', price: 250, text: 'A bridge between the decks, stalls along it, lanterns strung from the rail.' },
  { id: 'tramLoop', name: 'The Tram Loop', price: 400, text: 'A tram running a loop on the girders, ringing at every corner.' },
  { id: 'terraces', name: 'The Aqueduct Terraces', price: 600, text: 'Terraces of arches, water falling from each to the next, green in the cracks.' },
  { id: 'hatch', name: 'The Upper Hatch', price: 900, text: 'A round hatch into the dirigible\'s hull. It does not open yet: the rest is for later.' },
] as const;

/** A stage's civilians, its share of extra scrap, and the perks offered a pick. First guesses. */
export const DISTRICT = { crowd: 8, scrap: 0.1, offered: 3 };

/** What the district holds (`HubState.district`): stages standing, copper poured into the next, whether that one is going up, and the city perks taken. */
export interface District { stage: number; poured: number; raising: boolean; perks: string[] }
export const freshDistrict = (): District => ({ stage: 0, poured: 0, raising: false, perks: [] });
const clean = (n: unknown, max: number) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));
/** A save's district, whole (an old save has none). */
export function districtOf(s: Pick<HubState, 'district'>): District {
  const d = s.district;
  if (!d) return freshDistrict();
  const stage = clean(d.stage, STAGES.length);
  const raising = !!d.raising && stage < STAGES.length;
  return { stage, poured: stage < STAGES.length ? clean(d.poured, STAGES[stage].price) : 0, raising, perks: [...new Set((d.perks ?? []).filter((p): p is string => p in CITY_PERKS))] };
}

export const finished = (d: District) => d.stage >= STAGES.length;
/** The stage being poured or going up, or undefined once the district is done. */
export const stageOf = (d: District) => STAGES[d.stage];
/** Copper the stage in progress still needs (0 while it goes up, or when done). */
export const needed = (d: District) => (finished(d) || d.raising ? 0 : STAGES[d.stage].price - d.poured);
/** Begun: copper poured, a stage going up or standing. */
const begun = (d: District) => d.stage > 0 || d.poured > 0 || d.raising;

/** Civilians who have moved in. */
export const crowdOf = (d: District) => d.stage * DISTRICT.crowd;
/** Scrap drops times this: +`DISTRICT.scrap` a stage standing. */
export const scrapMul = (d: District) => 1 + d.stage * DISTRICT.scrap;

/** Why the district is shut, or null: it opens once every city slot holds a standing building. */
export function whyLocked(s: HubState, all = false): string | null {
  if (!isWorking(s, 'cityPlanner', all)) return 'the City Planner is not at work: build her drafting office first';
  if (begun(districtOf(s))) return null;
  const stand = s.buildings?.built.length ?? 0, slots = slotsOf(s, all);
  return stand >= slots ? null : `Opens when every city slot holds a standing building (${stand} of ${slots} stand).`;
}

/** Why `n` copper cannot be poured now, or null. */
export function whyNotPour(s: HubState, n: number, copper: number, all = false): string | null {
  const d = districtOf(s);
  const locked = whyLocked(s, all);
  if (locked) return locked;
  if (finished(d)) return 'The district is as tall as it gets, for now.';
  if (d.raising) return `${STAGES[d.stage].name} is going up: it stands when the lift is back.`;
  if (!Number.isInteger(n) || n <= 0) return 'pour a whole number of copper';
  if (n > needed(d)) return `${STAGES[d.stage].name} needs only ${needed(d)} more`;
  if (n > copper) return `needs ${n} copper; you have ${copper}`;
  return null;
}

/** Pour copper into the stage in progress; a full one goes up as scaffolding. Throws with the reason and changes nothing. */
export function pour(b: Books, n: number, all = false): Books {
  const why = whyNotPour(b.hub, n, b.eco.copper, all);
  if (why) throw new Error(why);
  const d = districtOf(b.hub);
  const poured = d.poured + n;
  return { eco: pay(b.eco, 'copper', n), hub: { ...b.hub, district: { ...d, poured, raising: poured >= STAGES[d.stage].price } } };
}

/** A lift has docked: a stage that was going up stands. `stage` is its number (1-5), else 0. */
export function finishDistrict(s: HubState): { hub: HubState; stage: number } {
  const d = districtOf(s);
  if (!d.raising) return { hub: s, stage: 0 };
  return { hub: { ...s, district: { ...d, stage: d.stage + 1, poured: 0, raising: false } }, stage: d.stage + 1 };
}

/** Dev: put `n` stages straight up (finished, none going up, nothing poured). */
export const setStage = (s: HubState, n: number): HubState => ({ ...s, district: { ...districtOf(s), stage: clean(n, STAGES.length), poured: 0, raising: false } });

// ---- The city perks -------------------------------------------------------------------------------------------------

const stat = (stat: Stat, add: number): Effect => ({ when: 'always', do: { do: 'stat', stat, add } });

interface CityPerk {
  name: string;
  /** What it does, plainly. */
  text: string;
  /** A flag in `Sim.perks` that the sim reads where its rule lives. */
  flag?: string;
  /** Effects on the Communicator and on his robots. */
  comm?: Effect[];
  bots?: Effect[];
}

/** The pool (P55 B; named from the vision's tech): each works on a system that exists. */
export const CITY_PERKS: Record<string, CityPerk> = {
  smokeless: { name: 'Smokeless Combustion', text: 'Stripping a ruin or mining a seam no longer wakes a sleeping hive. Decoding still does.', flag: 'smokeless' },
  superheated: { name: 'Superheated Steam', text: 'A Scalded foe that dies bursts in a small Scald pulse.', comm: [stat('scaldBurst', PERK_FX.scaldBurst)], bots: [stat('scaldBurst', PERK_FX.scaldBurst)] },
  copperWiring: { name: 'Pure Copper Wiring', text: `Every Shock chain jumps ${PERK_FX.shockJumps} more.`, comm: [stat('shockJumps', PERK_FX.shockJumps)], bots: [stat('shockJumps', PERK_FX.shockJumps)] },
  pneumaticPost: { name: 'Pneumatic Post', text: `Loot within ${PERK_FX.lootPull} px of you flies to you.`, comm: [stat('lootPull', PERK_FX.lootPull)] },
  hotWaterMains: { name: 'Hot Water Mains', text: `The land's tap holds ${Math.round((PERK_FX.tap.amount - 1) * 100)}% more and mends ${PERK_FX.tap.rate === 2 ? 'twice' : `${PERK_FX.tap.rate} times`} as fast.`, flag: 'hotWaterMains' },
  senseiHall: { name: 'The Sensei\'s Hall', text: `The kick's cooldown is ${Math.round((1 - PERK_FX.kick) * 100)}% shorter.`, flag: 'senseiHall' },
  districtChapel: { name: 'The District Chapel', text: 'The Oracle\'s free research pick offers four cards.' },
  militiaMuster: { name: 'Militia Muster', text: `Every lift goes down with one Brass Guard beside you for the first ${PERK_FX.militia / 60} minutes.`, flag: 'militiaMuster' },
  crowsNest: { name: 'The Crow\'s Nest', text: 'Every hive of the land is marked on the map from landing.', flag: 'crowsNest' },
};
export const CITY_PERK_IDS = Object.keys(CITY_PERKS);
export const hasCityPerk = (s: Pick<HubState, 'district'>, id: string) => districtOf(s).perks.includes(id);

/** Picks the standing stages owe: one a stage, less the perks taken. */
export const picksOwed = (d: District) => Math.max(0, d.stage - d.perks.length);

/** The three on offer now (none when no pick is owed): drawn from the pool not yet taken, seeded by how many are held, so reopening shows the same three. */
export function offerPerks(s: Pick<HubState, 'district'>): string[] {
  const d = districtOf(s);
  if (!picksOwed(d)) return [];
  const pool = CITY_PERK_IDS.filter((id) => !d.perks.includes(id));
  return rng(`district:${d.perks.length}`).shuffle(pool).slice(0, DISTRICT.offered);
}

/** Take one of the three on offer, for good. Throws when it is not on offer. */
export function takePerk(s: HubState, id: string): HubState {
  if (!offerPerks(s).includes(id)) throw new Error('that perk is not on offer');
  const d = districtOf(s);
  return { ...s, district: { ...d, perks: [...d.perks, id] } };
}

/** Dev: take a perk straight, whatever is on offer. */
export const grantPerk = (s: HubState, id: string): HubState => {
  const d = districtOf(s);
  return CITY_PERKS[id] && !d.perks.includes(id) ? { ...s, district: { ...d, perks: [...d.perks, id] } } : s;
};

// ---- What the district does in a mission -------------------------------------------------------------------------------

/** The mission-side effects of the district (`SimOptions.city`), added to what the buildings give: the scrap drop, the perks' sources and flags. */
export function districtFx(fx: CityFx, s: Pick<HubState, 'district'>): CityFx {
  const d = districtOf(s);
  const comm: Source[] = [...fx.comm], bots: Source[] = [...fx.bots], perks = [...fx.perks];
  if (d.stage > 0) comm.push({ id: 'district', kind: 'building', name: 'The Rising District', effects: [{ when: 'always', do: { do: 'stat', stat: 'scrapRate', pct: scrapMul(d) - 1 } }] });
  for (const id of d.perks) {
    const p = CITY_PERKS[id];
    if (p.flag) perks.push(p.flag);
    if (p.comm) comm.push({ id: `district:${id}`, kind: 'building', name: p.name, effects: p.comm });
    if (p.bots) bots.push({ id: `district:${id}`, kind: 'building', name: p.name, effects: p.bots });
  }
  return { ...fx, comm, bots, perks };
}
