import { describe, expect, it } from 'vitest';
import { TYPE_WRECK, type BiomeId } from './defs';
import { NO_INPUT, Sim } from './sim';
import { tap } from './testkit';
import { haulFrom } from '../hub/state';
import { BODY, buy, canBuild, fetchRobots, freshRoster, knownTypes } from '../hub/workshop';
import { freshEconomy } from '../hub/economy';
import { freshHub } from '../hub/state';

const run = (s: Sim, sec: number) => {
  for (let t = 0; t < sec; t += 1 / 30) s.step(1 / 30, NO_INPUT);
};
const BIOMES = Object.keys(TYPE_WRECK.role) as BiomeId[];
/** A land of this biome that has its type wreck place (a few seeds: a crowded land may drop it). */
function landWith(biome: BiomeId, types: string[] = []) {
  for (let i = 1; i < 12; i++) {
    const s = new Sim(`tw${i}`, [], biome, [], undefined, undefined, { crew: [], types });
    if (s.places.some((p) => p.id === 'type-wreck')) return s;
  }
  throw new Error(`no ${biome} land with a type wreck in 11 seeds`);
}
const wreckOf = (s: Sim) => s.places.find((p) => p.id === 'type-wreck')!;

describe('type wrecks (D2)', () => {
  it('each of the four lands holds its own type lying downed, found once mended', () => {
    for (const biome of BIOMES) {
      const s = landWith(biome);
      run(s, 0.2);
      const p = wreckOf(s);
      const b = p.bot!;
      expect(b.role).toBe(TYPE_WRECK.role[biome]);
      expect(b.downed).toMatchObject({ wreck: true, found: true });
      expect(s.fielded).not.toContain(b); // not yet one of ours
      s.controller.x = b.x - 20;
      s.controller.y = b.y;
      tap(s);
      expect(s.action?.bot).toBe(b);
      expect(s.action?.need).toBe(TYPE_WRECK.fix);
      run(s, TYPE_WRECK.fix + 0.5);
      expect(b.downed).toBeUndefined();
      expect(s.cores).toBe(1);
      expect(s.found).toEqual([{ name: b.name, role: b.role }]);
      run(s, 0.2);
      expect(p.state).toBe('up');
    }
  });

  it('the haul brings the mended robot aboard and its type becomes buildable', () => {
    const s = landWith('jungle');
    run(s, 0.2);
    const b = wreckOf(s).bot!;
    s.controller.x = b.x - 20;
    s.controller.y = b.y;
    tap(s);
    run(s, TYPE_WRECK.fix + 0.5);
    const haul = haulFrom({ ...s, parts: {}, crew: [], onLift: () => false } as never, 'h1');
    expect(haul.fetched).toEqual([{ name: b.name, role: 'lamplighter' }]);
    const before = freshRoster();
    expect(canBuild('lamplighter', before)).toBe(false);
    const after = fetchRobots(before, haul.fetched);
    expect(after.bots).toHaveLength(1);
    expect(after.bots[0]).toMatchObject({ role: 'lamplighter', wreck: false });
    expect(after.types).toEqual(['lamplighter']);
    expect(canBuild('lamplighter', after)).toBe(true);
    expect(canBuild('stalker', after)).toBe(false);
  });

  it('a type already found leaves an empty heap: no robot, no signal', () => {
    const s = landWith('city', ['stalker']);
    run(s, 0.2);
    const p = wreckOf(s);
    expect(p.bot).toBeUndefined();
    expect(p.state).toBe('empty');
    const tile = (m: Sim) => m.map.places.find((q) => q.id === 'type-wreck')!;
    expect(s.signals.some((x) => x.at.x === tile(s).x && x.at.y === tile(s).y)).toBe(false);
    const fresh = landWith('city');
    expect(fresh.signals.some((x) => x.at.x === tile(fresh).x && x.at.y === tile(fresh).y)).toBe(true);
  });

  it('the desert and the ether have none', () => {
    expect(new Sim('d1', [], 'desert', [], undefined, undefined, { crew: [] }).places.some((p) => p.id === 'type-wreck')).toBe(false);
  });
});

describe('type wrecks: the bench', () => {
  const shop = () => ({ eco: { ...freshEconomy(), scrap: 500, cores: 5 }, hub: { ...freshHub(), parts: { 'hornet-head': 9 } }, roster: freshRoster() });
  it('the four found types are locked until their wreck is mended; the first boss no longer opens them', () => {
    const r = freshRoster();
    expect(knownTypes(r).sort()).toEqual(['gatherer', 'guard', 'mule', 'repairer']);
    for (const role of ['marksman', 'boilermancer', 'lamplighter', 'stalker'] as const) {
      expect(BODY[role].found).toBeTruthy();
      expect(() => buy({ ...shop(), hub: { ...shop().hub, story: { bosses: ['x'], ghost: false, evil: false, wife: 'none' as const } } }, role)).toThrow(BODY[role].found);
    }
  });
  it('a found type builds; an owned one counts too (an older save)', () => {
    expect(buy({ ...shop(), roster: { ...freshRoster(), types: ['stalker'] } }, 'stalker').bot.role).toBe('stalker');
    const owned = { ...freshRoster(), bots: [{ uid: 'r1', name: 'Hush', role: 'stalker' as const, rank: 0, wreck: false }] };
    expect(canBuild('stalker', owned)).toBe(true);
  });
});
