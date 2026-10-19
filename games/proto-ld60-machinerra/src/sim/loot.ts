/**
 * Loot: what drops (the table grows with the clock), where it lies, and what picking it up does.
 * Add a loot kind: a `LootKind` (defs/loot.ts), its drop in `drop` and its pickup in `pickups`.
 */

import {
  COPPER,
  ENEMY_PARTS,
  type Enemy,
  LOOT,
  type LootKind,
  MULE,
  PARTS,
  type PartKind,
  ROLES,
  SCAVENGER,
} from './defs';
import { MOD } from './defs/mods';
import { dist } from './geom';
import {
  SPARE_LINE,
  say,
} from './oracle';
import { PERK_FX } from './perks';
import type { Sim } from './sim';
import type {
  Bot,
  Loot,
} from './types';

export type LootEvent =
  /** Something dropped. */
  | { e: 'drop'; l: Loot }
  /** `banked` is the oil of a can that went into the reserve (the bar was full). */
  | { e: 'pickup'; l: Loot; by: Bot; banked: number };

/** Loot that lies where it is and never sinks into the sand (a can in the graveyard). */
export function restLoot(sim: Sim, x: number, y: number, kind: LootKind) {
  const l: Loot = { id: sim.nextId++, x, y, kind, part: null, amt: kind === 'scrap' ? LOOT.scrap * 3 : kind === 'oil' ? LOOT.oil : 0, t: Infinity, dead: false };
  sim.loot.push(l);
  return l;
}

/** An AI core lying where it fell: it never sinks, and any robot that walks over it takes it (`cores`). */
export function dropCore(sim: Sim, x: number, y: number) {
  const p = sim.passableNear(x, y);
  const l = restLoot(sim, p.x + sim.r.range(-8, 8), p.y + sim.r.range(-8, 8), 'core');
  sim.events.push({ e: 'drop', l });
  return l;
}

/** The chance a plain hornet drops something now: it grows the longer you stay (`LOOT.rich`). */
export function lootChance(sim: Sim) {
  return Math.min(LOOT.rich.cap, (sim.cfg.lootChance + LOOT.rich.chance * sim.rich) * sim.fx.drops * sim.mods.loot);
}

/** The loot table as the clock leaves it: parts weigh more the longer you stay. */
function lootTable(sim: Sim): [LootKind, number][] {
  return LOOT.table.map(([k, w]) => [k, k === 'part' ? w * (1 + LOOT.rich.part * sim.rich) : w]);
}

/**
 * A mechahornet's drop, from the loot table. Past the morning a plain hornet's part may be a rarer one, and a gob of
 * scrap grows (`LOOT.rich`); `amt` sets what a pile is worth (scrap, copper) or how much oil a pickup holds (a can by default).
 */
export function drop(sim: Sim, x: number, y: number, kind: LootKind = sim.r.weighted(lootTable(sim)), part: PartKind | null = null, amt?: number, from: Enemy = sim.biome.foes[0][0]) {
  amt ??= kind === 'scrap' ? Math.round(LOOT.scrap * (1 + LOOT.rich.scrap * sim.rich) * sim.fx.drops * sim.mods.loot) : kind === 'oil' ? LOOT.oil : kind === 'copper' ? COPPER.live : 0;
  if (kind === 'part' && !part) {
    const own = ENEMY_PARTS[from];
    part = sim.r.chance(LOOT.rich.rare * Math.min(1, sim.rich)) ? sim.r.pick(own.elite) : own.part;
  }
  const p = sim.passableNear(x, y);
  const l: Loot = { id: sim.nextId++, x: p.x + sim.r.range(-8, 8), y: p.y + sim.r.range(-8, 8), kind, part, amt: kind === 'part' || kind === 'core' ? 0 : amt, t: LOOT.life, dead: false };
  sim.loot.push(l);
  sim.events.push({ e: 'drop', l });
  return l;
}

