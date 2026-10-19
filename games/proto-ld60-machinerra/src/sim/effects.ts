/**
 * The effect engine (systems.md, "The effect language"). Sockets, specs, research cards, augments, titles, buildings,
 * companions and enemies are all lists of effects on a source; this module runs them. Plain TS, no Phaser, deterministic
 * (randomness only from the Rng it is given). The mission runs on it: `Sim.engine` holds every robot, enemy and hive as a
 * unit; what the mission tells it (enemy families, blows, title and dev sources) is `missionfx.ts`. Hits go `damageHornet` /
 * `hurt` (combat.ts) to `strike`, and `Sim.drainFx` turns the engine's reports into sim events. Held speed changes (halos,
 * cables, `Sim.pace`) are `hold` / `release`. Dev: `source`, `status`; `debugState().fx`.
 *
 * An effect is data: `when` (trigger), optional `if`, `chance`, `every`, `cd`, and `do` (one action or a list).
 *   - Event effects fire on a trigger: hit, kill, hurt, down, shot, skill, dash, kick, crash, siphon, search, break, decode, dusk, tick.
 *   - Passive effects only change stats (or raise a flag) while a state holds: always, lit (the unit has the Lit status),
 *     night, or `aura` (the unit stands within `r` of the owner; see below).
 * Actions: status, damage, heal, pulse (area), chain (to the next target), spawn, strip, stat (a timed change), flag (passives).
 *
 * Damage types and statuses (systems.md, "Damage types and statuses"): eight types, each with a negative status for foes and
 * robots and a positive one for allies (`RIDERS`, `STATUSES`). A hit of a type applies its negative status by chance
 * (`RIDER`: 20%, 40% for a hit of 20 or more; the stats `rider` and `rider:<type>` raise it); damage over time never rides.
 * Old ids still read: the types `scald` (Steam) and `rust` (Acid), the status `rusted` (Corroded) are aliases everywhere
 * the engine takes an id (`canonType`, `canonStatus`, `canonStat`); it answers in the new ones.
 *
 * Sources (the format every content set builds on: gear, bot types and specs, relics, research, titles, traits):
 *   { id, kind?, name?, quality?, tags?, effects: Effect[] }
 *   - `id` is unique on a unit (adding the same id replaces it); it is also what `explain` shows and what an aura dedupes by.
 *   - `kind` says what sort of thing it is, for the stats screen (`SourceKind`); `name` and `quality` are for display only.
 *   - `tags` are carried by the owner while the source is on it (`antenna`): conditions `{ is: 'tag' }` and `{ is: 'team' }`
 *     see them. "Works only with an antenna" is an `if: { is: 'team', tag: 'antenna' }`.
 *   - An effect is a passive stat mod: { when: 'always', do: { do: 'stat', stat: 'damageTaken', pct: -0.2 } }
 *     an aura:    { when: 'aura', r: 120, do: { do: 'stat', stat: 'damage', pct: 0.15 } } (allies near the owner, not the
 *                 owner; `side`: 'ally' | 'foe' | 'any', `self: true` includes the owner; one source id counts once on a receiver,
 *                 so ten wearers of the same lamp give +15% once, not ten times)
 *     a flag:   { when: 'always', do: { do: 'flag', flag: 'calm' } }
 *     an event: { when: 'hit', if: { is: 'weapon', weapon: 'tazer' }, cd: 0, do: { do: 'chain', jumps: 2, range: 110, then: ... } }
 *   - A stat mod may be conditioned on the hit being dealt (`via`, `weapon`, `type`): a passive `if` sees the strike in
 *     flight when the engine computes the damage (`{ is: 'via', via: 'melee' }` makes a mod "melee damage"). Anywhere
 *     else (`fx.stat(unit, 'damage')`) there is no hit, so those mods do not show; pass the hit to see them
 *     (`fx.stat(unit, 'damage', 100, undefined, { via: 'melee' })`, and the same for `explain`).
 *   - `gearSources(gear)` in `gear.ts` is the worked example: every item as a source.
 *
 * Bounds, so builds cannot run away:
 *   - Depth 1: what an effect does never fires triggers. Only the host's events (`strike`, `emit`, `down`) and the
 *     engine's own status damage do. One exception, so a downed unit's `down` effects (a revive, a Fury for the crew) always
 *     run: a down caused by an effect's damage is deferred and fires its `down` effects once; a down caused by *those*
 *     effects is silent (`MAX_DOWN_GEN`).
 *   - Every status has a stack cap and a duration; reapplying refreshes, never extends past it.
 *   - Every event effect has a cooldown per unit and source (`DEFAULT_CD` unless it says `cd`; `Infinity` is once).
 *   - Area pulses and chains reach at most `MAX_AREA` / `MAX_CHAIN` units.
 *   - No stat caps (decisions.md, 2026-10-18). Armour is the negative `damageTaken` pct, taken with diminishing returns
 *     (Minos, 2026-10-18): a hit is multiplied by 100 / (100 + armour%), so 100% armour halves it, 300% quarters it, and
 *     nothing ever reaches 0 or heals (`armourMul`). Etched/Acid's `armourPen` and the soft counters still answer stacks.
 *     `plating` takes N off a hit after percentages, never below 1 (and never lifts a 0).
 *
 * Use (the Sim drives it, package M1):
 *   const fx = new Effects(rng.fork('fx'));
 *   fx.add(bot, { team: 'crew' });  fx.addSource(bot, { id: 'toaster', effects: [...] });
 *   fx.strike(bot, hornet, { type: 'impact', amount: 6, via: 'melee' });   // damage, riders, hit/hurt/kill/down triggers
 *   fx.emit({ kind: 'kick', self: comm, target: bot });                    // any other trigger
 *   fx.tick(dt);                                                           // statuses, damage over time, 'tick'
 *   for (const o of fx.drain()) ...                                        // what to show or spawn (`Out`)
 *   fx.stat(bot, 'speed', 100)  fx.flag(bot, 'noMove')  fx.maxHp(bot)      // modified stats
 *   fx.explain(bot, 'speed', 100)                                          // every contribution to a stat (the stats screen)
 * The engine owns the unit's `hp` (damage, heal) and keeps everything else about it (statuses, sources) to itself;
 * `Unit.maxHp` is the base, `fx.maxHp(unit)` the modified maximum (augments, titles).
 */
import { rng as makeRng, type Rng } from '../../../../harness/kit/rng';

// ---------------------------------------------------------------- vocabulary

export const DAMAGE_TYPES = ['impact', 'pierce', 'fire', 'steam', 'shock', 'cold', 'acid', 'dark'] as const;
export type CanonType = (typeof DAMAGE_TYPES)[number];
/** Ids the game used before the type set grew; every API still takes them. */
export const LEGACY_TYPES = { scald: 'steam', rust: 'acid' } as const satisfies Record<string, CanonType>;
export type DamageType = CanonType | keyof typeof LEGACY_TYPES;
export const canonType = (t: DamageType): CanonType => (LEGACY_TYPES as Record<string, CanonType>)[t] ?? (t as CanonType);

export type Phase = 'morning' | 'day' | 'evening' | 'midnight';
/**
 * What the host emits. `skill` is the pack skill (G) after its steam is paid, `dash` the rear piece's dash; `break` the owner
 * breaking a prop, nest or wall (`target` it if it is a unit) and `decode` finishing a live ruin's decode (P30); `oracle` the
 * Oracle speaking (the Communicator is `self`). `cast` is a robot's AI choosing to use an ability (`botskills.ts`): `via` names it
 * ('taunt', 'cloud', ...), `target` is what it is aimed at, and the ability's cooldown is its effect's `cd`.
 */
export type EventKind = 'hit' | 'kill' | 'hurt' | 'down' | 'shot' | 'skill' | 'dash' | 'kick' | 'crash' | 'siphon' | 'search' | 'break' | 'decode' | 'dusk' | 'oracle' | 'tick' | 'cast';
export type StateKind = 'always' | 'lit' | 'night';
/** What the sim asks with `fx.flag`. `calm`: plain hornets leave the unit alone. `ghostly`: its hits land on ghosts. `frozen`: a kick shatters it. */
export type Flag = 'stunned' | 'noMove' | 'cancelWindup' | 'blind' | 'taunted' | 'marked' | 'steady' | 'invulnerable' | 'calm' | 'ghostly' | 'frozen' | 'climbs';
/** What a source is, for the stats screen. */
export type SourceKind = 'gear' | 'mod' | 'type' | 'spec' | 'relic' | 'research' | 'title' | 'rescue' | 'building' | 'trait' | 'other';

/** Status ids that were renamed (Rusted became Corroded). */
export const LEGACY_STATUSES = { rusted: 'corroded' } as const;
/** What an API takes for a status: a current id or an old one. */
export type StatusRef = StatusId | keyof typeof LEGACY_STATUSES;
export const canonStatus = (id: StatusRef): StatusId => (LEGACY_STATUSES as Record<string, StatusId>)[id] ?? (id as StatusId);

