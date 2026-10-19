/**
 * The enemies on screen: each hornet-like foe's painting (small ones, bosses' forms), its squash, night dress (aura,
 * eyes, a few real lights), wind-up shake and the tells that are not a tier ability's (`tierview.ts` draws those); the
 * marks over its head (tier stripes, an elite's crown, its name under the pointer); its fall. The spider has its own view
 * (`spider.ts`); a boss's wind-up shapes and beats are `bossview.ts`.
 * Add a beat for a foe event: a `case` in `event`. Add a look: in `update`'s per-foe loop (`drawHornets`).
 */
import { isCaterpillar } from './caterpillar';
import Phaser from 'phaser';
import { atlas } from '../../../harness/kit/assets';
import { S } from './art';
import { DANGER, DANGER_TWISTED, LINE } from './house';
import { VIOLET, ViewBase, kick, ring, spring, type G, type HornetView, type Light } from './playhost';
import { BEAST_MODS, BIOMES, COUNTERS, ELITE_TRAITS, FOES, FOE_TIERS, HORNET, STAGE, TIER, TWISTED, bossNow, bossOf, countersOf, type Enemy } from './sim/defs';
import { drawCounter } from './counters';
import { FadePool, GlowBands } from './fxpool';
import type { Hornet, SimEvent } from './sim/sim';
import { foeDash, hasAbility } from './sim/tiers';
import type { PlayHost } from './playhost';
import { airShadow, groundShadow } from './shadowview';
import { CHAINS, chainKey } from './chain';
import { breathOf, newMotion, stepMotion, stretchOf, type Motive } from './foemotion';
import { foeGait } from './footsteps';
import { quadOf } from './quad';

/** Twisted hornets lit by a real light at once (the nearest to the view); the rest only glow. */
const AURA_LIGHTS = 4;
/**
 * How each land's arrivals come off its rock rim (P31; threads.md "Enemies arrive from beyond every land's natural edges"): sand off
 * the desert's mesas, leaves and bark from the jungle's canopy, grit and broken brick off the city's walls, snow off the Frostspine's
 * cliffs, ash in the Wastes, mist in the Ether. Two colours and a sound each.
 */
const RIM_LOOK: Record<string, { a: number; b: number; sfx: string }> = {
  desert: { a: 0xd8b880, b: 0xb08a58, sfx: 'rock' },
  jungle: { a: 0x5a8a3a, b: 0x8a6a3a, sfx: 'swish' },
  city: { a: 0x9a948a, b: 0x8a5a48, sfx: 'rock' },
  snow: { a: 0xf4f8ff, b: 0xcfe0f0, sfx: 'swish' },
  demon: { a: 0x3a2a2a, b: 0xb04020, sfx: 'rock' },
  ether: { a: 0xb090ff, b: 0xe0d8ff, sfx: 'swish' },
};
const RAD = Math.PI / 180;

export class FoeView extends ViewBase {
  private auraLights: Light[] = [];
  private fades = new FadePool(this.scene);
  private glows = new GlowBands(this.scene);
  private motive: Motive = { hop: 0, rock: 0, late: 0 };
  /** The ids of the foes the sim has this frame (so the views of those gone are found in one pass). */
  private alive = new Set<number>();
  private bossLight: Light;
  /** The dark foes in view this frame, for the edge light's cap (`rims`). */
  private rimCand: { v: HornetView; d: number }[] = [];
  /** The name of the elite under the pointer (P12), a world label. */

  constructor(host: PlayHost) {
    super(host);
    const L = host.k.lights;
    for (let i = 0; i < AURA_LIGHTS; i++) this.auraLights.push(L.add(-999, -999, { color: DANGER, radius: 150, intensity: 0 }));
    this.bossLight = L.add(-999, -999, { color: bossOf(host.sim.biome.dusk ?? 'drone').color, radius: 300, intensity: 0 });
  }

  /** The lights this view burns (they take no slot of the cap while at nothing: `LampView`). */
  lights() {
    return [...this.auraLights, this.bossLight];
  }

  update(dt: number, g: G) {
    this.fades.update(dt);
    this.drawHornets(dt, g);
    this.drawMarks(g);
  }

