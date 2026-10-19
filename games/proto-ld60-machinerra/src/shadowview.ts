/**
 * The land's shadows (where they fall is `sun.ts`: the sun by day, turning through the hours; the lamps by night). Three kinds:
 * - Props and ruins cast their silhouette (`sunCast`): the prop's picture flipped, laid down from its foot, turned and
 *   stretched to the lean, so it follows the sun and the lamps.
 * - Everything that moves gets the kit's blob shadow (`w.shadows`, `quality.shadows`) in two grades (Minos: shadows need not
 *   be high quality, the Communicator and NPCs a bit better): a flat soft ellipse leaning to the lean (`groundShadow`), the
 *   cheapest there is, for robots and enemies; and for the Communicator and NPCs (`fine`) the same patch plus a tail thrown
 *   along the lean (`SHADOW_TAIL`). A flier's is a small faint ellipse thrown by its height (`airShadow`).
 * - Things the sim lists but no view owns (pickups, the tap, coal seams) get a patch here, from the sim's positions.
 * - The hub's props cast the same silhouette (`DeckShadows.stand`), but short, soft and always from their contact line (`footline.ts`:
 *   the lowest opaque row unless a row says otherwise), away from the lights that burn near them; a piece set against a wall
 *   (`wall`) keeps a small patch under its feet instead. Its people keep the fine blob, tail short.
 * - The casts' pictures share pages (`castatlas.ts`), so all of a view's casts draw in one batch.
 * - A cast is turned to the light only as often as it can change: by day (every cast leans the same) when the sun has moved a
 *   little, by night (the lamps) every third frame, each cast on its own turn, and a cast that is off screen not at all.
 * Add a shadow to a thing that stands on the ground, where its view creates the sprite: `groundShadow(this.w, spr)`
 * (Communicator or NPC: `{ fine: true }`; a boss: `{ big: true }`); a flier: `airShadow(this.w, spr)`. Keep the handle to
 * lift (`raise`) or hide it. A static prop: `this.place(...)` already casts one.
 * The tint is the land's own shade, so a robot's shadow and a rock's match. `prepareShadows` (`Play`, right after
 * `createWorld`) bakes the shapes and hooks the kit's `lean`; the view each frame turns the sun, gathers the lights and
 * keeps the casts and fine tails in line.
 */
import Phaser from 'phaser';
import { Shadows, type Shadow, type World } from '../../../harness/kit';
import { DRESS } from './biomedress';
import { castFrame } from './castatlas';
import { floorOf } from './footline';
import { ViewBase, type Img, type PlayHost } from './playhost';
import { PARTS, type BiomeDef } from './sim/defs';
import type { Seam, Seep } from './sim/types';
import { MesaShadows } from './mesashadow';
import { sunLean, throwAt, type Src, type Vec } from './sun';

type Paint = BiomeDef['paint'];

export const SHADOW_BLOB = 'shadow-blob';
export const SHADOW_TAIL = 'shadow-tail';
const TAIL = { w: 128, h: 32, wide: 14 };
/** Px of lean per unit of `Shadow.height` (a shadow's `height` is the thing's altitude over this: a hornet 2.5 up is ~37 px). */
const UNIT = 15;
/** Alphas (guesses, tuned against the props' cast shadows at 0.42). */
const ALPHA = { ground: 0.55, air: 0.3, cast: 0.42 };
/** How much of a thing's height its tail's length is, at lean 1. */
const TAIL_LEN = 0.9;

/** A land's shadow colour: the cast shadows' own (`castShadow`). */
export function shadeOf(paint: Paint): number {
  const d = DRESS[paint];
  const [r, g, b] = d.soilLo.map((v, i) => Math.round(v * d.shade[i] * 0.55));
  return (r << 16) | (g << 8) | b;
}

