/**
 * P47's buildings (`plans/P47-remnants.md`): ruins as remnants of buildings with a purpose, hive villages, the faded city. Plain TS.
 * - **Stamping** (`stamp`): a blueprint (`defs/buildings.ts`) turned and mirrored onto the land becomes wall props along its rooms'
 *   edges (doorways left open), furniture, loot smashables and a floor. Walls on rock are left out.
 * - **Intactness** (0 a faded outline, 1 intact), rolled per building: low takes whole wall runs away and holes the rest, wears
 *   every piece and leaves furniture out. It is the building's remaining health (P39): `intactness` is the rolled share times
 *   what is left of its pieces' health since, so a building battered in a fight drops.
 * - **Rewards** (part C): the blueprint's size and rooms set how many loot smashables it holds (`lootCount`); its intactness at
 *   search time sets how special its centrepiece's find is (`tierOf`; the drop itself is `use.ts` `tierFind`).
 * - **Placing** (`placeBuildings`, called by `propgen.ts` for a land from mission 4): each ruin tries the biggest blueprint that
 *   fits its find and its ground, a hive gets its village (a hall round it, huts, turrets by the land's tier), and the city and
 *   desert get a faded district. Anything that does not fit keeps today's look.
 * Walls are P39 props, one a tile (`docs/findings/performance.md` "Walls and y-sorted scenery": under ~1000-1500 a land, drawn
 * from the pooled atlas sprites P51 built). Tests: `buildings.test.ts`.
 */
import type { Rng } from '../../../../harness/kit/rng';
import {
  BLUEPRINTS, BUILD, COAL, ERA_SHARE, ERA_WALLS, FADED, MATERIALS, PROPS, RUIN, RUIN_BLUEPRINTS, T, VILLAGE, WALL_MATERIAL,
  type BiomeId, type Blueprint, type BlueprintId, type Era, type FloorKind, type Material, type PropKind, type RuinKind,
} from './defs';
import type { Sim } from './sim';

interface Spot { x: number; y: number }

/** What the generator decides about a prop (tile coordinates); the shape `propgen.ts` `PropSpec` has. */
export interface BuiltProp {
  kind: PropKind;
  x: number;
  y: number;
  material?: Material;
  wear: number;
  bld?: number;
}

/** A building on the land (tiles). `ruins` are the indices (in `MapData.ruins`) of the finds inside it, its heart's first. */
export interface BuildingSpec {
  bp: BlueprintId;
  /** Its footprint's top-left and size once turned. */
  x: number;
  y: number;
  w: number;
  h: number;
  turn: number;
  mirror: boolean;
  /** Rolled intactness (the pieces' health at the start); `intactness` reads it live. */
  intact: number;
  era: Era;
  material: Material;
  floor: FloorKind;
  /** Floor tiles (tile indices: y * landW + x), rock left out. */
  cells: number[];
  /** Its pieces' health as stamped (`intactness` scales the roll by what is left of it). */
  hp0: number;
  ruins: number[];
  /** The hive (index in `MapData.nests`) whose hall or hut it is. */
  village?: number;
  faded?: true;
}

// ---------------------------------------------------------------- a blueprint's shape

/** A blueprint's own walls (edge tiles of its rooms, doors left out) and inside tiles, in its frame; worked out once. */
interface Shape { walls: [number, number][]; inside: Set<string>; runs: [number, number][][] }
const shapes = new Map<BlueprintId, Shape>();
const key = (x: number, y: number) => `${x},${y}`;

