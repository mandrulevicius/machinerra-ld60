/**
 * The tusked caterpillar: the intro's mini-boss and an elite caterpillar (Minos; the lead: expedition 2's elites). Numbers
 * `CATERPILLAR` and, for the boss, `BOSSES.caterpillar`; drawing in ../caterpillar.ts. The baby needs nothing here: it hunts
 * and bites as a plain walker in `fly`. A tusked one carries `Hornet.grub` (`spawnBoss`; `spawnHornet` for an elite).
 *
 * It crawls in and bites, and attacks in Minos's order:
 *   1. `spiral`: it winds into a coil, fast, the head circling round the coil's centre until it points at him;
 *   2. `lift`: the head lifts and looks at him;
 *   3. `rear`: it rears and the jaw opens (the slow, telegraphed part); the lunge's line is locked as the jaw starts to open,
 *      toward where he stood then;
 *   4. `lunge`: the head shoots along that line (`charge.time` at `charge.speed`), striking each robot it passes once; rock stops it;
 *   then `rest` (the opening to hit it) and back to `crawl`. A stun or freeze on the elite cancels the wind-up (`cancelGrub`).
 * The head is the hornet's position (what hits and kicks reach); the segments are the view's, following the head's path.
 * Moves are deltas on the head, so a shove mid-move carries the coil with it. Plain rules, no Phaser; `fly` hands it here.
 */
import { CATERPILLAR, HORNET, ROLES, bossNow, bossOf } from './defs';
import { clamp, dist } from './geom';
import type { Bot, Hornet, Sim } from './sim';
import { glide } from './foes';

export type GrubMode = 'crawl' | 'spiral' | 'lift' | 'rear' | 'lunge' | 'rest';
export interface GrubState {
  mode: GrubMode;
  /** Seconds left in this mode (the spiral counts up its turning instead). */
  t: number;
  /** Where the head points (radians). */
  ang: number;
  /** The head's lift (px) and how open the jaw is (0 shut, 1 open). */
  z: number;
  jaw: number;
  /** The spiral: the angle of the head round the coil's centre, its radius (px), the turning so far (radians), which way. */
  th: number;
  rad: number;
  wound: number;
  dir: 1 | -1;
  /** The lunge: from, to (locked as the jaw starts to open), and who it has struck. */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  hit: number[];
  /** Seconds until it may wind up again. */
  coolT: number;
}

export type GrubEvent = 'spiral' | 'lift' | 'rear' | 'lunge' | 'bite' | 'rest';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export function newGrub(h: Hornet): GrubState {
  return { mode: 'crawl', t: 0, ang: -Math.PI / 2, z: 0, jaw: 0, th: 0, rad: 0, wound: 0, dir: 1, sx: h.x, sy: h.y, tx: h.x, ty: h.y, hit: [], coolT: 1.5 };
}

const emit = (sim: Sim, what: GrubEvent, h: Hornet, more: { x?: number; y?: number; bot?: Bot } = {}) => sim.events.push({ e: 'grub', what, h, ...more });

/** What a tusked one fights with: the boss's def as it fights now, or the elite's (`CATERPILLAR.elite`); `scale` is its draw size. */
export function grubDef(h: Hornet) {
  if (!h.boss) return CATERPILLAR.elite;
  const B = bossNow(h.kind, h.phase, h.breaks);
  return { scale: bossOf(h.kind).scale, speed: B.speed, sting: B.sting, every: B.every, charge: B.charge };
}

/** Whom the attack is for: the Communicator (Minos: "player"), or the hunted robot while he is down. */
function prey(sim: Sim, t: Bot | null): Bot | null {
  const c = sim.controller;
  return t && !c.dead && c.hp > 0 && !c.downed ? c : t;
}

/** The lunge's length (px). */
export const lungeLen = (h: Hornet) => {
  const C = grubDef(h).charge;
  return C.speed * C.time;
};

