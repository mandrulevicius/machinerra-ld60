/**
 * The enemies' life in a mission: spawning, hives, the hunt, warping at night, the twisted auras, deaths.
 * `fly` is an enemy's turn each step and `glide` its movement; a boss's turn is boss.ts, a hit is combat.ts.
 * Add an enemy behaviour: a flag on its `FoeDef` (defs/foes.ts) and a branch in `fly`.
 * One with its own state gets a module like spider.ts and a hook in `fly`.
 * `foeSummary` is the part of `summary()` that lists them.
 */

import { beastDash, beastHit, fleeing } from './beasts';
import { dropGraft } from './graft';
import { limbSummary } from './limbs';
import { bossCache } from './mods';
import { foeFell } from './botskills';
import {
  duskBoss,
  feed,
  flyBoss,
} from './boss';
import {
  berserkMul,
  spawnMul,
} from './clock';
import {
  foeHit,
  hurt,
} from './combat';
import {
  ALARM,
  type Aura,
  BUFF,
  COPPER,
  ENEMY_PARTS,
  type Enemy,
  FOES,
  DAY,
  FOE_TIERS,
  HORNET,
  LEVEL1,
  LOOT,
  NEST,
  SCRAP,
  SHRINE,
  SHY,
  T,
  TWISTED,
  TWISTED_PART,
  type TraitId,
  bossOf,
} from './defs';
import {
  clampTier,
  flowField,
} from './dungeon';
import { princessFreed } from './followers';
import { huntRange, inLeash } from './leash';
import {
  dist,
  lerp,
  wrapAngle,
} from './geom';
import {
  drop,
  dropCore,
  lootChance,
} from './loot';
import {
  STATUS_AI,
  UNTOUCHABLE,
  foeType,
  foeUnit,
} from './missionfx';
import { say } from './oracle';
import { clearLine } from './path';
import type { Sim } from './sim';
import {
  crawl,
  holdWeb,
  mixKind,
  nearestBot,
  newSpider,
} from './spider';
import { spawnPick } from './spawntiers';
import { cancelGrub, grubStep, newGrub } from './caterpillar';
import {
  bloodlust,
  boltSpeed,
  cancelTier,
  dashCount,
  eliteChance,
  foeDash,
  formation,
  hasBreak,
  heavyCheck,
  layOf,
  onDown,
  outfit,
  splits,
  act as tierAct,
  think as tierThink,
  traitParts,
  twistDash,
  twistFx,
  twistShot,
} from './tiers';
import {
  type Bot,
  type Brain,
  CLOCK,
  type Hornet,
  type Nest,
  type Shot,
  upper,
} from './types';

export type FoeEvent =
  /** A mall-cop drone whistled the foes near it over (`FoeDef.alarm`). */
  | { e: 'whistle'; h: Hornet }
  /** An enemy came into the world (from a hive, a summon, a split). */
  | { e: 'spawn'; h: Hornet }
  /** A ranged enemy spat a plasma bolt. */
  | { e: 'spit'; h: Hornet; s: Shot }
  /** A hornet is warped by the dark (the evening's share grows). */
  | { e: 'twist'; h: Hornet }
  /** An enemy winds up a dash or a lunge; it goes a beat later (`dash`). */
  | { e: 'tell'; h: Hornet }
  | { e: 'dash'; h: Hornet }
  /** A hive woke (`by`: who or what woke it). */
  | { e: 'wake'; n: Nest; by: string }
  /** A twisted halo drained a robot of oil (a Dark hit that draws no hit of its own): the view shows it. */
  | { e: 'halo'; bot: Bot; dmg: number };

export function wake(sim: Sim, n: Nest, by: string) {
  if (n.awake || n.dead) return;
  n.awake = true;
  n.spawnT = 0.6;
  sim.events.push({ e: 'wake', n, by });
  if (by === CLOCK) sim.said.add('wake'); // the Oracle's line for the day says it
  if (!sim.said.has('wake'))
    say(sim, 'wake', `Movement on my scanners... ${sim.biome.swarm}! ${by === 'Communicator' ? 'You' : by} rattled a ${sim.biome.talk.hive}. Keep your guards close to whoever is siphoning.${!sim.hasGun ? ' A shovel is no gun: let the guards shoot, and swing at whatever gets close.' : ''}`, 'warn');
}

/** Dev (`dungeon clear`): the enemy falls as if the Communicator struck it down. */
export function slay(sim: Sim, h: Hornet) {
  hornetDown(sim, h, sim.controller);
}

/** How many of a twisted foe's own part it drops: one, twice under the Blood Moon (P54; the fraction rounds, so the ease never half-drops one). */
const twistedParts = (sim: Sim) => Math.round(sim.fx.twistedParts);

