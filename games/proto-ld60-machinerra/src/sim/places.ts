/**
 * Authored set pieces ("places") that `generate()` stamps into every land. A place is a level file,
 * `levels/places/<id>.json` in the editor's format (`harness/editor/README.md`): its entities are the parts (a kind, a
 * position in px from the centre, props such as `ruin`) and the shapes of its own ground (`blob`, `band`: `shapes.ts`);
 * its top-level keys are the placement rules and what finds it. They are read here (`PLACES`), rotated and mirrored per
 * land, and placed after the seeps and hives by distance band from the lift, with the same spacing, reachability and
 * carving checks as everything else, so every land hides them somewhere new. The danger around a place is generated
 * (hives, hornets); the places themselves are authored.
 *
 * The file's keys (tiles unless said; the entities are px, rotation degrees):
 *   name          shown on the first sight
 *   band          [near, far] distance of the centre from the lift. A land with no room widens the band (up to 1.8x) before the place is dropped
 *   clear         radius made walkable around the centre (and 1 or 2 around each part)
 *   apart         every part keeps this far from seeps, hives, ruins and other places
 *   noHive        no hive within this many tiles of any part (a resting spot)
 *   anchor        {"hive":[near, far]}: the centre sits that far from a hive chosen far from the lift
 *   bounded       with an anchor, the centre still keeps to `band` (the Core Vault: 30-60 tiles out, a hive within 10)
 *   awayFrom      {"places":[ids],"deg":n}: seen from the lift, the centre lies at least n degrees round from each of those
 *                 places already in the land, so list them first. The Trail and the Shrine keep 120 from the Core Vault (the
 *                 Vault's rule seen from the other side: it goes first, since one place placed last finds almost no room left
 *                 for 120 degrees from two). A land with no such spot gets the one that comes nearest: a place must exist
 *   outward       its ruin parts are numbered outward from the lift (the Parable Trail)
 *   tags          words a quest or system finds it by (`placesTagged`): "rest", "boss", "npc"...
 *   presence      when a land has it at all, all of: {"oneIn": 5} one land in five (a fixed roll per land), {"once": true}
 *                 not again once a run has had it, {"quest": "<step id>"} only while that quest step is active.
 *                 Omitted: every land that lists it. The quest and run checks are `presence` below, injected.
 *   entities      parts: {"id","type":<PartKind>,"x","y","props":{"ruin":...}}; ground: {"type":"blob"|"band", ... "props":{"ground","rx","ry"|"length","width","bend","rough","seed"}}
 *
 * This file is the data and the placement. What a place does while the mission runs is `placeplay.ts`; how it looks is
 * `src/places.ts` and `src/placeart.ts`; seeing one alone is the bench (`src/Place.ts`). Adding a place is a file here, a
 * behaviour there and a view (the `machinerra` skill).
 */
import type { Rng } from '../../../../harness/kit/rng';
import { PROPS, RUIN_FINDS, T, type PropKind } from './defs';
import type { RuinKind, Spot } from './mapgen';
import { SHAPE_TYPES, parseShape, rasterise, type Frame, type Ground, type Shape } from './shapes';
import { distOf } from './geom';

export const PLACE_IDS = [
  'shrine', 'pilgrim', 'graveyard', 'trail', 'mast', 'castle', 'dungeon', 'stage', 'plaza', 'lake', 'church', 'ghost', 'core-vault', 'wreck', 'sprocket', 'type-wreck',
  // P36 (places.md 2, 3, 4, 13, 14, 16, 25):
  'hornet-rest',
  'lanes',
  'expedition',
  'lighthouse',
  'bell',
  'battery',
  'scripture',
  // P42 (places.md 5 and 10, the cat's stray, the Little Compactor, the dog's mounds): only while a quest step wants them.
  'kennel',
  'stray',
  'mounds',
  'compactor',
  'cairn',
  // P31: the Frostspine's Hot Spring.
  'spring',
] as const;
export type PlaceId = (typeof PLACE_IDS)[number];
/** What stands in a place: the Sim makes each part kind into something (a hive, a ruin, loot...) and the view draws it. */
export const PART_KINDS = [
  'case', 'hive', 'pilgrim', 'wreck', 'grave', 'can', 'lamp', 'ruin', 'mast', 'keep', 'tower', 'pit', 'shaft', 'stage', 'tree', 'museum', 'fountain', 'statue', 'car', 'ice', 'rock', 'hangar', 'nave', 'candle', 'prison', 'vault',
  // P36: a destructible prop (`props.prop` names its `PropKind`), and the eight places' own things.
  'prop',
  'stump', 'wing', 'carcass',
  'pin', 'foul', 'board',
  'husk', 'fire',
  'lighthouse', 'buoy',
  'bell', 'pew', 'donation',
  'gun', 'depot',
  'sign', 'table', 'chair',
  // P42: the Kennel's doghouse and bowl, a dig mound, the stray cat, the Little Compactor and its cubes, the Farthest Cairn and its flag.
  'doghouse', 'bowl', 'mound', 'stray', 'compactor', 'cube', 'cairn', 'flag',
  // P31: the Hot Spring's pool.
  'pool',
] as const;
export type PartKind = (typeof PART_KINDS)[number];

