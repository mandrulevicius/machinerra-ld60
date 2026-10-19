/**
 * The Communicator's turn each step (`controlled`): the down count, walking, the dash and the pack's skill, the kick, the weapons in hand, Use.
 * Add a move: an `Input` field (types.ts), a branch in the step it belongs to, its cooldown as a field on `Sim`.
 */

import { carriedProps } from './placeparts';
import {
  fire,
  shoot,
  swing,
  touch,
} from './combat';
import {
  ROLES,
  STEAM,
  WEAPONS,
} from './defs';
import {
  carriedBy,
  downStep,
} from './downed';
import {
  DASH,
  SKILLS,
  type SkillId,
} from './gear';
import { dist } from './geom';
import { brushReach, brushSweep } from './brush';
import type { Slot } from './loadout';
import { afterShot, chord, loosePigeon, modBolt, shotPlan, stab, swingPlan, throwWeapon } from './mods';
import {
  PERK_FX,
  kickOf,
} from './perks';
import type { Sim } from './sim';
import type {
  Bot,
  Input,
  Shot,
} from './types';
import {
  actionStep,
  armable,
  pressUse,
} from './use';

export type ControllerEvent =
  /** A gun or a skill wanted steam he does not have. */
  | { e: 'noSteam' }
  /** The slingshot has no scrap to shoot. */
  | { e: 'noAmmo' }
  /** The dash: from (x, y) at angle `a`; `burn`: a scalding one. */
  | { e: 'commDash'; x: number; y: number; a: number; burn: boolean; smoke?: boolean }
  /** The pack's skill went off. */
  | { e: 'skill'; id: SkillId; x: number; y: number };

/** The rear piece's dash: a burst the way he walks (or aims, standing still). */
export function dash(sim: Sim, c: Bot, input: Input) {
  const id = sim.skillIds.dash;
  if (!id || sim.dashing || sim.dashCd > 0) return;
  const S = SKILLS[id];
  if (c.steam < S.steam) {
    sim.events.push({ e: 'noSteam' });
    return;
  }
  c.steam -= S.steam;
  c.steamT = STEAM.delay;
  sim.dashCd = S.cd;
  const moving = Math.hypot(input.mx, input.my) > 0.1;
  const a = moving ? Math.atan2(input.my, input.mx) : Math.atan2(input.ay - c.y, input.ax - c.x);
  const v = DASH.dist / DASH.time;
  sim.dashing = { t: DASH.time, vx: Math.cos(a) * v, vy: Math.sin(a) * v, trails: [] };
  // What the dash does to the world is the gear's (`SKILL_EFFECTS`): a trail that burns, a grace.
  sim.engine.emit({ kind: 'dash', self: c });
  sim.drainFx();
  sim.events.push({ e: 'commDash', x: c.x, y: c.y, a, burn: sim.dashing.trails.some((t) => t.kind === 'afterburner'), smoke: sim.dashing.trails.some((t) => t.kind === 'smoke') });
}

/** The pack piece's skill. */
export function skill(sim: Sim, c: Bot) {
  const id = sim.skillIds.skill;
  if (!id || sim.skillCd > 0) return;
  const S = SKILLS[id];
  if (c.steam < S.steam) {
    sim.events.push({ e: 'noSteam' });
    return;
  }
  c.steam -= S.steam;
  c.steamT = STEAM.delay;
  sim.skillCd = S.cd;
  sim.events.push({ e: 'skill', id, x: c.x, y: c.y });
  sim.engine.emit({ kind: 'skill', self: c });
  sim.drainFx();
}

/** Walking, or the dash in flight (it burns what it passes, once each), then the dash and skill presses, facing, and the steam coming back. `len` is how hard he pushes the stick. */
function moveStep(sim: Sim, c: Bot, dt: number, input: Input, len: number) {
  const k = len > 1 ? 1 / len : 1;
  const sp = ROLES.controller.speed * sim.walk(c);
  sim.dashCd = Math.max(0, sim.dashCd - dt);
  sim.skillCd = Math.max(0, sim.skillCd - dt);
  if (sim.dashing) {
    // The dash: straight on at speed; a scalding one burns what it passes, once each.
    const d = sim.dashing;
    d.t -= dt;
    sim.moveBy(c, d.vx * dt, d.vy * dt);
    for (const t of d.trails)
      for (const h of sim.hornets)
        if (!h.dead && !h.air && !h.under && !t.hit.has(h.id) && dist(h.x, h.y, c.x, c.y) < t.radius + h.r) {
          t.hit.add(h.id);
          touch(sim, t, h);
        }
    if (d.t <= 0) sim.dashing = null;
  } else sim.moveBy(c, input.mx * k * sp * dt, input.my * k * sp * dt);
  c.moving = len > 0.1 || !!sim.dashing;
  if (input.dash) dash(sim, c, input);
  if (input.skill) skill(sim, c);
  // They face where they walk; an attack turns them toward the aim.
  if (Math.abs(input.mx) > 0.1) c.face = input.mx > 0 ? 1 : -1;
  c.state = 'idle';
  c.work = undefined;
  c.steamT -= dt;
  if (c.steamT <= 0) c.steam = Math.min(c.maxSteam, c.steam + sim.cfg.steamRegen * sim.engine.stat(c, 'steamRegen', 1) * sim.fx.steam * dt);
}

