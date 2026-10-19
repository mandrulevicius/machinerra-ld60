/**
 * Bot types and specs as data (systems.md, "Bots"; P14). Plain TS, no Phaser, no storage. A bot is a base type (a core
 * role and a secondary role) plus, once the player has unlocked it by deeds (`hub/deeds.ts`) and paid at the workshop
 * (`hub/workshop.ts` `promote`), one spec: a core focus, a secondary focus or the inversion of its role.
 *
 * The type ids are the roster's role names (`CrewRole`, `sim/gear.ts`): gatherer, guard, repairer, boilermancer, lamplighter,
 * stalker, marksman. The Mule is the workshop's own type and has no specs or deeds yet (systems.md gives it none), so it is
 * not here. Ranks and the chassis are `sim/bots.ts`. What the keys do in a mission is `botskills.ts` (an ability is a `cast`
 * effect that waits for the AI to call it there).
 *
 * Everything a bot does differently is one of two things, so a build never needs bespoke code:
 *   - an effect source (`sim/effects.ts`, `Source`): what the engine can run (stats, auras, triggers, statuses);
 *   - behaviour keys (`BEHAVIOUR`): numbers and flags the Sim's robot AI reads (`behaviourOf`), for what is the bot's own
 *     way of acting (how many seeps it works, how far its lamp reaches, whether it leaves the crew). The type's effects
 *     are built from the merged keys, so a spec can reshape the type's own effects (the Scalder's clouds) by changing a key.
 * `botSources(type, spec)` hands over both sources for the units the mission adds (`fx.addSource`): `type:<id>`, then
 * `spec:<id>`. Numbers are systems.md's; a `?` marks a guess it does not give.
 *
 * Add a spec: a row in `SPECS` (its type has three slots, `focus`), its deed in `hub/deeds.ts` `DEEDS`. Add a type: a row
 * in `TYPES`, an id in `BOT_TYPES`, and (once the Sim fields it) the same in `defs.ts` `ROLES`. `specs.test.ts` checks
 * every row validates and produces its source.
 *
 * A robot's spec and relic outlive its body: they are optional fields of the workshop's `RosterBot`, kept through a wreck
 * and its rebuild (losses cost common things: cores, specs and relics are never lost).
 */
import { LAMPLIGHTER } from './defs/crew';
import { validate, type Effect, type Source } from './effects';

export const BOT_TYPES = ['gatherer', 'guard', 'repairer', 'boilermancer', 'lamplighter', 'stalker', 'marksman'] as const;
export type BotType = (typeof BOT_TYPES)[number];
export const isBotType = (x: unknown): x is BotType => (BOT_TYPES as readonly unknown[]).includes(x);

/** Which of a type's three specialisations: its core role done well, its secondary role done well, or the role inverted. */
export type Focus = 'core' | 'secondary' | 'inverted';
export const FOCI: Focus[] = ['core', 'secondary', 'inverted'];

export type SpecId =
  | 'siphoner' | 'carrier' | 'firebrand'
  | 'bulwark' | 'cannoneer' | 'berserker'
  | 'medic' | 'fieldEngineer' | 'saboteur'
  | 'scalder' | 'choirmaster' | 'condenser'
  | 'beacon' | 'flareRunner' | 'shade'
  | 'executioner' | 'ghost' | 'bodyguard'
  | 'sniper' | 'spotter' | 'scattergun';

// ---------------------------------------------------------------- behaviour keys

/**
 * What the Sim's robot AI reads of a bot (`behaviourOf`): key to meaning. A key a type or spec sets must be here (the type
 * checks it); a bot that does not set a key leaves it off or at the Sim's default.
 */
