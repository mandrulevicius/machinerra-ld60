/**
 * A mission: the Communicator and their robots on a generated land (or down a dungeon), with the Oracle's guidance.
 * Plain TS, no Phaser: Play.ts draws it and turns `events` into effects.
 * The lift can be ridden at any time, for nothing: nothing forces you to leave, and there is no quota.
 * The Oracle only suggests it, and what you stay for pays: loot grows richer with the clock.
 * Scrap comes from kills; ruins give copper and junk; gatherers strip ruins and mine coal.
 *
 * `Sim` holds the state (fields), the constructor, the unit and engine layer (gear, sources, statuses), the crews and
 * their orders, the queries the scene asks, and `step()`, which runs the systems in order.
 * Each system is a module of functions that take the sim: foes, combat, boss, downed, use, coal, loot, support, oracle,
 * controller, followers (and the older ones: spider, tiers, junkplay, botai, placeplay, dungeon).
 * A system's functions that the scene or the tests call are one-line delegates at the end of the class.
 * Each system with state to show has an `xSummary(sim)` that `summary()` lists.
 */

import { makeVoice, voiceStep, type Voice } from './princessvoice';
import { dockStep } from './docks';
import { graftLift, graftStep, graftSummary, type Graft, type Worn } from './graft';
import {
  type Rng,
  rng,
} from '../../../../harness/kit/rng';
import {
  bossSummary,
  spawnBoss,
} from './boss';
import {
  aiSummary,
  act as botAct,
  noteOrder,
} from './botai';
import { noCity, type CityFx } from '../hub/buildings';
import { skillStep, skillSummary, soleTrail } from './botskills';
import { stokeSource } from './stoke';
import { noCards, type CardSources } from '../hub/research';
import { rankStats } from './bots';
import {
  type AnomalyFx,
  type BerserkMul,
  type DayPhase,
  type DayState,
  anomalyFx,
  berserkMul,
  clockText,
  dayCfg,
  dayState,
  timeOf,
  withAnomaly,
} from './clock';
import {
  coalSummary,
  jobFor,
  mine,
  ruinToStrip,
  seamNear,
  strip,
  tapStep,
} from './coal';
import {
  damageHornet,
  fire,
  foeHit,
  hurt,
  onOut,
  shoot,
} from './combat';
import {
  controlled,
  controllerSummary,
  dash,
  skill,
} from './controller';
import { type HuntState, clockStep, huntState } from './dayplay';
import { type WeatherWorld, weatherInit, weatherStep, weatherSummary, weatherWorld } from './weather';
import { blizzardSight, type TwistWorld, twistStep, twistSummary, twistWorld } from './twists';
import { beastSummary } from './beasts';
import { rushHours, type Rush } from './commute';
import { BISCUIT, type QuestOpts, freshQuestOpts, questStep } from './questcount';
import { carryStep, downedSummary, slowScale, slowStep } from './downed';
import {
  type AnomalyId,
  BARKS,
  BERSERK,
  BIOMES,
  type BarkWhen,
  type BiomeDef,
  type BiomeId,
  COAL,
  CREWS,
  DAY,
  type Enemy,
  HORNET,
  LOOT,
  MISSION,
  NEST,
  type PartKind,
  REVIVE,
  ROLES,
  RUIN_FINDS,
  type Role,
  START_CREW,
  STEAM,
  SUPPORT,
  SUPPORT_START,
  type SupportId,
  T,
  TAP,
  TWISTS,
  TYPE_WRECK,
  WEAPONS,
  type WeaponId,
  bossOf,
  insightFromRuins,
} from './defs';
import {
  type DungeonDef,
  DungeonRun,
  type DungeonSpec,
  type Tier,
  type Twist,
  clampTier,
  dungeonDef,
  generateDungeon,
  specFor,
} from './dungeon';
import {
  Effects,
  type Source,
} from './effects';
import {
  auraOf,
  auras,
  flowStep,
  fly,
  foeShot,
  foeSummary,
  hives,
  setTier,
  setUnder,
  slay,
  spawnHornet,
  twist,
  wake,
} from './foes';
import {
  followStep,
  followersSummary,
  freeGhost,
} from './followers';
import { DOG_NOSE, dogHome, dogStep, dogSummary, makeDog, type Dog } from './companions';
import {
  type CrewRole,
  type Gear,
  type GearSources,
  type SkillId,
  type Stats,
  freshGear,
  gearCans,
  gearSources,
  loneWeaponSource,
  slotWeapons,
  statsSource,
} from './gear';

/** Pressure Cooker's "under 30% steam" (systems.md Old research): the share of the bar under which the Communicator is tagged `steamLow`. */
const STEAM_LOW = 0.3;
/** Dead Man's Lamp: how far a downed robot's lamp reaches (px; a guess). */
const DEAD_LAMP = 110;
import { dist } from './geom';
import {
  type RelicId,
  relicSource,
} from './junk';
import {
  type JunkWorld,
  junkStep,
  junkWorld,
  relicThink,
} from './junkplay';
import {
  type Loadout,
  type Slot,
  equip,
  freshLoadout,
} from './loadout';
import {
  drop,
  dropCore,
  lootChance,
  lootSummary,
  pickups,
  restLoot,
} from './loot';
import { freshLugs, lugSummary, modsStep, setFitted, type LugState } from './mods';
import {
  type MapData,
  type Spot,
  Ter,
  generate,
  passable,
} from './mapgen';
import {
  GHOST_TOUCH,
  STATUS_AI,
  UNTOUCHABLE,
  missionTitles,
  typeMul,
} from './missionfx';
import { newFog, landSignals, type Fog, type Signal } from './fog';
import { fogStep, fogSummary, oldMap } from './fogplay';
import {
  dungeonLines,
  oracle,
  say,
} from './oracle';
import {
  CLIMB,
  astar,
  clearLine,
  climbable,
} from './path';
import { PERK_FX } from './perks';
import { crashStep } from './crash';
import { type MissionMods, carryPropStep, freshMods, wakeNear } from './placeparts';
import { type PropWorld, addProp, flatten, propStep, propSummary, propWorld } from './props';
import {
  type Pilgrim,
  type PlaceRT,
  makePlace,
} from './placeplay';
import type { PlaceId } from './places';
import { Onboard } from './onboard';
import { Lessons, gates, lessonStep } from './lessons';
import { tapOf } from './sites';
import { makeIntro, type IntroRun } from './intro';
import {
  type SpecId,
  sourcesOf,
} from './specs';
import {
  type SpiderWorld,
  edgeArrivals,
  spiderSummary,
  spiderWorld,
} from './spider';
import { grubSummary } from './caterpillar';
import {
  type Strike,
  callSupport,
  supportStep,
  supportSummary,
} from './support';
import {
  type TierWorld,
  cutMul,
  patchStep,
  tierSummary,
  tierWorld,
} from './tiers';
import type {
  Bot,
  CrewBot,
  Follower,
  Hornet,
  Input,
  Loot,
  Nest,
  Phase,
  Rest,
  Ruin,
  Seam,
  Seep,
  Shot,
  SimEvent,
  SimOptions,
  Trail,
  UseAction,
} from './types';
import {
  decodeProgress,
  decoding,
  inPlace,
  placeUse,
  placesStep,
  pressUse,
  rides,
  ruinNear,
  stripSize,
  triggerPlace,
  useSummary,
} from './use';

export * from './types';

