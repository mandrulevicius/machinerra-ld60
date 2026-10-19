/**
 * Old research (`docs/systems.md`, "Old research"; P16), plain TS, no Phaser, no storage (`researchslice.ts` keeps it).
 * A pick of three at the Oracle's church adds a **punch card** to your collection for good; the cards you slot aboard decide how
 * the Communicator and each robot type play. Cards are rules: a card's effect reads a stat that gear gives, never a bare number.
 *
 * **State** (`Research`): the collection (`owned`), where each card is fitted (`fit`, by slot key), the picks waiting (`credit`),
 * the last haul whose free pick is banked (`seen`: a haul gives one), and the three on offer (`offer`, kept so reopening the
 * panel shows the same three). Every rule takes a `Research` and returns the next; nothing here writes.
 *
 * **Picks:** one free pick each return, banked when the lift docks (`bankPick`, called by `carry.ts` `land`: skipping the church
 * keeps it; opening the church adds none), one more per insight spent (`buyPick`). `credit` is what waits; `prepare` draws the offer.
 *
 * **Offer rule** (`offerFor`): three cards you do not own: one from a pool you already hold a card of, one from a pool you
 * can use but hold none of, one wildcard (any card of a pool you can use). A pool with no cards left is skipped. Keystones
 * come after `KEYSTONES_AFTER` cards.
 *
 * **Slots:** the Communicator has `COMM_SLOTS` (`comm:0..2`); each bot type has one (`type:<id>`), worn by every bot of that
 * type. Every card, keystones included, takes one slot. A card is fitted in one place: fitting it elsewhere moves it, and a
 * slot holds one card. Pools to slots (`slotsFor`): the Communicator's pools (gun, melee, kick, body), the dog and the crew-wide
 * pool go in his slots, a type's pool in that type's slot, a keystone anywhere. Only one keystone is fitted at a time across
 * the party (fitting a second takes the first out); a keystone acts party-wide wherever it sits. A new card fits itself into a
 * free slot that can use it (`autoFit`).
 *
 * **In a mission** (`cardSources`): the fitted cards as effect sources for `SimOptions.cards` (`missionstart.ts`): the
 * Communicator's on him, a type's on every bot of that type, a keystone's on every unit. An unfitted card does nothing.
 *
 * **Add a card:** a row in `CARDS` (its pool, the rule in words, the stat its strength reads, its effects as `sim/effects.ts`
 * sources). A rule the effect language cannot say yet needs its sim code first (the table in `systems.md` lists the rest).
 */
import { rng } from '../../../../harness/kit/rng';
import type { Effect, Source } from '../sim/effects';
import { BOT_TYPES, type BotType } from '../sim/specs';

/** The pools a card belongs to: the Communicator's, the dog's, the crew-wide one, a bot type's, and the keystones. */
export type Pool = 'gun' | 'melee' | 'kick' | 'body' | 'dog' | 'crew' | BotType | 'keystone';
export const COMM_POOLS: Pool[] = ['gun', 'melee', 'kick', 'body', 'dog', 'crew'];
export const POOL_NAMES: Record<Pool, string> = {
  gun: 'Gun', melee: 'Melee', kick: 'Kick', body: 'Body', dog: 'Dog', crew: 'Crew-wide', keystone: 'Keystone',
  gatherer: 'Gatherer', guard: 'Guard', repairer: 'Repairer', boilermancer: 'Boilermancer', lamplighter: 'Lamplighter', stalker: 'Stalker', marksman: 'Marksman',
};

/** Numbers: first guesses (Minos's calls are named in `decisions.md`, "Minos on punch cards"). */
export const RESEARCH = {
  /** Cards held before keystones are offered (`systems.md`: "offered after 4 cards"). */
  keystonesAfter: 4,
  /** The Communicator's card slots (decided: 3). */
  commSlots: 3,
  /** One insight buys one more pick (decided). */
  insightPerPick: 1,
  /** Cards on offer (decided: one of three). */
  offered: 3,
};

