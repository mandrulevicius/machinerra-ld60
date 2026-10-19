import { describe, expect, it } from 'vitest';
import { EXIT, HANDCRAFTED, KITS, flowField, generateDungeon, specFor, type DungeonEvent } from './dungeon';
import { MISSION, T, type BiomeId } from './defs';
import { passable, Ter, type MapData } from './mapgen';
import { NO_INPUT, Sim, type PartyBot } from './sim';
import { rideLift, tap } from './testkit';

const dungeon = (party?: PartyBot[], biome: BiomeId = 'desert', over: Parameters<typeof specFor>[2] = { twist: null, tier: 2 }) =>
  new Sim('t', [], biome, [], undefined, undefined, { dungeon: specFor('t', biome, over), dayT: 300, ...(party && { party }) });
const crew3: PartyBot[] = [
  { role: 'guard', name: 'A', hp: 100 },
  { role: 'gatherer', name: 'B', hp: 100 },
  { role: 'marksman', name: 'C', hp: 100 },
];
const events = (s: Sim, what: DungeonEvent['what']) => s.events.filter((e): e is DungeonEvent => e.e === 'dungeon' && e.what === what);
const kill = (s: Sim) => {
  for (const h of s.hornets) if (!h.boss) h.dead = true;
  s.slay(s.denBoss!);
  s.step(0.05, NO_INPUT);
};
/** Beside the wall on the den's side, facing it. */
const beside = (s: Sim) => {
  const w = s.run!.wallAt();
  s.controller.x = w.x - w.hw - 24;
  s.controller.y = w.y;
  return w;
};
const tileOf = (s: Sim, x: number, y: number) => s.map.ter[y * s.W + x];

describe("the den's cracked wall: layout", () => {
  it("every dungeon has one, on the den's east side: rock to the Sim, floor to the painter, reachable only through the den", () => {
    const cases: [BiomeId, Parameters<typeof specFor>[2]][] = [];
    for (const biome of Object.keys(KITS) as BiomeId[]) for (const tier of [1, 2, 3] as const) cases.push([biome, { tier }]);
    for (const [id, h] of Object.entries(HANDCRAFTED)) cases.push([h.biome, { handcrafted: id }]);
    for (const [biome, over] of cases) {
      for (const seed of ['a', 'b', 7]) {
        const d = generateDungeon(seed, biome, over);
        const e = d.exit;
        expect(e.w).toBe(EXIT.w);
        expect(e.h).toBe(EXIT.h);
        const field = flowField(d.map, d.entry.cx, d.entry.cy);
        for (let y = e.y; y < e.y + e.h; y++)
          for (let x = e.x; x < e.x + e.w; x++) {
            expect(d.map.ter[y * d.map.w + x], `${biome} ${seed}: wall is rock`).toBe(Ter.Rock);
            expect(d.paintMap.ter[y * d.map.w + x], `${biome} ${seed}: the painter sees floor`).not.toBe(Ter.Rock);
            expect(field[y * d.map.w + x]).toBe(Infinity);
          }
        // It leans on the den: the tile before each wall row is the den's floor.
        for (let y = e.y; y < e.y + e.h; y++) {
          expect(passable(d.map.ter[y * d.map.w + e.x - 1])).toBe(true);
          expect(d.den.x + d.den.w).toBe(e.x);
        }
        // Opened, the niche is reachable from the way in; nothing else touches it.
        const open: MapData = { ...d.map, ter: d.map.ter.slice() };
        for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) open.ter[y * d.map.w + x] = Ter.Hardpan;
        expect(flowField(open, d.entry.cx, d.entry.cy)[(e.y + 2) * d.map.w + e.x]).toBeLessThan(Infinity);
      }
    }
  });
});

