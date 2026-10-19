/**
 * The companions' numbers (P42; `docs/systems.md` "Companions", `docs/quests.md` the dog, cat and Green Shoot lines).
 * Distances in px (`...Tiles` in tiles), times in seconds. Minos's numbers: the bark comes 5 s before the twisted arrive,
 * the cat pays 5 scrap a return and the Replicator 1 scrap a kill, the dog's point range grows 50% in `dog.2`, and the cat is
 * fed three scrap gobs. Every other number here is a first guess.
 */

/** The sniffer dog. `sightTiles` is `SIGHT.dog` in `fog.ts`. */
export const DOG = {
  /** Its walk, as a share of a gatherer's speed (it keeps up with a Communicator who is dashing less than it runs). */
  speed: 1.35,
  /** It trots within this many px of the Communicator, and leads him toward what it smells. */
  follow: 70,
  lead: 96,
  /** How far it smells, tiles from the Communicator (the stat `pointRange` scales it: dog.2's +50%, the Good Nose card). */
  pointTiles: 24,
  /** It looks for something to point at this often (s). */
  sniff: 0.5,
  /** The twisted arrive at dusk; the bark comes this many seconds before (the stat `barkWarning` adds: Good Boy's Friend +2). */
  barkWarning: 5,
  /** Loud Bark: the dog also barks at a twisted foe closing within this many tiles (the stat `barkRange` scales it), Blinding it this long, no more than once in `barkEvery` s. */
  barkTiles: 9,
  blind: 4,
  barkEvery: 12,
  /** Good Nose: it digs a mound it points at by itself once it stands this close (px) and has dug for `dig` s. */
  digReach: 40,
  /** A mound dug by hand: a hold of this many seconds. */
  dig: 2.5,
  /** What a mound gives: gobs of scrap, and (once dog.3's toy is wanted) the Squeaky Toy from one of them. */
  moundScrap: 2,
};

/** The stray cat's place: a cat sits by its crates; it walks to a scrap gob lying within `eatTiles` of its spot and eats it. Tamed after `fed` gobs. */
export const CAT = { /** Minos named her (decisions.md, 2026-10-19). */ name: 'Rumba', eatTiles: 7, eat: 1.1, speed: 1.1, fed: 3, sight: 8, /** Fed by hand (Minos: an E prompt by her gives her a gob from what he carries): a gob is this much scrap (a plain gob, a guess), the press holds this many seconds (guess) within this many px. */ gob: 4, give: 0.6, reach: 60, /** The home bonus a return, scrap (Minos). */ home: 5, /** The Replicator's catsplosion, scrap a kill (systems.md). */ kill: 1, /** The Cat's Butler (Minos: "a small magnet"; the range is a guess): scrap gobs this many px farther than the usual pull roll toward him. */ butler: 70 };

/** The Kennel (places.md 5): the dig of the mound that lets the dog out is a `hold` s job; the sleeping crawlcams in the yard wake with it. */
export const KENNEL = { hold: 3, reach: 56, sight: 9 };

/** The Little Compactor (quests.md `shoot.1`): taking the boot is a `hold` s job. */
export const COMPACTOR = { hold: 2, reach: 56, sight: 9 };

/** The Farthest Cairn (places.md 10): planting the flag is a `hold` s job; it shows every place on the land as a rough area of `r` tiles. */
export const CAIRN = { hold: 3, reach: 56, sight: 9, r: 6 };

/** The dig mounds (the dog's line and its Good Nose card): the number on a land. */
export const MOUNDS = { sight: 8, /** A hand dig reaches this far (px, a guess: as the Kennel's). */ reach: 56 };