/** Bake the shapes once per texture manager: the flat blob, and the tail (white, from the centre to the right, thinning out). */
function bake(scene: Phaser.Scene) {
  if (scene.textures.exists(SHADOW_BLOB)) return;
  const blob = scene.textures.createCanvas(SHADOW_BLOB, 64, 32)!;
  const b = blob.getContext();
  b.scale(1, 0.5);
  const bg = b.createRadialGradient(32, 32, 0, 32, 32, 32);
  bg.addColorStop(0, 'rgba(255,255,255,1)');
  bg.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  bg.addColorStop(1, 'rgba(255,255,255,0)');
  b.fillStyle = bg;
  b.fillRect(0, 0, 64, 64);
  blob.refresh();
  const tail = scene.textures.createCanvas(SHADOW_TAIL, TAIL.w, TAIL.h)!;
  const c = tail.getContext();
  const cx = TAIL.w / 2, cy = TAIL.h / 2, L = TAIL.w / 2 - 4;
  c.filter = 'blur(2px)';
  const g = c.createLinearGradient(cx, 0, cx + L, 0);
  g.addColorStop(0, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(cx, cy - TAIL.wide);
  c.lineTo(cx + L, cy - TAIL.wide * 0.35);
  c.lineTo(cx + L, cy + TAIL.wide * 0.35);
  c.lineTo(cx, cy + TAIL.wide);
  c.closePath();
  c.fill();
  c.filter = 'none';
  tail.refresh();
}

/** What a world's shadows keep between frames (the sun, the lights, the fine tails), by the world that owns them. */
interface Rig {
  sun: Vec;
  night: number;
  lights: Src[];
  tails: { obj: Img; patch: Shadow; tail: Img; h: number }[];
  /** The depth the fine tails are drawn at (the kit's shadows' own), and the alpha of a ground shadow here. */
  depth: number;
  alpha: number;
  /** The longest lean a fine tail follows (1: the mission's; the hub keeps its people's tails short). */
  reach: number;
}
/** What owns shadows: the mission's `World`, or the hub's `DeckShadows`. */
type Holder = { shadows: Shadows };
const rigs = new WeakMap<Holder, Rig>();

/** Set the world's shadows for a land: the land's shade, the shapes, the lean hook. Call once after `createWorld`. */
export function prepareShadows(scene: Phaser.Scene, w: World, paint: Paint) {
  bake(scene);
  const rig: Rig = { sun: sunLean(12), night: 0, lights: [], tails: [], depth: -3.5, alpha: ALPHA.ground, reach: 1 };
  rigs.set(w, rig);
  w.shadows.tint = shadeOf(paint);
  w.shadows.alpha = ALPHA.ground;
  w.shadows.lean = (x, y, o) => {
    throwAt(x, y, rig.sun, rig.night, rig.lights, o);
    o.x *= UNIT;
    o.y *= UNIT;
  };
}

/** The lean (per unit of height, as `sun.ts`) and alpha factor of a shadow at (x, y) now, for what draws its own shadow. */
export function leanAt(w: Holder, x: number, y: number): { x: number; y: number; a: number } {
  const rig = rigs.get(w), o = { x: 0, y: 0, a: 1 };
  if (rig) throwAt(x, y, rig.sun, rig.night, rig.lights, o);
  return o;
}

/**
 * A ground unit's shadow, made where its view creates the sprite, at its feet, leaning to the light (`height` is how far up
 * its middle is). Default the simple blob (robots, enemies); `fine` (the Communicator, NPCs): a smaller patch and a tail
 * thrown along the lean. `big` for a boss; `wide` (times as wide) and `flat` (its height against the blob's own, 1) for one blob under several pieces (a chain's plates); `foot` as the kit's (the feet's offset
 * from the sprite's origin, in its heights: 0.5 for a piece drawn centred; default an origin at the feet).
 */
export function groundShadow(w: Holder, spr: Img, o: { fine?: boolean; big?: boolean; foot?: number; wide?: number; flat?: number } = {}): Shadow {
  const big = o.big ? 1.15 : 1, foot = o.foot ?? -0.02;
  const dh = spr.displayHeight;
  if (o.fine) {
    const rig = rigs.get(w);
    const patch = w.shadows.add(spr, { key: SHADOW_BLOB, scale: 0.8 * big, squash: 1, foot });
    patch.height = 0;
    patch.alpha = (rig?.alpha ?? ALPHA.ground) + 0.1;
    const tail = spr.scene.add.image(spr.x, spr.y, SHADOW_TAIL).setTint(w.shadows.tint).setDepth(rig?.depth ?? -3.5).setVisible(false);
    rig?.tails.push({ obj: spr, patch, tail, h: dh });
    return patch;
  }
  const s = w.shadows.add(spr, { key: SHADOW_BLOB, scale: 1.15 * big * (o.wide ?? 1), squash: o.flat ?? 1, foot });
  s.height = (0.3 * dh) / UNIT;
  return s;
}

/** A flier's shadow: a small, faint soft ellipse on the ground below, thrown by its height (`Shadow.height`: 1 = `UNIT` px up). */
export function airShadow(w: Holder, spr: Img, o: { big?: boolean; height?: number } = {}): Shadow {
  const s = w.shadows.add(spr, { scale: o.big ? 1.6 : 0.6, foot: 0.9, squash: 0.4, alpha: ALPHA.air });
  s.height = o.height ?? (o.big ? 5 : 2.5);
  return s;
}

/** A cast's data (`setData('cast')`): its picture's scale, how far (texture px) its foot sits above the picture's origin, its turn in the stagger, and the light it was last turned to. */
export interface CastData {
  s: number;
  lift: number;
  n: number;
  sig: number;
}
const NEVER = -1e9;
let casts = 0;
/** A cast's picture is drawn this many times smaller than the prop's and shown this many times larger. */
const SHRINK = 2;

/**
 * A prop's cast shadow (`Play.place`, the hub's `stand`): its picture flipped and blurred, its foot at the top of the image,
 * laid on the ground under `img` (feet at its origin); `ShadowView` turns and stretches it to the lean every frame. `lift` px up
 * from the foot, where a prop's base is deeper than its drawing's last row. With `foot` (a row of the picture, texture px from
 * its top: `contactRow`) the shadow is thrown from that line instead: the rows below it are left out and its height is counted
 * from there. `paint` is the land's, or a tint; `soft` the blur. Returns the image (the cull's to hide).
 */
export function sunCast(scene: Phaser.Scene, img: Img, paint: Paint | number, depth: number, lift = 0, o: { foot?: number; soft?: number } = {}): Img {
  const s = img.scaleX, look = castLook(scene, img.frame, img.originY, img.height, lift, o);
  const out = scene.add.image(img.x, img.y - look.lift * s, look.texture, look.frame).setOrigin(0.5, look.oy).setScale(s * SHRINK).setTint(typeof paint === 'number' ? paint : shadeOf(paint)).setDepth(depth).setAlpha(ALPHA.cast);
  out.setData('cast', { s, lift: look.lift, n: casts++, sig: NEVER } satisfies CastData);
  return out;
}

/** A cast's picture on its page and how it hangs from the thing that casts it (`castLook`). */
interface CastLook {
  texture: string;
  frame?: string;
  /** The picture's origin row (a share of its height) and how far (texture px) the thing's foot sits above its own origin. */
  oy: number;
  lift: number;
}

/** A texture frame's name for keys and caches: a frame of an atlas is told from the texture's whole picture. */
const nameOf = (fr: Phaser.Textures.Frame) => (fr.name === '__BASE' ? fr.texture.key : `${fr.texture.key}|${fr.name}`);

/**
 * The cast of a picture (a frame, drawn with its origin at `originY` and `height` tall): its flipped, blurred silhouette made once
 * per picture on a shared page (`castFrame`), and where it hangs. `sunCast` makes an image from it; `recast` points one the pool
 * reuses at another picture.
 */
function castLook(scene: Phaser.Scene, fr: Phaser.Textures.Frame, originY: number, height: number, lift: number, o: { foot?: number; soft?: number }): CastLook {
  const src = nameOf(fr), pad = 4, soft = o.soft ?? 2;
  const w = fr.cutWidth, h = fr.cutHeight, rows = o.foot === undefined ? h : Math.max(1, Math.min(h, Math.round(o.foot)));
  const key = o.foot === undefined && soft === 2 ? `${src}~ss` : `${src}~ss${rows}.${soft}`;
  // Drawn at 1/SHRINK of the picture (a soft shadow has no detail to lose), so a page holds four times as many.
  const K = SHRINK, fw = Math.ceil(w / K) + pad * 2, fh = Math.ceil(rows / K) + pad * 2;
  const at = castFrame(scene, key, fw, fh, (c) => {
    c.filter = `blur(${soft / K}px)`;
    c.setTransform(1 / K, 0, 0, -1 / K, pad, pad + rows / K);
    c.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, w, rows, 0, 0, w, rows);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.filter = 'none';
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#fff';
    c.fillRect(0, 0, fw, fh);
  });
  // The prop's origin is its foot: the texture row there lands on the foot (its rows below it fall away from the sun's side).
  if (o.foot !== undefined) lift = originY * h - rows;
  const below = o.foot !== undefined ? 0 : (1 - originY) * height;
  return { texture: at.texture, frame: at.frame, oy: (pad + below / K) / fh, lift };
}