/** Names a modifier can change. The sim reads them with `fx.stat(unit, name, base)`. Add a name by adding it here. */
export type Stat =
  | 'speed' | 'attackRate' | 'damage' | 'damageTaken' | 'maxHp' | 'regen' | 'range' | 'siphonRate' | 'steamCost'
  | 'steamRegen' | 'maxSteam' | 'knockback' | 'lamp'
  /** Chance of a critical hit (0..1; a crit doubles the hit), aim, repair and loot pull. */
  | 'crit' | 'accuracy' | 'repairRate' | 'magnet'
  /** Flat damage taken minus N a hit (after percentages, never below 1, not for damage over time). */
  | 'plating'
  /** Chance (0..1) to negate a melee hit and Stagger the attacker. */
  | 'parry'
  /** Healing above full becomes a shield of up to this share of max oil (Medic, Overpressure). */
  | 'overcharge'
  /** How far a Shock hit on a Wet unit jumps to other Wet units (base `WET_ARC`; Conductors adds a lot). */
  | 'wetArc'
  /** Chance (0..1) added to every type's rider chance, and to one type's: `rider:fire` (Burning). */
  | 'rider' | `rider:${DamageType}`
  /** Extra units a hit arcs on to (Charged: a Shock jump to one more, and other hits arc to that many). */
  | 'arcs'
  /** Share (0..1) of the victim's percentage armour this unit's hits ignore (Etched), and a non-zero value to ignore plating. */
  | 'armourPen' | 'ignorePlating'
  /** Extra foes a shot passes through (Keen). */
  | 'pierceShots'
  /** Read by the sim: the share of an aura's burn a robot takes (Harbinger's Bane), and the damage of a crash (the Boot). */
  | 'auraBurnTaken' | 'crashDamage'
  /** The Communicator's, read by the sim (the mastery ladders' titles): how far a kicked body slides (times the kick's knock), and the copper a ruin's wiring gives (times). */
  | 'kickSlide' | 'ruinCopper'
  /** Read by the sim: the share of a halo's slow a robot takes (the desk fan's 0), and how much farther enemies pick it out as a target (the fan's draw). */
  | 'auraSlowTaken' | 'lure'
  /** Read by the sim (P5, `downed.ts`): the speed a carrier keeps with one downed robot on it (base `DOWNED.carry`; more for n: over the square root of n), and the least it keeps whatever it carries (base `DOWNED.floor` for the Communicator, 0 for a Mule). */
  | 'carry' | 'carryFloor'
  /** Duration of the positive statuses (`POSITIVES`) this unit gives, times (1 + pct): Live Wire doubles them (their downsides last as long). */
  | 'givenDuration'
  /** Healing received times (1 + pct) (Shadowed). */
  | 'healReceived'
  /** The Communicator's, read by his dog (P42, `companions.ts`): how far it smells (times), the seconds its bark comes before the twisted (plus), how far its bark reaches (times), a non-zero value makes its bark Blind (Loud Bark) or lets it dig by itself (Good Nose). */
  | 'pointRange' | 'barkWarning' | 'barkRange' | 'barkBlind' | 'dogDigs'
  /** The graveyard's refill (Keeper of the Shoot, times), and how far more a gob of scrap rolls toward the Communicator (px added to `LOOT.magnet`: The Cat's Butler). */
  | 'graveyardHeal' | 'scrapMagnet'
  /** The Communicator's, read by the sim (P58 H, `docks.ts`): oil a second regained by every robot standing on the lift (Keeper of Docks). */
  | 'dockRegen'
  /** The Rising District's (P55 B): scrap dropped, times; extra jumps of a dry Shock chain; px a Scalded foe's death Scalds round it; px of pull on all loot. */
  | 'scrapRate' | 'shockJumps' | 'scaldBurst' | 'lootPull'
  | `damage:${DamageType}` | `damageTaken:${DamageType}` | `pen:${DamageType}` | `duration:${StatusRef}` | `immune:${StatusRef}`;

const STAT_ALIAS: Record<string, string> = {};
for (const pre of ['damage', 'damageTaken', 'pen', 'rider']) for (const [o, n] of Object.entries(LEGACY_TYPES)) STAT_ALIAS[`${pre}:${o}`] = `${pre}:${n}`;
for (const pre of ['duration', 'immune']) for (const [o, n] of Object.entries(LEGACY_STATUSES)) STAT_ALIAS[`${pre}:${o}`] = `${pre}:${n}`;
/** A stat name with any old type or status id in it made current. */
export const canonStat = (s: Stat): Stat => (STAT_ALIAS[s] as Stat | undefined) ?? s;

/**
 * A change to a stat: value = (base + add) * (1 + pct) * more. `per` scales it by the stacks of a status (0 stacks: no
 * effect). `add`/`pct` of the same stat from every modifier sum; `more` multiplies.
 */
export interface Mod {
  stat: Stat;
  add?: number;
  pct?: number;
  more?: number;
  per?: { status: StatusRef; of?: 'self' | 'target' };
}

export interface StatusDef {
  kind: 'debuff' | 'buff';
  /** Seconds, `Infinity` until removed. Also the longest a status can be refreshed to. */
  duration: number;
  /** Default 1. */
  maxStacks?: number;
  /** Per stack. */
  mods?: Mod[];
  /**
   * Damage over time, per stack, in steps of `DOT_STEP`. Its type's riders do not apply, and plating does not stop it.
   * `own`: the unit's own cost (Fired up), not the applier's hit: the applier's damage stats do not scale it.
   */
  dot?: { type: DamageType; perSecond: number; own?: boolean };
  /** Damage of a type taken times this (Wet: Shock doubled). */
  vuln?: Partial<Record<DamageType, number>>;
  /** What the sim asks with `fx.flag`. */
  flags?: Flag[];
  /** Applying it removes these (Wet puts out Burning). */
  ends?: StatusId[];
  /** It cannot be applied while the unit has one of these (a Wet unit cannot burn; a Lit one cannot be Dread). */
  blockedBy?: StatusId[];
  /** At this many stacks it turns into another status (Chilled x3 is Frozen). */
  becomes?: { at: number; id: StatusId };
}

export type StatusId =
  | 'staggered' | 'braced' | 'punctured' | 'keen' | 'burning' | 'stoked' | 'scalded' | 'steaming' | 'shocked' | 'charged'
  | 'chilled' | 'frozen' | 'quenched' | 'corroded' | 'etched' | 'dread' | 'shadowed'
  | 'wet' | 'rooted' | 'slowed' | 'blinded' | 'marked'
  | 'taunted' | 'twistedAura' | 'webbed' | 'menace' | 'haste' | 'fury' | 'grace' | 'lifted' | 'steady' | 'lit' | 'charge';

/**
 * The negative status each damage type's hits apply by chance (`RIDER`), and the positive its allies can be given. Numbers:
 * systems.md "Damage types and statuses"; a `?` marks a guess it does not give (durations of the positives mostly).
 */
export const RIDERS: Record<CanonType, StatusId> = {
  impact: 'staggered', pierce: 'punctured', fire: 'burning', steam: 'scalded', shock: 'shocked', cold: 'chilled', acid: 'corroded', dark: 'dread',
};
export const POSITIVES: Record<CanonType, StatusId> = {
  impact: 'braced', pierce: 'keen', fire: 'stoked', steam: 'steaming', shock: 'charged', cold: 'quenched', acid: 'etched', dark: 'shadowed',
};
/** Armour (percent) as a damage multiplier with diminishing returns: 100 / (100 + armour). Negative armour is plain extra damage taken. No cap, never 0. */
export const armourMul = (armour = 0) => (armour >= 0 ? 100 / (100 + armour) : 1 - armour / 100);
/** The rider chance: a hit applies its type's negative status at `base`, at `big` for a hit of `bigAt` or more. */
export const RIDER = { base: 0.2, big: 0.4, bigAt: 20 };
/** A burning unit that dies sets the units within this many px Burning, once. */
export const BURN_SPREAD = 50;

/** Every status and buff. Add one: its id in `StatusId` and a row here. Numbers: systems.md (Statuses); a `?` marks a guess it does not give. */
export const STATUSES: Record<StatusId, StatusDef> = {
  // Impact
  staggered: { kind: 'debuff', duration: 0.6, flags: ['stunned', 'noMove', 'cancelWindup'] },
  braced: { kind: 'buff', duration: 4 /* ? */, flags: ['steady'], mods: [{ stat: 'knockback', pct: 0.3 }, { stat: 'speed', pct: -0.2 }] },
  // Pierce
  punctured: { kind: 'debuff', duration: 4, maxStacks: 3, dot: { type: 'pierce', perSecond: 2 } },
  keen: { kind: 'buff', duration: 3 /* ? */, mods: [{ stat: 'pierceShots', add: 1 }, { stat: 'crit', add: 0.15 }, { stat: 'damageTaken', pct: 0.1 }] },
  // Fire
  burning: { kind: 'debuff', duration: 3, dot: { type: 'fire', perSecond: 4 }, blockedBy: ['wet'] },
  stoked: { kind: 'buff', duration: 4 /* ? */, mods: [{ stat: 'damage', pct: 0.3 }], dot: { type: 'fire', perSecond: 1, own: true } },
  // Steam
  scalded: { kind: 'debuff', duration: 3, maxStacks: 3, dot: { type: 'steam', perSecond: 3 } },
  steaming: { kind: 'buff', duration: 6 /* ? */, mods: [{ stat: 'speed', pct: 0.25 }, { stat: 'attackRate', pct: 0.25 }, { stat: 'damageTaken', pct: 0.25 }] },
  // Shock
  shocked: { kind: 'debuff', duration: 0.2, flags: ['stunned'] },
  charged: { kind: 'buff', duration: 6 /* ? */, mods: [{ stat: 'arcs', add: 1 }], vuln: { shock: 2 } },
  // Cold
  chilled: { kind: 'debuff', duration: 4 /* ? */, maxStacks: 3, mods: [{ stat: 'speed', pct: -0.15 }, { stat: 'attackRate', pct: -0.15 }], becomes: { at: 3, id: 'frozen' } },
  frozen: { kind: 'debuff', duration: 1.5, flags: ['stunned', 'noMove', 'cancelWindup', 'frozen'] },
  quenched: {
    kind: 'buff', duration: 6 /* ? */, ends: ['burning', 'scalded'],
    mods: [{ stat: 'immune:burning', add: 1 }, { stat: 'immune:scalded', add: 1 }, { stat: 'plating', add: 3 }, { stat: 'speed', pct: -0.15 }],
  },
  // Acid
  corroded: { kind: 'debuff', duration: 6, maxStacks: 5, dot: { type: 'acid', perSecond: 2 }, mods: [{ stat: 'damageTaken', pct: 0.05 }] },
  etched: { kind: 'buff', duration: 4, mods: [{ stat: 'armourPen', add: 0.25 }, { stat: 'ignorePlating', add: 1 }, { stat: 'damageTaken', pct: 0.15 }] },
  // Dark
  dread: { kind: 'debuff', duration: 6 /* ? */, mods: [{ stat: 'damage', pct: -0.2 }], blockedBy: ['lit'] },
  shadowed: { kind: 'buff', duration: 6 /* ? */, mods: [{ stat: 'healReceived', pct: -0.5 }] },
  // Others
  wet: { kind: 'debuff', duration: 4, vuln: { shock: 2, fire: 0.5 }, ends: ['burning'] },
  rooted: { kind: 'debuff', duration: 1.5, flags: ['noMove'] },
  slowed: { kind: 'debuff', duration: 2 /* ? */, mods: [{ stat: 'speed', pct: -0.4 }] },
  blinded: { kind: 'debuff', duration: 1.5, flags: ['blind'] },
  marked: { kind: 'debuff', duration: 4, mods: [{ stat: 'damageTaken', pct: 0.25 }], flags: ['marked'] },
  taunted: { kind: 'debuff', duration: 3, flags: ['taunted'] },
  /** Built (sim): a marker the sim keeps fresh (a short duration, renewed each step) while a robot stands in a twisted halo; the halo's slow and burn are the sim's, the burn a Dark hit (`via: 'aura'`). */
  twistedAura: { kind: 'debuff', duration: 0.3 },
  /** Built (sim): a marker for a spider's cable (the sim lets go of it when the spider dies or the robot is out of reach); the tether's slow is the sim's. */
  webbed: { kind: 'debuff', duration: 1.8 },
  /** Built (sim): the menace level of a past-midnight enemy is its stacks. */
  menace: { kind: 'debuff', duration: Infinity, maxStacks: 99 },
  haste: { kind: 'buff', duration: 3, mods: [{ stat: 'speed', pct: 0.3 }, { stat: 'attackRate', pct: 0.3 }] },
  fury: { kind: 'buff', duration: 5, mods: [{ stat: 'damage', pct: 0.25 }] },
  /** No damage after a revive; the duration is the sim's (`REVIVE.grace`), pass it to `apply`. */
  grace: { kind: 'buff', duration: 1.8, flags: ['invulnerable'] },
  /** On the lift while it rises: no damage, and `addStatus` lets no debuff on (the sim applies it at the second press). */
  lifted: { kind: 'buff', duration: 10, flags: ['invulnerable'] },
  steady: { kind: 'buff', duration: Infinity, flags: ['steady'] },
  /** Inside a robot's lamp. The sim applies and removes it. It ends Dread and keeps it off. */
  lit: { kind: 'buff', duration: Infinity, ends: ['dread'] },
  /** A counter for effects that build up (the power bank's charges). */
  charge: { kind: 'buff', duration: Infinity, maxStacks: 8 },
};
const def = (id: StatusId): StatusDef => STATUSES[id];


