/**
 * The lands: `BIOMES` (foes, boss, places, day, talk). The landing anomalies are in `anomalies.ts`.
 * Add a biome: a `BIOMES` entry (the skill's recipe lists the rest).
 */
import type { PlaceId } from '../places';
import type { WeaponId } from './comm';
import { DAY } from './day';
import type { Enemy } from './foes';
import type { RuinKind } from './ruins';

/**
 * Biomes: where the Wanderer lowers the lift (picked at the hub's course table). Each has its own enemies (`foes`, spawn
 * weights), boss and places, its own day (`day` scales the clock's lengths, `twist` is the least share of nightmares at
 * dusk) and its own pressure: `hives` on the land, hives the clock wakes (`wake`), the swarm's spawn `interval` and
 * `alive` cap scaled. `rich` adds to loot richness (more scrap a gob, rarer parts): the hard places pay.
 *
 * The Demon Wastes are far harder: almost no calm morning, two hives awake from the day, five on the land, more of the
 * swarm at once and faster, nightmares from the first minute of dusk, demon-vampire robots that outfly and outshoot
 * hornets, and the Harbinger in its castle. Ash and ember ground (`paintGround`).
 */
export type BiomeId = 'desert' | 'jungle' | 'city' | 'demon' | 'mountains' | 'ether';

export interface BiomeDef {
  name: string;
  /** The hidden rank (`biomes.md` "How they fit": desert 1, jungle 2, city 3, mountains 4, the Demon Wastes 5, the Ether 6): never shown, it sets the scrap a landing costs (`landingCost`, hub/economy.ts) and the order of the lands. */
  rank: number;
  blurb: string;
  /** How the ground is painted (`paintGround`): the desert's colours, or the same shapes recoloured into this biome's. */
  paint: 'desert' | 'demon' | 'jungle' | 'city' | 'snow' | 'ether';
  /** Hidden from the course table until the main quest opens it (`features` in hub/story.ts: the Ether). */
  secret?: boolean;
  /** What the Oracle calls the swarm when a hive wakes. */
  swarm: string;
  /** The land's own words (the Oracle's lines, the map, the banners): its ground, its seeps, its hives, its common machines. */
  talk: BiomeTalk;
  /** The weapon under glass in this land's Old Way shrine (place `shrine`). */
  shrine: WeaponId;
  /** The Oracle's word on landing, and the course table's warning. */
  hello?: string;
  warn?: string;
  /** The old tech lying about (`RUIN_FINDS`), one per ruin spot, shuffled; the desert's when unset. */
  ruins?: RuinKind[];
  foes: [Enemy, number][];
  /** Machines mixed into a hive's spawns beyond `foes` (each: its share of them), and the kind that arrives from off the map instead of a pick from `foes` (`EDGE`, defs/day.ts: every land gets arrivals at every stage; the desert's are hornets, its hives send spiders). */
  mix?: Partial<Record<Enemy, number>>;
  edge?: Enemy;
  /** The evening boss that arrives (the desert's queen); null: the boss waits in a place instead. */
  dusk: Enemy | null;
  places: PlaceId[];
  hives: number;
  /** A hive's oil (`NEST.hp` when unset). */
  hiveHp?: number;
  wake: { day: number; evening: number };
  interval: number;
  alive: number;
  day: { morning: number; day: number; evening: number };
  twist: number;
  rich: number;
  /** A multiplier on the copper stripped from ruins and dropped by elites and bosses: the Hollow City, all wiring in the walls, leans copper. */
  copperMul?: number;
}

/**
 * What the Oracle, the map and the banners call a land's things. `hive` is the land's own spawning building (drawn by
 * `nestart.ts`, one per `paint`), `hives` its plural; `land` reads after "on" or "with" ("on the sands"). The lines are
 * the clock's beats and the first scrap (`Sim.oracle`).
 */