/** An enemy's oil ran out: loot, scrap, the kill counted, a boss's cache. */
export function hornetDown(sim: Sim, h: Hornet, by: Bot | null, burning = false) {
  if (h.dead) return;
  h.hp = 0;
  h.dead = true;
  sim.stats.killed++;
  sim.gainScrap((h.boss ? SCRAP.kill.boss : h.elite ? SCRAP.kill.elite : SCRAP.kill.common) + sim.city.scrapKill);
  const own = ENEMY_PARTS[h.kind];
  if (h.boss && bossOf(h.kind).mini) {
    // A mini-boss (level 1's Foreman): a boss's cache, but not the dusk boss's fall (`bossDown`, the quest's count).
    const D = bossOf(h.kind).drops;
    for (let i = 0; i < D.parts; i++) drop(sim, h.x + sim.r.range(-40, 40), h.y + sim.r.range(-30, 30), 'part', sim.r.pick([own.part, ...own.elite]));
    for (let i = 0; i < D.scrap; i++) drop(sim, h.x + sim.r.range(-60, 60), h.y + sim.r.range(-40, 40), 'scrap', null, D.gob);
    drop(sim, h.x + sim.r.range(-60, 60), h.y + sim.r.range(-40, 40), 'copper', null, Math.round(D.copper * (sim.biome.copperMul ?? 1)));
    h.quake = undefined;
  } else if (h.boss) {
    // A boss's cache: the rarer parts first, then a heap of scrap, copper, and the one can a boss gives.
    const D = bossOf(h.kind).drops;
    sim.bossDown = true;
    sim.bossesDown.push(h.kind);
    if (sim.day.phase === 'midnight') sim.stats.bossNight = (sim.stats.bossNight ?? 0) + 1; // quests (P38): a boss brought down past midnight
    if (h.kind === 'knight' && !sim.aboard.includes('princess')) princessFreed(sim, h.x, h.y);
    sim.bossDownName = bossOf(h.kind).name;
    bossCache(sim, h); // a wild weapon mod (P57)
    h.quake = undefined;
    const fall = bossOf(h.kind).fall;
    if (fall) say(sim, `fall-${h.kind}`, `From its speaker, crackling: "${fall}"`, 'warn');
    for (let i = 0; i < D.parts; i++) drop(sim, h.x + sim.r.range(-40, 40), h.y + sim.r.range(-30, 30), 'part', sim.r.pick(i < D.rare ? own.elite : [own.part, ...own.elite]));
    for (let i = 0; i < Math.round(D.scrap * sim.mods.loot); i++) drop(sim, h.x + sim.r.range(-60, 60), h.y + sim.r.range(-40, 40), 'scrap', null, D.gob); // the Dinner Bell's tolls grow the cache
    drop(sim, h.x + sim.r.range(-60, 60), h.y + sim.r.range(-40, 40), 'copper', null, Math.round(D.copper * (sim.biome.copperMul ?? 1)));
    for (let i = 0; i < D.oil; i++) drop(sim, h.x + sim.r.range(-60, 60), h.y + sim.r.range(-40, 40), 'oil');
    drop(sim, h.x, h.y - 10, 'part', D.unique).t = Infinity; // her own part: it waits for you, it never sinks
    for (let i = 0; i < D.core; i++) dropCore(sim, h.x + 34 * (i + 1), h.y - 6); // beside the unique and the cache
  } else if (h.elite) {
    // An elite drops its trait's part (both with two); one with no trait, its kind's own table.
    const tp = traitParts(h);
    if (tp.length) for (const k of tp) drop(sim, h.x + sim.r.range(-12, 12), h.y + sim.r.range(-8, 8), 'part', k);
    else drop(sim, h.x, h.y, 'part', sim.r.pick([own.part, ...own.elite]));
    // A twisted one drops its twisted part besides (P13).
    if (h.twisted && TWISTED_PART[h.kind]) for (let i = 0; i < twistedParts(sim); i++) drop(sim, h.x + sim.r.range(-12, 12), h.y + sim.r.range(-8, 8), 'part', TWISTED_PART[h.kind]);
    // Its windings are copper; now and then a little oil, less than a can (the only oil a fight gives but a boss's can).
    drop(sim, h.x + sim.r.range(-14, 14), h.y + sim.r.range(-10, 10), 'copper', null, Math.max(1, Math.round(COPPER.elite * (sim.biome.copperMul ?? 1))));
    if (sim.r.chance(LOOT.eliteOil.chance)) drop(sim, h.x + sim.r.range(-14, 14), h.y + sim.r.range(-10, 10), 'oil', null, LOOT.eliteOil.amt);
    dropGraft(sim, h); // Gasket's capstone: a claw or a tentacle to graft on (`graft.ts`)
  }
  else if (sim.r.chance(lootChance(sim))) {
    const l = drop(sim, h.x, h.y, undefined, undefined, undefined, h.kind);
    if (h.twisted && l.kind === 'part' && TWISTED_PART[h.kind]) {
      l.part = TWISTED_PART[h.kind]!; // the night's part, not the day's (P13)
      for (let i = 1; i < twistedParts(sim); i++) drop(sim, h.x + sim.r.range(-12, 12), h.y + sim.r.range(-8, 8), 'part', TWISTED_PART[h.kind]);
    }
  }
  // Level 1: the first time his oil is under `LEVEL1.can`, the next kill drops a can (one more fall, taught once).
  if (sim.land?.guided && !sim.firstCan && !h.boss && sim.controller.hp < sim.controller.maxHp * LEVEL1.can) {
    sim.firstCan = true;
    drop(sim, h.x, h.y, 'oil');
    say(sim, 'l1-can', 'A can on your back is one more fall.');
  }
  // The Ember Rain's upside (P54): a foe that falls Burning while the rain holds drops one more scrap gob.
  if (sim.anomaly === 'emberRain' && sim.fx.ease > 0 && burning) drop(sim, h.x + sim.r.range(-12, 12), h.y + sim.r.range(-8, 8), 'scrap');
  foeFell(sim, h, by); // the kills' deeds, the Ghost's extra drop
  sim.events.push({ e: 'die', on: 'hornet', x: h.x, y: h.y, h });
  bloodlust(sim, h.x, h.y);
  onDown(sim, h);
  if (by && by.role !== 'controller' && sim.r.chance(0.3)) sim.bark(by, 'kill');
  sim.gone.push(h);
}

