/**
 * The place bench: one place alone on plain ground of a biome, drawn with the game's own place art, so whoever writes a
 * place file (`levels/places/<id>.json`, `sim/places.ts`) can see it at once. Also a handcrafted land (`levels/lands/<id>.json`,
 * `sim/lands.ts`) whole. A dev scene, not part of play.
 *
 *   ?scene=Place&id=graveyard               the desert  (&biome=jungle|city|demon|mountains|ether)
 *   ?scene=Place&land=testland              a land file whole (its biome, the lift, seeps, hives, ruins, places stamped)
 *   &rot=40 &mir=1                          a place turned (degrees) and mirrored, as a land would stamp it
 *   &hour=21 &grid=1 &zoom=2                the hour of the sky (lamps burn at night), the tile grid and part ids, a zoom
 *
 * Keys: G the tile grid (ids, tile numbers from the centre), R turn by 45 degrees, M mirror, B next biome, N day or night,
 * [ ] the previous or next place. Dev: `bench <id> [biome]`, `benchland <id>`, `benchgrid [on|off]` (`placedev.ts`);
 * `__game.state()` says what stands there and which part kinds have no art yet. The file is imported by this scene's code
 * path, so editing it from outside restarts the bench (the `hot` skill).
 *
 * **Editing (F2, `harness/editor`):** the file is the level. A place (turned 0, not mirrored) opens with its parts and ground
 * shapes as entities at their px offsets from the centre, which is the bench's origin; a land opens with its spots and shapes
 * at px from its corner. Move, add and delete them; Ctrl+S writes the file, and the bench re-reads it (`reloadPlace`,
 * `reloadLand`) and repaints the ground under the shapes. The keys above are off while editing. Shapes show as outlines only
 * while editing (the ground is the truth); the ground repaints on save, not while dragging.
 *
 * What is drawn is each part kind's sprite where the mission draws it (`ART`; the views in `places.ts` also animate and
 * light them, which the bench skips apart from lamps); a part kind with no sprite here shows as a labelled marker. Add the
 * line when you add a part kind.
 */
import Phaser from 'phaser';
import { kit, type SceneKit } from '../../../harness/kit';
import { defineType, loadLevel, type EntityTypes, type Level, type LevelData } from '../../../harness/editor/level';
import { LIFT_SCALE, S, liftFoot, makeArt, paintGround } from './art';
import { ARENA_SPRITE } from './arenaart';
import { makePlaceArt } from './placeart';
import { ClassOverlay } from './classview';
import { classOf, classedParts, type Classed } from './sim/classes';
import { NEST_LOOK } from './nestart';
import { BIOMES, PROPS, RUIN_FINDS, T, type BiomeId, type PropKind } from './sim/defs';
import { propKey } from './propart';
import { sky } from './sim/clock';
import { LANDS, LAND_IDS, landFile, landProblems, loadLand, reloadLand, type LandFile } from './sim/lands';
import { Ter, benchLand, type MapData } from './sim/mapgen';
import { PART_KINDS, PLACE_IDS, PLACES, placeFile, reloadPlace, turnParts, type PartKind, type PlaceFile, type PlaceId } from './sim/places';
import { GROUNDS, type Ground } from './sim/shapes';

