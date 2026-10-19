/**
 * What the sim is made of: the robots, enemies, hives, ruins, loot and shots it keeps, its input and phases, and `SimEvent`
 * (the union of every system's events: each module declares its own and this file lists them).
 */

import type { BossEvent } from './boss';
import type {
  AiWhat,
  Mind,
} from './botai';
import type { BerserkMul } from './clock';
import type { Limb, LimbKind } from './limbs';
import type { Graft } from './graft';
import type { CoalEvent } from './coal';
import {
  type CombatEvent,
  fire,
} from './combat';
import {
  type ControllerEvent,
  dash,
  skill,
} from './controller';
import type { DayEvent } from './dayplay';
import type { WeatherEvent } from './weather';
import type { TwistEvent } from './twists';
import type { BeastEvent } from './beasts';
import type { CommuteEvent } from './commute';
import type { BeastModId } from './defs/beasts';
import type {
  AnomalyId,
  BossMove,
  BreakId,
  DamageType,
  Enemy,
  LootKind,
  PartKind,
  Role,
  RuinSize,
  SupportId,
  TraitId,
  WeaponId,
} from './defs';
import type { DownedEvent } from './downed';
import type {
  DungeonEvent,
  DungeonSpec,
} from './dungeon';
import type {
  Action,
  StatusId,
} from './effects';
import {
  type FoeEvent,
  brain,
  reach,
} from './foes';
import type { FollowerEvent } from './followers';
import type { CompanionEvent } from './companions';
import type { CityFx } from '../hub/buildings';
import type { CardSources } from '../hub/research';
import type { QuestOpts } from './questcount';
import type { Stats } from './gear';
import type { LootEvent } from './loot';
import type { ModEvent } from './mods';
import type {
  RuinKind,
  Spot,
} from './mapgen';
import type { HudId, OnboardEvent } from './onboard';
import {
  type OracleEvent,
  oracle,
} from './oracle';
import type { PlaceRT } from './placeplay';
import type { BotFling } from './crash';
import type { MapData } from './mapgen';
import type { Fling, PropEvent } from './props';
import type { PlaceId } from './places';
import type { Sim } from './sim';
import type { SiteKind } from './sites';
import type { SpecId } from './specs';
import type { SpiderState } from './spider';
import type { GrubEvent, GrubState } from './caterpillar';
import type { SupportEvent } from './support';
import type {
  Blade,
  Lay,
  Patch,
  TierEvent,
  TierState,
} from './tiers';
import {
  type UseEvent,
  decoded,
} from './use';

/** A land robot handed down a dungeon (`opts.party`): who it is and the oil it has. */
export interface PartyBot {
  role: Exclude<Role, 'controller'>;
  name: string;
  hp: number;
  uid?: string;
  rank?: number;
  spec?: SpecId;
  relic?: string;
  /** Fed coal at the workshop for this mission (`sim/stoke.ts`). */
  stoked?: boolean;
}

/** A robot the mission starts with (the hub's roster, `hub/workshop.ts`; `START_CREW` without one). */
export interface CrewBot {
  role: Exclude<Role, 'controller'>;
  name: string;
  uid?: string;
  rank?: number;
  /** The workshop's spec and relic for this robot (`hub/workshop.ts`): sources on the unit (`dress`). */
  spec?: SpecId;
  relic?: string;
  /** Fed coal at the workshop for this mission (`sim/stoke.ts`). */
  stoked?: boolean;
}

