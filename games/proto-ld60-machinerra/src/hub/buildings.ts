/**
 * The D-city's buildings, plain TS (no Phaser): the blueprints the City Planner draws up, the city slots they stand on, and
 * what each finished building does (systems.md, "D-city, buildings, expeditions"; decisions.md, "D-city").
 *
 * - **A visit:** the Planner offers three blueprints (`offer`: seeded by the visit's `missions` count, never one already built
 *   or going up) and the Communicator picks one (`draw`, paid by `buildBlueprint` in economy.ts): one blueprint a visit.
 * - **A building takes the next mission to finish:** drawn up it stands as scaffolding in the D-city window (`raising`) and
 *   is done when the next lift docks (`finish`, called by `carry.ts` `landed`), when its effect starts.
 * - **Slots:** `citySlots` (4 at first, more as the window's stages grow, always fewer than the buildings). The deck's lots are
 *   stations', not these.
 * - **Effects:** a building changes the mission through `cityFx` (effect sources for the Communicator and his robots, and the
 *   few things that are not stats: scrap a kill, dusk's delay, a call's charge, the marked signals), the workshop's prices
 *   (the Great Foundry: `FOUNDRY_DISCOUNT`, economy.ts) or the expedition (the Boiler Cathedral: `expeditions.ts`).
 *
 * Add a building: a `BUILDINGS` row, its effect in `cityFx` (or where it acts), a silhouette in `art/panelart.ts` `drawBuilding`.
 * The jam's Main ones are built, with the Reliquary of Minds, the Tram Line, the Lamp Foundry and the Grand Aqueduct (P55 part A), and P42's two
 * that a quest or a companion unlocks (`GATE`): the Replicator (the cat) and the Greenhouse (the Green Shoot). The Map Room is not. A building with a
 * `GATE` is offered only once its perk is held (a quest line's reward, `storylines.ts`, `speciallines.ts`); `rareBlueprints` (the Planner's big table)
 * and `tramPlans` (the Expeditioner's rails) are the gates for those to come.
 */
import { rng } from '../../../../harness/kit/rng';
import { CAT, CURFEW, MISSION, TRAM } from '../sim/defs';
import type { Source, Stat } from '../sim/effects';
import { cityStage, isWorking, type CityBuildings, type HubState } from './state';
import { titleStat, type Titles } from './titles';

export type BuildingId = 'foundry' | 'cathedral' | 'aviary' | 'aqueducts' | 'spire' | 'scrapyard' | 'curfew' | 'reliquary' | 'tram' | 'lampFoundry' | 'grandAqueduct' | 'replicator' | 'greenhouse';

export interface BuildingDef {
  name: string;
  /** What it is, in the Planner's voice (the first three are the placeholder specialties' texts, Laimonas's). */
  text: string;
  /** What it does, plainly. */
  effect: string;
  /** Its price in `PRICE_STOCK`: the table in systems.md, first guesses in copper. */
  price: number;
}