/** Damage taken times this when a family is weak to or resists a type. First guesses. */
export const WEAK = 1.5;
export const RESIST = 0.5;
/** Resistances by enemy family (systems.md: Resistances, and the Enemies table; Dark: most enemies resist it). */
export const FAMILIES: Record<string, { weak?: DamageType[]; resist?: DamageType[] }> = {
  hornet: { weak: ['shock'], resist: ['impact', 'dark'] },
  demon: { weak: ['fire', 'steam'], resist: ['dark'] },
  crawlcam: { weak: ['impact'], resist: ['pierce', 'dark'] },
  rattler: { weak: ['steam'], resist: ['pierce', 'dark'] },
  cablepede: { weak: ['impact'], resist: ['shock', 'dark'] },
  fanWraith: { weak: ['shock'], resist: ['pierce', 'dark'] },
  sentry: { weak: ['impact'], resist: ['shock', 'dark'] },
};

// ---------------------------------------------------------------- the data format

export type Side = 'self' | 'target';

export type Cond =
  /** `of` defaults to the target. `min` stacks (default 1). */
  | { is: 'status'; id: StatusRef; of?: Side; min?: number }
  /** Tags the sim sets with `fx.tag`, or a source carries (`Source.tags`): twisted, elite, boss, bot, antenna ... */
  | { is: 'tag'; tag: string; of?: Side }
  /** Some living unit on the owner's team (the owner included) carries the tag: "needs an antenna". */
  | { is: 'team'; tag: string }
  /** Which weapon the hit came from (the weapon id the host passes to `strike`). */
  | { is: 'weapon'; weapon: string | string[] }
  /** Share of max oil, 0..1. */
  | { is: 'hp'; below?: number; above?: number; of?: Side }
  /** Living units on the owner's team, the owner included. */
  | { is: 'crew'; min?: number; max?: number }
  | { is: 'time'; phase: Phase | 'night' | (Phase | 'night')[] }
  /** What the event came through: 'melee', 'gun', 'kick', 'crash', 'saw' ... (free text the sim chooses). */
  | { is: 'via'; via: string | string[] }
  | { is: 'type'; type: DamageType | DamageType[] }
  /** No living foe of the unit within `tiles` tiles (`TILE` px) of it (Far Walker). */
  | { is: 'noFoe'; tiles: number }
  | { is: 'not'; cond: Cond }
  | { is: 'any'; of: Cond[] };

export interface ActStatus {
  do: 'status';
  id: StatusRef;
  /** A number, or 'event' to copy the event target's stacks of this status. Default 1. */
  stacks?: number | 'event';
  duration?: number;
  /** Default: self for a buff, target for a debuff. */
  to?: Side;
}
export interface ActDamage {
  do: 'damage';
  type: DamageType;
  amount?: number;
  /** Plus this share of the event's own damage as dealt (a crash that deals half again). */
  ofEvent?: number;
  /** Plus this share of the hit as the host struck it, before anyone's modifiers (a crit: `ofBase: 1` is a second identical hit). */
  ofBase?: number;
  to?: Side;
}
export interface ActHeal {
  do: 'heal';
  amount?: number;
  /** Plus this share of max oil. */
  share?: number;
  /** Plus this share of the event's own damage as dealt (a Leech's bite heals by what it dealt). */
  ofEvent?: number;
  /** Default self. */
  to?: Side;
}
export interface ActPulse {
  do: 'pulse';
  radius: number;
  /** Centre, default self. */
  at?: Side;
  /** Relative to the owner's team. Default foe. */
  side?: 'foe' | 'ally' | 'any';
  /** Include the owner itself. */
  self?: boolean;
  /** Shown to the sim in the pulse's `Out` (knockback strength). */
  knock?: number;
  /** Run on each unit swept (it is the `target` here). */
  then: Action | Action[];
}
export interface ActChain {
  do: 'chain';
  jumps: number;
  range: number;
  side?: 'foe' | 'ally';
  /** Damage and healing in `then` times this per jump. Default 1. */
  decay?: number;
  /** Run on each unit jumped to (not the one it starts from, the event target). */
  then: Action | Action[];
}
export interface ActSpawn {
  do: 'spawn';
  /** What the sim makes: 'ally', 'slick', 'cloud' ... */
  what: string;
  kind: string;
  count?: number;
  ttl?: number;
  at?: Side;
  /** A cone of `count` bolts instead of one (`pellets`), the cone's width in radians. */
  spread?: number;
  /** A trail or cloud: how far it reaches, and what it does to each foe it touches (the sim calls `fx.touch`). */
  radius?: number;
  then?: Action | Action[];
}
export interface ActStrip {
  do: 'strip';
  id: StatusRef;
  /** Stacks to remove, default all. */
  stacks?: number;
  to?: Side;
}
/** A passive effect raises a flag while its state holds. */
export interface ActFlag {
  do: 'flag';
  flag: Flag;
}
/** In a passive effect: a modifier while its state holds. In an event effect: a modifier for `for` seconds (refreshed, not stacked). */
export type StatAct = Mod & { do: 'stat'; for?: number; to?: Side };
export type Action = ActStatus | ActDamage | ActHeal | ActPulse | ActChain | ActSpawn | ActStrip | StatAct | ActFlag;

export interface EventEffect {
  when: EventKind;
  /** Whose events: its owner's (default), its owner's allies', or both. */
  who?: 'self' | 'ally' | 'any';
  /** For ally events: only within this many px of the owner. */
  near?: number;
  if?: Cond | Cond[];
  /** 0..1, or read from a stat of the owner: `{ stat: 'crit', base: 0.35 }` is 35% plus what the owner's gear adds. */
  chance?: number | { stat: Stat; base?: number };
  /** Fires on every nth qualifying trigger (the third hit Rusted). */
  every?: number;
  /** Seconds before this effect can fire again for this owner. Default `DEFAULT_CD`; `Infinity` is once. */
  cd?: number;
  do: Action | Action[];
}
export interface PassiveEffect {
  when: StateKind;
  if?: Cond | Cond[];
  do: StatAct | ActFlag | (StatAct | ActFlag)[];
}
/** A passive for the units near the owner. Its `if` is read with the owner as `self` and the receiver as `target`. */
export interface AuraEffect {
  when: 'aura';
  /** Px from the owner. */
  r: number;
  /** Relative to the owner's team. Default ally. */
  side?: 'ally' | 'foe' | 'any';
  /** Include the owner itself. */
  self?: boolean;
  if?: Cond | Cond[];
  do: StatAct | ActFlag | (StatAct | ActFlag)[];
}
export type Effect = EventEffect | PassiveEffect | AuraEffect;

/** A socket, spec, card, augment, title, building ...: an id and its effects. One source id once per unit. */
export interface Source {
  id: string;
  effects: Effect[];
  /** What it is, for `explain` and the stats screen. */
  kind?: SourceKind;
  /** Display only: its name and, for gear, its quality. */
  name?: string;
  quality?: string;
  /** Tags the owner carries while it has this source. */
  tags?: string[];
}

// ---------------------------------------------------------------- the engine's world

