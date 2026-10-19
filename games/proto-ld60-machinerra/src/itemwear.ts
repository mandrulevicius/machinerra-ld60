/**
 * Wear on the things that stand in the land: props (`propart.ts`) and ruins (`ruinart.ts`, the desert's four in `art.ts`).
 * One call at the end of a texture's draw (inside the house style's pass, so the wear is flattened and cut to the palette with
 * the rest): grime at the base, rust (or brass's green patina), dents with a lit lip, flakes of paint gone, weathered
 * streaks on wood, damp stains on stone. It paints only over what is already drawn (`source-atop`), seeded by the texture's
 * key, so the same prop always wears the same way, and every state (whole, cracked, rubble) has its own.
 * Add a look: a `WEAR` row by material; a kind that dents or wears differently takes an `o` override in its caller.
 * Every number is a guess tuned by eye.
 */
import type { Ctx } from './art';

/** How a material wears: rust (`rust`, in `col`), weathered streaks (`weather`), grime at the base (`grit`), dents (`dents`), paint flakes (`flakes`), damp stains (`damp`); each 0 to about 1.5. */
export interface WearLook {
  rust: number;
  weather: number;
  grit: number;
  dents: number;
  flakes: number;
  damp: number;
  /** The rust's colour, its lighter core, and the flakes' bare metal. */
  col: [string, string, string];
}

const RUST: WearLook['col'] = ['#7c4222', '#b4682e', '#9ea2a2'];
const PATINA: WearLook['col'] = ['#4f8a78', '#86bba4', '#9a7a30'];
const ZERO = { rust: 0, weather: 0, grit: 0.8, dents: 0, flakes: 0, damp: 0 };

export const WEAR: Record<string, WearLook> = {
  wood: { ...ZERO, weather: 1, grit: 0.9, flakes: 0.4, col: ['#5a4630', '#8a6c46', '#c8b48c'] },
  tin: { ...ZERO, rust: 1, grit: 0.9, dents: 1, flakes: 0.7, col: RUST },
  glass: { ...ZERO, grit: 1, weather: 0.2, col: ['#5a6a66', '#a8bcb6', '#d8ece8'] },
  brass: { ...ZERO, rust: 0.7, grit: 0.9, dents: 0.8, flakes: 0.3, col: PATINA },
  concrete: { ...ZERO, grit: 1.1, damp: 1, flakes: 0.8, col: ['#46423c', '#7a746a', '#cfc8b8'] },
  /** P47's steampunk stone: soot in the courses, damp at the foot. */
  brick: { ...ZERO, grit: 1, damp: 1.1, flakes: 0.5, col: ['#3a2a22', '#7a5040', '#d8b8a0'] },
  /** Painted metal (a car, a vending machine, a cart): rust at the edges, flakes of paint gone, dents. */
  paint: { ...ZERO, rust: 0.9, grit: 1, dents: 1.2, flakes: 1, col: RUST },
  /** Bare old metal (a dish, a panel, wire, a rail). */
  iron: { ...ZERO, rust: 1.1, grit: 0.9, dents: 0.7, flakes: 0.4, col: RUST },
};