/** One of the land's enemies (a mechahornet in the desert; `kind` picked by the biome's weights); at night it may come twisted (the evening's share, all after). */
export function spawnHornet(sim: Sim, x: number, y: number, nest = 0, elite = sim.tiers.roll.chance(eliteChance(sim)), twisted = sim.r.chance(sim.day.twist), kind: Enemy = sim.r.weighted(sim.biome.foes), o: { tier?: number; traits?: TraitId[]; menacing?: boolean } = {}) {
  const tw = TWISTED[kind];
  const F = FOES[kind];
  // Past midnight a rising share of new enemies is menacing (the clock's `menacing`); only they take the berserk steps, the rest stay twisted ones as they were.
  const menacing = o.menacing ?? (sim.day.menacing > 0 && sim.tiers.roll.chance(sim.day.menacing));
  const step = sim.day.step, bz = berserkMul(menacing ? step : 0, sim.cfg.berserk);
  const hp = F.hp * (elite ? HORNET.elite.hp : 1) * (twisted ? tw.hp : 1) * bz.hp;
  const h: Hornet = {
    id: sim.nextId++, x, y, hp, maxHp: hp, vx: 0, vy: 0, target: 0, cd: 0.5, nest, dead: false, wob: sim.r.range(0, 10), elite,
    kind, twisted, ...(menacing && { menacing }), boss: false, r: F.r, reach: F.reach, brain: brain(sim, tw.dash.every), gunT: F.ranged ? sim.r.range(...F.ranged.every) : 0, step, bz,
  };
  if (kind === 'spider') h.spider = newSpider(sim);
  if (kind === 'caterpillar' && elite) h.grub = newGrub(h); // an elite caterpillar is tusked: the spiral, rear and lunge (`caterpillar.ts`)
  sim.engine.add(h, foeUnit(kind, { elite, twisted, menacing }));
  outfit(sim, h, o);
  twistFx(sim, h);
  sim.soak(h);
  sim.hornets.push(h);
  sim.events.push({ e: 'spawn', h });
  return h;
}

/** The land's threat tier, now (the dev command; a landing sets it at the start): the living enemies take it, the next ones roll from it. */
export function setTier(sim: Sim, n: number) {
  sim.tier = clampTier(n);
  for (const h of sim.hornets) if (!h.dead && !h.boss && FOE_TIERS[h.kind]) h.tier = sim.tier;
  for (const h of sim.hornets) if (h.warden && !h.dead) heavyCheck(sim, h); // a Warden is Heavy at tier III
}

/** A shot an enemy fires (a spider's cable): it flies and hurts, or snares, robots. */
export function foeShot(sim: Sim, s: Omit<Shot, 'id' | 'dead' | 'foe'>): Shot {
  twistShot(sim, s); // a twisted Crawlcam's cable scalds, a cracked lens misses
  const shot: Shot = { ...s, id: sim.nextId++, dead: false, foe: true };
  if (!s.blade) shot.life *= sim.fx.reach; // the Sandstorm shortens every gun's reach, theirs too (P54)
  sim.shots.push(shot);
  return shot;
}

export function brain(sim: Sim, every: [number, number]): Brain {
  return { state: 'roam', t: sim.r.range(...every), left: 0, dx: 0, dy: 0, hit: [], rage: false, orbit: sim.r.chance(0.5) ? 1 : -1 };
}

