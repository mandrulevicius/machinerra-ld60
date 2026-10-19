/**
 * Laimonas's biome machines beyond their bodies (P31; `docs/biomes.md` tables, rules in `sim/beasts.ts`): the beast mods (D32), the
 * twisted forms' own effects, the officer's whistle and the Grounded counter, the bleaters' scream, the spanner monkeys' theft.
 * Add a mod: a `BeastModId`, its `BEAST_MODS` row (the kind it rolls on), its rule in `beasts.ts`. Numbers marked guesses are the lead's.
 */
import type { Enemy } from './foes';

/**
 * The beast mods (D32; `biomes.md` "Variety", the jungle's Mods column): every beast of a family with mods rolls one at spawn, shown on
 * its body; an elite rolls a second at tier II and beyond. The spanner monkeys' (Fast hands, Cymbals, Scout cap) wait on their theft
 * and the foliage: not rolled yet. The Hollow City's and the Frostspine's machines have no mods in the source.
 */
export type BeastModId = 'plates' | 'springs' | 'purr' | 'tusks' | 'mud' | 'bell';
export interface BeastModDef { name: string; kind: Enemy; blurb: string; color: number }
export const BEAST_MODS: Record<BeastModId, BeastModDef> = {
  plates: { name: 'Armour plates', kind: 'cat', blurb: 'Its front resists Impact.', color: 0xa8b4c0 },
  springs: { name: 'Spring legs', kind: 'cat', blurb: 'It leaps 7 tiles, not 5.', color: 0x9fe070 },
  purr: { name: 'Purr box', kind: 'cat', blurb: 'It heals its packmates near it.', color: 0x70e090 },
  tusks: { name: 'Piston tusks', kind: 'boar', blurb: 'Its charge Staggers.', color: 0xe0a050 },
  mud: { name: 'Mud tank', kind: 'boar', blurb: 'It leaves a slick of mud where it charges.', color: 0x8a6a40 },
  bell: { name: 'Bell collar', kind: 'boar', blurb: 'Its charge wakes the packs near it.', color: 0xf0d060 },
};
/** The mods a kind can roll. */
export const MODS_OF: Partial<Record<Enemy, BeastModId[]>> = {};
for (const [id, d] of Object.entries(BEAST_MODS) as [BeastModId, BeastModDef][]) (MODS_OF[d.kind] ??= []).push(id);

/**
 * The numbers. `plates`: the share of an Impact hit from the front (the resistance's, `RESIST`). `springs`: its leap in tiles (the source).
 * `purr`: the Mender's mend (`TIER.mender`'s, the counter's numbers). `mud`: a slick every `every` s of the charge, `r` px, lasting `life` s
 * (guesses). `bell`: the foes within `tiles` that hunt the boar's target, for `ALARM.time` (a guess: the whistle's reach). `grounded`: an
 * Officer unit takes no Shock and its next blow does `charge` times (a guess). `whistle`: the officer whistles to the foes within this
 * many tiles when it first sees a robot (a guess; the source's "calls the nearest pack").
 */
export const BEAST = {
  plates: 0.5,
  springs: 7,
  purr: { radius: 150, every: 1, amount: 5 },
  mud: { every: 0.18, r: 30, life: 4 },
  bell: 10,
  grounded: { charge: 2 },
  whistle: 10,
};

/**
 * The twisted forms' own effects (`biomes.md`, Twisted column) that the built kinds can show: a pounce-cat leaps twice and a ram-goat
 * charges twice (`chain`: one more in each wind-up), a twisted ram-goat's blows Chill (`chill`), a fire-hoofed charger leaves a burning
 * trail (`hooves`: a patch like the hornet's streak, `TWIST_FX`'s shape, Burning). Not built: the boar felling trees (no trees fall), the
 * monkey stealing oil cans, the officer calling twisted packs, the kite dropping its catch (no carry), a commuter never calming (no commute).
 */
export const TWIST_BEAST = {
  chain: ['cat', 'goat'] as Enemy[],
  chill: ['goat'] as Enemy[],
  hooves: { radius: 18, life: 3, arm: 0, every: 0.5, status: 'burning', time: 1.5 },
};

/**
 * The bleaters' scream (`biomes.md`: "Harmless alone; scream together to start avalanches and Chill around"): a bleater hunting with
 * `herd` or more of its kind within `near` px (it among them) screams, and so does every bleater in that herd; each robot within `r` px
 * of a screamer takes a stack of Chilled (a twisted herd's scream Freezes: "Screams Freeze"). A herd screams at most every `every` s, after
 * a `tell` s rearing. Avalanches wait for the slopes. Every number is a guess.
 */
export const SCREAM = { herd: 3, near: 120, r: 110, every: [6, 9] as [number, number], tell: 0.7 };

/**
 * The spanner monkey's theft (`biomes.md`: "steals scrap or a junk from the carry strip, flees"): a monkey whose blow lands on the
 * Communicator takes `scrap` of the mission's scrap (no more than he has) and runs for the nearest edge of the map at `flee` times its
 * speed; there it is gone with it. Brought down, it drops what it took. Junk is not taken (the carry strip holds none yet). Guesses.
 */
export const STEAL = { scrap: 12, flee: 1.25, edge: 1.5 };