export interface Card {
  id: string;
  name: string;
  pool: Pool;
  /** The rule in words, in the Oracle's church (`systems.md`'s Effect column). */
  text: string;
  /** The stat its strength reads (the table's "Strength from" column): shown on the card; the effects read it by their own numbers' stats. */
  from: string;
  effects: Effect[];
  /** What the card waits for (a thing the game does not have yet): it is built and tested but never offered, so no one picks a card that does nothing. Delete the line when the thing lands. */
  waits?: string;
}

/**
 * The cards (`systems.md`, "Old research"). A card whose rule is in the sim, not in `effects` (Wide Swing, Shield Brothers,
 * Moth Light ...), is read there by its id: `sim.engine.source(unit, 'card:<id>')`.
 */
export const CARDS: Card[] = [
  // The Communicator's gun
  {
    id: 'twinNozzle', name: 'Twin Nozzle', pool: 'gun', text: 'Bolts fire in pairs; each shot costs 25% more steam.', from: 'Gun damage',
    effects: [
      { when: 'shot', cd: 0, do: { do: 'spawn', what: 'pellets', kind: 'bolt', count: 2, spread: 0.12 } },
      { when: 'always', do: { do: 'stat', stat: 'steamCost', pct: 0.25 } },
    ],
  },
  {
    id: 'scaldingRounds', name: 'Scalding Rounds', pool: 'gun', text: "Bolts' Steam rider: half of them Scald.", from: 'Gun damage',
    effects: [{ when: 'hit', cd: 0, chance: 0.5, if: { is: 'via', via: 'gun' }, do: { do: 'status', id: 'scalded' } }],
  },
  {
    id: 'ricochetRivets', name: 'Ricochet Rivets', pool: 'gun', text: 'Bolts bounce once, to the next foe.', from: 'Gun damage',
    effects: [{ when: 'hit', cd: 0, if: { is: 'via', via: 'gun' }, do: { do: 'chain', jumps: 1, range: 200, then: { do: 'damage', type: 'pierce', ofBase: 1 } } }],
  },
  // His melee and his kick
  {
    id: 'wideSwing', name: 'Wide Swing', pool: 'melee', text: 'The swing is a full circle.', from: 'Melee damage',
    effects: [],
  },
  {
    id: 'acidEdge', name: 'Acid Edge', pool: 'melee', text: 'Every third hit leaves the foe Corroded.', from: 'Melee damage',
    effects: [{ when: 'hit', cd: 0, every: 3, if: { is: 'via', via: 'melee' }, do: { do: 'status', id: 'corroded' } }],
  },
  {
    id: 'bootPolish', name: 'Boot Polish', pool: 'kick', text: 'Crashes Stagger what they crash into.', from: 'Crash damage',
    effects: [{ when: 'crash', cd: 0, do: { do: 'status', id: 'staggered' } }],
  },
  // The dog's (P42): they ride his slots, and the dog reads them as the Communicator's stats (`sim/companions.ts`).
  {
    id: 'goodNose', name: 'Good Nose', pool: 'dog', text: 'The dog digs the mounds it points at by itself.', from: "The dog's point range",
    effects: [{ when: 'always', do: { do: 'stat', stat: 'dogDigs', add: 1 } }],
  },
  {
    id: 'loudBark', name: 'Loud Bark', pool: 'dog', text: 'Its bark Blinds the twisted it warns of: it barks at one closing in, too.', from: "The dog's bark range",
    effects: [{ when: 'always', do: { do: 'stat', stat: 'barkBlind', add: 1 } }],
  },
  // A type's pool, and the crew-wide one
  {
    id: 'deepDraw', name: 'Deep Draw', pool: 'gatherer', text: 'Stripping a ruin also brings up a scrap gob, now and then.', from: 'Work rate',
    effects: [{ when: 'search', cd: 0, chance: 0.25, do: { do: 'spawn', what: 'gob', kind: 'scrap' } }],
  },
  {
    id: 'overpressure', name: 'Overpressure', pool: 'repairer', text: 'A heal above full becomes Overcharge, a shield.', from: 'Heal rate',
    effects: [{ when: 'always', do: { do: 'stat', stat: 'overcharge', add: 0.2 } }],
  },
  {
    id: 'spottersRivets', name: "Spotter's Rivets", pool: 'marksman', text: 'The first hit on a foe Marks it.', from: 'Range',
    effects: [{ when: 'hit', cd: 0, if: [{ is: 'via', via: 'gun' }, { is: 'not', cond: { is: 'status', id: 'marked' } }], do: { do: 'status', id: 'marked' } }],
  },
  // P23: the rest of the table. The Communicator's body
  {
    id: 'pressureCooker', name: 'Pressure Cooker', pool: 'body', text: 'A kill with your steam under 30% releases a Steam pulse.', from: 'Max steam',
    effects: [{ when: 'kill', cd: 0, if: { is: 'tag', tag: 'steamLow', of: 'self' }, do: { do: 'pulse', radius: 110, side: 'foe', then: { do: 'damage', type: 'steam', ofBase: 1 } } }],
  },
  {
    id: 'staticAntenna', name: 'Static Antenna', pool: 'body', text: 'While the Oracle speaks, Shock the nearest foe each second; you are Charged.', from: 'Shock damage',
    effects: [{ when: 'tick', cd: 0, if: { is: 'tag', tag: 'oracleSpeaks', of: 'self' }, do: [{ do: 'chain', jumps: 1, range: 420, then: { do: 'damage', type: 'shock', amount: 8 } }, { do: 'status', id: 'charged', duration: 2 }] }],
  },
  {
    id: 'oilSlickSoles', name: 'Oil-Slick Soles', pool: 'body', text: 'Walking leaves a slick of crude: foes in it are Slowed, and fire lights it.', from: 'Move speed',
    effects: [], // the rule is in botskills.ts `soleTrail` (a trail needs a slick every step he walks, the effect tick is once a second)
  },
  {
    id: 'lanternFaith', name: 'Lantern Faith', pool: 'body', text: 'The twisted inside your light are Marked.', from: 'Lamp radius',
    effects: [], // the rule is in botskills.ts: it reads this card and the Communicator's `lamp` stat
  },
  // A type's, and the crew-wide pool
  {
    id: 'pressureRelease', name: 'Pressure Release', pool: 'gatherer', text: 'Hurt while stripping or mining: a Steam and Wet vent round the gatherer.', from: 'Max oil',
    effects: [{ when: 'hurt', cd: 3, if: { is: 'tag', tag: 'stripping', of: 'self' }, do: { do: 'pulse', radius: 90, side: 'foe', then: [{ do: 'damage', type: 'steam', amount: 6 }, { do: 'status', id: 'wet' }] } }],
  },
  {
    id: 'sawTeeth', name: 'Saw Teeth', pool: 'guard', text: "The guard's saw hits leave the foe Corroded.", from: 'Melee damage',
    effects: [{ when: 'hit', cd: 0, if: { is: 'via', via: 'saw' }, do: { do: 'status', id: 'corroded' } }],
  },
  {
    id: 'shieldBrothers', name: 'Shield Brothers', pool: 'guard', text: 'Guards within 120 px of each other share the damage they take, evenly.', from: 'Armour',
    effects: [], // the rule is in combat.ts `hurt`
  },
  {
    id: 'fieldTinker', name: 'Field Tinker', pool: 'repairer', text: "A field fix also clears the fixed robot's negative statuses.", from: 'Heal rate',
    effects: [], // the rule is in downed.ts `fixed`: a repairer in the party wears it
  },
  {
    id: 'wetSeason', name: 'Wet Season', pool: 'boilermancer', text: 'A steam cloud leaves a Wet puddle where it fades.', from: 'Cloud size',
    effects: [], // the rule is in botskills.ts, where a cloud ends
  },
  {
    id: 'pressureChoir', name: 'Pressure Choir', pool: 'boilermancer', text: 'A blessing also gives the crew near the boilermancer 10 Overcharge.', from: 'Max steam',
    effects: [], // the rule is in botskills.ts `cast`: when a blessing fires
  },
  {
    id: 'mothLight', name: 'Moth Light', pool: 'lamplighter', text: 'Twisted foes that step into the lamp are Taunted to the lamplighter for 2 s.', from: 'Lamp radius',
    effects: [], // the rule is in botskills.ts, where the lamp is
  },
  {
    id: 'backstabGears', name: 'Back-stab Gears', pool: 'stalker', text: 'A blow from behind Staggers.', from: 'Damage',
    effects: [], // the rule is in botskills.ts `stab`
  },
  {
    id: 'secondShadow', name: 'Second Shadow', pool: 'stalker', text: 'The stalker hides again at once on any kill.', from: 'Move speed',
    effects: [], // the rule is in botskills.ts `stab`
  },
  {
    id: 'overTheRocks', name: 'Over the Rocks', pool: 'marksman', text: 'A shot at a Marked foe flies over rock.', from: 'Range',
    effects: [], // the rule is in combat.ts `shoot` / `fire`
  },
  {
    id: 'bowlingSeason', name: 'Bowling Season', pool: 'kick', text: 'A kicked robot Staggers what it hits, and is Braced for 2 s.', from: 'Crash damage',
    effects: [], // the rule is in crash.ts
  },
  {
    id: 'rallyKick', name: 'Rally Kick', pool: 'crew', text: 'When you kick, the crew within 200 px gains Haste for 2 s.', from: 'Move speed',
    effects: [{ when: 'kick', cd: 1, do: { do: 'pulse', radius: 200, side: 'ally', then: { do: 'status', id: 'haste', duration: 2, to: 'target' } } }],
  },
  {
    id: 'avengeHim', name: 'Avenge Him', pool: 'crew', text: 'When you fall under half oil, the crew within 240 px gains Fury for 4 s (once in 20 s).', from: 'Max oil',
    effects: [{ when: 'hurt', cd: 20, if: { is: 'hp', below: 0.5, of: 'self' }, do: { do: 'pulse', radius: 240, side: 'ally', then: { do: 'status', id: 'fury', duration: 4, to: 'target' } } }],
  },
  {
    id: 'followMe', name: 'Follow Me', pool: 'crew', text: 'When you dash, the crew within 240 px gains Haste for 1.5 s.', from: 'Move speed',
    effects: [{ when: 'dash', cd: 1, do: { do: 'pulse', radius: 240, side: 'ally', then: { do: 'status', id: 'haste', duration: 1.5, to: 'target' } } }],
  },
  {
    id: 'brassBrotherhood', name: 'Brass Brotherhood', pool: 'crew', text: 'When a bot goes down, the crew near it gains Fury.', from: 'Max oil',
    effects: [{ when: 'down', who: 'ally', cd: 0, do: { do: 'pulse', radius: 240, side: 'ally', self: true, then: { do: 'status', id: 'fury' } } }],
  },
  // Keystones: party-wide wherever they sit
  {
    id: 'conductors', name: 'Conductors', pool: 'keystone', text: 'Shock chains through Wet at any distance on screen.', from: '',
    effects: [{ when: 'always', do: { do: 'stat', stat: 'wetArc', add: 1200 } }],
  },
  {
    id: 'rustBloom', name: 'Rust Bloom', pool: 'keystone', text: 'Corroded foes that die pass their stacks on.', from: '',
    effects: [{ when: 'kill', cd: 0, if: { is: 'status', id: 'corroded' }, do: { do: 'pulse', radius: 90, at: 'target', then: { do: 'status', id: 'corroded', stacks: 'event' } } }],
  },
  {
    id: 'heatLamp', name: 'Heat Lamp', pool: 'keystone', text: 'Burning and Scalded foes in your light take their ticks twice.', from: '',
    effects: [
      { when: 'aura', r: 150, side: 'foe', if: { is: 'status', id: 'burning' }, do: { do: 'stat', stat: 'damageTaken:fire', pct: 1 } },
      { when: 'aura', r: 150, side: 'foe', if: { is: 'status', id: 'scalded' }, do: { do: 'stat', stat: 'damageTaken:steam', pct: 1 } },
    ],
  },
  {
    id: 'lastGasp', name: 'Last Gasp', pool: 'keystone', text: 'Spending spare oil to rise first releases a steam nova.', from: '',
    effects: [{ when: 'cast', cd: 0, if: { is: 'via', via: 'spareOil' }, do: { do: 'pulse', radius: 170, knock: 700, side: 'foe', then: { do: 'damage', type: 'steam', amount: 30 } } }],
  },
  {
    id: 'kineticFaith', name: 'Kinetic Faith', pool: 'keystone', text: 'Every crash chains a smaller crash to the next foe.', from: '',
    effects: [{ when: 'crash', cd: 0, do: { do: 'chain', jumps: 1, range: 130, then: { do: 'damage', type: 'impact', ofEvent: 0.5 } } }],
  },
  {
    id: 'deadMansLamp', name: "Dead Man's Lamp", pool: 'keystone', text: "A downed robot's light stays lit, and its crew inside it are Shadowed.", from: '',
    effects: [], // the rule is in sim.ts `lampStep`
  },
  {
    id: 'liveWire', name: 'Live Wire', pool: 'keystone', text: 'Positive statuses you give last twice as long, their downsides too.', from: '',
    effects: [{ when: 'always', do: { do: 'stat', stat: 'givenDuration', pct: 1 } }],
  },
];