export const BEHAVIOUR = {
  // Gatherer
  sweeps: 'Sweeps up the scrap and copper lying round where it works',
  sweepMul: 'Sweep reach, times (default 1)',
  carryStrip: 'Extra carry-strip slots',
  spitEvery: 'Seconds between the slicks it spits at a foe near it; a spit onto a slick lights it',
  spitReach: 'Tiles from it within which it spits',
  slickR: 'Radius (px) of a spat slick',
  slickTtl: 'Seconds a spat slick lies',
  // Guard
  saw: 'Fights with the saw at the line',
  cannon: 'Fires the cannon',
  frontArmour: 'Share (0..1) less damage from the front',
  tauntR: 'Reach of the taunt pulse (px)',
  tauntEvery: 'Seconds between taunt pulses',
  cannonCrashes: 'Its cannon knockback crashes count as the bot\'s own (the Cannoneer\'s deed and drops)',
  cannonKnock: 'Px/s a cannon shell shoves the foe it hits along its flight (times the knockback stat); the foe is flung, and what it crashes into is the bot\'s doing',
  leavesCrew: 'Leaves the crew for the nearest elite',
  // Repairer
  beam: 'Heals with a beam',
  beamChains: 'Extra allies the heal beam chains to',
  fieldFix: 'Fixes downed bots in the field',
  fixTime: 'Seconds a field fix takes',
  fixedBraced: 'Seconds the fixed bot rises Braced',
  beamOnFoes: 'The beam works on foes (Corroded each second)',
  etchAllies: 'Seconds the allies the beam touched are Etched',
  // Boilermancer
  cloudEvery: 'Seconds between steam clouds (0: none)',
  cloudR: 'Radius of a steam cloud (px)',
  cloudTtl: 'Seconds a steam cloud lasts',
  blessing: 'The blessing: haste on one ally, or steaming on the crew nearby',
  blessingEvery: 'Seconds between blessings',
  blessingR: 'Reach of the blessing (px)',
  stripsAuras: 'Radius (px) in which it strips twisted auras',
  // Lamplighter
  lampR: 'Radius of the lamp (px; 0: no lamp)',
  flareEvery: 'Seconds between flares',
  flareTtl: 'Seconds a flare burns',
  flareBlind: 'Seconds foes in a flare are Blinded',
  restealthNear: 'Stalkers inside its shadow re-stealth in this many seconds',
  // Stalker
  backstab: 'Damage share added from behind',
  stealth: 'Unseen until it strikes',
  restealth: 'Seconds out of combat to hide again',
  executeBelow: 'Kills a foe under this share of its oil outright',
  executeBoss: 'Against bosses: the extra share of damage instead',
  restealthOnKill: 'Hides again at once on a kill',
  scouts: 'Scouts on orders (clears fog)',
  extraDrop: 'Extra drops from each elite it kills',
  neverHides: 'Never hides',
  guardsComm: 'Stays by the Communicator and strikes whatever targets him',
  interceptEvery: 'Seconds between the hits it takes for the Communicator',
  // Marksman
  rangeMul: 'Range times the Guard\'s cannon range',
  pierces: 'Foes a shot passes through',
  markEvery: 'Seconds between Marks on the first foe it sees',
  fogMul: 'Fog it clears around itself, times',
  keenAllies: 'Seconds allies hitting a Marked foe are Keen',
  pellets: 'Pellets in a cone shot (0: single shots)',
  keepsOff: 'Tiles it keeps off its target',
} as const;
export type BehaviourKey = keyof typeof BEHAVIOUR;
export type Behaviour = Partial<Record<BehaviourKey, number | boolean | string>>;

// ---------------------------------------------------------------- definitions

/** Effects built from the bot's merged behaviour: a spec can reshape what its type does. */
type Make = (b: Behaviour) => Effect[];

export interface TypeDef {
  id: BotType;
  name: string;
  coreRole: string;
  secondaryRole: string;
  /** Where its wreck is found (D2). */
  found: string;
  behaviour: Behaviour;
  effects: Make;
  /** Tags the bot carries (conditions and auras see them). */
  tags: string[];
  /** The spec in each focus slot. */
  specs: Record<Focus, SpecId>;
}

export interface SpecDef {
  id: SpecId;
  type: BotType;
  focus: Focus;
  name: string;
  /** What it does, as systems.md words it (the bench shows it). */
  text: string;
  /** Set over the type's keys. */
  behaviour: Behaviour;
  effects: Make;
}

const num = (b: Behaviour, k: BehaviourKey, d = 0) => (typeof b[k] === 'number' ? (b[k] as number) : d);
const none: Make = () => [];

/** The Boilermancer's steam cloud: Steam damage and Wet on the foes it touches (the Scalder's is wider and lasts longer). */
const cloud: Make = (b) =>
  num(b, 'cloudEvery') > 0
    ? [{
        when: 'cast', if: { is: 'via', via: 'cloud' }, cd: num(b, 'cloudEvery'),
        do: { do: 'spawn', what: 'cloud', kind: 'steam', at: 'target', radius: num(b, 'cloudR'), ttl: num(b, 'cloudTtl'), then: [{ do: 'damage', type: 'steam', amount: 2 /* ? */ }, { do: 'status', id: 'wet' }] },
      }]
    : [];

