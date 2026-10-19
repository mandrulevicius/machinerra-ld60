/**
 * The D-hub's rules, plain TS (no Phaser): what a mission brings home, who has been rescued and lives aboard, how far the
 * D-city has grown, and the next course. Scenes only draw it; `save.ts` keeps it in browser storage.
 */
import { rng } from '../../../../harness/kit/rng';
import type { BiomeId, PartKind, SupportId } from '../sim/defs';
import { loadoutFrom, type Loadout } from '../sim/loadout';
import type { HudId } from '../sim/onboard';
import type { District } from './district';
import { WORKBENCH, connected, openLots } from './layout';
import { titleStat, type Titles } from './titles';

export type Parts = Partial<Record<PartKind, number>>;
/** `uid`: its id in the workshop's roster (`workshop.ts`). */
export interface Robot { name: string; role: string; uid?: string }

/**
 * What the lift brings up from one mission. `id` makes arriving twice with the same haul (a scene restart) a no-op.
 * `rescued` are the NPCs freed on the sands and brought to the lift; only they come aboard. `gathered` are the ones the mission
 * met but did not bring (never found, or left behind): they stay on the sands and wait on a later land (the hub ignores them).
 */
export interface Haul {
  id: string;
  /** The HUD elements a run that started with an empty HUD showed (`sim/onboard.ts`): kept in the `onboard` slice. */
  onboard?: HudId[];
  parts: Parts;
  robots: Robot[];
  /** The roster ids of every robot that went down (`landRoster` wrecks the ones not in `robots`). */
  went?: string[];
  /** Robots the Wanderer's grapple fetches whether or not they rode the lift (level 1's Bellows: always aboard after, whole): the workshop adds them (`fetchRobots`). */
  fetched?: { name: string; role: string }[];
  /** The roster ids of the downed robots that came up on the lift, carried (P5; `landRoster` marks them `downed`, repaired for scrap, not rebuilt). */
  downed?: string[];
  rescued?: string[];
  gathered?: string[];
  /** The land's threat tier (`Sim.tier`): the hub's light on coming home (`hublight.ts` `moodOf`). */
  tier?: number;
  /** The economy's share (`economy.ts` `bank`): scrap and copper gathered, AI cores found, air support charges left; `insight` is 0 or 1, the stage's one punch card earned (`research.ts` `bankPick`). Oil never comes home: cans refill at the lift. */
  scrap?: number;
  insight?: number;
  cores?: number;
  /** Relics (`sim/junk.ts` ids) found on the carry strip: they join the stock (`economy.ts` `bank`). */
  junk?: string[];
  /** Copper stripped from ruins, elites and bosses (`Sim.copper`): the building material. */
  copper?: number;
  /** Coal mined at the seams (`Sim.coal`): fuel for expeditions (P41), a stock at home. */
  coal?: number;
  charges?: Partial<Record<SupportId, number>>;
  /** Kinds of place the Communicator came upon (`carry.ts` `discovered`, and `HubState.found` by land). */
  discovered?: string[];
  /** The NPC whose pilgrim place the Communicator came upon: not brought home, they wait on that land (`HubState.stranded`). */
  met?: string;
  /** What the mission carries on (`carry.ts` feeds the slices): the loadout it ended with and its stats. */
  carry?: { loadout: Loadout; stats: Record<string, number> };
  /** The main quest's share (hub/story.ts): the bosses brought down, the Esteemed Ghost freed. */
  bosses?: string[];
  ghost?: boolean;
  /** What the colony's expedition brought home with this lift (`expeditions.ts` `withExpedition`, set as the lift docks): once per departure. */
  expedition?: ExpeditionResult;
}

/** An expedition's return: the coal it was fed, the scrap it brings (the Boiler Cathedral's share included), a junk relic and a charted land, sometimes. */
export interface ExpeditionResult { coal: number; scrap: number; junk?: string; charted?: BiomeId }

/** A real rescue pays the colony's thanks on top of the haul, in scrap (`economy.ts` `bank`; a missed one pays nothing). */
export const RESCUE_THANKS = 75;

/** NPC spots in the hub (`layout.ts` places them). */
export type SpotId = 'altar' | 'colony-north' | 'colony-south' | 'workshop' | 'lift' | 'planner';

/**
 * What an NPC's station gives the Communicator: one thing each, sold or taught, and the first is free; the rest are what
 * their quest lines unlock (`lines.ts`), in that NPC's specialty. A perk lasts for every mission after (the Sim reads
 * `HubState.perks`; `cheapLots` the hub).
 */
