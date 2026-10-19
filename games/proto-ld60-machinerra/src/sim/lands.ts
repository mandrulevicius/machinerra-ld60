/**
 * Handcrafted lands: a whole land as a level file, `levels/lands/<id>.json` in the editor's format
 * (`harness/editor/README.md`), loaded to the same `MapData` that `generate()` makes. Where a place is a set piece stamped into
 * a generated land, a land file is the land: terrain shapes (`shapes.ts`, the same `blob` and `band`) and spots, all in px
 * from the land's top-left corner (a spot on tile (x, y) is at px ((x + 0.5) * T), so `floor(px / T)` is its tile).
 *
 * The file's keys:
 *   name       shown on the bench
 *   biome      a `BIOMES` id (its look, foes and hives' look; the land's own shapes decide the ground)
 *   size       [w, h] tiles
 *   ground     the ground everywhere before the shapes go down: sand (default), dune, hardpan, rock. The outer rim is always rock
 *   rows, cell an ASCII map painted before the shapes: `cell` tiles (default 1) per character, `rows` as many strings as size / cell tall.
 *              `#` rock, `~` dune, `,` hardpan; anything else is the land's `ground` (spot letters can stay in the drawing)
 *   anomaly    an `ANOMALIES` id the land always has (a level fixes its day: level 1's Hurried Sun)
 *   morningSwarm  the hives' morning trickle (P46's tune); 0 keeps the morning quiet
 *   duskBoss   false: this land has no dusk boss, and `lastNest` (every hive down brings it early) does not fire
 *   guided     true: a rescue cannot be missed (a freed one rides up even if left behind), as level 1's Sprocket
 *   entities   in this order, later shapes paint over earlier ones:
 *     blob, band            ground shapes (props: ground, rx / ry or length / width / bend, rough, seed; rotation turns them)
 *     lift                  exactly one: where the lift stands (a rock tile there is a problem, not carved)
 *     seep                  an oil seep (props.amount, default the middle of SEEPS.amount); the first one is the calm first stop
 *     hive                  a hive
 *     ruin                  old tech to search (props.ruin: a RuinKind; props.junk: the relic it always gives)
 *     place                 a place from `levels/places/` stamped there (props.place: its id, props.mir: -1 to mirror; the entity's
 *                           rotation turns it): its parts, its own ground, rock cleared round it (`clear`) as in a generated land;
 *                           props.clear overrides the radius (0: carve nothing, the author shaped the ground)
 *
 * Nothing is carved or moved to make a spot reachable: the author shapes the ground, and `landProblems` names what is wrong
 * (a spot on rock, one the lift cannot walk to). Tests and the bench read it. What a land is used for (a level, a quest area)
 * is the caller's: `loadLand(id)` gives the map.
 */
import { ANOMALIES, BIOMES, RUIN_FINDS, SEEPS, T, type AnomalyId, type BiomeId } from './defs';
import { GROUND_TER, Ter, clearRock, flood, passable, type LandRules, type MapData, type RuinKind, type Spot } from './mapgen';
import { PLACES, PLACE_IDS, numberOutward, paintGround, turnParts, type PlaceId, type PlacedPlace } from './places';
import { GROUNDS, SHAPE_TYPES, parseShape, rasterise, type Ground, type Shape } from './shapes';

export interface LandFile {
  name?: string;
  biome?: string;
  size?: [number, number];
  ground?: string;
  rows?: string[];
  cell?: number;
  anomaly?: string;
  morningSwarm?: number;
  duskBoss?: boolean;
  guided?: boolean;
  entities?: { id: string; type: string; x: number; y: number; rotation?: number; scale?: number; props?: Record<string, number | string | boolean> }[];
}
export interface LandDef {
  id: string;
  name: string;
  biome: BiomeId;
  w: number;
  h: number;
  ground: Ground;
  rows?: { cell: number; rows: string[] };
  rules: LandRules;
  shapes: Shape[];
  lift: Spot;
  seeps: (Spot & { amount: number })[];
  nests: Spot[];
  ruins: (Spot & { kind: RuinKind; junk?: string })[];
  /** Place centres in tiles, turned by `rot` radians and mirrored by `mir`. */
  places: { id: PlaceId; x: number; y: number; rot: number; mir: 1 | -1; clear?: number }[];
}

/** The entity types a land file holds besides shapes. */
export const SPOT_TYPES = ['lift', 'seep', 'hive', 'ruin', 'place'] as const;

