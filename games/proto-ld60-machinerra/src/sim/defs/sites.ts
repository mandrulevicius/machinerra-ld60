/**
 * The land's authored sites: the tap, the places' hold times and reaches, the generator's seeps.
 */
import type { BiomeId } from './biomes';
import type { Role } from './crew';

/**
 * The tap: the one crude well a land has (never more; the generated map puts it at the far end of the sites, by a hive). It is a
 * healing shrine, the only one in the field: the Communicator and the robots within `reach` px are healed `rate` oil a second
 * each while it holds oil, and what they take comes out of the well (`amount` in all, first guesses). It never comes home:
 * crude has no other use, and nothing buys with it.
 */
export const TAP = { amount: 200, rate: 10, reach: 110, sight: 12 };

/**
 * Places (`places.ts`, behaviours in `placeplay.ts`). Each hold-Use action: seconds held, reach in px. Shrine: four small
 * hives (health, sprite scale, share of a hive's hornets in the air) that wake when the case opens, with a burst of
 * hornets each. Pilgrim: how near it follows (px) and its speed (a share of a gatherer's). Mast: the burst at the
 * hive its light wakes.
 */
export const SHRINE = { hold: 2.4, reach: 64, hiveHp: 90, hiveScale: 0.62, hiveCap: 0.4, burst: 2, sight: 9 };

export const PILGRIM = { hold: 1.8, reach: 60, follow: 54, speed: 0.9, sight: 10 };

export const GRAVEYARD = { sight: 6, rest: 6 };

export const MAST = { hold: 2.6, reach: 60, burst: 3, sight: 12 };

/**
 * Level 1 (P9, `docs/level-1.md`; every number a first guess, tuned by playing). `fix`: Bellows's free field repair, seconds.
 * `strays`: the hornets pecking his wreck, noticing a robot within `wake` tiles and hunting no one farther than `tiles` from it.
 * `decode`: the mast's one-press decode (it wakes the hive and pulls `burst` hornets in at the start; every `DECODE.ping` s it
 * calls the foes near). `reveal`: the tiles round the hive, the tap and Sprocket's wreck that the decode lights on the map.
 * `foreman`: it wakes when a robot comes within `wake` tiles of the wreck and hunts no one farther than `tiles` tiles from it.
 * `can`: the oil fraction under which the next kill drops the guaranteed first can.
 */
export const LEVEL1 = {
  fix: 3,
  strays: { count: 2, wake: 9, tiles: 16 },
  decode: 8,
  burst: 4,
  reveal: { hive: 5, tap: 4, wreck: 3 },
  foreman: { wake: 9, tiles: 14 },
  can: 0.6,
};

/**
 * Type wrecks (P15 follow-up, systems.md "D2"): a new base type is found as a downed robot in the field, mended with the
 * level-1 repair, and its plans are yours from then on. `role`: the type each land's wreck place holds (the types table's
 * "Found" column; the Guard and Repairer, found in the desert there, are buildable from the start and the Mule too).
 * `fix`: the repair, seconds (the same free fix as Bellows's, a guess). `sight`: tiles from which the Oracle speaks.
 */
export const TYPE_WRECK: { fix: number; sight: number; role: Partial<Record<BiomeId, Exclude<Role, 'controller'>>> } = {
  fix: LEVEL1.fix,
  sight: 9,
  role: { jungle: 'lamplighter', city: 'stalker', mountains: 'marksman', demon: 'boilermancer' },
};

/**
 * The Core Vault (P17): a smart icebox whose brain is an AI core. Prying the door takes `hold` s; the core drops, the nearest
 * sleeping hive wakes and one elite (`units.elite`, tier and traits as the land rolls them) comes out of it.
 */
export const VAULT = { hold: 4, reach: 64, sight: 10 };

/**
 * The generator's old seeps, kept as points on the map so every land replays as it did: `count` of them, `amount` only feeds
 * the stream. The land's one tap stands at the one farthest from the lift (`tapOf`, `sites.ts`); the others are nothing now.
 */
export const SEEPS = { count: [6, 8] as [number, number], amount: [70, 150] as [number, number] };

/**
 * The places' shared mechanics (P36, `placeparts.ts`). Every number is a first guess (P36's builder), tuned by playing.
 * `sleep.noise`: tiles from a noise (a shot, a kick, a crash, a blast) within which a sleeping place foe wakes.
 * `carry.reach`: px from a carryable prop to pick it up. `hardpan`: how much farther a kick shoves what stands on hardpan.
 * `near`: tiles from a place at which what it owns is made (its pins, husks, wings: `Behaviour.near`), past the screen's edge.
 */
export const PLACE_PARTS = { sleep: { noise: 3 }, carry: { reach: 40 }, hardpan: 1.5, near: 24 };

