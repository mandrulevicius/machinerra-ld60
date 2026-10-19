import { describe, expect, it } from 'vitest';
import { BIOMES, BOSSES, PARTS, type BiomeId, type Enemy } from './defs';
import { NO_INPUT, Sim, type Hornet } from './sim';

/** The land with only the Communicator on it, who cannot fall. */
const alone = (biome: BiomeId, seed = 3) => {
  const s = new Sim(seed, [], biome);
  s.bots = [s.controller];
  s.god = true;
  return s;
};
type Inside = { damageHornet(h: Hornet, d: number, by: unknown): void; bossKicked(h: Hornet): void };
const inside = (s: Sim) => s as unknown as Inside;
const steps = (s: Sim, sec: number) => {
  for (let i = 0; i < sec * 30; i++) s.step(1 / 30, NO_INPUT);
};
const BIOME_BOSS: [BiomeId, Enemy][] = [['jungle', 'gorilla'], ['city', 'knight'], ['mountains', 'bear']];

describe("the biomes' bosses", () => {
  it('come to their own land at dusk, each with its own unique', () => {
    for (const [b, kind] of BIOME_BOSS) {
      expect(BIOMES[b].dusk).toBe(kind);
      const u = BOSSES[kind]!.drops.unique;
      expect(PARTS[u].unique && PARTS[u].from).toBe(kind);
      const s = alone(b);
      s.setClock('boss');
      steps(s, 1);
      expect(s.boss?.kind, b).toBe(kind);
    }
  });

  it('fight through their whole cycle, both forms, without trouble, and fall leaving their unique', () => {
    for (const [b, kind] of BIOME_BOSS) {
      const s = alone(b);
      const c = s.controller;
      const h = s.spawnBoss(kind);
      h.x = c.x + 150;
      h.y = c.y;
      const seen = new Set<string>();
      const forms = new Set<number>();
      for (let i = 0; i < 30 * 40; i++) {
        s.step(1 / 30, NO_INPUT);
        seen.add(h.brain.state);
        forms.add(h.phase ?? 1);
        if (i === 30 * 20) inside(s).damageHornet(h, h.maxHp * 0.6, null);
      }
      expect(forms.has(2), kind).toBe(true);
      for (const m of [...BOSSES[kind]!.cycle, ...(BOSSES[kind]!.phase2?.def.cycle ?? [])]) expect([...seen].some((x) => x.toLowerCase().includes(m === 'charge' ? 'charge' : m)), `${kind} ${m}`).toBe(true);
      expect(h.air ?? false).toBe(false);
      inside(s).damageHornet(h, 99999, null);
      expect(h.dead).toBe(true);
      expect(s.loot.some((l) => l.part === BOSSES[kind]!.drops.unique)).toBe(true);
      expect(s.bossDownName).toBe(BOSSES[kind]!.name);
    }
  });

});
