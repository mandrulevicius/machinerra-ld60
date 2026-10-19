/**
 * Seeing the land: map fog, signals, the antenna's warmth and the radar's pips. Plain functions and one grid, no scene.
 * The Sim holds one (`sim.fog`, filled by `fogplay.ts`); the map draws it (`mapview.ts`), the antenna reads `warmth` (`commview.ts`).
 * All positions are in `Spot` units (tile indices, like every `MapData` spot; a sim position in px is `px / T - 0.5`).
 *
 * - `Fog` starts blank. Whoever sees (the Communicator, a bot, a Signal Mast, later the dog) calls `reveal` with a
 *   radius from `sightRadius`: night shortens it, a passive (the Expeditioner's +30%) widens it.
 * - `landSignals(map)` turns the land's big interests into `Signal`s: a kind and a rough area (a centre off the real
 *   spot, a radius that always contains it). The same land always gives the same signals. The view draws `x, y, r`
 *   only; `at` is the real spot, for the sim.
 * - A signal is `found` once its real spot has been seen: it stops being a signal.
 * - `warmth` is the antenna's glow (0 cold .. 1 warm), `radar` the scope's pips. Neither makes a sound.
 */
import { rng, type Rng } from '../../../../harness/kit/rng';
import type { MapData, Spot } from './mapgen';
import type { PlaceId } from './places';
import { distOf, lerp } from './geom';

export type SignalKind = 'pilgrim' | 'shrine' | 'castle' | 'mast' | 'ruins' | 'vault' | 'cache' | 'kennel' | 'place';
export interface Signal {
  /** Stable within a land: `kind` and the index of the thing in the land's list. */
  id: string;
  kind: SignalKind;
  /** The rough area the player reads: centre and radius, tiles. */
  x: number;
  y: number;
  r: number;
  /** The real spot (inside the area). Never draw it. */
  at: Spot;
  /** The Mirage's false ring (P54): nothing is there (`at` is off the map), it shimmers and fades (`fade` 0..1) when the Communicator comes near. */
  fake?: boolean;
  fade?: number;
}

/** Who sees, how far (tiles), and the share of that lost at full night (`sky().night` = 1). The mast is a lit beacon, so it loses little. */
export const SIGHT = {
  communicator: { r: 10, night: 0.5 },
  bot: { r: 6, night: 0.5 },
  dog: { r: 14, night: 0.4 },
  mast: { r: 18, night: 0.15 },
};
export type Seer = keyof typeof SIGHT;

/** Which places show as signals, and how big their area is (tiles): bigger for the ones that are harder to pin down. */
export const SIGNAL_PLACES: Partial<Record<PlaceId, { kind: SignalKind; r: number }>> = {
  pilgrim: { kind: 'pilgrim', r: 6 },
  shrine: { kind: 'shrine', r: 8 },
  mast: { kind: 'mast', r: 8 },
  sprocket: { kind: 'pilgrim', r: 5 },
  'type-wreck': { kind: 'pilgrim', r: 5 },
  castle: { kind: 'castle', r: 9 },
  'core-vault': { kind: 'vault', r: 8 },
  kennel: { kind: 'kennel', r: 7 }, // P42: a paw (the dog's line)
};
/** A rich ruin cluster: at least `min` loose ruins (the Parable Trail's are a place of their own) within `apart` tiles of its first. */
export const CLUSTER = { min: 3, apart: 12, r: 7, /** `gatherCluster` moves a ruin to this many tiles from the anchor (min, max). */ ring: [7, 10] as const };
/** The signal's centre sits this share of its radius off the real spot, at least `minTiles`; the share keeps the real spot well inside the area. */
export const OFFSET = { from: 0.25, to: 0.65, minTiles: 2 };

export const ANTENNA = {
  /** Warmth is 0 at this distance (tiles, from the area's centre) and 1 inside the area. */
  range: 60,
  /** Cold blue to warm amber, as 0xrrggbb. */
  cold: 0x4a7fd0,
  warm: 0xffb040,
};
export const RADAR = { range: 70 };

const TAU = Math.PI * 2;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** The sight radius, tiles: the seer's base, shortened by `night` (0 day .. 1 deep night, `sky().night`), times `scale` (passives: 1.3 for the Expeditioner). */
export function sightRadius(seer: Seer, night = 0, scale = 1) {
  const s = SIGHT[seer];
  return s.r * (1 - s.night * clamp01(night)) * scale;
}

export class Fog {
  /** 1 where the tile has been seen. */
  readonly seen: Uint8Array;
  /** Counts up whenever anything new is revealed: redraw the map when it changes. */
  rev = 0;
  private count = 0;
  constructor(readonly w: number, readonly h: number) {
    this.seen = new Uint8Array(w * h);
  }

