/**
 * What falls and what it is worth: scrap, copper, insight, the loot table, robot parts.
 * Add a part: a `PartKind` and its `PARTS` entry, and the enemy's line in `ENEMY_PARTS`.
 */
import type { Enemy } from './foes';

/** What a kill pays in scrap, the main currency (`hub/economy.ts` banks it; a gob dropped beside it is `LOOT.scrap`). Ruins pay none: copper and junk. First guesses to tune in play. */
export const SCRAP = { kill: { common: 2, elite: 6, boss: 40 } };

/**
 * Copper, the building material (stations, your house, the Wanderer's improvements, the city's growth): stripped, not dug. A
 * dead ruin searched gives up its wiring (`dead`), a live one decoded its motors and busbars (`live`), an elite its windings
 * (`elite`); a boss drops its own heap (`BOSSES[...].drops.copper`). The Hollow City's `copperMul` multiplies every figure.
 * First guesses: a land of six or seven ruins is worth about 35 to 45 copper, the first station 30.
 */
export const COPPER = { dead: 4, live: 8, elite: 2, start: 30 };

/** What old research a mission finds (`Sim.insight`; `hub/economy.ts` banks it): a live ruin decoded (P30), the Parable's third verse, a Signal Mast. */
export const INSIGHT = { liveRuin: 1, parable: 1, mast: 1 };

/** Insight from the live ruins decoded in a mission (P30, D9 row 1): one each. A dead ruin searched pays none (it pays scrap and junk). */
export const insightFromRuins = (live: number) => (Number.isFinite(live) ? Math.max(0, Math.floor(live)) : 0) * INSIGHT.liveRuin;

/**
 * What a downed mechahornet may drop: a gob of scrap or a robot part. Oil is not on the plain
 * table: an elite sometimes drops a small pickup (`eliteOil`), a boss exactly one can, and the rest are authored places and
 * ruins (`docs/threads.md`). A ruin gives scrap and copper; a boss scrap, copper and its one can. Parts are body pieces by slot, brought home to combine into new robots (a hornet's head on mecha
 * horse legs...). One enemy type gives one kind of part; its elites can give the others. The Communicator pulls loot in
 * from `magnet` px; any robot that walks over it picks it up.
 */
export type LootKind = 'scrap' | 'copper' | 'oil' | 'part' | 'core';

export const LOOT = {
  chance: 0.4,
  table: [['scrap', 5], ['part', 3]] as [LootKind, number][],
  /** Scrap in a plain gob (grows with `rich.scrap`). */
  scrap: 4,
  /** An elite's small oil pickup: the chance on its death, and the oil in it (a can is `oil`): it heals, and what the bar cannot hold goes into the reserve like any oil. */
  eliteOil: { chance: 0.35, amt: 10 },
  /**
   * Staying pays. `rich` runs 0 in the morning, 1 at midnight, 2 at the top of the menace (`Sim.rich`); each unit adds
   * this to the drop chance, grows a gob of scrap by this share, grows the weight of parts in the table by this
   * share, and makes this share of a plain hornet's parts the rarer ones. `cap` bounds the drop chance.
   */
  rich: { chance: 0.3, scrap: 1, part: 1, rare: 0.5, cap: 0.9 },
  oil: 30,
  magnet: 80,
  /** Seconds before it sinks into the sand. */
  life: 45,
};

/** Where a part goes on a robot. Each part has its own sprite (`part-<kind>` in art.ts), to be layered into robots. */
export type Slot = 'head' | 'body' | 'arms' | 'legs' | 'back';

/** The part each elite trait drops (`ELITE_TRAITS`). */
export type TraitPart = 'drum-wing' | 'shell-plate' | 'splitter-core' | 'brood-sac' | 'spinneret-plus' | 'speaker-grille' | 'steel-hood' | 'rattle' | 'leech-mouth' | 'twin-scythe' | 'herald-horn' | 'shield-emitter' | 'mortar-tube' | 'overclock-chip';

/** The part a twisted enemy drops (P13; `TWISTED_PART`, flagged `twisted` in `PARTS`): the night recipes' material (systems.md, Gear). */
export type TwistedPart = 'twisted-coil' | 'twisted-cable' | 'twisted-gland' | 'twisted-fang' | 'twisted-lens';

