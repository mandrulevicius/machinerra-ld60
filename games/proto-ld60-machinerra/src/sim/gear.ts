/**
 * Gear: what the Communicator and the crews wear, crafted at the workbench and kept in the inventory (I). Laimonas's
 * inventory and crafting (games/ludum-dare-60/docs/inventory.md). Plain TS, no Phaser: the item catalogue (`ITEMS`), the
 * qualities, the recipes, the `Gear` state (items owned, what is worn where) and the rules (craft, equip, the stats a
 * wearer ends up with). The Sim puts `gearSources(gear)` on its units as effect sources (`Sim.setGear`, `effects.ts`, the
 * source format: the model for how other content is written); `gearMods(gear)` is the same as numbers, only for the
 * inventory's display, and `gear.test.ts` proves the two agree. `syncWeapons` keeps the loadout's weapon slots and the gear
 * agreeing. The gear slice and its writer are `hub/carry.ts`.
 *
 * Every item is one of:
 * - a Communicator weapon (`weapon`, a `WEAPONS` entry; goes in the primary or secondary slot),
 * - a body part (`comm`, the Communicator's: head, arm, core, legs, rear, pack),
 * - a bot piece (`bot`: head, arms, back, mobility; `roles` limits it to some crews), worn by every bot of a crew role,
 * or both a Communicator and a bot piece (the hornet's head fits any robot).
 * Rear pieces give the dash ({dash}), pack pieces the active skill ({skill}). Quality scales every bonus. There are no stat
 * caps: stack what you like (armour has diminishing returns, `armourMul` in effects.ts; the soft counters answer stacks).
 *
 * Add an item: an `ItemId` and its `ITEMS` entry (stats, recipe, look, flavour), its icon in `src/gearart.ts`
 * (`ICONS`). The night recipes (P23) are made from `NIGHT` (a table): each is its base item plus one twisted part and a Dark
 * rider, id `<base>Night`, icon the base's in a dark wash, so a new night item is a `NIGHT` row. A new weapon also needs its `WEAPONS` entry; a new skill its `SKILLS` entry and its effects in `SKILL_EFFECTS`
 * (the controller only pays the steam and emits the trigger). An item's land (the inventory's filter, the card's "from") is
 * derived by `landsOf` from its shrine and its parts' foes. Each land has a crew set, one piece per role: a new land or role
 * gets its pieces (`gear.test.ts` checks).
 */
import { BIOMES, PARTS, TWISTED_PART, WEAPONS, type BiomeId, type Enemy, type PartKind, type TwistedPart, type WeaponId } from './defs';
import { MODS, MOD_IDS, modFits, type ModId } from './defs/mods';
import { KITS } from './dungeon';
import { canonType, type Action, type Cond, type Effect, type Source, type Stat, type StatAct } from './effects';

// ---- Quality ---------------------------------------------------------------------------------------------------------

export type Quality = 'standard' | 'fine' | 'rare' | 'epic' | 'legendary';
export const QUALITY_ORDER: Quality[] = ['standard', 'fine', 'rare', 'epic', 'legendary'];
/** `mult` scales every bonus (and a weapon's damage); `weight` is the chance of rolling it at the workbench. */
export const QUALITIES: Record<Quality, { name: string; mult: number; weight: number }> = {
  standard: { name: 'Standard', mult: 1, weight: 60 },
  fine: { name: 'Fine', mult: 1.15, weight: 25 },
  rare: { name: 'Rare', mult: 1.3, weight: 10 },
  epic: { name: 'Epic', mult: 1.5, weight: 4 },
  legendary: { name: 'Legendary', mult: 1.8, weight: 1 },
};

/** The quality a roll in [0, 1) lands on. */
export function rollQuality(u: number): Quality {
  const total = QUALITY_ORDER.reduce((s, q) => s + QUALITIES[q].weight, 0);
  let x = Math.min(0.999999, Math.max(0, u)) * total;
  for (const q of QUALITY_ORDER) {
    x -= QUALITIES[q].weight;
    if (x < 0) return q;
  }
  return 'standard';
}

// ---- Slots, tags, stats, skills --------------------------------------------------------------------------------------

export type CommSlot = 'primary' | 'secondary' | 'head' | 'arm' | 'core' | 'legs' | 'rear' | 'pack' | 'heart';
/** `heart` is the Second Heart (P52, Gasket's gift): a second core, there only once `Gear.heart` is set (`commSlots`); it takes the pieces a core takes. */
export const COMM_SLOTS: CommSlot[] = ['primary', 'secondary', 'head', 'arm', 'core', 'legs', 'rear', 'pack', 'heart'];
/** The slots he has: all of them but the Second Heart until Gasket has put it in. */
export const commSlots = (g: Pick<Gear, 'heart'>): CommSlot[] => COMM_SLOTS.filter((s) => s !== 'heart' || g.heart);
export type BotSlot = 'head' | 'arms' | 'back' | 'mobility';
export const BOT_SLOTS: BotSlot[] = ['head', 'arms', 'back', 'mobility'];
export type CrewRole = 'gatherer' | 'guard' | 'repairer' | 'mule' | 'marksman' | 'boilermancer' | 'lamplighter' | 'stalker';
export const CREW_ROLES: CrewRole[] = ['gatherer', 'guard', 'repairer', 'mule', 'marksman', 'boilermancer', 'lamplighter', 'stalker'];
export const SLOT_NAMES: Record<CommSlot | BotSlot, string> = {
  primary: 'Primary', secondary: 'Secondary', head: 'Head', arm: 'Arm', core: 'Core', legs: 'Legs', rear: 'Rear', pack: 'Pack', heart: 'Second heart',
  arms: 'Arms', back: 'Back', mobility: 'Mobility',
};

/** What the filters sort by. */
export type Tag = 'melee' | 'ranged' | 'armour' | 'speed' | 'crew' | 'aura' | 'skill' | 'steam' | 'mod';
export const TAGS: Tag[] = ['melee', 'ranged', 'armour', 'speed', 'crew', 'aura', 'skill', 'steam', 'mod'];
export const TAG_NAMES: Record<Tag, string> = { melee: 'Melee', ranged: 'Ranged', armour: 'Armour', speed: 'Speed', crew: 'Crew', aura: 'Aura', skill: 'Skill', steam: 'Steam', mod: 'Mod' };

/**
 * Percent unless `pts`. Armour is percent less damage taken (no cap: the damage multiplier just never goes below 0); plating
 * is points off every hit (never below 1); parry is the percent chance to negate a melee hit and Stagger the attacker.
 */
export type GearStat = 'dmg' | 'meleeDmg' | 'rangedDmg' | 'atkSpeed' | 'crit' | 'armour' | 'oil' | 'speed' | 'steam' | 'steamRegen' | 'accuracy' | 'range' | 'knock' | 'gather' | 'repair' | 'magnet' | 'plating' | 'parry';
export const STATS: Record<GearStat, { name: string; pts?: boolean }> = {
  dmg: { name: 'Damage' },
  meleeDmg: { name: 'Melee damage' },
  rangedDmg: { name: 'Ranged damage' },
  atkSpeed: { name: 'Attack speed' },
  crit: { name: 'Critical chance' },
  armour: { name: 'Armour' },
  oil: { name: 'Max oil', pts: true },
  speed: { name: 'Speed' },
  steam: { name: 'Max steam', pts: true },
  steamRegen: { name: 'Steam regen' },
  accuracy: { name: 'Accuracy' },
  range: { name: 'Range' },
  knock: { name: 'Knockback' },
  gather: { name: 'Work rate' },
  repair: { name: 'Repair rate' },
  magnet: { name: 'Loot pull' },
  plating: { name: 'Plating', pts: true },
  parry: { name: 'Parry' },
};
export type Stats = Partial<Record<GearStat, number>>;

/** Rear pieces give a dash ({dash}), pack pieces a skill ({skill}). `steam` it costs, `cd` seconds between uses. */
export type SkillId = 'dash' | 'afterburner' | 'brassGuard' | 'whistle' | 'shadeStep' | 'smokeDash';
export const SKILLS: Record<SkillId, { name: string; key: 'dash' | 'skill'; steam: number; cd: number; text: string }> = {
  dash: { name: 'Dash', key: 'dash', steam: 20, cd: 0.9, text: 'A short burst of straight-line movement, the way you are walking.' },
  afterburner: { name: 'Afterburner dash', key: 'dash', steam: 25, cd: 1.1, text: 'A dash that leaves a scalding trail: foes it passes take 14.' },
  brassGuard: { name: 'Call the Brass Guard', key: 'skill', steam: 40, cd: 75, text: 'Two warrior robots drop from the Wanderer and fight beside you for 60 seconds.' },
  shadeStep: { name: 'Shade Step', key: 'dash', steam: 25, cd: 1.2, text: 'A dash through the Ether: nothing hurts you while it lasts, and ghosts you pass through take 14.' },
  smokeDash: { name: 'Smoke dash', key: 'dash', steam: 25, cd: 1.1, text: 'A dash that leaves a bank of black smoke: foes it passes are Blinded.' },
  whistle: { name: 'Boiler Whistle', key: 'skill', steam: 30, cd: 7, text: 'A shriek of scalding steam all around you: 16 damage and a hard shove within 110 px.' },
};
/** The Brass Guard's numbers: how many drop, how long they stay. */
export const BRASS_GUARD = { n: 2, life: 60 };
export const WHISTLE = { r: 110, dmg: 16, knock: 520 };
export const DASH = { dist: 150, time: 0.16, burn: 14, burnR: 34 };

// ---- The catalogue ---------------------------------------------------------------------------------------------------

/** What an item costs at the workbench: scrap (the economy's) and parts (the hub's stores). Its old crude half is in the scrap. */
export interface Recipe { scrap: number; parts?: Partial<Record<PartKind, number>> }

export interface ItemDef {
  name: string;
  /** A Communicator weapon (primary or secondary slot). */
  weapon?: WeaponId;
  /** A weapon mod (P57, `defs/mods.ts`): fitted on a weapon's lug, not worn in a slot; no quality. */
  mod?: ModId;
  /** A body part (the Communicator's) and its slot. */
  comm?: Exclude<CommSlot, 'primary' | 'secondary' | 'heart'>;
  /** A bot piece and its socket; `roles` limits it to some crews (absent: any robot). */
  bot?: BotSlot;
  roles?: CrewRole[];
  tags: Tag[];
  /** What it gives its wearer. */
  stats?: Stats;
  /** What it gives every bot while the Communicator wears it. */
  crew?: Stats;
  /** What it gives allies within `r` px of its wearer (not the wearer). */
  aura?: { r: number; stats: Stats };
  skill?: SkillId;
  /** Low-tier hornets (plain, not elite, twisted or a boss) leave its wearer alone. */
  calm?: boolean;
  /** Ghostly (the Ether, P44): its wearer's hits land on ghosts. */
  ghostly?: boolean;
  /** A lamp: with its `aura`, the wearer and the allies within the aura's radius are Lit (the `lamp` stat is the radius; the Sim applies the status, `Sim.lampStep`). */
  lamp?: boolean;
  /** A tag its wearer carries (a source tag): an antenna transponds the auto-trigger, a radar scope pins every signal on the map, a listening horn arrows the twisted arrivals. */
  provides?: 'antenna' | 'radar' | 'horn';
  /** Spare oil cans the pack holds beyond the usual (the Can Rack): the Sim adds them to the Communicator's cap. */
  cans?: number;
  /** Works only while the Communicator wears something that provides this. */
  needs?: 'antenna';
  /** What it does beyond stats, as effects (`effects.ts`): the leech gauntlet's heal on a melee hit, the frost pauldrons' immunity and Chilling kick. */
  effects?: Effect[];
  /** Worn by the Communicator: the workbench's scrap costs are this share less (the Sale sticker). The best one counts, they do not stack. */
  discount?: number;
  /** A gift, not a recipe: nobody teaches it at the workbench (the Main Brush is the Princess's, P58). */
  gift?: string;
  recipe: Recipe;
  /** How it looks on the wearer (the art brief, shown in the card). */
  look: string;
  /** For fun. */
  flavour: string;
}

export type BaseItemId =
  | 'mainBrush' | 'oldEarful'
  | 'shovel' | 'steamGun' | 'arcGun' | 'pistonCannon' | 'kettleScalder' | 'censerGun' | 'slingshot' | 'hornetSpear' | 'pipeWrench' | 'tazer' | 'rivetScatter' | 'fangWhip' | 'snakeskinPlating'
  | 'hornetHead' | 'kettleHelm' | 'monocle'
  | 'autoTrigger' | 'pistonFist' | 'gatlingCuff'
  | 'bellowsLungs' | 'boilerCorset' | 'gasketHeart'
  | 'brassShins' | 'springHeels' | 'magBoots'
  | 'rearVent' | 'afterburner'
  | 'supportAntenna' | 'steamWhistle' | 'scrapMagnet'
  | 'rivetRepeater' | 'autoloader' | 'deepHose' | 'wideNozzle'
  | 'lampOfFaith' | 'boilerHalo' | 'scrapPlating'
  | 'tankTreads' | 'pramWheels' | 'wingRig' | 'spiderLegs'
  | 'ectoRepeater' | 'ectoGauntlet' | 'ectoCoating' | 'shadeVent'
  | 'hookhand' | 'megaphone' | 'hemoFlail' | 'iceLance' | 'swanGlider' | 'saleSticker' | 'leechGauntlet' | 'frostPauldrons'
  // Each land's crew set (gatherer, guard, repairer, mule, marksman, boilermancer, lamplighter, stalker).
  | 'dowserEyes' | 'stingerBayonet' | 'sunParasol' | 'crawlerLegs' | 'snakeEyeScope'
  | 'tuskBore' | 'jawMantle' | 'swanDown' | 'grabberArms' | 'leydenSights'
  | 'briefcaseTank' | 'riotBadge' | 'whistleSiren' | 'cartChassis' | 'destrierStilts'
  | 'augerSiphon' | 'ramHelm' | 'bleatBeacon' | 'kiteRig' | 'frostBore'
  | 'veinHose' | 'scytheBracers' | 'leechNozzle' | 'swarmerHarness' | 'obsessionScope'
  | 'wispHood' | 'shadeMantle' | 'bansheeMister' | 'ghostGlide' | 'howlBarrel'
  | 'gaugeEyes' | 'waspLantern' | 'stingerBlades' | 'tuskBellows' | 'swanLantern' | 'monkeyRunners'
  | 'commuterBoiler' | 'badgeLamp' | 'chargerLegs' | 'frostPlate' | 'kiteLantern' | 'hornDaggers'
  | 'veinManifold' | 'droneLamp' | 'scytheKnives' | 'bansheeBellows' | 'wispLantern' | 'shadeShroud'
  // P23: the old augment list as body parts, the mitigation pieces, one arms piece for each of the four newest types, and the gear that gives a positive status.
  | 'radarScope' | 'lanternEyes' | 'listeningHorn' | 'thirdHand' | 'grapple' | 'furnaceCore' | 'smokeStack' | 'canRack' | 'botHarness' | 'rivetMail' | 'rivetedBuckler'
  | 'valveManifold' | 'longWick' | 'muffledKnuckles' | 'longRail'
  | 'bracingYoke' | 'hawkLens' | 'stokerGloves' | 'pressureVest' | 'leydenSpurs' | 'etchingTip';

