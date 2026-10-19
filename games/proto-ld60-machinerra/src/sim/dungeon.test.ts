import { describe, expect, it } from 'vitest';
import { ECHO, KITS, LEVER, TWIST_IDS, dungeonDef, dungeonSpawns, flowField, generateDungeon, kitDrops, rollTwist, settleReward, specFor, type DungeonEvent, type Tier, type Twist } from './dungeon';
import { BIOMES, BOSSES, ELITE_TRAITS, FOES, MISSION, PARTS, START_CREW, T } from './defs';
import { generate, passable, Ter } from './mapgen';
import { NO_INPUT, Sim, type PartyBot } from './sim';
import { rideLift } from './testkit';

const TIER_IDS: Tier[] = [1, 2, 3];
type D = ReturnType<typeof generateDungeon>;
const reach = (d: D) => flowField(d.map, d.entry.cx, d.entry.cy);
const px = (v: number) => (v + 0.5) * T;

describe('generated dungeons', () => {
  it('every room is reachable from the way in, the rooms do not overlap, the den is reachable, the same seed gives the same dungeon', () => {
    for (const tier of TIER_IDS)
      for (const seed of [1, 2, 3, 77, 'abc', 'x:y']) {
        const d = generateDungeon(seed, 'desert', { tier });
        const field = reach(d);
        for (const r of d.rooms) expect(field[r.cy * d.map.w + r.cx], `tier ${tier} seed ${seed}`).toBeLessThan(Infinity);
        expect(field[d.den.cy * d.map.w + d.den.cx]).toBeLessThan(Infinity);
        expect(passable(d.map.ter[d.map.lift.y * d.map.w + d.map.lift.x])).toBe(true);
        for (const a of d.rooms) for (const b of d.rooms) if (a !== b) expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y, `rooms overlap, tier ${tier} seed ${seed}`).toBe(false);
        const again = generateDungeon(seed, 'desert', { tier });
        expect(again.rooms).toEqual(d.rooms);
        expect(again.spec).toEqual(d.spec);
        expect(Array.from(again.map.ter)).toEqual(Array.from(d.map.ter));
        const sp = dungeonSpawns(d, seed);
        expect(dungeonSpawns(d, seed)).toEqual(sp);
        for (const f of sp.foes) expect(passable(d.map.ter[f.y * d.map.w + f.x])).toBe(true);
        for (const w of sp.ambush) for (const f of w.foes) expect(passable(d.map.ter[f.y * d.map.w + f.x])).toBe(true);
        for (const l of sp.loot) expect(passable(d.map.ter[l.y * d.map.w + l.x])).toBe(true);
        expect(sp.foes.length).toBeGreaterThanOrEqual(2);
      }
  });
  it('rolls one twist per entrance, from the seed; every twist comes up; the tier does not move it; a forced one wins', () => {
    const seen = new Set<Twist | null>();
    for (let seed = 1; seed <= 80; seed++) {
      const spec = specFor(seed, 'desert');
      expect(TWIST_IDS).toContain(spec.twist);
      expect(specFor(seed, 'desert')).toEqual(spec);
      expect(specFor(seed, 'desert', { tier: 3 }).twist).toBe(spec.twist);
      expect(rollTwist(seed, 'desert')).toBe(spec.twist);
      seen.add(spec.twist);
    }
    expect([...seen].sort()).toEqual([...TWIST_IDS].sort());
    expect(specFor(1, 'desert', { twist: 'dark' }).twist).toBe('dark');
    expect(specFor(1, 'desert', { twist: null }).twist).toBeNull();
    expect(specFor(1, 'desert', { tier: 9 as Tier }).tier).toBe(3);
    expect(specFor(1, 'desert', { tier: 0 as Tier }).tier).toBe(1);
  });
});