/** The blessing: Haste on the ally the AI picks, or (Choirmaster) Steaming on every ally within reach of the caster. The AI casts both (`botskills.ts`). */
const blessing: Make = (b) => {
  const every = num(b, 'blessingEvery'), r = num(b, 'blessingR', 200);
  const when = { when: 'cast', if: { is: 'via', via: 'blessing' }, cd: every } as const;
  if (b.blessing === 'haste') return [{ ...when, do: { do: 'status', id: 'haste', to: 'target' } }];
  if (b.blessing === 'steaming') return [{ ...when, do: { do: 'pulse', radius: r, side: 'ally', self: true, then: { do: 'status', id: 'steaming', to: 'target' } } }];
  return [];
};

/** The Lamplighter's lamp: the `lamp` stat, a radius (`Sim.lampStep` lights the allies in it; `botskills.ts` puts out the twisted halos in it). */
const lamp: Make = (b) => (num(b, 'lampR') > 0 ? [{ when: 'always', do: { do: 'stat', stat: 'lamp', add: num(b, 'lampR') } }] : []);

/** The flare, thrown by the AI at a cluster: lights its disc (`botskills.ts`) and blinds the foes it lands on, when the spec says so. */
const flare: Make = (b) =>
  num(b, 'flareEvery') > 0
    ? [{
        when: 'cast', if: { is: 'via', via: 'flare' }, cd: num(b, 'flareEvery'),
        do: { do: 'spawn', what: 'flare', kind: 'flare', at: 'target', radius: LAMPLIGHTER.flareR, ttl: num(b, 'flareTtl'), ...(num(b, 'flareBlind') > 0 && { then: { do: 'status', id: 'blinded', duration: num(b, 'flareBlind') } as const }) },
      }]
    : [];

/** The Marksman's spotting: the AI marks the first foe it sees. */
const mark: Make = (b) =>
  num(b, 'markEvery') > 0 ? [{ when: 'cast', if: { is: 'via', via: 'mark' }, cd: num(b, 'markEvery'), do: { do: 'status', id: 'marked', to: 'target' } }] : [];

export const TYPES: Record<BotType, TypeDef> = {
  gatherer: {
    id: 'gatherer', name: 'Gatherer', coreRole: 'Work (mine coal, strip ruins)', secondaryRole: 'Sweep (scrap, copper, junk)', found: 'Level 1',
    behaviour: { sweeps: true }, effects: none, tags: ['gatherer'],
    specs: { core: 'siphoner', secondary: 'carrier', inverted: 'firebrand' },
  },
  guard: {
    id: 'guard', name: 'Guard', coreRole: 'Hold the line (saw)', secondaryRole: 'Cannon', found: 'Desert, mission 2-3',
    behaviour: { saw: true, cannon: true }, effects: none, tags: ['guard'],
    specs: { core: 'bulwark', secondary: 'cannoneer', inverted: 'berserker' },
  },
  repairer: {
    id: 'repairer', name: 'Repairer', coreRole: 'Heal beam', secondaryRole: 'Field fix', found: 'Desert, mission 2-3',
    behaviour: { beam: true, fieldFix: true, fixTime: 8 }, effects: none, tags: ['repairer'],
    specs: { core: 'medic', secondary: 'fieldEngineer', inverted: 'saboteur' },
  },
  boilermancer: {
    id: 'boilermancer', name: 'Boilermancer', coreRole: 'Steam clouds (Steam and Wet, 90 px, every 5 s)', secondaryRole: 'Blessing (Haste on one ally, every 6 s)', found: 'Demon Wastes',
    behaviour: { cloudEvery: 5, cloudR: 90, cloudTtl: 3 /* ? */, blessing: 'haste', blessingEvery: 6, blessingR: 200 /* ? */ },
    effects: (b) => [...cloud(b), ...blessing(b)], tags: ['boilermancer', 'steam'],
    specs: { core: 'scalder', secondary: 'choirmaster', inverted: 'condenser' },
  },
  lamplighter: {
    id: 'lamplighter', name: 'Lamplighter', coreRole: 'The lamp: allies within 140 px Lit; twisted inside lose their aura', secondaryRole: 'Flares: one every 12 s lights an area for 10 s and clears fog', found: 'Jungle',
    behaviour: { lampR: 140, flareEvery: 12, flareTtl: 10 }, effects: (b) => [...lamp(b), ...flare(b)], tags: ['lamplighter', 'lamp'],
    specs: { core: 'beacon', secondary: 'flareRunner', inverted: 'shade' },
  },
  stalker: {
    id: 'stalker', name: 'Stalker', coreRole: 'Burst: +100% from behind', secondaryRole: 'Stealth: unseen until it strikes; hides again after 4 s out of combat', found: 'City',
    behaviour: { backstab: 1, stealth: true, restealth: 4 }, effects: none, tags: ['stalker'],
    specs: { core: 'executioner', secondary: 'ghost', inverted: 'bodyguard' },
  },
  marksman: {
    id: 'marksman', name: 'Marksman', coreRole: 'Long shots (Pierce, 1.6x the Guard\'s cannon range)', secondaryRole: 'Spotting: Marks the first foe it sees every 6 s', found: 'Mountains',
    behaviour: { rangeMul: 1.6, markEvery: 6 }, effects: mark, tags: ['marksman', 'ranged'],
    specs: { core: 'sniper', secondary: 'spotter', inverted: 'scattergun' },
  },
};

