/**
 * An elite's claws and tentacles on screen (P50; the rules are `sim/limbs.ts`, the poses `limbpose.ts`). One claw set and one
 * tentacle set serve every kind (frames `foe/limb-*`, cut in `tools/mob-svg.cjs`), hung on the foe's painting at its `SOCKETS` row.
 * - **Claw** (a twisted elite's): an upper arm and a forearm with a pincer, the elbow solved by two bones; drawn back for the
 *   wind-up, swung through its half in the strike with the arm straightening, then folded home. The swoosh is a pale steel arc
 *   over the swing (a hit, not a warning: not red). The far claw is behind the body, the near one over it.
 * - **Tentacle** (a menacing elite's): a rope of steel plates ending in a lens. It hangs and sways; the wind-up rears it and the
 *   tip glows red (`DANGER`) while a red dot marks the locked spot; the strike snaps the rope to that spot with a crack, then it
 *   coils back. Red is nowhere else on a limb.
 * Cost: a tentacle is a rope of sprites, so only the `LIMB_CAP` menacing elites nearest the view's centre draw all `ROPE_FULL`
 * plates; the rest draw `ROPE_STUB` (the same code, fewer plates). A claw is two sprites. Off screen nothing is drawn.
 * `FoeView` owns the foe; this view only reads its sprite (position, turn, flip, alpha) and the sim's limbs. Nothing here is saved.
 */
import Phaser from 'phaser';
import { atlas } from '../../../harness/kit/assets';
import { DANGER, LINE } from './house';
import { ViewBase, kick, type G, type Img } from './playhost';
import { clawPose, newWhip, twoBone, whipPose, whipPoints, type ClawPose, type WhipPose } from './limbpose';
import { HORNET, LIMBS, LIMB_CAP, SOCKETS } from './sim/defs';
import type { Limb } from './sim/limbs';
import type { Hornet, SimEvent } from './sim/sim';
import type { Rope } from './chain';

/** Game px a drawing unit is on screen (`mob-svg.cjs`'s `mobHeight` 1.15), and an elite's size over its kind's (`FoeView`). */
const UNIT = 1.15;
const ELITE = HORNET.elite.scale * 0.9;
/** The parts' frames: their pivot as a fraction of the frame, (2 + px) / (w + 4) of the drawing in `mob-svg.cjs` (the SVG's margin is 2 units). */
const PART = {
  upper: { frame: 'foe/limb-claw-upper', pivot: [4.5 / 15, 0.5], len: 7.8 },
  fore: { frame: 'foe/limb-claw-fore', pivot: [4.5 / 22, 0.5], len: 15.1 },
  plate: { frame: 'foe/limb-tentacle-plate', pivot: [0.5, 0.5], len: 5.2 },
  tip: { frame: 'foe/limb-tentacle-tip', pivot: [2.6 / 13, 0.5], len: 8 },
} as const;
/** Plates in a full rope and in a stub. */
const ROPE_FULL = 9;
const ROPE_STUB = 2;
/** The off-screen margin beyond which nothing is drawn, px. */
const NEAR = 120;
const STEEL = 0xdfe8f0;

interface ClawV {
  upper: Img;
  fore: Img;
  pose: ClawPose;
}
interface WhipV {
  /** Where the rope is now (it follows the pose it is given, a little late), and the pose's points. */
  rope: Rope;
  want: Rope;
  n: number;
  plates: Img[];
  tip: Img;
  glow: Img;
  phase: number;
  pose: WhipPose;
}
interface Live {
  /** 0..1: how limp its limbs hang (eased with the stagger). */
  limp: number;
  claws?: ClawV[];
  whips?: WhipV[];
  hidden: boolean;
}

/** Staggered limbs (guesses): how fast they ease in and out (per second), the flail's rate (Hz), a claw's swing (rad) and its reach (share of the arm), a rope's side-to-side and sag (px at the tip). */
const LIMP_EASE = 14;
const LIMP = { hz: 3, claw: 0.8, ext: 0.5, whip: 10, sag: 8 };

const angleOf = (x: number, y: number) => Math.atan2(y, x);

export class LimbView extends ViewBase {
  private live = new Map<number, Live>();
  /** The foes drawing a full rope this frame. */
  private full = new Set<number>();
  private cand: { h: Hornet; d: number }[] = [];
  private sock = { x: 0, y: 0 };
  private elb = { ex: 0, ey: 0, tx: 0, ty: 0 };
  /** The frames' own scale (the atlas shows a 2x frame at x0.5). */
  private base = 0;
  /** How many menacing elites draw the full rope (`LIMB_CAP`; set it from the console to compare), and whether limbs are drawn at all (`false`: the measure's baseline). */
  cap = LIMB_CAP;
  on = true;

