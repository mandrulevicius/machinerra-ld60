/**
 * The robots on screen: the Communicator's and every crew robot's body (`host.bots`: sprite, lamp, crew badge, bark), how it
 * moves (footfalls, squash, a hop on its wheels, riding the lift up with the rest of the party), its hit flash and halo wash,
 * oil bar and repair beam, the head and back pieces its role wears, the gatherer's siphoning frames, its lamp's wish for
 * `LightView` (`host.lamps`), the followers (the Princess, the Ghost) who roll or float after him, and the moments a robot
 * has: its AI's choice made readable (`sim/botai.ts`: a ring, a puff, a word), its barks, joining on a rope, hauled away.
 * The Communicator's own frames are `CommView.draw`, called in the loop through `host.drawComm`. What a body wears comes from the
 * gear: `host.dressComm()` (Play) has `CommView.dress` and `BotsView.dress` read it, `drawBotKit` puts a role's head and back pieces on
 * every crew robot each frame. The lamp each robot wants is `LAMP[role]` (`lamps.ts`) times the night's `lampLook`.
 * A downed robot (P5, `sim/downed.ts`) lies on its side, grey and unlit, with its fix's ring while it is mended; one carried
 * hangs from its carrier's shoulder like a pendulum (`dangle.ts`, `dangle` below): it lags and swings with his walk, jolts at his
 * steps, drags its feet in the dust and swings on when he stops.
 * Add a robot to the screen: `add`. A new AI beat: a `case` in `onAi`. A new thing on every robot: the loop in `update`.
 */
import Phaser from 'phaser';
import { atlas } from '../../../harness/kit/assets';
import { CREW_COLORS, crewMark } from './hud';
import { DANGER, DANGER_HOT, FRIEND, LINE } from './house';
import { LAMP, lampLook, type Lamp } from './lamps';
import { lyingTip } from './downedcost';
import { DECK, smooth } from './liftrise';
import { npcImage } from './hub/art';
import { gear } from './hub/carry';
import { ViewBase, kick, spring, type BotView, type G, type Img } from './playhost';
import type { Shadow } from '../../../harness/kit';
import { groundShadow } from './shadowview';
import { DARK } from './sim/dungeon';
import { streaks } from './stokeview';
import { SAW_ARM, STROKE, canvasPoint, swingAt } from './sawarm';
import { SAW } from './sim/defs';
import { accelOf, newDangle, nudge, stepDangle, type Dangle } from './dangle';
import { CREW_ROLES, owned, type ItemId } from './sim/gear';
import type { Bot, SimEvent } from './sim/sim';

/** The gatherer's siphoning frames per second. */
const GATHER_FPS = 9;
/** What an ability a robot casts shows (`sim/botskills.ts`): the word over it and the ring's size (px). */
const CAST_LOOK: Record<string, { word: string; r: number }> = {
  taunt: { word: 'taunt', r: 90 },
  cloud: { word: 'steam cloud', r: 30 },
  blessing: { word: 'blessing', r: 50 },
  flare: { word: 'flare', r: 30 },
  mark: { word: 'marked', r: 24 },
  intercept: { word: 'takes the blow', r: 40 },
};

export class BotsView extends ViewBase {
  /** What each crew role wears that shows: head and back pieces (from the gear). */
  private crewKit: Record<string, { head?: ItemId; back?: ItemId }> = {};
  /** Followers (the Princess after the knight, the Esteemed Ghost once freed): her sprite rolls after you; he floats, see-through. */
  private followers = new Map<string, Img>();
  /** How far the Communicator's sprite is lifted: he climbs a mast (`host.climb`). */
  private climbY = 0;
  private auraFxT = 0;
  /** What leaving the nearest downed robot costs, over it while he is near (`downedcost.ts`). */
  private tip?: Phaser.GameObjects.Text;
  /** Each carried robot's swing (`dangle.ts`) and where it was last frame. */
  private swings = new Map<number, { d: Dangle; px: number }>();

