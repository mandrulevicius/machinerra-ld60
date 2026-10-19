import { appendFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BERSERK, BIOMES, DAY, EDGE, T, type BiomeId } from './defs';
import { berserkMul, dayState } from './clock';
import { NO_INPUT, Sim, type Hornet } from './sim';
import { eliteChance } from './tiers';
import { census, type Row } from './census';

/** The Communicator alone and unkillable; no crew. */
const alone = (biome: BiomeId = 'desert', seed = 4) => {
  const s = new Sim(seed, [], biome);
  s.bots = [s.controller];
  s.god = true;
  return s;
};
const step = (s: Sim) => {
  s.step(1 / 30, NO_INPUT);
  s.events.length = 0;
};
const run = (s: Sim, sec: number, each?: (s: Sim) => void) => {
  for (let i = 0; i < sec * 30; i++) {
    step(s);
    each?.(s);
  }
};
const live = (s: Sim) => s.hornets.filter((h) => !h.dead);
const dayCfg = new Sim(1).dayCfg;
const at = dayState(0, dayCfg).at;

describe('the morning hive (P46)', () => {
  it('is awake from the first step and trickles: one at a time at second 0, three by the day, never an elite', () => {
    const s = alone();
    step(s);
    expect(s.nests.filter((n) => n.awake && !n.place)).toHaveLength(DAY.hives.morning);
    let early = 0, late = 0;
    const hiveLive = (x: Sim) => live(x).filter((h) => !h.rim).length;
    const elites: Hornet[] = [];
    run(s, DAY.morning - 1, (x) => {
      if (x.dayT < 25) early = Math.max(early, hiveLive(x));
      late = Math.max(late, hiveLive(x));
      elites.push(...live(x).filter((h) => h.elite));
    });
    expect(s.day.phase).toBe('morning');
    expect(early).toBe(1);
    expect(late).toBe(Math.round(3 * BIOMES.desert.alive)); // the cap the day starts at
    expect(elites).toHaveLength(0);
    expect(live(s).filter((h) => !h.rim).every((h) => h.nest > 0)).toBe(true);
  });

  it('cfg.morningSwarm 0 spawns nothing in the morning; the day still wakes its hive', () => {
    const s = alone();
    s.cfg.morningSwarm = 0;
    run(s, DAY.morning - 1);
    expect(s.hornets).toHaveLength(0);
    expect(s.nests.some((n) => n.awake)).toBe(false);
    run(s, 2);
    expect(s.nests.filter((n) => n.awake).length).toBe(BIOMES.desert.wake.day);
  });

  it('arrivals from off the map trickle in the morning too, and cfg.morningSwarm 0 keeps it quiet', () => {
    const count = (swarm: number) => {
      const s = alone('jungle');
      s.cfg.morningSwarm = swarm;
      for (const n of s.nests) n.dead = true;
      const seen = new Set<number>();
      run(s, DAY.morning - 1, (x) => {
        for (const h of x.hornets) if (h.rim) seen.add(h.id);
      });
      expect(s.day.phase).toBe('morning');
      return seen.size;
    };
    const n = count(1);
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(5);
    expect(count(0)).toBe(0);
  });
});

