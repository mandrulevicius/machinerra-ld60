/**
 * The Communicator's body: his walk frames and antenna, the shovel's swing and trail, the worn head and pack pieces, the
 * spare cans on his pack and the one that pours at a revive, a kneel at work; and the moments that are his: a swing or a
 * kick, the dash, a skill, going down and getting up, the winch.
 * Add a beat of his: a `case` in `event`. His state is `PlayHost.comm` (`CommState`).
 */
import Phaser from 'phaser';
import { atlas } from '../../../harness/kit/assets';
import { commDir, commFlip, commFrame, type CommDir } from './comm';
import { CommKick } from './commkick';
import { MOUNTS } from './antennamounts';
import { ANTENNA, antennaPoints, newAntenna, nudgeAntenna, stepAntenna, whipAntenna } from './antenna';
import { accelOf, newDangle, nudge, stepDangle, type Dangle } from './dangle';
import { owned } from './sim/gear';
import { LINE } from './house';
import { CRUDE_STAIN, ViewBase, kick, type BotView, type CommState } from './playhost';
import { REVIVE, T, WEAPONS, type WeaponId } from './sim/defs';
import { glowColor, warmth } from './sim/fog';
import { gear } from './hub/carry';
import type { ItemId } from './sim/gear';
import type { Bot, SimEvent } from './sim/sim';

/** Where spare cans hang on the pack, per view (px from the feet; `front`: drawn over the body, else behind it). */
const PACK: Record<CommDir, (i: number, face: number) => { x: number; y: number; front: boolean }> = {
  back: (i) => ({ x: (i - 1) * 9, y: -25, front: true }),
  backside: (i, f) => ({ x: (i - 1) * 8 - 2 * f, y: -25, front: true }),
  side: (i, f) => ({ x: -11 * f - (i % 2) * 2, y: -24 - i * 9, front: false }),
  frontside: (i, f) => ({ x: -9 * f - (i % 2) * 2, y: -28 - i * 8, front: false }),
  front: (i) => ({ x: i === 1 ? -13 : 13, y: -34 - (i === 2 ? 7 : 0), front: false }),
};
/** A shovel swing, seconds; the arc sweeps over it, then the trail fades. */
const SWING = 0.16;
/** The Communicator taking a knee: seconds to get down, and the kneel frames' layout (source px). */
const KNEEL_IN = 0.3;

export class CommView extends ViewBase {
  /** His kick's beat (`commkick.ts`): the legs and the lean over his painted frames. */
  private kicker = new CommKick(this.scene, () => this.gfx);
  /** Secondary motion (P7): his pack's cans hang as pendulums (`dangle.ts`) driven by his walk, the pack piece leans with the body's, the antenna is a short chain (`antenna.ts`) that lags his walk and whips at a kick or a dash. */
  private sway = { body: newDangle(), cans: Array.from({ length: REVIVE.cans }, (_, i) => ({ ...newDangle(), side: (i % 2 ? -1 : 1) as 1 | -1 })), ant: newAntenna(), pts: { x: [0, 0, 0, 0, 0], y: [0, 0, 0, 0, 0] }, step: 0 };

