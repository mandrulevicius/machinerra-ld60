/**
 * The persistent-state registry: every system that must survive a save declares its slice once, and the save file is
 * all registered slices together (`{ slices: { key: { v, d } } }`).
 *
 *   export const quests = persist('quests', () => ({ done: [] as string[] }));   // `persist` is exported by hub/save.ts
 *   quests.get().done;  quests.set({ done: ['a'] });
 *
 * Loading fills the gaps: a missing slice is the default, a partial object keeps its defaults for the keys it lacks, a
 * wrong-typed or `valid`-failing value falls back to the default, so old and damaged saves still load. Unknown stored
 * slices (from a newer build, or a module not imported yet) are kept on the next write. A shape change that defaults
 * cannot absorb bumps `version` and gives `migrate(old, from)`. The file is read on every `get`, never cached, so the
 * kit's menus and the game see the same data.
 *
 * A slice declared `keep: true` (the deeds' profile: what a player has done across runs) survives `reset`, which is New
 * game; `wipe` erases it too. A file holding only kept slices is not a game: `exists` says no, so the title offers no
 * Continue for it.
 */
import type { SaveStore } from '../../../harness/kit/savefiles';

export interface SliceOptions<T> {
  /** Bump when the stored shape changes incompatibly; `migrate` brings an older value up to it (default 1). */
  version?: number;
  migrate?: (old: unknown, from: number) => unknown;
  /** After merging with the default: false means the stored value is unusable and the default is used. */
  valid?: (value: T) => boolean;
  /** The slice outlives `reset` (New game): meta-progression across runs. Default false. */
  keep?: boolean;
  /**
   * Non-default data in every field, lists and records filled: what the save audit (`saveaudit.ts`) writes, reloads and
   * compares. Every slice has one (`saveslices.test.ts` fails without), so a new slice adds its sample in its own file.
   */
  sample?: T;
}

export interface Slice<T> {
  readonly key: string;
  get(): T;
  /** Write the whole slice (and with it every other registered slice) to the file. */
  set(value: T): T;
}

type Stored = Record<string, { v: number; d: unknown }>;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** A save from before the registry was the hub's state alone: it loads as this slice. */
const LEGACY_KEY = 'hub';

export function createRegistry(store: SaveStore, file = 0) {
  const slices = new Map<string, { opts: SliceOptions<any>; slice: Slice<any>; def: () => unknown }>();

  const read = (): Stored => {
    const data = store.list()[file]?.data;
    if (!isObj(data)) return {};
    return isObj(data.slices) ? (data.slices as Stored) : { [LEGACY_KEY]: { v: 1, d: data } };
  };

  function persist<T>(key: string, def: () => T, opts: SliceOptions<T> = {}): Slice<T> {
    if (slices.has(key)) throw new Error(`persist: slice "${key}" is registered twice`);
    const version = opts.version ?? 1;
    const slice: Slice<T> = {
      key,
      get() {
        const raw = read()[key];
        const base = def();
        if (!isObj(raw)) return base;
        try {
          const from = Number(raw.v) || 1;
          let d = from < version && opts.migrate ? opts.migrate(raw.d, from) : raw.d;
          if (isObj(base)) d = isObj(d) ? { ...base, ...d } : base;
          else if (typeof d !== typeof base) d = base;
          return !opts.valid || opts.valid(d as T) ? (d as T) : base;
        } catch {
          return base;
        }
      },
      set(value) {
        // Before a game exists, a kept slice is written alone: the file must not look like a save to the title.
        const rest = opts.keep && !hasGame() ? read() : { ...read(), ...snapshot() };
        store.put(file, { slices: { ...rest, [key]: { v: version, d: value } } });
        return value;
      },
    };
    slices.set(key, { opts, slice, def });
    return slice;
  }

  const kept = () => [...slices].filter(([, s]) => s.opts.keep).map(([k]) => k);
  /** The file holds something other than kept slices. */
  const hasGame = () => store.latest() >= 0 && Object.keys(read()).some((k) => !kept().includes(k));

  /** Every registered slice at its current value (its default when never saved), with its version. */
  function snapshot(): Stored {
    return Object.fromEntries([...slices].map(([k, { opts, slice }]) => [k, { v: opts.version ?? 1, d: slice.get() }]));
  }

  return {
    persist,
    snapshot: () => ({ slices: { ...read(), ...snapshot() } }),
    /** New game: erase the file, but the kept slices stay. Every other slice is its default again. */
    reset: () => {
      const stored = read();
      const keep = Object.fromEntries(kept().filter((k) => k in stored).map((k) => [k, stored[k]]));
      store.clear(file);
      if (Object.keys(keep).length) store.put(file, { slices: keep });
    },
    /** Erase the file, kept slices too (tests, the dev commands). */
    wipe: () => store.clear(file),
    /** A game is saved (the title offers Continue): a file with only kept slices is not one. */
    exists: hasGame,
    keys: () => [...slices.keys()],
    /** Every slice with its default and its sample, for the save audit (`saveaudit.ts`). */
    entries: () => [...slices].map(([key, { opts, slice, def }]) => ({
      key,
      get: () => slice.get() as unknown,
      set: (v: unknown) => slice.set(v) as unknown,
      def: def as () => unknown,
      sample: opts.sample as unknown,
    })),
  };
}
