/**
 * Elite limbs (P50, plain TS, tests beside it): a twisted elite grows two claws that rake, a menacing elite two tentacles that
 * whip instead. Both are extra wind-up attacks on top of the elite's own, never more health; none on a day elite, a plain twisted
 * foe or a boss. `limbsStep` runs for a foe each step (`tiers.ts` `think`); `Hornet.limbs` holds each limb's state.
 *
 * - **Claw:** owns one half of the body, left or right of the heading (its movement, or toward its target when still), and winds
 *   up when a robot stands in that half within its reach; then one swing hits everything of ours in the half within reach.
 *   The two claws run apart (the second waits half a rest first), so a target in front draws whichever is ready.
 * - **Tentacle:** reaches any way, farther than a claw; it picks the nearest robot in reach and **locks the spot** as the wind-up
 *   begins: the lash lands on that spot, along the line from its socket, even if the target walked off. The two take turns.
 * - Neither hurts another foe. Damage is the foe's own blow (`foeDmg`) times the limb's multiplier; robots take `foeHit`
 *   (`via` `claw` / `whip`), props `hitProp`. A stun cancels a wind-up (`limbsCancel`).
 * Bots step out of a wind-up through `botai.ts` `telegraphs` (`limbTeles`). Numbers: `LIMBS`, `SOCKETS` (defs/limbs.ts).
 */
import { FOES, HORNET, LIMBS, ROLES, SOCKETS } from './defs';
import { dist } from './geom';
import { hitProp } from './props';
import type { Bot, Hornet, Sim } from './sim';
import { foeDmg } from './tiers';
import type { Tele } from './brain';

export type LimbKind = 'claw' | 'whip';
export type LimbMode = 'idle' | 'wind' | 'strike' | 'rest';

/** One limb. `side`: a claw's half (+1 the heading's right hand on the screen, -1 its left), a tentacle's index (+1, -1). `cd`: seconds before it may wind up. `t`: seconds left in the mode. `tx`, `ty`: a tentacle's locked spot. `a`: the heading (rad) the pair last took. */
export interface Limb {
  kind: LimbKind;
  side: 1 | -1;
  mode: LimbMode;
  t: number;
  cd: number;
  tx: number;
  ty: number;
  a: number;
}

/** What limbs this foe has now: none, claws (twisted elite) or tentacles (menacing elite). Needs a `SOCKETS` row. */
export function limbKindOf(h: Hornet): LimbKind | null {
  if (!h.elite || h.boss || h.dead || !SOCKETS[h.kind]) return null;
  return h.menacing ? 'whip' : h.twisted ? 'claw' : null;
}

/** An elite's painting is this much larger than its kind's (`FoeView`). */
const ELITE_SIZE = HORNET.elite.scale * 0.9;
/** A flier's drawing is centred this far above its position (`FoeView`), a walker's stands on it. */
const AIR = 18;

/** The foe faces left when it moves left (`FoeView` flips its painting the same way). */
export const facing = (h: Hornet): 1 | -1 => (h.vx < 0 ? -1 : 1);

/** Where limb `side` grows from, in the world, for a foe at its position (a flat hop or bob aside). Writes into `out`. */
export function socketAt(h: Hornet, side: 1 | -1, out = { x: 0, y: 0 }) {
  const S = SOCKETS[h.kind]!;
  const ground = !!FOES[h.kind].ground;
  const k = ELITE_SIZE;
  out.x = h.x + facing(h) * S.x * S.w * k;
  out.y = h.y + (S.y - (ground ? 0.92 : 0.5)) * S.h * k - (ground ? 0 : AIR) + side * S.h * 0.05 * k;
  return out;
}

/** A claw's reach, px. */
export const clawReach = (h: Hornet) => h.reach * LIMBS.claw.reach;
/** A tentacle's reach, px. */
export const whipReach = (h: Hornet) => clawReach(h) * LIMBS.whip.reach;

/** Which half of the body (+1 / -1) a point is in, for a heading `a`. */
const halfOf = (h: Hornet, a: number, x: number, y: number): 1 | -1 => (Math.cos(a) * (y - h.y) - Math.sin(a) * (x - h.x) >= 0 ? 1 : -1);

const make = (kind: LimbKind, h: Hornet): Limb[] => {
  const rest = kind === 'claw' ? LIMBS.claw.rest : LIMBS.whip.cooldown;
  return ([1, -1] as const).map((side, i) => ({ kind, side, mode: 'idle', t: 0, cd: i * rest * (kind === 'claw' ? LIMBS.claw.stagger : 0.5), tx: h.x, ty: h.y, a: 0 }));
};

/** Robots a limb may go for: alive and standing. */
const live = (b: Bot) => !b.dead && b.hp > 0;
const bodyR = (b: Bot) => ROLES[b.role].r * 0.5;

/** One step of a foe's limbs. */
export function limbsStep(sim: Sim, h: Hornet, dt: number) {
  const kind = limbKindOf(h);
  if (!kind) {
    if (h.limbs && h.dead) h.limbs = undefined;
    return;
  }
  const L = (h.limbs ??= make(kind, h));
  // Its heading: its way, else toward its target, else the last.
  let a = L[0].a;
  const t = sim.bot(h.target);
  if (Math.hypot(h.vx, h.vy) > 12) a = Math.atan2(h.vy, h.vx);
  else if (t && !t.dead) a = Math.atan2(t.y - h.y, t.x - h.x);
  for (const l of L) l.a = a;
  for (const l of L) {
    l.cd -= dt;
    if (l.mode === 'idle') {
      if (l.cd <= 0) begin(sim, h, l, L, a);
    } else if (l.mode === 'wind') {
      l.t -= dt;
      if (l.t <= 0) strike(sim, h, l, a);
    } else {
      l.t -= dt;
      if (l.t <= 0) {
        if (l.mode === 'strike') {
          l.mode = 'rest';
          l.t = Math.max(0, (l.kind === 'claw' ? LIMBS.claw.rest : LIMBS.whip.cooldown - LIMBS.whip.wind - LIMBS.whip.strike));
        } else l.mode = 'idle';
      }
    }
  }
}

