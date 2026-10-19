/**
 * The save audit, plain TS (no Phaser, no storage of its own): proves that every registered slice (`persist.ts`) comes
 * back from a save exactly as it went in, and names the field that does not. A slice is filled with a SAMPLE (non-default
 * data in every field, `saveslices.ts`), written, the file is passed through JSON text as a browser reload would, read
 * back, and the two are compared. The vitest (`saveaudit.test.ts`) runs it on every slice the game registers; the dev
 * command `save audit` runs it on the live game.
 *
 * It fails for: a slice that has no sample (a new system forgot it), a sample that leaves a field at its default or
 * misses one (so it would not notice that field being dropped), a value JSON cannot carry (undefined, NaN, a Set), a
 * slice whose `valid`/`migrate`/defaults change what was stored, one slice's write clobbering another's.
 *
 * It cannot see state that never reached a slice (a module-level `let` holding run state): that is the rule in the
 * `machinerra` skill, not something a test can find.
 */

/** A registered slice, as `registry.entries()` hands it over, with the sample it is filled with. */
export interface AuditSlice {
  key: string;
  get(): unknown;
  set(value: unknown): unknown;
  def(): unknown;
  sample: unknown;
}

/** The slot's raw file: what is stored, written back, or erased (there was no save before the audit). */
export interface AuditFile {
  read(): unknown;
  write(data: unknown): void;
  clear(): void;
}

const isPlain = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const show = (v: unknown) => {
  const t = JSON.stringify(v) ?? String(v);
  return t.length > 60 ? `${t.slice(0, 57)}...` : t;
};
/** What a file keeps: the value through JSON text. */
export const viaJson = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/**
 * Where `got` differs from `want`, one line per field, as paths under `path`: `hub.stations.trader: lost`,
 * `loadout.weapons[1]: expected "steamGun", got null`. Empty when they are the same.
 */
export function diff(want: unknown, got: unknown, path = ''): string[] {
  const at = (k: string | number) => (typeof k === 'number' ? `${path}[${k}]` : path ? `${path}.${k}` : k);
  if (Array.isArray(want) && Array.isArray(got)) {
    const out = want.length === got.length ? [] : [`${path || '(root)'}: expected ${want.length} items, got ${got.length}`];
    for (let i = 0; i < Math.min(want.length, got.length); i++) out.push(...diff(want[i], got[i], at(i)));
    return out;
  }
  if (isPlain(want) && isPlain(got)) {
    const out: string[] = [];
    for (const k of Object.keys(want)) out.push(...(k in got ? diff(want[k], got[k], at(k)) : [`${at(k)}: lost (was ${show(want[k])})`]));
    for (const k of Object.keys(got)) if (!(k in want)) out.push(`${at(k)}: appeared (${show(got[k])}), the sample has no such field`);
    return out;
  }
  if (got === undefined && want !== undefined) return [`${path || '(root)'}: lost (was ${show(want)})`];
  return Object.is(want, got) ? [] : [`${path || '(root)'}: expected ${show(want)}, got ${show(got)}`];
}

/**
 * What is wrong with a sample as a test of its slice: not plain JSON, or a field of the default it does not exercise
 * (missing, or left at the default value, or an empty list/record where data belongs), so a dropped field could hide.
 */
export function sampleProblems(key: string, def: unknown, sample: unknown): string[] {
  const out: string[] = [];
  for (const d of diff(sample, safeJson(sample), key)) out.push(`${d} (a sample must be plain JSON)`);
  const walk = (d: unknown, s: unknown, path: string) => {
    if (isPlain(d) && Object.keys(d).length) {
      if (!isPlain(s)) return void out.push(`${path}: the sample must be an object like the default`);
      for (const k of Object.keys(d)) {
        if (!(k in s)) out.push(`${path}.${k}: missing from the sample`);
        else walk(d[k], s[k], `${path}.${k}`);
      }
    } else if (!diff(d, s, path).length) out.push(`${path}: the sample leaves it at its default (${show(d)}); fill it with something else`);
  };
  walk(def, sample, key);
  return out;
}

const safeJson = (v: unknown) => {
  try {
    return viaJson(v);
  } catch (e) {
    return `(${(e as Error).message})`;
  }
};

/**
 * Audit the slices. `registered` are the keys the game has registered. Returns the problems, one line each: empty means
 * every slice survives a save and a reload intact. The file is restored afterwards (or erased if there was none).
 */
export function audit(slices: AuditSlice[], registered: string[], file: AuditFile): string[] {
  const problems: string[] = [];
  const have = new Set(slices.map((s) => s.key));
  for (const k of registered) if (!have.has(k)) problems.push(`${k}: registered, but has no sample (give its persist(...) a { sample })`);
  for (const s of slices) if (!registered.includes(s.key)) problems.push(`${s.key}: a sample for a slice that is not registered`);
  const live = slices.filter((s) => registered.includes(s.key));
  for (const s of live) problems.push(...sampleProblems(s.key, s.def(), s.sample));

  const backup = file.read();
  try {
    for (const s of live) s.set(safeJson(s.sample));
    file.write(viaJson(file.read())); // the reload: what the browser kept is text
    for (const s of live) problems.push(...diff(safeJson(s.sample), s.get(), s.key));
  } finally {
    if (backup === undefined || backup === null) file.clear();
    else file.write(backup);
  }
  return problems;
}