/** A seeded stream from a string (the texture's key). */
function seeded(key: string) {
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let s = h >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Wear the thing drawn in `c` (its `w` x `h` game px; `c` may be scaled, as the house pass's is). `look` is a `WEAR` row, `amount`
 * scales it all (a cracked prop wears harder), `zone` the fraction of the height the rust, dents and flakes may fall in
 * (a ruin's mound at its foot stays clean of them; the grime still darkens it).
 */
export function wearItem(c: Ctx, w: number, h: number, key: string, look: WearLook, amount = 1, zone: [number, number] = [0.06, 0.82]) {
  const rnd = seeded(key), rr = (a: number, b: number) => a + rnd() * (b - a);
  const k = c.getTransform().a || 1, W = Math.ceil(w * k), H = Math.ceil(h * k);
  const alpha = c.getImageData(0, 0, W, H).data;
  const solid = (x: number, y: number) => {
    const px = Math.floor(x * k), py = Math.floor(y * k);
    return px >= 0 && py >= 0 && px < W && py < H && alpha[(py * W + px) * 4 + 3] > 200;
  };
  const edge = (x: number, y: number) => solid(x, y) && !(solid(x - 2.2, y) && solid(x + 2.2, y) && solid(x, y - 2.2) && solid(x, y + 2.2));
  /** A spot on the thing (in the zone), `edgy` near its edge when it can be found. */
  const spot = (edgy: boolean, z = zone): [number, number] | null => {
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w, y = h * (z[0] + rnd() * (z[1] - z[0]));
      if (edgy ? edge(x, y) : solid(x, y)) return [x, y];
    }
    return null;
  };
  const [dark, mid, bare] = look.col;
  c.save();
  c.globalCompositeOperation = 'source-atop';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const blot = (x: number, y: number, r: number, col: string, a: number) => {
    c.globalAlpha = a;
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(x, y, r, r * rr(0.6, 0.95), rr(0, Math.PI), 0, Math.PI * 2);
    c.fill();
  };
  const line = (x0: number, y0: number, x1: number, y1: number, col: string, a: number, lw: number) => {
    c.globalAlpha = a;
    c.strokeStyle = col;
    c.lineWidth = lw;
    c.beginPath();
    c.moveTo(x0, y0);
    c.lineTo(x1, y1);
    c.stroke();
  };

  // Rust: blotches at the edges with a lighter core, a run-off streak below each.
  for (let i = 0, n = Math.round(look.rust * amount * (w + h) / 17); i < n; i++) {
    const p = spot(rnd() < 0.7);
    if (!p) continue;
    const r = rr(1.3, 3.2);
    blot(p[0], p[1], r, dark, 0.8);
    blot(p[0] - 0.3, p[1] - 0.3, r * 0.55, mid, 0.85);
    if (rnd() < 0.6) line(p[0], p[1] + r, p[0] + rr(-0.6, 0.6), p[1] + r + rr(3, 9), dark, 0.5, rr(0.9, 1.5));
  }
  // Weathered streaks (wood: grey-brown grain run down, a few bleached): the surface gone dry.
  for (let i = 0, n = Math.round(look.weather * amount * (w + h) / 6); i < n; i++) {
    const p = spot(false, [0.05, 0.95]);
    if (!p) continue;
    const len = rr(4, 12);
    line(p[0], p[1], p[0] + rr(-0.5, 0.5), p[1] + len, rnd() < 0.7 ? dark : bare, rnd() < 0.7 ? 0.38 : 0.3, rr(0.8, 1.6));
  }
  // Damp: dark stains low on the thing with a run above each (stone).
  for (let i = 0, n = Math.round(look.damp * amount * (w + h) / 18); i < n; i++) {
    const p = spot(false, [0.4, 0.95]);
    if (!p) continue;
    blot(p[0], p[1], rr(2, 5), dark, 0.32);
    line(p[0], p[1] - rr(3, 8), p[0] + rr(-0.5, 0.5), p[1], dark, 0.25, rr(1, 2));
  }
  // Dents: a dark crescent and its lit lip below-right.
  for (let i = 0, n = Math.round(look.dents * amount * (w + h) / 40); i < n; i++) {
    const p = spot(false);
    if (!p) continue;
    const r = rr(1.8, 3.6), a0 = rr(0, Math.PI * 2);
    c.globalAlpha = 0.6;
    c.strokeStyle = '#1d1a17';
    c.lineWidth = 1.1;
    c.beginPath();
    c.arc(p[0], p[1], r, a0, a0 + 2.2);
    c.stroke();
    c.globalAlpha = 0.5;
    c.strokeStyle = bare;
    c.lineWidth = 0.9;
    c.beginPath();
    c.arc(p[0] + 0.7, p[1] + 0.7, r, a0 + 3.3, a0 + 5.2);
    c.stroke();
  }
  // Chipped paint: little flakes at the edges showing what is under.
  for (let i = 0, n = Math.round(look.flakes * amount * (w + h) / 12); i < n; i++) {
    const p = spot(true);
    if (!p) continue;
    const r = rr(0.9, 2), a0 = rr(0, Math.PI * 2);
    c.globalAlpha = 0.9;
    c.fillStyle = rnd() < 0.55 ? bare : dark;
    c.beginPath();
    for (let j = 0; j < 5; j++) {
      const a = a0 + (j / 5) * Math.PI * 2, q = r * rr(0.6, 1.2);
      c.lineTo(p[0] + Math.cos(a) * q, p[1] + Math.sin(a) * q * 0.8);
    }
    c.closePath();
    c.fill();
  }
  // Grime: the base darkened, a spatter of dirt above it.
  const gr = c.createLinearGradient(0, h * 0.5, 0, h);
  gr.addColorStop(0, 'rgba(29,26,23,0)');
  gr.addColorStop(1, `rgba(29,26,23,${Math.min(0.75, 0.42 * look.grit * amount)})`);
  c.globalAlpha = 1;
  c.fillStyle = gr;
  c.fillRect(0, 0, w, h);
  for (let i = 0, n = Math.round(look.grit * amount * w / 3); i < n; i++) {
    const p = spot(false, [0.55, 0.98]);
    if (p) blot(p[0], p[1], rr(0.5, 1.3), '#1d1a17', 0.5);
  }
  c.restore();
}