export interface Bot {
  id: number;
  role: Role;
  name: string;
  x: number;
  y: number;
  /** Its oil: a robot's lifeblood (health). Shown as the black Oil bar. `maxHp` is its modified maximum (gear, rank, titles), kept in step by the Sim; the base is `ROLES[role].hp`. */
  hp: number;
  maxHp: number;
  /** Steam: what its weapon spends (the white Steam bar). Only the Communicator's is tracked. */
  steam: number;
  maxSteam: number;
  /** Seconds until steam starts building again. */
  steamT: number;
  /** 0..3; the Communicator is -1. */
  crew: number;
  /** Where a crew with no orders stands. */
  hold: Spot;
  /** Its own order, apart from its crew's (P3, `orderBots`): a point (robots ordered together share one), or 'follow' (it trails the Communicator); `assign` gives it back to its crew. */
  own?: Spot | 'follow';
  face: number;
  dead: boolean;
  /** A crew robot at 0 oil (P5, `downed.ts`): not dead, never destroyed. It lies where it fell (`by` null) or is carried (`by`: the carrier's id). */
  downed?: { by: number | null; /** A scripted wreck's own fix time (level 1's Bellows: `LEVEL1.fix`) and that standing up gives its core. */ fix?: number; wreck?: true; /** A type wreck (`downed.ts` `layWreck`): mended, its type is found (`Sim.found`). */ found?: true };
  state: 'idle' | 'move' | 'gather' | 'fight' | 'repair';
  /** What a gathering robot works at (the seep it siphons, the ruin it digs in): the view turns it that way. */
  work?: Spot;
  target: number;
  cd: number;
  moving: boolean;
  path: number[];
  pathGoal: number;
  pathT: number;
  /** Seconds since its last gather/heal event (throttles them). */
  fxT: number;
  /** Seconds of work put into the coal lump it is mining (`Sim.mine`). */
  mineT?: number;
  /** Seconds until it may speak again. */
  barkT: number;
  /** The oil a second the twisted halos it stands in drain (their slow is a held change on its speed stat: `auras`). */
  auraDps: number;
  /** Oil drained by auras that has not yet been spent (spent whole, quietly). */
  auraAcc: number;
  /** On a spider's cable (`spider.ts`): whose, and seconds left. */
  web?: { by: number; t: number };
  /** A called robot (the Brass Guard): seconds before it is hauled back up. Not crew: it never goes home or counts as lost. */
  ttl?: number;
  /** A place's own robot (P36: the Lost Expedition's husks): not crew, not called; its place moves it. */
  place?: PlaceId;
  /** Its id in the hub's roster (`hub/workshop.ts`): who comes home, who is left behind. */
  uid?: string;
  /** Its workshop rank (`sim/bots.ts`) and the relic it wears (`sim/junk.ts`). */
  rank?: number;
  relic?: string;
  /** Stoked for this mission (`sim/stoke.ts`): faster, and a Firebrand's damage and fire are up. */
  stoked?: boolean;
  /** Struck by a love-bot's heart (`FoeDef.onHit` Taunted): it runs to that foe while Taunted, whatever its job. */
  lure?: number;
  /** Its spec (the roster's; `botai.ts` reads its behaviour keys, `dress` puts its sources on it). */
  spec?: SpecId;
  /** What its AI is thinking (`botai.ts`). */
  mind?: Mind;
  /** Kicked along (`crash.ts`): it slides and cannot act until it stops. */
  fling?: BotFling;
  /** A Stalker that is hiding (`botskills.ts` `stealthStep`): foes do not see it until it strikes. */
  hidden?: boolean;
  /** Wears spider legs (P53, `path.ts` `climbable`): it walks onto rock, shoots 20% farther from it, and a cable does not hold it. Set by `Sim.dress`. */
  climbs?: boolean;
}

/** What a hornet is doing besides flying at its target: a twisted one's dash (tell, go), a boss's attacks. */
export interface Brain {
  state: 'roam' | 'tell' | 'go' | 'tellVolley' | 'tellCharge' | 'tellSummon' | 'charge' | 'tellQuake' | 'tellSlam' | 'slam' | 'stuck' | 'shift';
  /** Seconds left in this state. */
  t: number;
  /** Dashes still to chain, or a boss's attack count. */
  left: number;
  /** The direction of a dash or charge. */
  dx: number;
  dy: number;
  /** Who a charge has already struck. */
  hit: number[];
  rage: boolean;
  orbit: number;
  /** A boss's move owed after a break: it winds this up next, ahead of its cycle (`BossBreak.then`). */
  owe?: BossMove;
}

