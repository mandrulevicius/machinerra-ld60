/**
 * Weapon mods (P57): a lug on a weapon takes one, and the weapon plays differently (what it does on the third hit, where its
 * bolts go, what the kick does with it). A mod is a behaviour, not a number: no quality, one copy, fitted on one lug at a time
 * (`sim/mods.ts`, `sim/gear.ts`). The regular ones are Hob's recipes; the wild ones are found (a boss's first cache, a tier III
 * Fitted mod) and have no recipe. Every number below is a lead's guess (the plan, `plans/P57-weapon-mods.md`).
 *
 * A mod's rule is one of two things: `effects` (the effect engine, `sim/effects.ts`: written for the weapon it sits on) or code in
 * `sim/mods.ts` (a shot or a swing that is not the usual one, called from `controller.ts`, `combat.ts`). Add a mod: an id here and
 * its row, its rule, its icon in `gearart.ts` (`ICONS`) and a test in `mods.test.ts`.
 */
import type { Effect } from '../effects';
import type { WeaponId } from './comm';
import type { Enemy } from './foes';
import type { PartKind } from './loot';

export type RegularModId = 'bayonetLug' | 'ricochetCog' | 'condenserCoil' | 'pressureValve' | 'flywheel' | 'tuningFork' | 'magnetHead' | 'bootSpur';
export type WildModId = 'gramophoneHorn' | 'pigeonLoft' | 'echoChamber' | 'boomerangGimbal' | 'grandfatherClock' | 'teapotGovernor' | 'lightningRod';
export type ModId = RegularModId | WildModId;

/** What a mod fits: guns, melee weapons, or either. */
export type ModFits = 'gun' | 'melee' | 'any';

export interface ModDef {
  name: string;
  fits: ModFits;
  /** Found, never crafted (the wild ones). */
  wild?: true;
  /** Its rule in a line (the card). */
  text: string;
  /** The recipe (Hob's forge): scrap and one part; a wild mod has none. */
  scrap: number;
  part?: PartKind;
  /** A wild mod: the boss whose first cache holds it (`hornetDown`). */
  boss?: Enemy;
  /** The art brief, as Laimonas's items have one: how it looks on the weapon. */
  look: string;
  flavour: string;
  /** The rule as engine effects, for the weapon it is fitted on (the ones that are not code in `sim/mods.ts`). */
  effects?: (w: WeaponId) => Effect[];
}

/** The numbers (px, seconds). */
export const MOD = {
  /** Bayonet Lug: a foe this close in front is stabbed instead of shot; the shove (crash fuel). */
  bayonet: { reach: 50, knock: 560 },
  /** Ricochet Cog: the bolt bounces off a wall, rock or prop this many times. */
  ricochet: { bounces: 1 },
  /** Pressure Valve: a gun left alone this long, then the next shot spends `cost` shots of steam as one bolt of `dmg` times the damage that pierces everything. */
  valve: { idle: 1, cost: 3, dmg: 3 },
  /** Flywheel: swings in a row (each within `idle` s of the last) are `step` faster, up to `max` times. */
  flywheel: { step: 0.15, max: 3, idle: 1 },
  /** Tuning Fork: every `every` hit rings: Staggers every foe within `r` of the foe struck. */
  fork: { every: 3, r: 70 },
  /** Magnet Head: a hit pulls the loot within `r` to him for `time` s, sliding at `speed`. */
  magnet: { r: 150, time: 0.8, speed: 520 },
  /** Boot Spur: the kicked foe takes the weapon's damage-type status, this many stacks. */
  spur: { stacks: 1 },
  /** Gramophone Horn: every `every` shot is a chord, a cone of `r` px and `arc` radians that Staggers and shoves. */
  chord: { every: 4, r: 170, arc: 1.2, knock: 520, stagger: 0.6 },
  /** Pigeon Loft: every `every` shot is a pigeon flying at `speed` that pecks `pecks` times, `peck` s apart, for `dmg` times the gun's damage, then Marks the foe. */
  pigeon: { every: 6, speed: 300, turn: 6, pecks: 3, peck: 0.3, dmg: 0.6, life: 4 },
  /** Echo Chamber: each bolt fires again this many seconds later from where he stood. */
  echo: { delay: 0.6 },
  /** Boomerang Gimbal: every `every` swing throws the weapon out `dist` px and back at `speed`, `r` px wide; no swing till it is back. */
  boomerang: { every: 5, dist: 220, speed: 540, r: 34 },
  /** Grandfather Clock: every `every` hit stops the clock round the foe struck: foes within `r` Frozen. */
  clock: { every: 12, r: 90 },
  /** Teapot Governor: at full steam the next hit bursts in a Scald pulse of `r` px (`dmg` Steam damage and Scalded) and spends `spend` of the steam. */
  teapot: { r: 100, dmg: 12, spend: 0.5 },
  /** Lightning Rod: a hit on a Wet foe calls this much Shock down on it (the Wet arc does the chaining). */
  rod: { dmg: 30 },
} as const;