/** What the engine needs of a game object: where it is and its oil. `maxHp` is the base maximum. */
export interface Unit {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
}
export interface UnitOpts {
  /** Who is a foe of whom: different teams. */
  team: string;
  /** A key of `FAMILIES`. */
  family?: string;
  tags?: string[];
  /** Damage multiplier by type for this unit, replacing its family's. */
  resist?: Partial<Record<DamageType, number>>;
  /** The unit's base maximum oil when the host keeps `unit.maxHp` as the modified maximum (the sim syncs it from `maxHp()`); otherwise `unit.maxHp` is the base. */
  baseMax?: number;
}

export interface Ev {
  kind: EventKind;
  /** Whose event it is: the attacker for hit and kill, the victim for hurt and down. */
  self: Unit;
  target?: Unit;
  /** Damage as dealt, after resistances and armour. */
  amount?: number;
  /** The hit as the host struck it, before anyone's modifiers (`ActDamage.ofBase`). */
  base?: number;
  type?: DamageType;
  via?: string;
  /** Which weapon (a game's weapon id). */
  weapon?: string;
}
/** What a stat is computed for: the hit in flight. Passive conditions `via`, `weapon` and `type` read it. */
export type HitCtx = Pick<Ev, 'via' | 'weapon' | 'type'>;
/** `via` values that are a melee hit: what `parry` can negate. The host passes one of these for stings, swings and saws. */
export const MELEE_VIA = ['melee', 'saw', 'kick'];

/** One contribution to a stat (`Effects.explain`): a source, a status, a timed change, or an aura of another unit. */
export interface Contribution {
  /** A source id, a status id, or the id of the source that granted the timed change. */
  id: string;
  kind: SourceKind | 'status' | 'timed';
  name?: string;
  quality?: string;
  /** Already multiplied by `stacks` where it scales with a status. `more` is the product (1 for none). */
  add: number;
  pct: number;
  more: number;
  /** A status's stacks, and its seconds left. */
  stacks?: number;
  left?: number;
  /** Set when it is another unit's aura. */
  owner?: Unit;
}
/** value = max(0, (base + add) * (1 + pct) * more): what `stat` returns. */
export interface Explained {
  stat: Stat;
  base: number;
  value: number;
  add: number;
  pct: number;
  more: number;
  parts: Contribution[];
}

/** What happened, for the sim to show, play or spawn. `drain()` returns and clears it. */
export type Out =
  /** `mul` is the weakness (above 1) or resistance (below 1) the type met, 1 when none; `via` is what the host said the hit came through. */
  | { t: 'damage'; unit: Unit; by?: Unit; type: DamageType; amount: number; absorbed: number; arc?: boolean; dot?: boolean; mul: number; via?: string }
  | { t: 'heal'; unit: Unit; amount: number; shield: number }
  | { t: 'status'; unit: Unit; id: StatusId; stacks: number; by?: Unit }
  | { t: 'down'; unit: Unit; by?: Unit; burning?: boolean }
  | { t: 'revive'; unit: Unit }
  | { t: 'spawn'; what: string; kind: string; count: number; ttl?: number; spread?: number; radius?: number; then?: Action | Action[]; source: string; x: number; y: number; owner: Unit }
  | { t: 'parry'; unit: Unit; by: Unit }
  | { t: 'pulse'; x: number; y: number; radius: number; knock?: number; owner: Unit }
  | { t: 'chain'; path: Unit[]; owner: Unit }
  | { t: 'proc'; unit: Unit; source: string; index: number; when: EventKind; target?: Unit };

export interface Hit {
  /** Damage after types, resistances and statuses, before the shield. 0 if blocked. */
  final: number;
  /** Oil actually lost. */
  dealt: number;
  /** Taken by the Overcharge shield. */
  absorbed: number;
  lethal: boolean;
  /** Nothing happened: the target was down, unknown, invulnerable or parried. */
  blocked: boolean;
  /** A melee hit the victim parried (`parry`): it dealt nothing and Staggered the attacker. */
  parried?: boolean;
}

/** A tile in px (the game's `T`; sim.test pins that they agree): `noFoe` counts in tiles. */
export const TILE = 32;
export const DEFAULT_CD = 0.1;
export const DOT_STEP = 0.5;
export const TICK_EVERY = 1;
export const MAX_AREA = 24;
export const MAX_CHAIN = 8;
export const MAX_DOWN_GEN = 1;
/** Shock rules (systems.md, Statuses): a Wet target doubles it (see `STATUSES.wet`) and jumps to every Wet unit within `WET_ARC`; otherwise Shocked jumps to one unit within `SHOCK_JUMP`. A jump deals `ARC_SHARE` of the hit (a guess). */
export const WET_ARC = 120;
export const SHOCK_JUMP = 80;
export const ARC_SHARE = 0.5;
/** Overcharge shield: share of max oil lost a second (a guess). */
export const SHIELD_DECAY = 0.05;
const MAX_OUT = 4096;
const EPS = 1e-9;

interface Inst { stacks: number; left: number; by?: Unit; acc: number; /** Burning that came from a spread. */ inherited?: boolean }
interface Rt {
  n: number;
  unit: Unit;
  team: string;
  family?: string;
  resist?: Partial<Record<DamageType, number>>;
  /** The base maximum oil, when the host keeps `unit.maxHp` modified (`UnitOpts.baseMax`). */
  baseMax?: number;
  tags: Set<string>;
  sources: Map<string, Source>;
  statuses: Map<StatusId, Inst>;
  ready: Map<string, number>;
  count: Map<string, number>;
  timed: Map<string, { mod: Mod; left: number; src: string }>;
  shield: number;
  down: boolean;
  dying: boolean;
  tickT: number;
}
interface Ctx { self: Rt; target?: Rt; ev?: Ev }
interface Run { ev: Ev; target?: Rt; gen: number; scale: number; /** The source that fired. */ sid: string }

const arr = <T>(x: T | T[]): T[] => (Array.isArray(x) ? x : [x]);
const isEvent = (e: Effect): e is EventEffect => !['always', 'lit', 'night', 'aura'].includes(e.when);

export class Effects {
  now = 0;
  phase: Phase = 'day';
  private units = new Map<Unit, Rt>();
  private outs: Out[] = [];
  private queue: { v: Rt; by?: Unit; gen: number }[] = [];
  private depth = 0;
  private serial = 0;
  /** Event effects fired so far (`emit` tells its caller whether one did). */
  private fired = 0;
  private reactive = false;
  /** Units with an aura effect on one of their sources. */
  private auraOwners = new Set<Rt>();

  constructor(private r: Rng = makeRng('fx')) {}

  // ---- units and sources

  add(unit: Unit, o: UnitOpts): Unit {
    this.units.set(unit, {
      n: this.serial++, unit, team: o.team, family: o.family, baseMax: o.baseMax, tags: new Set(o.tags),
      resist: o.resist && Object.fromEntries(Object.entries(o.resist).map(([k, v]) => [canonType(k as DamageType), v])),
      sources: new Map(), statuses: new Map(), ready: new Map(), count: new Map(), timed: new Map(),
      shield: 0, down: false, dying: false, tickT: 0,
    });
    return unit;
  }
  remove(unit: Unit): void {
    const rt = this.units.get(unit);
    if (rt) this.auraOwners.delete(rt);
    this.units.delete(unit);
  }
  has(unit: Unit): boolean {
    return this.units.has(unit);
  }
  tag(unit: Unit, tag: string, on = true): void {
    const rt = this.rt(unit);
    if (rt) on ? rt.tags.add(tag) : rt.tags.delete(tag);
  }
  /** Register or replace a source on a unit. Throws on data that breaks the language's rules. */
  addSource(unit: Unit, src: Source): void {
    const rt = this.need(unit);
    validate(src);
    rt.sources.set(src.id, src);
    this.watchAura(rt);
    if (src.effects.some((e) => isEvent(e) && (e.who ?? 'self') !== 'self')) this.reactive = true;
  }
  removeSource(unit: Unit, id: string): void {
    const rt = this.rt(unit);
    rt?.sources.delete(id);
    if (rt) this.watchAura(rt);
  }
  /** A source this unit has, if any. */
  source(unit: Unit, id: string): Source | undefined {
    return this.rt(unit)?.sources.get(id);
  }
  /** Forget cooldowns and counters (a new mission). */
  resetCooldowns(unit: Unit): void {
    const rt = this.rt(unit);
    rt?.ready.clear();
    rt?.count.clear();
  }

  // ---- world

  /** The mission's phase. Entering the evening fires 'dusk' for every unit. */
  setPhase(p: Phase): void {
    const was = this.phase;
    this.phase = p;
    if (p === 'evening' && was !== 'evening') this.top(() => this.each((rt) => this.dispatch({ kind: 'dusk', self: rt.unit }, 0)));
  }
  get night(): boolean {
    return this.phase === 'evening' || this.phase === 'midnight';
  }

  // ---- queries