/**
 * The graveyard's calm (`systems.md`, Calm and secrets): while no enemy is within `calm` tiles of the Communicator and he
 * stands in the graveyard (within `GRAVEYARD.rest` tiles of its centre), his oil refills `refill` a second and a grave
 * lights every `light` s of calm; with `lit` graves lit he gains `maxOil` max oil this mission. The numbers are the source's;
 * that it is his oil (not the crew's) and that the 15 s count only while calm are the builder's reading.
 */
export const CALM = { calm: 8, refill: 2, light: 15, lit: 3, maxOil: 20 };

/**
 * The Hot Spring (`biomes.md` The Frostspine, Places; Minos, D46 r22): a warm pool where standing clears Chill and heals `heal` oil a
 * second (the source's numbers; no "no enemy near" rule, which is the graveyard's: P31). Its pool is `pool` tiles round its centre
 * (a guess), warmth for the cold (`twists.ts`). `herd` Bleaters graze round it (the source; the Bleater's herd, `FOES.bleater.pack`),
 * asleep until a hit or a noise, `graze` tiles from the centre; the Oracle speaks at `sight` tiles. `herd`'s spread and `sight` are guesses.
 */
export const HOT_SPRING = { pool: 2.6, heal: 1, herd: 5, graze: [4, 7] as [number, number], sight: 9 };

/**
 * The Cold Box (places.md 1; the Core Vault, P17): once pried, its alarm calls every foe within `alarm` px with no one to
 * hunt (the car alarm's reach, a guess) until the fridge is kicked over or broken; `milk` s between the alarm's lines (a guess).
 */
export const COLDBOX = { alarm: 448, milk: 3.2 };

/**
 * Where Hornets Go (places.md 2): an old hornet drifts in every `every` s (a range) while the day is young (morning and
 * day), from `from` tiles out, at `speed` of a hornet's speed; it settles within `settle` px of the stump and dies after
 * `rest` s, leaving its wing. At dusk (the evening) a pack of `pack` twisted hornets comes to mourn. 20 s is the source's;
 * the rest are guesses.
 */
export const WINGS = { every: [16, 24] as [number, number], from: 14, speed: 0.35, settle: 40, rest: 3, pack: 4, sight: 10 };

/**
 * The Strike Lanes (places.md 3): ten sleeping crawlcams a lane. A roll is the crashes on one lane's pins until none for
 * `settle` s (a guess for "one kick"); then every pin of that lane still standing wakes. A strike (all ten crashed in one
 * roll) opens the scoreboard's cache once: `cache` gobs of scrap and one part (guesses).
 */
export const LANES = { settle: 1.5, cache: 4, sight: 10 };

/**
 * The Lost Expedition (places.md 4): five husks (no cores) downed round a cold fire. Fixed (the field fix, `DOWNED.fix`)
 * they shuffle to the lift at `shuffle` of a gatherer's speed. Lighting the fire costs `fire` scrap (a `hold` s job) and
 * everything within `light` tiles of it is Lit. Guesses but the five husks.
 */
export const EXPEDITION = { shuffle: 0.5, fire: 10, hold: 1.5, light: 4, reach: 60, sight: 10 };

/**
 * The Lighthouse (places.md 13): filling the lamp costs `fill` scrap and lights it (a `hold` s job); lit, the beam turns once
 * every `period` s, `len` px long and `half` px wide either side, revealing the fog and taking a twisted foe's aura off for
 * `dim` s; a lit tower calls every foe on the land with no one to hunt (`alarm` px: the whole land). A `hold` puts it out and
 * the lamp stays filled (a guess). Source: 30 scrap, 8 s, 3 s; the rest guesses.
 */
export const LIGHTHOUSE = { fill: 30, period: 8, len: 40 * 32, half: 28, dim: 3, alarm: 9999, hold: 2, reach: 70, sight: 12 };

/**
 * The Dinner Bell (places.md 14): a `hold` s ring, `tolls` at most; each toll stacks spawns x`spawn`, elites x`elite` and loot
 * x`loot` on the mission (the source's numbers; that each toll multiplies is the builder's reading of "stacks").
 */
export const BELL = { hold: 1, tolls: 3, spawn: 1.5, elite: 2, loot: 1.5, reach: 60, sight: 9 };

/**
 * The Old Battery (places.md 16): four shells in the depot; loading one is a `load` s job at the gun; at the wheel (within
 * `reach` px) the gun turns toward the aim at `turn` radians a second and a press fires: the shell lands at the aim point,
 * kept between `min` and `max` px from the gun, after `flight` s, a blast like a D-city shell's (`shell`, `support.ts`
 * `impact`). Guesses but the four shells.
 */
export const BATTERY = {
  load: 1.5,
  reach: 64,
  turn: 2.4,
  min: 6 * 32,
  max: 30 * 32,
  flight: 1.2,
  shell: { kind: 'barrage' as const, blast: 120, dmg: 400, boss: 0.35, knock: 320, type: 'impact' as const },
  sight: 10,
};

/** The First Scripture (places.md 25): reading the sign is a `read` s job (a guess). */
export const SCRIPTURE = { read: 2, reach: 60, sight: 8 };
