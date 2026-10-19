/**
 * Enemy tiers and elite traits (P12; behaviour in `sim/tiers.ts`).
 * Add an ability: its row in `FOE_TIERS`/`TIER`. Add a trait: an `ELITE_TRAITS` row.
 */
import { BEAST_MODS } from './beasts';
import { FOES, type Enemy } from './foes';
import type { TraitPart } from './loot';

/**
 * Enemy tiers and elite traits (P12; systems.md, Enemies). Danger grows by abilities, never by health: a tier adds an
 * ability at II and a second at III (`FOE_TIERS`), shown as 1-3 stripes; an elite is a named trait with a crown of its
 * colour, 2x health, and drops its trait's part. The land's threat tier (`Sim.tier`, P40) sets both: the foes' tier, and
 * how many traits an elite rolls (`TIER.traits`). Rules in `sim/tiers.ts`; a kind without an entry here has neither.
 */
export type TierAbility = 'dive' | 'formation' | 'burrow' | 'webCarpet' | 'ambush' | 'acidSpit' | 'bloodlust' | 'scytheThrow' | 'plasmaPuddles' | 'frontShield';

export const FOE_TIERS: Partial<Record<Enemy, [TierAbility, TierAbility]>> = {
  hornet: ['dive', 'formation'],
  spider: ['burrow', 'webCarpet'],
  snake: ['ambush', 'acidSpit'],
  swarmer: ['bloodlust', 'scytheThrow'],
  drone: ['plasmaPuddles', 'frontShield'],
};

export const TIER_ABILITIES: Record<TierAbility, { name: string; blurb: string }> = {
  dive: { name: 'Dive', blurb: 'A telegraphed drop: its shadow shows where it lands, 0.6 s ahead.' },
  formation: { name: 'Formation', blurb: 'Packs of three dash together.' },
  burrow: { name: 'Burrow', blurb: 'Hides in the sand, only its lens glinting, and comes up under a robot.' },
  webCarpet: { name: 'Web carpet', blurb: 'Where its web lands, a Rooted patch stays.' },
  ambush: { name: 'Burrow ambush', blurb: 'Goes under the sand and strikes from beneath a robot.' },
  acidSpit: { name: 'Acid spit', blurb: 'Spits acid from range: Corroded.' },
  bloodlust: { name: 'Bloodlust', blurb: 'Hasted by any kill near it.' },
  scytheThrow: { name: 'Scythe throw', blurb: 'Throws a blade that comes back.' },
  plasmaPuddles: { name: 'Plasma puddles', blurb: 'Its bolts leave a puddle of fire for 3 s.' },
  frontShield: { name: 'Shield', blurb: 'A front shield on allies within 100 px.' },
};

/**
 * The soft counters (systems.md, Soft counters): a rule on one kind or one elite trait that punishes a build leaning one way. Never a
 * wall, never a whole biome: each shows its icon (`counters.ts`) over the enemy and on the course table, and has an answer in gear or a card.
 * Thorns and Mirror shell ride a trait (`ELITE_TRAITS`), Menders the Leech trait, Blinkers a twisted kind (`KIND_COUNTERS`), Heavy a Warden of
 * tier III (`Hornet.warden`, set by P18).
 */
export type CounterId = 'thorns' | 'mirror' | 'mender' | 'blinker' | 'heavy' | 'grounded';
export interface CounterDef { name: string; punishes: string; answers: string; color: number }
export const COUNTERS: Record<CounterId, CounterDef> = {
  thorns: { name: 'Thorns', punishes: 'attack-speed stacking', answers: 'plating, then armour or parry', color: 0xffd070 },
  mirror: { name: 'Mirror shell', punishes: 'gun builds', answers: 'flank it, melee, lobbed shots, Etched', color: 0x9fd0ff },
  mender: { name: 'Mender', punishes: 'damage over time', answers: 'burst, Executioner; kill the mender first', color: 0x70e090 },
  blinker: { name: 'Blinker', punishes: 'slow heavy hits', answers: 'fast hits, Rooted, Frozen', color: 0xc080ff },
  heavy: { name: 'Heavy', punishes: 'kick and crash', answers: 'Stagger it first; crash other foes into it', color: 0xb0b8c0 },
  grounded: { name: 'Grounded', punishes: 'Shock chains', answers: 'another damage type', color: 0xf0cf3a },
};

