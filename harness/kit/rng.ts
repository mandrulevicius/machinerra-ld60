/**
 * Seeded randomness for game logic. Use this, not Math.random, so a run can be reproduced from its seed, rerolled
 * fairly, and saved and restored mid-run.
 *
 *   const r = rng('level-3');                 // number or string seed
 *   r.int(1, 6); r.range(0, 1); r.chance(0.25); r.pick(list); r.weighted([['goblin', 3], ['bat', 1]]);
 *   const spawns = r.fork('spawns');          // its own stream: its draws do not move r's sequence
 *   const saved = r.state;                    // save with the game ...
 *   r.state = saved;                          // ... and resume the exact sequence
 *
 * The generator is mulberry32: a 32-bit state (so `state` is one number), period 2^32. Fine for games, not for
 * cryptography. Seeds are hashed with cyrb53. A fork's seed is `<parent key>/<label>`, so it depends only on the
 * parent's seed and the label, not on how many numbers the parent has drawn. Forking the same label twice gives
 * the same stream twice: give distinct systems distinct labels.
 */

export interface Rng {
  /** The seed as given. A fork's seed is its derived `<parent key>/<label>` string. */
  readonly seed: number | string;
  /** The generator's state. Save it, and assign it back to resume the sequence exactly. */
  state: number;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], both ends inclusive. Throws if the range is empty. */
  int(min: number, max: number): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability p: never for p <= 0, always for p >= 1. */
  chance(p: number): boolean;
  /** One element, uniformly. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** One item, with probability proportional to its weight. Zero weights are never picked. Throws on a negative weight or no positive one. */
  weighted<T>(items: readonly (readonly [T, number])[]): T;
  /** A shuffled copy. The input is not changed. */
  shuffle<T>(items: readonly T[]): T[];
  /** An independent stream, derived from this seed and the label. */
  fork(label: string): Rng;
}

/** cyrb53 string hash (public domain, bryc). Only the low 32 bits are used, as the seed. */
function cyrb53(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function make(seed: number | string, key: string): Rng {
  // The state stays a uint32 at all times (a double would lose precision after millions of draws).
  let s = cyrb53(key) >>> 0;

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    const lo = Math.ceil(min);
    const hi = Math.floor(max);
    if (hi < lo) throw new RangeError(`int(${min}, ${max}): empty range`);
    // The clamp guards float rounding on very large ranges.
    return Math.min(hi, lo + Math.floor(next() * (hi - lo + 1)));
  };

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new RangeError('pick: empty array');
    return items[int(0, items.length - 1)];
  };

  const weighted = <T>(items: readonly (readonly [T, number])[]): T => {
    let total = 0;
    for (const [, w] of items) {
      if (!Number.isFinite(w) || w < 0) throw new RangeError(`weighted: bad weight ${w}`);
      total += w;
    }
    if (!(total > 0)) throw new RangeError('weighted: no positive weight');
    let r = next() * total;
    let last: T | undefined;
    for (const [item, w] of items) {
      if (w <= 0) continue;
      last = item;
      if (r < w) return item;
      r -= w;
    }
    return last as T; // float rounding can leave r just past the total: the last positive item takes it
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  return {
    seed,
    get state() {
      return s;
    },
    set state(v: number) {
      s = v >>> 0;
    },
    next,
    int,
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick,
    weighted,
    shuffle,
    fork(label: string): Rng {
      const k = `${key}/${label}`;
      return make(k, k);
    },
  };
}

export function rng(seed: number | string): Rng {
  return make(seed, String(seed));
}
