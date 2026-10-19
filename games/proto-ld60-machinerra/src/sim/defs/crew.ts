/**
 * The robots: roles and their numbers, the starting crew, the gatherer's work (strip, coal), repair, the mule, the marksman, the barks, augments.
 * Add a role: its `Role` and `ROLES` entry here (the skill's recipe lists the rest).
 */
import type { BiomeId } from './biomes';

export type Role = 'controller' | 'gatherer' | 'guard' | 'repairer' | 'mule' | 'marksman' | 'boilermancer' | 'lamplighter' | 'stalker';

export interface RoleDef {
  name: string;
  hp: number;
  speed: number;
  r: number;
  blurb: string;
}

export const ROLES: Record<Role, RoleDef> = {
  controller: { name: 'Communicator', hp: 120, speed: 175, r: 13, blurb: 'You. Walks, keeps in touch with the city over the antenna, searches ruins, commands the crews. Starts with a shovel, not a gun.' },
  gatherer: { name: 'Gatherer', hp: 60, speed: 105, r: 13, blurb: 'The crew\'s worker: mines coal at seams, strips ruins for copper, and sweeps up the scrap and copper lying round where it works. Fragile: keep a guard by it.' },
  guard: { name: 'Guard', hp: 110, speed: 120, r: 14, blurb: 'Guards its crew: shoots anything that comes close.' },
  repairer: { name: 'Repairer', hp: 70, speed: 130, r: 11, blurb: 'Tops up the oil of the most damaged robot near it.' },
  mule: { name: 'Mule', hp: 150, speed: 100, r: 15, blurb: 'A crate on wheels (the M.U.L.E.). Fetches the loot lying round its crew before the sand takes it, and squeezes half as much scrap again out of every gob it picks up. Tough, unarmed.' },
  marksman: { name: 'Marksman', hp: 55, speed: 115, r: 12, blurb: 'A long rifle on a tripod: slow, heavy shots from far off. Backs away from anything that comes close.' },
  boilermancer: { name: 'Boilermancer', hp: 65, speed: 108, r: 12, blurb: 'A steam mage with a boiler for a body: throws scalding clouds into the thick of a fight and blesses its crew with haste. Keeps out of the melee.' },
  lamplighter: { name: 'Lamplighter', hp: 70, speed: 115, r: 12, blurb: 'Carries the crew\'s light: allies near its lamp are Lit, the twisted forget their halos, and its flares light a patch of the dark. Holds the middle of its crew.' },
  stalker: { name: 'Stalker', hp: 55, speed: 150, r: 11, blurb: 'An assassin: unseen until it strikes, it goes round a foe to its back and hits it hard. Hides again when the fight is over.' },
};

/** The crew you start the mission with: all in crew 0, walking with you. */
export const START_CREW: { role: Exclude<Role, 'controller'>; name: string }[] = [
  { role: 'gatherer', name: 'Bellows' },
  { role: 'gatherer', name: 'Siphon' },
  { role: 'gatherer', name: 'Dipper' },
  { role: 'guard', name: 'Rivet' },
  { role: 'guard', name: 'Piston' },
  { role: 'repairer', name: 'Spanner' },
];

/** Crew 0 walks with the Communicator; crews 1..3 go where the map orders them. */
export const CREWS = 4;

export const GATHER = {
  /** Seconds of work a gatherer needs to strip a dead ruin (scaled by its work rate): it was the Communicator's one-second search, now a robot's job. */
  strip: 0.5,
  /** Extra copper a gatherer pulls out of a ruin it strips, as a share of the ruin's own. */
  copperMore: 0.5,
  /** How close to a ruin's centre a gatherer stands to work it (px). */
  reach: 34,
  /** How far (tiles) from the site it works a gatherer sweeps up scrap and copper gobs: the Mule keeps the rest of the crew's loot. */
  sweep: 4,
};

/**
 * Coal (Minos, 2026-10-18: "gather coal, copper, collecting scrap"): fuel for expeditions only (P41, unbuilt), mined at a land's
 * coal seams, a stock that comes home in the haul. The seams are the generator's spare work points (`Sim` constructor): the
 * nearest `seams[biome]` of them after the tap, so the first is the calm one near the lift and the far ones sit by hives.
 * A gatherer mines one coal every `every` s (scaled by its work rate); the Communicator by hand `hand.load` coal a
 * `hand.time` s press (a pickaxe beat every `hand.beat` s of it: a look, no rule), so a gatherer is nearly three times as fast and needs no pressing. First guesses.
 */
export const COAL = {
  amount: 24,
  seams: { desert: 2, jungle: 2, city: 2, demon: 3, mountains: 4, ether: 0 } as Record<BiomeId, number>,
  /** How near (px) to a seam's centre one stands to mine it. */
  reach: 46,
  every: 1.5,
  hand: { time: 8, load: 2, beat: 0.5 },
  /** Coal mined for one job of the gatherer's deed (a ruin stripped is one). */
  perJob: 5,
};