  /** Add a robot's body to the screen. */
  add(b: Bot) {
    const L = this.k.lights;
    const w = this.w;
    // Painted from Laimonas's sheets, Brushed flat, from the atlas: the Communicator walks through three views; the crew
    // (art/crew/<role>) are one front view each, flipped to face their way.
    const me = b.role === 'controller';
    // A Guard is its painting without the saw arm (`crew/guard-body`) and the arm (`crew/guard-saw`, `drawSaw`), when the atlas has both.
    const armed = b.role === 'guard' && this.hasSawArm();
    const img = atlas(this.scene).image(b.x, b.y, me ? 'communicator/front-0' : armed ? 'crew/guard-body' : `crew/${b.role}`).setOrigin(0.5, 0.97);
    const spr = w.cull.add(img, { mobile: true });
    const shadow = groundShadow(w, spr, { fine: me });
    // Dirty feet: walking through spilt oil or a seep's crude leaves prints (wheels and tracks leave tracks).
    w.marks.footprints(spr, b.role === 'controller' ? { scale: 0.55, stride: 22, gap: 10, steps: 8, life: 12 } : { key: 'track', stride: 14, gap: 1, steps: 10, life: 12, scale: 1 });
    const [col, rad] = LAMP[b.role];
    // Dark until `LightView.late` gives it a place in the light budget (a lamp that merges into a crowd's never lights).
    const light = L.add(b.x, b.y - 20, { color: col, radius: rad, intensity: 0 }).setVisible(false);
    const badge = this.k.text(b.x, b.y, b.role === 'controller' || b.crew < 0 ? '' : String(b.crew), { size: 13, font: 'body' }).setOrigin(0.5).setDepth(95000).setStroke('#1d1a17', 4).setColor(CREW_COLORS[Math.max(0, b.crew)]);
    const arm = armed ? atlas(this.scene).image(b.x, b.y, 'crew/guard-saw').setOrigin(SAW_ARM.elbow[0] / SAW_ARM.canvas[0], SAW_ARM.elbow[1] / SAW_ARM.canvas[1]) : undefined;
    this.bots.set(b.id, { spr, shadow, light, badge, crew: b.crew, bob: (b.id * 1.7) % 6, step: 0, sq: { s: 0, v: 0 }, pumpT: 0, pump: 0, flashT: 0, barkT: 0, base: spr.scaleX, arm });
  }

  private sawArt?: boolean;
  /** The atlas has the Guard's cut (asked once). */
  private hasSawArm() {
    if (this.sawArt === undefined) {
      const tex = this.scene.textures.exists('atlas') ? this.scene.textures.get('atlas') : undefined;
      this.sawArt = !!tex && tex.has('crew/guard-body') && tex.has('crew/guard-saw');
    }
    return this.sawArt;
  }

  /** The Communicator climbs a mast: lift his sprite this many px. */
  climb(y: number) {
    this.climbY = y;
  }

  /** Read what the crew's roles wear from the gear (`dressComm`). */
  dress() {
    const g = gear.get();
    for (const r of CREW_ROLES) this.crewKit[r] = { head: owned(g, g.bots[r].head)?.id, back: owned(g, g.bots[r].back)?.id };
  }