export interface Hornet {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  vx: number;
  vy: number;
  target: number;
  cd: number;
  nest: number;
  dead: boolean;
  wob: number;
  elite: boolean;
  kind: Enemy;
  /** A ranged one's seconds to its next plasma bolt (`FOES[kind].ranged`). */
  gunT: number;
  /** A boss that guards a place (the Harbinger's keep): it hunts no one farther than `CASTLE.leash` from here and returns to it. */
  home?: Spot;
  /** With `home`: how close wakes it and how far it hunts (tiles; `leash.ts`). */
  leash?: { wake: number; tiles: number };
  /** Night: warped by the dark (aura, dashes). The boss is one too. */
  twisted: boolean;
  /** Menacing (past midnight; rolled at spawn by the clock's `menacing` share): it carries the berserk steps (`bz`), and wears more eyes and a bigger halo. Not set on a boss or before midnight. */
  menacing?: boolean;
  boss: boolean;
  /** Its tier (P12; 1 when unset) and an elite's traits, and the small flag of a split hornet or spiderling (`sim/tiers.ts`). */
  tier?: number;
  traits?: TraitId[];
  small?: boolean;
  /** A land's Warden (P18; `tiers.ts` `warden`): at tier III it is Heavy. */
  warden?: boolean;
  /** A twisted rattler's next possible blink (`Sim.time`; the Blinker counter, `tiers.ts` `blinks`). */
  blinkAt?: number;
  ts?: TierState;
  /** The berserk step it was spawned in and what that gave it (`BERSERK`; a boss has none, `Sim.berserk(h)` gives it the steps so far). */
  step?: number;
  bz?: BerserkMul;
  /** The breaks it has taken, in order (P13, `tiers.ts` `breakCheck`; an elite or a boss without a form): what it can no longer do. A form boss's one break is `'form'`. */
  breaks?: (BreakId | 'form')[];
  /** An elite's two limbs (P50, `limbs.ts`): claws when twisted, tentacles when menacing; none otherwise. */
  limbs?: Limb[];
  /** A twisted hornet's Dark streak, growing behind its dash (`tiers.ts`). */
  streak?: Patch;
  /** Burrowed (P12's Burrow and ambush): drawn hidden, and nothing reaches it (`setUnder`). */
  under?: boolean;
  /** Hit radius and sting reach, px. */
  r: number;
  reach: number;
  brain: Brain;
  /** Arrived from off the map (`spawnAtRim`): it has no hive to go home to, so it hunts the nearest robot from anywhere. `rimIn` once it has stepped off the rock rim (P31). */
  rim?: boolean;
  rimIn?: boolean;
  /** A spider's own state (`spider.ts`): its mode, heading, lift and leap. */
  spider?: SpiderState;
  /** The tusked caterpillar's own state (`caterpillar.ts`): its attack's mode, head, jaw, coil and lunge. */
  grub?: GrubState;
  /** A boss in its second form (`BossDef.phase2`), and when it may next try to change (after a kick stopped it). */
  phase?: 1 | 2;
  shiftAt?: number;
  /** A boss's shockwave ring, growing (`BossDef.quake`); who it has struck. */
  quake?: { x: number; y: number; r: number; hit: number[] };
  /** A boss off the ground in a leap or dive: where it will land. Nothing reaches it up there. */
  slam?: { x: number; y: number };
  air?: boolean;
  /** A form-changing boss: when it next changes (`phase2.every`, `stay`), whether the half-health change is done, and whether its dive lands it back in its first form. */
  formAt?: number;
  halved?: boolean;
  landing?: boolean;
  /** A dusk boss holding its arena (until midnight). */
  arena?: string;
  /** The boss it throws scrap to (the Ironback's monkeys), and its seconds to the next throw. */
  feeds?: number;
  feedT?: number;
  /** A boss veiled (`BossDef.veil`): nothing lands on it; seconds to the next change. */
  veiled?: boolean;
  veilT?: number;
  /** Whistled over by a mall-cop drone (`FoeDef.alarm`), or come with a hunter pack: it hunts farther until this time. */
  alertT?: number;
  /** Echoing: a noise it is walking to (until when; `field` is the floor's distances from there, shared by everyone who heard it). */
  hear?: { x: number; y: number; until: number; field: Float32Array };
  /** A hair dryer's gust (`junkplay.ts`): until this time its twisted aura is off and it starts no dash. */
  quietT?: number;
  /** A burrower (`FoeDef.burrow`, the driller): the time until which it stays up after a lunge (it is `under` the rest of the time). */
  upT?: number;
  /** A shy one (`FoeDef.shy`) standing still while the Communicator aims at it. */
  still?: boolean;
  /** Sent flying by a kick (`crash.ts`): who by, and who it has struck. */
  fling?: Fling;
  /** The Stalker that last struck it from behind (`botskills.ts`): a kill by that blow is a kill from behind. */
  backBy?: number;
  /** Asleep, owned by this place (`placeparts.ts`, shared mechanic A): it stands still until a hit or a noise near it. */
  sleep?: PlaceId;
  /** Dazed for good (the intro's first Crawlcams, `intro.ts`): it cannot move or attack, but a kick still sends it flying. */
  dazed?: true;
  /** Calm (Where Hornets Go's old hornets): it hunts no one, crews leave it be, it drifts to `to` at `speed` px/s. */
  calm?: { x: number; y: number; speed: number };
  /** P31's biome kinds (`beasts.ts`): its beast mods (D32), the Mud tank's timer, a Grounded officer's charge, a monkey's stolen scrap and the edge it runs for, a bleater's rearing to scream and its herd's next scream. */
  mods?: BeastModId[];
  /** A Commuter walking in a rush hour's crowd (`commute.ts`): the rush hour's number. */
  commute?: number;
  mudT?: number;
  charge?: boolean;
  stolen?: number;
  flee?: { x: number; y: number };
  scream?: number;
  screamAt?: number;
  /** Until this time its twisted aura is off (the Lighthouse's beam), nothing else. */
  dimT?: number;
  /** The last time it crashed (`crash.ts`): the Strike Lanes count a roll's pins by it. */
  crashT?: number;
}

