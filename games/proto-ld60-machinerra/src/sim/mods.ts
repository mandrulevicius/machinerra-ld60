/**
 * Weapon mods at work (P57; the table and numbers are `defs/mods.ts`, fitting is `gear.ts`). A mod changes how a weapon behaves,
 * so the rules here are the ones that are not a plain effect: a shot that is not the usual bolt (Bayonet Lug, Pressure Valve,
 * Gramophone Horn, Pigeon Loft, Echo Chamber), a bolt that bounces (Ricochet Cog), a swing that is not the usual swing (Flywheel,
 * Boomerang Gimbal), the boot (Boot Spur). The rest (Condenser Coil, Tuning Fork, Magnet Head, Grandfather Clock, Teapot
 * Governor, Lightning Rod) are engine effects on the weapon (`MODS[id].effects`) whose `spawn` actions land in `modSpawn`.
 *
 * Calls: `controller.ts` `weaponStep` (`stab`, `shotPlan`, `afterShot`, `swingPlan`), `combat.ts` (`fire`: `bounce`, `pigeonStep`;
 * `swing`: `bootSpur`; `onOut`: `modSpawn`), `Sim.step` (`modsStep`), `Sim.setGear` (`setFitted`). State is `sim.lug`; it dies with the
 * mission. A mod is on a weapon in a slot only (`slotMods`), and applies whichever slot that weapon is in.
 * Add a mod: its row in `defs/mods.ts` and, if it is not an effect, its rule here with one call in one of the places above.
 */
import { MOD, MODS, modOfBoss, type ModId } from './defs/mods';
import { WEAPONS, bossKnock, type GunWeapon, type MeleeWeapon, type WeaponId } from './defs';
import { RIDERS, canonType } from './effects';
import { damageHornet, damageNest, shoot } from './combat';
import { flingFoe } from './crash';
import { slotMods, type Gear } from './gear';
import { dist, wrapAngle } from './geom';
import { hitProp } from './props';
import type { Sim } from './sim';
import type { Bot, Hornet, Shot } from './types';

/** What a mod shows the views: a `chord` cone (heading `a`, `r`), a `pigeon` loosed or pecking, an `echo`, a `stab`, a `throw` and `catch` of the Gimbal, a `ring` of the Fork, a stopped `clock`, a `whistle` at full steam, a `skybolt`, a `valve` release, the valve `armed` after its quiet second. */
export type ModFx = 'chord' | 'pigeon' | 'peck' | 'echo' | 'stab' | 'throw' | 'catch' | 'ring' | 'clock' | 'whistle' | 'skybolt' | 'valve' | 'armed' | 'refund' | 'magnet';
export type ModEvent =
  | { e: 'mod'; what: ModFx; x: number; y: number; a?: number; r?: number }
  /** A boss fell and its cache holds a wild mod (`modOfBoss`): the scene puts it in the inventory if it is not owned yet (`gearview.ts`). */
  | { e: 'modFound'; mod: ModId; x: number; y: number };

/** A bolt to fire again (Echo Chamber): the shot as it left, from where he stood. */
interface Echo { t: number; s: Shot }
/** The Gimbal's thrown weapon in flight. */
export interface Boom { weapon: WeaponId; x: number; y: number; a: number; out: boolean; d: number; hit: Set<unknown>; spin: number; t: number }
/** A shot's plan: what kind it is and how many shots of steam it costs. */
export interface Plan { kind: 'bolt' | 'valve' | 'chord' | 'pigeon'; mult: number }

export interface LugState {
  /** The mods fitted on the weapons in the slots, by weapon. */
  fitted: Partial<Record<WeaponId, ModId[]>>;
  /** Shots fired and swings made, by mod (the nth shot is a chord, the nth swing a throw). */
  n: Partial<Record<ModId, number>>;
  /** Seconds since a gun was last fired (Pressure Valve). */
  quiet: number;
  /** Flywheel: swings in a row and when the last was. */
  fly: { n: number; t: number };
  echoes: Echo[];
  boom: Boom | null;
  /** The steam the last shot cost (Condenser Coil gives it back). */
  cost: number;
  /** Steam was full last step (the Teapot's whistle starts once). */
  full: boolean;
  /** The wild mods the bosses felled this mission held. */
  found: ModId[];
}