/** The mule: how far round its crew it fetches loot (tiles), its own pull (px), what a gob of scrap it picks up is worth. */
export const MULE = { fetchTiles: 7, magnet: 70, scrap: 1.5 };

/** The marksman: how far it looks for a target (tiles), and how close a foe may come before it backs off (px). */
export const MARKSMAN = { sightTiles: 12, keep: 120 };

export const REPAIR = { rate: 9, rangeTiles: 7, beam: 90 };

/**
 * The three newest base types (P15; the table's numbers are in `specs.ts`, these are how they carry them out, all first guesses).
 * Boilermancer: throws a cloud at a cluster up to `reach` tiles off, keeps `keep` px from the nearest foe, a cloud touches the foes in it every `touch` s.
 * Lamplighter: throws a flare up to `reach` tiles off, its radius `flareR`, at foes farther than `seen` px from every robot; stands within `centre` px of its crew's middle.
 * Stalker: a blade (`dmg` every `rate` s, `reach` px); sees `sight` tiles.
 */
export const BOILER = { reach: 7, keep: 120, touch: 0.5 };
export const LAMPLIGHTER = { reach: 10, flareR: 130, centre: 40, seen: 150 };
export const STALKER = { dmg: 7, rate: 0.5, reach: 30, sight: 8 };
/**
 * The Guard's saw (Minos: "saw - yes build"; guesses): a stroke every `rate` s of `dmg` (Pierce, via `saw`) to every foe within `reach` px
 * of it (and its own radius) in an `arc` (radians) toward the foe; it knocks nothing back. Against `WEAPON.guard` (8 every 0.55 s at
 * 230 px) it is about 1.6x the damage a second, but only in contact and where the gun hits one foe the saw hits every foe in the arc.
 */
export const SAW = { dmg: 12, rate: 0.5, reach: 34, arc: 1.6 };
/** A Scattergun's cone (radians, as the Communicator's rivet scatter) and the share of one rifle shot its pellets add up to. */
export const SCATTERGUN = { cone: 0.5, share: 1.5 };

/**
 * A robot at 0 oil is downed, never destroyed (P5; systems.md "Bots"). Minos: carried, the Communicator moves at 60% speed
 * (`carry`) with one and carries as many as he likes, slower for each but never under 50% of his speed (`floor`); the Mule
 * moves at 60% over the square root of how many it carries, never to a stop; a field fix is 8 s of work (`fix`). Lead's
 * guess for the curve (60% over the square root of n, floored) and: how near one must lie to be reached (`reach`, px) and the oil a fixed robot stands up with (`oil`, a share of its max).
 */
export const DOWNED = { carry: 0.6, floor: 0.5, fix: 8, reach: 44, oil: 0.5 };

/** AI cores: a new game starts with none (Minos; `docs/level-1.md`): a bot is fielded per core held, and a repaired wreck brings its own (P9). */
export const START_CORES = 0;

/**
 * The colony's robots are apostates of the new tech: they keep the Old Way (steam, brass, gears you can see) and treat
 * anything wireless, touchscreen or self-updating as heresy. They say so, often, with feeling.
 */
export type BarkWhen = 'order' | 'gather' | 'fight' | 'hornet' | 'hurt' | 'repair' | 'evac' | 'dry' | 'kill' | 'retreat' | 'ruin' | 'polish' | 'chat' | 'sky' | 'complain' | 'scroll' | 'chirp' | 'lowbattery' | 'heresy' | 'shotdown' | 'beep' | 'ping' | 'redlight' | 'pose';