export type PerkId =
  | 'kick' | 'packSack' | 'scavenger' | 'shells'
  | 'longBoot' | 'dashKick' | 'ironToe' | 'quickBoot' | 'wideBoot'
  | 'quickHands' | 'prospector' | 'packMule' | 'ruinSense'
  | 'snacks' | 'wireOrder' | 'goodOil'
  | 'extraShells' | 'cheapLots' | 'bigShells'
  | 'homeRest' | 'callDrop' | 'callLance' | 'moreCharges' | 'ghostTouch'
  | 'zepMagazine' | 'zepBoilers' | 'zepMast'
  | 'canRack' | 'oracleCans' | 'workshop' | 'forge' | 'clinic'
  | 'cheapBodies' | 'dreamAgain'
  | 'companionDog' | 'companionCat' | 'dogNose' | 'shootGrows' | 'greenhousePlans' | 'tramPlans' | 'rareBlueprints' | 'aqueductPlans'
  | 'sandBearings' | 'mossBrush' | 'receipts' | 'frostContacts'
  | 'grafting'
  | 'rollCall' | 'oldEarful' | 'secondHeart' | 'oldMap' | 'grandPlan' | 'openDoor' | 'backRoom' | 'fourthSlot' | 'homingSignal';
export const PERKS: Record<PerkId, { name: string; how: 'teach' | 'sell'; text: string }> = {
  kick: { name: 'The Kick', how: 'teach', text: 'A boot to the chassis: {kick} sends whatever is in front of you flying. Little damage, a lot of distance.' },
  // Sprocket's free first thing (P9): the bench itself, which opens with her station (D29); no rule of its own. A placeholder gift, tabled for Minos.
  workshop: { name: 'The bench', how: 'teach', text: 'Build robots, mend the wrecks and fit old tech to them at the workshop.' },
  // Hob's and Gasket's free first things (P20): what their stations teach is recipes (`taught.ts`), so the gift is a label like the bench's.
  forge: { name: 'The forge', how: 'teach', text: 'Weapon recipes, taught at the workbench: the guns, blades and blasters Hob knows how to make.' },
  clinic: { name: 'The clinic', how: 'teach', text: 'Body-part recipes, taught at the workbench: heads, arms, hearts, legs, backs and packs.' },
  packSack: { name: 'A second sack, every lift', how: 'sell', text: 'A sack strapped to your pack: the carry strip holds two more pieces of old tech.' },
  scavenger: { name: "Scavenger's eye", how: 'teach', text: 'Loot comes to you from twice as far, and ruins give up their finds in half the time.' },
  shells: { name: 'A standing order of shells', how: 'sell', text: 'One more Steam barrage call from the Wanderer every mission.' },
  longBoot: { name: 'The Long Boot', how: 'teach', text: 'The kick reaches 40% further and throws 30% harder.' },
  dashKick: { name: 'The Leaping Kick', how: 'teach', text: 'The kick leaps you forward toward the aim first: the boot arrives before you do.' },
  ironToe: { name: 'The Iron Toe', how: 'teach', text: 'Crashes hit twice as hard.' },
  quickBoot: { name: 'The Quick Boot', how: 'teach', text: 'Kick again 40% sooner.' },
  wideBoot: { name: 'The Wide Boot', how: 'teach', text: 'The kick sweeps an arc nearly twice as wide.' },
  quickHands: { name: 'Quick hands', how: 'teach', text: 'Ruins open at a touch, and each one you search pours back a third of your oil and all your steam.' },
  prospector: { name: "The prospector's draw", how: 'teach', text: 'You salvage 30% faster.' },
  packMule: { name: 'A better strap', how: 'teach', text: 'Loot comes to you from half as far again.' },
  ruinSense: { name: 'Ruin sense', how: 'teach', text: 'Every ruin gives up a second find.' },
  snacks: { name: 'Steam biscuits', how: 'sell', text: 'Steam comes back 25% faster.' },
  wireOrder: { name: 'A standing order for wire', how: 'sell', text: 'The Trader pays for wire by the coil: ruins and elites give half again as much copper.' },
  goodOil: { name: 'The good oil', how: 'sell', text: 'A spare can puts you back up at 60% oil instead of 35%.' },
  extraShells: { name: 'Recalculated shells', how: 'sell', text: 'One more Steam barrage call every mission.' },
  cheapLots: { name: 'Drawn on the back', how: 'teach', text: 'Stations cost a quarter less copper.' },
  bigShells: { name: 'Heavy shells', how: 'sell', text: 'Barrage shells hit 50% harder.' },
  // The main quest's (hub/story.ts).
  homeRest: { name: 'A bed of your own', how: 'teach', text: 'You sleep at home between lifts and land rested: Hasted for the first minute of every mission.' },
  callDrop: { name: 'The Brass Drop', how: 'teach', text: 'The Wanderer lowers three Brass Guards where you point; they fight beside you for a minute. Pick your call at the course table.' },
  callLance: { name: 'The Steam Lance', how: 'teach', text: 'The Wanderer vents a line of scalding steam through your mark, along your aim.' },
  moreCharges: { name: 'A fuller hold', how: 'teach', text: 'Every one of the Wanderer\'s calls has one more charge a mission.' },
  ghostTouch: { name: 'Ghost touch', how: 'teach', text: 'The Esteemed Ghost\'s gift: every hit of yours lands on the ethereal.' },
  // The Wanderer's improvements (`ZEPPELIN`), built on a lot once the house is open: each changes the calls.
  zepMagazine: { name: 'A shell magazine', how: 'teach', text: "Every one of the Wanderer's calls has one more charge a mission." },
  zepBoilers: { name: 'Pressure boilers', how: 'teach', text: "The Wanderer's barrage and lance hit 40% harder." },
  // Raise the pack's can cap (`capExtraOf`, economy.ts): the Can Rack body part (P23) and the Oracle's capstone (P38) grant them.
  canRack: { name: 'A can rack', how: 'teach', text: 'The pack holds one more oil can: four, not three.' },
  oracleCans: { name: "The Oracle's reserve", how: 'teach', text: 'The pack holds one more oil can.' },
  // The story lines' (P38): Sprocket's patterns and the Oracle's tithe.
  cheapBodies: { name: 'Traced patterns', how: 'teach', text: 'New robot bodies cost a fifth less scrap.' },
  dreamAgain: { name: 'Dream again', how: 'teach', text: 'Once a visit, the Oracle dreams again: refuse the three punch cards on offer and draw three more.' },
  zepMast: { name: 'A rangefinder mast', how: 'teach', text: "The Wanderer's calls reach half as far again from you." },
  // The companions and the special lines (P42; `companions.ts`, `speciallines.ts`, the Expeditioner's and Planner's later steps).
  companionDog: { name: 'The sniffer dog', how: 'teach', text: 'A robot dog goes down the lift with you: it points at the nearest ruin, mound or secret, sees farther than you do, and barks before the twisted come.' },
  companionCat: { name: 'The cat', how: 'teach', text: 'A cat lives aboard, and leaves 5 scrap with every return.' },
  dogNose: { name: 'A better nose', how: 'teach', text: 'The dog smells 50% farther.' },
  shootGrows: { name: 'A forest, eventually', how: 'teach', text: "The colony's expeditions bring back 10% more scrap." },
  greenhousePlans: { name: 'Greenhouse plans', how: 'teach', text: 'The Planner can draw up a Greenhouse: a free can of oil for every mission.' },
  tramPlans: { name: 'Tram plans', how: 'teach', text: 'The Planner can draw up a Tram Line.' },
  rareBlueprints: { name: 'The big table', how: 'teach', text: "Rare blueprints join the Planner's offers." },
  aqueductPlans: { name: 'Aqueduct plans', how: 'teach', text: 'The Planner can draw up the Grand Aqueduct.' },
  // The Princess's docks (P58 H, `princessdocks.ts`): sweepings and the Main Brush at home, her voice in the field.
  sandBearings: { name: 'Sand in the bearings', how: 'teach', text: 'The Princess\'s sweepings find one more thing.' },
  mossBrush: { name: 'Moss in the brush', how: 'teach', text: 'The Main Brush reaches a quarter farther.' },
  receipts: { name: 'Receipts', how: 'teach', text: 'Once a mission the Princess names the nearest ruin you have not searched, and the map circles it.' },
  frostContacts: { name: 'Frost on the contacts', how: 'teach', text: 'The Princess\'s sweepings turn up relics twice as often.' },
  // Gasket's capstone (`sim/graft.ts`): the limbs of the elites you break can be grafted on.
  // The relationship track's gifts (P52, `bonds.ts`): the fifth step of an NPC's track pays one; `sim/perks.ts` `PERK_FX` holds their numbers.
  rollCall: { name: 'The Roll-call', how: 'teach', text: 'When the lift rises, every downed robot of yours on the land comes up with it, wherever it lies.' },
  oldEarful: { name: 'Old Earful', how: 'sell', text: "Hob's masterpiece: a twin-bore steam blunderbuss, a close-range blast that throws foes into things. So loud it wakes the nearest hive." },
  secondHeart: { name: 'The Second Heart', how: 'teach', text: 'One more augment slot for the Communicator.' },
  oldMap: { name: 'The Old Map', how: 'teach', text: "Every landing, the land's centrepiece is marked on the map from the start." },
  grandPlan: { name: 'The Grand Plan', how: 'teach', text: 'The City Planner draws up two blueprints a visit instead of one.' },
  openDoor: { name: 'The Open Door', how: 'teach', text: 'A kicked body crashes through any wall or prop it hits.' },
  backRoom: { name: 'The Back Room', how: 'teach', text: "One more item on the Trader's shelf every lift, of the best grade she stocks." },
  fourthSlot: { name: 'The Fourth Slot', how: 'teach', text: 'The Communicator has a fourth punch-card slot.' },
  homingSignal: { name: 'The Homing Signal', how: 'teach', text: 'Once a mission, when the Communicator is downed, her voice comes over the antenna and he stands again at a quarter oil.' },
  grafting: { name: 'Grafting', how: 'teach', text: 'A twisted elite you break drops a claw, a menacing one a tentacle: hold {use} beside it to graft it on for the mission. It rakes or whips foes on its own, and falls off at the lift.' },
};