/** The kick as he swings it: the perks' numbers, and a body kicked slides as far as the Heel of Five Lands (`kickSlide`) says. */
const kickWith = (sim: Sim, c: Bot) => {
  const k = kickOf(sim.perks);
  return { ...k, knock: k.knock * sim.engine.stat(c, 'kickSlide', 1) };
};

/** The kick: its own cooldown, toward the aim, whatever is in hand; the Leaping Kick lands when its leap does. */
function kickStep(sim: Sim, c: Bot, dt: number, input: Input) {
  sim.kickCd -= dt;
  if (sim.lunge) {
    // The Leaping Kick in flight: the boot lands when the leap does.
    const l = sim.lunge, k = Math.min(dt, l.t);
    sim.moveBy(c, l.vx * k, l.vy * k);
    l.t -= dt;
    if (l.t <= 0) {
      sim.lunge = null;
      swing(sim, c, l.a, kickWith(sim, c), true);
    }
  } else if (input.kick && sim.kickCd <= 0) {
    const kick = kickWith(sim, c);
    sim.kickCd = kick.rate;
    if (Math.abs(input.ax - c.x) > 4) c.face = input.ax > c.x ? 1 : -1;
    const a = Math.atan2(input.ay - c.y, input.ax - c.x);
    const leap = sim.perks.has('dashKick') ? Math.min(PERK_FX.dashKick.dist, Math.max(0, dist(c.x, c.y, input.ax, input.ay) - kick.reach * 0.6)) : 0;
    if (leap > 8) sim.lunge = { a, t: PERK_FX.dashKick.time, vx: (Math.cos(a) * leap) / PERK_FX.dashKick.time, vy: (Math.sin(a) * leap) / PERK_FX.dashKick.time };
    else swing(sim, c, a, kick, true);
  }
}