export function shapeOf(id: BlueprintId): Shape {
  let s = shapes.get(id);
  if (s) return s;
  const bp = BLUEPRINTS[id], wall = new Set<string>(), inside = new Set<string>();
  for (const r of bp.rooms)
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1) wall.add(key(x, y));
        else inside.add(key(x, y));
      }
  for (const [x, y] of bp.doors) wall.delete(key(x, y));
  for (const k of wall) inside.delete(k);
  const walls = [...wall].map((k) => k.split(',').map(Number) as [number, number]);
  // Runs: straight lengths of wall between corners and doorways (rows first, then the columns' leftovers).
  const runs: [number, number][][] = [], used = new Set<string>();
  for (let y = 0; y < bp.h; y++)
    for (let x = 0; x < bp.w; x++) {
      if (!wall.has(key(x, y)) || used.has(key(x, y)) || !wall.has(key(x + 1, y)) || wall.has(key(x - 1, y))) continue;
      const run: [number, number][] = [];
      for (let k = x; wall.has(key(k, y)); k++) run.push([k, y]);
      run.forEach(([a, b]) => used.add(key(a, b)));
      runs.push(run);
    }
  for (let x = 0; x < bp.w; x++)
    for (let y = 0; y < bp.h; y++) {
      if (!wall.has(key(x, y)) || used.has(key(x, y))) continue;
      const run: [number, number][] = [];
      for (let k = y; wall.has(key(x, k)) && !used.has(key(x, k)); k++) run.push([x, k]);
      run.forEach(([a, b]) => used.add(key(a, b)));
      runs.push(run);
    }
  s = { walls, inside, runs };
  shapes.set(id, s);
  return s;
}

/** A blueprint point turned (`turn` quarter turns clockwise, after a mirror) into its footprint's frame. */
export function turnAt(bp: Pick<Blueprint, 'w' | 'h'>, turn: number, mirror: boolean, x: number, y: number): [number, number] {
  let px = mirror ? bp.w - 1 - x : x, py = y, w = bp.w, h = bp.h;
  for (let k = 0; k < ((turn % 4) + 4) % 4; k++) {
    [px, py] = [h - 1 - py, px];
    [w, h] = [h, w];
  }
  return [px, py];
}

/** The footprint's size once turned. */
export const turnedSize = (bp: Pick<Blueprint, 'w' | 'h'>, turn: number) => (turn % 2 ? [bp.h, bp.w] : [bp.w, bp.h]) as [number, number];

/** Loot smashables a blueprint holds (part C, Minos: a bigger, more complex building pays more in total): its floor area and rooms. */
export function lootCount(id: BlueprintId): number {
  const bp = BLUEPRINTS[id], area = shapeOf(id).inside.size;
  return Math.max(1, Math.min(bp.loot.length, Math.round(area / BUILD.loot.perTiles + bp.rooms.length * BUILD.loot.perRoom)));
}

/** How special a centrepiece's find is by its building's intactness (part C): 0 scrap, 1 a part, 2 old tech or a relic. */
export const tierOf = (intact: number) => (intact >= BUILD.tiers[1] ? 2 : intact >= BUILD.tiers[0] ? 1 : 0);

const hpOf = (kind: PropKind, m: Material) => Math.max(1, Math.round(MATERIALS[m].hp * PROPS[kind].size));
/** A piece's health as it is put down (`props.ts` `addProp`'s rule). */
export const pieceHp = (p: Pick<BuiltProp, 'kind' | 'material' | 'wear'>) => Math.max(1, Math.round(hpOf(p.kind, p.material ?? PROPS[p.kind].material) * p.wear));

// ---------------------------------------------------------------- stamping

export interface StampOpts {
  id: BlueprintId;
  /** The footprint's top-left (tiles). */
  x: number;
  y: number;
  turn: number;
  mirror: boolean;
  intact: number;
  material: Material;
  /** The land: its width and whether a tile is open ground (not rock). */
  W: number;
  open: (i: number) => boolean;
  r: Rng;
  /** Tiles nothing may be put on (another ruin's find standing inside). */
  keepOff?: (x: number, y: number) => boolean;
  /** The faded city: only this kind fills the loot slots, and only this share of them. */
  small?: { kind: PropKind; share: number };
}