export interface PartDef {
  kind: PartKind;
  /** Tiles from the centre, before the land's rotation. */
  dx: number;
  dy: number;
  /** A ruin part: what it is. */
  ruin?: RuinKind;
  /** A prop part: which prop (`PROPS`). */
  prop?: PropKind;
  /** Its id in the file. */
  id: string;
}
/** When a land has a place (all that are given must hold). */
export interface Presence {
  /** One land in this many has it (a roll per land that its seed fixes). */
  oneIn?: number;
  /** Not again once a run has had it. */
  once?: boolean;
  /** Only while this quest step is active. */
  quest?: string;
}
export interface PlaceDef {
  name: string;
  /** Distance of the centre from the lift, tiles. A land with no room widens the band (up to 1.8x) before the place is dropped. */
  band: [number, number];
  /** Radius, tiles, made walkable around the centre (and 1 or 2 around each part). */
  clear: number;
  /** Tiles every part keeps from seeps, hives, ruins and other places. */
  apart: number;
  /** No hive within this many tiles of any part (a resting spot). */
  noHive?: number;
  /** The centre sits this many tiles from a hive chosen far from the lift (at the rim of one), not anywhere. */
  anchor?: { hive: [number, number] };
  /** An anchored place's centre still keeps to `band`. */
  bounded?: boolean;
  /** At least `deg` degrees round the lift from each of these places, where the land has them. */
  awayFrom?: { places: PlaceId[]; deg: number };
  /** Ruin parts are numbered outward from the lift, so the last one is the farthest. */
  outward?: boolean;
  tags: string[];
  presence: Presence;
  parts: PartDef[];
  /** The place's own ground, painted after the land is made. */
  shapes: Shape[];
}

/** A place file as the editor saves it (`LevelData` plus the keys above). */
export interface PlaceFile {
  name?: string;
  band?: [number, number];
  clear?: number;
  apart?: number;
  noHive?: number;
  anchor?: { hive: [number, number] };
  bounded?: boolean;
  awayFrom?: { places: string[]; deg: number };
  outward?: boolean;
  tags?: string[];
  presence?: Presence;
  entities?: { id: string; type: string; x: number; y: number; rotation?: number; scale?: number; props?: Record<string, number | string | boolean> }[];
}

const isRange = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) && v[0] <= v[1];

