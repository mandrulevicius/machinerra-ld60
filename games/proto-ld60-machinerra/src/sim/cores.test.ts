import { describe, expect, it } from 'vitest';
import { bank, freshEconomy } from '../hub/economy';
import { haulFrom } from '../hub/state';
import { BOSSES, T, VAULT, type BiomeId } from './defs';
import { NO_INPUT, Sim } from './sim';

const USE = { ...NO_INPUT, use: true };
const alone = (seed = 3, biome: BiomeId = 'desert') => {
  const s = new Sim(seed, [], biome);
  s.bots = [s.controller];
  s.god = true;
  return s;
};
const steps = (s: Sim, sec: number, input = NO_INPUT) => {
  for (let i = 0; i < sec * 30; i++) {
    s.step(1 / 30, input);
    s.events.length = 0;
  }
};
/** Cores out of the vault so far: taken, or lying where they fell (the Communicator's pull may have them already). */
const seen = (s: Sim) => s.cores + s.loot.filter((l) => l.kind === 'core' && !l.dead).length;
const vaultOf = (s: Sim) => s.places.find((p) => p.id === 'core-vault')!;

describe('the Core Vault (a place file)', () => {

  it('a 4 s hold gives a core, wakes the nearest hive and sends one elite', () => {
    const s = alone();
    const v = vaultOf(s);
    expect(v.state).toBe('sealed');
    const fridge = v.parts.find((q) => q.kind === 'vault')!;
    s.controller.x = fridge.x;
    s.controller.y = fridge.y + 24;
    const asleep = s.nests.filter((n) => !n.awake && !n.place);
    const near = [...asleep].sort((a, b) => Math.hypot(a.x - fridge.x, a.y - fridge.y) - Math.hypot(b.x - fridge.x, b.y - fridge.y))[0];
    const elites = s.hornets.filter((h) => h.elite).length;
    steps(s, VAULT.hold - 0.5, USE);
    expect(v.state).toBe('sealed');
    expect(seen(s)).toBe(0);
    steps(s, 1.2, USE);
    expect(v.state).toBe('open');
    expect(seen(s)).toBe(1);
    expect(near.awake).toBe(true);
    expect(s.hornets.filter((h) => h.elite).length).toBe(elites + 1);
    // Once open it is done.
    expect(s.triggerPlace('core-vault')).toBe(false);
  });

  it('the core lies where it fell until a robot walks over it, then it is counted once', () => {
    const s = alone();
    expect(s.triggerPlace('core-vault')).toBe(true);
    const l = s.loot.find((x) => x.kind === 'core')!;
    steps(s, 30);
    expect(l.dead).toBe(false); // it never sinks into the sand
    expect(s.cores).toBe(0);
    s.controller.x = l.x;
    s.controller.y = l.y;
    steps(s, 0.5);
    expect(l.dead).toBe(true);
    expect(s.cores).toBe(1);
    steps(s, 2);
    expect(s.cores).toBe(1);
  });
});

describe('bosses drop a core', () => {

  it('a boss kill puts a core on the ground that comes home in the haul and stays banked', () => {
    const s = alone(4);
    const c = s.controller;
    const h = s.spawnBoss('hornet');
    h.x = c.x + 100;
    h.y = c.y;
    (s as unknown as { damageHornet(h: unknown, d: number, by: unknown): void }).damageHornet(h, 99999, null);
    expect(h.dead).toBe(true);
    const cores = s.loot.filter((l) => l.kind === 'core');
    expect(cores).toHaveLength(BOSSES.hornet.drops.core);
    expect(cores.every((l) => Math.abs(l.x - h.x) < T * 2)).toBe(true); // beside the unique and the cache
    for (const l of cores) {
      c.x = l.x;
      c.y = l.y;
      steps(s, 0.3);
    }
    expect(s.cores).toBe(BOSSES.hornet.drops.core);
    s.finish();
    const haul = haulFrom(s, 'boss-1');
    expect(haul.cores).toBe(BOSSES.hornet.drops.core);
    const eco = bank(freshEconomy(), haul);
    expect(eco.cores).toBe(freshEconomy().cores + BOSSES.hornet.drops.core);
    expect(bank(eco, haul).cores).toBe(eco.cores); // the same haul twice changes nothing
  });
});
