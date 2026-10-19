/**
 * Footsteps, the rules (plain TS, tests beside it): what each thing walks on, how it walks, and what that leaves and sounds like.
 * The scene's half is `footview.ts` (prints on the world kit's mark layer, the sounds); the sounds themselves are `stepsounds.ts`.
 *
 * - Surface: the biome's paint and the tile (`Ter`) decide it (`surfaceOf`); down a dungeon it is tile, on the lift's deck it is deck.
 *   Soft ground (sand, ash, mud, snow) keeps prints (`PRINT`); rock, tile, ice and deck keep none. Every surface has a sound.
 * - Gait: `foot` (two-legged, a shoe print), `paw` (a pair of dents, wider), `tread` (two track bars), `none` (flyers, slitherers,
 *   ghosts). A foe's gait is its `FOES` row's `ground` unless `FOE_GAIT` says otherwise; the robots' is `BOT_GAIT`.
 * - Add a surface: a `Surface` id, its `SURFACE_OF` case, a `PRINT` row (or none) and its sound in `stepsounds.ts`.
 *   Add a creature that walks otherwise: a `FOE_GAIT` / `BOT_GAIT` line.
 * - In a fight the step sounds sink (`FIGHT_STEP`, `fightLevel`, `stepMix`): the fight is the music's (`MusicView`), eased the same way.
 * Every number here is a guess, to be tuned by eye and ear.
 */
import { BIOMES, FOES, T, type BiomeDef, type Enemy } from './sim/defs';
import { Ter } from './sim/mapgen';
import type { Role } from './sim/defs';

export type Surface = 'sand' | 'ash' | 'mud' | 'snow' | 'rock' | 'tile' | 'ice' | 'deck';
export const SURFACES: Surface[] = ['sand', 'ash', 'mud', 'snow', 'rock', 'tile', 'ice', 'deck'];
export type Gait = 'foot' | 'paw' | 'tread' | 'none';

/** The soft ground: a print's colour, how strong a fresh one is and how many seconds it lasts, before the walker's weight. */
export const PRINT: Partial<Record<Surface, { tint: number; alpha: number; life: number }>> = {
  sand: { tint: 0x6e5636, alpha: 0.4, life: 9 },
  ash: { tint: 0x120e0e, alpha: 0.42, life: 10 },
  mud: { tint: 0x22150b, alpha: 0.5, life: 14 },
  snow: { tint: 0x6f82a6, alpha: 0.42, life: 12 },
};

/** The open ground's surface by the land's paint: [sand, dune, hardpan, rock]. */
const SURFACE_OF: Record<BiomeDef['paint'], [Surface, Surface, Surface, Surface]> = {
  desert: ['sand', 'sand', 'rock', 'rock'],
  demon: ['ash', 'ash', 'rock', 'rock'],
  jungle: ['mud', 'mud', 'mud', 'rock'],
  city: ['tile', 'tile', 'tile', 'rock'],
  snow: ['snow', 'snow', 'ice', 'rock'],
  ether: ['tile', 'tile', 'tile', 'tile'],
};

/** What lies under a point: `ter` is the land's tile map (`sim.map.ter`, `w` tiles wide). */
export function surfaceOf(paint: BiomeDef['paint'], ter: ArrayLike<number>, w: number, x: number, y: number, o: { dungeon?: boolean; deck?: boolean } = {}): Surface {
  if (o.deck) return 'deck';
  if (o.dungeon) return 'tile';
  const t = ter[Math.floor(y / T) * w + Math.floor(x / T)];
  return SURFACE_OF[paint][t === Ter.Dune ? 1 : t === Ter.Hardpan ? 2 : t === Ter.Rock ? 3 : 0];
}

/** Foes that do not walk like their `ground` flag says: the rest of the grounded are `paw`, the flyers `none`. */
const FOE_GAIT: Partial<Record<Enemy, Gait>> = {
  // two legs
  commuter: 'foot', officer: 'foot', knight: 'foot', mannequin: 'foot', mallcop: 'foot',
  // wheels and tracks
  drone: 'tread', cart: 'tread', driller: 'tread',
  // nothing on the ground: a snake slides, a vein-crawler swims the walls, a fish is in water, the Ether's shade is a ghost
  snake: 'none', veinworm: 'none', piranha: 'none', shade: 'none',
};
export const foeGait = (kind: Enemy): Gait => FOE_GAIT[kind] ?? (FOES[kind].ground ? 'paw' : 'none');

/** The crew: the Communicator, the tripod marksman, the Lamplighter and the Stalker walk; the rest roll on wheels or tracks. */
const BOT_GAIT: Record<Role, Gait> = { controller: 'foot', marksman: 'foot', lamplighter: 'foot', stalker: 'foot', gatherer: 'tread', guard: 'tread', repairer: 'tread', mule: 'tread', boilermancer: 'tread' };
/** A robot in spider legs leaves the spider's prints (P53). */
export const botGait = (role: Role, climbs = false): Gait => (climbs ? 'paw' : BOT_GAIT[role]);

/**
 * How big and how loud one walker is. `scale` sizes the print (the Communicator's is 1); a foe's follows its radius.
 * `gain` is the step sound's loudness (the Communicator 1, a robot `ROBOT_GAIN`); `soft` foes are the heavy few whose step is a tell.
 */
export const STEP = {
  /** Distance between prints of one walker, px, and (feet) the gap between left and right. */
  stride: { foot: 24, paw: 20, tread: 18 } as Record<Exclude<Gait, 'none'>, number>,
  gap: { foot: 10, paw: 14, tread: 11 } as Record<Exclude<Gait, 'none'>, number>,
  /** The sound: the Communicator, a legged robot, a heavy foe (a boss: radius from `heavy`). */
  gain: { comm: 1, robot: 0.55, heavy: 0.4 },
  heavy: 18,
  /** A walker who is not the Communicator leaves prints only while the mark layer has this share of its fading marks free, so a crowd cannot starve the rest. */
  room: 0.85,
  /** A walker's prints last this share of the surface's life (the Communicator's: 1). */
  crowdLife: 0.6,
};

/** A foe's print scale from its radius (the Communicator's `foot` print is 0.5 of the kit's 24x40 shoe). */
export const footScale = (r: number) => Math.min(0.75, Math.max(0.25, r / 26));

/** What a step sound keeps of its loudness in a full fight, by walker: the Communicator's is a quarter, a robot's and a foe's are silent. */
export const FIGHT_STEP = { comm: 0.25, robot: 0, heavy: 0.7 }; // heavy foes and bosses keep most of theirs: their tread is a tell

/** Move the fight amount (0 calm .. 1 fight) toward the fight flag, taking `open` seconds to go up and `close` to come back down. */
export function fightLevel(cur: number, fight: boolean, dt: number, open: number, close: number) {
  return fight ? Math.min(1, cur + dt / open) : Math.max(0, cur - dt / close);
}

/** The share of its loudness a walker's step keeps at this fight amount. */
export const stepMix = (who: keyof typeof FIGHT_STEP, amount: number) => 1 - amount * (1 - FIGHT_STEP[who]);
