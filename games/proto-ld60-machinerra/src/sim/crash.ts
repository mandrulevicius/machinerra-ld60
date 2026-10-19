/**
 * Crashes and kicked bodies (P39). A kick sends a foe, one of your robots or a kickable prop flying (`fling`). Flying at least
 * `CRASH.min` px/s, it crashes into rock, a solid prop or another foe: crash damage by its speed (type Impact) to what it
 * strikes (and to a foe that did the striking), the foe Staggered, the engine's `crash` trigger fired and the crash counted.
 * A foe struck is sent flying on in turn (`CRASH.share` of the speed), so a row of foes goes down like pins. Your own robots
 * take no damage from being kicked or from crashing, and deal crash damage to what they hit (a deed per type: `kickCrash`).
 * Kill credit follows the damage (D34): a kill by crash damage from a kick is a kick kill and a crash kill (`damageHornet`).
 * Rock does not break; a solid prop does (`hitProp`), and a body that broke one flies on slower.
 * Bosses crash too, but a kick barely moves them (`swing` scales their knock), so they rarely reach the speed.
 * Add a kickable thing: the `kickable` flag in `PROPS`; a new kind of crash surface: a branch in `hitSurface`.
 */
import { CRASH, PROPS, ROLES, T, bossKnock } from './defs';
import { dist } from './geom';
import { behaviourOfBot } from './botskills';
import { slide } from './placeparts';
import { PERK_FX } from './perks';
import { hitProp, solidAt, type Fling, type Prop } from './props';
import type { Sim } from './sim';
import type { Bot, Hornet } from './types';

/** A robot sent flying (kicked): its velocity and what a Fling holds. */
export interface BotFling extends Fling {
  vx: number;
  vy: number;
}

const flingOf = (sim: Sim, by: Bot | null, kick: boolean): Fling => ({ by: by?.id ?? 0, kick, hit: [], until: sim.time + CRASH.flight });

/** A foe sent flying by a kick: its crashes are counted for the kicker. (Its speed was already added.) */
export function flingFoe(sim: Sim, h: Hornet, by: Bot | null, kick = true) {
  h.fling = flingOf(sim, by, kick);
}

/** One of your robots kicked along (`vx`, `vy` px/s): it slides, takes no damage and hits what it meets. */
export function flingBot(sim: Sim, b: Bot, vx: number, vy: number, by: Bot) {
  b.fling = { ...flingOf(sim, by, true), vx, vy };
  b.path = [];
}

/** A prop kicked along: it slides (a rocket: it takes off at its own speed along the kick). */
export function flingProp(sim: Sim, p: Prop, vx: number, vy: number, by: Bot) {
  const R = PROPS[p.kind].fx?.rocket;
  const k = R ? R.speed / (Math.hypot(vx, vy) || 1) : 1;
  p.vx = vx * k;
  p.vy = vy * k;
  if (R) p.rocket = R.time;
  p.fling = flingOf(sim, by, true);
  sim.events.push({ e: 'prop', what: 'kick', p });
}

/** What a swing does to the things that are not foes: a kick sends robots and kickable props flying, every swing hurts the props in its arc. Returns how many it touched. */
export function swingBodies(sim: Sim, by: Bot, a: number, w: { dmg: number; knock: number }, kick: boolean, inArc: (x: number, y: number, r: number) => boolean) {
  let hits = 0;
  const dx = Math.cos(a), dy = Math.sin(a);
  if (kick)
    for (const b of sim.crew) {
      if (b === by || b.dead || b.downed || sim.engine.isDown(b) || !inArc(b.x, b.y, ROLES[b.role].r)) continue;
      const d = dist(by.x, by.y, b.x, b.y) || 1, k = w.knock * slide(sim, b.x, b.y);
      flingBot(sim, b, ((b.x - by.x) / d) * k, ((b.y - by.y) / d) * k, by);
      hits++;
    }
  for (const p of [...sim.props.list]) {
    if (p.broken || p.primed !== undefined || p.carriedBy !== undefined || !inArc(p.x, p.y, p.r)) continue;
    hits++;
    if (kick && PROPS[p.kind].kickable) {
      const d = dist(by.x, by.y, p.x, p.y) || 1, k = w.knock * slide(sim, p.x, p.y);
      flingProp(sim, p, ((p.x - by.x) / d) * k || dx, ((p.y - by.y) / d) * k || dy, by);
    } else hitProp(sim, p, w.dmg, { by, via: kick ? 'kick' : 'melee' });
  }
  return hits;
}

/** Crash damage by speed. */
export const crashDmg = (speed: number) => speed * CRASH.perSpeed;

/** Bowling Season: seconds a kicked robot is Braced after it hits something. */
const BOWLING_BRACE = 2;

/** What multiplies every crash the Communicator's side makes: the `crashDamage` stat (the Boot) and the Iron Toe. */
export const crashMul = (sim: Sim) => sim.engine.stat(sim.controller, 'crashDamage', 1) * (sim.perks.has('ironToe') ? PERK_FX.ironToe.crash : 1);

