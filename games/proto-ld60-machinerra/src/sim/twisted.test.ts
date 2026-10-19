/**
 * P13: the twisted forms' own effects, the breaks of elites and bosses, the twisted parts, and what the menace levels switch on.
 * Each as `systems.md` ("Built kinds", "Day curve", "Damage states") says.
 */
import { describe, expect, it } from 'vitest';
import { BERSERK, BREAK, BREAKS, FOES, GENERIC_BREAKS, MENACE, PARTS, T, TWISTED_PART, TWIST_FX, type Enemy } from './defs';
import { NO_INPUT, Sim, type Hornet, type Shot, type SimEvent } from './sim';
import { blowType, boltSpeed, breakable, dashCount, eliteChance, foeDash, landed, traitCount } from './tiers';
import { huntCue } from './dayplay';

const alone = (tier = 1) => {
  const s = new Sim(5, [], 'desert', [], undefined, undefined, { tier });
  s.bots = [s.controller];
  s.cfg.swarm = 0;
  s.controller.hp = s.controller.maxHp = 1e6; // not god mode: that makes his own blows land on nothing
  return s;
};
const step = (s: Sim, secs: number) => {
  for (let i = 0; i < secs * 30; i++) s.step(1 / 30, NO_INPUT);
};
/** Step until `done` or `secs` pass. */
const until = (s: Sim, done: () => boolean, secs = 12) => {
  for (let t = 0; !done() && t < secs; t += 1 / 30) s.step(1 / 30, NO_INPUT);
  return done();
};
/** An enemy east of the Communicator hunting him; an elite with no traits (a Carapace would blunt the blows these tests deal). */
const near = (s: Sim, kind: Enemy, o: { elite?: boolean; twisted?: boolean; tiles?: number } = {}) => {
  const c = s.controller;
  const h = s.spawnHornet(c.x + (o.tiles ?? 6) * T, c.y, 0, !!o.elite, !!o.twisted, kind, { traits: [] });
  h.target = c.id;
  return h;
};
const parts = (s: Sim) => s.loot.filter((l) => l.kind === 'part').map((l) => l.part!);
const breaksSeen = (s: Sim) => s.events.filter((e): e is Extract<SimEvent, { e: 'break' }> => e.e === 'break');
const hit = (s: Sim, h: Hornet, hp: number) => {
  h.hp = h.maxHp * hp + 1;
  s.damageHornet(h, 2, s.controller, 'impact');
};