/** A place from its file; throws, naming the file and the entity, for anything a place cannot be made of. */
export function parsePlace(id: string, f: PlaceFile): PlaceDef {
  const bad = (why: string): never => {
    throw new Error(`place ${id}: ${why}`);
  };
  if (typeof f.name !== 'string' || !f.name) bad('needs a "name"');
  if (!isRange(f.band)) bad('"band" must be [near, far] in tiles');
  for (const k of ['clear', 'apart'] as const) if (typeof f[k] !== 'number' || !(f[k]! >= 0)) bad(`"${k}" must be a number of tiles`);
  if (f.noHive !== undefined && typeof f.noHive !== 'number') bad('"noHive" must be a number of tiles');
  if (f.anchor && !isRange(f.anchor.hive)) bad('"anchor" must be {"hive":[near, far]}');
  for (const k of ['awayFrom'] as const) {
    const r = f[k];
    if (r && !(Array.isArray(r.places) && r.places.every((o) => (PLACE_IDS as readonly string[]).includes(o)) && r.deg >= 0 && r.deg <= 180)) bad(`"${k}" must be {"places":[place ids],"deg":0-180}`);
  }
  const pr = f.presence ?? {};
  if (pr.oneIn !== undefined && !(pr.oneIn >= 1)) bad('presence "oneIn" must be 1 or more');
  if (pr.quest !== undefined && typeof pr.quest !== 'string') bad('presence "quest" must be a step id');
  const parts: PartDef[] = [], shapes: Shape[] = [], seen = new Set<string>();
  for (const e of f.entities ?? []) {
    if (seen.has(e.id)) bad(`entity id "${e.id}" appears twice`);
    seen.add(e.id);
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) bad(`${e.id} needs x and y`);
    if ((SHAPE_TYPES as readonly string[]).includes(e.type)) shapes.push(parseShape(e, T));
    else if ((PART_KINDS as readonly string[]).includes(e.type)) {
      const ruin = e.props?.ruin as RuinKind | undefined;
      if (e.type === 'ruin' && !(ruin && ruin in RUIN_FINDS)) bad(`${e.id} is a ruin and needs props.ruin (${Object.keys(RUIN_FINDS).join(', ')})`);
      const prop = e.type === 'prop' ? (e.props?.prop as PropKind | undefined) : undefined;
      if (e.type === 'prop' && !(prop && prop in PROPS)) bad(`${e.id} is a prop and needs props.prop (${Object.keys(PROPS).join(', ')})`);
      parts.push({ id: e.id, kind: e.type as PartKind, dx: e.x / T, dy: e.y / T, ...(ruin && { ruin }), ...(prop && { prop }) });
    } else bad(`${e.id} has type "${e.type}": a part is one of ${PART_KINDS.join(', ')}, ground is ${SHAPE_TYPES.join(' or ')}`);
  }
  if (!parts.length) bad('has no parts');
  return {
    name: f.name!, band: f.band!, clear: f.clear!, apart: f.apart!,
    ...(f.noHive !== undefined && { noHive: f.noHive }), ...(f.anchor && { anchor: f.anchor }), ...(f.bounded && { bounded: true }),
    ...(f.awayFrom && { awayFrom: { places: f.awayFrom.places as PlaceId[], deg: f.awayFrom.deg } }), ...(f.outward && { outward: true }),
    tags: f.tags ?? [], presence: pr, parts, shapes,
  };
}

/** Every place file, by id. A new file needs its id in `PLACE_IDS` (and a behaviour and a view), and every id needs a file. */
const FILES = import.meta.glob('../../levels/places/*.json', { eager: true, import: 'default' }) as Record<string, PlaceFile>;
const RAW: Record<string, PlaceFile> = {};
export const PLACES = Object.fromEntries(
  PLACE_IDS.map((id) => {
    const file = FILES[`../../levels/places/${id}.json`];
    if (!file) throw new Error(`place ${id}: no file levels/places/${id}.json`);
    RAW[id] = file;
    return [id, parsePlace(id, file)];
  }),
) as Record<PlaceId, PlaceDef>;
/** A place's file as loaded, or as last saved from the bench (what the editor opens). */
export const placeFile = (id: PlaceId): PlaceFile => RAW[id];
for (const path of Object.keys(FILES)) {
  const id = path.split('/').pop()!.replace('.json', '');
  if (!(PLACE_IDS as readonly string[]).includes(id)) throw new Error(`${path}: "${id}" is not in PLACE_IDS (sim/places.ts)`);
}

/** Dev (the bench after an F2 save): replace a place with its file as just saved, so the next land or bench draw uses it. */
export function reloadPlace(id: PlaceId, file: PlaceFile) {
  (PLACES as Record<PlaceId, PlaceDef>)[id] = parsePlace(id, file);
  RAW[id] = file;
}

/** The places carrying a tag (how a quest or system finds the place it wants). */
export const placesTagged = (tag: string) => PLACE_IDS.filter((id) => PLACES[id].tags.includes(tag));

/** Placement order: the scarcest constraints first (a biome lists its own, `BIOMES[...].places`). */
export const PLACE_ORDER: PlaceId[] = ['pilgrim', 'shrine', 'trail', 'mast', 'graveyard'];

/**
 * The checks behind `presence`, injected because the things they ask about (quests, the run) are not part of a land.
 * The defaults say no quest step is active and no place has been had: a place with a quest rule is then never in a land
 * until the quest system calls `presence.set`. `generate()` also takes one for a single call.
 */
export interface PresenceChecks {
  questActive(step: string): boolean;
  /** This run has already had the place (a `once` place is then left out). */
  had(id: PlaceId): boolean;
}
export const presence = {
  checks: { questActive: () => false, had: () => false } as PresenceChecks,
  set(c: Partial<PresenceChecks>) {
    presence.checks = { ...presence.checks, ...c };
  },
};
/** Dev: places added to every land generated from now on, whatever the biome lists or the presence rule says (`placeland`). */
export const forced = new Set<PlaceId>();

