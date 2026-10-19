/**
 * Segmented bodies (P7): a head, N plates and a tail that follow the head's path. Pure maths (the view is `chainview.ts`).
 * The rope: every plate sits at a fixed gap from the one before it and follows it, so the body takes the head's path, trails
 * behind a knockback and folds as the head turns. On top of the rope, only for drawing: a wave travelling from head to tail
 * (sinuous while it moves, a flail when hit or flung) and the coil (the rattler's tell: the body winds into a spiral under the
 * head, which rears up; it unwinds from the head down when it strikes). A foe gets a row in `CHAINS`; nothing here touches the sim.
 * Add a long-bodied foe: paint a head, a plate and a tail (`tools/mob-svg.cjs`), add the row.
 */

/** What a long-bodied foe is made of (frames in the atlas) and how it moves; lengths are px at scale 1, angles radians. */
export interface ChainDef {
  head: string;
  seg: string;
  /** Every other plate when set (the rattler's LED plate). */
  seg2?: string;
  tail: string;
  /** Plates between the head and the tail piece, and the gap between two (centre to centre). */
  n: number;
  gap: number;
  /** Where each piece is pinned, as a fraction of its frame: the head and the tail at the neck joint (the plates are centred). */
  headJoint: [number, number];
  tailJoint: [number, number];
  /** The wave: side-to-side px at most, and radians a plate along. */
  amp: number;
  waveK: number;
  /** The coil, if it coils: turns of the spiral, how high the head rears (px) and how high the tail's rattle stands. */
  coil?: { turns: number; rise: number; rattle: number };
  /** The chain of a boss: its plates vanish into the rock where the rock is solid (a vein-crawler's), dimmed. */
  rock?: boolean;
}

export const CHAINS = {
  // The rattler (Laimonas's brass-and-plastic robot snake, `tools/mob-svg.cjs` cut apart): coils as it winds up its strike.
  snake: { head: 'foe/snake-head', seg: 'foe/snake-seg', seg2: 'foe/snake-seg2', tail: 'foe/snake-tail', n: 13, gap: 4.8, headJoint: [0.225, 0.62], tailJoint: [0.305, 0.5], amp: 3.4, waveK: 0.8, coil: { turns: 1.4, rise: 13, rattle: 11 } },
  // Old Rattlejaw, its painting cut apart: the same snake, bigger, its hood raised higher over the coil.
  snakeBoss: { head: 'foe/snake-boss-head', seg: 'foe/snake-boss-seg', tail: 'foe/snake-boss-tail', n: 12, gap: 10, headJoint: [0.298, 0.879], tailJoint: [0.15, 0.5], amp: 6.5, waveK: 0.7, coil: { turns: 1.5, rise: 26, rattle: 20 } },
  // The vein-crawler: a red cable worm that swims through the rock.
  veinworm: { head: 'foe/veinworm-head', seg: 'foe/veinworm-seg', tail: 'foe/veinworm-tail', n: 14, gap: 3.7, headJoint: [0.244, 0.5], tailJoint: [0.32, 0.5], amp: 4.2, waveK: 0.9, rock: true },
} satisfies Record<string, ChainDef>;
export type ChainKey = keyof typeof CHAINS;

/** The row for this foe, if its body is a chain. */
export function chainKey(h: { kind: string; boss: boolean }): ChainKey | undefined {
  if (h.kind === 'snake') return h.boss ? 'snakeBoss' : 'snake';
  if (h.kind === 'veinworm' && !h.boss) return 'veinworm';
  return undefined;
}

/** The points of a rope: plates 0..n-1 head to tail, and the tail piece at n. */
export interface Rope {
  x: number[];
  y: number[];
}

/** A rope of n+1 points laid straight from (hx, hy) along (dx, dy) away from the head. */
export function makeRope(n: number, hx: number, hy: number, dx: number, dy: number, gap: number): Rope {
  const d = Math.hypot(dx, dy) || 1;
  const r: Rope = { x: [], y: [] };
  for (let i = 0; i <= n; i++) {
    r.x.push(hx - (dx / d) * gap * (i + 1));
    r.y.push(hy - (dy / d) * gap * (i + 1));
  }
  return r;
}