  /**
   * A stat after every modifier on the unit (sources, auras of others, statuses, timed changes). `target` is for conditions
   * that look at it; `hit` is the blow in flight, for mods conditioned on `via`, `weapon` or `type`.
   */
  stat(unit: Unit, stat: Stat, base = 0, target?: Unit, hit?: HitCtx): number {
    const rt = this.rt(unit);
    return rt ? this.statRt(rt, stat, base, target && this.rt(target), hit) : base;
  }
  /**
   * Everything that adds up to a stat, for the stats screen: each source, aura, status and timed change that touches it,
   * with its add, pct and more. `value` is what `stat` returns and is rebuilt from the parts (see `Explained`).
   */
  explain(unit: Unit, stat: Stat, base = 0, target?: Unit, hit?: HitCtx): Explained {
    const rt = this.rt(unit);
    const parts: Contribution[] = [];
    if (!rt) return { stat, base, value: base, add: 0, pct: 0, more: 1, parts };
    const g = this.gather(rt, stat, target && this.rt(target), hit, parts);
    return { stat, base, value: Math.max(0, (base + g.add) * (1 + g.pct) * g.more), add: g.add, pct: g.pct, more: g.more, parts };
  }
  maxHp(unit: Unit): number {
    const rt = this.rt(unit);
    return rt ? this.statRt(rt, 'maxHp', rt.baseMax ?? unit.maxHp) : unit.maxHp;
  }
  /** True while an `hp` condition reads a maximum: a passive conditioned on oil (a rage under half) would read itself forever. */
  private readingMax = false;
  /** The maximum an `hp` condition compares to: modified, except that a condition met while the maximum is being worked out sees the base. */
  private maxHpForCond(unit: Unit): number {
    if (this.readingMax) return unit.maxHp;
    this.readingMax = true;
    try {
      return this.maxHp(unit);
    } finally {
      this.readingMax = false;
    }
  }
  /** A status on a unit: its stacks, seconds left and who applied it (a Taunted unit's taunter). */
  status(unit: Unit, id: StatusRef): { stacks: number; left: number; by?: Unit } | undefined {
    const i = this.rt(unit)?.statuses.get(canonStatus(id));
    return i && { stacks: i.stacks, left: i.left, by: i.by };
  }
  /** Visit a unit's statuses without allocating (the mission draws them every frame): `f(id, stacks, left)`. */
  eachStatus(unit: Unit, f: (id: StatusId, stacks: number, left: number) => void): void {
    this.rt(unit)?.statuses.forEach((i, id) => f(id, i.stacks, i.left));
  }
  /**
   * A stat change the host holds on a unit under its own `key` (a halo's slow, a pace): replaced by the next `hold` with the
   * same key, gone when `release`d or after `secs` (renew it each step to keep it, or leave it `Infinity`). It is a timed change:
   * `fx.stat` and `explain` see it (as `timed`, with `src` the key).
   */
  hold(unit: Unit, key: string, mod: Mod, secs = Infinity): void {
    this.rt(unit)?.timed.set(`hold:${key}`, { mod, left: secs, src: key });
  }
  release(unit: Unit, key: string): void {
    this.rt(unit)?.timed.delete(`hold:${key}`);
  }
  stacks(unit: Unit, id: StatusRef): number {
    return this.rt(unit)?.statuses.get(canonStatus(id))?.stacks ?? 0;
  }
  /**
   * The chance a hit of `type` and `amount` from `attacker` applies the type's negative status to `victim`: `RIDER.base`
   * (`RIDER.big` from `RIDER.bigAt`), then the attacker's `rider` and `rider:<type>` stats. For the stats screen.
   */
  riderChance(attacker: Unit | undefined, type: DamageType, amount = 0, victim?: Unit): number {
    const a = attacker && this.rt(attacker);
    const v = victim && this.rt(victim);
    const t = canonType(type);
    const base = amount >= RIDER.bigAt ? RIDER.big : RIDER.base;
    return a ? Math.min(1, this.statRt(a, `rider:${t}`, this.statRt(a, 'rider', base, v), v)) : base;
  }
  flag(unit: Unit, f: Flag): boolean {
    const rt = this.rt(unit);
    return !!rt && this.flagRt(rt, f);
  }
  isDown(unit: Unit): boolean {
    return this.rt(unit)?.down ?? false;
  }
  shield(unit: Unit): number {
    return this.rt(unit)?.shield ?? 0;
  }
  /** The damage a hit would deal after types, resistances and statuses, nothing applied. */
  preview(attacker: Unit | undefined, victim: Unit, type: DamageType, amount: number, hit?: Omit<HitCtx, 'type'>): number {
    const v = this.rt(victim);
    if (!v) return amount;
    const a = attacker && this.rt(attacker);
    const t = canonType(type);
    const h = { ...hit, type: t };
    return this.flagRt(v, 'invulnerable') ? 0 : this.incoming(v, t, a ? this.outgoing_(a, v, t, amount, h) : amount, a, { hit: h });
  }
  /** What a hit of `amount` from `attacker` becomes after the attacker's own modifiers (damage, damage of the type), before any victim's: for things that are not units (hives). */
  outgoing(attacker: Unit, type: DamageType, amount: number, hit?: Omit<HitCtx, 'type'>): number {
    const a = this.rt(attacker);
    const t = canonType(type);
    return a ? this.outgoing_(a, undefined, t, amount, { ...hit, type: t }) : amount;
  }
  /** A unit's statuses (stacks and seconds left) and the ids of its sources, for `debugState()` and the dev commands. */
  inspect(unit: Unit): { statuses: Record<string, { stacks: number; left: number }>; sources: string[]; tags: string[] } {
    const rt = this.rt(unit);
    return {
      statuses: Object.fromEntries([...(rt?.statuses ?? [])].map(([id, i]) => [id, { stacks: i.stacks, left: Number.isFinite(i.left) ? +i.left.toFixed(2) : -1 }])),
      sources: [...(rt?.sources.keys() ?? [])],
      tags: [...(rt?.tags ?? [])],
    };
  }
  /** Take what happened since the last call. */
  drain(): Out[] {
    const o = this.outs;
    this.outs = [];
    return o;
  }

  // ---- doing

  /**
   * A hit from `attacker` (or the world): damage with types and resistances, riders (Scald and Rust apply their status, Shock arcs), then hit, hurt, kill and down triggers.
   * `plain`: damage with no type to it (the world's, a test's): no resistance, weakness or vulnerability, no rider; armour and plating still apply.
   */
  strike(attacker: Unit | undefined, victim: Unit, s: { type: DamageType; amount: number; via?: string; weapon?: string; plain?: boolean }): Hit {
    return this.top(() => this.strikeIn(attacker, victim, canonType(s.type), s.amount, { via: s.via, weapon: s.weapon, hit: true, out: true, rider: !s.plain, plain: s.plain }));
  }
  /** Run actions on `target` as `owner`'s effect: what a spawned trail or cloud does to a foe it touches (`ActSpawn.then`, the spawn's `source`). */
  touch(owner: Unit, target: Unit, then: Action | Action[], o: { source?: string; via?: string; weapon?: string } = {}): void {
    const ow = this.rt(owner);
    const t = this.rt(target);
    if (!ow || !t) return;
    const sid = o.source ?? 'touch';
    this.top(() => this.act(ow, `${sid}#touch`, arr(then), { ev: { kind: 'tick', self: owner, target, via: o.via, weapon: o.weapon }, target: t, gen: 0, scale: 1, sid }));
  }
  /** Any other trigger. */
  emit(ev: Ev): boolean {
    const was = this.fired;
    this.top(() => this.dispatch(ev, 0));
    return this.fired > was;
  }
  /** The sim took a unit's oil to zero by its own means: run its down. */
  down(unit: Unit, by?: Unit): void {
    const rt = this.rt(unit);
    if (!rt || rt.down) return;
    this.top(() => {
      unit.hp = 0;
      rt.down = true;
      this.fireDown(rt, by, 0);
    });
  }
  /** Back up at a share of max oil. */
  revive(unit: Unit, share = 0.5): void {
    const rt = this.rt(unit);
    if (!rt) return;
    rt.down = false;
    unit.hp = Math.max(unit.hp, this.maxHp(unit) * share);
    this.push({ t: 'revive', unit });
  }
  /** Give a unit `amount` points of shield outright (Pressure Choir), on top of what it holds; it wears off as any shield does. */
  addShield(unit: Unit, amount: number): void {
    const rt = this.rt(unit);
    if (!rt || rt.down || amount <= 0) return;
    rt.shield += amount;
    this.push({ t: 'heal', unit, amount: 0, shield: amount });
  }
  /** Returns the oil restored. Above full it becomes a shield if `by` (or the unit) has the `overcharge` stat. */
  heal(unit: Unit, amount: number, by?: Unit): number {
    const rt = this.rt(unit);
    if (!rt || amount <= 0 || (rt.down && !rt.dying)) return 0;
    amount = this.statRt(rt, 'healReceived', amount);
    if (amount <= 0) return 0;
    const max = this.maxHp(unit);
    const real = Math.min(Math.max(0, max - unit.hp), amount);
    unit.hp += real;
    let shield = 0;
    if (amount > real) {
      const src = (by && this.rt(by)) || rt;
      const cap = this.statRt(src, 'overcharge', 0) * max;
      shield = Math.min(amount - real, Math.max(0, cap - rt.shield));
      rt.shield += shield;
    }
    this.push({ t: 'heal', unit, amount: real, shield });
    return real;
  }
  /** Apply a status. Returns false if the unit is down, immune, or has a status that blocks it (a Wet unit cannot burn). */
  apply(unit: Unit, id: StatusRef, o: { stacks?: number; duration?: number; by?: Unit } = {}): boolean {
    const rt = this.rt(unit);
    return !!rt && this.addStatus(rt, canonStatus(id), o.stacks ?? 1, o.duration, o.by);
  }
  /** End every debuff on a unit. */
  cleanse(unit: Unit): void {
    const rt = this.rt(unit);
    if (rt) for (const id of [...rt.statuses.keys()]) if (def(id).kind === 'debuff') this.stripRt(rt, id);
  }
  /** Remove stacks of a status (all by default). */
  strip(unit: Unit, id: StatusRef, stacks?: number): void {
    const rt = this.rt(unit);
    if (rt) this.stripRt(rt, canonStatus(id), stacks);
  }
  /** Keep a status on a unit at least `left` s more, its stacks untouched (the Frostspine's cold holds its Chill). */
  renew(unit: Unit, id: StatusRef, left: number): void {
    const i = this.rt(unit)?.statuses.get(canonStatus(id));
    if (i) i.left = Math.max(i.left, left);
  }
  /** Advance time: statuses and their damage, shields, timed changes, 'tick' triggers. */
  tick(dt: number): void {
    this.now += dt;
    this.top(() => {
      this.each((rt) => {
        if (rt.down) return;
        for (const [id, i] of [...rt.statuses]) {
          const d = def(id);
          const live = Math.min(dt, i.left);
          if (d.dot) {
            i.acc += live;
            while (i.acc >= DOT_STEP - EPS && !rt.down) {
              i.acc -= DOT_STEP;
              const b = i.by && this.rt(i.by);
              this.strikeIn(d.dot.own ? undefined : i.by, rt.unit, canonType(d.dot.type), d.dot.perSecond * i.stacks * DOT_STEP, { hit: false, out: !!b && !d.dot.own, rider: false, dot: true });
            }
          }
          i.left -= dt;
          if (i.left <= EPS) rt.statuses.delete(id);
        }
        if (rt.down) return;
        for (const [k, t] of [...rt.timed]) if ((t.left -= dt) <= EPS) rt.timed.delete(k);
        if (rt.shield > 0) rt.shield = Math.max(0, rt.shield - SHIELD_DECAY * this.maxHp(rt.unit) * dt);
        const max = this.maxHp(rt.unit);
        if (rt.unit.hp > max) rt.unit.hp = max;
        rt.tickT += dt;
        while (rt.tickT >= TICK_EVERY - EPS) {
          rt.tickT -= TICK_EVERY;
          this.dispatch({ kind: 'tick', self: rt.unit }, 0);
        }
      });
    });
  }