/** A blueprint stamped onto the land: its props (walls, furniture, loot) and its record. Pure: the same opts and stream give the same building. */
export function stamp(o: StampOpts): { props: BuiltProp[]; spec: Omit<BuildingSpec, 'ruins'> } {
  const bp = BLUEPRINTS[o.id], sh = shapeOf(o.id), r = o.r, i = o.intact, [w, h] = turnedSize(bp, o.turn);
  const at = (x: number, y: number) => {
    const [tx, ty] = turnAt(bp, o.turn, o.mirror, x, y);
    return [o.x + tx, o.y + ty] as const;
  };
  const props: BuiltProp[] = [];
  const wearOf = () => Math.max(0.12, Math.min(1, i + r.range(-BUILD.wear, BUILD.wear)));
  const ok = (x: number, y: number) => o.open(y * o.W + x) && !o.keepOff?.(x, y);
  // Walls: whole runs go (more the less intact), the rest lose single tiles and wear.
  for (const run of sh.runs) {
    const gone = r.chance((1 - i) * BUILD.runLoss);
    for (const [lx, ly] of run) {
      const [x, y] = at(lx, ly);
      if (!ok(x, y)) continue;
      if (gone || r.chance((1 - i) * BUILD.holes)) continue;
      props.push({ kind: 'wall', x, y, material: o.material, wear: wearOf() });
    }
  }
  // Furniture says what it was; the less intact, the less of it stands.
  const keep = BUILD.keep + (1 - BUILD.keep) * i;
  for (const [kind, lx, ly] of bp.furniture) {
    const [x, y] = at(lx, ly);
    if (!ok(x, y)) continue;
    if (!r.chance(keep)) continue;
    props.push({ kind, x, y, ...(kind === 'debris' && { material: o.material }), wear: wearOf() });
  }
  // Loot smashables: as many as the building's size and rooms ask; the faded city's are few and small.
  const n = o.small ? Math.round(bp.loot.length * o.small.share) : lootCount(o.id);
  for (const [kind0, lx, ly] of bp.loot.slice(0, n)) {
    const [x, y] = at(lx, ly), kind = o.small ? o.small.kind : kind0;
    if (ok(x, y)) props.push({ kind, x, y, wear: wearOf() });
  }
  // Its floor: every tile of it on open ground away from rock (the painted rock's edge spills a little onto the tiles beside it).
  const cells: number[] = [];
  const floored = (x: number, y: number) => o.open(y * o.W + x) && o.open(y * o.W + x - 1) && o.open(y * o.W + x + 1) && o.open((y - 1) * o.W + x) && o.open((y + 1) * o.W + x);
  for (const [lx, ly] of [...[...sh.inside].map((k) => k.split(',').map(Number)), ...sh.walls, ...bp.doors]) {
    const [x, y] = at(lx, ly);
    if (floored(x, y)) cells.push(y * o.W + x);
  }
  return { props, spec: { bp: o.id, x: o.x, y: o.y, w, h, turn: o.turn, mirror: o.mirror, intact: i, era: bp.era, material: o.material, floor: bp.floor, cells, hp0: props.reduce((n, p) => n + pieceHp(p), 0) } };
}

/** The tiles a stamped blueprint's walls and pieces stand on (its frame turned), so a find inside is never under one. */
export function solidTiles(id: BlueprintId, x0: number, y0: number, turn: number, mirror: boolean): Set<string> {
  const bp = BLUEPRINTS[id], out = new Set<string>();
  const add = (x: number, y: number) => {
    const [tx, ty] = turnAt(bp, turn, mirror, x, y);
    out.add(key(x0 + tx, y0 + ty));
  };
  for (const [x, y] of shapeOf(id).walls) add(x, y);
  for (const [, x, y] of [...bp.furniture, ...bp.loot]) add(x, y);
  return out;
}

/** A material for a building's walls: the era's, the land's own first where they share one (`WALL_MATERIAL`). */
export function wallOf(era: Era, biome: BiomeId, r: Rng): Material {
  const own = WALL_MATERIAL[biome].filter((m) => ERA_WALLS[era].includes(m));
  return r.pick(own.length ? own : ERA_WALLS[era]);
}