/** How each part kind is drawn: the sprite, how far below the part's point its feet stand (px), a scale, a tint, a light. */
interface Art {
  key: string;
  foot: number;
  scale?: number;
  tint?: number;
  flat?: boolean;
  light?: { color: number; radius: number; intensity: number; lift: number };
}
const arena = (kind: PartKind): Art | undefined => (ARENA_SPRITE[kind] ? { key: ARENA_SPRITE[kind], foot: 12 } : undefined);
const ART: Partial<Record<PartKind, Art | ((biome: BiomeId, i: number) => Art)>> = {
  case: (b) => ({ key: BIOMES[b].shrine === 'steamGun' ? 'shrine-case' : 'shrine-case-bare', foot: 28, light: { color: 0xffc070, radius: 170, intensity: 0.5, lift: 10 } }),
  hive: (b) => ({ key: NEST_LOOK[BIOMES[b].paint].key, foot: 20, scale: 0.62, light: { color: NEST_LOOK[BIOMES[b].paint].light, radius: 90, intensity: 0.2, lift: 14 } }),
  pit: (b) => ({ key: NEST_LOOK[BIOMES[b].paint].key, foot: 20, scale: 0.8 }),
  pilgrim: { key: 'pilgrim-snare', foot: 8 },
  wreck: (_b, i) => ({ key: 'wreck', foot: 8, scale: 1.5 + ((i * 37) % 7) * 0.1, tint: 0xd8c8b4 }),
  grave: { key: 'grave-marker', foot: 12 },
  can: { key: 'oilcan', foot: 10, scale: 1.8 },
  lamp: { key: 'grave-lamp', foot: 16, light: { color: 0xffb860, radius: 150, intensity: 0.3, lift: 40 } },
  mast: { key: 'mast', foot: 22 },
  vault: { key: 'vault-fridge', foot: 4, light: { color: 0x70e8ff, radius: 130, intensity: 0.4, lift: 36 } },
  keep: { key: 'castle-keep', foot: 36, light: { color: 0xff2030, radius: 200, intensity: 0.5, lift: -10 } },
  tower: { key: 'castle-tower', foot: 14 },
  shaft: { key: 'dungeon-headframe', foot: 40 },
  ice: { key: 'arena-ice', foot: 0, flat: true },
  nave: { ...arena('nave')!, light: { color: 0x9040ff, radius: 260, intensity: 0.8, lift: 110 } },
  candle: { ...arena('candle')!, light: { color: 0xb0a0ff, radius: 90, intensity: 0.6, lift: 26 } },
  prison: { key: 'arena-prison', foot: 20, light: { color: 0xb090ff, radius: 160, intensity: 0.8, lift: 30 } },
  stage: arena('stage'), tree: arena('tree'), museum: arena('museum'), fountain: arena('fountain'), statue: arena('statue'), car: arena('car'), rock: arena('rock'), hangar: arena('hangar'),
  // P36 (`placeart36.ts`; a `prop` part is drawn as its prop, `partGO`). In a mission the pins are sleeping crawlcams and the husks downed robots.
  stump: { key: 'hornet-stump', foot: 6, light: { color: 0xcfe8f0, radius: 120, intensity: 0.15, lift: 70 } },
  wing: { key: 'part-hornet-wings', foot: 4 },
  carcass: { key: 'hornet-carcass', foot: 4 },
  pin: { key: 'spider-body', foot: 8, scale: 0.75 },
  foul: { key: 'lane-foul', foot: 0, flat: true },
  board: { key: 'lane-board', foot: 10, light: { color: 0xff9ad0, radius: 120, intensity: 0.3, lift: 60 } },
  husk: { key: 'wreck', foot: 8, scale: 1.4, tint: 0xe8c890 },
  fire: { key: 'fire-pit', foot: 6 },
  pool: { key: 'hot-spring', foot: 0, flat: true, light: { color: 0x9fe8e0, radius: 140, intensity: 0.25, lift: 0 } },
  lighthouse: { key: 'lighthouse', foot: 12, light: { color: 0xffe0a0, radius: 140, intensity: 0.5, lift: 198 } },
  buoy: { key: 'buoy', foot: 6 },
  bell: { key: 'bell-frame', foot: 10 },
  pew: { key: 'pew', foot: 6 },
  donation: { key: 'donation-box', foot: 6 },
  gun: { key: 'gun-base', foot: 10 },
  depot: { key: 'shell-depot', foot: 10 },
  sign: { key: 'prop-sign', foot: 10, light: { color: 0xfff0c0, radius: 90, intensity: 0.25, lift: 20 } },
  table: { key: 'cafe-table', foot: 8 },
  chair: { key: 'cafe-chair', foot: 8 },
  // P42 (`placeartq.ts`).
  doghouse: { key: 'doghouse', foot: 10, light: { color: 0xffd98a, radius: 70, intensity: 0.2, lift: 10 } },
  bowl: { key: 'dog-bowl', foot: 4 },
  mound: { key: 'dig-mound', foot: 6 },
  stray: { key: 'cat-sit', foot: 4 },
  compactor: { key: 'compactor-bot', foot: 10 },
  cube: { key: 'cube-tower', foot: 8 },
  cairn: { key: 'cairn', foot: 10 },
  flag: { key: 'cairn-flag', foot: 6 },
};

/** The outline colour of a ground shape in the editor. */
const GROUND_COLOR: Record<Ground, number> = { sand: 0xf0d890, dune: 0xe8a040, hardpan: 0xc0a888, rock: 0x907868 };

