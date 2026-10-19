import { describe, expect, it } from 'vitest';
import { rng } from '../../../../harness/kit/rng';
import { ANOMALIES, CACHES, EMBERS, MIRAGE, T, TWISTED_PART, WEATHER, type AnomalyId } from './defs';
import { dayCfg, dayState } from './clock';
import { NO_INPUT, Sim } from './sim';
import { rollAnomaly } from '../hub/landings';
import { hitProp } from './props';
import { radar, warmth } from './fog';
import { schedule, weatherLevel, weatherNow, weatherOff } from './weather';

const MID = dayState(0, dayCfg()).at.midnight;
const land = (anomaly: AnomalyId, biome: 'desert' | 'demon' = 'desert', seed = 7) => new Sim(seed, [], biome, [], undefined, undefined, { anomaly });
const run = (s: Sim, sec: number) => {
  for (let i = 0; i < sec * 30; i++) s.step(1 / 30, NO_INPUT);
};
/** The clock to `t` (a step later the sim has seen it). */
const at = (s: Sim, t: number) => {
  s.setClock(t);
  s.step(1 / 30, NO_INPUT);
};

describe('the gusts (P54)', () => {
  it('a weather comes its count of times, each warned before it starts, apart, before midnight', () => {
    for (const id of ['sandstorm', 'emberRain'] as const) {
      const W = ANOMALIES[id].weather!;
      for (const seed of [1, 2, 3, 4, 5]) {
        const g = schedule(rng(seed), id, MID);
        expect(g).toHaveLength(W.count);
        for (const [i, x] of g.entries()) {
          expect(x.on - x.warn).toBeCloseTo(WEATHER.warn);
          expect(x.off - x.on).toBeCloseTo(W.hold);
          expect(x.warn).toBeGreaterThanOrEqual(WEATHER.from);
          expect(x.off).toBeLessThan(MID);
          if (i) expect(x.warn).toBeGreaterThan(g[i - 1].off);
        }
      }
    }
    expect(schedule(rng(1), 'mirage', MID)).toEqual([]);
  });

  it('it warns, eases in over 5 s, holds, eases out, and never jumps', () => {
    const g = [{ n: 0, warn: 20, on: 29, off: 74 }];
    expect(weatherLevel(g, 10).phase).toBe('idle');
    expect(weatherLevel(g, 20)).toMatchObject({ phase: 'warn', tell: 0, ease: 0 });
    expect(weatherLevel(g, 28.9).tell).toBeGreaterThan(0.95);
    expect(weatherLevel(g, 28.9).ease).toBe(0);
    expect(weatherLevel(g, 29)).toMatchObject({ phase: 'on', ease: 0 });
    expect(weatherLevel(g, 29 + WEATHER.ease).ease).toBe(1);
    expect(weatherLevel(g, 50).ease).toBe(1);
    expect(weatherLevel(g, 74 - WEATHER.ease).ease).toBe(1);
    expect(weatherLevel(g, 74).phase).toBe('idle');
    let prev = weatherLevel(g, 0);
    for (let t = 0.1; t < 80; t += 0.1) {
      const l = weatherLevel(g, t);
      expect(Math.abs(l.ease - prev.ease)).toBeLessThan(0.06);
      expect(Math.abs(l.tell - prev.tell)).toBeLessThan(0.15);
      prev = l;
    }
  });

  it('the Sandstorm halves sight and aggro and cuts guns 25% while it holds, and is gone after', () => {
    const s = land('sandstorm');
    expect(s.fx).toMatchObject({ phase: 'idle', sight: 1, aggro: 1, reach: 1 });
    const g = s.weather.windows[0];
    at(s, g.warn + 4);
    expect(s.fx.phase).toBe('warn');
    expect(s.fx.sight).toBe(1);
    at(s, g.on + 20);
    expect(s.fx).toMatchObject({ phase: 'on', sight: 0.5, aggro: 0.5, reach: 0.75, drops: 1 });
    expect(s.sightMul).toBe(0.5);
    at(s, g.off + 1);
    expect(s.fx).toMatchObject({ phase: 'idle', sight: 1, aggro: 1, reach: 1 });
  });

  it('a mission goes through every gust: warn, start and end in order, the warning first by WEATHER.warn s', () => {
    for (const id of ['sandstorm', 'emberRain'] as const) {
      const s = land(id, id === 'emberRain' ? 'demon' : 'desert');
      const seen: string[] = [], when: Record<string, number> = {};
      for (let t = 0; t < MID; t += 1) {
        s.setClock(t);
        s.step(1 / 30, NO_INPUT);
        for (const e of s.events) if (e.e === 'weather' && (e.what === 'warn' || e.what === 'start' || e.what === 'end')) {
          seen.push(`${e.what}${e.n}`);
          when[`${e.what}${e.n}`] = t;
        }
        s.events.length = 0;
      }
      const n = ANOMALIES[id].weather!.count;
      expect(seen).toEqual(Array.from({ length: n }, (_, i) => [`warn${i}`, `start${i}`, `end${i}`]).flat());
      for (let i = 0; i < n; i++) expect(when[`start${i}`] - when[`warn${i}`]).toBeGreaterThanOrEqual(WEATHER.warn - 1);
    }
  });

  it('the Oracle warns at each gust, in full the first time', () => {
    const s = land('sandstorm');
    const says: string[] = [];
    for (const g of s.weather.windows) {
      at(s, g.warn + 1);
      for (const e of s.events) if (e.e === 'oracle' && e.id.startsWith('anomaly-sandstorm')) says.push(e.id);
      s.events.length = 0;
    }
    expect(says).toEqual(['anomaly-sandstorm-0', 'anomaly-sandstorm-1', 'anomaly-sandstorm-2']);
  });

  it('dev: weather now warns at once and starts WEATHER.warn s later; off ends it', () => {
    const s = land('emberRain', 'demon');
    run(s, 1);
    expect(weatherNow(s)).toBe(true);
    s.step(1 / 30, NO_INPUT);
    expect(s.fx.phase).toBe('warn');
    run(s, WEATHER.warn + 2);
    expect(s.fx.phase).toBe('on');
    weatherOff(s);
    run(s, WEATHER.ease + 1);
    expect(s.fx.phase).toBe('idle');
    expect(weatherNow(land('mirage'))).toBe(false);
  });
});