/** What a dash leaves behind it, from a `trail` effect (`SKILL_EFFECTS`): foes within `radius` of the Communicator's path take `then`, once each. */
export interface Trail {
  kind: string;
  owner: Bot;
  then: Action | Action[];
  radius: number;
  source: string;
  hit: Set<number>;
}

/** Someone who follows the Communicator and is not a crew robot: the Princess after the knight falls (she comes aboard if she reaches the lift), the Esteemed Ghost once freed (he only haunts). */
export interface Follower {
  bot: Bot;
  id: string;
  name: string;
  ghost?: boolean;
}

/** A hive. One a place made (`place`) is small (`scale`), and only the place wakes it, not the clock or the siphoning. */
export interface Nest {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  awake: boolean;
  dead: boolean;
  spawnT: number;
  scale: number;
  place?: PlaceId;
}

/** The land's one crude tap (a healing shrine; still `Sim.seeps`, a list of at most one, placed by `sites.ts`). `amount` is the oil left in it. */
export interface Seep {
  id: number;
  x: number;
  y: number;
  amount: number;
  max: number;
  kind: SiteKind;
}

/** A timed action in progress (`Sim.action`): a ruin searched or decoded, or a place's `UseDef`. `t` of `need` seconds done while he is in its zone. */
export interface UseAction {
  ruin?: Ruin;
  seam?: Seam;
  place?: PlaceRT;
  /** A downed robot's field fix (P5). */
  bot?: Bot;
  /** A limb lying on the ground, being grafted on (`graft.ts`). */
  graft?: Graft;
  t: number;
  need: number;
  reach: number;
  paused: boolean;
}

/** A coal seam (`COAL`): mined by gatherers, or slowly by the Communicator. `amount` is the coal left in it. */
export interface Seam {
  id: number;
  x: number;
  y: number;
  amount: number;
  max: number;
}

/** An old-tech ruin. One of the Parable Trail's three (`trail`: where it stands, outward from the lift) tells the verse it is searched at (`verse`: 0..2, by discovery order, not placement), with its line, bigger finds and the Oracle's word. */
export interface Ruin {
  id: number;
  /** Seconds of a gatherer's work put into stripping it (`strip`). */
  stripT?: number;
  x: number;
  y: number;
  kind: RuinKind;
  searched: boolean;
  /** Still lit (`RUIN_FINDS[kind].live`): decoded for insight, loudly (P30); breaking its walls never loses the decode. */
  live: boolean;
  decoded?: boolean;
  /** All its pieces are down (`props.ts`): a dead one gave up what was left of its find, a live one still decodes. */
  broken?: boolean;
  /** Its size class and so what it pays (`RUIN_PIECES`, `ruinPay`); none for a Parable Trail ruin. */
  size?: RuinSize;
  trail?: number;
  verse?: number;
  line?: string;
  bonus?: LootKind[];
  oracle?: string;
  /** What searching it always gives (a land file's `junk`). */
  junk?: string;
}

