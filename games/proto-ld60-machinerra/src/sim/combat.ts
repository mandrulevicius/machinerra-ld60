/**
 * Hits and shots.
 * `hurt` and `damageHornet` send a blow through the effect engine (effects.ts), which does the maths: types, armour, riders.
 * `swing` is a melee swing or the kick's landing, `fire` moves every shot, `onOut` turns what the engine reports into events and consequences.
 * What only the Sim can say (a shove, a pop, a shatter) goes here; a new damage rule belongs in the engine.
 */

import {
  bossGuard,
  bossKicked,
  onIce,
} from './boss';
import {
  noteCommHit,
  noteHurt,
} from './botai';
import {
  ARENA,
  type DamageType,
  FOES,
  NEST,
  SAW,
  ROLES,
  type Role,
  TIER,
  WEAPONS,
  type WeaponId,
  bossKnock,
} from './defs';
import { addArea, frontCut, intercept, laySlick, markedHit } from './botskills';
import { botDown } from './downed';
import type { Out } from './effects';
import {
  hornetDown,
  nestDown,
  reach,
  wake,
} from './foes';
import {
  BRASS_GUARD,
  DASH,
} from './gear';
import {
  dist,
  wrapAngle,
} from './geom';
import {
  hatch,
  relicProc,
} from './junkplay';
import { SHATTER } from './missionfx';
import { bootSpur, bounce, isModSpawn, modSpawn, pigeonStep } from './mods';
import { crashDmg, crashMul, flingFoe, swingBodies } from './crash';
import { brushFling } from './brush';
import { beastGuard } from './beasts';
import { turnCrowd } from './commute';
import { say } from './oracle';
import { slide, wakeFoe } from './placeparts';
import { hitProp, shotAt, solidAt } from './props';
import type { Sim } from './sim';
import { snare } from './spider';
import {
  bladeStep,
  blinks,
  blowType,
  breakCheck,
  guardHit,
  isFront,
  landed,
} from './tiers';
import type {
  Bot,
  Hornet,
  Nest,
  Shot,
  Trail,
} from './types';

export type CombatEvent =
  /** A shot left a robot's weapon. */
  | { e: 'shot'; s: Shot; by: Bot }
  /** A melee swing toward angle `a` (radians); `hits` is how many it struck. */
  | { e: 'swing'; by: Bot; a: number; reach: number; arc: number; hits: number; kick?: boolean }
  /** A Guard's saw stroke toward angle `a`; `at` is where the nearest foe it struck stood (the sparks), `hits` how many it struck. */
  | { e: 'saw'; by: Bot; a: number; reach: number; arc: number; hits: number; at: { x: number; y: number } | null }
  /** Something took a hit; `mul` is the weakness (>1) or resistance (<1) it met. */
  | { e: 'hit'; x: number; y: number; on: 'hornet' | 'nest' | 'rock' | 'bot'; dmg: number; mul?: number }
  /** A kicked leech drone burst (`FoeDef.pops`). */
  | { e: 'pop'; h: Hornet; r: number }
  /** A harpoon reeled a foe in. */
  | { e: 'reel'; h: Hornet; by: Bot }
  /** An enemy stung a robot. */
  | { e: 'sting'; h: Hornet; bot: Bot }
  /** A critical hit. */
  | { e: 'crit'; x: number; y: number; dmg: number }
  /** An arc from one foe to the next (the tazer, a slingshot ricochet). */
  | { e: 'zap'; x: number; y: number; tx: number; ty: number }
  /** The effect engine: a status landed on a robot or an enemy (not the markers the sim keeps fresh). */
  | { e: 'status'; on: 'hornet' | 'bot'; x: number; y: number; id: string; stacks: number }
  /** A melee hit was parried. */
  | { e: 'parry'; x: number; y: number }
  /** A kick broke a Frozen enemy: the ice and its shards (`SHATTER`). */
  | { e: 'shatter'; x: number; y: number; r: number }
  /** A hit passed through a ghost (no ghost touch yet), or a veiled boss. */
  | { e: 'ghosted'; x: number; y: number };

