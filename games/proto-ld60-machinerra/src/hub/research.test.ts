import { describe, expect, it } from 'vitest';
import { rng } from '../../../../harness/kit/rng';
import { Effects, validate, type Unit } from '../sim/effects';
import { NO_INPUT, Sim } from '../sim/sim';
import { STEAM } from '../sim/defs';
import {
  CARDS, RESEARCH, autoFit, bankPick, buyPick, cardOf, cardSources, cleanResearch, fit, fittedAt, freshResearch, noCtx, offerFor, pick, prepare, slotsFor, typeSlot, unfit, usablePools, waiting,
  type Ctx, type Research,
} from './research';

const ctx: Ctx = { types: ['gatherer', 'repairer', 'marksman'], dog: false };
const own = (...ids: string[]): Research => ({ ...freshResearch(), owned: ids });
const seeds = Array.from({ length: 40 }, (_, i) => `s${i}`);

describe('the card table', () => {
  it('every card has a pool, words and effects the engine accepts', () => {
    for (const c of CARDS) {
      expect(c.name && c.text, c.id).toBeTruthy();
      expect(() => validate({ id: `card:${c.id}`, effects: c.effects }), c.id).not.toThrow();
      expect(slotsFor(c).length, c.id).toBeGreaterThan(0);
    }
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    expect(CARDS.filter((c) => c.pool === 'keystone').map((c) => c.id)).toEqual(expect.arrayContaining(['conductors', 'rustBloom', 'heatLamp']));
  });
});

describe('the offer rule', () => {
  it('offers three cards you do not own, never twice, from pools you can use', () => {
    const r = own('twinNozzle', 'acidEdge');
    for (const s of seeds) {
      const o = offerFor(r, ctx, s);
      expect(o).toHaveLength(3);
      expect(new Set(o).size).toBe(3);
      for (const id of o) {
        expect(r.owned).not.toContain(id);
        expect(usablePools(r, ctx)).toContain(cardOf(id)!.pool);
      }
    }
  });

  it('draws one from a pool you already hold, one from a pool you hold none of', () => {
    const r = own('twinNozzle');
    for (const s of seeds) {
      const pools = offerFor(r, ctx, s).map((id) => cardOf(id)!.pool);
      expect(pools).toContain('gun');
      expect(pools.some((p) => p !== 'gun')).toBe(true);
    }
  });

  it('skips a pool with no cards left, and a type you do not own', () => {
    const gun = CARDS.filter((c) => c.pool === 'gun').map((c) => c.id);
    const r = own(...gun);
    for (const s of seeds) for (const id of offerFor(r, ctx, s)) expect(cardOf(id)!.pool).not.toBe('gun');
    for (const s of seeds) for (const id of offerFor(freshResearch(), noCtx, s)) expect(['gatherer', 'repairer', 'marksman', 'dog']).not.toContain(cardOf(id)!.pool);
  });

  it('offers keystones only after 4 cards', () => {
    const three = own('twinNozzle', 'acidEdge', 'bootPolish');
    const four = own('twinNozzle', 'acidEdge', 'bootPolish', 'brassBrotherhood');
    expect(usablePools(three, ctx)).not.toContain('keystone');
    expect(usablePools(four, ctx)).toContain('keystone');
    expect(seeds.flatMap((s) => offerFor(three, ctx, s)).some((id) => cardOf(id)!.pool === 'keystone')).toBe(false);
    expect(seeds.flatMap((s) => offerFor(four, ctx, s)).some((id) => cardOf(id)!.pool === 'keystone')).toBe(true);
  });

  it('is the same for the same seed', () => {
    expect(offerFor(own(), ctx, 'x')).toEqual(offerFor(own(), ctx, 'x'));
  });
});