export type PartKind = 'hornet-head' | 'hornet-stinger' | 'hornet-wings' | 'queens-crown' | 'swarmer-wing' | 'swarmer-scythe' | 'drone-optics' | 'drone-cannon' | 'harbinger-heart' | 'spider-lens' | 'spider-spinneret' | 'spider-legs' | 'snake-skin' | 'rattlejaw-fang' | 'cat-haunches' | 'boar-tusk' | 'monkey-arm' | 'commuter-case' | 'officer-badge' | 'charger-legs' | 'goat-horns' | 'bleater-box' | 'kite-wings' | 'ironback-drum' | 'paladin-lance' | 'polaris-core' | 'wisp-lantern' | 'shade-cloak' | 'banshee-vent' | 'false-halo' | TraitPart | TwistedPart
  | 'piranha-jaw' | 'swan-feather' | 'hookhand' | 'price-tag' | 'cart-wheel' | 'cop-whistle' | 'cop-megaphone' | 'vein-cable' | 'hemo-pump' | 'frost-carapace' | 'auger-bit' | 'ice-auger';

/** `unique`: a boss's own part, never dropped by the common loot (`ENEMY_PARTS`); the workshop shows it apart, with its `source` and `flavour` (for fun). */
export const PARTS: Record<PartKind, { name: string; plural: string; slot: Slot; from: Enemy; unique?: boolean; /** Dropped by a twisted enemy (`TWISTED_PART`): the material of a night recipe. */ twisted?: boolean; source?: string; flavour?: string; /** Picked up, it becomes this gear item (`sim/gear.ts` ITEMS) instead of a part in the stores. */ item?: string }> = {
  'hornet-head': { name: 'Mechahornet head', plural: 'Mechahornet heads', slot: 'head', from: 'hornet' },
  'hornet-stinger': { name: 'Mechahornet stinger', plural: 'Mechahornet stingers', slot: 'arms', from: 'hornet' },
  'hornet-wings': { name: 'Mechahornet wings', plural: 'pairs of mechahornet wings', slot: 'back', from: 'hornet' },
  'queens-crown': {
    name: "The Queen's Crown",
    plural: "Queen's Crowns",
    slot: 'head',
    from: 'hornet',
    unique: true,
    source: 'The Hornet Queen',
    flavour: 'Black gloss and cyan LEDs, still blinking for a hive that no longer answers. The engineers will pray over it for a week before anyone dares to touch it.',
  },
  'swarmer-wing': { name: 'Swarmer wing', plural: 'swarmer wings', slot: 'back', from: 'swarmer' },
  'swarmer-scythe': { name: 'Scythe claw', plural: 'scythe claws', slot: 'arms', from: 'swarmer' },
  'drone-optics': { name: 'Obsession optics', plural: 'sets of obsession optics', slot: 'head', from: 'drone' },
  'drone-cannon': { name: 'Dark plasma cannon', plural: 'dark plasma cannons', slot: 'arms', from: 'drone' },
  'spider-lens': { name: 'Crawlcam lens cluster', plural: 'Crawlcam lens clusters', slot: 'head', from: 'spider' },
  'spider-spinneret': { name: 'Crawlcam spinneret', plural: 'Crawlcam spinnerets', slot: 'arms', from: 'spider' },
  'spider-legs': { name: 'Crawlcam legs', plural: 'sets of Crawlcam legs', slot: 'back', from: 'spider' },
  'cat-haunches': { name: 'Spring haunches', plural: 'pairs of spring haunches', slot: 'legs', from: 'cat', flavour: 'A clockwork jaguar\'s back legs, wound tight. They still want to pounce.' },
  'boar-tusk': { name: 'Piston tusk', plural: 'piston tusks', slot: 'arms', from: 'boar' },
  'monkey-arm': { name: 'Long arm', plural: 'long arms', slot: 'arms', from: 'monkey', flavour: 'Telescopic, sticky-fingered. It has already taken something from your pocket.' },
  'commuter-case': { name: 'Briefcase', plural: 'briefcases', slot: 'back', from: 'commuter', flavour: 'Locked. Inside, by the sound of it: one sandwich, three hundred years old.' },
  'officer-badge': { name: 'Badge', plural: 'badges', slot: 'head', from: 'officer' },
  'charger-legs': { name: 'Destrier legs', plural: 'sets of destrier legs', slot: 'legs', from: 'charger' },
  'goat-horns': { name: 'Ram horns', plural: 'pairs of ram horns', slot: 'arms', from: 'goat' },
  'bleater-box': { name: 'Bleat box', plural: 'bleat boxes', slot: 'head', from: 'bleater', flavour: 'Press it. Go on. (Everyone within a mile now hates you.)' },
  'kite-wings': { name: 'Kite wings', plural: 'pairs of kite wings', slot: 'back', from: 'kite' },
  'wisp-lantern': { name: 'Wisp lantern', plural: 'wisp lanterns', slot: 'head', from: 'wisp', flavour: 'Cold light in a jar. It flickers when someone lies.' },
  'shade-cloak': { name: 'Shade cloak', plural: 'shade cloaks', slot: 'back', from: 'shade', flavour: 'A rag of the dark. It weighs nothing and still hangs heavy.' },
  'banshee-vent': { name: 'Banshee vent', plural: 'banshee vents', slot: 'arms', from: 'banshee' },
  'false-halo': {
    name: 'The False Halo',
    plural: 'False Halos',
    slot: 'head',
    from: 'evilOracle',
    unique: true,
    source: 'The Evil Oracle',
    flavour: 'A crooked ring of black brass. It hums the Oracle\'s hymns a semitone flat.',
  },
  'ironback-drum': {
    name: "The Ironback's Drum",
    plural: "Ironback's Drums",
    slot: 'back',
    from: 'gorilla',
    unique: true,
    source: 'The Ironback',
    flavour: 'A theme-park show drum, dented by a gorilla\'s fists. Hit it and every robot near stands up straighter.',
  },
  'paladin-lance': {
    name: "The Paladin's Lance",
    plural: "Paladin's Lances",
    slot: 'arms',
    from: 'knight',
    unique: true,
    source: 'Sir Lancelot-9',
    flavour: 'Fibreglass over steel, painted for a jousting show. It has run through more parked cars than dragons.',
  },
  'polaris-core': {
    name: 'The Polaris Core',
    plural: 'Polaris Cores',
    slot: 'legs',
    from: 'bear',
    unique: true,
    source: 'Ursa Polaris',
    flavour: 'Tracks that fold into a jet\'s hover fans and back. The cockpit voice still asks for clearance to land.',
  },
  // Trait parts (P12): what an elite of that trait drops. Their effects are the crafting plans' (systems.md, Built kinds).
  'drum-wing': { name: 'Drum wing', plural: 'drum wings', slot: 'back', from: 'hornet', flavour: 'Still beating its small tin tattoo. Every hornet nearby wants to go faster.' },
  'shell-plate': { name: 'Shell plate', plural: 'shell plates', slot: 'back', from: 'hornet', flavour: 'Black gloss over steel. Hits from the front slide off; the ones from behind are your problem.' },
  'splitter-core': { name: 'Splitter core', plural: 'splitter cores', slot: 'body', from: 'hornet', flavour: 'It comes apart so well it forgets to stop.' },
  'brood-sac': { name: 'Brood sac', plural: 'brood sacs', slot: 'back', from: 'spider', flavour: 'Warm. Something inside is learning to walk.' },
  'spinneret-plus': { name: 'Spinneret+', plural: 'Spinneret+ units', slot: 'arms', from: 'spider', flavour: 'The cable it spits clings to the ground as well as to you.' },
  'speaker-grille': { name: 'Speaker grille', plural: 'speaker grilles', slot: 'head', from: 'spider', flavour: 'It says one thing, loudly, until everyone looks.' },
  'steel-hood': { name: 'Steel hood', plural: 'steel hoods', slot: 'back', from: 'snake', flavour: 'A cobra\'s hood in riveted plate. Stand in front of it and nothing happens, which is the point.' },
  rattle: { name: 'Rattle', plural: 'rattles', slot: 'head', from: 'snake', flavour: 'Shake it and the walls answer.' },
  'leech-mouth': { name: 'Leech mouth', plural: 'leech mouths', slot: 'arms', from: 'swarmer', flavour: 'It repairs itself with whatever it bites.' },
  'twin-scythe': { name: 'Twin scythe', plural: 'twin scythes', slot: 'arms', from: 'swarmer', flavour: 'Two blades; the second arrives before the first has finished.' },
  'herald-horn': { name: 'Herald horn', plural: 'herald horns', slot: 'head', from: 'swarmer', flavour: 'One note. Every swarmer in the district hears the invitation.' },
  'shield-emitter': { name: 'Shield emitter', plural: 'shield emitters', slot: 'back', from: 'drone', flavour: 'A mirror of cold plasma that shrugs off whatever was fired at it, and some of it comes back.' },
  'mortar-tube': { name: 'Mortar tube', plural: 'mortar tubes', slot: 'arms', from: 'drone', flavour: 'A drainpipe with ambitions.' },
  'overclock-chip': { name: 'Overclock chip', plural: 'overclock chips', slot: 'head', from: 'drone', flavour: 'Runs hot when it is hurt. The warranty is a rumour.' },
  'snake-skin': { name: 'Snake skin', plural: 'snake skins', slot: 'body', from: 'snake', flavour: "It's metal plating, but you can still move like a snake." },
  'rattlejaw-fang': {
    name: "Rattlejaw's fang whip",
    plural: "Rattlejaw's fang whips",
    slot: 'arms',
    from: 'snake',
    unique: true,
    source: 'Old Rattlejaw',
    flavour: 'Its tail, still rattling, with the fang on the end. It goes straight into your inventory: a weapon.',
    item: 'fangWhip',
  },
  // Twisted parts (P13): what a twisted enemy of the five built kinds drops, by what its night form does.
  'twisted-coil': { name: 'Twisted dark coil', plural: 'twisted dark coils', slot: 'back', from: 'hornet', twisted: true, flavour: 'The coil that laid the dark behind a dash. It still hums, a half-tone wrong.' },
  'twisted-cable': { name: 'Twisted scald cable', plural: 'twisted scald cables', slot: 'arms', from: 'spider', twisted: true, flavour: 'A cable that comes out of the reel hot. Wear gloves.' },
  'twisted-gland': { name: 'Twisted acid gland', plural: 'twisted acid glands', slot: 'body', from: 'snake', twisted: true, flavour: 'A rattler\'s sac, full and sloshing. It leaves a ring wherever it is set down.' },
  'twisted-fang': { name: 'Twisted blood fang', plural: 'twisted blood fangs', slot: 'arms', from: 'swarmer', twisted: true, flavour: 'It drinks what it bites and wants more, quickly.' },
  'twisted-lens': { name: 'Twisted splitter lens', plural: 'twisted splitter lenses', slot: 'head', from: 'drone', twisted: true, flavour: 'A prism where the cannon\'s mouth was. One bolt goes in; three come out.' },
  // The designed dungeons' (dungeons.md): each kit's material (what its side caches hold), its other foe's part, and the
  // mini-boss's weapon, which goes straight into the inventory (`item`) like the fang whip.
  'piranha-jaw': { name: 'Piranha jaw', plural: 'piranha jaws', slot: 'arms', from: 'piranha', flavour: 'Forty steak knives on a spring. It still snaps if you poke it.' },
  'swan-feather': { name: 'Swan feather', plural: 'swan feathers', slot: 'back', from: 'cupid', flavour: 'Copper, beaten thin and painted white. Real swans were softer, the Oracle says, and less punctual.' },
  hookhand: { name: 'Hookhand harpoon', plural: 'Hookhand harpoons', slot: 'arms', from: 'croc', unique: true, source: 'Captain Croc', flavour: 'The Captain\'s own hook on a cable, with the winch still in the arm. "Ahoy" is written on the grip.', item: 'hookhand' },
  'price-tag': { name: 'Price tag', plural: 'price tags', slot: 'head', from: 'mannequin', flavour: 'A chip in a plastic tag, still sure what everything is worth. Fifty percent off, forever.' },
  'cart-wheel': { name: 'Squeaky wheel', plural: 'squeaky wheels', slot: 'legs', from: 'cart', flavour: 'It pulls to the left. They all pull to the left.' },
  'cop-whistle': { name: 'Cop whistle', plural: 'cop whistles', slot: 'head', from: 'copdrone' },
  'cop-megaphone': { name: 'Megaphone blaster', plural: 'Megaphone blasters', slot: 'arms', from: 'mallcop', unique: true, source: 'Mall Cop Mk. III', flavour: '"PLEASE STEP AWAY FROM THE ESCALATOR." It still says it, if you squeeze the trigger gently.', item: 'megaphone' },
  // (The Blood Cistern's material is the leech elites' own `leech-mouth`, above: the dungeon's leech drones drop it too.)
  'vein-cable': { name: 'Vein cable', plural: 'vein cables', slot: 'body', from: 'veinworm', flavour: 'Red cable that pulses when you hold it. The engineers wear gloves.' },
  'hemo-pump': { name: 'Hemo-pump flail', plural: 'Hemo-pump flails', slot: 'arms', from: 'bishop', unique: true, source: 'The Bishop of Veins', flavour: 'An organ pipe on a chain, its little pump still beating. Swing it and it fills; full, it gives.', item: 'hemoFlail' },
  'frost-carapace': { name: 'Frost carapace', plural: 'frost carapaces', slot: 'back', from: 'mite', flavour: 'A mite\'s shell, rimed white. Cold to the touch, colder to whatever touches it.' },
  'auger-bit': { name: 'Auger bit', plural: 'auger bits', slot: 'arms', from: 'driller', flavour: 'A drill head the size of your fist, still turning slowly in your hand. Nobody has found its off switch.' },
  'ice-auger': { name: 'Ice-auger lance', plural: 'Ice-auger lances', slot: 'arms', from: 'snowcat', unique: true, source: 'The Snowcat', flavour: 'The groomer\'s ice auger on a lance shaft. It frosts the air in front of it.', item: 'iceLance' },
  'harbinger-heart': {
    name: "The Harbinger's Heart",
    plural: "Harbinger's Hearts",
    slot: 'body',
    from: 'drone',
    unique: true,
    source: 'The Harbinger',
    flavour: 'A ribcage behind glass and a red line that still beats on its little screen. The Oracle calls it a reliquary. The engineers say it is warm.',
  },
};