export type ItemId = BaseItemId | `${NightBase}Night` | ModId;

const BASE_ITEMS: Record<BaseItemId, ItemDef> = {
  // -- Communicator weapons --
  // The Princess's gift as she comes home (P58 B); never on the workbench.
  mainBrush: {
    name: WEAPONS.mainBrush.name, weapon: 'mainBrush', tags: ['melee'], recipe: { scrap: 40 }, gift: 'princess', // the recipe is never taught; it is what salvage reads
    look: 'A spinning roller brush on a brass pole, bristles worn to one side, a little copper motor at the hub.',
    flavour: 'Her spare. Every swing is a full turn: small things go flying, loose scrap comes to heel. "Main brush stuck" was the first thing she ever asked for help with.',
  },
  // Hob's gift at the fifth step of his track (P52); never on the workbench.
  oldEarful: {
    name: WEAPONS.oldEarful.name, weapon: 'oldEarful', tags: ['ranged', 'steam'], recipe: { scrap: 150 }, gift: 'hob', // the recipe is never taught; it is what salvage reads
    look: 'A twin-bore brass blunderbuss with two bell mouths, a barrel-stave stock, and a dented ear trumpet bolted to the breech.',
    flavour: 'Forty years in the making. A wide cone that sends whatever it hits flying into whatever is behind it. So loud the nearest hive wakes to see what the fuss is.',
  },
  shovel: {
    name: WEAPONS.shovel.name, weapon: 'shovel', tags: ['melee'], recipe: { scrap: 10 },
    look: 'A plain spade with a riveted collar.',
    flavour: 'Digs coal, digs graves, digs hornets out of the air. The Old Way in one tool.',
  },
  steamGun: {
    name: WEAPONS.steamGun.name, weapon: 'steamGun', tags: ['ranged', 'steam'], recipe: { scrap: 140 },
    look: 'A long brass barrel fed by a hose from the pack; it vents a puff with every bolt.',
    flavour: 'Every shot is a little prayer of pressure. Hob swears it is not a heresy if you build it yourself.',
  },
  // The other lands' shrine guns (`BIOMES.<biome>.shrine`): found under glass there, or copied at the workbench from that land's parts.
  arcGun: {
    name: WEAPONS.arcGun.name, weapon: 'arcGun', tags: ['ranged', 'steam'], recipe: { scrap: 115, parts: { 'boar-tusk': 2 } },
    look: 'Two Leyden jars on a brass stock, a copper horn for a muzzle; a boiler-driven dynamo whirs under the grip.',
    flavour: 'The Rustwood shrine kept it for the boars. Lightning in a jar, and when it is lucky it jumps to the next beast. Hob calls it "weather".',
  },
  pistonCannon: {
    name: WEAPONS.pistonCannon.name, weapon: 'pistonCannon', tags: ['ranged', 'steam'], recipe: { scrap: 110, parts: { 'charger-legs': 2 } },
    look: 'A fat iron barrel driven by a single great piston; it kicks back into the shoulder and hisses for a long while after.',
    flavour: 'One slug, one commuter, one less meeting. Slow to load and worth the wait.',
  },
  kettleScalder: {
    name: WEAPONS.kettleScalder.name, weapon: 'kettleScalder', tags: ['ranged', 'steam'], recipe: { scrap: 110, parts: { 'bleater-box': 2 } },
    look: 'A copper kettle on a pistol grip with a flared spout; it whistles before every spray.',
    flavour: 'A fan of boiling water at close range. On the Frostspine it is a weapon, a heater and a tea service.',
  },
  censerGun: {
    name: WEAPONS.censerGun.name, weapon: 'censerGun', tags: ['ranged', 'steam'], recipe: { scrap: 140, parts: { 'swarmer-wing': 2 } },
    look: 'A swinging brass censer welded to a barrel; it trails incense smoke and spits blessed embers.',
    flavour: 'The Oracle blessed every ember herself. The vampires of the Wastes have opinions about that, briefly.',
  },
  slingshot: {
    name: WEAPONS.slingshot.name, weapon: 'slingshot', tags: ['ranged'], recipe: { scrap: 30, parts: { 'hornet-wings': 1 } },
    look: 'A forked pipe with a tiny boiler at the grip; the pouch is a hornet-wing membrane. Steam snaps it back.',
    flavour: 'Shoots scrap. Yes, the scrap you came for. On a lucky shot the bolt ricochets off one hornet into the next, and the engineers call that a sermon.',
  },
  hornetSpear: {
    name: WEAPONS.hornetSpear.name, weapon: 'hornetSpear', tags: ['melee'], recipe: { scrap: 45, parts: { 'hornet-stinger': 2 } },
    look: 'Two hornet stingers lashed to a length of drainpipe with copper wire. Taller than you.',
    flavour: 'Slow, long, and it shoves whatever it meets into next week. Poke from where the hornets cannot.',
  },
  pipeWrench: {
    name: WEAPONS.pipeWrench.name, weapon: 'pipeWrench', tags: ['melee'], recipe: { scrap: 35 },
    look: 'A red pipe wrench the size of your leg; it clanks on every swing.',
    flavour: 'Tightens bolts. Loosens hornets. Hob keeps three, "for diplomacy".',
  },
  tazer: {
    name: WEAPONS.tazer.name, weapon: 'tazer', tags: ['melee'], recipe: { scrap: 75, parts: { 'drone-optics': 1 } },
    look: 'A black plastic stun baton, wrapped in prayer tape so nobody has to touch the heresy. Blue sparks crawl along it.',
    flavour: 'A wireless abomination. It arcs from one foe to the next two. The Oracle pretends not to see it on your belt.',
  },
  rivetScatter: {
    name: WEAPONS.rivetScatter.name, weapon: 'rivetScatter', tags: ['ranged', 'steam'], recipe: { scrap: 70, parts: { 'hornet-stinger': 1 } },
    look: 'A bell-mouthed blunderbuss with a rivet hopper on top.',
    flavour: 'Five rivets in a cone. At close range, a whole hornet swarm becomes loose hardware.',
  },

  // -- The Ether's (P44): ghostly things, made from what the ghosts drop once the Esteemed Ghost lets you hit them --
  ectoRepeater: {
    name: WEAPONS.ectoRepeater.name, weapon: 'ectoRepeater', tags: ['ranged'], recipe: { scrap: 60, parts: { 'wisp-lantern': 3 } },
    look: 'A pepperbox of wisp lanterns on a brass grip; each barrel glows cold blue and the bolts leave a faint violet smear.',
    flavour: 'Ghost bullets: scrap dipped in wisp-light. They hit ghosts whoever fires them, and everything else as well as any bolt.',
  },
  ectoGauntlet: {
    name: 'Ectoplasm gauntlet', comm: 'arm', tags: ['melee', 'ranged'], stats: { dmg: 4 }, ghostly: true,
    recipe: { scrap: 40, parts: { 'shade-cloak': 2 } },
    look: 'A glove of shade-cloak stitched over a brass hand; everything it holds goes a little see-through.',
    flavour: 'Whatever you hold in it remembers it was once a ghost. Your shovel, your gun, your boot: they all land on the ethereal.',
  },
  ectoCoating: {
    name: 'Ecto-coating', bot: 'back', tags: ['crew'], stats: { dmg: 4 }, ghostly: true,
    recipe: { scrap: 35, parts: { 'banshee-vent': 1, 'shade-cloak': 1 } },
    look: 'A spray rig on the back that keeps the robot misted in cold violet; its tools shimmer.',
    flavour: 'Fits any robot. A coat of banshee breath on everything it swings or shoots: your crews can hit ghosts too.',
  },
  shadeVent: {
    name: 'Shade vent', comm: 'rear', tags: ['speed', 'skill'], stats: { speed: 4 }, skill: 'shadeStep',
    recipe: { scrap: 45, parts: { 'shade-cloak': 2, 'wisp-lantern': 1 } },
    look: 'A rear vent wrapped in shade-cloak; when it fires, you go dark and thin for a heartbeat.',
    flavour: 'The Shade Step: dash through the Ether, untouchable, and whatever ghost you pass through feels it.',
  },
  fangWhip: {
    name: WEAPONS.fangWhip.name, weapon: 'fangWhip', tags: ['melee'], recipe: { scrap: 80, parts: { 'snake-skin': 4, 'rattlejaw-fang': 1 } },
    look: 'A long segmented brass tail with a rattle at the grip and a dripping fang at the tip; it rattles when you swing it.',
    flavour: "Old Rattlejaw's own tail. A wide lash that leaves its venom in everything it touches. Found at the bottom of the desert's snake shaft; the engineers can copy it if you bring them another fang.",
  },

  // -- Communicator: head --
  hornetHead: {
    name: "Robot hornet's head", comm: 'head', bot: 'head', tags: ['armour'], stats: { armour: 8 }, calm: true,
    recipe: { scrap: 20, parts: { 'hornet-head': 3 } },
    look: 'A hollowed mechahornet head worn like a bucket hat, mandibles over the eyes, one LED still blinking.',
    flavour: 'Fits any robot. Plain hornets take you for one of theirs and fly on by. Elites and the twisted are not fooled.',
  },
  kettleHelm: {
    name: "Kettle helm", comm: 'head', tags: ['armour', 'steam'], stats: { armour: 6, steam: 15 },
    recipe: { scrap: 35 },
    look: 'A dented copper kettle on the head, the spout to one side; it whistles when your steam is full.',
    flavour: 'Tea was a heresy too, once. Now it is a helmet.',
  },
  monocle: {
    name: "Grandpa's targeting monocle", comm: 'head', tags: ['ranged'], stats: { crit: 10, range: 10 },
    recipe: { scrap: 30, parts: { 'drone-optics': 1 } },
    look: 'A brass monocle on a folding arm with three lenses to flip; one of them is a drone eye.',
    flavour: 'Grandpa saw every weak rivet through it. Grandpa was a toaster, but still.',
  },

  // -- Communicator: arm --
  autoTrigger: {
    name: "Auto-triggering system", comm: 'arm', tags: ['crew'], crew: { accuracy: 40, atkSpeed: 20, dmg: 20 }, needs: 'antenna',
    recipe: { scrap: 50, parts: { 'hornet-head': 1, 'hornet-stinger': 1 } },
    look: 'A wrist cuff of clicking relays and a punched card; every bot fires a beat after it clicks.',
    flavour: 'Your crew shoot straighter, faster and harder, but only if an antenna on you can transpond the clicks.',
  },
  pistonFist: {
    name: "Piston fist", comm: 'arm', tags: ['melee'], stats: { meleeDmg: 25, knock: 40 },
    recipe: { scrap: 45 },
    look: 'A piston strapped along the forearm; it kicks out with every swing, puffing steam.',
    flavour: 'Every swing gets a second push from the boiler. The shovel never saw it coming.',
  },
  gatlingCuff: {
    name: "Gatling cuff", comm: 'arm', tags: ['ranged'], stats: { atkSpeed: 20, rangedDmg: 5 },
    recipe: { scrap: 40, parts: { 'hornet-stinger': 1 } },
    look: 'A hand-cranked cuff of gears around the trigger hand, spinning as you shoot.',
    flavour: 'Crank faster, shoot faster. Physics is a suggestion; the Old Way is a promise.',
  },

  // -- Communicator: core --
  bellowsLungs: {
    name: "Bellows lungs", comm: 'core', tags: ['steam'], stats: { steam: 40, steamRegen: 20 },
    recipe: { scrap: 60 },
    look: 'Two leather bellows on the chest, wheezing in and out as you walk.',
    flavour: 'More steam, sooner. You will hear yourself breathe for the first time in your life.',
  },
  boilerCorset: {
    name: "Boilerplate corset", comm: 'core', tags: ['armour'], stats: { armour: 18, speed: -10 },
    recipe: { scrap: 45 },
    look: 'Boiler plate bent around the chest and laced up the back like a corset.',
    flavour: 'Heavy. Hot. Takes a hornet sting like a gentle breeze. Choose: fast, or alive.',
  },
  gasketHeart: {
    name: "Gasket heart", comm: 'core', tags: ['armour'], stats: { oil: 30 },
    recipe: { scrap: 80 },
    look: 'A bigger oil tank behind a little round window on the chest, sloshing.',
    flavour: 'Dr. Gasket\'s favourite. More oil in, longer before it all leaks out.',
  },

  snakeskinPlating: {
    name: 'Snakeskin plating', comm: 'core', bot: 'back', tags: ['armour', 'speed'], stats: { armour: 12, speed: 4 },
    recipe: { scrap: 20, parts: { 'snake-skin': 3 } },
    look: "Overlapping brass scales riveted on in rows; they ripple like a snake's when you move.",
    flavour: "It's metal plating, but you can still move like a snake. Armour that does not slow you down: the rattlers of the desert shaft drop the skins.",
  },
  // The other dungeons (games/ludum-dare-60/docs/dungeons.md): each one's material makes a piece, and its mini-boss drops a
  // weapon the workbench can copy with one more of its unique part (as the fang whip).
  swanGlider: {
    name: 'Swan-wing glider', comm: 'rear', tags: ['skill', 'armour', 'speed'], skill: 'dash', stats: { speed: 6 },
    effects: [
      { when: 'always', do: { do: 'stat', stat: 'immune:staggered', add: 1 } },
      { when: 'always', if: { is: 'via', via: ['quake', 'slam', 'crash'] }, do: { do: 'stat', stat: 'damageTaken', pct: -0.4 } },
    ],
    recipe: { scrap: 30, parts: { 'swan-feather': 3 } },
    look: 'Two folded wings of white-painted copper feathers on a spring frame, strapped on behind; they snap open when you fall.',
    flavour: 'Falls and knockbacks become a glide: you are never Staggered, and rings, landings and crashes hurt less. The Tunnel of Love\'s swans never flew either.',
  },
  saleSticker: {
    name: 'Sale sticker', comm: 'head', tags: [], discount: 0.1, stats: { magnet: 10 },
    recipe: { scrap: 25, parts: { 'price-tag': 3 } },
    look: 'A big red price tag stuck to the forehead. It reads 10% OFF, in three languages.',
    flavour: 'While you wear it, everything at the workbench costs a tenth less scrap. The engineers do not know why it works. Neither does the mall.',
  },
  leechGauntlet: {
    name: 'Leech-mouth gauntlet', comm: 'arm', bot: 'arms', tags: ['melee'], stats: { meleeDmg: 5 },
    effects: [{ when: 'hit', if: { is: 'via', via: 'melee' }, cd: 0, do: { do: 'heal', amount: 2 } }],
    recipe: { scrap: 30, parts: { 'leech-mouth': 3 } },
    look: 'A brass glove with a ring of leech teeth set round the knuckles; a little pump ticks on the wrist.',
    flavour: 'Every melee hit drinks a little oil back for you. The Bishop\'s leeches, put to honest work.',
  },
  frostPauldrons: {
    name: 'Frost-carapace pauldrons', comm: 'core', bot: 'back', tags: ['armour'], stats: { armour: 8 },
    effects: [
      { when: 'always', do: [{ do: 'stat', stat: 'immune:chilled', add: 1 }, { do: 'stat', stat: 'immune:frozen', add: 1 }] },
      { when: 'hit', if: { is: 'via', via: 'kick' }, cd: 0, do: { do: 'status', id: 'chilled', stacks: 2 } },
    ],
    recipe: { scrap: 30, parts: { 'frost-carapace': 3 } },
    look: 'Two rimed mite shells on the shoulders, frost smoking off them.',
    flavour: 'You never get Chilled, and what you kick is. The cold has to go somewhere.',
  },
  hookhand: {
    name: WEAPONS.hookhand.name, weapon: 'hookhand', tags: ['ranged', 'steam'], recipe: { scrap: 80, parts: { 'swan-feather': 4, hookhand: 1 } },
    look: 'A brass hook on a cable, fired from an arm-winch; it reels back in with a ratchet.',
    flavour: 'Captain Croc\'s own hook. It pulls what it hits straight to you, which is either the plan or a mistake.',
  },
  megaphone: {
    name: WEAPONS.megaphone.name, weapon: 'megaphone', tags: ['ranged', 'steam'], recipe: { scrap: 80, parts: { 'price-tag': 4, 'cop-megaphone': 1 } },
    look: 'A dented white megaphone with a pistol grip and a steam horn bolted inside.',
    flavour: 'A cone of noise that shoves everything back and Staggers half of it. "THIS AREA IS CLOSED."',
  },
  hemoFlail: {
    name: WEAPONS.hemoFlail.name, weapon: 'hemoFlail', tags: ['melee', 'crew'], recipe: { scrap: 80, parts: { 'leech-mouth': 4, 'hemo-pump': 1 } },
    look: 'An organ pipe on a chain with a beating pump in the head; a gauge on the haft fills red.',
    flavour: 'Each hit fills the gauge; every sixth heals the crew round you. The Bishop played it as an instrument.',
  },
  iceLance: {
    name: WEAPONS.iceLance.name, weapon: 'iceLance', tags: ['melee'], recipe: { scrap: 80, parts: { 'frost-carapace': 4, 'ice-auger': 1 } },
    look: 'A long shaft with a spiral ice auger at the tip, frost smoking off it.',
    flavour: 'A long thrust that Chills every time; a third on a Chilled foe Freezes it solid. The Snowcat used it on the piste.',
  },

  // -- Communicator: legs --
  brassShins: {
    name: "Brass shins", comm: 'legs', tags: ['speed'], stats: { speed: 10 },
    recipe: { scrap: 25 },
    look: 'Polished brass shin guards that ring like little bells.',
    flavour: 'Ten percent faster, a hundred percent shinier.',
  },
  springHeels: {
    name: "Bedspring heels", comm: 'legs', tags: ['speed'], stats: { speed: 18, armour: -4 },
    recipe: { scrap: 30, parts: { 'hornet-wings': 1 } },
    look: 'Bedsprings under the feet: you boing a little with every step.',
    flavour: 'Fast and bouncy, and every hit knocks the springs loose.',
  },
  magBoots: {
    name: "Mag-boots", comm: 'legs', tags: ['armour'], stats: { armour: 8, speed: -5 },
    recipe: { scrap: 35 },
    look: 'Heavy boots with horseshoe magnets for soles; nails and bolts cling to them.',
    flavour: 'Planted. Stubborn. Picks up loose screws.',
  },

  // -- Communicator: rear (the dash) --
  rearVent: {
    name: "Posterior Pressure Vent", comm: 'rear', tags: ['skill', 'speed'], skill: 'dash', stats: { speed: 5, steam: -10 },
    recipe: { scrap: 30 },
    look: 'A brass exhaust bolted to the backside. It goes "pfft".',
    flavour: 'A fully sanctioned Old Way thruster, mounted aft. The engineers call the noise "a controlled pressure release". The colony\'s children call it something else. Do not fit facing the Oracle.',
  },
  afterburner: {
    name: "Afterburner exhaust", comm: 'rear', tags: ['skill', 'speed', 'melee'], skill: 'afterburner',
    recipe: { scrap: 80, parts: { 'hornet-wings': 1 } },
    look: 'Twin exhausts on the backside with a pilot light between them; the dash leaves a line of fire.',
    flavour: 'The posterior vent\'s louder cousin. Hornets behind you are now cooked hornets.',
  },

  // -- Communicator: pack (the skill) --
  supportAntenna: {
    name: "The support antenna", comm: 'pack', tags: ['skill', 'crew', 'armour', 'steam'], skill: 'brassGuard', provides: 'antenna', stats: { armour: 6, steamRegen: 15 },
    recipe: { scrap: 60, parts: { 'hornet-head': 2 } },
    look: 'A tall copper mast on the pack with a spinning dish; it hums and its tip glows when it calls.',
    flavour: 'Calls the Wanderer for two warrior robots, who drop on ropes and fight beside you for a minute. Also transponds anything that needs an antenna.',
  },
  steamWhistle: {
    name: "Boiler whistle", comm: 'pack', tags: ['skill', 'melee', 'steam'], skill: 'whistle',
    recipe: { scrap: 55 },
    look: 'A ship\'s steam whistle on the pack with a pull chain over the shoulder.',
    flavour: 'One shriek and everything near you is scalded and shoved away. The crew cover their ears. They have no ears.',
  },
  scrapMagnet: {
    name: "Scrap magnet", comm: 'pack', tags: ['speed'], stats: { magnet: 100 },
    recipe: { scrap: 30 },
    look: 'A red horseshoe magnet sticking up out of the pack, bits of scrap stuck to it.',
    flavour: 'Loot comes to you from twice as far. So do forks.',
  },

  // -- Bots: arms --
  rivetRepeater: {
    name: "Rivet repeater", bot: 'arms', roles: ['guard'], tags: ['ranged'], stats: { dmg: 30, range: 20 },
    recipe: { scrap: 35, parts: { 'hornet-stinger': 1 } },
    look: 'A long rivet gun on the guard\'s arm with a belt of rivets over the shoulder.',
    flavour: 'Guards hit harder and from farther. Every rivet blessed, every blessing billed.',
  },
  autoloader: {
    name: "Clockwork autoloader", bot: 'arms', roles: ['guard'], tags: ['ranged'], stats: { atkSpeed: 35 },
    recipe: { scrap: 40 },
    look: 'A clockwork drum on the guard\'s gun, ticking round as it feeds.',
    flavour: 'Wind it once a morning. It does the rest, faster than any guard can count.',
  },
  deepHose: {
    name: "Deep hose", bot: 'arms', roles: ['gatherer'], tags: ['speed'], stats: { gather: 50 },
    recipe: { scrap: 35 },
    look: 'A fatter, longer suction hose with a brass bell nozzle.',
    flavour: 'Gatherers work half again as fast. The heaps do not like it.',
  },
  wideNozzle: {
    name: "Wide nozzle", bot: 'arms', roles: ['repairer'], tags: ['crew'], stats: { repair: 40 },
    recipe: { scrap: 35 },
    look: 'A wide fan nozzle on the repair beam, spraying a fog of oil.',
    flavour: 'Repairers mend 40% faster. Messier, but nobody complains while they are leaking.',
  },

  // -- Bots: back --
  lampOfFaith: {
    name: "Lamp of Faith", bot: 'back', tags: ['aura', 'crew'], aura: { r: 120, stats: { dmg: 15 } }, lamp: true,
    recipe: { scrap: 65 },
    look: 'A tall church lantern on a pole on the bot\'s back; a warm halo on the sand around it.',
    flavour: 'Robots in its light fight 15% harder. The light is just a lamp. The faith is real.',
  },
  boilerHalo: {
    name: "Boiler halo", bot: 'back', tags: ['aura', 'armour', 'crew'], aura: { r: 120, stats: { armour: 10 } },
    recipe: { scrap: 45 },
    look: 'A ring of little boilers around a back-mounted mast, puffing a ring of steam.',
    flavour: 'Robots near it shrug off 10% of every hit, wrapped in warm, wet piety.',
  },
  scrapPlating: {
    name: "Scrap plating", bot: 'back', tags: ['armour'], stats: { armour: 12, speed: -8 },
    recipe: { scrap: 20 },
    look: 'Car doors and hubcaps riveted on as a shell, one still has a sticker.',
    flavour: 'Any robot. Heavy, ugly, and it works.',
  },

  // -- Bots: mobility --
  tankTreads: {
    name: "Tank treads", bot: 'mobility', tags: ['armour'], stats: { armour: 8, speed: -15 },
    recipe: { scrap: 25 },
    look: 'Little tank treads in place of the wheels, clanking.',
    flavour: 'Slow and sure. Nothing knocks a tracked bot over.',
  },
  pramWheels: {
    name: "Pram wheels", bot: 'mobility', tags: ['speed'], stats: { speed: 20 },
    recipe: { scrap: 20 },
    look: 'Big spoked pram wheels, squeaking.',
    flavour: 'Somebody\'s grandbot\'s pram. Now a war machine.',
  },
  wingRig: {
    name: "Hornet wing rig", bot: 'mobility', tags: ['speed'], stats: { speed: 30, oil: -20 },
    recipe: { scrap: 35, parts: { 'hornet-wings': 2 } },
    look: 'A pair of mechahornet wings on a brass rig; the bot hovers a hand above the sand, buzzing.',
    flavour: 'Fast, and fragile. The faithful look away when it flies over.',
  },
  // P53: the one piece that changes where a robot can stand. Speed is the plain wheels' (no bonus), the recipe a guess.
  spiderLegs: {
    name: "Spider legs", bot: 'mobility', tags: ['speed'], effects: [{ when: 'always', do: { do: 'flag', flag: 'climbs' } }],
    recipe: { scrap: 30, parts: { 'spider-legs': 2 } },
    look: 'Four brass legs on a hub under the body, stepping where the wheels would roll.',
    flavour: "It climbs the mesas, shoots farther from the top, and a Crawlcam's cable finds nothing to hold. Half as fast on rock.",
  },

  // -- Bots: each land's set, one piece for every crew role, made from what that land's machines drop (`landsOf`) --
  // The desert: hornets, the Crawlcam, the snake shaft.
  dowserEyes: {
    name: 'Crawlcam dowsing eyes', bot: 'head', roles: ['gatherer'], tags: ['speed'], stats: { gather: 35 },
    recipe: { scrap: 30, parts: { 'spider-lens': 1, 'hornet-head': 1 } },
    look: 'A cluster of Crawlcam lenses on a swivel over the gatherer\'s face, all of them staring at the ground.',
    flavour: 'The spider used them to find you. Now they find scrap under the sand, and the gatherer works a third faster.',
  },
  stingerBayonet: {
    name: 'Stinger bayonet', bot: 'arms', roles: ['guard'], tags: ['ranged'], stats: { dmg: 15 },
    effects: [{ when: 'hit', if: { is: 'via', via: 'gun' }, chance: 0.25, cd: 0, do: { do: 'status', id: 'punctured' } }],
    recipe: { scrap: 35, parts: { 'hornet-stinger': 2 } },
    look: 'Two hornet stingers clamped under the guard\'s barrel, pointing the same way the rivets go.',
    flavour: 'The rivets come out with a stinger\'s spite: a quarter of the guard\'s hits leave the foe Punctured.',
  },
  sunParasol: {
    name: 'Hornet-wing parasol', bot: 'back', roles: ['repairer'], tags: ['crew', 'aura', 'armour'], stats: { repair: 20 }, aura: { r: 100, stats: { armour: 6 } },
    recipe: { scrap: 35, parts: { 'hornet-wings': 2 } },
    look: 'A parasol of mechahornet wing membranes on a mast over the repairer\'s back; its shade is faintly blue.',
    flavour: 'Robots in its shade take less from every hit, and the repairer works cooler. The desert respects a parasol.',
  },
  crawlerLegs: {
    name: 'Crawlcam stilt-legs', bot: 'mobility', roles: ['mule'], tags: ['speed', 'armour'], stats: { speed: 25, armour: 4 },
    recipe: { scrap: 35, parts: { 'spider-legs': 1 } },
    look: 'Six of the Crawlcam\'s legs bolted under the mule\'s cart bed, tapping along in a ripple.',
    flavour: 'The mule scuttles now. The scrap does not spill. The crew pretend not to find it upsetting.',
  },
  snakeEyeScope: {
    name: 'Snake-eye scope', bot: 'head', roles: ['marksman'], tags: ['ranged'], stats: { crit: 15, range: 15 },
    recipe: { scrap: 40, parts: { 'snake-skin': 2, 'spider-lens': 1 } },
    look: 'A long scope wrapped in snake-skin scales, a slit-pupil lens glowing amber at the end.',
    flavour: 'A rattler waits for the moment. So does the marksman now, from farther, and more of its shots find the soft rivet.',
  },
  // The Rustwood Jungle: jaguars, boars, monkeys, the Tunnel of Love.
  tuskBore: {
    name: 'Tusk bore', bot: 'arms', roles: ['gatherer'], tags: ['speed'], stats: { gather: 45 },
    recipe: { scrap: 30, parts: { 'boar-tusk': 2 } },
    look: 'Two piston tusks twisted into a drill bit at the end of the hose; it rams down into the roots.',
    flavour: 'The boar dug for truffles. The gatherer digs for coal, almost half again as fast.',
  },
  jawMantle: {
    name: 'Piranha-jaw mantle', bot: 'back', roles: ['guard'], tags: ['armour', 'melee'], stats: { armour: 8 },
    effects: [{ when: 'hurt', cd: 0, if: { is: 'via', via: ['melee', 'saw'] }, do: { do: 'damage', type: 'pierce', amount: 5, to: 'target' } }],
    recipe: { scrap: 35, parts: { 'piranha-jaw': 2 } },
    look: 'A collar of spring-loaded piranha jaws round the guard\'s shoulders, snapping at nothing.',
    flavour: 'Whatever bites the guard gets bitten back, five a bite. The jaws were never fussy.',
  },
  swanDown: {
    name: 'Swan-down canopy', bot: 'back', roles: ['repairer'], tags: ['crew', 'aura', 'speed'], stats: { repair: 20 }, aura: { r: 110, stats: { speed: 10 } },
    recipe: { scrap: 35, parts: { 'swan-feather': 2 } },
    look: 'A heart-shaped canopy of white copper feathers over the repairer, a pink lamp under it.',
    flavour: 'Robots near it hurry about a little faster, smitten. The repairer mends a fifth faster. The Tunnel of Love never closed.',
  },
  grabberArms: {
    name: 'Long-arm grabbers', bot: 'arms', roles: ['mule'], tags: ['speed'], stats: { magnet: 80 },
    recipe: { scrap: 30, parts: { 'monkey-arm': 2 } },
    look: 'Two telescopic monkey arms on the mule\'s sides, reaching out for anything shiny.',
    flavour: 'The mule picks up loot from almost twice as far. Some of it was yours. It is still yours, technically.',
  },
  leydenSights: {
    name: 'Leyden-jar sights', bot: 'head', roles: ['marksman'], tags: ['ranged'], stats: { range: 10 },
    effects: [{ when: 'hit', if: { is: 'via', via: 'gun' }, chance: 0.2, cd: 0, do: { do: 'status', id: 'shocked' } }],
    recipe: { scrap: 50, parts: { 'boar-tusk': 1, 'monkey-arm': 1 } },
    look: 'A Leyden jar on each side of the marksman\'s head, a copper wire to the barrel; sparks crawl along it.',
    flavour: 'The Rustwood shrine\'s weather, in a hat: a fifth of its shots leave the foe Shocked.',
  },
  // The Hollow City: commuters, officers, destriers, the Galleria.
  briefcaseTank: {
    name: 'Briefcase tank', bot: 'back', roles: ['gatherer'], tags: ['armour'], stats: { gather: 25, oil: 15 },
    recipe: { scrap: 30, parts: { 'commuter-case': 2 } },
    look: 'Two briefcases riveted together on the gatherer\'s back as a tank, the hose going in through the lock.',
    flavour: 'A deeper tank and a thicker hide: the gatherer siphons faster and lasts longer. The sandwiches had to go.',
  },
  riotBadge: {
    name: 'Riot badge', bot: 'head', roles: ['guard'], tags: ['armour'], stats: { armour: 8, plating: 2 },
    recipe: { scrap: 35, parts: { 'officer-badge': 2 } },
    look: 'A riot visor with two badges for a brow, polished every morning.',
    flavour: 'Armour, and 2 off every hit. The officers never moved for anyone. Neither does the guard.',
  },
  whistleSiren: {
    name: 'Whistle siren', bot: 'head', roles: ['repairer'], tags: ['crew', 'aura', 'ranged'], stats: { repair: 25 }, aura: { r: 120, stats: { accuracy: 20 } },
    recipe: { scrap: 35, parts: { 'cop-whistle': 2 } },
    look: 'A cop whistle on a little steam lung over the repairer\'s head, a blue lamp turning on top.',
    flavour: 'Robots near it fall in line and aim straighter. The repairer mends a quarter faster, between whistles.',
  },
  cartChassis: {
    name: 'Shopping-cart chassis', bot: 'mobility', roles: ['mule'], tags: ['speed'], stats: { speed: 12, magnet: 60 },
    recipe: { scrap: 30, parts: { 'cart-wheel': 3 } },
    look: 'The mule rides a mall cart, the basket full of dented cans, one wheel squeaking.',
    flavour: 'Faster, and the loot rolls into the basket from farther. It pulls to the left. They all pull to the left.',
  },
  destrierStilts: {
    name: 'Destrier stilts', bot: 'mobility', roles: ['marksman'], tags: ['ranged', 'speed'], stats: { speed: 15, range: 10 },
    recipe: { scrap: 40, parts: { 'charger-legs': 2 } },
    look: 'The marksman on a destrier\'s long legs, high above the street, trotting.',
    flavour: 'It sees over the crowd, and gets about. Shoots from farther, moves faster.',
  },
  // The Frostspine: goats, bleaters, kites, the Glacier Hangar.
  augerSiphon: {
    name: 'Auger-bit siphon', bot: 'arms', roles: ['gatherer'], tags: ['speed'], stats: { gather: 55, speed: -5 },
    recipe: { scrap: 35, parts: { 'auger-bit': 2 } },
    look: 'A pair of auger bits spinning round the hose\'s mouth, frost chips flying.',
    flavour: 'Drills through the ice to the seam: the fastest digger there is, and heavy to carry about.',
  },
  ramHelm: {
    name: 'Ram-horn helm', bot: 'head', roles: ['guard'], tags: ['armour', 'melee'], stats: { armour: 6 },
    effects: [{ when: 'hurt', cd: 0, chance: 0.3, if: { is: 'via', via: ['melee', 'saw'] }, do: { do: 'status', id: 'staggered', to: 'target' } }],
    recipe: { scrap: 35, parts: { 'goat-horns': 2 } },
    look: 'A pair of curled ram horns on a riveted helm; the guard lowers its head when something comes close.',
    flavour: 'Hit the guard up close and a third of the time you get the horns: Staggered.',
  },
  bleatBeacon: {
    name: 'Bleat-box beacon', bot: 'head', roles: ['repairer'], tags: ['crew', 'aura'], stats: { repair: 25 },
    effects: [{ when: 'aura', r: 110, do: { do: 'stat', stat: 'immune:chilled', add: 1 } }],
    recipe: { scrap: 35, parts: { 'bleater-box': 2 } },
    look: 'Two bleat boxes on a pole over the repairer, bleating in turn; a warm steam ring puffs out with every bleat.',
    flavour: 'Robots near it are never Chilled: the bleating keeps them warm with fury. The repairer mends a quarter faster.',
  },
  kiteRig: {
    name: 'Kite-sail rig', bot: 'back', roles: ['mule'], tags: ['speed'], stats: { speed: 22 },
    recipe: { scrap: 30, parts: { 'kite-wings': 2 } },
    look: 'Two kite wings set as a sail on a mast over the mule; it leans into the wind.',
    flavour: 'Wind on the Frostspine is free. The mule sails, a fifth faster.',
  },
  frostBore: {
    name: 'Frost-bore barrel', bot: 'arms', roles: ['marksman'], tags: ['ranged'], stats: { range: 15 },
    effects: [{ when: 'hit', if: { is: 'via', via: 'gun' }, chance: 0.25, cd: 0, do: { do: 'status', id: 'chilled' } }],
    recipe: { scrap: 40, parts: { 'auger-bit': 1, 'frost-carapace': 1 } },
    look: 'A rifled barrel cut by an auger bit and sleeved in a mite\'s frosted shell; the bolts smoke cold.',
    flavour: 'Farther, and a quarter of its shots leave the foe Chilled. The Hangar\'s cold, posted to the enemy.',
  },
  // The Demon Wastes: swarmers, drones, the Blood Cistern.
  veinHose: {
    name: 'Vein-cable hose', bot: 'arms', roles: ['gatherer'], tags: ['speed', 'armour'], stats: { gather: 40 },
    effects: [{ when: 'siphon', cd: 1, do: { do: 'heal', amount: 2 } }],
    recipe: { scrap: 35, parts: { 'vein-cable': 2 } },
    look: 'A red vein cable for a hose, pulsing as the scrap goes by.',
    flavour: 'It siphons faster, and the gatherer drinks a little of what goes through: it heals while it works.',
  },
  scytheBracers: {
    name: 'Scythe-claw bracers', bot: 'arms', roles: ['guard'], tags: ['ranged'], stats: { dmg: 15 },
    effects: [{ when: 'kill', cd: 0, do: { do: 'heal', amount: 4 } }],
    recipe: { scrap: 35, parts: { 'swarmer-scythe': 2 } },
    look: 'Swarmer scythe claws folded along the guard\'s gun arm, red at the edges.',
    flavour: 'It hits harder, and every kill gives the guard back a little oil. The vampires taught it manners.',
  },
  leechNozzle: {
    name: 'Leech-mouth nozzle', bot: 'arms', roles: ['repairer'], tags: ['crew', 'armour'], stats: { repair: 35, oil: 10 },
    recipe: { scrap: 35, parts: { 'leech-mouth': 2 } },
    look: 'The repair beam comes out of a leech\'s mouth, ringed with little teeth.',
    flavour: 'It mends a third faster, and the repairer itself is harder to drain. The Bishop would be furious.',
  },
  swarmerHarness: {
    name: 'Swarmer-wing harness', bot: 'mobility', roles: ['mule'], tags: ['speed'], stats: { speed: 28, armour: -4 },
    recipe: { scrap: 30, parts: { 'swarmer-wing': 2 } },
    look: 'Two leathery swarmer wings on the mule\'s flanks; it skims the ash in hops.',
    flavour: 'The fastest mule in the Wastes, and a thin-skinned one.',
  },
  obsessionScope: {
    name: 'Obsession scope', bot: 'head', roles: ['marksman'], tags: ['ranged'], stats: { crit: 20 },
    effects: [{ when: 'hit', if: { is: 'via', via: 'gun' }, chance: 0.15, cd: 0, do: { do: 'status', id: 'dread' } }],
    recipe: { scrap: 55, parts: { 'drone-optics': 2 } },
    look: 'A drone\'s obsession optics as a scope, its red eye never blinking.',
    flavour: 'It finds the weak rivet more often, and what it stares at feels it: some of its shots fill the foe with Dread.',
  },
  // The Ether: wisps, shades, banshees.
  wispHood: {
    name: 'Wisp-lit hood', bot: 'head', roles: ['gatherer'], tags: ['aura', 'crew'], stats: { gather: 25 }, aura: { r: 90, stats: { armour: 5 } }, lamp: true,
    recipe: { scrap: 35, parts: { 'wisp-lantern': 2 } },
    look: 'A hood with a wisp lantern on each side, casting cold blue light on the seep.',
    flavour: 'It lights the gatherer\'s seep and the robots round it, and they take a little less in its light.',
  },
  shadeMantle: {
    name: 'Shade-cloak mantle', bot: 'back', roles: ['guard'], tags: ['armour'], stats: { armour: 10 }, ghostly: true,
    recipe: { scrap: 40, parts: { 'shade-cloak': 2 } },
    look: 'A tattered shade cloak round the guard\'s shoulders, its rivets showing through it.',
    flavour: 'Armour, and its hits land on ghosts: a guard half in the Ether itself.',
  },
  bansheeMister: {
    name: 'Banshee mister', bot: 'arms', roles: ['repairer'], tags: ['crew', 'aura'], stats: { repair: 25 },
    effects: [{ when: 'aura', r: 110, do: { do: 'stat', stat: 'immune:dread', add: 1 } }],
    recipe: { scrap: 40, parts: { 'banshee-vent': 2 } },
    look: 'A banshee vent on the repair arm, misting a pale violet fog that hums low.',
    flavour: 'Robots near it are never Dreaded: the banshee already screamed everything there was to scream.',
  },
  ghostGlide: {
    name: 'Ghost-step skirt', bot: 'mobility', roles: ['mule'], tags: ['speed', 'armour'], stats: { speed: 20, armour: 6 },
    recipe: { scrap: 35, parts: { 'shade-cloak': 1, 'wisp-lantern': 1 } },
    look: 'A skirt of shade-cloak in place of the wheels, a wisp lantern underneath; the mule drifts.',
    flavour: 'Half there: faster, and hits find a little less of it.',
  },
  howlBarrel: {
    name: 'Howling barrel', bot: 'arms', roles: ['marksman'], tags: ['ranged'], stats: { dmg: 10 }, ghostly: true,
    effects: [{ when: 'hit', if: { is: 'via', via: 'gun' }, chance: 0.2, cd: 0, do: { do: 'status', id: 'dread' } }],
    recipe: { scrap: 45, parts: { 'banshee-vent': 2, 'wisp-lantern': 1 } },
    look: 'A banshee vent for a muzzle; every shot howls.',
    flavour: 'Its shots land on ghosts and leave a fifth of what they hit Dreaded.',
  },

  // -- The newest three types (P15): each land's piece for the Boilermancer, the Lamplighter and the Stalker, made from that land's parts. The numbers are first guesses. --
  // The desert.
  gaugeEyes: {
    name: 'Crawlcam gauge eyes', bot: 'head', roles: ['boilermancer'], tags: ['steam'], stats: { dmg: 15 },
    recipe: { scrap: 35, parts: { 'spider-lens': 1, 'hornet-head': 1 } },
    look: 'Two Crawlcam lenses on brass stalks over the boilermancer\'s gauge face, both watching the needle.',
    flavour: 'The spider read heat from across the sand. The boilermancer reads pressure, and its clouds scald harder.',
  },
  waspLantern: {
    name: 'Hornet-wing lantern', bot: 'back', roles: ['lamplighter'], tags: ['crew', 'aura'], stats: { oil: 10 }, aura: { r: 40, stats: { accuracy: 10 } }, lamp: true,
    recipe: { scrap: 35, parts: { 'hornet-wings': 1, 'spider-lens': 1 } },
    look: 'A lantern of mechahornet wing membrane on a pole over the lamplighter\'s back; the light comes out blue-gold.',
    flavour: 'The hornets came to every light after dark. Now the light is stretched thin over a wing and reaches a little farther.',
  },
  stingerBlades: {
    name: 'Stinger blades', bot: 'arms', roles: ['stalker'], tags: ['melee'], stats: { meleeDmg: 20 },
    recipe: { scrap: 35, parts: { 'hornet-stinger': 2 } },
    look: 'Two hornet stingers in sheaths at the stalker\'s wrists, as long as a forearm.',
    flavour: 'Narrow, quiet and bad-tempered. The stalker usually needs them only once.',
  },
  // The Rustwood Jungle.
  tuskBellows: {
    name: 'Tusk bellows', bot: 'arms', roles: ['boilermancer'], tags: ['steam'], stats: { dmg: 12 },
    recipe: { scrap: 30, parts: { 'boar-tusk': 2 } },
    look: 'Two boar tusks as the nozzles of a bellows on the boilermancer\'s arm; every pump hisses.',
    flavour: 'The boar blew steam through its tusks in the wet season. The boilermancer does it on purpose.',
  },
  swanLantern: {
    name: 'Swan-feather lantern', bot: 'back', roles: ['lamplighter'], tags: ['crew', 'aura', 'speed'], stats: { oil: 8 }, aura: { r: 50, stats: { speed: 6 } }, lamp: true,
    recipe: { scrap: 30, parts: { 'swan-feather': 2 } },
    look: 'A lantern cupped in white swan feathers, swaying on a long hook.',
    flavour: 'Swans are said to glow at dusk. The light is soft, and it carries.',
  },
  monkeyRunners: {
    name: 'Monkey-arm runners', bot: 'mobility', roles: ['stalker'], tags: ['speed'], stats: { speed: 25 },
    recipe: { scrap: 30, parts: { 'monkey-arm': 2 } },
    look: 'Two long monkey arms under the stalker, swinging it forward knuckle over knuckle.',
    flavour: 'It no longer walks. Nothing in front of it hears it come.',
  },
  // The Hollow City.
  commuterBoiler: {
    name: 'Briefcase boiler', bot: 'back', roles: ['boilermancer'], tags: ['steam', 'armour'], stats: { oil: 20 },
    recipe: { scrap: 30, parts: { 'commuter-case': 2 } },
    look: 'A commuter\'s briefcase turned boiler on the boilermancer\'s back, a pressure valve where the clasp was.',
    flavour: 'Nine to five at three bars. It runs hot and has never taken a day off.',
  },
  badgeLamp: {
    name: 'Officer-badge lamp', bot: 'head', roles: ['lamplighter'], tags: ['crew', 'aura', 'armour'], stats: { armour: 4 }, aura: { r: 40, stats: { accuracy: 10 } }, lamp: true,
    recipe: { scrap: 35, parts: { 'officer-badge': 1, 'cop-whistle': 1 } },
    look: 'A lamp set in an officer\'s badge on the lamplighter\'s cap, throwing a flat white beam.',
    flavour: 'Move along. There is nothing in the dark that the light cannot see. Allies stand a little steadier in it.',
  },
  chargerLegs: {
    name: 'Charger sprint legs', bot: 'mobility', roles: ['stalker'], tags: ['speed'], stats: { speed: 30, crit: 5 },
    recipe: { scrap: 35, parts: { 'charger-legs': 2 } },
    look: 'A pair of destrier legs under the stalker, folded tight, ready to run.',
    flavour: 'The destrier ran down the avenues. The stalker uses the same legs to run down one thing.',
  },
  // The Frostspine.
  frostPlate: {
    name: 'Rimed boiler plate', bot: 'back', roles: ['boilermancer'], tags: ['steam', 'armour'], stats: { armour: 8 },
    recipe: { scrap: 35, parts: { 'frost-carapace': 1, 'bleater-box': 1 } },
    look: 'A mite\'s rimed shell over the boilermancer\'s boiler; the steam curls off it as ice.',
    flavour: 'The cold and the heat fight to a standstill, and the boilermancer comes out of the draw.',
  },
  kiteLantern: {
    name: 'Kite-sail lantern', bot: 'back', roles: ['lamplighter'], tags: ['crew', 'aura', 'speed'], stats: { oil: 8 }, aura: { r: 45, stats: { speed: 8 } }, lamp: true,
    recipe: { scrap: 30, parts: { 'kite-wings': 1, 'frost-carapace': 1 } },
    look: 'A lantern slung under kite wings so that it rides above the crew\'s heads.',
    flavour: 'High light, and the wind cannot blow it out. The goats on the ridge find it hard to look away from.',
  },
  hornDaggers: {
    name: 'Ram-horn daggers', bot: 'arms', roles: ['stalker'], tags: ['melee'], stats: { meleeDmg: 20, crit: 5 },
    recipe: { scrap: 35, parts: { 'goat-horns': 2 } },
    look: 'Two short ram horns ground to a point and fixed to the stalker\'s forearms.',
    flavour: 'A goat charges to be seen. A stalker uses the same horn to be a surprise.',
  },
  // The Demon Wastes.
  veinManifold: {
    name: 'Vein-cable manifold', bot: 'back', roles: ['boilermancer'], tags: ['steam'], stats: { dmg: 10, oil: 10 },
    recipe: { scrap: 35, parts: { 'vein-cable': 1, 'leech-mouth': 1 } },
    look: 'Red cables from the boilermancer\'s boiler into a leech\'s mouth, which sips the steam and gulps.',
    flavour: 'Everything it breathes out is hotter than what went in. The engineers will not say where the heat comes from.',
  },
  droneLamp: {
    name: 'Drone-optics lamp', bot: 'head', roles: ['lamplighter'], tags: ['crew', 'aura'], stats: { oil: 10 }, aura: { r: 50, stats: { accuracy: 15 } }, lamp: true,
    recipe: { scrap: 40, parts: { 'drone-optics': 2 } },
    look: 'A drone\'s optics turned round to shine: two cold white discs on the lamplighter\'s brow.',
    flavour: 'The drones watched. Now they light the way instead, and allies see where they are shooting.',
  },
  scytheKnives: {
    name: 'Scythe-claw knives', bot: 'arms', roles: ['stalker'], tags: ['melee'], stats: { meleeDmg: 25 },
    recipe: { scrap: 35, parts: { 'swarmer-scythe': 2 } },
    look: 'A swarmer\'s scythe claw in each of the stalker\'s hands, red at the edge.',
    flavour: 'It was made to cut a path through a swarm. It does very well at cutting one throat.',
  },
  // The Ether.
  bansheeBellows: {
    name: 'Banshee bellows', bot: 'arms', roles: ['boilermancer'], tags: ['steam'], stats: { dmg: 12 }, ghostly: true,
    recipe: { scrap: 40, parts: { 'banshee-vent': 2 } },
    look: 'A banshee vent for a nozzle; the clouds it blows keep a faint wail in them.',
    flavour: 'Its steam lands on ghosts as well as on anything else, and the ghosts mind.',
  },
  wispLantern: {
    name: 'Wisp-lit lantern', bot: 'back', roles: ['lamplighter'], tags: ['crew', 'aura', 'armour'], stats: { oil: 8 }, aura: { r: 60, stats: { armour: 4 } }, lamp: true,
    recipe: { scrap: 35, parts: { 'wisp-lantern': 2 } },
    look: 'A wisp in a brass cage on a pole, bobbing over the lamplighter\'s shoulder.',
    flavour: 'It was a ghost\'s lamp. It makes a generous light for the living, and says nothing.',
  },
  shadeShroud: {
    name: 'Shade shroud', bot: 'back', roles: ['stalker'], tags: ['speed'], stats: { speed: 15 }, ghostly: true,
    recipe: { scrap: 40, parts: { 'shade-cloak': 2 } },
    look: 'A shroud of shade-cloak over the stalker, see-through at its hem.',
    flavour: 'Its blade lands on ghosts, and the ghosts have never once seen it coming.',
  },
  // -- P23: the old augment list as body parts (systems.md "Gear"): signals, light, hearing, hands, the furnace, the smoke, the pack. Numbers are first guesses. --
  radarScope: {
    name: 'Radar scope', comm: 'head', tags: [], provides: 'radar',
    recipe: { scrap: 50, parts: { 'spider-lens': 1 } },
    look: 'A brass scope on a swivel arm beside the eye; a green sweep ticks round its glass.',
    flavour: 'A silent sweep: every signal on the land shows as a pip on the map, not a smudge. The Oracle says it spoils the surprise.',
  },
  lanternEyes: {
    name: 'Lantern eyes', comm: 'head', tags: ['aura'],
    effects: [{ when: 'always', do: { do: 'stat', stat: 'lamp', add: 140 } }],
    recipe: { scrap: 45, parts: { 'spider-lens': 2 } },
    look: 'Two lenses with a flame behind each, set where the eyes were; the sand lights up the width of a street.',
    flavour: 'You carry a lamp now, and so does everyone beside you: Lit, and Dread cannot take. The twisted lose their halo inside it.',
  },
  listeningHorn: {
    name: 'Listening horn', comm: 'head', tags: [], provides: 'horn',
    recipe: { scrap: 40, parts: { 'hornet-head': 2 } },
    look: 'A tin ear trumpet on a bracket, turning to follow sounds.',
    flavour: 'Twisted things coming in over the edge of the map show as arrows at the edge of the screen. It hears them before they are anywhere.',
  },
  thirdHand: {
    name: 'Third hand', comm: 'arm', tags: ['speed'], stats: { gather: 100 },
    recipe: { scrap: 50, parts: { 'hornet-stinger': 1 } },
    look: 'A spindly spare arm folded over the shoulder, a pincer at the end; it works while the others do.',
    flavour: 'You strip a ruin, and mine a seam by hand, in half the time. It also holds your tea.',
  },
  grapple: {
    name: 'Grapple', comm: 'arm', tags: ['ranged'], stats: { magnet: 60 },
    effects: [{ when: 'hit', cd: 4, if: [{ is: 'via', via: 'gun' }, { is: 'not', cond: { is: 'tag', tag: 'elite' } }, { is: 'not', cond: { is: 'tag', tag: 'boss' } }], do: { do: 'spawn', what: 'reel', kind: 'grapple', at: 'target' } }],
    recipe: { scrap: 50, parts: { 'monkey-arm': 2 } },
    look: 'A monkey arm on a cable winch, a three-clawed hand at the end; it hangs from the wrist.',
    flavour: 'Loot comes to you from farther, and a shot that finds something small reels it in by the hand.',
  },
  furnaceCore: {
    name: 'Furnace core', comm: 'core', tags: ['steam'],
    effects: [{ when: 'tick', cd: 0, if: { is: 'tag', tag: 'steamFull', of: 'self' }, do: { do: 'pulse', radius: 90, side: 'foe', then: { do: 'status', id: 'scalded' } } }],
    recipe: { scrap: 90, parts: { 'hornet-head': 2 } },
    look: 'A little firebox behind a grate on the chest; with the steam full it glows, and the air round you ripples.',
    flavour: 'While your steam is full, everything near you is Scalded. Spend it and the glow dies down. Stay full and stay unfriendly.',
  },
  smokeStack: {
    name: 'Smoke stack', comm: 'rear', tags: ['skill', 'speed'], skill: 'smokeDash',
    recipe: { scrap: 40, parts: { 'hornet-wings': 1 } },
    look: 'A short black chimney on the backside; the dash leaves a bank of oily smoke.',
    flavour: 'The posterior vent, but sooty. Foes you dash through cannot see for a moment. You can hardly see either, but you are going the other way.',
  },
  canRack: {
    name: 'Can rack', comm: 'pack', tags: [], cans: 1,
    recipe: { scrap: 45 },
    look: 'A wire rack on the pack with a clip for one more can of oil, rattling.',
    flavour: 'One more can of spare oil on every lift. It clinks, and the hornets hear it. They never do anything about it.',
  },
  botHarness: {
    name: 'Bot harness', comm: 'pack', tags: ['crew'],
    effects: [{ when: 'always', do: [{ do: 'stat', stat: 'carry', add: 0.4 }, { do: 'stat', stat: 'carryFloor', add: 0.5 }] }],
    recipe: { scrap: 40, parts: { 'hornet-stinger': 1 } },
    look: 'Leather straps and a frame on the pack, with a cradle for a downed robot to hang in.',
    flavour: 'A downed robot hangs in the frame and weighs nothing. Carry as many as you like at your own speed.',
  },
  rivetMail: {
    name: 'Rivet mail', comm: 'core', tags: ['armour'], stats: { plating: 3 },
    recipe: { scrap: 45, parts: { 'hornet-stinger': 2 } },
    look: 'Hundreds of rivets hammered into a leather coat, heads outward.',
    flavour: 'Three off every hit, however many hits. The small stings you stop noticing, and so do the things that were only ever small.',
  },
  rivetedBuckler: {
    name: 'Riveted buckler', comm: 'arm', tags: ['armour'], stats: { parry: 15 },
    recipe: { scrap: 40, parts: { 'hornet-head': 1 } },
    look: 'A round iron shield strapped to the forearm, with a boss in the middle and a ring of rivets.',
    flavour: 'One melee hit in seven bounces off and Staggers whatever swung. Hob says shields are heresy. He has two.',
  },

  // -- P23: one arms piece for each of the four newest types (the land sets are the pieces made of a land's parts) --
  valveManifold: {
    name: 'Valve manifold', bot: 'arms', roles: ['boilermancer'], tags: ['steam'], stats: { dmg: 20 },
    recipe: { scrap: 40 },
    look: 'A rack of brass valves on the boilermancer\'s arm, three pipes out; every pipe is a different shade of hiss.',
    flavour: 'Clouds that scald a fifth harder. The needle on the gauge never leaves the red.',
  },
  longWick: {
    name: 'Long wick', bot: 'arms', roles: ['lamplighter'], tags: ['crew', 'aura'], aura: { r: 56, stats: { accuracy: 10 } }, lamp: true,
    recipe: { scrap: 45 },
    look: 'A lamp-trimmer\'s wick on a long brass pole, held out at arm\'s length; the flame leans toward the dark.',
    flavour: 'The lamplighter\'s light reaches two fifths farther, and allies in it see where they are shooting.',
  },
  muffledKnuckles: {
    name: 'Muffled knuckles', bot: 'arms', roles: ['stalker'], tags: ['melee', 'speed'], stats: { meleeDmg: 25, speed: 5 },
    recipe: { scrap: 40 },
    look: 'Knuckle-dusters wrapped in felt, and a felt slipper to match.',
    flavour: 'Nothing it hits makes a sound. The stalker hits harder, and is never where you looked.',
  },
  longRail: {
    name: 'Long rail', bot: 'arms', roles: ['marksman'], tags: ['ranged'], stats: { range: 20, crit: 5 },
    recipe: { scrap: 45 },
    look: 'A rail along the barrel with a folding rest, taller than the marksman.',
    flavour: 'Farther, and the soft rivet is easier to find. A marksman with a rest is a marksman at peace.',
  },

  // -- P23: gear that gives a positive status (systems.md "Damage types and statuses"; the downside is the status's own) --
  bracingYoke: {
    name: 'Bracing yoke', bot: 'back', roles: ['guard'], tags: ['armour', 'aura', 'crew'],
    effects: [{ when: 'tick', cd: 6, do: { do: 'pulse', radius: 100, side: 'ally', self: true, then: { do: 'status', id: 'braced', duration: 4, to: 'target' } } }],
    recipe: { scrap: 40, parts: { 'hornet-head': 1 } },
    look: 'A heavy iron yoke across the guard\'s shoulders, with a hand rail for the others to hold.',
    flavour: 'Every few seconds the guard and the robots beside it dig in: Braced, not to be shoved, and slower for it.',
  },
  hawkLens: {
    name: 'Hawk lens', comm: 'head', tags: ['ranged'],
    effects: [{ when: 'hit', cd: 0, if: [{ is: 'via', via: 'gun' }, { is: 'status', id: 'marked' }], do: { do: 'status', id: 'keen', duration: 3, to: 'self' } }],
    recipe: { scrap: 40, parts: { 'spider-lens': 1 } },
    look: 'A glass on a swing-arm over one eye, with a tiny crosshair etched in.',
    flavour: 'Shoot something Marked and you are Keen: shots pass through, the crits come easier, and you take more.',
  },
  stokerGloves: {
    name: 'Stoker\'s gloves', comm: 'arm', tags: ['melee'],
    effects: [{ when: 'kill', cd: 0, do: { do: 'status', id: 'stoked', to: 'self' } }],
    recipe: { scrap: 40, parts: { 'hornet-stinger': 1 } },
    look: 'Thick asbestos gloves, charred at the fingers, with a coal-shovel scorch on the palm.',
    flavour: 'Every kill fires you up: hit harder for a while, and burn a little oil to do it.',
  },
  pressureVest: {
    name: 'Pressure vest', comm: 'core', tags: ['steam'],
    effects: [{ when: 'tick', cd: 0, if: { is: 'tag', tag: 'steamFull', of: 'self' }, do: { do: 'status', id: 'steaming', duration: 3, to: 'self' } }],
    recipe: { scrap: 60 },
    look: 'A waistcoat of copper pipe with a gauge on the pocket, ticking up to the line.',
    flavour: 'With your steam full you are Steaming: quicker on your feet and with the trigger, and softer to everything that hits you.',
  },
  leydenSpurs: {
    name: 'Leyden spurs', comm: 'rear', tags: ['skill', 'speed'], skill: 'dash', stats: { speed: 5 },
    effects: [{ when: 'dash', cd: 0, do: { do: 'status', id: 'charged', to: 'self' } }],
    recipe: { scrap: 45, parts: { 'boar-tusk': 1 } },
    look: 'Two jars on the heels with a wire between them; the dash crackles.',
    flavour: 'Each dash leaves you Charged: your hits arc on to another foe, and Shock hits you twice as hard.',
  },
  etchingTip: {
    name: 'Etching tip', bot: 'arms', roles: ['guard', 'marksman'], tags: ['ranged'],
    effects: [{ when: 'hit', cd: 4, if: { is: 'via', via: 'gun' }, do: { do: 'status', id: 'etched', to: 'self' } }],
    recipe: { scrap: 40, parts: { 'hornet-stinger': 1 } },
    look: 'A needle of acid-bitten steel in the muzzle, green at the point.',
    flavour: 'A shot now and then leaves the robot Etched: its hits ignore plating and a quarter of the armour, and its own armour is thinner.',
  },
};

