/** Grid paths for robots on foot: A* (8 directions, no corner cutting) and a line-of-sight test for straight walks. */

/** Path of tile indices from `from` to `to` (both tile indices), excluding `from`; [] when there is none. */
export function astar(walk: (i: number) => boolean, w: number, h: number, from: number, to: number, limit = 6000): number[] {
  if (from === to) return [];
  if (!walk(to)) return [];
  const tx = to % w, ty = (to - tx) / w;
  const g = new Map<number, number>([[from, 0]]);
  const came = new Map<number, number>();
  const open: { i: number; f: number }[] = [{ i: from, f: 0 }];
  const closed = new Set<number>();
  const hx = (i: number) => {
    const x = i % w, y = (i - x) / w;
    const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  };
  let n = 0;
  while (open.length && n++ < limit) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const { i } = open.splice(bi, 1)[0];
    if (i === to) {
      const out = [i];
      let c = i;
      while (came.has(c) && came.get(c) !== from) out.push((c = came.get(c)!));
      return out.reverse();
    }
    if (closed.has(i)) continue;
    closed.add(i);
    const x = i % w, y = (i - x) / w;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (closed.has(j) || !walk(j)) continue;
        if (dx && dy && (!walk(y * w + nx) || !walk(ny * w + x))) continue;
        const ng = g.get(i)! + (dx && dy ? 1.414 : 1);
        if (ng < (g.get(j) ?? Infinity)) {
          g.set(j, ng);
          came.set(j, i);
          open.push({ i: j, f: ng + hx(j) });
        }
      }
  }
  return [];
}

/** Can a body of radius `r` walk straight from a to b? Samples the line every few px against blocked tiles. */
export function clearLine(blocked: (x: number, y: number) => boolean, ax: number, ay: number, bx: number, by: number, r: number) {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(len / 8));
  for (let k = 0; k <= n; k++) {
    const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
    if (blocked(x - r, y - r) || blocked(x + r, y - r) || blocked(x - r, y + r) || blocked(x + r, y + r)) return false;
  }
  return true;
}
