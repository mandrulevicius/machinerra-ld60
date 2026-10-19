/**
 * A foe tied to a place (the Harbinger at its keep, level 1's Hive Foreman, P18's Wardens): it stands on its ground, wakes
 * when a robot comes within `wake` tiles of it, hunts no one farther than `tiles` tiles from `home`, and never follows
 * you off its ground, so a retreat is always open. `tie` sets it on a foe; `foes.ts` reads `huntRange` and `inLeash`.
 * A foe with only `home` (no `leash`) keeps the castle's numbers (`CASTLE`).
 */
import { CASTLE, T } from './defs';
import { dist } from './geom';
import type { Spot } from './mapgen';
import type { Hornet } from './types';

/** Tiles: how close a robot wakes it, and how far from home it will hunt. */
export interface Leash { wake: number; tiles: number }

/** Tie a foe to a place. */
export function tie(h: Hornet, home: Spot, leash: Leash) {
  h.home = { ...home };
  h.leash = { ...leash };
}

/** How far (tiles) it sees a robot: the leash's wake distance, else the castle's. */
export const huntRange = (h: Hornet) => h.leash?.wake ?? CASTLE.leash;

/** Is a point inside the ground it will hunt on? A foe with no home hunts anywhere. */
export function inLeash(h: Hornet, p: Spot) {
  return !h.home || dist(p.x, p.y, h.home.x, h.home.y) < (h.leash?.tiles ?? CASTLE.leash) * T;
}