/** A land from its file; throws, naming the file and the entity, for anything a land cannot be made of. */
export function parseLand(id: string, f: LandFile): LandDef {
  const bad = (why: string): never => {
    throw new Error(`land ${id}: ${why}`);
  };
  if (typeof f.name !== 'string' || !f.name) bad('needs a "name"');
  if (!f.biome || !(f.biome in BIOMES)) bad(`"biome" must be one of ${Object.keys(BIOMES).join(', ')}`);
  const size = f.size;
  if (!(Array.isArray(size) && size.length === 2 && size.every((n) => Number.isInteger(n) && n >= 12 && n <= 400))) bad('"size" must be [w, h] tiles, 12 to 400 each');
  const ground = (f.ground ?? 'sand') as Ground;
  if (!GROUNDS.includes(ground)) bad(`"ground" must be one of ${GROUNDS.join(', ')}`);
  const [w, h] = size as [number, number];
  if (f.anomaly !== undefined && !(f.anomaly in ANOMALIES)) bad(`"anomaly" must be one of ${Object.keys(ANOMALIES).join(', ')}`);
  const cell = f.cell ?? 1;
  if (!Number.isInteger(cell) || cell < 1) bad('"cell" must be a whole number of tiles');
  if (f.rows && !(f.rows.length * cell === h && f.rows.every((r) => typeof r === 'string' && r.length * cell === w))) bad(`"rows" must be ${h / cell} strings of ${w / cell} characters (size / cell)`);
  const rules: LandRules = { id, ...(f.anomaly && { anomaly: f.anomaly as AnomalyId }), ...(f.morningSwarm !== undefined && { morningSwarm: f.morningSwarm }), ...(f.duskBoss === false && { duskBoss: false }), ...(f.guided && { guided: true }) };
  const def: LandDef = { id, name: f.name!, biome: f.biome as BiomeId, w, h, ground, ...(f.rows && { rows: { cell, rows: f.rows } }), rules, shapes: [], lift: { x: -1, y: -1 }, seeps: [], nests: [], ruins: [], places: [] };
  const seen = new Set<string>();
  let lifts = 0;
  for (const e of f.entities ?? []) {
    if (seen.has(e.id)) bad(`entity id "${e.id}" appears twice`);
    seen.add(e.id);
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y)) bad(`${e.id} needs x and y`);
    const at = { x: Math.floor(e.x / T), y: Math.floor(e.y / T) };
    if ((SHAPE_TYPES as readonly string[]).includes(e.type)) {
      def.shapes.push(parseShape(e, T));
      continue;
    }
    if (!(SPOT_TYPES as readonly string[]).includes(e.type)) bad(`${e.id} has type "${e.type}": a land holds ${[...SHAPE_TYPES, ...SPOT_TYPES].join(', ')}`);
    if (at.x < 1 || at.y < 1 || at.x > w - 2 || at.y > h - 2) bad(`${e.id} (${e.type}) is at tile ${at.x},${at.y}, outside the ${w} x ${h} land's rim`);
    const p = e.props ?? {};
    if (e.type === 'lift') (lifts++, (def.lift = at));
    else if (e.type === 'seep') def.seeps.push({ ...at, amount: typeof p.amount === 'number' ? p.amount : Math.round((SEEPS.amount[0] + SEEPS.amount[1]) / 2) });
    else if (e.type === 'hive') def.nests.push(at);
    else if (e.type === 'ruin') {
      const kind = p.ruin as RuinKind;
      if (!(kind in RUIN_FINDS)) bad(`${e.id} is a ruin and needs props.ruin (${Object.keys(RUIN_FINDS).join(', ')})`);
      def.ruins.push({ ...at, kind, ...(typeof p.junk === 'string' && { junk: p.junk }) });
    } else {
      const pid = p.place as PlaceId;
      if (!(PLACE_IDS as readonly string[]).includes(pid)) bad(`${e.id} is a place and needs props.place (${PLACE_IDS.join(', ')})`);
      def.places.push({ id: pid, ...at, rot: ((e.rotation ?? 0) * Math.PI) / 180, mir: p.mir === -1 ? -1 : 1, ...(typeof p.clear === 'number' && { clear: p.clear }) });
    }
  }
  if (lifts !== 1) bad(`needs exactly one lift (has ${lifts})`);
  return def;
}