describe('picks', () => {
  it('a return banks one free pick at docking, kept until spent; an insight buys one more', () => {
    let r = freshResearch();
    expect(waiting(r)).toBe(0);
    r = bankPick(r, 'h1');
    expect(waiting(r)).toBe(1);
    // The same haul twice banks one; preparing only draws the offer and adds none.
    expect(bankPick(r, 'h1')).toEqual(r);
    r = prepare(r, ctx);
    expect(r.offer).toHaveLength(3);
    expect(waiting(r)).toBe(1);
    expect(prepare(r, ctx)).toEqual(r);
    const bought = buyPick(r, 1, ctx);
    expect(bought.insight).toBe(0);
    expect(bought.r.credit).toBe(2);
    expect(() => buyPick(r, 0, ctx)).toThrow(/insight/i);
    // Another return is another free pick, on top of the one still unspent.
    expect(waiting(bankPick(bought.r, 'h2'))).toBe(3);
  });

  it('a pick adds the card for good, fits it into a free slot, and draws again while picks are left', () => {
    let r = prepare(bankPick(freshResearch(), 'h1'), ctx);
    r = buyPick(r, 1, ctx).r;
    const first = r.offer[0];
    const got = pick(r, first, ctx);
    expect(got.r.owned).toEqual([first]);
    expect(got.slot).not.toBeNull();
    expect(fittedAt(got.r, first)).toBe(got.slot);
    expect(got.r.credit).toBe(1);
    expect(got.r.offer).toHaveLength(3);
    expect(got.r.offer).not.toContain(first);
    const last = pick(got.r, got.r.offer[0], ctx);
    expect(last.r.credit).toBe(0);
    expect(last.r.offer).toEqual([]);
    expect(() => pick(last.r, 'twinNozzle', ctx)).toThrow();
  });

  it('level 1: the free pick and the car\'s insight are two picks of three', () => {
    let r = prepare(bankPick(freshResearch(), 'level1'), noCtx);
    r = buyPick(r, 1, noCtx).r;
    expect(waiting(r)).toBe(2);
    expect(r.offer).toHaveLength(3);
    const a = pick(r, r.offer[0], noCtx);
    expect(a.r.offer).toHaveLength(3);
    expect(pick(a.r, a.r.offer[0], noCtx).r.owned).toHaveLength(2);
  });
});

describe('slots', () => {
  it('a card is in one place: fitting it elsewhere moves it, and a slot holds one card', () => {
    let r = own('twinNozzle', 'acidEdge');
    r = fit(r, 'twinNozzle', 'comm:0');
    r = fit(r, 'twinNozzle', 'comm:2');
    expect(r.fit).toEqual({ 'comm:2': 'twinNozzle' });
    r = fit(r, 'acidEdge', 'comm:2');
    expect(r.fit).toEqual({ 'comm:2': 'acidEdge' });
    expect(fittedAt(r, 'twinNozzle')).toBeUndefined();
    expect(unfit(r, 'acidEdge').fit).toEqual({});
  });

  it('pools go to their slots: the Communicator\'s, a type\'s, a keystone anywhere', () => {
    const r = own('twinNozzle', 'deepDraw', 'brassBrotherhood', 'conductors');
    expect(() => fit(r, 'deepDraw', 'comm:0')).toThrow(/does not fit/);
    expect(() => fit(r, 'twinNozzle', typeSlot('gatherer'))).toThrow(/does not fit/);
    expect(fit(r, 'deepDraw', typeSlot('gatherer')).fit).toEqual({ 'type:gatherer': 'deepDraw' });
    expect(fit(r, 'brassBrotherhood', 'comm:1').fit).toEqual({ 'comm:1': 'brassBrotherhood' });
    expect(fit(r, 'conductors', typeSlot('guard')).fit).toEqual({ 'type:guard': 'conductors' });
    expect(() => fit(freshResearch(), 'twinNozzle', 'comm:0')).toThrow(/not in your collection/);
    expect(RESEARCH.commSlots).toBe(3);
  });

  it('two keystones never stay fitted: the second takes the first out', () => {
    let r = own('conductors', 'rustBloom', 'heatLamp');
    r = fit(r, 'conductors', 'comm:0');
    r = fit(r, 'rustBloom', 'comm:1');
    expect(r.fit).toEqual({ 'comm:1': 'rustBloom' });
    r = fit(r, 'heatLamp', typeSlot('guard'));
    expect(r.fit).toEqual({ 'type:guard': 'heatLamp' });
  });

  it('a new card fits itself into a free slot that can use it', () => {
    let r = own('twinNozzle', 'acidEdge', 'bootPolish', 'wideSwing', 'deepDraw', 'conductors', 'rustBloom');
    expect(autoFit(r, 'twinNozzle')).toBe('comm:0');
    r = fit(r, 'twinNozzle', 'comm:0');
    expect(autoFit(r, 'acidEdge')).toBe('comm:1');
    r = fit(r, 'acidEdge', 'comm:1');
    r = fit(r, 'bootPolish', 'comm:2');
    // The Communicator's slots are full: another of his cards waits in the collection.
    expect(autoFit(r, 'wideSwing')).toBeNull();
    // A type's slot is its own.
    expect(autoFit(r, 'deepDraw')).toBe('type:gatherer');
    // A keystone takes a free slot of any kind, and only while none is fitted.
    expect(autoFit(r, 'conductors')).toBe('type:gatherer');
    r = fit(r, 'conductors', 'type:gatherer');
    expect(autoFit(r, 'rustBloom')).toBeNull();
  });

  it('a damaged save loads clean', () => {
    const r = cleanResearch({ owned: ['twinNozzle', 'twinNozzle', 'gone'], fit: { 'comm:0': 'twinNozzle', 'comm:1': 'gone', 'type:guard': 'twinNozzle' }, credit: -2, seen: null, offer: ['twinNozzle', 'acidEdge', 'gone'] });
    expect(r).toEqual({ owned: ['twinNozzle'], fit: { 'comm:0': 'twinNozzle' }, credit: 0, seen: null, offer: ['acidEdge'] });
  });
});

