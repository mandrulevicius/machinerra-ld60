/**
 * P22, content day: the three built bosses' own breaks (Hornet Queen, Old Rattlejaw, the Harbinger) and the soft counters of the built
 * kinds (Mender, Blinker, Heavy), as `systems.md` ("Damage states", "Soft counters") says.
 */
import { describe, expect, it } from 'vitest';
import { BOSSES, COUNTERS, ELITE_TRAITS, KIND_ALWAYS, KIND_COUNTERS, MOD_COUNTERS, T, TIER, bossNow, countersOf, landCounters, type Enemy } from './defs';
import { NO_INPUT, Sim, type Hornet, type SimEvent } from './sim';
import { swing } from './combat';
import { blinks, warden } from './tiers';

const alone = (tier = 1) => {
  const s = new Sim(5, [], 'desert', [], undefined, undefined, { tier });
  s.bots = [s.controller];
  s.cfg.swarm = 0;
  s.controller.hp = s.controller.maxHp = 1e6;
  return s;
};
const step = (s: Sim, secs: number) => {
  for (let i = 0; i < secs * 30; i++) s.step(1 / 30, NO_INPUT);
};
const parts = (s: Sim) => s.loot.filter((l) => l.kind === 'part').length;
const breaks = (s: Sim) => s.events.filter((e): e is Extract<SimEvent, { e: 'break' }> => e.e === 'break');
const hit = (s: Sim, h: Hornet, share: number) => {
  h.hp = h.maxHp * share + 1;
  s.damageHornet(h, 2, s.controller, 'impact');
};
/** The states a boss passes through while it fights for `secs` seconds. */
const seen = (s: Sim, h: Hornet, secs: number) => {
  const out = new Set<string>();
  for (let i = 0; i < secs * 30; i++) {
    s.step(1 / 30, NO_INPUT);
    out.add(h.brain.state);
  }
  return out;
};

describe('the bosses\' own breaks', () => {
  const OWN: [Enemy, string[]][] = [['hornet', ['wingTorn', 'broodBurst']], ['snake', ['tailTorn', 'jawCracked']], ['drone', ['shieldOff', 'pistolBlown']]];

  it.each(OWN)('%s breaks twice, at 66% and 33%: its own two, a part each, a break event, a changed fight', (kind, ids) => {
    const s = alone();
    const h = s.spawnBoss(kind);
    const before = parts(s);
    const cycle0 = bossNow(kind, 1, []).cycle.join();
    hit(s, h, 0.6);
    expect(h.breaks).toEqual([ids[0]]);
    expect(bossNow(kind, 1, h.breaks).cycle.join(), 'break 1 changes its beats').not.toBe(cycle0);
    hit(s, h, 0.3);
    expect(h.breaks).toEqual(ids);
    expect(breaks(s).map((e) => [e.n, e.what])).toEqual([[1, ids[0]], [2, ids[1]]]);
    expect(parts(s)).toBe(before + 2);
    expect(BOSSES[kind]!.breaks!.map((b) => b.id)).toEqual(ids);
  });

  it('a break keeps its patch for the rest of the fight, and the cycles stay Laimonas\'s unless a break adds beats', () => {
    for (const [kind] of OWN) {
      const B = bossNow(kind, 1, []);
      expect(B.cycle, kind).toEqual(BOSSES[kind]!.cycle);
      expect(bossNow(kind, 1, ['x']).cycle).toEqual(B.cycle);
    }
    // The patch merges field by field: the queen's charge keeps its speed and damage, and rests longer.
    const Q = bossNow('hornet', 1, ['wingTorn']);
    expect(Q.charge.rest).toBeGreaterThan(BOSSES.hornet.charge.rest);
    expect(Q.charge.speed).toBe(BOSSES.hornet.charge.speed);
    expect(Q.ring).toBeLessThan(BOSSES.hornet.ring);
  });

  it('the Hornet Queen: the torn wing closes her in, the burst sac calls the whole brood at once', () => {
    const s = alone();
    const c = s.controller;
    const q = s.spawnBoss('hornet');
    q.x = c.x + 200;
    q.y = c.y;
    hit(s, q, 0.6);
    expect(bossNow('hornet', 1, q.breaks).ring).toBe(130);
    hit(s, q, 0.3);
    expect(q.brain.owe).toBe('summon');
    const n = s.hornets.length;
    const states = seen(s, q, 6);
    expect(states.has('tellSummon')).toBe(true);
    expect(s.hornets.length).toBeGreaterThanOrEqual(n + 6);
    expect(q.brain.owe).toBeUndefined();
  });

  it('Old Rattlejaw: the torn tail shortens his strike, the cracked jaw makes it Corrode and owes the brood', () => {
    const s = alone();
    const r = s.spawnBoss('snake');
    hit(s, r, 0.6);
    const B1 = bossNow('snake', 1, r.breaks);
    expect(B1.charge.time).toBeLessThan(BOSSES.snake!.charge.time);
    expect(B1.volley.bolts).toBeGreaterThan(BOSSES.snake!.volley.bolts);
    hit(s, r, 0.3);
    expect(bossNow('snake', 1, r.breaks).charge.status).toBe('corroded');
    expect(r.brain.owe).toBe('summon');
  });

  it('the Harbinger: the shield off gives it the claw\'s ring, the blown pistol takes the volleys away', () => {
    const s = alone();
    const c = s.controller;
    const hb = s.spawnBoss('drone');
    hb.x = c.x + 220;
    hb.y = c.y;
    expect(bossNow('drone', 1, []).quake).toBeUndefined();
    hit(s, hb, 0.6);
    expect(bossNow('drone', 1, hb.breaks).quake).toBeDefined();
    expect(seen(s, hb, 25).has('tellQuake')).toBe(true);
    hit(s, hb, 0.3);
    expect(hb.brain.owe).toBe('quake');
    const B2 = bossNow('drone', 1, hb.breaks);
    expect(B2.cycle).not.toContain('volley');
    // Whatever it was winding up finishes; after that no volley is ever wound up again.
    step(s, 4);
    expect(seen(s, hb, 20).has('tellVolley')).toBe(false);
  });

  it('a boss with none of its own breaks (the level 1 Foreman) keeps the generic pair', () => {
    const s = alone();
    const fm = s.spawnBoss('foreman');
    hit(s, fm, 0.6);
    expect(fm.breaks).toEqual(['slow']);
  });
});

