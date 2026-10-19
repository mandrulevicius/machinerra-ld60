/**
 * Ruins: kinds and what each gives, the decode, the Parable Trail's verses.
 * Add a kind: a `RuinKind` and its `RUIN_FINDS` entry.
 */
import type { LootKind } from './loot';

/**
 * Old-tech ruins can be searched once (hold Use beside one): a small find and a line about the old world, in the
 * colony's voice. A delight, not a duty.
 */
export const RUIN = { reach: 70, search: 1 };

/**
 * A live ruin is decoded (P30, D9 row 1): a long, loud hold of `time` seconds. It wakes the nearest sleeping hive (never in the
 * morning, which is quiet, as siphoning) and, every `ping` seconds, calls every foe within `pullTiles` tiles to the Communicator for `pullFor` seconds
 * (`Hornet.alertT`, the whistle's way: they hunt farther). A hit on the Communicator breaks the hold. Done, it pays insight.
 */
export const DECODE = {
  time: 6, ping: 2, pullTiles: 16, pullFor: 6,
  lines: [
    'Decoded: three hundred years of unread notifications, and one actual fact. The colony files it under Research.',
    'The old machine confesses. Mostly to being a machine. Somewhere in it, a rule worth slotting.',
    'It hums its last secret into your satchel. The Oracle will want it described, slowly.',
  ],
};

/** Every kind of ruin: the desert's four (and the Parable Trail's), then each biome's own (`BIOMES[...].ruins`, art in `ruinart.ts`). */
export type RuinKind = 'car' | 'phone' | 'dish' | 'panel' | 'carousel' | 'trailcam' | 'golfcart' | 'cart' | 'trafficlight' | 'vending' | 'snowmobile' | 'gondola' | 'skis' | 'dock';

/**
 * P58 H, the old charging docks: one in a land now and then (`DOCK.oneIn`) while the Princess's ladder wants one there (`mapgen.ts`,
 * `hub/questplaces.ts`), a small ruin with a lit lamp, never part of a biome's own list. Hold E `DOCK.pry` s to pry its contacts loose
 * (`pry` in `RUIN_FINDS`; a gatherer will not, and its walls falling never lose it); `stats.docks` counts the mission home and her ladder takes it.
 * `regen` is the title Keeper of Docks: oil a second for a robot standing on the lift. Numbers are guesses.
 */
export const DOCK = { pry: 3, oneIn: 3, regen: 1 };
/** Dev (`?t.docks=1`, the Play scene sets it): every land generated has a dock, whatever the ladder wants. */
export const dockDev = { force: false };