describe('arrivals from off the map (P46)', () => {
  for (const biome of ['jungle', 'desert'] as const) {
    it(`${biome}: with every hive dead they come from the day on, hunt from anywhere and never pass EDGE.alive`, () => {
      const s = alone(biome);
      s.setClock('day');
      for (const n of s.nests) n.dead = true;
      const kinds = new Set<string>();
      let most = 0, hunting = 0;
      const seen = new Set<number>();
      for (let i = 0; i < 90 * 30; i++) {
        step(s);
        const rim = live(s).filter((h) => h.rim);
        most = Math.max(most, rim.length);
        for (const h of rim) {
          kinds.add(h.kind);
          if (!seen.has(h.id) && h.target) {
            seen.add(h.id);
            hunting++;
          }
        }
      }
      expect(seen.size).toBeGreaterThan(0);
      expect(hunting).toBeGreaterThan(0);
      expect(most).toBeLessThanOrEqual(EDGE.alive[1]);
      const allowed = BIOMES[biome].edge ? [BIOMES[biome].edge] : BIOMES[biome].foes.map(([k]) => k);
      for (const k of kinds) expect(allowed).toContain(k);
      // Walked in: at the end some are inside the map.
      const w = s.W * T, hh = s.H * T;
      expect(live(s).some((h) => h.rim && h.x > 0 && h.x < w && h.y > 0 && h.y < hh)).toBe(true);
    });
  }

  it('they roll elite in the day and twisted in the evening, like any spawn', () => {
    const rows = census('jungle');
    expect(rows.day.rim).toBeGreaterThan(0);
    expect(rows.day.elite).toBeGreaterThan(0);
    expect(rows.evening.twisted).toBeGreaterThan(0);
    expect(rows.day.rimTwisted).toBe(0);
    expect(rows.evening.rimTwisted).toBeGreaterThan(0);
    expect(rows.evening.rimElite).toBeGreaterThan(0);
  });

  it('the live tune edge scales them: 0.2 sends fewer than 3', () => {
    const count = (edge: number) => {
      const s = alone('jungle');
      s.setClock('day');
      s.cfg.edge = edge;
      for (const n of s.nests) n.dead = true;
      const seen = new Set<number>();
      run(s, 60, (x) => {
        for (const h of x.hornets) if (h.rim) seen.add(h.id);
      });
      return seen.size;
    };
    expect(count(0.2)).toBeLessThan(count(3));
  });

  it('the curve: morning < day < evening in spawns, arrivals a real share and rising phase by phase, on both lands', () => {
    for (const biome of ['desert', 'jungle'] as const) {
      const r = census(biome);
      const tot = (x: Row) => x.hive + x.rim;
      if (process.env.CENSUS) appendFileSync(process.env.CENSUS, biome + ' ' + JSON.stringify(r) + '\n');
      expect(tot(r.morning), biome).toBeLessThan(tot(r.day));
      expect(tot(r.day), biome).toBeLessThan(tot(r.evening));
      expect(r.morning.rim, biome).toBeGreaterThan(0);
      expect(r.evening.rim / tot(r.evening), `${biome} rim share in the evening`).toBeGreaterThan(0.12);
      const rate = (x: Row) => x.rim / x.secs;
      expect(rate(r.morning), biome).toBeLessThan(rate(r.day));
      expect(rate(r.day), biome).toBeLessThan(rate(r.evening));
      expect(rate(r.evening), biome).toBeLessThan(rate(r.midnight));
    }
  });

  it('they rise continuously, no step at a phase change: the smoothed rate never falls, the last windows far above the first', () => {
    const s = alone('jungle');
    for (const n of s.nests) n.dead = true;
    const W = 30, bins: number[] = [];
    const total = s.day.at.midnight + 60;
    for (let i = 0; i < total * 10; i++) {
      s.step(0.1, NO_INPUT);
      for (const e of s.events) if (e.e === 'spawn' && e.h.rim) bins[Math.floor(s.dayT / W)] = (bins[Math.floor(s.dayT / W)] ?? 0) + 1;
      s.events.length = 0;
      if (i % 10 === 9) for (const h of live(s)) s.slay(h);
    }
    const b = Array.from({ length: Math.floor(total / W) }, (_, i) => bins[i] ?? 0);
    const sm = b.map((_, i) => (b[i] + (b[i + 1] ?? b[i]) + (b[i + 2] ?? b[i])) / 3);
    for (let i = 1; i < sm.length - 2; i++) expect(sm[i], `window ${i} of ${sm.map((x) => x.toFixed(1))}`).toBeGreaterThanOrEqual(sm[i - 1] * 0.75);
    expect(b.slice(-3).reduce((a, x) => a + x, 0)).toBeGreaterThan(b.slice(0, 3).reduce((a, x) => a + x, 0) * 4);
  });
});