describe('soft counters', () => {
  it('each counter has words, and every one is on a trait, a twisted kind, a kind (P31), a beast mod or a Warden', () => {
    for (const [id, d] of Object.entries(COUNTERS)) expect(d.punishes && d.answers && d.name, id).toBeTruthy();
    const on = new Set<string>();
    for (const t of Object.values(ELITE_TRAITS)) if (t.counter) on.add(t.counter);
    for (const c of [...Object.values(KIND_COUNTERS), ...Object.values(KIND_ALWAYS), ...Object.values(MOD_COUNTERS)]) on.add(c!);
    on.add('heavy');
    expect([...on].sort()).toEqual(Object.keys(COUNTERS).sort());
  });

  it('countersOf: the Leech is a Mender, a twisted rattler a Blinker, a tier III Warden Heavy', () => {
    const base = { kind: 'swarmer' as Enemy, twisted: false };
    expect(countersOf({ ...base, traits: ['leech'] })).toEqual(['mender']);
    expect(countersOf({ ...base, traits: ['twinBlade'] })).toEqual([]);
    expect(countersOf({ kind: 'snake', twisted: false })).toEqual([]);
    expect(countersOf({ kind: 'snake', twisted: true })).toEqual(['blinker']);
    expect(countersOf({ kind: 'hornet', twisted: false, warden: true, tier: 2 })).toEqual([]);
    expect(countersOf({ kind: 'hornet', twisted: false, warden: true, tier: 3 })).toEqual(['heavy']);
    expect(countersOf({ kind: 'hornet', twisted: false, traits: ['carapace'], warden: true, tier: 3 })).toEqual(['thorns', 'heavy']);
  });

  it('the course table: the desert shows Thorns and (its dungeon\'s rattlers) Blinkers, the Wastes Menders and Mirror shell, and Heavy comes with tier III', () => {
    expect(landCounters(['hornet', 'spider'], 1).map((c) => c.id)).toEqual(['thorns']);
    expect(landCounters(['hornet', 'snake'], 1).map((c) => c.id)).toEqual(['thorns', 'blinker']);
    const wastes = landCounters(['swarmer', 'drone'], 3);
    expect(wastes.map((c) => c.id).sort()).toEqual(['heavy', 'mender', 'mirror']);
    expect(wastes.find((c) => c.id === 'mender')!.on).toEqual(['Leech Scythe-wing swarmer']);
  });

  it('Mender: a Leech elite mends the enemies round it faster than a Burning ticks, and not those out of reach', () => {
    const s = alone();
    const c = s.controller;
    const mk = (dx: number) => {
      const h = s.spawnHornet(c.x + 25 * T + dx, c.y, 0, false, false, 'swarmer', { tier: 1 });
      h.hp = 8;
      return h;
    };
    const leech = s.spawnHornet(c.x + 25 * T, c.y, 0, true, false, 'swarmer', { traits: ['leech'] });
    const mate = mk(60);
    const far = mk(TIER.mender.radius + 400);
    // Pin them still: a hunt would carry them apart.
    for (const h of [leech, mate, far]) h.cd = 99;
    s.cfg.hornetSpeed = 0;
    step(s, 2.6);
    expect(mate.hp).toBeGreaterThanOrEqual(8 + TIER.mender.amount * 2);
    expect(far.hp).toBe(8);
    expect(TIER.mender.amount).toBeGreaterThan(4); // more a second than a Burning (4) takes
  });

  describe('Blinker', () => {
    const twistedRattler = (s: Sim) => {
      const c = s.controller;
      const h = s.spawnHornet(c.x + 3 * T, c.y, 0, false, true, 'snake', { tier: 1 });
      h.target = c.id;
      return h;
    };

    it('a twisted rattler blinks away from a slow weapon\'s hit (the hit misses), then must wait', () => {
      const s = alone();
      const h = twistedRattler(s);
      const at = { x: h.x, y: h.y }, hp = h.hp;
      s.damageHornet(h, 5, s.controller, 'impact', { via: 'melee', weapon: 'pipeWrench' }); // 0.55 s between blows
      expect(h.hp).toBe(hp);
      expect(Math.hypot(h.x - at.x, h.y - at.y)).toBeCloseTo(TIER.blink.jump, 0);
      expect(s.events.some((e) => e.e === 'tier' && e.what === 'blink')).toBe(true);
      s.damageHornet(h, 5, s.controller, 'impact', { via: 'melee', weapon: 'pipeWrench' }); // still cooling off
      expect(h.hp).toBeLessThan(hp);
    });

    it('a fast weapon, a plain rattler, a boss and a hit that is not a robot\'s blow all get through', () => {
      const s = alone();
      const h = twistedRattler(s);
      s.damageHornet(h, 3, s.controller, 'pierce', { via: 'gun', weapon: 'steamGun' }); // 0.2 s
      expect(h.hp).toBeLessThan(h.maxHp);
      expect(h.blinkAt).toBeUndefined();
      s.damageHornet(h, 3, s.controller, 'impact', { via: 'crash' });
      expect(h.blinkAt).toBeUndefined();
      const plain = s.spawnHornet(s.controller.x + 4 * T, s.controller.y, 0, false, false, 'snake', { tier: 1 });
      expect(blinks(s, plain, s.controller, 'melee', 'pipeWrench')).toBe(false);
      const boss = s.spawnBoss('snake');
      expect(blinks(s, boss, s.controller, 'melee', 'pipeWrench')).toBe(false);
    });

    it('a crew robot\'s gun is a slow weapon by its role; Rooted and Frozen hold the rattler still', () => {
      const s = alone();
      const h = twistedRattler(s);
      s.engine.apply(h, 'rooted');
      expect(blinks(s, h, s.controller, 'melee', 'pipeWrench')).toBe(false);
      s.engine.strip(h, 'rooted');
      s.engine.apply(h, 'frozen');
      expect(blinks(s, h, s.controller, 'melee', 'pipeWrench')).toBe(false);
      s.engine.strip(h, 'frozen');
      const g = s.addBot('guard', 'G', s.controller.x, s.controller.y, 0);
      expect(blinks(s, h, g, 'gun')).toBe(true);
    });
  });

  it('Heavy: a Warden is Steady at tier III only, so a kick does not move it until it is Staggered', () => {
    const s = alone(3);
    const c = s.controller;
    const w = s.spawnHornet(c.x + 2 * T, c.y, 0, true, false, 'hornet', { tier: 3, traits: [] });
    expect(s.engine.flag(w, 'steady')).toBe(false); // not a Warden yet
    warden(s, w);
    expect(s.engine.flag(w, 'steady')).toBe(true);
    s.setTier(2);
    expect(s.engine.flag(w, 'steady')).toBe(false);
    s.setTier(3);
    expect(s.engine.flag(w, 'steady')).toBe(true);
    w.vx = w.vy = 0;
    swing(s, c, 0, { dmg: 1, reach: 90, arc: 3, knock: 700 }, true);
    expect(w.vx).toBe(0);
    s.engine.apply(w, 'staggered');
    swing(s, c, 0, { dmg: 1, reach: 90, arc: 3, knock: 700 }, true);
    expect(w.vx).toBeGreaterThan(0);
  });
});