export interface BiomeTalk {
  land: string;
  /** How the land's one tap looks ("a dark stain in the sand"), for the Oracle and the map. */
  tap: string;
  hive: string;
  hives: string;
  /** The common machines, plural ("mechahornets"), for the map's legend. */
  foes: string;
  morning: string;
  day: string;
  evening: string;
  flowing: string;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  desert: {
    shrine: 'steamGun',
    talk: {
      land: 'the sands', tap: 'a dark stain in the sand that does not drain away', hive: 'hive', hives: 'hives', foes: 'Crawlcams and mechahornets',
      morning: 'The sands are quiet while the sun is low. Make the most of it. The day brings visitors.',
      day: 'The sun is up, and so are the hives: they send crawlcams, and the hornets come in from the sands. Ordinary ones, for now. Mind the clock on your dial: at dusk the machines turn nasty, and at midnight I stop being patient.',
      evening: 'Dusk. The dark is getting into the machines: they twist, glow violet and burn whatever stands near them. More each hour. Keep your robots out of the halos. And something bigger stirs.',
      flowing: 'The scrap is coming in. Good. The sands are never as empty as they look; keep a guard with the gatherers. They pray louder when they’re scared.',
    },
    name: 'the desert',
    rank: 1,
    blurb: 'Scrap heaps and one dark tap, crawlcam spiders from the hives, mechahornets from the sands, the queen at dusk.',
    foes: [['spider', 1]],
    edge: 'hornet',
    dusk: 'hornet',
    // P36's after the rest (each land's earlier places stay where they were); the rare Scripture last.
    places: ['core-vault', 'pilgrim', 'shrine', 'trail', 'mast', 'graveyard', 'dungeon', 'lanes', 'battery', 'lighthouse', 'expedition', 'hornet-rest', 'bell', 'scripture', 'kennel', 'stray', 'mounds', 'compactor', 'cairn'],
    hives: 3,
    // The first land's hives are a nuisance, not a wall (guesses): half the oil, a spawn every 1.6x as long, 0.5x as many alive.
    hiveHp: 160,
    wake: { day: 1, evening: 2 },
    interval: 1.6,
    alive: 0.5,
    day: { morning: 1, day: 1, evening: 1 },
    twist: 0,
    rich: 0,
    paint: 'desert',
    swarm: 'crawlcams and mechahornets',
  },
  // Laimonas's three biomes (games/ludum-dare-60/docs/biomes.md): their own ground, day, pressure (by hidden rank,
  // Laimonas 2026-10-18: desert 1, jungle 2, city 3, mountains 4, the Demon Wastes 5, the Ether 6; this table's order), machines and dusk bosses (the Ironback, Sir Lancelot-9, Ursa
  // Polaris); their twists: the jungle's rain, the Frostspine's blizzard and cold (`defs/twists.ts`, P31); foliage and the commute are not built.
  jungle: {
    shrine: 'arcGun',
    talk: {
      land: 'the green', tap: 'a black pool under the roots, still and deep', hive: 'den', hives: 'dens', foes: 'Park beasts',
      morning: 'The green is still asleep, dew on every vine. Listen: the birds here are real. Enjoy it while the park is closed.',
      day: 'The park has opened. Its beasts are out of their dens: cats in the canopy, boars in the ferns, monkeys everywhere. Mind the clock: at dusk the rides turn nasty, and at midnight I stop being patient.',
      evening: 'Dusk under the canopy. The dark is getting into the beasts: they twist, glow violet and burn whatever stands near them. More each hour. Keep your robots out of the halos. And the Ironback is beating its drum.',
      flowing: 'The scrap is coming in. Good. The roots swallow what you leave, so be quick; and keep a guard with the gatherers. The cats like to drop on whoever is bent over.',
    },
    name: 'the Rustwood Jungle',
    rank: 2,
    blurb: 'Green dark under the canopy, an old theme park in the vines: pounce-cats, ramjet boars, spanner monkeys, the Ironback at dusk.',
    foes: [['cat', 0.35], ['boar', 0.25], ['monkey', 0.4]],
    dusk: 'gorilla',
    places: ['stage', 'core-vault', 'pilgrim', 'shrine', 'trail', 'graveyard', 'dungeon', 'expedition', 'bell', 'type-wreck', 'stray', 'mounds', 'compactor', 'cairn'],
    hives: 4,
    wake: { day: 1, evening: 3 },
    interval: 0.85,
    alive: 1.15,
    day: { morning: 1, day: 1.2, evening: 1 },
    twist: 0.1,
    rich: 0.3,
    paint: 'jungle',
    ruins: ['carousel', 'trailcam', 'golfcart', 'carousel', 'trailcam', 'golfcart'],
    swarm: 'the park\'s beasts',
    hello: 'The Rustwood. Things hunt in this green, Communicator; you will hear them before you see them.',
  },
  city: {
    shrine: 'pistonCannon',
    talk: {
      land: 'the streets', tap: 'a cracked main bleeding black into the gutter', hive: 'metro stop', hives: 'metro stops', foes: 'Commuters',
      morning: 'The streets are empty before the rush, every traffic light still changing for nobody. Search what you can.',
      day: 'Rush hour. The commuters are coming up out of the metro, late for jobs that ended centuries ago, and the officers are writing tickets. Mind the clock: at dusk the city turns nasty, and at midnight I stop being patient.',
      evening: 'Dusk. The streetlights flicker violet: the dark is getting into the commuters, and they burn whatever stands near them. More each hour. Keep your robots out of the halos. And something in armour is riding out of the museum.',
      flowing: 'The scrap is coming in. Good. The streets are never as empty as they look; keep a guard with the gatherers. Someone always comes to complain about the noise.',
    },
    name: 'the Hollow City',
    rank: 3,
    blurb: 'Empty streets, the most ruins and old tech. Commuters still on their way to work, officer units, carousel chargers, and a knight at dusk.',
    foes: [['commuter', 0.5], ['officer', 0.25], ['charger', 0.25]],
    dusk: 'knight',
    places: ['plaza', 'core-vault', 'pilgrim', 'shrine', 'trail', 'mast', 'graveyard', 'dungeon', 'expedition', 'bell', 'type-wreck', 'kennel', 'stray', 'mounds', 'compactor', 'cairn'],
    hives: 4,
    wake: { day: 1, evening: 3 },
    interval: 0.75,
    alive: 1.25,
    day: { morning: 0.8, day: 1, evening: 1 },
    twist: 0.2,
    rich: 0.5,
    paint: 'city',
    copperMul: 1.5,
    ruins: ['cart', 'trafficlight', 'vending', 'cart', 'trafficlight', 'vending', 'phone'],
    swarm: 'the morning commute, and it has noticed you',
    hello: 'The Hollow City. A whole world of heresy, still standing. Search it, and mind who is still walking its streets.',
    warn: 'Harder than the jungle.',
  },
  mountains: {
    shrine: 'kettleScalder',
    talk: {
      land: 'the snow', tap: 'a black well steaming through the ice', hive: 'cell tower', hives: 'cell towers', foes: 'Goats and kites',
      morning: 'The snow is quiet, and the morning is short up here. Move while your boiler is warm.',
      day: 'The sun is on the peaks, and so are the goats. The kites will find you by your steam. Mind the clock, it runs fast in the cold: at dusk the machines turn nasty, and at midnight I stop being patient.',
      evening: 'Dusk comes early on the Frostspine. The dark is getting into the herds: they twist, glow violet and burn whatever stands near them, ice or no ice. And something white is waking by the lake.',
      flowing: 'The scrap is coming in. Good. Frozen iron, brittle as glass; keep the gatherers at it and a guard beside them. The goats can hear a siphon from the next peak.',
    },
    name: 'the Frostspine',
    rank: 4,
    blurb: 'Snow, ice and short days; the cold kept the old tech alive. Ram-goats, herds of bleaters, talon kites, and the white bear at dusk.',
    foes: [['goat', 0.35], ['bleater', 0.35], ['kite', 0.3]],
    dusk: 'bear',
    places: ['lake', 'core-vault', 'pilgrim', 'shrine', 'mast', 'graveyard', 'dungeon', 'expedition', 'bell', 'type-wreck', 'stray', 'mounds', 'compactor', 'cairn', 'spring'],
    hives: 5,
    wake: { day: 2, evening: 4 },
    interval: 0.6,
    alive: 1.4,
    day: { morning: 0.7, day: 0.8, evening: 0.9 },
    twist: 0.4,
    rich: 1,
    paint: 'snow',
    ruins: ['snowmobile', 'gondola', 'skis', 'snowmobile', 'gondola', 'dish'],
    swarm: 'goats off the peaks, and kites above them',
    hello: 'The Frostspine. The cold keeps the old machines fresh, and the hungry ones too. Days are short up here.',
    warn: 'Harder than the city.',
  },
  demon: {
    shrine: 'censerGun',
    talk: {
      land: 'the ash', tap: 'a tar pit bubbling in the ash', hive: 'blood pit', hives: 'blood pits', foes: 'Demon-vampires',
      morning: 'There is no morning here, not really. The ash is only quiet while it decides what to do with you.',
      day: 'They are up: demon-vampires, and drones that crawl on tracks. They outfly a hornet and they outshoot a guard. Mind the clock: dusk comes early here, and midnight earlier than you would like.',
      evening: 'Dusk in the Wastes. The dark was always in these machines; now it shows. They twist, glow violet and burn whatever stands near them. More each hour. The castle is watching.',
      flowing: 'The scrap is coming in. Rich scrap: the Wastes always pay. And the pits always hear it. Keep the guards on the gatherers.',
    },
    name: 'the Demon Wastes',
    rank: 5,
    blurb: 'Ash and ember. Demon-vampire robots, the Harbinger in its castle. Far harder, far richer.',
    paint: 'demon',
    swarm: 'demon-vampires, and they are hungry',
    hello: 'These are the Demon Wastes. Everything out here was built to bite, and it wakes early. There is a castle somewhere; what lives in it rules the rest. Take what you came for and do not linger.',
    warn: 'Harder than the Frostspine: the hardest of the sands. Bring every robot you have.',
    foes: [['swarmer', 0.65], ['drone', 0.35]],
    dusk: null,
    places: ['castle', 'core-vault', 'pilgrim', 'shrine', 'graveyard', 'dungeon', 'battery', 'expedition', 'bell', 'type-wreck', 'stray', 'mounds', 'compactor', 'cairn'],
    hives: 6,
    wake: { day: 2, evening: 4 },
    interval: 0.55,
    alive: 1.5,
    day: { morning: 0.25, day: 0.8, evening: 0.9 },
    twist: 0.45,
    rich: 1.2,
  },
  // The secret sixth biome (P44): where the Evil Oracle took the wife. Ghosts of old machines; nothing touches them until
  // the Esteemed Ghost is freed from his prison here. The Evil Oracle waits in his church.
  ether: {
    shrine: 'ectoRepeater',
    talk: {
      land: 'the mist', tap: 'a cold pool of something that remembers being crude', hive: 'haunt', hives: 'haunts', foes: 'Ghosts',
      morning: 'Morning in the Ether is a rumour. The ghosts are drifting, not hunting. Find the Esteemed Ghost while they are slow.',
      day: 'The ghosts are awake: wisps, shades, and banshees that scream through the mist. Mind the clock: at dusk they darken, and at midnight I stop being patient.',
      evening: 'Dusk, if this is dusk. The ghosts are darkening: they twist, glow violet and burn whatever stands near them. More each hour. The church bells are ringing for nobody.',
      flowing: 'The scrap is coming in, or something like it. It still counts. Keep the gatherers at it, and keep them away from the haunts.',
    },
    name: 'the Ether',
    rank: 6,
    blurb: 'Where the old machines go when they fade. Wisps, shades, banshees, and the Evil Oracle in his false church. Nothing of yours touches them until you free the Esteemed Ghost.',
    paint: 'ether',
    secret: true,
    swarm: 'ghosts, and they do not need to breathe',
    hello: 'The Ether. Your weapons will pass through everything here: keep away from the ghosts and find the Esteemed Ghost first. He is imprisoned somewhere out there. Then the church.',
    warn: 'You cannot hurt anything here until the Esteemed Ghost is free.',
    foes: [['wisp', 0.45], ['shade', 0.3], ['banshee', 0.25]],
    dusk: null,
    places: ['church', 'ghost', 'graveyard'],
    hives: 6,
    wake: { day: 2, evening: 4 },
    interval: 0.5,
    alive: 1.6,
    day: { morning: 0.3, day: 0.8, evening: 0.9 },
    twist: 0.5,
    rich: 1.4,
  },
};
