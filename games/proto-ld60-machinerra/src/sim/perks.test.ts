import { crashMul } from './crash';
import { describe, expect, it } from 'vitest';
import { NO_INPUT, Sim } from './sim';
import { SUPPORT } from './defs';

describe('the quest lines\' perks', () => {

  it('a kick kill is a kill by crash damage from a kick: the kick own damage and a shovel finish after it are not', () => {
    const s = new Sim(3, [], 'desert', ['kick']);
    const c = s.controller;
    s.bots = [c];
    const kicked = s.spawnHornet(c.x + 30, c.y, 0, false, false, 'swarmer'); // a hornet resists the shovel's Impact; a swarmer does not
    s.step(1 / 30, { ...NO_INPUT, ax: c.x + 100, ay: c.y, kick: true });
    for (let i = 0; i < 60 && !kicked.dead; i++) s.step(1 / 30, { ...NO_INPUT, ax: kicked.x, ay: kicked.y, fire: true });
    expect(kicked.dead).toBe(true);
    expect(s.stats.kickKills).toBe(0); // the kick did not kill it
    const fragile = s.spawnHornet(c.x + 30, c.y, 0, false, false, 'swarmer');
    fragile.hp = 1;
    s.kickCd = 0;
    s.step(1 / 30, { ...NO_INPUT, ax: fragile.x, ay: fragile.y, kick: true });
    expect(fragile.hp).toBe(1); // the kick itself does no damage (Minos)
    expect(s.stats.kickKills).toBe(0);
  });


  it('the Iron Toe doubles crash damage (Minos)', () => {
    expect(crashMul(new Sim(3, [], 'desert', ['ironToe']))).toBeCloseTo(2 * crashMul(new Sim(3)));
  });

  it('set a mission up: one more barrage, and not a can more (cans are lives: no perk mints one)', () => {
    const plain = new Sim(3);
    const s = new Sim(3, [], 'desert', ['extraShells', 'goodOil']);
    expect(s.reserve).toBe(plain.reserve);
    expect(s.support.barrage).toBe(SUPPORT.barrage.charges + 1);
  });
});
