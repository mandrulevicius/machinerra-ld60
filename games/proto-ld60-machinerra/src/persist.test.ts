import { describe, expect, it } from 'vitest';
import { emptySaves, latestSave, putSave, type SaveStore, type Saves } from '../../../harness/kit/savefiles';
import { createRegistry } from './persist';

/** A save store in memory that stores JSON text, like the browser does. */
function memoryStore(): SaveStore & { raw: string } {
  let raw = JSON.stringify(emptySaves(1));
  const list = (): Saves => JSON.parse(raw);
  return {
    count: 1,
    get raw() {
      return raw;
    },
    list,
    put: (i, data) => (raw = JSON.stringify(putSave(list(), i, data))),
    clear: (i) => (raw = JSON.stringify(list().map((s, j) => (j === i ? null : s)))),
    latest: () => latestSave(list()),
  };
}

describe('persist registry', () => {
  it('round-trips slices through a reload (a new registry on the same file)', () => {
    const store = memoryStore();
    const a = createRegistry(store);
    const gun = a.persist('gun', () => ({ weapon: 'shovel', owned: ['shovel'] }));
    const n = a.persist('n', () => 0);
    gun.set({ weapon: 'steamGun', owned: ['shovel', 'steamGun'] });
    n.set(7);

    const b = createRegistry(store);
    expect(b.persist('gun', () => ({ weapon: 'shovel', owned: ['shovel'] })).get()).toEqual({ weapon: 'steamGun', owned: ['shovel', 'steamGun'] });
    expect(b.persist('n', () => 0).get()).toBe(7);
  });

  it('gathers every registered slice into the file, defaults included', () => {
    const store = memoryStore();
    const r = createRegistry(store);
    r.persist('a', () => ({ x: 1 }));
    const b = r.persist('b', () => ({ y: 2 }));
    b.set({ y: 5 });
    expect(r.snapshot().slices).toEqual({ a: { v: 1, d: { x: 1 } }, b: { v: 1, d: { y: 5 } } });
    expect(store.list()[0]!.data).toEqual(r.snapshot());
  });

  it('falls back to defaults: no save, a missing slice, missing keys of a partial one', () => {
    const store = memoryStore();
    const r = createRegistry(store);
    const a = r.persist('a', () => ({ x: 1, list: [] as string[] }));
    const b = r.persist('b', () => ({ y: 2 }));
    expect(r.exists()).toBe(false);
    expect(a.get()).toEqual({ x: 1, list: [] });
    store.put(0, { slices: { a: { v: 1, d: { x: 9 } } } }); // a save from before `list` and `b` existed
    expect(a.get()).toEqual({ x: 9, list: [] });
    expect(b.get()).toEqual({ y: 2 });
  });

  it('survives a damaged slice: wrong type, failing validation, junk file', () => {
    const store = memoryStore();
    const r = createRegistry(store);
    const a = r.persist('a', () => ({ x: 1 }));
    const n = r.persist('n', () => 3, { valid: (v) => v >= 0 });
    store.put(0, { slices: { a: { v: 1, d: 'oops' }, n: { v: 1, d: -4 } } });
    expect(a.get()).toEqual({ x: 1 });
    expect(n.get()).toBe(3);
    store.put(0, 'junk');
    expect(a.get()).toEqual({ x: 1 });
    store.put(0, { slices: { n: { v: 1, d: 'text' } } });
    expect(n.get()).toBe(3);
  });

  it('keeps slices it does not know on the next write', () => {
    const store = memoryStore();
    const r = createRegistry(store);
    const a = r.persist('a', () => 1);
    store.put(0, { slices: { future: { v: 2, d: { z: 1 } }, a: { v: 1, d: 4 } } });
    a.set(5);
    expect((store.list()[0]!.data as { slices: Record<string, unknown> }).slices.future).toEqual({ v: 2, d: { z: 1 } });
  });

  it('migrates an older version once, and stores the new version', () => {
    const store = memoryStore();
    const r = createRegistry(store);
    const a = r.persist('a', () => ({ names: [] as string[] }), { version: 2, migrate: (old, from) => (from < 2 ? { names: [(old as { name: string }).name] } : old) });
    store.put(0, { slices: { a: { v: 1, d: { name: 'Ada' } } } });
    expect(a.get()).toEqual({ names: ['Ada'] });
    a.set(a.get());
    expect(r.snapshot().slices.a).toEqual({ v: 2, d: { names: ['Ada'] } });
  });

  it('loads a flat save from before the registry as the hub slice', () => {
    const store = memoryStore();
    store.put(0, { rescued: ['trader'], resources: 40 });
    const hub = createRegistry(store).persist('hub', () => ({ rescued: [] as string[], resources: 0, spent: 0 }));
    expect(hub.get()).toEqual({ rescued: ['trader'], resources: 40, spent: 0 });
  });

  it('reset erases the file; a slice registered twice is a mistake', () => {
    const store = memoryStore();
    const r = createRegistry(store);
    const a = r.persist('a', () => 1);
    a.set(2);
    expect(r.exists()).toBe(true);
    r.reset();
    expect(r.exists()).toBe(false);
    expect(a.get()).toBe(1);
    expect(() => r.persist('a', () => 1)).toThrow(/twice/);
  });

  it('a `keep` slice survives reset (New game); wipe takes it too; a file of only kept slices is not a game', () => {
    const store = memoryStore();
    const r = createRegistry(store);
    const run = r.persist('run', () => ({ n: 0 }));
    const deeds = r.persist('deeds', () => ({ gauge: 0 }), { keep: true });
    deeds.set({ gauge: 40 });
    expect(r.exists()).toBe(false); // the profile alone is no save: the title offers no Continue
    expect(Object.keys((store.list()[0]!.data as { slices: object }).slices)).toEqual(['deeds']); // and nothing else was written with it
    run.set({ n: 5 });
    expect(r.exists()).toBe(true);
    r.reset();
    expect(r.exists()).toBe(false);
    expect(run.get()).toEqual({ n: 0 });
    expect(deeds.get()).toEqual({ gauge: 40 });
    run.set({ n: 2 });
    deeds.set({ gauge: 41 });
    r.wipe();
    expect(deeds.get()).toEqual({ gauge: 0 });
    expect(store.latest()).toBe(-1);
  });
});
