import { describe, expect, it } from 'vitest';
import { LEVEL1, T } from './defs';
import { landProblems, loadLand } from './lands';
import { NO_INPUT, Sim } from './sim';
import { rideLift, tap } from './testkit';
import { haulFrom } from '../hub/state';
import { fetchRobots, freshRoster } from '../hub/workshop';

const level1 = () => new Sim('level1', [], 'desert', [], undefined, undefined, { land: loadLand('level1'), crew: [] });
const go = (s: Sim, x: number, y: number) => {
  s.controller.x = x;
  s.controller.y = y;
};
const run = (s: Sim, sec: number) => {
  for (let t = 0; t < sec; t += 1 / 30) s.step(1 / 30, NO_INPUT);
};
const place = (s: Sim, id: string) => s.places.find((p) => p.id === id)!;

describe('level 1: the land', () => {
  it('is sound: every spot on open ground and reachable from the lift', () => {
    const m = loadLand('level1');
    expect(landProblems(m)).toEqual([]);
    expect(m).toMatchObject({ w: 64, h: 34, rules: { anomaly: 'hurried', morningSwarm: 0, duskBoss: false, guided: true } });
    expect(m.seeps).toHaveLength(1);
    expect(m.nests).toHaveLength(1);
    expect(m.places.map((p) => p.id).sort()).toEqual(['mast', 'sprocket', 'wreck']);
  });

  it('starts alone on a 240 s day with one tap, no coal seams and no dusk boss', () => {
    const s = level1();
    expect(s.seams).toHaveLength(0);
    expect(s.seeps).toHaveLength(1);
    expect(s.crew).toHaveLength(0);
    expect(s.cfg.morningSwarm).toBe(0);
    expect(s.anomaly).toBe('hurried');
    expect(s.day.at.midnight).toBeCloseTo(240, 5);
    run(s, 1);
    s.dayT = s.day.at.boss + 1;
    run(s, 1);
    expect(s.bossSpawned).toBe(false);
  });
});

describe('level 1: Bellows', () => {
  it('lies downed at his wreck with two strays; a free 3 s repair stands him up with his own core', () => {
    const s = level1();
    run(s, 0.2);
    const w = place(s, 'wreck');
    const b = w.bot!;
    expect(b.downed).toBeTruthy();
    expect(s.hornets.filter((h) => !h.dead && !h.boss && h.home)).toHaveLength(LEVEL1.strays.count);
    go(s, b.x - 20, b.y);
    s.controller.hp = s.controller.maxHp;
    tap(s);
    expect(s.action?.bot).toBe(b);
    expect(s.action?.need).toBe(LEVEL1.fix);
    s.hornets.forEach((h) => (h.hp = 0, h.dead = true));
    run(s, LEVEL1.fix + 0.5);
    expect(b.downed).toBeUndefined();
    expect(b.hp).toBeGreaterThan(0);
    expect(s.cores).toBe(1);
    run(s, 0.2);
    expect(w.state).toBe('up');
    expect(s.crew).toContain(b);
  });
});

describe('level 1: the toaster, the mast, the Foreman, Sprocket', () => {
  it('the car ruin always gives the toaster', () => {
    const s = level1();
    const car = s.ruins.find((r) => r.kind === 'car')!;
    go(s, car.x, car.y + 20);
    tap(s);
    run(s, 2);
    expect(car.searched).toBe(true);
    expect(s.junk).toEqual(['toaster']);
  });

  it('the mast decodes in 8 s, pulls the hive in, then lights the map and shows Sprocket\'s signal', () => {
    const s = level1();
    run(s, 0.2);
    expect(s.signals.some((x) => x.kind === 'pilgrim')).toBe(false);
    s.god = true; // the pulled-in hornets sting through the decode: hits do not stop it
    const m = place(s, 'mast');
    const at = m.parts.find((q) => q.kind === 'mast')!;
    go(s, at.x, at.y + 20);
    tap(s);
    expect(s.action?.need).toBe(LEVEL1.decode);
    expect(s.nests[0].awake).toBe(true);
    run(s, LEVEL1.decode + 0.5);
    expect(m.state).toBe('lit');
    expect(s.signals.some((x) => x.kind === 'pilgrim')).toBe(true);
    const hive = s.nests[0];
    expect(s.fog.at(hive.x / T - 0.5, hive.y / T - 0.5)).toBe(true);
    expect(s.insight).toBeGreaterThan(0);
  });

  it('the Foreman guards her, and once he falls her cables go slack; she is freed and rides up even left off the lift', () => {
    const s = level1();
    run(s, 0.2);
    const p = place(s, 'sprocket');
    const f = p.boss!;
    expect(f.kind).toBe('foreman');
    expect(f.twisted).toBe(false);
    expect(p.state).toBe('guarded');
    expect(s.pilgrim?.state).toBe('stuck');
    expect(s.places.find((q) => q.id === 'sprocket')!.state).toBe('guarded');
    f.hp = 0;
    s.hornets.forEach((h) => h.id === f.id && s.slay(h));
    run(s, 0.2);
    expect(p.state).toBe('pinned');
    expect(s.bossDown).toBe(false);
    expect(s.bossesDown).toEqual([]);
    const pil = s.pilgrim!;
    go(s, pil.bot.x, pil.bot.y + 20);
    tap(s);
    run(s, 3);
    expect(pil.state).toBe('follow');
    // Left off the lift, she rides anyway (a guided land).
    go(s, s.lift.x, s.lift.y);
    s.setPhase('rising');
    expect(s.rescued).toContain('sprocket');
  });
});

