/**
 * The Crawlcam, a robot spider (numbers in `SPIDER`, `FOES.spider`, `TWISTED.spider`; legs in gait.ts, drawing in ../spider.ts).
 * It is a hornet's opposite: it walks (slower, over rock and the map's rim alike), creeps in bursts, and hits in two ways
 * you can read: it rears up and pounces at where you stood (a tell, then a leap, then a rest that is the opening to hit
 * it), and it spits a cable that tethers a robot until the spider dies or the robot gets away. Its twisted form pounces
 * more, sometimes twice in a row, and moves wrongly. Spiders climb in over the map's rim whether or not any hive lives.
 *
 * Plain rules, no Phaser. `Sim` calls `crawl` for a spider in place of the hornets' `fly`, `edgeArrivals` each step and
 * `holdWeb` with the auras; it owns nothing here but `Hornet.spider` and `Sim.spiders`.
 */
import type { Rng } from '../../../../harness/kit/rng';
import { EDGE, ELEV, FOES, HORNET, MENACE, ROLES, SPIDER, T, TWISTED, type Enemy } from './defs';
import { spawnMul } from './clock';
import { Ter, passable } from './mapgen';
import type { Bot, Hornet, Sim } from './sim';
import { layOf } from './tiers';
import { clamp, dist, lerp } from './geom';
import { spawnPick } from './spawntiers';

export type SpiderMode = 'stalk' | 'tellWeb' | 'tellPounce' | 'leap' | 'recover';
export interface SpiderState {
  mode: SpiderMode;
  /** Seconds left in this mode (a stalk's current burst or pause). */
  t: number;
  /** Stalking: moving now (true) or frozen. */
  go: boolean;
  /** Where it faces (radians). */
  ang: number;
  /** The body's lift above its stance (px): the leap's arc, a crouch. */
  z: number;
  /** A leap: where it started and where it lands (locked for the last `pounce.lock` of the tell). */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  /** Pounces still to chain after this one (the twisted). */
  chain: number;
  /** Seconds until it may pounce / spit again. */
  pounceT: number;
  webT: number;
  /** Which way it curves round its target. */
  strafe: 1 | -1;
  /** Jumping in from off the map: this leap's own time and arc (long and high); it lands without a blow. */
  drop?: { time: number; arc: number };
}

/** What a `Sim` keeps for its spiders: their own random stream (so they do not move the land's), the edge timer and whether the first one has been explained. */
export interface SpiderWorld { r: Rng; edgeT: number }
export const spiderWorld = (r: Rng): SpiderWorld => ({ r: r.fork('spiders'), edgeT: EDGE.first });

export type SpiderEvent = 'drop' | 'tellWeb' | 'web' | 'tellPounce' | 'leap' | 'land' | 'snare';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export const legCount = (h: Hornet) => (h.twisted ? SPIDER.twistedLegs : SPIDER.legs);

export function newSpider(sim: Sim): SpiderState {
  const R = sim.spiders.r;
  return { mode: 'stalk', t: R.range(...SPIDER.stalk.stop), go: false, ang: R.range(0, Math.PI * 2), z: 0, sx: 0, sy: 0, tx: 0, ty: 0, chain: 0, pounceT: R.range(1, 2.5), webT: R.range(...SPIDER.web.first), strafe: R.chance(0.5) ? 1 : -1 };
}

/** The height of the ground at a point (px): tile heights blended between tile centres, so a foot climbs a ledge as a slope. Beyond the map is rim. */
export function elevAt(ter: Uint8Array, w: number, h: number, x: number, y: number): number {
  const fx = x / T - 0.5, fy = y / T - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy;
  const e = (tx: number, ty: number) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return ELEV.rock;
    const k = ter[ty * w + tx];
    return k === Ter.Rock ? ELEV.rock : k === Ter.Dune ? ELEV.dune : ELEV.sand;
  };
  return e(ix, iy) * (1 - ax) * (1 - ay) + e(ix + 1, iy) * ax * (1 - ay) + e(ix, iy + 1) * (1 - ax) * ay + e(ix + 1, iy + 1) * ax * ay;
}