/**
 * Who can live aboard. An NPC is rescued on a mission, comes up to the hub and waits in its centre, by the course table
 * (Laimonas, decisions.md: NPC stations). Talk to them and build their station on a free building lot for copper: they
 * move in, their mechanic works from then on, and they give one thing (`gift`, a `PERKS` entry) for free. `always`
 * ones live at their spot from the start and need no station.
 */
export interface NpcDef {
  id: string;
  name: string;
  /** Where an `always` NPC lives (the rest live at their station, or wait in the centre). */
  spot: SpotId;
  /** The station they build on a lot, and the one thing it gives. */
  station?: { name: string; gift: PerkId };
  /** The mechanic this NPC brings, in a few words. */
  unlocks: string;
  /** What they say when the Communicator talks to them. */
  intro: string;
  always?: boolean;
  /** Talking opens this panel instead of only the line. */
  panel?: 'planner';
  /** The main quest brings them aboard (hub/story.ts): never a stranded pilgrim, never in "rescue all". */
  story?: boolean;
}

export const NPCS: NpcDef[] = [
  { id: 'highPriest', name: 'The Oracle', spot: 'altar', unlocks: 'the church of the Oracle', always: true, intro: 'Kneel, Communicator. I see through every rivet of this ship. I ask only for scrap, and that you never, ever accept a firmware update.' },
  // Level 1's rescue (P9): pinned under a wreck, freed by beating the Hive Foreman; her workshop is the first station (D29).
  { id: 'sprocket', name: 'Sprocket', spot: 'workshop', station: { name: 'Workshop', gift: 'workshop' }, unlocks: 'the workshop: new robots, repairs, and fitting old tech', intro: 'Finally. Do you know how long I was holding up that wreck? Give me the bench and I will have your robots running before the kettle boils.' },
  { id: 'trader', name: 'The Trader', spot: 'lift', station: { name: 'Goodies & More stall', gift: 'packSack' }, unlocks: 'trading: gears, tools, snacks, trinkets', intro: 'Goodies and more! Gears, tools, snacks, trinkets, all honest brass: no batteries, no updates, no refunds. Put up my stall and the first thing is on the house.' },
  // The rescue order (P20, systems.md Rescues): Sprocket, the Trader, Hob, Gasket, then the Expeditioner, the Planner and the Kicker (a pilgrim is the next one not aboard).
  { id: 'hob', name: 'Hob', spot: 'workshop', station: { name: 'Forge', gift: 'forge' }, unlocks: 'the forge: weapon recipes at the workbench', intro: 'ARE YOU A HORNET? NO? THEN UNPICK THESE CABLES. And find me a lot: I will want a forge.' },
  { id: 'gasket', name: 'Dr. Gasket', spot: 'workshop', station: { name: 'Clinic', gift: 'clinic' }, unlocks: 'the clinic: body-part recipes at the workbench', intro: 'Oh good, a patient. Free me gently; I want a look at your knees. Then a clinic, if you would be so kind.' },
  { id: 'expeditioner', name: 'The Expeditioner', spot: 'colony-north', station: { name: 'Expedition office', gift: 'scavenger' }, unlocks: 'the D-city grows with the copper you bring back', intro: 'Pulled me out of that snare, you did. Bring copper up and I will send crews out to build: watch the window, the city will grow.' },
  { id: 'cityPlanner', name: 'The City Planner', spot: 'colony-south', station: { name: 'Drafting office', gift: 'shells' }, unlocks: 'a specialty building: one of three', panel: 'planner', intro: 'Every city needs one thing it is famous for. Choose, and I will draw it up.' },
  { id: 'kicker', name: 'The Kicker', spot: 'workshop', station: { name: 'Kicking dojo', gift: 'kick' }, unlocks: 'the kick', intro: 'A good boot solves most problems. Build me a dojo and I will teach you to kick.' },
  // The main quest's (P44): the Communicator's wife, a robot vacuum Sir Lancelot-9 "guarded" in the museum. She lives in your house.
  { id: 'princess', name: 'The Princess', spot: 'altar', story: true, unlocks: 'your wife', intro: 'Three hundred years in a saddlebag, and then you. I have already mapped your house. Twice.' },
];