describe('elites by the day (the refined curve)', () => {
  it('none in the morning; the chance rises from the day to dusk, then holds', () => {
    const s = alone();
    s.setClock('morning');
    expect(eliteChance(s)).toBe(0);
    s.setClock('day');
    const dayStart = eliteChance(s);
    expect(dayStart).toBeGreaterThan(0);
    s.setClock(at.day + (at.evening - at.day) / 2);
    const mid = eliteChance(s);
    s.setClock('evening');
    const dusk = eliteChance(s);
    expect(mid).toBeGreaterThan(dayStart);
    expect(dusk).toBeGreaterThan(mid);
    expect(dusk).toBeCloseTo(s.cfg.eliteChance, 6);
    s.setClock('midnight');
    expect(eliteChance(s)).toBeCloseTo(dusk, 6);
  });

  it('the elite share of spawns rises through the day: day start < midday < dusk (counted over many spawns)', () => {
    const share = (clock: number) => {
      const s = alone();
      s.setClock(clock);
      let e = 0;
      const n = 1500;
      for (let i = 0; i < n; i++) {
        if (s.spawnHornet(s.controller.x + 300, s.controller.y, 0, undefined, false, 'hornet').elite) e++;
        if (i % 50 === 49) for (const h of live(s)) s.slay(h);
      }
      return e / n;
    };
    const a = share(at.day), b = share((at.day + at.evening) / 2), c = share(at.evening);
    if (process.env.CENSUS) appendFileSync(process.env.CENSUS, `elite share: day start ${a.toFixed(3)}, midday ${b.toFixed(3)}, dusk ${c.toFixed(3)}\n`);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeGreaterThan(0.14);
  });

  it('a morning spawn is never an elite', () => {
    const s = alone();
    s.setClock('morning');
    for (let i = 0; i < 300; i++) expect(s.spawnHornet(s.controller.x + 300, s.controller.y, 0, undefined, false, 'hornet').elite).toBe(false);
  });
});

describe('menacing enemies after midnight (Minos, 2026-10-19)', () => {
  const sample = (secPast: number, n = 600) => {
    const s = alone();
    s.setClock(at.midnight + secPast);
    let m = 0;
    for (let i = 0; i < n; i++) {
      if (s.spawnHornet(s.controller.x + 300, s.controller.y, 0, undefined, undefined, 'hornet').menacing) m++;
      if (i % 50 === 49) for (const x of live(s)) s.slay(x);
    }
    return m / n;
  };

  it('the clock: 3:00 on the dial is 90 s past midnight, and the share rises linearly from 0 to 1 there', () => {
    const m = (past: number) => dayState(at.midnight + past, dayCfg).menacing;
    expect(m(-1)).toBe(0);
    expect(m(0)).toBe(0);
    expect(m(45)).toBeCloseTo(0.5, 6);
    expect(m(90)).toBeCloseTo(1, 6);
    expect(m(200)).toBe(1);
    expect(dayState(at.midnight + 90, dayCfg).hour).toBeCloseTo(24 + DAY.menacingHour, 6);
  });

  it('none before midnight, a rising share after, all by 3:00', () => {
    expect(sample(-30)).toBe(0);
    const a = sample(20), b = sample(45), c = sample(70), d = sample(90);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThan(d);
    expect(d).toBe(1);
    expect(b).toBeGreaterThan(0.4);
    expect(b).toBeLessThan(0.6);
  });

  it('only menacing enemies take the berserk steps; the others stay twisted ones with no stamp', () => {
    const s = alone();
    s.setClock(at.midnight + 120); // step 12
    const bz = berserkMul(s.day.step, s.cfg.berserk);
    expect(s.day.step).toBeGreaterThan(0);
    const spawn = (menacing: boolean) => s.spawnHornet(s.controller.x + 300, s.controller.y, 0, false, true, 'hornet', { menacing });
    const menacing = spawn(true), plain = spawn(false);
    expect(menacing.menacing).toBe(true);
    expect(plain.menacing).toBeUndefined();
    expect(plain.twisted).toBe(true);
    expect(menacing.bz).toEqual(bz);
    expect(plain.bz).toEqual(berserkMul(0, s.cfg.berserk));
    expect(menacing.maxHp / plain.maxHp).toBeCloseTo(bz.hp, 6);
  });

  it('menace levels stay keyed to the steps: level 3 doubles the elite chance whatever the share', () => {
    const s = alone();
    s.setClock(at.midnight + BERSERK.every * BERSERK.perLevel * 3);
    expect(s.level).toBe(3);
    expect(eliteChance(s)).toBeCloseTo(s.cfg.eliteChance * 2, 6);
  });

  it('arrivals roll it like hive spawns', () => {
    const r = census('jungle');
    expect(r.midnight.menacing).toBeGreaterThan(0);
    expect(r.midnight.menacing).toBeLessThanOrEqual(r.midnight.twisted);
  });
});