/** The counters a whole kind carries once twisted (the elite traits' are `ELITE_TRAITS[...].counter`). */
export const KIND_COUNTERS: Partial<Record<Enemy, CounterId>> = { snake: 'blinker' };
/**
 * The counters a whole kind always carries (P31; systems.md Soft counters): ram-goats are Heavy, Officer units Grounded, mannequins
 * Blinkers. A beast mod's: a Purr box beast is a Mender (`MOD_COUNTERS`; the mods are `defs/beasts.ts`).
 */
export const KIND_ALWAYS: Partial<Record<Enemy, CounterId>> = { goat: 'heavy', officer: 'grounded', mannequin: 'blinker' };
export const MOD_COUNTERS: Partial<Record<string, CounterId>> = { purr: 'mender' };

/** The counters on one enemy now: its traits', its twisted kind's, and Heavy for a Warden of tier III (`warden`, `tier`). */
export function countersOf(h: { kind: Enemy; twisted: boolean; traits?: TraitId[]; warden?: boolean; tier?: number; mods?: string[] }): CounterId[] {
  const out: CounterId[] = [];
  for (const t of h.traits ?? []) {
    const c = ELITE_TRAITS[t].counter;
    if (c && !out.includes(c)) out.push(c);
  }
  const k = KIND_COUNTERS[h.kind];
  if (k && h.twisted && !out.includes(k)) out.push(k);
  const a = KIND_ALWAYS[h.kind];
  if (a && !out.includes(a)) out.push(a);
  for (const m of h.mods ?? []) {
    const c = MOD_COUNTERS[m];
    if (c && !out.includes(c)) out.push(c);
  }
  if (h.warden && (h.tier ?? 1) >= 3 && !out.includes('heavy')) out.push('heavy');
  return out;
}

/** What a land can show on the course table: the counters its kinds (and a threat tier III land's Wardens) carry, each with the kinds it sits on. */
export function landCounters(kinds: Enemy[], tier: number): { id: CounterId; on: string[] }[] {
  const rows = new Map<CounterId, string[]>();
  const add = (id: CounterId, on: string) => rows.set(id, [...new Set([...(rows.get(id) ?? []), on])]);
  for (const k of kinds) {
    for (const t of TRAITS_OF[k] ?? []) if (ELITE_TRAITS[t].counter) add(ELITE_TRAITS[t].counter!, `${ELITE_TRAITS[t].name} ${FOES[k].name}`);
    if (KIND_COUNTERS[k]) add(KIND_COUNTERS[k]!, `twisted ${FOES[k].name}`);
    if (KIND_ALWAYS[k]) add(KIND_ALWAYS[k]!, FOES[k].name);
    for (const [m, d] of Object.entries(BEAST_MODS)) if (d.kind === k && MOD_COUNTERS[m]) add(MOD_COUNTERS[m]!, `${d.name} ${FOES[k].name}`);
  }
  if (tier >= 3) add('heavy', 'Wardens');
  return [...rows].map(([id, on]) => ({ id, on }));
}

export type TraitId = 'drummer' | 'carapace' | 'splitter' | 'brood' | 'weaver' | 'broadcaster' | 'hooded' | 'broodRattle' | 'leech' | 'twinBlade' | 'herald' | 'bulwark' | 'mortar' | 'overclock';

export interface TraitDef {
  name: string;
  kind: Enemy;
  /** The part an elite of this trait drops. */
  part: TraitPart;
  /** The crown's colour. */
  color: number;
  blurb: string;
  /** A soft counter, shown as an icon over the enemy (`COUNTERS`). */
  counter?: CounterId;
}