/** A cast with no picture yet, hidden, for a pool: give it one with `recast`. */
export function blankCast(scene: Phaser.Scene, paint: Paint | number, depth: number): Img {
  const out = scene.add.image(0, 0, SHADOW_BLOB).setTint(typeof paint === 'number' ? paint : shadeOf(paint)).setDepth(depth).setAlpha(ALPHA.cast).setVisible(false);
  out.setData('cast', { s: 1, lift: 0, n: casts++, sig: NEVER } satisfies CastData);
  return out;
}

/**
 * Point a cast image (made by `sunCast`) at another picture: a prop's cast from a pool, reused for a prop of another look. Its
 * place is the caller's (the picture's position minus `lift` x `scale` up), and it is turned to the light again at once.
 */
export function recast(scene: Phaser.Scene, cast: Img, fr: Phaser.Textures.Frame, scale: number, originY: number, o: { foot?: number; soft?: number } = {}) {
  const look = castLook(scene, fr, originY, fr.realHeight, 0, o), d = cast.getData('cast') as CastData;
  cast.setTexture(look.texture, look.frame).setOrigin(0.5, look.oy);
  d.s = scale;
  d.lift = look.lift;
  d.sig = NEVER;
}

/** The sun's and the night's share as one number, fine enough that a change in it is a visible turn of every cast. */
const lightSig = (rig: Rig) => Math.round(rig.sun.x * 60) * 10007 + Math.round(rig.sun.y * 60) * 101 + Math.round(rig.night * 30);
/** Is this cast's turn: never turned (or shown again), the sun has moved, or at night its place in the stagger. */
const due = (d: CastData, still: boolean, sig: number, frame: number) => d.sig === NEVER || (still ? d.sig !== sig : (frame + d.n) % STAGGER === 0);
/** Turn a cast to the light now (its lean capped at `reach`). */
function turn(c: Img, d: CastData, rig: Rig, o: { x: number; y: number; a: number }, sig: number, still: boolean, reach: number, alpha: number) {
  throwAt(c.x, c.y + d.lift * d.s, rig.sun, rig.night, rig.lights, o);
  const len = Math.hypot(o.x, o.y), k = len > reach ? reach / len : 1;
  c.setRotation(Math.atan2(o.y, o.x) - Math.PI / 2).setScale(d.s * SHRINK, d.s * SHRINK * len * k).setAlpha(alpha * o.a);
  d.sig = still ? sig : NEVER + 1;
}
/** By night every Nth frame turns a given cast. */
const STAGGER = 3;