describe("the den's cracked wall: breaking it", () => {
  it('is ordinary wall until the boss falls: blows do nothing', () => {
    const s = dungeon();
    const w = beside(s);
    expect(s.run!.wall).toBe('plain');
    expect(s.run!.blow(w.x, w.y)).toBe(false);
    expect(s.run!.swingWall(w.x - w.hw - 10, w.y, 0, 50, 2)).toBe(false);
    for (let i = 0; i < 6; i++) s.step(1, { ...NO_INPUT, kick: true, ax: w.x, ay: w.y });
    expect(s.run!.blows).toBe(0);
    expect(tileOf(s, s.run!.d.exit.x, s.run!.d.exit.y)).toBe(Ter.Rock);
  });

  it("shows when the boss falls: the crack, an event, the Oracle's line and the objective", () => {
    const s = dungeon();
    kill(s);
    expect(s.run!.wall).toBe('cracked');
    expect(events(s, 'cracked').length).toBe(1);
    expect(s.said.has('wall-cracked')).toBe(true);
    expect(s.objective).toContain('cracked wall');
    expect(s.summary().dungeon?.wall).toBe('cracked');
  });

  it('breaks after EXIT.blows kicks, and the gap is passable', () => {
    const s = dungeon();
    kill(s);
    const w = beside(s), e = s.run!.d.exit;
    for (let i = 0; i < EXIT.blows - 1; i++) {
      s.step(1, { ...NO_INPUT, kick: true, ax: w.x, ay: w.y });
      expect(s.run!.wall).toBe('cracked');
      expect(tileOf(s, e.x, e.y)).toBe(Ter.Rock);
    }
    s.step(1, { ...NO_INPUT, kick: true, ax: w.x, ay: w.y });
    expect(s.run!.blows).toBe(EXIT.blows);
    expect(s.run!.wall).toBe('open');
    expect(events(s, 'wallBreak').length).toBe(1);
    for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) expect(passable(tileOf(s, x, y))).toBe(true);
    expect(s.objective).toContain('opening');
  });

  it('shots break it too; a kick facing away does not', () => {
    const s = dungeon();
    s.give('steamGun');
    s.equip('steamGun', 'primary');
    kill(s);
    const w = beside(s);
    s.step(1, { ...NO_INPUT, kick: true, ax: w.x - 500, ay: w.y });
    expect(s.run!.blows).toBe(0);
    for (let i = 0; i < 80 && s.run!.wall !== 'open'; i++) s.step(0.05, { ...NO_INPUT, fire: true, ax: w.x, ay: w.y });
    expect(s.run!.wall).toBe('open');
  });
});

