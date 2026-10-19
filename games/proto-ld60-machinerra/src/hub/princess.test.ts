import { describe, expect, it } from 'vitest';
import { PARTS } from '../sim/defs';
import { RELICS } from '../sim/junk';
import { STACK, sinceSweep, addTrail, bake, broughtOf, dustStage, freshPrincess, homecoming, homecomingLine, landRelics, merge, pickUp, rides, sweepings, swept, type Homecoming, type PrincessState } from './princess';

const home = (st: PrincessState, h: Partial<Homecoming> = {}) =>
  homecoming(st, { was: 'home', now: 'home', biome: 'desert', crew: ['highPriest', 'sprocket'], id: `h${Math.random()}`, brought: true, ...h });

describe('her sweepings', () => {
  it('a little scrap, a common part of the land, now and then one of its relics; the same haul pays the same', () => {
    const p = sweepings('jungle', 'a');
    expect(p.scrap).toBeGreaterThanOrEqual(2);
    expect(p.scrap).toBeLessThanOrEqual(5);
    expect(Object.values(p.parts)).toEqual([1]);
    expect(PARTS[Object.keys(p.parts)[0] as keyof typeof PARTS].unique).toBeFalsy();
    expect(sweepings('jungle', 'a')).toEqual(p);
    expect(p.dust).toEqual(['jungle']);
    // About one pile in eight holds a relic, and only one of the land's.
    const piles = Array.from({ length: 400 }, (_, i) => sweepings('city', `s${i}`));
    const withRelic = piles.filter((x) => x.junk.length).length;
    expect(withRelic).toBeGreaterThan(25);
    expect(withRelic).toBeLessThan(80);
    for (const x of piles) for (const id of x.junk) expect(landRelics('city')).toContain(id);
  });

  it('doubled by her repeatable, then back to one', () => {
    const one = sweepings('desert', 'x'), two = sweepings('desert', 'x', true);
    expect(two.scrap).toBe(one.scrap * 2);
    const st = home({ ...freshPrincess(), double: true }, { id: 'x' });
    expect(st.pile!.scrap).toBe(two.scrap);
    expect(st.double).toBe(false);
  });

  it('an unpicked pile grows instead of being lost; E takes it', () => {
    let st = home(freshPrincess(), { id: 'a' });
    st = home(st, { id: 'b', biome: 'jungle' });
    expect(st.pile).toEqual(merge(sweepings('desert', 'a'), sweepings('jungle', 'b')));
    expect(st.pile!.dust).toEqual(['desert', 'jungle']);
    const got = pickUp(st);
    expect(got.pile).toEqual(st.pile);
    expect(got.state.pile).toBeNull();
  });

  it('no pile the day she comes home (she came up with you), nor while she is gone', () => {
    expect(home(freshPrincess(), { was: 'none' }).pile).toBeNull();
    expect(home(freshPrincess(), { was: 'home', now: 'stolen' }).pile).toBeNull();
    expect(home(freshPrincess(), { was: 'stolen', now: 'home' }).pile).toBeNull();
  });
});

