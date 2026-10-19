/**
 * Bosses: arriving (at dusk, from a hive or at an arena), the move cycle, second forms, the Ironback's monkeys, arenas and their props.
 * Add a boss: a `BOSSES` entry (defs/bosses.ts) whose `cycle` names its moves.
 * Add a kind of move: a tell state in `flyBoss` and a function here for what it does when it lands.
 */

import {
  damageHornet,
  foeHit,
} from './combat';
import {
  ARENA,
  type BossDef,
  type Enemy,
  FEED,
  HORNET,
  ROLES,
  T,
  bossNow,
  bossOf,
} from './defs';
import {
  brain,
  foeShot,
  glide,
  reach,
  spawnHornet,
  wake,
} from './foes';
import { dist } from './geom';
import type { Spot } from './mapgen';
import {
  foeType,
  foeUnit,
} from './missionfx';
import { type Leash, tie } from './leash';
import { say } from './oracle';
import { arenaOf } from './placeplay';
import type { Sim } from './sim';
import { formBreak } from './tiers';
import { newSpider } from './spider';
import { newGrub } from './caterpillar';
import {
  type Bot,
  CLOCK,
  type Hornet,
} from './types';

export type BossEvent =
  /** A monkey threw its boss scrap: it heals. */
  | { e: 'feed'; h: Hornet; boss: Hornet; amt: number }
  /** A boss arrives, winds up a move (`tell`), lands it, or changes (`what`). */
  | { e: 'boss'; what: 'arrive' | 'tell' | 'volley' | 'charge' | 'summon' | 'rage' | 'quake' | 'leap' | 'slam' | 'stuck' | 'shift' | 'phase2' | 'phase1' | 'cancel' | 'block' | 'crash' | 'leave' | 'veil' | 'unveil'; h: Hornet };

const PLACES_NAME: Record<string, string> = { stage: 'the Old Stage', plaza: 'the Museum Plaza', lake: 'the Frozen Lake' };

/**
 * A boss arrives: from the nearest living hive at dusk (or from the dark beyond the Communicator when none is
 * left), or, with `home`, one that guards a place (the Harbinger, out of its keep), standing there.
 */
export function spawnBoss(sim: Sim, kind: Enemy = 'hornet', home?: Spot, o: { leash?: Leash } = {}) {
  const B = bossOf(kind);
  const c = sim.controller;
  const n = home ? undefined : sim.nests.filter((x) => !x.dead && !x.place).sort((p, q) => dist(p.x, p.y, c.x, c.y) - dist(q.x, q.y, c.x, c.y))[0];
  if (n) wake(sim, n, CLOCK);
  const h: Hornet = {
    id: sim.nextId++, x: home?.x ?? n?.x ?? c.x, y: home ? home.y + 30 : (n?.y ?? c.y - 500) - 20, hp: B.hp, maxHp: B.hp, vx: 0, vy: 0, target: 0, cd: 1.5, nest: n?.id ?? 0, dead: false, wob: 0, elite: false,
    kind, twisted: !B.mini, boss: true, r: B.r, reach: B.r + 14, brain: brain(sim, [B.every, B.every]), gunT: 0, ...(home && { home: { ...home } }),
  };
  if (home && o.leash) tie(h, home, o.leash);
  if (kind === 'spider') h.spider = newSpider(sim); // a Crawlcam boss walks and pounces as a Crawlcam
  if (kind === 'caterpillar') h.grub = newGrub(h); // the intro's mini-boss: its spiral, rear and lunge (`caterpillar.ts`)
  if (!B.mini) sim.bossSpawned = true;
  if (B.phase2?.every) h.formAt = sim.time + B.phase2.every;
  sim.engine.add(h, foeUnit(kind, { boss: true, twisted: !B.mini }));
  sim.soak(h);
  sim.hornets.push(h);
  sim.events.push({ e: 'spawn', h });
  if (B.mini) return h; // it stands guard: its place says when it wakes
  sim.events.push({ e: 'boss', what: 'arrive', h });
  say(sim, 'boss', B.arrive, 'urgent');
  return h;
}