/** A building's intactness rolled (`BUILD.intact`: intact ones are rarer). */
export const rollIntact = (r: Rng, range: readonly [number, number] = BUILD.intact.range, skew = BUILD.intact.skew) => range[0] + (range[1] - range[0]) * r.next() ** skew;

// ---------------------------------------------------------------- placing on a land

export interface PlaceOpts {
  w: number;
  h: number;
  open: (i: number) => boolean;
  lift: Spot;
  /** Seeps and places' parts: no building stands on them. */
  keep: Spot[];
  nests: Spot[];
  ruins: { x: number; y: number; kind: RuinKind; trail?: number; place?: true }[];
  biome: BiomeId;
  /** The land's rank (1-3): a hive village's size and turrets. */
  tier: number;
  r: Rng;
}

export interface Placed {
  props: BuiltProp[];
  buildings: BuildingSpec[];
  /** Ruins (indices) that got a building: they take no ring of walls. */
  housed: Set<number>;
  /** Footprints taken (tile keys "x,y", a margin round each). */
  claimed: Set<string>;
  /** A turret's tile, beside its village. */
  turrets: Spot[];
}

/** The faded district's corner of the land, the quarter farthest from the lift (null on a land with none). */
export function fadedArea(o: Pick<PlaceOpts, 'w' | 'h' | 'lift' | 'biome'>): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!FADED.biomes.includes(o.biome)) return null;
  const aw = Math.round(o.w * FADED.area[0]), ah = Math.round(o.h * FADED.area[1]);
  const left = o.lift.x > o.w / 2, top = o.lift.y > o.h / 2;
  const x0 = left ? 3 : o.w - 3 - aw, y0 = top ? 3 : o.h - 3 - ah;
  return { x0, y0, x1: x0 + aw, y1: y0 + ah };
}