/** What a blueprint is paid in. systems.md's table says scrap, the lead's reading (Minos: "copper for building") copper: open question, one word to turn. */
export const PRICE_STOCK: 'copper' | 'scrap' = 'copper';

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  foundry: { name: 'The Great Foundry', text: 'Smelts what you bring home into brass. Robots come cheaper.', effect: 'Bodies and repairs cost 30% less scrap.', price: 120 },
  cathedral: { name: 'The Boiler Cathedral', text: 'The Oracle speaks louder. The faithful work harder.', effect: 'Expeditions bring back 50% more.', price: 100 },
  aviary: { name: 'The Pigeon Aviary', text: 'Carrier pigeons, the only safe wireless. Scout the sands before you land.', effect: 'The vault and the pilgrim are marked exactly on the map at landing.', price: 90 },
  aqueducts: { name: 'Aqueducts', text: 'Water, carried the old way, to every boiler in the city.', effect: 'Steam builds back 30% faster, and you hold 20% more.', price: 120 },
  spire: { name: 'The Signal Spire', text: 'A brass needle that the Wanderer can lean on.', effect: 'One more air-support charge for every call.', price: 150 },
  scrapyard: { name: 'The Scrapyard', text: 'Everything a hornet drops is worth a second look.', effect: 'One more scrap from every kill.', price: 80 },
  curfew: { name: 'The Curfew Bell', text: 'It tolls the hours, and the dark waits for it.', effect: 'Dusk comes 30 seconds later, on every land.', price: 100 },
  tram: { name: 'The Tram Line', text: 'Brass rails up the keel, and a car that does not wait for the kettle to boil.', effect: 'The lift rises in 1 second, and robots sent to it run 1.5 times as fast.', price: 90 },
  reliquary: { name: 'The Reliquary of Minds', text: 'A vault of quiet brass where a mind can be kept.', effect: 'One more AI core, once, when it stands.', price: 200 },
  replicator: { name: 'The Replicator', text: 'It copies whatever is sat in it. Someone will put the cat in it.', effect: 'The catsplosion: one more scrap from every kill, and cats on every roof.', price: 120 },
  greenhouse: { name: 'The Greenhouse', text: 'A glass house for one green shoot, watered on purpose.', effect: 'A free can of oil on the pack for every mission.', price: 150 }, // the price is a guess: the table does not list it
  // The Extra buildings (P55 part A; systems.md's table, prices first guesses in copper).
  lampFoundry: { name: 'The Lamp Foundry', text: 'Lamps cast by the thousand, and every robot gets a bigger one.', effect: 'Robots\' lamps are 1.4 times as wide.', price: 90 },
  grandAqueduct: { name: 'The Grand Aqueduct', text: 'Two tiers of arches, and every boiler in the city drinking deep.', effect: 'Steam builds back 50% faster.', price: 400 },
};

/**
 * The perk a building needs before the Planner will offer it (a quest line's reward, or the cat for the Replicator). Keyed by plain ids so a
 * building another plan adds can be gated here before its row exists: the Tram Line (the Expeditioner's rails), the Extra ones (the Planner's big table).
 */
export const GATE: Record<string, string> = {
  replicator: 'companionCat',
  greenhouse: 'greenhousePlans',
  grandAqueduct: 'aqueductPlans',
  tram: 'tramPlans',
  lampFoundry: 'rareBlueprints',
  mapRoom: 'rareBlueprints',
};
const gated = (id: string, perks: readonly string[] = []) => !GATE[id] || perks.includes(GATE[id]);

/** The Lamp Foundry: how much wider the robots' lamps are, in the sim (the `lamp` stat, in `cityFx`) and on screen (`CityFx.lampMul`, `botview.ts`). */
export const LAMP_FOUNDRY = 1.4;
/** The Grand Aqueduct's share on steam regen. */
export const GRAND_AQUEDUCT = 0.5;
export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
export const isBuildingId = (id: unknown): id is BuildingId => typeof id === 'string' && id in BUILDINGS;

/** The Boiler Cathedral's share on an expedition's scrap. */
export const CATHEDRAL_BONUS = 0.5;
/** Buildings drawn up per visit (decisions.md: the Planner offers three and "one of three each time"). */
export const OFFERED = 3;

/** City slots by the window's stage (`CITY_STAGES`): 4 at first, more as it grows, always fewer than the buildings. First guesses. */
export const SLOTS_BY_STAGE = [4, 4, 5, 6];
/** The perk the Planner's rescue passive will give (P18): one more slot. */
export const CITY_SLOT_PERK = 'citySlot';
export const citySlots = (stage: number, extra = 0) => (SLOTS_BY_STAGE[Math.max(0, Math.min(SLOTS_BY_STAGE.length - 1, stage))] ?? 4) + Math.max(0, Math.floor(extra));
/** This save's slots. */
export const slotsOf = (s: HubState, all = false) => citySlots(cityStage(s, all), (s.perks as readonly string[]).includes(CITY_SLOT_PERK) ? 1 : 0);

const city = (s: Pick<HubState, 'buildings'>): CityBuildings => s.buildings ?? { built: [], raising: [], pickedAt: -1 };
/** Built, and so at work. */
export const hasBuilding = (s: Pick<HubState, 'buildings'>, id: BuildingId) => city(s).built.includes(id);
/** The slots in use: built and going up. */
export const slotsUsed = (s: Pick<HubState, 'buildings'>) => city(s).built.length + city(s).raising.length;

