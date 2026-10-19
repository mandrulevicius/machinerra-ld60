/**
 * The Hollow City's commute (P31; `docs/biomes.md` The Hollow City, Twists; numbers `COMMUTE` in `defs/twists.ts`): twice a day, at
 * the start of the day and of the evening, a rush hour: a crowd of Commuters walks a set route across the city for `COMMUTE.hold` s.
 * Harmless while nobody gets in their way: a walker is calm (`Hornet.calm`, so it hunts no one and the crews leave it be). Bump into
 * one (a robot of ours within `COMMUTE.bump` px) or hit one, and it and every Commuter of its crowd within `COMMUTE.turn` tiles turn on
 * whoever did it ("Excuse me!"). Walkers that reach the far edge go home (they leave the land). Events `commute`.
 */
import { COMMUTE, FOES, T } from './defs';
import { dist } from './geom';
import type { Bot, Hornet, Sim } from './sim';

export type CommuteEvent =
  | { e: 'commute'; what: 'start' | 'end'; n: number; x: number; y: number; x2: number; y2: number }
  | { e: 'commute'; what: 'turn'; h: Hornet; x: number; y: number };

export interface Rush { n: number; at: number; started?: boolean; done?: boolean; crowd: Hornet[]; from?: { x: number; y: number }; to?: { x: number; y: number } }

/** The rush hours of a city land: at the start of the day and of the evening (the source's two). */
export const rushHours = (at: { day: number; evening: number }): Rush[] => [at.day, at.evening].map((t, n) => ({ n, at: t, crowd: [] }));

/** Two points on opposite edges of the map, the line between them passing within `COMMUTE.near` tiles of him (so he sees the crowd). */
function route(sim: Sim) {
  const r = sim.tiers.r, c = sim.controller, W = sim.W * T, H = sim.H * T, m = COMMUTE.inset * T;
  const mid = { x: c.x + r.range(-1, 1) * COMMUTE.near * T, y: c.y + r.range(-1, 1) * COMMUTE.near * T };
  const a = r.range(0, Math.PI);
  const ux = Math.cos(a), uy = Math.sin(a);
  // March from the mid point both ways to the map's inset edge.
  const out = (s: number) => {
    const tx = ux * s > 0 ? (W - m - mid.x) / (ux * s) : ux * s < 0 ? (m - mid.x) / (ux * s) : Infinity;
    const ty = uy * s > 0 ? (H - m - mid.y) / (uy * s) : uy * s < 0 ? (m - mid.y) / (uy * s) : Infinity;
    const k = Math.max(0, Math.min(tx, ty));
    return { x: mid.x + ux * s * k, y: mid.y + uy * s * k };
  };
  return { from: out(-1), to: out(1) };
}

function start(sim: Sim, R: Rush) {
  const { from, to } = route(sim);
  R.from = from;
  R.to = to;
  const len = dist(from.x, from.y, to.x, to.y);
  // They walk at their own pace, or a little faster when the route would outlast the rush hour.
  const speed = Math.max(FOES.commuter.speed * COMMUTE.pace, len / COMMUTE.hold);
  const ux = (to.x - from.x) / (len || 1), uy = (to.y - from.y) / (len || 1);
  for (let i = 0; i < COMMUTE.crowd; i++) {
    // A loose column: a few abreast, staggered back along the route.
    const back = (i / COMMUTE.crowd) * COMMUTE.spread * T, side = sim.tiers.r.range(-1, 1) * COMMUTE.width * T;
    const x = from.x - ux * back - uy * side, y = from.y - uy * back + ux * side;
    const h = sim.spawnHornet(x, y, 0, false, false, 'commuter', { menacing: false });
    h.calm = { x: to.x - uy * side, y: to.y + ux * side, speed };
    h.commute = R.n;
    R.crowd.push(h);
  }
  sim.events.push({ e: 'commute', what: 'start', n: R.n, x: from.x, y: from.y, x2: to.x, y2: to.y });
  sim.say(`rush-${R.n}`, R.n === 0 ? 'Rush hour. A crowd of commuters is coming through, late for work. Stay out of their way and they will not even see you. Bump one and the whole crowd takes it personally.' : 'The evening rush. Another crowd going home. Mind your elbows.', 'warn');
}

/** It and the walkers of its crowd within `COMMUTE.turn` tiles turn on `who`. */
export function turnCrowd(sim: Sim, h: Hornet, who: Bot | null) {
  if (h.commute === undefined) return;
  const R = sim.rush.find((r) => r.n === h.commute);
  for (const o of R?.crowd ?? [h]) {
    if (o.dead || !o.calm || dist(o.x, o.y, h.x, h.y) > COMMUTE.turn * T) continue;
    o.calm = undefined;
    o.commute = undefined;
    if (who) o.target = who.id;
    sim.events.push({ e: 'commute', what: 'turn', h: o, x: o.x, y: o.y });
  }
  sim.say('rush-turned', 'Now you have done it. They are late, and now they are cross.', 'warn');
}

/** Each step on a city land: the rush hours come, the walkers walk, a bump turns a crowd, the ones home leave. */
export function commuteStep(sim: Sim) {
  if (!sim.rush.length) return;
  for (const R of sim.rush) {
    if (!R.started && sim.dayT >= R.at) {
      R.started = true;
      start(sim, R);
    }
    if (!R.started || R.done) continue;
    let left = 0;
    for (const h of R.crowd) {
      if (h.dead || h.commute !== R.n || !h.calm) continue;
      left++;
      // Home: at the far edge it leaves the land.
      if (dist(h.x, h.y, h.calm.x, h.calm.y) < COMMUTE.home * T) {
        h.dead = true;
        h.hp = 0;
        h.calm = undefined;
        sim.gone.push(h);
        continue;
      }
      const bump = sim.bots.find((b) => !b.dead && !b.hidden && dist(b.x, b.y, h.x, h.y) < COMMUTE.bump + h.r);
      if (bump) turnCrowd(sim, h, bump);
    }
    if (!left) {
      R.done = true;
      sim.events.push({ e: 'commute', what: 'end', n: R.n, x: R.to!.x, y: R.to!.y, x2: R.to!.x, y2: R.to!.y });
    }
  }
}

/** Dev `rush`: a rush hour now. */
export function rushNow(sim: Sim) {
  const R: Rush = { n: sim.rush.length + 10, at: sim.dayT, crowd: [] };
  sim.rush.push(R);
  R.started = true;
  start(sim, R);
  return R;
}

export const rushSummary = (sim: Sim) => sim.rush.map((R) => `${R.n}: at ${Math.round(R.at)}${R.started ? `, ${R.crowd.filter((h) => !h.dead && h.calm).length} walking, ${R.crowd.filter((h) => !h.dead && !h.calm).length} cross` : ''}${R.done ? ', done' : ''}`);
