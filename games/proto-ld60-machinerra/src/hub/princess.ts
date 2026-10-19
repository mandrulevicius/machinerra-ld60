/**
 * The Princess at home (P58), plain TS: what she does between the story's beats. Princess Ada Dorothea (Minos), "Dot" only to
 * the Communicator, a robot vacuum in a copper skirt (Laimonas's painting). Her state is the `princess` slice (`princessslice.ts`);
 * the deck draws it (`princessview.ts`), the lift's docking moves it (`carry.ts` `landed` calls `homecoming`).
 *
 * - **The deck's prints** (P58 G): his boots print the deck in the colour of the land he came from (`PRINT_COLOUR`), the crew's
 *   black there-and-back errands are laid while he is away (`deckprints.ts`). With her home she sweeps while he is out, so a
 *   homecoming shows only this absence's errands and his walk in; while she is gone nothing is swept: every trip's prints stay,
 *   under a dust that thickens with each visit home (`dustStage`). Stacked prints darken and stop short of solid (`bake`).
 * - **Sweepings** (P58 A): after each lift home she presents what was tracked in as a pile by her dock: a little scrap, a common
 *   part of that land, now and then one of its relics (`sweepings`). Small on purpose: a gift, not an income.
 * - **The return** (P58 D): the homecoming she is back from the Ether owes the one sweep (`DeckState.owed`); the hub plays it and
 *   calls `swept`.
 *
 * Every number here is a guess (P58 "Lead's calls").
 */
import { rng } from '../../../../harness/kit/rng';
import { BIOMES, ENEMY_PARTS, PARTS, type BiomeId, type PartKind } from '../sim/defs';
import { RELICS, RUIN_JUNK, type RelicId } from '../sim/junk';
import type { Haul } from './state';

export type Wife = 'none' | 'home' | 'stolen';

/** Her full name, said first at "Dock found" (her line's third step); only the Communicator calls her Dot (Minos). */
export const NAME = { full: 'Princess Ada Dorothea', short: 'Dot' };

/** His prints, by the land he came home from (Minos: the land's colour, violet for the Ether). Guesses, judged on the deck. */
export const PRINT_COLOUR: Record<BiomeId, number> = {
  desert: 0xd0893a, // orange sand
  jungle: 0x5a4628, // brown dirt, a moss cast
  city: 0x2a211b, // oily black-brown
  mountains: 0xdce8f4, // pale blue-white snow
  demon: 0x8c8884, // grey ash
  ether: 0xa874ff, // violet, faintly glowing (`princessview.ts` adds the glow)
};
/** What the land leaves in her pile, in words (the banner). */
export const LAND_DUST: Record<BiomeId, string> = {
  desert: 'desert sand',
  jungle: 'jungle leaves',
  city: 'Hollow City receipts',
  mountains: 'Frostspine snow-melt',
  demon: 'Demon Wastes ash',
  ether: 'a pinch of the Ether (it hums)',
};

/** Her sweepings: scrap a pile (min..max), common parts of the land, the chance of one of its relics (1 in 8). Doubled by her repeatable. */
export const SWEEP = { scrap: [2, 5] as const, parts: 1, relic: 1 / 8, /** Her ladder's perks (P58 H): Sand in the bearings finds this many more parts, Frost on the contacts multiplies the relic chance. */ more: 1, frost: 2 };
/** How much is kept: crew trips and his trails since the last sweep (older ones drop off the far end), his prints a trail. */
export const KEEP = { trips: 24, trails: 24, prints: 60, week: 3 };
/** Stacked prints: each adds `alpha` of what is left, up to `cap` (old prints never vanish, never go solid). */
export const STACK = { cell: 8, turn: 22.5, cap: 0.6 };