/** Blueprints drawn up this visit. */
export const drawnThisVisit = (s: Pick<HubState, 'missions' | 'buildings'>) => (city(s).pickedAt === s.missions ? city(s).picks ?? 1 : 0);
/** Blueprints a visit allows: one, two with the Grand Plan (the Planner's gift at the fifth step of her track, P52). */
export const perVisit = (s: Partial<Pick<HubState, 'perks'>>) => ((s.perks as readonly string[] | undefined)?.includes('grandPlan') ? 2 : 1);

/** The three blueprints this visit offers: seeded from the visit (the missions flown), never one already built or going up. None once the visit's blueprints are drawn up. */
export function offer(s: Pick<HubState, 'missions' | 'buildings'> & Partial<Pick<HubState, 'perks'>>): BuildingId[] {
  const c = city(s);
  if (drawnThisVisit(s) >= perVisit(s)) return [];
  const pool = BUILDING_IDS.filter((id) => !c.built.includes(id) && !c.raising.includes(id) && gated(id, s.perks));
  return rng(`blueprints:${s.missions}`).shuffle(pool).slice(0, OFFERED);
}

/** A blueprint's price after the Planner's title (`architect`: 10% less; the hub stat keeps its old name, `buildingScrapCost`). */
export const priceOf = (id: BuildingId, titles?: Titles) => Math.max(0, Math.round(titles ? titleStat(titles, 'hub', 'buildingScrapCost', BUILDINGS[id].price) : BUILDINGS[id].price));

/** Why this blueprint cannot be drawn up now, or null. */
export function whyNot(s: HubState, id: string, all = false): string | null {
  if (!isBuildingId(id)) return `no blueprint "${id}"`;
  if (!isWorking(s, 'cityPlanner', all)) return 'the City Planner is not at work: build her drafting office first';
  if (drawnThisVisit(s) >= perVisit(s)) return `${perVisit(s) === 1 ? 'one blueprint' : 'two blueprints'} a visit: the next lift brings the next three`;
  if (!offer(s).includes(id)) return `${BUILDINGS[id].name} is not on offer this visit`;
  if (slotsUsed(s) >= slotsOf(s, all)) return `the city has no free slot (${slotsUsed(s)} of ${slotsOf(s, all)} used)`;
  return null;
}

/** Draw up a blueprint: it goes on the next free slot as scaffolding. Throws with the reason and changes nothing when it cannot. The price is `buildBlueprint`'s (economy.ts). */
export function draw(s: HubState, id: string, all = false): HubState {
  const why = whyNot(s, id, all);
  if (why) throw new Error(why);
  const c = city(s);
  return { ...s, buildings: { ...c, raising: [...c.raising, id], pickedAt: s.missions, picks: drawnThisVisit(s) + 1 } };
}

/** A lift has docked: what was going up stands, and its once-only gift is paid (`cores`: the Reliquary's AI core). */
export function finish(s: HubState): { hub: HubState; cores: number; done: BuildingId[] } {
  const c = city(s);
  if (!c.raising.length) return { hub: s, cores: 0, done: [] };
  const done = c.raising.filter(isBuildingId);
  return { hub: { ...s, buildings: { ...c, built: [...new Set([...c.built, ...done])], raising: [] } }, cores: c.cored ? 0 : done.filter((id) => id === 'reliquary').length, done };
}

/** Why this building cannot be torn down, or null (Rebuild, P55 B). */
export function whyNotTear(s: HubState, id: string, all = false): string | null {
  if (!isBuildingId(id)) return `no building "${id}"`;
  if (!isWorking(s, 'cityPlanner', all)) return 'the City Planner is not at work: build her drafting office first';
  if (city(s).raising.includes(id)) return `${BUILDINGS[id].name} is still under scaffolding: it can come down once it stands`;
  if (!city(s).built.includes(id)) return `${BUILDINGS[id].name} does not stand`;
  return null;
}