/** One step of a tusked caterpillar (`fly` calls it after the target is chosen). */
export function grubStep(sim: Sim, h: Hornet, dt: number, t: Bot | null) {
  const S = h.grub!;
  const B = grubDef(h);
  const C = B.charge;
  const k = B.scale;
  const bz = sim.berserk(h);
  const p = prey(sim, t);
  S.t -= dt;
  S.coolT -= dt;
  const toward = p ? Math.atan2(p.y - h.y, p.x - h.x) : S.ang;
  switch (S.mode) {
    case 'crawl': {
      S.z += (0 - S.z) * Math.min(1, dt * 8);
      S.jaw += (0 - S.jaw) * Math.min(1, dt * 8);
      if (!t) {
        glide(sim, h, 0, 0, 0, 6, dt);
        break;
      }
      const d = dist(h.x, h.y, t.x, t.y);
      if (p && S.coolT <= 0 && dist(h.x, h.y, p.x, p.y) < lungeLen(h) * CATERPILLAR.reach) {
        startSpiral(sim, h, S, toward);
        break;
      }
      const near = d < h.reach * 0.8;
      const sp = near ? 0 : B.speed * (sim.cfg.hornetSpeed / HORNET.speed) * bz.speed * sim.mobility(h);
      const a = Math.atan2(t.y - h.y, t.x - h.x);
      glide(sim, h, Math.cos(a), Math.sin(a), sp, 5, dt);
      const moving = Math.hypot(h.vx, h.vy);
      S.ang += wrap((moving > 8 ? Math.atan2(h.vy, h.vx) : a) - S.ang) * Math.min(1, dt * 6);
      if (d < h.reach + 6 && h.cd <= 0) {
        h.cd = B.sting.rate;
        S.jaw = 0.6;
        sim.events.push({ e: 'sting', h, bot: t });
        sim.foeHit(h, t, B.sting.dmg * bz.dmg);
        emit(sim, 'bite', h, { bot: t });
      }
      break;
    }
    case 'spiral': {
      // The head runs round the centre, closing in from `r0` to `r1` over the first `turns`; done once wound enough and pointing at him.
      const P = CATERPILLAR.spiral;
      const w = P.spin * Math.PI * 2;
      const cx = h.x - Math.cos(S.th) * S.rad, cy = h.y - Math.sin(S.th) * S.rad; // the centre, wherever a shove left it
      S.th += S.dir * w * dt;
      S.wound += w * dt;
      S.rad = (P.r0 + (P.r1 - P.r0) * clamp(S.wound / (P.turns * Math.PI * 2), 0, 1)) * k;
      h.x = cx + Math.cos(S.th) * S.rad;
      h.y = cy + Math.sin(S.th) * S.rad;
      h.vx = h.vy = 0;
      S.ang = S.th + (S.dir * Math.PI) / 2; // the head points along its way round
      S.z += (1.5 * k - S.z) * Math.min(1, dt * 8);
      const aimed = Math.abs(wrap(S.ang - toward)) <= Math.max(P.tol, w * dt);
      if ((S.wound >= P.turns * Math.PI * 2 && aimed) || S.wound >= (P.turns + 1.5) * Math.PI * 2) {
        S.mode = 'lift';
        S.t = CATERPILLAR.lift;
        emit(sim, 'lift', h);
      }
      break;
    }
    case 'lift': {
      // The head rises and turns to look at him.
      S.z += (CATERPILLAR.liftZ * k - S.z) * Math.min(1, dt * 14);
      S.ang += wrap(toward - S.ang) * Math.min(1, dt * 14);
      h.vx = h.vy = 0;
      if (S.t <= 0) {
        S.mode = 'rear';
        S.t = C.tell;
        // The line is locked as the jaw starts to open: toward where he stands now.
        S.ang = toward;
        S.sx = h.x;
        S.sy = h.y;
        S.tx = h.x + Math.cos(toward) * lungeLen(h);
        S.ty = h.y + Math.sin(toward) * lungeLen(h);
        emit(sim, 'rear', h, { x: S.tx, y: S.ty });
      }
      break;
    }
    case 'rear': {
      // Slower: the head draws up and back, the jaw opens.
      const q = 1 - Math.max(0, S.t) / C.tell;
      S.z = (CATERPILLAR.liftZ + (CATERPILLAR.rearZ - CATERPILLAR.liftZ) * Math.min(1, q * 1.4)) * k;
      S.jaw = Math.min(1, q * 1.15);
      h.vx = h.vy = 0;
      if (S.t <= 0) {
        S.mode = 'lunge';
        S.t = C.time;
        S.jaw = 1;
        S.hit = [];
        S.sx = h.x;
        S.sy = h.y;
        emit(sim, 'lunge', h);
      }
      break;
    }
    case 'lunge': {
      S.z += (0.8 * k - S.z) * Math.min(1, dt * 20);
      const len = Math.hypot(S.tx - S.sx, S.ty - S.sy) || 1;
      const ux = (S.tx - S.sx) / len, uy = (S.ty - S.sy) / len;
      const sp = C.speed * bz.speed;
      const nx = h.x + ux * sp * dt, ny = h.y + uy * sp * dt;
      const stop = sim.blocked(nx + ux * h.r * 0.6, ny + uy * h.r * 0.6);
      if (!stop) {
        h.x = nx;
        h.y = ny;
      }
      h.vx = ux * sp;
      h.vy = uy * sp;
      for (const b of sim.bots) {
        if (b.dead || b.hp <= 0 || S.hit.includes(b.id) || dist(h.x, h.y, b.x, b.y) > CATERPILLAR.bite * k + ROLES[b.role].r * 0.5) continue;
        S.hit.push(b.id);
        sim.foeHit(h, b, C.dmg * bz.dmg);
        sim.moveBy(b, ux * C.knock, uy * C.knock);
      }
      if (S.t <= 0 || stop) {
        S.mode = 'rest';
        S.t = C.rest;
        h.vx = h.vy = 0;
        emit(sim, 'rest', h, { x: h.x, y: h.y });
      }
      break;
    }
    case 'rest':
      // Down and spent: the jaw closes slowly; the opening to hit it.
      S.z += (0 - S.z) * Math.min(1, dt * 10);
      S.jaw += (0 - S.jaw) * Math.min(1, dt * 2.5);
      glide(sim, h, 0, 0, 0, 8, dt);
      if (S.t <= 0) {
        S.mode = 'crawl';
        S.coolT = B.every * bz.cd;
      }
      break;
  }
}

