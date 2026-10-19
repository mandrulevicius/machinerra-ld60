/**
 * Deeds: meta-progression (systems.md, "Deeds"; decisions.md D1, D8). Every spec has a gauge, filled by every bot of its
 * type in any run; a full gauge unlocks the spec for good, this run and every later one. Core and secondary deeds are the
 * role done well; **every inverted deed is the same counter: kicked crashes by bots of that type** (you invert a role by
 * booting it). Sizes aim at 3-5 specs in a first run of about ten missions (first numbers; iterate by play).
 *
 * Plain TS over one `keep` slice, the **profile** (`persist.ts`): New game wipes the run and not this. The mission counts
 * what each type did in `Sim.stats` as `deed.<type>.<counter>` (`statKey`; `Sim.deed`); `land()` (`carry.ts`) feeds them to
 * `fill` when the lift docks, as it feeds `lines`, so a quit mission fills nothing. The counters fed today: gatherers'
 * `siphon` (a ruin stripped, or `COAL.perJob` coal mined), `swept` (a scrap or copper gob picked up), guards' `tank` and `cannonKill`, repairers' `heal`. The rest are named here and bumped where the mechanic
 * lands (`fieldFix`: P5; `kickCrash`: the kick on bots; the new types: P15); a gauge with no feed stays empty
 * and the dev command `deeds fill` opens it.
 *
 * Add a deed: a row in `DEEDS` for the spec (`sim/specs.ts`) and its counter bumped by `Sim.deed(type, counter)`.
 * `sprocket.2` (every gauge of one type +25%) is `Profile.boost`, read by `fill`.
 */
import { command } from '../../../../harness/dev/commands';
import { BOT_TYPES, SPECS, SPEC_IDS, TYPES, isBotType, specsOf, type BotType, type Focus, type SpecId } from '../sim/specs';
import { persist } from './save';

/** `sum`: the counter adds up over missions. `best`: the best one mission reached. */
export interface Deed {
  /** The counter, in `Sim.stats` as `statKey(type, counter)`. */
  counter: string;
  size: number;
  mode: 'sum' | 'best';
  /** The deed in words (the bench's gauge). */
  text: string;
}

/** The inverted deed, the same for every type. */
const kicked = (): Deed => ({ counter: 'kickCrash', size: 25, mode: 'sum', text: 'Kick bots of this type into foes: 25 kicked crashes' });

export const DEEDS: Record<SpecId, Deed> = {
  siphoner: { counter: 'siphon', size: 15, mode: 'sum', text: 'Do 15 jobs: strip a ruin, or mine 5 coal, for each' },
  carrier: { counter: 'swept', size: 60, mode: 'sum', text: 'Sweep up 60 scrap and copper gobs' },
  firebrand: kicked(),
  bulwark: { counter: 'tank', size: 1500, mode: 'sum', text: 'Take 1500 damage' },
  cannoneer: { counter: 'cannonKill', size: 100, mode: 'sum', text: '100 cannon kills' },
  berserker: kicked(),
  medic: { counter: 'heal', size: 2000, mode: 'sum', text: 'Heal 2000 oil' },
  fieldEngineer: { counter: 'fieldFix', size: 5, mode: 'sum', text: '5 field fixes' },
  saboteur: kicked(),
  scalder: { counter: 'scald', size: 200, mode: 'sum', text: 'Scald 200 times' },
  choirmaster: { counter: 'bless', size: 100, mode: 'sum', text: '100 blessings' },
  condenser: kicked(),
  beacon: { counter: 'lampKill', size: 50, mode: 'sum', text: '50 twisted killed in lamplight' },
  flareRunner: { counter: 'flare', size: 30, mode: 'sum', text: '30 flares' },
  shade: kicked(),
  executioner: { counter: 'backKill', size: 50, mode: 'sum', text: '50 kills from behind' },
  ghost: { counter: 'scoutPct', size: 20, mode: 'best', text: "Scout 20% of a land's fog in one mission" },
  bodyguard: kicked(),
  sniper: { counter: 'eliteKill', size: 20, mode: 'sum', text: '20 elite kills' },
  spotter: { counter: 'mark', size: 100, mode: 'sum', text: '100 Marks' },
  scattergun: kicked(),
};