  // ---- stats

  private statRt(rt: Rt, stat: Stat, base: number, target?: Rt, hit?: HitCtx): number {
    const g = this.gather(rt, stat, target, hit);
    return Math.max(0, (base + g.add) * (1 + g.pct) * g.more);
  }
  /** Every modifier of a stat on a unit, summed; with `parts` each is also listed. */
  private gather(rt: Rt, stat: Stat, target?: Rt, hit?: HitCtx, parts?: Contribution[]): { add: number; pct: number; more: number; neg: number } {
    let add = 0;
    let pct = 0;
    let more = 1;
    let neg = 0;
    stat = canonStat(stat);
    const take = (m: Mod, k: number, who: Pick<Contribution, 'id' | 'kind' | 'name' | 'quality' | 'stacks' | 'left' | 'owner'>): void => {
      if (canonStat(m.stat) !== stat) return;
      if (m.per) k *= (m.per.of === 'target' ? target : rt)?.statuses.get(canonStatus(m.per.status))?.stacks ?? 0;
      if (k === 0) return;
      const a = (m.add ?? 0) * k;
      const p = (m.pct ?? 0) * k;
      const mo = m.more !== undefined ? m.more ** k : 1;
      add += a;
      pct += p;
      if (p < 0) neg += p;
      more *= mo;
      parts?.push({ ...who, add: a, pct: p, more: mo });
    };
    this.passives(rt, target, hit, (a, src, owner) => {
      if (a.do === 'stat') take(a, 1, { id: src.id, kind: src.kind ?? 'other', name: src.name, quality: src.quality, owner });
    });
    for (const [id, i] of rt.statuses) for (const m of def(id).mods ?? []) take(m, i.stacks, { id, kind: 'status', stacks: i.stacks, left: i.left });
    for (const t of rt.timed.values()) take(t.mod, 1, { id: t.src, kind: 'timed', left: t.left });
    return { add, pct, more, neg };
  }
  /**
   * The passive actions in force on a unit: its own sources' `always`, `lit` and `night` effects whose conditions hold, its
   * own auras that include it, and the auras of other units that reach it. `owner` is set for another unit's aura.
   */
  private passives(rt: Rt, target: Rt | undefined, hit: HitCtx | undefined, f: (a: StatAct | ActFlag, src: Source, owner?: Unit) => void): void {
    const ev = hit && ({ kind: 'hit', self: rt.unit, ...hit } as Ev);
    const c: Ctx = { self: rt, target, ev };
    for (const src of rt.sources.values()) {
      for (const e of src.effects) {
        if (isEvent(e)) continue;
        if (e.when === 'aura') {
          if (!e.self || !this.ok(e.if, c)) continue;
        } else {
          if (e.when === 'lit' && !rt.statuses.has('lit')) continue;
          if (e.when === 'night' && !this.night) continue;
          if (!this.ok(e.if, c)) continue;
        }
        for (const a of arr(e.do)) f(a, src);
      }
    }
    if (!this.auraOwners.size) return;
    const seen = new Set<string>();
    for (const owner of this.auraOwners) {
      if (owner === rt || owner.down) continue;
      for (const src of owner.sources.values()) {
        src.effects.forEach((e, i) => {
          if (e.when !== 'aura') return;
          const key = `${src.id}#${i}`;
          if (seen.has(key)) return;
          const side = e.side ?? 'ally';
          if (side !== 'any' && (side === 'ally') !== (owner.team === rt.team)) return;
          if (dist2(owner.unit, rt.unit) > e.r * e.r) return;
          if (!this.ok(e.if, { self: owner, target: rt, ev })) return;
          seen.add(key);
          for (const a of arr(e.do)) f(a, src, owner.unit);
        });
      }
    }
  }
  private flagRt(rt: Rt, f: Flag): boolean {
    for (const id of rt.statuses.keys()) if (def(id).flags?.includes(f)) return true;
    let on = false;
    this.passives(rt, undefined, undefined, (a) => {
      if (a.do === 'flag' && a.flag === f) on = true;
    });
    return on;
  }
  private watchAura(rt: Rt): void {
    if ([...rt.sources.values()].some((s) => s.effects.some((e) => e.when === 'aura'))) this.auraOwners.add(rt);
    else this.auraOwners.delete(rt);
  }
  /** Does the unit carry the tag now: one the sim set (`tag`) or one of its sources gives. */
  tagged(unit: Unit, tag: string): boolean {
    const rt = this.rt(unit);
    return !!rt && this.hasTag(rt, tag);
  }
  private hasTag(rt: Rt, tag: string): boolean {
    if (rt.tags.has(tag)) return true;
    for (const s of rt.sources.values()) if (s.tags?.includes(tag)) return true;
    return false;
  }

  // ---- damage


  private outgoing_(a: Rt, v: Rt | undefined, type: DamageType, amount: number, hit?: HitCtx): number {
    return this.statRt(a, `damage:${type}`, this.statRt(a, 'damage', amount, v, hit), v, hit);
  }
  /** What the victim takes of `amount`: resistances and weaknesses, statuses, percentage mitigation, then flat `plating` (hits only). */
  private incoming(v: Rt, type: DamageType, amount: number, by?: Rt, o: { dot?: boolean; hit?: HitCtx; plain?: boolean } = {}): number {
    const m = o.plain ? 1 : this.typeMul(v, type, by);
    // Percentage armour is the negative `damageTaken` pct, with diminishing returns (`armourMul`); an attacker's
    // `armourPen` (Etched) ignores that share of it. Positive `damageTaken` (vulnerability) adds as usual.
    const g = this.gather(v, 'damageTaken', by, o.hit);
    const pen = by ? Math.min(1, Math.max(0, this.statRt(by, 'armourPen', 0, v, o.hit))) : 0;
    const a = Math.max(0, (amount * m + g.add) * (1 + g.pct - g.neg) * armourMul(-g.neg * (1 - pen) * 100) * g.more);
    const taken = this.statRt(v, `damageTaken:${type}`, a, by, o.hit);
    if (o.dot || taken <= 0) return taken;
    const plate = by && this.statRt(by, 'ignorePlating', 0, v, o.hit) > 0 ? 0 : this.statRt(v, 'plating', 0, by, o.hit);
    return plate > 0 ? Math.max(Math.min(taken, 1), taken - plate) : taken;
  }
  /** What a hit of `type` is multiplied by on the victim: its resistances and weaknesses (unless the attacker's `pen` ignores a resistance), then its statuses' vulnerabilities. */
  private typeMul(v: Rt, type: DamageType, by?: Rt): number {
    let m = this.resistMul(v, type);
    if (m < 1 && by && this.statRt(by, `pen:${type}`, 0, v) > 0) m = 1;
    for (const [id, i] of v.statuses) {
      const x = def(id).vuln?.[type];
      if (x !== undefined) m *= x ** i.stacks;
    }
    return m;
  }
  private resistMul(v: Rt, type: DamageType): number {
    if (v.resist && type in v.resist) return v.resist[type]!;
    const f = v.family && FAMILIES[v.family];
    if (!f) return 1;
    const has = (list?: DamageType[]) => !!list?.some((t) => canonType(t) === type);
    return has(f.weak) ? WEAK : has(f.resist) ? RESIST : 1;
  }

  /** Damage into oil (shield first). Marks the unit down if it is the last of it; the caller runs the down. */
  private deliver(by: Rt | undefined, v: Rt, type: DamageType, amount: number, o: { out: boolean; arc?: boolean; dot?: boolean; hit?: HitCtx; plain?: boolean }): Hit & { raw: number } {
    const none = { final: 0, dealt: 0, absorbed: 0, lethal: false, blocked: true, raw: 0 };
    if (v.down || this.flagRt(v, 'invulnerable')) return none;
    // A ghost (tag `ethereal`) is touched only by Dark, or by a `ghostly` attacker: faith (no attacker) never reaches it.
    if (v.tags.has('ethereal') && type !== 'dark' && !(by && this.flagRt(by, 'ghostly'))) return none;
    const raw = o.out && by ? this.outgoing_(by, v, type, amount, o.hit) : amount;
    const final = this.incoming(v, type, raw, by, { dot: o.dot, hit: o.hit, plain: o.plain });
    const absorbed = Math.min(v.shield, final);
    v.shield -= absorbed;
    const dealt = Math.min(v.unit.hp, final - absorbed);
    v.unit.hp -= final - absorbed;
    const lethal = v.unit.hp <= 0;
    if (lethal) {
      v.unit.hp = 0;
      v.down = true;
    }
    this.push({ t: 'damage', unit: v.unit, by: by?.unit, type, amount: final, absorbed, arc: o.arc, dot: o.dot, mul: o.plain ? 1 : this.typeMul(v, type, by), via: o.hit?.via });
    return { final, dealt, absorbed, lethal, blocked: false, raw };
  }