/**
 * Damage a robot: a hit through the engine (armour, plating, parry, riders). `o.by` is who struck it, `o.type` the damage type
 * (without one it is plain damage: no resistances, no rider), `o.via` how ('melee', 'gun', 'crash'). `quiet` ones (the twisted
 * halos) draw no hit effect of their own.
 */
export function hurt(sim: Sim, b: Bot, dmg: number, quiet = false, o: { by?: Hornet | Bot; type?: DamageType; via?: string; shared?: boolean } = {}) {
  if (b.dead || (b.role === 'controller' && sim.downT > 0)) return;
  // Shield Brothers: guards within `SHIELD_BROTHERS.reach` of each other split the blow evenly (each takes its share as a blow of its own).
  if (b.role === 'guard' && !o.shared) {
    const kin = brothers(sim, b);
    if (kin.length > 1) {
      for (const g of kin) hurt(sim, g, dmg / kin.length, quiet, { ...o, shared: true });
      return;
    }
  }
  // A Bodyguard takes the first blow meant for the Communicator (a foe's own, every `interceptEvery` s).
  if (b.role === 'controller' && !quiet && o.by && 'kind' in o.by) b = intercept(sim, b) ?? b;
  const before = b.hp;
  sim.engine.tag(b, 'stripping', b.state === 'gather'); // Pressure Release asks whether it was working when it was hit
  sim.engine.strike(o.by, b, { type: o.type ?? 'impact', amount: dmg * frontCut(b, o.by), via: quiet ? 'aura' : o.via, plain: !o.type });
  // A foe's own blow: a love-bot's heart Taunts the robot over to it, a mite Chills, a leech drinks what it took.
  const h = o.by && 'kind' in o.by && !quiet ? o.by : null;
  if (h && !h.dead) {
    const F = FOES[h.kind];
    if (F.onHit && !b.dead && b.hp > 0 && sim.engine.apply(b, F.onHit, { by: h }) && F.onHit === 'taunted' && b.role !== 'controller') b.lure = h.id;
    if (F.drain) h.hp = Math.min(h.maxHp, h.hp + Math.max(0, before - b.hp) * F.drain);
  }
  sim.drainFx();
  if (before > b.hp) noteHurt(sim, b);
  if (b.role === 'guard') sim.deed('guard', 'tank', before - Math.max(0, b.hp));
  if (!b.dead && b.hp > 0 && b.role !== 'controller' && b.hp < b.maxHp * 0.6 && sim.r.chance(0.3)) sim.bark(b, 'hurt');
}

/** Shield Brothers (a punch card): the Guards standing within reach of this one, itself included, if it wears the card; else none. */
export const SHIELD_BROTHERS = { reach: 120 };
function brothers(sim: Sim, b: Bot): Bot[] {
  if (!sim.engine.source(b, 'card:shieldBrothers')) return [];
  return sim.bots.filter((g) => g.role === 'guard' && !g.dead && !g.downed && (g === b || dist(g.x, g.y, b.x, b.y) <= SHIELD_BROTHERS.reach) && !!sim.engine.source(g, 'card:shieldBrothers'));
}

/** An enemy strikes a robot with its kind's own damage type (`FOES[kind].type`). */
export function foeHit(sim: Sim, h: Hornet, b: Bot, dmg: number, via = 'melee') {
  hurt(sim, b, dmg, false, { by: h, type: blowType(h), via });
}