interface View { id: PlaceId; land: string; biome: BiomeId; rot: number; mir: 1 | -1; grid: boolean; hour: number; zoom: number }
const BIOME_IDS = Object.keys(BIOMES) as BiomeId[];
const GAME_DIR = 'games/proto-ld60-machinerra';
const editorOn = () => !!(window as unknown as { __game?: { editor?: { editing(): boolean } } }).__game?.editor?.editing();

export class PlaceBench extends Phaser.Scene {
  private v!: View;
  private map!: MapData;
  private k!: SceneKit;
  private groundKey = '';
  private ground?: Phaser.GameObjects.Image;
  /** World position of the place's centre (the bench's origin: file px are offsets from it); (0, 0) for a land. */
  private o = { x: 0, y: 0 };
  private gridObjs: Phaser.GameObjects.GameObject[] = [];
  private missing = new Set<string>();
  private bounds = { w: 0, h: 0 };
  private lvl?: Level;
  /** Part containers (depth by y, a light that follows) and ground-shape outlines (shown while editing). */
  private parts = new Set<Phaser.GameObjects.Container>();
  private outlines = new Set<Phaser.GameObjects.Container>();
  /** Which of its kind a file entity is, as the mission's views count (the wreck's look depends on it). */
  private nth = new Map<string, number>();
  private count = new Map<string, number>();
  private stamped: Phaser.GameObjects.Container[] = [];
  private stampSig = '';
  private note?: Phaser.GameObjects.Text;
  private problem = '';
  /** The dev class overlay (`classview.ts`; dev `classes`, key C). */
  classes!: ClassOverlay;

  constructor() {
    super('Place');
  }