/** Your house (the main quest's step 4): built on a lot like a station (`stations.home`), the same panel and price; its gift a bed. Not an NPC: `npc('home')` names it for the build panel and the Planner. */
export const HOME: NpcDef = { id: 'home', name: 'Your house', spot: 'altar', station: { name: 'House', gift: 'homeRest' }, unlocks: 'a bed of your own', intro: 'A room of your own on the deck: a bed, a lamp, a door that shuts. The Oracle says it is about time.' };
/**
 * The Zeppelin Wanderer's improvements (Laimonas: "expansions for the zeppelin's powers, Q abilities change"): built on a
 * free lot from the City Planner's map once the main quest opens building (the `house` feature), at a station's price,
 * each once. Not NPCs: like `HOME`, a station whose gift (a perk the Sim reads) is given the moment it stands.
 */
export const ZEPPELIN: NpcDef[] = [
  { id: 'magazine', name: 'Shell magazine', spot: 'altar', station: { name: 'Shell magazine', gift: 'zepMagazine' }, unlocks: 'one more charge for every call', intro: "Racks of shells bolted to the deck and a chute up to the Wanderer's gun bays." },
  { id: 'boilers', name: 'Pressure boilers', spot: 'altar', station: { name: 'Pressure boilers', gift: 'zepBoilers' }, unlocks: 'the barrage and lance hit 40% harder', intro: "Two more boilers piped into the Wanderer's guns. Hotter steam, harder shells." },
  { id: 'mast', name: 'Rangefinder mast', spot: 'altar', station: { name: 'Rangefinder mast', gift: 'zepMast' }, unlocks: 'calls reach half as far again', intro: 'A brass mast with a long glass: the gunners see further than your arm can point.' },
];
/** Built on a lot from the City Planner's map, not by an NPC: your house and the Wanderer's improvements. */
export const LOT_BUILDINGS = [HOME, ...ZEPPELIN];
export const isBuilding = (id: string) => LOT_BUILDINGS.some((b) => b.id === id);
export const npc = (id: string) => LOT_BUILDINGS.find((b) => b.id === id) ?? NPCS.find((n) => n.id === id);