export function onOut(sim: Sim, o: Out) {
  const isBot = (u: unknown): u is Bot => 'role' in (u as object);
  const isNest = (u: unknown): u is Nest => 'spawnT' in (u as object);
  switch (o.t) {
    case 'damage': {
      const u = o.unit as Bot | Hornet | Nest;
      if (isNest(u)) {
        // A hit wakes a sleeping hive, whatever dealt it.
        if (o.amount > 0 && !u.awake) wake(sim, u, o.by && isBot(o.by) ? (o.by.role === 'controller' ? 'Communicator' : o.by.name) : 'Communicator');
        if (o.amount > 0) sim.events.push({ e: 'hit', x: u.x, y: u.y - 10, on: 'nest', dmg: o.amount });
        return;
      }
      if (o.via === 'aura' || o.amount <= 0 || (o.dot && isBot(u))) return;
      if (o.by === sim.controller && !isBot(u)) noteCommHit(sim, (u as Hornet).id);
      sim.events.push({ e: 'hit', x: u.x, y: u.y, on: isBot(u) ? 'bot' : 'hornet', dmg: o.amount, ...(!isBot(u) && o.mul !== 1 && { mul: o.mul }) });
      if (!isBot(u)) breakCheck(sim, u as Hornet); // an elite or a boss crossing 66% or 33% of its oil breaks (P13)
      return;
    }
    case 'down': {
      const by = o.by && isBot(o.by) ? o.by : null;
      if (isBot(o.unit)) botDown(sim, o.unit);
      else if (isNest(o.unit)) nestDown(sim, o.unit);
      else hornetDown(sim, o.unit as Hornet, by, !!o.burning);
      return;
    }
    case 'status': {
      // The markers the sim keeps fresh and the buffs that only bookkeep are not news.
      if (['twistedAura', 'webbed', 'lit', 'menace', 'charge', 'grace', 'lifted', 'steady'].includes(o.id)) return;
      const u = o.unit as Bot | Hornet;
      if (isNest(u)) return;
      sim.events.push({ e: 'status', on: isBot(u) ? 'bot' : 'hornet', x: u.x, y: u.y, id: o.id, stacks: o.stacks });
      return;
    }
    case 'parry':
      sim.events.push({ e: 'parry', x: o.unit.x, y: o.unit.y });
      return;
    case 'proc': {
      // A critical hit is the weapon's `crit` chance effect firing on a hit.
      const e = sim.engine.source(o.unit, o.source)?.effects[o.index];
      if (o.source.startsWith('relic:') && isBot(o.unit)) relicProc(sim, o.source, o.unit, o.when);
      if (o.source === 'trait:carapace') sim.events.push({ e: 'tier', what: 'thorns', x: o.unit.x, y: o.unit.y });
      if (o.source === 'trait:bulwark') sim.events.push({ e: 'tier', what: 'mirror', x: o.unit.x, y: o.unit.y });
      // A Mender's pulse: a green spark on each enemy it mended.
      if (o.source === 'trait:leech' && o.when === 'tick' && !isBot(o.unit)) {
        for (const a of sim.hornets) if (a !== o.unit && !a.dead && a.hp < a.maxHp && dist(a.x, a.y, o.unit.x, o.unit.y) <= TIER.mender.radius) sim.events.push({ e: 'tier', what: 'mend', x: a.x, y: a.y, h: a });
      }
      if (o.when === 'hit' && o.target && e && 'chance' in e && typeof e.chance === 'object' && e.chance.stat === 'crit') sim.events.push({ e: 'crit', x: o.target.x, y: o.target.y, dmg: 0 });
      return;
    }
    case 'chain':
      for (let i = 1; i < o.path.length; i++) sim.events.push({ e: 'zap', x: o.path[i - 1].x, y: o.path[i - 1].y, tx: o.path[i].x, ty: o.path[i].y });
      return;
    case 'pulse':
      if (o.knock) {
        for (const h of sim.hornets) {
          const d = dist(h.x, h.y, o.x, o.y);
          if (h.dead || d > o.radius + h.r || sim.engine.flag(h, 'steady')) continue;
          const kn = h.boss ? o.knock * 0.12 : o.knock;
          h.vx += ((h.x - o.x) / (d || 1)) * kn;
          h.vy += ((h.y - o.y) / (d || 1)) * kn;
        }
      }
      return;
    case 'spawn':
      if (o.what === 'trail') sim.dashing?.trails.push({ kind: o.kind, owner: o.owner as Bot, then: o.then!, radius: o.radius ?? DASH.burnR, source: o.source, hit: new Set() });
      else if (o.what === 'pellets') sim.pelletVolley = { count: o.count, spread: o.spread ?? 0 };
      else if (o.what === 'brass') hatch(sim, o.owner as Bot);
      else if (o.what === 'reel') reel(sim, o);
      else if (o.what === 'cloud' || o.what === 'flare') addArea(sim, o);
      else if (o.what === 'slick') laySlick(sim, o);
      else if (o.what === 'gob') sim.drop(o.x, o.y, 'scrap'); // Deep Draw (a punch card): stripping brings up a gob
      else if (isModSpawn(o.what)) modSpawn(sim, o); // a weapon mod's effect (`mods.ts`)
      else if (o.what === 'ally') {
        const c = o.owner as Bot;
        for (let i = 0; i < o.count; i++) {
          const b = sim.addBot(o.kind as Role, `Brass Guard ${i + 1}`, c.x + (i ? 40 : -40), c.y + 20, 0);
          b.ttl = o.ttl ?? BRASS_GUARD.life;
          sim.events.push({ e: 'joined', bot: b });
        }
        say(sim, 'brassGuard', 'Two of the Wanderer\'s guard, down on ropes. They are yours for a minute; then I want them back, polished.');
      }
      return;
    default:
  }
}

