/**
 * D-city air support: the plan of a call and where its shadow is (pure), and the Sim's side of it: `callSupport`, `supportStep`, `impact`.
 * Add a call: a `SupportId` and a `SUPPORT` entry (defs/support.ts); a new `kind` needs its effect in `impact` and its plan here.
 */

import type { Rng } from '../../../../harness/kit/rng';
import {
  damageHornet,
  damageNest,
  untouchable,
} from './combat';
import {
  type BarrageDef,
  NEST,
  SUPPORT,
  type SupportId,
} from './defs';
import { dist } from './geom';
import { say } from './oracle';
import { PERK_FX } from './perks';
import { blastProps } from './props';
import type { Sim } from './sim';

export type SupportEvent =
  /** D-city air support: a call is made, enters a phase, or is over; `shell` is one blast landing (`hits` machines struck). */
  | { e: 'support'; what: 'call' | StrikePhase | 'end'; strike: Strike }
  | { e: 'shell'; x: number; y: number; r: number; hits: number; i: number; n: number; kind?: 'barrage' | 'lance' | 'drop' };

export type StrikePhase = 'tell' | 'hold' | 'fall' | 'leave';
export interface Shell {
  x: number;
  y: number;
  /** Strike seconds at which it lands. */
  at: number;
  done: boolean;
}
/** A call in progress: the shadow slides in (`tell`), hangs over the target (`hold`), the shells fall, the shadow leaves. */
export interface Strike {
  id: SupportId;
  x: number;
  y: number;
  t: number;
  phase: StrikePhase;
  shells: Shell[];
}

const golden = Math.PI * (3 - Math.sqrt(5));

/**
 * A call's plan by its kind: a barrage's disc, a lance's line through the mark along the aim (from (fx, fy), the
 * Communicator, through (x, y)), a drop's few points round the mark.
 */
export function planStrike(id: SupportId, d: BarrageDef, x: number, y: number, r: Rng, fx = x, fy = y + 1): Strike {
  if (d.kind === 'barrage') return { ...planBarrage(d, x, y, r), id };
  const a = Math.atan2(y - fy, x - fx);
  const shells = Array.from({ length: d.shells }, (_, i): Shell => {
    if (d.kind === 'lance') {
      // From the near end to the far one, in order: a wall of steam rolling along the line.
      const u = d.shells > 1 ? i / (d.shells - 1) : 0.5;
      const along = (u * 2 - 1) * d.radius;
      return { x: x + Math.cos(a) * along, y: y + Math.sin(a) * along, at: d.tell + d.hold + u * d.fall, done: false };
    }
    const ang = (i / d.shells) * Math.PI * 2 + r.range(-0.3, 0.3);
    return { x: x + Math.cos(ang) * d.radius, y: y + Math.sin(ang) * d.radius * 0.7, at: d.tell + d.hold + (i / d.shells) * d.fall, done: false };
  });
  return { id, x, y, t: 0, phase: 'tell', shells };
}