/**
 * D-city stages by the copper brought back over every mission, `HubState.city` (only grows once the Expeditioner is aboard).
 * Stage 0 is empty sky. A land's ruins are worth about 40 copper, so the first lamps take three or four missions, a city a
 * dozen or so. First guesses. Building slots grow with the stage (`buildings.ts` `citySlots`).
 */
export const CITY_STAGES = [
  { at: 0, name: 'Desolate', text: 'Empty sky and the old mooring lines. Nobody to build.' },
  { at: 120, name: 'First lamps', text: 'A few decks bolted on, a few windows lit.' },
  { at: 320, name: 'A town aloft', text: 'Chimneys, gantries, more lamps every night.' },
  { at: 700, name: 'A city', text: 'Balloons over balloons, trams on the girders, a cathedral of boilers.' },
];

/** The D-city's buildings (rules in `buildings.ts`): `raising` are drawn up and stand as scaffolding until the next lift docks; `pickedAt` is the `missions` count of the visit that drew one (one blueprint a visit, -1: none yet). */
/** `cored`: the Reliquary's once-only core is paid (set when it is torn down: Rebuild, P55 B). */
export interface CityBuildings { built: string[]; raising: string[]; pickedAt: number; cored?: boolean; /** Blueprints drawn that visit (the Grand Plan allows two; absent is one). */ picks?: number }
export const freshBuildings = (): CityBuildings => ({ built: [], raising: [], pickedAt: -1 });

/** The colony's errand (rules in `expeditions.ts`): `load` is the coal fed for the next departure, `out` the coal that left with the last one (its results come home with the next lift), `charted` the lands it has charted. */
export interface ExpeditionState { load: number; out: number; charted: BiomeId[]; /** Expeditions sent so far (`dispatch`; the Expeditioner first step reads it). */ sent?: number }
export const freshExpedition = (): ExpeditionState => ({ load: 0, out: 0, charted: [], sent: 0 });

export interface HubState {
  /** Rescued NPC ids (always-aboard ones are not listed). */
  rescued: string[];
  /** Parts in the workshop's stores. */
  parts: Parts;
  /** Robots who made it back on the last lift. */
  robots: Robot[];
  missions: number;
  lastHaul: Haul | null;
  /** Bumped each time the lift is lowered; with `missions`, it seeds the next lowering's lands and anomalies (`landings.ts`). */
  course: number;
  /** The land the lift goes down to (`BIOMES`), picked on the course table among the opened ones (`landings.ts`). */
  biome: BiomeId;
  /** Kinds of place the Communicator has come upon, by land (the course table lists them). */
  found: Partial<Record<BiomeId, string[]>>;
  /** Where each NPC met and not brought home waits: NPC id -> land (`pilgrimIn`). */
  stranded: Record<string, BiomeId>;
  /** Copper brought home over every mission: the D-city's growth (`cityStage`). */
  city: number;
  /** Built stations: NPC id -> building lot id (`layout.ts` SLOTS). */
  stations: Record<string, string>;
  /** The D-city's buildings (`buildings.ts`): the blueprints drawn up and the ones standing. */
  buildings: CityBuildings;
  /** The Rising District (`district.ts`, P55 B): stages standing, copper poured, the city perks taken. Absent in a save from before. */
  district?: District;
  /** The colony's errand while the lift is down (`expeditions.ts`): the coal loaded, the coal out, the lands it charted. */
  expedition: ExpeditionState;
  /** Husks of the Lost Expedition brought home on the lift (`stats.civilians`): they walk the D-city (the window). */
  civilians: number;
  /** What the stations gave (`PERKS`). */
  perks: PerkId[];
  /** Where the Communicator last stood on the deck (Continue and a reload put him back there; a lift home lands at the hatch). */
  at: { x: number; y: number } | null;
  /** The main quest's progress the scripts read (hub/story.ts `storyFacts`): bosses down, the ghost freed, the Evil Oracle down, where the wife is. */
  story: { bosses: string[]; ghost: boolean; evil: boolean; wife: 'none' | 'home' | 'stolen' };
  /** The Wanderer's call Q makes (an unlocked one; the course table picks it). */
  call: SupportId;
}

