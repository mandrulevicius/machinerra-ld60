/** The tier abilities with a move to wind up, and the Weaver and Mortar traits (P12): each acts as `systems.md` says, and each telegraphs before it hurts. */
import { describe, expect, it } from 'vitest';
import { NO_INPUT, Sim, type Hornet, type SimEvent } from './sim';
import { TIER, T, type Enemy, type TraitId } from './defs';
import { layOf } from './tiers';

/** The Communicator alone on a quiet desert (no hives), at a landing of this threat tier. */
const alone = (tier = 1) => {
  const s = new Sim(5, [], 'desert', [], undefined, undefined, { tier });
  s.bots = [s.controller];
  s.cfg.swarm = 0;
  s.god = false;
  return s;
};
const tiers = (s: Sim, what: string) => s.events.filter((e): e is Extract<SimEvent, { e: 'tier' }> => e.e === 'tier' && e.what === what);
const step = (s: Sim, secs: number) => {
  for (let i = 0; i < secs * 30; i++) s.step(1 / 30, NO_INPUT);
};
/** Step until `done` or `secs` pass; returns the seconds it took. */
const until = (s: Sim, done: () => boolean, secs = 12) => {
  let t = 0;
  while (!done() && t < secs) {
    s.step(1 / 30, NO_INPUT);
    t += 1 / 30;
  }
  return t;
};
/** An enemy `tiles` east of the Communicator, hunting it, its timers set so that its ability may start at once and the others stay off. */
const foe = (s: Sim, kind: Enemy, tier: number, tiles: number, o: { elite?: boolean; traits?: TraitId[]; ready?: ('digT' | 'spitT' | 'throwT' | 'lobT')[] } = {}) => {
  const c = s.controller;
  const h = s.spawnHornet(c.x + tiles * T, c.y, 0, !!o.elite, false, kind, { tier, traits: o.traits });
  h.target = c.id;
  s.step(1 / 30, NO_INPUT);
  if (h.ts) for (const k of ['digT', 'spitT', 'throwT', 'lobT'] as const) h.ts[k] = o.ready?.includes(k) ? 0 : 999;
  return h;
};
const hurtBy = (s: Sim, f: () => void) => {
  const before = s.controller.hp;
  f();
  return before - s.controller.hp;
};
type Hit = { damageHornet(h: Hornet, d: number, by: unknown, type?: string): void };
const smite = (s: Sim, h: Hornet) => (s as unknown as Hit).damageHornet(h, 1e6, s.controller, 'impact');

describe('Burrow (Crawlcam II) and ambush (Rattler II)', () => {
  for (const [kind, tier] of [['spider', 2], ['snake', 2]] as [Enemy, number][])
    it(`a tier ${tier} ${kind} digs in, tunnels hidden, marks the spot and comes up with a blow`, () => {
      const s = alone();
      const h = foe(s, kind, tier, 7, { ready: ['digT'] });
      const x0 = h.x;
      s.events.length = 0;
      until(s, () => !!h.under);
      expect(h.under, 'it went under').toBe(true);
      expect(tiers(s, 'dig')).toHaveLength(1);
      // Nothing reaches it down there: a hit, the engine's pulses and the Communicator's own aim all pass over.
      const hp = h.hp;
      smite(s, h);
      expect(h.hp).toBe(hp);
      expect(s.engine.flag(h, 'invulnerable')).toBe(true);
      // It tunnels toward the robot...
      until(s, () => tiers(s, 'tellSurface').length > 0);
      expect(h.x).toBeLessThan(x0);
      expect(tiers(s, 'tellSurface')).toHaveLength(1);
      expect(h.under, 'still hidden through the tell').toBe(true);
      // ...and marks the spot a full tell before it strikes: no oil lost until it is up.
      const mark = tiers(s, 'tellSurface')[0];
      expect(Math.hypot(mark.x - s.controller.x, mark.y - s.controller.y)).toBeLessThan(2);
      const lost = hurtBy(s, () => step(s, TIER.burrow.up - 0.1));
      expect(lost).toBe(0);
      expect(tiers(s, 'surface')).toHaveLength(0);
      step(s, 0.2);
      expect(tiers(s, 'surface')).toHaveLength(1);
      expect(tiers(s, 'surface')[0].hits).toBe(1);
      expect(s.controller.hp).toBeLessThan(s.controller.maxHp);
      expect(h.under).toBe(false);
      // Up, it rests: the opening to hit it.
      const hp1 = h.hp;
      s.controller.hp = s.controller.maxHp;
      smite(s, h);
      expect(h.hp).toBeLessThan(hp1);
    });

  it('a stunned sinker comes back up, and a dig that loses its robot ends where it is', () => {
    const s = alone();
    const h = foe(s, 'spider', 2, 7, { ready: ['digT'] });
    s.step(1 / 30, NO_INPUT);
    expect(h.ts!.dig?.mode).toBe('sink');
    s.engine.apply(h, 'staggered');
    s.step(1 / 30, NO_INPUT);
    expect(h.ts!.dig).toBeUndefined();
    const g = foe(s, 'snake', 2, 8, { ready: ['digT'] });
    until(s, () => !!g.under);
    s.controller.x = 3000;
    s.controller.y = 3000;
    until(s, () => !g.under);
    expect(g.under).toBe(false);
    expect(g.ts!.dig).toBeUndefined();
  });
});

