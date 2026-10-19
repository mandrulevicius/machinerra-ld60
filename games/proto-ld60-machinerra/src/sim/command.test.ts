import { describe, expect, it } from 'vitest';
import { CREWS, LEVEL1 } from './defs';
import { Selection, alone, anyOrder, assignGroup, boxBots, crewIds, orderSelection, pickBot, rejoin, selectGroup, targetAt } from './command';
import { goalOf } from './botai';
import { loadLand } from './lands';
import { NO_INPUT, Sim } from './sim';
import { tap } from './testkit';

/** A sim with the six starting robots, all in crew 0. */
const fresh = () => new Sim(3);
const named = (s: Sim, name: string) => s.crew.find((b) => b.name === name)!;


describe('picking', () => {
  it('a click picks the nearest robot body in range; a box picks those inside it', () => {
    const s = fresh();
    const [a, b] = s.crew;
    expect(pickBot(s, a.x, a.y - 18, 10)?.id).toBe(a.id);
    expect(pickBot(s, a.x + 500, a.y + 500, 10)).toBeNull();
    const ids = boxBots(s, a.x - 1, a.y - 40, a.x + 1, a.y);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(boxBots(s, a.x + 5, a.y + 5, a.x - 5, a.y - 40)).toContain(a.id); // corners in any order
    expect(boxBots(s, s.controller.x - 1, s.controller.y - 40, s.controller.x + 1, s.controller.y)).not.toContain(s.controller.id); // never the Communicator
  });
});

describe('groups are crews', () => {
  it('Ctrl+n puts the selection in crew n and n selects it again', () => {
    const s = fresh();
    const sel = new Selection();
    sel.ids = new Set([named(s, 'Bellows').id, named(s, 'Siphon').id]);
    expect(assignGroup(s, sel, 1)).toBe(2);
    expect(crewIds(s, 1).sort()).toEqual([named(s, 'Bellows').id, named(s, 'Siphon').id].sort());
    expect(sel.crew).toBe(1);
    sel.ids.clear();
    expect(selectGroup(s, sel, 1)).toBe(true);
    expect([...sel.ids].sort()).toEqual(crewIds(s, 1).sort());
    expect(selectGroup(s, sel, 2)).toBe(false); // empty: the selection stays
    expect(sel.ids.size).toBe(2);
    expect(selectGroup(s, sel, 0)).toBe(true); // crew 0 walks with you
    expect(sel.ids.size).toBe(4);
  });
  it('there is no group past the last crew', () => {
    const s = fresh();
    const sel = new Selection();
    sel.ids = new Set([named(s, 'Bellows').id]);
    expect(assignGroup(s, sel, CREWS)).toBe(0);
    expect(selectGroup(s, sel, CREWS)).toBe(false);
    expect(named(s, 'Bellows').crew).toBe(0);
  });
  it('a crew emptied by moving its robots forgets its order', () => {
    const s = fresh();
    const sel = new Selection();
    sel.ids = new Set([named(s, 'Bellows').id]);
    assignGroup(s, sel, 1);
    s.order(1, s.lift.x + 300, s.lift.y);
    assignGroup(s, sel, 2);
    expect(s.orders[1]).toBeNull();
  });
});

