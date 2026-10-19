/** Pure parts of the world kit (no Phaser): remains decay curve, mark lookup, footprint stride. Tested in logic.test.ts. */

// ---- remains: decay stages -------------------------------------------------------------------

export interface Stage {
  /** Multiplied into the object's colour (0xffffff = unchanged). */
  tint: number;
  /** Multiplier on the object's scale when the remains started. */
  scale: number;
  /** Multiplier on its alpha (default 1). */
  alpha?: number;
}

/** Fresh, then darker, then rusty, then a small dark husk; the husk's tint is what the baked smudge takes. */
export const DEFAULT_STAGES: Stage[] = [
  { tint: 0xffffff, scale: 1 },
  { tint: 0x8a7f78, scale: 0.95 },
  { tint: 0x6a3a22, scale: 0.8, alpha: 0.95 },
  { tint: 0x2a1a14, scale: 0.55, alpha: 0.85 },
];

export function lerpColor(a: number, b: number, t: number): number {
  const u = 1 - t;
  const r = Math.round(((a >> 16) & 255) * u + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * u + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * u + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

/** The look at progress t (0..1) through evenly spaced stages, blended linearly between neighbours. Pass `out` to reuse an object (per-frame use). */
export function stageAt(stages: Stage[], t: number, out = { tint: 0, scale: 0, alpha: 0 }): { tint: number; scale: number; alpha: number } {
  const last = stages.length - 1;
  const p = Math.min(1, Math.max(0, t)) * last;
  const i = Math.max(0, Math.min(last - 1, Math.floor(p)));
  const a = stages[i];
  const b = stages[Math.min(last, i + 1)];
  const f = last === 0 ? 0 : p - i;
  out.tint = lerpColor(a.tint, b.tint, f);
  out.scale = a.scale + (b.scale - a.scale) * f;
  out.alpha = (a.alpha ?? 1) + ((b.alpha ?? 1) - (a.alpha ?? 1)) * f;
  return out;
}

// ---- marks: what lies where ------------------------------------------------------------------

export interface MarkInfo {
  kind: string;
  /** Strength 0..1 (the stamp's alpha, lowered by `wear`). */
  amount: number;
  color: number;
}

/**
 * A coarse record of tracked marks, so game code can ask "what is under my feet" without reading pixels back from the
 * baked texture. One record per cell; a newer stamp replaces the older one (it is drawn on top).
 */
export class MarkMap {
  private cells = new Map<number, MarkInfo>();
  constructor(readonly cell = 32) {}

  private key(cx: number, cy: number) {
    return (cy + 32768) * 65536 + (cx + 32768);
  }
  get size() {
    return this.cells.size;
  }
  add(kind: string, x: number, y: number, radius: number, amount: number, color: number) {
    const cs = this.cell;
    const hc = Math.floor(x / cs);
    const hr = Math.floor(y / cs);
    for (let r = Math.floor((y - radius) / cs); r <= Math.floor((y + radius) / cs); r++)
      for (let c = Math.floor((x - radius) / cs); c <= Math.floor((x + radius) / cs); c++) {
        const dx = (c + 0.5) * cs - x;
        const dy = (r + 0.5) * cs - y;
        if (dx * dx + dy * dy <= radius * radius || (c === hc && r === hr)) this.cells.set(this.key(c, r), { kind, amount, color });
      }
  }
  /** The mark under a point, if its strength is still above 0.05 and (when given) its kind is listed. */
  at(x: number, y: number, kinds?: readonly string[]): MarkInfo | null {
    const m = this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(y / this.cell)));
    if (!m || m.amount < 0.05) return null;
    return !kinds || kinds.includes(m.kind) ? m : null;
  }
  /** Lowers the strength under a point (a mark that has been walked through enough stops marking feet). */
  wear(x: number, y: number, by: number) {
    const m = this.cells.get(this.key(Math.floor(x / this.cell), Math.floor(y / this.cell)));
    if (m) m.amount = Math.max(0, m.amount - by);
  }
  clear() {
    this.cells.clear();
  }
}

// ---- footprints: stride tracking -------------------------------------------------------------

export interface Print {
  x: number;
  y: number;
  /** Heading in radians (0 = +x). */
  heading: number;
  /** -1 left, 1 right; alternates. */
  side: -1 | 1;
}

/** Turns a stream of positions into alternating left/right print positions every `stride` px walked. */
export class Strider {
  private lx = 0;
  private ly = 0;
  private started = false;
  private side: -1 | 1 = 1;
  constructor(public stride: number, public gap: number) {}

  reset() {
    this.started = false;
  }
  step(x: number, y: number): Print | null {
    if (!this.started) {
      this.started = true;
      this.lx = x;
      this.ly = y;
      return null;
    }
    const dx = x - this.lx;
    const dy = y - this.ly;
    const d = Math.hypot(dx, dy);
    if (d < this.stride) return null;
    this.lx = x;
    this.ly = y;
    if (d > this.stride * 4) return null; // teleport: start a new trail
    const heading = Math.atan2(dy, dx);
    this.side = (this.side === 1 ? -1 : 1) as -1 | 1;
    const off = (this.gap / 2) * this.side;
    return { x: x + Math.cos(heading + Math.PI / 2) * off, y: y + Math.sin(heading + Math.PI / 2) * off, heading, side: this.side };
  }
}
