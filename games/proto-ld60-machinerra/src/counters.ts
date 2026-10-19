/**
 * The soft counters' icons (P22; rules in `sim/tiers.ts`, words in `COUNTERS`, `sim/defs/tiers.ts`): one small drawing each, kept as
 * points so the same shape is drawn over an enemy (`drawCounter`, Phaser graphics) and on the course table (`iconSvg`, HTML).
 * Add a counter: a `CounterId`, its `COUNTERS` row, and its shape here.
 */
import type Phaser from 'phaser';
import { COUNTERS, type CounterId } from './sim/defs';

type Pt = [number, number];
/** Polygons to fill, and open lines to stroke, in a box about -5..5 round the centre. */
interface Shape { fill?: Pt[][]; line?: Pt[][] }

const circle = (r: number, n = 12): Pt[] => Array.from({ length: n + 1 }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * r, Math.sin((i / n) * Math.PI * 2) * r] as Pt);

export const COUNTER_SHAPE: Record<CounterId, Shape> = {
  // Three spikes.
  thorns: { fill: [-1, 0, 1].map((j): Pt[] => [[j * 3.5 - 2, 4], [j * 3.5 + 2, 4], [j * 3.5, -4]]) },
  // A ring struck through: a shot turned away.
  mirror: { line: [circle(4), [[-4, 4], [4, -4]]] },
  // A cross.
  mender: { fill: [[[-1.5, -4.5], [1.5, -4.5], [1.5, -1.5], [4.5, -1.5], [4.5, 1.5], [1.5, 1.5], [1.5, 4.5], [-1.5, 4.5], [-1.5, 1.5], [-4.5, 1.5], [-4.5, -1.5], [-1.5, -1.5]]] },
  // Two chevrons: gone, forward.
  blinker: { line: [[[-4.5, -4], [-1, 0], [-4.5, 4]], [[0, -4], [3.5, 0], [0, 4]]] },
  // A weight.
  heavy: { fill: [[[-2.5, -4], [2.5, -4], [2.5, -2], [4.5, 4], [-4.5, 4], [-2.5, -2]]] },
  // The earth sign: a stem into three bars (P31, Officer units).
  grounded: { line: [[[0, -5], [0, -1]], [[-4.5, -1], [4.5, -1]], [[-3, 1.5], [3, 1.5]], [[-1.5, 4], [1.5, 4]]] },
};

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** The icon at (x, y), `s` times its natural size (about 10 px), over a faint dark disc so it reads on any ground. */
export function drawCounter(g: Phaser.GameObjects.Graphics, id: CounterId, x: number, y: number, s = 1) {
  const c = COUNTERS[id].color, S = COUNTER_SHAPE[id];
  g.fillStyle(0x1d1a17, 0.55).fillCircle(x, y, 6.5 * s);
  g.fillStyle(c, 1);
  for (const poly of S.fill ?? []) {
    g.beginPath();
    poly.forEach(([px, py], i) => (i ? g.lineTo(x + px * s, y + py * s) : g.moveTo(x + px * s, y + py * s)));
    g.closePath().fillPath();
  }
  g.lineStyle(1.5 * s, c, 1);
  for (const line of S.line ?? []) {
    g.beginPath();
    line.forEach(([px, py], i) => (i ? g.lineTo(x + px * s, y + py * s) : g.moveTo(x + px * s, y + py * s)));
    g.strokePath();
  }
}

/** The same icon as inline SVG (`px` square), for the course table. */
export function iconSvg(id: CounterId, px = 14): string {
  const c = hex(COUNTERS[id].color), S = COUNTER_SHAPE[id];
  const pts = (p: Pt[]) => p.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(' ');
  return [
    `<svg class="hb-counter__icon" viewBox="-6 -6 12 12" width="${px}" height="${px}" aria-hidden="true">`,
    ...(S.fill ?? []).map((p) => `<polygon points="${pts(p)}" fill="${c}"/>`),
    ...(S.line ?? []).map((p) => `<polyline points="${pts(p)}" fill="none" stroke="${c}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`),
    '</svg>',
  ].join('');
}