/** Put the land's buildings down: ruins in buildings, hive villages, the faded city. Pure: its own stream. */
export function placeBuildings(o: PlaceOpts): Placed {
  const { w, h, r } = o;
  const out: Placed = { props: [], buildings: [], housed: new Set(), claimed: new Set(), turrets: [] };
  const d = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.y - b.y);
  const area = fadedArea(o);
  const inArea = (s: Spot) => !!area && s.x >= area.x0 && s.x < area.x1 && s.y >= area.y0 && s.y < area.y1;
  let wholeLeft = 1; // the faded city may hold one intact building (Minos)

  /** Can a blueprint stand with its footprint's top-left at (x0, y0)? `own`: spots it may stand on (its heart's hive or find). */
  const fits = (id: BlueprintId, x0: number, y0: number, turn: number, mirror: boolean, own: Spot[]): boolean => {
    const [fw, fh] = turnedSize(BLUEPRINTS[id], turn), m = BUILD.margin;
    if (x0 < 3 || y0 < 3 || x0 + fw > w - 3 || y0 + fh > h - 3) return false;
    let rock = 0;
    for (let y = y0; y < y0 + fh; y++)
      for (let x = x0; x < x0 + fw; x++) {
        if (!o.open(y * w + x)) rock++;
        if (d({ x, y }, o.lift) < 6) return false;
      }
    if (rock > fw * fh * (id === 'hivehall' ? BUILD.rockMax * 1.6 : BUILD.rockMax)) return false; // a hive sits among rocks: its hall may lean on them
    for (let y = y0 - m; y < y0 + fh + m; y++) for (let x = x0 - m; x < x0 + fw + m; x++) if (out.claimed.has(key(x, y))) return false;
    const solid = solidTiles(id, x0, y0, turn, mirror);
    const near = (s: Spot, rad: number) => s.x >= x0 - rad && s.x < x0 + fw + rad && s.y >= y0 - rad && s.y < y0 + fh + rad;
    if (o.keep.some((s) => near(s, 1))) return false;
    if (o.nests.some((s) => !own.includes(s) && near(s, 3))) return false;
    // Another ruin may stand inside (its find is one more in this building), never under a wall or a piece; a place's ruin never.
    for (const q of o.ruins) if (!own.includes(q) && near(q, 0) && (q.trail !== undefined || q.place || solid.has(key(q.x, q.y)))) return false;
    return true;
  };

  const claim = (s: Omit<BuildingSpec, 'ruins'>) => {
    for (let y = s.y - BUILD.margin; y < s.y + s.h + BUILD.margin; y++) for (let x = s.x - BUILD.margin; x < s.x + s.w + BUILD.margin; x++) out.claimed.add(key(x, y));
  };

  /** Stamp a blueprint whose heart (or, with none, its centre) sits on `at`, trying four turns; null when none fits. */
  const tryPut = (id: BlueprintId, at: Spot, own: Spot[], intact: number, era: Era, extra: Partial<BuildingSpec> = {}, small?: StampOpts['small']): BuildingSpec | null => {
    const bp = BLUEPRINTS[id], t0 = r.int(0, 3), mirror = r.chance(0.5);
    for (let k = 0; k < 4; k++) {
      const turn = (t0 + k) % 4, [fw, fh] = turnedSize(bp, turn);
      const [hx, hy] = bp.heart ? turnAt(bp, turn, mirror, bp.heart[0], bp.heart[1]) : [Math.floor(fw / 2), Math.floor(fh / 2)];
      const x0 = at.x - hx, y0 = at.y - hy;
      if (!fits(id, x0, y0, turn, mirror, own)) continue;
      const inside = o.ruins.map((q, i) => (q.x >= x0 && q.x < x0 + fw && q.y >= y0 && q.y < y0 + fh ? i : -1)).filter((i) => i >= 0);
      const finds = new Set(inside.map((i) => key(o.ruins[i].x, o.ruins[i].y)));
      const s = stamp({ id, x: x0, y: y0, turn, mirror, intact, material: wallOf(era, o.biome, r), W: w, open: o.open, r: r.fork(`b${out.buildings.length}`), keepOff: (x, y) => finds.has(key(x, y)), small });
      const spec: BuildingSpec = { ...s.spec, era, ruins: [], ...extra };
      const bi = out.buildings.length;
      out.buildings.push(spec);
      for (const p of s.props) out.props.push({ ...p, bld: bi });
      claim(spec);
      return spec;
    }
    return null;
  };

  const eraOf = () => (r.chance(ERA_SHARE[o.biome]) ? 'modern' : 'steam') as Era;

  // Ruins: the biggest blueprint that fits the find and the ground (the era's first), else a smaller one, else today's ring.
  o.ruins.forEach((q, i) => {
    if (q.trail !== undefined || q.place || q.kind === 'dock' || out.housed.has(i)) return;
    const era = eraOf();
    const ids = RUIN_BLUEPRINTS.filter((id) => BLUEPRINTS[id].fits.includes(q.kind));
    const order = [...r.shuffle(ids.filter((id) => BLUEPRINTS[id].era === era && id !== 'kiosk' && id !== 'shed')), ...r.shuffle(ids.filter((id) => BLUEPRINTS[id].era !== era && id !== 'kiosk' && id !== 'shed')), ...ids.filter((id) => id === 'kiosk' || id === 'shed')];
    const whole = inArea(q) && wholeLeft > 0;
    const intact = whole ? r.range(...FADED.whole) : rollIntact(r);
    for (const id of order) {
      const s = tryPut(id, q, [q], intact, BLUEPRINTS[id].era);
      if (!s) continue;
      if (whole) wholeLeft--;
      const inside = o.ruins.map((p, k) => (k !== i && p.x >= s.x && p.x < s.x + s.w && p.y >= s.y && p.y < s.y + s.h && p.trail === undefined && !p.place ? k : -1)).filter((k) => k >= 0 && !out.housed.has(k));
      s.ruins = [i, ...inside];
      for (const k of s.ruins) out.housed.add(k);
      return;
    }
  });

  // Hive villages: a hall round the hive, huts in a ring, turrets on the bigger ones (by the land's tier).
  const tier = Math.max(1, Math.min(3, o.tier)) - 1;
  o.nests.forEach((n, ni) => {
    const hall = tryPut('hivehall', n, [n], r.range(...VILLAGE.intact), 'modern', { village: ni });
    if (!hall) return;
    let huts = 0;
    const want = VILLAGE.huts[tier], a0 = r.range(0, Math.PI * 2);
    for (let k = 0; k < want; k++)
      for (let t = 0; t < 16; t++) {
        const a = a0 + (k / want) * Math.PI * 2 + r.range(-0.6, 0.6), rad = r.range(...VILLAGE.ring);
        const at = { x: Math.round(n.x + Math.cos(a) * rad), y: Math.round(n.y + Math.sin(a) * rad) };
        if (tryPut(r.chance(0.5) ? 'hut' : 'shed', at, [], r.range(...VILLAGE.intact), 'steam', { village: ni })) {
          huts++;
          break;
        }
      }
    if (huts < VILLAGE.turretFrom) return;
    for (let k = 0, put = 0; k < 30 && put < VILLAGE.turrets[tier]; k++) {
      const a = r.range(0, Math.PI * 2), rad = r.range(5.5, 7);
      const at = { x: Math.round(n.x + Math.cos(a) * rad), y: Math.round(n.y + Math.sin(a) * rad) };
      const bad = !o.open(at.y * w + at.x) || d(at, o.lift) < 10 || solidUnder(out.props, at) || out.turrets.some((t) => d(t, at) < 4) || o.keep.some((s) => d(s, at) < 2) || o.ruins.some((s) => d(s, at) < 2);
      if (bad) continue;
      out.turrets.push(at);
      put++;
    }
  });

  // The faded city: a grid of faint outlines over its quarter, round whatever stands there already.
  if (area) {
    for (let y = area.y0; y < area.y1; y += FADED.step[1])
      for (let x = area.x0; x < area.x1; x += FADED.step[0]) {
        const at = { x: x + r.int(0, 3), y: y + r.int(0, 2) };
        tryPut(r.pick(FADED.blueprints), at, [], r.range(...FADED.intact), eraOf(), { faded: true }, { kind: FADED.small, share: FADED.loot });
      }
  }
  return out;
}

