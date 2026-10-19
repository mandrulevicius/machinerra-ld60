import { describe, expect, it } from 'vitest';
import { emptySaves, latestSave, putSave, type SaveStore, type Saves } from '../../../harness/kit/savefiles';
import { createRegistry } from './persist';
import { audit, diff, type AuditFile } from './saveaudit';

function memoryStore(): SaveStore {
  let raw = JSON.stringify(emptySaves(1));
  const list = (): Saves => JSON.parse(raw);
  return {
    count: 1,
    list,
    put: (i, data) => (raw = JSON.stringify(putSave(list(), i, data))),
    clear: (i) => (raw = JSON.stringify(list().map((s, j) => (j === i ? null : s)))),
    latest: () => latestSave(list()),
  };
}
const fileOf = (store: SaveStore): AuditFile => ({ read: () => store.list()[0]?.data, write: (d) => store.put(0, d), clear: () => store.clear(0) });

describe('diff', () => {

  it('names each field that was lost, changed or appeared, with its path', () => {
    const want = { stations: { trader: 'a' }, weapons: ['shovel', 'steamGun'], n: 3, at: { x: 1, y: 2 } };
    const got = { stations: {}, weapons: ['shovel', null], n: 4, at: { x: 1, y: 2 }, extra: 1 };
    expect(diff(want, got, 'hub')).toEqual([
      'hub.stations.trader: lost (was "a")',
      'hub.weapons[1]: expected "steamGun", got null',
      'hub.n: expected 3, got 4',
      'hub.extra: appeared (1), the sample has no such field',
    ]);
    expect(diff([1, 2], [1], 'x')).toEqual(['x: expected 2 items, got 1']);
  });
});

describe('audit', () => {
  const setup = () => {
    const store = memoryStore();
    const r = createRegistry(store);
    r.persist('hub', () => ({ gold: 0, stations: {} as Record<string, string> }));
    r.persist('bag', () => ({ items: [] as string[] }));
    const samples: Record<string, unknown> = { hub: { gold: 5, stations: { trader: 'a' } }, bag: { items: ['x'] } };
    const slices = () => r.entries().map((e) => ({ ...e, sample: samples[e.key] }));
    return { store, r, slices };
  };

  it('is clean when every slice comes back as it went in, and puts the save back', () => {
    const { store, r, slices } = setup();
    r.entries()[0].set({ gold: 99, stations: {} }); // a save the audit must not lose
    const before = JSON.stringify(store.list()[0]!.data);
    expect(audit(slices(), r.keys(), fileOf(store))).toEqual([]);
    expect(JSON.stringify(store.list()[0]!.data)).toBe(before);
  });

  it('names a slice whose validation drops what was stored', () => {
    const store = memoryStore();
    const r = createRegistry(store);
    // `valid` rejects a stored value with more than one item: the whole slice falls back to its default.
    r.persist('bag', () => ({ items: [] as string[], coins: 0 }), { valid: (b) => b.items.length < 2 });
    const bad = r.entries().map((e) => ({ ...e, sample: { items: ['a', 'b'], coins: 4 } }));
    const problems = audit(bad, r.keys(), fileOf(store));
    expect(problems).toContain('bag.items: expected 2 items, got 0');
    expect(problems).toContain('bag.coins: expected 4, got 0');
  });

  it('names a field a slice drops (an owner that writes only part of it)', () => {
    const store = memoryStore();
    const r = createRegistry(store);
    const slice = r.persist('s', () => ({ a: 0, b: 0 }));
    const lossy = { ...r.entries()[0], set: (v: unknown) => slice.set({ a: (v as { a: number }).a, b: 0 }) };
    const problems = audit([{ ...lossy, sample: { a: 1, b: 2 } }], r.keys(), fileOf(store));
    expect(problems).toEqual(['s.b: expected 2, got 0']);
  });

  it('catches a value JSON cannot carry (the browser would drop it on reload)', () => {
    const store = memoryStore();
    const r = createRegistry(store);
    r.persist('s', () => ({ at: null as null | { x: number | undefined }, tags: [] as string[] }));
    const problems = audit(r.entries().map((e) => ({ ...e, sample: { at: { x: undefined }, tags: ['a'] } })), r.keys(), fileOf(store));
    expect(problems.join('\n')).toMatch(/plain JSON/);
  });

});