export interface Loot {
  id: number;
  x: number;
  y: number;
  kind: LootKind;
  /** Which hornet part, for kind 'part'. */
  part: PartKind | null;
  /** How much it is worth: scrap or copper in the pile, oil in a pickup (a can is `LOOT.oil`). */
  amt: number;
  t: number;
  dead: boolean;
  /** Seconds it is still being pulled to the Communicator (Magnet Head). */
  pull?: number;
}

/** A shot; `foe` ones are the enemy's (a boss's bolts) and hurt robots instead of hornets. */
export interface Shot {
  /** Its damage type (pierce when left out). */
  type?: DamageType;
  /** The Communicator's weapon that fired it, for the engine's `weapon` conditions. */
  weapon?: WeaponId;
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
  dead: boolean;
  big: boolean;
  by: number;
  foe: boolean;
  /** A spider's cable (`by` is the spider): it snares instead of hurting. */
  web?: boolean;
  /** Flies over rock and standing props (Over the Rocks: a marksman's shot at a Marked foe). */
  over?: boolean;
  /** Fired from rock by a legged robot (P53): it flies over the rock a robot may climb, as it must to leave the mesa it stands on. */
  high?: boolean;
  /** An enemy's shot that leaves a patch where it ends (`sim/tiers.ts`), applies this status to the robot it hits, or is a returning blade. */
  lay?: Lay;
  /** A twisted drone's bolt: it comes apart into smaller ones when its flight ends (`tiers.ts` `landed`). */
  split?: boolean;
  status?: StatusId;
  blade?: Blade;
  /** The Communicator's: the crit chance it was fired with (shown; the engine rolls it at the hit); `seen` the foes it has passed through (a ghost, or Keen's pierce); `pebble` a slingshot's scrap; `pierce` the foes it may still pass through. */
  crit?: number;
  seen?: number[];
  pebble?: boolean;
  pierce?: number;
  /** A robot's shell that shoves the foe it hits along its flight (px/s): a Cannoneer's (`cannonKnock`). */
  knock?: number;
  /** Weapon mods (`mods.ts`): bounces left (Ricochet Cog); a Pressure Valve bolt; a brass pigeon (`to` the foe it homes on, pecks left, seconds to the next). */
  ric?: number;
  valve?: boolean;
  pigeon?: { to: number; pecks: number; t: number };
}

export type Phase = 'mission' | 'rising' | 'done' | 'lost';

export interface Input {
  /** Movement, -1..1 each. */
  mx: number;
  my: number;
  /** Aim point in world px. */
  ax: number;
  ay: number;
  fire: boolean;
  /** The secondary weapon (right click). */
  fire2?: boolean;
  use: boolean;
  /** The kick (only with the `kick` perk). */
  kick?: boolean;
  /** The rear piece's dash and the pack piece's skill (`sim/gear.ts`). */
  dash?: boolean;
  skill?: boolean;
}

/**
 * What happened at a place (`e: 'place'`). P34's: open, free, climb, visit, descend, fallen, cables. P36's (`placeplay.ts`):
 * a sleeper woke, a grave lit and the calm's oil, an alarm on and off, a hornet settled or died there and the mourners,
 * a roll and a strike, a fire or a lamp lit and put out, a toll, a shell loaded, fired and landing, a sign read, people home.
 */
export type PlaceWhat =
  | 'open' | 'free' | 'climb' | 'visit' | 'descend' | 'fallen' | 'cables'
  | 'wake' | 'grave' | 'calm' | 'alarm' | 'quiet' | 'settle' | 'wing' | 'mourn' | 'roll' | 'strike'
  | 'lit' | 'out' | 'toll' | 'load' | 'fire' | 'land' | 'read' | 'home'
  /** P42's quest places: the compactor gives the boot, the flag is planted. */
  | 'give' | 'plant';