const solidUnder = (props: readonly BuiltProp[], s: Spot) => props.some((p) => p.x === s.x && p.y === s.y);

// ---------------------------------------------------------------- in a mission

/** A building's intactness now, 0..1: as rolled, times the share of its pieces' health left since it was stamped. */
export function intactness(sim: Sim, b: number): number {
  const spec = sim.map.buildings?.[b];
  if (!spec) return 1;
  let hp = 0;
  for (const p of sim.props.list) if (p.bld === b && !p.broken) hp += p.hp;
  return spec.hp0 ? spec.intact * Math.min(1, hp / spec.hp0) : spec.intact;
}

/**
 * The land's interactables wear the tutorial's cue (P47 part A, `onboard.ts` `Cue.lamp`): the Use key carved on the ground before
 * each find standing in a building and each coal seam, softly lit so it reads from afar; taken (it becomes an engraving) once the
 * find is searched or the seam mined out (`cueStep`). Only on a land with buildings.
 */
export function landCues(sim: Sim) {
  if (!sim.map.buildings) return;
  for (const r of sim.ruins) if (r.building !== undefined && !r.searched) r.cue = sim.onboard.cue({ x: r.x, y: r.y + T * 0.9, icon: '', key: 'use', lamp: { reach: RUIN.reach } });
  for (const s of sim.seams) s.cue = sim.onboard.cue({ x: s.x, y: s.y + T * 0.9, icon: '', key: 'use', lamp: { reach: COAL.reach + 24 } });
}

/** A land cue's thing is done: its glow goes into an engraving. */
export function cueStep(sim: Sim) {
  for (const r of sim.ruins) if (r.cue !== undefined && (r.searched || r.decoded)) {
    sim.onboard.take(r.cue);
    r.cue = undefined;
  }
  for (const s of sim.seams) if (s.cue !== undefined && s.amount <= 0) {
    sim.onboard.take(s.cue);
    s.cue = undefined;
  }
}
