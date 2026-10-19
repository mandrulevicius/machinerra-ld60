/**
 * Enemy tiers and elite traits (P12; numbers in `TIER`, `FOE_TIERS`, `ELITE_TRAITS` in defs.ts). A tier adds abilities,
 * never health; an elite is a named trait (two at a tier III landing) that drops the trait's part. Traits are effect
 * sources on the enemy's engine unit where the engine can say them (Drummer, Thorns, Mirror shell, Leech, Overclock,
 * Broadcaster) and behaviour here where it cannot (the front guard, the splitting, the calls). Plain rules, no Phaser;
 * `Sim` calls in at spawn (`outfit`), at a hit (`guardHit`), at a death (`onDown`), and each step for an enemy (`think`).
 *
 * Built: Dive, Formation (hornets); Burrow and ambush (Crawlcam, Rattler), Web carpet, Acid spit; Bloodlust, Scythe throw
 * (swarmers); Plasma puddles, Shield (drones); every trait. Each damaging move has a tell the view draws before it lands:
 * the dig's ring on the sand, the rearing and its line before a spit or a throw, the mortar's closing ring. Ground hazards
 * are patches (`TierWorld.patches`): they apply engine statuses (Rooted, Burning) to robots inside; a thrown blade is a shot
 * (`Shot.blade`) that turns and comes back; the burrowed are `Hornet.under` (nothing reaches them). `act` runs for an enemy
 * each step after `think` and says whether it holds still (a tell, a dig, a rest).
 *
 * P13: the twisted forms' own effects (`twistDash`: a hornet's Dark streak and a rattler's acid pool; `twistSource`: a swarmer's
 * hits; `twistShot`: a Crawlcam's scalding cable; a drone's bolts split in `landed`; numbers `TWIST_FX`), the menace levels' reads
 * (`dashCount`, `eliteChance`, `traitCount`; `MENACE`) and damage states (`breakCheck`, called from the hit path in `combat.ts`: an elite
 * or a boss without a form breaks at 66% and 33% of its oil, `BREAKS` says what it loses, `formBreak` is a form boss's one break).
 */
import type { Rng } from '../../../../harness/kit/rng';
import { BREAK, BREAKS, CUT, ELITE_TRAITS, ENEMY_PARTS, FOES, FOE_TIERS, GENERIC_BREAKS, HORNET, KIND_COUNTERS, MENACE, ROLES, STALKER, T, TIER, TRAITS_OF, TWISTED, TWIST_BEAST, TWIST_FX, WEAPON, WEAPONS, bossOf, countersOf, type BreakDef, type BreakId, type DamageType, type Enemy, type PartKind, type TierAbility, type TraitId, type WeaponId } from './defs';
import type { Source, StatusId } from './effects';
import { drop } from './loot';
import { foeType } from './missionfx';
import { say } from './oracle';
import { clearLine } from './path';
import type { Bot, Hornet, Shot, Sim } from './sim';
import { dist } from './geom';
import type { BerserkMul } from './clock';
import { limbsCancel, limbsStep } from './limbs';
import { beastChain, beastDown, beastSpawn, modLunge, screamStep } from './beasts';

/** A dig: sinking, travelling hidden, marking its spot (`tell`), then resting once it is up. The spot (`tx`, `ty`) is where the robot stood when the mark was made. */
export interface Dig { mode: 'sink' | 'under' | 'tell' | 'rest'; t: number; tx: number; ty: number }
/** A rearing before a spit or a throw: the spot it will aim at (locked for the last `lock` s) and the seconds left. */
export interface Rear { t: number; ax: number; ay: number }
/** A mortar shell in the air: where it lands and the seconds until it does. */
export interface Shell { x: number; y: number; t: number }
/** What a tier-aware enemy keeps beyond a plain one's state. */
export interface TierState {
  called: boolean;
  brooded: boolean;
  /** Seconds until it may dig, spit, throw or lob again. */
  digT: number;
  spitT: number;
  throwT: number;
  lobT: number;
  dig?: Dig;
  spit?: Rear;
  throw?: Rear;
  shell?: Shell;
}

/** A blade in flight: out for `out` s, then back to its thrower (`owner`), striking each robot once a leg (`hit`). */
export interface Blade { out: number; back: boolean; hit: number[]; owner: number }
/** What a landed shot leaves on the ground. */
export type Lay = 'web' | 'puddle' | 'streak' | 'pool' | 'hooves';
/** A patch on the ground: shown at once, live after `arm` s, then lasting `life` s; `seen` is when each robot last got its status. A streak (a twisted hornet's dash) runs from (`x`, `y`) to (`x2`, `y2`). */
export interface Patch { id: number; kind: Lay; x: number; y: number; x2?: number; y2?: number; r: number; life: number; arm: number; seen: Map<number, number> }

export const tierOf = (h: Hornet) => h.tier ?? 1;
export const hasTrait = (h: Hornet, t: TraitId) => !!h.traits?.includes(t);
/** The tier abilities an enemy has now: the first at II, both at III. */
export const abilitiesOf = (h: Hornet): TierAbility[] => (FOE_TIERS[h.kind] ?? []).slice(0, Math.max(0, tierOf(h) - 1));
export const hasAbility = (h: Hornet, a: TierAbility) => abilitiesOf(h).includes(a);

const state = (sim: Sim, h: Hornet): TierState => (h.ts ??= { called: false, brooded: false, digT: sim.tiers.r.range(1, 3), spitT: sim.tiers.r.range(1, 2.5), throwT: sim.tiers.r.range(1, 2.5), lobT: sim.tiers.r.range(1, 3) });

/** The tier a new enemy of this kind has: the land's, or (a quarter of the time, above I) one below. Kinds without tier abilities stay I. */
export function rollTier(sim: Sim, kind: Enemy): number {
  if (!FOE_TIERS[kind]) return 1;
  const t = sim.tier;
  return t > 1 && sim.tiers.r.chance(TIER.lower) ? t - 1 : t;
}