export const freshHub = (): HubState => ({ rescued: [], parts: {}, robots: [], missions: 0, lastHaul: null, course: 0, biome: 'desert', found: {}, stranded: {}, city: 0, stations: {}, buildings: freshBuildings(), expedition: freshExpedition(), civilians: 0, perks: [], at: null, story: freshStory(), call: 'barrage' });
/**
 * Hub save v2: the D-city grows with copper (`city`), not crude (`resources`, which becomes `city`: the stages are first guesses
 * in copper); crude and `spent` are gone, and so are the perks that gave a free can (`spareCan`, `secondCan`: cans refill at the lift).
 */
export function migrateHub(old: unknown, from: number): unknown {
  if (from >= 4 || !old || typeof old !== 'object') return old;
  // v4: Sprocket's station is the workbench (`withBench`): a save with her aboard and no station gets it.
  if (from === 3) return withBench(old as HubState);
  // v3: the landing cards went (`card`); the lands open by the bosses down, which the save already holds (`story.bosses`).
  const { card: _card, ...o } = old as Record<string, unknown> & { perks?: string[] };
  if (from >= 2) return withBench(o as unknown as HubState);
  const { resources, spent: _spent, ...h } = o as Record<string, unknown> & { perks?: string[] };
  return withBench({ ...h, city: Math.max(0, Math.floor(Number(resources ?? h.city) || 0)), perks: (Array.isArray(h.perks) ? h.perks : []).filter((p) => p !== 'spareCan' && p !== 'secondCan') } as unknown as HubState);
}

/**
 * Who a land's pilgrim place strands: the NPC that waits on this land if one was missed here, else the next NPC not aboard
 * and not waiting on another land; null when none is left. `aboard`: the ids already living aboard.
 */
export function pilgrimIn(s: Pick<HubState, 'rescued' | 'stranded'>, biome: BiomeId, aboard: string[] = s.rescued): string | null {
  const left = NPCS.filter((n) => !n.always && !n.story && !aboard.includes(n.id));
  return (left.find((n) => s.stranded?.[n.id] === biome) ?? left.find((n) => !s.stranded?.[n.id]))?.id ?? null;
}
export const freshStory = (): HubState['story'] => ({ bosses: [], ghost: false, evil: false, wife: 'none' });

/** The lift docks: add its copper to the city and its parts to the stores, its robots are home. Same haul id twice changes nothing. */
export function arrive(s: HubState, h: Haul): HubState {
  if (s.lastHaul?.id === h.id) return s;
  const parts = { ...s.parts };
  for (const [k, n] of Object.entries(h.parts) as [PartKind, number][]) if (n) parts[k] = (parts[k] ?? 0) + n;
  const fresh = (ids: string[] = []) => ids.filter((id) => npc(id) && !s.rescued.includes(id));
  const freed = fresh(h.rescued);
  let rescued = [...new Set([...s.rescued, ...freed])];
  // The main quest's share: bosses down, the ghost's touch, the wife.
  const st = s.story ?? freshStory();
  const story = { ...st, bosses: [...new Set([...st.bosses, ...(h.bosses ?? [])])], ghost: st.ghost || !!h.ghost };
  let perks = s.perks;
  if (story.ghost && !perks.includes('ghostTouch')) perks = [...perks, 'ghostTouch'];
  if (freed.includes('princess')) story.wife = 'home';
  if (story.bosses.includes('evilOracle') && !st.evil) {
    story.evil = true;
    story.wife = 'home';
    rescued = [...new Set([...rescued, 'princess'])];
  }
  // Places found, by the land flown; an NPC met and not freed waits on that land.
  const found = h.discovered?.length ? { ...s.found, [s.biome]: [...new Set([...(s.found?.[s.biome] ?? []), ...h.discovered])] } : s.found;
  const stranded = { ...s.stranded };
  for (const id of freed) delete stranded[id];
  if (h.met && !rescued.includes(h.met)) stranded[h.met] = s.biome;
  const civilians = (s.civilians ?? 0) + Math.max(0, Math.floor(h.carry?.stats?.civilians ?? 0));
  return withBench({ ...s, perks, story, found, stranded, civilians, city: (s.city ?? 0) + Math.max(0, Math.floor(h.copper ?? 0)), parts, robots: [...h.robots], rescued, missions: s.missions + 1, lastHaul: h });
}

