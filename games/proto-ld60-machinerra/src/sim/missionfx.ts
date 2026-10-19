/**
 * What the mission tells the effect engine (P11): which resistances each enemy kind has, what its blows are, and the
 * sources a unit gets that are not gear (titles, the ghost's touch). Plain data and small pure functions; `Sim` wires them.
 *
 * Resistances: a kind with `weak`/`resist` in `FOES` has those (the jungle's, the city's, the mountains', the bosses');
 * the others belong to a family in `FAMILIES` (`FOE_FAMILY`): hornets, the Demon Wastes' machines, the Crawlcam, the
 * rattler. The ghosts have none (nothing touches them but Dark, or a ghostly hand: `ethereal`). `foeTraits` is the one
 * answer to "what is this weak to" (the landing cards and the sim read it); `typeMul` is its number.
 *
 * Add an enemy: its `FOES` entry (a `type` for its blows, `weak`/`resist` or a family here).
 */
import { FOES, type Enemy } from './defs';
import { FAMILIES, RESIST, WEAK, canonType, type CanonType, type DamageType, type Source, type UnitOpts } from './effects';
import { TITLES, titleSources } from '../hub/titles';

/** The family of each kind that has no weaknesses of its own (`FAMILIES` in effects.ts). */
export const FOE_FAMILY: Partial<Record<Enemy, string>> = { hornet: 'hornet', foreman: 'hornet', swarmer: 'demon', drone: 'demon', spider: 'crawlcam', snake: 'rattler' };

/** What a kind is weak to and resists, as current type ids: its own lists, else its family's. */
export function foeTraits(kind: Enemy): { weak: CanonType[]; resist: CanonType[] } {
  const F = FOES[kind];
  const fam = FOE_FAMILY[kind] && FAMILIES[FOE_FAMILY[kind]!];
  const own = F.weak || F.resist;
  const pick = (own_?: DamageType[], fam_?: DamageType[]) => (own ? own_ : fam_) ?? [];
  return {
    weak: pick(F.weak, fam ? fam.weak : undefined).map(canonType),
    resist: pick(F.resist, fam ? fam.resist : undefined).map(canonType),
  };
}

/** How much of a hit of `type` a foe of this kind takes: `WEAK` for its weaknesses, `RESIST` for what it resists. */
export function typeMul(kind: Enemy, type?: DamageType): number {
  if (!type) return 1;
  const t = foeTraits(kind), c = canonType(type);
  return t.weak.includes(c) ? WEAK : t.resist.includes(c) ? RESIST : 1;
}

/** A kick on a Frozen enemy (biomes.md, "New status"): the kick does `mul` times its damage, the ice ends, and `shards` Pierce hit every other enemy within `radius` px. */
export const SHATTER = { shards: 10, radius: 64 };

/**
 * What the status flags mean to the enemy AI and the robots' (P11). `blindTiles`: a Blinded unit sees no further than this and
 * loses a target past it. `markedPull`: a Marked unit counts as this many times nearer when a robot or an enemy picks a target.
 */
export const STATUS_AI = { blindTiles: 2, markedPull: 2 };

/** The damage type of a kind's blows. */
export const foeType = (kind: Enemy): DamageType => FOES[kind].type ?? 'pierce';

/** The engine unit for an enemy of this kind. */
export function foeUnit(kind: Enemy, o: { boss?: boolean; elite?: boolean; twisted?: boolean; menacing?: boolean } = {}): UnitOpts {
  const F = FOES[kind];
  const tags = [...(o.boss ? ['boss'] : []), ...(o.elite ? ['elite'] : []), ...(o.twisted ? ['twisted'] : []), ...(o.menacing ? ['menacing'] : []), ...(F.ethereal ? ['ethereal'] : [])];
  // A kind with its own lists is described by them (a `resist` map); the rest by their family.
  if (F.weak || F.resist) {
    const t = foeTraits(kind);
    return { team: 'foe', tags, resist: { ...Object.fromEntries(t.weak.map((x) => [x, WEAK])), ...Object.fromEntries(t.resist.map((x) => [x, RESIST])) } };
  }
  return { team: 'foe', tags, ...(FOE_FAMILY[kind] && { family: FOE_FAMILY[kind] }) };
}

/**
 * The titles earned as sources for the mission's units: the Communicator's, and each robot's. A title that counts
 * something (`per`) is added that many times, each copy under its own id (`title:patchworkSaint#2`): a unit holds a source
 * id once. `counts.augment` is how many augments are fitted (none exist yet).
 */
export function missionTitles(earned: string[], counts: { augment?: number } = {}): { comm: Source[]; bots: Source[] } {
  const out = { comm: [] as Source[], bots: [] as Source[] };
  for (const { def, source } of titleSources({ earned, worn: null })) {
    if (def.on === 'hub') continue;
    const n = def.per ? counts[def.per] ?? 0 : 1;
    for (let i = 1; i <= n; i++) (def.on === 'comm' ? out.comm : out.bots).push(i === 1 ? source : { ...source, id: `${source.id}#${i}` });
  }
  return out;
}

/** The Esteemed Ghost's touch (or a ghostly piece): the Communicator's hits land on ghosts. */
export const GHOST_TOUCH: Source = { id: 'ghost-touch', kind: 'rescue', name: "The Esteemed Ghost's touch", effects: [{ when: 'always', do: { do: 'flag', flag: 'ghostly' } }] };

/** Nothing lands on it: a boss in a leap or dive, or under the Evil Oracle's veil. */
export const UNTOUCHABLE: Source = { id: 'untouchable', kind: 'trait', name: 'Out of reach', effects: [{ when: 'always', do: { do: 'flag', flag: 'invulnerable' } }] };

/** Sources the dev command `source` can hand a unit: every title (`title:<id>`) and a few plain ones for trying the engine. */
export const DEV_SOURCES: Record<string, Source> = {
  ...Object.fromEntries(Object.entries(TITLES).map(([id, d]) => [`title:${id}`, d.source])),
  armour50: { id: 'dev:armour50', kind: 'other', name: 'Armour 50%', effects: [{ when: 'always', do: { do: 'stat', stat: 'damageTaken', pct: -0.5 } }] },
  plating3: { id: 'dev:plating3', kind: 'other', name: 'Plating 3', effects: [{ when: 'always', do: { do: 'stat', stat: 'plating', add: 3 } }] },
  parry50: { id: 'dev:parry50', kind: 'other', name: 'Parry 50%', effects: [{ when: 'always', do: { do: 'stat', stat: 'parry', add: 0.5 } }] },
  riders: { id: 'dev:riders', kind: 'other', name: 'Every hit rides', effects: [{ when: 'always', do: { do: 'stat', stat: 'rider', add: 1 } }] },
  porter: { id: 'dev:porter', kind: 'other', name: 'Porter (carries 50% faster)', effects: [{ when: 'always', do: { do: 'stat', stat: 'carry', pct: 0.5 } }] },
  lamp: { id: 'dev:lamp', kind: 'other', name: 'A lamp (140 px)', effects: [{ when: 'always', do: { do: 'stat', stat: 'lamp', add: 140 } }] },
  ghostly: GHOST_TOUCH,
};