  /** Make his state when his body is added (`Play.addBot`). */
  make(b: Bot): CommState {
    const L = this.k.lights;
    const shovel = atlas(this.scene).image(b.x, b.y, 'communicator/shovel').setOrigin(0.04, 0.55).setVisible(false);
    const hat = this.scene.add.image(b.x, b.y, 'worn-hornetHead').setVisible(false), pack = this.scene.add.image(b.x, b.y, 'worn-supportAntenna').setVisible(false);
    return { dir: 'front', px: b.x, py: b.y, pingT: 0, tip: L.add(b.x, b.y - 60, { color: 0xffc070, radius: 70, intensity: 0 }), glow: this.scene.add.image(b.x, b.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setVisible(false), bead: this.scene.add.circle(b.x, b.y, 3.2, 0x4a7fd0).setStrokeStyle(1.5, 0x1a1008).setVisible(false), warm: 0, shovel, hat, pack, worn: '', swing: null, lookT: 0, turn: 1, kneelT: 0, spill: null,
      // Spare oil hangs on the pack, one can each: hooked by the top, swaying as it walks.
      cans: Array.from({ length: REVIVE.cans }, () => this.scene.add.image(b.x, b.y, 'oilcan').setOrigin(0.5, 0.12).setScale(0.3).setVisible(false)) };
  }

  /** Put on what the gear says he wears (`worn-<id>` textures, `src/gearart.ts`): the head piece over his box head, the pack piece on his back. */
  dress() {
    const g = gear.get();
    const c = this.comm;
    const head = owned(g, g.comm.head)?.id, pack = owned(g, g.comm.pack)?.id;
    c.worn = [head, pack].join('/');
    if (head) c.hat.setTexture(`worn-${head}`);
    if (pack) c.pack.setTexture(`worn-${pack}`);
    c.hat.setData('id', head ?? null);
    c.pack.setData('id', pack ?? null);
  }

  /** The Main Brush (P58): a copper whirl the size of its reach, turning once, and a ring of dust thrown off it. */
  private brushWhirl(x: number, y: number, reach: number) {
    const g = this.scene.add.graphics().setDepth(y + 2).setPosition(x, y - 10);
    this.k.lights.unlit(g);
    const o = { t: 0 };
    this.scene.tweens.add({
      targets: o,
      t: 1,
      duration: 260,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        g.clear();
        const r = reach * (0.55 + 0.45 * o.t), a0 = o.t * Math.PI * 2;
        for (let i = 0; i < 3; i++) {
          const from = a0 + i * 2.1, to = from + 1.7;
          g.lineStyle(8 - i * 2, 0x1d1a17, (1 - o.t) * 0.5); // a dark edge so it reads on pale sand
          g.beginPath();
          g.arc(0, 0, r - i * 7, from, to);
          g.strokePath();
          g.lineStyle(5 - i * 1.5, i ? 0xe09a62 : 0xc8783e, (1 - o.t) * (0.95 - i * 0.2));
          g.beginPath();
          g.arc(0, 0, r - i * 7, from, to);
          g.strokePath();
        }
      },
      onComplete: () => g.destroy(),
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.k.fx.burst(x + Math.cos(a) * reach * 0.9, y - 4 + Math.sin(a) * reach * 0.5, { color: 0xc8b898, size: 0.45 });
    }
  }

  event(e: SimEvent) {
    const sim = this.sim;
    const fx = this.k.fx;
    const w = this.w;
    switch (e.e) {
      case 'swing': {
        const c = this.comm;
        const v = this.bots.get(e.by.id);
        if (e.kick) {
          // The Kicker's kick: a stomp of dust in front, a thud, and whatever was there goes flying.
          this.used.kicked = true;
          const fx0 = e.by.x + Math.cos(e.a) * 26, fy0 = e.by.y + Math.sin(e.a) * 16;
          this.k.fx.burst(fx0, fy0, { color: 0xc8a070, size: 0.8 });
          this.sfx('swish', e.by.x, e.by.y, { gain: 0.7, vary: 0.1 });
          if (e.hits) {
            this.sfx('rock', e.by.x, e.by.y, { gain: 0.9 });
            this.k.juice.stop(70);
            this.k.juice.shake('small');
          }
          if (v) kick(v.sq, 0.18);
          if (e.by.role === 'controller') {
            this.kicker.start(e.a, e.hits);
            whipAntenna(this.sway.ant, Math.cos(e.a), Math.sin(e.a), ANTENNA.kick);
          }
          c.lookT = 0.3;
          c.dir = commDir(Math.cos(e.a), Math.sin(e.a));
          break;
        }
        this.used.swung = true;
        // The swing shows what is in hand: the painted shovel, or a crafted weapon's drawn texture.
        const reach = (id: WeaponId | null) => (id && WEAPONS[id].kind === 'melee' ? (WEAPONS[id] as { reach: number }).reach : -1);
        const wid = reach(sim.weapon) === e.reach ? sim.weapon : reach(sim.secondary) === e.reach ? sim.secondary! : sim.weapon;
        if (wid === 'shovel') c.shovel.setTexture('atlas', 'communicator/shovel').setOrigin(0.04, 0.55);
        else c.shovel.setTexture(`gear-${wid}`).setOrigin(0.12, 0.88);
        c.shovel.setData('gear', wid !== 'shovel');
        c.turn = -c.turn; // swings alternate: forehand, backhand
        c.swing = { t: 0, a: e.a, arc: e.arc, reach: e.reach, turn: c.turn };
        if (wid === 'mainBrush') this.brushWhirl(e.by.x, e.by.y, e.reach);
        c.lookT = 0.3;
        c.dir = commDir(Math.cos(e.a), Math.sin(e.a));
        this.sfx('swish', e.by.x, e.by.y, { gain: 0.6, vary: 0.15 });
        if (v) kick(v.sq, e.hits ? -0.14 : 0.08);
        // A hit lands with a beat of hit-stop and a nudge; a whiff is only air.
        if (e.hits) {
          this.k.juice.stop(55);
          this.k.juice.shake('small');
        }
        break;
      }
      case 'commDash': {
        // The posterior vent: a puff out of his backside the other way, a whoosh; the afterburner leaves a line of fire.
        for (let i = 0; i < 4; i++) fx.burst(e.x - Math.cos(e.a) * (8 + i * 6), e.y - 14 - Math.sin(e.a) * (8 + i * 6), { color: e.burn ? 0xff8a30 : e.smoke ? 0x2a2622 : 0xf4efe6, size: e.smoke ? 1 : 0.7 });
        this.sfx('swish', e.x, e.y, { gain: 0.9, vary: 0.1 });
        const v = this.bots.get(sim.controller.id);
        if (v) kick(v.sq, 0.2);
        whipAntenna(this.sway.ant, Math.cos(e.a), Math.sin(e.a), ANTENNA.dash);
        if (e.burn || e.smoke) w.marks.stamp('world-soft', e.x + Math.cos(e.a) * 70, e.y + Math.sin(e.a) * 70, { tint: 0x1a120c, alpha: 0.5, scale: 1.1, kind: false });
        break;
      }
      case 'skill': {
        if (e.id === 'whistle') {
          // A shriek of steam: a white ring out to the whistle's reach and a shove of every foe in it.
          const ring = this.scene.add.circle(e.x, e.y - 14, 20).setStrokeStyle(6, 0xf4efe6, 0.9).setDepth(71000);
          this.scene.tweens.add({ targets: ring, radius: 110, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
          for (let i = 0; i < 8; i++) fx.burst(e.x + Math.cos(i) * 40, e.y - 14 + Math.sin(i) * 26, { color: 0xf4efe6, size: 0.9 });
          this.sfx('whistle', e.x, e.y, { gain: 0.8 });
          this.k.juice.shake('small');
        } else {
          this.floater(e.x, e.y - 60, 'The Brass Guard is coming!', '#ffd98a', 1500);
          this.sfx('warn', e.x, e.y, { gain: 0.4 });
        }
        break;
      }
      case 'downed': {
        const c = sim.controller;
        fx.burst(c.x, c.y - 20, { color: 0xf4efe6, size: 1.4 });
        if (e.revive) {
          // A slip, not a loss: a thud and a beat on the ground, a can comes off the pack and pours.
          this.spillCan(c);
          this.hud.reserveFlash(false);
          this.guide.note('cans');
          this.sfx('hurt', undefined, undefined, { gain: 0.8 });
          this.k.juice.shake('medium');
          this.hud.banner('Down', 1200);
          this.floater(c.x, c.y - 56, 'Spare can...', '#f4e2bc', 1300);
          w.marks.stamp('world-splat', c.x, c.y + 4, { tint: CRUDE_STAIN, alpha: 0.7, scale: 0.45, kind: 'oil' });
          break;
        }
        this.sfx('boom', c.x, c.y, { gain: 0.7 });
        this.k.juice.hit('medium');
        this.hud.banner('Out of oil', 2200);
        w.marks.stamp('world-splat', c.x, c.y + 4, { tint: CRUDE_STAIN, alpha: 0.7, scale: 0.45, kind: 'oil' });
        break;
      }
      case 'revived': {
        const c = sim.controller;
        const v = this.bots.get(c.id);
        if (v) kick(v.sq, 0.8);
        fx.burst(c.x, c.y - 20, { color: 0xffb640, size: 1.2 });
        fx.burst(c.x, c.y - 20, { color: 0xffffff, size: 0.8 });
        this.flash(c.x, c.y - 20, 0xffc070, 1.6);
        this.sfx('heal', c.x, c.y, { gain: 1, vary: 0 });
        this.sfx('pickup', c.x, c.y, { gain: 0.8 });
        this.k.juice.shake('small');
        if (this.comm.spill) this.comm.spill.spent = 0.001;
        w.marks.stamp('world-splat', c.x + (c.face >= 0 ? 12 : -12), c.y + 2, { tint: CRUDE_STAIN, alpha: 0.7, scale: 0.35, kind: 'oil' });
        // The moment is read at a glance (Minos): big, over him, with the small print under it.
        this.floater(c.x, c.y - 70, 'REVIVED', '#ffd98a', 2200, 44);
        this.floater(c.x, c.y - 36, e.cost ? 'spare can spent' : 'her voice on the antenna', '#f4e2bc', 2200, 18);
        break;
      }
      case 'winched':
        this.sfx('lift', undefined, undefined, { gain: 0.6 });
        fx.burst(sim.lift.x, sim.lift.y, { color: 0xf4efe6, size: 1.2 });
        if (e.cost) this.floater(sim.lift.x, sim.lift.y - 50, `−${e.cost} scrap (winch fee)`, '#ffd98a');
        this.scene.cameras.main.centerOn(sim.lift.x, sim.lift.y);
        this.w.update();
        break;
      default:
        break;
    }
  }

  /**
   * The Communicator's view, walking through its cycle when moving (frame 0 standing): front when walking down, back when walking up, the side view (flipped for left) across;
   * a standstill keeps the last one. A message over the air (the Oracle) lights the antenna and sends rings out of it.
   */
  draw(b: Bot, v: BotView, dt: number) {
    const c = this.comm;
    const dx = b.x - c.px, dy = b.y - c.py;
    c.px = b.x;
    c.py = b.y;
    c.lookT -= dt;
    if (b.moving && c.lookT <= 0 && Math.hypot(dx, dy) > 0.01) c.dir = commDir(dx, dy);
    v.spr.setFrame(commFrame(c.dir, v.bob, b.moving && !this.kicker.active));
    v.spr.setFlipX(commFlip(c.dir, b.face));
    this.kicker.update(v.spr, dt, v.spr.visible && this.sim.downT <= 0, c.dir);
    // Searching a ruin: he takes a knee facing the work (kneel-<i>, then the siphon-<i> loop).
    const working = b.state === 'gather' && !b.moving && !c.swing;
    c.kneelT = working ? c.kneelT + dt : 0;
    if (working) {
      const w = b.work;
      const flip = w ? w.x < b.x : b.face < 0;
      const f = c.kneelT < KNEEL_IN ? `kneel-${Math.min(7, Math.floor((c.kneelT / KNEEL_IN) * 8))}` : `siphon-${Math.floor((c.kneelT - KNEEL_IN) * 6) % 8}`;
      v.spr.setFrame(`communicator/${f}`).setFlipX(flip);
      c.dir = 'side';
    }
    this.moveSecondary(b, v, dt, dx / Math.max(dt, 1e-3));
    // The antenna: a chain up from the painted antenna's tip (`antennamounts.ts`, in the frame shown, mirrored and turned as the sprite is); the tip keeps the glow and the ping.
    const [bx0, by0] = this.mount(v.spr);
    const ant = this.sway.ant, pts = this.sway.pts;
    stepAntenna(ant, bx0, by0, dt, v.spr.x, v.spr.y);
    antennaPoints(ant, bx0, by0, pts);
    const tx = pts.x[ANTENNA.n + 1], ty = pts.y[ANTENNA.n + 1];
    if (v.spr.visible && this.sim.downT <= 0 && !(b.state === 'gather' && !b.moving)) {
      const g = this.gfx;
      for (let i = 0; i <= ANTENNA.n; i++) g.lineStyle(LINE.effect + 0.4, 0x1d1a17, 1).lineBetween(pts.x[i], pts.y[i], pts.x[i + 1], pts.y[i + 1]);
      for (let i = 0; i <= ANTENNA.n; i++) g.lineStyle(LINE.detail * 0.8, 0xb8b0a0, 1).lineBetween(pts.x[i], pts.y[i], pts.x[i + 1], pts.y[i + 1]);
    }
    c.pingT = Math.max(0, c.pingT - dt);
    c.tip.setPosition(tx, ty).setIntensity(c.pingT > 0 ? 0.25 + 0.5 * Math.abs(Math.sin(c.pingT * 9)) : 0);
    this.drawGlow(b, v, dt, tx, ty);
    this.drawSwing(b, v, dt);
    this.drawPack(b, v);
    this.drawWorn(b, v);
    this.spillStep(b, dt);
    if (c.pingT > 0 && v.spr.visible) {
      for (let i = 0; i < 3; i++) {
        const k = ((1.6 - c.pingT) * 1.4 + i / 3) % 1;
        const r = 5 + k * 18;
        this.gfx.lineStyle(LINE.effect, 0xffc070, (1 - k) * 0.9);
        this.gfx.beginPath().arc(tx, ty, r, -Math.PI * 0.85, -Math.PI * 0.55).strokePath();
        this.gfx.beginPath().arc(tx, ty, r, -Math.PI * 0.45, -Math.PI * 0.15).strokePath();
      }
    }
  }

  /** Where the painted antenna's tip is in the world: the shown frame's mount through the sprite's own flip, scale and turn (a frame with no mount, a kneel, takes the side view's). */
  private mount(spr: Phaser.GameObjects.Image): [number, number] {
    const m = /^communicator\/(\w+)-(\d+)$/.exec(spr.frame.name);
    const [px, py] = (m && MOUNTS[m[1] as CommDir]?.[+m[2]]) || MOUNTS.side[0];
    const lx = (px - spr.frame.realWidth * spr.originX) * (spr.flipX ? -1 : 1) * spr.scaleX, ly = (py - spr.frame.realHeight * spr.originY) * spr.scaleY;
    const r = spr.rotation, co = Math.cos(r), si = Math.sin(r);
    return [spr.x + lx * co - ly * si, spr.y + lx * si + ly * co];
  }

  /**
   * Secondary motion: the cans and the pack answer his acceleration and his steps (`dangle.ts`'s pendulum for
   * the cans); the antenna nudges with each step (it moves by itself, `antenna.ts`).
   */
  private moveSecondary(b: Bot, v: BotView, dt: number, vx: number) {
    const s = this.sway;
    const ax = accelOf(s.body, vx, Math.max(dt, 1e-3));
    stepDangle(s.body, ax * 0.5, dt);
    const st = Math.floor(v.bob / Math.PI);
    const stepped = st !== s.step && b.moving;
    s.step = st;
    s.cans.forEach((d, i) => {
      stepDangle(d, ax * (0.9 + 0.15 * i), dt);
      if (stepped) nudge(d);
    });
    if (stepped) nudgeAntenna(s.ant, st % 2 ? 1 : -1);
  }

  /**
   * The antenna's glow: cold blue far from the nearest signal and when facing away, warm amber near it and facing it
   * (`warmth`, `fog.ts`; inside the rough area it stays full). No glow once every signal is found. No sound.
   */
  private drawGlow(b: Bot, v: BotView, dt: number, tx: number, ty: number) {
    const c = this.comm, sim = this.sim;
    const w = warmth({ x: b.x / T - 0.5, y: b.y / T - 0.5, facing: sim.facing }, sim.signals, undefined, sim.fog);
    c.warm += ((w.signal ? w.value : c.warm) - c.warm) * Math.min(1, dt * 5);
    const show = !!w.signal && v.spr.visible && sim.downT <= 0 && !(b.state === 'gather' && !b.moving);
    c.glow.setVisible(show);
    c.bead.setVisible(show);
    if (!show) return;
    const beat = 0.85 + 0.15 * Math.sin(this.scene.time.now / (260 - 120 * c.warm));
    const col = glowColor(c.warm);
    c.glow.setPosition(tx, ty).setTint(col).setScale((0.45 + 0.35 * c.warm) * beat).setAlpha(0.7 + 0.3 * c.warm).setDepth(v.spr.depth + 0.8);
    c.bead.setPosition(tx, ty).setFillStyle(col).setScale(beat).setDepth(v.spr.depth + 0.9);
  }

  /** The spare oil on the pack: a can per whole can in `sim.spare`, hooked on at the view's spot and swaying with the stride. The can being spent for a revive is not here (`Spill`). */
  private drawPack(b: Bot, v: BotView) {
    const c = this.comm;
    const n = this.sim.spareCans;
    const downed = this.sim.downT > 0;
    c.cans.forEach((img, i) => {
      img.setVisible(i < n && v.spr.visible && !downed);
      if (!img.visible) return;
      const p = PACK[c.dir](i, b.face);
      // Hooked by the top, each can swings on its own pendulum (his walk drives it, each step knocks it).
      const th = this.sway.cans[i].th, idle = b.moving ? 0 : Math.sin(this.scene.time.now / 700 + i) * 0.06;
      img.setPosition(v.spr.x + p.x + (th + idle) * 4, v.spr.y + p.y + 1).setRotation(-(th + idle) * 0.9).setDepth(v.spr.depth + (p.front ? 0.5 : -0.5));
    });
  }

  /** The head piece rides on top of the head; the pack piece sticks up behind the shoulders (in front of him in the back view). */
  private drawWorn(b: Bot, v: BotView) {
    const c = this.comm;
    const show = v.spr.visible && this.sim.downT <= 0 && !(b.state === 'gather' && !b.moving);
    const top = v.spr.y - v.spr.displayHeight * 0.9;
    const flip = commFlip(c.dir, b.face);
    const head = c.hat.getData('id') as ItemId | null;
    c.hat.setVisible(show && !!head);
    if (head) c.hat.setPosition(v.spr.x + (c.dir === 'side' || c.dir === 'frontside' ? 2 * b.face : 0), top + 4).setScale(0.48).setFlipX(flip).setDepth(v.spr.depth + 0.6);
    const pack = c.pack.getData('id') as ItemId | null;
    c.pack.setVisible(show && !!pack);
    if (pack) {
      const tall = pack === 'supportAntenna' ? 0.72 : 0.52;
      const sway = (b.moving ? Math.sin(v.bob) * 0.08 : 0) - this.sway.body.th * 0.2;
      c.pack.setPosition(v.spr.x - (c.dir === 'side' ? 9 * b.face : c.dir === 'frontside' ? 8 * b.face : c.dir === 'backside' ? 5 * b.face : 6), top + 2).setScale(tall).setFlipX(flip).setRotation(sway).setDepth(v.spr.depth + (c.dir === 'back' || c.dir === 'backside' ? 0.5 : -0.5));
    }
  }

  /** A revive: the can drops off the pack, tips over beside the Communicator and pours into it (the downed moment), then is spent. */
  private spillCan(b: Bot) {
    const c = this.comm;
    const v = this.bots.get(b.id)!;
    c.spill?.img.destroy();
    const p = PACK[c.dir](Math.max(0, this.sim.spareCans), b.face); // the one that just left the pack (the sim already counts it spent)
    const x0 = v.spr.x + p.x, y0 = v.spr.y + p.y;
    const img = this.scene.add.image(x0, y0, 'oilcan').setScale(0.3).setDepth(b.y + 2);
    c.spill = { img, t: 0, x: x0, y: y0, spent: 0 };
    this.scene.tweens.add({ targets: img, scale: 0.55, duration: 300 });
  }

  /** The can's fall (ease in, two bounces), its tip over onto its side, then its pour (oil thread and drips) until the revive spends it and it fades. */
  private spillStep(b: Bot, dt: number) {
    const c = this.comm;
    const sp = c.spill;
    if (!sp) return;
    sp.t += dt;
    const side = b.face >= 0 ? 1 : -1;
    const gx = b.x + side * 20, gy = b.y - 1; // where it lands
    const fall = Math.min(1, sp.t / 0.35);
    const bounce = sp.t < 0.35 ? 0 : Math.abs(Math.sin((sp.t - 0.35) * 14)) * 7 * Math.exp(-(sp.t - 0.35) * 7);
    sp.img.setPosition(sp.x + (gx - sp.x) * fall, sp.y + (gy - sp.y) * (fall * fall) - bounce);
    const tip = Math.min(1, Math.max(0, (sp.t - 0.3) / 0.35));
    sp.img.setRotation(side * (Phaser.Math.Linear(0.5, 1.9, tip) + (sp.t < 0.35 ? sp.t * 6 : 0)));
    if (sp.spent > 0) {
      sp.spent += dt;
      sp.img.setAlpha(Math.max(0, 1 - sp.spent / 0.6));
      if (sp.spent > 0.6) {
        sp.img.destroy();
        c.spill = null;
      }
      return;
    }
    if (sp.t > 0.65) {
      // Pouring: a dark thread from the spout into the Communicator, a drip on the sand.
      const fx = this.k.fx;
      if (Math.floor(sp.t * 24) !== Math.floor((sp.t - dt) * 24)) fx.burst(sp.img.x - side * 6, sp.img.y + 4, { color: 0x14100c, size: 0.22 });
      this.gfx.lineStyle(LINE.effect, 0x14100c, 0.9).lineBetween(sp.img.x - side * 5, sp.img.y + 3, b.x + side * 7, b.y - 12);
    }
  }

  /**
   * The shovel swing: the shovel sweeps through the arc from the hand (behind the body when swung upward), a pale trail
   * follows its blade on a flattened circle (the ground seen from above), then fades.
   */
  private drawSwing(b: Bot, v: BotView, dt: number) {
    const c = this.comm;
    const sw = c.swing;
    if (!sw) return;
    sw.t += dt;
    const hx = b.x, hy = b.y - v.spr.displayHeight * 0.4;
    const k = Math.min(1, sw.t / SWING);
    const ease = 1 - (1 - k) ** 3;
    const from = sw.a - (sw.arc / 2) * sw.turn;
    const now = from + sw.arc * sw.turn * ease;
    const flat = (a: number, r: number) => ({ x: hx + Math.cos(a) * r, y: hy + Math.sin(a) * r * 0.62 });
    const tipR = sw.reach * 0.95;
    const tip = flat(now, tipR);
    c.shovel.setVisible(k < 1 && v.spr.visible).setPosition(hx, hy).setRotation(Math.atan2(tip.y - hy, tip.x - hx)).setDepth(Math.sin(now) < -0.2 ? b.y - 1 : b.y + 1);
    const sc = c.shovel.getData('gear') ? (sw.reach * 1.1) / 128 : atlas(this.scene).scaleOf('communicator/shovel');
    c.shovel.setScale(sc * (0.75 + 0.25 * Math.hypot(Math.cos(now), Math.sin(now) * 0.62)));
    // Drawn icons point up-right (45 degrees): turn them to the swing.
    if (c.shovel.getData('gear')) c.shovel.rotation += Math.PI / 4;
    const fade = Math.max(0, 1 - Math.max(0, sw.t - SWING) / 0.14);
    if (fade <= 0) {
      c.swing = null;
      c.shovel.setVisible(false);
      return;
    }
    const g = this.gfx;
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a0 = from + (now - from) * (i / n), a1 = from + (now - from) * ((i + 1) / n);
      const p0 = flat(a0, tipR), p1 = flat(a1, tipR);
      const w = 2 + 6 * (i / n);
      g.lineStyle(w, 0xfff3d6, 0.55 * fade * ((i + 1) / n)).lineBetween(p0.x, p0.y, p1.x, p1.y);
    }
  }
}