export const freshLugs = (): LugState => ({ fitted: {}, n: {}, quiet: 0, fly: { n: 0, t: -Infinity }, echoes: [], boom: null, cost: 0, full: false, found: [] });

/** The mods on the weapons in the slots, from the gear (`Sim.setGear`). */
export function setFitted(sim: Sim, g: Gear) {
  sim.lug.fitted = slotMods(g);
}
export const hasMod = (sim: Sim, w: WeaponId | null | undefined, m: ModId) => !!w && !!sim.lug.fitted[w]?.includes(m);
/** The weapons in hand (either slot) that carry this mod. */
const carrying = (sim: Sim, m: ModId): WeaponId[] => ([sim.weapon, sim.secondary].filter((w) => w && hasMod(sim, w, m)) as WeaponId[]).filter((w, i, a) => a.indexOf(w) === i);
const event = (sim: Sim, what: ModFx, x: number, y: number, extra: { a?: number; r?: number } = {}) => sim.events.push({ e: 'mod', what, x, y, ...extra });
const live = (h: Hornet) => !h.dead && !h.air && !h.under;
const angleTo = (c: Bot, h: { x: number; y: number }) => Math.atan2(h.y - c.y, h.x - c.x);

// ---- The gun: stab, plan, the shot after -------------------------------------------------------------------------------

/** Bayonet Lug: a foe within `reach` of him, on the side he aims, is stabbed instead of shot: the gun's damage as a melee hit and a big shove. True when it did. */
export function stab(sim: Sim, c: Bot, id: WeaponId, a: number): boolean {
  if (!hasMod(sim, id, 'bayonetLug')) return false;
  const near = sim.hornets
    .filter((h) => live(h) && dist(c.x, c.y, h.x, h.y) <= MOD.bayonet.reach + h.r && Math.abs(wrapAngle(angleTo(c, h) - a)) <= Math.PI / 2)
    .sort((p, q) => dist(c.x, c.y, p.x, p.y) - dist(c.x, c.y, q.x, q.y))[0];
  if (!near) return false;
  const w = WEAPONS[id];
  const d = dist(c.x, c.y, near.x, near.y) || 1;
  if (!(sim.engine.flag(near, 'steady') && !sim.stunned(near))) {
    near.vx += ((near.x - c.x) / d) * MOD.bayonet.knock * bossKnock(near);
    near.vy += ((near.y - c.y) / d) * MOD.bayonet.knock * bossKnock(near);
    flingFoe(sim, near, c, false);
  }
  near.cd = Math.max(near.cd, near.boss ? 0.1 : 0.5);
  event(sim, 'stab', c.x, c.y, { a: angleTo(c, near), r: MOD.bayonet.reach });
  damageHornet(sim, near, w.dmg, c, w.type, { via: 'melee', weapon: id });
  sim.noise(c.x, c.y);
  return true;
}

/**
 * What the next shot of this gun is. Chord and pigeon come on their count, the valve after a quiet second with the steam for it;
 * otherwise a bolt. (The counts advance in `afterShot`, when it is fired.)
 */
export function shotPlan(sim: Sim, c: Bot, id: WeaponId): Plan {
  const nth = (m: ModId, every: number) => hasMod(sim, id, m) && ((sim.lug.n[m] ?? 0) + 1) % every === 0;
  if (nth('gramophoneHorn', MOD.chord.every)) return { kind: 'chord', mult: 1 };
  if (nth('pigeonLoft', MOD.pigeon.every)) return { kind: 'pigeon', mult: 1 };
  if (hasMod(sim, id, 'pressureValve') && sim.lug.quiet >= MOD.valve.idle && WEAPONS[id].ammo !== 'scrap' && c.steam >= sim.cfg.steamShot * sim.engine.stat(c, 'steamCost', 1) * MOD.valve.cost) return { kind: 'valve', mult: MOD.valve.cost };
  return { kind: 'bolt', mult: 1 };
}