describe('twisted effects', () => {
  it('a twisted hornet\'s dash lays a Dark streak, and a robot crossing it gets Dread', () => {
    const s = alone();
    const h = near(s, 'hornet', { twisted: true, tiles: 9 }); // far enough that its dash starts before it arrives
    expect(until(s, () => s.tiers.patches.some((p) => p.kind === 'streak'))).toBe(true);
    const p = s.tiers.patches.find((q) => q.kind === 'streak')!;
    expect(p.x2).toBeDefined();
    expect(s.engine.status(s.controller, 'dread')).toBeFalsy();
    const c = s.controller;
    c.x = (p.x + (p.x2 ?? p.x)) / 2;
    c.y = (p.y + (p.y2 ?? p.y)) / 2;
    step(s, 0.1);
    expect(s.engine.status(c, 'dread')).toBeTruthy();
    void h;
  });

  it('a plain hornet\'s dash lays nothing', () => {
    const s = alone(2); // tier II: the Dive is a dash too
    near(s, 'hornet');
    step(s, 8);
    expect(s.tiers.patches.some((p) => p.kind === 'streak')).toBe(false);
  });

  it('a twisted Crawlcam\'s cable Scalds; a plain one\'s does not', () => {
    const s = alone();
    const tw = near(s, 'spider', { twisted: true }), pl = near(s, 'spider');
    const web = (h: Hornet) => s.foeShot({ x: h.x, y: h.y, vx: 300, vy: 0, dmg: 0, life: 1, big: false, by: h.id, web: true });
    expect(web(tw).status).toBe(TWIST_FX.scald);
    expect(web(pl).status).toBeUndefined();
  });

  it('a twisted rattler\'s strike leaves an acid pool that Corrodes a robot in it', () => {
    const s = alone();
    near(s, 'snake', { twisted: true, tiles: 3 });
    expect(until(s, () => s.tiers.patches.some((p) => p.kind === 'pool'))).toBe(true);
    const p = s.tiers.patches.find((q) => q.kind === 'pool')!;
    const c = s.controller;
    c.x = p.x;
    c.y = p.y;
    step(s, TWIST_FX.pool.arm + 0.2);
    expect(s.engine.status(c, 'corroded')).toBeTruthy();
  });

  it('a twisted swarmer\'s hits Haste it and heal it by a fifth of what they dealt', () => {
    const s = alone();
    const h = near(s, 'swarmer', { twisted: true, tiles: 1 });
    h.hp = h.maxHp / 2;
    const before = h.hp, oil = s.controller.hp;
    s.foeHit(h, s.controller, 20);
    const dealt = oil - s.controller.hp;
    expect(dealt).toBeGreaterThan(0);
    expect(h.hp - before).toBeCloseTo(dealt * TWIST_FX.swarmer.heal, 3);
    expect(s.engine.status(h, 'haste')).toBeTruthy();
    // a plain one does neither
    const p = near(s, 'swarmer', { tiles: 1 });
    p.hp = p.maxHp / 2;
    s.foeHit(p, s.controller, 20);
    expect(p.hp).toBe(p.maxHp / 2);
    expect(s.engine.status(p, 'haste')).toBeFalsy();
  });

  it('a twisted drone\'s bolts split in three at the end of their flight; a plain one\'s do not', () => {
    const s = alone();
    const tw = near(s, 'drone', { twisted: true });
    const spit = () => s.events.find((e): e is Extract<SimEvent, { e: 'spit' }> => e.e === 'spit' && e.h === tw);
    expect(until(s, () => !!spit(), 8)).toBe(true);
    expect(spit()!.s.split).toBe(true);
    const bolt: Shot = { id: 999, x: s.controller.x + 800, y: s.controller.y, vx: 250, vy: 0, dmg: 10, life: 0, dead: true, big: false, by: tw.id, foe: true, split: true };
    const was = s.shots.length;
    landed(s, bolt);
    const kids = s.shots.slice(was);
    expect(kids).toHaveLength(TWIST_FX.split.count);
    expect(kids.every((k) => k.foe && !k.split && Math.abs(k.dmg - 10 * TWIST_FX.split.dmg) < 1e-9)).toBe(true);
    // one that hit a robot (life left) does not split
    const n = s.shots.length;
    landed(s, { ...bolt, life: 0.4 });
    expect(s.shots.length).toBe(n);
    const pl = near(s, 'drone');
    s.events.length = 0;
    expect(until(s, () => s.events.some((e) => e.e === 'spit' && e.h === pl), 8)).toBe(true);
    expect(s.events.find((e): e is Extract<SimEvent, { e: 'spit' }> => e.e === 'spit' && e.h === pl)!.s.split).toBeUndefined();
  });
});

describe('twisted parts', () => {
  const kinds = Object.keys(TWISTED_PART) as Enemy[];

  it('every twisted part is flagged, comes from its kind, and the five built kinds have one', () => {
    expect(kinds.sort()).toEqual(['drone', 'hornet', 'snake', 'spider', 'swarmer']);
    for (const k of kinds) {
      expect(PARTS[TWISTED_PART[k]!].twisted).toBe(true);
      expect(PARTS[TWISTED_PART[k]!].from).toBe(k);
    }
    expect(Object.values(PARTS).filter((p) => p.twisted)).toHaveLength(kinds.length);
  });

  it.each(kinds)('twisted %s kills drop its twisted part, never the day\'s; plain kills never do', (kind) => {
    const s = alone();
    s.cfg.lootChance = 1;
    for (let i = 0; i < 60; i++) s.slay(near(s, kind, { twisted: true }));
    const got = parts(s);
    expect(got.length).toBeGreaterThan(5);
    expect(got.every((p) => p === TWISTED_PART[kind])).toBe(true);
    s.loot.length = 0;
    for (let i = 0; i < 60; i++) s.slay(near(s, kind));
    expect(parts(s).length).toBeGreaterThan(5);
    expect(parts(s).includes(TWISTED_PART[kind]!)).toBe(false);
  });

  it('a twisted elite drops its twisted part besides its own', () => {
    const s = alone();
    const h = near(s, 'hornet', { elite: true, twisted: true });
    s.slay(h);
    expect(parts(s)).toContain('twisted-coil');
    expect(parts(s).length).toBeGreaterThanOrEqual(2);
    s.loot.length = 0;
    s.slay(near(s, 'hornet', { elite: true }));
    expect(parts(s)).not.toContain('twisted-coil');
  });
});