describe('in a mission', () => {
  const fitted = (): Research => {
    let r = own('twinNozzle', 'deepDraw', 'overpressure', 'acidEdge', 'conductors');
    r = fit(r, 'twinNozzle', 'comm:0');
    r = fit(r, 'deepDraw', 'type:gatherer');
    r = fit(r, 'overpressure', 'type:repairer');
    return fit(r, 'conductors', 'comm:2');
  };

  it('the fitted cards are sources where they act; an unfitted one is nowhere', () => {
    const c = cardSources(fitted());
    expect(c.comm.map((s) => s.id)).toEqual(['card:twinNozzle']);
    expect(Object.fromEntries(Object.entries(c.roles).map(([k, v]) => [k, v!.map((s) => s.id)]))).toEqual({ gatherer: ['card:deepDraw'], repairer: ['card:overpressure'] });
    expect(c.party.map((s) => s.id)).toEqual(['card:conductors']);
    expect([...c.comm, ...c.party, ...Object.values(c.roles).flat()].map((s) => s!.id)).not.toContain('card:acidEdge');
  });

  it('the Sim puts them on the Communicator, on every bot of a type, and the keystone on all', () => {
    const s = new Sim(3, [], 'desert', [], undefined, undefined, { cards: cardSources(fitted()) });
    const has = (u: Parameters<Sim['engine']['source']>[0], id: string) => !!s.engine.source(u, id);
    expect(has(s.controller, 'card:twinNozzle')).toBe(true);
    expect(has(s.controller, 'card:deepDraw')).toBe(false);
    for (const b of s.crew) {
      expect(has(b, 'card:conductors')).toBe(true);
      expect(has(b, 'card:deepDraw')).toBe(b.role === 'gatherer');
      expect(has(b, 'card:overpressure')).toBe(b.role === 'repairer');
      expect(has(b, 'card:twinNozzle')).toBe(false);
    }
    expect(has(s.controller, 'card:conductors')).toBe(true);
    const bare = new Sim(3);
    expect(bare.engine.source(bare.controller, 'card:twinNozzle')).toBeUndefined();
  });

  it('Wide Swing hits a foe behind him; the plain swing does not', () => {
    const swing = (cards?: Research) => {
      const s = new Sim(3, [], 'desert', [], undefined, undefined, cards ? { cards: cardSources(cards) } : {});
      const c = s.controller;
      const h = s.spawnHornet(c.x - 40, c.y);
      const hp = h.hp;
      c.cd = 0;
      s.step(1 / 30, { ...NO_INPUT, ax: c.x + 200, ay: c.y, fire: true });
      return h.hp < hp;
    };
    expect(swing()).toBe(false);
    expect(swing(fit(own('wideSwing'), 'wideSwing', 'comm:0'))).toBe(true);
  });

  it('Deep Draw: a gatherer that searches a ruin sometimes brings up a scrap gob', () => {
    const search = (cards?: Research) => {
      const s = new Sim(3, [], 'desert', [], undefined, undefined, cards ? { cards: cardSources(cards) } : {});
      const g = s.crew.find((b) => b.role === 'gatherer')!;
      const before = s.loot.filter((l) => l.kind === 'scrap').length;
      for (let i = 0; i < 40; i++) {
        s.engine.emit({ kind: 'search', self: g });
        s.drainFx();
      }
      return s.loot.filter((l) => l.kind === 'scrap').length - before;
    };
    expect(search()).toBe(0);
    expect(search(fit(own('deepDraw'), 'deepDraw', 'type:gatherer'))).toBeGreaterThan(0);
  });

  it('Twin Nozzle fires a pair and costs 25% more steam; without it, one bolt', () => {
    const shoot = (cards?: Research) => {
      const s = new Sim(3, [], 'desert', [], undefined, undefined, cards ? { cards: cardSources(cards) } : {});
      s.give('steamGun');
      s.equip('steamGun', 'primary');
      s.controller.steam = s.controller.maxSteam;
      const before = s.controller.steam;
      s.step(1 / 30, { ...NO_INPUT, ax: s.controller.x + 200, ay: s.controller.y, fire: true });
      return { shots: s.shots.length, spent: before - s.controller.steam };
    };
    const plain = shoot();
    const twin = shoot(fit(own('twinNozzle'), 'twinNozzle', 'comm:0'));
    expect(plain.shots).toBe(1);
    expect(twin.shots).toBe(2);
    expect(twin.spent).toBeGreaterThan(plain.spent);
    expect(twin.spent / plain.spent).toBeCloseTo(1.25, 1);
    expect(STEAM.shot).toBeGreaterThan(0);
  });
});

