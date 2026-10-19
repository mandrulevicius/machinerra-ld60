import { describe, expect, it } from 'vitest';
import { chooseSpots, follow, inView, mergeLamps, type Lamp, type Rect } from './lamps';

const view: Rect = { x: 0, y: 0, right: 1280, bottom: 720 };
const lamp = (id: number, x: number, y: number, extra: Partial<Lamp> = {}): Lamp => ({ id, x, y, r: 110, i: 0.6, ...extra });
const crowd = (n: number, cx: number, cy: number, spread: number) => Array.from({ length: n }, (_, k) => lamp(k + 1, cx + Math.cos(k * 2.4) * spread * ((k % 5) / 5 + 0.2), cy + Math.sin(k * 2.4) * spread * ((k % 5) / 5 + 0.2)));
const litSeen = (spots: ReturnType<typeof chooseSpots>['spots']) => spots.filter((s) => s.i > 0 && inView(s, view)).length;

describe('mergeLamps', () => {
  it('leaves far lamps alone and folds near ones into the lowest id', () => {
    const spots = mergeLamps([lamp(1, 100, 100), lamp(2, 150, 100), lamp(3, 900, 600)], 100);
    expect(spots.map((s) => s.ids)).toEqual([[1, 2], [3]]);
    expect(spots[0].lead).toBe(1);
  });

  it('never merges a solo lamp', () => {
    const spots = mergeLamps([lamp(1, 100, 100, { solo: true }), lamp(2, 110, 100), lamp(3, 120, 100)], 100);
    expect(spots.find((s) => s.solo)!.ids).toEqual([1]);
    expect(spots.find((s) => !s.solo)!.ids).toEqual([2, 3]);
  });

});

describe('chooseSpots', () => {
  const focus = { x: 640, y: 360 };

  it('merges a party of 30 into the budget instead of dropping lamps', () => {
    const lamps = crowd(30, 640, 360, 420);
    const c = chooseSpots(lamps, { view, budget: 8, focus });
    expect(litSeen(c.spots)).toBeLessThanOrEqual(8);
    // Nobody is left unlit by a merge: every lamp is in exactly one spot.
    expect(c.spots.flatMap((s) => s.ids).sort((a, b) => a - b)).toEqual(lamps.map((l) => l.id));
  });

  it('keeps solo lamps burning and counts them against the budget', () => {
    const lamps = [lamp(1, 640, 360, { solo: true }), lamp(2, 100, 100), lamp(3, 1200, 650), lamp(4, 640, 700)];
    const c = chooseSpots(lamps, { view, budget: 2, focus });
    expect(c.spots.find((s) => s.solo)!.i).toBeGreaterThan(0);
    expect(litSeen(c.spots)).toBe(2);
  });

});

describe('follow', () => {
  it('eases toward the target at the same pace whatever the frame length', () => {
    const one = follow(0, 1, 0.1, 10);
    const two = follow(follow(0, 1, 0.05, 10), 1, 0.05, 10);
    expect(one).toBeCloseTo(two);
    expect(one).toBeGreaterThan(0.5);
    expect(one).toBeLessThan(1);
  });
});
