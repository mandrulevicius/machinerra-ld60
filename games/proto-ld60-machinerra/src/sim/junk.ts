/**
 * Misread junk (systems.md, "Misread junk (old tech)"; P19): old tech the colony reads wrongly, and a robot wears one
 * reading in its one relic socket (D4), fitted by hand at the workshop bench (D10). Plain TS, no Phaser, no storage.
 *
 * J1-J12 (P23 added J9-J12), then the eight biome relics (D50: J21 sprinkler, J23 zapper, J24 Tamagotchi, J26 traffic light, J28 selfie stick, J30 beacon, J31 hand warmer, J33 thermos; effects only, their timed flaws dropped). A relic is a `RelicDef`: its colony reading, the effect and the flaw as the doc words them, and the engine source it
 * puts on the robot (`relicSource`, id `relic:<id>`, kind `relic`) for what the effect language can say. What it cannot
 * say (a lobbed slug, a humming cone, a gust, the lift-seeking, fetching loot, the flaw barks) is behaviour in `junkplay.ts`, which
 * reads the numbers in `RELIC_FX`. Both are chosen by the relic's id. `RosterBot.relic` (the workshop's roster) holds the
 * id; the Sim dresses the robot with the source (`Sim.dress`) and runs the behaviour.
 *
 * Where junk comes from: a dead ruin gives one by chance (`ruinJunk`, `RUIN_JUNK`: each kind of ruin its own finds), onto
 * the carry strip (`JUNK.strip`, more with a Carrier gatherer) that rides home in the haul; at home it is a stock
 * (`Economy.junk`) to fit, to sell to the Trader (`JUNK.sell` scrap) or, when a robot already wears one of its kind, to
 * offer the Oracle for scrap (`JUNK.offer`). The two uniques are a boss's own parts, kept in the stores as parts
 * (`UNIQUE_RELICS`); fitting one takes it from the stores, taking it off puts it back (`hub/relics.ts`).
 *
 * **Add a relic:** a `RelicId`, a `RELICS` row (and a `RELIC_FX` row for what it does in `junkplay.ts`), the kinds of ruin
 * that give it in `RUIN_JUNK`, a pictogram in `relicart.ts`. `junk.test.ts` checks every row validates and has all three.
 */
import type { Rng } from '../../../../harness/kit/rng';
import type { PartKind, RuinKind } from './defs';
import { validate, type Source } from './effects';

/** J1-J8, the jam's eight, then the two uniques (a boss's own part is the relic). */
export type RelicId = 'toaster' | 'smartphone' | 'microwave' | 'hairdryer' | 'fan' | 'satnav' | 'speaker' | 'toothbrush' | 'smokedetector' | 'remote' | 'powerbank' | 'quadcopter' | 'sprinkler' | 'zapper' | 'tamagotchi' | 'trafficlight' | 'selfiestick' | 'beacon' | 'handwarmer' | 'thermos' | 'queens-crown' | 'harbinger-heart';
export const RELIC_IDS: RelicId[] = ['toaster', 'smartphone', 'microwave', 'hairdryer', 'fan', 'satnav', 'speaker', 'toothbrush', 'smokedetector', 'remote', 'powerbank', 'quadcopter', 'sprinkler', 'zapper', 'tamagotchi', 'trafficlight', 'selfiestick', 'beacon', 'handwarmer', 'thermos', 'queens-crown', 'harbinger-heart'];
export const isRelic = (id: unknown): id is RelicId => (RELIC_IDS as unknown[]).includes(id);

/** The kind of socket the doc names (arms: an action; head: what it picks; back: a passive). A robot has one relic socket and takes any. */
export type RelicSocket = 'arms' | 'head' | 'back';

export interface RelicDef {
  id: RelicId;
  /** The J number in systems.md ('J1'), or 'U' for a unique. */
  no: string;
  /** What it was. */
  item: string;
  /** What the colony thinks it is. */
  reading: string;
  socket: RelicSocket;
  /** The effect and the flaw, as the doc words them. */
  effect: string;
  flaw: string;
  /** A boss's own part (the unique relics): kept in the stores, never sold. */
  part?: PartKind;
  /** The engine source it puts on its wearer. */
  source: () => Source;
}