/** The dusk boss: at its arena when this land has one (it holds it until midnight), else from the nearest hive. */
export function duskBoss(sim: Sim, kind: Enemy) {
  const p = arenaOf(sim, kind);
  if (!p) return spawnBoss(sim, kind);
  const h = spawnBoss(sim, kind, { x: p.x, y: p.y });
  h.arena = p.id;
  p.state = 'held';
  const c = sim.controller;
  const dx = p.x - c.x, dy = p.y - c.y;
  const way = `${dy < -Math.abs(dx) / 2 ? 'north' : dy > Math.abs(dx) / 2 ? 'south' : ''}${Math.abs(dx) > Math.abs(dy) / 2 ? (dx > 0 ? 'east' : 'west') : ''}`;
  say(sim, 'arena', `${bossOf(kind).name} is back at ${PLACES_NAME[p.id] ?? 'its arena'}, ${Math.round(Math.hypot(dx, dy) / T)} tiles ${way || 'from here'}. It holds it until midnight; then it comes for you. Go to it while it waits, with everything you have, or be on the lift by then.`, 'urgent');
  return h;
}

/** Midnight: a boss holding its arena leaves it and hunts. */
export function leaveArena(sim: Sim, h: Hornet) {
  h.arena = undefined;
  h.home = undefined;
  say(sim, 'arena-leave', `Midnight. ${bossOf(h.kind).name} has left its arena. It is coming for you.`, 'urgent');
  sim.events.push({ e: 'boss', what: 'leave', h });
}

/** Is this enemy on a frozen lake (`ARENA.ice`)? */
export function onIce(sim: Sim, h: { x: number; y: number }) {
  for (const p of sim.places) for (const q of p.parts) if (q.kind === 'ice' && dist(h.x, h.y, q.x, q.y) < ARENA.ice.r * T) return true;
  return false;
}

/** An arena prop a boss of radius `r` at (x, y) has run into, or null. */
function propAt(sim: Sim, x: number, y: number, r: number) {
  for (const p of sim.places) for (const q of p.parts) {
    const pr = ARENA.props[q.kind];
    if (pr !== undefined && dist(x, y, q.x, q.y) < pr + r * 0.6) return q;
  }
  return null;
}

/**
 * A boss's turn: it keeps a ring around its target, orbiting, and cycles `BOSSES.cycle`.
 * Each attack is announced by a stillness (the tell) before it lands.
 * The charge locks its line a moment before it goes, so it can be sidestepped.
 */