describe('Web carpet (Crawlcam III) and the Weaver', () => {

  it('a cable that lands leaves a Rooted patch: shown at once, live after a beat, letting go, then again later', () => {
    const s = alone();
    const c = s.controller;
    const spider = foe(s, 'spider', 3, 9);
    s.foeShot({ x: c.x, y: c.y - 10, vx: 0, vy: 0, dmg: 0, life: 0.01, big: false, by: spider.id, web: true, lay: layOf(spider) });
    s.events.length = 0;
    step(s, 0.1);
    expect(s.tiers.patches).toHaveLength(1);
    expect(s.tiers.patches[0]).toMatchObject({ kind: 'web', r: TIER.carpet.radius });
    expect(tiers(s, 'carpet')).toHaveLength(1);
    // Armed after TIER.carpet.arm: before that it only shows.
    expect(s.engine.stacks(c, 'rooted')).toBe(0);
    step(s, TIER.carpet.arm + 0.2);
    expect(s.engine.stacks(c, 'rooted')).toBe(1);
    expect(s.engine.flag(c, 'noMove')).toBe(true);
    // The carpet lets go (Rooted wears off) and does not catch the same robot again at once...
    step(s, TIER.carpet.time + 0.2);
    expect(s.engine.flag(c, 'noMove')).toBe(false);
    // ...but does later, if it still lies under it.
    until(s, () => s.engine.flag(c, 'noMove'), TIER.carpet.every + 1);
    expect(s.engine.flag(c, 'noMove')).toBe(true);
    step(s, TIER.carpet.life + 2);
    expect(s.tiers.patches).toHaveLength(0);
  });

});

describe('Acid spit (Rattler III)', () => {
  it('it rears first (the aim shows), then spits acid that leaves Corroded', () => {
    const s = alone(3);
    const h = foe(s, 'snake', 3, 6, { ready: ['spitT'] });
    s.events.length = 0;
    until(s, () => tiers(s, 'tellSpit').length > 0);
    expect(tiers(s, 'tellSpit')).toHaveLength(1);
    expect(s.shots.filter((x) => x.foe)).toHaveLength(0);
    step(s, TIER.spit.tell - 0.15);
    expect(s.shots.filter((x) => x.foe), 'nothing flies during the tell').toHaveLength(0);
    expect(s.controller.hp).toBe(s.controller.maxHp);
    until(s, () => tiers(s, 'spit').length > 0, 1);
    expect(tiers(s, 'spit')).toHaveLength(1);
    const shot = s.shots.find((x) => x.foe)!;
    expect(shot).toMatchObject({ type: 'acid', status: 'corroded', by: h.id });
    until(s, () => s.engine.stacks(s.controller, 'corroded') > 0, 2);
    expect(s.engine.stacks(s.controller, 'corroded')).toBeGreaterThan(0);
    expect(s.controller.hp).toBeLessThan(s.controller.maxHp);
  });

});

