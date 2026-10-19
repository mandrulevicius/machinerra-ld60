import { describe, expect, it } from 'vitest';
import { Sim, type Hornet } from './sim';

const alone = (biome: 'ether' | 'city' | 'desert', seed = 3, perks: string[] = [], opts = {}) => {
  const s = new Sim(seed, [], biome, perks, undefined, undefined, opts);
  s.bots = [s.controller];
  s.god = true;
  return s;
};
type Inside = { damageHornet(h: Hornet, d: number, by: unknown): void };
const hit = (s: Sim, h: Hornet, d: number) => (s as unknown as Inside).damageHornet(h, d, s.controller); // the Communicator's hit

describe('the Ether (P44)', () => {

  it('nothing lands on a ghost until the Esteemed Ghost is freed; then everything does', () => {
    const s = alone('ether');
    const g = s.spawnHornet(s.controller.x + 300, s.controller.y, 0, false, false, 'shade');
    hit(s, g, 10);
    expect(g.hp).toBe(g.maxHp);
    expect(s.events.some((e) => e.e === 'ghosted')).toBe(true);
    const cage = s.places.find((p) => p.id === 'ghost')!;
    s.freeGhost(cage.x, cage.y);
    expect(s.ghostTouch).toBe(true);
    expect(s.followers.map((f) => f.id)).toEqual(['esteemedGhost']);
    hit(s, g, 10);
    expect(g.hp).toBe(g.maxHp - 10);
    expect(s.stats.ghostFreed).toBe(1);
    // A later mission keeps his touch through the perk.
    const t = alone('ether', 3, ['ghostTouch']);
    const g2 = t.spawnHornet(t.controller.x + 300, t.controller.y, 0, false, false, 'wisp');
    hit(t, g2, 5);
    expect(g2.hp).toBe(g2.maxHp - 5);
    // ...and his cage stands empty: he cannot be freed again.
    expect(t.places.find((p) => p.id === 'ghost')!.state).toBe('free');
    expect(alone('ether', 3).places.find((p) => p.id === 'ghost')!.state).toBe('caged');
  });

  it('the knight falls and the Princess follows; on the lift she comes home', () => {
    const s = alone('city');
    const k = s.spawnBoss('knight');
    hit(s, k, 99999);
    expect(s.followers.map((f) => f.id)).toEqual(['princess']);
    expect(s.rescued).toEqual([]);
    const p = s.followers[0].bot;
    p.x = s.controller.x = s.lift.x;
    p.y = s.controller.y = s.lift.y;
    (s as unknown as { setPhase(p: string): void }).setPhase('rising');
    expect(s.rescued).toContain('princess');
    // Already aboard: no second princess.
    const t = new Sim(3, ['princess'], 'city');
    hit(t, t.spawnBoss('knight'), 99999);
    expect(t.followers).toEqual([]);
  });

});