export function flyBoss(sim: Sim, h: Hornet, dt: number, t: Bot | null) {
  const B = bossNow(h.kind, h.phase, h.breaks);
  const P = bossOf(h.kind).phase2;
  const br = h.brain;
  const bz = sim.berserk(h);
  br.t -= dt;
  quakeStep(sim, h, B, dt);
  // The veil (the Evil Oracle's second form): now and then nothing lands on him.
  if (B.veil && h.phase === 2) {
    h.veilT = (h.veilT ?? B.veil.every) - dt;
    if (h.veilT <= 0) {
      h.veiled = !h.veiled;
      reach(sim, h);
      h.veilT = h.veiled ? B.veil.time : B.veil.every;
      sim.events.push({ e: 'boss', what: h.veiled ? 'veil' : 'unveil', h });
    }
  }
  // Its second form: under its share of health, it stops to change (open to everything), unless a kick stopped it lately.
  if (P && br.state !== 'shift' && br.state !== 'slam' && br.state !== 'tellSlam') {
    const low = h.hp < h.maxHp * P.at;
    if (h.phase !== 2 && sim.time >= (h.shiftAt ?? 0) && ((low && !h.halved) || (P.every !== undefined && sim.time >= (h.formAt ?? Infinity)))) bossShift(sim, h);
    else if (h.phase === 2 && P.stay !== undefined && br.state === 'roam' && sim.time >= (h.formAt ?? Infinity)) {
      // Back down: a dive that lands it in its first form.
      br.state = 'tellSlam';
      br.t = B.slam?.tell ?? 0.5;
      h.landing = true;
      sim.events.push({ e: 'boss', what: 'tell', h });
    }
  }
  const rage = h.hp < h.maxHp * B.enrage;
  if (rage && !br.rage) {
    br.rage = true;
    sim.events.push({ e: 'boss', what: 'rage', h });
  }
  const rate = rage ? B.enrageRate : 1;
  const dmgMul = bz.dmg;
  const speed = B.speed * (sim.cfg.hornetSpeed / HORNET.speed) * bz.speed * sim.mobility(h);
  let dx = 0, dy = 0, sp = speed, snap = 4;
  if (!t) {
    // Nobody to hunt: a leap still comes down, a change still finishes.
    if (br.state === 'slam') {
      if (br.t <= 0) bossLand(sim, h, B, dmgMul);
      return;
    }
    if (br.state === 'shift') {
      if (br.t <= 0) bossPhase2(sim, h);
      return;
    }
    const a = h.wob * 0.6;
    const n = sim.nests.find((x) => x.id === h.nest);
    const home = h.home ?? (n ? { x: n.x, y: n.y - 60 } : { x: h.x, y: h.y });
    const ring = h.home ? 40 : 120; // a guardian paces before its keep
    dx = home.x + Math.cos(a) * ring - h.x;
    dy = home.y + Math.sin(a) * ring * 0.6 - h.y;
    const d = Math.hypot(dx, dy) || 1;
    glide(sim, h, dx / d, dy / d, speed * 0.5, snap, dt);
    return;
  }
  const d = dist(h.x, h.y, t.x, t.y) || 1;
  const ux = (t.x - h.x) / d, uy = (t.y - h.y) / d;
  switch (br.state) {
    case 'roam': {
      const push = Math.max(-1, Math.min(1, (d - B.ring) / 140));
      dx = ux * push - uy * br.orbit * 0.9;
      dy = uy * push + ux * br.orbit * 0.9;
      if (br.t <= 0) {
        // A break may owe a move (it goes first), else the next of its cycle.
        let kind = br.owe ?? B.cycle[br.left++ % B.cycle.length];
        br.owe = undefined;
        if (kind === 'summon' && sim.hornets.length >= B.summon.max) kind = B.quake ? 'quake' : 'volley';
        if ((kind === 'quake' && !B.quake) || (kind === 'slam' && !B.slam)) kind = 'charge';
        br.state = kind === 'volley' ? 'tellVolley' : kind === 'charge' ? 'tellCharge' : kind === 'quake' ? 'tellQuake' : kind === 'slam' ? 'tellSlam' : 'tellSummon';
        br.t = B[kind]!.tell;
        br.dx = ux;
        br.dy = uy;
        sim.events.push({ e: 'boss', what: 'tell', h });
      }
      break;
    }
    case 'tellVolley':
      sp = 0;
      if (br.t <= 0) {
        volley(sim, h, t, B, dmgMul);
        br.state = 'roam';
        br.t = B.every / rate;
        br.orbit *= -1;
      }
      break;
    case 'tellCharge':
      sp = 0;
      if (br.t > 0.25) {
        br.dx = ux;
        br.dy = uy;
      }
      if (br.t <= 0) {
        br.state = 'charge';
        br.t = B.charge.time * (onIce(sim, h) ? ARENA.ice.slide : 1);
        br.hit = [];
        sim.events.push({ e: 'boss', what: 'charge', h });
      }
      break;
    case 'tellQuake':
      sp = 0;
      if (br.t <= 0) {
        h.quake = { x: h.x, y: h.y, r: h.r, hit: [] };
        sim.events.push({ e: 'boss', what: 'quake', h });
        br.state = 'roam';
        br.t = B.every / rate;
      }
      break;
    case 'tellSlam':
      sp = 0;
      if (br.t <= 0) {
        br.state = 'slam';
        br.t = B.slam!.air;
        h.air = true;
        reach(sim, h);
        h.slam = { x: t.x, y: t.y };
        sim.events.push({ e: 'boss', what: 'leap', h });
      }
      break;
    case 'slam': {
      // Up out of sight: the landing follows the target until the last moment, then it comes down there.
      sp = 0;
      const S = B.slam!;
      if (br.t > S.lock) h.slam = { x: t.x, y: t.y };
      if (br.t <= 0) bossLand(sim, h, B, dmgMul);
      break;
    }
    case 'stuck':
      // Stuck where its charge ended (a lance in a wall): it can do nothing but sting what stands close.
      sp = 0;
      if (br.t <= 0) {
        br.state = 'roam';
        br.t = B.every / rate / 2;
      }
      break;
    case 'shift':
      sp = 0;
      if (br.t <= 0) bossPhase2(sim, h);
      break;
    case 'tellSummon':
      sp = 0;
      if (br.t <= 0) {
        for (let i = 0; i < B.summon.count; i++) {
          const a = (i / B.summon.count) * Math.PI * 2 + h.wob;
          const s = spawnHornet(sim, h.x + Math.cos(a) * 46, h.y + Math.sin(a) * 30, 0, false, true, B.summon.kind ?? h.kind);
          if (B.fed) {
            s.feeds = h.id;
            s.feedT = sim.r.range(...FEED.every);
          }
          s.vx = Math.cos(a) * 160;
          s.vy = Math.sin(a) * 160;
        }
        sim.events.push({ e: 'boss', what: 'summon', h });
        br.state = 'roam';
        br.t = B.every / rate;
      }
      break;
    default: {
      // The charge: a straight line at speed; whoever it passes through is struck once and thrown aside.
      dx = br.dx;
      dy = br.dy;
      sp = B.charge.speed * bz.speed;
      snap = 30;
      for (const b of sim.bots) {
        if (b.dead || br.hit.includes(b.id) || dist(h.x, h.y, b.x, b.y - 10) > h.r + ROLES[b.role].r + 4) continue;
        br.hit.push(b.id);
        foeHit(sim, h, b, B.charge.dmg * dmgMul);
        if (B.charge.status && !b.dead && b.hp > 0) sim.engine.apply(b, B.charge.status, { by: h });
        sim.moveBy(b, br.dx * B.charge.knock, br.dy * B.charge.knock);
      }
      // Into an arena's prop (a tree, a statue, a car, a rock): it crashes, stuck and hurt. Not a jet: it flies over.
      const prop = !(h.phase === 2 && bossOf(h.kind).phase2?.fly) && (propAt(sim, h.x + br.dx * h.r, h.y + br.dy * h.r, h.r) || (B.charge.rock && sim.blocked(h.x + br.dx * (h.r + 6), h.y + br.dy * (h.r + 6))));
      if (prop) {
        br.state = 'stuck';
        br.t = ARENA.crash.stun;
        h.vx = h.vy = 0;
        crash(sim, h, ARENA.crash.dmg);
        sim.events.push({ e: 'boss', what: 'crash', h });
        say(sim, `crash-${h.kind}`, 'It ran itself into that. Now, while it is stuck!', 'warn');
        break;
      }
      // A strafing run: bombs thrown out to both sides of its line as it goes.
      const sf = B.charge.strafe;
      if (sf && Math.floor((br.t + dt) / sf.every) !== Math.floor(br.t / sf.every))
        for (const side of [-1, 1])
          foeShot(sim, { x: h.x, y: h.y, vx: -br.dy * side * sf.speed, vy: br.dx * side * sf.speed, dmg: sf.dmg * dmgMul, life: 0.7, big: true, by: h.id, type: foeType(h.kind) });
      if (br.t <= 0) {
        br.state = B.charge.stuck ? 'stuck' : 'roam';
        br.t = B.charge.rest;
        if (B.charge.stuck) sim.events.push({ e: 'boss', what: 'stuck', h });
      }
    }
  }
  // Close to anything, she stings.
  if (h.cd <= 0 && br.state !== 'charge' && br.state !== 'slam') {
    const near = sim.bots.find((b) => !b.dead && !b.downed && dist(h.x, h.y, b.x, b.y - 10) < h.r + ROLES[b.role].r + 6);
    if (near) {
      h.cd = B.sting.rate / rate;
      sim.events.push({ e: 'sting', h, bot: near });
      foeHit(sim, h, near, B.sting.dmg * dmgMul);
    }
  }
  glide(sim, h, dx, dy, sp, snap, dt);
}