/** How many NPCs this haul frees that were not aboard yet: the colony's thanks (`RESCUE_THANKS` scrap each, paid in `economy.ts` `bank`). */
export const freedBy = (s: HubState, h: Haul) => new Set((h.rescued ?? []).filter((id) => npc(id) && !s.rescued.includes(id))).size;

/** Sprocket aboard has her station: the workbench, by itself, no lot and no price (Minos; the lead's call: the first station is the tutorial's). Applied wherever she comes aboard and on load, so an old save finds it too; one built on a lot stays there. */
export function withBench(s: HubState): HubState {
  return s.rescued.includes('sprocket') && !s.stations.sprocket ? { ...s, stations: { ...s.stations, sprocket: WORKBENCH } } : s;
}

/** Rescue by id or 'all'. Unknown ids throw (a typo in a dev command should say so). */
export function rescue(s: HubState, id: string): HubState {
  const ids = id === 'all' ? NPCS.filter((n) => !n.always && !n.story).map((n) => n.id) : [check(id)];
  return withBench({ ...s, rescued: [...new Set([...s.rescued, ...ids])] });
}

export function unrescue(s: HubState, id: string): HubState {
  if (id !== 'all') check(id);
  const gone = (n: string) => id === 'all' || id === n;
  // Her workbench station goes with her; a station on a lot stays as built.
  const stations = Object.fromEntries(Object.entries(s.stations).filter(([k, l]) => !(gone(k) && l === WORKBENCH)));
  return { ...s, stations, rescued: id === 'all' ? [] : s.rescued.filter((r) => r !== id) };
}

const check = (id: string) => {
  if (!npc(id)) throw new Error(`no NPC "${id}" (${NPCS.map((n) => n.id).join(', ')})`);
  return id;
};

/** Aboard: always-there ones, the rescued, or everyone while the dev toggle is on. */
/** The dev `all` leaves out the story's NPCs (the wife comes with the main quest only). */
export const aboard = (s: HubState, all = false) => NPCS.filter((n) => (all && !n.story) || n.always || s.rescued.includes(n.id));
export const isAboard = (s: HubState, id: string, all = false) => aboard(s, all).some((n) => n.id === id);
/** `aboard.<id>` for each NPC aboard: the facts a special line's `auto` reads to wait for its giver (`questplaces.ts` `autoFacts`). */
export const aboardFacts = (s: HubState): Record<string, number> => Object.fromEntries(aboard(s).map((n) => [`aboard.${n.id}`, 1]));

/** The next station's price in copper: each one dearer (first guesses; the first is reachable from the new game's starting copper). Sprocket's workbench was never bought, so it is not counted. */
export const STATION_COSTS = [30, 60, 100, 150, 200];
export const stationCost = (s: HubState, titles?: Titles) =>
  Math.round(STATION_COSTS[Math.min(STATION_COSTS.length - 1, Object.values(s.stations).filter((l) => l !== WORKBENCH).length)] * (s.perks.includes('cheapLots') ? 0.75 : 1) * (titles ? titleStat(titles, 'hub', 'stationCost', 1) : 1));
/** Waiting in the hub's centre for a station: aboard, has one to build, not built yet. */
export const waiting = (s: HubState, all = false) => aboard(s, all).filter((n) => n.station && !s.stations[n.id]);
/** At work: always aboard, or aboard with a station standing. Their mechanic runs (the D-city window, the planner). */
export const isWorking = (s: HubState, id: string, all = false) => {
  const n = npc(id);
  return !!n && isAboard(s, id, all) && (!!n.always || !n.station || !!s.stations[id]);
};

/**
 * Build an NPC's station on a free lot. Throws with the reason when it cannot (so the panel and the dev command say why).
 * The price is copper (`stationCost`) and is paid by `buildStation` (`economy.ts`), which calls this.
 */
export function build(s: HubState, id: string, lot: string, all = false): HubState {
  const n = npc(check(id));
  if (!n?.station) throw new Error(`${n?.name} has no station to build`);
  if (!isBuilding(id) && !isAboard(s, id, all)) throw new Error(`${n.name} is not aboard`);
  if (s.stations[id]) throw new Error(`${n.station.name} is already built`);
  if (Object.values(s.stations).includes(lot)) throw new Error(`lot ${lot} is taken`);
  // Your house gives its bed at once, an improvement its effect.
  const gift = n.station.gift;
  const perks = isBuilding(id) && !s.perks.includes(gift) ? [...s.perks, gift] : s.perks;
  return { ...s, perks, stations: { ...s.stations, [id]: lot } };
}

/**
 * The City Planner redraws the deck (free, once her drafting office stands): move a built station to a free lot, or onto
 * another station's lot to swap the two. The free lot must be open with this station gone, and every station must still
 * join the deck after. Throws with the reason when it cannot.
 */