describe('ordering the selection (P3: per-robot orders)', () => {
  /** Bellows, Siphon and Dipper in crew 1, sent to a point. */
  const crewOfThree = () => {
    const s = fresh();
    const sel = new Selection();
    sel.ids = new Set(['Bellows', 'Siphon', 'Dipper'].map((n) => named(s, n).id));
    assignGroup(s, sel, 1);
    orderSelection(s, sel, s.lift.x + 300, s.lift.y);
    return { s, sel, crewAt: { ...s.orders[1]! } };
  };
  const run = (s: Sim, sec: number) => {
    for (let t = 0; t < sec; t += 1 / 30) s.step(1 / 30, NO_INPUT);
  };
  it('a whole crew is sent as it is', () => {
    const { s, crewAt } = crewOfThree();
    expect(s.orders[1]).toEqual(crewAt);
    expect(s.crew.filter((b) => b.crew === 1).every((b) => !b.own)).toBe(true);
  });
  it('two of three picked go on their own; the third keeps the crew order; all keep crew 1', () => {
    const { s, sel, crewAt } = crewOfThree();
    sel.ids = new Set([named(s, 'Bellows').id, named(s, 'Siphon').id]);
    const r = orderSelection(s, sel, s.lift.x - 300, s.lift.y);
    expect(r.sent).toEqual([]);
    expect(r.alone.sort()).toEqual([...sel.ids].sort());
    expect(s.orders[1]).toEqual(crewAt);
    for (const n of ['Bellows', 'Siphon', 'Dipper']) expect(named(s, n).crew).toBe(1);
    const bel = named(s, 'Bellows'), sip = named(s, 'Siphon'), dip = named(s, 'Dipper');
    expect(alone(bel) && alone(sip) && !alone(dip)).toBe(true);
    expect(bel.own).toBe(sip.own); // one point, one formation
    expect(s.anchor(dip)).toBe(s.orders[1]);
    const to = bel.own as { x: number; y: number };
    expect(goalOf(s, bel)).toMatchObject({ kind: 'go', x: to.x, y: to.y });
    expect(goalOf(s, dip)).toMatchObject({ kind: 'go', x: crewAt.x, y: crewAt.y });
    run(s, 20);
    expect(Math.hypot(bel.x - to.x, bel.y - to.y)).toBeLessThan(120);
    expect(Math.hypot(sip.x - to.x, sip.y - to.y)).toBeLessThan(120);
    expect(Math.hypot(dip.x - crewAt.x, dip.y - crewAt.y)).toBeLessThan(120);
  });
  it('a new crew order leaves robots on their own orders where they were sent', () => {
    const { s, sel } = crewOfThree();
    sel.ids = new Set([named(s, 'Bellows').id]);
    orderSelection(s, sel, s.lift.x - 300, s.lift.y);
    const own = named(s, 'Bellows').own;
    s.order(1, s.lift.x, s.lift.y + 300);
    expect(named(s, 'Bellows').own).toBe(own);
  });
  it('given back (Shift+its crew, a crew box, or the crew picked whole) it rejoins the crew order', () => {
    const { s, sel } = crewOfThree();
    const bel = named(s, 'Bellows');
    sel.ids = new Set([bel.id]);
    orderSelection(s, sel, s.lift.x - 300, s.lift.y);
    expect(alone(bel)).toBe(true);
    assignGroup(s, sel, 1); // Shift+1
    expect(alone(bel)).toBe(false);
    expect(s.anchor(bel)).toBe(s.orders[1]);
    orderSelection(s, sel, s.lift.x - 300, s.lift.y);
    expect(rejoin(s, [bel.id])).toBe(1);
    expect(alone(bel)).toBe(false);
    orderSelection(s, sel, s.lift.x - 300, s.lift.y);
    selectGroup(s, sel, 1); // 1 picks the whole crew, the lone one too
    expect(orderSelection(s, sel, s.lift.x, s.lift.y - 300).sent).toEqual([1]);
    expect(s.crew.filter((b) => b.crew === 1).every((b) => !b.own)).toBe(true);
  });
  it('robots picked from crew 0 go on their own and stay crew 0; the rest keep walking with you', () => {
    const s = fresh();
    const sel = new Selection();
    sel.ids = new Set([named(s, 'Rivet').id]);
    const r = orderSelection(s, sel, s.lift.x + 200, s.lift.y);
    expect(r).toEqual({ sent: [], alone: [named(s, 'Rivet').id] });
    expect(named(s, 'Rivet').crew).toBe(0);
    expect(s.follows(named(s, 'Rivet'))).toBe(false);
    expect(s.follows(named(s, 'Bellows'))).toBe(true);
    expect(s.orders.every((o) => !o)).toBe(true);
    expect(anyOrder(s)).toBe(true);
    // A right click on him gives it back: it walks with him again.
    orderSelection(s, sel, s.controller.x, s.controller.y, true);
    expect(alone(named(s, 'Rivet'))).toBe(false);
    expect(s.follows(named(s, 'Rivet'))).toBe(true);
  });
  it('part of crew 1 told to follow him trails him; the rest hold the crew point', () => {
    const { s, sel, crewAt } = crewOfThree();
    sel.ids = new Set([named(s, 'Dipper').id]);
    orderSelection(s, sel, s.controller.x, s.controller.y, true);
    expect(named(s, 'Dipper').own).toBe('follow');
    expect(s.anchor(named(s, 'Dipper'))).toBe(s.controller);
    expect(s.following[1]).toBe(false);
    expect(s.anchor(named(s, 'Bellows'))).toEqual(crewAt);
  });
  it('evacuate sends robots on their own orders to the lift too', () => {
    const { s, sel } = crewOfThree();
    sel.ids = new Set([named(s, 'Bellows').id, named(s, 'Rivet').id]);
    orderSelection(s, sel, s.lift.x - 300, s.lift.y);
    s.evacuate();
    for (const n of ['Bellows', 'Rivet']) expect(goalOf(s, named(s, n)).kind).toBe('evac');
    expect(s.follows(named(s, 'Piston'))).toBe(true); // crew 0 with no order of its own still walks with him
  });
  it('an empty selection orders nobody', () => {
    const s = fresh();
    expect(orderSelection(s, new Selection(), 0, 0)).toMatchObject({ sent: [], alone: [] });
  });
});