/** The lowest row of a picture (texture px from its top, the row's bottom edge) with something in it: where it stands, unless `FLOOR` says otherwise. */
export function contactRow(img: { frame: Phaser.Textures.Frame }): number {
  // A frame of an atlas is told by its own name (`FLOOR` rows are written by picture name).
  const fr = img.frame, h = fr.cutHeight, set = floorOf(fr.name === '__BASE' ? fr.texture.key : fr.name).foot;
  if (set !== undefined) return Math.round(set * h);
  const key = `${fr.texture.key}|${fr.name}`, known = rowsOf.get(key);
  if (known !== undefined) return known;
  // The bottom rows first, a band at a time: the floor is almost always near the bottom, and a tall picture (a mast) is not read whole.
  const w = fr.cutWidth, band = 48, c = document.createElement('canvas');
  c.width = w;
  c.height = band;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  let row = 1;
  for (let bottom = h; bottom > 0; bottom -= band) {
    const n = Math.min(band, bottom);
    g.clearRect(0, 0, w, band);
    g.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY + bottom - n, w, n, 0, 0, w, n);
    const px = g.getImageData(0, 0, w, n).data;
    let y = n - 1;
    for (; y >= 0; y--) {
      let hit = false;
      for (let x = 0; x < w && !hit; x++) hit = px[(y * w + x) * 4 + 3] > CONTACT.seen;
      if (hit) break;
    }
    if (y >= 0) {
      row = bottom - n + y + 1;
      break;
    }
  }
  rowsOf.set(key, row);
  return row;
}
const rowsOf = new Map<string, number>();