/** Shells spread evenly over the disc (a sunflower pattern, nudged), landing in a shuffled order across `fall` seconds. */
export function planBarrage(d: BarrageDef, x: number, y: number, r: Rng): Strike {
  const order = Array.from({ length: d.shells }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = r.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const shells = order.map((k, slot): Shell => {
    const rad = d.radius * Math.sqrt((k + 0.5) / d.shells) + r.range(-10, 10);
    const a = k * golden + r.range(-0.2, 0.2);
    return { x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad * 0.8, at: d.tell + d.hold + (slot / d.shells) * d.fall + r.range(0, 0.05), done: false };
  });
  return { id: 'barrage', x, y, t: 0, phase: 'tell', shells };
}

export const strikePhase = (d: BarrageDef, t: number): StrikePhase =>
  t < d.tell ? 'tell' : t < d.tell + d.hold ? 'hold' : t < d.tell + d.hold + d.fall ? 'fall' : 'leave';

/** The strike is over once the shadow has left. */
export const strikeEnd = (d: BarrageDef) => d.tell + d.hold + d.fall + d.leave;

/** The zeppelin's shadow: where (the centre), how dark (0..1), and the heading it flies. */
export function shadowPose(d: BarrageDef, s: Strike) {
  const { heading, travel, creep } = d.shadow;
  const dx = Math.cos(heading), dy = Math.sin(heading);
  const t = s.t;
  const settled = d.tell + d.hold + d.fall;
  let along = 0; // px along the heading from the target
  let a = 1;
  if (t < d.tell) {
    const k = t / d.tell;
    along = -travel * (1 - k) ** 3; // glides in, slowing as it arrives
    a = Math.min(1, t / 0.7);
  } else if (t < settled) along = (t - d.tell) * creep;
  else {
    const k = (t - settled) / d.leave;
    along = (settled - d.tell) * creep + k * k * travel * 0.6;
    a = Math.max(0, 1 - k);
  }
  return { x: s.x + dx * along, y: s.y + dy * along, a, heading };
}

/**
 * Call D-city air support onto the ground at (x, y), kept within the call's range of the Communicator. Returns null when
 * the call goes out, else why it did not.
 */
export function callSupport(sim: Sim, id: SupportId, x: number, y: number): string | null {
  const d = SUPPORT[id];
  if (!d || sim.support[id] === undefined) return 'no such call';
  if (!sim.lessons.open('barrage')) return 'not taught yet'; // the Oracle asks for it on mission 4 (lessons.ts)
  if (sim.phase === 'rising' || sim.phase === 'done' || sim.phase === 'lost') return 'the lift is rising';
  if (sim.strike) return 'a call is already on its way';
  if (!(sim.support[id]! > 0)) return 'spent: the Wanderer reloads at the hub';
  const c = sim.controller;
  const k = Math.min(1, (d.range * (sim.perks.has('zepMast') ? PERK_FX.zepMast : 1)) / (dist(x, y, c.x, c.y) || 1));
  sim.support[id]! -= 1;
  sim.stats.strikes++;
  sim.strike = planStrike(id, d, c.x + (x - c.x) * k, c.y + (y - c.y) * k, sim.r, c.x, c.y);
  sim.events.push({ e: 'support', what: 'call', strike: sim.strike });
  sim.lessons.did('barrage');
  if (d.kind === 'barrage') say(sim, 'support-call', 'The Wanderer copies. Shells on the mark in a few seconds. Our gunners aim by faith, and faith only hits modern tech: stand where you like.', 'warn');
  else if (d.kind === 'lance') say(sim, 'lance-call', 'The Wanderer opens its boilers along your aim. Stand aside from the line if you like your paint.', 'warn');
  else say(sim, 'drop-call', 'Brass Guards on the ropes. They are yours for a minute; then I want them back, polished.', 'warn');
  return null;
}

export function supportStep(sim: Sim, dt: number) {
  const st = sim.strike;
  if (!st) return;
  const d = SUPPORT[st.id];
  st.t += dt;
  const phase = strikePhase(d, st.t);
  if (phase !== st.phase) {
    st.phase = phase;
    sim.events.push({ e: 'support', what: phase, strike: st });
  }
  st.shells.forEach((sh) => {
    if (sh.done || st.t < sh.at) return;
    sh.done = true;
    impact(sim, d, sh.x, sh.y, st.shells.filter((x) => x.done).length - 1, st.shells.length);
  });
  if (st.t >= strikeEnd(d)) {
    sim.events.push({ e: 'support', what: 'end', strike: st });
    sim.strike = null;
  }
}

/** One shell lands: every machine in the blast takes the damage and is shoved out; your robots are never hurt. */
export function impact(sim: Sim, d: (typeof SUPPORT)[SupportId], x: number, y: number, i: number, n: number) {
  let hits = 0;
  sim.noise(x, y);
  if (d.kind === 'drop') {
    // A Brass Guard down on its rope where the shell would have fallen; whatever stood there is shoved aside.
    for (const h of sim.hornets) {
      const gap = dist(x, y, h.x, h.y);
      if (h.dead || h.boss || gap > d.blast + h.r || untouchable(sim, h)) continue;
      h.vx += ((h.x - x) / (gap || 1)) * d.knock;
      h.vy += ((h.y - y) / (gap || 1)) * d.knock;
    }
    const b = sim.addBot('guard', `Brass Guard ${i + 1}`, x, y, 0);
    b.ttl = d.guards?.ttl ?? 60;
    sim.events.push({ e: 'joined', bot: b });
    sim.events.push({ e: 'shell', x, y, r: d.blast, hits: 0, i, n, kind: 'drop' });
    return;
  }
  const shellMul = (sim.perks.has('bigShells') ? PERK_FX.bigShells : 1) * (sim.perks.has('zepBoilers') ? PERK_FX.zepBoilers : 1);
  for (const h of [...sim.hornets]) {
    const gap = dist(x, y, h.x, h.y);
    if (h.dead || gap > d.blast + h.r || untouchable(sim, h)) continue;
    hits++;
    const k = ((h.boss ? 0.15 : 1) * d.knock) / (gap || 1);
    h.vx += (h.x - x) * k;
    h.vy += (h.y - y) * k;
    h.cd = Math.max(h.cd, 0.6);
    damageHornet(sim, h, d.dmg * shellMul * (h.boss ? d.boss : 1), null, d.type ?? 'impact');
  }
  for (const nest of sim.nests) {
    if (nest.dead || dist(x, y, nest.x, nest.y) > d.blast + NEST.r) continue;
    hits++;
    damageNest(sim, nest, d.dmg * shellMul, null, d.type ?? 'impact');
  }
  for (const s of sim.shots) if (s.foe && dist(x, y, s.x, s.y) < d.blast) s.dead = true; // a boss's bolts burn up in it
  blastProps(sim, x, y, d.blast, d.dmg * shellMul); // cover and crates go too
  sim.events.push({ e: 'shell', x, y, r: d.blast, hits, i, n, kind: d.kind });
}

/** `summary().support`: the charges left and the call in the air. */
export function supportSummary(sim: Sim) {
  const st = sim.strike;
  return {
    charges: { ...sim.support },
    strike: st && {
      id: st.id,
      phase: st.phase,
      t: +st.t.toFixed(2),
      x: Math.round(st.x),
      y: Math.round(st.y),
      shells: `${st.shells.filter((x) => x.done).length}/${st.shells.length}`,
    },
  };
}
