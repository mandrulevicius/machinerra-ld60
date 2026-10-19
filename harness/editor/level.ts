import type Phaser from 'phaser';

/** Shipped in production: the level format, entity types and the loader. The editor itself (./editor) is dev-only. */

export type PropDef =
  | { type: 'number'; default: number; min?: number; max?: number; step?: number }
  | { type: 'color'; default: string } // '#rrggbb' in JSON; create() receives a number
  | { type: 'boolean'; default: boolean }
  | { type: 'enum'; default: string; options: readonly string[] };
export type Schema = Record<string, PropDef>;
type Value<D> = D extends { type: 'number' } ? number : D extends { type: 'color' } ? number : D extends { type: 'boolean' } ? boolean : string;
export type Props<S extends Schema> = { [K in keyof S]: Value<S[K]> };

export interface Entity {
  id: string;
  type: string;
  x: number;
  y: number;
  /** Degrees. Omitted when 0. */
  rotation?: number;
  /** Uniform. Omitted when 1. */
  scale?: number;
  props?: Record<string, number | string | boolean>;
}
export interface LevelData {
  entities: Entity[];
  [extra: string]: unknown;
}

/** How the editor shows a thing with no visible body. `area`: its getBounds() is the shape (zones). */
export interface Gizmo {
  icon?: 'sun' | 'burst' | 'diamond' | 'ring' | 'cross';
  color?: number;
  size?: number;
  area?: boolean;
}

export interface EntityType<S extends Schema = Schema> {
  /**
   * Build the object at (0,0); the loader then sets x, y, rotation and scale from the entity, so don't set those here.
   * Return a GameObject; for anything else (a light) return a Container and clean up in `once('destroy')`.
   */
  create(scene: Phaser.Scene, entity: Entity, props: Props<S>): Phaser.GameObjects.GameObject;
  props?: S;
  gizmo?: Gizmo;
}
export type EntityTypes = Record<string, EntityType<any>>;

/** Keeps the literal types of `props` so `create`'s third argument is typed. */
export const defineType = <S extends Schema = {}>(t: EntityType<S>): EntityType<S> => t;

type Placeable = Phaser.GameObjects.Components.Transform;

export function place(obj: Phaser.GameObjects.GameObject, e: Entity) {
  const t = obj as unknown as Placeable;
  t.x = e.x;
  t.y = e.y;
  t.rotation = ((e.rotation ?? 0) * Math.PI) / 180;
  t.setScale(e.scale ?? 1);
}

export function resolveProps(type: EntityType, e: Entity): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, d] of Object.entries(type.props ?? {})) {
    const v = e.props?.[k] ?? d.default;
    out[k] = d.type === 'color' ? parseInt(String(v).replace('#', ''), 16) : v;
  }
  return out;
}

export class Level {
  readonly objects = new Map<string, Phaser.GameObjects.GameObject>();
  constructor(
    readonly scene: Phaser.Scene,
    readonly data: LevelData,
    readonly types: EntityTypes,
    /** Repo-relative file the editor saves to, e.g. 'games/lab/levels/demo.json'. */
    readonly path?: string,
    /** Called with the data just written after a successful save (a scene that shows derived state refreshes it here). */
    readonly onSave?: (data: LevelData) => void,
  ) {}

  get entities(): Entity[] {
    return this.data.entities;
  }
  set entities(v: Entity[]) {
    this.data.entities = v;
  }
  get(id: string) {
    return this.objects.get(id);
  }
  /** Objects of one entity type, in level order. */
  find(type: string) {
    return this.entities.filter((e) => e.type === type).map((e) => this.objects.get(e.id)!).filter(Boolean);
  }

  spawn(e: Entity) {
    const type = this.types[e.type];
    if (!type) return console.warn(`level: unknown entity type "${e.type}" (${e.id})`);
    const obj = type.create(this.scene, e, resolveProps(type, e));
    place(obj, e);
    this.objects.set(e.id, obj);
    return obj;
  }
  remove(id: string) {
    this.objects.get(id)?.destroy();
    this.objects.delete(id);
  }
  /** Recreate one object from its entity, keeping its draw order. */
  rebuild(e: Entity) {
    const old = this.objects.get(e.id);
    const index = old ? this.scene.children.getIndex(old) : -1;
    this.remove(e.id);
    const obj = this.spawn(e);
    if (obj && index >= 0) this.scene.children.moveTo(obj, index);
  }
}

/** Load a level into a scene (call in create()). Entities are copied, so editing never touches the imported JSON. */
export function loadLevel(scene: Phaser.Scene, data: LevelData, types: EntityTypes, opts: { path?: string; onSave?: (data: LevelData) => void } = {}): Level {
  const level = new Level(scene, structuredClone(data), types, opts.path, opts.onSave);
  level.entities.forEach((e) => level.spawn(e));
  if (import.meta.env.DEV) import('./editor').then((m) => m.attach(level));
  return level;
}