export class Sim {
  readonly map: MapData;
  readonly W: number;
  readonly H: number;
  readonly r: Rng;
  readonly lift: Spot;
  time = 0;
  phase: Phase = 'mission';
  /** Live-tunable rules (the dev sidebar's Tuning block writes these through Play). */
  cfg = {
    steamShot: STEAM.shot,
    steamRegen: STEAM.regen,
    swarm: 1,
    /** The morning's hive: a multiplier on its ramp (`DAY.morningStart`); 0 is a quiet morning (level 1). The day's off-map arrivals' multiplier is `edge`. */
    morningSwarm: 1,
    edge: 1,
    hornetSpeed: HORNET.speed,
    lootChance: LOOT.chance,
    eliteChance: HORNET.elite.chance,
    berserk: {
      dmg: BERSERK.dmg,
      speed: BERSERK.speed,
      hp: BERSERK.hp,
      cd: BERSERK.cd,
      spawn: BERSERK.spawn,
      spawnFloor: BERSERK.spawnFloor,
    },
    ...dayCfg(),
  };
  ruins: Ruin[] = [];
  /** Everything that breaks (`props.ts`): walls, debris, crates, the effect props, and the zones and drinks they leave. */
  props!: PropWorld;
  /** The carry strip (`junk.ts`): relics found this mission, banked at home in the haul. */
  junk: RelicId[] = [];
  /** The relics' timers, slugs in the air and marks (`junkplay.ts`). */
  readonly junkw: JunkWorld = junkWorld();
  junkR?: Rng;
  /** Seconds left of the Communicator being down (0 = up and about), and how it ends: a revive in place or the winch. */
  downT = 0;
  downKind: 'revive' | 'winch' | 'homing' | 'respawn' = 'winch';
  /** Real seconds left of the revive's slowed time (`slowStep`) and of his standing there before he acts again (`REVIVE`). */
  slowT = 0;
  standT = 0;
  /** Seconds of grace after a revive (the `grace` status; setting it applies or ends it). */
  get graceT() {
    return this.engine.status(this.controller, 'grace')?.left ?? 0;
  }
  set graceT(t: number) {
    if (t > 0) this.engine.apply(this.controller, 'grace', { duration: t });
    else this.engine.strip(this.controller, 'grace');
  }
  /** Oil in the reserve (`REVIVE`): cans picked up beyond what the bar holds. */
  reserve: number = REVIVE.start;
  /** Level 1: the guaranteed first can has dropped (`hornetDown`). */
  firstCan = false;
  /** Cans the pack holds beyond `REVIVE.cans`: the hub's (the Oracle's capstone: `hub/economy.ts` `capExtraOf`, set after `new Sim`) and the gear's (`gearCans`, the Can Rack). */
  private capBase = 0;
  private gearExtra = 0;
  get capExtra() {
    return this.capBase + this.gearExtra;
  }
  set capExtra(n: number) {
    this.capBase = n;
  }
  get canCap() {
    return REVIVE.cap + Math.max(0, Math.floor(this.capExtra)) * REVIVE.cost;
  }
  /** Old research found this mission (`INSIGHT`): banked at home through the haul. */
  get insight() {
    return insightFromRuins(this.ruinsFound.live) + this.insightMore;
  }
  addInsight(n: number) {
    this.insightMore += Math.max(0, Math.floor(n));
  }
  /** Scrap comes aboard: from a kill's gob (a mule squeezes more out of it). */
  gainScrap(n: number) {
    this.scrap += Math.max(0, n) * this.engine.stat(this.controller, 'scrapRate', 1); // the Rising District's housing
  }
  /**
   * The lift goes down with what `depart` took from the stock (`hub/economy.ts`): `cans` replace the start can the Sim has on its own (tests, dev boots), and
   * `charges` are the unspent air support of the last mission, on top of this one's own. Call it once, right after `new Sim`.
   */
  carryIn(cans: number, charges: Partial<Record<SupportId, number>> = {}) {
    this.reserve = Math.min(this.canCap, Math.max(0, Math.floor(cans)) * REVIVE.cost);
    for (const id of Object.keys(this.support) as SupportId[]) this.support[id]! += Math.max(0, Math.floor(charges[id] ?? 0));
  }
  /** The spare oil still on the pack: the reserve less the can being poured in right now (it has already come off). Whole cans hang there; the HUD shows the fill. */
  get spare() {
    return this.reserve - (this.downT > 0 && this.downKind === 'revive' ? REVIVE.cost : 0);
  }
  get spareCans() {
    return Math.floor((this.spare + 1e-6) / REVIVE.cost);
  }
  /** Charges left of each D-city call unlocked (`SUPPORT`); a new mission refills them. */
  support: Partial<Record<SupportId, number>> = Object.fromEntries(SUPPORT_START.map((id) => [id, SUPPORT[id].charges]));
  /** The call in progress, if any. */
  strike: Strike | null = null;
  /** The authored places of this land (`placeplay.ts`), the stranded NPC if there is one to rescue, and the timed place action in progress (`hold`: the ring's view of `action`). */
  places: PlaceRT[] = [];
  pilgrim: Pilgrim | null = null;
  hold: { id: PlaceId; t: number; need: number; paused: boolean } | null = null;
  bots: Bot[] = [];
  hornets: Hornet[] = [];
  nests: Nest[] = [];
  seeps: Seep[] = [];
  /** What has been seen (`fogplay.ts`), the land's signals (rough areas, `fog.ts`), where the Communicator faces (radians) and the seconds to the next reveal. */
  fog!: Fog;
  signals: Signal[] = [];
  /** Signals the land keeps off the map until something shows them (level 1: the mast's decode). */
  signalsHeld: Signal[] = [];
  /** The signals as the land made them, kept while a Radar scope pins them to their spots (`radarSignals`). */
  private rough = new Map<string, Signal>();
  /** Until when the Oracle's last line is on the panel (the Static Antenna card listens), and the clock it counts on. */
  speakUntil = -1;
  /** The Princess on the antenna (P58, `princessvoice.ts`): null while she has never been home. */
  voice: Voice | null = null;
  /** The ruin her Receipts named (P58 H, `docks.ts`): the map pulses its ring until `until` (sim seconds). */
  ruinPing: { id: number; until: number } | null = null;
  facing = 0;
  fogT = 0;
  /** The land's coal seams (`COAL`), and the coal mined this mission (it comes home in the haul). */
  seams: Seam[] = [];
  coal = 0;
  coalMined = 0;
  shots: Shot[] = [];
  loot: Loot[] = [];
  /** Order point per crew (index 0 unused: crew 0 follows the Communicator). */
  orders: (Spot | null)[] = Array.from({ length: CREWS }, () => null);
  /** Crews 1.. that trail the Communicator like crew 0 (`follow`) until they get a point (`order`). */
  following: boolean[] = Array.from({ length: CREWS }, () => false);
  events: SimEvent[] = [];
  /** Oracle beats already said. */
  said = new Set<string>();
  /** Which HUD elements are up and the world's cues (`onboard.ts`). */
  onboard!: Onboard;
  /** What is taught by now and the Oracle's pauses (`lessons.ts`). */
  lessons!: Lessons;
  /** Counts of the mission, handed home with the haul. `deed.<type>.<counter>` are what each kind of bot did (`deed()`; the deeds' gauges fill from them, `hub/deeds.ts`). */
  stats: Record<string, number> = {
    killed: 0,
    kickKills: 0,
    crashKills: 0,
    crashes: 0,
    propsBroken: 0,
    ruinsBroken: 0,
    nests: 0,
    lost: 0,
    saved: 0,
    left: 0,
    gathered: 0,
    parts: 0,
    winched: 0,
    revived: 0,
    strikes: 0,
    ruins: 0,
  };
  /** `questcount.ts`: the Communicator's oil last step, and the oil he lost before the evening. */
  questHp?: number;
  questLost?: number;
  /** Bosses brought down this mission (the main quest counts them when the lift docks: `HubState.story`). */
  bossesDown: Enemy[] = [];
  /** Who follows the Communicator (`Follower`). */
  followers: Follower[] = [];
  /** The sniffer dog (P42, `companions.ts`): his own, or freed at the Kennel this mission. */
  dog: Dog | null = null;
  /** The Esteemed Ghost was freed this mission (the hub then keeps his touch as the `ghostTouch` perk). */
  ghostFreed = false;
  /** A stacking mission modifier (P36's Dinner Bell; `placeparts.ts`, L): spawns, elites and loot for the rest of the mission. */
  mods: MissionMods = freshMods();
  /** The call Q makes (picked at the course table, `HubState.call`); an unlocked one with charges. */
  call: SupportId = 'barrage';
  /** Hornet parts picked up, by kind. */
  parts: Partial<Record<PartKind, number>> = {};
  riseT = 0;
  /** Seconds an edge arrow still points at the lift: the Oracle just suggested it. */
  liftCue = 0;
  /** The Oracle has suggested the lift at least once. */
  advised = false;
  /** When the Oracle suggested the lift (`oracle.ts` `advise`), not yet answered: `questcount.ts` counts a ride within 20 s as heeded. */
  adviceAt: number[] = [];
  adviceHeeded = false;
  /** What the mission knows of the quest book (`questcount.ts` `QuestOpts`). */
  quest: QuestOpts;
  /** Seconds of star oil left: the clock stands still while it lasts (`drinkStarOil`). */
  oilT = 0;
  /** Dev: the Communicator takes no damage (a source that lets nothing land). */
  get god() {
    return !!this.engine.source(this.controller, 'god');
  }
  set god(on: boolean) {
    if (on) this.engine.addSource(this.controller, { ...UNTOUCHABLE, id: 'god', name: 'God mode' });
    else this.engine.removeSource(this.controller, 'god');
  }
  /**
   * The Communicator's two weapon slots: left click uses `weapon` (the primary, the shovel at the start), right click
   * `secondary` (free until a find fills it, `give`). `weapons` is every one found, this mission and the ones before.
   * All three are the persistent loadout (`hub/carry.ts`).
   */
  weapon: WeaponId = 'shovel';
  secondary: WeaponId | null = null;
  readonly weapons = new Set<WeaponId>(['shovel']);
  readonly controller: Bot;
  /** Mission seconds on the clock (`time` until a dev command moves it) and what they mean now: phase, hour, twist share, menace. */
  dayT = 0;
  day: DayState = dayState(0, this.cfg);
  /** A boss has come / has fallen. */
  bossSpawned = false;
  /** The morning's first hive has been woken (`clockStep`). */
  morningHive = false;
  bossDown = false;
  /** Whose fall `bossDown` is (the Oracle names it). */
  bossDownName = 'The queen';

  dayPhase: DayPhase = 'morning';
  twistT = 0;
  /** The berserk step last announced, and what the steps so far give a boss (`berserk(h)`). */
  stepSeen = 0;
  bzNow: BerserkMul = berserkMul(0);
  /** The hunter pack: when the next is due, and where it will come from (menace level 5, `dayplay.ts`). */
  hunt: HuntState = huntState();
  nextId = 1;
  private barkT = 0;
  seenSwarm = false;
  lastGatherer: Bot | null = null;
  /** Each robot's slow from the twisted halos this step (`auras`). */
  haloSlow: number[] = [];

  /** A handcrafted land's rules (`LandRules`), if this is one. */
  get land() {
    return this.map.rules;
  }
  /** Show the signals the land held back. */
  releaseSignals() {
    this.signals.push(...this.signalsHeld);
    this.signalsHeld = [];
  }

  /** Where the lift went down (`BIOMES`): its enemies, boss, places, day and pressure. */
  readonly biome: BiomeDef;

