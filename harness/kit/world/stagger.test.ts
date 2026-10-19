import { describe, expect, it } from 'vitest';
import { Stagger } from './stagger';

describe('Stagger', () => {
  it('gives each item a turn every N frames, spread evenly, with the time since its last turn', () => {
    const calls = new Map<number, number[]>();
    const perFrame: number[] = [];
    let n = 0;
    const s = new Stagger<number>(4, (it, dt) => {
      n++;
      calls.set(it, [...(calls.get(it) ?? []), dt]);
    });
    for (let i = 0; i < 10; i++) s.add(i);
    for (let f = 0; f < 8; f++) {
      n = 0;
      s.update(10);
      perFrame.push(n);
    }
    expect(perFrame).toEqual([3, 3, 2, 2, 3, 3, 2, 2]); // 10 items / 4 frames
    expect(calls.get(0)).toEqual([10, 40]); // turns at frames 0 and 4: first dt is time since add
    expect(calls.get(5)).toEqual([20, 40]); // frames 1 and 5
  });

  it('skips entities handled elsewhere, and survives removal inside the callback', () => {
    const ran: number[] = [];
    const s: Stagger<number> = new Stagger(1, (it) => { ran.push(it); if (it === 1) s.remove(1); }, (it) => it === 0);
    s.add(0);
    s.add(1);
    s.add(2);
    s.update(16);
    expect(ran.sort()).toEqual([1, 2]);
    expect(s.size).toBe(2);
    expect(s.has(1)).toBe(false);
  });
});