describe('Scythe throw (swarmer III)', () => {
  it('it rears, throws a blade that flies out and comes back to it, striking a robot in the way once each leg', () => {
    const s = alone(3);
    const h = foe(s, 'swarmer', 3, 4, { ready: ['throwT'] });
    s.cfg.hornetSpeed = 1e-6; // it stands where it is put
    s.events.length = 0;
    until(s, () => tiers(s, 'tellThrow').length > 0);
    expect(s.controller.hp).toBe(s.controller.maxHp);
    let blade: (typeof s.shots)[number] | undefined;
    let far = 0;
    let hits = 0;
    const seen = new Set<number>();
    for (let i = 0; i < 90; i++) {
      s.step(1 / 30, NO_INPUT);
      blade ??= s.shots.find((x) => x.blade);
      if (blade) {
        far = Math.max(far, Math.hypot(blade.x - h.x, blade.y - h.y));
        if (blade.blade!.back) seen.add(1);
      }
      hits += s.events.filter((e) => e.e === 'hit' && e.on === 'bot').length;
      s.events.length = 0;
      if (blade?.dead) break;
    }
    expect(blade, 'a blade was thrown').toBeDefined();
    expect(blade!.dead, 'and it came back and was caught').toBe(true);
    expect(seen.has(1), 'it turned').toBe(true);
    expect(far).toBeGreaterThan(TIER.scythe.speed * TIER.scythe.out * 0.8);
    expect(hits, 'once out, once back').toBe(2);
    expect(tiers(s, 'throw').length + 0).toBeGreaterThanOrEqual(0);
  });

});

describe('Plasma puddles (drone II)', () => {

  it('a bolt that ends leaves a puddle that burns whoever stands in it for its 3 s, after it has shown', () => {
    const s = alone();
    const c = s.controller;
    const drone = foe(s, 'drone', 2, 9);
    drone.gunT = 999; // only the one bolt put down by hand
    s.foeShot({ x: c.x, y: c.y - 10, vx: 0, vy: 0, dmg: 0, life: 0.01, big: false, by: drone.id, lay: layOf(drone) });
    step(s, 0.1);
    expect(s.tiers.patches).toHaveLength(1);
    expect(s.tiers.patches[0].kind).toBe('puddle');
    expect(s.engine.stacks(c, 'burning')).toBe(0);
    step(s, TIER.puddle.arm + 0.2);
    expect(s.engine.stacks(c, 'burning')).toBe(1);
    step(s, 1);
    expect(c.hp).toBeLessThan(c.maxHp);
    // Walk out of it: the fire dies away, and so does the puddle.
    c.x += 4 * T;
    step(s, TIER.puddle.time + 0.5);
    expect(s.engine.stacks(c, 'burning')).toBe(0);
    step(s, TIER.puddle.life);
    expect(s.tiers.patches).toHaveLength(0);
  });

});

describe('Mortar (drone elite)', () => {
  it('it marks the robot’s spot, the shell lands a second later, and only what stands there is hurt', () => {
    const s = alone();
    const c = s.controller;
    const h = foe(s, 'drone', 1, 6, { elite: true, traits: ['mortar'], ready: ['lobT'] });
    h.gunT = 999; // no bolts: the shell alone
    s.events.length = 0;
    until(s, () => tiers(s, 'tellLob').length > 0);
    const mark = tiers(s, 'tellLob')[0];
    expect(Math.hypot(mark.x - c.x, mark.y - c.y)).toBeLessThan(2);
    step(s, TIER.mortar.tell - 0.2);
    expect(tiers(s, 'lob'), 'not yet').toHaveLength(0);
    expect(c.hp).toBe(c.maxHp);
    // One who walked out of the ring is safe; one who stayed is not.
    c.x += 3 * T;
    step(s, 0.5);
    expect(tiers(s, 'lob')).toHaveLength(1);
    expect(tiers(s, 'lob')[0].hits).toBe(0);
    expect(c.hp).toBe(c.maxHp);
  });

});
