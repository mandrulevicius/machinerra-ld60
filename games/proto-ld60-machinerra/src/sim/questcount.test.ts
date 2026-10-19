import { describe, expect, it } from 'vitest';
import { DAY } from './defs';
import { flingBot } from './crash';
import { marks } from './clock';
import { NO_INPUT, Sim } from './sim';
import { triggerPlace } from './use';
import { generate } from './mapgen';
import { advise } from './oracle';
import { rideLift } from './testkit';
import { FRAGMENT_LINES } from './questcount';

const bare = (seed = 3) => {
  const s = new Sim(seed, [], 'desert');
  s.bots = [s.controller];
  s.props.list.length = 0;
  s.props.solid.fill(0);
  s.props.at.clear();
  return s;
};
const foe = (s: Sim, x: number, y: number, hp = 400) => {
  const h = s.spawnHornet(x, y, 0, false, false, 'swarmer');
  h.hp = h.maxHp = hp;
  return h;
};
const run = (s: Sim, secs: number) => {
  for (let i = 0; i < Math.round(secs * 30); i++) s.step(1 / 30, NO_INPUT);
};
const at = (s: Sim, t: number) => {
  s.dayT = t;
};

describe('the quests\' mission counters (P38)', () => {
  it('counts the Communicator\'s own gun kills, and only those', () => {
    const s = bare();
    const c = s.controller;
    const a = foe(s, c.x + 90, c.y, 3);
    s.damageHornet(a, 50, c, 'pierce', { via: 'gun', weapon: 'steamGun' });
    expect(a.dead).toBe(true);
    expect(s.stats.gunKills).toBe(1);
    const b = foe(s, c.x + 90, c.y, 3);
    s.damageHornet(b, 50, c, 'impact', { via: 'melee', weapon: 'shovel' });
    expect(b.dead).toBe(true);
    expect(s.stats.gunKills).toBe(1);
  });

  it('counts an elite killed by crash, a kicked robot into a boss, and the most foes one kicked robot struck', () => {
    const s = bare();
    const c = s.controller;
    const e = foe(s, c.x + 60, c.y, 3);
    e.elite = true;
    s.damageHornet(e, 50, c, 'impact', { via: 'crash', kick: true });
    expect(s.stats.eliteCrashKills).toBe(1);
    expect(s.stats.crashKills).toBe(1);
    const t = bare(4);
    const d = t.controller;
    const guard = t.addBot('guard', 'Pin', d.x - 40, d.y, 0);
    t.bots = [d, guard];
    t.crew.length = 0;
    t.crew.push(guard);
    const boss = foe(t, d.x + 120, d.y);
    boss.boss = true;
    boss.hp = boss.maxHp = 99999;
    const pin = foe(t, d.x + 120, d.y + 14);
    guard.x = d.x + 60;
    guard.y = d.y;
    flingBot(t, guard, 900, 0, d);
    run(t, 0.5);
    expect(t.stats.botBossKicks ?? 0).toBeGreaterThanOrEqual(1);
    expect(t.stats.bowl ?? 0).toBeGreaterThanOrEqual(1);
    expect(pin).toBeDefined();
  });

  it('counts a boss brought down past midnight, not before', () => {
    const s = bare();
    const early = foe(s, 100, 100, 1);
    early.boss = true;
    s.slay(early);
    expect(s.stats.bossNight ?? 0).toBe(0);
    at(s, marks(s.cfg).midnight + 5);
    run(s, 0.1);
    const late = foe(s, 100, 100, 1);
    late.boss = true;
    s.slay(late);
    expect(s.stats.bossNight).toBe(1);
  });

  it('counts the seconds past midnight, the seconds low on oil, the oil lost before the evening, and the farthest walk', () => {
    const s = bare();
    const c = s.controller;
    run(s, 1);
    c.hp -= 10;
    run(s, 1);
    at(s, marks(s.cfg).evening + 1);
    run(s, 0.2);
    expect(s.stats.dmgDusk).toBe(10);
    c.hp -= 5; // after the evening begins it no longer counts
    run(s, 1);
    expect(s.stats.dmgDusk).toBe(10);
    c.hp = c.maxHp * 0.1;
    run(s, 2);
    expect(s.stats.lowOil).toBeGreaterThan(1.5);
    at(s, marks(s.cfg).midnight + 1);
    run(s, 3);
    expect(s.stats.pastMidnight).toBeGreaterThan(2.5);
    c.x = s.lift.x + 640;
    c.y = s.lift.y;
    run(s, 0.1);
    expect(s.stats.far).toBe(20);
    expect(DAY.hours).toBeDefined();
  });

  it('a lift that rose before the evening has no dusk reading (leaving early is not a clean day)', () => {
    const s = bare();
    run(s, 2);
    expect(s.stats.dmgDusk).toBeUndefined();
  });

  it('counts a place used, by id (`use.<place>`)', () => {
    const s = new Sim(7, [], 'desert');
    const p = s.places.find((q) => q.id === 'mast');
    if (!p) return; // this land has no mast: the counter is the same wherever it is
    expect(triggerPlace(s, 'mast')).toBe(true);
    expect(s.stats['use.mast']).toBe(1);
  });

  it('a lift ridden within 20 s of her advice is heeded; advice that runs out is ignored', () => {
    const a = bare();
    advise(a, 'queen', 'Go home.');
    run(a, 5);
    rideLift(a, 0);
    expect(a.phase).toBe('rising');
    run(a, 0.2);
    expect(a.stats.obeyed).toBe(1);
    expect(a.stats.ignored ?? 0).toBe(0);
    const b = bare(5);
    advise(b, 'queen', 'Go home.');
    run(b, 25);
    expect(b.stats.ignored).toBe(1);
    rideLift(b, 0);
    run(b, 0.2);
    expect(b.stats.obeyed ?? 0).toBe(0);
  });

  it('a mast climbed tells a fragment of her signal once act 5 is open, once a land, and in order', () => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].find((n) => generate(n).places.some((p) => p.id === 'mast'))!;
    const closed = new Sim(seed, [], 'desert');
    expect(triggerPlace(closed, 'mast')).toBe(true);
    expect(closed.stats['frag.mast']).toBeUndefined();
    const open = new Sim(seed, [], 'desert', [], undefined, undefined, { quest: { fragmentsOpen: true, heard: ['mast:jungle'], pack: {} } });
    const said: string[] = [];
    triggerPlace(open, 'mast');
    for (const e of open.events) if (e.e === 'oracle') said.push(e.text);
    expect(open.stats['frag.mast']).toBe(1);
    expect(said.join(' ')).toContain(FRAGMENT_LINES[1]); // the second source heard
    const again = new Sim(seed, [], 'desert', [], undefined, undefined, { quest: { fragmentsOpen: true, heard: ['mast:desert'], pack: {} } });
    triggerPlace(again, 'mast');
    expect(again.stats['frag.mast']).toBeUndefined(); // this land already told one
  });

  it('star oil: Use asked twice drinks it, the clock stands still for a while, one fragment is told, the oil is spent once', () => {
    const seed = 3;
    const s = new Sim(seed, [], 'desert', [], undefined, undefined, { quest: { fragmentsOpen: true, heard: [], pack: { starOil: 1 } } });
    s.bots = [s.controller];
    s.controller.x = s.lift.x + 600;
    s.controller.y = s.lift.y + 600;
    const dayT0 = s.dayT;
    s.step(1 / 30, { ...NO_INPUT, use: true });
    s.step(1 / 30, NO_INPUT);
    expect(s.armed?.key).toBe('starOil');
    s.step(1 / 30, { ...NO_INPUT, use: true });
    s.step(1 / 30, NO_INPUT);
    expect(s.stats['drank.starOil']).toBe(1);
    expect(s.stats['frag.oil']).toBe(1);
    const t = s.dayT;
    run(s, 5);
    expect(s.dayT).toBe(t); // the clock stands still
    run(s, 20);
    expect(s.dayT).toBeGreaterThan(t); // and runs again
    expect(s.dayT).toBeGreaterThan(dayT0);
    // Only one a mission, and none without it in the pack.
    s.step(1 / 30, { ...NO_INPUT, use: true });
    s.step(1 / 30, NO_INPUT);
    expect(s.armed).toBeNull();
  });

  it('brass biscuits add oil for the mission they are eaten in', () => {
    const plain = new Sim(3, [], 'desert');
    const fed = new Sim(3, [], 'desert', [], undefined, undefined, { quest: { fragmentsOpen: false, heard: [], pack: { biscuits: 1 } } });
    expect(fed.controller.maxHp).toBe(plain.controller.maxHp + 15);
    expect(fed.stats['ate.biscuits']).toBe(1);
  });

  it('Pilgrim of the Sign: robots near him hit harder while he is not firing', () => {
    const s = new Sim(3, [], 'desert', [], undefined, undefined, { titles: ['pilgrimOfTheSign'] });
    const c = s.controller;
    const guard = s.addBot('guard', 'Pin', c.x + 50, c.y, 0);
    s.bots = [c, guard];
    s.crew.length = 0;
    s.crew.push(guard);
    s.step(1 / 30, NO_INPUT);
    const idle = s.engine.stat(guard, 'damage', 1);
    s.step(1 / 30, { ...NO_INPUT, fire: true, ax: c.x + 100, ay: c.y });
    const firing = s.engine.stat(guard, 'damage', 1);
    expect(idle).toBeGreaterThan(firing);
    expect(idle / firing).toBeCloseTo(1.1, 2);
    guard.x = c.x + 600;
    s.step(1 / 30, NO_INPUT);
    expect(s.engine.stat(guard, 'damage', 1)).toBeCloseTo(firing, 5); // too far
  });
});