export type CardId = string;
export const cardOf = (id: CardId): Card | undefined => CARDS.find((c) => c.id === id);

/** `comm:0` .. `comm:2`, or `type:<id>`. */
export type SlotKey = string;
export const commSlot = (n: number): SlotKey => `comm:${n}`;
export const typeSlot = (t: BotType): SlotKey => `type:${t}`;
export const COMM_SLOT_KEYS: SlotKey[] = Array.from({ length: RESEARCH.commSlots }, (_, i) => commSlot(i));
/** The Fourth Slot (P52, the Oracle's gift at the fifth step of her track): a fourth card slot on the Communicator, there once `Research.fourth` is set. */
export const FOURTH_SLOT: SlotKey = commSlot(RESEARCH.commSlots);
/** The Communicator's card slots now. */
export const commKeys = (r: Pick<Research, 'fourth'>): SlotKey[] => (r.fourth ? [...COMM_SLOT_KEYS, FOURTH_SLOT] : COMM_SLOT_KEYS);
export const TYPE_SLOT_KEYS: SlotKey[] = BOT_TYPES.map(typeSlot);
/** A slot's name for the cards screen: "Slot 1" on the Communicator, the type's name on a type. */
export const slotName = (k: SlotKey) => {
  if (k.startsWith('comm:')) return `Slot ${Number(k.slice(5)) + 1}`;
  const n = POOL_NAMES[k.slice(5) as Pool];
  return n.endsWith('man') ? `${n.slice(0, -3)}men` : `${n}s`;
};

