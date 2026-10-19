/**
 * Procedural desert. Value noise makes mesas (rock, impassable), dune fields and hardpan; the lift sits in a clearing,
 * oil seeps are scattered so the nearest one is a calm first stop, hives sit near the farther seeps, the authored places
 * (`places.ts`) go in by distance band, and old-tech ruins dot the sand. Everything placed is reachable on foot from the
 * lift (corridors are carved when it is not).
 */
import { rng, type Rng } from '../../../../harness/kit/rng';
import { BIOMES, DOCK, SEEPS, dockDev, type BiomeId } from './defs';
import { PLACES, placePlaces, presence, turnParts, type PlaceId, type PlacedPlace, type PresenceChecks } from './places';
import { rasterise, type Ground } from './shapes';
import { gatherCluster } from './fog';
import { scatterProps, type PropSpec } from './propgen';
import type { AnomalyId, RuinSize } from './defs';
import type { BuildingSpec } from './buildings';

export const Ter = { Sand: 0, Dune: 1, Hardpan: 2, Rock: 3 } as const;
export type Ter = (typeof Ter)[keyof typeof Ter];

import type { RuinKind } from './defs';
export type { RuinKind };
export interface Spot { x: number; y: number }
/** What a handcrafted land (`lands.ts`) asks of the Sim besides its ground; a generated land has none. */
export interface LandRules {
  id: string;
  anomaly?: AnomalyId;
  morningSwarm?: number;
  duskBoss?: false;
  guided?: true;
  /** The land starts with an empty HUD (`onboard.ts`). */
  emptyHud?: true;
}
export interface MapData {
  w: number;
  h: number;
  seed: number | string;
  biome: BiomeId;
  ter: Uint8Array;
  lift: Spot;
  seeps: (Spot & { amount: number })[];
  nests: Spot[];
  /** Old tech to search; `trail` marks the ruins of the Parable Trail place (0 is the first verse). */
  ruins: (Spot & { kind: RuinKind; trail?: number; /** A place's own ruin (P36): it has no generated walls. */ place?: true; /** A land file fixes what searching it gives (a `RelicId`: level 1's car gives the toaster every time). */ junk?: string })[];
  /** The authored set pieces of this land (`places.ts`). */
  places: PlacedPlace[];
  /** What breaks (`props.ts`): ruin pieces and a scatter, and each ruin's size class (none for a Parable Trail ruin). A land with none has none. */
  props?: PropSpec[];
  ruinSizes?: (RuinSize | undefined)[];
  /** P47's buildings (`buildings.ts`): on a land from mission 4 (`GenOpts.remnants`); their pieces are props with `bld`. */
  buildings?: BuildingSpec[];
  /** A handcrafted land's rules (`LandRules`). */
  rules?: LandRules;
}

export const passable = (t: number) => t !== Ter.Rock;