const src = (id: RelicId, name: string, effects: Source['effects']): Source => ({ id: `relic:${id}`, kind: 'relic', name, tags: ['relic', id], effects });

export const RELICS: Record<RelicId, RelicDef> = {
  toaster: {
    id: 'toaster', no: 'J1', item: 'Toaster', reading: 'Twin-barrel bread cannon', socket: 'arms',
    effect: 'Every 3 s, two hot slugs in an arc over rocks: 14 Impact each, 40% Burning', flaw: 'Dings first; dashers dodge',
    // Dings first: it takes a quarter more. The slugs are `junkplay.ts`.
    source: () => src('toaster', 'Bread cannon', [{ when: 'always', do: { do: 'stat', stat: 'damageTaken', pct: 0.25 } }]),
  },
  smartphone: {
    id: 'smartphone', no: 'J2', item: 'Smartphone', reading: 'Brain of a thousand voices', socket: 'head',
    effect: 'Clears fog and marks loot within 15 tiles; fetches loot', flaw: 'Says it is "scrolling" every 20 s (a bark, nothing more)',
    // The flaw is a bark (`junkplay.ts`): it never takes control of the robot (Minos on D24).
    source: () => src('smartphone', 'Thousand voices', []),
  },
  microwave: {
    id: 'microwave', no: 'J3', item: 'Microwave', reading: 'Heat-ray box', socket: 'arms',
    effect: '2 s hum, then a cone: 40 Fire; twisted take double', flaw: 'Stands still while humming',
    source: () => src('microwave', 'Heat-ray box', []),
  },
  hairdryer: {
    id: 'hairdryer', no: 'J4', item: 'Hair dryer', reading: 'Hand-held boiler', socket: 'arms',
    effect: 'A gust: knockback, Wet, twisted auras and Charge off for 3 s', flaw: 'No damage',
    source: () => src('hairdryer', 'Hand-held boiler', []),
  },
  fan: {
    id: 'fan', no: 'J5', item: 'Desk fan', reading: 'Prayer wheel', socket: 'back',
    effect: 'Immune to aura slow; robots within 90 px take half aura burn', flaw: 'Draws hornets from farther',
    source: () => src('fan', 'Prayer wheel', [
      { when: 'aura', r: 90, self: true, do: { do: 'stat', stat: 'auraBurnTaken', pct: -0.5 } },
      // Immune to the halo's slow (`auraSlowTaken` times 0); the lure is a half again as far (`lure`).
      { when: 'always', do: [{ do: 'stat', stat: 'auraSlowTaken', pct: -1 }, { do: 'stat', stat: 'lure', pct: 0.5 }] },
    ]),
  },
  satnav: {
    id: 'satnav', no: 'J6', item: 'Car satnav', reading: 'The Way-finder', socket: 'head',
    effect: '+25% speed on orders; heads for the lift when you ride', flaw: 'One order in five, it announces the scenic route (a bark; the order is followed)',
    // On orders is any time it walks: it is a speed stat. The lift-seeking and the scenic-route bark are `junkplay.ts`.
    source: () => src('satnav', 'The Way-finder', [{ when: 'always', do: { do: 'stat', stat: 'speed', pct: 0.25 } }]),
  },
  speaker: {
    id: 'speaker', no: 'J7', item: 'Bluetooth speaker', reading: 'Heretic choir box', socket: 'back',
    effect: 'Taunts within 160 px every 6 s', flaw: 'The crew complain',
    // The complaint is `junkplay.ts` (the pulse's report names this source).
    source: () => src('speaker', 'Choir box', [{ when: 'tick', every: 6, cd: 0, do: { do: 'pulse', radius: 160, side: 'foe', then: { do: 'status', id: 'taunted' } } }]),
  },
  toothbrush: {
    id: 'toothbrush', no: 'J8', item: 'Electric toothbrush', reading: 'Vibro-lance', socket: 'arms',
    effect: '8 hits a second for 4 Impact, Corroded every fifth', flaw: '40 px reach',
    source: () => src('toothbrush', 'Vibro-lance', [{ when: 'hit', if: { is: 'via', via: 'vibro' }, every: 5, cd: 0, do: { do: 'status', id: 'corroded' } }]),
  },
  smokedetector: {
    id: 'smokedetector', no: 'J9', item: 'Smoke detector', reading: 'Watch-chirper', socket: 'head',
    effect: 'Chirps 0.4 s before a dash or charge at its crew; they sidestep at once', flaw: 'Chirps "low battery" for nothing',
    // The chirp is the tell the crew near it have already seen: they do not wait out their reaction (`junkplay.ts` `chirped`, `botai.ts`).
    source: () => src('smokedetector', 'Watch-chirper', []),
  },
  remote: {
    id: 'remote', no: 'J10', item: 'TV remote', reading: 'Sceptre of command', socket: 'head',
    effect: 'In your group, its arms tool fires where you aim', flaw: 'Your group only: sent off on its own, it fires as it likes',
    // Its target is where the Communicator aims, while it walks with him (`junkplay.ts` `remoteTarget`, `botai.ts`).
    source: () => src('remote', 'Sceptre of command', []),
  },
  powerbank: {
    id: 'powerbank', no: 'J11', item: 'Power bank', reading: 'Lightning jar', socket: 'back',
    effect: 'A charge per kill nearby; at 8, its next hit chains Shock through 5 for 30; Charged while full', flaw: 'Heresy barks',
    source: () => src('powerbank', 'Lightning jar', [
      { when: 'kill', who: 'any', near: 220, cd: 0, do: { do: 'status', id: 'charge', to: 'self' } },
      { when: 'hit', cd: 0, if: { is: 'status', id: 'charge', of: 'self', min: 8 }, do: [{ do: 'chain', jumps: 5, range: 130, then: { do: 'damage', type: 'shock', amount: 30 } }, { do: 'strip', id: 'charge', to: 'self' }] },
      { when: 'always', if: { is: 'status', id: 'charge', of: 'self', min: 8 }, do: { do: 'stat', stat: 'arcs', add: 1 } },
    ]),
  },
  quadcopter: {
    id: 'quadcopter', no: 'J12', item: 'Quadcopter', reading: 'Pet dragonfly', socket: 'back',
    effect: 'Fetches loot within 120 px', flaw: 'Shot down by the first shot or blast that hits its robot: gone that mission',
    // The first ranged hit on the wearer shoots it down (`junkplay.ts` `relicProc`).
    source: () => src('quadcopter', 'Pet dragonfly', [{ when: 'hurt', cd: Infinity, if: { is: 'via', via: ['gun', 'blast'] }, do: [] }]),
  },
  // The biome relics (D50): the effect alone; a flaw that would be a new rule is dropped, one that is a joke stays a bark (`junkplay.ts`).
  sprinkler: {
    id: 'sprinkler', no: 'J21', item: 'Garden sprinkler', reading: 'The Rain-maker', socket: 'back',
    effect: "Wets everything within 100 px every 5 s; a Shock build's best friend", flaw: 'Wets your crew too',
    source: () => src('sprinkler', 'The Rain-maker', [{ when: 'tick', every: 5, cd: 0, do: { do: 'pulse', radius: 100, side: 'any', self: true, then: { do: 'status', id: 'wet', to: 'target' } } }]),
  },
  zapper: {
    id: 'zapper', no: 'J23', item: 'Bug-zapper racket', reading: 'The Lightning Paddle', socket: 'arms',
    effect: 'Melee swat: 12 Shock; flyers take triple', flaw: 'Zaps the bot when Wet (5 a hit)',
    // The swat is `junkplay.ts` (via 'swat'); the flaw is an effect: a swat while its bearer is Wet shocks the bearer (2.5 doubled by Wet's Shock weakness: the doc's 5 a hit).
    source: () => src('zapper', 'The Lightning Paddle', [{ when: 'hit', cd: 0, if: [{ is: 'via', via: 'swat' }, { is: 'status', id: 'wet', of: 'self' }], do: { do: 'damage', type: 'shock', amount: 2.5, to: 'self' } }]),
  },
  tamagotchi: {
    id: 'tamagotchi', no: 'J24', item: 'Tamagotchi', reading: 'Egg of a Small Soul', socket: 'head',
    effect: 'Grows with the mission: +2.5% damage every 75 s, up to 20%', flaw: 'Beeps for its dinner (a bark only; nobody feeds it)',
    // Fed on its own (D50: no scrap is paid, it never sulks). A guess: eight steps of 2.5% instead of 2% a minute, so the cap is the doc's 20%, after ten minutes.
    source: () => src('tamagotchi', 'Egg of a Small Soul', [
      { when: 'tick', every: 75, cd: 0, do: { do: 'status', id: 'charge', to: 'self' } },
      { when: 'always', do: { do: 'stat', stat: 'damage', pct: 0.025, per: { status: 'charge', of: 'self' } } },
    ]),
  },
  trafficlight: {
    id: 'trafficlight', no: 'J26', item: 'Traffic light', reading: 'The Lantern of Three Commandments', socket: 'back',
    effect: 'Red 4 s: foes within 120 px Slowed; amber 4 s: nothing; green 4 s: crew within 120 px Haste', flaw: 'Shouts "red!" at every junction (a bark only)',
    // The cycle is `junkplay.ts`.
    source: () => src('trafficlight', 'The Lantern of Three Commandments', []),
  },
  selfiestick: {
    id: 'selfiestick', no: 'J28', item: 'Selfie stick', reading: 'The Staff of Vanity', socket: 'arms',
    effect: 'A long poke (90 px, 10 Impact) and a flash every 6 s that Blinds', flaw: 'The bot poses before each flash (0.4 s)',
    source: () => src('selfiestick', 'The Staff of Vanity', []),
  },
  beacon: {
    id: 'beacon', no: 'J30', item: 'Avalanche beacon', reading: 'The Heart-finder', socket: 'head',
    effect: 'Finds downed robots and buried caches within 20 tiles, through fog', flaw: 'Beeps constantly (a bark only)',
    source: () => src('beacon', 'The Heart-finder', []),
  },
  handwarmer: {
    id: 'handwarmer', no: 'J31', item: 'Hand warmer', reading: 'The Pocket Sun', socket: 'back',
    effect: 'Crew within 100 px never Chill; clears Frozen from them every 8 s', flaw: 'None worth the name (it never runs out)',
    source: () => src('handwarmer', 'The Pocket Sun', [
      { when: 'aura', r: 100, self: true, do: { do: 'stat', stat: 'immune:chilled', add: 1 } },
      { when: 'tick', every: 8, cd: 0, do: { do: 'pulse', radius: 100, side: 'ally', self: true, then: { do: 'strip', id: 'frozen', to: 'target' } } },
    ]),
  },
  thermos: {
    id: 'thermos', no: 'J33', item: 'Thermos', reading: 'The Eternal Kettle', socket: 'back',
    effect: '+30% steam regen for the crew within 120 px', flaw: 'None worth the name (it never spills)',
    source: () => src('thermos', 'The Eternal Kettle', [{ when: 'aura', r: 120, self: true, do: { do: 'stat', stat: 'steamRegen', pct: 0.3 } }]),
  },
  'queens-crown': {
    id: 'queens-crown', no: 'U', item: "The Queen's Crown", reading: 'Crown of the hive', socket: 'head', part: 'queens-crown',
    effect: 'Kills hatch a friendly brass hornet for 10 s', flaw: 'A boss\'s own: never sold',
    source: () => src('queens-crown', "The Queen's Crown", [{ when: 'kill', cd: 0.5, do: { do: 'spawn', what: 'brass', kind: 'hornet', ttl: 10 } }]),
  },
  'harbinger-heart': {
    id: 'harbinger-heart', no: 'U', item: "The Harbinger's Heart", reading: 'Reliquary of the red line', socket: 'back', part: 'harbinger-heart',
    effect: 'On down, rises once at half oil', flaw: 'A boss\'s own: never sold',
    source: () => src('harbinger-heart', "The Harbinger's Heart", [{ when: 'down', cd: Infinity, do: { do: 'heal', share: 0.5 } }]),
  },
};
for (const r of Object.values(RELICS)) validate(r.source());