export interface Research {
  owned: CardId[];
  fit: Record<SlotKey, CardId>;
  credit: number;
  seen: string | null;
  offer: CardId[];
  /** The Oracle has kept a fourth slot for him (`FOURTH_SLOT`). */
  fourth?: boolean;
}
export const freshResearch = (): Research => ({ owned: [], fit: {}, credit: 0, seen: null, offer: [] });

/** What the church can offer: the bot types in the roster and whether the dog is aboard (a companion, P42: `companionDog`). */
export interface Ctx { types: BotType[]; dog: boolean; /** Cards beyond `RESEARCH.offered` on offer (the First Scripture hanging in the church: P38, D37). */ more?: number }
export const noCtx: Ctx = { types: [], dog: false };

// ---- slots ----

/** The slots a card can use (the Fourth Slot among them: it is only his once the Oracle has given it, `commKeys`). */
export function slotsFor(card: Card): SlotKey[] {
  if (card.pool === 'keystone') return [...COMM_SLOT_KEYS, FOURTH_SLOT, ...TYPE_SLOT_KEYS];
  if ((BOT_TYPES as readonly string[]).includes(card.pool)) return [typeSlot(card.pool as BotType)];
  return [...COMM_SLOT_KEYS, FOURTH_SLOT];
}
export const fittedAt = (r: Research, id: CardId): SlotKey | undefined => Object.keys(r.fit).find((k) => r.fit[k] === id);
const without = (fit: Research['fit'], id: CardId) => Object.fromEntries(Object.entries(fit).filter(([, c]) => c !== id));
const isKeystone = (id: CardId) => cardOf(id)?.pool === 'keystone';