/** The deck's bookkeeping since she last swept it. */
export interface DeckState {
  /** The crew aboard on each absence since the last sweep (newest last): each lays its there-and-back errand once a trip (`deckprints.ts`). */
  trips: string[][];
  /** His trails home since the last sweep: the land he came from and the prints, flat `[x, y, angle°]` triples (newest last). */
  his: { b: BiomeId; p: number[] }[];
  /** Homecomings while she was gone: the dust (`dustStage`). */
  dust: number;
  /** She is back and has not swept yet: the hub plays the return sweep, then `swept`. */
  owed: boolean;
}
/** Her pile by the dock: E picks it up. `dust` names the lands it came from. */
export interface Pile { scrap: number; parts: Partial<Record<PartKind, number>>; junk: RelicId[]; dust: BiomeId[] }
export interface PrincessState {
  deck: DeckState;
  pile: Pile | null;
  /** Her repeatable paid: the next sweepings are doubled. */
  double: boolean;
  /** Her line's first step (The Inventory of Everything): the lands she has catalogued something from, since she came home. */
  catalogue: BiomeId[];
  /** The lands of the last trips home, newest last (her repeatable: a land she has not mapped this week). */
  flown?: BiomeId[];
}

export const freshDeck = (): DeckState => ({ trips: [], his: [], dust: 0, owed: false });
export const freshPrincess = (): PrincessState => ({ deck: freshDeck(), pile: null, double: false, catalogue: [], flown: [] });

/** The dust a number of homecomings without her lays: 0 none, 1 a film, 2 drifts in the corners, 3 worn paths (P58 D). */
export const dustStage = (homecomings: number) => Math.max(0, Math.min(3, Math.floor(homecomings)));

/** The land's common parts (what its machines drop most). */
const commonParts = (b: BiomeId): PartKind[] => [...new Set(BIOMES[b].foes.map(([f]) => ENEMY_PARTS[f]?.part).filter((k): k is PartKind => !!k && !PARTS[k]?.unique))];
/** The land's relics: what its kinds of ruin give (the desert's are the default ruins). */
export const landRelics = (b: BiomeId): RelicId[] => [...new Set((BIOMES[b].ruins ?? ['car', 'phone', 'dish', 'panel']).flatMap((k) => RUIN_JUNK[k] ?? []))];

/** What she sweeps up after a lift home from `b` (seeded by the haul, so a replay pays the same). */
export function sweepings(b: BiomeId, seed: string, double = false, perks: readonly string[] = []): Pile {
  const r = rng(`sweep:${seed}`);
  const k = double ? 2 : 1;
  const scrap = r.int(SWEEP.scrap[0], SWEEP.scrap[1]) * k;
  const parts: Pile['parts'] = {};
  const common = commonParts(b);
  if (common.length) parts[r.pick(common)] = SWEEP.parts * k + (perks.includes('sandBearings') ? SWEEP.more : 0); // Sand in the bearings: one more thing
  const relics = landRelics(b);
  const junk: RelicId[] = [];
  const chance = SWEEP.relic * (perks.includes('frostContacts') ? SWEEP.frost : 1); // Frost on the contacts: twice the relics
  for (let i = 0; i < k; i++) if (relics.length && r.chance(chance)) junk.push(r.pick(relics));
  return { scrap, parts, junk, dust: [b] };
}

/** Two piles become one (an unpicked pile is never lost). */
export function merge(a: Pile | null, b: Pile): Pile {
  if (!a) return b;
  const parts = { ...a.parts };
  for (const [k, n] of Object.entries(b.parts) as [PartKind, number][]) parts[k] = (parts[k] ?? 0) + n;
  return { scrap: a.scrap + b.scrap, parts, junk: [...a.junk, ...b.junk], dust: [...new Set([...a.dust, ...b.dust])] };
}

