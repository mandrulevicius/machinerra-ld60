/**
 * Variant slots: each preset slot (theme, particles, lights, juice, look, or a game's own) holds named variants.
 *
 *   const s = slot('particles', { clean: {...}, sparkly: {...} });   // first key is the default
 *   s.value; s.name; s.set('sparkly'); s.on(() => ...);
 *   setVariant('particles', 'sparkly'); exportVariants();          // { particles: 'sparkly', ... }
 *
 * Which variant a slot starts on: URL `?v.<slot>=<name>` > the game's config (applyVariants) > the slot's first variant.
 */
type Listener = () => void;

export interface Slot<T = unknown> {
  readonly key: string;
  readonly variants: Record<string, T>;
  /** Active variant name. */
  readonly name: string;
  /** Active variant value. */
  readonly value: T;
  set(name: string): void;
  /** Add or replace a variant (e.g. a game's own look). */
  add(name: string, value: T): void;
  /** Called after every change of this slot; returns an unsubscribe function. */
  on(fn: Listener): () => void;
}

const registry = new Map<string, Slot<any>>();
const configured: Record<string, string> = {};
const anyListeners = new Set<(key: string) => void>();
let search = typeof location === 'undefined' ? '' : location.search;

/** `?v.<slot>=<name>` pairs from a query string. */
export function variantsFromQuery(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(query)) if (k.startsWith('v.') && v) out[k.slice(2)] = v;
  return out;
}

export function slot<T>(key: string, variants: Record<string, T>): Slot<T> {
  const existing = registry.get(key);
  if (existing) {
    // A slot declared again (hot reload of an edited module): new variants are added, edited ones replaced.
    for (const [n, v] of Object.entries(variants)) {
      if (!(n in existing.variants) || JSON.stringify(existing.variants[n]) !== JSON.stringify(v)) existing.add(n, v);
      else existing.variants[n] = v; // same data: take the new functions, if any, without a change event
    }
    return existing as Slot<T>;
  }
  const vars = { ...variants };
  const listeners = new Set<Listener>();
  const pick = (n: string | undefined) => (n !== undefined && n in vars ? n : undefined);
  let name = pick(variantsFromQuery(search)[key]) ?? pick(configured[key]) ?? Object.keys(vars)[0];
  const s: Slot<T> = {
    key,
    variants: vars,
    get name() {
      return name;
    },
    get value() {
      return vars[name];
    },
    set(n) {
      if (!(n in vars)) throw new Error(`kit: slot "${key}" has no variant "${n}" (has: ${Object.keys(vars).join(', ')})`);
      if (n === name) return;
      name = n;
      listeners.forEach((f) => f());
      anyListeners.forEach((f) => f(key));
    },
    add(n, v) {
      vars[n] = v;
      if (n === name) listeners.forEach((f) => f());
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  registry.set(key, s);
  return s;
}

export const getSlot = (key: string) => registry.get(key);
export const slots = () => [...registry.values()];

export function setVariant(key: string, name: string) {
  const s = registry.get(key);
  if (!s) throw new Error(`kit: no slot "${key}" (has: ${[...registry.keys()].join(', ')})`);
  s.set(name);
}

/** The active variant of every slot: paste it into the game's `variants` config. */
export function exportVariants(): Record<string, string> {
  return Object.fromEntries(slots().map((s) => [s.key, s.name]));
}

/** The game's chosen variants (from exportVariants). The URL still wins, so a test link can override them. */
export function applyVariants(config: Record<string, string>) {
  Object.assign(configured, config);
  const url = variantsFromQuery(search);
  for (const [k, n] of Object.entries(config)) {
    const s = registry.get(k);
    if (s && !(k in url) && n in s.variants) s.set(n);
  }
}

/** Any slot changed; returns an unsubscribe function. */
export function onAnyVariant(fn: (key: string) => void) {
  anyListeners.add(fn);
  return () => anyListeners.delete(fn);
}

/** Write the current choice into the address bar (no reload), so a reload or a shared link keeps it. */
export function syncVariantsToUrl() {
  if (typeof history === 'undefined') return;
  const p = new URLSearchParams(location.search);
  for (const s of slots()) p.set(`v.${s.key}`, s.name);
  history.replaceState(null, '', `${location.pathname}?${p.toString().replace(/%2C/g, ',')}${location.hash}`);
  search = location.search;
}

/** Tests only: forget all slots and set the query string slots read. */
export function _resetVariants(query = '') {
  registry.clear();
  anyListeners.clear();
  for (const k of Object.keys(configured)) delete configured[k];
  search = query;
}
