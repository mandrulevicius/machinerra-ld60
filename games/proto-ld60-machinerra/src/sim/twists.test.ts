import { describe, expect, it } from 'vitest';
import { rng } from '../../../../harness/kit/rng';
import { BLIZZARD, COLD, COMMUTE, HOT_SPRING, RAIN, T, WEATHER } from './defs';
import { rushNow } from './commute';
import { dayCfg, dayState } from './clock';
import { NO_INPUT, Sim } from './sim';
import { blizzardSight, passing, raining, setCold, twistNow, warmAt } from './twists';
import { hotSpring, makePlace } from './placeplay';

const AT = dayState(0, dayCfg()).at;
const land = (biome: 'jungle' | 'mountains' | 'desert', seed = 7) => new Sim(seed, [], biome);
const run = (s: Sim, sec: number) => {
  for (let i = 0; i < sec * 30; i++) s.step(1 / 30, NO_INPUT);
};
/** Walk him far from the lift and his robots (none: the default crew stays at the lift). */
const alone = (s: Sim) => {
  s.cfg.edge = 0;
  s.cfg.morningSwarm = 0;
  for (const n of s.nests) n.dead = true;
  for (const b of s.crew) b.dead = true;
  s.controller.x = s.lift.x + 30 * T;
  s.controller.y = s.lift.y;
};

describe('the passing twists (P31)', () => {
  it('the rain comes once in each day phase and the blizzard once in the day, warned ahead by the source\'s seconds', () => {
    for (const seed of [1, 2, 3]) {
      const r = passing(rng(seed), RAIN, AT);
      expect(r).toHaveLength(3);
      expect(r[0].warn).toBeGreaterThanOrEqual(WEATHER.from);
      expect(r[1].on).toBeGreaterThanOrEqual(AT.day);
      expect(r[2].on).toBeGreaterThanOrEqual(AT.evening);
      for (const g of r) {
        expect(g.on - g.warn).toBe(RAIN.warn);
        expect(g.off - g.on).toBe(RAIN.hold);
      }
      const b = passing(rng(seed), BLIZZARD, AT);
      expect(b).toHaveLength(1);
      expect(b[0].on - b[0].warn).toBe(BLIZZARD.warn);
      expect(b[0].on).toBeGreaterThanOrEqual(AT.day);
    }
  });

  it('only the jungle rains, only the Frostspine snows and freezes; not down a dungeon', () => {
    expect(land('jungle').twists.rain).toHaveLength(3);
    expect(land('jungle').twists.blizzard).toHaveLength(0);
    expect(land('mountains').twists.blizzard).toHaveLength(1);
    expect(land('mountains').twists.cold.on).toBe(true);
    expect(land('desert').twists.rain).toHaveLength(0);
    expect(land('desert').twists.cold.on).toBe(false);
  });

  it('in the rain everything is Wet, ours and theirs; before it nothing is', () => {
    const s = land('jungle');
    const h = s.spawnHornet(s.lift.x + 20 * T, s.lift.y, 0, false, false, 'cat');
    expect(twistNow(s, 'rain')).toBe(true);
    run(s, RAIN.warn - 1);
    expect(raining(s)).toBe(false);
    expect(s.engine.stacks(s.controller, 'wet')).toBe(0);
    run(s, 1 + WEATHER.ease);
    expect(raining(s)).toBe(true);
    expect(s.engine.stacks(s.controller, 'wet')).toBe(1);
    expect(s.engine.stacks(h, 'wet')).toBe(1);
  });

  it('the blizzard eases his sight down to the source\'s tiles', () => {
    const s = land('mountains');
    expect(blizzardSight(s)).toBe(1);
    twistNow(s, 'blizzard');
    run(s, BLIZZARD.warn + WEATHER.ease + 1);
    expect(blizzardSight(s)).toBeCloseTo(BLIZZARD.tiles / 10);
    expect(s.sightMul).toBeCloseTo(BLIZZARD.tiles / 10);
  });
});

