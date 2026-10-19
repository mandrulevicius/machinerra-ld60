import { describe, expect, it } from 'vitest';
import { createSaveStore, emptySaves, latestSave, putSave } from './savefiles';
import type { Backend } from '../save';

const memory = () => {
  const m = new Map<string, string>();
  const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  return [['localStorage', () => s]] as [Backend, () => typeof s][];
};

describe('save files', () => {
  it('puts data in one file and finds the newest', () => {
    let s = emptySaves(3);
    expect(latestSave(s)).toBe(-1);
    s = putSave(s, 2, 'a', 10);
    s = putSave(s, 0, 'b', 20);
    expect(latestSave(s)).toBe(0);
    s = putSave(s, 2, 'c', 30);
    expect(latestSave(s)).toBe(2);
    expect(s[2]).toEqual({ at: 30, data: 'c' });
    expect(putSave(s, 5, 'x')).toBe(s);
  });

  it('persists through the store and survives a changed slot count', () => {
    const storages = memory();
    const a = createSaveStore('g', 3, { storages });
    a.put(1, { level: 4 });
    const b = createSaveStore('g', 3, { storages });
    expect(b.list()[1]?.data).toEqual({ level: 4 });
    expect(b.latest()).toBe(1);
    expect(createSaveStore('g', 5, { storages }).list()).toHaveLength(5);
    expect(createSaveStore('other', 3, { storages }).latest()).toBe(-1);
  });

  it('clears one file', () => {
    const s = createSaveStore('g', 2, { storages: memory() });
    s.put(0, 'a');
    s.put(1, 'b');
    s.clear(1);
    expect(s.list().map((e) => e?.data ?? null)).toEqual(['a', null]);
    s.clear(0);
    expect(s.latest()).toBe(-1);
  });
});