/** The pile in words, for the banner on picking it up. */
export function pileText(p: Pile): string {
  const bits = [`${p.scrap} scrap`, ...(Object.entries(p.parts) as [PartKind, number][]).map(([k, n]) => `${n} ${n === 1 ? PARTS[k].name : PARTS[k].plural}`), ...p.junk.map((id) => `a ${RELICS[id].item.toLowerCase()}`)];
  return `Her sweepings: ${bits.join(', ')}, and ${p.dust.map((b) => LAND_DUST[b]).join(' and ')}`;
}

/** She sweeps partway through his absence: about half the crew's errands come after her sweep and still show (`SINCE`, a guess). */
export const SINCE = 0.5;
export const sinceSweep = (crew: string[], seed: string) => {
  const r = rng(`since:${seed}`);
  return crew.filter(() => r.chance(SINCE));
};

/** The lift docks (`carry.ts`): where she was before it went down, where she is now, the land flown, the crew aboard (who walked the deck meanwhile). */
export interface Homecoming { was: Wife; now: Wife; biome: BiomeId; crew: string[]; id: string; brought: boolean; /** The perks held: her docks' (P58 H) shape the sweepings. */ perks?: readonly string[] }

/**
 * What a homecoming does to her state. She home before and after: she swept while he was out, so the deck shows this absence's
 * errands only and a pile waits by her dock. Gone: nothing is swept, the trip's prints join the rest and the dust thickens.
 * Back from the Ether: the deck stays as it is until the return sweep plays (`owed`). Before she ever came home the deck shows
 * only this absence too (a guess: someone keeps it), with no pile.
 */
export function homecoming(st0: PrincessState, h: Homecoming): PrincessState {
  const st = { ...st0, flown: [...(st0.flown ?? []), h.biome].slice(-KEEP.week) };
  const d = st.deck;
  if (h.now === 'stolen') return { ...st, deck: { ...d, trips: [...d.trips, h.crew].slice(-KEEP.trips), dust: d.dust + 1, owed: false } };
  if (h.now === 'home' && h.was === 'stolen') return { ...st, deck: { ...d, trips: [...d.trips, h.crew].slice(-KEEP.trips), owed: true } };
  const deck: DeckState = { trips: [h.now === 'home' ? sinceSweep(h.crew, h.id) : h.crew], his: [], dust: 0, owed: false };
  if (h.now !== 'home') return { ...st, deck };
  const home = h.was === 'home';
  return {
    ...st,
    deck,
    pile: home ? merge(st.pile, sweepings(h.biome, h.id, st.double, h.perks)) : st.pile,
    double: home ? false : st.double,
    catalogue: h.brought && !st.catalogue.includes(h.biome) ? [...st.catalogue, h.biome] : st.catalogue,
  };
}

/** The return sweep has played: every print and all the dust are gone. */
export const swept = (st: PrincessState): PrincessState => ({ ...st, deck: freshDeck() });

/** His trail home is laid (the hub, as his boots run clean): kept with the land's colour. */
export function addTrail(st: PrincessState, b: BiomeId, prints: number[]): PrincessState {
  if (!prints.length) return st;
  return { ...st, deck: { ...st.deck, his: [...st.deck.his, { b, p: prints.slice(0, KEEP.prints * 3) }].slice(-KEEP.trails) } };
}

/** He picks up her pile: what it was, and the state without it. */
export const pickUp = (st: PrincessState): { pile: Pile | null; state: PrincessState } => ({ pile: st.pile, state: { ...st, pile: null } });

/** One stamp on the deck: a print's place, angle in degrees, colour, opacity and size. */
/** `glow`: an Ether print's faint violet light; `speck`: a grain of dust (the kit's irregular splat, not the soft blob). */
export interface Stamp { x: number; y: number; a: number; tint: number; alpha: number; scale: number; glow?: boolean; speck?: boolean }

/**
 * Prints laid over each other in one place darken, but never past `STACK.cap`: stamps of one colour and size within one cell
 * and one turn are baked once, at the opacity n of them reach (1 - (1 - a)^n, capped). Keeps the bake small too.
 */