/** Lay each fine shadow's tail along the lean at its thing's feet (hidden with it). */
function moveTails(rig: Rig, o: { x: number; y: number; a: number }) {
  for (const t of rig.tails) {
    const { obj, patch, tail } = t;
    const show = !!obj.scene && obj.visible && obj.active;
    if (tail.visible !== show) tail.setVisible(show);
    if (!show) continue;
    const fx = obj.x, fy = obj.y + obj.displayHeight * -0.02 + patch.raise;
    throwAt(fx, fy, rig.sun, rig.night, rig.lights, o);
    const len = Math.min(rig.reach, Math.hypot(o.x, o.y)), L = TAIL_LEN * t.h * len;
    tail.setPosition(fx, fy).setRotation(Math.atan2(o.y, o.x)).setScale((2 * L) / TAIL.w, (0.22 * t.h) / (TAIL.wide * 2)).setAlpha(rig.alpha * o.a);
  }
  rig.tails = rig.tails.filter((t) => {
    if (t.obj.scene) return true;
    t.tail.destroy();
    return false;
  });
}

/**
 * The hub's prop shadows (guesses, tuned by eye): how far a cast reaches (its lean per unit of height: lamps are overhead), its
 * alpha and softness (blur, texture px); a wall piece's patch: width (x its footprint), flatness, size, nudge from the light and
 * alpha; the band of bottom rows its footprint reads from, and the alpha a pixel needs to count as something there.
 */
const CONTACT = { reach: 0.55, alpha: 0.78, soft: 5, wide: 1.3, flat: 0.34, min: 12, max: 30, nudge: 9, patch: 0.95, band: 0.05, seen: 60 };

/** Where a picture's opaque pixels touch the floor (its bottom rows at the origin): the centre's offset from the origin and the width, in texture px. */
function footprint(img: Img): { cx: number; w: number } {
  const fr = img.frame, w = fr.cutWidth, h = fr.cutHeight;
  const foot = Math.max(1, Math.min(h, Math.round(img.originY * h)));
  const key = `${fr.texture.key}|${fr.name}|${img.originX}|${img.originY}`;
  const known = prints.get(key);
  if (known) return known;
  const rows = Math.min(foot, Math.max(4, Math.round(h * CONTACT.band)));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = rows;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY + foot - rows, w, rows, 0, 0, w, rows);
  const px = g.getImageData(0, 0, w, rows).data;
  let lo = w, hi = -1;
  for (let y = 0; y < rows; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > CONTACT.seen) (lo = Math.min(lo, x), (hi = Math.max(hi, x)));
  const ox = img.originX * w, out = hi < lo ? { cx: 0, w: w * 0.5 } : { cx: (lo + hi + 1) / 2 - ox, w: hi - lo + 1 };
  prints.set(key, out);
  return out;
}
const prints = new Map<string, { cx: number; w: number }>();