/** The land as the sim reads it. */
export function buildLand(def: LandDef): MapData {
  const { w, h } = def;
  const ter = new Uint8Array(w * h).fill(GROUND_TER[def.ground]);
  const rim = (x: number, y: number) => x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rim(x, y)) ter[y * w + x] = Ter.Rock;
  const paint = (x: number, y: number, g: Ground) => {
    if (!rim(x, y)) ter[y * w + x] = GROUND_TER[g];
  };
  if (def.rows) {
    const { cell, rows } = def.rows;
    const glyph: Record<string, Ter> = { '#': Ter.Rock, '~': Ter.Dune, ',': Ter.Hardpan };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const t = glyph[rows[Math.floor(y / cell)][Math.floor(x / cell)]];
      if (t !== undefined && !rim(x, y)) ter[y * w + x] = t;
    }
  }
  // The shapes' frame sits at the corner, so a tile's centre is (tile + 0.5) tiles from it: a px position over T.
  rasterise(def.shapes, { x: -0.5, y: -0.5, rot: 0, mir: 1 }, w, h, paint);
  const places: PlacedPlace[] = [];
  const ruins: MapData['ruins'] = def.ruins.map((r) => ({ ...r }));
  for (const s of def.places) {
    const pd = PLACES[s.id];
    const parts = turnParts(pd, s, s.rot, s.mir);
    if (pd.outward) numberOutward(pd, parts, def.lift);
    const p: PlacedPlace = { id: s.id, x: s.x, y: s.y, parts };
    const clear = s.clear ?? pd.clear;
    clearRock(ter, w, h, p, clear);
    if (s.clear === undefined) for (const q of parts) clearRock(ter, w, h, { x: Math.round(q.x), y: Math.round(q.y) }, q.kind === 'ruin' ? 2 : 1);
    paintGround(p, { x: s.x, y: s.y, rot: s.rot, mir: s.mir }, w, h, paint);
    places.push(p);
  }
  for (const q of places.flatMap((p) => p.parts)) if (q.kind === 'ruin') ruins.push({ x: Math.round(q.x), y: Math.round(q.y), kind: q.ruin!, trail: q.step ?? 0 });
  return { w, h, seed: def.id, biome: def.biome, ter, lift: { ...def.lift }, seeps: def.seeps.map((s) => ({ ...s })), nests: def.nests.map((n) => ({ ...n })), ruins, places, rules: def.rules };
}

/** What is wrong with a land, in words: the lift or a spot on rock, a spot the lift cannot walk to. Empty when it is sound. */
export function landProblems(m: MapData): string[] {
  const out: string[] = [];
  const open = (s: Spot) => passable(m.ter[Math.round(s.y) * m.w + Math.round(s.x)]);
  const reach = open(m.lift) ? flood(m.ter, m.w, m.h, m.lift) : null;
  if (!reach) out.push(`the lift (${m.lift.x},${m.lift.y}) is on rock`);
  const spots: [string, Spot][] = [
    ...m.seeps.map((s, i) => [`seep ${i + 1}`, s] as [string, Spot]),
    ...m.nests.map((s, i) => [`hive ${i + 1}`, s] as [string, Spot]),
    ...m.ruins.map((s, i) => [`ruin ${i + 1} (${s.kind})`, s] as [string, Spot]),
    ...m.places.flatMap((p) => p.parts.map((q, i) => [`${p.id} part ${i + 1} (${q.kind})`, q] as [string, Spot])),
  ];
  for (const [name, s] of spots) {
    const t = `(${Math.round(s.x)},${Math.round(s.y)})`;
    if (!open(s)) out.push(`${name} ${t} is on rock`);
    else if (reach && !reach[Math.round(s.y) * m.w + Math.round(s.x)]) out.push(`${name} ${t} cannot be walked to from the lift`);
  }
  return out;
}

/** Every land file, by id. */
const FILES = import.meta.glob('../../levels/lands/*.json', { eager: true, import: 'default' }) as Record<string, LandFile>;
const RAW: Record<string, LandFile> = {};
export const LANDS: Record<string, LandDef> = Object.fromEntries(
  Object.entries(FILES).map(([path, file]) => {
    const id = path.split('/').pop()!.replace('.json', '');
    RAW[id] = file;
    return [id, parseLand(id, file)];
  }),
);
/** A land's file as loaded, or as last saved from the bench (what the editor opens). */
export const landFile = (id: string): LandFile => RAW[id];
export const LAND_IDS = (): string[] => Object.keys(LANDS);

/** A land file's map. Throws for an id with no file. */
export function loadLand(id: string): MapData {
  const def = LANDS[id];
  if (!def) throw new Error(`no land file levels/lands/${id}.json (have: ${LAND_IDS().join(', ') || 'none'})`);
  return buildLand(def);
}

/** Dev (the bench after an F2 save): replace a land with its file as just saved. */
export function reloadLand(id: string, file: LandFile) {
  LANDS[id] = parseLand(id, file);
  RAW[id] = file;
}
