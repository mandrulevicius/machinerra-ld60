/**
 * Danger wear (Minos: "significantly more of it around dangerous areas, like dungeon entrance, spawners, wardens"): the
 * ground round a place where the land bites is churned and burnt, so it reads "danger here" at a glance without a red mark
 * (red is for live threats only). `wear.ts` calls `paintDanger` in its ground pass, once per land, with its own pen.
 *
 * Where (`dangerSites`, pure, tested): every hive, the dungeon entrance, boss arenas, Warden and rescue sites, places that
 * wake hives (the mast, the core vault, the shrine), live ruins (decoding one wakes a hive). Not the lift's landing zone
 * (a `landing` place), the graveyard, the trail or a dead ruin. A dungeon has none (its rooms are its own).
 * What: a soot haze, scorch marks with burn rays, claw and drag gouges, black oil pools with splatter, wreckage (plates,
 * bent pipe, the ribs and cogs of machines, a crushed head) and trampled ground (scuffs, worn spokes), densest at the
 * centre and thinning to nothing at the site's radius.
 * Every number is a guess tuned by eye; `SITE` is each kind's reach and weight.
 */
import { RUIN_FINDS, T } from './sim/defs';
import type { MapData } from './sim/mapgen';
import { PLACES } from './sim/places';
import type { Look } from './wear';

type P = [number, number];
const TAU = Math.PI * 2;

export interface Site {
  x: number;
  y: number;
  /** How far the wear reaches (game px). */
  r: number;
  /** How much of it (1 = a hive's). */
  power: number;
  kind: 'hive' | 'gate' | 'arena' | 'watch' | 'live';
}

/** Reach (tiles) and weight by kind; guesses. */
const SITE = {
  hive: { tiles: 5, power: 1 },
  gate: { tiles: 6.5, power: 1.3 },
  arena: { tiles: 7.5, power: 1.4 },
  watch: { tiles: 4.5, power: 0.85 },
  live: { tiles: 2.8, power: 0.55 },
};
/** A place with one of these tags is dangerous ('warden' is waiting for P18's Wardens); `landing` overrides them all. */
const DANGER = ['arena', 'boss', 'dungeon', 'guarded', 'hives', 'vault', 'elite', 'warden', 'signal', 'rescue'];

/** The danger sites of a land, the heaviest first; a site inside most of the reach of a heavier one is left to it. */
export function dangerSites(m: MapData): Site[] {
  if (typeof m.seed === 'string' && m.seed.startsWith('dungeon:')) return [];
  const all: Site[] = [];
  const add = (kind: Site['kind'], x: number, y: number, tiles = SITE[kind].tiles) => all.push({ kind, x: (x + 0.5) * T, y: (y + 0.5) * T, r: tiles * T, power: SITE[kind].power });
  for (const n of m.nests) add('hive', n.x, n.y);
  for (const r of m.ruins) if (RUIN_FINDS[r.kind].live) add('live', r.x, r.y);
  for (const p of m.places) {
    const def = PLACES[p.id];
    if (def.tags.includes('landing') || !def.tags.some((t) => DANGER.includes(t))) continue;
    if (def.tags.includes('dungeon')) add('gate', p.x, p.y);
    else if (def.tags.includes('arena') || def.tags.includes('boss')) add('arena', p.x, p.y, Math.max(5, def.clear) * 1.1);
    else add('watch', p.x, p.y);
    for (const part of p.parts) if (part.kind === 'hive') add('hive', part.x, part.y, 3.5);
  }
  all.sort((a, b) => b.power - a.power || b.r - a.r);
  const out: Site[] = [];
  for (const s of all) if (!out.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < o.r * 0.85)) out.push(s);
  return out;
}

/** What the painter borrows from `wear.ts`'s ground pass (the layer `L` is in game px). */
export interface Pen {
  L: CanvasRenderingContext2D;
  rnd: () => number;
  look: Look;
  rockAt: (x: number, y: number) => boolean;
  blob: (x: number, y: number, r: number, col: string, a: number, sq?: number, rot?: number, levels?: number) => void;
  stroke: (pts: P[], col: string, a: number, w: number, dx?: number, dy?: number) => void;
  trail: (x: number, y: number, ang: number, n: number, step: number) => P[];
}