export const BARKS: Record<BarkWhen, string[]> = {
  order: ['By the Piston, it is done.', 'Steam be with you.', 'As the Old Way wills.', 'Moving out. Manually, as is proper.', 'Gears turning, Communicator.', 'Praise the visible gear!'],
  gather: ['Blessed be the scrap.', 'Sorting deep. Pardon the clatter.', 'Salvage: the Old Way’s sacrament.', 'Hauling. No app required.', 'Honest scrap, honest work.'],
  fight: ['Begone, wireless abomination!', 'No firmware updates shall pass!', 'Smite the touchscreen spawn!', 'Eat analogue, heretic!', 'Feel the wrath of the Valve!'],
  hornet: ['It hums like a charger. Unclean!', 'Bluetooth devils incoming!', 'They glow. Nothing holy glows blue.', 'Swarm! Hide your serial ports!'],
  hurt: ['My rivets! My beautiful rivets!', 'Venting! Venting!', 'I have been... stung. Spiritually too.', 'Leaking. Pray for my gaskets.'],
  repair: ['Hold still, sinner. Patching.', 'A little solder, a little faith.', 'There. Good as old.', 'Tightening your soul bolts.'],
  evac: ['Retreat is also a sacred direction.', 'To the lift! The Oracle calls!', 'Fall back! Mind the steam!'],
  dry: ['The heap is picked clean.', 'Empty. The scrap has moved on.'],
  kill: ['Unplugged!', 'Factory reset, heretic!', 'Back to the landfill!', 'Your warranty is void!'],
  // The robot AI's (`botai.ts`): falling back with no Repairer, a ruin's reading, idle polish, chat and the dusk.
  retreat: ['Leaking! Falling back to you!', 'Gaskets failing. Retreating, with dignity.', 'No Repairer! I am coming to you!'],
  ruin: ['A reliquary of the Old Ones. Do not touch the glass.', 'Sealed tech. Heresy, but beautiful heresy.', 'A screen. It once showed lies to millions.', 'The ancients prayed to this. Wirelessly.'],
  polish: ['A clean nozzle is a holy nozzle.', 'Buff, buff, buff.', 'Spit and polish. Mostly oil.'],
  chat: ['Did you hear? Valve Seven got promoted.', 'My gasket itches.', 'They say the D-city has a bath. Of oil.', 'Do you ever dream of steam?', 'I counted my rivets. Still all there.', 'Nice bolts.'],
  sky: ['The sun sets on the Old Way.', 'Dusk. Something out there will stir.', 'Look at that sky. Like a boiler at full pressure.'],
  // The Bluetooth speaker's flaw: the crew beside it can hear what it plays.
  scroll: ['Hold on, one more video.', 'Scrolling... scrolling...', 'Nine hundred new notifications.', 'Wait, it is buffering.'], // a guess: the smartphone relic's flaw is this bark and nothing more
  // J9-J12 (P23): the smoke detector's chirp and its flaw, the power bank's flaw, the quadcopter's loss.
  chirp: ['Chirp! Something is coming!', 'Beep! Move!', 'CHIRP. Incoming.', 'Chirp-chirp! Down!'],
  lowbattery: ['Chirp. Low battery.', 'Chirp. (Low battery.)', 'Chirp... low... battery.'],
  heresy: ['It charges without a wire! Heresy!', 'I can feel the lithium in my bolts.', 'Forgive the spark; it is wireless.', 'Is this a battery? Unclean!'],
  shotdown: ['My dragonfly! They got my dragonfly!', 'Down goes the little one. Down.', 'Not the quadcopter! It had a name!'],
  // The biome relics' flaws that stayed jokes (D50): the Tamagotchi's beep, the avalanche beacon's ping, the traffic light's red and the selfie stick's pose.
  beep: ['Beep. Beep. Feed it.', 'It beeps for its dinner again.', 'Tiny soul wants a snack.', 'Beep-beep. Hungry, apparently.'],
  ping: ['Ping. Ping. Ping.', 'It pings at everything. Even my heart.', 'The beacon beeps. It always beeps.', 'Ping! (Nothing. It just likes pinging.)'],
  redlight: ['Red! Everybody stop! ...no? Fine.', 'Red means stop. Red ALWAYS means stop.', 'That is a red light, heretics.', 'Stop! Look! Listen! Then fight.'],
  pose: ['Wait, my good side!', 'Hold still, the flash is coming.', 'Say "oil"!', 'One moment, composing the shot.'],
  complain: ['Is that... a playlist? Make it stop.', 'Heresy, at volume!', 'Turn off the choir box!', 'I can hear the algorithm.'],
};

/**
 * Augments: body parts fitted in the colony that change the Communicator's skills (planned; no shop yet). On the augment
 * screen each shows its name, its set (if any), its skills, its stats, then a flavour text in the colony's voice. The
 * flavour is there for fun; it carries no rules (a set's name or lore may turn up in it).
 */
export type Stat = 'oil' | 'steam' | 'steamRegen' | 'speed' | 'damage';

export const STAT_NAMES: Record<Stat, string> = { oil: 'Oil', steam: 'Steam', steamRegen: 'Steam regen', speed: 'Speed', damage: 'Damage' };

export interface AugmentDef {
  name: string;
  slot: 'rear' | 'arm' | 'head' | 'legs' | 'core';
  /** A set it belongs to, if any. */
  set?: string;
  /** The skills it gives: a name and what it does. */
  skills: { name: string; text: string }[];
  /** What it adds to the Communicator (percent for speed, regen and damage; points for oil and steam). */
  stats: Partial<Record<Stat, number>>;
  /** For fun. */
  flavour: string;
}

export const AUGMENTS: Record<string, AugmentDef> = {
  rearVent: {
    name: 'Posterior Pressure Vent',
    slot: 'rear',
    skills: [{ name: 'Dash', text: 'A short burst of straight-line movement. Costs 20 steam.' }],
    stats: { speed: 5, steam: -10 },
    flavour:
      'A fully sanctioned Old Way thruster, mounted aft. The engineers call the noise "a controlled pressure release". ' +
      'The colony’s children call it something else. Blessed by three mechanics and one deeply embarrassed priest. ' +
      'Do not fit facing the Oracle.',
  },
};