// ---- The night recipes (systems.md "Night recipes"): the same item plus one twisted part and a Dark rider ------------------

/** The items that have a night version: the weapons and the arm pieces that hit. Each gets `<id>Night`, made with one twisted part of its kind. */
export const NIGHT_BASES = [
  'shovel', 'pipeWrench', 'steamGun', 'slingshot', 'hornetSpear', 'rivetScatter', 'tazer', 'fangWhip', 'arcGun', 'pistonCannon', 'kettleScalder', 'censerGun',
  'pistonFist', 'gatlingCuff', 'rivetRepeater', 'autoloader', 'stingerBayonet',
] as const;
export type NightBase = (typeof NIGHT_BASES)[number];
/** The Dark rider's chance (a guess): a hit of the item leaves the foe in Dread, as a Dark hit's rider would (the stat `rider:dark` raises it). */
export const NIGHT_RIDER = 0.2;

function nightOf(base: NightBase): ItemDef {
  const d = BASE_ITEMS[base];
  const first = (Object.keys(d.recipe.parts ?? {}) as PartKind[])[0];
  const part: TwistedPart = (first && TWISTED_PART[PARTS[first].from]) || 'twisted-coil';
  const via = d.tags.includes('melee') && d.tags.includes('ranged') ? ['melee', 'gun'] : d.tags.includes('melee') ? 'melee' : 'gun';
  const rider: Effect = {
    when: 'hit', cd: 0, chance: { stat: 'rider:dark', base: NIGHT_RIDER },
    if: d.weapon ? { is: 'weapon', weapon: d.weapon } : { is: 'via', via },
    do: { do: 'status', id: 'dread' },
  };
  return {
    ...d,
    name: `Twisted ${d.name.replace(/^The /, '')}`,
    effects: [...(d.effects ?? []), rider],
    recipe: { scrap: d.recipe.scrap, parts: { ...d.recipe.parts, [part]: 1 } },
    look: `${d.look} Bound in twisted wire; it hums a note that is slightly wrong.`,
    flavour: `The same ${d.name.toLowerCase()}, made with what the night leaves behind. Some hits fill the foe with Dread, and a Dreaded foe hits 20% softer.`,
  };
}

