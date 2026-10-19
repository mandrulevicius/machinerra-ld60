/**
 * Live tuning: gameplay numbers, switches and modes you can change while playing.
 *
 *   const t = tune(this, { speed: [200, 50, 600], dash: true, mode: ['orbit', 'chase'] });
 *   t.speed   // number: [default, min, max] (optional 4th: step) is a slider
 *   t.dash    // boolean: a toggle
 *   t.mode    // string[]: a choice, first is the default
 *
 * `t.<name>` always reads the current value, so use it inside update(), not cached in create(). Names are global
 * per game (the URL key is `t.<name>`); calling `tune` again with the same name (scene restart) keeps the value. If the
 * definition changed (hot reload of an edited scene), the new default and range apply, and a value that differed from the
 * old default stays.
 * The first argument (scene or game) is optional and unused: it only makes the call read like `kit(this)`.
 *
 * A value starts from the URL `?t.speed=320` > the game's `tunes` config (bootGame) > the default. The dev sidebar
 * lists them, changes go live and into the address bar, and "export" prints `tunes: {...}` to paste into bootGame.
 */
type Listener = (key: string) => void;

export type TuneDef = readonly [number, number, number] | readonly [number, number, number, number] | boolean | readonly string[];
export type TuneValue = number | boolean | string;
export type Tuned<D extends Record<string, TuneDef>> = {
  readonly [K in keyof D]: D[K] extends boolean ? boolean : D[K] extends readonly number[] ? number : D[K] extends readonly (infer S)[] ? S : never;
};

export interface Tune {
  readonly key: string;
  readonly kind: 'number' | 'boolean' | 'choice';
  value: TuneValue;
  readonly default: TuneValue;
  min: number;
  max: number;
  step: number;
  options: string[];
  /** Coerces and clamps (a number is clamped, a choice must be an option); returns false when the value is unusable. */
  set(v: unknown): boolean;
}

const registry = new Map<string, Tune>();
const sigs = new Map<string, string>(); // key -> JSON of the definition it was made from
const configured: Record<string, TuneValue> = {};
const listeners = new Set<Listener>();
let search = typeof location === 'undefined' ? '' : location.search;

/** `?t.<name>=<value>` pairs from a query string (raw strings). */
export function tunesFromQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(query)) if (k.startsWith('t.') && v !== '') out[k.slice(2)] = v;
  return out;
}

function defaultStep(min: number, max: number) {
  const s = Math.pow(10, Math.floor(Math.log10((max - min) / 100 || 1)));
  return s;
}

function coerce(t: Tune, v: unknown): TuneValue | undefined {
  if (t.kind === 'number') {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(t.max, Math.max(t.min, n)) : undefined;
  }
  if (t.kind === 'boolean') {
    if (typeof v === 'boolean') return v;
    if (v === '1' || v === 'true') return true;
    if (v === '0' || v === 'false') return false;
    return undefined;
  }
  return typeof v === 'string' && t.options.includes(v) ? v : undefined;
}

function make(key: string, def: TuneDef): Tune {
  const base = { key, min: 0, max: 0, step: 0, options: [] as string[] };
  let t: Tune;
  if (typeof def === 'boolean') t = { ...base, kind: 'boolean', value: def, default: def, set: () => false };
  else if (typeof def[0] === 'number') {
    const [d, min, max, step] = def as readonly number[];
    t = { ...base, kind: 'number', value: d, default: d, min, max, step: step ?? defaultStep(min, max), set: () => false };
  } else t = { ...base, kind: 'choice', value: def[0], default: def[0], options: [...(def as readonly string[])], set: () => false };
  t.set = (v) => {
    const c = coerce(t, v);
    if (c === undefined) return false;
    if (c !== t.value) {
      t.value = c;
      listeners.forEach((f) => f(key));
    }
    return true;
  };
  return t;
}

export function tune<const D extends Record<string, TuneDef>>(defs: D): Tuned<D>;
export function tune<const D extends Record<string, TuneDef>>(owner: object, defs: D): Tuned<D>;
export function tune(a: object, b?: Record<string, TuneDef>): Tuned<Record<string, TuneDef>> {
  const defs = (b ?? a) as Record<string, TuneDef>;
  const url = tunesFromQuery(search);
  const out = {} as Record<string, TuneValue>;
  for (const [key, def] of Object.entries(defs)) {
    let t = registry.get(key);
    const sig = JSON.stringify(def);
    if (!t || sigs.get(key) !== sig) {
      const old = t;
      t = make(key, def);
      registry.set(key, t);
      sigs.set(key, sig);
      const kept = old && old.value !== old.default ? coerce(t, old.value) : undefined;
      t.value = kept ?? (key in url ? coerce(t, url[key]) : undefined) ?? coerce(t, configured[key]) ?? t.value;
    }
    Object.defineProperty(out, key, { enumerable: true, get: () => registry.get(key)!.value });
  }
  listeners.forEach((f) => f(''));
  return out as Tuned<Record<string, TuneDef>>;
}

export const tunes = () => [...registry.values()];
export const getTune = (key: string) => registry.get(key);

/** Set a tuned value by name (string or typed); returns false when the name or value is unusable. */
export function setTune(key: string, v: unknown) {
  return registry.get(key)?.set(v) ?? false;
}

/** The current value of every tune: paste it into the game's `tunes` config. */
export function exportTunes(): Record<string, TuneValue> {
  return Object.fromEntries(tunes().map((t) => [t.key, t.value]));
}

/** The game's chosen values (from exportTunes). The URL still wins, so a test link can override them. */
export function applyTunes(config: Record<string, TuneValue>) {
  Object.assign(configured, config);
  const url = tunesFromQuery(search);
  for (const [k, v] of Object.entries(config)) if (!(k in url)) registry.get(k)?.set(v);
}

/** A tune registered or changed (key is '' for a registration); returns an unsubscribe function. */
export function onAnyTune(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** `query` with every tune written as `t.<name>=<value>` (other params kept). */
export function tunesQuery(query: string): string {
  const p = new URLSearchParams(query);
  for (const t of tunes()) p.set(`t.${t.key}`, String(t.value));
  return p.toString().replace(/%2C/g, ',');
}

/** Write the current values into the address bar (no reload), so a reload or a shared link keeps them. */
export function syncTunesToUrl() {
  if (typeof history === 'undefined') return;
  history.replaceState(null, '', `${location.pathname}?${tunesQuery(location.search)}${location.hash}`);
  search = location.search;
}

/** Tests only: forget all tunes and set the query string they read. */
export function _resetTunes(query = '') {
  registry.clear();
  sigs.clear();
  listeners.clear();
  for (const k of Object.keys(configured)) delete configured[k];
  search = query;
}
