/**
 * What a blow, a shot, a death or a status looks and sounds like: bursts, flashes, hit-stop, floaters, the oil and scorch
 * the world keeps; and the statuses of the robots and enemies on screen, as pips under their feet (`statusview.ts`).
 * Add one: a `case` in `event` for the sim event (`SimEvent` in sim/sim.ts) and the beat it deserves (feedback scales with importance).
 */
import Phaser from 'phaser';
import { hitScale } from './attention';
import { FRIEND, LINE } from './house';
import { CRUDE_STAIN, VIOLET, ViewBase, kick, type G } from './playhost';
import { bossOf } from './sim/defs';
import { S } from './art';
import type { StatusId } from './sim/effects';
import { upper, type SimEvent } from './sim/sim';
import { pipColor, statusName } from './statusview';

export class CombatFx extends ViewBase {
  /** When a WEAK / RESISTS floater was last shown (ms). */
  private typeSaid = 0;
  /** The statuses an enemy has shown a word for already (so the colours are learned). */
  private statusSeen = new Set<string>();

  /** The statuses of the robots and enemies on screen, as pips under their feet. */
  update(dt: number, g: G) {
    const sim = this.sim, view = this.scene.cameras.main.worldView, ms = this.scene.time.now;
    for (const h of sim.hornets) {
      if (h.dead || h.x < view.x - 60 || h.x > view.right + 60 || h.y < view.y - 80 || h.y > view.bottom + 60) continue;
      this.statuses.pips(g, sim.engine, h, h.x, h.y + 8 + (h.boss ? h.r * 0.5 : 0), ms);
    }
    for (const b of sim.bots) {
      if (b.dead || !this.bots.get(b.id)?.spr.visible) continue;
      this.statuses.pips(g, sim.engine, b, b.x, b.y + 8, ms);
    }
    this.statuses.update(dt);
  }

