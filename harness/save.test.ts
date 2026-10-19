import { describe, expect, it } from 'vitest';
import { createSave, type Backend } from './save';

const fakeStorage = () => {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const only = (s: ReturnType<typeof fakeStorage>): [Backend, () => typeof s][] => [['localStorage', () => s]];
const throwing = (): never => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

describe('createSave', () => {
  const defaults = { level: 0, best: 0 };

  it('returns defaults when nothing is stored', () => {
    const save = createSave('g', defaults, { storages: only(fakeStorage()) });
    expect(save.get()).toEqual(defaults);
    expect(save.backend).toBe('localStorage');
  });

  it('persists across instances', () => {
    const s = fakeStorage();
    createSave('g', defaults, { storages: only(s) }).set({ level: 4 });
    expect(createSave('g', defaults, { storages: only(s) }).get()).toEqual({ level: 4, best: 0 });
  });

  it('fills in fields added since the save was written', () => {
    const s = fakeStorage();
    createSave('g', { level: 0 }, { storages: only(s) }).set({ level: 2 });
    expect(createSave('g', { level: 0, coins: 5 }, { storages: only(s) }).get()).toEqual({ level: 2, coins: 5 });
  });

  it('keeps games and versions apart', () => {
    const s = fakeStorage();
    createSave('a', defaults, { storages: only(s) }).set({ level: 1 });
    expect(createSave('b', defaults, { storages: only(s) }).get().level).toBe(0);
    expect(createSave('a', defaults, { storages: only(s), version: 2 }).get().level).toBe(0);
    expect(createSave('a', defaults, { storages: only(s) }).get().level).toBe(1);
  });

  it('ignores corrupt stored data', () => {
    const s = fakeStorage();
    s.m.set('g:save:v1', '{not json');
    expect(createSave('g', defaults, { storages: only(s) }).get()).toEqual(defaults);
  });

  it('reset restores defaults and forgets the stored copy', () => {
    const s = fakeStorage();
    const save = createSave('g', defaults, { storages: only(s) });
    save.set({ level: 9 });
    save.reset();
    expect(save.get()).toEqual(defaults);
    expect(s.m.size).toBe(0);
  });

  it('falls back to the next storage, then to memory, when storage throws', () => {
    const session = fakeStorage();
    const storages: [Backend, () => typeof session][] = [
      ['localStorage', throwing],
      ['sessionStorage', () => session],
    ];
    const a = createSave('g', defaults, { storages });
    expect(a.backend).toBe('sessionStorage');
    a.set({ level: 2 });
    expect(session.m.size).toBe(1);

    const b = createSave('g', defaults, { storages: [['localStorage', throwing], ['sessionStorage', throwing]] });
    expect(b.backend).toBe('memory');
    b.set({ level: 3 });
    expect(b.get().level).toBe(3);
    b.reset();
    expect(b.get()).toEqual(defaults);
  });

  it('switches to memory, keeping the value, if a later write throws', () => {
    const s = fakeStorage();
    const save = createSave('g', defaults, { storages: only(s) });
    s.setItem = throwing; // e.g. quota exceeded
    save.set({ level: 7 });
    expect(save.get().level).toBe(7);
    expect(save.backend).toBe('memory');
  });

  it('works with no browser storage at all (node)', () => {
    const save = createSave('g', defaults);
    expect(save.backend).toBe('memory');
    save.set({ best: 1 });
    expect(save.get().best).toBe(1);
  });
});
