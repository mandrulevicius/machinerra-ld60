import { describe, expect, it } from 'vitest';
import { Sim } from './sim';
import { DEV_SOURCES, missionTitles } from './missionfx';

describe('the mission runs on the effect engine (P11)', () => {

  it('every robot and enemy is an engine unit; hits go through it (armour, plating) and heals too', () => {
    const s = new Sim(3);
    for (const b of s.bots) expect(s.engine.has(b)).toBe(true);
    const h = s.spawnHornet(0, 0);
    expect(s.engine.has(h)).toBe(true);
    const c = s.controller;
    s.addSource(c, DEV_SOURCES.armour50);
    const hp = c.hp;
    s.hurt(c, 10);
    expect(hp - c.hp).toBeCloseTo(10 / 1.5);
    expect(s.engine.heal(c, 3, c)).toBe(3);
    expect(c.hp).toBeCloseTo(hp - 10 / 1.5 + 3);
    s.removeSource(c, 'dev:armour50');
    expect(s.engine.source(c, 'dev:armour50')).toBeUndefined();
  });

  it('titles earned are sources on the Communicator and the robots; per-augment ones are added once each', () => {
    const t = missionTitles(['queenBreaker', 'shepherdOfBrass', 'patchworkSaint', 'architect'], { augment: 2 });
    expect(t.comm.map((x) => x.id)).toEqual(['title:queenBreaker', 'title:patchworkSaint', 'title:patchworkSaint#2']);
    expect(t.bots.map((x) => x.id)).toEqual(['title:shepherdOfBrass']);
    const s = new Sim(3, [], 'desert', [], undefined, undefined, { titles: ['shepherdOfBrass', 'patchworkSaint'], augments: 3 });
    const bot = s.crew[0];
    expect(s.engine.stat(bot, 'speed', 1)).toBeCloseTo(1.05);
    expect(s.engine.stat(s.controller, 'speed', 1)).toBe(1);
    expect(s.controller.maxHp).toBe(s.controller.maxHp);
    expect(s.engine.maxHp(s.controller)).toBeGreaterThan(s.engine.stat(s.controller, 'maxHp', 0) - 1);
  });

});