/** A body crashes (a boss into a prop): impact damage, the Communicator's `crashDamage` (the Boot) on it, and the `crash` trigger. */
export function crash(sim: Sim, h: Hornet, dmg: number) {
  const c = sim.controller;
  damageHornet(sim, h, dmg * sim.engine.stat(c, 'crashDamage', 1), c, 'impact', { via: 'crash' });
  sim.engine.emit({ kind: 'crash', self: c, target: h, via: 'crash' });
  sim.drainFx();
}

/** A boss's helper throws it scrap now and then while near it: the boss heals. */
export function feed(sim: Sim, h: Hornet, dt: number) {
  const boss = sim.hornets.find((x) => x.id === h.feeds && !x.dead);
  if (!boss) {
    h.feeds = undefined;
    return;
  }
  h.feedT = (h.feedT ?? 0) - dt;
  if (h.feedT > 0 || dist(h.x, h.y, boss.x, boss.y) > FEED.range || boss.air) return;
  h.feedT = sim.r.range(...FEED.every);
  const amt = Math.min(FEED.heal, boss.maxHp - boss.hp);
  if (amt <= 0) return;
  sim.engine.heal(boss, amt);
  sim.events.push({ e: 'feed', h, boss, amt });
  say(sim, 'feed', 'Those monkeys are throwing it scrap, and it is mending. Kill them, or kick them away from it.', 'warn');
}

