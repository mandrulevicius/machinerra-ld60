import { describe, expect, it } from 'vitest';
import { WORKBENCH, ARRIVE, DECK, PACE, connected, hubSpeed, strideLevel, openLots, ROOMS, SLOTS, SPOTS, STATIONS, LOT_PROPS, NPC_REACH, lotProps, setBuilt, stationAt, walkable } from './layout';
import { LOT_BUILDINGS, NPCS, STATION_COSTS, build, claim, freshHub, haulFrom, isWorking, migrateHub, unrescue, withBench, nextSeed, relocate, rescue, stationCost, waiting } from './state';

describe('NPC stations', () => {
  it('a rescued NPC waits in the centre until its station is built on a free lot, then works and gives one thing free', () => {
    let s = rescue(freshHub(), 'kicker');
    expect(waiting(s).map((n) => n.id)).toEqual(['kicker']);
    expect(isWorking(s, 'kicker')).toBe(false);
    expect(() => claim(s, 'kicker')).toThrow();
    s = build(s, 'kicker', 'slot-5');
    expect(waiting(s)).toEqual([]);
    expect(isWorking(s, 'kicker')).toBe(true);
    s = claim(s, 'kicker');
    expect(s.perks).toEqual(['kick']);
    expect(claim(s, 'kicker').perks).toEqual(['kick']); // once
    expect(stationCost(s)).toBe(STATION_COSTS[1]);
  });

  it('no station on a taken lot, twice, or for someone not aboard (the copper is buildStation in economy.test.ts)', () => {
    const rich = rescue(freshHub(), 'all');
    const one = build(rich, 'trader', 'slot-1');
    expect(() => build(one, 'kicker', 'slot-1')).toThrow(/taken/);
    expect(() => build(one, 'trader', 'slot-2')).toThrow(/already/);
    expect(() => build(freshHub(), 'trader', 'slot-2')).toThrow(/not aboard/);
    expect(() => build(rich, 'highPriest', 'slot-2')).toThrow(/no station/);
    expect(isWorking(rich, 'highPriest')).toBe(true);
  });
});

describe("Sprocket's station is the workbench", () => {
  it('stands by itself the day she is aboard: no lot, no price, and never moved', () => {
    let s = rescue(freshHub(), 'sprocket');
    expect(s.stations.sprocket).toBe(WORKBENCH);
    expect(waiting(s)).toEqual([]);
    expect(isWorking(s, 'sprocket')).toBe(true);
    expect(() => build(s, 'sprocket', 'slot-5')).toThrow(/already/);
    expect(stationCost(s)).toBe(STATION_COSTS[0]); // the next one is the first paid
    s = rescue(rescue(s, 'hob'), 'cityPlanner');
    s = build(s, 'hob', 'slot-5');
    expect(stationCost(s)).toBe(STATION_COSTS[1]);
    expect(() => relocate(build(s, 'cityPlanner', 'slot-8'), 'sprocket', 'slot-6')).toThrow(/workbench/);
    expect(unrescue(s, 'hob').stations).toEqual({ sprocket: WORKBENCH, hob: 'slot-5' }); // a lot stays as built
    expect(unrescue(s, 'sprocket').stations.sprocket).toBeUndefined();
    expect(stationAt(WORKBENCH).npc).toEqual(SPOTS.workshop);
  });
  it('an old save finds it: aboard with no station gets the workbench, one built on a lot keeps it', () => {
    const old = { ...freshHub(), rescued: ['sprocket'] };
    expect((migrateHub(old, 3) as ReturnType<typeof freshHub>).stations.sprocket).toBe(WORKBENCH);
    const onLot = { ...old, stations: { sprocket: 'slot-5' } };
    expect((migrateHub(onLot, 3) as ReturnType<typeof freshHub>).stations.sprocket).toBe('slot-5');
    expect(withBench(freshHub()).stations).toEqual({});
  });
});

