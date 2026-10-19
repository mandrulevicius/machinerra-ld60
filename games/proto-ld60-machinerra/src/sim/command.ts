/**
 * Commanding crews from the main view (command mode, `commandmode.ts`) and the map (`mapview.ts`): one control set for
 * both. What is selected, groups, picking and the order a right click gives. Plain TS, no Phaser. A group IS a crew:
 * `1..CREWS-1` select crew n, Shift+n puts the selection into crew n, and `0` is crew 0, the robots that walk with the
 * Communicator. The map and the main view share one `Selection`, so a pick made in either shows in both.
 * An order goes to the robots picked (P3): a crew picked whole gets a crew order (`Sim.order`); robots picked from a crew
 * in part (or from crew 0) get their own order (`Bot.own`, `orderBots`), keep their crew and its colour, and the rest of
 * the crew keeps the crew's order. Giving them back (`rejoin`, or Shift+n / the map's crew boxes, which `assign`) ends it.
 * An order on the Communicator himself (a `comm` target in `orderSelection`) is the follow order: the crew trails him like
 * crew 0 until its next point (`Sim.follow`, `Sim.following`, `Sim.follows(bot)`; dev `follow <crew>`); a part of a crew
 * picked follows him on its own (`own: 'follow'`).
 */
import { CREWS, NEST } from './defs';
import { noteBots, orderPoint } from './botai';
import type { Bot, Sim } from './sim';
import type { Spot } from './mapgen';

/** The robots picked (by id) and the crew a map click sends. */
export class Selection {
  ids = new Set<number>();
  crew = 1;
}

/** The wheel zooms between these; the painted art (and the lit 2x ground) is sharp to about 1.5. */
export const ZOOM = { min: 0.6, max: 1.5, start: 1 };
export const clampZoom = (z: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, z));
/** One wheel notch (deltaY about 100) is about 12%. */
export const wheelZoom = (z: number, deltaY: number) => clampZoom(z * Math.exp(-deltaY * 0.0012));

/** Where a robot is picked: its body, not its feet (`lift` px up; the map picks its dot, 0). */
const body = (b: Bot, lift = 18) => ({ x: b.x, y: b.y - lift });

export const crewIds = (sim: Sim, crew: number) => sim.crew.filter((b) => b.crew === crew).map((b) => b.id);