describe('the cold (P31, D22)', () => {
  it('out of warmth a Chilled stack every 20 s, never past two, so the cold alone never freezes him', () => {
    const s = land('mountains');
    alone(s);
    run(s, COLD.every - 1);
    expect(s.engine.stacks(s.controller, 'chilled')).toBe(0);
    run(s, 2);
    expect(s.engine.stacks(s.controller, 'chilled')).toBe(1);
    run(s, COLD.every * 3);
    expect(s.engine.stacks(s.controller, 'chilled')).toBe(COLD.cap);
    expect(s.engine.stacks(s.controller, 'frozen')).toBe(0);
  });

  it('a foe\'s Cold hit on top of the cold freezes him', () => {
    const s = land('mountains');
    alone(s);
    setCold(s, 2);
    s.engine.apply(s.controller, 'chilled');
    expect(s.engine.stacks(s.controller, 'frozen')).toBe(1);
  });

  it('the lift, a robot\'s lamp and a fire warm him; his own lamp does not; warmth clears the Chill', () => {
    const s = land('mountains');
    expect(warmAt(s, s.lift.x, s.lift.y)).toBe(true);
    alone(s);
    const c = s.controller;
    expect(warmAt(s, c.x, c.y)).toBe(false);
    setCold(s, 2);
    s.twists.cold.warm = false;
    expect(s.engine.stacks(c, 'chilled')).toBe(2);
    s.addBot('guard', 'Warm', c.x + COLD.lamp - 10, c.y, 0);
    expect(warmAt(s, c.x, c.y)).toBe(true);
    run(s, 1);
    expect(s.engine.stacks(c, 'chilled')).toBe(0);
  });
});

describe('the Hot Spring (P31)', () => {
  it('standing in it clears Chill and heals a little a second, and it is warm', () => {
    const s = land('mountains');
    alone(s);
    const c = s.controller;
    const tx = Math.floor(c.x / T), ty = Math.floor(c.y / T);
    const p = makePlace(s, 'spring', tx, ty, [{ kind: 'pool', x: tx, y: ty }]);
    s.places.push(p);
    expect(warmAt(s, p.x, p.y)).toBe(true);
    c.x = p.x;
    c.y = p.y;
    setCold(s, 2);
    c.hp = c.maxHp - 10;
    const hp = c.hp;
    for (let i = 0; i < 30; i++) hotSpring(s, p, 1 / 30);
    expect(s.engine.stacks(c, 'chilled')).toBe(0);
    expect(c.hp).toBeCloseTo(hp + HOT_SPRING.heal, 1);
    expect(p.state).toBe('calm');
  });
});

describe('the commute (P31)', () => {
  const city = () => {
    const s = new Sim(7, [], 'city');
    s.cfg.edge = 0;
    s.cfg.morningSwarm = 0;
    for (const n of s.nests) n.dead = true;
    for (const b of s.crew) b.dead = true;
    return s;
  };

  it('two rush hours, at the start of the day and of the evening; only in the city', () => {
    const s = city();
    expect(s.rush.map((r) => r.at)).toEqual([s.day.at.day, s.day.at.evening]);
    expect(land('jungle').rush).toHaveLength(0);
  });

  it('a crowd walks calm across the city; a bump turns it and its crowd near it on whoever bumped', () => {
    const s = city();
    const R = rushNow(s);
    expect(R.crowd).toHaveLength(COMMUTE.crowd);
    expect(R.crowd.every((h) => h.calm && h.kind === 'commuter')).toBe(true);
    const h = R.crowd[0];
    s.controller.x = h.x;
    s.controller.y = h.y;
    run(s, 0.1);
    expect(h.calm).toBeUndefined();
    expect(h.target).toBe(s.controller.id);
    expect(R.crowd.filter((o) => !o.calm).length).toBeGreaterThan(1);
  });

  it('a walker at the far end leaves the land', () => {
    const s = city();
    const R = rushNow(s);
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    const h = R.crowd.find((o) => o.calm)!;
    h.x = h.calm!.x;
    h.y = h.calm!.y;
    run(s, 0.1);
    expect(h.dead).toBe(true);
  });
});