/**
 * Nothing lands on it now: a veiled boss; or a ghost, unless the hit is `dark` (ghost bullets, the Shade Step) or its
 * maker is ghostly (the `ghostly` flag: the Esteemed Ghost's touch for the Communicator, a ghostly piece for a robot). With
 * no maker (the Wanderer's calls) a ghost is never hit: faith only hits modern tech. The engine holds the same rule for what
 * it deals itself (a tag `ethereal` on the ghost), so pulses and chains agree.
 */
export function untouchable(sim: Sim, h: Hornet, by?: Bot | null, type?: DamageType) {
  if (h.veiled || h.under) return true;
  if (!FOES[h.kind].ethereal || type === 'dark') return false;
  return !(by && sim.engine.flag(by, 'ghostly'));
}

/**
 * A melee swing: everything in the arc within reach takes the hit; hornets are knocked back. The hit is the engine's: `w.dmg` is
 * the weapon's own, and what the gear, the quality, a crit or a chain add comes from the sources (`weapon` says which is in hand).
 */
export function swing(sim: Sim, b: Bot, a: number, w: { type?: DamageType; dmg: number; reach: number; arc: number; knock: number; brush?: boolean }, kick = false, weapon?: WeaponId) {
  const inArc = (x: number, y: number, r: number) => {
    const d = dist(b.x, b.y, x, y);
    if (d > w.reach + r) return false;
    const off = Math.abs(wrapAngle(Math.atan2(y - b.y, x - b.x) - a));
    return d < r + 6 || off <= w.arc / 2;
  };
  const via = kick ? 'kick' : 'melee';
  if (kick) sim.engine.emit({ kind: 'kick', self: b });
  let hits = 0;
  const struck: Hornet[] = [];
  const broken: Hornet[] = [];
  for (const h of sim.hornets) {
    if (h.dead || h.air || h.under || !inArc(h.x, h.y, h.r)) continue;
    if (untouchable(sim, h, b, w.type)) {
      sim.events.push({ e: 'ghosted', x: h.x, y: h.y });
      continue;
    }
    hits++;
    struck.push(h);
    if (kick && h.boss) bossKicked(sim, h);
    const d = dist(b.x, b.y, h.x, h.y) || 1;
    // A boss barely budges; the lake flings; a Steady unit (Braced, Heavy) does not move at all.
    // A Steady unit (Braced, Heavy) does not move at all, unless it is Staggered.
    const kn = sim.engine.flag(h, 'steady') && !sim.stunned(h) ? 0 : w.knock * bossKnock(h) * (onIce(sim, h) ? ARENA.ice.knock : 1) * (kick ? slide(sim, h.x, h.y) : 1);
    h.vx += ((h.x - b.x) / d) * kn;
    h.vy += ((h.y - b.y) / d) * kn;
    if (kick && kn > 0) flingFoe(sim, h, b);
    else if (w.brush && kn > 0) brushFling(sim, h, b); // the Main Brush: small foes fly and crash (P58)
    h.cd = Math.max(h.cd, h.boss ? 0.1 : 0.5); // staggered: no sting straight back
    // A kick on a Frozen enemy shatters the ice: the status ends and it takes a full crash at the kick's speed (Minos 2026-10-19).
    const ice = kick && sim.engine.flag(h, 'frozen');
    if (ice) {
      sim.engine.strip(h, 'frozen');
      broken.push(h);
    }
    damageHornet(sim, h, ice ? crashDmg(w.knock) * crashMul(sim) : w.dmg, b, w.type ?? 'impact', { via, weapon });
    if (kick) bootSpur(sim, b, h); // Boot Spur (a weapon mod): the kicked foe takes the weapon's status
    if (kick && !h.boss && !h.dead && FOES[h.kind].pops) pop(sim, h, b);
  }
  for (const h of broken) shatter(sim, h, b);
  for (const n of sim.nests) {
    if (n.dead || !inArc(n.x, n.y - 10, NEST.r)) continue;
    hits++;
    damageNest(sim, n, w.dmg, b, w.type ?? 'impact', { via, weapon });
  }
  hits += swingBodies(sim, b, a, w, kick, inArc);
  if (sim.run?.swingWall(b.x, b.y, a, w.reach, w.arc)) hits++;
  sim.events.push({ e: 'swing', by: b, a, reach: w.reach, arc: w.arc, hits, ...(kick && { kick }) });
  if (kick) sim.noise(b.x, b.y);
  return struck;
}

