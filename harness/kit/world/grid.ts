/** Uniform spatial grid and cell-range helpers. Pure (no Phaser): tested in grid.test.ts. World origin is (0, 0). */

/** Inclusive block of cells; empty when c1 < c0 or r1 < r0. */
export interface Range {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}
export const EMPTY: Range = { c0: 0, c1: -1, r0: 0, r1: -1 };

export function copyRange(to: Range, from: Range): Range {
  to.c0 = from.c0;
  to.c1 = from.c1;
  to.r0 = from.r0;
  to.r1 = from.r1;
  return to;
}

export const inRange = (r: Range, col: number, row: number) => col >= r.c0 && col <= r.c1 && row >= r.r0 && row <= r.r1;

/** Calls `enter` for each cell in `next` but not in `prev`, `leave` for each in `prev` but not in `next`. Cells are row * cols + col. */
export function diffRanges(prev: Range, next: Range, cols: number, enter: (cell: number) => void, leave: (cell: number) => void) {
  for (let r = prev.r0; r <= prev.r1; r++) for (let c = prev.c0; c <= prev.c1; c++) if (!inRange(next, c, r)) leave(r * cols + c);
  for (let r = next.r0; r <= next.r1; r++) for (let c = next.c0; c <= next.c1; c++) if (!inRange(prev, c, r)) enter(r * cols + c);
}

export class Grid<T> {
  readonly cols: number;
  readonly rows: number;
  private cells: T[][];
  private where = new Map<T, { cell: number; i: number }>();

  constructor(readonly width: number, readonly height: number, readonly cell: number) {
    this.cols = Math.max(1, Math.ceil(width / cell));
    this.rows = Math.max(1, Math.ceil(height / cell));
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
    this.fullRange = { c0: 0, c1: this.cols - 1, r0: 0, r1: this.rows - 1 };
  }

  get size() {
    return this.where.size;
  }
  get full(): Range {
    return { ...this.fullRange };
  }
  /** The whole grid as a shared range: read it, do not edit it. */
  readonly fullRange: Range;
  has(item: T) {
    return this.where.has(item);
  }
  /** Cell index of a point; points outside the world land in the nearest edge cell. */
  cellAt(x: number, y: number) {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cell)));
    return r * this.cols + c;
  }
  /** Cells overlapping a world rectangle, clamped to the grid (an off-world rect gives an empty range). */
  range(x0: number, y0: number, x1: number, y1: number): Range {
    return this.rangeInto({ ...EMPTY }, x0, y0, x1, y1);
  }
  /** Same as `range`, written into `out` (no allocation, for per-frame use). */
  rangeInto(out: Range, x0: number, y0: number, x1: number, y1: number): Range {
    const c0 = Math.max(0, Math.floor(x0 / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor(x1 / this.cell));
    const r0 = Math.max(0, Math.floor(y0 / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor(y1 / this.cell));
    if (c1 < c0 || r1 < r0) return copyRange(out, EMPTY);
    out.c0 = c0;
    out.c1 = c1;
    out.r0 = r0;
    out.r1 = r1;
    return out;
  }
  cellInRange(r: Range, cell: number) {
    return inRange(r, cell % this.cols, Math.floor(cell / this.cols));
  }

  /** Returns the cell the item went into. */
  add(item: T, x: number, y: number): number {
    if (this.where.has(item)) this.remove(item);
    const cell = this.cellAt(x, y);
    const list = this.cells[cell];
    this.where.set(item, { cell, i: list.length });
    list.push(item);
    return cell;
  }
  remove(item: T): boolean {
    const w = this.where.get(item);
    if (!w) return false;
    const list = this.cells[w.cell];
    const last = list.pop()!;
    if (last !== item) {
      list[w.i] = last;
      this.where.get(last)!.i = w.i;
    }
    this.where.delete(item);
    return true;
  }
  /** Re-files an item after it moved. Returns its new cell, or -1 if it stayed in its cell (or is not in the grid). */
  move(item: T, x: number, y: number): number {
    const w = this.where.get(item);
    if (!w) return -1;
    if (this.cellAt(x, y) === w.cell) return -1;
    this.remove(item);
    return this.add(item, x, y);
  }
  itemsIn(cell: number): readonly T[] {
    return this.cells[cell];
  }
  /** Calls fn for every item in the range. Cells are walked back to front, so `fn` may remove the item it is given. */
  each(r: Range, fn: (item: T) => void) {
    for (let row = r.r0; row <= r.r1; row++)
      for (let col = r.c0; col <= r.c1; col++) {
        const list = this.cells[row * this.cols + col];
        for (let i = list.length - 1; i >= 0; i--) fn(list[i]);
      }
  }
  count(r: Range) {
    let n = 0;
    for (let row = r.r0; row <= r.r1; row++) for (let col = r.c0; col <= r.c1; col++) n += this.cells[row * this.cols + col].length;
    return n;
  }
}