  /** What the hub's stations gave (`PERKS` in hub/state.ts): the kick, a spare can, the scavenger's eye, more shells. */
  readonly perks: Set<string>;
  kickCd = 0;
  /** The Leaping Kick in flight (`dashKick`): heading, time left, velocity. */
  lunge: { a: number; t: number; vx: number; vy: number } | null = null;
  /** When a boss's shield last blocked a hit (the `block` event is throttled: `bossGuard`). */
  blockAt = -1;
  /** The Communicator's chassis from the workshop (`sim/bots.ts`), added to his gear's stats. */
  private chassis: Stats = {};
  /**
   * The effect engine (`sim/effects.ts`): every robot and enemy is a unit in it. Hits go through `fx.strike` (types, resistances,
   * riders, armour), statuses, heals and stats are its; `drainFx` turns what it reports into events and consequences (deaths, spawns).
   * The Sim keeps `hp` where the engine puts it. A source reaches a unit through a layer (`setLayer`): gear, title, rank, ...
   */
  readonly engine: Effects;
  /** The rear and pack pieces' skills of the gear worn (the Sim pays their steam and cooldown; their effects are sources). */
  skillIds: { dash: SkillId | null; skill: SkillId | null } = { dash: null, skill: null };
  private gearSrc: GearSources = gearSources(freshGear());
  private gearWeapons = new Set<WeaponId>();
  private titleSrc: { comm: Source[]; bots: Source[] } = { comm: [], bots: [] };
  /** The punch cards fitted at home, as sources (`SimOptions.cards`). */
  private cardSrc: CardSources = noCards();
  /** What the D-city's buildings that stand do here (`SimOptions.city`): the Scrapyard's scrap a kill (`foes.ts`), the rest is read at the start or in `dayCfg`. */
  city: CityFx = noCity();
  private layers = new Map<Bot | Hornet, Map<string, string[]>>();
  /** Units to take out of the engine at the end of the step (the dead). */
  gone: (Bot | Hornet | Nest)[] = [];
  /** Set by a weapon's `pellets` effect while a shot is being fired: how many bolts and how wide. */
  pelletVolley: { count: number; spread: number } | null = null;
  /** Weapon mods at work (P57, `mods.ts`). */
  lug: LugState = freshLugs();
  /** Scrap picked up this mission (kills, ruins): the slingshot's ammo, banked at home. */
  scrap = 0;
  /** Copper stripped this mission (ruins, elites, bosses): the building material, banked at home. */
  copper = 0;
  /** The tap's healing puff timer. */
  tapT = 0;
  /** AI cores picked up this mission (the Core Vault's, a boss's: `dropCore`); banked at home through the haul, where each is one more bot on the lift (`hub/workshop.ts`). A bot lost on the sands brings its own core home. */
  cores = 0;
  /** The robot types the hub knows already (`SimOptions.types`), and the type wrecks mended this mission (`downed.ts` `fixed`): banked through the haul (`fetched`), where each joins the roster and its type becomes buildable. */
  typesKnown = new Set<string>();
  found: { name: string; role: string }[] = [];
  /** The names of the robots owned when the mission began: `SimOptions.owned` and the crew that rode down. */
  owned = new Set<string>();
  /** Ruins searched (`insight` counts them) and the research found elsewhere (masts, the Parable, later live ruins and Wardens). */
  ruinsFound = { live: 0, dead: 0 };
  /**
   * The timed action the Communicator started with one press of Use (Minos, 2026-10-18): a ruin searched or a live one decoded
   * (P30), or a place's action (`UseDef`). It runs while he stays within `ACTION.zone` times its reach, fighting included; out of
   * the zone it pauses, back in it goes on, and a hit does not cancel it. Starting another replaces it; his going down ends it.
   */
  action: UseAction | null = null;
  /** Grafting (`graft.ts`): the limbs lying where their elites fell, and the one he wears. */
  grafts: Graft[] = [];
  graft: Worn | null = null;
  /** A lift or a place asked "Ride up? E": a second press within `ACTION.confirm` s does it. */
  armed: { key: 'lift' | 'starOil' | PlaceId; verb: string; t: number } | null = null;
  usePrev = false;
  /** Seconds to the next pull of foes while a live ruin is decoded. */
  decodeT = 0;
  private insightMore = 0;
  /** Where the Communicator aims (world px): a mannequin it points at stands still (`FoeDef.shy`). */
  look = { x: 0, y: 0 };
  /** Cooldowns of the dash and the pack's skill; the dash in flight. */
  dashCd = 0;
  skillCd = 0;
  dashing: { t: number; vx: number; vy: number; trails: Trail[] } | null = null;
  /** A dungeon run (`sim/dungeon.ts`): its definition, its mini-boss, and the flow field its ground foes follow to the Communicator. */
  readonly dungeon: DungeonDef | null = null;
  /** Down a dungeon: the land's robots that came with him, in the order they were handed in (`opts.party`). */
  readonly party: Bot[] = [];
  denBoss: Hornet | null = null;
  /** Mission 1's old works (`intro.ts`): no clock, no rim arrivals, its own beats and free respawns. */
  intro: IntroRun | null = null;
  /** Nothing in hand (the intro until the shovel is found): left and right click do nothing. */
  unarmed = false;
  /** Down a dungeon: its rooms' rules (ambushes, the trap, the lever, Echoing's noise: `sim/dungeon.ts`). */
  run: DungeonRun | null = null;
  /** The land's threat tier (P40's landing sets it; 1 until then), and what the quest system or the dev commands put on the dungeon entrance: `handcrafted` an id in `HANDCRAFTED`, `twist` one forced (null: none). */
  tier: Tier = 1;
  /** Who the land's pilgrim place strands (the hub's call: `pilgrimIn`, hub/state.ts); null: no one; unset: the next NPC not aboard. */
  pilgrimId?: string | null;
  /** The landing's anomaly (P40, `ANOMALIES`) and what it does now (`anomalyFx`, refreshed by the clock). Neutral down a dungeon. */
  anomaly: AnomalyId = 'plain';
  fx: AnomalyFx = anomalyFx('plain', 0);
  /** The anomaly's passing weather and own rules (`weather.ts`): the schedule, the Ember Rain's marks. */
  weather: WeatherWorld = { windows: [], embers: [], emberT: 0, n: 1, r: rng('weather') };
  /** The land's own twists (P31, `twists.ts`): the jungle's rain, the Frostspine's blizzard and cold. */
  twists: TwistWorld;
  /** The Hollow City's rush hours (P31, `commute.ts`). */
  rush: Rush[] = [];
  entrance: { handcrafted?: string | null; twist?: Twist | null } = {};
  flow: { at: number; field: Float32Array } | null = null;
  /** The spiders' own random stream and the rim's timer (`spider.ts`). */
  readonly spiders: SpiderWorld;
  /** Tiers and traits: their own random stream (`sim/tiers.ts`). */
  readonly tiers: TierWorld;

  /**
   * `aboard`: the NPCs already living aboard (the hub's save), so the stranded pilgrim is the next one not there.
   * `biomeId`: the land's biome.
   * `kit`: what the Communicator carries in (the persistent loadout: weapon in hand, unlocked calls).
   * `opts`: the landing, or the dungeon below it (`SimOptions`).
   */
  constructor(readonly seed: number | string, readonly aboard: string[] = [], readonly biomeId: BiomeId = 'desert', perks: string[] = [], kit: Loadout = freshLoadout(), gear?: Gear, opts: SimOptions = {}) {
    this.chassis = opts.quest?.pack.biscuits ? { ...opts.chassis, oil: (opts.chassis?.oil ?? 0) + BISCUIT.oil } : opts.chassis ?? {}; // brass biscuits (hub/specials.ts)
    if (opts.quest?.pack.biscuits) this.stats['ate.biscuits'] = 1;
    this.biome = BIOMES[biomeId];
    this.perks = new Set([...perks, ...(opts.city?.perks ?? [])]); // the Rising District's city perks ride with the hub's
    this.city = opts.city ?? noCity();
    this.weapon = kit.weapon;
    this.secondary = kit.secondary;
    for (const w of kit.weapons) this.weapons.add(w);
    this.support = Object.fromEntries(kit.support.map((id) => [id, SUPPORT[id].charges]));
    // The main quest's calls (hub/story.ts) and their extra charge.
    if (this.perks.has('callDrop')) this.support.drop = SUPPORT.drop.charges;
    if (this.perks.has('callLance')) this.support.lance = SUPPORT.lance.charges;
    if (this.perks.has('moreCharges')) for (const id of Object.keys(this.support) as SupportId[]) this.support[id]! += 1;
    if (this.perks.has('zepMagazine')) for (const id of Object.keys(this.support) as SupportId[]) this.support[id]! += 1;
    if (this.city.charges) for (const id of Object.keys(this.support) as SupportId[]) this.support[id]! += this.city.charges;
    this.call = opts.call && this.support[opts.call] !== undefined ? opts.call : 'barrage';
    if (this.perks.has('shells')) for (const id of Object.keys(this.support) as SupportId[]) this.support[id]! += 1;
    // The quest lines' perks that set a mission up (`sim/perks.ts`); the rest act where their rule lives.
    if (this.perks.has('extraShells')) for (const id of Object.keys(this.support) as SupportId[]) this.support[id]! += 1;
    if (this.perks.has('snacks')) this.cfg.steamRegen *= PERK_FX.snacks;
    if (opts.tier) this.tier = clampTier(opts.tier);
    this.pilgrimId = opts.pilgrim;
    const forcedAnomaly = opts.land?.rules?.anomaly;
    if ((forcedAnomaly ?? opts.anomaly) && !opts.dungeon) this.anomaly = forcedAnomaly ?? opts.anomaly!;
    const dg = opts.dungeon ? generateDungeon(seed, biomeId, typeof opts.dungeon === 'object' ? opts.dungeon : {}) : null;
    this.dungeon = dg ? dg.def : null;
    if (opts.dayT) this.dayT = opts.dayT;
    this.day = dayState(this.dayT, this.dayCfg);
    this.weather = weatherWorld(seed, this.anomaly, this.day.at.midnight);
    this.twists = twistWorld(seed, biomeId, this.day.at, !!opts.dungeon);
    if (!opts.dungeon && TWISTS[biomeId]?.commute) this.rush = rushHours(this.day.at);
    this.refreshFx();
    this.map = dg ? dg.map : opts.land ?? generate(seed, undefined, undefined, biomeId);
    if (this.map.rules?.morningSwarm !== undefined) this.cfg.morningSwarm = this.map.rules.morningSwarm; // level 1's morning is quiet (P46's tune)
    this.W = this.map.w;
    this.H = this.map.h;
    this.onboard = new Onboard({ empty: opts.onboard?.empty || this.map.rules?.emptyHud, shown: opts.onboard?.shown }, (e) => this.events.push(e));
    this.lessons = new Lessons(opts.flown);
    gates(this);
    this.fog = newFog(this.map);
    this.signals = landSignals(this.map);
    // Level 1 hides Sprocket's signal until the mast is decoded (`releaseSignals`).
    if (this.map.rules?.guided) this.signalsHeld = this.signals.filter((s) => s.kind === 'pilgrim');
    this.signals = this.signals.filter((s) => !this.signalsHeld.includes(s));
    for (const t of opts.types ?? []) this.typesKnown.add(t);
    for (const n of [...(opts.owned ?? []), ...(opts.crew ?? START_CREW).map((c) => c.name)]) this.owned.add(n);
    // A type wreck of a type already found holds nothing: no signal for it.
    const empty = this.map.places.filter((p) => p.id === 'type-wreck' && this.typeWreckKnown());
    this.signals = this.signals.filter((s) => !empty.some((p) => p.x === s.at.x && p.y === s.at.y));
    // The Pigeon Aviary marks the pilgrim and the vault exactly: the signal's area shrinks onto the real spot.
    if (this.city.marked) {
      const exact = (s: Signal): Signal => (s.kind === 'pilgrim' || s.kind === 'vault' ? { ...s, x: s.at.x, y: s.at.y, r: 1 } : s);
      this.signals = this.signals.map(exact);
      this.signalsHeld = this.signalsHeld.map(exact);
    }
    this.r = rng(`sim/${seed}`);
    this.engine = new Effects(this.r.fork('fx'));
    this.engine.setPhase(this.day.phase);
    this.titleSrc = missionTitles(opts.titles ?? [], { augment: opts.augments });
    this.cardSrc = opts.cards ?? noCards();
    this.quest = opts.quest ?? freshQuestOpts();
    if (opts.wife === 'home' || opts.wife === 'stolen') this.voice = makeVoice(opts.wife);
    this.spiders = spiderWorld(this.r);
    this.tiers = tierWorld(this.r.fork('tiers'));
    this.lift = { x: (this.map.lift.x + 0.5) * T, y: (this.map.lift.y + 0.5) * T };
    const tap = tapOf(this.map.seeps, this.map.lift);
    if (tap) this.seeps.push({ id: this.nextId++, x: (tap.x + 0.5) * T, y: (tap.y + 0.5) * T, amount: TAP.amount * (this.perks.has('hotWaterMains') ? PERK_FX.tap.amount : 1), max: TAP.amount * (this.perks.has('hotWaterMains') ? PERK_FX.tap.amount : 1), kind: 'crude' });
    const lift = this.map.lift;
    const spare = this.map.seeps.filter((s) => s !== tap).sort((a, b) => dist(a.x, a.y, lift.x, lift.y) - dist(b.x, b.y, lift.x, lift.y));
    for (const s of spare.slice(0, COAL.seams[this.biomeId] ?? 0)) this.seams.push({ id: this.seams.length + 1, x: (s.x + 0.5) * T, y: (s.y + 0.5) * T, amount: COAL.amount, max: COAL.amount });
    for (const r of this.map.ruins) this.addRuin(r);
    // The props: ruin pieces and the scatter (the generator's choices), after the ruins they belong to.
    this.props = propWorld(this.W, this.H, this.r.fork('props'));
    this.map.ruinSizes?.forEach((size, i) => {
      if (size && this.ruins[i]) this.ruins[i].size = size;
    });
    oldMap(this); // the Expeditioner's gift (P52): the biggest ruin is on the map from the start
    for (const sp of this.map.props ?? []) addProp(this, sp, sp.ruin !== undefined ? this.ruins[sp.ruin]?.id : undefined);
    for (const n of this.map.nests) this.addNest((n.x + 0.5) * T, (n.y + 0.5) * T);
    for (const pl of this.map.places) this.places.push(makePlace(this, pl.id, pl.x, pl.y, pl.parts));
    this.controller = this.addBot('controller', 'Communicator', this.lift.x, this.lift.y + 6, -1);
    if (!dg) weatherInit(this);
    if (this.perks.has('ghostTouch')) this.engine.addSource(this.controller, GHOST_TOUCH);
    if (this.perks.has('dogNose')) this.engine.addSource(this.controller, DOG_NOSE);
    if (this.perks.has('companionDog')) makeDog(this, this.lift.x - 26, this.lift.y + 26, opts.dogName ?? 'The dog', false); // P42: his dog goes down the lift with him
    if (this.perks.has('homeRest')) this.engine.apply(this.controller, 'haste', { duration: PERK_FX.homeRest.haste });
    if (dg) {
      // Down here: the dungeon's foes in its rooms, cans in the side rooms, the mini-boss coiled in its den (sim/dungeon.ts).
      this.run = new DungeonRun(this, dg);
      for (const b of this.bots) this.soak(b);
      this.denBoss = this.run.populate(seed, opts.party?.length ?? 0);
      this.said.add('boss'); // it speaks when you reach its den (`oracle`)
      this.events.length = 0;
    }
    const crew: CrewBot[] = opts.crew ?? START_CREW;
    if (!dg) crew.forEach((c, i) => {
      const a = (i / crew.length) * Math.PI * 2;
      const ring = 56 + Math.floor(i / 8) * 30;
      this.ranked(this.addBot(c.role, c.name, this.lift.x + Math.cos(a) * ring, this.lift.y + Math.sin(a) * ring * 0.8, 0), c);
    });
    // Militia Muster (a city perk): one Brass Guard of the Brass Drop's goes down with the lift, beside him for a while.
    if (!dg && this.perks.has('militiaMuster')) this.addBot('guard', 'Brass Guard', this.lift.x + 34, this.lift.y + 22, 0).ttl = PERK_FX.militia;
    // The party rides down with him and stands round the shaft's foot.
    for (const [i, p] of (dg ? opts.party ?? [] : []).entries()) {
      const a = (i / opts.party!.length) * Math.PI * 2;
      this.party.push(this.ranked(this.addBot(p.role, p.name, this.lift.x + Math.cos(a) * 64, this.lift.y + Math.sin(a) * 48, 0), p));
    }
    for (const f of dg ? opts.followers ?? [] : []) {
      const bot = this.makeBot(f.ghost ? 'repairer' : 'gatherer', f.name, this.lift.x - 40, this.lift.y + 30, -3);
      this.followers.push({ bot, id: f.id, name: f.name, ...(f.ghost && { ghost: true }) });
    }
    this.setGear(gear ?? freshGear(), !!gear);
    this.party.forEach((b, i) => (b.hp = Math.max(1, Math.min(b.maxHp, opts.party![i].hp))));
    makeIntro(this);
  }

