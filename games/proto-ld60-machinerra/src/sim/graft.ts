/**
 * Grafting (Gasket's capstone, `gasket.3`; Minos 2026-10-19, `decisions.md`; plain TS, tests beside it). Once the capstone is done
 * (the perk `grafting`), a killed twisted elite (claws) or menacing elite (tentacles) drops one of its limbs as a part that twitches
 * on the ground (`Sim.grafts`, `dropGraft` from `foes.ts` `hornetDown`). Hold Use beside it (`GRAFT.hold` s, a timed action like a
 * ruin's search: `use.ts`) and it is grafted onto the Communicator for the rest of the mission (`Sim.graft`, `graftOn`).
 * - One graft at a time: grafting another replaces it. It falls off at the lift (`graftLift`, called as the lift rises).
 * - It works on its own, as the elites' limbs do (the same code, `limbs.ts` `run`): a **claw** rakes the foes in its half beside him
 *   (the half is the right hand of his aim), a **tentacle** whips the nearest foe in reach at the spot it locked. It is ours: it
 *   hurts foes only, never robots or props. The blow is the donor's own (`foeDmg`, its limb's multiplier) times `GRAFT.dmg`.
 * - Nothing here uses the land's random stream (a replay drops the same).
 * The views are `limbview.ts` (the part on the ground, the limb on his shoulder). Numbers: `GRAFT` (defs/limbs.ts), `LIMBS`.
 */
import { FOES, GRAFT, HORNET, LIMBS, TWISTED, type Enemy } from './defs';
import { dist } from './geom';
import { limbKindOf, make, run, type Limb, type LimbKind, type Wearer } from './limbs';
import type { Hornet, Sim, SimEvent } from './sim';
import { damageHornet } from './combat';
import { foeDmg } from './tiers';

/** A limb lying where its elite fell. `dmg`: the blow it will give once worn. */
export interface Graft {
  id: number;
  kind: LimbKind;
  from: Enemy;
  x: number;
  y: number;
  dmg: number;
  /** Seconds it has lain (the view's twitch). */
  age: number;
}

/** The limb he wears: its kind, the blow and the one limb (side +1) the cadence runs on. */
export interface Worn {
  kind: LimbKind;
  from: Enemy;
  dmg: number;
  limb: Limb;
}

/** Has he the ability (Gasket's capstone paid)? */
export const canGraft = (sim: Sim) => sim.perks.has('grafting');

/** A limb's blow: the donor's own times its limb's multiplier times `GRAFT.dmg`. */
const blowOf = (sim: Sim, h: Hornet, kind: LimbKind) => foeDmg(sim, h) * (kind === 'claw' ? LIMBS.claw.dmg : LIMBS.whip.dmg) * GRAFT.dmg;

/** The blow of a pounce-cat elite's limb of this kind, as a part would carry it (the dev command's parts, the tests'). */
export const devBlow = (kind: LimbKind) => FOES.cat.dmg * HORNET.elite.dmg * (kind === 'claw' ? TWISTED.cat.dmg : 1) * (kind === 'claw' ? LIMBS.claw.dmg : LIMBS.whip.dmg) * GRAFT.dmg;

/** An elite with limbs died: one drops where it fell (a claw or a tentacle; only with the ability). Returns it. */
export function dropGraft(sim: Sim, h: Hornet): Graft | null {
  if (!canGraft(sim)) return null;
  const kind = limbKindOf(h, true);
  if (!kind) return null;
  return layGraft(sim, kind, h.kind, h.x, h.y, blowOf(sim, h, kind));
}

/** A graft lies at (x, y) (the dev command's too). */
export function layGraft(sim: Sim, kind: LimbKind, from: Enemy, x: number, y: number, dmg: number): Graft {
  const g: Graft = { id: sim.nextId++, kind, from, x, y, dmg, age: 0 };
  sim.grafts.push(g);
  sim.events.push({ e: 'graft', what: 'drop', kind, x, y });
  return g;
}

/** Graft `g` on: the part leaves the ground; any limb he wore falls off first. */
export function graftOn(sim: Sim, g: Graft) {
  const i = sim.grafts.indexOf(g);
  if (i >= 0) sim.grafts.splice(i, 1);
  if (sim.graft) sim.events.push({ e: 'graft', what: 'off', kind: sim.graft.kind, x: sim.controller.x, y: sim.controller.y });
  const c = sim.controller;
  sim.graft = { kind: g.kind, from: g.from, dmg: g.dmg, limb: make(g.kind, c.x, c.y, false)[0] };
  sim.graft.limb.cd = 0.4;
  sim.stats.grafts = (sim.stats.grafts ?? 0) + 1;
  sim.events.push({ e: 'graft', what: 'on', kind: g.kind, x: c.x, y: c.y });
}

