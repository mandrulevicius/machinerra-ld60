/**
 * The Communicator's kick on screen (P7; the pose curves and the leg's two-bone maths are `kick.ts`). The sim's kick
 * (`controller.ts`) lands on the press; this only draws its beat, so there is no wind-up. `CommView` owns one `CommKick`.
 * Two looks, `KICK_LOOK` (`?kicklook=legs`, dev `kicklook legs|pose`):
 *  - 'pose' (default): no drawn legs. His own painted walk frame with the widest stride (`kickFrame`, `comm.ts`; per view, the
 *    five views flipped for the left) shows from the press, held through the snap and the hold, while the body lunges and leans
 *    toward the aim; a whoosh wedge and two afterimages smear along the kicking side from the painted toe (found in the frame's
 *    alpha, toward the aim), a ring marks the contact when something was hit; the recovery fades the pose out over his real frame.
 *    Not built: "rotate his leg" (cut the painted leg at the hip and swing it toward the aim) if the stride frame feels off.
 *  - 'legs': his painted body is cut off at the hip and both legs are drawn in code (a thigh and a shin with a boot, tubes
 *    filled from the painted camo of his own leg), the knee chambered, then snapped out along the aim; in all 8 directions the
 *    leg lies in the plane along the aim, drawn flattened by the ground's slant (the shovel's swing does the same), in front of
 *    him when kicking down the screen and behind when kicking up it. Its boots do not match his painted ones.
 */
import Phaser from 'phaser';
import { commFlip, kickFrame, type CommDir } from './comm';
import { LINE } from './house';
import { KICK_ANIM, POSE_ANIM, footAt, kickPose, twoBone, type KickPose, type V2 } from './kick';
import type { Img } from './playhost';

export type KickLook = 'pose' | 'legs';
/** Which look the kick has by default. */
export const KICK_LOOK: KickLook = 'pose';
/** The look in use: a display choice (dev `kicklook`, `?kicklook=`), never saved. */
export const kickLook: { now: KickLook } = { now: KICK_LOOK };
if (typeof location !== 'undefined') {
  const q = new URLSearchParams(location.search).get('kicklook');
  if (q === 'pose' || q === 'legs') kickLook.now = q;
}

/** The pose look's body: the lunge toward the aim (px; across, down the screen), the lean (degrees, across) and the stretch at full extension. */
const POSE = { lunge: [9, 6], lean: 7, stretch: 0.04, squeeze: 0.02, near: 0.07 } as const;
/** The afterimages' lag behind the body (seconds), and the whoosh's reach back from the toe (px) at its strongest. */
const GHOST = [0.018, 0.04] as const;
const WHOOSH = 34;

/** The leg's pieces, display px at his size: a thigh 14 long and 11 wide, a shin 14 long with the boot below it (a toe 5 ahead, a heel 4 behind). */
const LEG = { len: 14, thigh: [11, 14], shin: [14, 22] } as const;
/** His hip's height over his feet, as a share of his height; how far the ankle reaches and the boot's length past it, in hip heights. */
const HIP = 0.4, REACH = 0.9;
/** How the body moves with the kick: lean (degrees), the lunge toward the aim (px) and the stretch. */
const BODY = { lean: 5, lunge: [5, 3.5], squash: [0.05, 0.04] } as const;
/** The ground's slant: a leg's length along the aim drawn this much on screen when the aim runs down it (as the shovel's arc). */
const SLANT = 0.62;
/** Where the painted body is cut (a share of its height from the top): just under the belt. */
const CUT = 0.61;
const TEX = { thigh: 'kick-thigh', shin: 'kick-shin' };