export const SPECS: Record<SpecId, SpecDef> = {
  // Gatherer
  siphoner: {
    id: 'siphoner', type: 'gatherer', focus: 'core', name: 'Miner', text: 'Works 1.5x as fast: coal comes out and ruins come apart in two thirds of the time',
    behaviour: {}, effects: () => [{ when: 'always', do: { do: 'stat', stat: 'siphonRate', pct: 0.5 } }],
  },
  carrier: {
    id: 'carrier', type: 'gatherer', focus: 'secondary', name: 'Sweeper', text: 'Sweeps up scrap and copper twice as far round where it works; +2 carry-strip slots',
    behaviour: { sweepMul: 2, carryStrip: 2 }, effects: none,
  },
  firebrand: {
    id: 'firebrand', type: 'gatherer', focus: 'inverted', name: 'Firebrand', text: 'Spits coal slicks its next shot lights; gives allies within 100 px Fired up for 4 s every 12 s; fed coal at the workshop (Stoke), it hits 30% harder and its fire burns hotter',
    behaviour: { spitEvery: 3, spitReach: 5 /* ? */, slickR: 40 /* ? */, slickTtl: 6 /* ? */ },
    effects: (b) => [
      // A slick of crude Slows the foes in it; the next spit onto it lights it (`botskills.ts` `laySlick`) and they burn.
      { when: 'cast', if: { is: 'via', via: 'spit' }, cd: num(b, 'spitEvery'), do: { do: 'spawn', what: 'slick', kind: 'coal', at: 'target', radius: num(b, 'slickR'), ttl: num(b, 'slickTtl') } },
      { when: 'tick', cd: 12, do: { do: 'pulse', radius: 100, side: 'ally', then: { do: 'status', id: 'stoked', duration: 4, to: 'target' } } },
    ],
  },
  // Guard
  bulwark: {
    id: 'bulwark', type: 'guard', focus: 'core', name: 'Bulwark', text: 'Taunt pulse 160 px every 6 s; front hits -50%; allies within 100 px Braced',
    behaviour: { frontArmour: 0.5, tauntR: 160, tauntEvery: 6 },
    effects: (b) => [
      // The AI casts it when an ally under half oil is being hit (`botskills.ts`).
      { when: 'cast', if: { is: 'via', via: 'taunt' }, cd: num(b, 'tauntEvery'), do: { do: 'pulse', radius: num(b, 'tauntR'), side: 'foe', then: { do: 'status', id: 'taunted' } } },
      // Braced for the allies beside it, as the status is written (STATUSES.braced): Steady, knockback +30%, speed -20%.
      { when: 'aura', r: 100, do: [{ do: 'stat', stat: 'knockback', pct: 0.3 }, { do: 'stat', stat: 'speed', pct: -0.2 }, { do: 'flag', flag: 'steady' }] },
    ],
  },
  cannoneer: {
    id: 'cannoneer', type: 'guard', focus: 'secondary', name: 'Cannoneer', text: 'Shells 2x range, heavy knockback (its crashes count as yours)',
    behaviour: { cannonCrashes: true, cannonKnock: 190 /* ? */ },
    effects: () => [{ when: 'always', do: [{ do: 'stat', stat: 'range', pct: 1 }, { do: 'stat', stat: 'knockback', pct: 1 /* ? */ }] }],
  },
  berserker: {
    id: 'berserker', type: 'guard', focus: 'inverted', name: 'Berserker', text: 'Leaves the crew for the nearest elite; Haste 3 s a kill; +25% damage under half oil',
    behaviour: { leavesCrew: true },
    effects: () => [
      { when: 'kill', cd: 0, do: { do: 'status', id: 'haste', duration: 3 } },
      { when: 'always', if: { is: 'hp', below: 0.5, of: 'self' }, do: { do: 'stat', stat: 'damage', pct: 0.25 } },
    ],
  },
  // Repairer
  medic: {
    id: 'medic', type: 'repairer', focus: 'core', name: 'Medic', text: 'Beam chains to 2 more; overheal becomes Overcharge',
    behaviour: { beamChains: 2 }, effects: () => [{ when: 'always', do: { do: 'stat', stat: 'overcharge', add: 0.3 } }],
  },
  fieldEngineer: {
    id: 'fieldEngineer', type: 'repairer', focus: 'secondary', name: 'Field engineer', text: 'Fixes in 3 s; the fixed bot rises Braced for 4 s',
    behaviour: { fixTime: 3, fixedBraced: 4 }, effects: none,
  },
  saboteur: {
    id: 'saboteur', type: 'repairer', focus: 'inverted', name: 'Saboteur', text: 'Beam on foes: Corroded a second; allies it touched Etched 4 s',
    behaviour: { beamOnFoes: true, etchAllies: 4 }, effects: () => [{ when: 'hit', cd: 1, do: { do: 'status', id: 'corroded' } }],
  },
  // Boilermancer
  scalder: {
    id: 'scalder', type: 'boilermancer', focus: 'core', name: 'Scalder', text: 'Clouds 1.5x wide, last 2x',
    behaviour: { cloudR: 135, cloudTtl: 6 }, effects: none,
  },
  choirmaster: {
    id: 'choirmaster', type: 'boilermancer', focus: 'secondary', name: 'Choirmaster', text: 'Blessing is Steaming on the crew within 160 px, every 10 s',
    behaviour: { blessing: 'steaming', blessingEvery: 10, blessingR: 160 }, effects: none,
  },
  condenser: {
    id: 'condenser', type: 'boilermancer', focus: 'inverted', name: 'Condenser', text: 'Drinks steam: strips twisted auras within 120 px; foes there Chilled; allies Quenched; no clouds',
    behaviour: { cloudEvery: 0, stripsAuras: 120 },
    effects: () => [{
      when: 'tick', cd: 2,
      do: [
        { do: 'pulse', radius: 120, side: 'foe', then: { do: 'status', id: 'chilled' } },
        { do: 'pulse', radius: 120, side: 'ally', self: true, then: { do: 'status', id: 'quenched', to: 'target' } },
      ],
    }],
  },
  // Lamplighter
  beacon: {
    id: 'beacon', type: 'lamplighter', focus: 'core', name: 'Beacon', text: 'Lamp 1.6x; twisted inside take +25%',
    behaviour: { lampR: 224 },
    effects: (b) => [{ when: 'aura', r: num(b, 'lampR'), side: 'foe', if: { is: 'tag', tag: 'twisted', of: 'target' }, do: { do: 'stat', stat: 'damageTaken', pct: 0.25 } }],
  },
  flareRunner: {
    id: 'flareRunner', type: 'lamplighter', focus: 'secondary', name: 'Flare-runner', text: 'A flare every 6 s; foes in it Blinded 1.5 s',
    behaviour: { flareEvery: 6, flareBlind: 1.5 }, effects: none,
  },
  shade: {
    id: 'shade', type: 'lamplighter', focus: 'inverted', name: 'Shade', text: 'No lamp; allies within 120 px Shadowed; Stalkers inside re-stealth in 1 s',
    behaviour: { lampR: 0, restealthNear: 1 },
    // Shadowed as the status is written (STATUSES.shadowed): healing received -50%; the Stealthed half is the Sim's.
    effects: () => [{ when: 'aura', r: 120, do: { do: 'stat', stat: 'healReceived', pct: -0.5 } }],
  },
  // Stalker
  executioner: {
    id: 'executioner', type: 'stalker', focus: 'core', name: 'Executioner', text: 'Kills a foe under 25% outright (bosses: +50% instead); hides again on a kill',
    behaviour: { executeBelow: 0.25, executeBoss: 0.5, restealthOnKill: true }, effects: none,
  },
  ghost: {
    id: 'ghost', type: 'stalker', focus: 'secondary', name: 'Ghost', text: 'Stealth 2x; scouts on orders (clears fog); one extra drop from each elite it kills',
    behaviour: { restealth: 2, scouts: true, extraDrop: 1 }, effects: none,
  },
  bodyguard: {
    id: 'bodyguard', type: 'stalker', focus: 'inverted', name: 'Bodyguard', text: 'Never hides; stays by you; strikes whatever targets you; takes the first hit meant for you every 8 s',
    behaviour: { stealth: false, neverHides: true, guardsComm: true, interceptEvery: 8 },
    // The first blow meant for him every 8 s: a cast the engine only lets through on its cooldown (`combat.ts` `hurt` asks).
    effects: (b) => [{ when: 'cast', if: { is: 'via', via: 'intercept' }, cd: num(b, 'interceptEvery'), do: [] }],
  },
  // Marksman
  sniper: {
    id: 'sniper', type: 'marksman', focus: 'core', name: 'Sniper', text: 'Pierces 2; +60% range; +50% to elites',
    behaviour: { pierces: 2 },
    effects: (b) => [
      { when: 'always', do: { do: 'stat', stat: 'range', pct: 0.6 } },
      { when: 'always', do: { do: 'stat', stat: 'pierceShots', add: num(b, 'pierces') } },
      { when: 'always', if: { is: 'tag', tag: 'elite', of: 'target' }, do: { do: 'stat', stat: 'damage', pct: 0.5 } },
    ],
  },
  spotter: {
    id: 'spotter', type: 'marksman', focus: 'secondary', name: 'Spotter', text: 'Marks every 3 s; fog 1.5x; allies hitting a Marked foe Keen 3 s',
    behaviour: { markEvery: 3, fogMul: 1.5, keenAllies: 3 }, effects: none,
  },
  scattergun: {
    id: 'scattergun', type: 'marksman', focus: 'inverted', name: 'Scattergun', text: 'A 5-pellet cone and knockback; keeps 2 tiles off',
    behaviour: { pellets: 5, keepsOff: 2 }, effects: () => [{ when: 'always', do: { do: 'stat', stat: 'knockback', pct: 0.5 /* ? */ } }],
  },
};