/** Left click uses the primary slot, right click the secondary (an empty slot does nothing); one cooldown for both. Carrying a downed robot, a gun cannot fire (P5). */
function weaponStep(sim: Sim, c: Bot, input: Input) {
  const slot: Slot | null = input.fire ? 'primary' : input.fire2 ? 'secondary' : null;
  sim.engine.tag(c, 'firing', !!slot); // Pilgrim of the Sign's aura holds while he is not firing (titles.ts)
  const id = slot === 'primary' ? sim.weapon : slot === 'secondary' ? sim.secondary : null;
  if (id && c.cd <= 0 && !(WEAPONS[id].kind === 'gun' && (carriedBy(sim, c).length || carriedProps(sim, c).length))) {
    const w = WEAPONS[id];
    c.cd = w.rate / Math.max(0.3, sim.engine.stat(c, 'attackRate', 1));
    if (Math.abs(input.ax - c.x) > 4) c.face = input.ax > c.x ? 1 : -1;
    // The hit's damage is the engine's (the weapon's quality, the general and melee/ranged bonuses, the crit chance, a chain or ricochet): the Sim hands over the weapon's own.
    const a = Math.atan2(input.ay - c.y, input.ax - c.x);
    if (w.kind === 'melee') {
      // Weapon mods (P57): the Gimbal's weapon is out, or this swing throws it; the Flywheel speeds the next swing up.
      const plan = swingPlan(sim, id);
      if (!plan) {
        c.cd = 0;
        return;
      }
      c.cd /= plan.speed;
      if (plan.throwIt) throwWeapon(sim, c, id, a);
      // Wide Swing (a punch card, `hub/research.ts`): the swing is a full circle.
      else {
        swing(sim, c, a, { ...w, knock: w.knock * sim.engine.stat(c, 'knockback', 1), arc: sim.engine.source(c, 'card:wideSwing') ? Math.PI * 2 : w.arc, ...(w.brush && { reach: w.reach * brushReach(sim) }) }, false, id);
        if (w.brush) brushSweep(sim, c); // the Main Brush sweeps the loose scrap to his feet (P58)
      }
    } else if (stab(sim, c, id, a)) {
      // A Bayonet Lug stabbed the foe in front instead of shooting: no steam spent.
    } else {
      const plan = shotPlan(sim, c, id);
      const cost = w.ammo === 'scrap' ? 0 : sim.cfg.steamShot * sim.engine.stat(c, 'steamCost', 1) * plan.mult;
      if (w.ammo === 'scrap' ? sim.scrap >= 1 : c.steam >= cost) {
        if (w.ammo === 'scrap') sim.scrap -= 1;
        else {
          c.steam -= cost;
          c.steamT = STEAM.delay;
        }
        const g = { dmg: w.dmg, speed: w.speed, range: sim.engine.stat(c, 'range', w.range) * sim.fx.reach, type: w.type };
        // Firing is an event (Midnight Gunner); a weapon's pellets come from its own effects.
        sim.pelletVolley = null;
        sim.engine.emit({ kind: 'shot', self: c, weapon: id, via: 'gun' });
        sim.drainFx();
        const vol = sim.pelletVolley as { count: number; spread: number } | null;
        const n = plan.kind === 'chord' || plan.kind === 'pigeon' ? 0 : vol?.count ?? 1;
        const spread = vol?.spread ?? 0;
        sim.pelletVolley = null;
        const r = Math.hypot(input.ax - c.x, input.ay - c.y) || 1;
        const bolts: Shot[] = [];
        for (let i = 0; i < n; i++) {
          const off = n > 1 ? (i / (n - 1) - 0.5) * spread : 0;
          const s = shoot(sim, c, c.x + Math.cos(a + off) * r, c.y + Math.sin(a + off) * r, g);
          s.weapon = id;
          s.crit = sim.engine.stat(c, 'crit', w.crit ?? 0);
          if (w.ammo === 'scrap') s.pebble = true;
          modBolt(sim, id, s, plan);
          bolts.push(s);
        }
        // Not a bolt: the Gramophone Horn's chord, the Pigeon Loft's pigeon.
        if (plan.kind === 'chord') chord(sim, c, a);
        else if (plan.kind === 'pigeon') loosePigeon(sim, c, id, a, g);
        afterShot(sim, id, plan, cost, bolts);
      } else sim.events.push({ e: w.ammo === 'scrap' ? 'noAmmo' : 'noSteam' });
    }
  }
}

/** Use is a press: it rides the lift (asking first), starts a ruin's search or decode or a place's action, or confirms what it asked. */
function useStep(sim: Sim, c: Bot, dt: number, input: Input) {
  const pressed = input.use && !sim.usePrev;
  sim.usePrev = input.use;
  if (sim.armed && ((sim.armed.t -= dt) <= 0 || !armable(sim, c, sim.armed.key))) sim.armed = null;
  if (pressed && sim.phase === 'mission') pressUse(sim, c);
  actionStep(sim, dt);
}

/** His turn each step: down (`downStep`), or walking and dashing, then the kick, the weapons in hand and Use. */
export function controlled(sim: Sim, dt: number, input: Input) {
  const c = sim.controller;
  sim.hold = null;
  if (c.dead) return;
  if (sim.downT > 0) sim.action = sim.armed = null;
  sim.look.x = input.ax;
  sim.look.y = input.ay;
  c.fxT += dt;
  c.cd -= dt;
  if (sim.downT > 0) return downStep(sim, dt);
  if (sim.phase === 'rising') {
    c.moving = false;
    return;
  }
  const len = Math.hypot(input.mx, input.my);
  // Staggered, Frozen or Shocked: he can only stand there.
  if (sim.stunned(c)) input = { ...input, mx: 0, my: 0, fire: false, fire2: false, kick: false, dash: false, skill: false };
  moveStep(sim, c, dt, input, len);
  kickStep(sim, c, dt, input);
  weaponStep(sim, c, input);
  useStep(sim, c, dt, input);
}

/** `summary().controller`: where he is, his oil and steam, and what he carries in hand. */
export function controllerSummary(sim: Sim) {
  const c = sim.controller;
  return {
    x: Math.round(c.x),
    y: Math.round(c.y),
    oil: Math.round(c.hp),
    steam: Math.round(c.steam),
    weapon: sim.weapon,
    secondary: sim.secondary,
    weapons: [...sim.weapons],
  };
}
