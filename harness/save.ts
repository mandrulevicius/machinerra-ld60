/**
 * Save helper: one JSON object per game in browser storage.
 *
 *   const save = createSave('mygame', { level: 0, best: 0 });
 *   save.get().level;           // current data (defaults filled in)
 *   save.set({ level: 3 });     // shallow-merge and persist
 *   save.backend;               // 'localStorage' | 'sessionStorage' | 'memory'
 *
 * Storage can throw (private mode, a sandboxed or third-party iframe such as itch.io's), so it tries
 * localStorage, then sessionStorage, then plain memory; the game never sees an exception. In memory
 * mode saves last until the page closes. The key includes `version`: bump it when the data shape
 * changes incompatibly (old saves are ignored, not deleted). Adding a field with a default needs no bump.
 * Data must be JSON-serialisable.
 */
export type Backend = 'localStorage' | 'sessionStorage' | 'memory';
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface Save<T> {
  get(): T;
  set(patch: Partial<T>): void;
  /** Back to defaults, and forget the stored copy. */
  reset(): void;
  readonly backend: Backend;
}

export interface SaveOptions {
  version?: number;
  /** Storages to try in order; for tests. Default: localStorage, sessionStorage. */
  storages?: [Backend, () => Store][];
}

const browserStorages: [Backend, () => Store][] = [
  ['localStorage', () => globalThis.localStorage],
  ['sessionStorage', () => globalThis.sessionStorage],
];

/** First storage that really works (even reading the property can throw, so probe a write). */
function pickStorage(candidates: [Backend, () => Store][], probeKey: string): { backend: Backend; store: Store | null } {
  for (const [backend, get] of candidates) {
    try {
      const store = get();
      store.setItem(probeKey, '1');
      store.removeItem(probeKey);
      return { backend, store };
    } catch {
      // try the next one
    }
  }
  return { backend: 'memory', store: null };
}

export function createSave<T extends object>(game: string, defaults: T, opts: SaveOptions = {}): Save<T> {
  const key = `${game}:save:v${opts.version ?? 1}`;
  let { backend, store } = pickStorage(opts.storages ?? browserStorages, `${game}:probe`);

  let data: T = { ...defaults };
  try {
    const raw = store?.getItem(key);
    if (raw) data = { ...defaults, ...JSON.parse(raw) };
  } catch {
    // unreadable or corrupt: start from defaults
  }

  const persist = () => {
    try {
      store?.setItem(key, JSON.stringify(data));
    } catch {
      // e.g. quota exceeded: keep going from memory
      store = null;
      backend = 'memory';
    }
  };

  return {
    get: () => data,
    set(patch) {
      data = { ...data, ...patch };
      persist();
    },
    reset() {
      data = { ...defaults };
      try {
        store?.removeItem(key);
      } catch {
        // nothing to forget
      }
    },
    get backend() {
      return backend;
    },
  };
}
