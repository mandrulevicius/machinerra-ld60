import { describe, expect, it } from 'vitest';
import { EMPTY, Grid, diffRanges } from './grid';

describe('Grid', () => {
  it('files items by cell, clamps outside points, and removes with swap', () => {
    const g = new Grid<string>(1000, 500, 100);
    expect([g.cols, g.rows]).toEqual([10, 5]);
    expect(g.add('a', 50, 50)).toBe(0);
    expect(g.add('b', 60, 60)).toBe(0);
    expect(g.add('c', 5000, -20)).toBe(9); // clamped to the top-right cell
    g.remove('a');
    expect(g.itemsIn(0)).toEqual(['b']);
    g.remove('b');
    expect(g.size).toBe(1);
    expect(g.remove('nope')).toBe(false);
  });

  it('move re-files only when the cell changes', () => {
    const g = new Grid<string>(1000, 1000, 100);
    g.add('a', 10, 10);
    expect(g.move('a', 90, 90)).toBe(-1);
    expect(g.move('a', 110, 10)).toBe(1);
    expect(g.itemsIn(0)).toEqual([]);
    expect(g.itemsIn(1)).toEqual(['a']);
  });

  it('range clamps to the grid, and each lets the callback remove the current item', () => {
    const g = new Grid<number>(400, 400, 100);
    for (let i = 0; i < 8; i++) g.add(i, 10 + (i % 2) * 20, 10);
    g.add(99, 350, 350);
    const r = g.range(-500, -500, 150, 150);
    expect(r).toEqual({ c0: 0, c1: 1, r0: 0, r1: 1 });
    expect(g.range(900, 900, 1000, 1000)).toEqual(EMPTY);
    expect(g.count(r)).toBe(8);
    const seen: number[] = [];
    g.each(r, (i) => {
      seen.push(i);
      g.remove(i);
    });
    expect(seen.length).toBe(8);
    expect(g.size).toBe(1);
  });
});

describe('diffRanges', () => {
  it('reports the cells that entered and left, none for the overlap', () => {
    const entered: number[] = [];
    const left: number[] = [];
    diffRanges({ c0: 0, c1: 1, r0: 0, r1: 0 }, { c0: 1, c1: 2, r0: 0, r1: 0 }, 10, (c) => entered.push(c), (c) => left.push(c));
    expect(entered).toEqual([2]);
    expect(left).toEqual([0]);
  });
  it('from EMPTY everything enters; to EMPTY everything leaves', () => {
    const e: number[] = [];
    diffRanges(EMPTY, { c0: 0, c1: 1, r0: 0, r1: 1 }, 4, (c) => e.push(c), () => {});
    expect(e).toEqual([0, 1, 4, 5]);
    const l: number[] = [];
    diffRanges({ c0: 0, c1: 0, r0: 0, r1: 1 }, EMPTY, 4, () => {}, (c) => l.push(c));
    expect(l).toEqual([0, 4]);
  });
});