describe('kits', () => {
  it('every biome has a kit that makes valid dungeons at every tier and twist; the built ones have an entrance on their lands', () => {
    for (const [biome, kit] of Object.entries(KITS) as [keyof typeof KITS, (typeof KITS)[keyof typeof KITS]][]) {
      expect(kit.foes.length).toBeGreaterThanOrEqual(1);
      expect(kitDrops(kit)).toContain(kit.material);
      for (const b of kit.bosses) expect(BOSSES[b], `${biome} boss ${b}`).toBeDefined();
      expect(kit.hazard.zones).toBeGreaterThan(1);
      expect(BIOMES[biome].places.includes('dungeon')).toBe(kit.built);
      if (kit.built) expect(generate(5, undefined, undefined, biome).places.some((p) => p.id === 'dungeon')).toBe(true);
      for (const tier of TIER_IDS)
        for (const twist of TWIST_IDS) {
          const d = generateDungeon(`k${tier}`, biome, { tier, twist });
          expect(reach(d)[d.den.cy * d.map.w + d.den.cx], `${biome} tier ${tier} ${twist}`).toBeLessThan(Infinity);
          expect(d.def.kit).toBe(kit);
        }
    }
  });
});

describe('rewards', () => {
  it("the mini-boss's weapon comes as the weapon once; owned already, its part stays a part for the workbench copy", () => {
    expect(PARTS['rattlejaw-fang'].item).toBe('fangWhip');
    expect(settleReward({ 'rattlejaw-fang': 1, 'snake-skin': 3 }, () => false)).toEqual({ items: ['fangWhip'], parts: { 'snake-skin': 3 } });
    expect(settleReward({ 'rattlejaw-fang': 1, 'snake-skin': 3 }, (i) => i === 'fangWhip')).toEqual({ items: [], parts: { 'rattlejaw-fang': 1, 'snake-skin': 3 } });
    expect(settleReward({ 'rattlejaw-fang': 2 }, () => false)).toEqual({ items: ['fangWhip'], parts: { 'rattlejaw-fang': 1 } });
  });
});

/** A seeded desert dungeon Sim, as Play runs it. */
const sim = (over: Parameters<typeof specFor>[2] = {}, party?: PartyBot[]) =>
  new Sim('t', [], 'desert', [], undefined, undefined, { dungeon: specFor('t', 'desert', over), dayT: 300, ...(party && { party }) });
const goto = (s: Sim, tx: number, ty: number) => {
  s.controller.x = px(tx);
  s.controller.y = px(ty);
};
const events = (s: Sim, what: DungeonEvent['what']) => s.events.filter((e): e is DungeonEvent => e.e === 'dungeon' && e.what === what);
/** Walk the Communicator through the chain (room by room, the way the player does), killing the den's boss, and climb out. Returns what happened. */
function playThrough(s: Sim) {
  s.god = true;
  const d = s.run!.d;
  const log = { rooms: [] as string[], ambushes: 0, boss: false, out: false };
  for (const rm of d.chain) {
    goto(s, rm.cx, rm.cy);
    for (let i = 0; i < 4; i++) s.step(0.05, NO_INPUT);
    log.ambushes += events(s, 'ambush').length;
    log.rooms.push(s.run!.summary().at);
    s.events.length = 0;
    for (const h of s.hornets) if (!h.boss) h.dead = true; // the party in a real run fights; here the point is the rooms
  }
  const b = s.denBoss!;
  b.hp = 1;
  goto(s, d.den.cx, d.den.cy);
  b.x = s.controller.x + 20;
  b.y = s.controller.y;
  for (let i = 0; i < 40 && !b.dead; i++) s.step(0.05, { ...NO_INPUT, ax: b.x, ay: b.y, fire: true });
  log.boss = b.dead;
  s.controller.x = s.lift.x;
  s.controller.y = s.lift.y;
  rideLift(s);
  log.out = s.phase === 'done';
  return log;
}