  /** The full path of a hit: a parry, damage, riders, and the triggers. */
  private strikeIn(by: Unit | undefined, victim: Unit, type: DamageType, amount: number, o: { via?: string; weapon?: string; hit: boolean; out: boolean; rider: boolean; dot?: boolean; plain?: boolean }): Hit {
    const v = this.rt(victim);
    const b = by && this.rt(by);
    if (!v) return { final: 0, dealt: 0, absorbed: 0, lethal: false, blocked: true };
    const hit: HitCtx = { via: o.via, weapon: o.weapon, type };
    if (o.hit && b && !v.down && o.via && MELEE_VIA.includes(o.via) && !this.flagRt(v, 'invulnerable')) {
      const p = this.statRt(v, 'parry', 0, b, hit);
      if (p > 0 && this.r.chance(Math.min(1, p))) {
        this.addStatus(b, 'staggered', 1, undefined, victim);
        this.push({ t: 'parry', unit: victim, by: b.unit });
        return { final: 0, dealt: 0, absorbed: 0, lethal: false, blocked: true, parried: true };
      }
    }
    const h = this.deliver(b, v, type, amount, { out: o.out, dot: o.dot, hit, plain: o.plain });
    if (h.blocked) return h;
    if (o.rider) this.riders(b, v, type, h.raw, 0);
    const ev = { amount: h.final, base: amount, type, via: o.via, weapon: o.weapon };
    if (o.hit && by) this.dispatch({ kind: 'hit', self: by, target: victim, ...ev }, 0);
    this.dispatch({ kind: 'hurt', self: victim, target: by, ...ev }, 0);
    if (h.lethal) {
      if (by) this.dispatch({ kind: 'kill', self: by, target: victim, ...ev }, 0);
      this.fireDown(v, by, 0);
    }
    return h;
  }

  /** Damage from an effect or a rider: no triggers (depth 1), a lethal one is deferred (see the header). `hit` is the trigger's, so mods on `via` and `weapon` apply. */
  private secondary(by: Rt | undefined, v: Rt, type: DamageType, amount: number, gen: number, o: { out: boolean; rider: boolean; arc?: boolean; hit?: HitCtx }): void {
    const h = this.deliver(by, v, type, amount, { out: o.out, arc: o.arc, hit: o.hit && { ...o.hit, type } });
    if (h.blocked) return;
    if (o.rider) this.riders(by, v, type, h.raw, gen);
    if (h.lethal) {
      if (gen < MAX_DOWN_GEN) this.queue.push({ v, by: by?.unit, gen: gen + 1 });
      else this.finishDown(v, by?.unit);
    }
  }

  /**
   * What a hit of a type does besides hurt: it applies the type's negative status by chance (`riderChance`). Shock also
   * jumps: with the status, to one unit within `SHOCK_JUMP` (and one more per `arcs`); a Wet target jumps it to every Wet unit
   * within `WET_ARC` whether or not Shocked rolled. A unit with `arcs` (Charged) arcs its other hits too. Arcs have no riders.
   */
  private riders(by: Rt | undefined, v: Rt, damage: DamageType, raw: number, gen: number): void {
    const type = canonType(damage);
    const p = by ? this.statRt(by, `rider:${type}`, this.statRt(by, 'rider', raw >= RIDER.bigAt ? RIDER.big : RIDER.base, v), v) : raw >= RIDER.bigAt ? RIDER.big : RIDER.base;
    const hit = this.r.chance(Math.min(1, p));
    const arcs = by ? Math.floor(this.statRt(by, 'arcs', 0, v)) : 0;
    if (type !== 'shock') {
      if (hit) this.addStatus(v, RIDERS[type], 1, undefined, by?.unit);
      if (arcs > 0) this.arc(by, v, raw, gen, SHOCK_JUMP, arcs, false, false);
      return;
    }
    if (hit) this.addStatus(v, 'shocked', 1, undefined, by?.unit);
    if (v.statuses.has('wet')) this.arc(by, v, raw, gen, by ? this.statRt(by, 'wetArc', WET_ARC, v) : WET_ARC, MAX_AREA, true, hit);
    else if (hit) this.arc(by, v, raw, gen, SHOCK_JUMP, 1 + arcs + (by ? Math.floor(this.statRt(by, 'shockJumps', 0, v)) : 0), false, true); // Pure Copper Wiring: the chain jumps farther along
  }
  /** Shock arcs from `v` to the nearest `n` other units of its team (`wet`: only Wet ones) within `range`, each for `ARC_SHARE` of the hit (twice that through Wet), Shocked if `stun`. */
  private arc(by: Rt | undefined, v: Rt, raw: number, gen: number, range: number, n: number, wet: boolean, stun: boolean): void {
    for (const o of this.within(v.unit.x, v.unit.y, range, (u) => u !== v && u.team === v.team && (!wet || u.statuses.has('wet')), n)) {
      if (stun) this.addStatus(o, 'shocked', 1, undefined, by?.unit);
      this.secondary(by, o, 'shock', raw * ARC_SHARE, gen, { out: false, rider: false, arc: true });
    }
  }

  private fireDown(v: Rt, by: Unit | undefined, gen: number): void {
    v.dying = true;
    this.dispatch({ kind: 'down', self: v.unit, target: by }, gen);
    v.dying = false;
    if (v.unit.hp > 0) {
      v.down = false;
      this.push({ t: 'revive', unit: v.unit });
    } else this.finishDown(v, by);
  }
  private finishDown(v: Rt, by?: Unit): void {
    const fire = v.statuses.get('burning');
    v.down = true;
    // A burning unit that dies sets the units near it Burning. Burning that came from such a spread does not spread again.
    if (fire && !fire.inherited)
      for (const o of this.within(v.unit.x, v.unit.y, BURN_SPREAD, (u) => u !== v, MAX_AREA)) this.addStatus(o, 'burning', 1, undefined, fire.by, true);
    // Superheated Steam (a city perk): a Scalded foe that dies Scalds the foes of its side round it, once (the Scald that comes of it does not burst again).
    const scald = v.statuses.get('scalded');
    const burst = scald?.by && !scald.inherited ? this.statRt(this.rt(scald.by) ?? v, 'scaldBurst', 0, v) : 0;
    if (scald && burst > 0)
      for (const o of this.within(v.unit.x, v.unit.y, burst, (u) => u !== v && u.team === v.team, MAX_AREA)) this.addStatus(o, 'scalded', 1, undefined, scald.by, true);
    v.statuses.clear();
    v.timed.clear();
    v.shield = 0;
    this.push({ t: 'down', unit: v.unit, by, burning: !!fire });
  }

  // ---- statuses

  private addStatus(rt: Rt, id: StatusId, stacks: number, duration?: number, by?: Unit, inherit = false): boolean {
    if ((rt.down && !rt.dying) || stacks <= 0) return false;
    if (this.statRt(rt, `immune:${id}`, 0) > 0) return false;
    const d = def(id);
    if (d.blockedBy?.some((b) => rt.statuses.has(b))) return false;
    if (d.kind === 'debuff' && rt.statuses.has('lifted')) return false; // on the rising lift: no debuff
    let left = duration ?? d.duration;
    const b = by && this.rt(by);
    if (duration === undefined && b && Number.isFinite(left)) left = this.statRt(b, `duration:${id}`, left, rt);
    if (b && Number.isFinite(left) && (Object.values(POSITIVES) as StatusId[]).includes(id)) left *= this.statRt(b, 'givenDuration', 1, rt);
    const i = rt.statuses.get(id) ?? { stacks: 0, left: 0, by, acc: 0 };
    i.stacks = Math.min(d.maxStacks ?? 1, i.stacks + stacks);
    i.left = Math.max(i.left, left);
    i.by = by ?? i.by;
    i.inherited = rt.statuses.has(id) ? !!i.inherited && inherit : inherit;
    rt.statuses.set(id, i);
    this.push({ t: 'status', unit: rt.unit, id, stacks: i.stacks, by });
    for (const e of d.ends ?? []) this.stripRt(rt, e);
    if (d.becomes && i.stacks >= d.becomes.at) {
      this.stripRt(rt, id);
      this.addStatus(rt, d.becomes.id, 1, undefined, by);
    }
    return true;
  }
  private stripRt(rt: Rt, id: StatusId, stacks?: number): void {
    const i = rt.statuses.get(id);
    if (!i) return;
    i.stacks -= stacks ?? i.stacks;
    if (i.stacks <= 0) rt.statuses.delete(id);
  }

  // ---- triggers

  private dispatch(ev: Ev, gen: number): void {
    const actor = this.rt(ev.self);
    if (!actor) return;
    const target = ev.target && this.rt(ev.target);
    const run = (owner: Rt, role: 'self' | 'ally'): void => {
      for (const [sid, src] of owner.sources) {
        src.effects.forEach((e, i) => {
          if (!isEvent(e) || e.when !== ev.kind) return;
          const who = e.who ?? 'self';
          if (role === 'self' ? who === 'ally' : who === 'self') return;
          if (role === 'ally' && dist2(owner.unit, actor.unit) > (e.near ?? Infinity) ** 2) return;
          this.fire(owner, sid, i, e, ev, target, gen);
        });
      }
    };
    if (!actor.down || ev.kind === 'down' || ev.kind === 'hurt') run(actor, 'self');
    if (this.reactive)
      for (const o of [...this.units.values()]) if (o !== actor && !o.down && o.team === actor.team) run(o, 'ally');
  }

  private fire(owner: Rt, sid: string, i: number, e: EventEffect, ev: Ev, target: Rt | undefined, gen: number): void {
    const key = `${sid}#${i}`;
    if ((owner.ready.get(key) ?? -Infinity) - EPS > this.now) return;
    if (!this.ok(e.if, { self: owner, target, ev })) return;
    if (e.every) {
      const n = (owner.count.get(key) ?? 0) + 1;
      owner.count.set(key, n);
      if (n % e.every !== 0) return;
    }
    if (e.chance !== undefined) {
      const p = typeof e.chance === 'number' ? e.chance : this.statRt(owner, e.chance.stat, e.chance.base ?? 0, target, { via: ev.via, weapon: ev.weapon, type: ev.type });
      if (!this.r.chance(Math.min(1, p))) return;
    }
    owner.ready.set(key, this.now + (e.cd ?? DEFAULT_CD));
    this.fired++;
    this.push({ t: 'proc', unit: owner.unit, source: sid, index: i, when: ev.kind, target: ev.target });
    this.act(owner, key, arr(e.do), { ev, target, gen, scale: 1, sid });
  }