  /** Wear this gear (`sim/gear.ts`): its sources on every robot, its skills and, with `weapons`, its two weapon slots (the gear and the loadout agree on them). */
  setGear(g: Gear, weapons = true) {
    this.gearSrc = gearSources(g);
    setFitted(this, g);
    this.gearExtra = gearCans(g);
    this.skillIds = { dash: this.gearSrc.dash, skill: this.gearSrc.skill };
    const w = slotWeapons(g);
    if (weapons) {
      this.weapon = w.weapon;
      this.secondary = w.secondary;
      for (const id of [w.weapon, w.secondary]) if (id) this.weapons.add(id);
    }
    this.gearWeapons = new Set([w.weapon, ...(w.secondary ? [w.secondary] : [])]);
    // The bars keep their share when the gear changes the maxima.
    const share = new Map(this.bots.map((b) => [b, b.maxHp ? b.hp / b.maxHp : 1]));
    for (const b of this.bots) this.dress(b);
    this.fitWeapons();
    for (const b of this.bots) this.syncBody(b, share.get(b));
    this.radarSignals(this.engine.tagged(this.controller, 'radar'));
  }

  /** A Radar scope pins every signal to its real spot (a pip, not an area); taking it off gives the areas back. */
  private radarSignals(on: boolean) {
    const pin = (s: Signal): Signal => {
      if (!on) return this.rough.get(s.id) ?? s;
      this.rough.set(s.id, this.rough.get(s.id) ?? s);
      return { ...s, x: s.at.x, y: s.at.y, r: 1 };
    };
    this.signals = this.signals.map(pin);
    this.signalsHeld = this.signalsHeld.map(pin);
  }

  /** A robot takes a spec (or none): its sources and behaviour from now on (the workshop's is `RosterBot.spec`; this is the dev command's and the tests'). */
  setSpec(b: Bot, spec: SpecId | undefined) {
    if (spec) b.spec = spec;
    else delete b.spec;
    this.dress(b);
    this.syncBody(b);
  }

  /** A robot puts on a relic (or none): its source and behaviour from now on (the workshop's is `RosterBot.relic`; this is the dev command's). */
  setRelic(b: Bot, relic: string | undefined) {
    if (relic) b.relic = relic;
    else delete b.relic;
    this.dress(b);
  }

  /** Sources for a unit under a layer name (gear, title, rank, ...); what the layer held before comes off first. */
  private setLayer(u: Bot | Hornet, layer: string, srcs: Source[]) {
    let m = this.layers.get(u);
    if (!m) this.layers.set(u, (m = new Map()));
    for (const id of m.get(layer) ?? []) this.engine.removeSource(u, id);
    for (const s of srcs) this.engine.addSource(u, s);
    m.set(layer, srcs.map((s) => s.id));
  }

  /** What a robot wears and has earned: its role's gear, the titles, its workshop rank (the Communicator: his chassis). */
  private dress(b: Bot) {
    const c = b.role === 'controller';
    this.setLayer(b, 'gear', c ? this.gearSrc.comm : this.gearSrc.roles[b.role as CrewRole] ?? []);
    this.setLayer(b, 'title', c ? this.titleSrc.comm : this.titleSrc.bots);
    this.setLayer(b, 'city', c ? this.city.comm : this.city.bots);
    this.setLayer(b, 'card', [...(c ? this.cardSrc.comm : this.cardSrc.roles[b.role] ?? []), ...this.cardSrc.party]);
    const extra = c ? this.chassis : b.rank ? rankStats(b.role, b.rank) : {};
    this.setLayer(b, 'rank', Object.keys(extra).length ? [statsSource(c ? 'chassis' : 'rank', extra, c ? 'Chassis' : `Rank ${b.rank}`)] : []);
    // Its type and spec (P14) and its relic (P19), the workshop's: as sources the engine runs.
    this.setLayer(b, 'type', c ? [] : sourcesOf(b));
    const relic = relicSource(b.relic);
    this.setLayer(b, 'relic', relic ? [relic] : []);
    this.setLayer(b, 'stoke', b.stoked && !c ? [stokeSource(b.spec)] : []);
    // Spider legs (P53): a robot that loses them on a mesa steps down to the ground at its foot.
    const climbed = b.climbs;
    b.climbs = !c && this.engine.flag(b, 'climbs');
    if (climbed && !b.climbs && this.blocked(b.x, b.y)) Object.assign(b, this.passableNear(b.x, b.y));
  }

  /** Stoke a robot or let it go cold (the workshop's is `RosterBot.stoked`; this is the dev command's and the tests'). */
  setStoked(b: Bot, on: boolean) {
    if (on) b.stoked = true;
    else delete b.stoked;
    this.dress(b);
  }

  /** The weapons in hand that no worn item stands for (a find, a dev command) still have their extras. */
  private fitWeapons() {
    const held = [this.weapon, this.secondary].filter((w): w is WeaponId => !!w && !this.gearWeapons.has(w));
    this.setLayer(this.controller, 'lone', held.map(loneWeaponSource));
  }

  /** Max oil and steam: the engine's modified maxima (gear, rank, titles, statuses). With `share` the oil bar keeps that share. */
  private syncBody(b: Bot, share?: number) {
    const max = Math.max(10, this.engine.maxHp(b));
    if (share !== undefined) b.hp = share * max;
    b.maxHp = max;
    if (b.hp > max) b.hp = max;
    if (b.role === 'controller') {
      const ms = Math.max(20, this.engine.stat(b, 'maxSteam', STEAM.max));
      b.steam = Math.min(ms, b.steam);
      b.maxSteam = ms;
    }
  }

