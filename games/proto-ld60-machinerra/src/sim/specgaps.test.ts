import { describe, expect, it } from 'vitest';
import { T } from './defs';
import { NO_INPUT, Sim, type Bot, type Hornet } from './sim';
import type { CrewBot } from './types';
import type { SpecId } from './specs';

/** The spec rules P15 left unbuilt: the Bulwark's front armour, the Cannoneer's crashes, the Firebrand's slicks (Minos: "sure", "should be built"). */
const field = (...crew: CrewBot[]) => {
  const s = new Sim(3, [], 'desert', [], undefined, undefined, { crew });
  s.god = true;
  const c = s.controller;
  const bots = s.bots.filter((b) => b !== c);
  bots.forEach((b, i) => {
    b.x = c.x + 50 + i * 30;
    b.y = c.y + 10;
  });
  return { s, c, bots };
};
const bot = (role: CrewBot['role'], spec?: SpecId): CrewBot => ({ role, name: role, uid: role, ...(spec && { spec }) });
const run = (s: Sim, sec: number, each?: () => void) => {
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, NO_INPUT);
    s.events.length = 0;
    each?.();
  }
};
/** A foe that stays put and stings no one. */
const post = (s: Sim, x: number, y: number): Hornet => {
  const h = s.spawnHornet(x, y, 0, false, false, 'hornet');
  s.engine.apply(h, 'rooted', { duration: 9999 });
  h.cd = 9999;
  h.hp = h.maxHp = 1e6;
  return h;
};

describe('the Bulwark: front hits -50%', () => {
  /** The oil a 20-point hit costs a guard facing `face`, struck by a foe 40 px to its east. */
  const lost = (spec: SpecId | undefined, face: 1 | -1) => {
    const { s, bots: [g] } = field(bot('guard', spec));
    s.god = false;
    const foe = post(s, g.x + 40, g.y);
    g.face = face;
    const before = g.hp;
    s.hurt(g, 20, false, { by: foe, type: 'impact', via: 'melee' });
    return before - g.hp;
  };
  it('halves a hit from the side it faces, not one from behind', () => {
    const plain = lost(undefined, 1);
    expect(plain).toBeGreaterThan(0);
    expect(lost('bulwark', 1)).toBeCloseTo(plain * 0.5, 5);
    expect(lost('bulwark', -1)).toBeCloseTo(plain, 5);
    expect(lost(undefined, -1)).toBeCloseTo(plain, 5);
  });
  it('a hit with no source (a blast, a hazard) is not cut', () => {
    const { s, bots: [g] } = field(bot('guard', 'bulwark'));
    s.god = false;
    g.face = 1;
    const before = g.hp;
    s.hurt(g, 20, false, { type: 'impact' });
    const plain = field(bot('guard'));
    plain.s.god = false;
    const p = plain.bots[0];
    const pb = p.hp;
    plain.s.hurt(p, 20, false, { type: 'impact' });
    expect(before - g.hp).toBeCloseTo(pb - p.hp, 5);
  });
  it('faces the foe it fights', () => {
    const { s, c, bots: [g] } = field(bot('guard', 'bulwark'));
    const foe = post(s, c.x - 3 * T, c.y);
    foe.target = g.id;
    run(s, 3);
    expect(g.face).toBe(foe.x >= g.x ? 1 : -1);
  });
});

describe('the Firebrand: slicks that Slow, and fire that lights them', () => {
  const zones = (s: Sim, kind: string) => s.props.zones.filter((z) => z.kind === kind);
  const setup = (spec: SpecId | undefined) => {
    const { s, c, bots: [g] } = field({ ...bot('gatherer'), ...(spec && { spec }) });
    s.hornets = [];
    const foe = post(s, c.x + 130, c.y);
    s.engine.strip(foe, 'rooted');
    return { s, g, foe, keep: () => s.engine.apply(foe, 'rooted', { duration: 0.1 }) };
  };
  it('spits a coal slick at a foe near it; foes standing in it are Slowed', () => {
    const { s, foe, keep } = setup('firebrand');
    run(s, 1.5, keep);
    expect(zones(s, 'slick')).toHaveLength(1);
    const z = zones(s, 'slick')[0];
    expect(Math.hypot(z.x - foe.x, z.y - foe.y)).toBeLessThan(z.r);
    expect(s.engine.status(foe, 'slowed')).toBeTruthy();
    expect(s.engine.status(foe, 'burning')).toBeFalsy();
  });
  it('the next spit onto the slick lights it: it becomes a fire and the foe burns', () => {
    const { s, foe, keep } = setup('firebrand');
    run(s, 5, keep); // spits at 3 s intervals: the slick, then its spark
    expect(zones(s, 'slick')).toHaveLength(0);
    expect(zones(s, 'fire').length).toBeGreaterThan(0);
    expect(s.engine.status(foe, 'burning')).toBeTruthy();
  });
  it('any fire lights a slick; a plain gatherer spits nothing', () => {
    const { s, g, foe, keep } = setup('firebrand');
    run(s, 1.5, keep);
    const z = zones(s, 'slick')[0];
    s.engine.apply(foe, 'burning', { duration: 3 });
    run(s, 0.6, keep);
    expect(z.kind).toBe('fire');
    expect(g.spec).toBe('firebrand');
    const plain = setup(undefined);
    run(plain.s, 5, plain.keep);
    expect(plain.s.props.zones).toHaveLength(0);
  });
});

describe('the Cannoneer: heavy shells, and the crashes are his', () => {
  /** A guard of the spec beside the Communicator, a foe 120 px east of it and a second one close behind the first (low on oil). */
  const lineup = (spec: SpecId | undefined) => {
    const { s, c, bots: [g] } = field(bot('guard', spec));
    s.hornets = [];
    const a = post(s, c.x + 170, g.y);
    const b = post(s, a.x + 24, g.y);
    b.hp = 5;
    return { s, g, a, b };
  };
  const shellsAt = (s: Sim, g: Bot, a: Hornet) => {
    s.engine.strip(a, 'rooted');
    a.target = g.id;
    run(s, 2, () => s.engine.apply(a, 'rooted', { duration: 0.1 }));
  };
  it('a shell shoves the foe along its flight and flings it; what it crashes into dies for the Cannoneer', () => {
    const { s, g, a, b } = lineup('cannoneer');
    shellsAt(s, g, a);
    expect(b.dead).toBe(true);
    expect(s.stats.crashes).toBeGreaterThan(0);
    expect(s.stats['deed.guard.cannonKill']).toBeGreaterThanOrEqual(1);
  });
  it('a plain guard\'s shell shoves no one', () => {
    const { s, g, a, b } = lineup(undefined);
    shellsAt(s, g, a);
    expect(s.stats.crashes).toBe(0);
    expect(b.dead).toBe(false);
  });
});