/** Does this land have the place? `r` is the land's places stream: the roll is a fork of it, so asking moves nothing. */
export function isPresent(id: PlaceId, r: Rng, checks: PresenceChecks = presence.checks) {
  if (forced.has(id)) return true;
  const p = PLACES[id].presence;
  if (p.quest && !checks.questActive(p.quest)) return false;
  if (p.once && checks.had(id)) return false;
  if (p.oneIn && p.oneIn > 1 && !r.fork(`present/${id}`).chance(1 / p.oneIn)) return false;
  return true;
}

export interface PlacedPart {
  kind: PartKind;
  x: number;
  y: number;
  ruin?: RuinKind;
  prop?: PropKind;
  /** Ruin parts of an `outward` place: 0 is the nearest the lift. */
  step?: number;
}
/** A place in a land: tile coordinates (px = (tile + 0.5) * T, like every Spot). */
export interface PlacedPlace {
  id: PlaceId;
  x: number;
  y: number;
  parts: PlacedPart[];
  /** Index into the land's hives, for an anchored place. */
  anchor?: number;
}

/** What the land has when places go in. `clear` carves rock to sand around a spot. */
export interface PlaceCtx {
  w: number;
  h: number;
  lift: Spot;
  seeps: Spot[];
  nests: Spot[];
  /** Everything else already standing (ruins). */
  others: Spot[];
  clear(c: Spot, rad: number): void;
  r: Rng;
  /** Which places, in placement order (the biome's). */
  order?: PlaceId[];
  /** Paints a tile of a place's own ground (shapes); the caller keeps the border and whatever else it protects. */
  paint?(x: number, y: number, ground: Ground): void;
  /** The checks behind each place's `presence` (default: `presence.checks`). */
  present?: PresenceChecks;
}

const TAU = Math.PI * 2;

/** The parts of a place with its centre, turned by `rot` (radians) and mirrored (`mir` -1 flips x): where each stands. */
export function turnParts(def: PlaceDef, centre: Spot, rot: number, mir: 1 | -1): PlacedPart[] {
  return def.parts.map((q) => {
    const x = q.dx * mir, y = q.dy;
    return { kind: q.kind, ...(q.ruin && { ruin: q.ruin }), ...(q.prop && { prop: q.prop }), x: centre.x + x * Math.cos(rot) - y * Math.sin(rot), y: centre.y + x * Math.sin(rot) + y * Math.cos(rot) };
  });
}

/**
 * Put every place into the land, clearing rock around each; one that finds no room, or that its `presence` leaves out of
 * this land, is left out. Then each place's own ground is painted (`ctx.paint`), never under a part.
 */
export function placePlaces(ctx: PlaceCtx): PlacedPlace[] {
  const placed: PlacedPlace[] = [];
  const frames: Frame[] = [];
  const order = ctx.order ?? PLACE_ORDER;
  for (const id of [...order, ...[...forced].filter((f) => !order.includes(f))]) {
    if (!isPresent(id, ctx.r, ctx.present)) continue;
    const found = findSpot(id, PLACES[id], ctx, placed);
    if (!found) continue;
    const p = found.place;
    ctx.clear(p, PLACES[id].clear);
    for (const part of p.parts) ctx.clear({ x: Math.round(part.x), y: Math.round(part.y) }, part.kind === 'ruin' ? 2 : 1);
    placed.push(p);
    frames.push(found.frame);
  }
  const paint = ctx.paint;
  if (paint) placed.forEach((p, i) => paintGround(p, frames[i], ctx.w, ctx.h, paint));
  return placed;
}

/** Paint a placed place's own ground (its shapes) with the land's `paint`, turned and mirrored like its parts; rock never goes under a part, so the way to it stays open. */
export function paintGround(p: PlacedPlace, frame: Frame, w: number, h: number, paint: (x: number, y: number, ground: Ground) => void) {
  const shapes = PLACES[p.id].shapes;
  if (!shapes.length) return;
  rasterise(shapes, frame, w, h, (x, y, g) => {
    if (g !== 'rock' || !p.parts.some((q) => distOf(q, { x, y }) < 1.6)) paint(x, y, g);
  });
}

/** An `outward` place's ruin parts, numbered by their tile's distance from the lift (0 the nearest), each given the template's kind in order. */
export function numberOutward(def: PlaceDef, parts: PlacedPart[], lift: Spot) {
  const kinds = def.parts.filter((q) => q.kind === 'ruin').map((q) => q.ruin);
  const lt = (q: Spot) => distOf({ x: Math.round(q.x), y: Math.round(q.y) }, lift); // the tile it will be on
  parts.filter((q) => q.kind === 'ruin').sort((a, b) => lt(a) - lt(b)).forEach((q, i) => ((q.step = i), (q.ruin = kinds[i])));
}