/** Warp a plain hornet (the evening grows the share of twisted ones). */
export function twist(sim: Sim, h: Hornet) {
  if (h.twisted || h.dead) return;
  h.twisted = true;
  sim.engine.tag(h, 'twisted');
  h.hp *= TWISTED[h.kind].hp;
  h.maxHp *= TWISTED[h.kind].hp;
  h.brain = brain(sim, TWISTED[h.kind].dash.every);
  twistFx(sim, h);
  sim.events.push({ e: 'twist', h });
}

/** The aura a hornet carries now (a twisted one's, grown by the menace past midnight), or null. */
export function auraOf(sim: Sim, h: Hornet): Aura | null {
  if (!h.twisted || h.dead || (h.quietT ?? 0) > sim.time || (h.dimT ?? 0) > sim.time) return null;
  const a = h.boss ? bossOf(h.kind).aura : TWISTED[h.kind].aura;
  return { ...a, radius: a.radius * (1 + BUFF.auraR * sim.buff), dps: a.dps * (1 + BUFF.auraDps * sim.buff), slow: Math.max(BUFF.slowMin, a.slow - BUFF.auraSlow * sim.buff) };
}

/**
 * Twisted hornets' auras: robots inside slow down and lose oil a second (a Dark hit, quietly: armour and plating apply, Dread
 * rides it). The halo is the `twistedAura` status on the robot, kept fresh while it stands inside; the slow and the burn are
 * the halo's own numbers (they grow with the menace), the burn times the robot's `auraBurnTaken`.
 */
export function auras(sim: Sim, dt: number) {
  const slow = sim.haloSlow;
  slow.length = sim.bots.length;
  slow.fill(1);
  for (const b of sim.bots) b.auraDps = 0;
  for (const h of sim.hornets) {
    const a = auraOf(sim, h);
    if (!a) continue;
    sim.bots.forEach((b, i) => {
      if (b.dead || dist(b.x, b.y, h.x, h.y) > a.radius) return;
      slow[i] = Math.min(slow[i], 1 - (1 - a.slow) * sim.engine.stat(b, 'auraSlowTaken', 1));
      b.auraDps = Math.min(b.auraDps + a.dps, a.dps * a.stack);
    });
  }
  // The halo's slow is a held change on the robot's speed (slowing does not stack; a cable's is its own, `holdWeb`).
  sim.bots.forEach((b, i) => (slow[i] < 1 ? sim.engine.hold(b, 'halo', { stat: 'speed', more: slow[i] }, 0.3) : sim.engine.release(b, 'halo')));
  holdWeb(sim, dt);
  for (const b of sim.bots) {
    if (b.dead) continue;
    if (b.auraDps > 0) sim.mark(b, 'twistedAura');
    if (b.auraDps <= 0) continue;
    b.auraAcc += b.auraDps * sim.engine.stat(b, 'auraBurnTaken', 1) * dt;
    while (b.auraAcc >= 1) {
      b.auraAcc -= 1;
      const before = b.hp;
      hurt(sim, b, 1, true, { type: 'dark' });
      if (b.hp < before) sim.events.push({ e: 'halo', bot: b, dmg: before - b.hp }); // plating that stops it shows nothing
    }
  }
}

/** A foe digs in or comes up (P12's Burrow and ambush): while under, nothing reaches it. */
export function setUnder(sim: Sim, h: Hornet, on: boolean) {
  h.under = on;
  reach(sim, h);
}

/** Is the Communicator aiming at it (within `SHY.cone` of the aim, `SHY.tiles` away at most)? A downed one sees nothing. */
export function watched(sim: Sim, h: Hornet) {
  const c = sim.controller;
  if (c.dead || sim.downT > 0) return false;
  const d = dist(c.x, c.y, h.x, h.y);
  if (d > SHY.tiles * T) return false;
  if (d < h.r) return true;
  const off = Math.abs(wrapAngle(Math.atan2(h.y - c.y, h.x - c.x) - Math.atan2(sim.look.y - c.y, sim.look.x - c.x)));
  return off < SHY.cone;
}

/** A mall-cop drone's whistle (`FoeDef.alarm`): every foe within `tiles` hunts `t` for `ALARM.time` s. */
export function whistle(sim: Sim, h: Hornet, t: Bot, tiles: number) {
  for (const o of sim.hornets) {
    if (o.dead || o.boss || dist(o.x, o.y, h.x, h.y) > tiles * T) continue;
    o.target = t.id;
    o.alertT = sim.time + ALARM.time;
  }
  sim.events.push({ e: 'whistle', h });
  if (h.kind === 'officer') say(sim, 'whistle-officer', 'A whistle: an officer unit has seen you, and every machine on this street is coming to see what the fuss is.', 'warn');
  else say(sim, 'whistle', 'A whistle: mall security has seen you, and now everything on this floor knows where you are.', 'warn');
}

