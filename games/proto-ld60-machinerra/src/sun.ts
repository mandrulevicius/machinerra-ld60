/**
 * Where shadows fall (pure; `shadowview.ts` draws them). A shadow is a lean: the screen offset of a point's shadow per unit of
 * its height (so a thing `h` px tall casts a shadow `h * |lean|` long, pointing along the lean).
 * By day it is the sun's, one for the whole land: long to the left in the morning, short and straight down at noon, long to the
 * right in the evening (`SUN`). At night the lamps throw the shadows: each point leans away from the lights around it, weighted
 * by how strongly each reaches it, and the shadow fades to `NIGHT_FLOOR` where no light does (`throwAt`).
 * Every number is a guess (nobody specified a sun): the swing, the lengths, how far a lamp throws.
 */

export interface Vec {
  x: number;
  y: number;
}
/** A light as a shadow caster sees it: its ground position, its reach (px) and its strength. */
export interface Src {
  x: number;
  y: number;
  r: number;
  i: number;
}

/** The hours the sun is up (the dial's: 6 at the start of the mission to 18; the sky is dark from 17 on, `clock.ts`). */
const RISE = 6, SET = 18;
export const SUN = {
  /** How far (degrees) the shadow swings from straight down: left at sunrise, right at sunset. */
  swing: 45,
  /** The shadow's length per unit of height at noon and at the horizon. */
  noon: 0.22,
  low: 0.9,
};
/** A lamp: its shadows lengthen with distance (reach per unit of distance), to no more than `max`. */
const LAMP = { per: 1 / 160, max: 1 };
/** How much lamp strength (sum of `i` times the squared falloff) it takes to overrule the sun fully: 1 / this. */
const COVER = 2;
/** The shadow's alpha where no light reaches at night (never nothing: the ground is still the ground). */
export const NIGHT_FLOOR = 0.3;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The sun's lean at `hour` (any hour: it holds the sunrise's before and the sunset's after). */
export function sunLean(hour: number): Vec {
  const t = clamp01((hour - RISE) / (SET - RISE));
  const high = Math.sin(Math.PI * t);
  const len = SUN.noon + (SUN.low - SUN.noon) * (1 - high) ** 1.6;
  const a = ((90 - (2 * t - 1) * SUN.swing) * Math.PI) / 180;
  return { x: Math.cos(a) * len, y: Math.sin(a) * len };
}

/**
 * The lean and alpha of a shadow at (x, y): the sun's (`sun`; by day) blended with the lights' as night falls (each pushes
 * it away from itself, harder with its strength `i`, its reach `r` and how near it is). Writes into `out`.
 */
export function throwAt(x: number, y: number, sun: Vec, night: number, lights: readonly Src[], out: { x: number; y: number; a: number }) {
  let w = 0, lx = 0, ly = 0;
  if (night > 0.01) {
    for (const s of lights) {
      const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy), f = 1 - d / s.r;
      if (f <= 0) continue;
      const k = s.i * f * f;
      // Away from the light, longer the farther from it (right under it: straight down, short).
      const len = Math.min(LAMP.max, d * LAMP.per) / (d || 1);
      lx += k * dx * len;
      ly += k * dy * len;
      w += k;
    }
  }
  // At night the lights' mean lean, as far as they reach (`cover`), the rest the sun's (the moon's, in effect).
  const cover = Math.min(1, w * COVER) * night;
  out.x = sun.x + (w ? lx / w - sun.x : 0) * cover;
  out.y = sun.y + (w ? ly / w - sun.y : 0) * cover;
  out.a = 1 - night + night * (NIGHT_FLOOR + (1 - NIGHT_FLOOR) * Math.min(1, w));
}