  update(dt: number, g: G) {
    const sim = this.sim, down = this.host.down;
    const rise = this.host.rise();
    const rising = sim.phase === 'rising' || sim.phase === 'done';
    const { glow, wide } = lampLook(this.host.night());
    this.auraFxT -= dt;
    const auraFx = this.auraFxT <= 0;
    if (auraFx) this.auraFxT = 0.3;
    const lamps: Lamp[] = this.host.lamps;
    lamps.length = 0;
    for (const b of sim.bots) {
      // A place's own robot, made once he came near (P36's husks), or a wreck's robot, made on the place's first step (Bellows, P9).
      if ((b.place || b.downed?.wreck) && !this.bots.has(b.id)) this.add(b);
      const v = this.bots.get(b.id);
      if (!v) continue;
      // Whoever is aboard rides it. The sim counts everyone within a ring round the lift, wider than the deck: those who stand
      // off the deck's edge slide onto it as it starts, so nobody hangs in the air beside the platform.
      const aboard = rising && (sim.onLift(b, 1.6) || sim.atExit(b, 1.6));
      const up = (aboard ? rise : 0) + (b.role === 'controller' ? this.climbY : 0);
      let bx = b.x, by = b.y;
      if (aboard && !down) {
        const k = smooth(sim.riseT / 0.5), d = DECK;
        bx += (Phaser.Math.Clamp(b.x, sim.lift.x - d.hw, sim.lift.x + d.hw) - b.x) * k;
        by += (Phaser.Math.Clamp(b.y, sim.lift.y + d.top, sim.lift.y + d.bottom) - b.y) * k;
      }
      const carried = b.downed?.by != null;
      const downed = (b.role === 'controller' && sim.downT > 0) || !!b.downed;
      v.bob += dt * (b.moving ? 13 : 2.5);
      // Footfalls: each half stride lands with a small squash; the robot settles with a stretch.
      const step = Math.floor(v.bob / Math.PI);
      if (b.moving && step !== v.step) {
        kick(v.sq, -0.05);
        this.host.footfall(b);
      }
      v.step = step;
      spring(v.sq, dt);
      // The Communicator's walk frames carry their own bob and lean; the crew, one still each, hop and rock on their wheels.
      const rocks = b.moving && b.role !== 'controller';
      const lift = rocks ? -Math.abs(Math.sin(v.bob)) * 2 : 0;
      const sy = 1 + v.sq.s, sx = 1 - v.sq.s * 0.7;
      v.spr.setPosition(bx, by + lift - up).setDepth(by + (carried ? 2 : 0)).setScale(sx * v.base, sy * v.base);
      v.shadow.raise = up; // its shadow stays on the ground
      v.spr.angle = downed ? 80 : rocks ? Math.sin(v.bob) * 2.5 : 0;
      if (carried) this.dangle(b, v, dt, up);
      else this.swings.delete(b.id);
      // The sim moves robots off screen too, where the cull stops re-filing them: re-file every frame, or one that walks
      // back into view stays hidden under its old cell.
      this.w.cull.moved(v.spr);
      if (b.role === 'controller') this.host.drawComm(b, v, dt);
      else if (b.role === 'gatherer' && b.state === 'gather' && !b.moving) {
        // Siphoning: its tube arm sweeps the nozzle over the seep (crew/gatherer-gather-<i>), the arm side toward the seep.
        v.pump += dt;
        v.spr.setFrame(`crew/gatherer-gather-${Math.floor(v.pump * GATHER_FPS) % 8}`).setFlipX((b.work?.x ?? b.x) > b.x);
      } else {
        v.pump = 0;
        v.spr.setFrame(v.arm ? 'crew/guard-body' : `crew/${b.role}`).setFlipX(b.face < 0);
      }
      if (b.role !== 'controller') this.drawBotKit(b, v);
      if (b.stoked && !downed) this.swoosh(b, v, bx, by, g);
      v.spr.setAlpha(b.hidden ? 0.35 : 1); // a hiding Stalker (`sim/botskills.ts`) is half seen
      // Hit flash: a hot red-orange for a beat (a FILL tint draws the whole quad white under the lit shader).
      v.flashT -= dt;
      let tint: number | null = null;
      if (v.flashT > 0) tint = DANGER_HOT;
      else if (downed) tint = 0x605850;
      else if (b.auraDps > 0) {
        // Inside a twisted halo: a red wash, and red motes rising off it.
        tint = 0xffb0a8;
        if (auraFx && v.spr.visible) this.k.fx.burst(b.x + Phaser.Math.Between(-8, 8), b.y - 16, { color: DANGER, size: 0.25 });
      }
      if (tint === null) v.spr.clearTint();
      else v.spr.setTint(tint);
      if (v.arm) this.drawSaw(b, v, dt, g, tint);
      // A Dark dungeon: no light but his own (the crew's lamps dim).
      const dim = b.role !== 'controller' && sim.run?.twist === 'dark' ? DARK.lamps : 1;
      if (!b.downed || sim.deadLamps) lamps.push({ id: b.id, x: bx, y: by - 22 - up, r: LAMP[b.role][1] * wide * dim * (b.role === 'controller' ? 1 : sim.city.lampMul), i: LAMP[b.role][2] * glow * dim, solo: b.role === 'controller' });
      // Its field fix: a ring that fills while he stays near it (dim while he is out of the zone).
      const fix = sim.action;
      if (fix?.bot === b) {
        const p = Math.min(1, fix.t / fix.need), dimmed = fix.paused ? 0.4 : 1;
        g.lineStyle(5, 0x1d1a17, 0.4 * dimmed).strokeCircle(b.x, b.y - 14, 34);
        g.lineStyle(5, FRIEND, 0.95 * dimmed).beginPath().arc(b.x, b.y - 14, 34, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2).strokePath();
      }
      // The badge: its crew number, with a dot while it is on its own order (P3, `crewMark`); crew 0 shows only then.
      v.badge.setPosition(bx, by - v.spr.displayHeight * 0.62 - 10 - up).setVisible((b.crew > 0 || !!b.own) && v.spr.visible);
      // Text is rasterised again on every setColor (a canvas and a texture upload per robot per frame): only when the crew changes.
      if (v.crew !== b.crew || v.own !== !!b.own) {
        v.crew = b.crew;
        v.own = !!b.own;
        v.badge.setText(crewMark(b)).setColor(CREW_COLORS[Math.max(0, b.crew)]);
      }
      if (v.bark) {
        v.barkT -= dt;
        v.bark.setPosition(bx, by - v.spr.displayHeight * 0.62 - 26 - up).setAlpha(Math.min(0.8, v.barkT * 2));
        if (v.barkT <= 0) {
          v.bark.destroy();
          v.bark = undefined;
        }
      }
      // Oil bars only when it is leaking; repair beams while mending.
      if (b.hp < b.maxHp - 0.5 && v.spr.visible) {
        const w = 30, x = bx - w / 2, y = by - v.spr.displayHeight * 0.62 - 4 - up;
        g.fillStyle(0xf4e2bc, 0.75).fillRect(x - 1, y - 1, w + 2, 6);
        const f = b.hp / b.maxHp;
        g.fillStyle(0x0c0a08, 1).fillRect(x, y, w * f, 4);
        if (f < 0.5) g.lineStyle(LINE.detail, DANGER_HOT, 1).strokeRect(x - 1, y - 1, w + 2, 6);
      }
      if (b.state === 'repair') {
        const t = sim.bot(b.target);
        if (t) {
          const wob = Math.sin(this.scene.time.now / 60) * 3;
          g.lineStyle(LINE.accent, 0x9fe0ff, 0.35).lineBetween(b.x, b.y - 14, t.x + wob, t.y - 14);
          g.lineStyle(LINE.effect, 0xffffff, 0.9).lineBetween(b.x, b.y - 14, t.x + wob, t.y - 14);
        }
      }
    }
    this.drawFollowers();
    this.drawTip();
  }