/** A bolt just left the muzzle: a valve bolt hits harder and pierces everything, a Ricochet Cog's bounces once. */
export function modBolt(sim: Sim, id: WeaponId, s: Shot, plan: Plan) {
  if (plan.kind === 'valve') {
    s.dmg *= MOD.valve.dmg;
    s.pierce = 99;
    s.valve = true;
  }
  if (hasMod(sim, id, 'ricochetCog')) s.ric = MOD.ricochet.bounces;
}

/** Gramophone Horn: the chord, a cone of sound in front of him that Staggers and shoves everything in it (and flings it: its crashes are his). */
export function chord(sim: Sim, c: Bot, a: number) {
  event(sim, 'chord', c.x, c.y, { a, r: MOD.chord.r });
  for (const h of sim.hornets) {
    if (!live(h)) continue;
    const d = dist(c.x, c.y, h.x, h.y);
    if (d > MOD.chord.r + h.r || (d > h.r + 6 && Math.abs(wrapAngle(angleTo(c, h) - a)) > MOD.chord.arc / 2)) continue;
    sim.engine.apply(h, 'staggered', { by: c, duration: MOD.chord.stagger });
    if (sim.engine.flag(h, 'steady') && !sim.stunned(h)) continue;
    h.vx += ((h.x - c.x) / (d || 1)) * MOD.chord.knock * bossKnock(h);
    h.vy += ((h.y - c.y) / (d || 1)) * MOD.chord.knock * bossKnock(h);
    flingFoe(sim, h, c, false);
    h.cd = Math.max(h.cd, h.boss ? 0.1 : 0.5);
  }
  sim.noise(c.x, c.y);
}

/** Pigeon Loft: loose a brass pigeon; it homes on the nearest foe (`pigeonStep`). */
export function loosePigeon(sim: Sim, c: Bot, id: WeaponId, a: number, g: { dmg: number; type?: Shot['type'] }) {
  const s = shoot(sim, c, c.x + Math.cos(a) * 100, c.y + Math.sin(a) * 100, { dmg: g.dmg * MOD.pigeon.dmg, speed: MOD.pigeon.speed, range: MOD.pigeon.speed * MOD.pigeon.life, type: g.type });
  s.weapon = id;
  s.pigeon = { to: 0, pecks: MOD.pigeon.pecks, t: 0 };
  s.big = false;
  event(sim, 'pigeon', c.x, c.y, { a });
}

/** The nearest foe a pigeon can go for. */
const prey = (sim: Sim, x: number, y: number) =>
  sim.hornets.filter((h) => live(h)).sort((p, q) => dist(x, y, p.x, p.y) - dist(x, y, q.x, q.y))[0];