// ---- The weapon mods (P57): items of kind `mod`, one row each from `defs/mods.ts` -------------------------------------------

function modItem(id: ModId): ItemDef {
  const m = MODS[id];
  return {
    name: m.name, mod: id,
    tags: ['mod', ...(m.fits === 'gun' ? ['ranged' as const] : m.fits === 'melee' ? ['melee' as const] : [])],
    recipe: { scrap: m.scrap, ...(m.part && { parts: { [m.part]: 1 } }) },
    look: m.look, flavour: m.flavour,
  };
}

export const ITEMS: Record<ItemId, ItemDef> = {
  ...BASE_ITEMS,
  ...(Object.fromEntries(NIGHT_BASES.map((b) => [`${b}Night`, nightOf(b)])) as Record<`${NightBase}Night`, ItemDef>),
  ...(Object.fromEntries(MOD_IDS.map((m) => [m, modItem(m)])) as Record<ModId, ItemDef>),
};

export const itemIds = Object.keys(ITEMS) as ItemId[];

/** Who an item fits: the Communicator, a bot of this role (or any bot). */
export const fitsComm = (d: ItemDef) => !!(d.weapon || d.comm);
export const fitsBot = (d: ItemDef, role?: CrewRole) => !!d.bot && (!role || !d.roles || d.roles.includes(role));
/** The item for a weapon id. */
export const itemOfWeapon = (w: WeaponId) => itemIds.find((id) => ITEMS[id].weapon === w)!;