/** A boss's ring grows; a robot it passes through is struck once and thrown out (unless the Communicator is dashing). */
function quakeStep(sim: Sim, h: Hornet, B: BossDef, dt: number) {
  const q = h.quake, Q = B.quake;
  if (!q || !Q) return;
  q.r += Q.speed * dt;
  if (q.r > Q.max) {
    h.quake = undefined;
    return;
  }
  for (const b of sim.bots) {
    if (b.dead || q.hit.includes(b.id)) continue;
    if (b.role === 'controller' && (sim.dashing || sim.lunge)) continue;
    const g = dist(q.x, q.y, b.x, b.y);
    if (Math.abs(g - q.r) > Q.width / 2 + ROLES[b.role].r) continue;
    q.hit.push(b.id);
    foeHit(sim, h, b, Q.dmg * sim.berserk(h).dmg, 'quake');
    if (Q.status && !b.dead && b.hp > 0) sim.engine.apply(b, Q.status, { by: h });
    // A negative knock pulls in (the Bishop's chord), never past the middle.
    const kn = Q.knock < 0 ? -Math.min(-Q.knock, g * 0.8) : Q.knock;
    sim.moveBy(b, ((b.x - q.x) / (g || 1)) * kn, ((b.y - q.y) / (g || 1)) * kn);
  }
}

/** A leap comes down where its shadow was: everything within its radius is struck and thrown out. */
function bossLand(sim: Sim, h: Hornet, B: BossDef, dmgMul: number) {
  const S = B.slam!;
  h.x = h.slam?.x ?? h.x;
  h.y = h.slam?.y ?? h.y;
  h.vx = h.vy = 0;
  h.air = false;
  reach(sim, h);
  h.slam = undefined;
  for (const b of sim.bots) {
    const g = dist(h.x, h.y, b.x, b.y);
    if (b.dead || g > S.radius + ROLES[b.role].r) continue;
    foeHit(sim, h, b, S.dmg * dmgMul, 'slam');
    sim.moveBy(b, ((b.x - h.x) / (g || 1)) * S.knock, ((b.y - h.y) / (g || 1)) * S.knock);
  }
  sim.events.push({ e: 'boss', what: 'slam', h });
  h.brain.state = 'roam';
  h.brain.t = B.every;
  const P = bossOf(h.kind).phase2;
  if (h.landing && P) {
    // It came down in its first form; it will take off again.
    h.landing = false;
    h.phase = 1;
    h.brain.left = 0;
    h.formAt = sim.time + (P.every ?? 30) * (h.hp < h.maxHp * P.at ? P.low ?? 1 : 1);
    say(sim, `phase1-${h.kind}`, `It came down as ${bossOf(h.kind).name} again, and it will take off again. Kick it while it folds: that stops it.`, 'warn');
    sim.events.push({ e: 'boss', what: 'phase1', h });
  }
}

/** A boss starts changing into its second form: still and open for `shift` seconds. */
function bossShift(sim: Sim, h: Hornet) {
  const P = bossOf(h.kind).phase2!;
  h.brain.state = 'shift';
  h.brain.t = P.shift;
  h.air = false;
  reach(sim, h);
  sim.events.push({ e: 'boss', what: 'shift', h });
}