/** A pigeon in flight: it turns toward the nearest foe, lands on it, pecks `pecks` times and Marks it, then is gone. */
export function pigeonStep(sim: Sim, s: Shot, dt: number) {
  const P = s.pigeon!;
  const by = sim.bot(s.by);
  let h = sim.hornets.find((x) => x.id === P.to && live(x));
  if (!h) {
    h = prey(sim, s.x, s.y);
    P.to = h?.id ?? 0;
  }
  if (!h || !by) {
    s.dead = true;
    return;
  }
  const d = dist(s.x, s.y, h.x, h.y);
  if (d <= h.r + 8) {
    // Perched: it rides the foe and pecks.
    s.vx = s.vy = 0;
    s.x = h.x + Math.cos(P.pecks * 2.1) * (h.r * 0.5);
    s.y = h.y - h.r * 0.8;
    s.life = Math.max(s.life, 0.5);
    P.t -= dt;
    if (P.t <= 0) {
      P.t = MOD.pigeon.peck;
      P.pecks--;
      event(sim, 'peck', h.x, h.y);
      damageHornet(sim, h, s.dmg, by, s.type ?? 'pierce', { via: 'gun', weapon: s.weapon });
      if (P.pecks <= 0) {
        if (!h.dead) sim.engine.apply(h, 'marked', { by });
        s.dead = true;
      }
    }
    return;
  }
  // Steer: turn toward it at a limited rate, at a constant speed.
  const sp = Math.hypot(s.vx, s.vy) || MOD.pigeon.speed;
  const turn = wrapAngle(Math.atan2(h.y - s.y, h.x - s.x) - Math.atan2(s.vy, s.vx));
  const a = Math.atan2(s.vy, s.vx) + Math.max(-MOD.pigeon.turn * dt, Math.min(MOD.pigeon.turn * dt, turn));
  s.vx = Math.cos(a) * sp;
  s.vy = Math.sin(a) * sp;
}

/** After a shot left: the counts advance, the quiet starts over, Echo Chamber queues the bolts to fire again, Condenser Coil remembers the cost. */
export function afterShot(sim: Sim, id: WeaponId, plan: Plan, cost: number, bolts: Shot[]) {
  const L = sim.lug;
  L.quiet = 0;
  L.cost = cost;
  for (const m of ['gramophoneHorn', 'pigeonLoft'] as const) if (hasMod(sim, id, m)) L.n[m] = (L.n[m] ?? 0) + 1;
  if (plan.kind === 'valve') event(sim, 'valve', sim.controller.x, sim.controller.y);
  if (plan.kind !== 'bolt' && plan.kind !== 'valve') return;
  if (hasMod(sim, id, 'echoChamber')) for (const s of bolts) L.echoes.push({ t: MOD.echo.delay, s: { ...s, seen: undefined } });
}

// ---- Ricochet ------------------------------------------------------------------------------------------------------------

/** A bolt with a bounce left meets a wall, rock or prop: it turns back off the face it hit. True when it did (the shot goes on). */
export function bounce(sim: Sim, s: Shot, dt: number): boolean {
  if (!s.ric || s.ric <= 0) return false;
  const px = s.x - s.vx * dt, py = s.y - s.vy * dt;
  // The face it met: blocked going sideways only flips x, going up or down only y, a corner both.
  const sx = sim.blocked(px + s.vx * dt, py + 8) && !sim.blocked(px, py + 8 + s.vy * dt);
  const sy = sim.blocked(px, py + 8 + s.vy * dt) && !sim.blocked(px + s.vx * dt, py + 8);
  if (sx) s.vx = -s.vx;
  else if (sy) s.vy = -s.vy;
  else {
    s.vx = -s.vx;
    s.vy = -s.vy;
  }
  s.x = px;
  s.y = py;
  s.ric--;
  s.seen = undefined;
  sim.events.push({ e: 'hit', x: px, y: py, on: 'rock', dmg: 0 });
  return true;
}

// ---- The melee weapon: the Flywheel, the Gimbal --------------------------------------------------------------------------

/**
 * A swing is about to be made: how much faster the weapon is for the one after (Flywheel), and whether this swing is the throw
 * (Boomerang Gimbal). `null` means the weapon is out (thrown) and cannot swing.
 */
export function swingPlan(sim: Sim, id: WeaponId): { speed: number; throwIt: boolean } | null {
  const L = sim.lug;
  if (L.boom?.weapon === id) return null;
  let speed = 1;
  if (hasMod(sim, id, 'flywheel')) {
    L.fly.n = sim.time - L.fly.t <= MOD.flywheel.idle ? Math.min(MOD.flywheel.max, L.fly.n + 1) : 0;
    L.fly.t = sim.time;
    speed = 1 + MOD.flywheel.step * L.fly.n;
  }
  let throwIt = false;
  if (hasMod(sim, id, 'boomerangGimbal')) {
    L.n.boomerangGimbal = (L.n.boomerangGimbal ?? 0) + 1;
    throwIt = L.n.boomerangGimbal % MOD.boomerang.every === 0;
  }
  return { speed, throwIt };
}