/**
 * A Guard's saw stroke (`SAW`; Minos: the Guard fights with its saw): every foe and hive within reach in the arc toward `a` takes the hit,
 * `via: 'saw'` (Saw Teeth and the gear that reads `via` see it); nothing is knocked back or staggered. A prop in the arc is left alone.
 * Its damage is the bot's own (`damage` stat, a Berserker's included): the engine adds those in `strike`.
 */
export function sawStroke(sim: Sim, b: Bot, a: number) {
  const inArc = (x: number, y: number, r: number) => {
    const d = dist(b.x, b.y, x, y);
    return d <= SAW.reach + r && (d < r + 6 || Math.abs(wrapAngle(Math.atan2(y - b.y, x - b.x) - a)) <= SAW.arc / 2);
  };
  let hits = 0, near = Infinity;
  let at: { x: number; y: number } | null = null;
  const note = (x: number, y: number) => {
    const d = dist(b.x, b.y, x, y);
    if (d < near) {
      near = d;
      at = { x, y };
    }
  };
  for (const h of sim.hornets) {
    if (h.dead || h.air || h.under || !inArc(h.x, h.y, h.r)) continue;
    if (untouchable(sim, h, b, 'pierce')) {
      sim.events.push({ e: 'ghosted', x: h.x, y: h.y });
      continue;
    }
    hits++;
    note(h.x, h.y);
    damageHornet(sim, h, SAW.dmg, b, 'pierce', { via: 'saw' });
  }
  for (const n of sim.nests) {
    if (n.dead || !inArc(n.x, n.y - 10, NEST.r)) continue;
    hits++;
    note(n.x, n.y - 10);
    damageNest(sim, n, SAW.dmg, b, 'pierce', { via: 'saw' });
  }
  sim.events.push({ e: 'saw', by: b, a, reach: SAW.reach, arc: SAW.arc, hits, at });
  return hits;
}