/** The crew robot nearest the point within `r` px, if any. */
export function pickBot(sim: Sim, x: number, y: number, r: number, lift = 18): Bot | null {
  let best: Bot | null = null;
  let bd = r;
  for (const b of sim.crew) {
    const p = body(b, lift);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

/** Crew robots whose body is inside the rectangle (any two corners). */
export function boxBots(sim: Sim, x0: number, y0: number, x1: number, y1: number, lift = 18): number[] {
  const [l, r] = [Math.min(x0, x1), Math.max(x0, x1)];
  const [t, b] = [Math.min(y0, y1), Math.max(y0, y1)];
  return sim.crew.filter((o) => {
    const p = body(o, lift);
    return p.x >= l && p.x <= r && p.y >= t && p.y <= b;
  }).map((o) => o.id);
}

/** Forget the fallen and anyone who is no longer a crew robot. */
export function prune(sim: Sim, sel: Selection) {
  for (const id of sel.ids) if (!sim.crew.some((b) => b.id === id)) sel.ids.delete(id);
}

/** Select a group (crew n). False when there is no such crew or nobody in it; the selection is then left alone. */
export function selectGroup(sim: Sim, sel: Selection, n: number): boolean {
  if (n < 0 || n >= CREWS) return false;
  const ids = crewIds(sim, n);
  if (!ids.length) return false;
  sel.ids = new Set(ids);
  sel.crew = Math.max(1, n);
  return true;
}

/** Put the selection into crew n (it joins that crew's orders, as a drag on the map does). Returns how many moved; 0 when n is no crew. */
export function assignGroup(sim: Sim, sel: Selection, n: number): number {
  if (n < 0 || n >= CREWS) return 0;
  prune(sim, sel);
  for (const id of sel.ids) sim.assign(id, n);
  if (sel.ids.size) sel.crew = Math.max(1, n);
  return sel.ids.size;
}

/** What a right click lands on. A hive counts once awake or seen; `ground` is anywhere else. */
export interface Target {
  kind: 'hornet' | 'nest' | 'ruin' | 'lift' | 'ground' | 'comm';
  x: number;
  y: number;
}

/** What is under (x, y), within `slack` extra px (bigger when zoomed out, so small things stay easy to hit). */
export function targetAt(sim: Sim, x: number, y: number, seen: ReadonlySet<number>, slack = 0): Target {
  const near = (px: number, py: number, r: number) => Math.hypot(px - x, py - y) <= r + slack;
  const c = sim.controller;
  if (!c.dead && Math.hypot(c.x - x, c.y - 18 - y) <= 34 + slack) return { kind: 'comm', x: c.x, y: c.y };
  for (const h of sim.hornets) if (!h.dead && near(h.x, h.y - 18, h.r + 10)) return { kind: 'hornet', x: h.x, y: h.y };
  for (const n of sim.nests) if (!n.dead && (n.awake || seen.has(n.id)) && near(n.x, n.y - 20, NEST.r * n.scale + 10)) return { kind: 'nest', x: n.x, y: n.y };
  for (const r of sim.ruins) if (!r.searched && near(r.x, r.y - 14, 40)) return { kind: 'ruin', x: r.x, y: r.y };
  if (near(sim.lift.x, sim.lift.y, 70)) return { kind: 'lift', x: sim.lift.x, y: sim.lift.y };
  return { kind: 'ground', x, y };
}

/** Where a robot is sent now (its own point, its crew's, or the Communicator it trails), for the order lines; null when it holds. */
export function orderOf(sim: Sim, b: Bot): Spot | null {
  if (sim.follows(b)) return b.crew === 0 && !b.own ? null : sim.controller;
  return orderPoint(sim, b);
}

/** Has any order been given: a crew sent or following him, or a robot sent on its own (level 1's lesson waits for one). */
export const anyOrder = (sim: Sim) => sim.orders.some((o) => o) || sim.following.some((f) => f) || sim.crew.some((b) => b.own && b.own !== 'follow');

/** Does this robot have its own order (P3), apart from its crew's? */
export const alone = (b: Bot) => !!b.own;

/** Robots on their own orders sent to points (not following him), for the flags. */
export function ownPoints(sim: Sim): { at: Spot; bots: Bot[] }[] {
  const out = new Map<Spot, Bot[]>();
  for (const b of sim.crew) if (b.own && b.own !== 'follow') out.set(b.own, [...(out.get(b.own) ?? []), b]);
  return [...out].map(([at, bots]) => ({ at, bots }));
}

/**
 * Send these robots on their own (P3): to a point (one shared spot, so they stand in one formation), or to follow him.
 * Their crew and its order stay as they are. Crew 0 robots told to follow are simply given back (they already walk with him).
 */
export function orderBots(sim: Sim, ids: number[], x: number, y: number, follow = false): Bot[] {
  const bots = ids.map((id) => sim.bot(id)).filter((b): b is Bot => !!b && b.role !== 'controller');
  if (sim.dungeon || !bots.length) return [];
  const at = follow ? 'follow' : sim.passableNear(x, y);
  for (const b of bots) {
    if (follow && b.crew === 0) delete b.own;
    else b.own = at;
    b.path = [];
  }
  noteBots(sim, bots);
  const lift = at !== 'follow' && sim.onLift(at, 0.5);
  sim.bark(sim.r.pick(bots), lift ? 'evac' : 'order', true);
  return bots;
}

/** Give robots back to their crew's order (their own order ends). Returns how many had one. */
export function rejoin(sim: Sim, ids: Iterable<number>): number {
  const bots = [...ids].map((id) => sim.bot(id)).filter((b): b is Bot => !!b && !!b.own);
  for (const b of bots) {
    delete b.own;
    b.path = [];
  }
  noteBots(sim, bots);
  return bots.length;
}

export interface OrderResult {
  /** The crews sent whole. */
  sent: number[];
  /** The robots sent on their own (their crew stays as it was). */
  alone: number[];
  /** Why nothing went. */
  why?: string;
}

/**
 * Send the selection to a point. A crew (1..) picked whole is sent as a crew, and any of its robots on their own rejoin
 * it. Robots picked from a crew in part, or from crew 0 (who walk with you), go on their own (`orderBots`): they keep
 * their crew, and the rest of it keeps its order. `follow` (a right click on the Communicator) has the crews trail him
 * instead; picked crew-0 robots are given back (they walk with him already).
 */
export function orderSelection(sim: Sim, sel: Selection, x: number, y: number, follow = false): OrderResult {
  prune(sim, sel);
  const byCrew = new Map<number, number[]>();
  for (const id of sel.ids) {
    const c = sim.bot(id)!.crew;
    byCrew.set(c, [...(byCrew.get(c) ?? []), id]);
  }
  if (!byCrew.size) return { sent: [], alone: [], why: 'Nobody is selected.' };
  if (follow && [...sel.ids].every((id) => sim.bot(id)!.crew === 0 && !sim.bot(id)!.own)) return { sent: [], alone: [], why: 'Already walking with you.' };
  const sent: number[] = [];
  const rest: number[] = [];
  for (const [c, ids] of byCrew) {
    if (c > 0 && ids.length === crewIds(sim, c).length) {
      rejoin(sim, ids);
      (follow ? sim.follow(c) : sim.order(c, x, y));
      sent.push(c);
    } else rest.push(...ids);
  }
  const alone = orderBots(sim, rest, x, y, follow).map((b) => b.id);
  if (sent.length) sel.crew = sent[sent.length - 1];
  return { sent, alone };
}