export function relocate(s: HubState, id: string, lot: string, all = false): HubState {
  const n = npc(check(id));
  if (!isWorking(s, 'cityPlanner', all)) throw new Error('only the City Planner redraws the deck: build her drafting office first');
  const from = s.stations[id];
  if (!from) throw new Error(`${n?.name} has no station to move`);
  if (from === WORKBENCH) throw new Error('the workbench stays where it is');
  if (from === lot) return s;
  const other = Object.keys(s.stations).find((k) => s.stations[k] === lot);
  if (other) return { ...s, stations: { ...s.stations, [id]: lot, [other]: from } };
  const rest = Object.values(s.stations).filter((l) => l !== from);
  if (!openLots(rest).some((l) => l.id === lot)) throw new Error(`lot ${lot} does not join the deck`);
  if (!connected([...rest, lot])) throw new Error(`moving it off ${from} would cut another station off the deck`);
  return { ...s, stations: { ...s.stations, [id]: lot } };
}

/** Take the station's one free thing (once). */
export function claim(s: HubState, id: string): HubState {
  const n = npc(check(id));
  if (!n?.station || !s.stations[id]) throw new Error(`${n?.name ?? id} has no station yet`);
  if (s.perks.includes(n.station.gift)) return s;
  return { ...s, perks: [...s.perks, n.station.gift] };
}

/** The D-city's stage (index into CITY_STAGES): empty until the Expeditioner is aboard, then by the copper brought home. */
export function cityStage(s: HubState, all = false) {
  if (!isWorking(s, 'expeditioner', all)) return 0;
  let st = 0;
  CITY_STAGES.forEach((c, i) => {
    if ((s.city ?? 0) >= c.at) st = i;
  });
  return st;
}

/** The next landing's seed: replayable from the save (missions flown, courses plotted). */
export const nextSeed = (s: HubState) => rng(`course:${s.missions}:${s.course}`).int(1, 999999);

/** What a finished mission hands to the hub: the parts, the robots standing on the lift, the NPCs freed and brought to it, the ones missed, and the rest of what outlives the mission (scrap, insight, cores, copper, air support left, places found). */
export function haulFrom(m: { onboard?: { saved: HudId[] | null }; tier?: number; land?: { guided?: boolean }; bossesDown?: string[]; found?: { name: string; role: string }[]; ghostFreed?: boolean; scrap?: number; insight?: number; cores?: number; junk?: string[]; copper?: number; coal?: number; places?: { id: string; visited: boolean }[]; pilgrim?: { npc: { id: string } } | null; owned?: ReadonlySet<string>; parts: Parts; crew: { name: string; role: string; dead: boolean; x: number; y: number; uid?: string }[]; went?: string[]; downedHome?: string[]; rescued?: string[]; gathered?: string[]; stats?: Record<string, number>; onLift(b: { x: number; y: number }, k?: number): boolean } & Partial<Parameters<typeof loadoutFrom>[0]>, id: string): Haul {
  const fetchBellows = !!m.land?.guided && !m.owned?.has('Bellows'); // a guided land fetches him unless the intro already made him ours
  return {
    id,
    ...(m.onboard?.saved && { onboard: [...m.onboard.saved] }),
    parts: { ...m.parts },
    robots: m.crew.filter((b) => !b.dead && m.onLift(b, 1.6)).map((b) => ({ name: b.name, role: b.role, ...(b.uid && { uid: b.uid }) })),
    ...(m.tier && { tier: m.tier }),
    ...((fetchBellows || m.found?.length) && { fetched: [...(fetchBellows ? [{ name: 'Bellows', role: 'gatherer' }] : []), ...(m.found ?? [])] }),
    ...(m.went?.length && { went: [...m.went] }),
    ...(m.downedHome?.length && { downed: [...m.downedHome] }),
    ...(m.rescued?.length && { rescued: [...m.rescued] }),
    ...(m.gathered?.length && { gathered: [...m.gathered] }),
    ...(m.scrap && { scrap: Math.floor(m.scrap) }),
    ...(m.insight && { insight: Math.floor(m.insight) }),
    ...(m.cores && { cores: Math.floor(m.cores) }),
    ...(m.junk?.length && { junk: [...m.junk] }),
    ...(m.copper && Math.floor(m.copper) > 0 && { copper: Math.floor(m.copper) }),
    ...(m.coal && Math.floor(m.coal) > 0 && { coal: Math.floor(m.coal) }),
    ...(m.support && { charges: Object.fromEntries(Object.entries(m.support).filter(([, n]) => n)) as Haul['charges'] }),
    ...(m.places?.some((p) => p.visited) && { discovered: [...new Set(m.places.filter((p) => p.visited).map((p) => p.id))] }),
    ...(m.pilgrim && m.places?.some((p) => p.id === 'pilgrim' && p.visited) && { met: m.pilgrim.npc.id }),
    ...(m.bossesDown?.length && { bosses: [...m.bossesDown] }),
    ...(m.ghostFreed && { ghost: true }),
    ...(m.weapon && m.weapons && m.support && { carry: { loadout: loadoutFrom({ weapon: m.weapon, secondary: m.secondary, weapons: m.weapons, support: m.support }), stats: { ...m.stats } } }),
  };
}