/** The ice that was a Frozen enemy goes in shards: `SHATTER.shards` Pierce to every other enemy round it. */
export function shatter(sim: Sim, ice: Hornet, by: Bot) {
  sim.stats.shatters = (sim.stats.shatters ?? 0) + 1;
  sim.events.push({ e: 'shatter', x: ice.x, y: ice.y, r: SHATTER.radius });
  for (const h of sim.hornets) {
    if (h === ice || h.dead || h.air || h.under || dist(h.x, h.y, ice.x, ice.y) > SHATTER.radius + h.r) continue;
    damageHornet(sim, h, SHATTER.shards, by, 'pierce', { via: 'shatter' });
  }
}

/**
 * Hit an enemy through the engine: its family's weaknesses and resistances, the attacker's and the victim's statuses, armour,
 * the rider status. A hit with no `type` is plain (the world's, a test's). A boss takes less from the knight's shield side
 * (`bossGuard`) and nothing while a ghost, veiled or in the air. A kill lands in `hornetDown` through the engine's report.
 */
export function damageHornet(sim: Sim, h: Hornet, dmg: number, by: Bot | null, type?: DamageType, o: { via?: string; weapon?: string; kick?: boolean } = {}) {
  if (h.air || h.under || h.dead) return;
  if (h.sleep) wakeFoe(sim, h); // a hit wakes a place's sleeper (`placeparts.ts`)
  if (h.commute !== undefined) turnCrowd(sim, h, by); // a hit on a commuter turns its crowd (P31)
  if (untouchable(sim, h, by, type)) {
    sim.events.push({ e: 'ghosted', x: h.x, y: h.y });
    return;
  }
  if (blinks(sim, h, by, o.via, o.weapon)) return; // a twisted rattler blinks away from a slow blow (the Blinker counter)
  markedHit(sim, h, by); // a Spotter's crew is Keen on a Marked foe
  if (h.boss) dmg *= bossGuard(sim, h, by);
  else {
    dmg *= guardHit(sim, h, by, o.via);
    dmg *= beastGuard(sim, h, by, type, !!by && isFront(sim, h, by)); // P31: Armour plates, a Grounded officer
    if (dmg <= 0) return;
  }
  sim.engine.strike(by ?? undefined, h, { type: type ?? 'impact', amount: dmg, via: o.via, weapon: o.weapon, plain: !type });
  sim.drainFx();
  // Kill credit follows the damage (D34, "crash only"): a kick kill is a kill by crash damage from a kick (the foe kicked into something, or something kicked into it). The kick's own damage does not count.
  if (h.dead && o.via === 'crash' && o.kick) {
    sim.stats.kickKills++;
    sim.stats.crashKills++;
    if (h.elite) sim.stats.eliteCrashKills = (sim.stats.eliteCrashKills ?? 0) + 1;
  }
  // Quests (P38): the Communicator's own gun kills.
  if (h.dead && by === sim.controller && o.via === 'gun') sim.stats.gunKills = (sim.stats.gunKills ?? 0) + 1;
  if (h.dead && by === sim.controller && o.via === 'melee') sim.stats.meleeKills = (sim.stats.meleeKills ?? 0) + 1;
}

/** The Grapple's hook: the small foe at the spot (not an elite, not a boss) is reeled in to the one who fired, as the hookhand's harpoon does. */
function reel(sim: Sim, o: { x: number; y: number; owner: unknown }) {
  const by = o.owner as Bot;
  const h = sim.hornets.filter((f) => !f.dead && !f.boss && !f.elite && !f.under && !f.air && dist(f.x, f.y, o.x, o.y) < 24 + f.r).sort((p, q) => dist(p.x, p.y, o.x, o.y) - dist(q.x, q.y, o.x, o.y))[0];
  if (!h || sim.engine.flag(h, 'steady')) return;
  const d = dist(h.x, h.y, by.x, by.y) || 1;
  h.vx += ((by.x - h.x) / d) * -WEAPONS.hookhand.shove!;
  h.vy += ((by.y - h.y) / d) * -WEAPONS.hookhand.shove!;
  sim.events.push({ e: 'reel', h, by });
}

