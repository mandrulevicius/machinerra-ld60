/**
 * A hive village's turrets (P47 part F, Minos: "can even have turrets"; destructible, they shoot the Communicator and robots in
 * range, with a tell before each shot). A turret is a P39 prop of kind `turret` (`propgen.ts` places them, `buildings.ts` says
 * where): it breaks like any machine and pays scrap. While it stands it looks for the nearest of ours in `TURRET.range` it can see
 * (rock and solid props block the line), locks onto where they stand and winds up for `TURRET.tell` s (the tell: a red line to the
 * locked spot, also a lane the robots dodge, `turretTeles` in `botai.ts` `telegraphs()`), then fires one shot there and waits
 * `TURRET.every` s. Numbers are guesses (`defs/buildings.ts`). Dev: `turret` (group `world`). Tests: `turrets.test.ts`.
 */
import { ROLES, T, TURRET } from './defs';
import { foeShot } from './foes';
import { dist } from './geom';
import { clearLine } from './path';
import type { Prop } from './props';
import type { Tele } from './brain';
import type { Bot } from './types';
import type { Sim } from './sim';

/** A turret's mind: `t` seconds to its next look (idle) or its shot (tell); where it aims while it winds up. */
export interface Turret {
  mode: 'idle' | 'tell';
  t: number;
  ax: number;
  ay: number;
}

export type TurretEvent =
  /** A turret locked on (`tell`: the wind-up starts) or fired. */
  { e: 'turret'; what: 'tell' | 'fire'; p: Prop; x: number; y: number };

/** The turrets' minds, by prop id (`Sim.turrets`, made when first stepped). */
export const turretsOf = (sim: Sim) => sim.turrets;

/** Can the turret see this point? Its own tile is no wall to itself. */
function sees(sim: Sim, p: Prop, x: number, y: number) {
  return clearLine((qx, qy) => (Math.floor(qx / T) !== p.tx || Math.floor(qy / T) !== p.ty) && sim.blocked(qx, qy), p.x, p.y, x, y, 2);
}

/** The nearest of ours a turret can see in range. */
function targetOf(sim: Sim, p: Prop): Bot | undefined {
  let best: Bot | undefined, bd = TURRET.range;
  for (const b of sim.bots) {
    if (b.dead || b.downed) continue;
    const d = dist(p.x, p.y, b.x, b.y);
    if (d < bd && sees(sim, p, b.x, b.y)) {
      best = b;
      bd = d;
    }
  }
  return best;
}

export function turretStep(sim: Sim, dt: number) {
  const ms = turretsOf(sim);
  for (const p of sim.props.list) {
    if (p.kind !== 'turret') continue;
    let m = ms.get(p.id);
    if (p.broken) {
      if (m) ms.delete(p.id);
      continue;
    }
    if (!m) ms.set(p.id, (m = { mode: 'idle', t: (p.id % 7) * 0.2, ax: p.x, ay: p.y }));
    m.t -= dt;
    if (m.t > 0) continue;
    if (m.mode === 'idle') {
      const b = targetOf(sim, p);
      if (!b) {
        m.t = 0.3;
        continue;
      }
      m.mode = 'tell';
      m.t = TURRET.tell;
      m.ax = b.x;
      m.ay = b.y - ROLES[b.role].r * 0.5;
      sim.events.push({ e: 'turret', what: 'tell', p, x: m.ax, y: m.ay });
      continue;
    }
    // The wind-up is over: one shot at the locked spot, from the muzzle (outside its own tile, so its own body does not stop it).
    const dx = m.ax - p.x, dy = m.ay - (p.y - 14), d = Math.hypot(dx, dy) || 1, out = T * 0.8;
    foeShot(sim, { x: p.x + (dx / d) * out, y: p.y - 14 + (dy / d) * out, vx: (dx / d) * TURRET.speed, vy: (dy / d) * TURRET.speed, dmg: TURRET.dmg, life: (TURRET.range * 1.15) / TURRET.speed, big: false, by: p.id, type: 'pierce' });
    sim.events.push({ e: 'turret', what: 'fire', p, x: m.ax, y: m.ay });
    m.mode = 'idle';
    m.t = TURRET.every;
  }
}

/** A turret winding up: a lane from it to its locked spot, for the robots to step out of. */
export function turretTeles(sim: Sim): Tele[] {
  const out: Tele[] = [];
  for (const [id, m] of turretsOf(sim)) {
    if (m.mode !== 'tell') continue;
    const p = sim.props.list.find((q) => q.id === id);
    if (!p || p.broken) continue;
    const dx = m.ax - p.x, dy = m.ay - p.y, len = Math.hypot(dx, dy) || 1;
    out.push({ id: `turret${id}`, kind: 'lane', x: p.x, y: p.y, dx: dx / len, dy: dy / len, len: len + 30, w: 30, fixes: 0 });
  }
  return out;
}