/** `live`: still lit and humming (a glowing screen, a turning dish): decoded for insight, loudly (`DECODE`), not searched for junk. The rest are dead: searched quietly for scrap and junk. `pry`: opened by a longer hold, for its contacts (`DOCK`). */
export const RUIN_FINDS: Record<RuinKind, { loot: LootKind | null; lines: string[]; live?: boolean; pry?: boolean }> = {
  phone: {
    live: true,
    loot: null,
    lines: [
      'A smartphone the size of a door. Battery at 1%. It has been at 1% for three hundred years.',
      'A giant phone with 9,000 unread notifications. The colony considers reading them a mortal sin.',
    ],
  },
  car: {
    loot: null,
    lines: [
      'A car that drove itself. Into a wall. The colony calls it the Parable of the Cruise Control.',
      'An electric car. Its tank is empty because it never had one. Heretics.',
    ],
  },
  dish: {
    live: true,
    loot: null,
    lines: [
      'A satellite dish, still listening for a signal. Someone should tell it.',
      'A dish that once streamed nine hundred channels. Nothing was on.',
    ],
  },
  panel: {
    loot: null,
    lines: [
      'Solar panels. Free power from the sun, they said. The sun has not commented.',
      'A solar array, cracked. The Old Way teaches: never trust power you cannot shovel.',
    ],
  },
  // The Rustwood Jungle: a theme park the vines took.
  carousel: {
    loot: 'part',
    lines: [
      'A carousel horse, still smiling. It went round in circles for joy. The colony suspects a cult.',
      'A painted horse on a brass pole. The only honest brass in the whole jungle.',
    ],
  },
  trailcam: {
    live: true,
    loot: null,
    lines: [
      'A camera strapped to a tree. Ten thousand photographs of squirrels. Not one of them consented.',
      'A trail camera, its last picture a gorilla, very close, very interested.',
    ],
  },
  golfcart: {
    loot: null,
    lines: [
      'A golf cart. The old world drove to a field to hit a small ball with a stick, then drove back. Daily.',
      'A little white car with a roof and no doors. For when you are rich, but only slightly in a hurry.',
    ],
  },
  // The Hollow City.
  cart: {
    loot: null,
    lines: [
      'A shopping cart, one wheel pulling left. Forever left. Some things outlive their makers.',
      'A wire chariot of plenty. The colony would kill for one. The colony has killed for one.',
    ],
  },
  trafficlight: {
    live: true,
    loot: null,
    lines: [
      'A traffic light, still red. The androids here are still waiting for it to change.',
      'Three commandments in coloured glass: stop, hesitate, go. The old world followed them to the letter.',
    ],
  },
  vending: {
    live: true,
    loot: 'part',
    lines: [
      'A vending machine: it took coins and gave sugar water, and called it a fair trade. Three cans left, all warm.',
      "The machine says 'Exact change only'. Nobody has had exact change for four hundred years.",
    ],
  },
  // The Frostspine: the cold kept everything.
  snowmobile: {
    loot: null,
    lines: [
      'A sled that needed no dogs, and so had no friends. The tank still sloshes.',
      'A snowmobile, keys in it. The cold kept it fresh. It kept its rider fresh too, somewhere under the drift.',
    ],
  },
  gondola: {
    live: true,
    loot: null,
    lines: [
      'A cable car, fallen from the lift line. A sign inside: "Max 8 persons." Today, one goat, and it will not leave.',
      'A red box that rode a wire up the mountain. The colony rides a lift down from the sky. Progress.',
    ],
  },
  skis: {
    loot: 'part',
    lines: [
      'Two planks for falling down a mountain on purpose. The old world paid for this.',
      'Skis and poles, planted upright. Someone meant to come back for them.',
    ],
  },
  // An old charging dock (P58 H): pried by hand, for the Princess.
  dock: {
    pry: true,
    loot: null,
    lines: [
      'An old charging dock, one green lamp still lit. The contacts come away with a snap. Somewhere a vacuum cleaner is going to be unbearable about this.',
      'A dock for something that came home every night. You pry the contacts loose. Dot will want to see them.',
    ],
  },
};

/**
 * The Parable Trail's three verses (`places.ts`: three ruins, outward from the lift). The first ruin searched tells verse
 * one, the second verse two, the third the last, whichever stands where: each line is the ruin's own sentence (by kind)
 * and the verse, so it reads right at any of them. The last is a bigger find (`bonus` drops beside it) and the Oracle's word.
 */
export const TRAIL: { verse: string; bonus?: LootKind[]; oracle?: string }[] = [
  { verse: 'Verse one of the Parable of the Cruise Control: the Driver slept; the car did not. Tyre tracks lead on.' },
  { verse: "Verse two: the Driver woke and asked the way. 'Continue straight for four hundred years,' said the map." },
  {
    verse: "The last light on it reads 'You have arrived.' Verse three, and the most heretical sentence ever written.",
    bonus: ['oil', 'copper', 'copper', 'copper', 'part'],
    oracle: 'You followed the Parable to its last verse. Congratulations: you are now the only one who has. The Driver kept good oil, at least: one can, the only one on the whole trail.',
  },
];

/** The Parable Trail's ruins are always the desert's kinds (`places.ts`). */
type TrailKind = 'car' | 'phone' | 'dish' | 'panel';

const TRAIL_SEEN: Record<TrailKind, string> = {
  phone: "A door-sized phone, face down, still on 'Recalculating...'.",
  dish: 'A dish, pointed at a sky that left.',
  car: 'A car, nose-deep in the ground, wipers still going.',
  panel: 'A solar panel, tilted at the last of the sun.',
};

const TRAIL_END: Record<TrailKind, string> = {
  phone: "The Cruise Control's phone, one bar left, battery red.",
  dish: "The Cruise Control's dish, bent to catch its last signal.",
  car: 'The Cruise Control itself, nose-deep in the ground, wipers still going.',
  panel: "The Cruise Control's panel, cracked, still charging.",
};

/** What a ruin of this kind says when it is searched as verse `v` of the trail. */
export const trailLine = (v: number, kind: RuinKind) => `${(v === TRAIL.length - 1 ? TRAIL_END : TRAIL_SEEN)[kind as TrailKind] ?? ''} ${TRAIL[v].verse}`;