/** A kicked leech drone bursts (`FoeDef.pops`): it dies, and what it drank splashes the foes round it. */
export function pop(sim: Sim, h: Hornet, by: Bot) {
  const P = FOES[h.kind].pops!, r = 70;
  sim.events.push({ e: 'pop', h, r });
  damageHornet(sim, h, h.hp * 4 + 10, by, 'impact', { via: 'kick' });
  for (const o of sim.hornets) if (o !== h && !o.dead && dist(o.x, o.y, h.x, h.y) < r + o.r) damageHornet(sim, o, P, by, 'acid', { via: 'kick' });
}

/** A trail's hit on a foe it touches (the dash's burn). */
export function touch(sim: Sim, t: Trail, h: Hornet) {
  const act = (Array.isArray(t.then) ? t.then : [t.then]).find((a) => a.do === 'damage');
  if (untouchable(sim, h, t.owner, act && act.do === 'damage' ? act.type : undefined)) {
    sim.events.push({ e: 'ghosted', x: h.x, y: h.y });
    return;
  }
  sim.engine.touch(t.owner, h, t.then, { source: t.source, via: 'dash' });
  sim.drainFx();
}

/** Hit a hive through the engine, as a foe: the attacker's damage, crits and riders, its own armour. The report wakes it and, at the end, brings it down (`nestDown`). */
export function damageNest(sim: Sim, n: Nest, dmg: number, by: Bot | null, type?: DamageType, o: { via?: string; weapon?: string } = {}) {
  if (n.dead) return;
  sim.engine.strike(by ?? undefined, n, { type: type ?? 'impact', amount: dmg, via: o.via, weapon: o.weapon, plain: !type });
  sim.drainFx();
}

export function shoot(sim: Sim, b: Bot, tx: number, ty: number, w: { dmg: number; speed: number; range: number; type?: DamageType; knock?: number }) {
  const a = Math.atan2(ty - b.y, tx - b.x);
  const s: Shot = { type: w.type, pierce: Math.floor(sim.engine.stat(b, 'pierceShots', 0)), id: sim.nextId++, x: b.x + Math.cos(a) * 16, y: b.y - 8 + Math.sin(a) * 16, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, dmg: w.dmg, life: w.range / w.speed, dead: false, big: b.role === 'controller', by: b.id, foe: false, ...(w.knock && { knock: w.knock }) };
  // Over the Rocks (a punch card): a marksman's shot at a Marked foe flies over rock.
  if (b.climbs && sim.onRock(b)) s.high = true; // fired from a mesa (P53): it clears the rock it stands on
  if (b.role === 'marksman' && sim.engine.source(b, 'card:overTheRocks') && sim.hornets.some((h) => !h.dead && sim.engine.flag(h, 'marked') && dist(h.x, h.y, tx, ty) < h.r + 24)) s.over = true;
  sim.shots.push(s);
  b.face = Math.cos(a) >= 0 ? 1 : -1;
  sim.events.push({ e: 'shot', s, by: b });
  sim.noise(b.x, b.y);
  return s;
}

