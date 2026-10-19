import { describe, expect, it } from 'vitest';
import { NO_INPUT, Sim, type Hornet } from './sim';
import { ELITE_TRAITS, FOES, FOE_TIERS, PARTS, TIER, TRAITS_OF, type Enemy, type TraitId } from './defs';
import { abilitiesOf, guardHit } from './tiers';

/** The Communicator alone on a quiet desert, at a landing of this threat tier. */
const alone = (tier = 1) => {
  const s = new Sim(5, [], 'desert', [], undefined, undefined, { tier });
  s.bots = [s.controller];
  s.cfg.swarm = 0;
  s.cfg.morningSwarm = 0;
  return s;
};
const run = (s: Sim, secs: number) => {
  for (let i = 0; i < secs * 30; i++) s.step(1 / 30, NO_INPUT);
};
const near = (s: Sim, dx = 200, dy = 0) => ({ x: s.controller.x + dx, y: s.controller.y + dy });
const elite = (s: Sim, trait: TraitId, dx = 200) => {
  const p = near(s, dx);
  const h = s.spawnHornet(p.x, p.y, 0, true, false, ELITE_TRAITS[trait].kind, { traits: [trait] });
  h.target = s.controller.id;
  return h;
};
type Hit = { damageHornet(h: Hornet, d: number, by: unknown, type?: string, o?: { via?: string }): void };
const hit = (s: Sim, h: Hornet, d: number, by: unknown = null, via?: string) => (s as unknown as Hit).damageHornet(h, d, by, 'impact', { via });
const kill = (s: Sim, h: Hornet) => hit(s, h, 1e6);

describe('tier and trait data', () => {
  it('every kind with tiers has two abilities; every trait has a kind, a part of its own and a place in its kind', () => {
    for (const [k, t] of Object.entries(FOE_TIERS)) expect(new Set(t).size, k).toBe(2);
    const parts = new Set<string>();
    for (const [id, d] of Object.entries(ELITE_TRAITS)) {
      expect(TRAITS_OF[d.kind], id).toContain(id);
      expect(PARTS[d.part].from, id).toBe(d.kind);
      expect(parts.has(d.part), id).toBe(false);
      parts.add(d.part);
    }
    expect(Object.keys(ELITE_TRAITS)).toHaveLength(14);
    expect(Object.keys(TRAITS_OF).sort()).toEqual(Object.keys(FOE_TIERS).sort());
  });

});

describe('tiers', () => {

  it('each tier adds abilities: II the first, III both', () => {
    const s = alone();
    const p = near(s);
    for (const [kind, [a, b]] of Object.entries(FOE_TIERS) as [Enemy, [string, string]][]) {
      const h = (n: number) => s.spawnHornet(p.x, p.y, 0, false, false, kind, { tier: n });
      expect(abilitiesOf(h(1))).toEqual([]);
      expect(abilitiesOf(h(2))).toEqual([a]);
      expect(abilitiesOf(h(3))).toEqual([a, b]);
    }
  });

});

describe('elite traits', () => {

  it('Carapace: a front hit does 30%, a flank hit all of it, Thorns bite a melee attacker, and a kick flips it', () => {
    const s = alone();
    const c = s.controller;
    const h = elite(s, 'carapace');
    h.x = c.x + 60;
    h.y = c.y;
    expect(guardHit(s, h, c, 'melee')).toBe(TIER.guard.carapace);
    h.target = 0;
    h.vx = -50; // moving toward the Communicator is facing it; moving away is not
    h.vx = 50;
    expect(guardHit(s, h, c, 'melee')).toBe(1);
    h.target = c.id;
    const hp = c.hp;
    s.engine.strike(c, h, { type: 'impact', amount: 1, via: 'melee' });
    s.drainFx();
    expect(c.hp).toBeLessThan(hp);
    expect(guardHit(s, h, c, 'kick')).toBe(1);
    expect(s.engine.flag(h, 'stunned')).toBe(true);
    // A gun is no melee: no thorns.
    const hp2 = c.hp;
    s.engine.strike(c, h, { type: 'pierce', amount: 1, via: 'gun' });
    s.drainFx();
    expect(c.hp).toBe(hp2);
  });

  it('Mirror shell (Bulwark): a shot sends part of its damage back; Hooded takes nothing from the front', () => {
    const s = alone();
    const c = s.controller;
    const b = elite(s, 'bulwark');
    const hp = c.hp;
    s.engine.strike(c, b, { type: 'pierce', amount: 10, via: 'gun' });
    s.drainFx();
    expect(c.hp).toBeLessThan(hp);
    const hd = elite(s, 'hooded', 60);
    expect(guardHit(s, hd, c, 'melee')).toBe(0);
    const before = hd.hp;
    // A swing from the front does nothing at all.
    c.x = hd.x - 30;
    c.y = hd.y;
    hd.target = c.id;
    hit(s, hd, 10, c, 'melee');
    expect(hd.hp).toBe(before);
  });

  it('Splitter dies into three small hornets; Brood lets two spiderlings out at half health, once', () => {
    const s = alone();
    const sp = elite(s, 'splitter', 400);
    const n = s.hornets.length;
    kill(s, sp);
    s.step(1 / 30, NO_INPUT);
    const kids = s.hornets.filter((h) => h.small);
    expect(kids).toHaveLength(TIER.splitter.count);
    expect(s.hornets.length).toBe(n - 1 + TIER.splitter.count);
    expect(kids[0].maxHp).toBeCloseTo(FOES.hornet.hp * TIER.splitter.hp);
    expect(kids.every((k) => !k.elite && !k.traits)).toBe(true);

    const br = elite(s, 'brood', 500);
    br.hp = br.maxHp * 0.4;
    run(s, 0.2);
    expect(s.hornets.filter((h) => h.small && h.kind === 'spider')).toHaveLength(TIER.brood.count);
    run(s, 0.5);
    expect(s.hornets.filter((h) => h.small && h.kind === 'spider')).toHaveLength(TIER.brood.count);
  });

});