/** The colony's name for a relic on a card: "Bread cannon" (what it was: "Toaster"). */
export const relicName = (id: string) => (isRelic(id) ? RELICS[id].reading : id);

/** The two unique relics, keyed by the part that is the relic. */
export const UNIQUE_RELICS: PartKind[] = ['queens-crown', 'harbinger-heart'];
export const isUnique = (id: string) => (UNIQUE_RELICS as string[]).includes(id);

/** The engine source a relic puts on its wearer, or none for an id this build does not know. */
export const relicSource = (id: string | undefined): Source | null => (isRelic(id) ? RELICS[id].source() : null);

/** What the junk rules use. `chance` a dead ruin gives junk; `strip` the carry strip; `sell` a scrap price at the Trader; `offer` the Oracle's scrap for a duplicate of a worn relic (a guess; Minos: no card from it). */
export const JUNK = { chance: 0.65, strip: 6, carrier: 2, sell: 6, offer: 8 };

/** What each kind of ruin may give (the reading fits the wreck it comes out of; each biome's ruins also give its own relics, D50). */
export const RUIN_JUNK: Record<RuinKind, RelicId[]> = {
  phone: ['smartphone', 'speaker', 'powerbank'], car: ['satnav', 'microwave', 'powerbank'], dish: ['speaker', 'smartphone', 'remote'], panel: ['fan', 'hairdryer', 'smokedetector'],
  carousel: ['toothbrush', 'toaster', 'zapper'], trailcam: ['smartphone', 'satnav', 'quadcopter', 'tamagotchi'], golfcart: ['satnav', 'fan', 'sprinkler'],
  cart: ['toaster', 'microwave'], trafficlight: ['satnav', 'speaker', 'smokedetector', 'trafficlight'], vending: ['toaster', 'microwave', 'hairdryer', 'remote', 'selfiestick'],
  snowmobile: ['hairdryer', 'fan', 'thermos'], gondola: ['speaker', 'toothbrush', 'quadcopter', 'handwarmer'], skis: ['toothbrush', 'fan', 'beacon'],
  dock: [], // pried for its contacts (P58 H), no relic
};

/** What a searched dead ruin gives: a relic by chance, or nothing (it still gives its scrap and find). */
export function ruinJunk(kind: RuinKind, r: Rng): RelicId | null {
  return RUIN_JUNK[kind].length && r.chance(JUNK.chance) ? r.pick(RUIN_JUNK[kind]) : null;
}

/** The carry strip's size: six, and `JUNK.carrier` more for each fielded gatherer with the Carrier spec. */
export const stripSize = (carriers = 0) => JUNK.strip + JUNK.carrier * Math.max(0, Math.floor(carriers));

/** Junk in the stock that a robot already wears one of: the duplicates the Oracle takes for scrap (`stock` index list). */
export function duplicates(stock: readonly string[], worn: readonly (string | undefined)[]): number[] {
  const on = new Set(worn.filter(Boolean));
  return stock.flatMap((id, i) => (on.has(id) ? [i] : []));
}

/** Junk ids the save may hold: unknown ones (a removed relic) are dropped. */
export const cleanJunk = (x: unknown): RelicId[] => (Array.isArray(x) ? x.filter((i): i is RelicId => isRelic(i) && !isUnique(i)) : []);