describe('the Sandstorm\'s caches (P54)', () => {
  it('it uncovers two buried caches when it passes, each a signal; breaking one pays and clears its signal', () => {
    const s = land('sandstorm');
    const g = s.weather.windows[0];
    const before = s.signals.length;
    at(s, g.off - 1);
    expect(s.props.list.filter((p) => p.cache)).toHaveLength(0);
    at(s, g.off + 1);
    const caches = s.props.list.filter((p) => p.cache);
    expect(caches).toHaveLength(CACHES.count);
    expect(s.signals.filter((x) => x.kind === 'cache')).toHaveLength(CACHES.count);
    expect(s.signals).toHaveLength(before + CACHES.count);
    // The signal's area holds the cache's tile.
    for (const p of caches) {
      const sig = s.signals.find((x) => x.id === p.cache)!;
      expect(Math.hypot(sig.x - p.tx, sig.y - p.ty)).toBeLessThanOrEqual(sig.r);
      expect(s.blocked(p.x, p.y)).toBe(true);
    }
    const p = caches[0], scrap = s.loot.length;
    hitProp(s, p, 1e6);
    expect(s.loot.length - scrap).toBeGreaterThanOrEqual(CACHES.scrap);
    expect(s.signals.some((x) => x.id === p.cache)).toBe(false);
  });
});

