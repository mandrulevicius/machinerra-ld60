import { describe, expect, it } from 'vitest';
import { loadLand } from './lands';
import { NO_INPUT, Sim } from './sim';
import { RIM, expedition, spawnPick } from './spawntiers';
import { BIOMES, type BiomeId, type Enemy } from './defs';

const biome = (id: BiomeId, flown = 9) => new Sim(7, [], id, [], undefined, undefined, { flown });
const run = (s: Sim, sec: number) => {
  for (let t = 0; t < sec; t += 1 / 30) s.step(1 / 30, NO_INPUT);
};

describe('the rim tier on every land (Minos: out of screen, strongest)', () => {
  it('each land has a row whose kinds are its own roster', () => {
    for (const id of Object.keys(BIOMES) as BiomeId[]) {
      const roster = new Set<Enemy>([...BIOMES[id].foes.map(([k]) => k), ...(BIOMES[id].edge ? [BIOMES[id].edge!] : [])]);
      for (const [k] of RIM[id].kinds) expect(roster.has(k)).toBe(true);
    }
  });

  it('a jungle rim arrival is the heavy kinds with the rim elite share, a hive spawn is left alone', () => {
    const s = biome('jungle');
    expect(expedition(s)).toBeNull();
    expect(spawnPick(s, 'hive')).toBeUndefined();
    const kinds = new Set<Enemy>();
    let elite = 0;
    const n = 600;
    for (let i = 0; i < n; i++) {
      const p = spawnPick(s, 'rim')!;
      kinds.add(p.kind);
      if (p.elite) elite++;
    }
    expect([...kinds].sort()).toEqual(RIM.jungle.kinds.map(([k]) => k).sort());
    expect(elite / n).toBeGreaterThan(RIM.jungle.elites - 0.07);
    expect(elite / n).toBeLessThan(RIM.jungle.elites + 0.07);
  });

  it('the arrivals that come over the rim in play are from that row', () => {
    const s = biome('city');
    s.god = true;
    s.setClock('day');
    const seen = new Set<Enemy>();
    for (let t = 0; t < 120; t += 1 / 30) {
      s.step(1 / 30, NO_INPUT);
      for (const h of s.hornets) if (h.rim && !h.boss) seen.add(h.kind);
    }
    expect(seen.size).toBeGreaterThan(0);
    for (const k of seen) expect(RIM.city.kinds.some(([r]) => r === k)).toBe(true);
  });

  it('the first expeditions keep their own rows; later desert uses the rim row', () => {
    const first = new Sim(7, [], 'desert', [], undefined, undefined, { flown: 2 });
    expect(spawnPick(first, 'rim')!.kind).toBe(expedition(first)!.rim.kind);
    expect(spawnPick(biome('desert'), 'rim')!.kind).toBe('hornet');
  });
});

describe('level 1 clock', () => {
  it('midnight is 240 s of play after the landing pause (the Hurried Sun), a second for second', () => {
    const s = new Sim('level1', [], 'desert', [], undefined, undefined, { land: loadLand('level1'), crew: [{ role: 'gatherer', name: 'Bellows' }], owned: ['Bellows'], flown: 1 });
    s.god = true;
    run(s, 2);
    s.lessons.hush = null;
    const t0 = s.dayT;
    run(s, 100);
    expect(s.dayT - t0).toBeCloseTo(100, 0);
    expect(s.day.at.midnight).toBe(240);
  });
});