// ---- State -----------------------------------------------------------------------------------------------------------

/** `mods`: a weapon's fitted mods (the uids of mod items), at most `lugCount(gear)` of them. */
export interface Owned { uid: number; id: ItemId; q: Quality; mods?: number[]; /** Gasket's Tune-up (once per item, kept on it): its bonuses are `TUNE_UP.mult` more, on top of quality. */ tuned?: true }
export interface Gear {
  items: Owned[];
  /** Lugs on every weapon: absent is one, 2 once Hob has put the second on (`hob.story` step 2). */
  lugs?: number;
  /** Fitted mods Hob owes (his repeatable job): each a pick of two mods (`takeMod`), the first waiting at his forge. */
  modPicks?: ModId[][];
  /** The Second Heart (P52): Gasket has put a second core slot in the Communicator. */
  heart?: boolean;
  /** Tune-ups Gasket owes (his repeatable job): each one picks a worn body part that is not tuned yet (`tuneUp`). */
  tunes?: number;
  /** The Communicator's slots: item uid in each. */
  comm: Partial<Record<CommSlot, number>>;
  /** Each crew role's sockets: every bot of that role wears them. */
  bots: Record<CrewRole, Partial<Record<BotSlot, number>>>;
  next: number;
  /** How many things were crafted: the seed of the next quality roll. */
  crafted: number;
}

