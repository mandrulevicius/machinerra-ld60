/**
 * The stats screen's rows (P27, systems.md "UI"): what the effect engine says about one unit, as plain data. Pure TS, no
 * Phaser, no DOM: `stats.ts` draws it, the tests (`statsrows.test.ts`) pin it.
 *
 * `statRows(subject)` asks `fx.explain` for every stat a unit could have and keeps those with a contribution: the final
 * value, the base, and each source or status that changes it, grouped by kind (gear with its quality, relic, spec, punch
 * card, title, rescue passive, building, and in a mission statuses with their seconds left). The parts always rebuild
 * the value: (base + sum of adds) x (1 + sum of pcts) x product of mores, as the engine does it (armour is the one stat with
 * its own sum: diminishing returns, `armourMul`). `typeRows` gives each damage type's status chance and what touches it.
 * `fitted` lists everything on the unit (the screen's "what is on it" list), which hovering a part lights up.
 *
 * Add a stat to the screen: a row in `STATS` (its label and shape). Add a kind of source: its `Group` and a line in `GROUPS`.
 */
import {
  DAMAGE_TYPES, RIDER, RIDERS, POSITIVES, STATUSES, armourMul,
  type CanonType, type Contribution, type Effects, type HitCtx, type Stat, type StatusId, type Unit,
} from './sim/effects';

/** What a part of a stat is, for the grouping and the icon. */
export type Group = 'gear' | 'mod' | 'relic' | 'spec' | 'type' | 'research' | 'title' | 'rescue' | 'building' | 'trait' | 'other' | 'status';
/** Groups in the order the screen lists them, with the word it shows for each. */
export const GROUPS: Record<Group, string> = {
  gear: 'Gear', mod: 'Weapon mod', relic: 'Relic', spec: 'Spec', type: 'Type', research: 'Punch card', title: 'Title', rescue: 'Rescue passive',
  building: 'Building', trait: 'Trait', other: 'Other', status: 'Status',
};
export const GROUP_ORDER = Object.keys(GROUPS) as Group[];

/** Something the unit's stats are read from: the mission's engine and unit, or an offline one built for the hub (`statsunit.ts`). */
export interface Subject {
  /** The picker's key, its name, and what it is (a type, a robot of a type, the Communicator). */
  key: string;
  label: string;
  sub?: string;
  fx: Effects;
  unit: Unit;
  /** A stat's base where it is not the shape's default (max oil, max steam). */
  bases: Partial<Record<string, number>>;
  /** Where a source lives, by its id without any `#n`: "Head slot", "Relic socket". */
  where: Record<string, string>;
  /** Hits to read damage under: melee, ranged and each weapon in hand (a gear piece may only touch some). */
  hits: { label: string; hit: HitCtx }[];
  /** True for a unit in the running mission: statuses and other robots' auras are real. */
  live?: boolean;
}

/** How a stat reads: a multiplier shown as a percentage, a plain number, a chance, or damage taken (armour). */
export type Shape = 'mult' | 'flat' | 'chance' | 'taken';
export const STATS: Partial<Record<Stat, { label: string; shape: Shape }>> = {
  speed: { label: 'Speed', shape: 'mult' },
  attackRate: { label: 'Attack speed', shape: 'mult' },
  damage: { label: 'Damage', shape: 'mult' },
  range: { label: 'Range', shape: 'mult' },
  accuracy: { label: 'Accuracy', shape: 'mult' },
  crit: { label: 'Critical chance', shape: 'chance' },
  knockback: { label: 'Knockback', shape: 'mult' },
  maxHp: { label: 'Max oil', shape: 'flat' },
  regen: { label: 'Oil regeneration', shape: 'flat' },
  maxSteam: { label: 'Max steam', shape: 'flat' },
  steamRegen: { label: 'Steam regeneration', shape: 'mult' },
  steamCost: { label: 'Steam cost', shape: 'mult' },
  damageTaken: { label: 'Damage taken', shape: 'taken' },
  plating: { label: 'Plating', shape: 'flat' },
  parry: { label: 'Parry', shape: 'chance' },
  overcharge: { label: 'Overcharge', shape: 'chance' },
  healReceived: { label: 'Healing received', shape: 'mult' },
  siphonRate: { label: 'Work rate', shape: 'mult' },
  repairRate: { label: 'Repair rate', shape: 'mult' },
  magnet: { label: 'Loot pull', shape: 'mult' },
  lamp: { label: 'Lamp reach', shape: 'flat' },
  pierceShots: { label: 'Shots pass through', shape: 'flat' },
  arcs: { label: 'Extra arcs', shape: 'flat' },
  wetArc: { label: 'Wet arc reach', shape: 'flat' },
  armourPen: { label: 'Armour ignored', shape: 'chance' },
  ignorePlating: { label: 'Ignores plating', shape: 'flat' },
  auraBurnTaken: { label: 'Halo burn taken', shape: 'mult' },
  auraSlowTaken: { label: 'Halo slow taken', shape: 'mult' },
  crashDamage: { label: 'Crash damage', shape: 'mult' },
  lure: { label: 'Enemy draw', shape: 'mult' },
  rider: { label: 'Status chance', shape: 'chance' },
  scrapRate: { label: 'Scrap dropped', shape: 'mult' },
  shockJumps: { label: 'Shock chain jumps', shape: 'flat' },
  scaldBurst: { label: 'Scald burst reach', shape: 'flat' },
  lootPull: { label: 'Loot pull reach', shape: 'flat' },
};