  event(e: SimEvent) {
    const sim = this.sim;
    const fx = this.k.fx;
    const w = this.w;
    switch (e.e) {
      case 'shot': {
        this.sfx(e.by.role === 'controller' ? 'shot' : 'zap', e.s.x, e.s.y, { gain: e.by.role === 'controller' ? 0.7 : 0.4, vary: 0.12 });
        this.flash(e.s.x, e.s.y, 0xffc070, e.by.role === 'controller' ? 0.7 : 0.4);
        const v = this.bots.get(e.by.id);
        if (v) kick(v.sq, -0.12); // recoil: a squash that springs back into a stretch
        break;
      }
      case 'hit': {
        // A tick of burn is a small effect, a weapon's blow a full one (`hitScale`).
        const hs = hitScale(e.dmg);
        if (e.on === 'hornet') {
          fx.burst(e.x, e.y - 18, { color: e.mul ? (e.mul > 1 ? 0xffe040 : 0x8a929a) : 0x3df2ff, size: (e.mul && e.mul > 1 ? 0.9 : 0.6) * hs });
          // A weakness or a resistance, said now and then (not on every hit).
          if (e.mul && this.scene.time.now - this.typeSaid > 700) {
            this.typeSaid = this.scene.time.now;
            this.floater(e.x, e.y - 46, e.mul > 1 ? 'WEAK' : 'RESISTS', e.mul > 1 ? '#ffe040' : '#a0a8b0', 900, e.mul > 1 ? 16 : 13);
          }
          this.sfx('hit', e.x, e.y, { gain: 0.5 * hs, vary: 0.25 });
          const near = [...this.hornets.values()].find((h) => Math.hypot(h.spr.x - e.x, h.spr.y + 18 - e.y) < 4);
          if (near) kick(near.sq, -0.25);
        } else if (e.on === 'nest') {
          fx.burst(e.x, e.y, { color: FRIEND, size: 0.7 });
          this.sfx('hit', e.x, e.y, { gain: 0.5, vary: 0.3 });
        } else if (e.on === 'rock') {
          fx.burst(e.x, e.y, { color: 0xc89060, size: 0.5 });
          this.sfx('rock', e.x, e.y, { gain: 0.4 });
          w.marks.stamp('world-soft', e.x, e.y + 6, { tint: 0x2a1a10, alpha: 0.35, scale: 0.25, kind: false });
        } else {
          fx.burst(e.x, e.y - 16, { color: 0xffb640, size: 0.5 * hs });
          // A hurt robot leaks oil onto the sand; others who step in it carry it on.
          w.marks.stamp('world-splat', e.x + Phaser.Math.Between(-8, 8), e.y + 4, { tint: CRUDE_STAIN, alpha: 0.6, scale: 0.12 + Math.min(0.2, e.dmg / 60), kind: 'oil' });
          const hit = sim.bots.find((b) => !b.dead && b.x === e.x && b.y === e.y);
          const v = hit && this.bots.get(hit.id);
          if (v) {
            kick(v.sq, -0.2);
            v.flashT = 0.09;
          }
          if (hit?.role === 'controller') {
            this.k.juice.shake('small');
            this.sfx('hurt', undefined, undefined, { gain: 0.7 });
          }
        }
        break;
      }
      case 'die':
        if (e.on === 'hornet' && e.h?.boss) {
          // The queen falls: the biggest beat in the mission.
          for (let i = 0; i < 6; i++) this.scene.time.delayedCall(i * 140, () => {
            fx.burst(e.x + Phaser.Math.Between(-50, 50), e.y - 18 + Phaser.Math.Between(-30, 30), { color: i % 2 ? bossOf(e.h!.kind).color : 0xffffff, size: 1.6 });
            this.sfx('boom', e.x, e.y, { gain: 0.8 });
          });
          this.flash(e.x, e.y - 18, 0xff2060, 2.4);
          this.k.juice.hit('big');
          this.hud.banner('The Hornet Queen falls', 3400);
          w.marks.stamp('world-soft', e.x, e.y, { tint: 0x1a0c18, alpha: 0.6, scale: 2.4, kind: false });
        } else if (e.on === 'hornet') {
          fx.burst(e.x, e.y - 18, { color: e.h?.twisted ? VIOLET : 0x3df2ff });
          fx.burst(e.x, e.y - 18, { color: 0xffffff, size: 0.5 });
          this.sfx('pop', e.x, e.y, { gain: 0.6, vary: 0.2 });
        } else {
          fx.burst(e.x, e.y - 20, { color: 0xff8030, size: 1.6 });
          fx.burst(e.x, e.y - 20, { color: 0x403830, size: 1.4 });
          this.flash(e.x, e.y - 20, 0xff8030, 1.4);
          this.sfx('boom', e.x, e.y);
          this.k.juice.hit(e.on === 'nest' ? 'medium' : 'small');
          w.marks.stamp('world-soft', e.x, e.y, { tint: 0x1a120c, alpha: 0.55, scale: e.on === 'nest' ? 1.6 : 0.8, kind: false });
          if (e.on === 'nest') this.hud.banner(`${upper(sim.biome.talk.hive)} destroyed`);
          if (e.bot) {
            const v = this.bots.get(e.bot.id);
            if (v) {
              w.cull.remove(v.spr);
              v.spr.destroy();
              v.badge.destroy();
              v.bark?.destroy();
              v.kit?.head.destroy();
              v.kit?.back.destroy();
              this.k.lights.remove(v.light);
              this.bots.delete(e.bot.id);
            }
            w.marks.stamp('world-splat', e.x, e.y + 4, { tint: CRUDE_STAIN, alpha: 0.75, scale: 0.5, kind: 'oil' });
            w.cull.add(this.scene.add.image(e.x, e.y, 'wreck').setScale(1 / S).setDepth(e.y - 4));
          }
        }
        break;
      case 'ghosted':
        if (this.scene.time.now - this.typeSaid > 900) {
          this.typeSaid = this.scene.time.now;
          this.floater(e.x, e.y - 46, 'NO EFFECT', '#c0a0ff', 900, 14);
          fx.burst(e.x, e.y - 18, { color: 0xc0a0ff, size: 0.5 });
        }
        break;
      case 'heal':
        this.sfx('heal', e.to.x, e.to.y, { gain: 0.35, vary: 0.15 });
        fx.burst(e.to.x, e.to.y - 18, { color: 0x9fe0ff, size: 0.4 });
        break;
      case 'status': {
        // A speck in the status's colour; a word when a robot is afflicted, and the first time an enemy is (so the colours are learned).
        fx.burst(e.x, e.y - 16, { color: pipColor(e.id as StatusId), size: 0.3 });
        if (e.on === 'bot' || !this.statusSeen.has(e.id)) {
          this.statusSeen.add(e.id);
          this.statuses.pop(e.x, e.y - 40, statusName(e.id as StatusId), '#' + pipColor(e.id as StatusId).toString(16).padStart(6, '0'));
        }
        break;
      }
      case 'parry':
        this.flash(e.x, e.y - 16, 0xffffff, 1.4);
        fx.burst(e.x, e.y - 16, { color: 0xffffff, size: 0.6 });
        this.sfx('rock', e.x, e.y, { gain: 0.5, vary: 0.2 });
        this.statuses.pop(e.x, e.y - 44, 'Parry', '#ffffff', 0.8, 14);
        break;
      case 'shatter':
        for (let i = 0; i < 3; i++) fx.burst(e.x + Phaser.Math.Between(-10, 10), e.y - 18 + Phaser.Math.Between(-8, 8), { color: 0xe8fbff, size: 0.7 });
        this.flash(e.x, e.y - 16, 0x9fe0ff, 1.6);
        this.sfx('rock', e.x, e.y, { gain: 0.7, vary: 0.2 });
        this.k.juice.shake('small');
        this.statuses.pop(e.x, e.y - 46, 'Shatter!', '#e8fbff', 0.9, 15);
        break;
      case 'crit':
        this.floater(e.x, e.y - 30, `${Math.round(e.dmg)}!`, '#ffd760', 700, 18);
        this.flash(e.x, e.y, 0xffd760, 1.2);
        break;
      case 'zap': {
        // An arc of blue lightning from one foe to the next, gone in a blink.
        const g = this.scene.add.graphics().setDepth(71000).setBlendMode(Phaser.BlendModes.ADD);
        g.lineStyle(LINE.accent, 0x3df2ff, 1).beginPath().moveTo(e.x, e.y - 18);
        for (let i = 1; i < 6; i++) g.lineTo(e.x + ((e.tx - e.x) * i) / 6 + Phaser.Math.Between(-7, 7), e.y - 18 + ((e.ty - e.y) * i) / 6 + Phaser.Math.Between(-7, 7));
        g.lineTo(e.tx, e.ty - 18).strokePath();
        this.scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
        this.flash(e.tx, e.ty, 0x3df2ff, 0.9);
        this.sfx('zap', e.tx, e.ty, { gain: 0.5, vary: 0.2 });
        break;
      }
      default:
        break;
    }
  }
}