describe('the deck has a lot for everything that stands on it', () => {
  it('every NPC station, your house and the improvements go up on their own lot, and a lot is left over (the workbench needs none)', () => {
    const makers = [...NPCS.filter((n) => n.station && n.id !== 'sprocket'), ...LOT_BUILDINGS];
    let s = rescue(freshHub(), 'all');
    for (const n of makers) {
      const lot = openLots(Object.values(s.stations))[0];
      expect(lot, `a lot for ${n.id}`).toBeDefined();
      s = build(s, n.id, lot.id, true);
    }
    const lots = Object.values(s.stations).filter((l) => l !== WORKBENCH);
    expect(new Set(lots).size).toBe(makers.length);
    expect(connected(lots)).toBe(true);
    expect(SLOTS.length - makers.length).toBeGreaterThanOrEqual(3);
  });
});

describe('the City Planner redraws the deck', () => {
  const rich = () => rescue(freshHub(), 'all');
  it('only once her drafting office stands; then a station moves to a free lot or swaps with another, free', () => {
    let s = build(rich(), 'kicker', 'slot-5');
    expect(() => relocate(s, 'kicker', 'slot-6')).toThrow(/City Planner/);
    s = build(s, 'cityPlanner', 'slot-8');
    s = relocate(s, 'kicker', 'slot-6');
    expect(s.stations.kicker).toBe('slot-6');
    s = relocate(s, 'kicker', 'slot-8');
    expect(s.stations).toEqual({ sprocket: WORKBENCH, kicker: 'slot-8', cityPlanner: 'slot-6' });
    expect(relocate(s, 'kicker', 'slot-8')).toBe(s);
    expect(() => relocate(s, 'trader', 'slot-1')).toThrow(/no station/);
  });
  it('not onto open air, and never cutting another station off the deck', () => {
    let s = build(rich(), 'cityPlanner', 'slot-8');
    const far = SLOTS.find((l) => !openLots(['slot-8']).some((o) => o.id === l.id) && l.id !== 'slot-8')!;
    expect(() => relocate(s, 'cityPlanner', far.id)).toThrow(/does not join/);
    // A chain: a lot joined only through the one next to it.
    const free = openLots([]).map((l) => l.id);
    const inner = free[0];
    const outer = openLots([inner]).find((l) => !free.includes(l.id))?.id;
    if (!outer) return;
    s = build(build(s, 'kicker', inner), 'trader', outer);
    expect(connected(Object.values(s.stations))).toBe(true);
    const elsewhere = openLots(Object.values(s.stations)).find((l) => l.id !== inner && free.includes(l.id) && !connected([l.id, outer, 'slot-8']))?.id;
    if (elsewhere) expect(() => relocate(s, 'kicker', elsewhere)).toThrow(/cut/);
  });
});

describe('hub state', () => {

  it('the next seed replays from the save and changes with a new course', () => {
    const s = freshHub();
    expect(nextSeed(s)).toBe(nextSeed(freshHub()));
    expect(nextSeed({ ...s, course: 1 })).not.toBe(nextSeed(s));
  });

  it('only robots standing on the lift come home', () => {
    const lift = { x: 0, y: 0 };
    const m = {
      copper: 50.9,
      parts: {},
      crew: [{ name: 'A', role: 'gatherer', dead: false, x: 0, y: 0 }, { name: 'B', role: 'guard', dead: false, x: 900, y: 0 }, { name: 'C', role: 'guard', dead: true, x: 0, y: 0 }],
      onLift: (b: { x: number; y: number }) => Math.hypot(b.x - lift.x, b.y - lift.y) < 50,
    };
    expect(haulFrom(m, 'x')).toEqual({ id: 'x', copper: 50, parts: {}, robots: [{ name: 'A', role: 'gatherer' }] });
    // The land's tier comes home with the haul: the hub's light by it.
    expect(haulFrom({ ...m, tier: 2 }, 'x').tier).toBe(2);
  });
});