/** The head is at (hx, hy): every point follows the one before it, at exactly `gap` from it. */
export function pull(r: Rope, hx: number, hy: number, gap: number) {
  let px = hx, py = hy;
  for (let i = 0; i < r.x.length; i++) {
    let dx = r.x[i] - px, dy = r.y[i] - py;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      dx = i ? r.x[i - 1] - r.x[i] : -1;
      dy = i ? r.y[i - 1] - r.y[i] : 0;
    }
    const m = Math.hypot(dx, dy) || 1;
    r.x[i] = px + (dx / m) * gap;
    r.y[i] = py + (dy / m) * gap;
    px = r.x[i];
    py = r.y[i];
  }
}

/** The length of the whole rope's path from the head. */
export const ropeLength = (n: number, gap: number) => (n + 1) * gap;

/** The shortest signed angle from a to b. */
export const angleTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
/** Turn a toward b by at most `step`. */
export const turnTo = (a: number, b: number, step: number) => {
  const d = angleTo(a, b);
  return a + Math.max(-step, Math.min(step, d));
};
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const smooth = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** The wave's side-to-side offset at point i of n (px): it grows toward the tail, and travels with `phase`. */
export function wave(i: number, n: number, phase: number, amp: number, k: number) {
  return amp * (0.4 + 0.6 * (i / n)) * Math.sin(phase - i * k);
}

/** The spiral a coil winds into, as the rope's points (plate i of n, tail at n): flat to the ground by `flat`, the head at the outer end. */
export function coilPoint(i: number, n: number, radius: number, turns: number, dir: 1 | -1, face: number, flat: number, out: { x: number; y: number; lift: number }) {
  const s = (i + 1) / (n + 1);
  const a = face + dir * turns * Math.PI * 2 * s;
  const r = radius * (1 - 0.6 * s);
  out.x = Math.cos(a) * r - Math.cos(face) * radius;
  out.y = Math.sin(a) * r * flat - Math.sin(face) * radius * flat;
  out.lift = s * 2.5;
  return out;
}

/** The radius of a coil of the whole rope, so that the spiral's path is as long as the body. */
export const coilRadius = (len: number, turns: number) => len / (turns * Math.PI * 2 * 0.7);

/** What a chain is told each frame (from the sim's foe and the view's reading of it). */
export interface ChainIn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Winding up a strike or an attack: coil, face the aim. */
  wind: boolean;
  /** Striking: uncoil, face the aim. */
  strike: boolean;
  /** The angle of the aim (toward its target, or its strike's line), when it has one. */
  aim: number | null;
  /** Sent flying by a kick (a long flail), or struck. */
  flung: boolean;
  hurt: boolean;
}

export interface ChainState {
  rope: Rope;
  /** The wave's phase, the coil (0..1), seconds still, the way the head faces, the flail (0..1), the winding of this snake's coil. */
  phase: number;
  coil: number;
  still: number;
  face: number;
  shock: number;
  dir: 1 | -1;
  /** Where the head was last frame, for how far it travelled, and its speed. */
  px: number;
  py: number;
  speed: number;
}

/** A chain at rest behind a head at (x, y) facing `face`. */
export function makeChain(d: ChainDef, x: number, y: number, face: number, dir: 1 | -1, f = 1): ChainState {
  return { rope: makeRope(d.n, x, y, Math.cos(face), Math.sin(face), d.gap * f), phase: 0, coil: 0, still: 0, face, shock: 0, dir, px: x, py: y, speed: 0 };
}

/** A chain whose head is now at (x, y) and faces `s.face`: the rope laid straight behind it. A chain back from off screen (it was not stepped there) starts so, not folded where it was left. */
export function relay(s: ChainState, d: ChainDef, x: number, y: number, f = 1) {
  s.rope = makeRope(d.n, x, y, Math.cos(s.face), Math.sin(s.face), d.gap * f);
  s.px = x;
  s.py = y;
  s.coil = 0;
  s.shock = 0;
}