  event(e: SimEvent) {
    const fx = this.k.fx;
    const w = this.w;
    switch (e.e) {
      case 'spit':
        // A track-drone's plasma: a red flash at the muzzle and a wet crack.
        this.flash(e.s.x, e.s.y, DANGER, 0.7);
        fx.burst(e.s.x, e.s.y, { color: DANGER, size: 0.4 });
        this.sfx('zap', e.s.x, e.s.y, { gain: 0.5, vary: 0.2 });
        break;
      case 'spawn':
        // A twisted hornet announces itself: a violet burst and a falling whine, near enough to hear.
        if (e.h.twisted && !e.h.boss) {
          fx.burst(e.h.x, e.h.y - 18, { color: VIOLET, size: 0.7 });
          this.sfx('twist', e.h.x, e.h.y, { gain: 0.5, vary: 0.2 });
        }
        break;
      case 'tier': {
        // A front hit blocked, a Thorn or a Mirror shell answering, a Carapace flipped, young let out, help called.
        // The tells draw themselves (`tierview.ts`); here only the moments they end in, and a tick as one begins.
        if (e.what === 'dig' || e.what === 'tellSurface' || e.what === 'tellSpit' || e.what === 'tellThrow' || e.what === 'tellLob') {
          this.sfx('tick', e.x, e.y, { gain: 0.3, vary: 0.2 });
          const v = e.h && this.hornets.get(e.h.id);
          if (v) kick(v.sq, -0.4);
          break;
        }
        if (e.what === 'blink') {
          // A Blinker steps out of a slow blow: a violet puff where it was, and where it is.
          fx.burst(e.x, e.y - 14, { color: COUNTERS.blinker.color, size: 0.9 });
          if (e.h) fx.burst(e.h.x, e.h.y - 14, { color: COUNTERS.blinker.color, size: 0.5 });
          this.sfx('swish', e.x, e.y, { gain: 0.45, vary: 0.2 });
          const v = e.h && this.hornets.get(e.h.id);
          if (v) kick(v.sq, 0.5);
          break;
        }
        if (e.what === 'mend') {
          fx.burst(e.x, e.y - 14, { color: COUNTERS.mender.color, size: 0.4 });
          break;
        }
        const col = e.what === 'mirror' ? 0x9fd0ff : e.what === 'thorns' ? 0xffd070 : e.what === 'block' ? 0xc8d4e0 : e.what === 'surface' ? 0xd8b078 : e.what === 'lob' ? 0xe08030 : e.what === 'spit' ? 0x9ad040 : e.what === 'puddle' ? 0xff7a20 : e.what === 'carpet' ? 0xe8f4ff : 0xffffff;
        const big = e.what === 'surface' || e.what === 'lob';
        fx.burst(e.x, e.y - 14, { color: col, size: e.what === 'block' ? 0.35 : big ? 1.1 : 0.6 });
        if (big) this.flash(e.x, e.y - 10, col, 1.2);
        this.sfx(e.what === 'call' || e.what === 'brood' ? 'twist' : e.what === 'lob' ? 'boom' : big ? 'thump' : 'tick', e.x, e.y, { gain: big ? 0.6 : 0.35, vary: 0.2 });
        break;
      }
      case 'twist': {
        // The dark gets into a hornet: it flashes violet, squashes and shrieks.
        fx.burst(e.h.x, e.h.y - 18, { color: VIOLET, size: 1 });
        fx.burst(e.h.x, e.h.y - 18, { color: 0xff2858, size: 0.5 });
        this.flash(e.h.x, e.h.y - 18, VIOLET, 1.4);
        this.sfx('twist', e.h.x, e.h.y, { gain: 0.8, vary: 0.2 });
        const v = this.hornets.get(e.h.id);
        if (v) kick(v.sq, -0.5);
        break;
      }
      case 'tell': {
        const v = this.hornets.get(e.h.id);
        if (v) kick(v.sq, -0.3);
        if (!e.h.boss) this.sfx('twist', e.h.x, e.h.y, { gain: 0.25, vary: 0.3 });
        break;
      }
      case 'dash': {
        const v = this.hornets.get(e.h.id);
        if (v) kick(v.sq, 0.6);
        fx.burst(e.h.x, e.h.y - 18, { color: VIOLET, size: 0.5 });
        break;
      }
      case 'feed': {
        const bit = this.scene.add.image(e.h.x, e.h.y - 20, 'crude').setScale(0.8 / S).setDepth(e.h.y + 60).setTint(0x9aa4ae);
        const tx = e.boss.x, ty = e.boss.y - 30;
        this.scene.tweens.add({ targets: bit, x: tx, duration: 420 });
        this.scene.tweens.add({ targets: bit, y: { from: e.h.y - 20, to: ty }, duration: 420, ease: (k: number) => k * k * 1.6 - k * 0.6, onComplete: () => {
          bit.destroy();
          this.floater(tx, ty - 30, `+${Math.round(e.amt)}`, '#80ff90', 900, 15);
          fx.burst(tx, ty, { color: 0x80ff90, size: 0.6 });
        } });
        this.sfx('swish', e.h.x, e.h.y, { gain: 0.3, vary: 0.3 });
        break;
      }
      case 'sting': {
        fx.burst(e.bot.x, e.bot.y - 16, { color: 0x3df2ff, size: 0.35 });
        const v = this.hornets.get(e.h.id);
        if (v) kick(v.sq, 0.3); // the lunge
        break;
      }
      case 'beast':
        // P31's biome kinds: a Bell collar's ring, a herd's scream, an officer charged by Shock, a monkey's theft.
        if (e.what === 'rimIn') {
          // Each land's way in from beyond its edge (P31): what the arrival brings down with it as it comes off the rim.
          const L = RIM_LOOK[BIOMES[this.sim.biomeId].paint];
          for (let i = 0; i < 4; i++) fx.burst(e.x + Phaser.Math.Between(-14, 14), e.y + Phaser.Math.Between(-6, 10), { color: i % 2 ? L.a : L.b, size: 0.45 });
          this.sfx(L.sfx, e.x, e.y, { gain: 0.35, vary: 0.2 });
        } else if (e.what === 'bell') {
          this.floater(e.x, e.y - 40, 'CLANG', '#f0d060', 1000, 15);
          this.sfx('bell', e.x, e.y, { gain: 0.45, vary: 0.1 });
        } else if (e.what === 'tellScream') this.sfx('tick', e.x, e.y, { gain: 0.3, vary: 0.2 });
        else if (e.what === 'scream') {
          fx.burst(e.x, e.y - 14, { color: e.h.twisted ? VIOLET : 0xcfe8ff, size: 0.8 });
          this.floater(e.x, e.y - 38, 'MAAAA', e.h.twisted ? '#d0a0ff' : '#cfe8ff', 900, 14);
          this.sfx('whistle', e.x, e.y, { gain: 0.25, vary: 0.3 });
        } else if (e.what === 'ground') {
          fx.burst(e.x, e.y - 16, { color: 0xf0cf3a, size: 0.5 });
          this.floater(e.x, e.y - 40, 'Grounded', '#f0cf3a', 900, 13);
        } else if (e.what === 'steal') this.floater(e.x, e.y - 40, `-${e.n} scrap`, '#ff9a70', 1600, 16);
        else if (e.what === 'drop') this.floater(e.x, e.y - 40, `${e.n} scrap back`, '#ffe0a0', 1600, 15);
        else if (e.what === 'away') this.floater(e.x, e.y - 40, `Gone with ${e.n} scrap`, '#ff9a70', 1800, 15);
        break;
      case 'whistle':
        this.floater(e.h.x, e.h.y - 40, 'TWEEEET', '#9fd8ff', 1100, 16);
        this.flash(e.h.x, e.h.y - 18, 0x4a8fe0, 1.4);
        this.sfx('whistle', e.h.x, e.h.y, { gain: 0.6, vary: 0.1 });
        break;
      case 'pop':
        for (let i = 0; i < 6; i++) fx.burst(e.h.x + Phaser.Math.Between(-e.r / 2, e.r / 2), e.h.y - 10 + Phaser.Math.Between(-e.r / 3, e.r / 3), { color: i % 2 ? 0xb02030 : 0xe04050, size: 0.7 });
        w.marks.stamp('world-soft', e.h.x, e.h.y, { tint: 0x5a1018, alpha: 0.55, scale: 1.2, kind: false });
        this.sfx('pop', e.h.x, e.h.y, { gain: 0.8, vary: 0.2 });
        this.k.juice.shake('small');
        break;
      case 'reel': {
        const g = this.fades.spawn({ depth: 71000, ms: 260 });
        g.lineStyle(LINE.effect, 0x2a2622, 1).lineBetween(e.by.x, e.by.y - 14, e.h.x, e.h.y - 14);
        g.lineStyle(LINE.detail, 0xc8963c, 1).lineBetween(e.by.x, e.by.y - 14, e.h.x, e.h.y - 14);
        break;
      }
      default:
        break;
    }
  }