  /** A stoked robot that is moving trails swoosh streaks (`stokeview.ts`); its heading is read from where it was last frame, eased so a turn bends them. */
  private swoosh(b: Bot, v: BotView, x: number, y: number, g: G) {
    const w = (v.way ??= { x, y, ux: 1, uy: 0 });
    const dx = x - w.x, dy = y - w.y, d = Math.hypot(dx, dy);
    w.x = x;
    w.y = y;
    if (d > 0.05) {
      const k = 0.35;
      const ux = w.ux + (dx / d - w.ux) * k, uy = w.uy + (dy / d - w.uy) * k, n = Math.hypot(ux, uy) || 1;
      w.ux = ux / n;
      w.uy = uy / n;
    }
    if (!b.moving || !v.spr.visible) return;
    for (const s of streaks(x, y, w.ux, w.uy, this.scene.time.now / 1000, b.id)) g.lineStyle(3, 0xffe2a8, s.a).lineBetween(s.x1, s.y1, s.x2, s.y2);
  }

  /**
   * A carried robot hangs from its carrier's shoulder (just behind him) by the grip at its top, a pendulum (`dangle.ts`): his
   * sideways acceleration drives it, each footfall nudges it, and his step's dip lets its feet scrape the ground (a puff of dust).
   * Its shadow stays on the ground where its feet are.
   */
  private dangle(b: Bot, v: BotView, dt: number, up: number) {
    const sim = this.sim;
    const carrier = sim.bot(b.downed!.by!);
    const cv = carrier && this.bots.get(carrier.id);
    if (!carrier || !cv) {
      v.spr.setPosition(b.x, b.y - up - 22).setAngle(28);
      return;
    }
    let e = this.swings.get(b.id);
    if (!e) this.swings.set(b.id, (e = { d: newDangle(Math.floor(cv.bob / Math.PI)), px: b.x }));
    const d = e.d, h = Math.max(dt, 1e-3);
    stepDangle(d, accelOf(d, (b.x - e.px) / h, h), dt);
    e.px = b.x;
    const st = Math.floor(cv.bob / Math.PI);
    if (st !== d.step) {
      d.step = st;
      if (carrier.moving) nudge(d);
    }
    // Where it hangs: its pivot (the grip, 0.87 of its height above its feet) on the carrier's shoulder, tilted back a little, swung by `th`.
    const face = carrier.face >= 0 ? 1 : -1, len = 0.87 * v.spr.displayHeight, base = 0.22 * face;
    const rot = base - d.th;
    const gy = b.y + 3; // the ground under it
    const dip = carrier.moving ? Math.abs(Math.sin(cv.bob)) * 3 : 0;
    const px = b.x - face * 13, py = gy - (len * Math.cos(base) + 3) + dip;
    let fx = px - len * Math.sin(rot), fy = py + len * Math.cos(rot);
    const drag = fy >= gy;
    if (drag) fy = gy;
    v.spr.setPosition(fx, fy - up).setRotation(rot);
    v.shadow.raise = up + gy - 3 - fy;
    // Feet in the dust: while they touch and he moves, a puff every so often, at the toes (the side it trails).
    d.dust -= dt;
    if (drag && carrier.moving && d.dust <= 0) {
      d.dust = 0.11;
      this.k.fx.burst(fx - face * 4, gy, { color: 0xc8a070, size: 0.16 });
    }
  }