/**
 * The hub's shadows: the kit's blobs and fine tails as the land's. By day the deck's own light, fixed (`lean`); at night (`night`
 * 1: the hub is always night) they lean away from the lights around them as the mission's do (`throwAt`): give it those
 * lights each frame (`lights`), and where none reaches they fall to the fixed lean, faint. A prop gets `stand`: its silhouette
 * thrown short from its contact line, or, set against a wall, a small patch under its feet.
 */
export class DeckShadows {
  readonly shadows: Shadows;
  private rig: Rig;
  private o = { x: 0, y: 0, a: 1 };
  /** The props' casts (`stand`). */
  private casts: { img: Img; cast: Img; d: CastData }[] = [];
  private frame = 0;
  /** A wall piece's patch (`stand`). */
  private nudge = CONTACT.nudge;
  private wide = CONTACT.wide;
  private contacts: { img: Img; patch: Img; fp: { cx: number; w: number } }[] = [];
  constructor(private scene: Phaser.Scene, o: { tint: number; lean: Vec; depth: number; alpha: number; night?: number; reach?: number }) {
    bake(scene);
    this.shadows = new Shadows(scene, o.depth);
    this.shadows.tint = o.tint;
    this.shadows.alpha = o.alpha;
    this.shadows.light = { x: o.lean.x * UNIT, y: o.lean.y * UNIT };
    const rig: Rig = (this.rig = { sun: o.lean, night: o.night ?? 0, lights: [], tails: [], depth: o.depth, alpha: o.alpha, reach: o.reach ?? 1 });
    rigs.set(this, rig);
    if (rig.night > 0)
      this.shadows.lean = (x, y, out) => {
        throwAt(x, y, rig.sun, rig.night, rig.lights, out);
        out.x *= UNIT;
        out.y *= UNIT;
      };
  }
  /** The lights that throw this frame (ground positions; night only). */
  lights(src: Src[]) {
    this.rig.lights = src;
  }
  /** The mood's light: how much of the lean is the lights' (`night`, 0..1), the sun's lean, and how far (px) and wide (x the footprint) a contact shadow is thrown. */
  mood(o: { night: number; sun: Vec; nudge: number; wide: number }) {
    this.rig.night = o.night;
    this.rig.sun = o.sun;
    this.nudge = o.nudge;
    this.wide = o.wide;
  }
  /** A shadow for something on the deck (the Communicator, an NPC: `fine`). */
  add(spr: Img, o: { fine?: boolean } = {}) {
    return groundShadow(this, spr, o);
  }
  /**
   * A standing prop's shadow: its silhouette thrown short from its contact line (`footline.ts`) away from the lights, soft. A piece
   * against a wall (`wall`) casts only a small soft patch under its feet. It goes with the prop.
   */
  stand(img: Img, depth: number): Img {
    if (floorOf(img.texture.key).wall) {
      const patch = this.scene.add.image(img.x, img.y, SHADOW_BLOB).setTint(this.shadows.tint).setDepth(depth);
      this.contacts.push({ img, patch, fp: footprint(img) });
      img.once(Phaser.GameObjects.Events.DESTROY, () => patch.destroy());
      return patch;
    }
    const cast = sunCast(this.scene, img, this.shadows.tint, depth, 0, { foot: contactRow(img), soft: CONTACT.soft });
    this.casts.push({ img, cast, d: cast.getData('cast') as CastData });
    img.once(Phaser.GameObjects.Events.DESTROY, () => cast.destroy());
    return cast;
  }
  update() {
    this.shadows.update();
    const o = this.o, rig = this.rig, on = this.shadows.enabled, frame = this.frame++;
    const v = this.scene.cameras.main.worldView, m = 220;
    const still = rig.night < 0.02, sig = lightSig(rig);
    this.casts = this.casts.filter((c) => c.cast.scene);
    for (const { img, cast, d } of this.casts) {
      // Off screen (a cast reaches a prop's height from its foot at most), or hidden: asleep; turned the moment it wakes.
      const show = on && img.visible && img.x > v.x - m && img.x < v.right + m && img.y > v.y - m && img.y < v.bottom + m + 200;
      if (cast.visible !== show) cast.setVisible(show);
      if (!show) {
        d.sig = NEVER;
        continue;
      }
      if (!due(d, still, sig, frame)) continue;
      cast.setPosition(img.x, img.y - d.lift * d.s);
      turn(cast, d, rig, o, sig, still, CONTACT.reach, CONTACT.alpha);
    }
    this.contacts = this.contacts.filter((c) => c.patch.scene);
    for (const { img, patch, fp } of this.contacts) {
      const show = on && img.visible;
      if (patch.visible !== show) patch.setVisible(show);
      if (!show) continue;
      const s = img.scaleX, w = fp.w * s * this.wide, h = Math.min(CONTACT.max, Math.max(CONTACT.min, w * CONTACT.flat));
      throwAt(img.x + fp.cx * s, img.y, rig.sun, rig.night, rig.lights, o);
      const k = Math.min(1, Math.hypot(o.x, o.y)) / (Math.hypot(o.x, o.y) || 1) * this.nudge;
      patch.setPosition(img.x + fp.cx * s + o.x * k, img.y - h * 0.15 + o.y * k).setDisplaySize(w, h).setAlpha(CONTACT.patch * o.a);
    }
    if (on) moveTails(this.rig, this.o);
    else for (const t of this.rig.tails) t.tail.setVisible(false);
  }
}