export function pickups(sim: Sim, dt: number) {
  const c = sim.controller;
  for (const l of sim.loot) {
    l.t -= dt;
    if (l.t <= 0) {
      l.dead = true;
      continue;
    }
    // A Magnet Head's hit (a weapon mod): loot within reach slides to him, fast.
    if ((l.pull ?? 0) > 0 && !c.dead) {
      l.pull! -= dt;
      const dp = dist(l.x, l.y, c.x, c.y);
      if (dp > 1) {
        const k = Math.min(1, (dt * MOD.magnet.speed) / dp);
        l.x += (c.x - l.x) * k;
        l.y += (c.y - l.y) * k;
      }
    }
    // The Communicator's pull: loot slides toward them.
    const dc = dist(l.x, l.y, c.x, c.y);
    const reach = LOOT.magnet * (sim.perks.has('scavenger') ? SCAVENGER.magnet : 1) * (sim.perks.has('packMule') ? PERK_FX.packMule : 1) * sim.engine.stat(c, 'magnet', 1) + (l.kind === 'scrap' ? sim.engine.stat(c, 'scrapMagnet', 0) : 0) + sim.engine.stat(c, 'lootPull', 0); // The Cat's Butler, Pneumatic Post
    if (!c.dead && dc < reach && dc > 1) {
      const k = Math.min(1, (dt * 360) / dc);
      l.x += (c.x - l.x) * k;
      l.y += (c.y - l.y) * k;
    } else
      // A mule's pull, smaller than his.
      for (const m of sim.bots) {
        if (m.role !== 'mule' || m.dead) continue;
        const dm = dist(l.x, l.y, m.x, m.y);
        if (dm > 1 && dm < MULE.magnet * sim.engine.stat(m, 'magnet', 1)) {
          const k = Math.min(1, (dt * 300) / dm);
          l.x += (m.x - l.x) * k;
          l.y += (m.y - l.y) * k;
          break;
        }
      }
    const by = sim.bots.find((b) => !b.dead && !sim.engine.isDown(b) && dist(l.x, l.y, b.x, b.y) < ROLES[b.role].r + 8);
    if (!by) continue;
    l.dead = true;
    if ((l.kind === 'scrap' || l.kind === 'copper') && by.role === 'gatherer') sim.deed('gatherer', 'swept', 1);
    let banked = 0;
    if (l.kind === 'scrap') {
      // A mule squeezes more out of a gob.
      const amt = by.role === 'mule' ? l.amt * MULE.scrap : l.amt;
      sim.gainScrap(amt);
      sim.stats.gathered += amt;
    } else if (l.kind === 'copper') {
      sim.copper += l.amt;
    } else if (l.kind === 'core') {
      sim.cores++;
      say(sim, 'core', 'An AI core. Mind it: it is one more robot the lift can take down. Get it up the lift and it is yours for good.');
    } else if (l.kind === 'oil') {
      // A can tops up whoever picks it up; what the bar cannot hold goes into the reserve.
      const fill = Math.min(by.maxHp - by.hp, l.amt);
      sim.engine.heal(by, fill, by);
      banked = Math.min(l.amt - fill, sim.canCap - sim.reserve);
      sim.reserve += banked;
      if (sim.spareCans > 0) say(sim, 'spare', SPARE_LINE); // the first can stowed (every mission starts with one: the line comes a little after landing)
    } else {
      sim.stats.parts++;
      sim.stats[`part.${l.part}`] = (sim.stats[`part.${l.part}`] ?? 0) + 1; // quests (P38): parts of the kind shown
      sim.parts[l.part!] = (sim.parts[l.part!] ?? 0) + 1;
    }
    sim.events.push({ e: 'pickup', l, by, banked });
    if (l.kind === 'part' && PARTS[l.part!].unique) say(sim, `unique-${l.part}`, `${PARTS[l.part!].name}. Do not put it on. Do not let the engineers put it on. Bring it up and we will see what it is for.`, 'warn');
    if (l.kind === 'part') say(sim, 'parts', `A ${PARTS[l.part!].name.toLowerCase()}. Bring it up anyway; the engineers will pray over it, then take it apart.`);
  }
}

/** `summary()`: what lies on the ground, the parts picked up, and the chance a plain enemy drops something now. */
export function lootSummary(sim: Sim) {
  return {
    loot: sim.loot.map((l) => `${l.part ?? l.kind}@${Math.round(l.x)},${Math.round(l.y)}`),
    parts: sim.parts,
    lootChance: +lootChance(sim).toFixed(2),
  };
}