/** The twisted part of a kind (the five built ones; Laimonas's kinds drop their own part twisted or not). A twisted kill that drops a part drops this one, and a twisted elite drops it besides its trait parts. */
export const TWISTED_PART: Partial<Record<Enemy, TwistedPart>> = { hornet: 'twisted-coil', spider: 'twisted-cable', snake: 'twisted-gland', swarmer: 'twisted-fang', drone: 'twisted-lens' };

/** One enemy type, one part; an elite always drops a part, its own or one of the rarer ones. */
export const ENEMY_PARTS: Record<Enemy, { part: PartKind; elite: PartKind[] }> = {
  hornet: { part: 'hornet-head', elite: ['hornet-stinger', 'hornet-wings'] },
  swarmer: { part: 'swarmer-wing', elite: ['swarmer-scythe'] },
  drone: { part: 'drone-optics', elite: ['drone-cannon'] },
  spider: { part: 'spider-lens', elite: ['spider-spinneret', 'spider-legs'] },
  caterpillar: { part: 'spider-lens', elite: ['spider-lens'] }, // its head wears the Crawlcam's lens (no part of its own yet)
  snake: { part: 'snake-skin', elite: ['snake-skin'] },
  cat: { part: 'cat-haunches', elite: ['cat-haunches'] },
  boar: { part: 'boar-tusk', elite: ['boar-tusk'] },
  monkey: { part: 'monkey-arm', elite: ['monkey-arm'] },
  commuter: { part: 'commuter-case', elite: ['commuter-case'] },
  officer: { part: 'officer-badge', elite: ['officer-badge'] },
  charger: { part: 'charger-legs', elite: ['charger-legs'] },
  goat: { part: 'goat-horns', elite: ['goat-horns'] },
  bleater: { part: 'bleater-box', elite: ['bleater-box'] },
  kite: { part: 'kite-wings', elite: ['kite-wings'] },
  // A boss's cache: its biome's parts.
  gorilla: { part: 'boar-tusk', elite: ['cat-haunches', 'monkey-arm', 'boar-tusk'] },
  knight: { part: 'commuter-case', elite: ['charger-legs', 'officer-badge'] },
  bear: { part: 'goat-horns', elite: ['kite-wings', 'bleater-box'] },
  wisp: { part: 'wisp-lantern', elite: ['wisp-lantern'] },
  shade: { part: 'shade-cloak', elite: ['shade-cloak'] },
  banshee: { part: 'banshee-vent', elite: ['banshee-vent'] },
  evilOracle: { part: 'shade-cloak', elite: ['wisp-lantern', 'banshee-vent'] },
  foreman: { part: 'hornet-head', elite: ['hornet-stinger', 'hornet-wings'] },
  piranha: { part: 'piranha-jaw', elite: ['piranha-jaw', 'swan-feather'] },
  cupid: { part: 'swan-feather', elite: ['swan-feather'] },
  croc: { part: 'swan-feather', elite: ['piranha-jaw', 'swan-feather'] },
  mannequin: { part: 'price-tag', elite: ['price-tag'] },
  cart: { part: 'cart-wheel', elite: ['cart-wheel', 'price-tag'] },
  copdrone: { part: 'cop-whistle', elite: ['cop-whistle', 'price-tag'] },
  mallcop: { part: 'price-tag', elite: ['cart-wheel', 'cop-whistle'] },
  leech: { part: 'leech-mouth', elite: ['leech-mouth'] },
  veinworm: { part: 'vein-cable', elite: ['vein-cable', 'leech-mouth'] },
  bishop: { part: 'leech-mouth', elite: ['vein-cable', 'leech-mouth'] },
  mite: { part: 'frost-carapace', elite: ['frost-carapace'] },
  driller: { part: 'auger-bit', elite: ['auger-bit', 'frost-carapace'] },
  snowcat: { part: 'frost-carapace', elite: ['auger-bit', 'frost-carapace'] },
};