export type SimEvent =
  /** A robot, enemy or hive was destroyed. */
  | { e: 'die'; on: 'hornet' | 'nest' | 'bot'; x: number; y: number; bot?: Bot; h?: Hornet }
  /** A tier or trait at work: a front hit blocked (`block`), a Carapace flipped by a kick, a Brood letting its young out, a call for help. */
  | { e: 'tier'; what: TierEvent; x: number; y: number; h?: Hornet; hits?: number }
  /** An elite's limb winds up or strikes (P50): `side` which claw (a half) or tentacle, `hits` what the blow struck. */
  | { e: 'limb'; what: 'wind' | 'strike'; h: Hornet; limb: LimbKind; side: 1 | -1; hits?: number }
  /** Grafting (`graft.ts`): a limb dropped (`drop`), was grafted on or fell off (`on`, `off`), his limb winds up or strikes (`hits` foes struck). */
  | { e: 'graft'; what: 'drop' | 'on' | 'off' | 'wind' | 'strike'; kind: LimbKind; x: number; y: number; hits?: number }
  /** An elite or a boss broke (`n`th: 66% then 33% of its oil; a form boss's change is `form`): `what` it can no longer do, and the part it dropped on the spot. */
  | { e: 'break'; h: Hornet; n: 1 | 2; what: BreakId | 'form'; name: string; part: PartKind | null }
  /** A robot's choice the player should read (`botai.ts`): a sidestep, a brace, falling back, a target picked for a reason, an idle thing. */
  | { e: 'ai'; bot: Bot; what: AiWhat; x?: number; y?: number; to?: number; why?: string }
  /** A spider: climbs in over the rim, winds up (`tellWeb`, `tellPounce`), spits a cable, leaps, lands (`hits` robots struck at x, y), snares `bot`. */
  | { e: 'spider'; what: 'drop' | 'tellWeb' | 'web' | 'tellPounce' | 'leap' | 'land' | 'snare'; h: Hornet; x?: number; y?: number; bot?: Bot; hits?: number }
  /** The tusked caterpillar (`caterpillar.ts`): the spiral starts, the head lifts, it rears (the lunge's end at x, y), lunges, bites `bot`, rests. */
  | { e: 'grub'; what: GrubEvent; h: Hornet; x?: number; y?: number; bot?: Bot }
  /** A weapon found (`Sim.give`); `hand`: it went into the free secondary slot, else it is only owned. */
  | { e: 'found'; weapon: WeaponId; hand: boolean }
  /** Mission 1's old works (`intro.ts`): the shovel taken, a room done, the den or the lift opened, a free respawn. */
  | { e: 'intro'; what: 'shovel' | 'scrap' | 'tap' | 'bellows' | 'open' | 'lift' | 'respawn'; x?: number; y?: number }
  /** A repairer mended a robot (`from` mends `to`). */
  | { e: 'heal'; from: Bot; to: Bot }
  /** The mission changed phase (rising, done, lost). */
  | { e: 'phase'; phase: Phase }
  /** A robot says something. */
  | { e: 'bark'; bot: Bot; text: string }
  /** A robot joined mid-mission (a called guard). */
  | { e: 'joined'; bot: Bot }
  /** A called robot was hauled back up. */
  | { e: 'despawn'; bot: Bot }
  /** A relic at work (`junkplay.ts`): a slug tossed (to `tx`,`ty`) or splat, a hum, a cone or gust (heading `a`, reach `r`, width `w`), the way-finder's scenic route. */
  | { e: 'junk'; what: 'toss' | 'splat' | 'hum' | 'cone' | 'gust' | 'scenic' | 'swat' | 'pose' | 'flash' | 'sprinkle'; x: number; y: number; tx?: number; ty?: number; a?: number; r?: number; w?: number; by?: Bot }
  /** Something happens at a place (`placeplay.ts`): it opens, a robot is freed, the mast is climbed, a resting place is first seen. */
  | { e: 'place'; id: PlaceId; what: PlaceWhat; x: number; y: number; text?: string; n?: number }
  /** An ability at work (`botskills.ts`): a steam `cloud` or a `flare` set down (radius `r`, lasting `ttl` s), a Stalker's `stab` (`back`: from behind), a Stalker `hide`ing or `show`ing itself. */
  | { e: 'ability'; what: 'cloud' | 'flare' | 'stab' | 'hide' | 'show'; x: number; y: number; r?: number; ttl?: number; by?: Bot; back?: boolean }
  | BossEvent
  | CoalEvent
  | CombatEvent
  | CompanionEvent
  | ControllerEvent
  | DayEvent
  | DownedEvent
  | DungeonEvent
  | FoeEvent
  | FollowerEvent
  | LootEvent
  | ModEvent
  | OnboardEvent
  | OracleEvent
  | PropEvent
  | SupportEvent
  | UseEvent
  | WeatherEvent
  | TwistEvent
  | BeastEvent
  | CommuteEvent;