export const ELITE_TRAITS: Record<TraitId, TraitDef> = {
  drummer: { name: 'Drummer', kind: 'hornet', part: 'drum-wing', color: 0xffc040, blurb: 'Hastes the hornets near it every 6 s.' },
  carapace: { name: 'Carapace', kind: 'hornet', part: 'shell-plate', color: 0x9fb4c8, counter: 'thorns', blurb: 'Front hits do 70% less, and Thorns bite back; a kick flips it.' },
  splitter: { name: 'Splitter', kind: 'hornet', part: 'splitter-core', color: 0xff7a48, blurb: 'Dies into three small hornets.' },
  brood: { name: 'Brood', kind: 'spider', part: 'brood-sac', color: 0xb8e060, blurb: 'Lets out two spiderlings at half health.' },
  weaver: { name: 'Weaver', kind: 'spider', part: 'spinneret-plus', color: 0xe8e8f0, blurb: 'Its webs leave Rooted carpets.' },
  broadcaster: { name: 'Broadcaster', kind: 'spider', part: 'speaker-grille', color: 0x58e0ff, blurb: 'Taunts robots for 2 s every 8 s.' },
  hooded: { name: 'Hooded', kind: 'snake', part: 'steel-hood', color: 0xd0a040, blurb: 'Immune from the front: flank it.' },
  broodRattle: { name: 'Brood-rattle', kind: 'snake', part: 'rattle', color: 0xc86040, blurb: 'Calls two more out of the walls.' },
  leech: { name: 'Leech', kind: 'swarmer', part: 'leech-mouth', color: 0xd0306a, counter: 'mender', blurb: 'Heals 30% of the damage it deals, and mends the swarmers round it.' },
  twinBlade: { name: 'Twin-blade', kind: 'swarmer', part: 'twin-scythe', color: 0xff5050, blurb: 'Dashes twice.' },
  herald: { name: 'Herald', kind: 'swarmer', part: 'herald-horn', color: 0xffa8e0, blurb: 'Calls two swarmers on sight.' },
  bulwark: { name: 'Bulwark', kind: 'drone', part: 'shield-emitter', color: 0x70a0ff, counter: 'mirror', blurb: 'A Mirror shell throws part of every shot back at the shooter.' },
  mortar: { name: 'Mortar', kind: 'drone', part: 'mortar-tube', color: 0xe08030, blurb: 'Lobs an area shot every 6 s.' },
  overclock: { name: 'Overclock', kind: 'drone', part: 'overclock-chip', color: 0xff3048, blurb: 'Bursts into speed and fire rate under half oil.' },
};

/** The traits a kind's elites can roll. */
export const TRAITS_OF: Partial<Record<Enemy, TraitId[]>> = {};
for (const [id, d] of Object.entries(ELITE_TRAITS) as [TraitId, TraitDef][]) (TRAITS_OF[d.kind] ??= []).push(id);