/** Bake the leg's two pieces once per texture manager (2x, so they come out as sharp as his frames). Tubes filled from the camo of his painted leg. */
function bake(scene: Phaser.Scene) {
  if (scene.textures.exists(TEX.thigh)) return;
  // His camo: a patch of the painted thigh (front view), laid over its own average colour.
  const tile = document.createElement('canvas');
  tile.width = 24;
  tile.height = 24;
  const t = tile.getContext('2d')!;
  let base = '#7a4a2c';
  const tex = scene.textures.get('atlas');
  if (tex.has('communicator/front-0')) {
    const fr = tex.get('communicator/front-0');
    const src = fr.source.image as CanvasImageSource;
    t.drawImage(src, fr.cutX + (36 - fr.x), fr.cutY + (86 - fr.y), 24, 24, 0, 0, 24, 24);
    const d = t.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) (r += d[i]), (g += d[i + 1]), (b += d[i + 2]), n++;
    if (n > 50) base = `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  }
  const soot = '#1d1a17';
  const tube = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    c.beginPath();
    c.roundRect(x, y, w, h, r);
  };
  const fill = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    tube(c, x, y, w, h, r);
    c.fillStyle = base;
    c.fill();
    c.save();
    tube(c, x, y, w, h, r);
    c.clip();
    c.globalAlpha = 0.85;
    c.fillStyle = c.createPattern(tile, 'repeat')!;
    c.fill();
    c.globalAlpha = 1;
    // Lit from the top left: a light edge down the left and a dark one down the right.
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, 'rgba(255,230,190,0.38)');
    g.addColorStop(0.45, 'rgba(255,230,190,0)');
    g.addColorStop(1, 'rgba(20,10,5,0.5)');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.restore();
    tube(c, x, y, w, h, r);
    c.strokeStyle = soot;
    c.lineWidth = 2;
    c.stroke();
  };
  const [tw, th] = LEG.thigh, [sw, sh] = LEG.shin;
  const a = scene.textures.createCanvas(TEX.thigh, tw * 2, th * 2)!;
  fill(a.getContext(), 1.5, 1.5, tw * 2 - 3, th * 2 - 3, 5);
  a.refresh();
  const b = scene.textures.createCanvas(TEX.shin, sw * 2, sh * 2)!;
  const c = b.getContext();
  fill(c, sw - 8, 1.5, 16, LEG.len * 2 + 1, 5);
  // The knee pad over the joint, the boot below: dark leather, a pale cap on the toe, a black sole.
  c.beginPath();
  c.ellipse(sw, 6, 10, 6, 0, 0, Math.PI * 2);
  c.fillStyle = '#3a2a20';
  c.fill();
  c.strokeStyle = soot;
  c.lineWidth = 2;
  c.stroke();
  c.beginPath();
  c.moveTo(sw - 10, LEG.len * 2 - 2);
  c.lineTo(sw + 9, LEG.len * 2 - 2);
  c.lineTo(sw + 11, LEG.len * 2 + 8);
  c.lineTo(sw + 11, sh * 2 - 4);
  c.lineTo(sw - 10, sh * 2 - 4);
  c.closePath();
  c.fillStyle = '#4a3020';
  c.fill();
  c.stroke();
  c.fillStyle = '#16100c';
  c.fillRect(sw - 10, sh * 2 - 8, 21, 4);
  c.fillStyle = 'rgba(255,225,180,0.45)';
  c.fillRect(sw - 8, LEG.len * 2 + 1, 7, 3);
  c.fillStyle = '#7a5a40';
  c.beginPath();
  c.moveTo(sw + 5, LEG.len * 2 + 12);
  c.lineTo(sw + 11, LEG.len * 2 + 8);
  c.lineTo(sw + 11, sh * 2 - 8);
  c.lineTo(sw + 4, sh * 2 - 8);
  c.closePath();
  c.fill();
  b.refresh();
}

/** One leg's two pieces. */
interface Leg {
  thigh: Img;
  shin: Img;
}

export class CommKick {
  /** Seconds since the kick began, or -1. */
  private t = -1;
  private a = 0;
  private hits = 0;
  private legs: Leg[] = [];
  private trail: { x: number; y: number }[] = [];
  /** Where the boot touched (the ring) and how long ago. */
  private hit: { x: number; y: number; t: number } | null = null;
  private pose: KickPose = { cham: 0, ext: 0, lean: 0 };
  private foot: V2 = { s: 0, z: 0 };
  private bones = { ks: 0, kz: 0, as: 0, az: 0 };
  /** The pose look: the stride fading out over his real frame, the afterimages, and the frames' alpha. */
  private over: Phaser.GameObjects.Image | null = null;
  private ghosts: Phaser.GameObjects.Image[] = [];
  private masks = new Map<string, { w: number; h: number; a: Uint8Array }>();

  constructor(private scene: Phaser.Scene, private gfx: () => Phaser.GameObjects.Graphics) {}

  /** The kick began (the sim's `swing` event with `kick`): aim `a`, `hits` things struck. */
  start(a: number, hits: number) {
    this.t = 0;
    this.a = a;
    this.hits = hits;
    this.trail.length = 0;
    this.hit = null;
  }

  /** Drawing it now: his painted legs are hidden. */
  get active() {
    return this.t >= 0;
  }

  /**
   * Pose the body and the legs for this frame. `spr` is his sprite as the robots' loop placed it this frame (feet at its origin), `depth` the depth to draw round.
   * Call after his frame is set and before anything that hangs off his sprite (the pack, the hat, the cans).
   */
  update(spr: Img, dt: number, visible: boolean, dir: CommDir) {
    const legs = kickLook.now === 'legs';
    if (this.t >= 0) this.t += dt;
    const p = this.t >= 0 ? kickPose(this.t, legs ? KICK_ANIM : POSE_ANIM) : null;
    if (!p) {
      if (this.t >= 0) this.finish(spr);
      for (const l of this.legs) l.thigh.setVisible(false), l.shin.setVisible(false);
      for (const g of this.ghosts) g.setVisible(false);
      this.over?.setVisible(false);
      return;
    }
    this.pose = p;
    if (legs) this.updateLegs(spr, p, dt, visible);
    else this.updatePose(spr, p, dt, visible, dir);
  }

  /** The pose look: see the header. `spr` has his real frame; for the snap and the hold it takes the stride's. */
  private updatePose(spr: Img, p: KickPose, dt: number, visible: boolean, dir: CommDir) {
    const ax = Math.cos(this.a), ay = Math.sin(this.a);
    const flip = commFlip(dir, ax < 0 ? -1 : 1);
    const name = kickFrame(dir);
    const { snap, hold } = POSE_ANIM;
    const recover = this.t >= snap + hold;
    if (!this.over) {
      this.over = this.scene.add.image(0, 0, 'atlas', name).setVisible(false);
      for (let i = 0; i < GHOST.length; i++) this.ghosts.push(this.scene.add.image(0, 0, 'atlas', name).setTint(0xfff3d6).setTintMode(Phaser.TintModes.FILL).setVisible(false));
    }
    // The body: lunging and leaning toward the aim, stretching a little at full reach.
    const base = { x: spr.x, y: spr.y, angle: spr.angle, sx: spr.scaleX, sy: spr.scaleY, ox: spr.originX, oy: spr.originY };
    const place = (img: Img | Phaser.GameObjects.Image, ext: number) => {
      const near = 1 + POSE.near * ay * ext; // a kick down the screen comes at us, up it goes away: his size says so
      img.setPosition(base.x + ax * POSE.lunge[0] * ext, base.y + ay * POSE.lunge[1] * ext).setAngle(base.angle + POSE.lean * ax * ext).setScale(base.sx * (1 - POSE.squeeze * ext) * near, base.sy * (1 + POSE.stretch * ext) * near);
    };
    if (!recover) spr.setFrame(name).setFlipX(flip);
    place(spr, p.ext);
    // The recovery: his real frame is back under it, the stride fades out over it.
    const over = this.over;
    over.setVisible(visible && recover).setFrame(name).setFlipX(flip).setOrigin(base.ox, base.oy).setAlpha(p.ext).setDepth(spr.depth + 0.02);
    place(over, p.ext);
    // The afterimages: the stride a beat ago, pale, behind him; only while the body is moving.
    this.ghosts.forEach((g, i) => {
      const was = kickPose(this.t - GHOST[i], POSE_ANIM)?.ext ?? 0;
      const move = Math.min(1, Math.abs(p.ext - was) * 4);
      g.setVisible(visible && move > 0.02).setFrame(name).setFlipX(flip).setOrigin(base.ox, base.oy).setAlpha(0.22 * move / (i + 1)).setDepth(spr.depth - 0.05);
      place(g, was);
    });
    if (!visible) return;
    const toe = this.toe(name, flip, ax, ay, spr);
    this.trailAdd(toe.x, toe.y, p, visible);
    this.drawTrail(dt);
    // The whoosh: a wedge from behind the toe (where the boot came from, a little low) to the toe, strongest at the press.
    const s = 1 - Math.min(1, this.t / (snap + hold + 0.05));
    if (s > 0.02) {
      const len = WHOOSH * (0.35 + 0.65 * s), w = 5.5 * s + 1;
      const tx = toe.x - ax * len, ty = toe.y - ay * len * 0.62 + 4;
      const nx = -ay * w, ny = ax * w * 0.62;
      this.gfx().fillStyle(0xfff3d6, 0.5 * s).fillTriangle(tx, ty, toe.x + nx, toe.y + ny, toe.x - nx, toe.y - ny);
    }
  }

  /** The painted toe, on screen: the opaque pixel of the frame's lower part furthest along the aim (flipped as drawn), the neighbours averaged. */
  private toe(name: string, flip: boolean, ax: number, ay: number, spr: Img) {
    const m = this.mask(name);
    let best = -1e9;
    const hits: number[] = [];
    for (let y = Math.floor(m.h * 0.6); y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (m.a[y * m.w + x] < 128) continue;
        const px = flip ? m.w - 1 - x : x;
        const d = (px - m.w / 2) * ax + (y - m.h) * ay;
        if (d > best + 3) hits.length = 0, (best = d);
        if (d > best - 3) hits.push(px, y);
      }
    }
    let sx = 0, sy = 0;
    for (let i = 0; i < hits.length; i += 2) (sx += hits[i]), (sy += hits[i + 1]);
    const n = hits.length / 2 || 1;
    const lx = (sx / n - m.w * spr.originX) * spr.scaleX, ly = (sy / n - m.h * spr.originY) * spr.scaleY;
    const r = spr.rotation, c = Math.cos(r), s = Math.sin(r);
    return { x: spr.x + lx * c - ly * s, y: spr.y + lx * s + ly * c };
  }

  /** A frame's alpha, read once (the frame's size, trimmed pixels put back). */
  private mask(name: string) {
    let m = this.masks.get(name);
    if (m) return m;
    const fr = this.scene.textures.getFrame('atlas', name);
    const w = fr.realWidth, h = fr.realHeight;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.drawImage(fr.source.image as CanvasImageSource, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, fr.x, fr.y, fr.cutWidth, fr.cutHeight);
    const d = c.getImageData(0, 0, w, h).data;
    const a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    m = { w, h, a };
    this.masks.set(name, m);
    return m;
  }

  /** The legs look: see the header. */
  private updateLegs(spr: Img, p: KickPose, dt: number, visible: boolean) {
    if (!this.legs.length) this.make();
    const ax = Math.cos(this.a), ay = Math.sin(this.a);
    // The body: cut off at the hip so the painted legs do not show under the drawn ones, leaning, lunging, stretching.
    const dh = spr.displayHeight;
    spr.setCrop(0, 0, spr.frame.realWidth, spr.frame.realHeight * CUT);
    spr.angle += p.lean * BODY.lean * ax;
    const go = p.ext - 0.3 * p.cham;
    spr.x += ax * BODY.lunge[0] * go;
    spr.y += ay * BODY.lunge[1] * go;
    spr.scaleY *= 1 - BODY.squash[0] * p.cham + BODY.squash[1] * p.ext;
    spr.scaleX *= 1 + BODY.squash[0] * 0.5 * p.cham - BODY.squash[1] * 0.5 * p.ext;
    const H = HIP * dh; // his hip's height; the art of the legs is drawn for 30
    const R = REACH * H;
    const l = 0.47 * H;
    const u = (H / 30) * 0.5; // the pieces are baked at 2x
    // The kicking leg is on the aim's side; the other stands.
    const side = ax >= 0 ? 1 : -1;
    const wide = Math.abs(ay) > 0.7 ? 5 : Math.abs(ay) > 0.35 ? 3.5 : 1.2; // the legs' spread across the screen: wide seen from the front or back
    const feet = spr.y; // his feet on the ground
    const flipX = ax < 0;
    const front = ay >= -0.2;
    for (let i = 0; i < 2; i++) {
      const kicking = i === 0;
      const hipX = spr.x + (kicking ? side : -side) * wide;
      const leg = this.legs[i];
      if (kicking) footAt(p, H, R, this.foot, Math.abs(ay));
      else (this.foot.s = 0), (this.foot.z = 0.09 * H);
      const b = twoBone(H, this.foot.s, this.foot.z, l, l, this.bones);
      // (s, z) to the screen: s along the aim (the ground slants it), z up.
      const hx = hipX, hy = feet - H;
      // Kicking away up the screen the body hides the leg: it swings out to its side so the boot shows beside him.
      const out = kicking ? side * p.ext * Math.max(0, -ay) : 0;
      const kx = hipX + ax * b.ks + out * 6, ky = feet + ay * b.ks * SLANT - b.kz;
      const fx = hipX + ax * b.as + out * 11, fy = feet + ay * b.as * SLANT - b.az;
      const thighLen = Math.hypot(kx - hx, ky - hy), shinLen = Math.hypot(fx - kx, fy - ky);
      const depth = spr.depth + (kicking ? (front ? 0.6 : -0.6) : -0.3);
      leg.thigh.setVisible(visible).setPosition(hx, hy).setRotation(Math.atan2(ky - hy, kx - hx) - Math.PI / 2).setScale(u, (thighLen * 1.04) / (LEG.thigh[1] * 2)).setDepth(depth);
      leg.shin.setVisible(visible).setPosition(kx, ky).setRotation(Math.atan2(fy - ky, fx - kx) - Math.PI / 2).setFlipX(flipX).setScale(u * (kicking ? 1 + 0.3 * p.ext * Math.max(0, ay) : 1), shinLen / (LEG.len * 2)).setDepth(depth + 0.01);
      if (kicking) this.trailAdd(fx + (fx - kx) * 0.3, fy + (fy - ky) * 0.3, p, visible);
    }
    this.drawTrail(dt);
  }

  private make() {
    bake(this.scene);
    for (let i = 0; i < 2; i++) {
      const thigh = this.scene.add.image(0, 0, TEX.thigh).setOrigin(0.5, 0).setVisible(false);
      const shin = this.scene.add.image(0, 0, TEX.shin).setOrigin(0.5, 0).setVisible(false);
      this.legs.push({ thigh, shin });
    }
  }

  private finish(spr: Img) {
    this.t = -1;
    spr.setCrop();
    this.trail.length = 0;
  }

  /** The boot's path while the leg is out: the last few places of its toe, drawn as a fading streak; and the ring where it lands. */
  private trailAdd(x: number, y: number, p: KickPose, visible: boolean) {
    if (!visible) return;
    if (p.ext > 0.05 || this.trail.length) this.trail.push({ x, y });
    if (this.trail.length > 7) this.trail.shift();
    if (!this.hit && this.hits && p.ext > 0.97) this.hit = { x, y, t: 0 };
  }

  private drawTrail(dt: number) {
    const g = this.gfx();
    const n = this.trail.length;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      g.lineStyle(1.5 + 5 * k, 0xfff3d6, 0.5 * k * (this.pose.ext > 0.5 || this.t < 0.3 ? 1 : 0.6)).lineBetween(this.trail[i - 1].x, this.trail[i - 1].y, this.trail[i].x, this.trail[i].y);
    }
    if (this.hit) {
      this.hit.t += dt;
      const k = this.hit.t / 0.16;
      if (k < 1) g.lineStyle(LINE.accent, 0xfff3d6, 0.9 * (1 - k)).strokeEllipse(this.hit.x, this.hit.y, 10 + 34 * k, (10 + 34 * k) * 0.7);
    }
  }
}