/** How much the ground under a spider slows it: rock is a climb, a dune soft. */
function footing(sim: Sim, x: number, y: number) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || tx >= sim.W || ty >= sim.H) return SPIDER.stalk.rock;
  const k = sim.map.ter[ty * sim.W + tx];
  return k === Ter.Rock ? SPIDER.stalk.rock : k === Ter.Dune ? SPIDER.stalk.dune : 1;
}


export const nearestBot = (sim: Sim, h: Hornet): Bot | null => {
  let best: Bot | null = null, bd = Infinity;
  for (const b of sim.bots) {
    const d = b.dead || b.hidden ? Infinity : dist(h.x, h.y, b.x, b.y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
};

const emit = (sim: Sim, what: SpiderEvent, h: Hornet, more: { x?: number; y?: number; bot?: Bot; hits?: number } = {}) => sim.events.push({ e: 'spider', what, h, ...more });

/**
 * One step of a spider (called in place of the hornets' `fly`, after the target is chosen). Modes: `stalk` creeps in
 * bursts, curving round the target, and bites when it is on it; from range it enters `tellWeb` (stands, then spits a
 * cable) or `tellPounce` (rears up; the landing is locked for the last `lock` of it), then `leap`s and lands, then `recover`s.
 * A `climb` is the way in over the rim.
 */
export function crawl(sim: Sim, h: Hornet, dt: number, t: Bot | null) {
  const S = h.spider!;
  const R = sim.spiders.r;
  const F = FOES.spider;
  const tw = h.twisted ? TWISTED.spider : null;
  const bz = sim.berserk(h);
  const P = SPIDER.pounce, W = SPIDER.web, K = SPIDER.stalk;
  // The pounce's numbers, the twisted form's own when it has them (its `dash`).
  const D = tw ? tw.dash : { every: P.every, tell: P.tell, time: P.time, range: P.range, dmg: 1 };
  const base = F.speed * (sim.cfg.hornetSpeed / HORNET.speed) * (tw?.speed ?? 1) * bz.speed * footing(sim, h.x, h.y) * sim.mobility(h);
  const bite = F.dmg * (h.elite ? HORNET.elite.dmg : 1) * (tw?.dmg ?? 1) * bz.dmg;
  S.t -= dt;
  S.pounceT -= dt;
  S.webT -= dt;
  let wx = 0, wy = 0;
  let face = S.ang;
  let snap = 8;

  if (S.mode === 'leap') {
    const time = S.drop?.time ?? D.time;
    const p = clamp(1 - S.t / time, 0, 1);
    h.x = lerp(S.sx, S.tx, p);
    h.y = lerp(S.sy, S.ty, p);
    h.vx = (S.tx - S.sx) / time;
    h.vy = (S.ty - S.sy) / time;
    S.z = (S.drop?.arc ?? P.arc) * 4 * p * (1 - p);
    face = Math.atan2(S.ty - S.sy, S.tx - S.sx);
    S.ang += wrap(face - S.ang) * Math.min(1, dt * 20);
    if (S.t <= 0) land(sim, h, S, D, t);
    return;
  } else {
    const has = !!t;
    const dx = has ? t!.x - h.x : 0, dy = has ? t!.y - h.y : 0;
    const d = Math.hypot(dx, dy) || 1;
    const dT = d / T;
    const toward = has ? Math.atan2(dy, dx) : S.ang;
    if (has && dT < 12) sim.say('spider', 'A smart-home spider. It creeps in bursts and rears up before it pounces: when the red lens flares, step aside. It spits a cable too; kill it and the cable lets go.', 'warn');
    switch (S.mode) {
      case 'stalk': {
        S.z += (0 - S.z) * Math.min(1, dt * 8);
        if (!has) {
          // Nothing to hunt: it loiters round its hive (a rim spider never gets here: it hunts anyone).
          const n = sim.nests.find((x) => x.id === h.nest);
          if (n) {
            const a = h.wob * 0.6 + h.id;
            const gx = n.x + Math.cos(a) * 70 - h.x, gy = n.y + 10 + Math.sin(a) * 45 - h.y;
            const gd = Math.hypot(gx, gy) || 1;
            wx = (gx / gd) * base * 0.35;
            wy = (gy / gd) * base * 0.35;
            face = Math.atan2(wy, wx);
          }
          break;
        }
        if (S.pounceT <= 0 && dT <= D.range && dT >= P.min) {
          S.mode = 'tellPounce';
          S.t = D.tell;
          S.chain = tw ? (sim.level >= MENACE.chain ? 1 : 0) + (R.chance(0.4) ? 1 : 0) : 0;
          aim(h, S, t!, D.range);
          emit(sim, 'tellPounce', h);
          break;
        }
        if (S.webT <= 0 && !t!.web && dT >= W.min && dT <= W.range) {
          S.mode = 'tellWeb';
          S.t = W.tell;
          emit(sim, 'tellWeb', h);
          break;
        }
        // Creep in bursts, curving round the target: a flank, not a charge.
        if (S.t <= 0) {
          S.go = !S.go;
          S.t = S.go ? R.range(...K.go) : R.range(...K.stop);
          if (S.go && R.chance(0.35)) S.strafe = S.strafe === 1 ? -1 : 1;
        }
        let a = toward + S.strafe * K.flank * clamp((dT - 2.5) / 6, 0, 1);
        if (tw) a += Math.sin(h.wob * 11 + h.id) * 0.55; // wrong: it veers
        const near = d < h.reach * 0.8;
        const sp = S.go && !near ? base * K.burst : 0;
        wx = Math.cos(a) * sp;
        wy = Math.sin(a) * sp;
        face = sp > 0 ? a : toward;
        if (d < h.reach && h.cd <= 0) {
          h.cd = F.rate / Math.max(0.3, sim.engine.stat(h, 'attackRate', 1));
          sim.events.push({ e: 'sting', h, bot: t! });
          sim.foeHit(h, t!, bite);
        }
        break;
      }
      case 'tellWeb': {
        S.z += (2 - S.z) * Math.min(1, dt * 14);
        face = toward;
        if (!has) S.mode = 'stalk';
        else if (S.t <= 0) {
          S.mode = 'stalk';
          S.go = false;
          S.t = 0.3;
          S.webT = R.range(...W.every) * bz.cd;
          sim.foeShot({ x: h.x + Math.cos(toward) * 14, y: h.y - 6 + Math.sin(toward) * 14, vx: Math.cos(toward) * W.speed, vy: Math.sin(toward) * W.speed, dmg: 0, life: W.life, big: false, by: h.id, web: true, lay: layOf(h) });
          emit(sim, 'web', h);
        }
        break;
      }
      case 'tellPounce': {
        // It rears up. The landing follows the target until the last `lock` of the tell, then it is fixed: a leap can be sidestepped.
        S.z += (3 - S.z) * Math.min(1, dt * 14);
        if (has && S.t > P.lock) aim(h, S, t!, D.range);
        face = Math.atan2(S.ty - h.y, S.tx - h.x);
        if (S.t <= 0) {
          S.mode = 'leap';
          S.t = D.time;
          S.sx = h.x;
          S.sy = h.y;
          emit(sim, 'leap', h);
        }
        break;
      }
      case 'recover':
        S.z += (-3 - S.z) * Math.min(1, dt * 12);
        face = toward;
        if (S.t <= 0) {
          S.mode = 'stalk';
          S.go = false;
          S.t = R.range(...K.stop);
        }
        break;
    }
  }
  // Walk: ease toward the wanted velocity (a shove from the shovel decays), keep off its neighbours, stay on the map.
  const k = Math.min(1, dt * snap);
  h.vx += (wx - h.vx) * k;
  h.vy += (wy - h.vy) * k;
  for (const o of sim.hornets) {
    if (o === h || o.dead || o.boss) continue;
    const d = dist(h.x, h.y, o.x, o.y);
    if (d < 18 && d > 0) {
      h.vx += ((h.x - o.x) / d) * 40 * dt * 6;
      h.vy += ((h.y - o.y) / d) * 40 * dt * 6;
    }
  }
  h.x += h.vx * dt;
  h.y += h.vy * dt;
  h.x = clamp(h.x, T * 0.6, sim.W * T - T * 0.6);
  h.y = clamp(h.y, T * 0.6, sim.H * T - T * 0.6);
  S.ang += wrap(face - S.ang) * Math.min(1, dt * (tw ? 16 : 10));
}

/** The pounce's landing point: where the target is, no farther than a leap reaches. */
function aim(h: Hornet, S: SpiderState, t: Bot, range: number) {
  const dx = t.x - h.x, dy = t.y - h.y;
  const d = Math.hypot(dx, dy) || 1;
  const reach = Math.max(40, Math.min(d, range * T * 1.3));
  S.tx = h.x + (dx / d) * reach;
  S.ty = h.y + (dy / d) * reach;
}

/** A leap ends: everything in the landing takes the blow, then it rests (or, twisted, pounces again at once). */
function land(sim: Sim, h: Hornet, S: SpiderState, D: { every: [number, number]; dmg: number }, t: Bot | null) {
  if (S.drop) {
    // Down from beyond the edge: a thud and dust, no blow, then it hunts.
    S.drop = undefined;
    S.z = 0;
    h.x = S.tx;
    h.y = S.ty;
    h.vx = h.vy = 0;
    S.mode = 'stalk';
    S.t = 0.4;
    S.go = false;
    emit(sim, 'drop', h, { x: S.tx, y: S.ty });
    return;
  }
  const tw = h.twisted ? TWISTED.spider : null;
  const dmg = FOES.spider.dmg * SPIDER.pounce.dmgMul * (h.elite ? HORNET.elite.dmg : 1) * (tw ? tw.dmg * tw.dash.dmg : 1) * sim.berserk(h).dmg;
  let hits = 0;
  for (const b of sim.bots) {
    if (b.dead || dist(b.x, b.y, S.tx, S.ty) > SPIDER.pounce.radius + ROLES[b.role].r * 0.5) continue;
    hits++;
    sim.foeHit(h, b, dmg);
  }
  S.z = 0;
  h.x = S.tx;
  h.y = S.ty;
  h.vx = h.vy = 0;
  emit(sim, 'land', h, { x: S.tx, y: S.ty, hits });
  if (S.chain > 0) {
    S.chain--;
    S.mode = 'tellPounce';
    S.t = 0.24;
    if (t) aim(h, S, t, SPIDER.pounce.range);
    else {
      S.tx = h.x + Math.cos(S.ang) * 60;
      S.ty = h.y + Math.sin(S.ang) * 60;
    }
    emit(sim, 'tellPounce', h);
    return;
  }
  S.mode = 'recover';
  S.t = SPIDER.pounce.rest * (tw ? 0.6 : 1);
  S.pounceT = sim.spiders.r.range(...D.every) * sim.berserk(h).cd;
}

/** A robot hit by a cable: tethered to the spider until it dies, the robot gets away, or the cable gives. */
export function snare(sim: Sim, b: Bot, spiderId: number) {
  if (b.climbs) return void sim.say('web', `A spider's cable slides off ${b.name}'s legs.`, 'warn'); // spider legs are not held (P53)
  b.web = { by: spiderId, t: SPIDER.web.time };
  sim.engine.apply(b, 'webbed', { duration: SPIDER.web.time });
  const h = sim.hornets.find((x) => x.id === spiderId);
  if (h) emit(sim, 'snare', h, { bot: b });
  sim.say('web', b.role === 'controller' ? 'It has you on a cable. You are slowed until it lets go: kill the spider, or get out of its reach.' : `${b.name} is on a spider's cable. Kill the spider and it lets go.`, 'warn');
}

/** Tethers: a webbed robot is slowed (a held change on its speed, beside the halo's); the cable lets go when the spider dies, the robot is far enough or the time is up. */
export function holdWeb(sim: Sim, dt: number) {
  for (const b of sim.bots) {
    if (!b.web) continue;
    const sp = sim.hornets.find((x) => x.id === b.web!.by && !x.dead);
    b.web.t -= dt;
    if (!sp || b.dead || b.web.t <= 0 || dist(sp.x, sp.y, b.x, b.y) > SPIDER.web.leash * T) {
      b.web = undefined;
      sim.engine.strip(b, 'webbed');
      sim.engine.release(b, 'web');
      continue;
    }
    sim.engine.hold(b, 'web', { stat: 'speed', more: SPIDER.web.slow }, 0.4);
    sim.mark(b, 'webbed', 0.4);
  }
}

/**
 * Enemies arrive from off the map on every land at every stage, whether or not any hive lives (the spawner rule: destroying
 * hives thins the waves, never ends them), more and more all the way to midnight (`EDGE`: the clock's share `q`, 0 at the start, 1 at
 * midnight, sets the interval and the cap; no step at a phase change) and faster by a berserk step past midnight like the hives.
 * The kind is the biome's `edge`, else a weighted pick from its `foes`; it rolls elite and twisted like any spawn. They come from a
 * point of the rim a few dozen tiles from the Communicator. `cfg.edge` and `cfg.swarm` scale both; the morning's also `cfg.morningSwarm`.
 */
export function edgeArrivals(sim: Sim, dt: number) {
  rimIn(sim);
  const morning = sim.day.phase === 'morning';
  if (morning && sim.cfg.morningSwarm <= 0) return;
  const W = sim.spiders;
  W.edgeT -= dt;
  if (W.edgeT > 0) return;
  const q = Math.min(1, sim.dayT / Math.max(1, sim.day.at.midnight));
  const k = Math.max(0.05, sim.cfg.swarm * sim.cfg.edge * (morning ? sim.cfg.morningSwarm : 1) * sim.mods.spawn);
  const [a, b] = EDGE.interval;
  W.edgeT = (a * (b / a) ** q * W.r.range(0.7, 1.3) * spawnMul(sim.day.step, sim.cfg.berserk)) / k;
  const cap = Math.round(lerp(EDGE.alive[0], EDGE.alive[1], q) * k);
  if (sim.hornets.filter((h) => h.rim && !h.dead).length >= cap) return;
  const pick = spawnPick(sim, 'rim'); // the first expeditions' (`spawntiers.ts`)
  spawnAtRim(sim, pick?.kind ?? sim.biome.edge ?? W.r.weighted(sim.biome.foes), undefined, undefined, pick?.elite);
}

/** An arrival stepping off the rock rim onto the land (P31): the view dresses it by the biome (`foeview.ts` `RIM_LOOK`). */
function rimIn(sim: Sim) {
  for (const h of sim.hornets) {
    if (!h.rim || h.rimIn || h.dead || h.spider) continue;
    const tx = Math.floor(h.x / T), ty = Math.floor(h.y / T);
    if (tx < 0 || ty < 0 || tx >= sim.W || ty >= sim.H || !passable(sim.map.ter[ty * sim.W + tx])) continue;
    h.rimIn = true;
    sim.events.push({ e: 'beast', what: 'rimIn', h, x: h.x, y: h.y });
  }
}

/** One enemy just beyond the rim, a good way from the Communicator (the best of a few tries): a spider leaps in over the edge, any other kind walks or flies straight in. It hunts the nearest robot from anywhere (`Hornet.rim`). */
export function spawnAtRim(sim: Sim, kind: Enemy = 'spider', x?: number, y?: number, elite?: boolean): Hornet {
  const R = sim.spiders.r;
  const c = sim.controller;
  const w = sim.W * T, hh = sim.H * T;
  const out = T * 0.5;
  let best = { x: 0, y: 0, ix: 0, iy: 1, miss: Infinity };
  for (let i = 0; i < 8; i++) {
    const side = R.int(0, 3);
    const u = R.range(0.06, 0.94);
    const p = side === 0 ? { x: w * u, y: -out, ix: 0, iy: 1 } : side === 1 ? { x: w * u, y: hh + out, ix: 0, iy: -1 } : side === 2 ? { x: -out, y: hh * u, ix: 1, iy: 0 } : { x: w + out, y: hh * u, ix: -1, iy: 0 };
    const miss = Math.abs(dist(p.x, p.y, c.x, c.y) - T * 28);
    if (miss < best.miss) best = { ...p, miss };
  }
  // Along the rim a little, so arrivals do not stack on one point.
  const slide = R.range(-SPIDER.edge.spread, SPIDER.edge.spread) * T;
  if (best.ix === 0) best.x = clamp(best.x + slide, T, w - T);
  else best.y = clamp(best.y + slide, T, hh - T);
  if (x !== undefined && y !== undefined) {
    // A dev placement: the nearest rim point to (x, y).
    const ds = [y, hh - y, x, w - x];
    const side = ds.indexOf(Math.min(...ds));
    best = side === 0 ? { x, y: -out, ix: 0, iy: 1, miss: 0 } : side === 1 ? { x, y: hh + out, ix: 0, iy: -1, miss: 0 } : side === 2 ? { x: -out, y, ix: 1, iy: 0, miss: 0 } : { x: w + out, y, ix: -1, iy: 0, miss: 0 };
  }
  const h = sim.spawnHornet(best.x, best.y, 0, elite, undefined, kind);
  h.rim = true;
  const S = h.spider;
  if (S) {
    // It leaps in from beyond the edge: a long, high arc to a spot inside, landing without a blow (`drop`).
    const E = SPIDER.edge;
    const lateral = R.range(-1, 1) * T * 1.5;
    S.mode = 'leap';
    S.drop = { time: E.time, arc: E.arc };
    S.t = E.time;
    S.sx = h.x;
    S.sy = h.y;
    S.tx = clamp(h.x + best.ix * (E.in * T + out) + best.iy * lateral, T, w - T);
    S.ty = clamp(h.y + best.iy * (E.in * T + out) + best.ix * lateral, T, hh - T);
    S.ang = Math.atan2(S.ty - S.sy, S.tx - S.sx);
  }
  sim.say('rim', `Something is coming in from beyond the edge of the map. Tear down every ${sim.biome.talk.hive} you like: out here, they come in from off the map anyway.`, 'warn');
  return h;
}

/** A hive's spawn is sometimes another machine (`BIOMES.<biome>.mix`: the spiders of the desert). Its own random stream, so the hornets' are as they were. */
export function mixKind(sim: Sim): Enemy | undefined {
  const mix = sim.biome.mix;
  if (!mix) return undefined;
  for (const [k, share] of Object.entries(mix) as [Enemy, number][]) if (sim.spiders.r.chance(share)) return k;
  return undefined;
}

export function spiderSummary(sim: Sim) {
  const all = sim.hornets.filter((h) => h.spider && !h.dead);
  const modes: Record<string, number> = {};
  for (const h of all) modes[h.spider!.mode] = (modes[h.spider!.mode] ?? 0) + 1;
  return {
    n: all.length,
    twisted: all.filter((h) => h.twisted).length,
    elite: all.filter((h) => h.elite).length,
    fromRim: all.filter((h) => h.rim).length,
    modes,
    webbed: sim.bots.filter((b) => b.web).map((b) => b.name),
  };
}