describe('the way up through the opening', () => {
  const opened = () => {
    const s = dungeon(crew3);
    kill(s);
    s.run!.breakWall();
    return s;
  };
  const stand = (s: Sim) => {
    const w = s.run!.wallAt();
    s.controller.x = w.x;
    s.controller.y = w.y;
  };

  it('E, then E rides it like the lift, in the same time; before it is open E there does nothing', () => {
    const closed = dungeon(crew3);
    kill(closed);
    beside(closed);
    tap(closed);
    expect(closed.armed).toBeNull();

    const s = opened();
    stand(s);
    tap(s);
    expect(s.armed?.key).toBe('lift');
    expect(s.phase).toBe('mission');
    tap(s);
    expect(s.phase).toBe('rising');
    expect(s.exitUsed).toBe(true);
    for (let t = 0; t < MISSION.riseTime - 0.5; t += 0.1) s.step(0.1, NO_INPUT);
    expect(s.phase).toBe('rising');
    for (let t = 0; t < 1; t += 0.1) s.step(0.1, NO_INPUT);
    expect(s.phase).toBe('done');
    // The lift in the entry room, after the same clearing, takes the same time.
    const l = dungeon(crew3);
    kill(l);
    l.controller.x = l.lift.x;
    l.controller.y = l.lift.y;
    rideLift(l);
    expect(l.phase).toBe('done');
    expect(l.exitUsed).toBe(false);
  });

  it('the whole party comes up, wherever it was, and none is left behind', () => {
    const s = opened();
    // They are scattered round the dungeon: the entry, a room between, the den's far end.
    const far = [s.run!.d.entry, s.run!.d.chain[1], s.run!.d.den];
    s.crew.forEach((b, i) => {
      b.x = (far[i].cx + 0.5) * T;
      b.y = (far[i].cy + 0.5) * T;
    });
    stand(s);
    const w = s.run!.wallAt();
    rideLift(s);
    expect(s.phase).toBe('done');
    expect(s.stats.saved).toBe(3);
    expect(s.stats.left).toBe(0);
    for (const b of s.crew) expect(Math.hypot(b.x - w.x, b.y - w.y)).toBeLessThan(MISSION.liftTiles * T * 1.6);
    expect(s.said.has('rise')).toBe(true);
  });

  it('the old lift carries the whole party too once the den is cleared; before, the ones off the lift are left', () => {
    const gather = (s: Sim) => {
      const d = s.run!.d;
      s.crew.forEach((b) => ((b.x = (d.den.cx + 0.5) * T), (b.y = (d.den.cy + 0.5) * T)));
      s.controller.x = s.lift.x;
      s.controller.y = s.lift.y;
    };
    const lone = dungeon(crew3);
    gather(lone);
    rideLift(lone);
    expect(lone.stats.left).toBe(3);

    const cleared = dungeon(crew3);
    kill(cleared);
    gather(cleared);
    rideLift(cleared);
    expect(cleared.stats.saved).toBe(3);
    expect(cleared.stats.left).toBe(0);
  });
});

describe('the lift is safe while it rises', () => {
  it('no damage and no statuses for the Communicator and every robot on the platform; debuffs already on them end; one off the platform is hurt', () => {
    const s = new Sim('t', [], 'desert');
    const c = s.controller;
    c.x = s.lift.x;
    c.y = s.lift.y;
    const [on, off] = [s.crew[0], s.crew[1]];
    on.x = s.lift.x + 20;
    on.y = s.lift.y;
    off.x = s.lift.x + 900;
    off.y = s.lift.y;
    s.engine.apply(c, 'burning');
    s.engine.apply(on, 'shocked');
    expect(s.engine.status(c, 'burning')).toBeDefined();
    tap(s);
    tap(s);
    expect(s.phase).toBe('rising');
    expect(s.engine.status(c, 'burning')).toBeUndefined();
    expect(s.engine.status(on, 'shocked')).toBeUndefined();
    const hp = [c.hp, on.hp, off.hp];
    for (const b of [c, on, off]) s.hurt(b, 25, false, { type: 'fire' });
    for (const b of [c, on]) {
      expect(s.engine.apply(b, 'burning')).toBe(false);
      expect(s.engine.apply(b, 'staggered')).toBe(false);
    }
    expect(c.hp).toBe(hp[0]);
    expect(on.hp).toBe(hp[1]);
    expect(off.hp).toBeLessThan(hp[2]);
    for (let t = 0; t < 1; t += 0.1) s.step(0.1, NO_INPUT);
    expect(c.hp).toBe(hp[0]);
  });

  it('in a cleared den it covers the whole party', () => {
    const s = dungeon(crew3);
    kill(s);
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    tap(s);
    tap(s);
    const hp = s.crew.map((b) => b.hp);
    for (const b of s.crew) s.hurt(b, 30, false, { type: 'fire' });
    s.crew.forEach((b, i) => expect(b.hp).toBe(hp[i]));
  });

  it('is only while rising: before the second press he can be hurt', () => {
    const s = new Sim('t', [], 'desert');
    s.controller.x = s.lift.x;
    s.controller.y = s.lift.y;
    tap(s); // only the ask
    const hp = s.controller.hp;
    s.hurt(s.controller, 10, false, { type: 'fire' });
    expect(s.controller.hp).toBeLessThan(hp);
  });
});