/** A boss in a leap or dive, or veiled, or a foe dug in, is out of reach of everything the engine deals (call it after changing `air`, `veiled` or `under`). */
export function reach(sim: Sim, h: Hornet) {
  if (h.air || h.veiled || h.under) sim.engine.addSource(h, UNTOUCHABLE);
  else sim.engine.removeSource(h, UNTOUCHABLE.id);
}

/** A hive's oil ran out. */
export function nestDown(sim: Sim, n: Nest) {
  if (n.dead) return;
  n.hp = 0;
  n.dead = true;
  sim.stats.nests++;
  sim.events.push({ e: 'die', on: 'nest', x: n.x, y: n.y });
  say(sim, `nest-${n.id}`, `${upper(sim.biome.talk.hive)} destroyed. That will thin the swarm.`);
  sim.gone.push(n);
  lastNest(sim);
}

/** Every hive of the land down (a place's own hives, the shrine's and the castle's pits, do not count): its dusk boss comes now, whatever the hour, if it has not come yet. */
function lastNest(sim: Sim) {
  const kind = sim.biome.dusk;
  if (!kind || sim.dungeon || sim.bossSpawned || sim.land?.duskBoss === false) return; // level 1 has no dusk boss
  const land = sim.nests.filter((x) => !x.place);
  if (!land.length || land.some((x) => !x.dead)) return;
  say(sim, 'last-nest', `That was the last ${sim.biome.talk.hive}. Something heard it go: ${bossOf(kind).name} is coming early.`, 'urgent');
  duskBoss(sim, kind);
}

/** The morning's ramp (`DAY.morningStart` at second 0 to 1 at the day's start, times `cfg.morningSwarm`): the share of the day's pace a morning hive spawns at; 0 once the day has come. */
export const morningRamp = (sim: Sim) => lerp(DAY.morningStart, 1, Math.min(1, sim.dayT / Math.max(1, sim.dayCfg.morning))) * sim.cfg.morningSwarm;

export function hives(sim: Sim, dt: number) {
  const morning = sim.day.phase === 'morning'; // the morning's hive ramps up; a place's hives run as in the day
  const m = morning ? morningRamp(sim) : 1;
  const f = sim.intensity;
  const interval = ((NEST.interval[0] + (NEST.interval[1] - NEST.interval[0]) * Math.min(1, f)) * sim.biome.interval * spawnMul(sim.day.step, sim.cfg.berserk)) / Math.max(0.05, sim.cfg.swarm * sim.mods.spawn);
  const cap = Math.round((NEST.alive[0] + (NEST.alive[1] - NEST.alive[0]) * f) * sim.cfg.swarm * sim.biome.alive * sim.mods.spawn);
  for (const n of sim.nests) {
    const ramp = n.place ? 1 : m;
    if (!n.awake || n.dead || ramp <= 0) continue;
    n.spawnT -= dt;
    if (n.spawnT > 0) continue;
    n.spawnT = (interval / ramp) * sim.r.range(0.7, 1.3);
    const room = Math.max(1, Math.round(cap * (n.place ? SHRINE.hiveCap : 1) * Math.min(1, ramp))) - sim.hornets.filter((h) => h.nest === n.id && !h.dead).length;
    if (room <= 0) continue;
    // The first expeditions pick their hives' kind and elites (`spawntiers.ts`).
    const pick = spawnPick(sim, 'hive');
    const first = spawnHornet(sim, n.x + sim.r.range(-10, 10), n.y - 10, n.id, pick?.elite, undefined, pick?.kind ?? mixKind(sim));
    // Some come in packs (`FOES[kind].pack`): the rest of it out of the same hive at once, as long as there is room.
    for (let i = 1; i < Math.min(room, FOES[first.kind].pack ?? 1); i++) spawnHornet(sim, n.x + sim.r.range(-24, 24), n.y - 10 + sim.r.range(-12, 12), n.id, spawnPick(sim, 'hive')?.elite, undefined, first.kind);
  }
}