  /** A roster robot's id and rank go with it. */
  private ranked(b: Bot, c: { uid?: string; rank?: number; spec?: SpecId; relic?: string; stoked?: boolean }) {
    if (c.uid) b.uid = c.uid;
    if (c.rank) b.rank = c.rank;
    if (c.spec) b.spec = c.spec;
    if (c.relic) b.relic = c.relic;
    if (c.stoked) b.stoked = true;
    this.dress(b);
    this.syncBody(b, 1);
    return b;
  }

  /** The flooded dungeon (`DungeonRun.wet`): everyone is Wet, for good. */
  soak(u: Bot | Hornet) {
    if (this.run?.wet) this.engine.apply(u, 'wet', { duration: Infinity });
  }

  /** Add a source to a unit (the dev command); `layer` names it so it can be taken off again. */
  addSource(u: Bot | Hornet, src: Source) {
    this.setLayer(u, `dev:${src.id}`, [src]);
  }
  removeSource(u: Bot | Hornet, id: string) {
    this.setLayer(u, `dev:${id}`, []);
    this.engine.removeSource(u, id);
  }

  /** A robot by name or an enemy by `h<id>` (the dev commands). */
  unitNamed(name: string): Bot | Hornet | undefined {
    const n = name.toLowerCase();
    return this.bots.find((b) => !b.dead && b.name.toLowerCase() === n) ?? this.hornets.find((h) => !h.dead && `h${h.id}` === n);
  }

  /** What the engine holds on the units that hold anything: statuses and sources (`debugState()`). */
  private fxSummary() {
    const one = (u: Bot | Hornet) => ({ ...this.engine.inspect(u), hp: Math.round(u.hp) });
    const busy = (v: ReturnType<typeof one>) => Object.keys(v.statuses).length > 0 || v.sources.length > 0;
    return {
      phase: this.engine.phase,
      crew: Object.fromEntries(this.bots.filter((b) => !b.dead).map((b) => [b.name, one(b)])),
      foes: Object.fromEntries(this.hornets.filter((h) => !h.dead).map((h) => [`h${h.id} ${h.kind}`, one(h)] as const).filter(([, v]) => busy(v))),
    };
  }

  /** Plain hornets leave this robot alone (the hornet's head). */
  calm(b: Bot) {
    return this.engine.flag(b, 'calm');
  }

  /** How fast a unit moves now, as a share of its speed: its speed stat (gear, statuses, halos and cables, a pace), nothing if rooted. */
  mobility(u: Bot | Hornet) {
    return this.engine.flag(u, 'noMove') ? 0 : this.engine.stat(u, 'speed', 1);
  }
  /** A robot's walking speed as a share of its role's: `mobility`, but never under a tenth (a cable's slow is 0.2). */
  walk(b: Bot) {
    return this.engine.flag(b, 'noMove') ? 0 : Math.max(0.1, this.engine.stat(b, 'speed', 1));
  }
  /** A robot that is not crew (the pilgrim, the Princess) walks at this share of a robot's pace for good: a held change on its speed. */
  pace(b: Bot, share: number) {
    if (!this.engine.has(b)) this.engine.add(b, { team: 'crew' });
    this.engine.hold(b, 'pace', { stat: 'speed', more: share });
  }
  /** How far a unit sees: `range` px, or no further than `STATUS_AI.blindTiles` while it is Blinded. */
  sight(u: Bot | Hornet, range: number) {
    return this.engine.flag(u, 'blind') ? Math.min(range, STATUS_AI.blindTiles * T) : range;
  }
  /** Can it act (a Staggered, Frozen or Shocked unit cannot)? */
  stunned(u: Bot | Hornet) {
    return this.engine.flag(u, 'stunned');
  }
  /** Staggered: it does nothing for the moment, so its rigged limbs hang and flail (views only; Frozen holds still). */
  limp(u: Bot | Hornet) {
    return !!this.engine.status(u, 'staggered');
  }

  /** Called robots (the Brass Guard) fight beside him until their time is up, then are hauled back up. */
  private called(dt: number) {
    for (const b of this.bots) {
      if (!b.ttl || b.dead) continue;
      b.crew = 0;
      this.think(b, dt);
      b.ttl -= dt;
      if (b.ttl <= 0) {
        b.dead = true;
        this.gone.push(b);
        this.events.push({ e: 'despawn', bot: b });
      }
    }
  }

  // ---------- queries ----------

  /** The robots that can act: crew that is not down (a downed robot, `downed.ts`, lies out of the crew until it is fixed). */
  get crew() {
    return this.bots.filter((b) => !b.dead && !b.downed && b.role !== 'controller' && !b.ttl && !b.place);
  }
  /** Every robot of the crew, downed ones too: who is out here to be brought home. */
  get fielded() {
    return this.bots.filter((b) => !b.dead && b.role !== 'controller' && !b.ttl && !b.place && !b.downed?.wreck); // a wreck not yet mended is not yet one of ours
  }
  /** The roster ids of the downed robots on the lift: they come home carried (`hub/workshop.ts`: repaired for scrap, not rebuilt). */
  get downedHome() {
    return this.fielded.filter((b) => b.downed && b.uid && this.onLift(b, 1.6)).map((b) => b.uid!);
  }
  /** The mission's end: who rides up (`rides`) is saved, the rest of the robots out here are left, and the downed ones among them lost. */
  private tally() {
    const up = this.fielded.filter((b) => rides(this, b));
    graftLift(this); // a limb still worn falls off (the lift's rise did it already)
    this.stats.saved = up.length;
    dogHome(this);
    this.stats.left = this.fielded.length - up.length;
    if (!this.dungeon) this.stats.lost += this.fielded.filter((b) => b.downed && !up.includes(b)).length; // a dungeon's downed climb out with him and are counted up here
  }
  /** The workshop's ids of every robot that came down, standing or not (`hub/workshop.ts` wrecks the ones that do not ride back up). */
  get went() {
    return this.bots.filter((b) => b.uid).map((b) => b.uid!);
  }
  /** Either slot holds a gun: the Steam bar shows and the shovel hint changes. */
  get hasGun() {
    return [this.weapon, this.secondary].some((id) => id && WEAPONS[id].kind === 'gun');
  }
  /**
   * The Communicator finds a weapon: owned from now on, in hand if the secondary slot is free, else only owned. Either way the
   * scene puts it in the inventory (`found`: `Play.found`), where it can be equipped. True when it is new.
   */
  give(id: WeaponId) {
    if (this.weapons.has(id)) return false;
    this.weapons.add(id);
    if (!this.secondary) this.secondary = id;
    this.events.push({ e: 'found', weapon: id, hand: this.secondary === id });
    return true;
  }
  /** Put a weapon found into a slot (the other slot's weapon swaps in when it was there). */
  equip(id: WeaponId, slot: Slot) {
    const l = equip({ weapon: this.weapon, secondary: this.secondary, weapons: [...this.weapons] }, id, slot);
    if (!l) return false;
    this.weapon = l.weapon;
    this.secondary = l.secondary;
    return true;
  }
  get awake() {
    return this.nests.filter((n) => n.awake && !n.dead).length;
  }
  /**
   * How much staying has paid so far: 0 in the morning, 1 at midnight, 2 when the menace tops out. Loot chance, the
   * scrap in a gob and the share of parts grow with it (`LOOT.rich`).
   */
  get rich() {
    return this.day.dayP + this.day.buff / DAY.buffMax + this.biome.rich;
  }
  /**
   * How far the Communicator and his robots see now, as a share of the biome's own (the Sandstorm eases it to half over its 20 s):
   * `fogplay.ts` scales the map fog's reveal by it. A light's own radius (lamps, the Lit light) stays full, only the unlit sight scales.
   */
  get sightMul() {
    return this.fx.sight * blizzardSight(this);
  }
  /** The clock's lengths and twist for this biome: the tunes (`cfg`) scaled by `BIOMES[...].day`. */
  get dayCfg() {
    const c = this.cfg, d = this.biome.day;
    const w = withAnomaly({ ...c, morning: c.morning * d.morning, day: c.day * d.day, evening: c.evening * d.evening, twistStart: Math.max(c.twistStart, this.biome.twist) }, this.anomaly);
    // The Curfew Bell holds dusk back by whole seconds, whatever the land and the sky (`CURFEW`).
    return this.city.duskLater ? { ...w, day: w.day + this.city.duskLater } : w;
  }
  /**
   * Swarm intensity: 0 calm .. 1 and over. Extraction (design.md): the longer you stay, the bigger and nastier the swarm. The
   * clock drives it: it starts with the day and reaches 1 at midnight.
   */
  get intensity() {
    const clock = this.day.phase === 'morning' ? 0 : DAY.from + (1 - DAY.from) * this.day.dayP;
    return Math.min(1.4, clock + this.day.buff * 0.08);
  }
  /** The menace level in sixths of a level (0 before midnight): every enemy's aura and dashes grow with it (`BUFF`). */
  get buff() {
    return this.day.buff;
  }
  /** The menace level (every sixth berserk step; 0 before the sixth), no ceiling: P13 reads it for what levels 2-5 do. */
  get level() {
    return this.day.level;
  }
  /** What the berserk steps give this enemy: the steps it was spawned after, or for a boss (spawned before midnight) the steps so far. */
  berserk(h: Hornet): BerserkMul {
    const z = h.bz ?? this.bzNow;
    return h.breaks ? cutMul(z, h) : z; // a broken enemy's cuts (P13)
  }
  /** The share of hornets twisted now. */
  get twistedAlive() {
    return this.hornets.filter((h) => !h.dead && h.twisted && !h.boss).length;
  }
  get boss() {
    // Down a dungeon its mini-boss shows only once it has seen you.
    // A mini-boss (level 1's guard) shows its bar once it has woken or been hurt.
    return this.hornets.find((h) => h.boss && !h.dead && !(this.dungeon && h === this.denBoss && !this.said.has('den')) && !(bossOf(h.kind).mini && !h.target && h.hp >= h.maxHp)) ?? null;
  }
  /** Jump the clock (dev `time`): a phase, `boss`, or `hh:mm`. Returns false when the spec is not a time. */
  setClock(spec: string | number) {
    const t = typeof spec === 'number' ? spec : timeOf(spec, this.dayCfg);
    if (t === null) return false;
    this.dayT = Math.max(0, t);
    if (this.dayT < this.day.at.boss) this.bossSpawned = false;
    this.day = dayState(this.dayT, this.dayCfg);
    this.refreshFx();
    return true;
  }
  /** What the anomaly does at the clock's second (`anomalyFx`, with the weather's gusts). */
  refreshFx() {
    this.fx = anomalyFx(this.anomaly, this.dayT, this.weather.windows);
  }
  onLift(b: { x: number; y: number }, k = 1) {
    return dist(b.x, b.y, this.lift.x, this.lift.y) <= MISSION.liftTiles * T * k;
  }
  /** The rise left from the cleared den's gap, not the lift (the scene lifts that platform, not the old one). */
  exitUsed = false;
  /** Is he in the gap of the den's broken wall (the way up from a cleared den, as good as the lift)? */
  atExit(b: { x: number; y: number }, k = 1) {
    if (!this.run?.exitOpen) return false;
    const w = this.run.wallAt();
    return dist(b.x, b.y, w.x, w.y) <= MISSION.liftTiles * T * k;
  }
  /** On the lift, or in the cleared den's gap. */
  atLift(b: { x: number; y: number }) {
    return this.onLift(b) || this.atExit(b);
  }
  /** What the Oracle wants now (shown under the oil meter): one clause. Tokens like {map} are key prompts. */
  get objective() {
    if (this.phase === 'lost') return 'Signal lost.';
    if (this.phase === 'rising' || this.phase === 'done') return this.dungeon ? 'Climbing out.' : 'Rising to the colony.';
    if (this.intro) return this.intro.objective;
    if (this.dungeon) return !this.denBoss?.dead ? `Find the den at the bottom of ${this.dungeon.name}.` : this.run?.exitOpen ? 'Through the opening ({use}) and up.' : 'Break the cracked wall in the den and climb out.';
    if (this.day.phase === 'midnight') return 'Midnight: every ten seconds the machines come stronger.';
    if (this.bossDown) return `${this.bossDownName} is down: ride the lift ({use}) or stay.`;
    if (this.land?.id === 'level1') return this.level1Objective();
    if (!this.orders.some((o, i) => i > 0 && o) && !this.crew.some((b) => b.own && b.own !== 'follow') && this.ruins.some((r) => !r.searched)) return 'Send your gatherers to a ruin or a coal seam ({map}).';
    return 'Break machines for scrap, strip ruins for copper, mine coal.';
  }

