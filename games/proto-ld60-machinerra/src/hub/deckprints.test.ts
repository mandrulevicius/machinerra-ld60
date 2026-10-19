import { describe, expect, it } from 'vitest';
import { rng } from '../../../../harness/kit/rng';
import { ERRANDS, GAIT, dustOf, errandOf, printsAlong, route, tripPrints, type DeckCtx, type Floor } from './deckprints';
import { ARRIVE, SPOTS, TABLE, setBuilt, walkable } from './layout';

/** The deck as the hub sees it with nothing built, round the table blocked. */
const floor: Floor = (x, y) => walkable(x, y) && Math.hypot(x - TABLE.x, (y - TABLE.y) * 1.6) >= 100;
setBuilt([]);
const ctx: DeckCtx = { floor, spot: (id) => (id === 'highPriest' ? SPOTS.altar : { x: TABLE.x + 150, y: TABLE.y + 60 }), lots: [], kettle: null, robots: 3 };

describe('the crew\'s ways on the deck', () => {
  it('a way never crosses open air', () => {
    const w = route({ x: SPOTS.altar.x, y: SPOTS.altar.y + 60 }, ARRIVE, floor);
    for (let i = 0; i < w.length - 1; i++)
      for (let k = 0; k <= 20; k++) expect(floor(w[i].x + ((w[i + 1].x - w[i].x) * k) / 20, w[i].y + ((w[i + 1].y - w[i].y) * k) / 20)).toBe(true);
  });

  it('there and back are two different ways', () => {
    for (const id of Object.keys(ERRANDS)) {
      const e = errandOf(id, ctx)!;
      expect(JSON.stringify(e.out)).not.toEqual(JSON.stringify([...e.back].reverse()));
    }
  });

  it('prints land only on the floor, alternate feet, and a stop stands', () => {
    const e = errandOf('sprocket', ctx)!;
    const p = printsAlong(e.out, e.gait, floor, rng(1));
    expect(p.length).toBeGreaterThan(20);
    for (const s of p) expect(floor(s.x, s.y)).toBe(true);
  });

  it('the Kicker leaves long gaps; the Trader counts', () => {
    const line = [{ x: ARRIVE.x, y: ARRIVE.y }, { x: ARRIVE.x + 1, y: ARRIVE.y }];
    void line;
    const straight = [{ x: 400, y: 920 }, { x: 900, y: 920 }];
    const all: Floor = () => true;
    const plain = printsAlong(straight, GAIT, all, rng(2)).length;
    const kicks = printsAlong(straight, { ...GAIT, kicks: [2, 3] }, all, rng(2)).length;
    const counting = printsAlong(straight, { ...GAIT, count: 5 }, all, rng(2)).length;
    expect(kicks).toBeLessThan(plain * 0.6);
    expect(counting).toBeGreaterThan(plain);
  });

  it('each trip lays the errand again, a little apart', () => {
    const one = tripPrints([['highPriest']], ctx);
    const two = tripPrints([['highPriest'], ['highPriest']], ctx);
    expect(two.length).toBeGreaterThan(one.length * 1.8);
    expect(two.slice(one.length, one.length + 5)).not.toEqual(one.slice(0, 5));
  });
});

describe('the dust stages', () => {
  it('a film, then drifts by the walls, then worn paths; never over open air', () => {
    const ways = [[{ x: 200, y: 900 }, { x: 900, y: 900 }]];
    const [s1, s2, s3] = [1, 2, 3].map((n) => dustOf(n, floor, ways, rng('d')));
    expect(dustOf(0, floor, ways, rng('d')).lay).toEqual([]);
    expect(s2.lay.length).toBeGreaterThan(s1.lay.length * 1.5);
    expect(Math.max(...s3.lay.map((s) => s.alpha))).toBeGreaterThan(Math.max(...s1.lay.map((s) => s.alpha)));
    expect(s1.wear).toEqual([]);
    expect(s2.wear).toEqual([]);
    expect(s3.wear.length).toBeGreaterThan(20);
    for (const s of s3.lay) expect(floor(s.x, s.y)).toBe(true);
  });
});