/** A foe crashes: the damage (the Communicator's `crashDamage` stat, the Boot, scales it), Staggered, the trigger, the count. */
function crashFoe(sim: Sim, h: Hornet, speed: number, by: Bot | null, kick: boolean) {
  const c = by ?? sim.controller;
  h.crashT = sim.time;
  sim.stats.crashes++;
  sim.damageHornet(h, crashDmg(speed) * crashMul(sim), by, 'impact', { via: 'crash', kick });
  if (h.dead && by && !kick && by.role === 'guard' && behaviourOfBot(by).cannonCrashes) sim.deed('guard', 'cannonKill'); // a Cannoneer's crash is his kill
  if (!h.dead) sim.engine.apply(h, 'staggered', { by: c });
  sim.engine.emit({ kind: 'crash', self: c, target: h, via: 'crash', amount: crashDmg(speed) * crashMul(sim) });
  sim.events.push({ e: 'crash', x: h.x, y: h.y, dmg: crashDmg(speed), what: 'foe' });
  sim.drainFx();
}

/** The Open Door (P52, the Kicker's gift): a kicked body breaks any wall or prop it hits, whatever its health ("A wall is a door"). */
const openDoor = (sim: Sim, kick: boolean) => kick && sim.perks.has('openDoor');

/** True while a body is in the Open Door's flight (it broke a wall and is still bursting on). */
export const inDoor = (sim: Sim, f: Fling | undefined) => !!f && f.door !== undefined && sim.time < f.door;

/** The Open Door's burst: through the wall it broke the body keeps flying at least `speed`, a foe unsteered for `time` s. Returns the factor to scale its velocity by. */
function burst(sim: Sim, f: Fling, sp: number) {
  const D = PERK_FX.openDoor;
  f.door = sim.time + D.time;
  f.until = Math.max(f.until, f.door);
  return Math.max(sp * D.keep, D.speed) / (sp || 1);
}

/** What a flying body ran into at a point: a prop breaks (true if it did) and takes crash damage; rock only rings. A kicked body with the Open Door always breaks it. */
function hitSurface(sim: Sim, x: number, y: number, speed: number, by: Bot | null, kick = false): boolean {
  const prop = solidAt(sim, x, y);
  sim.events.push({ e: 'crash', x, y, dmg: crashDmg(speed), what: prop ? 'prop' : 'rock' });
  sim.noise(x, y);
  if (!prop) return false;
  return hitProp(sim, prop, openDoor(sim, kick) ? prop.hp + 1 : crashDmg(speed) * CRASH.prop * crashMul(sim), { by, via: 'crash' });
}

/** A foe struck by a flying body: both take the crash, and the foe is sent on with its share of the speed. */
function strike(sim: Sim, from: { vx: number; vy: number }, at: { x: number; y: number }, o: Hornet, speed: number, f: Fling, by: Bot | null) {
  const d = dist(at.x, at.y, o.x, o.y) || 1;
  crashFoe(sim, o, speed, by, f.kick);
  if (o.dead) return;
  if (!sim.engine.flag(o, 'steady') || sim.stunned(o)) {
    const k = bossKnock(o) * speed * CRASH.share;
    o.vx += ((o.x - at.x) / d) * k;
    o.vy += ((o.y - at.y) / d) * k;
    o.fling = { ...flingOf(sim, by, f.kick), hit: [...f.hit] };
  }
  from.vx *= 1 - CRASH.share;
  from.vy *= 1 - CRASH.share;
}

