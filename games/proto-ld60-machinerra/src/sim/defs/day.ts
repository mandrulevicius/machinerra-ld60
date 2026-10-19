/**
 * The mission: its timings and the clock's numbers (morning, day, evening, midnight, the berserk steps and the menace).
 */

export const MISSION = {
  /** Seconds an edge arrow points at the lift after the Oracle suggests it. */
  cue: 20,
  /** Command mode slows the mission to this fraction of its pace (live tune `mapPace`); the map pauses it. */
  mapPace: 0.25,
  /** How far from its crew's anchor a robot works (tiles). */
  workTiles: 5,
  /** Within this of the lift's centre counts as aboard (tiles): the deck is big enough for the whole party (`LIFT_SCALE`, art.ts). */
  liftTiles: 3.2,
  /** Seconds of the lift going up before the mission ends. */
  riseTime: 3,
};

/**
 * The mission's clock: time of day is the global escalation, and the reason to extract. Lengths are seconds of mission
 * time (live tunes in `sim.cfg`); `hours` are what the dial shows.
 *
 * Morning: calm, no hornets. Day: hornets come, many weak ones and a few elites. Evening: nightmares, hornets twisted
 * by the dark (`TWISTED`), a growing share of them until all are; at the evening's halfway point the boss arrives
 * (`BOSSES`). Midnight is the deadline, not an ending (no game over, nothing forced): from then on a berserk step every
 * `BERSERK.every` s makes every new enemy a little stronger (`BERSERK`) and every sixth step is a menace level (`BUFF`).
 * Enemies grow through abilities, movement, numbers and damage; health only gently.
 * Past midnight the twisted turn menacing, a rising share of new enemies until all are at 3:00 (`menacingHour`); only a menacing enemy takes the berserk steps.
 */
export const DAY = {
  morning: 75,
  day: 195,
  evening: 210,
  hours: { start: 6, day: 9, evening: 17, midnight: 24 },
  /** The share of hornets twisted at dusk; it rises linearly to all of them at midnight. */
  twistStart: 0.1,
  /** The boss arrives this fraction into the evening. */
  bossAt: 0.5,
  /** Hives awake from the day (the nearest first), the evening and midnight; the noise of siphoning wakes more. */
  hives: { morning: 1, day: 1, evening: 2, midnight: 99 },
  /** The morning's hive spawns at this share of its day-start pace at second 0 (its cap and 1/interval), rising linearly to 1 at the day's start (`Sim.cfg.morningSwarm` multiplies it; 0 is a silent morning). */
  morningStart: 0.25,
  /** Swarm pressure from the clock: it starts at `from` with the day and reaches 1 at midnight (see `Sim.intensity`). */
  from: 0.2,
  /** Past midnight: the top menace level whose `BUFF` still grows (the level counter itself has no ceiling), and the dial's hours a second and last hour shown (dawn never comes). */
  buffMax: 5,
  hoursPerSec: 1 / 30,
  lastHour: 5,
  /** The share of new enemies that are menacing rises linearly from 0 at midnight to all of them at this hour on the dial (3:00 am; the dial runs `hoursPerSec`, so 90 s past midnight). Minos's rule, the number is his; the linear rise is a guess. */
  menacingHour: 3,
  /** The Oracle warns this many seconds before midnight. */
  warn: 60,
};

/**
 * Arrivals from off the map, on every land, at every stage (`edgeArrivals`, spider.ts), their number rising all the way through
 * the clock: the first comes `first` s into the mission, then one every `interval` s, which falls smoothly (geometrically) from its
 * first number at the mission's start to its second at midnight (no step at a phase change), up to `alive` of them at once (linear
 * over the same span). The kind is the biome's `edge`, else a pick from its `foes`; the morning's follow `cfg.morningSwarm` (0 is quiet).
 */
export const EDGE = { first: 25, interval: [30, 0.6] as [number, number], alive: [2, 20] as [number, number] };

/**
 * The berserk steps past midnight (systems.md, "Day curve"): one every `every` s, numbered from 0 at midnight (`DayState.step`).
 * An enemy spawned after step n has these per step (a boss, spawned before midnight, takes the steps so far): damage and
 * speed and health rise by their share a step (linear), ability cooldowns shrink by `cd` a step (compounding, so never
 * to zero). The hives' spawn interval shrinks by `spawn` a step (compounding) down to `spawnFloor` of midnight's. Every
 * `perLevel` steps is a menace level (`DayState.level`). Minos 2026-10-18: +1% was too low, so speed and health start at 3% (a guess, tune in play: F10 Kit tab).
 */
export const BERSERK = { every: 10, perLevel: 6, dmg: 0.03, speed: 0.03, hp: 0.03, cd: 0.02, spawn: 0.97, spawnFloor: 0.4 };

/**
 * What a menace level adds to every enemy already out (its steps counted in sixths, so a step moves it a sixth of this, never
 * the whole at once), up to `DAY.buffMax` levels; what P13 gives levels 2-5 beyond this is its own.
 */
export const BUFF = {
  /** The aura's size and sting per level. */
  auraR: 0.25,
  auraDps: 0.35,
  /** The aura slows harder: its `slow` falls by this per level, to no less than `slowMin`. */
  auraSlow: 0.04,
  slowMin: 0.35,
};

/**
 * What the menace levels (`DayState.level`, every `BERSERK.perLevel`th berserk step) switch on, each from its level up (systems.md,
 * "Day curve"): `chain`, twisted dashes chain twice; `elite`, elites twice as likely; `traits`, elites roll two traits; and from
 * `pack.from` a hunter pack of `count` twisted elites every `every` s, `away` px from the Communicator, announced `warn` s ahead.
 */
export const MENACE = { chain: 2, elite: 3, traits: 4, pack: { from: 5, every: 60, count: 3, warn: 5, away: 700 } };

/**
 * What the D-city's buildings change in the day (`hub/buildings.ts` `cityFx`; systems.md, "D-city, buildings, expeditions"):
 * the Curfew Bell holds dusk back on every land by `later` s (the evening and midnight move with it).
 */
export const CURFEW = { later: 30 };

/** The Tram Line (systems.md "D-city, buildings"): the lift rises in `rise` s instead of `MISSION.riseTime`, and robots under an evac order (sent to the lift, or the lift asked) move `evac` times as fast (Minos: "make them faster"; 1.5x). */
export const TRAM = { rise: 1, evac: 1.5 };