  private ok(c: Cond | Cond[] | undefined, x: Ctx): boolean {
    return c === undefined || arr(c).every((k) => this.test(k, x));
  }
  private test(c: Cond, x: Ctx): boolean {
    const side = (of?: Side) => (of === 'self' ? x.self : x.target);
    switch (c.is) {
      case 'status': return (side(c.of)?.statuses.get(canonStatus(c.id))?.stacks ?? 0) >= (c.min ?? 1);
      case 'tag': {
        const u = side(c.of);
        return !!u && this.hasTag(u, c.tag);
      }
      case 'team': {
        for (const o of this.units.values()) if (!o.down && o.team === x.self.team && this.hasTag(o, c.tag)) return true;
        return false;
      }
      case 'weapon': return !!x.ev?.weapon && arr(c.weapon).includes(x.ev.weapon);
      case 'hp': {
        const u = side(c.of)?.unit;
        if (!u) return false;
        const share = u.hp / this.maxHpForCond(u);
        return (c.below === undefined || share < c.below) && (c.above === undefined || share > c.above);
      }
      case 'crew': {
        let n = 0;
        for (const o of this.units.values()) if (!o.down && o.team === x.self.team) n++;
        return n >= (c.min ?? 0) && n <= (c.max ?? Infinity);
      }
      case 'time': return arr(c.phase).some((p) => (p === 'night' ? this.night : p === this.phase));
      case 'via': return !!x.ev?.via && arr(c.via).includes(x.ev.via);
      case 'type': return !!x.ev?.type && arr(c.type).some((t) => canonType(t) === canonType(x.ev!.type!));
      case 'noFoe': {
        const r2 = (c.tiles * TILE) ** 2;
        for (const o of this.units.values()) if (!o.down && o.team !== x.self.team && !o.tags.has('nest') && dist2(o.unit, x.self.unit) <= r2) return false; // a hive is not a foe at your heels
        return true;
      }
      case 'not': return !this.test(c.cond, x);
      case 'any': return c.of.some((k) => this.test(k, x));
    }
  }

  // ---- actions

  private act(owner: Rt, key: string, acts: Action[], c: Run): void {
    acts.forEach((a, j) => this.one(owner, `${key}.${j}`, a, c));
  }
  private pick(to: Side, owner: Rt, c: Run): Rt | undefined {
    return to === 'self' ? owner : c.target;
  }

  private one(owner: Rt, key: string, a: Action, c: Run): void {
    switch (a.do) {
      case 'status': {
        const id = canonStatus(a.id);
        const t = this.pick(a.to ?? (def(id).kind === 'buff' ? 'self' : 'target'), owner, c);
        const n = a.stacks === 'event' ? (c.ev.target && this.rt(c.ev.target)?.statuses.get(id)?.stacks) || 0 : (a.stacks ?? 1);
        if (t) this.addStatus(t, id, n, a.duration, owner.unit);
        return;
      }
      case 'strip': {
        const id = canonStatus(a.id);
        const t = this.pick(a.to ?? (def(id).kind === 'buff' ? 'self' : 'target'), owner, c);
        if (t) this.stripRt(t, id, a.stacks);
        return;
      }
      case 'damage': {
        const t = this.pick(a.to ?? 'target', owner, c);
        const n = ((a.amount ?? 0) + (a.ofEvent ?? 0) * (c.ev.amount ?? 0) + (a.ofBase ?? 0) * (c.ev.base ?? 0)) * c.scale;
        if (t && n > 0) this.secondary(owner, t, canonType(a.type), n, c.gen, { out: true, rider: true, hit: { via: c.ev.via, weapon: c.ev.weapon, type: canonType(a.type) } });
        return;
      }
      case 'heal': {
        const t = this.pick(a.to ?? 'self', owner, c);
        if (t) this.heal(t.unit, ((a.amount ?? 0) + (a.share ?? 0) * this.maxHp(t.unit) + (a.ofEvent ?? 0) * (c.ev.amount ?? 0)) * c.scale, owner.unit);
        return;
      }
      case 'stat': {
        const t = this.pick(a.to ?? 'self', owner, c);
        if (t) t.timed.set(`${key}@${owner.n}`, { mod: a, left: a.for ?? 0, src: c.sid });
        return;
      }
      case 'flag': return;
      case 'spawn': {
        const at = this.pick(a.at ?? 'self', owner, c) ?? owner;
        this.push({ t: 'spawn', what: a.what, kind: a.kind, count: a.count ?? 1, ttl: a.ttl, spread: a.spread, radius: a.radius, then: a.then, source: c.sid, x: at.unit.x, y: at.unit.y, owner: owner.unit });
        return;
      }
      case 'pulse': {
        const at = this.pick(a.at ?? 'self', owner, c) ?? owner;
        const side = a.side ?? 'foe';
        this.push({ t: 'pulse', x: at.unit.x, y: at.unit.y, radius: a.radius, knock: a.knock, owner: owner.unit });
        const hits = this.within(at.unit.x, at.unit.y, a.radius, (o) => (o === owner ? !!a.self : side === 'any' || (side === 'foe') === (o.team !== owner.team)), MAX_AREA);
        for (const o of hits) this.act(owner, key, arr(a.then), { ...c, target: o });
        return;
      }
      case 'chain': {
        const seen = new Set<Rt>();
        let from = c.target ?? owner;
        seen.add(from);
        const path = [from.unit];
        const foe = (a.side ?? 'foe') === 'foe';
        for (let j = 0; j < Math.min(a.jumps, MAX_CHAIN); j++) {
          const [next] = this.within(from.unit.x, from.unit.y, a.range, (o) => !seen.has(o) && (o.team !== owner.team) === foe, 1);
          if (!next) break;
          seen.add(next);
          path.push(next.unit);
          from = next;
          this.act(owner, key, arr(a.then), { ...c, target: next, scale: c.scale * (a.decay ?? 1) ** (j + 1) });
        }
        if (path.length > 1) this.push({ t: 'chain', path, owner: owner.unit });
        return;
      }
    }
  }

  // ---- plumbing

  private rt(u: Unit): Rt | undefined {
    return this.units.get(u);
  }
  private need(u: Unit): Rt {
    const rt = this.units.get(u);
    if (!rt) throw new Error('effects: unit not added');
    return rt;
  }
  private each(f: (rt: Rt) => void): void {
    for (const rt of [...this.units.values()]) f(rt);
  }
  /** Living units within `r` of a point that pass `keep`, nearest first. */
  private within(x: number, y: number, r: number, keep: (rt: Rt) => boolean, limit: number): Rt[] {
    const found: { rt: Rt; d: number }[] = [];
    for (const rt of this.units.values()) {
      if (rt.down) continue;
      const d = (rt.unit.x - x) ** 2 + (rt.unit.y - y) ** 2;
      if (d <= r * r && keep(rt)) found.push({ rt, d });
    }
    return found.sort((p, q) => p.d - q.d).slice(0, limit).map((f) => f.rt);
  }
  private push(o: Out): void {
    this.outs.push(o);
    if (this.outs.length > MAX_OUT) this.outs.splice(0, this.outs.length - MAX_OUT);
  }
  /** A top-level call: deferred downs run when it ends. */
  private top<T>(f: () => T): T {
    this.depth++;
    try {
      return f();
    } finally {
      if (--this.depth === 0) for (let q = this.queue.shift(); q; q = this.queue.shift()) this.fireDown(q.v, q.by, q.gen);
    }
  }
}

const dist2 = (a: Unit, b: Unit): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Rejects data the engine would misread: state effects with non-stat actions, timed stat changes with no `for`, bad numbers, nesting past two levels. */
export function validate(src: Source): void {
  const bad = (m: string): never => {
    throw new Error(`effects: source "${src.id}": ${m}`);
  };
  const acts = (list: Action[], depth: number, passive: boolean): void => {
    for (const a of list) {
      if (a.do === 'stat') {
        if (!passive && !(a.for && a.for > 0)) bad('a stat change in an event effect needs `for` seconds');
      } else if (a.do === 'flag') {
        if (!passive) bad('a flag action in an event effect (flags belong to passives)');
      } else if (passive) bad(`a ${a.do} action in a passive effect (passives only change stats and raise flags)`);
      if ((a.do === 'status' || a.do === 'strip') && !(canonStatus(a.id) in STATUSES)) bad(`unknown status "${a.id}"`);
      if (a.do === 'pulse' || a.do === 'chain') {
        if (depth >= 2) bad('pulses and chains nest at most two deep');
        acts(arr(a.then), depth + 1, false);
      }
      if (a.do === 'spawn' && a.then) {
        if (depth >= 2) bad('a spawn\'s `then` nests at most two deep');
        acts(arr(a.then), depth + 1, false);
      }
    }
  };
  for (const e of src.effects) {
    if (isEvent(e)) {
      if (typeof e.chance === 'number' && !(e.chance >= 0 && e.chance <= 1)) bad('chance must be 0..1');
      if (typeof e.chance === 'object' && !(e.chance.base === undefined || Number.isFinite(e.chance.base))) bad('a chance stat needs a finite base');
      if (e.every !== undefined && !(Number.isInteger(e.every) && e.every >= 1)) bad('every must be a whole number');
      if (e.cd !== undefined && !(e.cd >= 0)) bad('cd must be 0 or more');
      acts(arr(e.do), 0, false);
    } else {
      if ('chance' in e || 'cd' in e || 'every' in e) bad('a passive effect has no chance, cd or every');
      if (e.when === 'aura' && !(e.r > 0)) bad('an aura needs a radius `r` above 0');
      acts(arr(e.do), 0, true);
    }
  }
}
