/**
 * Save files for the title and game menus: a few numbered files per game, stored with harness/save.ts.
 * The content of a file is whatever the game's `save` hook returns (JSON-serialisable); `at` is the save time (ms).
 */
import { createSave, type Save, type SaveOptions } from '../save';

export interface SaveEntry {
  at: number;
  data: unknown;
}
export type Saves = (SaveEntry | null)[];

/** `n` empty files. */
export const emptySaves = (n: number): Saves => Array.from({ length: n }, () => null);

/** Files with `data` stored in file `i` (out of range: unchanged). */
export function putSave(saves: Saves, i: number, data: unknown, at = Date.now()): Saves {
  if (i < 0 || i >= saves.length) return saves;
  return saves.map((s, j) => (j === i ? { at, data } : s));
}

/** Index of the newest save, -1 when there is none. */
export function latestSave(saves: Saves): number {
  let best = -1;
  saves.forEach((s, i) => {
    if (s && (best < 0 || s.at > saves[best]!.at)) best = i;
  });
  return best;
}

export interface SaveStore {
  readonly count: number;
  list(): Saves;
  put(i: number, data: unknown): void;
  /** Empty file `i`. */
  clear(i: number): void;
  latest(): number;
}

export function createSaveStore(gameId: string, count = 3, opts?: SaveOptions): SaveStore {
  const save: Save<{ saves: Saves }> = createSave(`${gameId}:saves`, { saves: emptySaves(count) }, opts);
  // A game that changes its count keeps what it has; extra files are empty.
  const list = (): Saves => Array.from({ length: count }, (_, i) => save.get().saves[i] ?? null);
  return {
    count,
    list,
    put: (i, data) => save.set({ saves: putSave(list(), i, data) }),
    clear: (i) => save.set({ saves: list().map((s, j) => (j === i ? null : s)) }),
    latest: () => latestSave(list()),
  };
}
