import { describe, expect, it } from 'vitest';
import { ChunkIndex, plan } from './groundchunks';

describe('ChunkIndex', () => {
  // A 3 x 2 grid of 100 px chunks: 0 1 2 / 3 4 5.
  const make = () => new ChunkIndex<{ id: number }>(300, 200, 100);

  it('files a picture in every chunk its box touches', () => {
    const ix = make();
    expect(ix.add(1, { id: 1 }, 10, 10, 40, 40)).toEqual([0]);
    expect(ix.add(2, { id: 2 }, 90, 90, 110, 110)).toEqual([0, 1, 3, 4]);
    expect(ix.list(0).map((s) => s.id)).toEqual([1, 2]);
    expect(ix.list(4).map((s) => s.id)).toEqual([2]);
    expect(ix.count).toBe(2);
  });

  it('keeps the order stamps were added in, and clamps to the land', () => {
    const ix = make();
    ix.add(1, { id: 1 }, -50, -50, 10, 10);
    ix.add(2, { id: 2 }, 0, 0, 5, 5);
    expect(ix.list(0).map((s) => s.id)).toEqual([1, 2]);
    expect(ix.add(3, { id: 3 }, 250, 150, 900, 900)).toEqual([5]);
  });

  it('takes a picture out of every chunk it was in, and says which', () => {
    const ix = make();
    ix.add(1, { id: 1 }, 90, 90, 110, 110);
    ix.add(2, { id: 2 }, 10, 10, 20, 20);
    expect(ix.remove(1)).toEqual([0, 1, 3, 4]);
    expect(ix.list(1)).toEqual([]);
    expect(ix.list(0).map((s) => s.id)).toEqual([2]);
    expect(ix.has(1)).toBe(false);
    expect(ix.remove(1)).toEqual([]);
    expect(ix.count).toBe(1);
  });

  it('adding an id again moves it', () => {
    const ix = make();
    ix.add(1, { id: 1 }, 10, 10, 20, 20);
    ix.add(1, { id: 1 }, 210, 110, 220, 120);
    expect(ix.list(0)).toEqual([]);
    expect(ix.list(5).length).toBe(1);
    expect(ix.count).toBe(1);
  });

  it('lists only the filled chunks of a box', () => {
    const ix = make();
    ix.add(1, { id: 1 }, 10, 10, 20, 20);
    ix.add(2, { id: 2 }, 210, 110, 220, 120);
    expect(ix.filled(0, 0, 300, 200)).toEqual([0, 5]);
    expect(ix.filled(0, 0, 150, 200)).toEqual([0]);
    ix.remove(1);
    expect(ix.filled(0, 0, 300, 200)).toEqual([5]);
  });
});

describe('plan', () => {
  it('bakes what is in view at once, and only one chunk ahead of it', () => {
    const p = plan([1, 2, 3, 4], new Set([1, 2]), new Set(), 1);
    expect(p.bake).toEqual([1, 2, 3]);
    expect(p.drop).toEqual([]);
  });

  it('drops the chunks no longer wanted, keeps those that are up', () => {
    const p = plan([2, 3], new Set([2]), new Set([1, 2]), 1);
    expect(p.drop).toEqual([1]);
    expect(p.bake).toEqual([3]);
  });

  it('bakes nothing when everything wanted is up', () => {
    expect(plan([5], new Set([5]), new Set([5]))).toEqual({ drop: [], bake: [] });
  });
});