export function fire(sim: Sim, dt: number) {
  for (const s of sim.shots) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
    if (s.life <= 0) {
      s.dead = true;
      if (s.foe) landed(sim, s);
      continue;
    }
    if (s.blade) {
      bladeStep(sim, s, dt); // a thrown blade turns at a rock and comes back, striking each robot once a leg
      continue;
    }
    if (s.pigeon) {
      pigeonStep(sim, s, dt); // a brass pigeon (Pigeon Loft) homes on a foe and pecks
      continue;
    }
    if (!s.over && !(s.high && sim.climbable(sim.tileOf(s.x, s.y + 8))) && sim.blocked(s.x, s.y + 8)) {
      const prop = solidAt(sim, s.x, s.y + 8);
      if (prop) hitProp(sim, prop, s.dmg, { by: s.foe ? null : sim.bot(s.by), via: 'gun' });
      if (!s.foe) sim.run?.blow(s.x, s.y + 8);
      if (!s.foe && bounce(sim, s, dt)) continue; // Ricochet Cog: it turns back off the face it met
      s.dead = true;
      sim.events.push({ e: 'hit', x: s.x, y: s.y, on: 'rock', dmg: 0 });
      continue;
    }
    const rolling = shotAt(sim, s.x, s.y + 8);
    if (rolling) {
      // A kickable prop in the open (a barrel) takes the hit and stops the shot.
      hitProp(sim, rolling, s.dmg, { by: s.foe ? null : sim.bot(s.by), via: 'gun' });
      s.dead = true;
      continue;
    }
    if (s.foe) {
      // A boss's bolts: they hurt robots, and pass over hornets and hives.
      const hit = sim.bots.find((b) => !b.dead && !b.downed && dist(s.x, s.y, b.x, b.y - 10) < ROLES[b.role].r + 6);
      if (hit) {
        s.dead = true;
        if (s.web) snare(sim, hit, s.by);
        else hurt(sim, hit, s.dmg, false, { by: sim.hornets.find((x) => x.id === s.by), type: s.type, via: 'gun' });
        if (s.status && !hit.dead) sim.engine.apply(hit, s.status);
        landed(sim, s);
      }
      continue;
    }
    for (const h of sim.hornets) {
      if (h.dead || h.air || h.under || s.seen?.includes(h.id) || dist(s.x, s.y, h.x, h.y) > h.r + 5) continue;
    if (untouchable(sim, h, sim.bot(s.by), s.type)) {
      // Through a ghost: the shot flies on.
      if (!s.seen?.includes(h.id)) sim.events.push({ e: 'ghosted', x: h.x, y: h.y });
      (s.seen ??= []).push(h.id);
      continue;
    }
      // Keen: it may pass through more foes than one.
      const through = (s.pierce ?? 0) > 0;
      if (through) {
        s.pierce!--;
        (s.seen ??= []).push(h.id);
      } else s.dead = true;
      const by = sim.bot(s.by);
      damageHornet(sim, h, s.dmg, by, s.type ?? 'pierce', { via: 'gun', weapon: s.weapon });
      // A shove along the shot (the megaphone's blast), or a pull back to the shooter (the harpoon's reel).
      const W = s.weapon ? WEAPONS[s.weapon] : undefined;
      const sh = W?.shove !== undefined && W.fling ? W.shove / (W.pellets?.n ?? 1) : W?.shove; // Old Earful's shove is the whole cone's (`WeaponExtra.fling`)
      if (sh && !h.dead && !sim.engine.flag(h, 'steady')) {
        const v = Math.hypot(s.vx, s.vy) || 1, k = h.boss ? 0.12 : 1;
        h.vx += (s.vx / v) * sh * k;
        h.vy += (s.vy / v) * sh * k;
        if (sh < 0 && by) sim.events.push({ e: 'reel', h, by });
        // Old Earful (P52): the blast flings what it hits, so the crash is the Communicator's doing.
        if (sh > 0 && by && WEAPONS[s.weapon!].fling) flingFoe(sim, h, by, false);
      }
      if (h.dead && by?.role === 'guard') sim.deed('guard', 'cannonKill');
      // A Cannoneer's shell shoves the foe along its flight: it is flung, and what it crashes into is the Cannoneer's doing (`crash.ts`).
      if (s.knock && by && !h.dead && !(sim.engine.flag(h, 'steady') && !sim.stunned(h))) {
        const v = Math.hypot(s.vx, s.vy) || 1, kn = s.knock * bossKnock(h);
        h.vx += (s.vx / v) * kn;
        h.vy += (s.vy / v) * kn;
        flingFoe(sim, h, by, false);
      }
      if (!through) break;
    }
    if (s.dead) continue;
    for (const n of sim.nests) {
      if (n.dead || dist(s.x, s.y, n.x, n.y - 10) > NEST.r) continue;
      s.dead = true;
      const shooter = sim.bot(s.by);
      damageNest(sim, n, s.dmg, shooter, s.type ?? 'pierce', { via: 'gun', weapon: s.weapon });
      break;
    }
  }
}