describe('the Mirage (P54)', () => {
  it('one ring in three is false, shown like the rest and never found', () => {
    for (const seed of [3, 7, 11]) {
      const s = land('mirage', 'desert', seed);
      const fake = s.signals.filter((x) => x.fake), all = s.signals.length;
      expect(fake.length / all).toBeGreaterThan(0.25);
      expect(fake.length / all).toBeLessThanOrEqual(MIRAGE.share + 0.05);
      s.fog.revealAll();
      expect(s.fog.open(s.signals).filter((x) => x.fake)).toHaveLength(fake.length);
    }
    expect(land('plain').signals.some((x) => x.fake)).toBe(false);
  });

  it('a false ring fades when the Communicator comes within 6 tiles, a real one stays; steam builds back faster', () => {
    const s = land('mirage');
    const f = s.signals.find((x) => x.fake)!, real = s.signals.filter((x) => !x.fake).length;
    const c = s.controller;
    c.x = (f.x + 0.5 + MIRAGE.near + 3) * T;
    c.y = (f.y + 0.5) * T;
    run(s, 1);
    expect(s.signals).toContain(f);
    expect(f.fade).toBeUndefined();
    c.x = (f.x + 0.5 + MIRAGE.near - 1) * T;
    run(s, 0.3);
    expect(f.fade).toBeGreaterThan(0);
    run(s, MIRAGE.fade + 0.5);
    expect(s.signals).not.toContain(f);
    expect(s.signals.filter((x) => !x.fake)).toHaveLength(real);
    expect(land('mirage').fx.steam).toBeCloseTo(1.2);
    expect(land('plain').fx.steam).toBe(1);
  });
});

describe('the Mirage keeps the antenna honest (P54)', () => {
  it('the antenna and the radar read only the real rings, standing in a false one', () => {
    const s = land('mirage');
    const f = s.signals.find((x) => x.fake)!;
    const from = { x: f.x, y: f.y, facing: 0 };
    const w = warmth(from, s.signals, undefined, s.fog);
    expect(w.signal?.fake).toBeFalsy();
    expect(radar(from, s.signals, undefined, s.fog).some((p) => p.id === f.id)).toBe(false);
    const alone = warmth(from, [f], undefined, s.fog);
    expect(alone.signal).toBeNull();
  });
});

describe('the Blood Moon (P54)', () => {
  it('the twisted share rises twice as fast and the twisted drop twice their part', () => {
    const plain = dayCfg('plain'), moon = dayCfg('bloodMoon');
    const mid = (dayState(0, plain).at.evening + MID) / 2;
    expect(dayState(mid, plain).twist).toBeLessThan(0.7);
    expect(dayState(mid, moon).twist).toBe(1);
    expect(dayState(dayState(0, plain).at.evening, moon).twist).toBeCloseTo(0.1);
    const parts = (anomaly: AnomalyId) => {
      const s = land(anomaly, 'demon');
      const h = s.spawnHornet(s.controller.x + 900, s.controller.y, 0, true, true, 'hornet');
      s.damageHornet(h, h.hp + 1e6, null);
      return s.loot.filter((l) => l.kind === 'part' && l.part === TWISTED_PART.hornet).length;
    };
    expect(parts('plain')).toBe(1);
    expect(parts('bloodMoon')).toBe(2);
  });
});

