/**
 * Laimonas's biome machines beyond their bodies (P31; `docs/biomes.md`, numbers in `defs/beasts.ts`). Plain rules, no Phaser.
 *  - Beast mods (D32): a jungle beast rolls one of its family's at spawn (an elite a second from tier II): Armour plates (its front
 *    resists Impact), Spring legs (a longer leap), Purr box (a Mender: heals its packmates), Piston tusks (its charge Staggers),
 *    Mud tank (a slick of mud along its charge), Bell collar (its charge sets the foes near it on its target).
 *  - The kinds' soft counters: a ram-goat is Heavy (Steady until Staggered), an Officer unit Grounded (it takes no Shock, and a Shock
 *    hit charges its next blow), a Purr box beast a Mender; the counter icons read `countersOf` (`defs/tiers.ts`).
 *  - The officer's whistle, the bleaters' scream, the spanner monkey's theft; the twisted forms' own effects (`TWIST_BEAST`).
 * `tiers.ts` calls in at spawn (`beastSpawn`), each step (`beastThink`), at a dash (`beastDash`), and `foes.ts` and `combat.ts` at a
 * blow (`beastHit`), a hit taken (`beastGuard`), a fall (`beastDown`) and while a thief runs (`fleeing`). Events `beast`.
 */
import { BEAST, BEAST_MODS, KIND_ALWAYS, MODS_OF, SCREAM, STEAL, T, TWIST_BEAST, type BeastModId, type DamageType, type Enemy } from './defs';
import type { Source } from './effects';
import { dist } from './geom';
import { drop } from './loot';
import { addZone } from './props';
import { wakeNear } from './placeparts';
import type { Bot, Hornet, Sim } from './sim';

export type BeastEvent =
  /** An arrival from off the map stepped off the rim (`spider.ts`); a Bell collar's charge rang (`x`, `y`); a herd screamed (each screamer's `h`); an officer took a Shock hit and is charged; a monkey stole `n` scrap, dropped it, or got away with it. */
  { e: 'beast'; what: 'bell' | 'scream' | 'tellScream' | 'ground' | 'steal' | 'drop' | 'away' | 'rimIn'; h: Hornet; x: number; y: number; n?: number };

export const hasMod = (h: Hornet, m: BeastModId) => !!h.mods?.includes(m);

/** Heavy and Grounded as engine sources (Heavy's id is the Wardens', so one rule reads both). */
const HEAVY: Source = { id: 'counter:heavy', kind: 'trait', name: 'Heavy', effects: [{ when: 'always', do: { do: 'flag', flag: 'steady' } }] };
const GROUNDED: Source = { id: 'counter:grounded', kind: 'trait', name: 'Grounded', effects: [{ when: 'always', do: { do: 'stat', stat: 'damageTaken:shock', pct: -1 } }] };
const PURR: Source = {
  id: 'mod:purr', kind: 'trait', name: BEAST_MODS.purr.name,
  effects: [{ when: 'tick', cd: BEAST.purr.every, do: { do: 'pulse', radius: BEAST.purr.radius, side: 'ally', then: { do: 'heal', amount: BEAST.purr.amount, to: 'target' } } }],
};

/** The kinds that are always Heavy or Grounded (`KIND_ALWAYS`, systems.md Soft counters). */
const HEAVY_KINDS = (Object.keys(KIND_ALWAYS) as Enemy[]).filter((k) => KIND_ALWAYS[k] === 'heavy');
const GROUNDED_KINDS = (Object.keys(KIND_ALWAYS) as Enemy[]).filter((k) => KIND_ALWAYS[k] === 'grounded');

/** A new enemy of a biome kind: its mods rolled (D32) and its counters' sources on the engine. */
export function beastSpawn(sim: Sim, h: Hornet, mods?: BeastModId[]) {
  const pool = MODS_OF[h.kind];
  if (pool && !h.boss) {
    const n = h.elite && (h.tier ?? 1) >= 2 ? 2 : 1;
    h.mods = mods ?? sim.tiers.r.shuffle([...pool]).slice(0, Math.min(n, pool.length));
    if (hasMod(h, 'purr')) sim.engine.addSource(h, PURR);
  }
  if (h.boss) return;
  if (HEAVY_KINDS.includes(h.kind)) sim.engine.addSource(h, HEAVY);
  if (GROUNDED_KINDS.includes(h.kind)) sim.engine.addSource(h, GROUNDED);
}