/** Throw the weapon: it spins out `dist` px toward the aim and back to him. */
export function throwWeapon(sim: Sim, c: Bot, id: WeaponId, a: number) {
  sim.lug.boom = { weapon: id, x: c.x, y: c.y, a, out: true, d: 0, hit: new Set(), spin: 0, t: 0 };
  event(sim, 'throw', c.x, c.y, { a });
  sim.noise(c.x, c.y);
}

/** The thrown weapon: out to its distance, then home to wherever he is now; it strikes each foe, hive and prop once a leg. */
function boomStep(sim: Sim, c: Bot, dt: number) {
  const b = sim.lug.boom!;
  const w = WEAPONS[b.weapon] as MeleeWeapon | GunWeapon;
  b.t += dt;
  b.spin += dt * 22;
  const step = MOD.boomerang.speed * dt;
  if (b.out) {
    b.x += Math.cos(b.a) * step;
    b.y += Math.sin(b.a) * step;
    b.d += step;
    const stopped = sim.blocked(b.x, b.y + 8);
    if (b.d >= MOD.boomerang.dist || stopped) {
      b.out = false;
      b.hit = new Set();
    }
  } else {
    const d = dist(b.x, b.y, c.x, c.y);
    if (d <= step + 14 || b.t > 6) {
      sim.lug.boom = null;
      event(sim, 'catch', c.x, c.y);
      return;
    }
    b.x += ((c.x - b.x) / d) * step;
    b.y += ((c.y - b.y) / d) * step;
  }
  const dir = b.out ? b.a : Math.atan2(c.y - b.y, c.x - b.x);
  const knock = (w.kind === 'melee' ? w.knock : 200) * 0.6;
  for (const h of sim.hornets) {
    if (!live(h) || b.hit.has(h) || dist(b.x, b.y, h.x, h.y) > MOD.boomerang.r + h.r) continue;
    b.hit.add(h);
    if (!(sim.engine.flag(h, 'steady') && !sim.stunned(h))) {
      h.vx += Math.cos(dir) * knock * bossKnock(h);
      h.vy += Math.sin(dir) * knock * bossKnock(h);
    }
    h.cd = Math.max(h.cd, h.boss ? 0.1 : 0.5);
    damageHornet(sim, h, w.dmg, c, w.type ?? 'impact', { via: 'melee', weapon: b.weapon });
  }
  for (const n of sim.nests) {
    if (n.dead || b.hit.has(n) || dist(b.x, b.y, n.x, n.y - 10) > MOD.boomerang.r + 40) continue;
    b.hit.add(n);
    damageNest(sim, n, w.dmg, c, w.type ?? 'impact', { via: 'melee', weapon: b.weapon });
  }
  for (const p of [...sim.props.list]) {
    if (p.broken || b.hit.has(p) || dist(b.x, b.y, p.x, p.y) > MOD.boomerang.r + p.r) continue;
    b.hit.add(p);
    hitProp(sim, p, w.dmg, { by: c, via: 'melee' });
  }
}

// ---- The boot ------------------------------------------------------------------------------------------------------------

/** Boot Spur: the kicked foe takes the status of the damage type of each weapon in hand that wears one (a tazer: Shocked). */
export function bootSpur(sim: Sim, c: Bot, h: Hornet) {
  if (h.dead) return;
  for (const w of carrying(sim, 'bootSpur')) sim.engine.apply(h, RIDERS[canonType(WEAPONS[w].type)], { by: c, stacks: MOD.spur.stacks });
}