describe('the Ember Rain (P54)', () => {
  it('marks circles, then sets alight what stands in one: a foe and a robot, not what is away', () => {
    const s = land('emberRain', 'demon');
    const g = s.weather.windows[0];
    at(s, g.on + 12);
    const c = s.controller, bystander = s.spawnHornet(c.x + 3000, c.y + 3000, 0, false, false, 'hornet');
    bystander.hp = bystander.maxHp = 1e6;
    run(s, 1);
    expect(s.weather.embers.length).toBeGreaterThan(0);
    const e = s.weather.embers[0], mark = { x: e.x, y: e.y };
    const foe = s.spawnHornet(mark.x, mark.y, 0, false, false, 'hornet');
    foe.hp = foe.maxHp = 1e6;
    const ally = s.bots.find((b) => b !== c)!;
    expect(s.engine.status(foe, 'burning')).toBeUndefined();
    for (let i = 0; i < EMBERS.warn * 30 + 3 && !s.engine.status(foe, 'burning'); i++) {
      foe.x = mark.x;
      foe.y = mark.y;
      ally.x = mark.x + 10;
      ally.y = mark.y;
      s.step(1 / 30, NO_INPUT);
    }
    expect(s.engine.status(foe, 'burning')).toBeDefined();
    expect(s.engine.status(ally, 'burning')).toBeDefined();
    expect(s.engine.status(bystander, 'burning')).toBeUndefined();
  });

  it('a foe that falls Burning in the rain drops one more scrap gob; not outside the gust, not unlit', () => {
    const gobs = (burning: boolean, inGust: boolean, anomaly: AnomalyId = 'emberRain') => {
      const s = land(anomaly, 'demon');
      at(s, inGust ? (s.weather.windows[0]?.on ?? 100) + 12 : 5);
      const h = s.spawnHornet(s.controller.x + 900, s.controller.y, 0, false, false, 'hornet');
      if (burning) s.engine.apply(h, 'burning', { duration: 3 });
      const before = s.loot.filter((l) => l.kind === 'scrap').length;
      s.damageHornet(h, h.hp + 1e6, null);
      return s.loot.filter((l) => l.kind === 'scrap').length - before;
    };
    const base = gobs(false, true);
    expect(gobs(true, true)).toBe(base + 1);
    expect(gobs(true, false)).toBe(gobs(false, false));
    expect(gobs(true, true, 'plain')).toBe(gobs(false, true, 'plain'));
  });

  it('no marks fall outside the gust', () => {
    const s = land('emberRain', 'demon');
    at(s, 5);
    run(s, 5);
    expect(s.weather.embers).toHaveLength(0);
  });
});

describe('reach and pools (P54)', () => {
  it('guns reach 25% less in the Sandstorm, theirs too', () => {
    const shot = (s: Sim) => {
      const c = s.controller;
      s.give('steamGun');
      s.equip('steamGun', 'primary');
      c.steam = c.maxSteam;
      s.step(1 / 30, { ...NO_INPUT, fire: true, ax: c.x + 300, ay: c.y });
      return s.shots.find((x) => !x.foe)!.life;
    };
    const plain = land('sandstorm'), storm = land('sandstorm');
    at(storm, storm.weather.windows[0].on + 20);
    const k = shot(storm) / shot(plain);
    expect(k).toBeGreaterThan(0.7);
    expect(k).toBeLessThan(0.8);
    const f = storm.foeShot({ x: 0, y: 0, vx: 1, vy: 0, dmg: 1, life: 2, big: false, by: 0 });
    expect(f.life).toBeCloseTo(1.5);
  });

  it('each land rolls from the shared day anomalies and its own', () => {
    const seen = (biome: 'desert' | 'demon') => {
      const out = new Set<string>();
      for (let i = 0; i < 200; i++) out.add(rollAnomaly(rng(i), biome));
      return out;
    };
    expect([...seen('desert')].sort()).toEqual(['earlyDusk', 'longNoon', 'mirage', 'plain', 'sandstorm']);
    expect([...seen('demon')].sort()).toEqual(['bloodMoon', 'earlyDusk', 'emberRain', 'longNoon', 'plain']);
  });
});

describe('a land anomaly holds all mission (P54)', () => {
  it('Mirage and Blood Moon are on from the first second to past midnight', () => {
    for (const [id, biome] of [['mirage', 'desert'], ['bloodMoon', 'demon']] as const) {
      const s = land(id, biome);
      for (const t of [0, 100, MID, MID + 300]) {
        s.setClock(t);
        expect(s.fx.ease).toBe(1);
      }
      expect(ANOMALIES[id].weather).toBeUndefined();
    }
  });
});