function startSpiral(sim: Sim, h: Hornet, S: GrubState, toward: number) {
  // It curls toward the side it already leans to, the head starting on the outside of the coil.
  S.dir = wrap(toward - S.ang) >= 0 ? 1 : -1;
  S.th = S.ang - (S.dir * Math.PI) / 2; // the head sits at this angle from the centre, moving along its heading
  S.rad = CATERPILLAR.spiral.r0 * grubDef(h).scale;
  S.wound = 0;
  S.mode = 'spiral';
  h.vx = h.vy = 0;
  emit(sim, 'spiral', h);
}

/** A stun or freeze on the elite (a boss shrugs them off) cancels its wind-up: it crawls again and the cooldown starts over. */
export function cancelGrub(h: Hornet) {
  const S = h.grub;
  if (!S || S.mode === 'crawl' || S.mode === 'rest') return;
  S.mode = 'crawl';
  S.coolT = grubDef(h).every;
  h.vx = h.vy = 0;
}

/** Dev and tests: start the attack now. */
export function grubAttack(sim: Sim, h: Hornet) {
  const S = h.grub;
  if (!S) return false;
  const c = sim.controller;
  startSpiral(sim, h, S, Math.atan2(c.y - h.y, c.x - h.x));
  return true;
}

export function grubSummary(sim: Sim) {
  const babies = sim.hornets.filter((x) => x.kind === 'caterpillar' && !x.grub && !x.dead).length;
  const tusked = sim.hornets.filter((x) => x.grub && !x.dead).map((h) => {
    const S = h.grub!;
    return { id: h.id, boss: h.boss, mode: S.mode, hp: Math.round(h.hp), jaw: +S.jaw.toFixed(2), z: Math.round(S.z), wound: +(S.wound / (Math.PI * 2)).toFixed(2) };
  });
  return babies || tusked.length ? { babies, tusked } : undefined;
}