describe('the deck: her state across home, stolen and home again', () => {
  it('with her home a homecoming shows only this absence: the crew\'s errands and his walk in', () => {
    let st = addTrail(home(freshPrincess()), 'desert', [1, 2, 3]);
    const crew = ['highPriest', 'sprocket', 'hob', 'kicker', 'trader', 'gasket', 'cityPlanner', 'expeditioner'];
    st = home(st, { crew, id: 'z' });
    expect(st.deck).toEqual({ trips: [sinceSweep(crew, 'z')], his: [], dust: 0, owed: false });
    // She swept partway through: only some of the crew's errands came after.
    expect(st.deck.trips[0].length).toBeLessThan(crew.length);
    expect(st.deck.trips[0].length).toBeGreaterThan(0);
  });

  it('while she is gone every trip and trail stays and the dust thickens in three stages', () => {
    let st = addTrail(home(freshPrincess(), { now: 'stolen' }), 'jungle', [1, 2, 3]);
    st = addTrail(home(st, { was: 'stolen', now: 'stolen' }), 'city', [4, 5, 6]);
    st = home(st, { was: 'stolen', now: 'stolen' });
    st = home(st, { was: 'stolen', now: 'stolen' });
    expect(st.deck.trips).toHaveLength(4);
    expect(st.deck.his.map((t) => t.b)).toEqual(['jungle', 'city']);
    expect(st.deck.dust).toBe(4);
    expect([0, 1, 2, 3, 4, 20].map(dustStage)).toEqual([0, 1, 2, 3, 3, 3]);
  });

  it('back from the Ether the deck waits for her one sweep, which takes everything', () => {
    let st = home(freshPrincess(), { now: 'stolen' });
    st = addTrail(home(st, { was: 'stolen', now: 'stolen' }), 'demon', [1, 2, 3]);
    st = home(st, { was: 'stolen', now: 'home' });
    expect(st.deck.owed).toBe(true);
    expect(st.deck.dust).toBe(2);
    expect(st.deck.trips).toHaveLength(3);
    st = swept(st);
    expect(st.deck).toEqual({ trips: [], his: [], dust: 0, owed: false });
    // A sweep never played (a reload) is not owed forever: the next homecoming with her home starts clean.
    expect(home({ ...st, deck: { ...st.deck, owed: true, dust: 3 } }).deck.owed).toBe(false);
  });

  it('keeps a bounded history', () => {
    let st = home(freshPrincess(), { now: 'stolen' });
    for (let i = 0; i < 40; i++) st = addTrail(home(st, { was: 'stolen', now: 'stolen' }), 'desert', Array.from({ length: 300 }, (_, k) => k));
    expect(st.deck.trips.length).toBeLessThanOrEqual(24);
    expect(st.deck.his.length).toBeLessThanOrEqual(24);
    expect(st.deck.his[0].p.length).toBeLessThanOrEqual(180);
  });

  it('her catalogue: a land something was brought home from, while she is home', () => {
    let st = home(freshPrincess(), { biome: 'desert' });
    st = home(st, { biome: 'city', brought: false });
    st = home(st, { biome: 'jungle', was: 'none' });
    expect(st.catalogue).toEqual(['desert', 'jungle']);
  });
});

describe('the prints\' bookkeeping', () => {
  it('prints over prints darken, never past the cap; different places stay apart', () => {
    const s = { x: 100, y: 100, a: 90, tint: 0, alpha: 0.3, scale: 0.4 };
    expect(bake([s])[0].alpha).toBeCloseTo(0.3);
    expect(bake([s, { ...s, x: 102 }])[0].alpha).toBeCloseTo(1 - 0.7 ** 2);
    expect(bake(Array(50).fill(s))[0].alpha).toBe(STACK.cap);
    expect(bake([s, { ...s, x: 160 }, { ...s, a: 180 }, { ...s, tint: 1 }])).toHaveLength(4);
  });
});

describe('her homecoming line and Rumba', () => {
  it('reads the haul: robots lost first, then a boss, then the land', () => {
    const h = { id: 'x', parts: {}, robots: [{ name: 'A', role: 'gatherer', uid: 'a' }], went: ['a', 'b'] };
    expect(homecomingLine(broughtOf(h, 'desert'), 'x')).toMatch(/Count them|missing/);
    const boss = { ...h, went: ['a'], bosses: ['hornet'] };
    expect(homecomingLine(broughtOf(boss, 'desert'), 'x')).toMatch(/messy|fall/);
    expect(homecomingLine(broughtOf({ ...h, went: ['a'] }, 'mountains'), 'x')).toMatch(/Snow-melt/);
    expect(homecomingLine(broughtOf({ ...h, went: ['a'], junk: ['toaster'] }, 'desert'), 'y')).toBeTruthy();
    expect(RELICS.toaster.item).toBe('Toaster');
  });

  it('Rumba rides about one visit in three, and only once she is yours', () => {
    const n = Array.from({ length: 300 }, (_, i) => rides(i, true)).filter(Boolean).length;
    expect(n).toBeGreaterThan(70);
    expect(n).toBeLessThan(130);
    expect(rides(3, false)).toBe(false);
  });
});