export function fly(sim: Sim, h: Hornet, dt: number) {
  h.cd -= dt;
  h.wob += dt;
  // A place's sleeper stands still; a calm one drifts to its spot and hunts no one (`placeparts.ts`).
  if (h.sleep || h.dazed) return glide(sim, h, 0, 0, 0, 6, dt);
  if (h.calm) {
    const dx = h.calm.x - h.x, dy = h.calm.y - h.y, d = Math.hypot(dx, dy) || 1, go = d > 6;
    h.target = 0;
    return glide(sim, h, go ? dx / d : 0, go ? dy / d : 0, go ? h.calm.speed : 0, 3, dt);
  }
  let t = sim.bot(h.target);
  // Blinded, it sees only what is close; Taunted, it goes for whoever taunted it; it prefers a Marked robot to a nearer one.
  const aggro = sim.sight(h, (h.home ? huntRange(h) : h.boss ? 60 : FOES[h.kind].aggroTiles) * T * sim.fx.aggro * ((h.alertT ?? 0) > sim.time ? ALARM.aggro : 1));
  const was = h.target;
  // A guardian hunts only within its leash of home.
  const leashed = (b: Bot) => inLeash(h, b);
  // Plain hornets (not elite, twisted or a boss) leave a robot wearing a hornet's head alone.
  const plain = h.kind === 'hornet' && !h.elite && !h.twisted && !h.boss;
  const taunter = sim.engine.flag(h, 'taunted') ? sim.bot((sim.engine.status(h, 'taunted')?.by as Bot | undefined)?.id ?? 0) : undefined;
  if (taunter && taunter.hp > 0 && !taunter.dead && dist(h.x, h.y, taunter.x, taunter.y) <= aggro * 1.3 && leashed(taunter)) {
    t = taunter;
    h.target = t.id;
  } else if (!t || t.hp <= 0 || t.hidden || dist(h.x, h.y, t.x, t.y) > aggro * 1.3 || !leashed(t) || (plain && sim.calm(t))) {
    t = null;
    let best = aggro;
    for (const b of sim.bots) {
      const d = dist(h.x, h.y, b.x, b.y);
      const lure = sim.engine.stat(b, 'lure', 1); // a desk fan draws them from farther
      const score = (sim.engine.flag(b, 'marked') ? d / STATUS_AI.markedPull : d) / lure;
      if (!b.dead && !b.hidden && b.hp > 0 && d < aggro * lure && score < best && leashed(b) && !(plain && sim.calm(b))) {
        best = score;
        t = b;
      }
    }
    h.target = t?.id ?? 0;
  }
  if (!t && h.rim) {
    t = nearestBot(sim, h);
    h.target = t?.id ?? 0;
  }
  const F = FOES[h.kind];
  // A mall-cop drone that spots someone whistles: everything near hunts them for a while.
  if (F.alarm && t && !was && !h.boss) whistle(sim, h, t, F.alarm);
  // A burrower is under the floor (nothing reaches it) until its lunge bursts it out, and for a while after.
  if (F.burrow && !h.boss) {
    const under = h.brain.state === 'roam' && sim.time >= (h.upT ?? 0);
    if (under !== !!h.under) {
      setUnder(sim, h, under);
      if (!under) sim.events.push({ e: 'hit', x: h.x, y: h.y, on: 'rock', dmg: 0 });
    }
  }
  // Staggered, Frozen or Shocked: it can only drift (a boss shrugs the stun off; its own moves are its tells).
  if (!h.boss && sim.stunned(h)) {
    cancelWindup(sim, h);
    return glide(sim, h, 0, 0, 0, 6, dt);
  }
  if (!h.boss) tierThink(sim, h, !!t, dt);
  if (!h.boss && tierAct(sim, h, dt, t)) return glide(sim, h, 0, 0, 0, 8, dt); // a dig, a rearing, a rest: it stands (or tunnels, moved by the dig itself)
  // A mannequin stands still while the Communicator aims at it (within sight): it moves only while you look away.
  h.still = !!F.shy && !h.boss && watched(sim, h);
  if (h.still) {
    cancelWindup(sim, h);
    return glide(sim, h, 0, 0, 0, 8, dt); // it only drifts to a stop (a shove still moves it)
  }
  if (h.spider) return crawl(sim, h, dt, t);
  if (h.grub) return grubStep(sim, h, dt, t);
  // P31: a spanner monkey with stolen scrap runs for the map's edge, hunting no one.
  const run = fleeing(sim, h, FOES[h.kind].speed * (sim.cfg.hornetSpeed / HORNET.speed) * sim.mobility(h));
  if (run) {
    h.target = 0;
    return glide(sim, h, run.dx, run.dy, run.sp, 6, dt);
  }
  if (h.boss) return flyBoss(sim, h, dt, t);
  if (h.feeds) feed(sim, h, dt);
  const tw = h.twisted ? TWISTED[h.kind] : null;
  const bz = sim.berserk(h);
  const br = h.brain;
  const base = F.speed * (sim.cfg.hornetSpeed / HORNET.speed) * (tw?.speed ?? 1) * bz.speed * sim.mobility(h);
  let dx: number, dy: number, sp = base, snap = 5;
  if (t && !sim.seenSwarm && t.role !== 'controller') {
    sim.seenSwarm = true;
    sim.bark(t, 'hornet', true);
  }
  if (t) {
    const d = dist(h.x, h.y, t.x, t.y - 10) || 1;
    const ux = (t.x - h.x) / d, uy = (t.y - 10 - h.y) / d;
    // Twisted ones are erratic: a wider wobble, and dashes (a tell, then a lunge; more of them chained as the night wears on).
    const wob = tw ? 1.1 : 0.5;
    dx = ux + Math.sin(h.wob * 5) * wob;
    dy = uy + Math.cos(h.wob * 4) * wob;
    let dmg = F.dmg * (h.elite ? HORNET.elite.dmg : 1) * (tw?.dmg ?? 1) * bz.dmg;
    // A ranged one keeps its distance, circling, and spits plasma.
    if (F.ranged && br.state === 'roam') {
      const R = F.ranged;
      const push = Math.max(-1, Math.min(1, (d - (hasBreak(h, 'noKeep') ? 0 : R.keep)) / 120)); // a broken track cannot keep its distance
      dx = ux * push - uy * br.orbit * 0.8 + Math.sin(h.wob * 3) * 0.2;
      dy = uy * push + ux * br.orbit * 0.8 + Math.cos(h.wob * 3) * 0.2;
      h.gunT -= dt;
      if (h.gunT <= 0 && d < R.keep * 1.8) {
        h.gunT = (sim.r.range(...R.every) * bz.cd) / Math.max(0.3, sim.engine.stat(h, 'attackRate', 1));
        const a = Math.atan2(uy, ux) + sim.r.range(-0.06, 0.06);
        const bs = boltSpeed(h); // a cracked cannon's bolts are slower, and fly as far
        const s: Shot = {
          id: sim.nextId++, x: h.x + Math.cos(a) * 18, y: h.y - 14 + Math.sin(a) * 18, vx: Math.cos(a) * R.bolt.speed * bs, vy: Math.sin(a) * R.bolt.speed * bs,
          dmg: R.bolt.dmg * (h.elite ? HORNET.elite.dmg : 1) * (tw?.dmg ?? 1) * bz.dmg, life: R.bolt.life / bs, dead: false, big: false, by: h.id, foe: true, type: foeType(h.kind), lay: layOf(h), ...(splits(h) && { split: true }),
        };
        sim.shots.push(s);
        sim.events.push({ e: 'spit', h, s });
      }
    }
    // The twisted dash, or a foe's own strike (the rattler's lunge): a tell, then a lunge.
    const D = foeDash(h);
    if (D) {
      br.t -= dt;
      if ((h.quietT ?? 0) > sim.time && br.state === 'roam') br.t = Math.max(br.t, 0.3); // a hair dryer's gust: no dash while it lasts
      if (br.state === 'roam') {
        // A burrower comes up right under its target (the tell is the crack in the floor).
        if (F.burrow && h.under ? d < T * 1.2 : br.t <= 0 && d < D.range * T && d > h.reach * 1.5) {
          br.state = 'tell';
          br.t = D.tell;
          br.left = dashCount(h, sim.level);
          formation(sim, h, D.tell, br.left);
          sim.events.push({ e: 'tell', h });
        }
      } else if (br.state === 'tell') {
        dx = dy = 0;
        sp = 0;
        br.dx = ux;
        br.dy = uy;
        if (br.t <= 0) {
          br.state = 'go';
          br.t = D.time;
          sim.events.push({ e: 'dash', h });
          twistDash(sim, h, 'go');
          beastDash(sim, h, 'go');
        }
      } else {
        dx = br.dx;
        dy = br.dy;
        sp = base * D.speed;
        snap = 24;
        dmg *= D.dmg;
        twistDash(sim, h, br.t <= 0 ? 'end' : 'on');
        beastDash(sim, h, br.t <= 0 ? 'end' : 'on', dt);
        if (br.t <= 0) {
          if (--br.left > 0) {
            br.state = 'tell';
            br.t = 0.15;
            sim.events.push({ e: 'tell', h });
          } else {
            br.state = 'roam';
            br.t = sim.r.range(D.every[0], D.every[1]) * bz.cd;
            if (F.burrow) h.upT = sim.time + F.burrow;
          }
        }
      }
    }
    if (F.burrow && h.under) sp *= 1.3;
    if (d < h.reach && br.state !== 'tell' && !h.under) {
      if (br.state !== 'go') sp *= 0.3;
      if (h.cd <= 0) {
        h.cd = F.rate / Math.max(0.3, sim.engine.stat(h, 'attackRate', 1));
        sim.events.push({ e: 'sting', h, bot: t });
        foeHit(sim, h, t, beastHit(sim, h, t, dmg, br.state === 'go')); // P31: tusks, a twisted goat's chill, a charged officer, a monkey's theft
      }
    }
  } else if (h.hear && sim.time < h.hear.until && dist(h.x, h.y, h.hear.x, h.hear.y) > T * 1.5) {
    // Echoing: it heard a noise and goes to where it was made, round the rock (the field from there).
    [dx, dy] = flowDir(sim, h.x, h.y, h.hear.field) ?? [h.hear.x - h.x, h.hear.y - h.y];
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    sp *= 0.9;
  } else {
    h.hear = undefined;
    const n = sim.nests.find((x) => x.id === h.nest);
    const cx = n?.x ?? h.home?.x ?? h.x, cy = (n?.y ?? h.home?.y ?? h.y) - 20;
    const a = h.wob * 1.3 + h.id;
    dx = cx + Math.cos(a) * 70 - h.x;
    dy = cy + Math.sin(a) * 45 - h.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    sp *= 0.6;
  }
  glide(sim, h, dx, dy, sp, snap, dt);
}