describe('a dungeon run', () => {
  it('the mini-boss drops its weapon part; holding Use on the lift climbs out', () => {
    const s = sim({ tier: 1 });
    s.god = true;
    const b = s.denBoss!;
    s.controller.x = b.x;
    s.controller.y = b.y + 20;
    b.hp = 1;
    // Its unique is a part that names a gear item (Play turns it into the item on the way up).
    s.step(0.05, { ...NO_INPUT, ax: b.x, ay: b.y, fire: true });
    for (let i = 0; i < 10 && !b.dead; i++) s.step(0.05, { ...NO_INPUT, ax: b.x, ay: b.y, fire: true });
    expect(b.dead).toBe(true);
    // Standing on it, he picks it up at once (or it lies there with a gold halo).
    expect(s.loot.some((l) => l.part === 'rattlejaw-fang') || s.parts['rattlejaw-fang'] === 1).toBe(true);
    // The den pays one insight, once.
    expect(s.insight).toBe(1);
    for (let i = 0; i < 20; i++) s.step(0.05, NO_INPUT);
    expect(s.insight).toBe(1);
    expect(s.run!.cleared).toBe(true);
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    rideLift(s);
    expect(s.phase).toBe('done');
  });
});

describe('the desert dungeon plays with each twist', () => {
  const pass = (tw: Twist | null, over = {}) => {
    const s = sim({ twist: tw, tier: 2, ...over });
    const log = playThrough(s);
    return { s, log };
  };
  it('a plain dungeon: through every room, the ambush wakes, the boss falls, up and out', () => {
    const { s, log } = pass(null);
    expect(log.boss).toBe(true);
    expect(log.out).toBe(true);
    expect(log.ambushes).toBeGreaterThanOrEqual(1);
    expect(s.run!.cleared).toBe(true);
    expect(s.insight).toBe(1);
  });
  describe('Echoing', () => {
    // The Communicator stands in the way in; one foe waits in the next room along the chain, out of its own sight range.
    const setup = (twist: Twist | null) => {
      const s = sim({ twist, tier: 2 });
      s.god = true;
      const d = s.run!.d;
      for (const h of s.hornets) h.dead = true;
      s.hornets.length = 0;
      goto(s, d.chain[0].cx, d.chain[0].cy);
      const next = d.chain[1];
      const foe = s.spawnHornet(px(next.cx), px(next.cy), 0, false, false, 'snake');
      s.give('steamGun');
      s.equip('steamGun', 'primary');
      s.events.length = 0;
      return { s, foe, from: { x: s.controller.x, y: s.controller.y } };
    };
    const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    const shoot = (s: Sim, steps = 3) => {
      for (let i = 0; i < steps; i++) s.step(0.05, { ...NO_INPUT, ax: s.controller.x - 200, ay: s.controller.y, fire: true });
    };
    it('a shot pulls a neighbouring room\'s foes toward where it was made; the same shot in a plain dungeon does not', () => {
      const echo = setup('echoing'), plain = setup(null);
      // Out of its own sight range, so only the noise can bring it.
      expect(gap(echo.foe, echo.from)).toBeGreaterThan(FOES.snake.aggroTiles * T * 1.3);
      for (const w of [echo, plain]) shoot(w.s);
      expect(echo.foe.hear).toBeDefined();
      expect(plain.foe.hear).toBeUndefined();
      expect(events(echo.s, 'echo').length).toBe(1);
      expect(events(echo.s, 'echo')[0].heard).toContain(echo.foe);
      expect(events(plain.s, 'echo').length).toBe(0);
      expect(echo.s.said.has('echo')).toBe(true);
      expect(plain.s.said.has('echo')).toBe(false);
      const before = [gap(echo.foe, echo.from), gap(plain.foe, plain.from)];
      for (const w of [echo, plain]) for (let i = 0; i < 40; i++) w.s.step(0.05, NO_INPUT);
      expect(gap(echo.foe, echo.from)).toBeLessThan(before[0] - T);
      expect(gap(plain.foe, plain.from)).toBeGreaterThan(before[1] - T); // it only wanders where it stands
    });
    it('only idle foes come (not those already after someone), and a noise is carried at most once per ECHO.every seconds', () => {
      const { s, foe } = setup('echoing');
      foe.target = s.controller.id;
      s.noise(s.controller.x, s.controller.y);
      expect(foe.hear).toBeUndefined();
      foe.target = 0;
      s.noise(s.controller.x, s.controller.y);
      expect(s.run!.echoes).toBe(1);
      s.noise(s.controller.x, s.controller.y);
      expect(s.run!.echoes).toBe(1);
      for (let i = 0; i < ECHO.every / 0.1 + 2; i++) s.step(0.1, NO_INPUT);
      foe.hear = undefined;
      s.noise(s.controller.x, s.controller.y);
      expect(s.run!.echoes).toBe(2);
    });
  });
});