describe('damage states', () => {
  it('an elite breaks at 66% and 33% of its oil: behaviour, a part on the spot, a break event', () => {
    const s = alone();
    const h = near(s, 'hornet', { elite: true, twisted: true });
    expect(breakable(h)).toBe(true);
    expect(foeDash(h)).toBeDefined();
    const before = parts(s).length;
    hit(s, h, 0.7);
    expect(h.breaks ?? []).toEqual([]);
    hit(s, h, 0.65);
    expect(h.breaks).toEqual(['noDash']);
    expect(foeDash(h)).toBeUndefined();
    expect(parts(s).length).toBe(before + 1);
    expect(breaksSeen(s).map((e) => [e.n, e.what])).toEqual([[1, 'noDash']]);
    expect(breaksSeen(s)[0].part).toBe(parts(s)[before]);
    hit(s, h, 0.3);
    expect(h.breaks).toEqual(['noDash', 'halfDmg']);
    expect(parts(s).length).toBe(before + 2);
    expect(s.berserk(h).dmg).toBeCloseTo(0.5 * s.berserk({ ...h, breaks: undefined }).dmg);
    hit(s, h, 0.1); // no third
    expect(breaksSeen(s)).toHaveLength(2);
  });

  it('one blow through both thresholds breaks twice', () => {
    const s = alone();
    const h = near(s, 'swarmer', { elite: true });
    h.hp = h.maxHp;
    s.damageHornet(h, h.maxHp * 0.75, s.controller, 'impact');
    expect(h.dead).toBe(false);
    expect(h.hp / h.maxHp).toBeLessThan(BREAK.at[1]);
    expect(h.breaks).toEqual(['grounded', 'halfDmg']);
    expect(breaksSeen(s).map((e) => e.n)).toEqual([1, 2]);
  });

  it('a plain enemy never breaks, and a kill is not a break', () => {
    const s = alone();
    const h = near(s, 'hornet');
    expect(breakable(h)).toBe(false);
    hit(s, h, 0.5);
    expect(h.breaks).toBeUndefined();
    const e = near(s, 'hornet', { elite: true });
    s.damageHornet(e, e.maxHp * 5, s.controller, 'impact');
    expect(e.dead).toBe(true);
    expect(e.breaks).toBeUndefined();
    expect(breaksSeen(s)).toHaveLength(0);
  });

  it('every built kind has two breaks that do what the table says', () => {
    for (const k of ['hornet', 'spider', 'snake', 'swarmer', 'drone'] as Enemy[]) expect(BREAKS[k]).toHaveLength(2);
    const s = alone();
    // spider: legs lost, no pounce; lens cracked, half the cables miss
    const sp = near(s, 'spider', { elite: true, twisted: true });
    expect(sp.spider!.pounceT).not.toBe(Infinity);
    hit(s, sp, 0.6);
    expect(sp.breaks).toEqual(['noPounce']);
    expect(sp.spider!.pounceT).toBe(Infinity);
    hit(s, sp, 0.3);
    expect(sp.breaks).toEqual(['noPounce', 'webMiss']);
    let missed = 0;
    for (let i = 0; i < 200; i++) {
      const w = s.foeShot({ x: sp.x, y: sp.y, vx: 300, vy: 0, dmg: 0, life: 1, big: false, by: sp.id, web: true });
      if (Math.abs(w.vy) > 1) missed++;
    }
    expect(missed).toBeGreaterThan(60);
    expect(missed).toBeLessThan(140);
    // rattler: tail cut, no lunge; fangs snapped, no acid (its blows are plain)
    const sn = near(s, 'snake', { elite: true });
    expect(foeDash(sn)).toBeDefined();
    expect(blowType(sn)).toBe(FOES.snake.type);
    hit(s, sn, 0.6);
    expect(foeDash(sn)).toBeUndefined();
    hit(s, sn, 0.3);
    expect(blowType(sn)).toBeUndefined();
    // swarmer: wing cut, slower; scythe snapped, half the damage
    const sw = near(s, 'swarmer', { elite: true });
    const sp0 = s.berserk(sw).speed, dm0 = s.berserk(sw).dmg;
    hit(s, sw, 0.6);
    expect(s.berserk(sw).speed).toBeLessThan(sp0);
    expect(s.berserk(sw).dmg).toBe(dm0);
    hit(s, sw, 0.3);
    expect(s.berserk(sw).dmg).toBeCloseTo(dm0 * 0.5);
    // drone: track broken, it closes in instead of keeping its distance; cannon cracked, slower bolts
    const dr = near(s, 'drone', { elite: true, tiles: 2.3 });
    const closing = (h: Hornet) => {
      const c = s.controller, d = Math.hypot(c.x - h.x, c.y - h.y);
      return (h.vx * (c.x - h.x) + h.vy * (c.y - h.y)) / d;
    };
    step(s, 0.6);
    expect(closing(dr)).toBeLessThan(0); // it backs off from 2.3 tiles
    hit(s, dr, 0.6);
    expect(dr.breaks).toEqual(['noKeep']);
    step(s, 1);
    expect(closing(dr)).toBeGreaterThan(0);
    expect(boltSpeed(dr)).toBe(1);
    hit(s, dr, 0.3);
    expect(boltSpeed(dr)).toBe(BREAK.slowBolt);
  });

  it('a boss with no second form breaks like an elite (its own pair, else the generic one); one with a form has the form as its one break, with a part', () => {
    const s = alone();
    const q = s.spawnBoss('hornet');
    expect(breakable(q)).toBe(true);
    const before = parts(s).length;
    hit(s, q, 0.6);
    hit(s, q, 0.3);
    expect(q.breaks).toEqual(['wingTorn', 'broodBurst']); // the queen's own (P22; the three bosses' are in content.test.ts)
    expect(parts(s).length).toBe(before + 2);
    const f = alone();
    const fm = f.spawnBoss('foreman'); // a mini-boss with none of its own
    hit(f, fm, 0.6);
    hit(f, fm, 0.3);
    expect(fm.breaks).toEqual(GENERIC_BREAKS.map((b) => b.id));
    expect(f.berserk(fm).speed).toBeLessThan(f.bzNow.speed);
    const g = alone();
    const boss = g.spawnBoss('gorilla');
    expect(breakable(boss)).toBe(false);
    const n = parts(g).length;
    hit(g, boss, 0.6); // 66% does nothing to a boss with a form
    hit(g, boss, 0.3); // it is not the form's change yet (the form needs a step)
    expect(breaksSeen(g).filter((e) => e.what !== 'form')).toHaveLength(0);
    expect(until(g, () => boss.phase === 2, 10)).toBe(true);
    expect(boss.breaks).toEqual(['form']);
    expect(breaksSeen(g).map((e) => [e.n, e.what])).toEqual([[1, 'form']]);
    expect(parts(g).length).toBe(n + 1);
    hit(g, boss, 0.2);
    expect(breaksSeen(g)).toHaveLength(1);
  });
});