/** How many traits an elite rolls on this land, and at the night's menace level 4 and up (two at least). */
export const traitCount = (sim: Sim) => Math.max(TIER.traits[Math.min(3, Math.max(1, sim.tier)) - 1], sim.level >= MENACE.traits ? 2 : 1);

/**
 * How likely an elite is now: none in the morning; from the day's start the land's chance (`cfg.eliteChance`) rises linearly from
 * `HORNET.elite.start` of it to all of it at dusk and holds; doubled from menace level 3.
 */
export const eliteChance = (sim: Sim) => {
  const { day, evening } = sim.day.at;
  if (sim.day.phase === 'morning') return 0;
  const p = Math.min(1, Math.max(0, (sim.dayT - day) / Math.max(1, evening - day)));
  return sim.cfg.eliteChance * (HORNET.elite.start + (1 - HORNET.elite.start) * p) * (sim.level >= MENACE.elite ? 2 : 1) * sim.mods.elite;
};

/** `n` different traits of a kind (fewer if it has fewer). */
export function rollTraits(sim: Sim, kind: Enemy, n: number): TraitId[] {
  const pool = [...(TRAITS_OF[kind] ?? [])];
  const out: TraitId[] = [];
  while (out.length < n && pool.length) out.push(...pool.splice(sim.tiers.r.int(0, pool.length - 1), 1));
  return out;
}

/** The effect source of a trait the engine can say, or null (the sim does the rest). */
export function traitSource(t: TraitId): Source | null {
  const id = `trait:${t}`, name = ELITE_TRAITS[t].name;
  const base = { id, kind: 'trait' as const, name };
  switch (t) {
    case 'drummer':
      return { ...base, effects: [{ when: 'tick', cd: TIER.drummer.every, do: { do: 'pulse', radius: TIER.drummer.radius, side: 'ally', then: { do: 'status', id: 'haste', to: 'target', duration: TIER.drummer.time } } }] };
    case 'carapace':
      // Thorns: flat damage back for each melee hit taken (a kick or a gun is the answer).
      return { ...base, effects: [{ when: 'hurt', cd: 0, if: { is: 'via', via: ['melee', 'saw'] }, do: { do: 'damage', type: 'pierce', amount: TIER.thorns, to: 'target' } }] };
    case 'bulwark':
      // Mirror shell: a share of every shot's damage goes back at the shooter.
      return { ...base, effects: [{ when: 'hurt', cd: TIER.mirror.cd, if: { is: 'via', via: 'gun' }, do: { do: 'damage', type: 'pierce', ofEvent: TIER.mirror.share, to: 'target' } }] };
    case 'broadcaster':
      return { ...base, effects: [{ when: 'tick', cd: TIER.broadcaster.every, do: { do: 'pulse', radius: TIER.broadcaster.radius, side: 'foe', then: { do: 'status', id: 'taunted', to: 'target', duration: TIER.broadcaster.time } } }] };
    case 'leech':
      // It drinks what it deals, and (the Mender counter) mends the enemies round it faster than a Burning ticks.
      return { ...base, effects: [{ when: 'hit', cd: 0, do: { do: 'heal', ofEvent: TIER.leech } }, { when: 'tick', cd: TIER.mender.every, do: { do: 'pulse', radius: TIER.mender.radius, side: 'ally', then: { do: 'heal', amount: TIER.mender.amount, to: 'target' } } }] };
    case 'overclock':
      return { ...base, effects: [{ when: 'always', if: { is: 'hp', below: TIER.overclock.below, of: 'self' }, do: [{ do: 'stat', stat: 'attackRate', pct: TIER.overclock.rate }, { do: 'stat', stat: 'speed', pct: TIER.overclock.speed }] }] };
    default:
      return null;
  }
}

/** A new enemy gets its tier and (an elite) its traits; the engine gets the sources. `o` forces either (the dev commands, tests). */
export function outfit(sim: Sim, h: Hornet, o: { tier?: number; traits?: TraitId[] } = {}) {
  h.tier = o.tier ?? rollTier(sim, h.kind);
  if (h.elite && TRAITS_OF[h.kind]) h.traits = o.traits ?? rollTraits(sim, h.kind, traitCount(sim));
  dress(sim, h);
  beastSpawn(sim, h); // P31: a biome kind's mods (D32) and counters
}
function dress(sim: Sim, h: Hornet) {
  for (const t of h.traits ?? []) {
    const s = traitSource(t);
    if (s) sim.engine.addSource(h, s);
  }
}

/** Heavy: a Warden of tier III is Steady, so a kick and a crash do not move it until it is Staggered (`steady` is read where knockback is). */
const HEAVY: Source = { id: 'counter:heavy', kind: 'trait', name: 'Heavy', effects: [{ when: 'always', do: { do: 'flag', flag: 'steady' } }] };

/** Give or take away a Warden's Heavy by its tier (P18 makes the Wardens; `setTier` calls this when the land's tier changes). */
export function heavyCheck(sim: Sim, h: Hornet) {
  if (!h.warden) return;
  sim.engine.removeSource(h, HEAVY.id);
  if (tierOf(h) >= 3) sim.engine.addSource(h, HEAVY);
}

/** An enemy is a Warden (P18): it carries Heavy at tier III. */
export function warden(sim: Sim, h: Hornet) {
  h.warden = true;
  heavyCheck(sim, h);
}

/** The parts an elite drops: its traits' (both with two). Empty without traits: the kind's own table applies. */
export const traitParts = (h: Hornet): PartKind[] => (h.traits ?? []).map((t) => ELITE_TRAITS[t].part);