  /** Reveal the disc of `radius` tiles around (x, y). Returns how many tiles were new. */
  reveal(x: number, y: number, radius: number): number {
    const { w, h, seen } = this;
    const r2 = radius * radius;
    let fresh = 0;
    for (let j = Math.max(0, Math.ceil(y - radius)); j <= Math.min(h - 1, Math.floor(y + radius)); j++)
      for (let i = Math.max(0, Math.ceil(x - radius)); i <= Math.min(w - 1, Math.floor(x + radius)); i++) {
        if (seen[j * w + i] || (i - x) ** 2 + (j - y) ** 2 > r2) continue;
        seen[j * w + i] = 1;
        fresh++;
      }
    if (fresh) {
      this.count += fresh;
      this.rev++;
    }
    return fresh;
  }

  /** Has the tile under (x, y) been seen? Off the map is not. */
  at(x: number, y: number): boolean {
    const i = Math.round(x), j = Math.round(y);
    return i >= 0 && j >= 0 && i < this.w && j < this.h && this.seen[j * this.w + i] === 1;
  }

  /** Forget everything (dev). */
  clear() {
    this.seen.fill(0);
    this.count = 0;
    this.rev++;
  }

  /** See the whole land (dev). */
  revealAll() {
    this.seen.fill(1);
    this.count = this.w * this.h;
    this.rev++;
  }

  /** The share of the land seen, 0..1. */
  get fraction() {
    return this.count / (this.w * this.h);
  }

  /** Has this signal's real spot been seen? Then it is found and no longer a signal. */
  found(s: Signal) {
    return this.at(s.at.x, s.at.y);
  }

  /** The signals still to find. */
  open(signals: readonly Signal[]) {
    return signals.filter((s) => !this.found(s));
  }

  /** The real signals still to find: the antenna and the radar never read the Mirage's false rings (only the map is fooled). */
  openReal(signals: readonly Signal[]) {
    return this.open(signals.filter((s) => !s.fake));
  }
}

/** Loose ruins only (the Parable Trail's are a place of their own). */
const looseRuins = (map: Pick<MapData, 'ruins'>) => map.ruins.filter((q) => q.trail === undefined);

/** Each ruin with the ruins within `CLUSTER.apart` of it (itself included), the most first. */
function clusterGroups(loose: readonly Spot[]) {
  return loose
    .map((q, i) => ({ i, near: loose.map((_, j) => j).filter((j) => distOf(q, loose[j]) <= CLUSTER.apart) }))
    .sort((a, b) => b.near.length - a.near.length || a.i - b.i);
}

/**
 * Make sure a land has a rich cluster (the generator's hook, so most lands show a "rich ruins" signal). If no `min` loose ruins
 * stand within `apart` of one, the two nearest to the best-placed ruin are moved in around it (they keep their kinds, so the land
 * has as many ruins as before). `ok` says whether a ruin may stand at a spot (on the map, clear of everything else). Moves `loose` in place.
 * Returns whether the land has a cluster now.
 */
export function gatherCluster<R extends Spot>(loose: R[], r: Rng, ok: (to: Spot, moving: R) => boolean): boolean {
  const best = clusterGroups(loose)[0];
  if (!best) return false;
  if (best.near.length >= CLUSTER.min) return true;
  const anchor = loose[best.i];
  const others = loose.filter((q) => q !== anchor).sort((a, b) => distOf(a, anchor) - distOf(b, anchor)).slice(0, CLUSTER.min - 1);
  if (others.length < CLUSTER.min - 1) return false;
  let moved = 0;
  for (const q of others) {
    for (let tries = 0; tries < 60; tries++) {
      const a = r.range(0, TAU), d = r.range(CLUSTER.ring[0], CLUSTER.ring[1]);
      const to = { x: Math.round(anchor.x + Math.cos(a) * d), y: Math.round(anchor.y + Math.sin(a) * d) };
      if (!ok(to, q)) continue;
      q.x = to.x;
      q.y = to.y;
      moved++;
      break;
    }
  }
  return moved === others.length;
}

/** A blank fog sized to the land. */
export const newFog = (map: Pick<MapData, 'w' | 'h'>) => new Fog(map.w, map.h);