  /** The atlas has this painted frame. */
  private hasFrame(frame: string) {
    return this.scene.textures.exists('atlas') && this.scene.textures.get('atlas').has(frame);
  }

  /**
   * A boss's painted frames: its form, its second form (the first again if it has none) and a wingbeat frame. Drawn
   * as SVG and weathered (`art-src/foe/<kind>-boss.svg`, `-boss2`, `-boss-flap`: tools/svg-paint.cjs) or painted by
   * Laimonas (the Evil Oracle: `foe/<kind>`, unveiled `foe/<kind>-unveiled`; the Harbinger, `foe/harbinger`, the fallback).
   * None for a hornet without its painting, which flaps in code.
   */
  private bossForms(kind: Enemy): [string, string, string?] | undefined {
    const f = (n: string) => (this.hasFrame(n) ? n : undefined);
    const one = f(`foe/${kind}-boss`) ?? (f(`foe/${kind}-unveiled`) ? `foe/${kind}` : undefined) ?? (kind === 'hornet' ? undefined : 'foe/harbinger');
    return one ? [one, f(`foe/${kind}-boss2`) ?? f(`foe/${kind}-unveiled`) ?? one, f(`foe/${kind}-boss-flap`)] : undefined;
  }

  /** A small foe's painting and its wing frame (the hornet's), if the atlas has them: as `bossForms`, one form. */
  private mobForms(kind: Enemy): [string, string, string?] | undefined {
    const one = `foe/${kind}`;
    if (!this.hasFrame(one)) return undefined;
    const flap = `foe/${kind}-flap`;
    return [one, one, this.hasFrame(flap) ? flap : undefined];
  }