  update(dt: number, g: G) {
    const sim = this.sim;
    const view = this.scene.cameras.main.worldView;
    const now = this.scene.time.now / 1000;
    const cand = this.cand;
    cand.length = 0;
    for (const h of sim.hornets) {
      if (!this.on || !h.limbs || h.dead || !this.hornets.get(h.id)) continue;
      if (h.x < view.x - NEAR || h.x > view.right + NEAR || h.y < view.y - NEAR || h.y > view.bottom + NEAR) continue;
      cand.push({ h, d: Math.hypot(h.x - view.centerX, h.y - view.centerY) });
    }
    // The tentacles' cap: the nearest few draw the full rope.
    this.full.clear();
    cand.filter((c) => c.h.limbs![0].kind === 'whip').sort((a, b) => a.d - b.d).slice(0, this.cap).forEach((c) => this.full.add(c.h.id));
    const seen = new Set<number>();
    for (const { h } of cand) {
      seen.add(h.id);
      const v = this.hornets.get(h.id)!;
      let L = this.live.get(h.id);
      if (!L) this.live.set(h.id, (L = this.make(h)));
      L.hidden = false;
      L.limp += ((sim.limp(h) ? 1 : 0) - L.limp) * Math.min(1, dt * LIMP_EASE);
      if (L.claws) this.claws(h, v.spr, L.claws, L.limp, now, g);
      else this.whips(h, v.spr, L.whips!, L.limp, dt, now, g);
    }
    for (const [id, L] of this.live) {
      if (seen.has(id)) continue;
      const gone = !this.hornets.has(id) || !sim.hornets.some((h) => h.id === id && h.limbs && !h.dead);
      if (gone) this.drop(id, L);
      else this.hide(L);
    }
  }

  event(e: SimEvent) {
    if (e.e !== 'limb') return;
    const h = e.h;
    const v = this.hornets.get(h.id);
    if (e.what === 'wind') {
      if (v) kick(v.sq, -0.15);
      this.sfx('tick', h.x, h.y, { gain: 0.3, vary: 0.2 });
      return;
    }
    // The blow: a swish for a swing, a crack for a lash; sparks where the lash lands.
    const l = h.limbs?.find((x) => x.side === e.side);
    if (e.limb === 'whip' && l) {
      this.k.fx.burst(l.tx, l.ty, { color: STEEL, size: 0.4 });
      this.sfx('zap', l.tx, l.ty, { gain: 0.45, vary: 0.2 });
    } else this.sfx('swish', h.x, h.y, { gain: 0.5, vary: 0.2 });
  }

  private make(h: Hornet): Live {
    const art = atlas(this.scene);
    const part = (p: (typeof PART)[keyof typeof PART]) => art.image(h.x, h.y, p.frame).setOrigin(p.pivot[0], p.pivot[1]);
    if (!this.base) this.base = part(PART.upper).setVisible(false).scaleX;
    if (h.limbs![0].kind === 'claw') return { hidden: false, limp: 0, claws: [0, 1].map(() => ({ upper: part(PART.upper), fore: part(PART.fore), pose: { phi: 0, ext: 0, swing: 0 } })) };
    const whips: WhipV[] = [0, 1].map((i) => ({
      rope: newWhip(ROPE_FULL, h.x, h.y), want: newWhip(ROPE_FULL, h.x, h.y), n: ROPE_STUB, plates: [], tip: part(PART.tip), glow: this.scene.add.image(h.x, h.y, 'glow').setBlendMode(Phaser.BlendModes.ADD), phase: h.id * 1.7 + i * 2.4, pose: { rear: 0, spot: 0, glow: 0 },
    }));
    return { hidden: false, limp: 0, whips };
  }

  private hide(L: Live) {
    if (L.hidden) return;
    L.hidden = true;
    for (const c of L.claws ?? []) c.upper.setVisible(false), c.fore.setVisible(false);
    for (const w of L.whips ?? []) {
      w.plates.forEach((p) => p.setVisible(false));
      w.tip.setVisible(false);
      w.glow.setVisible(false);
    }
  }

  private drop(id: number, L: Live) {
    this.live.delete(id);
    for (const c of L.claws ?? []) c.upper.destroy(), c.fore.destroy();
    for (const w of L.whips ?? []) {
      w.plates.forEach((p) => p.destroy());
      w.tip.destroy();
      w.glow.destroy();
    }
  }