  /** Over the nearest robot lying down within sight of him: carry home against leave, in words (P5: no one need carry everything). */
  private drawTip() {
    const sim = this.sim, c = sim.controller;
    let near: Bot | null = null, nd = 260;
    for (const b of sim.bots) {
      const d = Math.hypot(b.x - c.x, b.y - c.y);
      if (!b.dead && !b.place && b.downed?.by === null && d < nd) (nd = d), (near = b); // a place's husk (P36) costs nothing to leave
    }
    if (!near) return void this.tip?.setVisible(false);
    this.tip ??= this.k.text(0, 0, '', { size: 12, font: 'body' }).setOrigin(0.5, 1).setDepth(96000).setStroke('#1d1a17', 5).setColor('#fff3d6').setAlpha(0.9);
    const text = lyingTip(near.name, !!near.downed?.wreck);
    if (this.tip.text !== text) this.tip.setText(text);
    this.tip.setPosition(near.x, near.y - 34).setVisible(true);
  }

  /** A crew bot wears its role's head piece on top and its back piece behind it (a lamp on a pole, a ring of boilers, plating). */
  /** The Guard's saw arm: on the body, turned about its elbow through a stroke (`sawarm.ts`), with the stroke's arc of light; it wears the body's tint and fade. Mirrored by a negative scale, not `flipX` (a trimmed frame's flip is not about its origin). */
  private drawSaw(b: Bot, v: BotView, dt: number, g: G, tint: number | null) {
    const arm = v.arm!;
    arm.setVisible(v.spr.visible);
    if (!v.spr.visible) return;
    if (v.sawT !== undefined) {
      v.sawT += dt;
      if (v.sawT >= STROKE) v.sawT = undefined;
    }
    const flip = v.spr.flipX ? -1 : 1;
    const t = v.sawT ?? 0;
    const p = canvasPoint(SAW_ARM.elbow[0], SAW_ARM.elbow[1], v.spr.x, v.spr.y, v.spr.scaleX, v.spr.scaleY, flip, v.spr.rotation);
    arm.setPosition(p.x, p.y).setScale(v.spr.scaleX * flip, v.spr.scaleY).setRotation(v.spr.rotation + flip * swingAt(t)).setDepth(v.spr.depth + 0.5).setAlpha(v.spr.alpha);
    if (tint === null) arm.clearTint();
    else arm.setTint(tint);
    // The arc the blade cut: from one side of the stroke's arc to the other as it comes down, fading.
    if (v.sawT !== undefined && v.sawA !== undefined) {
      const arc = SAW.arc, k = Math.min(1, t / 0.12), a0 = v.sawA - arc / 2, head = a0 + arc * k, tail = Math.max(a0, head - 1.0);
      const cx = b.x, cy = b.y - 16, fade = 1 - t / STROKE;
      for (const [r, col, w] of [[SAW.reach + 2, 0xffffff, LINE.accent + 1], [SAW.reach - 6, 0xffc060, LINE.accent]] as const) {
        g.lineStyle(w, col, fade).beginPath().arc(cx, cy, r, tail, head).strokePath();
      }
    }
  }

