import { distOf } from './sim/geom';
/**
 * Crew lamps under a light budget (pure; `LightView.lampPass` draws them). Every robot carries a lamp, but a real light costs
 * on the GPU and Phaser drops the lights past its cap by distance from the camera centre, so lamps at the screen's edge
 * pop in and out. Instead the budget is spent here: lamps close together become one light at their centre (a wider
 * radius, the same light in all), and when that is still too many the farthest from the focus go dark. LightView fades each
 * light toward what this says, so nothing pops.
 *
 *   const { spots } = chooseSpots(lamps, { view, budget, focus, prev });
 *   // each spot is one light, carried by its `lead` lamp's Light; every other lamp's Light fades to dark
 *
 * Lamps off screen cost nothing (Phaser culls them), so only spots whose circle reaches `view` count against the budget.
 */

/** Each role's lamp: colour, radius, intensity (a new role gets a line). */
export const LAMP: Record<string, [number, number, number]> = {
  controller: [0xffc070, 220, 0.55],
  gatherer: [0xffb050, 110, 0.3],
  guard: [0xffa040, 110, 0.3],
  repairer: [0x9fe0ff, 110, 0.35],
  mule: [0xffc890, 100, 0.28],
  marksman: [0xffb070, 120, 0.3],
  boilermancer: [0xff9a60, 110, 0.3],
  lamplighter: [0xfff0b0, 150, 0.45],
  stalker: [0x9fb0d0, 70, 0.12],
};

/** Lamps follow the dark (multiples of their base): faint in full day, the old dusk look at the start of the evening, much brighter and wider at midnight. */
const NIGHT_LAMP = { day: 0.3, dayRadius: 0.7, intensity: 2, radius: 0.8 };

/** How much brighter (`glow`) and wider (`wide`) every lamp burns at this night (0 bright .. 1 deep night). */
export const lampLook = (night: number) => ({ glow: NIGHT_LAMP.day + NIGHT_LAMP.intensity * night, wide: NIGHT_LAMP.dayRadius + NIGHT_LAMP.radius * night });

/** A lamp as its robot wants it: where, how wide and bright. `solo` lamps (the Communicator's) are never merged or dropped. */
export interface Lamp {
  id: number;
  x: number;
  y: number;
  r: number;
  i: number;
  solo?: boolean;
}

/** One light standing for `ids` (the lowest id is the `lead`, whose Light carries it). */
export interface Spot {
  lead: number;
  ids: number[];
  x: number;
  y: number;
  r: number;
  i: number;
  solo: boolean;
}

export interface Rect {
  x: number;
  y: number;
  right: number;
  bottom: number;
}

export const LAMPS = {
  /** Merge reach in lamp radii, widened step by step while the spots exceed the budget. */
  reach: [0.9, 1.4, 2],
  /** A lamp that was in a spot last frame stays in it out to this many times the reach (so a pair at the edge does not flicker). */
  stick: 1.35,
  /** A merged spot's radius is at most this many times its widest lamp. */
  grow: 2.6,
  /** A merged spot is at most this many times its brightest lamp. */
  boost: 2.2,
  /** A spot dimmer than this is not worth a light (full day: the crew's lamps barely show). */
  minI: 0.12,
};


/** Whether a spot's circle reaches the view. */
export function inView(s: { x: number; y: number; r: number }, v: Rect): boolean {
  const cx = Math.max(v.x, Math.min(s.x, v.right)), cy = Math.max(v.y, Math.min(s.y, v.bottom));
  return Math.hypot(s.x - cx, s.y - cy) < s.r;
}

/** Fold the lamps within `reach` of each other into spots. `prev` maps a lamp id to the lead it had last frame. */
export function mergeLamps(lamps: Lamp[], reach: number, prev?: ReadonlyMap<number, number>): Spot[] {
  const spots: Spot[] = [];
  const rest: Lamp[] = [];
  for (const l of lamps) {
    if (l.solo) spots.push({ lead: l.id, ids: [l.id], x: l.x, y: l.y, r: l.r, i: l.i, solo: true });
    else rest.push(l);
  }
  rest.sort((a, b) => a.id - b.id);
  const used = new Set<number>();
  for (const s of rest) {
    if (used.has(s.id)) continue;
    used.add(s.id);
    const group = [s];
    for (const c of rest) {
      if (used.has(c.id)) continue;
      if (distOf(c, s) <= reach * (prev?.get(c.id) === s.id ? LAMPS.stick : 1)) {
        used.add(c.id);
        group.push(c);
      }
    }
    spots.push(group.length === 1 ? { lead: s.id, ids: [s.id], x: s.x, y: s.y, r: s.r, i: s.i, solo: false } : fold(group));
  }
  return spots;
}

/** One spot for a group: at the lamps' weighted centre, wide enough to cover them, as much light in all as they gave. */
function fold(group: Lamp[]): Spot {
  let wsum = 0, x = 0, y = 0, energy = 0, rmax = 0, imax = 0;
  for (const l of group) {
    const w = l.i * l.r * l.r + 1e-6;
    wsum += w;
    x += l.x * w;
    y += l.y * w;
    energy += l.i * l.r * l.r;
    rmax = Math.max(rmax, l.r);
    imax = Math.max(imax, l.i);
  }
  x /= wsum;
  y /= wsum;
  let cover = 0;
  for (const l of group) cover = Math.max(cover, Math.hypot(l.x - x, l.y - y) + l.r * 0.7);
  const r = Math.min(Math.max(cover, rmax), rmax * LAMPS.grow);
  return { lead: group[0].id, ids: group.map((l) => l.id), x, y, r, i: Math.min(energy / (r * r), imax * LAMPS.boost), solo: false };
}

export interface Choice {
  spots: Spot[];
  /** The reach that fitted the budget (px). */
  reach: number;
  /** In-view spots that stayed lit. */
  lit: number;
}

/**
 * The spots to burn this frame: merge until the ones in view fit `budget`, then darken (`i = 0`) the farthest from
 * `focus` if they still do not. Spots too dim to matter go dark too. Solo spots always burn and count against the budget.
 */
export function chooseSpots(lamps: Lamp[], o: { view: Rect; budget: number; focus: { x: number; y: number }; prev?: ReadonlyMap<number, number> }): Choice {
  const crew = lamps.filter((l) => !l.solo);
  const mean = crew.length ? crew.reduce((a, l) => a + l.r, 0) / crew.length : 100;
  let spots: Spot[] = [];
  let reach = 0;
  for (const k of LAMPS.reach) {
    reach = k * mean;
    spots = mergeLamps(lamps, reach, o.prev);
    if (spots.filter((s) => inView(s, o.view)).length <= o.budget) break;
  }
  const bright = spots.filter((s) => s.solo || s.i >= LAMPS.minI);
  for (const s of spots) if (!s.solo && s.i < LAMPS.minI) s.i = 0;
  const seen = bright.filter((s) => inView(s, o.view));
  const room = Math.max(0, o.budget - seen.filter((s) => s.solo).length);
  const rest = seen.filter((s) => !s.solo).sort((a, b) => distOf(a, o.focus) - distOf(b, o.focus));
  for (const s of rest.slice(room)) s.i = 0;
  return { spots, reach, lit: seen.length - Math.max(0, rest.length - room) };
}

/** Ease `cur` toward `target` (exponential, `rate` per second): frame-rate independent. */
export const follow = (cur: number, target: number, dt: number, rate: number) => cur + (target - cur) * (1 - Math.exp(-dt * rate));