  /** Where limb `side` grows from on the foe's sprite now (its turn, flip and hop carry it), px. */
  private socket(h: Hornet, spr: Img, side: 1 | -1) {
    const S = SOCKETS[h.kind]!;
    const sgn = spr.flipX ? -1 : 1, ground = this.hornets.get(h.id)!.ground;
    const ox = sgn * S.x * S.w * ELITE, oy = (S.y - (ground ? 0.92 : 0.5)) * S.h * ELITE + side * S.h * 0.05 * ELITE;
    const c = Math.cos(spr.rotation), s = Math.sin(spr.rotation);
    this.sock.x = spr.x + ox * c - oy * s;
    this.sock.y = spr.y + ox * s + oy * c;
    return this.sock;
  }

  /** A part of a limb placed: on its pivot, turned along `ang`, its shading kept above (a part pointing left is flipped upside down). */
  private put(img: Img, x: number, y: number, ang: number, depth: number, spr: Img, sx = 1, sy = 1) {
    const left = Math.cos(ang) < 0;
    img.setVisible(spr.visible).setPosition(x, y).setRotation(ang).setFlipY(left).setScale(this.base * ELITE * sx, this.base * ELITE * sy).setDepth(depth).setAlpha(spr.alpha);
  }

  private claws(h: Hornet, spr: Img, cs: ClawV[], limp: number, now: number, g: G) {
    const u = UNIT * ELITE;
    const l1 = PART.upper.len * u, l2 = PART.fore.len * u;
    const body = { x: spr.x, y: spr.y };
    h.limbs!.forEach((l, i) => {
      const c = cs[i];
      const s = this.socket(h, spr, l.side);
      const sx = s.x, sy = s.y;
      clawPose(l.mode, l.t, c.pose);
      // Staggered: the claw hangs short and swings loose (a flail, like a kicked foe's arms).
      const loose = limp * Math.sin(now * Math.PI * 2 * LIMP.hz + i * 1.7 + h.id * 1.3) * LIMP.claw;
      const a = l.a + l.side * c.pose.phi + loose;
      const ext = c.pose.ext + (LIMP.ext - c.pose.ext) * limp;
      const tx = sx + Math.cos(a) * (l1 + l2) * ext, ty = sy + Math.sin(a) * (l1 + l2) * ext;
      const e = twoBone(sx, sy, tx, ty, l1, l2, body.x, body.y, this.elb);
      const depth = spr.depth + (l.side > 0 ? 0.6 : -0.6);
      this.put(c.upper, sx, sy, angleOf(e.ex - sx, e.ey - sy), depth, spr);
      this.put(c.fore, e.ex, e.ey, angleOf(e.tx - e.ex, e.ty - e.ey), depth + 0.01, spr);
      this.swoosh(g, h, l, c.pose, sx, sy, Math.hypot(e.tx - sx, e.ty - sy), spr.alpha);
    });
  }

  /** The swoosh: a pale steel arc over the part of the swing done, fading as the claw comes home. */
  private swoosh(g: G, h: Hornet, l: Limb, p: ClawPose, sx: number, sy: number, r: number, seen: number) {
    const C = LIMBS.claw;
    let alpha = 0;
    if (l.mode === 'strike') alpha = 0.85 * seen;
    else if (l.mode === 'rest') alpha = 0.85 * seen * Math.max(0, 1 - (C.rest - l.t) / 0.28);
    if (alpha <= 0.02) return;
    const from = l.a + l.side * 150 * (Math.PI / 180), to = l.a + l.side * p.phi;
    for (let k = 0; k < 3; k++) {
      g.lineStyle(LINE.effect * (3 - k), STEEL, alpha * (0.35 + 0.3 * k)).beginPath().arc(sx, sy, r * (1 - k * 0.06), from, to, l.side > 0).strokePath();
    }
  }