/** Dev and tests: give a foe exactly these mods (its kind's or not). */
export function setMods(sim: Sim, h: Hornet, mods: BeastModId[]) {
  sim.engine.removeSource(h, PURR.id);
  h.mods = mods;
  if (hasMod(h, 'purr')) sim.engine.addSource(h, PURR);
}

/** The lunge it winds up, when a mod changes it (Spring legs: the source's 7 tiles). */
export function modLunge<L extends { range: number }>(h: Hornet, l: L): L {
  return hasMod(h, 'springs') && !h.twisted ? { ...l, range: BEAST.springs } : l;
}
/** One more dash in each wind-up: a twisted pounce-cat leaps twice, a twisted ram-goat charges twice. */
export const beastChain = (h: Hornet) => (h.twisted && TWIST_BEAST.chain.includes(h.kind) ? 1 : 0);

/** A dash begins (`go`), runs (`on`) or ends: a Bell collar rings at the start, a Mud tank lays mud as it runs. */
export function beastDash(sim: Sim, h: Hornet, at: 'go' | 'on' | 'end', dt = 0) {
  if (h.boss) return;
  if (at === 'go' && hasMod(h, 'bell')) {
    const t = sim.bot(h.target);
    if (t) for (const o of sim.hornets) {
      if (o === h || o.dead || o.boss || o.calm || dist(o.x, o.y, h.x, h.y) > BEAST.bell * T) continue;
      o.target = t.id;
      o.alertT = sim.time + 8;
    }
    wakeNear(sim, h.x, h.y);
    sim.events.push({ e: 'beast', what: 'bell', h, x: h.x, y: h.y });
  }
  if (at === 'on' && hasMod(h, 'mud')) {
    h.mudT = (h.mudT ?? 0) - dt;
    if (h.mudT <= 0 && !sim.blocked(h.x, h.y + 6)) {
      h.mudT = BEAST.mud.every;
      addZone(sim, 'mud', h.x, h.y + 6, BEAST.mud.r, BEAST.mud.life);
    }
  }
}

/**
 * A blow of a biome kind lands on a robot (`dashing`: in its charge or leap). Returns what the blow is worth now (a charged officer's
 * doubles, and spends the charge). Piston tusks Stagger in a charge; a twisted ram-goat's blows Chill; a monkey's blow on the
 * Communicator steals scrap.
 */
export function beastHit(sim: Sim, h: Hornet, t: Bot, dmg: number, dashing: boolean): number {
  if (h.charge) {
    h.charge = false;
    dmg *= BEAST.grounded.charge;
  }
  if (dashing && hasMod(h, 'tusks')) sim.engine.apply(t, 'staggered');
  if (h.twisted && TWIST_BEAST.chill.includes(h.kind)) sim.engine.apply(t, 'chilled');
  if (h.kind === 'monkey' && t === sim.controller && h.stolen === undefined) steal(sim, h);
  return dmg;
}

/**
 * A hit about to land on a biome kind: the share of it that does. Armour plates take half of an Impact hit from the front; a
 * Grounded officer takes no Shock and is charged by it.
 */
export function beastGuard(sim: Sim, h: Hornet, by: Bot | null | undefined, type: DamageType | undefined, front: boolean): number {
  if (type === 'shock' && GROUNDED_KINDS.includes(h.kind) && !h.boss) {
    if (!h.charge) sim.events.push({ e: 'beast', what: 'ground', h, x: h.x, y: h.y });
    h.charge = true;
    return 0;
  }
  if (by && front && (type ?? 'impact') === 'impact' && hasMod(h, 'plates')) {
    sim.events.push({ e: 'tier', what: 'block', x: h.x, y: h.y, h });
    return BEAST.plates;
  }
  return 1;
}

// ---------------------------------------------------------------- the monkey's theft

function steal(sim: Sim, h: Hornet) {
  const n = Math.min(STEAL.scrap, Math.floor(sim.scrap));
  if (n <= 0) return;
  sim.scrap -= n;
  h.stolen = n;
  h.target = 0;
  const e = edgeOf(sim, h);
  h.flee = e;
  sim.events.push({ e: 'beast', what: 'steal', h, x: h.x, y: h.y, n });
  sim.say('monkey-steal', `A monkey has your scrap, ${n} of it, and it is running for the edge of the map. Bring it down and it drops it.`, 'warn');
}

