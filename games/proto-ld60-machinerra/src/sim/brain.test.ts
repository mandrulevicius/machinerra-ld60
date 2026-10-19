import { describe, expect, it } from 'vitest';
import { AI, behindPoint, centreOf, covers, delayFor, densest, healPick, isBehind, pickTarget, retreatTo, retreating, sidesteps, tauntWorth, worthArea, type Cand, type Self, type Tele } from './brain';

const guard: Self = { role: 'guard', range: 230, rate: 0.55, gun: true, ranged: true, current: 0, crewTarget: 0 };
const top = (me: Self, cs: Cand[]) => pickTarget(me, cs)[0]?.id;

describe('target scores', () => {
  it('a Marked foe beats a nearer plain one', () => {
    expect(top(guard, [{ id: 1, d: 100 }, { id: 2, d: 200, marked: true }])).toBe(2);
  });
  it('the Communicator\'s target and his attackers come before a nearer foe', () => {
    expect(top(guard, [{ id: 1, d: 60 }, { id: 2, d: 300, commTarget: true }])).toBe(2);
    expect(top(guard, [{ id: 1, d: 60 }, { id: 2, d: 300, attacker: true }])).toBe(2);
  });
});

describe('stickiness and focus', () => {
  it('holds its target against a slightly better one', () => {
    const me = { ...guard, current: 1 };
    expect(top(me, [{ id: 1, d: 200 }, { id: 2, d: 120 }])).toBe(1);
    // ...but not against a clearly better one (Marked).
    expect(top(me, [{ id: 1, d: 200 }, { id: 2, d: 200, marked: true }])).toBe(2);
  });
  it('prefers the crew\'s target', () => {
    expect(top({ ...guard, crewTarget: 2 }, [{ id: 1, d: 150 }, { id: 2, d: 180 }])).toBe(2);
  });
});

describe('thinking', () => {
  it('a seeded delay of 0.15-0.35 s per bot, the same each run', () => {
    const ds = Array.from({ length: 40 }, (_, i) => delayFor(42, i));
    for (const d of ds) expect(d).toBeGreaterThanOrEqual(0.15), expect(d).toBeLessThanOrEqual(0.35);
    expect(new Set(ds.map((d) => d.toFixed(3))).size).toBeGreaterThan(20);
    expect(delayFor(42, 3)).toBe(delayFor(42, 3));
  });
});

describe('retreat', () => {
  it('falls back under 35% and rejoins above 60%', () => {
    expect(retreating(0.36, false)).toBe(false);
    expect(retreating(0.34, false)).toBe(true);
    expect(retreating(0.5, true)).toBe(true);
    expect(retreating(0.61, true)).toBe(false);
  });
  it('to its Repairer, else the Communicator, else the lift', () => {
    const lift = { x: 0, y: 0 };
    expect(retreatTo({ repairer: { x: 1, y: 1 }, comm: { x: 2, y: 2 }, lift }).why).toBe('repairer');
    expect(retreatTo({ comm: { x: 2, y: 2 }, lift }).why).toBe('comm');
    expect(retreatTo({ lift }).to).toBe(lift);
  });
});

describe('dodging', () => {
  const disc: Tele = { id: 'p', kind: 'disc', x: 100, y: 100, r: 30, from: { x: 0, y: 100 } };
  const lane: Tele = { id: 'l', kind: 'lane', x: 0, y: 0, dx: 1, dy: 0, len: 200, w: 40 };
  it('a sidestep is perpendicular to the blow and leaves the area', () => {
    const [a, b] = sidesteps(disc, 105, 108, 12);
    expect(covers(disc, a.x, a.y, 12)).toBe(false);
    expect(covers(disc, b.x, b.y, 12)).toBe(false);
    expect(a.x).toBeCloseTo(105); // across the line from the cat (x), not along it
    expect(a.y).toBeGreaterThan(108); // the side it leaned to first
    const [c, e] = sidesteps(lane, 80, -5, 12);
    expect(c.x).toBeCloseTo(80);
    expect(c.y).toBeLessThan(-5);
    expect(covers(lane, c.x, c.y, 12)).toBe(false);
    expect(covers(lane, e.x, e.y, 12)).toBe(false);
    expect(Math.abs(c.y + 5)).toBeLessThan(Math.abs(e.y + 5)); // the nearer way first
  });
});

describe('healing', () => {
  const at = (id: number, frac: number, d = 50) => ({ id, frac, d });
  it('anyone hurt, in a fight or not: the most hurt first, the current one until it is full, nobody at full oil', () => {
    expect(healPick([at(1, 1), at(2, 1)], { current: 0, chains: 0, reach: 200 })).toEqual([]);
    expect(healPick([at(1, 0.97), at(2, 0.9), at(3, 0.2, 300)], { current: 0, chains: 0, reach: 200 })).toEqual([2]);
    expect(healPick([at(1, 0.5), at(2, 0.3)], { current: 1, chains: 0, reach: 200 })).toEqual([1]); // sticks, no flicker
    expect(healPick([at(1, 1), at(2, 0.3)], { current: 1, chains: 0, reach: 200 })).toEqual([2]); // full: moves on
  });
});

describe('positioning and the taunt', () => {
  it('a crew\'s centre is the mean of its robots, none for an empty crew', () => {
    expect(centreOf([])).toBeNull();
    expect(centreOf([{ x: 0, y: 0 }, { x: 100, y: 40 }])).toEqual({ x: 50, y: 20 });
  });
  it('a foe\'s back is the arc away from where it faces', () => {
    const foe = { x: 0, y: 0 }, east = { x: 1, y: 0 };
    expect(isBehind(foe, east, { x: -50, y: 0 })).toBe(true);
    expect(isBehind(foe, east, { x: -50, y: 40 })).toBe(true);
    expect(isBehind(foe, east, { x: 0, y: 50 })).toBe(false); // the flank
    expect(isBehind(foe, east, { x: 50, y: 0 })).toBe(false);
    expect(behindPoint(foe, east, 40)).toEqual({ x: -40, y: 0 });
    expect(behindPoint(foe, { x: 0, y: 0 })).toEqual(foe);
  });
  it('an area ability goes where the most foes stand together, the nearer cluster on a tie', () => {
    const lone = { x: 500, y: 0 }, pack = [{ x: 100, y: 0 }, { x: 130, y: 20 }, { x: 150, y: -10 }];
    expect(densest([lone, ...pack], 90, { x: 0, y: 0 })?.n).toBe(3);
    expect(densest([{ x: 300, y: 0 }, { x: 40, y: 0 }], 90, { x: 0, y: 0 })?.at).toEqual({ x: 40, y: 0 });
    expect(densest([], 90, { x: 0, y: 0 })).toBeNull();
  });
  it('a taunt is worth it for a foe in reach hitting an ally under half oil, no other', () => {
    expect(tauntWorth([{ d: 100, allyFrac: 0.4 }], 160)).toBe(true);
    expect(tauntWorth([{ d: 100, allyFrac: AI.tauntAt }], 160)).toBe(false);
    expect(tauntWorth([{ d: 200, allyFrac: 0.1 }], 160)).toBe(false);
    expect(tauntWorth([{ d: 100, allyFrac: null }], 160)).toBe(false);
  });
});

describe('abilities, cover and orders', () => {
  it('an area ability on three foes or one elite, never on none', () => {
    expect(worthArea(2, false)).toBe(false);
    expect(worthArea(3, false)).toBe(true);
    expect(worthArea(1, true)).toBe(true);
    expect(worthArea(0, true)).toBe(false);
  });
});