/** A new run: the shovel in hand. */
export const freshGear = (): Gear => ({ items: [{ uid: 1, id: 'shovel', q: 'standard' }], comm: { primary: 1 }, bots: Object.fromEntries(CREW_ROLES.map((r) => [r, {}])) as Gear['bots'], next: 2, crafted: 0 });

export const owned = (g: Gear, uid: number | undefined) => (uid === undefined ? undefined : g.items.find((o) => o.uid === uid));

/** Drop what this build does not know and keep the invariants (every worn uid owned and fitting its slot, each item worn once). */
export function cleanGear(g: Gear): Gear {
  const items = (Array.isArray(g.items) ? g.items : []).filter((o) => o && typeof o.uid === 'number' && o.id in ITEMS && QUALITY_ORDER.includes(o.q));
  const uids = new Set<number>();
  const take = (uid: unknown, ok: (d: ItemDef) => boolean) => {
    const o = typeof uid === 'number' ? items.find((x) => x.uid === uid) : undefined;
    if (!o || uids.has(o.uid) || !ok(ITEMS[o.id])) return undefined;
    uids.add(o.uid);
    return o.uid;
  };
  const comm: Gear['comm'] = {};
  for (const s of commSlots({ heart: g.heart === true })) {
    const u = take(g.comm?.[s], (d) => fitsCommSlot(d, s));
    if (u !== undefined) comm[s] = u;
  }
  const bots = Object.fromEntries(CREW_ROLES.map((r) => [r, {}])) as Gear['bots'];
  for (const r of CREW_ROLES)
    for (const s of BOT_SLOTS) {
      // A piece is one object: the same uid can sit in one crew's socket only, but crews wear copies of it on every bot.
      const raw = g.bots?.[r]?.[s];
      const o = typeof raw === 'number' ? items.find((x) => x.uid === raw) : undefined;
      if (o && fitsBotSlot(ITEMS[o.id], s, r) && !Object.values(comm).includes(o.uid) && !CREW_ROLES.some((r2) => r2 !== r && bots[r2]?.[s] === o.uid)) bots[r][s] = o.uid;
    }
  const next = Math.max(Number.isFinite(g.next) ? g.next : 1, ...items.map((o) => o.uid + 1));
  const lugs = g.lugs !== undefined && g.lugs >= 2 ? 2 : 1;
  // Mods (P57): each fitted on one weapon at most, a mod that fits it, no more than the lugs.
  const taken = new Set<number>();
  const clean = items.map((o) => {
    const wid = ITEMS[o.id].weapon;
    const { mods: raw, ...rest } = o;
    if (!wid || !Array.isArray(raw)) return rest;
    const kind = WEAPONS[wid].kind;
    const mods = raw.filter((u, i) => {
      const m = typeof u === 'number' ? items.find((x) => x.uid === u) : undefined;
      return !!m && !!ITEMS[m.id].mod && modFits(ITEMS[m.id].mod!, kind) && raw.indexOf(u) === i && !taken.has(u);
    }).slice(0, lugs);
    for (const u of mods) taken.add(u);
    return mods.length ? { ...rest, mods } : rest;
  });
  const picks = (Array.isArray(g.modPicks) ? g.modPicks : []).map((p) => (Array.isArray(p) ? p.filter((m) => typeof m === 'string' && m in MODS).slice(0, 2) : [])).filter((p) => p.length);
  const tunes = Number.isInteger(g.tunes) && g.tunes! > 0 ? g.tunes : 0;
  return { items: clean, comm, bots, next, crafted: Number.isFinite(g.crafted) ? g.crafted : 0, ...(g.heart === true && { heart: true }), ...(lugs === 2 && { lugs }), ...(picks.length && { modPicks: picks }), ...(tunes && { tunes }) };
}

export const fitsCommSlot = (d: ItemDef, s: CommSlot) => (s === 'primary' || s === 'secondary' ? !!d.weapon : s === 'heart' ? d.comm === 'core' : d.comm === s);
export const fitsBotSlot = (d: ItemDef, s: BotSlot, r: CrewRole) => d.bot === s && fitsBot(d, r);

/** Where an item is worn now, if anywhere. */
export function wornAt(g: Gear, uid: number): { who: 'comm'; slot: CommSlot } | { who: CrewRole; slot: BotSlot } | null {
  for (const s of COMM_SLOTS) if (g.comm[s] === uid) return { who: 'comm', slot: s };
  for (const r of CREW_ROLES) for (const s of BOT_SLOTS) if (g.bots[r][s] === uid) return { who: r, slot: s };
  return null;
}

/** Add an item (a find, a reward, dev). */
export function addItem(g: Gear, id: ItemId, q: Quality = 'standard'): { gear: Gear; item: Owned } {
  const item = { uid: g.next, id, q };
  return { gear: { ...g, items: [...g.items, item], next: g.next + 1 }, item };
}

/**
 * Wear an item. On the Communicator a weapon swaps with the other weapon slot when it was there (as `loadout.equip`);
 * anything else just replaces what the slot held. Wearing it somewhere takes it off where it was. Throws with the
 * reason when it does not fit (the inventory greys those out first).
 */
export function equip(g: Gear, uid: number, who: 'comm' | CrewRole, slot: CommSlot | BotSlot): Gear {
  const o = owned(g, uid);
  if (!o) throw new Error('not owned');
  const d = ITEMS[o.id];
  const comm = { ...g.comm };
  const bots = Object.fromEntries(CREW_ROLES.map((r) => [r, { ...g.bots[r] }])) as Gear['bots'];
  const at = wornAt(g, uid);
  if (who === 'comm') {
    const s = slot as CommSlot;
    if (!commSlots(g).includes(s) || !fitsCommSlot(d, s)) throw new Error(`${d.name} does not go in ${SLOT_NAMES[s] ?? s}`);
    if (at?.who === 'comm' && at.slot === s) return g;
    const was = comm[s];
    if (at?.who === 'comm') {
      // Primary <-> secondary: the two swap.
      if (was !== undefined) comm[at.slot] = was;
      else delete comm[at.slot];
    } else if (at) delete bots[at.who][at.slot];
    comm[s] = uid;
    if (s !== 'primary' && s !== 'secondary') return { ...g, comm, bots };
    if (comm.primary === undefined) throw new Error('the primary slot cannot be left empty');
    return { ...g, comm, bots };
  }
  const s = slot as BotSlot;
  if (!BOT_SLOTS.includes(s) || !fitsBotSlot(d, s, who)) throw new Error(`${d.name} does not fit a ${who}'s ${SLOT_NAMES[s] ?? s}`);
  if (at?.who === 'comm') {
    if (at.slot === 'primary') throw new Error('the primary slot cannot be left empty');
    delete comm[at.slot];
  } else if (at) delete bots[at.who][at.slot];
  bots[who][s] = uid;
  return { ...g, comm, bots };
}

// ---- Mods and lugs (P57) -----------------------------------------------------------------------------------------------

/** Is there a recipe for it: everything but the wild mods, which are only found. */
export const craftable = (id: ItemId) => !ITEMS[id].mod || !MODS[ITEMS[id].mod!].wild;

/** How many lugs every weapon has. */
export const lugCount = (g: Gear) => (g.lugs !== undefined && g.lugs >= 2 ? 2 : 1);
/** The mod items fitted on a weapon (an owned item's uid), in the order they were fitted. */
export const modsOn = (g: Gear, weaponUid: number): Owned[] => (owned(g, weaponUid)?.mods ?? []).map((u) => owned(g, u)).filter((o): o is Owned => !!o);
/** The weapon item a mod is fitted on, if any. */
export const fittedOn = (g: Gear, modUid: number): Owned | undefined => g.items.find((o) => o.mods?.includes(modUid));
/** The kind of weapon an owned item is, or null when it is not a weapon. */
export const weaponKind = (o: Owned | undefined) => (o && ITEMS[o.id].weapon ? WEAPONS[ITEMS[o.id].weapon!].kind : null);
/** Can this owned mod go on this owned weapon. */
export const modFitsWeapon = (m: Owned, w: Owned) => !!ITEMS[m.id].mod && !!weaponKind(w) && modFits(ITEMS[m.id].mod!, weaponKind(w)!);
/** Every owned mod's id (what a pick of two leaves out, a boss's cache checks). */
export const ownedMods = (g: Gear): ModId[] => g.items.map((o) => ITEMS[o.id].mod).filter((m): m is ModId => !!m);

const without = (list: number[] | undefined, uid: number) => (list ?? []).filter((u) => u !== uid);

/**
 * Fit a mod on a weapon's lug. A mod is on one lug at a time: fitting it elsewhere moves it. A weapon with all its lugs full
 * gives up the one fitted longest ago. Throws with the reason when it does not fit; the mod does not change the weapon's numbers.
 */
export function fitMod(g: Gear, modUid: number, weaponUid: number): Gear {
  const m = owned(g, modUid), w = owned(g, weaponUid);
  if (!m || !ITEMS[m.id].mod) throw new Error('that is not a mod');
  if (!w || !weaponKind(w)) throw new Error('a mod is fitted on a weapon');
  if (!modFitsWeapon(m, w)) throw new Error(`${ITEMS[m.id].name} fits ${MODS[ITEMS[m.id].mod!].fits === 'gun' ? 'guns' : 'melee weapons'} only`);
  if (w.mods?.includes(modUid)) return g;
  const lugs = lugCount(g);
  return { ...g, items: g.items.map((o) => (o.uid === weaponUid ? { ...o, mods: [...without(o.mods, modUid), modUid].slice(-lugs) } : o.mods?.includes(modUid) ? { ...o, mods: without(o.mods, modUid) } : o)).map(tidy) };
}
/** Take a mod off its lug (it stays owned). */
export function unfitMod(g: Gear, modUid: number): Gear {
  return fittedOn(g, modUid) ? { ...g, items: g.items.map((o) => (o.mods?.includes(modUid) ? tidy({ ...o, mods: without(o.mods, modUid) }) : o)) } : g;
}
const tidy = (o: Owned): Owned => {
  if (o.mods?.length !== 0) return o;
  const { mods: _m, ...rest } = o;
  return rest;
};
/**
 * Take one of the first pending pick of two (the Fitted mod): the mod joins the inventory and is fitted free on the weapon in
 * the primary slot, or the secondary if only that one takes it. `onto` is the item it was fitted on, if any.
 */