/** The land's signals: its big places and rich ruin clusters, plus any `extra` (the Core Vault, once it is a place). Deterministic from the land's seed and biome. */
export function landSignals(map: MapData, extra: { kind: SignalKind; at: Spot; r: number }[] = []): Signal[] {
  const found: { id: string; kind: SignalKind; at: Spot; r: number }[] = [];
  map.places.forEach((p, i) => {
    const def = SIGNAL_PLACES[p.id];
    if (def) found.push({ id: `${def.kind}${i}`, kind: def.kind, at: { x: p.x, y: p.y }, r: def.r });
  });
  // Each loose ruin joins at most one cluster, richest first.
  const loose = looseRuins(map);
  const taken = new Set<number>();
  for (const g of clusterGroups(loose)) {
    const members = g.near.filter((j) => !taken.has(j));
    if (members.length < CLUSTER.min) continue;
    members.forEach((j) => taken.add(j));
    const at = { x: Math.round(members.reduce((s, j) => s + loose[j].x, 0) / members.length), y: Math.round(members.reduce((s, j) => s + loose[j].y, 0) / members.length) };
    found.push({ id: `ruins${g.i}`, kind: 'ruins', at, r: CLUSTER.r });
  }
  extra.forEach((e, i) => found.push({ id: `${e.kind}x${i}`, kind: e.kind, at: e.at, r: e.r }));

  const root = rng(`fog/${map.biome}/${map.seed}`);
  return found.map((f) => {
    const r = root.fork(f.id);
    // An angle whose centre stays on the map (the real spot is on it, so some angle always does).
    let off = { x: 0, y: 0 };
    for (let tries = 0; tries < 24; tries++) {
      const a = r.range(0, TAU);
      const d = Math.max(OFFSET.minTiles, f.r * r.range(OFFSET.from, OFFSET.to));
      off = { x: f.at.x + Math.cos(a) * d, y: f.at.y + Math.sin(a) * d };
      if (off.x >= 0 && off.y >= 0 && off.x <= map.w - 1 && off.y <= map.h - 1) break;
    }
    return { id: f.id, kind: f.kind, x: +off.x.toFixed(2), y: +off.y.toFixed(2), r: f.r, at: f.at };
  });
}

export interface Viewer {
  x: number;
  y: number;
  /** Where the Communicator faces, radians (0 = +x, y grows down, like `Math.atan2(dy, dx)`). */
  facing: number;
}

/** The angle between two bearings, 0..PI. */
const angleBetween = (a: number, b: number) => Math.abs(((((a - b) % TAU) + TAU + Math.PI) % TAU) - Math.PI);

/**
 * The antenna's glow: 0 cold .. 1 warm, from facing and nearness to the selected signal (by id) or else the nearest one
 * still open (`signals` should be the open ones; a found signal is skipped via `fog` when given). It reads the area's
 * centre, never the real spot. Inside the area it is full whichever way you face: the exact spot is for exploring.
 */
export function warmth(from: Viewer, signals: readonly Signal[], selected?: string, fog?: Fog): { value: number; signal: Signal | null } {
  const open = fog ? fog.openReal(signals) : signals.filter((s) => !s.fake);
  const pick = (selected && open.find((s) => s.id === selected)) || open.reduce<Signal | null>((best, s) => (!best || distOf(from, s) < distOf(from, best) ? s : best), null);
  if (!pick) return { value: 0, signal: null };
  const d = distOf(from, pick);
  const near = clamp01((ANTENNA.range - d) / (ANTENNA.range - pick.r));
  const face = clamp01(Math.cos(angleBetween(from.facing, Math.atan2(pick.y - from.y, pick.x - from.x))));
  const inside = 1 - clamp01(d / pick.r); // 1 at the centre: facing stops mattering
  return { value: near * (face + (1 - face) * inside), signal: pick };
}

/** The glow's colour for a warmth value. */
export function glowColor(value: number) {
  const k = clamp01(value);
  const ch = (s: number) => Math.round(lerp((ANTENNA.cold >> s) & 255, (ANTENNA.warm >> s) & 255, k));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export interface Pip {
  id: string;
  kind: SignalKind;
  /** Bearing from the viewer to the area's centre, radians. */
  angle: number;
  /** Tiles to the centre. */
  dist: number;
  /** 0 at the viewer .. 1 at the scope's rim; a signal beyond the range sits on the rim. */
  rel: number;
  /** True for one past the range. */
  beyond: boolean;
}

/** The scope's pips: one per open signal, nearest first. */
export function radar(from: Spot, signals: readonly Signal[], range = RADAR.range, fog?: Fog): Pip[] {
  return (fog ? fog.openReal(signals) : signals.filter((s) => !s.fake))
    .map((s) => {
      const d = distOf(from, s);
      return { id: s.id, kind: s.kind, angle: Math.atan2(s.y - from.y, s.x - from.x), dist: d, rel: Math.min(1, d / range), beyond: d > range };
    })
    .sort((a, b) => a.dist - b.dist);
}
