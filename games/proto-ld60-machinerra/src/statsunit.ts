/**
 * The units the stats screen reads (P27). In a mission they are the Sim's own: `subjectOf(sim.engine, bot, ...)` reads the
 * engine's real unit, with its statuses and the auras of whoever stands near. Aboard there is no Sim, so `offlineSubjects`
 * builds the same units from what the saves hold: one engine with the Communicator, one unit per robot type (gear only)
 * and one per robot you own (adding its rank, spec and relic), all together at one spot, so auras and "needs an antenna"
 * count as when you stand among your crew. The sources go on in the order `Sim.dress` puts them (`sim/sim.ts`): keep them in step.
 * Plain TS, no Phaser.
 */
import { WEAPONS, ROLES, STEAM, type Role, type WeaponId } from './sim/defs';
import { Effects, type Unit } from './sim/effects';
import {
  BOT_SLOTS, COMM_SLOTS, CREW_ROLES, ITEMS, SLOT_NAMES, gearSources, modsOn, owned, slotWeapons, statsSource,
  type CrewRole, type Gear,
} from './sim/gear';
import { chassisStats, rankStats, type ChassisId } from './sim/bots';
import { relicSource } from './sim/junk';
import { missionTitles } from './sim/missionfx';
import { sourcesOf, type SpecId } from './sim/specs';
import type { Subject } from './statsrows';

/** Where each worn item sits, by item id: the slot on the Communicator, or on this type of robot (an item the Communicator wears that every robot shares is named so). */
export function gearPlaces(g: Gear, who: 'comm' | CrewRole): Record<string, string> {
  const out: Record<string, string> = {};
  if (who !== 'comm')
    for (const s of BOT_SLOTS) {
      const o = owned(g, g.bots[who][s]);
      if (o) out[o.id] = `${SLOT_NAMES[s]} slot`;
    }
  for (const s of COMM_SLOTS) {
    const o = owned(g, g.comm[s]);
    if (o && !(o.id in out)) out[o.id] = who === 'comm' ? `${SLOT_NAMES[s]} slot` : `${SLOT_NAMES[s]} slot on the Communicator`;
    // A mod fitted on the weapon in a slot (P57): "Lug on the Steam gun".
    if (o && (s === 'primary' || s === 'secondary') && who === 'comm') for (const m of modsOn(g, o.uid)) out[`mod:${m.id}`] = `Lug on the ${ITEMS[o.id].name}`;
  }
  return out;
}

/** The hits damage is read under: melee, ranged and each weapon in hand (a piece of gear may touch only some of them). */
export function hitsOf(weapons: readonly WeaponId[]): Subject['hits'] {
  return [
    { label: 'melee', hit: { via: 'melee' } },
    { label: 'ranged', hit: { via: 'gun' } },
    ...weapons.map((w) => ({ label: `with ${WEAPONS[w].name}`, hit: { weapon: w, via: WEAPONS[w].kind === 'melee' ? 'melee' : 'gun' } })),
  ];
}

const basesOf = (role: Role): Subject['bases'] => (role === 'controller' ? { maxHp: ROLES.controller.hp, maxSteam: STEAM.max } : { maxHp: ROLES[role].hp });

/** A unit of an engine as a subject (a mission's units, or the offline ones below). */
export function subjectOf(fx: Effects, unit: Unit, o: { key: string; label: string; sub?: string; role: Role; gear: Gear; weapons?: readonly WeaponId[]; live?: boolean }): Subject {
  return {
    key: o.key, label: o.label, sub: o.sub, fx, unit, bases: basesOf(o.role), live: o.live,
    where: { ...gearPlaces(o.gear, o.role === 'controller' ? 'comm' : (o.role as CrewRole)), ...Object.fromEntries((o.weapons ?? []).map((w) => [`weapon:${w}`, 'In hand'])) },
    hits: hitsOf(o.role === 'controller' ? o.weapons ?? [] : []),
  };
}

/** What the saves hold of the build: the gear (worn pieces), titles earned, the Communicator's chassis and the robots owned. */
export interface Build {
  gear: Gear;
  earned: string[];
  chassis: Partial<Record<ChassisId, number>>;
  robots: { uid: string; name: string; role: CrewRole; rank: number; spec?: SpecId; relic?: string }[];
}

/** The Communicator, then each robot type, then each robot owned, with the engine they share. Each call builds anew. */
export function offlineSubjects(b: Build): Subject[] {
  const fx = new Effects();
  const gs = gearSources(b.gear);
  const titles = missionTitles(b.earned);
  const w = slotWeapons(b.gear);
  const weapons = [w.weapon, ...(w.secondary ? [w.secondary] : [])];
  const make = (key: string, label: string, sub: string | undefined, role: Role, who: { rank?: number; spec?: SpecId; relic?: string }): Subject => {
    const c = role === 'controller';
    const base = basesOf(role).maxHp!;
    const unit: Unit = { x: 0, y: 0, hp: base, maxHp: base };
    fx.add(unit, { team: 'crew' });
    const add = (srcs: Parameters<Effects['addSource']>[1][]) => srcs.forEach((s) => fx.addSource(unit, s));
    add(c ? gs.comm : gs.roles[role as CrewRole]);
    add(c ? titles.comm : titles.bots);
    const extra = c ? chassisStats(b.chassis) : rankStats(role, who.rank ?? 0);
    if (Object.keys(extra).length) add([statsSource(c ? 'chassis' : 'rank', extra, c ? 'Chassis' : `Rank ${who.rank}`)]);
    if (!c) add(sourcesOf({ role, spec: who.spec }));
    const relic = relicSource(who.relic);
    if (relic) add([relic]);
    return subjectOf(fx, unit, { key, label, sub, role, gear: b.gear, weapons: c ? weapons : [] });
  };
  return [
    make('comm', 'The Communicator', undefined, 'controller', {}),
    ...CREW_ROLES.map((r) => make(`type:${r}`, ROLES[r].name, 'every one', r, {})),
    ...b.robots.map((r) => make(`bot:${r.uid}`, r.name, ROLES[r.role].name, r.role, r)),
  ];
}