  /**
   * Hornets stretch along their flight and flap. By night the twisted ones wear a violet halo (their aura, true to its
   * radius, with a turning ring), glowing eyes (more as the menace past midnight grows) and, for the nearest few, a real
   * light. A wind-up is shown as it comes: a dash as a line, the queen's attacks as a line, a fan, a strip or a ring.
   */
  private drawHornets(dt: number, g: Phaser.GameObjects.Graphics) {
    const sim = this.sim;
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const now = this.scene.time.now;
    const buff = sim.buff;
    const near: { h: Hornet; d: number }[] = [];
    let queen: Hornet | null = null;
    this.alive.clear();
    this.rimCand.length = 0;
    const stage = this.host.t.stageTint;
    for (const h of sim.hornets) {
      if (h.spider || isCaterpillar(h)) continue; // spiders and caterpillars have their own views (spider.ts, caterpillar.ts)
      this.alive.add(h.id);
      let v = this.hornets.get(h.id);
      if (!v) {
        // Every foe is a painting (art/foe/<kind>): the Demon Wastes' are Laimonas's, the small ones drawings weathered into
        // paintings (tools/mob-svg.cjs, the hornet with its wing frame), the tracked ones standing on the sand; every boss too
        // (`bossForms`). A foe with no painting falls back to its texture drawn in code, `foe-<kind>`, or the hornet's.
        // The Hive Foreman (level 1's mini-boss) is a plain hornet sized up: the hornet's painting or drawing, scaled and tinted amber.
        const art: Enemy = h.kind === 'foreman' ? 'hornet' : h.kind;
        // A long-bodied foe (a rattler, the vein-crawler) is its head here and a chain of plates behind it (`chainview.ts`).
        const ck = chainKey(h), chainHead = ck && this.hasFrame(CHAINS[ck].head) ? CHAINS[ck].head : undefined;
        const forms = chainHead ? ([chainHead, chainHead] as [string, string]) : h.boss && art === h.kind ? this.bossForms(h.kind) : this.mobForms(art);
        const painted = art !== 'hornet' || !!forms;
        const ground = FOES[h.kind].ground;
        // A foe drawn in code (the rattler, `dungeonart.ts`) has its own texture, `foe-<kind>`.
        const own = `foe-${h.kind}`;
        const img = !forms && this.scene.textures.exists(own) ? this.scene.add.image(h.x, h.y, own).setScale(1 / S).setOrigin(0.5, 0.85) : painted ? atlas(this.scene).image(h.x, h.y, forms ? forms[0] : `foe/${art}`).setOrigin(0.5, ground ? 0.92 : 0.5) : this.scene.add.image(h.x, h.y, 'hornet0');
        const spr = this.w.cull.add(img, { mobile: true });
        const shadow = ground ? groundShadow(this.w, spr, { big: !!h.boss }) : airShadow(this.w, spr, { big: !!h.boss });
        v = { spr, sq: { s: 0, v: 0 }, shadow, eyes: [], painted, ground: !!ground, base: spr.scaleX, motion: newMotion(), hop: 0, late: 0, chain: !!ck, shAlpha: shadow.alpha, forms, form: forms?.[0] };
        this.hornets.set(h.id, v);
      }
      spring(v.sq, dt);
      const B = h.boss ? bossNow(h.kind, h.phase, h.breaks) : null;
      // A boss's second form is its own frame (the knight on foot, the bear's jet, the Oracle unveiled), and may fly; it
      // changes back when the form does. The queen's wings beat between two frames.
      const flying = !!(h.boss && h.phase === 2 && bossOf(h.kind).phase2?.fly);
      if (v.forms) {
        const [one, two, flap] = v.forms;
        const form = h.phase === 2 ? two : one;
        if (v.form !== form) {
          v.form = form;
          v.ground = !flying && !!FOES[h.kind].ground;
          v.shadow.height = flying ? 5 : 1;
        }
        const fr = form === one && flap && Math.floor(now / 70 + h.id) % 2 ? flap : form;
        if (v.spr.frame.name !== fr) v.spr.setFrame(fr);
      }
      // Up in a leap: gone from the ground, its shadow growing where it will land.
      v.spr.setAlpha(h.air ? 0 : h.under ? 0.12 : h.veiled ? 0.15 + 0.08 * Math.sin(now / 60) : FOES[h.kind].ethereal ? (sim.ghostTouch ? 0.85 : 0.45 + 0.15 * Math.sin(now / 130 + h.id)) : 1);
      v.shadow.alpha = h.air || h.under ? 0 : (v.shAlpha ?? v.shadow.alpha);
      // A driller under the floor: only a moving crack of broken ground shows where it is.
      if (h.under) {
        g.fillStyle(0x15110e, 0.5).fillEllipse(h.x, h.y, 26, 10);
        g.lineStyle(LINE.detail, 0xdceefc, 0.6).lineBetween(h.x - 10, h.y - 1, h.x - 2, h.y + 2).lineBetween(h.x - 2, h.y + 2, h.x + 9, h.y - 2);
      }
      if (h.air && h.slam && B?.slam) {
        const p = 1 - Math.max(0, h.brain.t) / B.slam.air;
        g.fillStyle(0x000000, 0.15 + 0.35 * p).fillEllipse(h.slam.x, h.slam.y, B.slam.radius * 2 * (0.3 + 0.7 * p), B.slam.radius * 1.2 * (0.3 + 0.7 * p));
        g.lineStyle(LINE.effect, DANGER, 0.3 + 0.5 * p).strokeEllipse(h.slam.x, h.slam.y, B.slam.radius * 2, B.slam.radius * 1.2);
      }
      // A ring on its way out: dash through it.
      if (h.quake && B?.quake) {
        const q = h.quake, a = 1 - q.r / B.quake.max;
        g.lineStyle(B.quake.width * 0.6, DANGER, 0.25 + 0.45 * a).strokeEllipse(q.x, q.y, q.r * 2, q.r * 1.3);
        g.lineStyle(LINE.effect, 0xffffff, 0.5 * a).strokeEllipse(q.x, q.y, q.r * 2, q.r * 1.3);
      }
      const k = (B ? B.scale * 1.3 : h.elite ? HORNET.elite.scale * 1.3 : 1.3) * (h.small ? TIER.small : 1);
      const br = h.brain;
      const tell = br.state === 'tell' || br.state.startsWith('tell') || br.state === 'shift';
      const rush = br.state === 'go' || br.state === 'charge';
      const speed = Math.hypot(h.vx, h.vy);
      // A walker hops once per footfall and rocks, a flier hovers, both lean into their way, every body breathes (a chain not: it
      // is plates). A body with no legs to carry its motion (a flier, a walker not rigged: `quad.ts`) also stretches a little along
      // its way; a rigged walker and a chain do not. An event (a hit, a dash, a kick) squashes, through `sq`.
      const q = v.ground ? quadOf(h.kind) : undefined;
      const st = v.sq.s + (v.chain || q || h.boss ? 0 : stretchOf(speed, rush));
      const gait = v.ground ? foeGait(h.kind) : 'none';
      const mo = stepMotion(v.motion, dt, speed, gait, !v.ground, rush, this.motive, q?.gait);
      v.hop = mo.hop;
      v.late = mo.late;
      const breath = v.chain ? 1 : breathOf(now / 1000, h.id, speed);
      const shake = tell ? (h.boss ? 3 : 2) : 0;
      const bob = v.ground ? 0 : B ? Math.sin(now / 320 + h.id) * 4 : v.painted ? Math.sin(now / 140 + h.id) * 2.5 : 0;
      const x = h.x + (shake ? Phaser.Math.FloatBetween(-shake, shake) : 0), y = (v.ground ? h.y : h.y - 18) + bob - mo.hop;
      const flip = h.vx < 0, sgn = flip ? -1 : 1;
      if (v.ground) v.shadow.raise = mo.hop;
      if (v.painted) {
        // A painting: tracked ones roll upright, flyers and walkers lean into their way.
        const sz = v.base * (h.elite && !B ? HORNET.elite.scale * 0.9 : 1) * (h.small ? TIER.small : 1) * breath;
        v.spr.setPosition(x, y).setFlipX(flip).setDepth(v.ground ? h.y : h.y + 40).setScale(sz * (1 + st), sz * (1 - st * 0.6));
        v.spr.rotation = h.kind === 'snake' ? Math.sin(now / 90 + h.id) * (speed > 30 ? 0.1 : 0.035) : sgn * (v.motion.lean + mo.rock) + (v.ground ? 0 : Phaser.Math.Clamp(h.vy * 0.05, -15, 15) * sgn * RAD);
      } else {
        v.spr.setTexture(Math.floor(now / (B ? 70 : 45) + h.id) % 2 ? 'hornet1' : 'hornet0');
        v.spr.setPosition(x, y).setFlipX(flip).setDepth(h.y + 40).setScale((k / S) * (1 + st) * breath, (k / S) * (1 - st * 0.6) * breath);
        v.spr.rotation = sgn * v.motion.lean + Phaser.Math.Clamp(h.vy * 0.06, -20, 20) * sgn * RAD;
      }
      // Dress: elites red, twisted violet, the queen crimson; a wind-up burns hot.
      if (tell) v.spr.setTint(0xff70ff);
      else if (h.kind === 'foreman') v.spr.setTint(0xffd890);
      else if (B) v.spr.setTint(v.painted ? 0xffc0c4 : 0xff6a90);
      else if (stage) {
        // The three stages (D43): normal as drawn (an elite's crown and name already say it), twisted and menacing charcoal over the painted shading.
        if (h.twisted || h.menacing) v.spr.setTint(STAGE.tint);
        else v.spr.clearTint();
      } else if (h.twisted) v.spr.setTint(v.painted ? 0xff8890 : h.elite ? 0xff80c8 : 0xc890ff);
      else if (h.elite) v.spr.setTint(0xffa0a0);
      else v.spr.clearTint();
      this.w.cull.moved(v.spr); // foes move off screen too (as the robots above)
      const onView = h.x > view.x - 200 && h.x < view.right + 200 && h.y > view.y - 200 && h.y < view.bottom + 200;
      this.stageLook(h, v, stage && !B && (h.twisted || !!h.menacing), onView, now, view);
      const a = sim.auraOf(h);
      if (a) {
        const col = DANGER; // an aura is a hazard: red, whatever the enemy's own colour
        if (!v.aura) v.aura = this.glows.glow(this.scene, 'under', col, h.x, h.y);
        const pulse = 0.5 + 0.5 * Math.sin(now / (B ? 380 : 260) + h.id);
        // A menacing enemy (past midnight, P46's refined curve) wears the menace: a bigger, brighter halo and more eyes; the rest stay as twisted ones (first cut, P7 draws the full look).
        const mn = h.menacing ? 1 : 0, bf = mn * buff;
        v.aura.setVisible(onView).setPosition(h.x, h.y + 4).setScale(((2 * a.radius) / 128) * (1 + 0.15 * mn), ((2 * a.radius) / 128) * 0.62 * (1 + 0.15 * mn)).setAlpha((B ? 0.34 : 0.2) + 0.08 * pulse + 0.05 * Math.min(bf, 4) + 0.06 * mn);
        if (onView) ring(g, h.x, h.y + 4, a.radius, col, 0.3 + 0.2 * pulse, now + h.id * 300);
        // Eyes: one pair of red-violet pinpricks; each menace level past midnight opens another.
        const n = v.painted && h.kind !== 'hornet' ? 0 : (B ? 3 : 1) + mn + Math.min(4, Math.floor(bf)); // painted foes have their own eyes; a menacing hornet opens more
        while (v.eyes.length < n) v.eyes.push(this.glows.glow(this.scene, 'over', 0xff2858));
        v.eyes.forEach((e, i) => {
          e.setVisible(onView && i < n);
          if (!e.visible) return;
          const side = flip ? -1 : 1;
          const row = i - (n - 1) / 2;
          e.setPosition(x + side * (10.5 - Math.abs(row) * 0.9) * k, y + (0.5 + row * 3.2) * k);
          e.setScale((0.2 + 0.03 * Math.min(bf, 5)) * (k / 1.3) * (tell ? 1.8 : 1) * (B ? 0.8 : 1));
          e.setAlpha(0.75 + 0.25 * Math.sin(now / 140 + i * 2 + h.id));
        });
        if (onView && !B) near.push({ h, d: Math.hypot(h.x - view.centerX, h.y - view.centerY) });
      }
      if (B && !B.mini) queen = h;
      // The wind-ups.
      if (onView && tell) {
        const p = 1 - Math.max(0, br.t) / (!B ? foeDash(h)?.tell ?? TWISTED[h.kind].dash.tell : br.state === 'tellCharge' ? B.charge.tell : br.state === 'tellVolley' ? B.volley.tell : br.state === 'tellSummon' ? B.summon.tell : br.state === 'tellQuake' ? B.quake?.tell ?? 1 : br.state === 'tellSlam' ? B.slam?.tell ?? 1 : br.state === 'shift' ? bossOf(h.kind).phase2?.shift ?? 1 : 1);
        if (br.state === 'tell') {
          g.lineStyle(LINE.effect, DANGER, 0.25 + 0.5 * p).lineBetween(h.x, h.y - 12, h.x + br.dx * 150, h.y - 12 + br.dy * 150);
          // A Dive: the shadow of where it will drop.
          if (hasAbility(h, 'dive')) g.fillStyle(0x000000, 0.15 + 0.3 * p).fillEllipse(h.x + br.dx * 130, h.y + br.dy * 130, 36, 16);
        }
        else if (B && br.state === 'tellCharge') {
          const len = B.charge.speed * B.charge.time, w = B.r;
          const nx = -br.dy * w, ny = br.dx * w;
          const x0 = h.x, y0 = h.y - 12;
          g.fillStyle(DANGER, 0.1 + 0.3 * p);
          g.beginPath().moveTo(x0 + nx, y0 + ny).lineTo(x0 + br.dx * len + nx, y0 + br.dy * len + ny).lineTo(x0 + br.dx * len - nx, y0 + br.dy * len - ny).lineTo(x0 - nx, y0 - ny).closePath().fillPath();
        } else if (B && br.state === 'tellVolley') {
          const n = B.volley.bolts + (br.rage ? B.volley.extra : 0);
          const t = sim.bot(h.target);
          const a0 = t ? Math.atan2(t.y - 10 - (h.y - 18), t.x - h.x) : 0;
          g.lineStyle(LINE.effect, DANGER, 0.15 + 0.5 * p);
          for (let i = 0; i < n; i++) {
            const ang = a0 + (n > 1 ? i / (n - 1) - 0.5 : 0) * B.volley.spread;
            g.lineBetween(h.x, h.y - 18, h.x + Math.cos(ang) * 190, h.y - 18 + Math.sin(ang) * 190);
          }
        } else if (B && br.state === 'tellSummon') g.lineStyle(LINE.accent, DANGER, 1 - p).strokeCircle(h.x, h.y - 18, 30 + p * 110);
        else if (B && br.state === 'tellQuake') {
          // The chest drum: two beats, each a ring that tightens onto it.
          const beat = (p * 2) % 1;
          g.lineStyle(LINE.accent, DANGER, 0.3 + 0.5 * beat).strokeEllipse(h.x, h.y, (B.r + 60 * (1 - beat)) * 2, (B.r + 60 * (1 - beat)) * 1.3);
        } else if (B && br.state === 'tellSlam') g.fillStyle(DANGER, 0.15 + 0.3 * p).fillEllipse(h.x, h.y, B.r * 2.4, B.r * 1.2);
        else if (B && br.state === 'shift') g.lineStyle(LINE.accent, 0xffffff, 0.3 + 0.5 * Math.abs(Math.sin(now / 90))).strokeEllipse(h.x, h.y - 20, B.r * 3, B.r * 2.2);
      }
    }
    for (const [id, v] of this.hornets) if (!this.alive.has(id)) this.hornetDown(id, v);
    this.rims();
    // A few real lights: the twisted nearest the view, and the queen's.
    near.sort((p, q) => p.d - q.d);
    this.auraLights.forEach((l, i) => {
      const n = near[i];
      if (!n) return void l.setIntensity(0);
      l.setPosition(n.h.x, n.h.y - 18).setRadius(sim.auraOf(n.h)!.radius * 1.8).setIntensity((0.7 + 0.2 * Math.sin(now / 200 + n.h.id)) * (0.6 + 0.4 * this.host.night()));
    });
    if (queen) this.bossLight.setPosition(queen.x, queen.y - 18).setRadius(queen.brain.rage ? 380 : 300).setIntensity(1 + 0.3 * Math.sin(now / 150) + (queen.brain.rage ? 0.4 : 0));
    else this.bossLight.setIntensity(0);
  }