/** The `Sim.stats` key of a type's counter. */
export const statKey = (type: BotType, counter: string) => `deed.${type}.${counter}`;

/** A spec's counter in a mission's stats: a number, 0 when absent or junk. */
const read = (stats: Record<string, number>, spec: SpecId): number => {
  const v = stats[statKey(SPECS[spec].type, DEEDS[spec].counter)];
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/**
 * What outlives every run. `gauges` are the progress per spec (never above the size), `unlocked` the specs opened for good
 * (kept even if a later build raises a size), `boost` the type whose gauges fill 25% faster (`sprocket.2`).
 */
export interface Profile {
  gauges: Partial<Record<SpecId, number>>;
  unlocked: SpecId[];
  boost: BotType | null;
}
export const freshProfile = (): Profile => ({ gauges: {}, unlocked: [], boost: null });

/** `sprocket.2`: every gauge of the boosted type fills this much faster. */
export const BOOST = 0.25;

const sound = (p: Profile) =>
  !!p && typeof p.gauges === 'object' && p.gauges !== null && Array.isArray(p.unlocked) && Object.values(p.gauges).every((n) => Number.isFinite(n) && (n as number) >= 0) && (p.boost === null || isBotType(p.boost));

/** The profile slice: `keep` means New game does not erase it. `get` drops specs this build no longer knows. */
const slice = persist<Profile>('deeds', freshProfile, {
  keep: true,
  valid: sound,
  sample: { gauges: { siphoner: 1500, bulwark: 640, ghost: 12 }, unlocked: ['siphoner'], boost: 'guard' },
});
export const profile = {
  get: (): Profile => {
    const p = slice.get();
    return {
      gauges: Object.fromEntries(Object.entries(p.gauges).filter(([k]) => k in SPECS)) as Profile['gauges'],
      unlocked: p.unlocked.filter((s) => s in SPECS),
      boost: p.boost,
    };
  },
  set: slice.set,
};

export const isUnlocked = (p: Profile, spec: SpecId) => p.unlocked.includes(spec);
export const gaugeOf = (p: Profile, spec: SpecId) => Math.min(DEEDS[spec].size, p.gauges[spec] ?? 0);

/** The gauges as the bench shows them: a row per focus. */
export interface GaugeRow { spec: SpecId; focus: Focus; name: string; deed: string; have: number; size: number; full: boolean }
export function gaugesOf(p: Profile, type: BotType): GaugeRow[] {
  return specsOf(type).map((s) => {
    const d = DEEDS[s.id];
    return { spec: s.id, focus: s.focus, name: s.name, deed: d.text, have: Math.floor(gaugeOf(p, s.id)), size: d.size, full: isUnlocked(p, s.id) };
  });
}

/**
 * A mission's counters (`Sim.stats`) fill the gauges: sums add, bests keep the larger; `boost` makes the boosted type's
 * gains 25% larger. Returns the profile and the specs this mission unlocked (a full gauge rings and the Oracle names it).
 * A gauge is capped at its size; an unlocked spec stays unlocked.
 */
export function fill(p: Profile, stats: Record<string, number>): { profile: Profile; unlocked: SpecId[] } {
  const gauges = { ...p.gauges };
  const unlocked = [...p.unlocked];
  const fresh: SpecId[] = [];
  for (const id of SPEC_IDS) {
    const raw = read(stats, id);
    if (!raw) continue;
    const d = DEEDS[id];
    const gain = raw * (1 + (p.boost === SPECS[id].type ? BOOST : 0));
    const have = gauges[id] ?? 0;
    gauges[id] = Math.min(d.size, d.mode === 'best' ? Math.max(have, gain) : have + gain);
    if (gauges[id]! >= d.size && !unlocked.includes(id)) {
      unlocked.push(id);
      fresh.push(id);
    }
  }
  return { profile: { ...p, gauges, unlocked }, unlocked: fresh };
}

/**
 * What the Oracle says when `fill` opens specs as the lift docks (`land`): which specs, whose, and where to take them.
 * Empty when nothing opened.
 */
export function announce(specs: SpecId[]): string {
  if (!specs.length) return '';
  const names = specs.map((s) => `${SPECS[s].name} (${TYPES[SPECS[s].type].name})`);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return `The workshop's gauges are full: ${list} ${specs.length > 1 ? 'are' : 'is'} open. Promote a robot at the bench.`;
}

/** Fill a gauge to the top (dev, and a reward that grants a spec): unlocks the spec. */
export function unlock(p: Profile, spec: SpecId): Profile {
  if (!(spec in SPECS)) throw new Error(`unknown spec "${spec}"`);
  return { ...p, gauges: { ...p.gauges, [spec]: DEEDS[spec].size }, unlocked: p.unlocked.includes(spec) ? p.unlocked : [...p.unlocked, spec] };
}

/** `sprocket.2`: one type's gauges fill faster from now on (null: none). */
export const boosted = (p: Profile, type: BotType | null): Profile => ({ ...p, boost: type });

/**
 * The type `sprocket.2` helps when the quest does not name one: the one closest to opening a spec (the largest share of a
 * still-closed gauge), else the first type that has anything left to open, in `BOT_TYPES` order.
 */
export function boostPick(p: Profile, from: readonly BotType[] = BOT_TYPES): BotType {
  const left = from.filter((t) => specsOf(t).some((s) => !isUnlocked(p, s.id)));
  const near = (t: BotType) => Math.max(0, ...specsOf(t).filter((s) => !isUnlocked(p, s.id)).map((s) => gaugeOf(p, s.id) / DEEDS[s.id].size));
  return [...(left.length ? left : from)].sort((a, b) => near(b) - near(a))[0];
}

/**
 * `sprocket.2`'s reward (`Reward.boost`, `dialog.ts`, handed out by `Hub.flush`): `want` is a type id, or `auto` for
 * `boostPick`. The boost is for good; a second grant moves it to the new pick (one type at a time). Returns the type.
 */
export function grantBoost(p: Profile, want: string): { profile: Profile; type: BotType } {
  const type = isBotType(want) ? want : boostPick(p);
  return { profile: boosted(p, type), type };
}

// ---- Dev commands --------------------------------------------------------------------------------------------------

const show = (p: Profile, type: BotType) =>
  `${TYPES[type].name}: ${gaugesOf(p, type).map((g) => `${g.name} ${g.have}/${g.size}${g.full ? ' (unlocked)' : ''}`).join(', ')}`;

/** `deeds [type]` and `deeds fill|reset ...`, as text (the command below, and the tests). */
export function deedsCommand(args: string[], p = profile.get(), write: (p: Profile) => void = (n) => void profile.set(n)): string {
  const [sub, what] = args;
  if (!sub) return BOT_TYPES.map((t) => show(p, t)).join('\n');
  if (isBotType(sub)) return show(p, sub);
  if (sub === 'fill') {
    const specs = what === 'all' ? SPEC_IDS : isBotType(what) ? specsOf(what).map((s) => s.id) : what && what in SPECS ? [what as SpecId] : null;
    if (!specs) return `error: deeds fill <${[...SPEC_IDS, ...BOT_TYPES, 'all'].join('|')}>`;
    write(specs.reduce(unlock, p));
    return `unlocked ${specs.join(', ')}`;
  }
  if (sub === 'boost') {
    if (what !== 'off' && !isBotType(what)) return `error: deeds boost <${BOT_TYPES.join('|')}|off>`;
    write(boosted(p, what === 'off' ? null : (what as BotType)));
    return what === 'off' ? 'no boost' : `${what} gauges fill ${BOOST * 100}% faster`;
  }
  if (sub === 'reset') {
    write(freshProfile());
    return 'deeds forgotten (the profile is the one thing New game keeps)';
  }
  return `error: deeds [${BOT_TYPES.join('|')}] | deeds fill <spec|type|all> | deeds boost <type|off> | deeds reset`;
}

export function registerDeedCommands() {
  command('deeds', (args) => deedsCommand(args), 'deeds [type] | fill <spec|type|all> | boost <type|off> | reset: the deed gauges per bot type (saved across New game); fill unlocks specs', { group: 'bots', args: () => [...BOT_TYPES, 'fill', 'boost', 'reset'] });
}