/** Each step: every foe, robot and prop sent flying moves and crashes. */
export function crashStep(sim: Sim, dt: number) {
  const k = Math.exp(-CRASH.friction * dt);
  for (const h of sim.hornets) {
    const f = h.fling;
    if (!f) continue;
    const door = inDoor(sim, f);
    if (door) {
      h.vx *= Math.exp(-PERK_FX.openDoor.friction * dt);
      h.vy *= Math.exp(-PERK_FX.openDoor.friction * dt);
    }
    const sp = Math.hypot(h.vx, h.vy);
    if (h.dead || sim.time > f.until || (sp < CRASH.min && !door)) {
      h.fling = undefined;
      continue;
    }
    const by = sim.bot(f.by);
    if (sim.blocked(h.x, h.y)) {
      // Into rock, a wall, a crate: back out of it, and crash.
      const hx = h.x, hy = h.y;
      h.x -= h.vx * dt;
      h.y -= h.vy * dt;
      crashFoe(sim, h, sp, by, f.kick);
      const broke = hitSurface(sim, hx, hy, sp, by, f.kick);
      if (broke && !h.dead) {
        h.x = hx;
        h.y = hy;
        const keep = openDoor(sim, f.kick) ? burst(sim, f, sp) : 0.5; // the Open Door bursts through; any other broken prop slows it
        h.vx *= keep;
        h.vy *= keep;
      } else {
        h.vx = h.vy = 0;
        h.fling = undefined;
      }
      continue;
    }
    for (const o of sim.hornets) {
      if (o === h || o.dead || o.under || o.air || f.hit.includes(o.id) || dist(h.x, h.y, o.x, o.y) > h.r + o.r) continue;
      f.hit.push(o.id);
      crashFoe(sim, h, sp, by, f.kick);
      strike(sim, h, h, o, sp, f, by);
      break;
    }
  }
  for (const b of sim.bots) {
    const f = b.fling;
    if (!f) continue;
    const door = inDoor(sim, f);
    const sp = Math.hypot(f.vx, f.vy);
    if (b.dead || sim.time > f.until || (sp < 60 && !door)) {
      b.fling = undefined;
      continue;
    }
    const by = sim.bot(f.by);
    const nx = b.x + f.vx * dt, ny = b.y + f.vy * dt;
    if (sim.blocked(nx, ny)) {
      const broke = sp >= CRASH.min && hitSurface(sim, nx, ny, sp, by, f.kick);
      if (broke && openDoor(sim, f.kick) && !sim.blocked(nx, ny)) {
        // The Open Door: a robot kicked at a wall bursts through it like a foe (`burst`).
        const m = burst(sim, f, sp);
        f.vx *= m;
        f.vy *= m;
        b.x = nx;
        b.y = ny;
        continue;
      }
      b.fling = undefined;
      continue;
    }
    b.x = nx;
    b.y = ny;
    const kb = door ? Math.exp(-PERK_FX.openDoor.friction * dt) : k;
    f.vx *= kb;
    f.vy *= kb;
    if (sp < CRASH.min && !door) continue;
    for (const o of sim.hornets) {
      if (o.dead || o.under || o.air || f.hit.includes(o.id) || dist(b.x, b.y, o.x, o.y) > ROLES[b.role].r + o.r) continue;
      f.hit.push(o.id);
      sim.deed(b.role, 'kickCrash');
      // Quests (P38): a kicked robot into a boss, and the most foes one kicked robot has struck.
      if (o.boss) sim.stats.botBossKicks = (sim.stats.botBossKicks ?? 0) + 1;
      sim.stats.bowl = Math.max(sim.stats.bowl ?? 0, f.hit.length);
      strike(sim, f, b, o, sp, f, by);
      // Bowling Season (a punch card): the kicked robot Staggers what it hit, and is Braced a while.
      if (sim.engine.source(sim.controller, 'card:bowlingSeason')) {
        sim.engine.apply(o, 'staggered', { by: sim.controller });
        sim.engine.apply(b, 'braced', { duration: BOWLING_BRACE });
      }
      break;
    }
  }
  for (const p of sim.props.list) {
    const f = p.fling;
    if (!f || p.broken) continue;
    const sp = Math.hypot(p.vx, p.vy);
    if (p.primed === undefined && p.rocket !== undefined) {
      p.rocket -= dt;
      if (p.rocket <= 0) {
        p.vx = p.vy = 0;
        hitProp(sim, p, p.hp + 1, { by: sim.bot(f.by) });
        continue;
      }
    } else {
      p.vx *= k;
      p.vy *= k;
    }
    if (sp < 40 || sim.time > f.until + (p.rocket !== undefined ? CRASH.flight : 0)) {
      p.fling = undefined;
      continue;
    }
    const by = sim.bot(f.by);
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    const bang = (x: number, y: number) => {
      // What goes off bursts on whatever it meets (a rocket, a rolling barrel); the rest takes the crash like any prop.
      const broke = hitSurface(sim, x, y, Math.max(sp, CRASH.min), by);
      hitProp(sim, p, PROPS[p.kind].fx?.burst ? p.hp + 1 : crashDmg(Math.max(sp, CRASH.min)), { by, via: 'crash' });
      p.vx = p.vy = 0;
      p.fling = undefined;
      return broke;
    };
    if (sim.blocked(nx, ny)) {
      if (sp >= CRASH.min * 0.6) bang(nx, ny);
      else p.fling = undefined;
      continue;
    }
    p.x = nx;
    p.y = ny;
    p.tx = Math.floor(nx / T);
    p.ty = Math.floor(ny / T);
    if (sp < CRASH.min * 0.6) continue;
    // Into another body in the open (a barrel into a barrel): both take the crash.
    const other = sim.props.list.find((q) => q !== p && !q.broken && q.primed === undefined && PROPS[q.kind].kickable && dist(p.x, p.y, q.x, q.y) < p.r + q.r);
    if (other) {
      hitProp(sim, other, PROPS[other.kind].fx?.burst ? other.hp + 1 : crashDmg(Math.max(sp, CRASH.min)) * CRASH.prop, { by, via: 'crash' });
      hitProp(sim, p, PROPS[p.kind].fx?.burst ? p.hp + 1 : crashDmg(Math.max(sp, CRASH.min)), { by, via: 'crash' });
      p.vx = p.vy = 0;
      p.fling = undefined;
      continue;
    }
    for (const o of sim.hornets) {
      if (o.dead || o.under || o.air || f.hit.includes(o.id) || dist(p.x, p.y, o.x, o.y) > p.r + o.r) continue;
      f.hit.push(o.id);
      strike(sim, p, p, o, Math.max(sp, CRASH.min), f, by);
      hitProp(sim, p, PROPS[p.kind].fx?.burst ? p.hp + 1 : crashDmg(Math.max(sp, CRASH.min)), { by, via: 'crash' });
      break;
    }
  }
}
