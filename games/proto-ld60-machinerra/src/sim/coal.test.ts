import { describe, expect, it } from 'vitest';
import { ACTION, COAL, GATHER, MULE, T, type BiomeId } from './defs';
import { NO_INPUT, Sim } from './sim';
import { tap } from './testkit';
import { haulFrom } from '../hub/state';
import { bank, freshEconomy } from '../hub/economy';

const run = (s: Sim, sec: number, dt = 1 / 30) => {
  for (let i = 0; i < Math.round(sec / dt); i++) {
    s.step(dt, NO_INPUT);
    s.events.length = 0;
  }
};
const land = (biome: BiomeId = 'desert', seed = 7) => {
  const s = new Sim(seed, [], biome);
  s.setClock('day'); // the morning is quiet; hives sleep unless the work wakes them
  return s;
};
const stand = (s: Sim, x: number, y: number) => {
  s.controller.x = x;
  s.controller.y = y;
};

describe('coal seams (Minos, 2026-10-18)', () => {
  it('a land has a few, the mountains lean heaviest, and a dungeon has none', () => {
    for (const b of ['desert', 'jungle', 'city', 'mountains', 'demon'] as BiomeId[]) {
      const s = land(b);
      expect(s.seams.length, b).toBe(COAL.seams[b]);
      expect(s.seams.every((q) => q.amount === COAL.amount)).toBe(true);
    }
    expect(COAL.seams.mountains).toBeGreaterThan(COAL.seams.desert);
    expect(new Sim(3, [], 'desert', [], undefined, undefined, { dungeon: true }).seams).toHaveLength(0);
  });

  it('the Communicator mines by hand: one press, a load each round while he stays near, paused out of the zone', () => {
    const s = land();
    s.bots = [s.controller];
    const seam = s.seams[0];
    stand(s, seam.x, seam.y + 20);
    tap(s);
    expect(s.action?.seam).toBe(seam);
    run(s, COAL.hand.time + 0.3);
    expect(s.coal).toBe(COAL.hand.load);
    expect(seam.amount).toBe(COAL.amount - COAL.hand.load);
    // Out of the zone: nothing is mined; back in, it goes on without a new press.
    stand(s, seam.x + COAL.reach * ACTION.zone + 60, seam.y);
    run(s, COAL.hand.time + 1);
    expect(s.coal).toBe(COAL.hand.load);
    expect(s.action?.paused).toBe(true);
    stand(s, seam.x, seam.y + 20);
    run(s, COAL.hand.time + 0.3);
    expect(s.coal).toBe(2 * COAL.hand.load);
  });

  it('mining beats for the eye: a pickaxe beat every COAL.hand.beat s by hand, a gatherer\'s now and then, and the last coal says the seam is bare', () => {
    const s = land();
    s.bots = [s.controller];
    const seam = s.seams[0];
    seam.amount = COAL.hand.load; // one load left
    stand(s, seam.x, seam.y + 20);
    tap(s);
    const seen: string[] = [];
    for (let i = 0; i < (COAL.hand.time + 0.3) * 30; i++) {
      s.step(1 / 30, NO_INPUT);
      for (const e of s.events) if (e.e === 'mine' || e.e === 'coal' || e.e === 'seamBare') seen.push(e.e);
      s.events.length = 0;
    }
    const beats = seen.filter((e) => e === 'mine').length;
    expect(beats).toBeGreaterThanOrEqual(Math.floor(COAL.hand.time / COAL.hand.beat) - 1);
    expect(beats).toBeLessThanOrEqual(Math.ceil(COAL.hand.time / COAL.hand.beat) + 1);
    expect(seen.slice(-2)).toEqual(['coal', 'seamBare']);
    expect(seam.amount).toBe(0);
  });

  it('a gatherer sent to a seam mines it, nearly three times as fast as the Communicator by hand, and the seam runs bare', () => {
    const s = land();
    for (const b of s.crew) if (b.role === 'gatherer') s.assign(b.id, 1);
    const seam = s.seams[0];
    s.order(1, seam.x, seam.y);
    const secs = 20;
    run(s, secs);
    const gatherers = s.crew.filter((b) => b.role === 'gatherer').length;
    expect(gatherers).toBeGreaterThan(0);
    expect(s.coal).toBeGreaterThan(0);
    // One gatherer's rate is one coal every COAL.every s once it is at work; the hand's is load / time.
    expect(1 / COAL.every).toBeGreaterThan((COAL.hand.load / COAL.hand.time) * 2.5);
    run(s, 120, 0.1); // coarse steps: the seam only has to run dry
    expect(seam.amount).toBe(0);
    expect(s.coal).toBe(COAL.amount);
  });

  it('a gatherer mining wakes a sleeping hive close by, by day', () => {
    const s = land();
    const g = s.crew.find((b) => b.role === 'gatherer')!;
    const seam = s.seams[0];
    const hive = s.nests.find((n) => !n.awake)!;
    seam.x = hive.x + 60;
    seam.y = hive.y;
    g.x = seam.x;
    g.y = seam.y + 20;
    for (let i = 0; i < 5; i++) s.mine(g, seam, 1 / 30);
    expect(g.state).toBe('gather');
    expect(hive.awake).toBe(true);
  });

  it('a gatherer sweeps up the scrap lying round where it works, and the Mule leaves that to it', () => {
    // A gatherer and a Mule (the default crew has none) on a quiet field: no hive, no arrival from off the map.
    const crew = (['gatherer', 'mule'] as const).map((role, i) => ({ role, name: `${role}${i}`, uid: `r${i + 1}` }));
    const s = new Sim(7, [], 'desert', [], undefined, undefined, { crew });
    s.setClock('day');
    s.cfg.edge = 0;
    for (const n of s.nests) n.dead = true;
    const g = s.crew.find((b) => b.role === 'gatherer')!;
    const mule = s.crew.find((b) => b.role === 'mule')!;
    for (const b of s.crew) if (b === g || b === mule) s.assign(b.id, 1);
    const seam = s.seams[0];
    s.order(1, seam.x, seam.y);
    run(s, 25); // both reach the seam
    const gob = s.drop(seam.x + GATHER.sweep * T * 0.6, seam.y + 10, 'scrap');
    const far = s.drop(seam.x + MULE.fetchTiles * T * 0.8, seam.y, 'scrap'); // beyond the sweep, within the Mule's fetch
    run(s, 8);
    expect(gob.dead).toBe(true);
    expect(far.dead).toBe(true);
    // Who got which: the gatherer's work is `swept` in its deed counter, the Mule's fetch is not.
    expect(s.stats['deed.gatherer.swept']).toBe(1);
  });

  it('the coal comes home in the haul and joins the stock; old economy saves open with none', () => {
    const s = land();
    s.coal = 11;
    const h = haulFrom(s, 'h1');
    expect(h.coal).toBe(11);
    const e = bank(freshEconomy(), h);
    expect(e.coal).toBe(11);
    expect(bank(e, h).coal).toBe(11); // the same haul twice changes nothing
    expect(haulFrom(land(), 'h2').coal).toBeUndefined();
  });
});