/** What travels down and up a dungeon with him (`missionstart.ts` `Hands`): the limb he wears. */
export type Grafted = { kind: LimbKind; from: Enemy; dmg: number };

/** He wears this limb now (or none): the dungeon's Sim takes it from the land's, the land's takes back what he wears after. */
export function wear(sim: Sim, g: Grafted | null | undefined) {
  sim.graft = g ? { kind: g.kind, from: g.from, dmg: g.dmg, limb: make(g.kind, sim.controller.x, sim.controller.y, false)[0] } : null;
}

/** The graft nearest to (x, y) within `GRAFT.reach`, if any. */
export function graftNear(sim: Sim, x: number, y: number): Graft | null {
  let best: Graft | null = null, bd = GRAFT.reach;
  for (const g of sim.grafts) {
    const d = dist(x, y, g.x, g.y);
    if (d <= bd) (best = g, bd = d);
  }
  return best;
}

/** The lift rises: what he wears falls off, and the stat says so for the docking (Gasket takes it for study: `hub/companions.ts`). */
export function graftLift(sim: Sim) {
  if (!sim.graft) return;
  sim.stats.grafted = 1;
  const c = sim.controller;
  sim.events.push({ e: 'graft', what: 'off', kind: sim.graft.kind, x: c.x, y: c.y });
  sim.graft = null;
}

/** Where his limb grows from, for his aim `a`: out to its side of him (the right hand of the aim for side +1), up at the shoulder. */
export function shoulderAt(x: number, y: number, a: number, side: 1 | -1, out = { x: 0, y: 0 }) {
  out.x = x - Math.sin(a) * side * GRAFT.socket.out;
  out.y = y + Math.cos(a) * side * GRAFT.socket.out * 0.6 - GRAFT.socket.up;
  return out;
}

/** The foes a graft may go for: alive, on the ground, standing in the open. */
const targetable = (h: Hornet) => !h.dead && !h.under && !h.air;

/** The Communicator as a wearer: he goes for foes and hurts foes only. */
function wearer(sim: Sim, w: Worn): Wearer {
  const c = sim.controller;
  return {
    x: c.x,
    y: c.y,
    clawR: GRAFT.claw.reach,
    whipR: GRAFT.whip.reach,
    dmg: w.dmg,
    seek(f) {
      for (const h of sim.hornets) if (targetable(h)) f(h.x, h.y, h.r);
    },
    victims(f) {
      for (const h of sim.hornets) if (targetable(h)) f(h.x, h.y, h.r, (d, via) => damageHornet(sim, h, d, c, undefined, { via }));
    },
    socket: (side, out) => shoulderAt(c.x, c.y, sim.facing, side, out),
    note: (what, l, hits) => void sim.events.push({ e: 'graft', what, kind: l.kind, x: c.x, y: c.y, ...(what === 'strike' && { hits }) } as SimEvent),
  };
}

/** One step: the parts on the ground twitch on, and the limb he wears works while he stands. */
export function graftStep(sim: Sim, dt: number) {
  for (const g of sim.grafts) g.age += dt;
  const w = sim.graft;
  if (!w) return;
  const c = sim.controller;
  if (sim.phase !== 'mission' || c.dead || c.hp <= 0) return;
  run(wearer(sim, w), [w.limb], sim.facing, dt);
}

/** `summary()`: the parts lying about and what he wears (the limb's mode, and its locked spot while a tentacle winds up). */
export function graftSummary(sim: Sim) {
  const w = sim.graft;
  return {
    can: canGraft(sim),
    lying: sim.grafts.map((g) => `${g.kind} of a ${g.from} at ${Math.round(g.x)},${Math.round(g.y)}`),
    worn: w && { kind: w.kind, from: w.from, dmg: +w.dmg.toFixed(1), mode: w.limb.mode, ...(w.limb.mode === 'wind' && w.kind === 'whip' && { spot: [Math.round(w.limb.tx), Math.round(w.limb.ty)] }) },
  };
}
