/**
 * The places' shared mechanics (P36; letters as in `docs/places.md`'s shared list), each built once so any place's
 * behaviour (`placeplay.ts`) can use it. Plain TS, tests in `placeparts.test.ts`. Numbers in `PLACE_PARTS` (defs/sites.ts).
 *
 *   A  sleeping foes owned by a place: `sleepFoe` lays one down; it stands still (`foes.ts` `fly`) until a hit
 *      (`combat.ts` `damageHornet`) or a noise within `PLACE_PARTS.sleep.noise` tiles (`Sim.noise`) wakes it (`wakeFoe`)
 *   B  a lure: `lure` starts a place's alarm (the car alarm's zone, `props.ts`: every foe in reach with no one to hunt
 *      walks to it) that lasts until `unlure`; `r` sets nearby or land-wide
 *   C  carryable props (`PROPS[...].carry`): `pickUpProp`, `putDownProps`, `carryPropStep` (60% speed as with a downed
 *      robot, no guns: `controller.ts`, the kick works); `pressUse` picks up and puts down. Crew carry is not built (P3
 *      owns orders): an open question in `open-decisions.md`
 *   D  kickable props: P39's `kickable` flag (`crash.ts`); here only hardpan, where a kicked thing goes farther (`slide`)
 *   F  a turning beam: `onBeam` (pure) and `beamSweep` (what it crosses: the fog revealed, foes handed to a callback)
 *   H  walkers to the lift: `walkToLift` (the Lost Expedition's husks shuffle there by themselves), `onLiftNow`
 *   L  a stacking mission modifier: `stackMods` multiplies `Sim.mods` (spawns, elites, loot) for the rest of the mission;
 *      read by `foes.ts` (hives, the boss's cache), `spider.ts` (rim arrivals), `tiers.ts` (`eliteChance`), `loot.ts`
 */
import { PLACE_PARTS, PROPS, T } from './defs';
import { carrySpeed } from './downed';
import { dist } from './geom';
import { Ter, type Spot } from './mapgen';
import { addZone, type Prop, type Zone } from './props';
import type { PlaceId } from './places';
import type { Sim } from './sim';
import type { Bot, Hornet } from './types';

// ---------------------------------------------------------------- A: sleeping foes

/** Lay a foe down asleep, owned by a place: it stands where it is until woken. */
export function sleepFoe(h: Hornet, place: PlaceId) {
  h.sleep = place;
  h.target = 0;
  h.vx = h.vy = 0;
}

/** Wake a sleeping foe (a hit, a noise, its place's own rule). */
export function wakeFoe(sim: Sim, h: Hornet) {
  if (!h.sleep || h.dead) return;
  const place = h.sleep;
  h.sleep = undefined;
  sim.events.push({ e: 'place', id: place, what: 'wake', x: h.x, y: h.y });
}

/** A noise at (x, y): every sleeper within `PLACE_PARTS.sleep.noise` tiles wakes. */
export function wakeNear(sim: Sim, x: number, y: number) {
  for (const h of sim.hornets) if (h.sleep && !h.dead && dist(h.x, h.y, x, y) < PLACE_PARTS.sleep.noise * T) wakeFoe(sim, h);
}

// ---------------------------------------------------------------- B: a lure

/** A place's alarm at (x, y): every foe within `r` px with no one to hunt walks to it, until `unlure`. */
export function lure(sim: Sim, x: number, y: number, r: number): Zone | null {
  return addZone(sim, 'alarm', x, y, r, Infinity);
}

/** The alarm stops (it wears off at the next step). */
export function unlure(z: Zone | null | undefined) {
  if (z) z.life = 0;
}

// ---------------------------------------------------------------- C: carrying props

/** What `c` carries (props only; downed robots are `downed.ts`). */
export const carriedProps = (sim: Sim, c: Bot) => sim.props.list.filter((p) => p.carriedBy === c.id && !p.broken);

/** A carryable prop lying within reach of (x, y), the nearest. */
export function propToCarry(sim: Sim, x: number, y: number, r = PLACE_PARTS.carry.reach): Prop | null {
  let best: Prop | null = null, bd = r;
  for (const p of sim.props.list) {
    if (p.broken || p.carriedBy !== undefined || !PROPS[p.kind].carry) continue;
    const d = dist(x, y, p.x, p.y);
    if (d <= bd) (bd = d), (best = p);
  }
  return best;
}

/** `c` picks a carryable prop up: it rides on him. */
export function pickUpProp(sim: Sim, c: Bot, p: Prop) {
  if (p.broken || !PROPS[p.kind].carry) return;
  p.carriedBy = c.id;
  p.vx = p.vy = 0;
  p.fling = undefined;
  sim.events.push({ e: 'prop', what: 'carry', p });
}