describe('menace levels', () => {
  const at = (s: Sim, level: number) => s.setClock(s.day.at.midnight + level * BERSERK.perLevel * s.cfg.stepEvery);

  it('level 2: twisted dashes chain twice, and only then', () => {
    const s = alone();
    const tw = near(s, 'hornet', { twisted: true }), pl = near(s, 'snake');
    for (const [lv, want] of [[0, 1], [1, 1], [2, 2], [4, 2], [5, 2]]) expect(dashCount(tw, lv)).toBe(want);
    expect(dashCount(pl, 5)).toBe(1); // a plain lunge never chains
    const twin = near(s, 'swarmer', { twisted: true });
    twin.traits = ['twinBlade'];
    expect(dashCount(twin, 2)).toBe(3);
    // in play: a twisted hornet dashes twice from level 2
    at(s, 2);
    s.cfg.hornetSpeed *= 0;
    const dashes = () => s.events.filter((e) => e.e === 'dash' && e.h === tw).length;
    s.events.length = 0;
    const seen: number[] = [];
    for (let i = 0; i < 12 * 30; i++) {
      s.step(1 / 30, NO_INPUT);
      seen.push(dashes());
      if (seen[seen.length - 1] >= 1) break;
    }
    step(s, 0.8);
    expect(dashes()).toBe(2);
  });

  it('level 3: elites twice as likely; level 4: two traits', () => {
    const s = alone();
    at(s, 2);
    expect(eliteChance(s)).toBe(s.cfg.eliteChance);
    at(s, 3);
    expect(eliteChance(s)).toBe(s.cfg.eliteChance * 2);
    expect(traitCount(s)).toBe(1);
    at(s, 4);
    expect(traitCount(s)).toBe(2);
    const h = s.spawnHornet(s.controller.x + 400, s.controller.y, 0, true, false, 'hornet');
    expect(h.traits).toHaveLength(2);
    const s1 = alone();
    at(s1, 3);
    expect(s1.spawnHornet(s1.controller.x + 400, s1.controller.y, 0, true, false, 'hornet').traits).toHaveLength(1);
  });

  it('level 5: a hunter pack of three twisted elites at the Communicator every minute, announced 5 s ahead; nothing before', () => {
    const s = alone();
    s.god = true; // the hives wake at midnight, and a downed Communicator moves the clock
    at(s, 4);
    step(s, 20);
    expect(s.events.some((e) => e.e === 'hunt')).toBe(false);
    expect(huntCue(s)).toBeNull();
    s.events.length = 0;
    at(s, 5);
    step(s, 0.1);
    const warn = s.events.find((e): e is Extract<SimEvent, { e: 'hunt' }> => e.e === 'hunt');
    expect(warn?.what).toBe('warn');
    expect(s.said.has('hunt-1')).toBe(true);
    expect(huntCue(s)).not.toBeNull(); // the edge arrow points at it
    expect(s.events.some((e) => e.e === 'hunt' && e.what === 'come')).toBe(false);
    step(s, MENACE.pack.warn - 0.5);
    expect(s.events.some((e) => e.e === 'hunt' && e.what === 'come')).toBe(false);
    s.events.length = 0;
    expect(until(s, () => s.events.some((e) => e.e === 'hunt'), 2)).toBe(true);
    const come = s.events.find((e): e is Extract<SimEvent, { e: 'hunt' }> => e.e === 'hunt')!;
    expect(come.what).toBe('come');
    expect(huntCue(s)).toBeNull();
    // three twisted elites came out in that step (not a hive's or an arrival's), `away` from the Communicator
    const pack = s.events.flatMap((e) => (e.e === 'spawn' && e.h.elite && e.h.twisted && !e.h.rim && !e.h.nest ? [e.h] : []));
    expect(pack).toHaveLength(MENACE.pack.count);
    expect(Math.hypot(come.x - s.controller.x, come.y - s.controller.y)).toBeLessThan(MENACE.pack.away + T * 2);
    // the next a minute after, announced 5 s before it (the first pack is put down so the Communicator lives)
    for (const h of s.hornets) s.slay(h);
    s.events.length = 0;
    step(s, MENACE.pack.every - MENACE.pack.warn - 2);
    expect(s.events.some((e) => e.e === 'hunt')).toBe(false);
    step(s, 3);
    expect(s.events.some((e) => e.e === 'hunt' && e.what === 'warn')).toBe(true);
    step(s, MENACE.pack.warn + 0.2);
    expect(s.events.filter((e) => e.e === 'hunt' && e.what === 'come')).toHaveLength(1);
  });

  it('the pack comes hunting the Communicator, from outside the screen but inside its enemies\' sight', () => {
    const s = alone();
    s.nests.length = 0;
    at(s, 5);
    step(s, MENACE.pack.warn + 0.1);
    const come = s.events.find((e): e is Extract<SimEvent, { e: 'hunt' }> => e.e === 'hunt' && e.what === 'come')!;
    expect(come).toBeTruthy();
    const pack = s.hornets.filter((h) => h.elite && h.twisted && Math.hypot(h.x - come.x, h.y - come.y) < 120);
    expect(pack).toHaveLength(MENACE.pack.count);
    expect(pack.map((h) => h.target)).toEqual(pack.map(() => s.controller.id));
    for (const h of pack) expect(Math.hypot(h.x - s.controller.x, h.y - s.controller.y)).toBeGreaterThan(T * 12);
  });
});