/** Steer toward a heading (unit-ish) at a speed, easing the velocity; hornets nudge each other apart. */
export function glide(sim: Sim, h: Hornet, dx: number, dy: number, sp: number, snap: number, dt: number) {
  // Down a dungeon, walkers go round the rock: along the flow field toward the Communicator (his party is round him)
  // when the way to their target is not clear.
  // (The vein-crawlers swim through the rock: `walls`.)
  const walker = FOES[h.kind].ground && !FOES[h.kind].walls;
  const tg = (sim.dungeon || sim.intro) && walker && sim.flow ? sim.bot(h.target) : undefined; // the intro's old works too
  if (tg && !tg.dead && !clearLine(sim.blocked, h.x, h.y, tg.x, tg.y, h.r * 0.8)) {
    const step = flowDir(sim, h.x, h.y);
    if (step) [dx, dy] = step;
  }
  if (!h.boss)
    for (const o of sim.hornets) {
      if (o === h || o.dead || o.boss) continue;
      const d = dist(h.x, h.y, o.x, o.y);
      if (d < 18 && d > 0) {
        dx += ((h.x - o.x) / d) * 0.8;
        dy += ((h.y - o.y) / d) * 0.8;
      }
    }
  const k = h.fling?.door !== undefined && sim.time < h.fling.door ? 0 : Math.min(1, dt * snap); // the Open Door's burst: nothing steers it (`crash.ts`)
  h.vx += (dx * sp - h.vx) * k;
  h.vy += (dy * sp - h.vy) * k;
  if (sim.dungeon && walker) {
    // Walls stop walkers (sliding along them); nothing flies through rock down here.
    if (!sim.blocked(h.x + h.vx * dt, h.y)) h.x += h.vx * dt;
    else h.vx = 0;
    if (!sim.blocked(h.x, h.y + h.vy * dt)) h.y += h.vy * dt;
    else h.vy = 0;
    return;
  }
  h.x += h.vx * dt;
  h.y += h.vy * dt;
}