/** The change is done: the second form fights on (and leaves behind what it rode). */
function bossPhase2(sim: Sim, h: Hornet) {
  const P = bossOf(h.kind).phase2!;
  h.phase = 2;
  formBreak(sim, h, P.name); // its second form is its one break: a part drops here (D18)
  h.brain.state = 'roam';
  h.brain.t = 0.6;
  h.brain.left = 0;
  const low = h.hp < h.maxHp * P.at;
  if (low) h.halved = true;
  if (P.stay) h.formAt = sim.time + P.stay * (low ? P.low ?? 1 : 1);
  if (P.spawn) {
    const s = spawnHornet(sim, h.x + 40, h.y, 0, true, true, P.spawn);
    s.vx = 200;
  }
  say(sim, `phase2-${h.kind}`, P.say, 'urgent');
  sim.events.push({ e: 'boss', what: 'phase2', h });
}

/** A kick lands on a boss: stuck, it may start the change (unhorsing); changing, it may stop it. */
export function bossKicked(sim: Sim, h: Hornet) {
  const P = bossOf(h.kind).phase2;
  if (!P || h.phase === 2) return;
  if (P.kickIn === 'stuck' && h.brain.state === 'stuck') bossShift(sim, h);
  else if (P.kickCancels && h.brain.state === 'shift') {
    h.brain.state = 'stuck';
    h.brain.t = 2;
    h.shiftAt = sim.time + (P.retry ?? 10);
    sim.events.push({ e: 'boss', what: 'cancel', h });
  }
}

/** The share of a hit a boss takes: more while it changes, little from in front of the knight's shield. */
export function bossGuard(sim: Sim, h: Hornet, by: Bot | null) {
  const P = bossOf(h.kind).phase2;
  if (!P) return 1;
  if (h.brain.state === 'shift') return P.open;
  const t = sim.bot(h.target);
  if (h.phase === 2 && P.shield !== undefined && by && t) {
    const fx = t.x - h.x, fy = t.y - h.y, ax = by.x - h.x, ay = by.y - h.y;
    const front = (fx * ax + fy * ay) / ((Math.hypot(fx, fy) || 1) * (Math.hypot(ax, ay) || 1));
    if (front > 0.35) {
      if (sim.time - sim.blockAt > 0.4) sim.events.push({ e: 'boss', what: 'block', h });
      sim.blockAt = sim.time;
      return P.shield;
    }
  }
  return 1;
}

export function volley(sim: Sim, h: Hornet, t: Bot, B: BossDef, dmgMul: number) {
  const n = B.volley.bolts + (h.brain.rage ? B.volley.extra : 0);
  const a0 = Math.atan2(t.y - 10 - (h.y - 18), t.x - h.x);
  for (let i = 0; i < n; i++) {
    const a = a0 + (n > 1 ? i / (n - 1) - 0.5 : 0) * B.volley.spread;
    sim.shots.push({
      id: sim.nextId++, x: h.x + Math.cos(a) * 30, y: h.y - 18 + Math.sin(a) * 30, vx: Math.cos(a) * B.volley.speed, vy: Math.sin(a) * B.volley.speed,
      dmg: B.volley.dmg * dmgMul, life: B.volley.life, dead: false, big: true, by: h.id, foe: true, type: foeType(h.kind),
    });
  }
  sim.events.push({ e: 'boss', what: 'volley', h });
}

/** `summary().day.boss`: the boss on the field now, or why there is none. */
export function bossSummary(sim: Sim) {
  const b = sim.boss;
  if (!b) return sim.bossDown ? 'down' : sim.bossSpawned ? 'gone' : null;
  return {
    kind: b.kind,
    hp: Math.round(b.hp),
    state: b.brain.state,
    rage: b.brain.rage,
    phase: b.phase ?? 1,
    ...(b.arena && { arena: b.arena }),
    ...(b.breaks?.length && { broke: b.breaks.join('+') }),
    ...(b.formAt !== undefined && { changeIn: Math.round(b.formAt - sim.time) }),
  };
}