/** Smooth value noise in 0..1. */
function noise(r: Rng, w: number, h: number, cell: number) {
  const gw = Math.ceil(w / cell) + 2;
  const gh = Math.ceil(h / cell) + 2;
  const g = Array.from({ length: gw * gh }, () => r.next());
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = x / cell, fy = y / cell;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = s(fx - ix), ty = s(fy - iy);
    const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

/** Tiles reachable on foot from `from` (1 = reachable). */
export function flood(ter: Uint8Array, w: number, h: number, from: Spot) {
  const seen = new Uint8Array(w * h);
  const q = [from.y * w + from.x];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % w, y = (i - x) / w;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      if (seen[j] || !passable(ter[j])) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return seen;
}

export const GROUND_TER: Record<Ground, Ter> = { sand: Ter.Sand, dune: Ter.Dune, hardpan: Ter.Hardpan, rock: Ter.Rock };

/**
 * The land's rim (P31; Minos 2026-10-18: "edges should be a bit bigger ... should be universal across maps"): a band of rock along
 * every edge, `base` tiles deep plus up to `wobble` more by a noise, so the edge reads as a natural boundary and the arrivals from
 * off the map (`spider.ts` `spawnAtRim`) are seen crossing it. It was one tile. Both numbers are guesses.
 */
export const RIM = { base: 2, wobble: 2 };

/** Rock within `rad` tiles of `c` becomes sand (the land's rim stays). */
export function clearRock(ter: Uint8Array, w: number, h: number, c: Spot, rad: number) {
  for (let y = c.y - rad; y <= c.y + rad; y++)
    for (let x = c.x - rad; x <= c.x + rad; x++)
      if (x > 0 && y > 0 && x < w - 1 && y < h - 1 && (x - c.x) ** 2 + (y - c.y) ** 2 <= rad * rad + 1 && ter[y * w + x] === Ter.Rock) ter[y * w + x] = Ter.Sand;
}

/**
 * What else a land is generated with. `remnants` (P47, from mission 4: `REMNANTS`): ruins in buildings, hive villages, the faded
 * city, a quieter open land; `tier` the land's rank (a village's size). Only the props differ: the ground, ruins and places are the same.
 */
export interface GenOpts { remnants?: boolean; tier?: number }

/** P47's land changes come with the fourth mission (Minos): missions 1-3 are the tutorial and keep today's lands. `from` is missions flown. */
export const REMNANTS = { from: 3 };
export const remnantsOn = (flown: number | undefined) => flown !== undefined && flown >= REMNANTS.from;

/** `present`: the checks behind the places' presence rules (default: the injected ones, `presence` in places.ts). */
export function generate(seed: number | string, w = 100, h = 75, biome: BiomeId = 'desert', present?: PresenceChecks, gen: GenOpts = {}): MapData {
  // The desert keeps its old stream, so its lands replay as they always did.
  const r = rng(`${biome}/${seed}`);
  const B = BIOMES[biome];
  const ter = new Uint8Array(w * h);
  const mesa = noise(r.fork('mesa'), w, h, 9);
  const mesa2 = noise(r.fork('mesa2'), w, h, 4);
  const dune = noise(r.fork('dune'), w, h, 7);
  const pan = noise(r.fork('pan'), w, h, 12);
  const rim = noise(r.fork('rim'), w, h, 5);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = mesa(x, y) * 0.75 + mesa2(x, y) * 0.25;
      // The land's natural edge: a ragged band of rock `RIM` tiles deep, which arrivals cross in plain sight (P31).
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y) < RIM.base + rim(x, y) * RIM.wobble;
      if (edge || m > 0.68) ter[i] = Ter.Rock;
      else if (dune(x, y) > 0.62) ter[i] = Ter.Dune;
      else if (pan(x, y) < 0.3) ter[i] = Ter.Hardpan;
    }
  const clear = (c: Spot, rad: number) => clearRock(ter, w, h, c, rad);
  const d = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.y - b.y);
  const inside = (m: number) => ({ x: r.int(m, w - 1 - m), y: r.int(m, h - 1 - m) });

  const lift = { x: r.int(18, 34), y: r.int(24, h - 25) };
  clear(lift, 5);

  // The first seep: a short, calm walk from the lift. The rest spread out, apart from each other.
  const seeps: MapData['seeps'] = [];
  const amount = () => r.int(SEEPS.amount[0], SEEPS.amount[1]);
  for (let tries = 0; tries < 400 && !seeps.length; tries++) {
    // On screen from the lift (the view is 40 x 22 tiles): it teaches by being seen.
    const a = r.range(0, Math.PI * 2), dist = r.range(8, 13);
    const s = { x: Math.round(lift.x + Math.cos(a) * dist), y: Math.round(lift.y + Math.sin(a) * dist) };
    if (Math.abs(s.y - lift.y) <= 8 && Math.abs(s.x - lift.x) <= 16 && s.x > 4 && s.y > 4 && s.x < w - 5 && s.y < h - 5) seeps.push({ ...s, amount: amount() });
  }
  const want = r.int(SEEPS.count[0], SEEPS.count[1]);
  for (let tries = 0; tries < 2000 && seeps.length < want; tries++) {
    const s = inside(5);
    if (d(s, lift) < 16 || seeps.some((o) => d(o, s) < 11)) continue;
    seeps.push({ ...s, amount: amount() });
  }
  seeps.forEach((s) => clear(s, 3));

  // Hives near the far seeps; never near the first seep or the lift.
  const nests: Spot[] = [];
  for (const s of r.shuffle(seeps.slice(1))) {
    if (nests.length >= B.hives) break;
    for (let tries = 0; tries < 60; tries++) {
      const a = r.range(0, Math.PI * 2), dist = r.range(6, 9);
      const n = { x: Math.round(s.x + Math.cos(a) * dist), y: Math.round(s.y + Math.sin(a) * dist) };
      if (n.x < 4 || n.y < 4 || n.x > w - 5 || n.y > h - 5) continue;
      if (d(n, lift) < 20 || d(n, seeps[0]) < 13 || nests.some((o) => d(o, n) < 14)) continue;
      nests.push(n);
      clear(n, 2);
      break;
    }
  }

  // The authored places, on their own random stream: the seeps and hives above are the same land with or without them.
  // Each place's own ground (shapes) goes down under it; the land's border, the lift's clearing and the seeps stay as they were.
  const paint = (x: number, y: number, g: Ground) => {
    if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) return;
    if (g === 'rock' && (d({ x, y }, lift) <= 6 || seeps.some((s) => d({ x, y }, s) <= 3.5))) return;
    ter[y * w + x] = GROUND_TER[g];
  };
  const places = placePlaces({ w, h, lift, seeps, nests, others: [], clear, r: r.fork('places'), order: B.places, paint, present });
  const placed = places.flatMap((p) => p.parts.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) })));

  // Old tech: the modern world, rusting in the sand.
  const ruins: MapData['ruins'] = [];
  const kinds: RuinKind[] = r.shuffle(B.ruins ?? ['car', 'phone', 'dish', 'panel', 'car', 'phone']);
  for (let tries = 0; tries < 1000 && ruins.length < kinds.length; tries++) {
    const s = inside(4);
    if (d(s, lift) < 8 || [...seeps, ...nests, ...ruins, ...placed].some((o) => d(o, s) < 7)) continue;
    ruins.push({ ...s, kind: kinds[ruins.length] });
    clear(s, 2);
  }
  // A rich cluster of ruins (the map's "rich ruins" signal, `fog.ts`): when chance made none, two ruins move in beside another.
  gatherCluster(ruins, r.fork('cluster'), (s, q) => s.x >= 4 && s.y >= 4 && s.x <= w - 5 && s.y <= h - 5 && d(s, lift) >= 8 && [...seeps, ...nests, ...ruins.filter((o) => o !== q), ...placed].every((o) => d(o, s) >= 7));
  for (const q of ruins) clear(q, 2);
  // P58 H: an old charging dock, rolled on a stream of its own (the land is the same with or without it) while the Princess's ladder wants one on this land.
  // It is not in the biome's list: any land can hold one (`hub/questplaces.ts` says when the ladder asks).
  if (dockDev.force || ((present ?? presence.checks).questActive(`dock.${biome}`) && r.fork('dock').chance(1 / DOCK.oneIn))) {
    const rd = r.fork('dock-at');
    for (let tries = 0; tries < 400; tries++) {
      const s = { x: rd.int(4, w - 5), y: rd.int(4, h - 5) };
      if (d(s, lift) < 8 || [...seeps, ...nests, ...ruins, ...placed].some((o) => d(o, s) < 7)) continue;
      ruins.push({ ...s, kind: 'dock' });
      clear(s, 2);
      break;
    }
  }
  // The Parable Trail's ruins are ruins too (searched the same way, drawn on the map), in the order of its verses.
  for (const q of places.flatMap((p) => p.parts))
    if (q.kind === 'ruin') ruins.push({ x: Math.round(q.x), y: Math.round(q.y), kind: q.ruin!, place: true, ...(q.step !== undefined && { trail: q.step }) }); // only an `outward` place's ruins are a trail's

  // Carve a walkway to anything the sand has walled off.
  for (const p of [...seeps, ...nests, ...ruins, ...placed]) {
    if (flood(ter, w, h, lift)[p.y * w + p.x]) continue;
    const n = Math.ceil(d(p, lift));
    for (let i = 0; i <= n; i++) clear({ x: Math.round(p.x + ((lift.x - p.x) * i) / n), y: Math.round(p.y + ((lift.y - p.y) * i) / n) }, 1);
  }

  // Props last, on their own stream: the land above is the same with or without them.
  const remnants = gen.remnants ? { tier: gen.tier ?? 1, seeps, nests, parts: placed } : undefined;
  const pm = scatterProps({ w, h, open: (i) => passable(ter[i]), lift, keep: [...seeps, ...nests, ...placed], ruins, biome, r: r.fork('props'), remnants });
  return { w, h, seed, biome, ter, lift, seeps, nests, ruins, places, props: pm.props, ruinSizes: pm.sizes, ...(pm.buildings && { buildings: pm.buildings }) };
}

/**
 * A plain land for the bench (`src/Place.ts`): open ground of the biome and a rock rim, one place at its centre, turned
 * and mirrored as asked, its own ground painted. No seeps, hives or ruins; the lift is out of the way in a corner.
 */
export function benchLand(id: PlaceId, biome: BiomeId = 'desert', o: { w?: number; h?: number; rot?: number; mir?: 1 | -1; seed?: string } = {}): MapData {
  const { w = 64, h = 44, rot = 0, mir = 1 } = o;
  const ter = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) ter[y * w + x] = Ter.Rock;
  const centre = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
  const def = PLACES[id];
  const parts = turnParts(def, centre, rot, mir);
  rasterise(def.shapes, { ...centre, rot, mir }, w, h, (x, y, g) => {
    if (x > 0 && y > 0 && x < w - 1 && y < h - 1) ter[y * w + x] = GROUND_TER[g];
  });
  return { w, h, seed: o.seed ?? `bench/${id}`, biome, ter, lift: { x: 3, y: h - 4 }, seeps: [], nests: [], ruins: [], places: [{ id, x: centre.x, y: centre.y, parts }] };
}