const here = (w: WeaponId) => ({ is: 'weapon', weapon: w }) as const;

export const MODS: Record<ModId, ModDef> = {
  // -- Hob's recipes --
  bayonetLug: {
    name: 'Bayonet Lug', fits: 'gun', scrap: 50, part: 'hornet-stinger',
    text: 'A foe within 50 px in front of you is stabbed instead of shot: the gun\'s damage as a melee hit, with a big shove.',
    look: 'A short stinger bolted under the barrel, point forward.',
    flavour: 'For the moment the hornet gets close enough to be rude. Costs no steam; the shove is the point.',
  },
  ricochetCog: {
    name: 'Ricochet Cog', fits: 'gun', scrap: 60, part: 'spider-lens',
    text: 'Bolts bounce once off walls, rocks and props.',
    look: 'A small toothed wheel at the muzzle, with a lens in its hub.',
    flavour: 'Hob: "AIM AT THE WALL. THE WALL WILL DO THE REST."',
  },
  condenserCoil: {
    name: 'Condenser Coil', fits: 'gun', scrap: 60, part: 'hornet-wings',
    text: 'A kill gives that shot\'s steam back.',
    look: 'A coil of copper pipe round the barrel, beaded with drops, a wing-membrane radiator at its end.',
    flavour: 'What the foe does not need any more, the pack gets back.',
    effects: (w) => [{ when: 'kill', if: [here(w), { is: 'via', via: 'gun' }], cd: 0, do: { do: 'spawn', what: 'refund', kind: 'condenser' } }],
  },
  pressureValve: {
    name: 'Pressure Valve', fits: 'gun', scrap: 70, part: 'mortar-tube',
    text: 'Leave the gun alone for a second: the next shot spends three shots of steam as one bolt that pierces everything in its line.',
    look: 'A brass valve wheel on the hose, a red gauge in its face.',
    flavour: 'Patience, stored as pressure.',
  },
  flywheel: {
    name: 'Flywheel', fits: 'melee', scrap: 60, part: 'cart-wheel',
    text: 'Swings in a row spin it up: each is 15% faster, up to three times. A second without a swing and it winds down.',
    look: 'A heavy iron wheel on the haft behind the head.',
    flavour: 'It does not want to stop. Neither will you.',
  },
  tuningFork: {
    name: 'Tuning Fork', fits: 'melee', scrap: 55, part: 'drone-optics',
    text: 'Every third hit rings: every foe within 70 px of it is Staggered.',
    look: 'A two-pronged steel fork set across the head.',
    flavour: 'Every third hit is the right note. The foes can tell.',
    effects: (w) => [
      {
        when: 'hit', if: here(w), every: MOD.fork.every, cd: 0,
        do: [{ do: 'pulse', at: 'target', radius: MOD.fork.r, then: { do: 'status', id: 'staggered' } }, { do: 'spawn', what: 'ring', kind: 'fork', at: 'target' }],
      },
    ],
  },
  magnetHead: {
    name: 'Magnet Head', fits: 'any', scrap: 50, part: 'hornet-head',
    text: 'Hits pull the scrap and loot within 150 px to you.',
    look: 'A horseshoe magnet taken from a hornet\'s head, bolted on where the weapon strikes.',
    flavour: 'Hit something; everything it owned comes to say sorry.',
    effects: (w) => [{ when: 'hit', if: here(w), cd: 0.25, do: { do: 'spawn', what: 'magnet', kind: 'magnet' } }],
  },
  bootSpur: {
    name: 'Boot Spur', fits: 'any', scrap: 60, part: 'swarmer-scythe',
    text: 'Your kick carries the weapon\'s damage type: a kicked foe takes its status (a tazer in hand: Shocked).',
    look: 'A claw cut from an elite\'s arm, strapped to the weapon and to the boot.',
    flavour: 'Hob: "IF YOU MUST KICK, KICK WITH OPINIONS."',
  },
  // -- The wild ones: found, never crafted --
  gramophoneHorn: {
    name: 'Gramophone Horn', fits: 'gun', scrap: 0, wild: true, boss: 'evilOracle',
    text: 'Every fourth shot is a chord, not a bolt: a cone of sound that Staggers and shoves everything in front of you.',
    look: 'A big morning-glory horn of brass at the muzzle, a needle arm folded back along the barrel.',
    flavour: 'The Oracle: "It records. Heresy." It also plays back.',
  },
  pigeonLoft: {
    name: 'Pigeon Loft', fits: 'gun', scrap: 0, wild: true, boss: 'hornet',
    text: 'Every sixth shot is a brass pigeon that homes on the nearest foe, pecks it three times and Marks it.',
    look: 'A tiny hatch with a brass dovecote roof on the barrel; a clockwork head peeks out.',
    flavour: 'The Queen kept them for a reason. They bring the message to the target.',
  },
  echoChamber: {
    name: 'Echo Chamber', fits: 'gun', scrap: 0, wild: true, boss: 'drone',
    text: 'Each bolt is fired again 0.6 s later from where you stood when you fired it.',
    look: 'A ring of mirrored brass fins round the muzzle, humming a note behind the shot.',
    flavour: 'The Harbinger never finished a sentence once. It finished all of them twice.',
  },
  boomerangGimbal: {
    name: 'Boomerang Gimbal', fits: 'melee', scrap: 0, wild: true, boss: 'knight',
    text: 'Every fifth swing throws the weapon: it spins out 220 px and back, hitting everything on the way both ways. No swing until it is back.',
    look: 'A gimbal ring of brass round the haft\'s balance point, free to spin.',
    flavour: 'Sir Lancelot-9 only ever threw it once. It came back.',
  },
  grandfatherClock: {
    name: 'Grandfather Clock', fits: 'any', scrap: 0, wild: true, boss: 'snowcat',
    text: 'Every twelfth hit stops the clock round the foe struck: foes within 90 px are Frozen for 1.5 s (a kick shatters them).',
    look: 'A tiny long-case clock face with a pendulum, frosted over, hung from the weapon.',
    flavour: 'It has been twelve for a very long time.',
    effects: (w) => [
      {
        when: 'hit', if: here(w), every: MOD.clock.every, cd: 0,
        do: [{ do: 'pulse', at: 'target', radius: MOD.clock.r, then: { do: 'status', id: 'frozen' } }, { do: 'spawn', what: 'clock', kind: 'clock', at: 'target' }],
      },
    ],
  },
  teapotGovernor: {
    name: 'Teapot Governor', fits: 'any', scrap: 0, wild: true, boss: 'bishop',
    text: 'While your steam is full the weapon whistles; the next hit bursts in a 100 px Scald pulse and spends half your steam.',
    look: 'A little copper kettle spout with a whistle cap on the weapon, steam curling.',
    flavour: 'Hob: "TEA\'S UP."',
    effects: (w) => [
      {
        when: 'hit', if: [here(w), { is: 'tag', tag: 'steamFull', of: 'self' }], cd: 0.3,
        do: [
          { do: 'pulse', at: 'target', radius: MOD.teapot.r, then: [{ do: 'status', id: 'scalded' }, { do: 'damage', type: 'steam', amount: MOD.teapot.dmg }] },
          { do: 'spawn', what: 'teapot', kind: 'teapot' },
        ],
      },
    ],
  },
  lightningRod: {
    name: 'Lightning Rod', fits: 'any', scrap: 0, wild: true, boss: 'gorilla',
    text: 'A hit on a Wet foe calls a bolt down from the Wanderer: 30 Shock, chaining through the Wet.',
    look: 'A copper spike with a glass bead, wired to the weapon\'s grip and pointing at the sky.',
    flavour: 'The Wanderer is very high up, and it has opinions about the weather.',
    effects: (w) => [
      {
        when: 'hit', if: [here(w), { is: 'status', id: 'wet' }], cd: 0.6,
        do: [{ do: 'spawn', what: 'skybolt', kind: 'rod', at: 'target' }, { do: 'damage', type: 'shock', amount: MOD.rod.dmg }],
      },
    ],
  },
};

export const MOD_IDS = Object.keys(MODS) as ModId[];
export const isMod = (id: string): id is ModId => id in MODS;
/** The mod a boss's first cache holds, if any. */
export const modOfBoss = (kind: Enemy): ModId | undefined => MOD_IDS.find((m) => MODS[m].boss === kind);
/** Can a mod be fitted on a weapon of this kind. */
export const modFits = (m: ModId, kind: 'gun' | 'melee') => MODS[m].fits === 'any' || MODS[m].fits === kind;
/** The word for what it fits, on its card. */
export const FITS_NAMES: Record<ModFits, string> = { gun: 'Gun', melee: 'Melee', any: 'Any' };