/** The dash an enemy winds up: the twisted form's, the kind's own lunge, a Twin-blade's, or a tier II hornet's Dive. */
export function foeDash(h: Hornet) {
  if (hasBreak(h, 'noDash')) return undefined;
  if (h.twisted) return TWISTED[h.kind].dash;
  const L = FOES[h.kind].lunge;
  if (L) return modLunge(h, L); // P31: Spring legs leap farther
  return (hasTrait(h, 'twinBlade') ? TIER.twin : hasAbility(h, 'dive') ? TIER.dive : undefined);
}
/** Dashes chained once a wind-up ends: one, a Twin-blade's second, and a twisted one's second from menace level 2. */
export const dashCount = (h: Hornet, level: number) => 1 + (h.twisted && level >= MENACE.chain ? 1 : 0) + (hasTrait(h, 'twinBlade') ? 1 : 0) + beastChain(h); // P31: a twisted pounce-cat leaps twice, a twisted ram-goat charges twice

/** Formation: tier III hornets near one that begins a dash begin theirs (a pack of three). */
export function formation(sim: Sim, h: Hornet, tell: number, left: number) {
  if (!hasAbility(h, 'formation')) return;
  let n = 1;
  for (const o of sim.hornets) {
    if (n >= TIER.formation.pack) break;
    if (o === h || o.dead || o.boss || o.kind !== h.kind || !hasAbility(o, 'formation') || !o.target || o.brain.state !== 'roam' || dist(h.x, h.y, o.x, o.y) > TIER.formation.radius) continue;
    o.brain.state = 'tell';
    o.brain.t = tell;
    o.brain.left = left;
    sim.events.push({ e: 'tell', h: o });
    n++;
  }
}

export const isFront = (sim: Sim, h: Hornet, by: Bot) => {
  const t = sim.bot(h.target);
  const fx = t ? t.x - h.x : h.vx, fy = t ? t.y - h.y : h.vy;
  const ax = by.x - h.x, ay = by.y - h.y;
  const m = Math.hypot(fx, fy) * Math.hypot(ax, ay);
  return m > 0 && (fx * ax + fy * ay) / m > TIER.guard.cone;
};

/**
 * The share of a hit an enemy takes: a Carapace takes 30% of what comes from the front, a Hooded none, and a tier III
 * drone's Shield halves it for allies within its reach. A kick goes through a Carapace and flips it (stunned). Hits from
 * the flank or behind, and everything but a robot's blow (burning, trails, support) are whole.
 */
export function guardHit(sim: Sim, h: Hornet, by: Bot | null | undefined, via?: string): number {
  if (!by || h.boss || !isFront(sim, h, by)) return 1;
  let m = 1;
  if (hasTrait(h, 'carapace')) {
    if (via === 'kick') {
      sim.engine.apply(h, 'staggered', { duration: TIER.guard.flip });
      sim.events.push({ e: 'tier', what: 'flip', x: h.x, y: h.y, h });
    } else m = TIER.guard.carapace;
  }
  if (hasTrait(h, 'hooded')) m = Math.min(m, TIER.guard.hooded);
  for (const o of sim.hornets)
    if (!o.dead && hasAbility(o, 'frontShield') && dist(o.x, o.y, h.x, h.y) <= TIER.frontShield.radius) m = Math.min(m, TIER.frontShield.share);
  if (m < 1) sim.events.push({ e: 'tier', what: 'block', x: h.x, y: h.y, h });
  return m;
}

/** Seconds a robot waits between the blows of the weapon that struck: the Communicator's weapon in hand (a gun's bolts, a swing), a crew robot's by its role. */
function blowWait(by: Bot, weapon?: string): number {
  if (weapon && weapon in WEAPONS) return WEAPONS[weapon as WeaponId].rate;
  if (by.role === 'controller') return WEAPON.controller.rate;
  return by.role === 'marksman' ? WEAPON.marksman.rate : by.role === 'stalker' ? STALKER.rate : WEAPON.guard.rate;
}

/**
 * The Blinker counter (systems.md, Soft counters): a twisted rattler blinks away from a blow that has waited longer than `TIER.blink.slow`
 * (a robot's weapon has no wind-up: its rate is the wait) and the blow misses. A fast weapon, a Rooted or Frozen (or Staggered) rattler,
 * and anything but a robot's gun or swing (a kick, a crash, a blast, a tick) get through. True when it blinked: the caller drops the hit.
 */
export function blinks(sim: Sim, h: Hornet, by: Bot | null | undefined, via?: string, weapon?: string): boolean {
  if (!by || h.boss || !countersOf(h).includes('blinker') || (via !== 'melee' && via !== 'gun')) return false;
  const B = TIER.blink;
  if (sim.time < (h.blinkAt ?? 0) || sim.engine.flag(h, 'noMove') || sim.stunned(h) || blowWait(by, weapon) <= B.slow) return false;
  const d = Math.hypot(h.x - by.x, h.y - by.y) || 1;
  const ux = (h.x - by.x) / d, uy = (h.y - by.y) / d;
  // Sideways to the blow, either way; else straight back. The first free spot.
  const side = sim.tiers.r.chance(0.5) ? 1 : -1;
  const spots = [[-uy * side, ux * side], [uy * side, -ux * side], [ux, uy]];
  const to = spots.map(([dx, dy]) => ({ x: h.x + dx * B.jump, y: h.y + dy * B.jump })).find((p) => !sim.blocked(p.x, p.y) && p.x > T && p.y > T && p.x < (sim.W - 1) * T && p.y < (sim.H - 1) * T);
  if (!to) return false;
  h.blinkAt = sim.time + B.every * rate(sim, h);
  const from = { x: h.x, y: h.y };
  h.x = to.x;
  h.y = to.y;
  h.vx = h.vy = 0;
  sim.events.push({ e: 'tier', what: 'blink', x: from.x, y: from.y, h });
  return true;
}

