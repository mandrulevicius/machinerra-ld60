import { describe, expect, it } from 'vitest';
import { rng, type Rng } from './rng';

const draws = (r: Rng, n: number) => Array.from({ length: n }, () => r.next());

describe('rng', () => {
  it('same seed gives the same sequence, for number and string seeds', () => {
    expect(draws(rng(42), 20)).toEqual(draws(rng(42), 20));
    expect(draws(rng('level-3'), 20)).toEqual(draws(rng('level-3'), 20));
  });

  it('different seeds differ', () => {
    expect(draws(rng(1), 10)).not.toEqual(draws(rng(2), 10));
    expect(draws(rng('a'), 10)).not.toEqual(draws(rng('b'), 10));
  });

  it('next() is in [0, 1)', () => {
    const r = rng('unit');
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int is inclusive, hits both ends and never leaves its bounds', () => {
    const r = rng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(r.int(3, 7));
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
    expect(r.int(5, 5)).toBe(5);
    expect(() => r.int(2, 1)).toThrow(RangeError);
  });

  it('range is in [min, max)', () => {
    const r = rng('range');
    for (let i = 0; i < 5000; i++) {
      const v = r.range(-2, 4);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(4);
    }
  });

  it('chance is never at p <= 0 and always at p >= 1', () => {
    const r = rng('chance');
    for (let i = 0; i < 1000; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });

  it('pick returns a member and throws on an empty array', () => {
    const r = rng('pick');
    const list = ['a', 'b', 'c'];
    for (let i = 0; i < 200; i++) expect(list).toContain(r.pick(list));
    expect(() => r.pick([])).toThrow(RangeError);
  });

  it('weighted never picks a zero weight and favours heavier items', () => {
    const r = rng('weighted');
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 4000; i++) counts[r.weighted([['a', 0], ['b', 1], ['c', 3]])]++;
    expect(counts.a).toBe(0);
    expect(counts.c).toBeGreaterThan(counts.b * 2); // expect about 3:1
    expect(() => r.weighted([['x', 0]])).toThrow(RangeError);
    expect(() => r.weighted([['x', -1], ['y', 2]])).toThrow(RangeError);
  });

  it('shuffle returns a permutation and does not mutate its input', () => {
    const r = rng('shuffle');
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = input.slice();
    const out = r.shuffle(input);
    expect(input).toEqual(copy);
    expect(out).not.toBe(input);
    expect([...out].sort((x, y) => x - y)).toEqual(copy);
  });

  it('a fork is the same however much its parent has drawn, and forking does not move the parent', () => {
    const fresh = draws(rng(7).fork('enemies'), 10);
    const used = rng(7);
    draws(used, 100);
    expect(draws(used.fork('enemies'), 10)).toEqual(fresh);

    const p = rng(7);
    p.fork('x');
    expect(draws(p, 5)).toEqual(draws(rng(7), 5));
  });

  it('drawing from a fork does not move the parent, and other labels give other streams', () => {
    const p = rng(9);
    draws(p.fork('k'), 50);
    expect(draws(p, 5)).toEqual(draws(rng(9), 5));
    expect(draws(rng(9).fork('a'), 10)).not.toEqual(draws(rng(9).fork('b'), 10));
  });

  it('restoring a saved state resumes the exact sequence', () => {
    const r = rng('save');
    draws(r, 13);
    const saved = JSON.parse(JSON.stringify(r.state)) as number;
    const ahead = draws(r, 20);
    r.state = saved;
    expect(draws(r, 20)).toEqual(ahead);
  });
});