/** A limb with a target and its wait up begins its wind-up. */
function begin(sim: Sim, h: Hornet, l: Limb, all: Limb[], a: number) {
  if (l.kind === 'claw') {
    const R = clawReach(h);
    const hit = sim.bots.some((b) => live(b) && dist(b.x, b.y, h.x, h.y) <= R + bodyR(b) && halfOf(h, a, b.x, b.y) === l.side);
    if (!hit) return;
    l.mode = 'wind';
    l.t = LIMBS.claw.wind;
    sim.events.push({ e: 'limb', what: 'wind', h, limb: 'claw', side: l.side });
    return;
  }
  const R = whipReach(h);
  let best: Bot | null = null, bd = R;
  for (const b of sim.bots) {
    const d = dist(b.x, b.y, h.x, h.y);
    if (live(b) && d <= bd) {
      bd = d;
      best = b;
    }
  }
  if (!best) return;
  l.mode = 'wind';
  l.t = LIMBS.whip.wind;
  l.tx = best.x;
  l.ty = best.y;
  // They take turns: the other waits half a cooldown from here.
  for (const o of all) if (o !== l) o.cd = Math.max(o.cd, LIMBS.whip.cooldown / 2);
  sim.events.push({ e: 'limb', what: 'wind', h, limb: 'whip', side: l.side });
}

/** The wind-up is over: the blow lands. */
function strike(sim: Sim, h: Hornet, l: Limb, a: number) {
  const dmg = foeDmg(sim, h);
  let hits = 0;
  if (l.kind === 'claw') {
    const R = clawReach(h), D = dmg * LIMBS.claw.dmg;
    for (const b of sim.bots) if (live(b) && dist(b.x, b.y, h.x, h.y) <= R + bodyR(b) && halfOf(h, a, b.x, b.y) === l.side) (hits++, sim.foeHit(h, b, D, 'claw'));
    for (const p of sim.props.list) if (!p.broken && !p.gone && dist(p.x, p.y, h.x, h.y) <= R + p.r && halfOf(h, a, p.x, p.y) === l.side) (hits++, hitProp(sim, p, D, { via: 'claw' }));
    l.mode = 'strike';
    l.t = LIMBS.claw.strike;
  } else {
    const o = socketAt(h, l.side), D = dmg * LIMBS.whip.dmg, W = LIMBS.whip.width / 2;
    for (const b of sim.bots) if (live(b) && onLine(o.x, o.y, l.tx, l.ty, b.x, b.y) <= W + bodyR(b)) (hits++, sim.foeHit(h, b, D, 'whip'));
    for (const p of sim.props.list) if (!p.broken && !p.gone && onLine(o.x, o.y, l.tx, l.ty, p.x, p.y) <= W + p.r) (hits++, hitProp(sim, p, D, { via: 'whip' }));
    l.mode = 'strike';
    l.t = LIMBS.whip.strike;
  }
  sim.events.push({ e: 'limb', what: 'strike', h, limb: l.kind, side: l.side, hits });
}

/** The distance from (px, py) to the segment (x0, y0)-(x1, y1). */
export function onLine(x0: number, y0: number, x1: number, y1: number, px: number, py: number) {
  const dx = x1 - x0, dy = y1 - y0, n = dx * dx + dy * dy;
  const k = n ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / n)) : 0;
  return dist(px, py, x0 + dx * k, y0 + dy * k);
}

/** A stun or a freeze takes a wind-up back: the limb rests (a claw its rest, a tentacle its cooldown share). */
export function limbsCancel(h: Hornet) {
  for (const l of h.limbs ?? []) if (l.mode === 'wind') (l.mode = 'idle', (l.cd = 0.5));
}

/** The areas bots keep out of: a winding claw's disc (its reach, about the foe); a winding tentacle's lane (its socket to the locked spot) and a disc at the spot. All fixed already (`fixes` 0). */
export function limbTeles(sim: Sim, h: Hornet, out: Tele[]) {
  if (!h.limbs) return;
  for (const l of h.limbs) {
    if (l.mode !== 'wind') continue;
    const id = `limb${h.id}.${l.side}`;
    if (l.kind === 'claw') {
      out.push({ id, kind: 'disc', x: h.x, y: h.y, r: clawReach(h), from: { x: h.x, y: h.y }, fixes: 0 });
      continue;
    }
    const o = socketAt(h, l.side);
    const dx = l.tx - o.x, dy = l.ty - o.y, len = Math.hypot(dx, dy) || 1;
    out.push({ id: `${id}.line`, kind: 'lane', x: o.x, y: o.y, dx: dx / len, dy: dy / len, len, w: LIMBS.whip.width, fixes: 0 });
    out.push({ id: `${id}.spot`, kind: 'disc', x: l.tx, y: l.ty, r: LIMBS.whip.width, fixes: 0 });
  }
}

/** debugState(): each limbed foe's limbs by mode. */
export function limbSummary(sim: Sim) {
  return sim.hornets.filter((h) => h.limbs && !h.dead).map((h) => `h${h.id} ${h.kind} ${h.limbs![0].kind}: ${h.limbs!.map((l) => (l.mode === 'wind' && l.kind === 'whip' ? `wind@${Math.round(l.tx)},${Math.round(l.ty)}` : l.mode)).join(' ')}`);
}