  /** Level 1's chain as one clause: the mast, her guard, her cables, the lift. */
  private level1Objective() {
    const mast = this.places.find((p) => p.id === 'mast'), sp = this.places.find((p) => p.id === 'sprocket');
    if (this.pilgrim?.state === 'follow') return 'Walk Sprocket to the lift ({use} twice).';
    if (mast?.state === 'dark') return 'Wake the old mast to the east ({use}).';
    if (sp?.state === 'guarded') return 'Beat her guard to free Sprocket.';
    if (sp?.state === 'pinned') return 'Free Sprocket ({use}).';
    return 'Ride the lift ({use} twice) when you are ready.';
  }

  tileOf(x: number, y: number) {
    const tx = Math.max(0, Math.min(this.W - 1, Math.floor(x / T)));
    const ty = Math.max(0, Math.min(this.H - 1, Math.floor(y / T)));
    return ty * this.W + tx;
  }
  /** Can nobody stand here: off the map, rock, a solid prop. For a robot (`u`) wearing spider legs the rock it may climb is open (P53). */
  blocked = (x: number, y: number, u?: Bot) => {
    const tx = Math.floor(x / T), ty = Math.floor(y / T);
    if (tx < 0 || ty < 0 || tx >= this.W || ty >= this.H) return true;
    const i = ty * this.W + tx;
    return (!passable(this.map.ter[i]) && !(u?.climbs && this.climbable(i))) || this.props.solid[i] === 1;
  };
  /** A rock tile legs may climb (`path.ts`: not the rim, not a dungeon's walls). */
  climbable = (i: number) => climbable(this.map.ter, this.W, this.H, i, !!this.dungeon);
  /** Does it stand on rock a climber may stand on. */
  onRock = (b: Bot) => this.climbable(this.tileOf(b.x, b.y));
  private walkable = (i: number) => passable(this.map.ter[i]) && this.props.solid[i] === 0;
  /** The tiles one robot may walk (`walkable`, and rock to a legged one). */
  private walkableBy = (b: Bot) => (b.climbs ? (i: number) => this.walkable(i) || (this.climbable(i) && this.props.solid[i] === 0) : this.walkable);
  /** A point sent to a legged robot may be on a mesa: `passableNear` for the rest (`order`, `orderBots`). */
  orderSpot(x: number, y: number, bots: Bot[]): Spot {
    const i = this.tileOf(x, y);
    return bots.some((b) => b.climbs) && this.climbable(i) && this.props.solid[i] === 0 ? { x, y } : this.passableNear(x, y);
  }
  /** Where a robot is sent as it can reach it: the point, or for one that cannot climb the rock it lies on, the ground at its foot. */
  private reach = new WeakMap<Spot, Spot>();
  private reachable(b: Bot, p: Spot): Spot {
    if (!this.blocked(p.x, p.y) || b.climbs) return p;
    let at = this.reach.get(p);
    if (!at) this.reach.set(p, (at = this.passableNear(p.x, p.y)));
    return at;
  }
  bot(id: number) {
    return this.bots.find((b) => b.id === id && !b.dead) ?? null;
  }
  /** The nearest walkable point to (x, y). */
  passableNear(x: number, y: number): Spot {
    if (!this.blocked(x, y)) return { x, y };
    for (let r = 1; r < 12; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const px = x + dx * T, py = y + dy * T;
          if (!this.blocked(px, py)) return { x: Math.floor(px / T) * T + T / 2, y: Math.floor(py / T) * T + T / 2 };
        }
    return { x: this.lift.x, y: this.lift.y };
  }

  // ---------- commands (the map, dev commands) ----------

  assign(id: number, crew: number) {
    const b = this.bot(id);
    if (this.dungeon || !b || b.role === 'controller' || crew < 0 || crew >= CREWS) return;
    const from = b.crew;
    b.crew = crew;
    delete b.own; // given back to a crew: its own order ends (P3)
    b.hold = { x: b.x, y: b.y };
    b.path = [];
    // A crew left empty forgets where it was sent, so the next robot put in it does not run off to that old spot.
    if (from !== crew && from > 0 && !this.crew.some((x) => x.crew === from)) {
      this.orders[from] = null;
      this.following[from] = false;
    }
  }

  /** Does this robot trail the Communicator: crew 0, or a crew told to follow him. */
  follows(b: Bot) {
    if (b.own) return b.own === 'follow'; // its own order (P3) stands over its crew's
    return b.crew === 0 || this.following[b.crew];
  }

  /** Crew 1..3 trails the Communicator like crew 0 until it gets a point. */
  follow(crew: number) {
    if (this.dungeon || crew < 1 || crew >= CREWS) return;
    this.orders[crew] = null;
    this.following[crew] = true;
    const mates = this.crew.filter((b) => b.crew === crew);
    for (const b of mates) b.path = [];
    noteOrder(this, crew);
    if (mates.length) this.bark(this.r.pick(mates), 'order', true);
  }

  /** Send crew 1..3 to a point. */
  order(crew: number, x: number, y: number) {
    if (this.dungeon || crew < 1 || crew >= CREWS) return;
    const mates = this.crew.filter((b) => b.crew === crew);
    this.orders[crew] = this.orderSpot(x, y, mates);
    this.following[crew] = false;
    for (const b of mates) b.path = [];
    noteOrder(this, crew);
    if (mates.length) this.bark(this.r.pick(mates), this.onLift(this.orders[crew]!, 0.5) ? 'evac' : 'order', true);
  }

  /** Every crew to the lift. */
  evacuate() {
    for (let c = 1; c < CREWS; c++) if (this.crew.some((b) => b.crew === c)) this.order(c, this.lift.x, this.lift.y);
    // Robots on their own orders (P3) go too.
    const lift = { x: this.lift.x, y: this.lift.y };
    for (const b of this.crew) if (b.own) (b.own = lift), (b.path = []);
  }

  /** End the mission as if the lift rose (dev `finish`): whoever stands on it is saved. */
  finish() {
    if (this.phase === 'done' || this.phase === 'lost') return;
    this.tally();
    this.setPhase('done');
  }

  /** What a bot of this base type did, counted for its deed (`hub/deeds.ts` `statKey`). */
  deed(type: string, counter: string, n = 1) {
    if (n > 0) this.stats[`deed.${type}.${counter}`] = (this.stats[`deed.${type}.${counter}`] ?? 0) + n;
  }

  // ---------- the engine's reports, the clock, markers ----------

  /** Turn what the engine reported since the last call into events and their consequences (deaths, spawns, shoves). */
  drainFx() {
    for (let i = 0; i < 16; i++) {
      const outs = this.engine.drain();
      if (!outs.length) return;
      for (const o of outs) onOut(this, o);
    }
  }

  /** Keep a marker status on a unit while something holds: renewed when it is about to lapse. */
  mark(u: Bot | Hornet, id: 'twistedAura' | 'webbed' | 'lit' | 'marked' | 'shadowed', secs = 0.3) {
    if ((this.engine.status(u, id)?.left ?? 0) < secs / 2) this.engine.apply(u, id, { duration: secs });
  }

  /** What the effects ask of the Communicator that the engine cannot see (tags a card or an item reads): steam full or low, the Oracle speaking. */
  private tagStep() {
    const c = this.controller;
    this.engine.tag(c, 'steamFull', c.steam >= c.maxSteam - 0.5);
    this.engine.tag(c, 'steamLow', c.steam < c.maxSteam * STEAM_LOW);
    this.engine.tag(c, 'oracleSpeaks', this.time < this.speakUntil);
    this.engine.tag(c, 'walking', c.moving);
    soleTrail(this, c);
  }

  /** Lamps (the `lamp` stat is a radius): the lamp's bearer and the robots within it are Lit, which ends Dread and keeps it off. */
  private lampStep() {
    const dead = !!this.engine.source(this.controller, 'card:deadMansLamp');
    for (const l of this.bots) {
      if (l.dead) continue;
      // Dead Man's Lamp (a punch card): a downed robot's light stays lit, and the crew inside it are Shadowed.
      const out = this.engine.isDown(l);
      if (out && !(dead && l.downed)) continue;
      const r = Math.max(this.engine.stat(l, 'lamp', 0), out ? DEAD_LAMP : 0);
      if (r <= 0) continue;
      for (const b of this.bots) {
        if (b.dead || dist(b.x, b.y, l.x, l.y) > r) continue;
        this.mark(b, 'lit');
        if (out && b !== l && b.crew === l.crew) this.mark(b, 'shadowed');
      }
    }
  }
  /** Dead Man's Lamp lights a downed robot's lamp (the light the view keeps lit for it). */
  get deadLamps() {
    return !!this.engine.source(this.controller, 'card:deadMansLamp');
  }