export class ShadowView extends ViewBase {
  private loot = new Map<number, Img>();
  private seeps = new Map<number, Img>();
  private seams = new Map<number, Img>();
  /** The props' cast shadows (`sunCast`). */
  private casts: Img[] = [];
  private rig: Rig;
  private scanT = 0;
  private frame = 0;
  private o = { x: 0, y: 0, a: 1 };
  /** The mesas' (and a dungeon's walls') shadows, over the painted ground. */
  private mesas: MesaShadows;

  constructor(host: PlayHost) {
    super(host);
    this.rig = rigs.get(host.w)!;
    this.mesas = new MesaShadows(this.scene, host.groundKey, { depth: -9.8, tint: this.w.shadows.tint });
    this.scan();
    // A cast made later (a prop's, when it breaks) is found this frame, not within two seconds, so it never shows unturned.
    this.scene.events.on('cast-added', this.rescan, this);
  }

  private rescan() {
    this.scanT = 0;
  }

  /** Find the props' casts (made by `Play.place` and the places) to keep in line with the light. */
  private scan() {
    const known = new Set(this.casts);
    for (const o of this.scene.children.list) {
      const im = o as Img;
      if (im.type === 'Image' && !known.has(im) && im.getData('cast')) this.casts.push(im);
    }
  }