describe('one bot, one right click (level 1)', () => {
  it('Bellows, stood up, goes alone to the ruin he is sent to and stays in crew 0', () => {
    const s = new Sim('level1', [], 'desert', [], undefined, undefined, { land: loadLand('level1'), crew: [] });
    const step = (sec: number) => {
      for (let t = 0; t < sec; t += 1 / 30) s.step(1 / 30, NO_INPUT);
    };
    step(0.2);
    const b = s.places.find((p) => p.id === 'wreck')!.bot!;
    s.controller.x = b.x - 20;
    s.controller.y = b.y;
    s.controller.hp = s.controller.maxHp;
    tap(s);
    s.hornets.forEach((h) => ((h.hp = 0), (h.dead = true)));
    step(LEVEL1.fix + 0.7);
    expect(s.crew).toContain(b);
    // The farthest ruin, so the walk shows.
    const ruin = s.ruins.filter((r) => !r.searched).sort((p, q) => Math.hypot(q.x - b.x, q.y - b.y) - Math.hypot(p.x - b.x, p.y - b.y))[0];
    const sel = new Selection();
    sel.ids = new Set([b.id]);
    const t = targetAt(s, ruin.x, ruin.y - 14, new Set());
    expect(t.kind).toBe('ruin');
    const r = orderSelection(s, sel, t.x, t.y);
    expect(r.alone).toEqual([b.id]);
    expect(b.crew).toBe(0);
    expect(anyOrder(s)).toBe(true);
    const d0 = Math.hypot(b.x - ruin.x, b.y - ruin.y);
    step(6);
    expect(Math.hypot(b.x - ruin.x, b.y - ruin.y)).toBeLessThan(d0 - 60);
  });
});

describe('a crew told to follow', () => {
  const followers = () => {
    const s = fresh();
    const sel = new Selection();
    sel.ids = new Set([named(s, 'Bellows').id, named(s, 'Siphon').id]);
    assignGroup(s, sel, 1);
    s.order(1, s.lift.x + 400, s.lift.y);
    return { s, sel };
  };
  it('a right click on the Communicator makes the crew trail him; its number stays, a point ends it', () => {
    const { s, sel } = followers();
    const t = targetAt(s, s.controller.x, s.controller.y - 18, new Set());
    expect(t.kind).toBe('comm');
    expect(orderSelection(s, sel, t.x, t.y, true).sent).toEqual([1]);
    expect(s.following[1]).toBe(true);
    expect(s.orders[1]).toBeNull();
    expect(named(s, 'Bellows').crew).toBe(1);
    expect(s.anchor(named(s, 'Bellows'))).toBe(s.controller);
    orderSelection(s, sel, s.lift.x, s.lift.y + 300);
    expect(s.following[1]).toBe(false);
    expect(s.orders[1]).not.toBeNull();
  });
  it('walks with him, in a formation apart from crew 0', () => {
    const { s, sel } = followers();
    orderSelection(s, sel, s.controller.x, s.controller.y, true);
    const c = s.controller;
    c.x += 600;
    for (let i = 0; i < 30 * 40; i++) s.step(1 / 30, NO_INPUT);
    for (const b of [named(s, 'Bellows'), named(s, 'Siphon')]) expect(Math.hypot(b.x - c.x, b.y - c.y)).toBeLessThan(260);
    const slots = s.crew.map((b) => s.slot(b));
    expect(new Set(slots.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size).toBe(s.crew.length); // none stack
  });
});