describe('the rooms at work', () => {
  const find = (pred: (d: D) => boolean, over: Parameters<typeof specFor>[2]) => {
    for (let i = 1; i < 200; i++) if (pred(generateDungeon(`r${i}`, 'desert', over))) return `r${i}`;
    throw new Error('no seed');
  };
  const make = (seed: string, over: Parameters<typeof specFor>[2]) => new Sim(seed, [], 'desert', [], undefined, undefined, { dungeon: specFor(seed, 'desert', over), dayT: 300 });

  it('the lever opens the gate, and the shortcut gets him from the den to the way in faster', () => {
    const seed = find((d) => !!d.lever, { tier: 2, twist: null });
    const s = make(seed, { tier: 2, twist: null });
    const { d } = s.run!;
    const g = d.gate!;
    const lift = { x: Math.floor(s.lift.x / T), y: Math.floor(s.lift.y / T) };
    const fromDen = () => flowField(s.map, d.den.cx, d.den.cy)[lift.y * s.W + lift.x];
    const shut = fromDen();
    expect(s.map.ter[g.y * s.W + g.x]).toBe(Ter.Rock);
    // Use away from the lever does nothing; a press beside it pulls it; holding Use does not pull it twice.
    goto(s, d.entry.cx, d.entry.cy);
    s.step(0.05, { ...NO_INPUT, use: true });
    expect(s.run!.lever).toBe('shut');
    s.step(0.05, NO_INPUT);
    goto(s, d.lever!.x + 1, d.lever!.y + 1);
    s.step(0.05, NO_INPUT);
    s.step(0.05, { ...NO_INPUT, use: true });
    expect(s.run!.lever).toBe('open');
    expect(events(s, 'lever').length).toBe(1);
    for (let y = g.y; y < g.y + g.h; y++) for (let x = g.x; x < g.x + g.w; x++) expect(passable(s.map.ter[y * s.W + x])).toBe(true);
    expect(fromDen()).toBeLessThan(shut * 0.8);
    expect(LEVER.reach).toBeGreaterThan(1);
  });
});

describe('the party below (D16)', () => {
  const party = START_CREW.map((c, i) => ({ ...c, hp: 20 + i }));
  const mk = () => sim({ tier: 2 }, party);
  it('every robot handed down comes, in crew 0, with its oil; crew commands do nothing', () => {
    const s = mk();
    expect(s.party.map((b) => b.name)).toEqual(START_CREW.map((c) => c.name));
    expect(s.party.every((b) => b.crew === 0)).toBe(true);
    expect(s.party.map((b) => b.hp)).toEqual(party.map((p) => p.hp));
    s.assign(s.party[0].id, 2);
    s.order(2, s.lift.x + 200, s.lift.y);
    expect(s.party[0].crew).toBe(0);
    expect(s.orders[2]).toBeFalsy();
  });
});

describe('a kit with no designed mini-boss', () => {
  it("any kit emptied of its mini-bosses falls back the same way (traitless foes: the biome's, or hornets)", () => {
    const old = KITS.jungle.bosses;
    KITS.jungle.bosses = [];
    try {
      for (const seed of ['a', 'b', 'c', 1, 2]) {
        const e = dungeonDef(seed, 'jungle').elite!;
        expect(e).not.toBeNull();
        expect(e.traits.length).toBe(2);
        expect(e.traits.every((t) => ELITE_TRAITS[t].kind === e.kind)).toBe(true);
      }
      const s = new Sim('t', [], 'jungle', [], undefined, undefined, { dungeon: specFor('t', 'jungle', { tier: 2 }), dayT: 300 });
      expect(s.denBoss?.elite).toBe(true);
      expect(s.denBoss?.boss).toBe(false);
    } finally {
      KITS.jungle.bosses = old;
    }
  });
});