/** Rebuild (Minos, D48): a standing building comes down for nothing back and its slot is free; a new one is drawn up as usual. The Reliquary's core stays (a later Reliquary gives none). Throws with the reason. */
export function tearDown(s: HubState, id: string, all = false): HubState {
  const why = whyNotTear(s, id, all);
  if (why) throw new Error(why);
  const c = city(s);
  return { ...s, buildings: { ...c, built: c.built.filter((b) => b !== id), ...(id === 'reliquary' && { cored: true }) } };
}

/** Dev: put a building straight up (finished), for the pane and the tests. */
export function raise(s: HubState, id: BuildingId, done = true): HubState {
  const c = city(s);
  const rest = { built: c.built.filter((b) => b !== id), raising: c.raising.filter((b) => b !== id) };
  return { ...s, buildings: { ...c, ...rest, ...(done ? { built: [...rest.built, id] } : { raising: [...rest.raising, id] }) } };
}

/** The slots in the order the window shows them: the ones that stand, then the ones going up. */
export const slotsOrder = (s: Pick<HubState, 'buildings'>): { id: BuildingId; done: boolean }[] => [
  ...city(s).built.filter(isBuildingId).map((id) => ({ id, done: true })),
  ...city(s).raising.filter(isBuildingId).map((id) => ({ id, done: false })),
];

// ---- What the buildings do in a mission ------------------------------------------------------------------------------

/** What the Sim takes from the city (`SimOptions.city`): sources for the Communicator and his robots, and the plain numbers. */
export interface CityFx {
  comm: Source[];
  bots: Source[];
  /** Scrap more from every kill (the Scrapyard). */
  scrapKill: number;
  /** Seconds dusk comes later (the Curfew Bell: `CURFEW`). */
  duskLater: number;
  /** Charges more for every call (the Signal Spire). */
  charges: number;
  /** The pilgrim's and the vault's signals are exact at landing (the Pigeon Aviary). */
  marked: boolean;
  /** Seconds the lift takes to rise, and the speed share of a robot under an evac order (the Tram Line: `TRAM`). */
  riseTime: number;
  evacSpeed: number;
  /** How much wider the robots' lamps are drawn (the Lamp Foundry; the `lamp` stat is the same share in `bots`). */
  lampMul: number;
  /** City perks the Sim reads from its `perks` set (the Rising District's: `district.ts` `districtFx`). */
  perks: string[];
}

export const noCity = (): CityFx => ({ comm: [], bots: [], scrapKill: 0, duskLater: 0, charges: 0, marked: false, riseTime: MISSION.riseTime, evacSpeed: 1, lampMul: 1, perks: [] });

export const stat = (stat: Stat, pct: number) => ({ when: 'always' as const, do: { do: 'stat' as const, stat, pct } });

/** The mission-side effects of the buildings that stand. */
export function cityFx(built: readonly string[] = [], o: { cat?: boolean } = {}): CityFx {
  const has = (id: BuildingId) => built.includes(id);
  const fx = noCity();
  if (has('aqueducts')) fx.comm.push({ id: 'building:aqueducts', kind: 'building', name: BUILDINGS.aqueducts.name, effects: [stat('steamRegen', 0.3), stat('maxSteam', 0.2)] });
  if (has('grandAqueduct')) fx.comm.push({ id: 'building:grandAqueduct', kind: 'building', name: BUILDINGS.grandAqueduct.name, effects: [stat('steamRegen', GRAND_AQUEDUCT)] });
  if (has('lampFoundry')) {
    fx.lampMul = LAMP_FOUNDRY;
    fx.bots.push({ id: 'building:lampFoundry', kind: 'building', name: BUILDINGS.lampFoundry.name, effects: [stat('lamp', LAMP_FOUNDRY - 1)] });
  }
  if (has('scrapyard')) fx.scrapKill = 1;
  if (has('replicator') && o.cat) fx.scrapKill += CAT.kill; // the catsplosion needs the cat
  if (has('curfew')) fx.duskLater = CURFEW.later;
  if (has('spire')) fx.charges = 1;
  if (has('aviary')) fx.marked = true;
  if (has('tram')) {
    fx.riseTime = TRAM.rise;
    fx.evacSpeed = TRAM.evac;
  }
  return fx;
}