describe('what the cards do in the engine', () => {
  const world = (card: string, hp = 1000) => {
    const fx = new Effects(rng('cards'));
    const a: Unit = { x: 0, y: 0, hp: 100, maxHp: 100 };
    const b: Unit = { x: 50, y: 0, hp, maxHp: hp };
    const c: Unit = { x: 80, y: 0, hp: 1000, maxHp: 1000 };
    fx.add(a, { team: 'crew' });
    fx.add(b, { team: 'foe' });
    fx.add(c, { team: 'foe' });
    const src = cardOf(card)!;
    fx.addSource(a, { id: `card:${src.id}`, kind: 'research', effects: src.effects });
    return { fx, a, b, c };
  };

  it('Scalding Rounds scalds with gun hits only', () => {
    const { fx, a, b } = world('scaldingRounds');
    for (let i = 0; i < 40; i++) fx.strike(a, b, { type: 'pierce', amount: 1, via: 'melee' });
    expect(fx.inspect(b).statuses.scalded).toBeUndefined();
    for (let i = 0; i < 40; i++) fx.strike(a, b, { type: 'pierce', amount: 1, via: 'gun' });
    expect(fx.inspect(b).statuses.scalded).toBeDefined();
  });

  it('Acid Edge corrodes on every third melee hit', () => {
    const { fx, a, b } = world('acidEdge');
    fx.strike(a, b, { type: 'impact', amount: 1, via: 'melee' });
    fx.strike(a, b, { type: 'impact', amount: 1, via: 'melee' });
    expect(fx.inspect(b).statuses.corroded).toBeUndefined();
    fx.strike(a, b, { type: 'impact', amount: 1, via: 'melee' });
    expect(fx.inspect(b).statuses.corroded).toBeDefined();
  });

  it('Spotter\'s Rivets marks the first gun hit', () => {
    const { fx, a, b } = world('spottersRivets');
    fx.strike(a, b, { type: 'pierce', amount: 1, via: 'gun' });
    expect(fx.inspect(b).statuses.marked).toBeDefined();
  });

  it('Rust Bloom passes a dead foe\'s Corroded stacks to the next', () => {
    const { fx, a, b, c } = world('rustBloom', 30);
    fx.apply(b, 'corroded', { stacks: 3 });
    fx.strike(a, b, { type: 'impact', amount: 500, via: 'melee' });
    expect(fx.isDown(b)).toBe(true);
    expect(fx.inspect(c).statuses.corroded?.stacks).toBe(3);
  });

  it('Heat Lamp doubles a Burning foe\'s ticks near the party, and only near it', () => {
    const tick = (card: boolean, x: number) => {
      const { fx, a, b } = world(card ? 'heatLamp' : 'conductors');
      b.x = x;
      fx.apply(b, 'burning', {});
      const hp = b.hp;
      for (let i = 0; i < 20; i++) fx.tick(0.1);
      return hp - b.hp;
    };
    const plain = tick(false, 50);
    expect(plain).toBeGreaterThan(0);
    expect(tick(true, 50)).toBeCloseTo(plain * 2, 1);
    expect(tick(true, 400)).toBeCloseTo(plain, 1);
  });

  it('Conductors lets Shock chain through Wet far beyond the usual reach', () => {
    const { fx, a, b, c } = world('conductors', 1000);
    c.x = 900;
    fx.apply(b, 'wet', {});
    fx.apply(c, 'wet', {});
    fx.strike(a, b, { type: 'shock', amount: 20, via: 'gun' });
    expect(c.hp).toBeLessThan(1000);
  });

  it('Overpressure turns a heal above full into a shield', () => {
    const { fx, a } = world('overpressure');
    a.hp = 90;
    fx.heal(a, 30, a);
    expect(a.hp).toBe(100);
    expect(fx.shield(a)).toBeGreaterThan(0);
  });
});