export function takeMod(g: Gear, mod: ModId): { gear: Gear; onto?: Owned } {
  const pick = g.modPicks?.[0];
  if (!pick?.includes(mod)) throw new Error('that mod is not on offer');
  let gear: Gear = { ...g, modPicks: g.modPicks!.slice(1) };
  if (!gear.modPicks!.length) delete gear.modPicks;
  const have = gear.items.find((o) => o.id === mod);
  const item = have ?? ((): Owned => { const r = addItem(gear, mod); gear = r.gear; return r.item; })();
  for (const slot of ['primary', 'secondary'] as const) {
    const w = owned(gear, gear.comm[slot]);
    if (w && modFitsWeapon(item, w)) return { gear: fitMod(gear, item.uid, w.uid), onto: w };
  }
  return { gear };
}
/** Put the second lug on every weapon (Hob, `hob.story` step 2). */
export const addLug = (g: Gear): Gear => (lugCount(g) >= 2 ? g : { ...g, lugs: 2 });

/** Take an item off. The primary weapon stays (something must be in hand). */
export function unequip(g: Gear, uid: number): Gear {
  const at = wornAt(g, uid);
  if (!at) return g;
  if (at.who === 'comm' && at.slot === 'primary') throw new Error('the primary slot cannot be left empty');
  const comm = { ...g.comm };
  const bots = Object.fromEntries(CREW_ROLES.map((r) => [r, { ...g.bots[r] }])) as Gear['bots'];
  if (at.who === 'comm') delete comm[at.slot];
  else delete bots[at.who][at.slot];
  return { ...g, comm, bots };
}

/** Scrap an item you no longer want: half its scrap back (rounded down). Worn items come off first. */
export function salvage(g: Gear, uid: number): { gear: Gear; scrap: number } {
  const o = owned(g, uid);
  if (!o) throw new Error('not owned');
  if (wornAt(g, uid) || fittedOn(g, uid)) throw new Error('take it off first');
  return { gear: { ...g, items: g.items.filter((x) => x.uid !== uid) }, scrap: Math.floor(ITEMS[o.id].recipe.scrap / 2) };
}

// ---- Crafting --------------------------------------------------------------------------------------------------------

/** What crafting spends: scrap (the economy's) and parts (the hub's stores). */
export interface Wallet { scrap: number; parts: Partial<Record<PartKind, number>> }

/** The workbench's discount from what the Communicator wears (`ItemDef.discount`: the best one, not stacked). */
export function discountOf(g?: Gear): number {
  if (!g) return 0;
  let best = 0;
  for (const s of COMM_SLOTS) {
    const o = owned(g, g.comm[s]);
    if (o) best = Math.max(best, ITEMS[o.id].discount ?? 0);
  }
  return best;
}
/** The scrap an item costs at the workbench, with the gear's discount. */
export const scrapCost = (id: ItemId, g?: Gear) => Math.round(ITEMS[id].recipe.scrap * (1 - discountOf(g)));

/** What is missing to craft it, as lines; empty when it can be crafted. `g`: the gear, for its discount. */
export function shortfall(id: ItemId, w: Wallet, g?: Gear): string[] {
  const r = { ...ITEMS[id].recipe, scrap: scrapCost(id, g) };
  const out: string[] = [];
  if (w.scrap < r.scrap) out.push(`${r.scrap - w.scrap} scrap`);
  for (const [k, n] of Object.entries(r.parts ?? {}) as [PartKind, number][]) if ((w.parts[k] ?? 0) < n) out.push(`${n - (w.parts[k] ?? 0)} ${n - (w.parts[k] ?? 0) === 1 ? PARTS[k].name : PARTS[k].plural}`);
  return out;
}

/**
 * Craft an item: pay the recipe, roll its quality (`u` in [0, 1), from the run's seeded stream so a run replays), add it.
 * Throws with what is missing.
 */
export function craft(g: Gear, id: ItemId, w: Wallet, u: number): { gear: Gear; wallet: Wallet; item: Owned } {
  const mod = ITEMS[id].mod;
  if (mod && MODS[mod].wild) throw new Error('it cannot be made, only found');
  if (mod && g.items.some((o) => o.id === id)) throw new Error('you already have one: a mod is one of a kind');
  const miss = shortfall(id, w, g);
  if (miss.length) throw new Error(`needs ${miss.join(', ')}`);
  const r = { ...ITEMS[id].recipe, scrap: scrapCost(id, g) };
  const parts = { ...w.parts };
  for (const [k, n] of Object.entries(r.parts ?? {}) as [PartKind, number][]) parts[k] = (parts[k] ?? 0) - n;
  const { gear, item } = addItem({ ...g, crafted: g.crafted + 1 }, id, mod ? 'standard' : rollQuality(u));
  return { gear, wallet: { scrap: w.scrap - r.scrap, parts }, item };
}

// ---- What the wearers end up with ------------------------------------------------------------------------------------

/** Gasket's Tune-up (quests.md: +20%): a tuned item's bonuses (never its drawbacks) are this much more, once per item. */
export const TUNE_UP = { mult: 1.2 };

/** An item's bonuses at its quality (only bonuses grow; drawbacks stay), and tuned. */
export function scaled(s: Stats | undefined, q: Quality, tuned = false): Stats {
  const m = QUALITIES[q].mult * (tuned ? TUNE_UP.mult : 1);
  const out: Stats = {};
  for (const [k, v] of Object.entries(s ?? {}) as [GearStat, number][]) out[k] = v > 0 ? Math.round(v * m) : v;
  return out;
}
/** The Communicator's body parts (everything he wears but his two weapons). */
export const BODY_SLOTS = COMM_SLOTS.filter((s) => s !== 'primary' && s !== 'secondary');
/** An item's bonuses to tune: some stat, crew or aura number above 0. */
const hasBonus = (d: ItemDef) => [d.stats, d.crew, d.aura?.stats].some((x) => Object.values(x ?? {}).some((v) => v > 0));
/** The body parts he wears that a Tune-up can take: a bonus to raise, not tuned yet. */
export const tunable = (g: Gear): Owned[] =>
  BODY_SLOTS.flatMap((s) => {
    const o = owned(g, g.comm[s]);
    return o && !o.tuned && hasBonus(ITEMS[o.id]) ? [o] : [];
  });
/** Spend a Tune-up Gasket owes on a worn body part: its bonuses rise `TUNE_UP.mult`, for good. Throws with the reason. */
export function tuneUp(g: Gear, uid: number): Gear {
  if (!g.tunes) throw new Error('no Tune-up owed');
  const o = tunable(g).find((x) => x.uid === uid);
  if (!o) throw new Error('only a body part you wear, with a bonus, that is not tuned yet');
  const next: Gear = { ...g, items: g.items.map((x) => (x.uid === uid ? { ...x, tuned: true as const } : x)), tunes: g.tunes - 1 };
  if (!next.tunes) delete next.tunes;
  return next;
}

const add = (into: Stats, s: Stats) => {
  for (const [k, v] of Object.entries(s) as [GearStat, number][]) into[k] = (into[k] ?? 0) + v;
};

/** Spare oil cans the worn pieces add to the pack's cap (the Can Rack). */
export const gearCans = (g: Gear) => COMM_SLOTS.reduce((n, s) => n + (ITEMS[owned(g, g.comm[s])?.id ?? 'shovel'].cans ?? 0), 0);

/** The Communicator wears something that provides an antenna. */
export const hasAntenna = (g: Gear) =>
  COMM_SLOTS.some((s) => {
    const o = owned(g, g.comm[s]);
    return !!o && ITEMS[o.id].provides === 'antenna';
  });

/** Is this worn item working (its `needs` met)? */
export const working = (g: Gear, o: Owned) => !ITEMS[o.id].needs || hasAntenna(g);

export interface Aura { who: 'controller' | CrewRole; r: number; stats: Stats }
export interface GearMods {
  /** The Communicator's own stats (weapons' damage quality comes separately in `weaponQ`). */
  comm: Stats;
  /** Each crew role's stats: their sockets plus the crew-wide bonuses the Communicator wears. */
  roles: Record<CrewRole, Stats>;
  /** Damage multiplier for each weapon slot's quality. */
  weaponQ: { primary: number; secondary: number };
  /** Who low-tier hornets leave alone. */
  calm: ('controller' | CrewRole)[];
  /** Whose hits land on ghosts (a ghostly piece worn). */
  ghostly: ('controller' | CrewRole)[];
  auras: Aura[];
  dash: SkillId | null;
  skill: SkillId | null;
}

/** Everything the Sim needs from what is worn. */
export function gearMods(g: Gear): GearMods {
  const comm: Stats = {}, crew: Stats = {};
  const roles = Object.fromEntries(CREW_ROLES.map((r) => [r, {}])) as Record<CrewRole, Stats>;
  const calm: GearMods['calm'] = [];
  const ghostly: GearMods['ghostly'] = [];
  const auras: Aura[] = [];
  let dash: SkillId | null = null, skill: SkillId | null = null;
  for (const s of COMM_SLOTS) {
    const o = owned(g, g.comm[s]);
    if (!o || !working(g, o)) continue;
    const d = ITEMS[o.id];
    if (s === 'primary' || s === 'secondary') continue;
    add(comm, scaled(d.stats, o.q, o.tuned));
    add(crew, scaled(d.crew, o.q, o.tuned));
    if (d.calm) calm.push('controller');
    if (d.ghostly) ghostly.push('controller');
    if (d.aura) auras.push({ who: 'controller', r: d.aura.r, stats: scaled(d.aura.stats, o.q, o.tuned) });
    if (d.skill && SKILLS[d.skill].key === 'dash') dash = d.skill;
    if (d.skill && SKILLS[d.skill].key === 'skill') skill = d.skill;
  }
  for (const r of CREW_ROLES) {
    add(roles[r], crew);
    for (const s of BOT_SLOTS) {
      const o = owned(g, g.bots[r][s]);
      if (!o) continue;
      const d = ITEMS[o.id];
      add(roles[r], scaled(d.stats, o.q, o.tuned));
      if (d.calm) calm.push(r);
      if (d.ghostly) ghostly.push(r);
      if (d.aura) auras.push({ who: r, r: d.aura.r, stats: scaled(d.aura.stats, o.q, o.tuned) });
    }
  }
  const q = (s: CommSlot) => QUALITIES[owned(g, g.comm[s])?.q ?? 'standard'].mult;
  return { comm, roles, weaponQ: { primary: q('primary'), secondary: q('secondary') }, calm, ghostly, auras, dash, skill };
}

/** Armour as a damage multiplier: diminishing returns, 100 / (100 + armour) (the engine's, `effects.ts`). */
export { armourMul } from './effects';
/** A percent stat as a multiplier. */
export const pct = (v = 0) => 1 + v / 100;

// ---- Gear as effect sources ------------------------------------------------------------------------------------------

/**
 * What the skills do, as effects on their triggers (`effects.ts`). The Sim still pays the steam, runs the cooldown and
 * moves the dash (`SKILLS`, `DASH`); these say what happens to the world. A spawn's `then` is what a trail or cloud does to
 * each foe it touches (`Effects.touch`).
 */
export const SKILL_EFFECTS: Record<SkillId, Effect[]> = {
  dash: [],
  afterburner: [
    { when: 'dash', cd: 0, do: { do: 'spawn', what: 'trail', kind: 'afterburner', ttl: DASH.time, radius: DASH.burnR, then: { do: 'damage', type: 'steam', amount: DASH.burn } } },
  ],
  shadeStep: [
    {
      when: 'dash', cd: 0,
      do: [
        { do: 'status', id: 'grace', duration: DASH.time },
        { do: 'spawn', what: 'trail', kind: 'shade', ttl: DASH.time, radius: DASH.burnR, then: { do: 'damage', type: 'dark', amount: DASH.burn } },
      ],
    },
  ],
  smokeDash: [
    { when: 'dash', cd: 0, do: { do: 'spawn', what: 'trail', kind: 'smoke', ttl: DASH.time, radius: DASH.burnR, then: { do: 'status', id: 'blinded' } } },
  ],
  brassGuard: [{ when: 'skill', cd: 0, do: { do: 'spawn', what: 'ally', kind: 'guard', count: BRASS_GUARD.n, ttl: BRASS_GUARD.life } }],
  whistle: [{ when: 'skill', cd: 0, do: { do: 'pulse', radius: WHISTLE.r, knock: WHISTLE.knock, then: { do: 'damage', type: 'steam', amount: WHISTLE.dmg } } }],
};

/**
 * How each gear stat is written in the engine: the stat, how much of it a point of gear is, and (`via`) the kind of hit it
 * is limited to. Percent stats are `pct`, flat ones `add`.
 */
const ENGINE: Record<GearStat, { stat: Stat; per: number; add?: boolean; via?: string }> = {
  dmg: { stat: 'damage', per: 0.01 },
  meleeDmg: { stat: 'damage', per: 0.01, via: 'melee' },
  rangedDmg: { stat: 'damage', per: 0.01, via: 'gun' },
  atkSpeed: { stat: 'attackRate', per: 0.01 },
  crit: { stat: 'crit', per: 0.01, add: true },
  armour: { stat: 'damageTaken', per: -0.01 },
  oil: { stat: 'maxHp', per: 1, add: true },
  speed: { stat: 'speed', per: 0.01 },
  steam: { stat: 'maxSteam', per: 1, add: true },
  steamRegen: { stat: 'steamRegen', per: 0.01 },
  accuracy: { stat: 'accuracy', per: 0.01 },
  range: { stat: 'range', per: 0.01 },
  knock: { stat: 'knockback', per: 0.01 },
  gather: { stat: 'siphonRate', per: 0.01 },
  repair: { stat: 'repairRate', per: 0.01 },
  magnet: { stat: 'magnet', per: 0.01 },
  plating: { stat: 'plating', per: 1, add: true },
  parry: { stat: 'parry', per: 0.01, add: true },
};

/** Gear stats as passive effects (one per kind of hit they are limited to), each also needing `needs`. With `aura`, passives for the wearer's allies instead. */
function statEffects(stats: Stats | undefined, needs: Cond[], aura: { r: number } | null = null): Effect[] {
  const by = new Map<string | undefined, StatAct[]>();
  for (const [k, v] of Object.entries(stats ?? {}) as [GearStat, number][]) {
    const e = ENGINE[k];
    const list = by.get(e.via) ?? [];
    list.push({ do: 'stat', stat: e.stat, ...(e.add ? { add: v * e.per } : { pct: v * e.per }) });
    by.set(e.via, list);
  }
  const out: Effect[] = [];
  for (const [via, acts] of by) {
    const cond = [...needs, ...(via ? [{ is: 'via', via } as Cond] : [])];
    out.push({ when: aura ? 'aura' : 'always', ...(aura ?? {}), ...(cond.length && { if: cond }), do: acts } as Effect);
  }
  return out;
}

/** Gear-style stats (percent, points) as one always-on source: what a workshop rank or chassis gives (`sim/bots.ts`). */
export const statsSource = (id: string, stats: Stats, name?: string, kind: Source['kind'] = 'other'): Source => ({ id, kind, name, effects: statEffects(stats, []) });

const NEEDS_ANTENNA: Cond = { is: 'team', tag: 'antenna' };
const needsOf = (d: ItemDef): Cond[] => (d.needs === 'antenna' ? [NEEDS_ANTENNA] : []);
const flagEffects = (d: ItemDef, needs: Cond[]): Effect[] => [
  ...(['calm', 'ghostly'] as const).filter((f) => d[f]).map((flag) => ({ when: 'always', ...(needs.length && { if: needs }), do: { do: 'flag', flag } }) as Effect),
  // A lamp lights as far as its aura reaches: the `lamp` stat is that radius (a Beacon multiplies it, a Long Wick adds to it).
  ...(d.lamp && d.aura ? [{ when: 'always', ...(needs.length && { if: needs }), do: { do: 'stat', stat: 'lamp', add: d.aura.r } } as Effect] : []),
];
/** An event effect that also needs `needs`. */
const gated = (e: Effect, needs: Cond[]): Effect => (needs.length ? ({ ...e, if: [...needs, ...(e.if === undefined ? [] : Array.isArray(e.if) ? e.if : [e.if])] } as Effect) : e);