/** Seen from the lift, the smallest angle (degrees) between the centre and any of those places already put in the land (360 when none is). */
function gapTo(rule: NonNullable<PlaceDef['awayFrom']>, centre: Spot, lift: Spot, placed: PlacedPlace[]) {
  const a = Math.atan2(centre.y - lift.y, centre.x - lift.x);
  return Math.min(360, ...placed.filter((o) => rule.places.includes(o.id)).map((o) => angleBetween(a, Math.atan2(o.y - lift.y, o.x - lift.x))));
}
/** The angle between two bearings, degrees, 0..180. */
export const angleBetween = (a: number, b: number) => {
  const d = Math.abs(((a - b) * 180) / Math.PI) % 360;
  return d > 180 ? 360 - d : d;
};

function findSpot(id: PlaceId, def: PlaceDef, ctx: PlaceCtx, placed: PlacedPlace[]): { place: PlacedPlace; frame: Frame } | null {
  const { w, h, lift, r } = ctx;
  const stuff: { at: Spot; nest: boolean; index: number }[] = [
    ...ctx.seeps.map((at) => ({ at, nest: false, index: -1 })),
    ...ctx.nests.map((at, index) => ({ at, nest: true, index })),
    ...ctx.others.map((at) => ({ at, nest: false, index: -1 })),
    ...placed.flatMap((pl) => pl.parts.map((at) => ({ at, nest: at.kind === 'hive', index: -1 }))),
  ];
  const hives = ctx.nests.map((n, i) => ({ n, i }));
  // With an `awayFrom` rule, the first spot that keeps the angle wins; when the land has none, the one that came nearest.
  let best: { place: PlacedPlace; frame: Frame; gap: number } | null = null;
  for (const k of [1, 1.35, 1.8]) {
    const band: [number, number] = [def.band[0] / k, def.band[1] * k];
    for (let tries = 0; tries < 1200; tries++) {
      let centre: Spot;
      let anchor: number | undefined;
      const far = def.anchor ? hives.filter(({ n }) => distOf(n, lift) >= band[0] && (!def.bounded || distOf(n, lift) <= band[1] + def.anchor!.hive[1])) : [];
      if (def.anchor && (far.length || !def.bounded)) {
        // At the rim of a far hive (the farthest when none is far enough). A bounded place with no hive in its band stands in the band without one.
        const pool = far.length ? far : [...hives].sort((a, b) => distOf(b.n, lift) - distOf(a.n, lift)).slice(0, 1);
        if (!pool.length) return null;
        const { n, i } = r.pick(pool);
        const a = r.range(0, TAU), d = r.range(...def.anchor.hive);
        centre = { x: Math.round(n.x + Math.cos(a) * d), y: Math.round(n.y + Math.sin(a) * d) };
        anchor = i;
      } else centre = { x: r.int(5, w - 6), y: r.int(5, h - 6) };
      const dl = distOf(centre, lift);
      if ((!def.anchor || def.bounded) && (dl < band[0] || dl > band[1])) continue;
      // The template, turned and maybe mirrored.
      const rot = r.range(0, TAU), mir: 1 | -1 = r.chance(0.5) ? -1 : 1;
      const parts = turnParts(def, centre, rot, mir);
      if (parts.some((q) => q.x < 4 || q.y < 4 || q.x > w - 5 || q.y > h - 5 || distOf(q, lift) < 8)) continue;
      const crowded = parts.some((q) =>
        stuff.some((o) => {
          if (o.index === anchor) return false; // its own hive
          const d = distOf(q, o.at);
          return d < def.apart || (o.nest && def.noHive !== undefined && d < def.noHive / k);
        }),
      );
      if (crowded) continue;
      if (def.outward) numberOutward(def, parts, lift);
      const found = { place: { id, x: centre.x, y: centre.y, parts, ...(anchor !== undefined && { anchor }) }, frame: { x: centre.x, y: centre.y, rot, mir } };
      const gap = def.awayFrom ? gapTo(def.awayFrom, centre, lift, placed) : 360;
      if (gap >= (def.awayFrom?.deg ?? 0)) return found;
      if (!best || gap > best.gap) best = { ...found, gap };
    }
  }
  return best;
}