export const SPEC_IDS = Object.keys(SPECS) as SpecId[];

/** The specs of a type, in focus order. */
export const specsOf = (type: BotType): SpecDef[] => FOCI.map((f) => SPECS[TYPES[type].specs[f]]);

// ---------------------------------------------------------------- sources

/** What the Sim reads of a bot: the type's keys, over them its spec's. */
export function behaviourOf(type: BotType, spec?: SpecId | null): Behaviour {
  return { ...TYPES[type].behaviour, ...(spec ? SPECS[spec].behaviour : {}) };
}

/** The bot's type as an effect source (`type:<id>`), its effects built from the merged behaviour. */
export function typeSource(type: BotType, spec?: SpecId | null): Source {
  const t = TYPES[type];
  return { id: `type:${type}`, kind: 'type', name: t.name, tags: [...t.tags], effects: t.effects(behaviourOf(type, spec)) };
}

/** A spec as an effect source (`spec:<id>`), tagged with its id so conditions can see "a Medic". */
export function specSource(spec: SpecId): Source {
  const s = SPECS[spec];
  return { id: `spec:${spec}`, kind: 'spec', name: s.name, tags: [spec], effects: s.effects(behaviourOf(s.type, spec)) };
}

/** Every source a bot of this type and spec carries: the type's, then the spec's. */
export function botSources(type: BotType, spec?: SpecId | null): Source[] {
  const out = [typeSource(type, spec)];
  if (spec) {
    if (SPECS[spec].type !== type) throw new Error(`${spec} is a ${SPECS[spec].type} spec, not a ${type} one`);
    out.push(specSource(spec));
  }
  return out.map((s) => (validate(s), s));
}

/** The sources of a roster robot (`RosterBot`): none for a type without specs (the Mule), else the type's and its spec's. */
export const sourcesOf = (b: { role: string; spec?: SpecId }): Source[] => (isBotType(b.role) ? botSources(b.role, b.spec) : []);