  /**
   * The three-stage look's extras (D43, `STAGE`): a menacing body wears a pulsing additive glow in the twisted red over its charcoal
   * (on top of the eyes and halo it has); every dark body (twisted or menacing) is a candidate for the pale edge light behind it
   * (`rims` gives it to the nearest few). The charcoal tint itself is set with the rest of the dress. Off (`stage` false): both go.
   */
  private stageLook(h: Hornet, v: HornetView, stage: boolean, onView: boolean, now: number, view: Phaser.Geom.Rectangle) {
    const S = (v.stage ??= {});
    const spr = v.spr;
    const glow = stage && !!h.menacing && onView;
    if (glow && !S.glow) S.glow = this.glows.glow(this.scene, 'over', DANGER_TWISTED, h.x, h.y);
    if (S.glow) {
      S.glow.setVisible(glow && spr.visible);
      if (glow) {
        const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * Math.PI * 2 * STAGE.glow.hz + h.id);
        const size = Math.max(spr.displayWidth, spr.displayHeight) * 1.25 / 128;
        S.glow.setPosition(spr.x, spr.y - (v.ground ? spr.displayHeight * 0.4 : 0)).setScale(size).setAlpha(spr.alpha * STAGE.glow.alpha * (0.55 + 0.45 * pulse));
      }
    }
    if (stage && onView && !v.chain && spr.texture.key === 'atlas') this.rimCand.push({ v, d: Math.hypot(h.x - view.centerX, h.y - view.centerY) });
    else if (S.rim) S.rim.setVisible(false);
  }

  /** The edge light: a pale silhouette of the same frame a little larger behind the nearest `STAGE.rimCap` dark foes, so a charcoal body still reads at dusk. */
  private rims() {
    this.rimCand.sort((a, b) => a.d - b.d);
    this.rimCand.forEach(({ v }, i) => {
      const S = v.stage!, spr = v.spr;
      if (i >= STAGE.rimCap) return void S.rim?.setVisible(false);
      if (!S.rim) S.rim = this.scene.add.image(spr.x, spr.y, 'atlas', spr.frame.name).setTint(STAGE.rim).setTintMode(Phaser.TintModes.FILL);
      const r = S.rim;
      if (r.frame.name !== spr.frame.name) r.setFrame(spr.frame.name);
      r.setVisible(spr.visible).setOrigin(spr.originX, spr.originY).setFlipX(spr.flipX).setPosition(spr.x, spr.y).setRotation(spr.rotation)
        .setScale(spr.scaleX * STAGE.rimGrow, spr.scaleY * STAGE.rimGrow).setDepth(spr.depth - 0.4).setAlpha(spr.alpha * STAGE.rimAlpha);
    });
  }

  /**
   * What an enemy's tier and traits look like (P12): 1-3 cyan stripes over its head for its tier, an elite's crown in its
   * trait's colour (a dot beside it for a second trait), the Thorns and Mirror shell icons over those that carry them, and
   * an elite's name in its tooltip (hold Alt over it: `tips.ts`). A tier I stripe is faint; a kind with no tier abilities shows none.
   */
  private drawMarks(g: Phaser.GameObjects.Graphics) {
    const sim = this.sim;
    const view = this.scene.cameras.main.worldView;
    for (const h of sim.hornets) {
      if (h.dead || h.boss || h.x < view.x - 60 || h.x > view.right + 60 || h.y < view.y - 80 || h.y > view.bottom + 60) continue;
      const k = (h.small ? TIER.small : 1) * (h.elite ? HORNET.elite.scale : 1);
      const top = h.y - (h.spider ? 34 : FOES[h.kind].ground ? 38 : 50) * k;
      const tier = h.tier ?? 1;
      if (FOE_TIERS[h.kind]) for (let i = 0; i < tier; i++) g.fillStyle(0x58e8ff, tier > 1 ? 0.95 : 0.35).fillRect(h.x - tier * 2.5 + i * 5, top, 3, 6);
      const ts = h.traits ?? [];
      const cs = countersOf(h);
      const cy = top - 4;
      if (ts.length) {
        const c = ELITE_TRAITS[ts[0]].color;
        g.fillStyle(c, 1).beginPath().moveTo(h.x - 7, cy).lineTo(h.x - 7, cy - 7).lineTo(h.x - 3.5, cy - 3).lineTo(h.x, cy - 9).lineTo(h.x + 3.5, cy - 3).lineTo(h.x + 7, cy - 7).lineTo(h.x + 7, cy).closePath().fillPath();
        g.lineStyle(1, 0x1d1a17, 1).strokeRect(h.x - 7, cy - 1, 14, 1);
        if (ts[1]) g.fillStyle(ELITE_TRAITS[ts[1]].color, 1).fillCircle(h.x + 12, cy - 3, 3);
      }
      // The soft counters' icons (P22): left of an elite's crown, else centred over the head.
      cs.forEach((id, i) => drawCounter(g, id, ts.length ? h.x - 14 - i * 10 : h.x + (cs.length - 1) * 5 - i * 10, cy - 3));
      // Its beast mods (P31, D32): a small coloured plate each on its body, named in its tooltip (`tips.ts`).
      const ms = h.mods ?? [];
      ms.forEach((id, i) => g.fillStyle(0x1d1a17, 0.7).fillRect(h.x - 5 + i * 8 - 1, h.y - 7, 8, 6).fillStyle(BEAST_MODS[id].color, 1).fillRect(h.x - 5 + i * 8, h.y - 6, 6, 4));
    }
  }

  /** A downed hornet does not vanish: it falls, decays and leaves a smudge (the world keeps marks). */
  private hornetDown(id: number, v: HornetView) {
    this.hornets.delete(id);
    this.w.cull.remove(v.spr);
    v.aura?.destroy();
    v.stage?.glow?.destroy();
    v.stage?.rim?.destroy();
    v.eyes.forEach((e) => e.destroy());
    const spr = v.spr;
    spr.setTint(0x506070).setDepth(spr.y + 18);
    this.scene.tweens.add({ targets: spr, y: spr.y + 16, angle: spr.angle + 160, duration: 260, ease: 'Quad.easeIn' });
    this.w.remains.add(spr, { life: 10, smudge: { key: 'world-splat', tint: 0x202830, alpha: 0.45, scale: 0.25, kind: false } });
  }
}