/**
 * A fallen chain's plate i, `ms` after the fall: it goes limp (`limp` 0..1, a quick drop that starts a beat later down the body),
 * lies, then fades (`alpha`), later down the body as well. One clock drives the whole corpse (`ChainView.down`), not two tweens a plate.
 */
export const CORPSE = { limp: 220, stagger: 18, lie: 4000, fade: 1500, fadeStagger: 40 };
export function corpseAt(i: number, ms: number): { limp: number; alpha: number } {
  const k = clamp((ms - i * CORPSE.stagger) / CORPSE.limp, 0, 1);
  return { limp: k * k, alpha: 1 - clamp((ms - (CORPSE.lie + i * CORPSE.fadeStagger)) / CORPSE.fade, 0, 1) };
}
/** How long the corpse lasts: its last plate's fade ends. */
export const corpseLife = (pieces: number) => CORPSE.lie + (pieces - 1) * CORPSE.fadeStagger + CORPSE.fade;

/** Speed (px/s) under which a foe counts as standing still, and the seconds of it before it coils on its own. */
export const IDLE = { speed: 14, after: 0.6 };

/** Advance the chain by dt seconds (the foe's size factor `f` scales its lengths). A head that jumps (spawn, teleport) re-lays the rope. */
export function stepChain(s: ChainState, d: ChainDef, i: ChainIn, dt: number, f = 1) {
  const speed = Math.hypot(i.vx, i.vy);
  s.speed = speed;
  const jump = Math.hypot(i.x - s.px, i.y - s.py);
  if (jump > ropeLength(d.n, d.gap * f) * 2) s.rope = makeRope(d.n, i.x, i.y, Math.cos(s.face), Math.sin(s.face), d.gap * f);
  s.px = i.x;
  s.py = i.y;
  // Which way it faces: along its way, else at its aim; a wind-up or a strike faces the aim.
  let want = s.face;
  if (speed > 25 && !i.wind && !i.strike) want = Math.atan2(i.vy, i.vx);
  else if (i.aim !== null) want = i.aim;
  s.face = turnTo(s.face, want, (i.strike ? 20 : 9) * dt);
  // The coil: after standing still a while, or while winding up; a strike lets it go, head first.
  s.still = speed < IDLE.speed && !i.flung ? s.still + dt : 0;
  const coils = !!d.coil && !i.strike && !i.flung && (i.wind || s.still > IDLE.after);
  const to = coils ? 1 : 0;
  const rate = i.strike || i.flung ? 16 : to > s.coil ? 5 : 8;
  s.coil = clamp(s.coil + clamp(to - s.coil, -rate * dt, rate * dt), 0, 1);
  // The wave runs along the body as it travels (more of it the faster it goes), and flails when struck.
  s.phase += speed * dt * 0.16 + dt * (0.8 + s.shock * 14);
  s.shock = i.hurt ? 1 : i.flung ? Math.max(s.shock, 0.7) : Math.max(0, s.shock - dt * 1.8);
  pull(s.rope, i.x, i.y, d.gap * f);
}

/** A drawn piece: where it is on the ground, how far it is lifted off it (px, up), its angle. */
export interface Piece {
  x: number;
  y: number;
  lift: number;
  angle: number;
}
export interface ChainPose {
  head: Piece & { flip: boolean };
  /** The plates, head to tail, then the tail piece. */
  parts: Piece[];
}

export const newPose = (n: number): ChainPose => ({ head: { x: 0, y: 0, lift: 0, angle: 0, flip: false }, parts: Array.from({ length: n + 1 }, () => ({ x: 0, y: 0, lift: 0, angle: 0 })) });