/** The dungeon's flow field toward the Communicator, rebuilt a few times a second. */
export function flowStep(sim: Sim) {
  if (sim.flow && sim.time - sim.flow.at < 0.25) return;
  const c = sim.controller;
  sim.flow = { at: sim.time, field: flowField(sim.map, Math.floor(c.x / T), Math.floor(c.y / T)) };
}

/** The way downhill on the flow field from (x, y): toward the open neighbouring tile nearest the Communicator. */
function flowDir(sim: Sim, x: number, y: number, field = sim.flow!.field): [number, number] | null {
  const f = field, w = sim.W;
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  let best = f[ty * w + tx] ?? Infinity, bx = 0, by = 0;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = tx + ox, ny = ty + oy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= sim.H) continue;
    // Diagonals only where both sides are open, so they do not cut a corner of rock.
    if (ox && oy && (f[ty * w + nx] === Infinity || f[ny * w + tx] === Infinity)) continue;
    const v = f[ny * w + nx];
    if (v < best) {
      best = v;
      bx = (nx + 0.5) * T - x;
      by = (ny + 0.5) * T - y;
    }
  }
  const d = Math.hypot(bx, by);
  return d ? [bx / d, by / d] : null;
}

/** A stun or a freeze cancels what an enemy was winding up. */
export function cancelWindup(sim: Sim, h: Hornet) {
  if (!sim.engine.flag(h, 'cancelWindup')) return;
  if (h.brain.state === 'tell' || h.brain.state === 'go') {
    h.brain.state = 'roam';
    h.brain.t = 1;
  }
  if (h.spider && (h.spider.mode === 'tellPounce' || h.spider.mode === 'tellWeb')) h.spider.mode = 'stalk';
  cancelGrub(h);
  cancelTier(h);
}

/** `summary()`: the live enemies by kind, how many hornets and elites, and the hives. */
export function foeSummary(sim: Sim) {
  return {
    foes: Object.fromEntries((Object.keys(FOES) as Enemy[]).map((k) => [k, sim.hornets.filter((h) => !h.dead && !h.boss && h.kind === k).length]).filter(([, n]) => n)),
    hornets: sim.hornets.length,
    rim: sim.hornets.filter((h) => h.rim && !h.dead).length,
    elites: sim.hornets.filter((h) => h.elite).length,
    menacing: sim.hornets.filter((h) => h.menacing && !h.dead).length,
    limbs: limbSummary(sim),
    nests: sim.nests.map((n) => ({ id: n.id, awake: n.awake, dead: n.dead, hp: Math.round(n.hp), ...(n.place && { place: n.place }) })),
  };
}