/** Add a source under a unique id in its list (two copies of an item worn by one unit keep both). */
function put(list: Source[], src: Source): void {
  let id = src.id;
  for (let n = 2; list.some((x) => x.id === id); n++) id = `${src.id}#${n}`;
  list.push({ ...src, id });
}

/** A weapon's source: its quality, and what it does beyond its hit (`WeaponExtra`): crit, bounce, chain, pellets. */
function weaponSource(o: Owned): Source {
  const d = ITEMS[o.id];
  const wid = d.weapon!;
  const w = WEAPONS[wid]; // its `type` may be an old id (the fang whip's `rust`): the sources always use the current one, Acid
  const here: Cond = { is: 'weapon', weapon: wid };
  const effects: Effect[] = [];
  const m = QUALITIES[o.q].mult;
  if (m !== 1) effects.push({ when: 'always', if: here, do: { do: 'stat', stat: 'damage', more: m } });
  // A critical hit is a second identical hit; every weapon has the chance (the gear's `crit` adds to the weapon's own).
  const crit: Action[] = [{ do: 'damage', type: canonType(w.type), ofBase: 1 }];
  if (w.bounce) crit.push({ do: 'chain', jumps: 1, range: 200, then: { do: 'damage', type: canonType(w.type), ofBase: 1 } });
  effects.push({ when: 'hit', if: here, cd: 0, chance: { stat: 'crit', base: w.crit ?? 0 }, do: crit });
  if (w.chain) effects.push({ when: 'hit', if: here, cd: 0, do: { do: 'chain', jumps: w.chain.n, range: w.chain.range, then: { do: 'damage', type: 'shock', ofBase: w.chain.share } } });
  if (w.pellets) effects.push({ when: 'shot', if: here, cd: 0, do: { do: 'spawn', what: 'pellets', kind: wid, count: w.pellets.n, spread: w.pellets.spread } });
  if (w.rider) effects.push({ when: 'hit', if: here, cd: 0, chance: w.rider.chance, do: { do: 'status', id: w.rider.status, stacks: w.rider.stacks ?? 1 } });
  if (w.pump) effects.push({ when: 'hit', if: here, cd: 0, every: w.pump.hits, do: { do: 'pulse', radius: w.pump.r, side: 'ally', self: true, then: { do: 'heal', amount: w.pump.heal, to: 'target' } } });
  // What the item itself adds (a night version's Dark rider): its effects name the weapon they belong to.
  effects.push(...(d.effects ?? []));
  return { id: o.id, kind: 'gear', name: d.name, quality: o.q, effects };
}

/** A fitted mod as an effect source for the weapon it sits on: its rule as engine effects when it has them (`defs/mods.ts`; the rest are code in `mods.ts`). */
export const modSource = (m: ModId, w: WeaponId): Source => ({ id: `mod:${m}`, kind: 'mod', name: MODS[m].name, effects: MODS[m].effects?.(w) ?? [] });

/** The mods fitted on the weapons in the two slots, by weapon id (a weapon in both slots counts once, the primary's, as its source does). */
export function slotMods(g: Gear): Partial<Record<WeaponId, ModId[]>> {
  const out: Partial<Record<WeaponId, ModId[]>> = {};
  const seen = new Set<WeaponId>();
  for (const s of ['primary', 'secondary'] as const) {
    const o = owned(g, g.comm[s]);
    const w = o && ITEMS[o.id].weapon;
    if (!o || !w || seen.has(w)) continue;
    seen.add(w);
    const mods = modsOn(g, o.uid).map((m) => ITEMS[m.id].mod!);
    if (mods.length) out[w] = mods;
  }
  return out;
}

/** A weapon in hand that no worn item stands for (a find, a dev command): the source of a Standard copy, so its extras still work. */
export const loneWeaponSource = (w: WeaponId): Source => ({ ...weaponSource({ uid: 0, id: itemOfWeapon(w), q: 'standard' }), id: `weapon:${w}` });

/** What the effect engine gets from the gear: sources for the Communicator and for every bot of a crew role. */
export interface GearSources {
  /** Add each to the Communicator's unit. */
  comm: Source[];
  /** Add each to every bot of the role (the Brass Guard's too). */
  roles: Record<CrewRole, Source[]>;
  /** The rear and pack pieces' skills: the Sim still pays their steam and cooldown (`SKILLS`); their effects are in the sources. */
  dash: SkillId | null;
  skill: SkillId | null;
}

/**
 * Every worn item as an effect source, in the same shape `gearMods` gives numbers: whatever `gearMods` yields, these yield.
 *   - `stats` are passive `always` mods (`ENGINE` says how each is written; melee and ranged damage are limited to melee and
 *     gun hits by a `via` condition); quality scales the bonuses first (`scaled`), never the drawbacks.
 *   - `crew` are passive mods in the source of every role, while the Communicator wears the item.
 *   - `aura` is the aura passive on the wearer's source: allies within `r` get it (not the wearer; once per item).
 *   - `needs: antenna` is an `if: { is: 'team', tag: 'antenna' }` on every effect of the item, and an item that
 *     `provides` an antenna tags its wearer `antenna`, so it also stops working if the antenna's wearer is down.
 *   - `calm` and `ghostly` are flag passives; the dash and the pack skill have their `SKILL_EFFECTS` on `dash` and `skill`.
 *   - Weapons are sources of their own: quality as `damage` more on the weapon's hits, and the extras (crit, bounce, chain,
 *     pellets) as effects on `hit` and `shot` for that weapon. The host passes `weapon: <WeaponId>` to `strike` and `emit`.
 *     (A weapon id in both slots counts once, the primary's.)
 */
export function gearSources(g: Gear): GearSources {
  const comm: Source[] = [];
  const roles = Object.fromEntries(CREW_ROLES.map((r) => [r, []])) as unknown as Record<CrewRole, Source[]>;
  let dash: SkillId | null = null, skill: SkillId | null = null;
  const weapons = new Set<WeaponId>();
  for (const s of COMM_SLOTS) {
    const o = owned(g, g.comm[s]);
    if (!o) continue;
    const d = ITEMS[o.id];
    if (s === 'primary' || s === 'secondary') {
      if (d.weapon && !weapons.has(d.weapon)) {
        weapons.add(d.weapon);
        put(comm, weaponSource(o));
        for (const m of modsOn(g, o.uid)) put(comm, modSource(ITEMS[m.id].mod!, d.weapon));
      }
      continue;
    }
    const needs = needsOf(d);
    const own = [
      ...statEffects(scaled(d.stats, o.q, o.tuned), needs),
      ...(d.aura ? statEffects(scaled(d.aura.stats, o.q, o.tuned), needs, { r: d.aura.r }) : []),
      ...flagEffects(d, needs),
      ...(d.skill ? SKILL_EFFECTS[d.skill].map((e) => gated(e, needs)) : []),
      ...(d.effects ?? []).map((e) => gated(e, needs)),
    ];
    const base = { id: o.id, kind: 'gear' as const, name: o.tuned ? `${d.name} (tuned)` : d.name, quality: o.q };
    if (own.length || d.provides) put(comm, { ...base, effects: own, ...(d.provides && { tags: [d.provides] }) });
    const crew = statEffects(scaled(d.crew, o.q, o.tuned), needs);
    if (crew.length) for (const r of CREW_ROLES) put(roles[r], { ...base, effects: crew });
    if (d.skill && SKILLS[d.skill].key === 'dash') dash = d.skill;
    if (d.skill && SKILLS[d.skill].key === 'skill') skill = d.skill;
  }
  for (const r of CREW_ROLES)
    for (const s of BOT_SLOTS) {
      const o = owned(g, g.bots[r][s]);
      if (!o) continue;
      const d = ITEMS[o.id];
      const effects = [...statEffects(scaled(d.stats, o.q, o.tuned), []), ...(d.aura ? statEffects(scaled(d.aura.stats, o.q, o.tuned), [], { r: d.aura.r }) : []), ...flagEffects(d, []), ...(d.effects ?? [])];
      if (effects.length) put(roles[r], { id: o.id, kind: 'gear', name: d.name, quality: o.q, effects });
    }
  return { comm, roles, dash, skill };
}

// ---- Weapons and the loadout -----------------------------------------------------------------------------------------

/** The weapon ids in the two slots. */
export function slotWeapons(g: Gear): { weapon: WeaponId; secondary: WeaponId | null } {
  const w = (s: CommSlot) => ITEMS[owned(g, g.comm[s])?.id ?? 'shovel'].weapon ?? null;
  return { weapon: w('primary') ?? 'shovel', secondary: g.comm.secondary !== undefined ? w('secondary') : null };
}

/**
 * Line the gear up with the loadout's weapons (found in a mission: the shrine's steam gun; or set by a dev command): every
 * weapon owned has an item (a found one is Standard), and the slots hold items of the loadout's weapons (the best one
 * owned when the slot's item is another weapon).
 */
export function syncWeapons(g: Gear, l: { weapons: WeaponId[]; weapon: WeaponId; secondary: WeaponId | null }): Gear {
  let gear = g;
  for (const w of l.weapons) if (!gear.items.some((o) => ITEMS[o.id].weapon === w)) gear = addItem(gear, itemOfWeapon(w)).gear;
  const best = (w: WeaponId, not?: number) => gear.items.filter((o) => ITEMS[o.id].weapon === w && o.uid !== not).sort((a, b) => QUALITY_ORDER.indexOf(b.q) - QUALITY_ORDER.indexOf(a.q))[0]?.uid;
  const comm = { ...gear.comm };
  const has = (s: CommSlot, w: WeaponId | null) => (w === null ? comm[s] === undefined : ITEMS[owned(gear, comm[s])?.id ?? 'shovel'].weapon === w && comm[s] !== undefined);
  if (!has('primary', l.weapon)) comm.primary = best(l.weapon);
  if (!has('secondary', l.secondary)) {
    if (l.secondary) comm.secondary = best(l.secondary, comm.primary);
    else delete comm.secondary;
  }
  return cleanGear({ ...gear, comm });
}

/** Every weapon the gear owns (for the loadout's `weapons`). */
export const gearWeapons = (g: Gear): WeaponId[] => [...new Set(g.items.map((o) => ITEMS[o.id].weapon).filter((w): w is WeaponId => !!w))];

// ---- Filters (the inventory) -----------------------------------------------------------------------------------------

/** What an item is made of, by name: scrap and the parts its recipe spends. */
export function materialsOf(id: ItemId): string[] {
  const r = ITEMS[id].recipe;
  return [r.scrap ? 'Scrap' : '', ...Object.keys(r.parts ?? {}).map((k) => PARTS[k as PartKind].name)].filter(Boolean);
}
/** The search box: an item by its name, or every item made out of a material by that material's name (any part of either, any case). */
export function searchHit(id: ItemId, text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  return [ITEMS[id].name, ...materialsOf(id)].some((n) => n.toLowerCase().includes(t));
}
/** A name the search box can suggest: an item (`id` an ItemId) or a material (`id` 'scrap' or a PartKind). */
export interface SearchTerm { name: string; kind: 'item' | 'material'; id: string }
/** Every item's and every material's name, once each, sorted. */
export function searchTerms(): SearchTerm[] {
  const all: SearchTerm[] = [
    ...itemIds.map((id): SearchTerm => ({ name: ITEMS[id].name, kind: 'item', id })),
    { name: 'Scrap', kind: 'material', id: 'scrap' },
    ...(Object.keys(PARTS) as PartKind[]).map((k): SearchTerm => ({ name: PARTS[k].name, kind: 'material', id: k })),
  ];
  const seen = new Set<string>();
  return all.filter((t) => !seen.has(t.name) && seen.add(t.name)).sort((a, b) => a.name.localeCompare(b.name));
}
/** What the box suggests for what is typed: names holding it, those starting with it (or a word of them) first; none once it names one exactly. */
export function suggest(text: string, limit = 8, terms = searchTerms()): SearchTerm[] {
  const t = text.trim().toLowerCase();
  if (!t || terms.some((x) => x.name.toLowerCase() === t)) return [];
  const rank = (n: string) => (n.startsWith(t) ? 0 : n.split(/[\s'-]+/).some((w) => w.startsWith(t)) ? 1 : 2);
  return terms
    .filter((x) => x.name.toLowerCase().includes(t))
    .sort((a, b) => rank(a.name.toLowerCase()) - rank(b.name.toLowerCase()) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * The lands an item comes from: the land whose shrine holds its weapon, and the lands whose machines (on the surface or
 * down its dungeon) drop the parts its recipe spends. Plain-scrap items come from nowhere in particular. Derived, so a new
 * item or foe lands in the right filter by itself.
 */
export const LANDS: BiomeId[] = Object.keys(BIOMES) as BiomeId[];
const FOE_LANDS = (() => {
  const m = new Map<Enemy, Set<BiomeId>>();
  const at = (e: Enemy | null | undefined, b: BiomeId) => e && (m.get(e) ?? m.set(e, new Set()).get(e)!).add(b);
  for (const b of LANDS) {
    const d = BIOMES[b];
    for (const [e] of d.foes) at(e, b);
    for (const e of Object.keys(d.mix ?? {}) as Enemy[]) at(e, b);
    at(d.edge, b);
    at(d.dusk, b);
    const k = KITS[b];
    if (k.built) for (const e of [...k.foes, ...k.bosses]) at(e, b);
  }
  return m;
})();
export function landsOf(id: ItemId): BiomeId[] {
  const d = ITEMS[id], out = new Set<BiomeId>();
  for (const b of LANDS) if (d.weapon && BIOMES[b].shrine === d.weapon) out.add(b);
  for (const k of Object.keys(d.recipe.parts ?? {}) as PartKind[]) for (const b of FOE_LANDS.get(PARTS[k].from) ?? []) out.add(b);
  return LANDS.filter((b) => out.has(b));
}

export interface Filter { tags?: Tag[]; qualities?: Quality[]; who?: 'comm' | 'bot'; slot?: CommSlot | BotSlot; text?: string; lands?: BiomeId[] }
export function matches(id: ItemId, q: Quality | null, f: Filter): boolean {
  const d = ITEMS[id];
  if (f.text && !searchHit(id, f.text)) return false;
  if (f.lands?.length && !landsOf(id).some((b) => f.lands!.includes(b))) return false;
  if (f.tags?.length && !f.tags.some((t) => d.tags.includes(t))) return false;
  if (q && f.qualities?.length && !f.qualities.includes(q)) return false;
  if (f.who === 'comm' && !fitsComm(d) && !d.mod) return false; // a mod is the Communicator's, fitted on his weapon (P57)
  if (f.who === 'bot' && !d.bot) return false;
  if (f.slot) {
    const s = f.slot;
    const ok = s === 'primary' || s === 'secondary' ? !!d.weapon : d.comm === s || d.bot === s;
    if (!ok) return false;
  }
  return true;
}