  update(dt: number) {
    const rig = this.rig, sim = this.sim, host = this.host;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 2;
      this.scan();
      this.casts = this.casts.filter((c) => c.scene);
    }
    // The sun turns with the clock; by night the lights throw (down a dungeon: only lights).
    rig.night = host.night();
    rig.sun = host.down ? sunLean(12) : sunLean(sim.day.hour);
    this.gather();
    const o = this.o, v = this.scene.cameras.main.worldView;
    this.mesas.update(v, (x, y, out) => throwAt(x, y, rig.sun, rig.night, rig.lights, out), this.w.shadows.enabled);
    if (!this.w.shadows.enabled) {
      for (const t of rig.tails) t.tail.setVisible(false);
      return;
    }
    const frame = this.frame++, still = rig.night < 0.02, sig = lightSig(rig);
    for (const c of this.casts) {
      const d = c.data.get('cast') as CastData;
      // Hidden by the cull: asleep, and turned the moment it shows again.
      if (!c.visible) {
        d.sig = NEVER;
        continue;
      }
      if (due(d, still, sig, frame)) turn(c, d, rig, o, sig, still, 1e9, ALPHA.cast);
    }
    moveTails(rig, o);
    this.drawLoot(v);
    this.drawSites();
  }

  /** The lights that throw shadows at night: the crew's lamps, the enemies' lights, the lift's. */
  private gather() {
    const rig = this.rig;
    rig.lights.length = 0;
    if (rig.night < 0.05) return;
    for (const l of this.host.lamps) rig.lights.push({ x: l.x, y: l.y + 22, r: l.r, i: l.i });
    for (const l of this.host.foeLights()) if (l.visible) rig.lights.push({ x: l.x, y: l.y + 20, r: l.radius, i: l.intensity });
    const lift = this.sim.lift;
    if (!this.host.down && this.host.rise() < 5) rig.lights.push({ x: lift.x, y: lift.y + 10, r: 200, i: 0.5 });
  }

  /** A patch on the ground, leaning with the light as a thing `h` px tall would. */
  private patch(img: Img, x: number, y: number, wide: number, h: number, alpha: number) {
    const rig = this.rig, o = this.o;
    throwAt(x, y, rig.sun, rig.night, rig.lights, o);
    img.setPosition(x + o.x * h * 0.5, y + o.y * h * 0.5).setScale(wide / 64, wide / 128).setAlpha(alpha * o.a).setVisible(true);
  }

  private make(): Img {
    return this.scene.add.image(0, 0, SHADOW_BLOB).setTint(this.w.shadows.tint).setDepth(-3.5);
  }

  /** Pickups lie on the ground and bob a little above it: their shadow stays down. */
  private drawLoot(v: Phaser.Geom.Rectangle) {
    const sim = this.sim;
    for (const l of sim.loot) {
      const near = l.x > v.x - 60 && l.x < v.right + 60 && l.y > v.y - 60 && l.y < v.bottom + 60;
      let img = this.loot.get(l.id);
      if (!near) {
        img?.setVisible(false);
        continue;
      }
      if (!img) this.loot.set(l.id, (img = this.make()));
      const unique = (l.kind === 'part' && PARTS[l.part!].unique) || l.kind === 'core';
      this.patch(img, l.x, l.y + 2, unique ? 34 : 22, 10, ALPHA.ground * 0.85);
    }
    for (const [id, img] of this.loot) if (!sim.loot.some((l) => l.id === id)) {
      img.destroy();
      this.loot.delete(id);
    }
  }

  /** The tap and the coal seams stand in the ground, shrinking as they are drained and mined. */
  private drawSites() {
    for (const s of this.sim.seeps) this.site(this.seeps, s, 52 * (0.5 + 0.5 * (s.amount / s.max)), s.amount > 0 ? 1 : 0.4, 8, 40);
    for (const s of this.sim.seams) this.site(this.seams, s, 64 * (0.45 + 0.55 * (s.amount / s.max)), s.amount > 0 ? 1 : 0.45, 14, 18);
  }

  private site(map: Map<number, Img>, s: Seep | Seam, wide: number, a: number, dy: number, h: number) {
    let img = map.get(s.id);
    if (!img) map.set(s.id, (img = this.make()));
    this.patch(img, s.x, s.y + dy, wide, h, ALPHA.ground * a);
  }

  debug() {
    const s = this.rig.sun;
    return { shadows: { sun: { x: +s.x.toFixed(2), y: +s.y.toFixed(2) }, night: +this.rig.night.toFixed(2), casts: this.casts.length, lights: this.rig.lights.length, tails: this.rig.tails.length, loot: this.loot.size } };
  }

  destroy() {
    this.scene.events.off('cast-added', this.rescan, this);
    this.mesas.destroy();
    for (const m of [this.loot, this.seeps, this.seams]) for (const i of m.values()) i.destroy();
    for (const t of this.rig.tails) t.tail.destroy();
  }
}