  private drawBotKit(b: Bot, v: BotView) {
    const k = this.crewKit[b.role] ?? {};
    if (!k.head && !k.back && !v.kit) return;
    v.kit ??= { head: this.scene.add.image(0, 0, 'worn-hornetHead').setVisible(false), back: this.scene.add.image(0, 0, 'worn-lampOfFaith').setVisible(false) };
    const top = v.spr.y - v.spr.displayHeight * 0.92;
    for (const [img, id, dy, sc, dz] of [[v.kit.head, k.head, 6, 0.4, 0.6], [v.kit.back, k.back, 4, 0.6, -0.5]] as const) {
      img.setVisible(!!id && v.spr.visible);
      if (!id) continue;
      if (img.getData('id') !== id) img.setTexture(`worn-${id}`).setData('id', id);
      img.setPosition(v.spr.x + (dz < 0 ? -8 * b.face : 0), top + dy).setScale(sc).setFlipX(b.face < 0).setRotation(v.spr.rotation).setDepth(v.spr.depth + dz);
    }
  }

  private drawFollowers() {
    const sim = this.sim;
    const now = this.scene.time.now;
    for (const f of sim.followers) {
      let img = this.followers.get(f.id);
      if (!img) {
        img = this.w.cull.add(npcImage(this.scene, f.bot.x, f.bot.y, f.ghost ? 'esteemedGhost' : f.id, f.ghost ? 0.6 : 1).setOrigin(0.5, 0.95), { mobile: true });
        if (!f.ghost) img.setData('shadow', groundShadow(this.w, img, { fine: true }));
        this.followers.set(f.id, img);
      }
      const up = sim.rescued.includes(f.id) ? this.host.rise() : 0;
      const bob = f.ghost ? Math.sin(now / 400) * 5 - 14 : 0;
      img.setPosition(f.bot.x, f.bot.y + bob - up).setDepth(f.bot.y + (f.ghost ? 60 : 0)).setFlipX(f.bot.x > sim.controller.x);
      const sh = img.getData('shadow') as Shadow | undefined;
      if (sh) sh.raise = up;
      this.w.cull.moved(img);
      if (f.ghost) img.setAlpha(0.55 + 0.15 * Math.sin(now / 250));
    }
  }

  event(e: SimEvent) {
    switch (e.e) {
      case 'ai':
        this.onAi(e);
        break;
      case 'bark':
        this.say(e.bot, e.text);
        break;
      case 'saw': {
        // The Guard's saw stroke: the arm chops (`drawSaw`), the blade rasps, sparks fly off the foe it bit.
        const v = this.bots.get(e.by.id);
        if (v) {
          v.sawT = 0;
          v.sawA = e.a;
        }
        this.sfx('saw', e.by.x, e.by.y, { gain: e.hits ? 0.9 : 0.6, vary: 0.15 });
        if (e.hits && e.at) {
          this.k.fx.burst(e.at.x, e.at.y - 12, { color: 0xffd070, size: 0.7 });
          this.k.fx.burst(e.at.x, e.at.y - 12, { color: 0xffffff, size: 0.35 });
          this.flash(e.at.x, e.at.y - 12, 0xffc060, 2);
        }
        break;
      }
      case 'botDown':
        this.k.fx.burst(e.bot.x, e.bot.y - 16, { color: 0x403830, size: 1.1 });
        this.floater(e.bot.x, e.bot.y - 40, 'down', '#ffb070', 1400, 13);
        this.sfx('pop', e.bot.x, e.bot.y, { gain: 0.5, vary: 0.2 });
        break;
      case 'fixed':
        this.aiRing(e.bot.x, e.bot.y + 4, 26, FRIEND, 700);
        this.floater(e.bot.x, e.bot.y - 40, 'back up', '#a0f0b0', 1200, 13);
        this.sfx('pop', e.bot.x, e.bot.y, { gain: 0.4, vary: 0.1 });
        break;
      case 'carry':
        this.floater(e.by.x, e.by.y - 56, `carrying ${e.bot.name}`, '#c8d4e0', 900, 12);
        break;
      case 'follow':
        this.hud.banner(e.f.name, 2600);
        this.flash(e.f.bot.x, e.f.bot.y - 20, e.f.ghost ? 0xd0e8ff : 0xff9fd0, 2);
        break;
      case 'joined': {
        // Dropped from the Wanderer on a rope: falls in, lands in a puff of dust.
        this.add(e.bot);
        const v = this.bots.get(e.bot.id)!;
        v.spr.setTint(0xffe0a0);
        v.badge.setText('G');
        const y0 = e.bot.y;
        v.spr.y = y0 - 300;
        this.scene.tweens.add({ targets: v.spr, y: y0, duration: 500, ease: 'Quad.easeIn', onComplete: () => this.k.fx.burst(e.bot.x, y0, { color: 0xc8a070, size: 1 }) });
        break;
      }
      case 'despawn': {
        // Hauled back up: up and away, gone.
        const v = this.bots.get(e.bot.id);
        if (v) {
          this.bots.delete(e.bot.id);
          this.w.cull.remove(v.spr);
          this.k.lights.remove(v.light);
          v.badge.destroy();
          v.bark?.destroy();
          v.kit?.head.destroy();
          v.kit?.back.destroy();
          this.scene.tweens.add({ targets: v.arm ? [v.spr, v.arm] : v.spr, y: '-=300', alpha: 0, duration: 700, ease: 'Quad.easeIn', onComplete: () => (v.spr.destroy(), v.arm?.destroy()) });
        }
        break;
      }
    }
  }

