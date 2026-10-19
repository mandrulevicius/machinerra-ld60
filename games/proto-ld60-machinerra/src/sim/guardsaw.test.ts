import { describe, expect, it } from 'vitest';
import { cardOf } from '../hub/research';
import { sawStroke } from './combat';
import { SAW, T, WEAPON } from './defs';
import { NO_INPUT, Sim } from './sim';
import type { CrewBot } from './types';

/** A quiet morning land with the Communicator and one Guard beside him; hives asleep, the crew cannot be lost. */
const field = (spec?: CrewBot['spec']) => {
  const s = new Sim(3, [], 'desert', [], undefined, undefined, { crew: [{ role: 'guard', name: 'Rivet', uid: 'r1', ...(spec && { spec }) }] });
  s.god = true;
  const c = s.controller;
  const g = s.bots.find((b) => b !== c)!;
  s.bots = [c, g];
  g.x = c.x + 50;
  g.y = c.y + 10;
  // Let him settle at his place by the Communicator first, so a foe put beside him stays beside him (his first look round comes at a random moment).
  for (let i = 0; i < 45; i++) s.step(1 / 30, NO_INPUT);
  s.events.length = 0;
  return { s, c, g };
};
const run = (s: Sim, sec: number) => {
  const evs: Sim['events'] = [];
  for (let i = 0; i < Math.round(sec * 30); i++) {
    s.step(1 / 30, NO_INPUT);
    evs.push(...s.events);
    s.events.length = 0;
  }
  return evs;
};
/** A foe that stays where it is and hits no one. */
const post = (s: Sim, x: number, y: number, elite = false) => {
  const h = s.spawnHornet(x, y, 0, elite, false, 'hornet');
  s.engine.apply(h, 'rooted', { duration: 999 });
  h.cd = 999;
  h.hp = h.maxHp = 100000;
  return h;
};

describe("the Guard's saw", () => {
  it('saws a foe in contact (no shots) and shoots one at range', () => {
    const near = field();
    const a = post(near.s, near.g.x + 24, near.g.y);
    const evs = run(near.s, 2);
    expect(evs.filter((e) => e.e === 'saw' && e.hits > 0).length).toBeGreaterThan(2);
    expect(evs.some((e) => e.e === 'shot' && e.by === near.g)).toBe(false);
    expect(a.maxHp - a.hp).toBeGreaterThanOrEqual(SAW.dmg * 3);

    const far = field();
    const b = post(far.s, far.g.x + 6 * T, far.g.y);
    const evs2 = run(far.s, 2);
    expect(evs2.some((e) => e.e === 'shot' && e.by === far.g)).toBe(true);
    expect(evs2.some((e) => e.e === 'saw')).toBe(false);
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('goes back to the gun once the foe is off the blade', () => {
    const { s, g } = field();
    const h = post(s, g.x + 24, g.y);
    expect(run(s, 1).some((e) => e.e === 'saw')).toBe(true);
    h.x = g.x + SAW.reach + h.r + 3 * T;
    h.y = g.y;
    expect(run(s, 1.5).some((e) => e.e === 'shot' && e.by === g)).toBe(true);
  });

  it('hits come with via saw, and Saw Teeth leaves the foe Corroded', () => {
    const { s, g } = field();
    const card = cardOf('sawTeeth')!;
    expect(card.waits).toBeUndefined();
    s.engine.addSource(g, { id: 'card:sawTeeth', effects: card.effects } as never);
    const h = post(s, g.x + 24, g.y);
    const vias: (string | undefined)[] = [];
    const real = s.engine.strike.bind(s.engine);
    s.engine.strike = ((from: never, to: never, o: { via?: string }) => (vias.push(o.via), real(from, to, o as never))) as typeof s.engine.strike;
    run(s, 1.2);
    expect(vias.length).toBeGreaterThan(0);
    expect(vias.every((v) => v === 'saw')).toBe(true);
    expect(s.engine.stacks(h, 'corroded')).toBeGreaterThan(0);
  });

  it('one stroke cuts every foe in the arc', () => {
    const { s, g } = field();
    const a = post(s, g.x + 24, g.y - 4), b = post(s, g.x + 24, g.y + 4);
    const behind = post(s, g.x - 24, g.y);
    expect(sawStroke(s, g, 0)).toBe(2);
    expect(a.hp).toBeLessThan(a.maxHp);
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(behind.hp).toBe(behind.maxHp);
  });

  it('beats the gun in contact; the blade is short', () => {
    expect(SAW.dmg / SAW.rate).toBeGreaterThan(WEAPON.guard.dmg / WEAPON.guard.rate);
    expect(SAW.reach).toBeLessThan(WEAPON.guard.range / 4);
  });

  it('a Berserker rushes an elite to the blade and saws it', () => {
    const { s, c, g } = field('berserker');
    const e = post(s, c.x + 9 * T, c.y + 10, true);
    const evs = run(s, 6);
    expect(Math.hypot(g.x - e.x, g.y - e.y)).toBeLessThanOrEqual(SAW.reach + e.r);
    expect(evs.some((x) => x.e === 'saw' && x.hits > 0)).toBe(true);
  });

  it('the Bulwark and the Cannoneer saw too', () => {
    for (const spec of ['bulwark', 'cannoneer'] as const) {
      const { s, g } = field(spec);
      post(s, g.x + 24, g.y);
      expect(run(s, 1.5).some((e) => e.e === 'saw' && e.hits > 0), spec).toBe(true);
    }
  });
});