export function bake(stamps: Stamp[]): Stamp[] {
  const cells = new Map<string, { s: Stamp; n: number }>();
  for (const s of stamps) {
    const k = `${Math.round(s.x / STACK.cell)},${Math.round(s.y / STACK.cell)},${Math.round((((s.a % 360) + 360) % 360) / STACK.turn)},${s.tint},${s.scale}`;
    const c = cells.get(k);
    if (c) c.n++;
    else cells.set(k, { s, n: 1 });
  }
  return [...cells.values()].map(({ s, n }) => ({ ...s, alpha: Math.min(STACK.cap, 1 - (1 - s.alpha) ** n) }));
}

/** Rumba rides her rounds now and then (P58 A, P42's cat): once she is yours, one visit in three (a guess), seeded by the visit. */
export const RIDE = { chance: 1 / 3 };
export const rides = (missions: number, cat: boolean) => cat && rng(`ride:${missions}`).chance(RIDE.chance);

/** What the lift brought, as her homecoming line reads it. */
export interface Brought { lost: number; home: number; bosses: number; midnight: boolean; junk: string[]; scrap: number; biome: BiomeId }

export const broughtOf = (h: Haul, biome: BiomeId): Brought => ({
  lost: Math.max(0, (h.went?.length ?? 0) - h.robots.filter((r) => r.uid).length),
  home: h.robots.length,
  bosses: h.bosses?.length ?? 0,
  midnight: !!h.carry?.stats.pastMidnight,
  junk: h.junk ?? [],
  scrap: h.scrap ?? 0,
  biome,
});

/** Her lines as the lift comes home, by what it brought (the writer's; brisk, tidy, fond, deadpan). */
export const HOMECOMING = {
  lost: ['You went down with more than you came up with. Count them in. You know the rule.', 'Someone is missing. I set out a cloth for them anyway.'],
  boss: ['That one was messy. I approve. Wipe your feet anyway.', 'I heard it fall from up here. So did the dust.'],
  midnight: ['Past midnight. I left the lamp on. I always leave the lamp on; do not read into it.', 'You are late. The deck was clean at dusk. It is not clean now.'],
  relic: (item: string) => [`You brought a ${item}. It is broken. It is perfect.`, `A ${item}. I will dust it before anyone fits it.`],
  scrap: ['That is a great deal of scrap. It will need a great deal of sweeping.'],
  all: ['Everyone home. I counted. Twice.', 'All of them, on one lift. I will not make a fuss. I am making a small fuss.'],
  land: {
    desert: ['Sand. In the joints, in the vents, in the bed. Welcome home.'],
    jungle: ['Leaves. One of them is moving. I will deal with it.'],
    city: ['Receipts. Thousands. Nobody bought anything; they just print.'],
    mountains: ['Snow-melt on my clean deck. It will dry. You will not, if you stand there.'],
    demon: ['Ash. I am choosing not to ask whose.'],
    ether: ['That violet does not come off. I have tried.'],
  } as Record<BiomeId, string[]>,
};

/** The one line she says as he comes home, picked from what the lift brought (seeded by the haul). */
export function homecomingLine(b: Brought, seed: string): string {
  const r = rng(`home:${seed}`);
  if (b.lost > 0) return r.pick(HOMECOMING.lost);
  if (b.bosses > 0) return r.pick(HOMECOMING.boss);
  if (b.midnight) return r.pick(HOMECOMING.midnight);
  const relic = b.junk.find((id) => id in RELICS) as RelicId | undefined;
  if (relic && r.chance(0.6)) return r.pick(HOMECOMING.relic(RELICS[relic].item.toLowerCase()));
  if (b.scrap >= 80) return r.pick(HOMECOMING.scrap);
  if (b.home >= 3 && r.chance(0.5)) return r.pick(HOMECOMING.all);
  return r.pick(HOMECOMING.land[b.biome]);
}