export const NO_INPUT: Input = { mx: 0, my: 0, ax: 0, ay: 0, fire: false, use: false };

/** Who wakes a hive when the clock does (not a robot's name). */
export const CLOCK = 'the clock';

/** A word with its first letter in capitals ("metro stop" -> "Metro stop"). */
export const upper = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/** The arguments of a system function after the sim: what the one-line delegates on `Sim` repeat, as `hurt(...a: Rest<typeof hurt>) { return hurt(this, ...a); }`. */
export type Rest<F> = F extends (sim: Sim, ...a: infer A) => unknown ? A : never;

/** The constructor's last argument: the landing on a land, or the dungeon below it. */
export interface SimOptions {
  /** This Sim is the biome's dungeon (`sim/dungeon.ts`), not a land: its rooms instead of the sands, no clock (the day stands at `dayT`, the land's), no hives; the lift is the way back up. A `DungeonSpec` (`dungeonSpec()` on the land) goes down that very dungeon; `true` takes the seed's. */
  dungeon?: boolean | DungeonSpec;
  /** The land's clock when the dungeon was entered. */
  dayT?: number;
  /** The call Q makes (`HubState.call`). */
  call?: SupportId;
  /** A handcrafted land's map (`loadLand`, `sim/lands.ts`) instead of the seed's generated one; its `rules` set the anomaly, the quiet morning, the dusk boss and the guided rescue (level 1). */
  land?: MapData;
  /** The land's threat tier (P40's landing). */
  tier?: number;
  /** The land's anomaly (a land only). */
  anomaly?: AnomalyId;
  /** Who the land's pilgrim place strands (`pilgrimIn`, hub/state.ts); null: no one; unset: the next NPC not aboard. */
  pilgrim?: string | null;
  /** The land's robots that rode down with him (D16), all in crew 0 with their oil; no crew commands below. */
  party?: PartyBot[];
  /** Who was following him up there (a freed pilgrim, the Princess, the Ghost) follows him down too. */
  followers?: { id: string; name: string; ghost?: boolean }[];
  /** The robots the mission starts with (the hub's roster; `START_CREW` without one). */
  crew?: CrewBot[];
  /** The dog's name (P42: the one the Communicator gave it; absent: "The dog"). */
  dogName?: string;
  /** Where the Princess is (P58): home, she talks on the antenna; gone, her lines come through static (`princessvoice.ts`). */
  wife?: 'none' | 'home' | 'stolen';
  /** The HUD starts empty (`empty`) with only what the save revealed (`shown`); default everything is up (`sim/onboard.ts`). */
  onboard?: { empty?: boolean; shown?: HudId[] };
  /** Missions flown before this one (the hub's `missions`): what is taught by now (`lessons.ts`); unset, everything is. */
  flown?: number;
  /** The Communicator's chassis from the workshop (`sim/bots.ts`). */
  chassis?: Stats;
  /** The titles earned (`hub/titles.ts`): their passives are sources. */
  titles?: string[];
  /** What `missionTitles` takes as its augment level. */
  augments?: number;
  /** The punch cards fitted at home (`hub/research.ts` `cardSources`): the Communicator's, each type's, and the keystone's on every unit. */
  cards?: CardSources;
  /** What the D-city's buildings that stand do in a mission (`hub/buildings.ts` `cityFx`). */
  city?: CityFx;
  /** What the mission knows of the quest book (P38): act 5's fragments and the stall's pack. */
  quest?: QuestOpts;
  /** The robot types already found or built (`hub/workshop.ts` `knownTypes`): a land's type wreck holds nothing for one of them. Unset: none known. */
  types?: string[];
  /** The names of every robot owned, wrecks included (`hub/workshop.ts`): level 1 lays Bellows at his wreck only when he is not among them (the intro mends him). */
  owned?: string[];
}