  private whips(h: Hornet, spr: Img, ws: WhipV[], limp: number, dt: number, now: number, g: G) {
    const full = this.full.has(h.id);
    const n = full ? ROPE_FULL : ROPE_STUB;
    const sgn = spr.flipX ? -1 : 1;
    h.limbs!.forEach((l, i) => {
      const w = ws[i];
      this.grow(w, n, h);
      const s = this.socket(h, spr, l.side);
      const sx = s.x, sy = s.y;
      whipPose(l.mode, l.t, w.pose);
      const p = w.pose;
      whipPoints(w.want, n, sx, sy, l.tx, l.ty, p, l.side, -sgn as 1 | -1, now, w.phase);
      // Staggered: the rope goes slack and flings side to side, more toward the tip.
      if (limp > 0.01) {
        for (let j = 0; j <= n; j++) {
          const s = (j + 1) / (n + 1), off = limp * LIMP.whip * s * Math.sin(now * Math.PI * 2 * LIMP.hz + w.phase + j * 0.9);
          w.want.x[j] += off;
          w.want.y[j] += limp * LIMP.sag * s;
        }
      }
      // The rope follows its pose a little late (it trails the walk and sags); the lash is quick, a snap.
      const follow = Math.min(1, dt * (l.mode === 'strike' ? 60 : 16));
      for (let j = 0; j <= n; j++) {
        w.rope.x[j] += (w.want.x[j] - w.rope.x[j]) * follow;
        w.rope.y[j] += (w.want.y[j] - w.rope.y[j]) * follow;
      }
      const depth = spr.depth + (l.side > 0 ? 0.6 : -0.6);
      let px = sx, py = sy;
      for (let j = 0; j < n; j++) {
        const x = w.rope.x[j], y = w.rope.y[j];
        const len = Math.hypot(x - px, y - py) || 0.01;
        const ang = angleOf(x - px, y - py);
        w.plates[j].setVisible(spr.visible).setPosition((px + x) / 2, (py + y) / 2).setRotation(ang).setFlipY(Math.cos(ang) < 0).setAlpha(spr.alpha).setDepth(depth + j * 0.001)
          .setScale(this.base * ELITE * Math.max(0.5, Math.min(3, len / (PART.plate.len * UNIT * ELITE))), this.base * ELITE * 1.5 * (1 - 0.4 * (j / n)));
        px = x;
        py = y;
      }
      const tx = w.rope.x[n], ty = w.rope.y[n];
      this.put(w.tip, tx, ty, angleOf(tx - px, ty - py), depth + 0.02, spr, 1.3, 1.3);
      // The tip's lens: faint steel-white at rest, red while it winds up (the one red on a limb).
      const red = p.glow > 0.02 && l.mode !== 'rest';
      w.glow.setVisible(spr.visible).setPosition(tx, ty).setDepth(depth + 0.03).setTint(red ? DANGER : 0xdff8ff).setAlpha(red ? 0.25 + 0.7 * p.glow : 0.22 * spr.alpha).setScale((red ? 0.1 + 0.12 * p.glow : 0.09) * (this.base * 2));
      if (l.mode === 'wind') this.spot(g, l, now);
      else if (l.mode === 'strike') this.crack(g, l, sx, sy, spr.alpha);
    });
  }

  /** Plates and sprites for a rope of `n`: made once, the extra hidden. */
  private grow(w: WhipV, n: number, h: Hornet) {
    if (w.n !== n) {
      for (let j = n; j < w.plates.length; j++) w.plates[j].setVisible(false);
      w.n = n;
    }
    while (w.plates.length < n) w.plates.push(atlas(this.scene).image(h.x, h.y, PART.plate.frame).setOrigin(PART.plate.pivot[0], PART.plate.pivot[1]));
  }

  /** The locked spot of a winding lash: a red dot and a ring closing on the hit's width (`DANGER`, the telegraph). */
  private spot(g: G, l: Limb, now: number) {
    const W = LIMBS.whip, k = 1 - l.t / W.wind;
    const pulse = 0.5 + 0.5 * Math.sin(now * 22);
    g.fillStyle(DANGER, 0.35 + 0.4 * pulse).fillCircle(l.tx, l.ty, 3.5);
    g.lineStyle(LINE.effect, DANGER, 0.3 + 0.5 * k).strokeCircle(l.tx, l.ty, W.width * (1.9 - 0.9 * k));
  }

  /** The crack: the rope drawn straight and bright along its line for the lash's few frames, a ring where it lands. */
  private crack(g: G, l: Limb, sx: number, sy: number, seen: number) {
    const u = 1 - l.t / LIMBS.whip.strike;
    g.lineStyle(LINE.accent, STEEL, 0.8 * seen * (1 - u)).lineBetween(sx, sy, l.tx, l.ty);
    g.lineStyle(LINE.effect, 0xffffff, 0.8 * seen * (1 - u)).strokeCircle(l.tx, l.ty, LIMBS.whip.width * (0.6 + 0.8 * u));
  }

  debug() {
    let claws = 0, whips = 0, full = 0;
    for (const [id, L] of this.live) {
      claws += L.claws?.length ?? 0;
      whips += L.whips?.length ?? 0;
      if (this.full.has(id)) full++;
    }
    return { limbView: { foes: this.live.size, claws, whips, fullRopes: full, cap: this.cap, on: this.on } };
  }
}