const tmp = { x: 0, y: 0, lift: 0 };
/** Where every piece is drawn now: the rope, the wave over it, the coil blended in. `t` is seconds (the rattle and the sway). */
export function poseChain(s: ChainState, d: ChainDef, hx: number, hy: number, f: number, t: number, out: ChainPose): ChainPose {
  const n = d.n, r = s.rope;
  const moving = clamp(s.speed / 70, 0, 1);
  const idle = 0.12 + 0.1 * Math.sin(t * 1.7);
  const flail = 1 + s.shock * 2.2;
  const amp = d.amp * f * (Math.max(moving, idle) * (1 - s.coil * 0.9)) * flail;
  const radius = d.coil ? coilRadius(ropeLength(n, d.gap * f), d.coil.turns) * (1 + 0.025 * Math.sin(t * 2.3)) : 0;
  const rise = d.coil ? d.coil.rise * f * s.coil : 0;
  const flat = 0.7;
  const cn = (i: number) => { // the rope's point i, the head's for -1
    return i < 0 ? { x: hx, y: hy } : { x: r.x[Math.min(i, n)], y: r.y[Math.min(i, n)] };
  };
  for (let i = 0; i <= n; i++) {
    const p = out.parts[i];
    const a = cn(i - 1), b = i >= n ? cn(i) : cn(i + 1);
    let tx = a.x - b.x, ty = a.y - b.y;
    const tm = Math.hypot(tx, ty) || 1;
    tx /= tm;
    ty /= tm;
    const off = wave(i, n, s.phase, amp, d.waveK);
    let x = r.x[i] - ty * off, y = r.y[i] + tx * off, lift = 0;
    if (d.coil && s.coil > 0) {
      const sn = i / n;
      const w = smooth(s.coil * 1.5 - 0.5 * sn);
      coilPoint(i, n, radius, d.coil.turns, s.dir, s.face, flat, tmp);
      x += (hx + tmp.x - x) * w;
      y += (hy + tmp.y - y) * w;
      lift = w * tmp.lift;
      // The neck rises out of the coil to the head, the rattle stands up at the other end.
      if (i < 4) lift += w * rise * Math.pow(1 - i / 4, 1.4);
      if (i >= n - 1) lift += w * d.coil.rattle * f * (i === n ? 1 : 0.3);
    }
    p.x = x;
    p.y = y;
    p.lift = lift;
  }
  // The head: swaying a little as it goes, rearing in the coil, facing its way (tilted at most so far).
  const sway = Math.sin(s.phase + 0.8) * amp * 0.35;
  const hd = out.head;
  hd.x = hx - Math.sin(s.face) * sway;
  hd.y = hy + Math.cos(s.face) * sway;
  hd.lift = rise * 1.05 + (s.coil > 0 ? 1.2 * Math.sin(t * 2.6) * s.coil * f : 0);
  const cf = Math.cos(s.face);
  hd.flip = cf < 0;
  const tilt = Math.atan2(Math.sin(s.face), Math.abs(cf));
  const sgn = hd.flip ? -1 : 1; // a mirrored head tilts the other way for the same slope
  hd.angle = (clamp(tilt, -0.95, 0.95) * (1 - s.coil * 0.3) - s.coil * 0.25) * sgn;
  // Each piece's angle from its neighbours on the screen (the long axis of a plate is the same either way round); the tail's points outward.
  for (let i = 0; i <= n; i++) {
    const p = out.parts[i];
    const a = i === 0 ? { x: hd.x, y: hd.y - hd.lift } : { x: out.parts[i - 1].x, y: out.parts[i - 1].y - out.parts[i - 1].lift };
    const b = i === n ? { x: p.x, y: p.y - p.lift } : { x: out.parts[i + 1].x, y: out.parts[i + 1].y - out.parts[i + 1].lift };
    if (i === n) {
      let ang = Math.atan2(p.y - p.lift - a.y, p.x - a.x);
      // The rattle stands up in the coil and shakes.
      ang = ang + angleTo(ang, -Math.PI / 2) * s.coil * 0.85 + Math.sin(t * 46) * 0.12 * (0.15 + s.coil);
      p.angle = ang;
    } else {
      let ang = Math.atan2(a.y - b.y, a.x - b.x);
      if (Math.cos(ang) < 0) ang += Math.PI;
      p.angle = ang > Math.PI ? ang - Math.PI * 2 : ang;
    }
  }
  return out;
}