export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
/** "twistedAura" reads "Twisted aura". */
export const nameOf = (id: string) => cap(id.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
export const typeName = (t: string) => cap(t);

/** One contribution as the screen shows it. */
export interface Part {
  /** What hovering lights up: the source id (without `#n`) or `status:<id>`. */
  key: string;
  group: Group;
  name: string;
  quality?: string;
  /** "+12%", "+3", "x1.5": its change, in the row's terms. */
  text: string;
  add: number;
  pct: number;
  more: number;
  stacks?: number;
  /** Seconds left, for a status or held change that ends. */
  left?: number;
  /** Another unit's aura, not its own. */
  aura?: boolean;
}
export interface Row {
  stat: string;
  label: string;
  shape: Shape;
  base: number;
  value: number;
  /** Armour, in words, on the damage taken row. */
  note?: string;
  /** Grouped by kind in `GROUP_ORDER`, each group's parts by name. */
  parts: Part[];
}

const trim = (n: number) => String(Math.round(n * 10) / 10);
const signed = (n: number, suffix = '') => `${n > 0 ? '+' : n < 0 ? '-' : ''}${trim(Math.abs(n))}${suffix}`;
/** A change in the row's terms: a multiplier stat's add is points of 100%, a flat stat's pct is a percentage of it. */
export function changeText(shape: Shape, c: { add: number; pct: number; more: number }): string {
  const bits: string[] = [];
  const pc = shape === 'mult' || shape === 'chance' || shape === 'taken';
  if (c.add) bits.push(pc ? signed(c.add * 100, '%') : signed(c.add));
  if (c.pct) bits.push(signed(c.pct * 100, '%'));
  if (Math.abs(c.more - 1) > 1e-9) bits.push(`x${Math.round(c.more * 100) / 100}`);
  return bits.join(', ') || '+0';
}

const groupOf = (k: Contribution['kind']): Group => (k === 'timed' ? 'status' : k);
const keyOf = (c: Contribution) => (c.kind === 'status' ? `status:${c.id}` : c.kind === 'timed' ? `hold:${c.id}` : c.id.replace(/#\d+$/, ''));

export function partOf(c: Contribution, shape: Shape): Part {
  return {
    key: keyOf(c), group: groupOf(c.kind), name: c.name ?? nameOf(c.id), quality: c.quality, text: changeText(shape, c),
    add: c.add, pct: c.pct, more: c.more, stacks: c.stacks, left: c.left !== undefined && Number.isFinite(c.left) ? c.left : undefined, aura: !!c.owner,
  };
}
const byGroup = (a: Part, b: Part) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name);

/** The row of a stat, or null when nothing touches it. `hit` reads it for one kind of hit (melee, ranged, a weapon). */
export function rowOf(s: Subject, stat: Stat, label: string, shape: Shape, hit?: HitCtx): Row | null {
  const base = s.bases[stat] ?? (shape === 'mult' || shape === 'taken' ? 1 : 0);
  const e = s.fx.explain(s.unit, stat, base, undefined, hit);
  if (!e.parts.length) return null;
  let value = e.value;
  let note: string | undefined;
  if (shape === 'taken') {
    // As the engine takes a hit: percentage armour (the negative pcts) has diminishing returns; a vulnerability adds as usual.
    const neg = e.parts.reduce((n, p) => n + Math.min(0, p.pct), 0);
    value = Math.max(0, (base + e.add) * (1 + e.pct - neg)) * armourMul(-neg * 100) * e.more;
    if (neg < 0) note = `armour ${trim(-neg * 100)}%`;
  }
  return { stat, label, shape, base, value, note, parts: e.parts.map((c) => partOf(c, shape)).sort(byGroup) };
}

/** Dynamic stat names: a type's damage, damage taken and ignored resistance, a status's duration and immunity. */
function dynamicStats(): [Stat, string, Shape][] {
  const out: [Stat, string, Shape][] = [];
  for (const t of DAMAGE_TYPES) out.push([`damage:${t}`, `${typeName(t)} damage`, 'mult'], [`damageTaken:${t}`, `${typeName(t)} damage taken`, 'mult'], [`pen:${t}`, `Ignores ${t} resistance`, 'flat']);
  for (const id of Object.keys(STATUSES)) out.push([`duration:${id}` as Stat, `${nameOf(id)} duration`, 'mult'], [`immune:${id}` as Stat, `Immune to ${id}`, 'flat']);
  return out;
}
const DYNAMIC = dynamicStats();

const sig = (p: Part) => `${p.key}|${p.text}`;

/** A row per stat with a contribution: the named stats, the damage of a hit kind that differs from plain damage, then the per-type ones. */
export function statRows(s: Subject): Row[] {
  const rows: Row[] = [];
  for (const [stat, info] of Object.entries(STATS) as [Stat, { label: string; shape: Shape }][]) {
    const r = rowOf(s, stat, info.label, info.shape);
    if (r) rows.push(r);
    if (stat !== 'damage') continue;
    // A gear piece may only touch melee or gun hits, or one weapon's: read damage under each and add what differs.
    const plain = new Set((r?.parts ?? []).map(sig));
    for (const h of s.hits) {
      const v = rowOf(s, 'damage', `${info.label}, ${h.label}`, 'mult', h.hit);
      if (v && v.parts.some((p) => !plain.has(sig(p)))) rows.push(v);
    }
  }
  for (const [stat, label, shape] of DYNAMIC) {
    const r = rowOf(s, stat, label, shape);
    if (r) rows.push(r);
  }
  return rows;
}

/** A damage type: its rider status, the chance a hit of it applies the status, and what touches it. */
export interface TypeRow {
  type: CanonType;
  name: string;
  status: string;
  positive: string;
  /** Per hit, and per hit of `RIDER.bigAt` or more. */
  chance: number;
  chanceBig: number;
  touches: { what: string; part: Part }[];
}

export function typeRows(s: Subject): TypeRow[] {
  return DAMAGE_TYPES.map((t) => {
    const touches: { what: string; part: Part }[] = [];
    const add = (what: string, r: Row | null, skip?: Set<string>) => {
      for (const part of r?.parts ?? []) if (!skip?.has(sig(part))) touches.push({ what, part });
    };
    // Damage: the type's own stat, and any plain-damage mod that is conditioned on the type.
    const plain = new Set((rowOf(s, 'damage', '', 'mult')?.parts ?? []).map(sig));
    add('Damage', rowOf(s, `damage:${t}`, '', 'mult'));
    add('Damage', rowOf(s, 'damage', '', 'mult', { type: t }), plain);
    add('Status chance', rowOf(s, 'rider', '', 'chance'));
    add('Status chance', rowOf(s, `rider:${t}`, '', 'chance'));
    add('Ignores resistance', rowOf(s, `pen:${t}`, '', 'flat'));
    add('Taken', rowOf(s, `damageTaken:${t}`, '', 'mult'));
    return {
      type: t, name: typeName(t), status: nameOf(RIDERS[t]), positive: nameOf(POSITIVES[t]),
      chance: s.fx.riderChance(s.unit, t, 0), chanceBig: s.fx.riderChance(s.unit, t, RIDER.bigAt), touches,
    };
  });
}

/** Everything on the unit, for the "what is on it" list: its sources, then its statuses. */
export interface Fitted {
  key: string;
  group: Group;
  name: string;
  quality?: string;
  where: string;
  stacks?: number;
  left?: number;
}
/** Statuses the sim keeps fresh as markers: not worth a line. */
const MARKERS: ReadonlySet<string> = new Set(['twistedAura', 'webbed', 'lit', 'menace', 'charge', 'grace', 'steady']);
const KIND_PLACE: Partial<Record<Group, string>> = { relic: 'Relic socket', spec: 'Promotion', type: 'Base type', title: 'Earned title', research: 'Punch card', rescue: 'A rescued friend', building: 'Building' };

export function fitted(s: Subject): Fitted[] {
  const out: Fitted[] = [];
  for (const id of s.fx.inspect(s.unit).sources) {
    const src = s.fx.source(s.unit, id);
    if (!src) continue;
    const key = id.replace(/#\d+$/, '');
    const group = (src.kind ?? 'other') as Group;
    out.push({ key, group: GROUPS[group] ? group : 'other', name: src.name ?? nameOf(id), quality: src.quality, where: s.where[key] ?? KIND_PLACE[group] ?? '' });
  }
  s.fx.eachStatus(s.unit, (id: StatusId, stacks, left) => {
    if (MARKERS.has(id)) return;
    out.push({ key: `status:${id}`, group: 'status', name: nameOf(id), where: STATUSES[id].kind === 'buff' ? 'A boon' : 'A curse', stacks: stacks > 1 ? stacks : undefined, left: Number.isFinite(left) ? left : undefined });
  });
  return out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name));
}

/** The number a row shows: a multiplier as a percentage, a chance as a percentage, a flat stat as itself. */
export function showValue(shape: Shape, v: number): string {
  return shape === 'flat' ? trim(v) : `${Math.round(v * 100)}%`;
}

/** A row as one line of text (the dev command `stats`, a test failure): "Speed 100% -> 131%: Brass shins (rare) +13%, Far Walker +10%". */
export function rowText(r: Row): string {
  const parts = r.parts.map((p) => `${p.name}${p.quality && p.quality !== 'standard' ? ` (${p.quality})` : ''}${p.stacks && p.stacks > 1 ? ` x${p.stacks}` : ''} ${p.text}${p.left !== undefined ? ` ${p.left.toFixed(1)}s` : ''}`);
  return `${r.label} ${showValue(r.shape, r.base)} -> ${showValue(r.shape, r.value)}${r.note ? ` (${r.note})` : ''}: ${parts.join(', ')}`;
}