/** Paint every site's wear. */
export function paintDanger(pen: Pen, sites: Site[]) {
  const { L, rnd, look, blob, stroke, rockAt } = pen;
  const rr = (a: number, b: number) => a + rnd() * (b - a);
  for (const s of sites) {
    const R = s.r, pw = s.power;
    /** A spot in the site, thicker toward its centre. */
    const at = (): P => {
      const a = rnd() * TAU, d = R * Math.pow(rnd(), 1.4);
      return [s.x + Math.cos(a) * d, s.y + Math.sin(a) * d];
    };
    /** 1 at the centre, 0 at the reach. */
    const fall = (x: number, y: number) => Math.max(0, 1 - Math.hypot(x - s.x, y - s.y) / R);
    const free = (x: number, y: number) => !rockAt(x, y);

    // Soot: the ground darkened round the site, in stepped bands.
    blob(s.x, s.y, R * 0.98, look.char, 0.12 * Math.min(1.3, pw), 0.9, rr(0, TAU), 4);
    blob(s.x, s.y, R * 0.55, look.soot, 0.14 * Math.min(1.3, pw), 0.85, rr(0, TAU), 3);
    // The ground right at the site is burnt through: a charred heart with rays out of it.
    if (s.kind !== 'live') {
      blob(s.x, s.y, R * 0.2, look.char, 0.42, 0.9, rr(0, TAU), 3);
      for (let j = 0; j < 22; j++) {
        const an = rnd() * TAU, r0 = R * 0.17, r1 = R * rr(0.26, 0.5);
        stroke([[s.x + Math.cos(an) * r0, s.y + Math.sin(an) * r0], [s.x + Math.cos(an) * r1, s.y + Math.sin(an) * r1]], look.char, 0.34, rr(1.2, 2.4));
      }
    }

    // Trampled ground: worn spokes out of the site, then scuffs and pocks everywhere.
    for (let i = 0, n = 3 + Math.round(pw * 2); i < n; i++) {
      const a = (i / n) * TAU + rr(-0.35, 0.35);
      const pts = pen.trail(s.x, s.y, a, Math.round(R / 14 * rr(0.9, 1.5)), 14);
      stroke(pts, look.path, 0.07, 22);
      stroke(pts, look.path, 0.08, 11);
    }
    for (let i = 0, n = Math.round(170 * pw); i < n; i++) {
      const [x, y] = at();
      if (!free(x, y)) continue;
      const f = Math.sqrt(fall(x, y)), a = rnd() * TAU, len = rr(3, 9);
      if (rnd() < 0.72) stroke([[x, y], [x + Math.cos(a) * len, y + Math.sin(a) * len]], look.char, 0.3 * f, rr(1.1, 2.2));
      else stroke([[x, y], [x + Math.cos(a) * len, y + Math.sin(a) * len]], look.bleach, 0.2 * f, 1.1, 0.8, 0.8);
      if (rnd() < 0.25) blob(x, y, rr(1.6, 3), look.char, 0.35 * f, 0.7, a, 1);
    }

    // Scorch: a charred patch, rays of burn out of it, a pale ash rim.
    for (let i = 0, n = Math.max(2, Math.round(4.5 * pw)); i < n; i++) {
      const [x, y] = at();
      if (!free(x, y)) continue;
      const r = rr(10, 30) * (0.6 + fall(x, y) * 0.6), a = 0.4 * (0.5 + fall(x, y));
      blob(x, y, r * 1.4, look.char, a * 0.3, 0.8, rr(0, TAU), 2);
      blob(x, y, r, look.char, a, 0.85, rr(0, TAU), 2);
      for (let j = 0; j < 14; j++) {
        const an = rnd() * TAU, r0 = r * 0.8, r1 = r * rr(1.2, 1.9);
        stroke([[x + Math.cos(an) * r0, y + Math.sin(an) * r0], [x + Math.cos(an) * r1, y + Math.sin(an) * r1]], look.char, 0.3, rr(1, 2));
      }
      L.globalAlpha = 0.16; L.strokeStyle = look.bleach; L.lineWidth = 1.6;
      L.beginPath(); L.ellipse(x + 1, y + 1, r * 1.35, r * 1.1, rr(0, TAU), 0.3, 4.2); L.stroke();
      L.globalAlpha = 1;
    }

    // Gouges: claw rakes (three or four parallel cuts) and long drags that end in wreckage.
    for (let i = 0, n = Math.round(20 * pw); i < n; i++) {
      const [x, y] = at();
      if (!free(x, y)) continue;
      const len = rr(18, 52), ang = rr(0, TAU), bend = rr(-9, 9), cuts = 3 + (rnd() < 0.4 ? 1 : 0), f = 0.55 + fall(x, y) * 0.45;
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      for (let c = 0; c < cuts; c++) {
        const o = (c - (cuts - 1) / 2) * 4.2, tail = rr(0.75, 1);
        const p = (t: number, w: number): P => [x + Math.cos(ang) * len * t * tail + nx * (o + bend * Math.sin(Math.PI * t)) * w, y + Math.sin(ang) * len * t * tail + ny * (o + bend * Math.sin(Math.PI * t)) * w];
        const pts: P[] = [p(0, 1), p(0.3, 1), p(0.6, 1), p(1, 1)];
        stroke(pts, look.char, 0.55 * f, 2.3);
        stroke(pts, look.bleach, 0.26 * f, 1, 1.2, 1.2);
      }
    }
    for (let i = 0, n = Math.round(2.5 * pw); i < n; i++) {
      const [x, y] = at();
      if (!free(x, y)) continue;
      const pts = pen.trail(x, y, rnd() * TAU, 10 + Math.floor(rnd() * 14), 11);
      if (pts.length < 4) continue;
      stroke(pts, look.char, 0.2, 8);
      stroke(pts, look.char, 0.4, 1.4, 0, -3.6);
      stroke(pts, look.char, 0.4, 1.4, 0, 3.6);
      const e = pts[pts.length - 1];
      piece(e[0], e[1], rr(6, 12));
    }

    // Oil pools: black, sheened, splattered, a drip trail leading off.
    for (let i = 0, n = Math.round(6 * pw); i < n; i++) {
      const [x, y] = at();
      if (!free(x, y)) continue;
      const r = rr(6, 17) * (0.7 + fall(x, y) * 0.5), rot = rr(0, TAU), f = 0.6 + fall(x, y) * 0.4;
      blob(x, y, r, look.oil, 0.4 * f, 0.7 + rnd() * 0.3, rot, 2);
      blob(x, y, r * 0.55, look.char, 0.3 * f, 0.8, rot, 1);
      L.globalAlpha = 0.22; L.strokeStyle = look.bleach; L.lineWidth = 1.3;
      L.beginPath(); L.ellipse(x - r * 0.15, y - r * 0.12, r * 0.45, r * 0.28, rot, 3.4, 4.7); L.stroke();
      L.globalAlpha = 1;
      const dir = rr(0, TAU);
      for (let j = 0, d = 8 + Math.floor(rnd() * 10); j < d; j++) {
        const a = dir + rr(-1.1, 1.1), q = r * rr(1.1, 2.4);
        const sx = x + Math.cos(a) * q, sy = y + Math.sin(a) * q;
        if (!free(sx, sy)) continue;
        stroke([[sx - Math.cos(a) * 2.2, sy - Math.sin(a) * 2.2], [sx + Math.cos(a) * 2, sy + Math.sin(a) * 2]], look.oil, 0.5 * f, rr(1.2, 2.4));
      }
      if (rnd() < 0.5) stroke(pen.trail(x, y, dir, 6, 8), look.oil, 0.3 * f, 2);
    }

    // Wreckage: the bones of machines, scattered and heaped.
    for (let i = 0, n = Math.round(22 * pw); i < n; i++) {
      const [x, y] = at();
      if (free(x, y)) piece(x, y, rr(8, 22) * (0.75 + fall(x, y) * 0.5));
    }
  }

  /** One piece of wreckage `sz` px across, with its shadow to the lower right (as the junk's): a plate, a bent pipe, ribs, a cog, a crushed head. */
  function piece(x: number, y: number, sz: number) {
    const kind = Math.floor(rnd() * 6), rot = rnd() * TAU;
    for (const shade of [true, false]) {
      L.save();
      L.translate(x + (shade ? 2.4 : 0), y + (shade ? 2.4 : 0));
      L.rotate(rot);
      L.lineJoin = 'round';
      L.lineCap = 'round';
      const col = (c: string) => (shade ? look.char : c);
      const fill = (c: string, a: number) => { L.globalAlpha = shade ? 0.3 : a; L.fillStyle = col(c); L.fill(); };
      const line = (c: string, a: number, w: number) => { L.globalAlpha = shade ? 0.3 : a; L.strokeStyle = col(c); L.lineWidth = w; L.stroke(); };
      if (kind === 0) {
        // A torn plate.
        const pts: P[] = [[-1, -0.5], [-0.2, -0.85], [0.7, -0.6], [1, 0.1], [0.4, 0.8], [-0.7, 0.6]].map(([a, b]) => [a * sz * 0.7 * rr(0.85, 1.1), b * sz * 0.5 * rr(0.85, 1.1)]);
        L.beginPath(); pts.forEach(([a, b], i) => (i ? L.lineTo(a, b) : L.moveTo(a, b))); L.closePath();
        fill(look.metal, 0.92);
        if (!shade) {
          L.globalAlpha = 0.45; L.fillStyle = look.rust; L.beginPath(); L.ellipse(sz * 0.12, sz * 0.08, sz * 0.3, sz * 0.18, 0.4, 0, TAU); L.fill();
          for (let r = 0; r < 3; r++) { L.globalAlpha = 0.7; L.fillStyle = look.char; L.beginPath(); L.arc(rr(-0.4, 0.4) * sz, rr(-0.25, 0.25) * sz, 0.9, 0, TAU); L.fill(); }
          L.beginPath(); pts.forEach(([a, b], i) => (i ? L.lineTo(a, b) : L.moveTo(a, b))); L.closePath();
        }
        line(look.char, 0.75, 1.2);
        if (!shade) { L.globalAlpha = 0.4; L.strokeStyle = look.bleach; L.lineWidth = 0.9; L.beginPath(); L.moveTo(pts[0][0], pts[0][1] - 0.4); L.lineTo(pts[1][0], pts[1][1] - 0.4); L.lineTo(pts[2][0], pts[2][1] - 0.4); L.stroke(); }
      } else if (kind === 1) {
        // A bent pipe.
        L.beginPath(); L.moveTo(-sz * 0.9, sz * 0.15); L.bezierCurveTo(-sz * 0.3, -sz * 0.5, sz * 0.2, sz * 0.5, sz * 0.9, -sz * 0.1);
        line(look.char, 0.85, 4);
        if (!shade) { line(look.metal, 0.95, 2.4); L.globalAlpha = 0.5; L.strokeStyle = look.bleach; L.lineWidth = 0.7; L.save(); L.translate(-0.6, -0.8); L.stroke(); L.restore(); }
      } else if (kind === 2) {
        // Ribs off a spine: the bones of a machine.
        const n = 4 + Math.floor(rnd() * 2);
        L.beginPath(); L.moveTo(-sz * 0.8, 0); L.lineTo(sz * 0.8, 0);
        line(look.char, 0.85, 3.4);
        if (!shade) line(look.bleach, 0.8, 1.8);
        for (let i = 0; i < n; i++) {
          const t = -0.6 + (i / (n - 1)) * 1.2, h = sz * 0.55 * (1 - Math.abs(t) * 0.55), side = i % 2 ? 1 : -1;
          L.beginPath(); L.moveTo(t * sz, 0); L.quadraticCurveTo(t * sz + sz * 0.18, side * h * 0.9, t * sz + sz * 0.05, side * h);
          line(look.char, 0.85, 3);
          if (!shade) line(look.bleach, 0.75, 1.5);
        }
      } else if (kind === 3) {
        // A cog with teeth broken off.
        const teeth = 9, ro = sz * 0.5, ri = ro * 0.78, skip = Math.floor(rnd() * teeth);
        L.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          if (Math.floor(i / 2) === skip) continue;
          const a = (i / (teeth * 2)) * TAU, r = i % 2 ? ri : ro;
          L.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        L.closePath();
        fill(rnd() < 0.5 ? look.brass : look.metal, 0.92);
        line(look.char, 0.8, 1.1);
        if (!shade) { L.globalAlpha = 0.85; L.fillStyle = look.char; L.beginPath(); L.arc(0, 0, ro * 0.28, 0, TAU); L.fill(); }
      } else if (kind === 4) {
        // A crushed head: a dome, an eye socket, a dent.
        L.beginPath(); L.ellipse(0, 0, sz * 0.45, sz * 0.38, 0, 0, TAU);
        fill(look.metal, 0.92);
        line(look.char, 0.8, 1.2);
        if (!shade) {
          L.globalAlpha = 0.85; L.fillStyle = look.char; L.beginPath(); L.arc(-sz * 0.12, -sz * 0.04, sz * 0.1, 0, TAU); L.fill();
          L.beginPath(); L.arc(sz * 0.14, sz * 0.02, sz * 0.07, 0, TAU); L.fill();
          L.globalAlpha = 0.6; L.strokeStyle = look.char; L.lineWidth = 1; L.beginPath(); L.moveTo(sz * 0.02, -sz * 0.36); L.lineTo(-sz * 0.04, -sz * 0.1); L.lineTo(sz * 0.08, sz * 0.12); L.stroke();
          L.globalAlpha = 0.4; L.strokeStyle = look.bleach; L.lineWidth = 0.9; L.beginPath(); L.arc(0, 0, sz * 0.42, Math.PI * 1.05, Math.PI * 1.55); L.stroke();
        }
      } else {
        // A piston: a rod out of a cylinder.
        L.beginPath(); L.rect(-sz * 0.6, -sz * 0.16, sz * 0.7, sz * 0.32);
        fill(look.metal, 0.92);
        line(look.char, 0.8, 1.1);
        L.beginPath(); L.moveTo(sz * 0.1, 0); L.lineTo(sz * 0.8, rr(-0.08, 0.08) * sz);
        line(look.char, 0.85, 2.8);
        if (!shade) { line(look.bleach, 0.75, 1.2); L.globalAlpha = 0.5; L.fillStyle = look.rust; L.fillRect(-sz * 0.5, -sz * 0.05, sz * 0.3, sz * 0.2); }
      }
      L.restore();
    }
    L.globalAlpha = 1;
  }
}