// ---- Effects' spawns, the step ---------------------------------------------------------------------------------------------

const SPAWNS = new Set(['refund', 'magnet', 'teapot', 'skybolt', 'ring', 'clock']);
export const isModSpawn = (what: string) => SPAWNS.has(what);

/** What a mod effect's `spawn` does (the engine can say it; only the Sim can steam, pull loot or show it). */
export function modSpawn(sim: Sim, o: { what: string; x: number; y: number; owner: unknown }) {
  const c = sim.controller;
  switch (o.what) {
    case 'refund': // Condenser Coil: that shot's steam back
      c.steam = Math.min(c.maxSteam, c.steam + sim.lug.cost);
      event(sim, 'refund', c.x, c.y);
      break;
    case 'magnet': // Magnet Head: the loot within reach slides to him
      for (const l of sim.loot) if (!l.dead && dist(l.x, l.y, c.x, c.y) <= MOD.magnet.r) l.pull = MOD.magnet.time;
      event(sim, 'magnet', c.x, c.y, { r: MOD.magnet.r });
      break;
    case 'teapot': // Teapot Governor: the burst spends half the steam
      c.steam = Math.max(0, c.steam - c.maxSteam * MOD.teapot.spend);
      c.steamT = Math.max(c.steamT, 0.45);
      event(sim, 'whistle', o.x, o.y, { r: MOD.teapot.r });
      break;
    case 'skybolt': // Lightning Rod
      event(sim, 'skybolt', o.x, o.y);
      break;
    case 'ring': // Tuning Fork
      event(sim, 'ring', o.x, o.y, { r: MOD.fork.r });
      break;
    case 'clock': // Grandfather Clock
      event(sim, 'clock', o.x, o.y, { r: MOD.clock.r });
      break;
  }
}

/** Every step: the quiet grows, the Echo Chamber's bolts fire, the thrown weapon flies, the Flywheel winds down, the Teapot whistles at full steam. */
export function modsStep(sim: Sim, dt: number) {
  const L = sim.lug, c = sim.controller;
  const was = L.quiet;
  L.quiet += dt;
  if (was < MOD.valve.idle && L.quiet >= MOD.valve.idle && carrying(sim, 'pressureValve').length) event(sim, 'armed', c.x, c.y);
  for (let i = L.echoes.length - 1; i >= 0; i--) {
    const e = L.echoes[i];
    if ((e.t -= dt) > 0) continue;
    L.echoes.splice(i, 1);
    const s: Shot = { ...e.s, id: sim.nextId++, dead: false, life: e.s.life };
    sim.shots.push(s);
    sim.events.push({ e: 'shot', s, by: c });
    event(sim, 'echo', s.x, s.y, { a: Math.atan2(s.vy, s.vx) });
  }
  if (L.boom) boomStep(sim, c, dt);
  const full = c.steam >= c.maxSteam - 0.5 && carrying(sim, 'teapotGovernor').length > 0;
  if (full && !L.full) event(sim, 'whistle', c.x, c.y);
  L.full = full;
}

/** A boss fell: its first cache holds its wild mod, if it has one (the views and the gear take it from the event). */
export function bossCache(sim: Sim, h: Hornet) {
  const mod = modOfBoss(h.kind);
  if (!mod) return;
  sim.lug.found.push(mod);
  sim.events.push({ e: 'modFound', mod, x: h.x, y: h.y });
}

/** `debugState()`: the mods fitted and what is counting. */
export function lugSummary(sim: Sim) {
  const L = sim.lug;
  return { fitted: L.fitted, n: L.n, quiet: Math.round(L.quiet * 10) / 10, fly: L.fly.n, echoes: L.echoes.length, boom: L.boom ? { weapon: L.boom.weapon, d: Math.round(L.boom.d), out: L.boom.out } : null, names: Object.values(L.fitted).flat().map((m) => MODS[m!].name) };
}