describe('level 1: the first can and the hand-off', () => {
  it('the first kill under 60% oil drops the guaranteed can, once', () => {
    const s = level1();
    run(s, 0.2);
    const kill = () => {
      const h = s.hornets.find((x) => !x.dead && !x.boss)!;
      s.slay(h);
    };
    s.controller.hp = s.controller.maxHp * 0.9;
    kill();
    expect(s.loot.filter((l) => l.kind === 'oil')).toHaveLength(0);
    s.controller.hp = s.controller.maxHp * 0.5;
    kill();
    expect(s.firstCan).toBe(true);
    expect(s.loot.filter((l) => l.kind === 'oil')).toHaveLength(1);
    expect(s.said.has('l1-can')).toBe(true);
  });

  it('the haul names Bellows, and the workshop has him aboard and whole whatever happened to him', () => {
    const s = level1();
    const haul = haulFrom(s, 'l1');
    expect(haul.fetched).toEqual([{ name: 'Bellows', role: 'gatherer' }]);
    const r = fetchRobots(freshRoster(), haul.fetched);
    expect(r.bots).toMatchObject([{ name: 'Bellows', role: 'gatherer', wreck: false }]);
    const left = fetchRobots({ ...r, bots: r.bots.map((b) => ({ ...b, wreck: true })) }, haul.fetched);
    expect(left.bots).toHaveLength(1);
    expect(left.bots[0].wreck).toBe(false);
    expect(haulFrom(new Sim(3), 'x').fetched).toBeUndefined();
  });
});

describe('level 1: the whole run', () => {
  it('wreck, repair, toaster, mast, Foreman, Sprocket freed, the lift: the haul carries Sprocket and Bellows, the toaster and the insight', () => {
    const s = level1();
    s.god = true;
    run(s, 0.2);
    s.hornets.forEach((h) => !h.boss && s.slay(h));
    const w = place(s, 'wreck');
    go(s, w.bot!.x - 20, w.bot!.y);
    tap(s);
    run(s, LEVEL1.fix + 0.5);
    const car = s.ruins.find((r) => r.kind === 'car')!;
    go(s, car.x, car.y + 20);
    tap(s);
    run(s, 2);
    const mast = place(s, 'mast');
    const at = mast.parts.find((q) => q.kind === 'mast')!;
    go(s, at.x, at.y + 20);
    tap(s);
    run(s, LEVEL1.decode + 0.5);
    const sp = place(s, 'sprocket');
    s.hornets.forEach((h) => h.id === sp.boss!.id && s.slay(h));
    run(s, 0.2);
    go(s, s.pilgrim!.bot.x, s.pilgrim!.bot.y + 20);
    tap(s);
    run(s, 3);
    s.dayT = s.day.at.evening + 5; // dusk
    run(s, 0.5);
    expect(s.objective).toMatch(/Walk Sprocket/);
    go(s, s.lift.x, s.lift.y);
    s.pilgrim!.bot.x = s.lift.x + 50;
    s.pilgrim!.bot.y = s.lift.y;
    rideLift(s);
    expect(s.phase).toBe('done');
    const haul = haulFrom(s, 'run');
    expect(haul.rescued).toEqual(['sprocket']);
    expect(haul.fetched).toEqual([{ name: 'Bellows', role: 'gatherer' }]);
    expect(haul.cores).toBe(1);
    expect(haul.junk).toEqual(['toaster']);
    expect(haul.insight).toBeGreaterThanOrEqual(1);
    expect(haul.bosses).toBeUndefined();
  });
});