/** An enemy has been put down: a Splitter comes apart into small hornets. */
export function onDown(sim: Sim, h: Hornet) {
  if (hasTrait(h, 'splitter')) for (let i = 0; i < TIER.splitter.count; i++) small(sim, h, 'hornet', TIER.splitter.hp);
  beastDown(sim, h); // P31: a thief drops what it stole
}

/** A small one (a split hornet, a spiderling): a plain body with a share of the oil, drawn smaller. */
function small(sim: Sim, from: Hornet, kind: Enemy, share: number) {
  const a = sim.tiers.r.range(0, Math.PI * 2);
  const s = sim.spawnHornet(from.x + Math.cos(a) * 18, from.y + Math.sin(a) * 12, from.nest, false, from.twisted, kind, { tier: 1 });
  s.small = true;
  s.hp = s.maxHp = FOES[kind].hp * share;
  return s;
}

/** Something died at (x, y): a swarmer with Bloodlust near it is hasted. */
export function bloodlust(sim: Sim, x: number, y: number) {
  for (const h of sim.hornets) if (!h.dead && hasAbility(h, 'bloodlust') && dist(h.x, h.y, x, y) <= TIER.bloodlust.radius) sim.engine.apply(h, 'haste', { duration: TIER.bloodlust.time });
}