  // ---------- the step ----------

  /** One tick: the systems in order (the order is the rules: who acts, who is hit, what falls, what the Oracle says). */
  step(dt: number, input: Input) {
    if (this.phase === 'done' || this.phase === 'lost') return;
    if (lessonStep(this, dt)) return; // the Oracle's pause: the world waits (lessons.ts)
    dt = slowStep(this, dt);
    this.time += dt;
    // A dungeon has no sky: the clock stands still down there (and the land's waits above).
    if (!this.dungeon && !this.intro && this.oilT <= 0) {
      this.dayT += dt;
      clockStep(this, dt);
      weatherStep(this, dt);
      twistStep(this, dt);
    }
    this.liftCue = Math.max(0, this.liftCue - dt);
    this.tagStep();
    controlled(this, dt, input);
    modsStep(this, dt);
    fogStep(this, dt, input.ax, input.ay);
    tapStep(this, dt);
    placesStep(this, dt);
    questStep(this, dt);
    followStep(this, dt);
    dogStep(this, dt);
    for (const b of this.crew) this.think(b, dt);
    this.called(dt);
    carryStep(this);
    carryPropStep(this);
    junkStep(this, dt);
    this.separate();
    hives(this, dt);
    if (!this.dungeon && !this.intro) edgeArrivals(this, dt);
    else flowStep(this);
    for (const h of this.hornets) if (!h.dead) fly(this, h, dt);
    auras(this, dt);
    this.lampStep();
    skillStep(this, dt);
    patchStep(this, dt);
    propStep(this, dt);
    crashStep(this, dt);
    graftStep(this, dt);
    fire(this, dt);
    supportStep(this, dt);
    pickups(this, dt);
    this.engine.tick(dt);
    this.drainFx();
    for (const b of this.bots) if (!b.dead) this.syncBody(b);
    for (const u of this.gone.splice(0)) {
      this.engine.remove(u);
      this.layers.delete(u as Bot | Hornet);
    }
    this.hornets = this.hornets.filter((h) => !h.dead);
    this.loot = this.loot.filter((l) => !l.dead);
    this.shots = this.shots.filter((s) => !s.dead);
    if (this.dungeon) {
      dungeonLines(this);
      this.run!.step(dt, input);
    } else if (this.intro) this.intro.step(dt);
    else {
      oracle(this);
      voiceStep(this, dt);
      dockStep(this, dt);
    }
    if (this.phase === 'rising') {
      this.riseT += dt;
      if (this.riseT >= this.city.riseTime) {
        this.tally();
        this.setPhase('done');
      }
    }
  }

  setPhase(p: Phase) {
    this.phase = p;
    this.events.push({ e: 'phase', phase: p });
  }

  // ---------- what the land is made of ----------

  /** A hive at (x, y) px. A place's hives are small and woken by the place alone (not by the clock or by siphoning). */
  addNest(x: number, y: number, o: { place?: PlaceId; hp?: number; scale?: number } = {}): Nest {
    const hp = o.hp ?? this.biome.hiveHp ?? NEST.hp;
    const n: Nest = { id: this.nextId++, x, y, hp, maxHp: hp, awake: false, dead: false, spawnT: 0, scale: o.scale ?? 1, ...(o.place && { place: o.place }) };
    this.nests.push(n);
    this.engine.add(n, { team: 'foe', tags: ['nest'] });
    return n;
  }

  private addRuin(r: MapData['ruins'][number]) {
    // The Parable Trail's ruins are searched for their verses, never decoded.
    const ruin: Ruin = { id: this.nextId++, x: (r.x + 0.5) * T, y: (r.y + 0.5) * T, kind: r.kind, searched: false, live: !!RUIN_FINDS[r.kind].live && r.trail === undefined };
    if (r.trail !== undefined) ruin.trail = r.trail;
    if (r.junk) ruin.junk = r.junk;
    this.ruins.push(ruin);
  }

  /** A robot that is not part of the crews: made like one, never on `bots` (the pilgrim). */
  makeBot(role: Role, name: string, x: number, y: number, crew: number): Bot {
    const d = ROLES[role];
    const p = this.passableNear(x, y);
    return {
      id: this.nextId++, role, name, x: p.x, y: p.y, hp: d.hp, maxHp: d.hp, steam: STEAM.max, maxSteam: STEAM.max, steamT: 0, crew, hold: { ...p }, face: 1, dead: false, state: 'idle',
      target: 0, cd: 0, moving: false, path: [], pathGoal: -1, pathT: 0, fxT: 9, barkT: 0, auraDps: 0, auraAcc: 0,
    };
  }

  /** The land's type wreck (`TYPE_WRECK`) holds nothing: its type is already found or built, or this land has no such wreck. */
  typeWreckKnown() {
    const role = TYPE_WRECK.role[this.biomeId];
    return !role || this.typesKnown.has(role);
  }

  /** The stranded NPCs who made it onto the lift (ids, for the hub): counted once the lift is rising. */
  get rescued(): string[] {
    const p = this.pilgrim;
    const up = this.phase === 'rising' || this.phase === 'done';
    // A guided land (level 1) cannot lose its rescue: the Wanderer's grapple fetches her if she was left off the lift.
    const pil = p && p.state === 'follow' && up && (this.land?.guided || this.onLift(p.bot, 1.6)) ? [p.npc.id] : [];
    return [...pil, ...this.followers.filter((f) => !f.ghost && up && this.onLift(f.bot, 1.6)).map((f) => f.id)];
  }

  /** The stranded NPC this mission met but did not bring up (never found, or left behind): it stays on the sands, stranded again on a later land. */
  get gathered(): string[] {
    const p = this.pilgrim;
    return p && !this.rescued.includes(p.npc.id) ? [p.npc.id] : [];
  }

  /** The Communicator can hurt ghosts: the Esteemed Ghost freed, this mission or before (`ghostTouch`). His crews need ghostly gear (`untouchable`). */
  get ghostTouch() {
    return this.ghostFreed || this.perks.has('ghostTouch');
  }

  // ---------- the crews ----------

  anchor(b: Bot): Spot {
    if (this.follows(b)) return this.controller.dead ? b.hold : this.controller;
    if (b.own && b.own !== 'follow') return this.reachable(b, b.own);
    const o = this.orders[b.crew];
    return o ? this.reachable(b, o) : b.hold;
  }

  /** Where in its crew's formation this robot stands. */
  slot(b: Bot): Spot {
    // Every robot trailing him stands in one formation (crew 0 and the crews told to follow), so none stack on a point.
    const trail = this.follows(b);
    // Robots sent on their own (P3) stand with those sent to the same point; their crew stands without them.
    const mates = this.crew.filter((x) => (trail ? this.follows(x) : b.own ? x.own === b.own : x.crew === b.crew && !x.own));
    const i = Math.max(0, mates.indexOf(b));
    const a0 = this.anchor(b);
    const ring = trail ? 58 + Math.floor(i / 6) * 34 : 30 + Math.floor(i / 6) * 30;
    const a = (i / Math.min(6, mates.length || 1)) * Math.PI * 2 + (trail ? Math.PI / 2 : 0);
    const p = { x: a0.x + Math.cos(a) * ring, y: a0.y + Math.sin(a) * ring * 0.8 };
    return this.blocked(p.x, p.y, b) ? a0 : p;
  }

  private think(b: Bot, dt: number) {
    b.cd -= dt;
    b.fxT += dt;
    b.pathT -= dt;
    b.moving = false;
    const was = b.state;
    b.state = 'idle';
    if (this.phase === 'rising') return;
    if (this.stunned(b) || b.fling) return; // Staggered, Frozen, Shocked, kicked along: it can only stand there
    // Struck by a heart: it walks to its sweetheart while Taunted (shoot the love-bot and it comes to its senses).
    if (b.lure) {
      const h = this.hornets.find((x) => x.id === b.lure && !x.dead);
      if (h && this.engine.flag(b, 'taunted')) {
        this.go(b, h.x, h.y + 10, dt, 30);
        return;
      }
      b.lure = undefined;
    }
    if (b.relic && relicThink(this, b, dt)) return; // a relic has taken its turn (humming, the toothbrush in a fight, the way to the lift)
    this.thinkRole(b, dt);
    const now = b.state as Bot['state'];
    if (now !== was) {
      if (now === 'gather' && this.r.chance(0.5)) this.bark(b, 'gather');
      if (now === 'fight' && this.r.chance(0.6)) this.bark(b, 'fight');
      if (now === 'repair' && this.r.chance(0.5)) this.bark(b, 'repair');
    }
  }

  /** A crew robot's own behaviour: its AI (`botai.ts`: targets, dodging, retreat, healing, idle life). */
  private thinkRole(b: Bot, dt: number) {
    botAct(this, b, dt);
  }

  /** Walk toward a point: straight when the way is clear, else along an A* path. True when there. */
  go(b: Bot, gx: number, gy: number, dt: number, near: number, mul = 1) {
    const d = dist(b.x, b.y, gx, gy);
    if (d <= Math.max(near, 3)) {
      b.path = [];
      return true;
    }
    const sp = ROLES[b.role].speed * this.walk(b) * mul * (d < 40 ? Math.max(0.35, d / 40) : 1) * (b.climbs && this.onRock(b) ? CLIMB.pace : 1);
    let tx = gx, ty = gy;
    if (!clearLine((x, y) => this.blocked(x, y, b), b.x, b.y, gx, gy, ROLES[b.role].r * 0.8)) {
      const goal = this.tileOf(gx, gy);
      if (!b.path.length || b.pathGoal !== goal || b.pathT <= 0) {
        b.path = astar(this.walkableBy(b), this.W, this.H, this.tileOf(b.x, b.y), goal);
        b.pathGoal = goal;
        b.pathT = 1.5;
      }
      while (b.path.length) {
        const p = b.path[0];
        const px = (p % this.W) * T + T / 2, py = Math.floor(p / this.W) * T + T / 2;
        if (dist(b.x, b.y, px, py) < 12) b.path.shift();
        else {
          tx = px;
          ty = py;
          break;
        }
      }
    }
    const dd = dist(b.x, b.y, tx, ty) || 1;
    this.moveBy(b, ((tx - b.x) / dd) * sp * dt, ((ty - b.y) / dd) * sp * dt);
    b.moving = true;
    if (Math.abs(tx - b.x) > 2) b.face = tx > b.x ? 1 : -1;
    return false;
  }