/** The numbers of tiers and traits (a lunge is `FoeDef.lunge`'s shape: `range` tiles, `speed` times the walk). */
export const TIER = {
  /** A foe is one tier below its land's with this chance (a tier III land mixes II in); tier I lands are all I. */
  lower: 0.25,
  /** Traits an elite rolls by the land's tier (I, II, III). */
  traits: [1, 1, 2] as const,
  /** Tier II hornets' Dive: a lunge with a 0.6 s tell (its shadow is drawn on the ground). */
  dive: { every: [3, 5] as [number, number], tell: 0.6, time: 0.25, speed: 3.6, dmg: 1.5, range: 6 },
  /** Tier III hornets in `radius` px of one that starts a dash join it (up to `pack` in all). */
  formation: { radius: 150, pack: 3 },
  /** Twin-blade swarmers' dash (a swarmer has none of its own untwisted). */
  twin: { every: [2.2, 3.6] as [number, number], tell: 0.45, time: 0.22, speed: 3.8, dmg: 1.4, range: 6 },
  /**
   * Burrow (Crawlcam II) and ambush (Rattler II): it digs in for `down` (sinking), travels hidden at `speed` times its walk toward the
   * robot (a sand ripple shows; nothing reaches it), and within `near` px marks the spot and holds `up` s (the ring on the sand is
   * the warning), then comes up within `radius` px for `dmg` times its sting and rests `rest` s (the opening to hit it). It may dig
   * again `every` seconds later, from `min` to `max` tiles away; `maxTime` bounds one trip.
   */
  burrow: { every: [6, 9] as [number, number], min: 4, max: 11, down: 0.5, speed: 1.5, near: 60, up: 0.6, rest: 1, dmg: 1.5, radius: 40, maxTime: 6 },
  /**
   * The web carpet (a Crawlcam III's or a Weaver's cable) and the plasma puddle (a drone II's bolt): a patch where the shot landed. It
   * shows at once but is live only after `arm` s, then lasts `life` s; a robot in it gets `status` for `time` s, at most every `every` s
   * (a carpet roots, then lets go a while). `patches`: the most on a land (the oldest go first).
   */
  carpet: { radius: 46, life: 5, arm: 0.5, every: 3, status: 'rooted', time: 1.5 },
  puddle: { radius: 30, life: 3, arm: 0.4, every: 0.5, status: 'burning', time: 1.5 },
  patches: 24,
  /**
   * The scythe throw (swarmer III): it rears for `tell` s (the line shows; the aim locks `lock` s before the throw), then a blade flies
   * out for `out` s at `speed`, turns and comes back to it, striking each robot once a leg for `dmg` times its blow within `radius` px.
   * The rattler's acid spit (III): the same tell, then a shot of acid (`dmg` times its sting) that leaves Corroded.
   */
  scythe: { every: [3, 4.5] as [number, number], min: 2, max: 8, tell: 0.5, lock: 0.15, speed: 300, out: 0.75, life: 2.6, dmg: 0.9, radius: 14 },
  spit: { every: [2.6, 4] as [number, number], min: 3.5, max: 9, tell: 0.5, lock: 0.15, speed: 260, life: 1.5, dmg: 0.9 },
  /** Bloodlust: a kill within `radius` px hastes a swarmer for `time` s. */
  bloodlust: { radius: 220, time: 3 },
  /** Front shield: damage from the front is this share, for allies within `radius` of a tier III drone. */
  frontShield: { radius: 100, share: 0.5 },
  /** Carapace: the share a front hit does; Hooded takes none from the front. A front is within ~70 degrees of where it faces (dot above `cone`). */
  guard: { carapace: 0.3, hooded: 0, cone: 0.35, flip: 2 },
  /** Thorns: flat damage back per melee hit taken. Mirror shell: the share of a shot's damage returned. */
  thorns: 2,
  mirror: { share: 0.3, cd: 0.2 },
  drummer: { radius: 140, every: 6, time: 3 },
  broadcaster: { radius: 260, every: 8, time: 2 },
  leech: 0.3,
  /**
   * Menders (a Leech swarmer): every `every` s it mends each other enemy within `radius` px by `amount` oil: more a second than a
   * Burning (4) or a Scald stack (3) takes. Numbers are guesses (systems.md gives only "faster than ticks").
   */
  mender: { radius: 150, every: 1, amount: 5 },
  /**
   * Blinkers (a twisted rattler): a hit from a weapon that waits longer than `slow` s between blows (a robot's weapon has no wind-up; its
   * rate is the wait) is blinked away from: it steps `jump` px sideways and the hit misses, at most once in `every` s, never while Rooted,
   * Frozen or Staggered. Numbers are guesses.
   */
  blink: { slow: 0.5, jump: 90, every: 2.5 },
  overclock: { below: 0.5, rate: 0.6, speed: 0.2 },
  /** Splitter and Brood: the small ones' share of a full body's oil, and how many. */
  splitter: { count: 3, hp: 0.35 },
  brood: { count: 2, hp: 0.4, at: 0.5 },
  /** Brood-rattle and Herald: the helpers called on sight, and how far from the caller. */
  call: { count: 2, away: 180 },
  /** Mortar: a shell lands on the robot's spot after `tell` s, `radius` px wide, for `dmg` times the drone's. */
  mortar: { every: 6, tell: 1, radius: 60, dmg: 2, min: 3, max: 10 },
  /** Elite looks: the small ones' draw scale. */
  small: 0.65,
};