  /** A robot's choice made readable (`sim/botai.ts`): a ring, a puff, a word. Barks come as their own events. */
  private onAi(e: Extract<SimEvent, { e: 'ai' }>) {
    const b = e.bot, v = this.bots.get(b.id);
    switch (e.what) {
      case 'dodge':
        this.k.fx.burst(b.x, b.y + 6, { color: 0xd8c8a0, size: 0.35 });
        if (v) kick(v.sq, 0.18);
        if (e.x !== undefined && e.y !== undefined) this.aiRing(e.x, e.y + 4, 14, 0xfff3d6, 380);
        break;
      case 'brace':
        this.aiRing(b.x, b.y + 4, 22, 0xb0c0d0, 500);
        this.floater(b.x, b.y - 30, 'brace', '#c8d4e0', 900, 12);
        break;
      case 'retreat':
        this.aiRing(b.x, b.y + 4, 24, 0xffb070, 700);
        this.floater(b.x, b.y - 30, 'falling back', '#ffb070', 1200, 12);
        break;
      case 'rejoin':
        this.aiRing(b.x, b.y + 4, 24, 0x80e0a0, 700);
        this.floater(b.x, b.y - 30, 'back in', '#a0f0b0', 1000, 12);
        break;
      case 'cover':
        this.floater(b.x, b.y - 30, 'taking cover', '#ffd98a', 1000, 12);
        break;
      case 'focus': {
        // A glance: a ring on the foe it picked for a reason (Marked, yours, hitting you, its weakness, the crew's).
        const h = this.sim.hornets.find((x) => x.id === e.to);
        if (h) this.aiRing(h.x, h.y + 2, Math.max(16, h.r + 6), e.why?.includes('marked') ? FRIEND : 0xffd060, 450);
        break;
      }
      case 'cast': {
        // An ability the AI chose (`sim/botskills.ts`): a ring where it lands and its name over the caster.
        const look = CAST_LOOK[e.why ?? ''] ?? { word: e.why ?? 'cast', r: 40 };
        this.aiRing(e.x ?? b.x, (e.y ?? b.y) + 4, look.r, FRIEND, 600);
        this.floater(b.x, b.y - 30, look.word, '#c8d4e0', 900, 12);
        break;
      }
      case 'polish':
        this.k.fx.burst(b.x + b.face * 10, b.y - 12, { color: 0xfff0c0, size: 0.25 });
        break;
      case 'ruin':
        if (e.x !== undefined && e.y !== undefined) this.aiRing(e.x, e.y, 30, 0x9ff6ff, 900);
        break;
    }
  }

  /** A ring on the ground that widens and fades. */
  private aiRing(x: number, y: number, r: number, color: number, ms: number) {
    const g = this.scene.add.graphics().setDepth(y - 1);
    g.lineStyle(LINE.effect, color, 0.9).strokeEllipse(0, 0, r * 2, r * 2 * 0.62);
    g.setPosition(x, y);
    this.scene.tweens.add({ targets: g, scale: 1.5, alpha: 0, duration: ms, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
  }

  /** A robot speaks: a speech line over its head, in the colony's faith. */
  private say(b: Bot, text: string) {
    const v = this.bots.get(b.id);
    if (!v) return;
    v.bark?.destroy();
    v.bark = this.k.text(b.x, b.y - 40, text, { size: 13, font: 'body' }).setOrigin(0.5, 1).setDepth(96000).setStroke('#1d1a17', 5).setColor('#fff3d6');
    v.barkT = 2.8;
  }
}