/** Fit a card you own into a slot it can use: it leaves where it was, the card that was in the slot goes back to the collection, and a keystone takes the other keystone out. Throws with the reason. */
export function fit(r: Research, id: CardId, slot: SlotKey): Research {
  const card = cardOf(id);
  if (!card) throw new Error('no such card');
  if (!r.owned.includes(id)) throw new Error(`${card.name} is not in your collection`);
  if (!slotsFor(card).includes(slot)) throw new Error(`${card.name} does not fit ${slotName(slot)}`);
  if (slot === FOURTH_SLOT && !r.fourth) throw new Error('you have no fourth slot yet');
  let next = without(r.fit, id);
  if (card.pool === 'keystone') for (const k of Object.keys(next)) if (isKeystone(next[k])) delete next[k];
  next = { ...next, [slot]: id };
  return { ...r, fit: next };
}
export const unfit = (r: Research, id: CardId): Research => ({ ...r, fit: without(r.fit, id) });

/** Where a new card goes by itself: the first free slot that can use it (a keystone only when none is fitted). Null when there is none. */
export function autoFit(r: Research, id: CardId): SlotKey | null {
  const card = cardOf(id);
  if (!card) return null;
  if (card.pool === 'keystone' && Object.values(r.fit).some(isKeystone)) return null;
  return slotsFor(card).find((k) => !r.fit[k] && (k !== FOURTH_SLOT || r.fourth)) ?? null;
}