  create(data: { id?: string; land?: string; biome?: string; rot?: number; mir?: number; grid?: number; hour?: number; zoom?: number }) {
    const land = data?.land && LAND_IDS().includes(data.land) ? data.land : '';
    const id = (PLACE_IDS as readonly string[]).includes(data?.id ?? '') ? (data.id as PlaceId) : 'graveyard';
    const biome = land ? LANDS[land].biome : data?.biome && data.biome in BIOMES ? (data.biome as BiomeId) : 'desert';
    this.v = { id, land, biome, rot: Number(data?.rot ?? 0), mir: Number(data?.mir) === -1 ? -1 : 1, grid: !!Number(data?.grid ?? 0), hour: Number(data?.hour ?? 11), zoom: Number(data?.zoom ?? 0) };
    this.parts.clear();
    this.outlines.clear();
    this.stamped = [];
    this.stampSig = '';
    this.problem = '';
    this.k = kit(this);
    this.k.background();
    makeArt(this);
    makePlaceArt(this);
    this.draw();
    const classesWere = this.classes?.on;
    this.classes = new ClassOverlay(this, () => this.classed());
    if (classesWere) this.classes.set(true);
    const key = (code: string, fn: () => void) => this.input.keyboard?.on(`keydown-${code}`, () => !editorOn() && fn());
    key('G', () => this.setGrid(!this.v.grid));
    key('C', () => this.classes.toggle());
    key('R', () => this.show({ rot: (this.v.rot + 45) % 360 }));
    key('M', () => this.show({ mir: this.v.mir === 1 ? -1 : 1 }));
    key('B', () => !this.v.land && this.show({ biome: BIOME_IDS[(BIOME_IDS.indexOf(this.v.biome) + 1) % BIOME_IDS.length] }));
    key('N', () => this.show({ hour: this.v.hour < 17 ? 22 : 11 }));
    key('OPEN_BRACKET', () => this.show({ id: PLACE_IDS[(PLACE_IDS.indexOf(this.v.id) + PLACE_IDS.length - 1) % PLACE_IDS.length] }));
    key('CLOSED_BRACKET', () => this.show({ id: PLACE_IDS[(PLACE_IDS.indexOf(this.v.id) + 1) % PLACE_IDS.length] }));
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, this.sync, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PRE_RENDER, this.sync, this);
      if (this.textures.exists(this.groundKey)) this.textures.remove(this.groundKey);
    });
  }

  /** Change what the bench shows (a dev command, or a key): the scene is rebuilt. */
  show(over: Partial<View>) {
    this.scene.restart({ ...this.v, ...over, grid: +(over.grid ?? this.v.grid) });
  }

  setGrid(on: boolean) {
    this.v.grid = on;
    this.gridObjs.forEach((o) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on));
  }

  /** A sprite standing with its feet at (0, footY) of a container, its width in game px. Returns the height. */
  private sprite(c: Phaser.GameObjects.Container, key: string, footY: number, scale = 1, flat = false) {
    const h = this.textures.get(key).getSourceImage().height / S;
    const img = this.add.image(0, footY, key).setOrigin(0.5, flat ? 0.5 : 1).setScale(scale / S);
    c.add(img);
    return { img, h };
  }

  /** What a part kind looks like at (0, 0): the sprite where the mission draws it, its light, a marker when it has no art. */
  private partGO(kind: PartKind, i: number, ruin?: string) {
    const c = this.add.container(0, 0);
    const art = ART[kind];
    const a = typeof art === 'function' ? art(this.v.biome, i) : art;
    let sort = 0;
    const marker = (what: string) => {
      this.missing.add(what);
      c.add([this.add.circle(0, 0, 7, 0xff40a0, 0.8), this.k.text(9, -16, what, { size: 11, font: 'body' }).setStroke('#1d1a17', 3)]);
    };
    if (kind === 'prop') {
      // A prop part (P36): its prop's own picture, whole; `ruin` carries the prop's kind here.
      const pk = (ruin ?? 'crate') as PropKind;
      const key = pk in PROPS ? propKey(pk, PROPS[pk].material, 'whole') : '';
      if (key && this.textures.exists(key)) {
        const { h } = this.sprite(c, key, 12);
        sort = 12 - h * 0.1;
      } else marker(`prop ${pk}`);
    } else if (kind === 'ruin') {
      if (ruin && this.textures.exists(ruin)) {
        const { h } = this.sprite(c, ruin, 0.3 * T);
        sort = 0.3 * T - h * 0.1;
      } else marker(ruin ?? 'ruin');
    } else if (!a || !this.textures.exists(a.key)) marker(kind);
    else {
      if (kind === 'case') c.add(this.add.image(0, 20, 'shrine-floor').setScale(1 / S));
      const { img, h } = this.sprite(c, a.key, a.foot, a.scale ?? 1, a.flat);
      sort = a.flat ? -1e5 : a.foot - h * 0.1;
      if (a.flat) img.setY(0);
      if (a.tint !== undefined) img.setTint(a.tint);
      if (kind === 'wreck') img.setFlipX(i % 2 === 0).setAngle((((i * 37) % 7) * 53 % 21) - 10);
      if (kind === 'gun') c.add(this.add.image(0, a.foot - 14, 'gun-barrel').setOrigin(0.18, 0.5).setScale(1 / S)); // the barrel, pointing east
      if (a.light) {
        const night = sky(this.v.hour).night, L = this.k.lights;
        const light = L.add(0, 0, { color: a.light.color, radius: a.light.radius * (0.8 + 0.6 * night), intensity: a.light.intensity * (0.5 + night) });
        c.setData('light', { light, lift: a.light.lift });
        c.once('destroy', () => L.remove(light));
      }
    }
    c.setData('sort', sort);
    this.parts.add(c);
    c.once('destroy', () => this.parts.delete(c));
    return c;
  }

  /** A ground shape's outline (blob or band) at (0, 0), in the file's own px; the loader turns and scales it. Shown while editing. */
  private shapeGO(type: 'blob' | 'band', p: Record<string, any>) {
    const col = GROUND_COLOR[p.ground as Ground] ?? 0xffffff;
    const g = this.add.graphics();
    g.lineStyle(2, col, 0.95);
    let w: number, h: number, cx = 0, cy = 0;
    if (type === 'blob') {
      g.fillStyle(col, 0.18).fillEllipse(0, 0, p.rx * 2, p.ry * 2).strokeEllipse(0, 0, p.rx * 2, p.ry * 2);
      (w = p.rx * 2), (h = p.ry * 2);
    } else {
      // The strip along x, bowed by `bend` at its middle, with round ends: the outline only (a filled concave polygon draws wrongly).
      const half = p.length / 2, r = p.width / 2, pts: { x: number; y: number }[] = [];
      const N = 24, bow = (t: number) => p.bend * (1 - t * t);
      for (let i = 0; i <= N; i++) pts.push({ x: -half + (p.length * i) / N, y: bow(-1 + (2 * i) / N) - r });
      for (let i = 1; i < 12; i++) pts.push({ x: half + Math.sin((i / 12) * Math.PI) * r, y: -r * Math.cos((i / 12) * Math.PI) });
      for (let i = N; i >= 0; i--) pts.push({ x: -half + (p.length * i) / N, y: bow(-1 + (2 * i) / N) + r });
      for (let i = 1; i < 12; i++) pts.push({ x: -half - Math.sin((i / 12) * Math.PI) * r, y: r * Math.cos((i / 12) * Math.PI) });
      g.strokePoints(pts.map((q) => new Phaser.Math.Vector2(q.x, q.y)), true, true);
      (w = p.length + p.width), (h = p.width + 2 * Math.abs(p.bend)), (cy = p.bend / 2);
    }
    // A Graphics has no bounds: an invisible box gives the editor the shape's extent to pick and outline.
    const box = this.add.rectangle(cx, cy, w, h, 0xffffff, 0);
    const c = this.add.container(0, 0, [g, box]).setDepth(-7).setVisible(editorOn());
    this.outlines.add(c);
    c.once('destroy', () => this.outlines.delete(c));
    return c;
  }

  /** A part-like thing built from one sprite, standing with its feet `foot` px below its point (the lift). */
  private thing(key: string, foot: number, scale: number) {
    if (!this.textures.exists(key)) return this.partGO('ruin', 0, key);
    const c = this.add.container(0, 0);
    const { h } = this.sprite(c, key, foot, scale);
    c.setData('sort', foot - h * 0.1);
    this.parts.add(c);
    c.once('destroy', () => this.parts.delete(c));
    return c;
  }

  /** A labelled disc for a spot with no art of its own (a seep, a place's centre; a line shows how a place is turned). */
  private mark(what: string, color: number, turn = false) {
    const c = this.add.container(0, 0, [this.add.circle(0, 0, 9, color, 0.55).setStrokeStyle(2, 0x1d1a17), this.k.text(11, -18, what, { size: 11, font: 'body' }).setStroke('#1d1a17', 3)]);
    if (turn) c.add(this.add.line(0, 0, 0, 0, 2 * T, 0, 0xffd070, 0.9).setOrigin(0, 0).setLineWidth(2));
    return c.setDepth(5e4);
  }

  /** The editor's entity types: a place file's parts and ground shapes, or a land file's spots, shapes and stamped places. */
  private types(): EntityTypes {
    const shape = {
      ground: { type: 'enum', default: 'hardpan', options: GROUNDS },
      rough: { type: 'number', default: 0.3, min: 0, max: 1, step: 0.05 },
      seed: { type: 'number', default: 1, min: 1, max: 999, step: 1 },
    } as const;
    const out: EntityTypes = {
      blob: defineType({ props: { ...shape, rx: { type: 'number', default: 96, min: 8, max: 800 }, ry: { type: 'number', default: 64, min: 8, max: 800 } }, create: (_s, _e, p) => this.shapeGO('blob', p) }),
      band: defineType({ props: { ...shape, length: { type: 'number', default: 256, min: 16, max: 1600 }, width: { type: 'number', default: 48, min: 8, max: 400 }, bend: { type: 'number', default: 0, min: -400, max: 400 } }, create: (_s, _e, p) => this.shapeGO('band', p) }),
    };
    const ruinProp = { ruin: { type: 'enum', default: this.v.land ? 'car' : 'phone', options: Object.keys(RUIN_FINDS) } } as const;
    const propProp = { prop: { type: 'enum', default: 'crate', options: Object.keys(PROPS) } } as const;
    if (this.v.land) {
      out.lift = defineType({ create: () => this.thing('lift', liftFoot('lift'), LIFT_SCALE) });
      out.seep = defineType({ props: { amount: { type: 'number', default: 110, min: 10, max: 300, step: 5 } }, create: () => this.mark('seep', 0x202020) });
      out.hive = defineType({ create: (_s, e) => this.partGO('hive', this.nthOf(e.id, 'hive')) });
      out.ruin = defineType({ props: ruinProp, create: (_s, _e, p) => this.partGO('ruin', 0, p.ruin) });
      out.place = defineType({
        props: { place: { type: 'enum', default: 'graveyard', options: PLACE_IDS }, mir: { type: 'number', default: 1, min: -1, max: 1, step: 2 } },
        create: (_s, _e, p) => this.mark(String(p.place), 0xffd070, true),
      });
    } else
      for (const kind of PART_KINDS)
        out[kind] =
          kind === 'prop'
            ? defineType({ props: propProp, create: (_s, e, p) => this.partGO(kind, this.nthOf(e.id, kind), p.prop) })
            : defineType({ props: kind === 'ruin' ? ruinProp : undefined, create: (_s, e, p) => this.partGO(kind, this.nthOf(e.id, kind), kind === 'ruin' ? p.ruin : undefined) });
    return out;
  }

  /** The n-th of its kind a file entity is (the order of the file; one added in the editor goes last). */
  private nthOf(id: string, kind: string) {
    let n = this.nth.get(id);
    if (n === undefined) {
      n = this.count.get(kind) ?? 0;
      this.count.set(kind, n + 1);
      this.nth.set(id, n);
    }
    return n;
  }

  /** Called at the end of every frame: parts sort by their feet, lights follow them, shape outlines show while editing, a land's stamped places follow their entities. */
  private sync() {
    const editing = editorOn();
    for (const c of this.parts) {
      c.setDepth(1e4 + c.y + (c.getData('sort') as number)); // over the ground (-10) even above the centre, where y is negative
      const l = c.getData('light') as { light: Phaser.GameObjects.Light; lift: number } | undefined;
      if (l) (l.light.x = c.x), (l.light.y = c.y - l.lift);
    }
    for (const c of this.outlines) c.setVisible(editing);
    if (this.v.land && this.lvl) this.stamp();
    this.classes.update();
  }

  /** A land's places, drawn where the land would put them: the parts of each `place` entity, turned about its tile. Rebuilt when one changes. */
  private stamp() {
    const spots = this.lvl!.entities.filter((e) => e.type === 'place');
    const sig = JSON.stringify(spots.map((e) => [e.x, e.y, e.rotation, e.props]));
    if (sig === this.stampSig) return;
    this.stampSig = sig;
    this.stamped.forEach((c) => c.destroy());
    this.stamped = [];
    for (const e of spots) {
      const id = e.props?.place as PlaceId;
      if (!PLACES[id]) continue;
      const centre = { x: Math.floor(e.x / T), y: Math.floor(e.y / T) };
      const seen: Partial<Record<PartKind, number>> = {};
      for (const q of turnParts(PLACES[id], centre, ((e.rotation ?? 0) * Math.PI) / 180, e.props?.mir === -1 ? -1 : 1)) {
        const i = (seen[q.kind] = (seen[q.kind] ?? -1) + 1);
        this.stamped.push(this.partGO(q.kind, i, q.ruin ?? q.prop).setPosition((q.x + 0.5) * T, (q.y + 0.5) * T));
      }
    }
  }

  /** The map the bench shows: the land file's, or one place alone on plain ground. */
  private makeMap() {
    const { id, land, biome, rot, mir } = this.v;
    return land ? loadLand(land) : benchLand(id, biome, { rot: (rot * Math.PI) / 180, mir, seed: `bench/${id}` });
  }

  /** Open the file as the editor's level (F2): the entities are its parts or spots, saved to `path`. */
  private openLevel(file: PlaceFile | LandFile, path: string) {
    this.nth.clear();
    this.count.clear();
    for (const e of file.entities ?? []) this.nthOf(e.id, e.type);
    this.lvl = loadLevel(this, file as unknown as LevelData, this.types(), { path, onSave: (d) => this.saved(d) });
  }

  /** After a save: the file is read again, the ground repainted under its shapes, a land's problems shown. */
  private saved(data: LevelData) {
    try {
      if (this.v.land) reloadLand(this.v.land, data as unknown as LandFile);
      else reloadPlace(this.v.id, data as unknown as PlaceFile);
      this.problem = '';
      this.repaint();
    } catch (err) {
      this.problem = (err as Error).message;
      console.error(err);
    }
    this.showNote();
  }

  private repaint() {
    this.map = this.makeMap();
    // The ground's texture is keyed by biome and seed and kept: take the old one out so the new shapes are painted.
    if (this.textures.exists(this.groundKey)) this.textures.remove(this.groundKey);
    this.groundKey = paintGround(this, this.map);
    this.ground?.setTexture(this.groundKey);
  }

  /** The classed things the bench shows (the overlay's list): the place's parts as drawn, and for a land its ruins, hives, tap and props. */
  private classed(): Classed[] {
    const m = this.map, o = this.o, px = (v: number, axis: 'x' | 'y') => (v + 0.5) * T - o[axis];
    const at = (s: { x: number; y: number }) => ({ x: px(s.x, 'x'), y: px(s.y, 'y') });
    const out: Classed[] = [];
    for (const pl of m.places) out.push(...classedParts(pl.id, pl.parts.map((q) => ({ kind: q.kind, ...at(q) }))));
    if (!this.v.land) return out;
    out.push({ cls: classOf({ what: 'lift' }), what: 'lift', ...at(m.lift), r: 1.3 * T });
    for (const r of m.ruins) out.push({ cls: classOf({ what: 'ruin', kind: r.kind }), what: `ruin:${r.kind}`, ...at(r), r: 0.9 * T });
    for (const n of m.nests) out.push({ cls: classOf({ what: 'hive' }), what: 'hive', ...at(n), r: 0.9 * T });
    for (const s of m.seeps) out.push({ cls: classOf({ what: 'tap' }), what: 'tap', ...at(s), r: 0.7 * T });
    for (const p of m.props ?? []) out.push({ cls: classOf({ what: 'prop', kind: p.kind }), what: p.kind, ...at(p), r: PROPS[p.kind].r * 1.15 });
    return out;
  }

  private showNote() {
    const probs = this.v.land ? landProblems(this.map) : [];
    const text = this.problem ? `saved, but the file does not read: ${this.problem}` : probs.length ? `${probs.length} problem${probs.length > 1 ? 's' : ''}: ${probs[0]}` : '';
    this.note?.setText(text).setColor(this.problem ? '#ff8080' : '#ffd070');
  }

  private draw() {
    const { id, land, biome, rot, mir, hour } = this.v;
    const map = (this.map = this.makeMap());
    const place = map.places[0];
    this.o = land ? { x: 0, y: 0 } : { x: (place.x + 0.5) * T, y: (place.y + 0.5) * T };
    const o = this.o;
    this.groundKey = paintGround(this, map);
    this.ground = this.add.image(-o.x, -o.y, this.groundKey).setOrigin(0).setScale(2).setDepth(-10);
    this.lights.setAmbientColor(sky(hour).ambient);
    this.missing.clear();
    const px = (v: number, axis: 'x' | 'y') => (v + 0.5) * T - o[axis];
    const file = (land ? landFile(land) : placeFile(id)) as PlaceFile | LandFile;
    if (land) this.openLevel(file, `${GAME_DIR}/levels/lands/${land}.json`);
    else if (rot === 0 && mir === 1) this.openLevel(file, `${GAME_DIR}/levels/places/${id}.json`);
    else {
      // Turned or mirrored: the parts as the land would stamp them. Not editable (the file is the unturned one).
      const seen: Partial<Record<PartKind, number>> = {};
      for (const q of place.parts) {
        const i = (seen[q.kind] = (seen[q.kind] ?? -1) + 1);
        this.partGO(q.kind, i, q.ruin ?? q.prop).setPosition(px(q.x, 'x'), px(q.y, 'y'));
      }
    }
    // Zoom to fit the parts and the ground painted under them (a land: the whole land), unless asked.
    const xs: number[] = [], ys: number[] = [];
    if (land) xs.push(0, map.w * T), ys.push(0, map.h * T);
    else {
      for (const q of place.parts) (xs.push(px(q.x, 'x')), ys.push(px(q.y, 'y')));
      for (let ty = 1; ty < map.h - 1; ty++)
        for (let tx = 1; tx < map.w - 1; tx++)
          if (map.ter[ty * map.w + tx] !== Ter.Sand) (xs.push(px(tx, 'x')), ys.push(px(ty, 'y')));
    }
    const pad = land ? 0 : 2 * T;
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - (land ? 0 : 3 * T), y1 = Math.max(...ys) + pad;
    this.bounds = { w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
    const cam = this.cameras.main;
    const zoom = this.v.zoom || Math.max(0.2, Math.min(2.4, Math.min((0.94 * cam.width) / (x1 - x0), (0.86 * cam.height) / (y1 - y0))));
    cam.setZoom(zoom);
    cam.centerOn((x0 + x1) / 2, (y0 + y1) / 2);
    this.drawGrid(map);
    // Fixed to the screen whatever the zoom (a scroll-factor-0 object is still scaled about the camera's centre).
    const hud = (y: number, str: string, size: number, font: 'display' | 'body') =>
      this.k.text(cam.width / 2 + (16 - cam.width / 2) / zoom, cam.height / 2 + (y - cam.height / 2) / zoom, str, { size, font }).setOrigin(0).setScale(1 / zoom).setScrollFactor(0).setDepth(99999).setStroke('#1d1a17', 4);
    if (land) hud(12, `${LANDS[land].name}  (land ${land})  ·  ${BIOMES[biome].name}  ·  ${map.w} x ${map.h} tiles`, 20, 'display');
    else hud(12, `${PLACES[id].name}  (${id})  ·  ${BIOMES[biome].name}${rot ? `  ·  turned ${rot}` : ''}${mir < 0 ? '  ·  mirrored' : ''}`, 20, 'display');
    hud(40, land ? 'G grid   N night   F2 edit' : 'G grid   R turn   M mirror   B biome   N night   [ ] place   F2 edit', 13, 'body');
    this.note = hud(60, '', 13, 'body');
    this.showNote();
  }

  /** The tile grid: a line per tile (heavier every 4), the centre, and each part's id and tile offset. A land: lines over the whole land. */
  private drawGrid(map: MapData) {
    const g = this.add.graphics().setDepth(80000);
    const o = this.o, z = 1 / this.cameras.main.zoom;
    const line = (i: number, rel: number, x0: number, y0: number, x1: number, y1: number, vertical: boolean) => {
      const heavy = rel % 4 === 0;
      g.lineStyle((heavy ? 2 : 1) * z, 0xffffff, heavy ? 0.4 : 0.17);
      if (vertical) g.lineBetween(i * T - o.x, y0, i * T - o.x, y1);
      else g.lineBetween(x0, i * T - o.y, x1, i * T - o.y);
    };
    this.gridObjs = [g];
    if (this.v.land) {
      for (let i = 0; i <= map.w; i++) line(i, i, 0, -o.y, 0, map.h * T - o.y, true);
      for (let i = 0; i <= map.h; i++) line(i, i, -o.x, 0, map.w * T - o.x, 0, false);
    } else {
      const p = map.places[0];
      const cx = Math.round(p.x), cy = Math.round(p.y), R = 22;
      for (let i = cx - R; i <= cx + R + 1; i++) line(i, i - cx, 0, (cy - R) * T - o.y, 0, (cy + R + 1) * T - o.y, true);
      for (let i = cy - R; i <= cy + R + 1; i++) line(i, i - cy, (cx - R) * T - o.x, 0, (cx + R + 1) * T - o.x, 0, false);
      g.lineStyle(3 * z, 0xffd070, 0.9).strokeCircle(0.5 * T - o.x + cx * T, 0.5 * T - o.y + cy * T, 9 * z);
      p.parts.forEach((q, i) => {
        const x = (q.x + 0.5) * T - o.x, y = (q.y + 0.5) * T - o.y;
        g.fillStyle(0xff40a0, 0.9).fillCircle(x, y, 3);
        this.gridObjs.push(this.k.text(x + 5, y - 14, PLACES[p.id].parts[i].id, { size: 11, font: 'body' }).setDepth(80001).setStroke('#1d1a17', 3).setScale(z));
      });
    }
    this.setGrid(this.v.grid);
  }

  debugState() {
    if (this.v.land) {
      const m = this.map, d = LANDS[this.v.land];
      return {
        ...this.v, ...this.classes.debug(), name: d.name, size: [m.w, m.h], lift: m.lift, seeps: m.seeps.length, hives: m.nests.length, ruins: m.ruins.length,
        places: m.places.map((p) => `${p.id}@${p.x},${p.y}`), shapes: d.shapes.map((s) => `${s.kind}:${s.ground}`),
        problems: landProblems(m), view: this.bounds, zoom: +this.cameras.main.zoom.toFixed(2), missingArt: [...this.missing], fileProblem: this.problem,
      };
    }
    const kinds: Record<string, number> = {};
    for (const q of PLACES[this.v.id].parts) kinds[q.kind] = (kinds[q.kind] ?? 0) + 1;
    return {
      ...this.v, ...this.classes.debug(),
      name: PLACES[this.v.id].name,
      tags: PLACES[this.v.id].tags,
      parts: kinds,
      shapes: PLACES[this.v.id].shapes.map((s) => `${s.kind}:${s.ground}`),
      view: this.bounds,
      zoom: +this.cameras.main.zoom.toFixed(2),
      /** Part kinds drawn as a pink marker: no art for them here yet. */
      missingArt: [...this.missing],
      fileProblem: this.problem,
    };
  }
}