describe('hub layout', () => {

  it('the hatch, every station and every spot stand on the floor', () => {
    expect(walkable(ARRIVE.x, ARRIVE.y)).toBe(true);
    for (const s of STATIONS) expect(walkable(s.x, s.y + 40), s.id).toBe(true);
    for (const [id, p] of Object.entries(SPOTS)) expect(walkable(p.x, p.y + 80), id).toBe(true); // where `hub goto` puts the Communicator
  });

  it('every room is reached from the hatch along the catwalks, and every building lot is open air', () => {
    // Flood the floor on a 10 px grid from the hatch.
    const seen = new Set<string>();
    const todo = [[Math.round(ARRIVE.x / 10), Math.round(ARRIVE.y / 10)]];
    while (todo.length) {
      const [x, y] = todo.pop()!;
      const k = `${x},${y}`;
      if (seen.has(k) || !walkable(x * 10, y * 10)) continue;
      seen.add(k);
      todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    for (const r of ROOMS) expect(seen.has(`${Math.round((r.x + r.w / 2) / 10)},${Math.round((r.y + r.h - 40) / 10)}`), r.id).toBe(true);
    expect(SLOTS.length).toBe(14);
    for (const s of SLOTS) {
      expect(walkable(s.x + s.w / 2, s.y + s.h / 2), s.id).toBe(false);
      expect(ROOMS.some((r) => r.x < s.x + s.w && s.x < r.x + r.w && r.y < s.y + s.h && s.y < r.y + r.h), s.id).toBe(false);
    }
  });

  it("a station's props stand on its lot and leave its NPC in reach from the hatch, on any lot", () => {
    for (const lot of SLOTS) {
      setBuilt([lot.id]);
      const at = stationAt(lot.id);
      // The floor does not change between the lot's props: look each cell up once.
      const floor = new Map<number, boolean>();
      const open = (x: number, y: number) => {
        const k = (x + 1000) * 4096 + y + 1000;
        let w = floor.get(k);
        if (w === undefined) floor.set(k, (w = walkable(x * 10, y * 10)));
        return w;
      };
      for (const id of Object.keys(LOT_PROPS)) {
        const props = lotProps(id, lot.id);
        const blocks = [{ ...at, r: 86 }, ...props, { ...at.npc, r: 34 }];
        for (const p of props) expect(walkable(p.x, p.y), `${id} ${p.kind} on ${lot.id}`).toBe(true);
        // Flood from the hatch with the props in the way; someone must get within talking reach of the NPC.
        const free = (x: number, y: number) => open(x, y) && blocks.every((b) => Math.hypot(x * 10 - b.x, (y * 10 - b.y) * 1.6) >= b.r);
        const seen = new Set<number>();
        const todo = [[Math.round(ARRIVE.x / 10), Math.round(ARRIVE.y / 10)]];
        let reached = false;
        while (todo.length && !reached) {
          const [x, y] = todo.pop()!;
          const k = (x + 1000) * 4096 + y + 1000;
          if (seen.has(k) || !free(x, y)) continue;
          seen.add(k);
          if (Math.hypot(x * 10 - at.npc.x, y * 10 - at.npc.y) < NPC_REACH - 10) reached = true;
          todo.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        expect(reached, `${id} on ${lot.id}`).toBe(true);
      }
    }
    setBuilt([]);
  });
});

/** Seconds to walk `d` px from a standstill: the ramp from `slow` to `fast`, then the stride. */
function walkTime(d: number) {
  const ramped = ((PACE.slow + PACE.fast) / 2) * PACE.ramp; // px covered while speeding up
  if (d >= ramped) return PACE.ramp + (d - ramped) / PACE.fast;
  let t = 0;
  for (let x = 0; x < d; t += 0.01) x += hubSpeed(t) * 0.01;
  return t;
}

describe('crossing the hub', () => {
  it('speeds up from slow to the stride over the ramp and no further', () => {
    expect(hubSpeed(0)).toBe(PACE.slow);
    expect(hubSpeed(PACE.ramp / 2)).toBeGreaterThan(PACE.slow);
    expect(hubSpeed(PACE.ramp)).toBe(PACE.fast);
    expect(hubSpeed(99)).toBe(PACE.fast);
  });

  it('shows a stride only once the step has settled', () => {
    expect(strideLevel(PACE.slow)).toBe(0);
    expect(strideLevel(hubSpeed(PACE.ramp * 0.5))).toBe(0);
    expect(strideLevel(hubSpeed(PACE.ramp * 0.8))).toBeGreaterThan(0);
    expect(strideLevel(PACE.fast)).toBe(1);
  });

  it('with every lot built, any station is a few seconds from any other, round the booths and props', () => {
    setBuilt(SLOTS.map((l) => l.id));
    const kinds = Object.keys(LOT_PROPS);
    const blocks = SLOTS.flatMap((l, i) => [{ ...stationAt(l.id), r: 86 }, ...lotProps(kinds[i % kinds.length], l.id), { ...stationAt(l.id).npc, r: 34 }]);
    const free = (x: number, y: number) => walkable(x, y) && blocks.every((b) => Math.hypot(x - b.x, (y - b.y) * 1.6) >= b.r);
    const G = 10, N = Math.ceil(DECK.w / G);
    const floor = Array.from({ length: N * N }, (_, i) => free((i % N) * G, Math.floor(i / N) * G));
    // The places to stand: the hatch, the course table, the bench, the lever, the window, and in reach of each lot's NPC.
    const spots = [ARRIVE, ...STATIONS, ...SLOTS.map((l) => stationAt(l.id).npc)];
    const nearest = (p: { x: number; y: number }) => {
      let best = -1, bd = Infinity;
      for (let gy = Math.max(0, Math.floor((p.y - 100) / G)); gy < Math.min(N, Math.ceil((p.y + 100) / G)); gy++)
        for (let gx = Math.max(0, Math.floor((p.x - 100) / G)); gx < Math.min(N, Math.ceil((p.x + 100) / G)); gx++) {
          const d = Math.hypot(gx * G - p.x, gy * G - p.y);
          if (d < bd && d < NPC_REACH - 20 && floor[gy * N + gx]) (best = gy * N + gx), (bd = d);
        }
      return best;
    };
    const cells = spots.map(nearest);
    cells.forEach((c, i) => expect(c, `spot ${i} has floor in reach`).toBeGreaterThanOrEqual(0));
    let worst = 0;
    for (const from of cells) {
      // Dial's algorithm: straight steps cost 10, diagonals 14.
      const dist = new Map<number, number>([[from, 0]]);
      const buckets: number[][] = [[from]];
      for (let d = 0; d < buckets.length; d++)
        for (const c of buckets[d] ?? []) {
          if (dist.get(c) !== d) continue;
          const cx = c % N, cy = (c - cx) / N;
          for (const [dx, dy, w] of [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]]) {
            const x = cx + dx, y = cy + dy;
            if (x < 0 || y < 0 || x >= N || y >= N || !floor[y * N + x]) continue;
            const n = y * N + x;
            if (d + w < (dist.get(n) ?? Infinity)) (dist.set(n, d + w), (buckets[d + w] ??= []).push(n));
          }
        }
      for (const to of cells) {
        const d = dist.get(to);
        expect(d, 'every spot reaches every other').toBeDefined();
        worst = Math.max(worst, walkTime(d!)); // grid units cost 10 per cell of 10 px: the cost is px
      }
    }
    expect(worst).toBeLessThan(6.5); // about 6.2 s with the 1.2 s ramp from 120 to the 370 px/s stride (5.8 s with the 0.5 s ramp from 190)
    setBuilt([]);
  });
});