// ---- the pick ----

/** The pools you can draw from: the Communicator's (the dog's only with the dog), each type you own, and the keystones once you hold enough cards. */
export function usablePools(r: Research, ctx: Ctx): Pool[] {
  const pools: Pool[] = COMM_POOLS.filter((p) => p !== 'dog' || ctx.dog);
  pools.push(...ctx.types);
  if (r.owned.length >= RESEARCH.keystonesAfter) pools.push('keystone');
  return pools;
}

/** Three cards you do not own (see the header). `seed` makes the draw repeatable. */
export function offerFor(r: Research, ctx: Ctx, seed: string): CardId[] {
  const g = rng(seed);
  const usable = usablePools(r, ctx);
  const avail = CARDS.filter((c) => !c.waits && !r.owned.includes(c.id) && usable.includes(c.pool));
  const held = new Set(r.owned.map((id) => cardOf(id)?.pool));
  const out: Card[] = [];
  const take = (from: Card[]) => {
    const rest = from.filter((c) => !out.includes(c));
    if (rest.length) out.push(g.pick(rest));
  };
  take(avail.filter((c) => held.has(c.pool)));
  take(avail.filter((c) => !held.has(c.pool)));
  while (out.length < RESEARCH.offered + (ctx.more ?? 0) && avail.some((c) => !out.includes(c))) take(avail);
  return g.shuffle(out).map((c) => c.id);
}

/** Picks you can take now. */
export const waiting = (r: Research): number => r.credit;

/** The lift docks: the haul's free pick joins the picks waiting, kept until spent. The same haul twice banks one. */
export const bankPick = (r: Research, haul: string): Research => (haul === r.seen ? r : { ...r, credit: r.credit + 1, seen: haul });