/** The nearest point past the map's edge from a foe (px). */
function edgeOf(sim: Sim, h: Hornet) {
  const W = sim.W * T, H = sim.H * T;
  const opts = [{ x: -T, y: h.y, d: h.x }, { x: W + T, y: h.y, d: W - h.x }, { x: h.x, y: -T, d: h.y }, { x: h.x, y: H + T, d: H - h.y }];
  return opts.sort((a, b) => a.d - b.d)[0];
}

/** A thief running: its heading and speed (px/s) for `fly`; reaching the edge, it is gone with the scrap. Null when it is no thief. */
export function fleeing(sim: Sim, h: Hornet, walk: number): { dx: number; dy: number; sp: number } | null {
  if (h.stolen === undefined || !h.flee) return null;
  const dx = h.flee.x - h.x, dy = h.flee.y - h.y, d = Math.hypot(dx, dy) || 1;
  if (h.x < STEAL.edge * T || h.y < STEAL.edge * T || h.x > (sim.W - STEAL.edge) * T || h.y > (sim.H - STEAL.edge) * T) {
    sim.events.push({ e: 'beast', what: 'away', h, x: h.x, y: h.y, n: h.stolen });
    h.dead = true;
    h.hp = 0;
    sim.gone.push(h);
    sim.stats.monkeysAway = (sim.stats.monkeysAway ?? 0) + 1;
    return { dx: 0, dy: 0, sp: 0 };
  }
  return { dx: dx / d, dy: dy / d, sp: walk * STEAL.flee };
}

/** A biome kind has fallen: a thief drops what it took (the Trader's "catch" counts it). */
export function beastDown(sim: Sim, h: Hornet) {
  if (!h.stolen) return;
  drop(sim, h.x, h.y, 'scrap', null, h.stolen);
  sim.events.push({ e: 'beast', what: 'drop', h, x: h.x, y: h.y, n: h.stolen });
  sim.stats.monkeysCaught = (sim.stats.monkeysCaught ?? 0) + 1;
  h.stolen = 0;
}

// ---------------------------------------------------------------- the bleaters' scream

/**
 * Each step for a bleater hunting: with a herd of `SCREAM.herd` round it and its herd's scream ready, it rears (`tellScream`) for
 * `SCREAM.tell` s, then the whole herd screams: every robot within `SCREAM.r` of a screamer takes a stack of Chilled, or Freezes if
 * the screamer is twisted. Returns true while it rears (it stands).
 */
export function screamStep(sim: Sim, h: Hornet, dt: number, hunting: boolean): boolean {
  if (h.kind !== 'bleater' || h.boss) return false;
  if (h.scream !== undefined) {
    h.scream -= dt;
    if (h.scream > 0) return true;
    h.scream = undefined;
    const herd = herdOf(sim, h);
    for (const o of herd) {
      o.screamAt = sim.time + sim.tiers.r.range(...SCREAM.every) * sim.berserk(o).cd;
      sim.events.push({ e: 'beast', what: 'scream', h: o, x: o.x, y: o.y });
    }
    const hit = new Set<Bot>();
    for (const o of herd) for (const b of sim.bots) if (!b.dead && !hit.has(b) && dist(b.x, b.y, o.x, o.y) <= SCREAM.r) {
      hit.add(b);
      sim.engine.apply(b, o.twisted ? 'frozen' : 'chilled');
    }
    sim.drainFx();
    return false;
  }
  if (!hunting || sim.time < (h.screamAt ?? 0)) return false;
  const herd = herdOf(sim, h);
  if (herd.length < SCREAM.herd) return false;
  for (const o of herd) o.screamAt = sim.time + SCREAM.tell + 0.1; // the rest wait for this one's scream
  h.scream = SCREAM.tell;
  sim.events.push({ e: 'beast', what: 'tellScream', h, x: h.x, y: h.y });
  return true;
}
const herdOf = (sim: Sim, h: Hornet) => sim.hornets.filter((o) => !o.dead && o.kind === 'bleater' && !o.sleep && !o.calm && dist(o.x, o.y, h.x, h.y) <= SCREAM.near);

/** debugState(): the biome kinds' mods and states on the land. */
export function beastSummary(sim: Sim) {
  const mods: Record<string, number> = {};
  for (const h of sim.hornets) if (!h.dead) for (const m of h.mods ?? []) mods[m] = (mods[m] ?? 0) + 1;
  return {
    mods,
    charged: sim.hornets.filter((h) => !h.dead && h.charge).length,
    thieves: sim.hornets.filter((h) => !h.dead && h.stolen).map((h) => `h${h.id} ${h.stolen} scrap`),
  };
}