  moveBy(b: Bot, dx: number, dy: number) {
    const r = ROLES[b.role].r * 0.8;
    const hit = (x: number, y: number) => this.blocked(x - r, y - r, b) || this.blocked(x + r, y - r, b) || this.blocked(x - r, y + r, b) || this.blocked(x + r, y + r, b);
    if (!hit(b.x + dx, b.y)) b.x += dx;
    if (!hit(b.x, b.y + dy)) b.y += dy;
  }

  private separate() {
    const alive = this.bots.filter((b) => !b.dead && !b.downed);
    for (let i = 0; i < alive.length; i++)
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        const min = ROLES[a.role].r + ROLES[b.role].r;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d >= min || d === 0) continue;
        const push = (min - d) / 2 / d;
        const px = (a.x - b.x) * push, py = (a.y - b.y) * push;
        if (a.role !== 'controller') this.moveBy(a, px, py);
        if (b.role !== 'controller') this.moveBy(b, -px, -py);
      }
  }

  // ---------- dungeons ----------

  /** This land's dungeon entrance: how deep (`tier`), its rolled or forced twist, a quest dungeon that took it (`entrance`). The same seed gives the same spec. */
  dungeonSpec(): DungeonSpec {
    return specFor(`${this.seed}:${this.biomeId}`, this.biomeId, { tier: this.tier, ...this.entrance });
  }

  /** What this land's entrance leads to, as the Oracle and the entrance's name describe it. */
  entranceDef(): DungeonDef {
    return dungeonDef(`${this.seed}:${this.biomeId}`, this.biomeId, this.dungeonSpec());
  }

  /** A loud noise at (x, y) (a gunshot, a kick, a crash, a blast; a melee swing is quiet): an Echoing dungeon carries it to the rooms near (`DungeonRun.hear`). */
  noise(x: number, y: number) {
    this.run?.hear(x, y);
    wakeNear(this, x, y); // a place's sleepers (`placeparts.ts`)
  }

  addBot(role: Role, name: string, x: number, y: number, crew: number) {
    const b = this.makeBot(role, name, x, y, crew);
    this.bots.push(b);
    this.engine.add(b, { team: 'crew', baseMax: b.maxHp });
    this.dress(b);
    this.soak(b);
    this.syncBody(b, 1);
    return b;
  }

  /** A robot says something in the way of the Old Way. Throttled per robot and overall unless forced. */
  bark(b: Bot, when: BarkWhen, force = false) {
    if (b.dead || b.role === 'controller') return;
    if (!force && (b.barkT > this.time || this.barkT > this.time)) return;
    b.barkT = this.time + 7;
    this.barkT = this.time + 2.2;
    this.events.push({ e: 'bark', bot: b, text: this.r.pick(BARKS[when]) });
  }

  /** `debugState()`'s sim part: every system answers for its own state (`xSummary` in its module). */
  summary() {
    return {
      seed: this.seed,
      biome: this.biomeId,
      tier: this.tier,
      anomaly: {
        id: this.anomaly,
        aggro: +this.fx.aggro.toFixed(2),
        drops: +this.fx.drops.toFixed(2),
        sight: +this.fx.sight.toFixed(2),
        reach: +this.fx.reach.toFixed(2),
        steam: +this.fx.steam.toFixed(2),
        twistedParts: +this.fx.twistedParts.toFixed(2),
        tell: +this.fx.tell.toFixed(2),
        ease: +this.fx.ease.toFixed(2),
        ...weatherSummary(this),
      },
      twists: twistSummary(this),
      ...(this.dungeon && {
        dungeon: {
          name: this.dungeon.name,
          boss: this.denBoss ? (this.denBoss.dead ? 'down' : Math.round(this.denBoss.hp)) : null,
          ...this.run?.summary(),
        },
      }),
      ...(this.intro && { intro: this.intro.summary() }),
      mods: lugSummary(this),
      onboard: this.onboard.summary(),
      lessons: this.lessons.summary(),
      time: +this.time.toFixed(1),
      phase: this.phase,
      intensity: +this.intensity.toFixed(2),
      day: {
        phase: this.day.phase,
        clock: clockText(this.day.hour),
        t: Math.round(this.dayT),
        twist: +this.day.twist.toFixed(2),
        twisted: `${this.twistedAlive}/${this.hornets.filter((h) => !h.boss).length}`,
        buff: +this.day.buff.toFixed(2),
        step: this.day.step,
        level: this.day.level,
        boss: bossSummary(this),
        at: this.day.at,
      },
      controller: controllerSummary(this),
      reserve: {
        oil: Math.round(this.reserve),
        cans: +(this.reserve / LOOT.oil).toFixed(2),
        max: REVIVE.cans + Math.floor(this.capExtra),
      },
      found: {
        scrap: this.scrap,
        insight: this.insight,
        cores: this.cores,
        copper: this.copper,
        coal: this.coal,
        junk: [...this.junk],
      },
      downed: this.downT > 0 ? { kind: this.downKind, t: +this.downT.toFixed(2) } : null,
      fallen: downedSummary(this),
      grace: +this.graceT.toFixed(2),
      slow: this.slowT > 0 ? { left: +this.slowT.toFixed(2), scale: +slowScale(this).toFixed(2), stand: +this.standT.toFixed(2) } : null,
      support: supportSummary(this),
      crew: this.crew.map((b) => ({
        id: b.id,
        name: b.name,
        role: b.role,
        crew: b.crew,
        ...(b.own && { own: b.own === 'follow' ? 'follow' : [Math.round(b.own.x), Math.round(b.own.y)] }),
        hp: Math.round(b.hp),
        state: b.state,
        x: Math.round(b.x),
        y: Math.round(b.y),
        ...(b.spec && { spec: b.spec }),
        ...(b.relic && { relic: b.relic }),
        ...(b.stoked && { stoked: true }),
      })),
      ai: aiSummary(this),
      skills: skillSummary(this),
      following: this.following.map((f, c) => (f ? c : 0)).filter(Boolean),
      orders: this.orders.map((o) => (o ? [Math.round(o.x), Math.round(o.y)] : null)),
      followers: followersSummary(this),
      dog: dogSummary(this),
      ghostTouch: this.ghostTouch,
      call: this.call,
      bossesDown: [...this.bossesDown],
      pilgrim: this.pilgrim && {
        npc: this.pilgrim.npc.id,
        state: this.pilgrim.state,
        x: Math.round(this.pilgrim.bot.x),
        y: Math.round(this.pilgrim.bot.y),
        onLift: this.onLift(this.pilgrim.bot, 1.6),
      },
      rescued: this.rescued,
      ...foeSummary(this),
      graft: graftSummary(this),
      ...lootSummary(this),
      ...useSummary(this),
      props: propSummary(this),
      fog: fogSummary(this),
      ...coalSummary(this),
      spiders: spiderSummary(this),
      caterpillars: grubSummary(this),
      tiers: tierSummary(this),
      beasts: beastSummary(this),
      fx: this.fxSummary(),
      rich: +this.rich.toFixed(2),
      advised: this.advised,
      said: [...this.said],
      stats: this.stats,
    };
  }

  // ---------- the systems: what the scene and the tests call; each is the function of that name ----------
  // foes.ts
  auraOf(...a: Rest<typeof auraOf>) { return auraOf(this, ...a); }
  foeShot(...a: Rest<typeof foeShot>) { return foeShot(this, ...a); }
  setTier(...a: Rest<typeof setTier>) { return setTier(this, ...a); }
  setUnder(...a: Rest<typeof setUnder>) { return setUnder(this, ...a); }
  slay(...a: Rest<typeof slay>) { return slay(this, ...a); }
  spawnHornet(...a: Rest<typeof spawnHornet>) { return spawnHornet(this, ...a); }
  wake(...a: Rest<typeof wake>) { return wake(this, ...a); }
  // combat.ts
  damageHornet(...a: Rest<typeof damageHornet>) { return damageHornet(this, ...a); }
  foeHit(...a: Rest<typeof foeHit>) { return foeHit(this, ...a); }
  hurt(...a: Rest<typeof hurt>) { return hurt(this, ...a); }
  shoot(...a: Rest<typeof shoot>) { return shoot(this, ...a); }
  // boss.ts
  spawnBoss(...a: Rest<typeof spawnBoss>) { return spawnBoss(this, ...a); }
  // props.ts
  flatten(...a: Rest<typeof flatten>) { return flatten(this, ...a); }
  // use.ts
  get decodeProgress() { return decodeProgress(this); }
  get decoding() { return decoding(this); }
  inPlace(...a: Rest<typeof inPlace>) { return inPlace(this, ...a); }
  placeUse(...a: Rest<typeof placeUse>) { return placeUse(this, ...a); }
  pressUse(...a: Rest<typeof pressUse>) { return pressUse(this, ...a); }
  ruinNear(...a: Rest<typeof ruinNear>) { return ruinNear(this, ...a); }
  get stripSize() { return stripSize(this); }
  triggerPlace(...a: Rest<typeof triggerPlace>) { return triggerPlace(this, ...a); }
  // coal.ts
  jobFor(...a: Rest<typeof jobFor>) { return jobFor(this, ...a); }
  mine(...a: Rest<typeof mine>) { return mine(this, ...a); }
  ruinToStrip(...a: Rest<typeof ruinToStrip>) { return ruinToStrip(this, ...a); }
  seamNear(...a: Rest<typeof seamNear>) { return seamNear(this, ...a); }
  strip(...a: Rest<typeof strip>) { return strip(this, ...a); }
  // loot.ts
  drop(...a: Rest<typeof drop>) { return drop(this, ...a); }
  dropCore(...a: Rest<typeof dropCore>) { return dropCore(this, ...a); }
  restLoot(...a: Rest<typeof restLoot>) { return restLoot(this, ...a); }
  // support.ts
  callSupport(...a: Rest<typeof callSupport>) { return callSupport(this, ...a); }
  // oracle.ts
  say(...a: Rest<typeof say>) { return say(this, ...a); }
  // followers.ts
  freeGhost(...a: Rest<typeof freeGhost>) { return freeGhost(this, ...a); }
}

export { Ter };

export { typeMul };