/** The enemy that taunts this robot (a Broadcaster near it), if it is taunted. */
export function tauntedBy(sim: Sim, b: Bot): Hornet | null {
  if (!sim.engine.flag(b, 'taunted')) return null;
  let best: Hornet | null = null, bd = TIER.broadcaster.radius * 1.5;
  for (const h of sim.hornets) {
    const d = dist(h.x, h.y, b.x, b.y);
    if (!h.dead && hasTrait(h, 'broadcaster') && d < bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}

/** One step of an elite's own rules (its limbs first, P50): the Brood lets its spiderlings out at half health; a Brood-rattle and a Herald call help on sight. */
export function think(sim: Sim, h: Hornet, hasTarget: boolean, dt: number) {
  limbsStep(sim, h, dt);
  if (!h.traits || h.dead) return;
  const S = state(sim, h);
  if (hasTrait(h, 'brood') && !S.brooded && h.hp <= h.maxHp * TIER.brood.at) {
    S.brooded = true;
    for (let i = 0; i < TIER.brood.count; i++) small(sim, h, 'spider', TIER.brood.hp);
    sim.events.push({ e: 'tier', what: 'brood', x: h.x, y: h.y, h });
  }
  if (!S.called && hasTarget && (hasTrait(h, 'broodRattle') || hasTrait(h, 'herald'))) {
    S.called = true;
    const kind: Enemy = hasTrait(h, 'herald') ? 'swarmer' : 'snake';
    for (let i = 0; i < TIER.call.count; i++) {
      let x = h.x, y = h.y;
      for (let k = 0; k < 6; k++) {
        const a = sim.tiers.r.range(0, Math.PI * 2);
        x = h.x + Math.cos(a) * TIER.call.away;
        y = h.y + Math.sin(a) * TIER.call.away;
        if (!sim.blocked(x, y)) break;
      }
      sim.spawnHornet(x, y, h.nest, false, h.twisted, kind);
    }
    sim.events.push({ e: 'tier', what: 'call', x: h.x, y: h.y, h });
  }
}

// ---------------------------------------------------------------- abilities with a tell

/** A blow of this enemy's, before its move's multiplier: its kind's own, an elite's, the night's and the menace's. */
export const foeDmg = (sim: Sim, h: Hornet) => FOES[h.kind].dmg * (h.elite ? HORNET.elite.dmg : 1) * (h.twisted ? TWISTED[h.kind].dmg : 1) * sim.berserk(h).dmg;
/** How fast it walks now (the formula `Sim.fly` uses), px/s. */
const walk = (sim: Sim, h: Hornet) => FOES[h.kind].speed * (sim.cfg.hornetSpeed / HORNET.speed) * (h.twisted ? TWISTED[h.kind].speed : 1) * sim.berserk(h).speed * sim.mobility(h);
/** The berserk steps' multiplier of an ability's cooldown (below 1). */
const rate = (sim: Sim, h: Hornet) => sim.berserk(h).cd;
/** Does it dig? (Down a dungeon there is no sand: walkers there go round the rock as before.) */
const digs = (sim: Sim, h: Hornet) => !sim.dungeon && (hasAbility(h, 'burrow') || hasAbility(h, 'ambush'));
const idle = (h: Hornet) => h.brain.state === 'roam' && (!h.spider || h.spider.mode === 'stalk');

/** What lands a thrown cable or bolt leaves on the ground: a Crawlcam III's or a Weaver's web, a drone II's plasma. */
export function layOf(h: Hornet): Lay | undefined {
  if (h.kind === 'spider') return hasAbility(h, 'webCarpet') || hasTrait(h, 'weaver') ? 'web' : undefined;
  return h.kind === 'drone' && hasAbility(h, 'plasmaPuddles') ? 'puddle' : undefined;
}

/**
 * One step of an enemy's tier abilities and traits that have a move to wind up (Burrow and ambush, Acid spit, Scythe throw,
 * the Mortar's lob). True when it holds still this step (digging, rearing, resting); `Sim.fly` then stands it still.
 */
export function act(sim: Sim, h: Hornet, dt: number, t: Bot | null): boolean {
  if (!h.dead && screamStep(sim, h, dt, !!t)) return true; // P31: a bleater rearing to scream with its herd
  if (h.dead || !(digs(sim, h) || hasAbility(h, 'acidSpit') || hasAbility(h, 'scytheThrow') || hasTrait(h, 'mortar'))) return false;
  const S = state(sim, h);
  S.digT -= dt;
  S.spitT -= dt;
  S.throwT -= dt;
  S.lobT -= dt;
  lob(sim, h, S, dt, t);
  if (S.dig) return dug(sim, h, S, S.dig, dt, t);
  if (S.spit) return rearing(sim, h, S, 'spit', dt, t);
  if (S.throw) return rearing(sim, h, S, 'throw', dt, t);
  if (!t || t.dead || !idle(h)) return false;
  const dT = dist(h.x, h.y, t.x, t.y) / T;
  const seen = () => clearLine(sim.blocked, h.x, h.y, t.x, t.y, h.r * 0.6);
  if (digs(sim, h) && S.digT <= 0 && dT >= TIER.burrow.min && dT <= TIER.burrow.max) {
    S.dig = { mode: 'sink', t: TIER.burrow.down, tx: h.x, ty: h.y };
    sim.events.push({ e: 'tier', what: 'dig', x: h.x, y: h.y, h });
    return true;
  }
  if (hasAbility(h, 'acidSpit') && !hasBreak(h, 'noAcid') && S.spitT <= 0 && dT >= TIER.spit.min && dT <= TIER.spit.max && seen()) {
    S.spit = { t: TIER.spit.tell, ax: t.x, ay: t.y };
    sim.events.push({ e: 'tier', what: 'tellSpit', x: h.x, y: h.y, h });
    return true;
  }
  if (hasAbility(h, 'scytheThrow') && S.throwT <= 0 && dT >= TIER.scythe.min && dT <= TIER.scythe.max && seen()) {
    S.throw = { t: TIER.scythe.tell, ax: t.x, ay: t.y };
    sim.events.push({ e: 'tier', what: 'tellThrow', x: h.x, y: h.y, h });
    return true;
  }
  return false;
}

/** A stun or a freeze cancels what an enemy was winding up (not a shell already lobbed, nor a dig already under). */
export function cancelTier(h: Hornet) {
  limbsCancel(h);
  const S = h.ts;
  if (!S) return;
  S.spit = S.throw = undefined;
  if (S.dig?.mode === 'sink') S.dig = undefined;
}

/**
 * A dig: it sinks (`down`, still in sight), then goes under (nothing reaches it; a ripple on the sand shows where) and travels
 * to the robot; within `near` it marks the spot and holds (`up`, the ring on the sand), then comes up there for a blow, and rests
 * (`rest`: the opening to hit it). A trip that finds nothing (the robot gone, `maxTime` up) ends where it is.
 */
function dug(sim: Sim, h: Hornet, S: TierState, D: Dig, dt: number, t: Bot | null): boolean {
  const B = TIER.burrow;
  D.t -= dt;
  if (D.mode === 'sink') {
    if (D.t > 0) return true;
    D.mode = 'under';
    D.t = B.maxTime;
    sim.setUnder(h, true);
    return true;
  }
  if (D.mode === 'under') {
    const d = t && !t.dead ? dist(h.x, h.y, t.x, t.y) : Infinity;
    if (d <= B.near) {
      D.mode = 'tell';
      D.t = B.up;
      D.tx = t!.x;
      D.ty = t!.y;
      h.vx = h.vy = 0;
      sim.events.push({ e: 'tier', what: 'tellSurface', x: D.tx, y: D.ty, h });
    } else if (D.t <= 0 || d === Infinity) end(sim, h, S);
    else {
      const sp = walk(sim, h) * B.speed;
      // Tunnelling moves it here, so the glide that follows stands it still (no velocity left to move it twice).
      h.x = Math.min(sim.W * T - T * 0.6, Math.max(T * 0.6, h.x + ((t!.x - h.x) / d) * sp * dt));
      h.y = Math.min(sim.H * T - T * 0.6, Math.max(T * 0.6, h.y + ((t!.y - h.y) / d) * sp * dt));
      h.vx = h.vy = 0;
    }
    return true;
  }
  if (D.mode === 'tell') {
    if (D.t > 0) return true;
    // Up: it comes out of the sand at the marked spot, and everything within reach takes the blow.
    sim.setUnder(h, false);
    h.x = D.tx;
    h.y = D.ty;
    h.vx = h.vy = 0;
    const dmg = foeDmg(sim, h) * B.dmg;
    let hits = 0;
    for (const b of sim.bots) {
      if (b.dead || dist(b.x, b.y, D.tx, D.ty) > B.radius + ROLES[b.role].r * 0.5) continue;
      hits++;
      sim.foeHit(h, b, dmg, 'ambush');
    }
    sim.events.push({ e: 'tier', what: 'surface', x: D.tx, y: D.ty, h, hits });
    D.mode = 'rest';
    D.t = B.rest;
    h.cd = Math.max(h.cd, B.rest);
    return true;
  }
  if (D.t > 0) return true;
  end(sim, h, S);
  return false;
}

/** A dig is over (it came up, or found no one): the next one is `every` seconds off. */
function end(sim: Sim, h: Hornet, S: TierState) {
  if (h.under) sim.setUnder(h, false);
  S.dig = undefined;
  S.digT = sim.tiers.r.range(...TIER.burrow.every) * rate(sim, h);
  h.vx = h.vy = 0;
  if (h.spider) {
    h.spider.go = false;
    h.spider.t = 0.3;
  }
}

/**
 * A rearing before a spit or a throw: it stands, the line to where it will shoot shows, the aim follows the robot until the
 * last `lock`, then the acid or the blade goes. The blade flies out, turns and comes back (`bladeStep`).
 */
function rearing(sim: Sim, h: Hornet, S: TierState, key: 'spit' | 'throw', dt: number, t: Bot | null): boolean {
  const R = S[key]!;
  const P = key === 'spit' ? TIER.spit : TIER.scythe;
  R.t -= dt;
  if (!t || t.dead) {
    S[key] = undefined;
    return false;
  }
  if (R.t > P.lock) {
    R.ax = t.x;
    R.ay = t.y;
  }
  if (R.t > 0) return true;
  S[key] = undefined;
  const a = Math.atan2(R.ay - h.y, R.ax - h.x);
  const x = h.x + Math.cos(a) * 16, y = h.y - 10 + Math.sin(a) * 16;
  const dmg = foeDmg(sim, h) * P.dmg;
  if (key === 'spit') {
    sim.foeShot({ x, y, vx: Math.cos(a) * P.speed, vy: Math.sin(a) * P.speed, dmg, life: P.life, big: false, by: h.id, type: 'acid', status: 'corroded' });
    S.spitT = sim.tiers.r.range(...TIER.spit.every) * rate(sim, h);
  } else {
    sim.foeShot({ x, y, vx: Math.cos(a) * P.speed, vy: Math.sin(a) * P.speed, dmg, life: TIER.scythe.life, big: false, by: h.id, type: 'pierce', blade: { out: TIER.scythe.out, back: false, hit: [], owner: h.id } });
    S.throwT = sim.tiers.r.range(...TIER.scythe.every) * rate(sim, h);
  }
  sim.events.push({ e: 'tier', what: key === 'spit' ? 'spit' : 'throw', x: h.x, y: h.y, h });
  return true;
}

/** A thrown blade, one step (called for a `blade` shot in place of the usual shot rules): out, then back to its thrower; a rock turns it. */
export function bladeStep(sim: Sim, s: Shot, dt: number) {
  const B = s.blade!;
  B.out -= dt;
  if (!B.back && (B.out <= 0 || sim.blocked(s.x, s.y + 8))) {
    B.back = true;
    B.hit = [];
  }
  if (B.back) {
    const o = sim.hornets.find((h) => h.id === B.owner && !h.dead);
    if (o) {
      const d = dist(s.x, s.y, o.x, o.y - 10) || 1;
      if (d < 16) {
        s.dead = true;
        return;
      }
      s.vx = ((o.x - s.x) / d) * TIER.scythe.speed * 1.1;
      s.vy = ((o.y - 10 - s.y) / d) * TIER.scythe.speed * 1.1;
    }
  }
  const owner = sim.hornets.find((h) => h.id === B.owner);
  for (const b of sim.bots) {
    if (b.dead || B.hit.includes(b.id) || dist(s.x, s.y, b.x, b.y - 10) > ROLES[b.role].r + TIER.scythe.radius) continue;
    B.hit.push(b.id);
    sim.hurt(b, s.dmg, false, { by: owner, type: s.type, via: 'gun' });
  }
}

/** The Mortar's lob: it marks the robot's spot, the shell comes down there `tell` s later (the ring closes on it), and the blast hurts what stands in it. The drone goes on moving. */
function lob(sim: Sim, h: Hornet, S: TierState, dt: number, t: Bot | null) {
  const M = TIER.mortar;
  if (S.shell) {
    S.shell.t -= dt;
    if (S.shell.t > 0) return;
    const { x, y } = S.shell;
    S.shell = undefined;
    const dmg = foeDmg(sim, h) * M.dmg;
    let hits = 0;
    for (const b of sim.bots) {
      if (b.dead || dist(b.x, b.y, x, y) > M.radius + ROLES[b.role].r * 0.5) continue;
      hits++;
      sim.foeHit(h, b, dmg, 'blast');
    }
    sim.events.push({ e: 'tier', what: 'lob', x, y, h, hits });
    return;
  }
  if (!hasTrait(h, 'mortar') || S.lobT > 0 || !t || t.dead) return;
  const dT = dist(h.x, h.y, t.x, t.y) / T;
  if (dT < M.min || dT > M.max) return;
  S.shell = { x: t.x, y: t.y, t: M.tell };
  S.lobT = M.every * rate(sim, h);
  sim.events.push({ e: 'tier', what: 'tellLob', x: t.x, y: t.y, h });
}

// ---------------------------------------------------------------- patches on the ground

/** What each patch kind does to a robot inside it: a status from the engine (`TIER.carpet`, `TIER.puddle`). */
const PATCH: Record<Lay, { radius: number; life: number; arm: number; every: number; status: StatusId; time: number }> = {
  web: { ...TIER.carpet, status: TIER.carpet.status as StatusId },
  puddle: { ...TIER.puddle, status: TIER.puddle.status as StatusId },
  streak: { ...TWIST_FX.streak, status: TWIST_FX.streak.status as StatusId },
  pool: { ...TWIST_FX.pool, status: TWIST_FX.pool.status as StatusId },
  hooves: { ...TWIST_BEAST.hooves, status: TWIST_BEAST.hooves.status as StatusId },
};
/** The patches P13's twisted forms lay: they count against `TWIST_FX.patches`, the rest against `TIER.patches`. */
const twistedLay = (k: Lay) => k === 'streak' || k === 'pool' || k === 'hooves';

/** A patch on the ground (the oldest of its group go when there are too many); the streak's far end is (`x2`, `y2`). */
function addPatch(sim: Sim, kind: Lay, x: number, y: number, x2?: number, y2?: number): Patch {
  const P = PATCH[kind];
  const W = sim.tiers;
  const p: Patch = { id: W.n++, kind, x, y, ...(x2 !== undefined && { x2, y2 }), r: P.radius, life: P.life, arm: P.arm, seen: new Map() };
  W.patches.push(p);
  const mine = twistedLay(kind), cap = mine ? TWIST_FX.patches : TIER.patches;
  let n = W.patches.filter((q) => twistedLay(q.kind) === mine).length;
  W.patches = W.patches.filter((q) => twistedLay(q.kind) !== mine || n-- <= cap);
  return p;
}

/** A foe's shot has ended (flew its range, hit a robot or a rock) at its position: a shot that lays something leaves a patch on the ground there; a twisted drone's bolt that flew its range splits. */
export function landed(sim: Sim, s: Shot) {
  if (s.split && s.life <= 0 && !sim.blocked(s.x, s.y + 8)) {
    const F = TWIST_FX.split, a0 = Math.atan2(s.vy, s.vx), v = Math.hypot(s.vx, s.vy);
    for (let i = 0; i < F.count; i++) {
      const a = a0 + (F.count > 1 ? i / (F.count - 1) - 0.5 : 0) * F.spread;
      sim.foeShot({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, dmg: s.dmg * F.dmg, life: F.life, big: false, by: s.by, type: s.type });
    }
    sim.events.push({ e: 'tier', what: 'split', x: s.x, y: s.y });
  }
  if (!s.lay) return;
  const x = s.x, y = s.y + 10;
  if (sim.blocked(x, y)) return;
  addPatch(sim, s.lay, x, y);
  sim.events.push({ e: 'tier', what: s.lay === 'web' ? 'carpet' : 'puddle', x, y });
}

// ---------------------------------------------------------------- the twisted forms' own effects

/**
 * A twisted enemy's dash, called as it begins (`go`), each step it runs (`on`) and when it ends (`end`): a hornet's dash lays a
 * Dark streak behind it (growing with it; a robot crossing it gets Dread), a rattler's strike leaves an acid pool where it ends.
 */
export function twistDash(sim: Sim, h: Hornet, at: 'go' | 'on' | 'end') {
  if (!h.twisted || h.boss) return;
  if (h.kind === 'hornet' || h.kind === 'charger') {
    // A hornet's Dark streak; a fire-hoofed charger's burning trail (P31, `TWIST_BEAST.hooves`).
    const foot = h.kind === 'charger' ? 10 : 0;
    if (at === 'go') h.streak = addPatch(sim, h.kind === 'charger' ? 'hooves' : 'streak', h.x, h.y + foot, h.x, h.y + foot);
    else if (h.streak) {
      h.streak.x2 = h.x;
      h.streak.y2 = h.y + foot;
      if (at === 'end') h.streak = undefined;
    }
  } else if (h.kind === 'snake' && at === 'end' && !hasBreak(h, 'noAcid') && !sim.blocked(h.x, h.y)) {
    addPatch(sim, 'pool', h.x, h.y + 10);
    sim.events.push({ e: 'tier', what: 'puddle', x: h.x, y: h.y + 10 });
  }
}

/** The distance from a point to a streak's line. */
const streakDist = (p: Patch, x: number, y: number) => {
  const x2 = p.x2 ?? p.x, y2 = p.y2 ?? p.y, dx = x2 - p.x, dy = y2 - p.y, l = dx * dx + dy * dy;
  const k = l ? Math.max(0, Math.min(1, ((x - p.x) * dx + (y - p.y) * dy) / l)) : 0;
  return dist(x, y, p.x + dx * k, p.y + dy * k);
};

/** What a twisted kind's hits and shots carry (systems.md, "Built kinds"), as effect sources the engine runs: a swarmer's hit Hastes it and heals it by a share of what it dealt. */
export function twistSource(kind: Enemy): Source | null {
  if (kind !== 'swarmer') return null;
  const F = TWIST_FX.swarmer;
  return {
    id: 'twist:swarmer', kind: 'trait', name: TWISTED.swarmer.name,
    effects: [{ when: 'hit', cd: 0, do: [{ do: 'heal', ofEvent: F.heal }, { do: 'status', id: 'haste', to: 'self', duration: F.haste }] }],
  };
}

/** A twisted enemy: its kind's effect source (a swarmer's), on the engine. */
export function twistFx(sim: Sim, h: Hornet) {
  const s = h.twisted ? twistSource(h.kind) : null;
  if (s) sim.engine.addSource(h, s);
}

/** A cable a twisted Crawlcam spits scalds; a cracked lens misses half of them. Called as the shot is made. */
export function twistShot(sim: Sim, s: { by: number; web?: boolean; vx: number; vy: number; status?: StatusId }) {
  if (!s.web) return;
  const h = sim.hornets.find((x) => x.id === s.by);
  if (!h || h.kind !== 'spider') return;
  if (h.twisted) s.status = TWIST_FX.scald;
  if (hasBreak(h, 'webMiss') && sim.tiers.r.chance(BREAK.webMiss)) {
    const a = (sim.tiers.r.chance(0.5) ? 1 : -1) * 0.5, c = Math.cos(a), n = Math.sin(a);
    [s.vx, s.vy] = [s.vx * c - s.vy * n, s.vx * n + s.vy * c];
  }
}

/** A twisted drone's bolt splits at the end of its flight. */
export const splits = (h: Hornet) => h.twisted && h.kind === 'drone' && !h.boss;

// ---------------------------------------------------------------- damage states

/** Who breaks: an elite, and a boss with no second form (a form boss's change is its break). */
export const breakable = (h: Hornet) => h.elite || (h.boss && !bossOf(h.kind).phase2);
export const hasBreak = (h: Hornet, id: BreakId) => !!h.breaks?.includes(id);
/** The two breaks of an enemy: its kind's row (a boss's own, P22), or the generic pair (Laimonas's kinds, a boss with none). */
export const breaksOf = (h: Hornet): [BreakDef, BreakDef] => (h.boss ? bossOf(h.kind).breaks : BREAKS[h.kind]) ?? GENERIC_BREAKS;

/** The berserk multiplier with its breaks' cuts on it (`Sim.berserk` returns this for an enemy that has broken). */
export function cutMul(z: BerserkMul, h: Hornet): BerserkMul {
  let dmg = z.dmg, speed = z.speed;
  for (const b of h.breaks ?? []) {
    const c = b === 'form' ? undefined : CUT[b];
    if (c?.dmg) dmg *= c.dmg;
    if (c?.speed) speed *= c.speed;
  }
  return { ...z, dmg, speed };
}

/** The damage type of an enemy's blows: its kind's, or plain once its fangs are snapped (no Acid). */
export const blowType = (h: Hornet): DamageType | undefined => (hasBreak(h, 'noAcid') ? undefined : foeType(h.kind));

/** The share of its speed an enemy's bolts fly at (a cracked cannon's are slower; the caller lengthens the flight, so the range stays). */
export const boltSpeed = (h: Hornet) => (hasBreak(h, 'slowBolt') ? BREAK.slowBolt : 1);

/** A part dropped at a break or a form change: one of the kind's own, on the spot. */
function breakPart(sim: Sim, h: Hornet): PartKind {
  const own = ENEMY_PARTS[h.kind];
  const part = sim.r.pick([own.part, ...own.elite]);
  drop(sim, h.x, h.y, 'part', part);
  return part;
}

/**
 * The hit path's check (`combat.ts` `onOut`): an elite or a boss with no form that is at or under the next of `BREAK.at` of its
 * oil breaks, once for each it has crossed: what it can no longer do (`breaksOf`), one part dropped on the spot, and the `break` event.
 */
export function breakCheck(sim: Sim, h: Hornet) {
  if (h.dead || h.hp <= 0 || !breakable(h)) return;
  while ((h.breaks?.length ?? 0) < BREAK.at.length && h.hp <= h.maxHp * BREAK.at[h.breaks?.length ?? 0]) snap(sim, h);
}

function snap(sim: Sim, h: Hornet) {
  const list = (h.breaks ??= []);
  const n = list.length;
  const B = breaksOf(h)[n];
  list.push(B.id);
  // What it was winding up for the move it just lost is off.
  if (B.id === 'noDash' && (h.brain.state === 'tell' || h.brain.state === 'go')) {
    h.brain.state = 'roam';
    h.brain.t = 1;
    h.streak = undefined;
  }
  if (B.id === 'noPounce' && h.spider) {
    h.spider.pounceT = Infinity;
    if (h.spider.mode === 'tellPounce') h.spider.mode = 'stalk';
  }
  // A boss's break may owe a move at once: it winds it up as soon as it is free, ahead of its cycle.
  const then = h.boss ? bossOf(h.kind).breaks?.[n]?.then : undefined;
  if (then) {
    h.brain.owe = then;
    if (h.brain.state === 'roam') h.brain.t = Math.min(h.brain.t, 0.6);
  }
  const part = breakPart(sim, h);
  sim.events.push({ e: 'break', h, n: (n + 1) as 1 | 2, what: B.id, name: B.name, part });
  say(sim, `break-${B.id}`, `${B.name}: ${B.blurb} ${h.boss ? 'It is hurt, and it is still coming.' : 'Press it.'}`, 'warn');
}

/** A boss with a second form changes (D18): that is its one break; it drops a part there, once. */
export function formBreak(sim: Sim, h: Hornet, name: string) {
  if (h.breaks?.length) return;
  h.breaks = ['form'];
  const part = breakPart(sim, h);
  sim.events.push({ e: 'break', h, n: 1, what: 'form', name, part });
}

/** Patches, one step: an armed patch gives its status to each robot inside, at most every `every` s apiece, and wears away. */
export function patchStep(sim: Sim, dt: number) {
  const W = sim.tiers;
  if (!W.patches.length) return;
  for (const p of W.patches) {
    if (p.arm > 0) {
      p.arm -= dt;
      continue;
    }
    p.life -= dt;
    const P = PATCH[p.kind];
    for (const b of sim.bots) {
      if (b.dead || (p.x2 === undefined ? dist(b.x, b.y, p.x, p.y) : streakDist(p, b.x, b.y)) > p.r + ROLES[b.role].r * 0.5) continue;
      if (sim.time - (p.seen.get(b.id) ?? -Infinity) < P.every) continue;
      p.seen.set(b.id, sim.time);
      sim.engine.apply(b, P.status, { duration: P.time });
    }
  }
  W.patches = W.patches.filter((p) => p.life > 0);
}

/** What a `Sim` keeps for tiers: its own random stream (so the land's and the hornets' stay as they were), and the patches on the ground. */
/** `roll` is the spawn rolls' own stream (elite, menacing), so they never move the hives' or the tiers' sequences. */
export interface TierWorld { r: Rng; roll: Rng; patches: Patch[]; n: number }
export const tierWorld = (r: Rng): TierWorld => ({ r, roll: r.fork('roll'), patches: [], n: 1 });
export type TierEvent = 'block' | 'flip' | 'thorns' | 'mirror' | 'brood' | 'call' | 'dig' | 'tellSurface' | 'surface' | 'tellSpit' | 'spit' | 'tellThrow' | 'throw' | 'tellLob' | 'lob' | 'carpet' | 'puddle' | 'split' | 'blink' | 'mend';

/** debugState(): the land's tier, enemies by tier, and the elites' traits. */
export function tierSummary(sim: Sim) {
  const byTier: Record<string, number> = {};
  for (const h of sim.hornets) if (!h.dead && !h.boss) byTier[tierOf(h)] = (byTier[tierOf(h)] ?? 0) + 1;
  return {
    land: sim.tier,
    byTier,
    under: sim.hornets.filter((h) => h.under && !h.dead).length,
    patches: sim.tiers.patches.map((p) => `${p.kind} (${Math.round(p.x)}, ${Math.round(p.y)}) ${p.arm > 0 ? 'arming' : `${p.life.toFixed(1)}s`}`),
    elites: sim.hornets.filter((h) => h.elite && !h.dead).map((h) => `h${h.id} ${h.kind} t${tierOf(h)} ${(h.traits ?? []).join('+') || '-'}${h.breaks?.length ? ` broke:${h.breaks.join('+')}` : ''}`),
  };
}