/** Draw the offer if a pick is waiting and none is on offer. */
export function prepare(r: Research, ctx: Ctx): Research {
  if (r.credit > 0 && !r.offer.length) return { ...r, offer: offerFor(r, ctx, `research/${r.owned.join(',')}/${r.credit}/${r.seen}`) };
  return r;
}

/** The Oracle dreams again (P38, her tithe): the three on offer are set aside and three others drawn (the same ones again only when no others are left). */
export function dreamAgain(r: Research, ctx: Ctx): Research {
  if (!r.offer.length) return r;
  const fresh = offerFor({ ...r, owned: [...r.owned, ...r.offer] }, ctx, `research/again/${r.owned.join(',')}/${r.offer.join(',')}`);
  return { ...r, offer: fresh.length ? fresh : r.offer };
}

/** Take a card of the offer: it joins the collection for good, fits itself into a free slot if one can use it, and the offer is drawn again if a pick is left. */
export function pick(r: Research, id: CardId, ctx: Ctx): { r: Research; slot: SlotKey | null } {
  if (!r.offer.includes(id)) throw new Error('that card is not on offer');
  let next: Research = { ...r, owned: [...r.owned, id], credit: Math.max(0, r.credit - 1), offer: [] };
  const slot = autoFit(next, id);
  if (slot) next = fit(next, id, slot);
  return { r: prepare(next, ctx), slot };
}

/** Spend insight for one more pick. Throws when there is not enough. */
export function buyPick(r: Research, insight: number, ctx: Ctx): { r: Research; insight: number } {
  if (insight < RESEARCH.insightPerPick) throw new Error('No insight to spend: decode live ruins, read the masts, and bring it home.');
  return { r: prepare({ ...r, credit: r.credit + 1 }, ctx), insight: insight - RESEARCH.insightPerPick };
}

// ---- in a mission ----

/** What `SimOptions.cards` takes: sources for the Communicator, for every bot of a type, and for every unit (the keystone). */
export interface CardSources { comm: Source[]; roles: Partial<Record<string, Source[]>>; party: Source[] }
export const noCards = (): CardSources => ({ comm: [], roles: {}, party: [] });

export const sourceOf = (c: Card): Source => ({ id: `card:${c.id}`, kind: 'research', name: c.name, effects: c.effects });

/** The fitted cards as sources, by where they act. An unfitted card is not in it. */
export function cardSources(r: Research): CardSources {
  const out = noCards();
  for (const [slot, id] of Object.entries(r.fit)) {
    const c = cardOf(id);
    if (!c || !r.owned.includes(id) || !slotsFor(c).includes(slot)) continue;
    if (c.pool === 'keystone') out.party.push(sourceOf(c));
    else if (slot.startsWith('comm:')) out.comm.push(sourceOf(c));
    else (out.roles[slot.slice(5)] ??= []).push(sourceOf(c));
  }
  return out;
}

/** A save's research made safe: unknown cards, doubles and misfitted cards drop out. */
export function cleanResearch(r: Research): Research {
  const owned = [...new Set(r.owned)].filter((id) => cardOf(id));
  const fitted: Research['fit'] = {};
  for (const [slot, id] of Object.entries(r.fit ?? {})) {
    const c = cardOf(id);
    if (c && owned.includes(id) && slotsFor(c).includes(slot) && (slot !== FOURTH_SLOT || r.fourth) && !Object.values(fitted).includes(id)) fitted[slot] = id;
  }
  for (const k of Object.keys(fitted).filter((k) => isKeystone(fitted[k])).slice(1)) delete fitted[k];
  return { owned, fit: fitted, ...(r.fourth === true && { fourth: true }), credit: Math.max(0, Math.floor(r.credit) || 0), seen: r.seen ?? null, offer: (r.offer ?? []).filter((id) => cardOf(id) && !owned.includes(id)) };
}
