/**
 * What every thing on the land is to the player, in four classes (P47 part A, `vision.md` Design principles): `scenery`
 * (smashing gives nothing), `loot` (smashing drops something), `interact` (an E action, and not a location's heart),
 * `centre` (a location's heart; one with an E action too is `centre`: the heart wins). Plain TS; the class overlay
 * (`classview.ts`) and anything else that asks "what is this to the player" read `classOf`.
 *
 * Derived from what the code does, not from names: a prop kind says its own (`PROPS[kind].cls`, `defs/props.ts`); a ruin's
 * find is the heart of its ruin (`CLASS_RUIN`); a hive, the tap and a place's heart are centres.
 * A coal seam (hold E to mine) and the lift (E twice to ride it) are the plain interactables today.
 * A place part is a centre when it is its place's heart (`HEART`), loot when it is a can lying there, else scenery.
 * Add a prop kind: its `cls` in `PROPS` (the type forces it). A ruin kind: a `CLASS_RUIN` row. A place: its `HEART` row.
 * A place part kind with no `HEART` entry is scenery. Tests: `classes.test.ts`.
 */
import { PROPS, T, type PropKind, type RuinKind, type ThingClass } from './defs';
import type { PartKind, PlaceId } from './places';
import type { Sim } from './sim';

export type { ThingClass };
export const THING_CLASSES: readonly ThingClass[] = ['scenery', 'loot', 'interact', 'centre'];

/** A ruin's find, by kind. Every one is searched or decoded with a hold of E, and every one is the heart of its ruin: centre. */
export const CLASS_RUIN: Record<RuinKind, ThingClass> = {
  car: 'centre', phone: 'centre', dish: 'centre', panel: 'centre', carousel: 'centre', trailcam: 'centre', golfcart: 'centre',
  cart: 'centre', trafficlight: 'centre', vending: 'centre', snowmobile: 'centre', gondola: 'centre', skis: 'centre', dock: 'centre',
};

/** The part kinds that are each place's heart (a guess for the places with no E action: the graveyard's graves). The rest is scenery. */
export const HEART: Record<PlaceId, readonly PartKind[]> = {
  shrine: ['case', 'hive'],
  pilgrim: ['pilgrim'],
  graveyard: ['grave'],
  trail: ['ruin'],
  mast: ['mast'],
  castle: ['keep', 'pit'],
  dungeon: ['shaft'],
  stage: ['stage'],
  plaza: ['museum'],
  lake: ['hangar'],
  church: ['nave'],
  ghost: ['prison'],
  'core-vault': ['vault'],
  wreck: ['wreck'],
  'type-wreck': ['wreck'],
  sprocket: ['pilgrim'],
  // P36's places (the heart is what the place is about; the lanes' heart is the board, its pins are foes).
  battery: ['gun'],
  bell: ['bell'],
  expedition: ['husk', 'hive'],
  'hornet-rest': ['stump'],
  lanes: ['board'],
  lighthouse: ['lighthouse'],
  scripture: ['sign'],
  // P42's quest-only places: the doghouse and its mound, the stray, the dig mounds, the compactor, the cairn.
  kennel: ['doghouse', 'mound'],
  stray: ['stray'],
  mounds: ['mound'],
  compactor: ['compactor'],
  cairn: ['cairn'],
  // P31: the Hot Spring's pool.
  spring: ['pool'],
};

/** What a place's part is: its heart, a can lying there (oil or scrap to pick up), else scenery. */
export function classOfPart(place: PlaceId, kind: PartKind): ThingClass {
  if (HEART[place].includes(kind)) return 'centre';
  return kind === 'can' ? 'loot' : 'scenery';
}

/** Anything the player reads on the land. */
export type Thing =
  | { what: 'prop'; kind: PropKind }
  | { what: 'ruin'; kind: RuinKind }
  | { what: 'lift' }
  | { what: 'hive' }
  | { what: 'tap' }
  | { what: 'seam' }
  | { what: 'part'; place: PlaceId; kind: PartKind };

/** The one answer to "what is this to the player". */
export function classOf(t: Thing): ThingClass {
  switch (t.what) {
    case 'prop': return PROPS[t.kind].cls;
    case 'ruin': return CLASS_RUIN[t.kind];
    case 'lift': return 'interact';
    case 'hive': return 'centre';
    case 'tap': return 'centre';
    case 'seam': return 'interact';
    case 'part': return classOfPart(t.place, t.kind);
  }
}

/** A classed thing placed on the land, for the overlay: its ground point (px), its half size (px) and its class. */
export interface Classed {
  cls: ThingClass;
  what: string;
  x: number;
  y: number;
  /** Half the side of its footprint, px (a guess from the thing's size; the overlay never draws one under a few screen px). */
  r: number;
}

/** Half footprint of a place part by kind: a heart is big, the rest small (guesses). */
const PART_R = { heart: 1.1 * T, other: 0.5 * T, can: 0.3 * T };
const partR = (cls: ThingClass) => (cls === 'centre' ? PART_R.heart : cls === 'loot' ? PART_R.can : PART_R.other);

/** A place's parts as classed things (px positions); the bench and the mission both use this. */
export function classedParts(place: PlaceId, parts: readonly { kind: PartKind; x: number; y: number }[], skip: ReadonlySet<PartKind> = new Set()): Classed[] {
  const out: Classed[] = [];
  for (const q of parts) {
    if (skip.has(q.kind)) continue;
    const cls = classOfPart(place, q.kind);
    const r = partR(cls);
    // A part's point is its foot: the patch sits up over the picture.
    out.push({ cls, what: `${place}:${q.kind}`, x: q.x, y: q.y - r * 0.5, r });
  }
  return out;
}

/** Parts the mission already has as sim things (hives, a place's ruins), so they are not counted twice. */
const IN_SIM: ReadonlySet<PartKind> = new Set<PartKind>(['hive', 'pit', 'ruin']);

/** Everything on the land that has a class, standing now (rubble, dead hives, a mined-out seam are gone). */
export function classedThings(sim: Sim): Classed[] {
  const out: Classed[] = [];
  for (const p of sim.props.list) if (!p.broken) out.push({ cls: classOf({ what: 'prop', kind: p.kind }), what: p.kind, x: p.x, y: p.y, r: p.r * 1.15 });
  for (const r of sim.ruins) out.push({ cls: classOf({ what: 'ruin', kind: r.kind }), what: `ruin:${r.kind}`, x: r.x, y: r.y, r: 0.9 * T });
  out.push({ cls: classOf({ what: 'lift' }), what: 'lift', x: sim.lift.x, y: sim.lift.y, r: 1.3 * T });
  for (const n of sim.nests) if (!n.dead) out.push({ cls: classOf({ what: 'hive' }), what: 'hive', x: n.x, y: n.y, r: 0.9 * T * n.scale });
  for (const s of sim.seeps) out.push({ cls: classOf({ what: 'tap' }), what: 'tap', x: s.x, y: s.y, r: 0.7 * T });
  for (const s of sim.seams) if (s.amount > 0) out.push({ cls: classOf({ what: 'seam' }), what: 'seam', x: s.x, y: s.y, r: 0.45 * T });
  for (const pl of sim.places) out.push(...classedParts(pl.id, pl.parts, IN_SIM));
  return out;
}