/** `c` puts down whatever props it carries, beside it. */
export function putDownProps(sim: Sim, c: Bot) {
  for (const p of carriedProps(sim, c)) {
    p.carriedBy = undefined;
    const at = sim.passableNear(c.x + c.face * 16, c.y + 4);
    place(p, at.x, at.y);
    sim.events.push({ e: 'prop', what: 'drop', p });
  }
  sim.engine.release(c, 'carryProp');
}

/** Hand a carried prop over to the place that takes it (loaded into a gun): it is gone from the land. */
export function spendProp(sim: Sim, p: Prop) {
  const by = p.carriedBy !== undefined ? sim.bot(p.carriedBy) : undefined;
  p.carriedBy = undefined;
  p.broken = true;
  p.hp = 0;
  p.gone = true;
  if (by && !carriedProps(sim, by).length) sim.engine.release(by, 'carryProp');
}

const place = (p: Prop, x: number, y: number) => {
  p.x = x;
  p.y = y;
  p.tx = Math.floor(x / T);
  p.ty = Math.floor(y / T);
};

/** Each step: what he carries rides on him and weighs on his speed (as one downed robot does: `DOWNED.carry`); down, he drops it. */
export function carryPropStep(sim: Sim) {
  const c = sim.controller;
  const load = carriedProps(sim, c);
  if (!load.length) return;
  if (c.dead || c.hp <= 0 || sim.downT > 0) return putDownProps(sim, c);
  sim.engine.hold(c, 'carryProp', { stat: 'speed', more: carrySpeed(sim, c, load.length) });
  load.forEach((p, i) => place(p, c.x + c.face * (10 + i * 6), c.y + 2));
}

/** Rides up with him: carried, or lying on the lift. */
export const propOnLift = (sim: Sim, p: Prop) => !p.broken && (p.carriedBy === sim.controller.id || sim.onLift(p, 1.6));

// ---------------------------------------------------------------- D: hardpan

/** A kick's shove on something standing at (x, y): hardpan lets it slide farther (`PLACE_PARTS.hardpan`). */
export function slide(sim: Sim, x: number, y: number) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || tx >= sim.W || ty >= sim.H) return 1;
  return sim.map.ter[ty * sim.W + tx] === Ter.Hardpan ? PLACE_PARTS.hardpan : 1;
}

// ---------------------------------------------------------------- F: a turning beam

/** Is (px, py) on a beam from (x, y) pointing at `a` radians, `len` px long and `half` px wide either side? */
export function onBeam(px: number, py: number, x: number, y: number, a: number, len: number, half: number) {
  const dx = px - x, dy = py - y;
  const along = dx * Math.cos(a) + dy * Math.sin(a);
  if (along < 0 || along > len) return false;
  return Math.abs(-dx * Math.sin(a) + dy * Math.cos(a)) <= half;
}

/** The beam's angle at a time: one turn every `period` s. */
export const beamAngle = (t: number, period: number) => ((t / period) % 1) * Math.PI * 2;

/** What the beam crosses now: the fog along it is revealed, and each foe on it goes to `hit`. */
export function beamSweep(sim: Sim, x: number, y: number, a: number, len: number, half: number, hit: (h: Hornet) => void) {
  const step = Math.max(T, half * 2);
  for (let d = step; d <= len; d += step) sim.fog.reveal((x + Math.cos(a) * d) / T - 0.5, (y + Math.sin(a) * d) / T - 0.5, Math.max(1.5, half / T + 1));
  for (const h of sim.hornets) if (!h.dead && onBeam(h.x, h.y, x, y, a, len, half + h.r)) hit(h);
}

// ---------------------------------------------------------------- H: walkers to the lift

/** A robot that walks to the lift by itself, at `share` of its speed (`sim.pace`), and stands there. */
export function walkToLift(sim: Sim, b: Bot, dt: number) {
  b.moving = false;
  if (b.dead || b.hp <= 0 || b.downed || sim.phase === 'rising' || sim.phase === 'done') return;
  const l = sim.lift;
  if (!sim.onLift(b, 0.8)) sim.go(b, l.x, l.y + 4, dt, 10);
}

/** On the lift now (the walkers who make it ride up). */
export const onLiftNow = (sim: Sim, b: Spot) => sim.onLift(b, 1.6);

// ---------------------------------------------------------------- L: a stacking mission modifier

/** What multiplies the mission from now on: spawns (rate and how many may be out), the elite chance, and loot (drop chance, a gob's scrap, a boss's cache). */
export interface MissionMods {
  spawn: number;
  elite: number;
  loot: number;
}
export const freshMods = (): MissionMods => ({ spawn: 1, elite: 1, loot: 1 });

/** Stack a modifier on the mission (each toll of the Dinner Bell is one): every factor multiplies. */
export function stackMods(sim: Sim, m: Partial<MissionMods>) {
  for (const k of Object.keys(m) as (keyof MissionMods)[]) sim.mods[k] *= m[k]!;
}
