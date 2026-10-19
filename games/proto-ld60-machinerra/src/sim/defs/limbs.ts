/**
 * P50's elite limbs: a twisted elite's two claws (a rake) and a menacing elite's two tentacles (a whip), the numbers
 * (`LIMBS`), where they grow from (`SOCKETS`, one row per kind that can be an elite) and the two caps the view keeps.
 * Rules are `sim/limbs.ts`, drawing `limbview.ts`. Every number is a first guess to tune in play (Minos judges the
 * menacing elite's danger by playing: "a very dangerous foe, almost boss-like").
 * Add a kind that can be an elite: a `SOCKETS` row, or a `LIMBLESS` line saying why not (`limbs.test.ts` fails without one).
 */
import type { Enemy } from './foes';

export const LIMBS = {
  /**
   * A claw rakes its own half of the body (left or right of the heading): `reach` is a multiple of the foe's own sting reach,
   * it winds up for `wind` s, the swing lasts `strike` s, then it rests `rest` s; the blow is the foe's own (`foeDmg`) times `dmg`.
   * `stagger`: the second claw's first wait, as a share of `rest` (the two run apart).
   */
  claw: { reach: 1.3, wind: 0.45, strike: 0.2, rest: 1.8, dmg: 1, stagger: 0.5 },
  /**
   * A tentacle lashes anywhere within `reach` (a multiple of a claw's) of its foe, a line `width` px wide from its socket to the
   * spot locked when the wind-up began: `wind` s, a `strike` of `strike` s, then it waits until `cooldown` s have passed since it
   * began. The two take turns: one beginning holds the other back half a cooldown.
   */
  whip: { reach: 2, width: 14, wind: 0.55, strike: 0.15, cooldown: 1.1, dmg: 0.9 },
};

/** How many menacing elites draw their full tentacle rope at once (the nearest to the view); the rest draw a stub (`limbview.ts`). */
export const LIMB_CAP = 6;

/** The three-stage look (D43: twisted and menacing only; normal foes stay as drawn). Tints multiply the painted shading; `rim` is the pale edge light behind a dark body for the nearest `rimCap` foes. */
export const STAGE = {
  tint: 0x4a4650,
  rim: 0xc8d8e8,
  rimAlpha: 0.55,
  rimGrow: 1.1,
  rimCap: 8,
  /** The menacing body's additive glow over it: its pulse (Hz) and peak alpha. */
  glow: { hz: 1.1, alpha: 0.5 },
};

/**
 * Where a kind's limbs grow from. `w`, `h`: its painting's size at normal scale (game px: the art's pixels over `S`); `x`, `y`: the
 * shoulders (the underside, for a body with none) as fractions of that box, `x` forward of its centre (-0.5..0.5), `y` down from its
 * top, facing right. A flier's box is centred on its air (`FoeView`); a ground foe's on its feet.
 */
export interface Socket {
  w: number;
  h: number;
  x: number;
  y: number;
}
const sock = (w: number, h: number, x: number, y: number): Socket => ({ w, h, x, y });

export const SOCKETS: Partial<Record<Enemy, Socket>> = {
  hornet: sock(39, 32, 0.02, 0.58),
  swarmer: sock(55, 42, 0, 0.55),
  drone: sock(72, 46, 0, 0.5),
  cat: sock(57.5, 37, 0.14, 0.5),
  boar: sock(65, 44, 0.1, 0.5),
  monkey: sock(38.5, 41, 0.02, 0.5),
  commuter: sock(34.5, 55, 0, 0.36),
  officer: sock(36.5, 57, 0, 0.36),
  charger: sock(70.5, 57, 0.06, 0.45),
  goat: sock(53, 46, 0.06, 0.45),
  bleater: sock(37, 30, 0.06, 0.45),
  kite: sock(66.5, 39, 0, 0.5),
  wisp: sock(44, 46, 0, 0.58),
  shade: sock(39, 64, 0, 0.4),
  banshee: sock(46, 53, 0, 0.5),
  piranha: sock(43.5, 32, 0, 0.6),
  cupid: sock(43.5, 39, 0, 0.5),
  mannequin: sock(29.5, 57, 0, 0.36),
  cart: sock(50.5, 39, 0, 0.45),
  copdrone: sock(41, 32, 0, 0.6),
  leech: sock(37, 30, 0, 0.55),
  mite: sock(32, 23, 0, 0.5),
  driller: sock(46, 44, -0.1, 0.5),
};

/** A kind that can be an elite and has no limbs, and why. */
export const LIMBLESS: Partial<Record<Enemy, string>> = {
  spider: 'the Crawlcam has its own eight legs and its own view (spider.ts)',
  snake: 'a chain of plates: the rattler is all body',
  veinworm: 'a chain of plates: the vein-crawler is all body',
};
