/**
 * The generator's part of the props (P39): ruin pieces (walls round each find with a gap left, debris among them) and a light
 * scatter in the open, by biome (`SCATTER`, defs/props.ts). Pure, so the land generator (`mapgen.ts`) can call it.
 * Props keep off the lift, the seeps, hives and places (`keep`) and stand apart; at the end every point that the lift reached
 * without props it still reaches with them (a solid prop is taken away until it does), so nothing is ever walled off.
 */
import type { Rng } from '../../../../harness/kit/rng';
import { CAR_RUINS, PROPS, RUIN_PIECES, SCATTER, WALL_MATERIAL, WEAR, type BiomeId, type Material, type PropKind, type RuinKind, type RuinSize } from './defs';
import type { Spot } from './mapgen';

/** What the generator decides about a prop (tile coordinates); `wear` is the share of its health it starts with, `ruin` the index of the ruin (in `MapData.ruins`) it belongs to. */
export interface PropSpec {
  kind: PropKind;
  x: number;
  y: number;
  material?: Material;
  wear: number;
  ruin?: number;
}


export interface PropMap {
  props: PropSpec[];
  /** Each ruin's size class (a Parable Trail ruin has none: no pieces). */
  sizes: (RuinSize | undefined)[];
}

/**
 * Ruin pieces (walls round each find with a gap left, debris among them) and a light scatter of props in the open, by biome.
 * `open(i)` says a tile is not rock. Props keep off the lift, the seeps, hives and places (`keep`) and stand apart from each
 * other; at the end every point that was reachable from the lift without props still is (a solid prop is taken away until it
 * is), so nothing is ever walled off.
 */
export function scatterProps(o: { w: number; h: number; open: (i: number) => boolean; lift: Spot; keep: Spot[]; ruins: { x: number; y: number; kind: RuinKind; trail?: number; place?: true }[]; biome: BiomeId; r: Rng }): PropMap {
  const { w, h, r, lift } = o;
  const specs: PropSpec[] = [];
  const sizes: (RuinSize | undefined)[] = [];
  const taken = new Set<number>();
  const d = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.y - b.y);
  const free = (x: number, y: number) => x > 1 && y > 1 && x < w - 2 && y < h - 2 && o.open(y * w + x) && !taken.has(y * w + x) && d({ x, y }, lift) > 3.5 && !o.keep.some((k) => d(k, { x, y }) < 1.5);
  const put = (s: PropSpec) => {
    specs.push(s);
    taken.add(s.y * w + s.x);
  };
  const walls = WALL_MATERIAL[o.biome];
  o.ruins.forEach((ru, i) => {
    if (ru.trail !== undefined || ru.place) {
      // A place's ruins stand as its file says (the Parable Trail's verses must never be lost).
      sizes.push(undefined);
      return;
    }
    const rolled = r.weighted(Object.entries(RUIN_PIECES.size).map(([k, v]) => [k as RuinSize, v.weight] as const));
    const size: RuinSize = ru.kind === 'dock' ? 'small' : rolled; // an old dock is a small ruin (P58 H)
    const P = RUIN_PIECES.size[size], mat = r.pick(walls);
    sizes.push(size);
    const gap0 = r.range(0, Math.PI * 2), span = Math.PI * 2 - RUIN_PIECES.gap;
    for (let k = 0; k < P.walls; k++) {
      const a = gap0 + RUIN_PIECES.gap / 2 + ((k + 0.5) / P.walls) * span;
      const x = Math.round(ru.x + Math.cos(a) * RUIN_PIECES.ring), y = Math.round(ru.y + Math.sin(a) * RUIN_PIECES.ring);
      if (free(x, y)) put({ kind: 'wall', x, y, material: mat, wear: r.range(...WEAR.ruin), ruin: i });
    }
    for (let k = 0; k < P.debris; k++) {
      const a = r.range(0, Math.PI * 2), rad = r.range(0.9, 2.1);
      const x = Math.round(ru.x + Math.cos(a) * rad), y = Math.round(ru.y + Math.sin(a) * rad);
      if (free(x, y) && !(x === ru.x && y === ru.y)) put({ kind: 'debris', x, y, material: r.pick(walls), wear: r.range(...WEAR.ruin), ruin: i });
    }
  });
  // A car stands beside the ruin of a car.
  o.ruins.forEach((ru) => {
    if (ru.trail !== undefined || ru.place || !(CAR_RUINS as readonly string[]).includes(ru.kind)) return;
    for (let t = 0; t < 12; t++) {
      const a = r.range(0, Math.PI * 2), x = Math.round(ru.x + Math.cos(a) * 4.5), y = Math.round(ru.y + Math.sin(a) * 4.5);
      if (free(x, y)) return put({ kind: 'car', x, y, wear: r.range(...WEAR.prop) });
    }
  });
  const S = SCATTER[o.biome], apart = o.ruins.map((q) => ({ x: q.x, y: q.y }));
  const placed: Spot[] = [];
  for (let t = 0, n = 0; t < 800 && n < S.count; t++) {
    const x = r.int(4, w - 5), y = r.int(4, h - 5);
    if (!free(x, y) || d({ x, y }, lift) < 7 || [...o.keep, ...apart].some((k) => d(k, { x, y }) < 4) || placed.some((k) => d(k, { x, y }) < 4)) continue;
    placed.push({ x, y });
    put({ kind: r.weighted(S.kinds), x, y, wear: r.range(...WEAR.prop) });
    n++;
  }
  // Nothing walled off: what the lift reaches without solid props it still reaches with them.
  const targets = [...o.keep, ...o.ruins.map((q) => ({ x: q.x, y: q.y }))];
  const reach = (solid: Set<number>) => {
    const seen = new Uint8Array(w * h);
    const q = [lift.y * w + lift.x];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop()!;
      const x = i % w, y = (i - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (seen[j] || !o.open(j) || solid.has(j)) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    return seen;
  };
  const base = reach(new Set());
  for (let guard = 0; guard < 60; guard++) {
    const solids = specs.filter((s) => PROPS[s.kind].solid);
    const cur = reach(new Set(solids.map((s) => s.y * w + s.x)));
    const bad = targets.find((t) => base[t.y * w + t.x] && !cur[t.y * w + t.x]);
    if (!bad || !solids.length) break;
    const nearest = solids.sort((a, b) => d(a, bad) - d(b, bad))[0];
    specs.splice(specs.indexOf(nearest), 1);
  }
  return { props: specs, sizes };
}
