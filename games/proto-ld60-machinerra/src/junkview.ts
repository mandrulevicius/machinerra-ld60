/**
 * The relics at work on screen (P19; the rules are `sim/junkplay.ts`): a toaster's slugs arcing over the sand, the
 * microwave's cone drawn as it hums and burning when it fires, the hair dryer's gust, a ring round the loot a smartphone has
 * marked, the way-finder's wrong turn, the biome relics' (D50: the sprinkler's ring, the zapper's crackle, the selfie stick's jab
 * and flash, the traffic light's three lamps, the beacon's rings and edge arrows), and the find itself when a ruin gives junk. A view of the mission (`playhost.ts`):
 * `event` for the `relic` and `junk` events, `update` each frame with the world's graphics.
 */
import Phaser from 'phaser';
import { LINE } from './house';
import { ViewBase } from './playhost';
import { RELICS } from './sim/junk';
import { RELIC_FX, lightAt } from './sim/junkplay';
import type { SimEvent } from './sim/sim';

/** A wedge from (x, y) toward `a`, `w` wide, `r` long. */
function wedge(g: Phaser.GameObjects.Graphics, x: number, y: number, a: number, w: number, r: number) {
  g.beginPath().moveTo(x, y);
  for (let i = 0; i <= 12; i++) g.lineTo(x + Math.cos(a - w / 2 + (w * i) / 12) * r, y + Math.sin(a - w / 2 + (w * i) / 12) * r);
  g.closePath();
}

export class JunkView extends ViewBase {
  /** Level 1's find: a card with the old thing's name that flips to its reading (the colony's misread), then fades. */
  private card(item: string, reading: string, x: number, y: number) {
    const el = document.createElement('div');
    el.className = 'mc-junkcard';
    el.innerHTML = `<div class="mc-junkcard__in"><div class="mc-junkcard__face">${item}</div><div class="mc-junkcard__face mc-junkcard__face--back">${reading}</div></div>`;
    this.host.ui.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-on'));
    window.setTimeout(() => el.classList.add('is-flipped'), 1100);
    window.setTimeout(() => el.classList.remove('is-on'), 4200);
    window.setTimeout(() => el.remove(), 4700);
    this.k.fx.burst(x, y - 30, { color: 0xf0cf7a, size: 0.9 });
    this.sfx('pickup', x, y, { gain: 0.5 });
  }

  event(e: SimEvent) {
    if (e.e !== 'relic' && e.e !== 'junk') return;
    const { scene } = this;
    if (e.e === 'relic') {
      const r = RELICS[e.id];
      if (this.sim.land?.guided && e.kept) return void this.card(r.item, r.reading, e.x, e.y);
      this.floater(e.x, e.y - 90, e.kept ? `${r.reading}! (a ${r.item.toLowerCase()})` : `${r.reading}, but the carry strip is full`, e.kept ? '#ffe6a8' : '#ffd98a', 4200, 16);
      if (e.kept) {
        this.k.fx.burst(e.x, e.y - 30, { color: 0xf0cf7a, size: 0.9 });
        this.sfx('pickup', e.x, e.y, { gain: 0.5 });
      }
      return;
    }
    switch (e.what) {
      case 'toss':
        this.sfx('swish', e.x, e.y, { gain: 0.5, vary: 0.2 });
        break;
      case 'splat':
        this.k.fx.burst(e.x, e.y - 6, { color: 0xffb640, size: 0.6 });
        this.flash(e.x, e.y - 6, 0xffb640, 0.9);
        this.sfx('rock', e.x, e.y, { gain: 0.3, vary: 0.3 });
        break;
      case 'hum':
        this.sfx('warn', e.x, e.y, { gain: 0.25 });
        break;
      case 'cone':
      case 'gust': {
        const fire = e.what === 'cone';
        const g = scene.add.graphics().setDepth(71000).setBlendMode(Phaser.BlendModes.ADD);
        wedge(g, e.x, e.y - 14, e.a!, e.w!, e.r!);
        g.fillStyle(fire ? 0xffb640 : 0xcfeeff, fire ? 0.55 : 0.4).fillPath();
        scene.tweens.add({ targets: g, alpha: 0, duration: fire ? 320 : 400, onComplete: () => g.destroy() });
        this.flash(e.x + Math.cos(e.a!) * 60, e.y + Math.sin(e.a!) * 60, fire ? 0xffb640 : 0xcfeeff, 1.4);
        this.sfx(fire ? 'zap' : 'swish', e.x, e.y, { gain: fire ? 0.4 : 0.6, vary: 0.2 });
        break;
      }
      case 'scenic':
        if (e.by) this.floater(e.by.x, e.by.y - 50, 'Recalculating... scenic route!', '#cfe9ff', 2200, 13);
        break;
      case 'swat': {
        // The zapper's crackle, the selfie stick's long jab: a short bright line from the bot to the foe.
        const zap = e.by?.relic === 'zapper';
        const g = scene.add.graphics().setDepth(71000).setBlendMode(Phaser.BlendModes.ADD);
        g.lineStyle(zap ? 3 : 4, zap ? 0xffe15a : 0xeaf6ff, 1);
        if (zap) {
          const mx = (e.x + e.tx!) / 2 + (Math.random() - 0.5) * 14, my = (e.y + e.ty!) / 2 - 14 + (Math.random() - 0.5) * 14;
          g.beginPath().moveTo(e.x, e.y - 14).lineTo(mx, my).lineTo(e.tx!, e.ty! - 10).strokePath();
        } else g.beginPath().moveTo(e.x, e.y - 14).lineTo(e.tx!, e.ty! - 10).strokePath();
        scene.tweens.add({ targets: g, alpha: 0, duration: 160, onComplete: () => g.destroy() });
        this.flash(e.tx!, e.ty! - 10, zap ? 0xffe15a : 0xeaf6ff, 0.9);
        this.sfx(zap ? 'zap' : 'swish', e.x, e.y, { gain: 0.3, vary: 0.2 });
        break;
      }
      case 'pose':
        this.flash(e.x, e.y - 30, 0xffffff, 0.5);
        this.sfx('warn', e.x, e.y, { gain: 0.2 });
        break;
      case 'flash': {
        const g = scene.add.graphics().setDepth(71000).setBlendMode(Phaser.BlendModes.ADD);
        g.fillStyle(0xffffff, 0.55).fillCircle(e.x, e.y - 14, e.r!);
        scene.tweens.add({ targets: g, alpha: 0, duration: 300, onComplete: () => g.destroy() });
        this.flash(e.x, e.y - 14, 0xffffff, 2.2);
        this.sfx('zap', e.x, e.y, { gain: 0.35, vary: 0.1 });
        break;
      }
      case 'sprinkle': {
        const g = scene.add.graphics().setDepth(71000).setBlendMode(Phaser.BlendModes.ADD);
        g.lineStyle(LINE.effect, 0x6fc8ee, 0.9).strokeCircle(e.x, e.y, e.r!);
        g.fillStyle(0x6fc8ee, 0.12).fillCircle(e.x, e.y, e.r!);
        scene.tweens.add({ targets: g, alpha: 0, duration: 600, onComplete: () => g.destroy() });
        this.k.fx.burst(e.x, e.y - 16, { color: 0x6fc8ee, size: 0.6 });
        this.sfx('swish', e.x, e.y, { gain: 0.3, vary: 0.3 });
        break;
      }
    }
  }

  /** Slugs in the air, a humming cone's warning, and the rings round marked loot. */
  update(_dt: number, g: Phaser.GameObjects.Graphics) {
    const time = this.scene.time.now;
    const J = this.sim.junkw;
    for (const s of J.slugs) {
      const p = Math.min(1, s.t / RELIC_FX.toaster.flight);
      const x = s.sx + (s.tx - s.sx) * p, y = s.sy + (s.ty - s.sy) * p, up = Math.sin(Math.PI * p) * 64;
      g.fillStyle(0x1d1a17, 0.3).fillEllipse(x, y + 12, 8, 4);
      g.fillStyle(0xf0c878, 1).fillCircle(x, y - up, 4);
      g.lineStyle(LINE.detail, 0x1d1a17, 1).strokeCircle(x, y - up, 4);
      g.fillStyle(0xffb640, 0.8).fillCircle(x - (s.tx - s.sx) * 0.02, y - up + 2, 2);
    }
    for (const b of this.sim.bots) {
      const w = b.relic === 'microwave' ? J.wearers.get(b) : undefined;
      if (w && w.humT > 0) {
        const k = 1 - w.humT / RELIC_FX.microwave.hum;
        wedge(g, b.x, b.y - 14, w.humA, RELIC_FX.microwave.cone, RELIC_FX.microwave.reach);
        g.fillStyle(0xffb640, 0.08 + 0.22 * k * (0.6 + 0.4 * Math.sin(time / 40))).fillPath();
        g.lineStyle(LINE.effect, 0xffb060, 0.5 + 0.5 * k).strokePath();
      }
    }
    const LIGHT = [0xff3048, 0xffb640, 0x58d27a];
    for (const b of this.sim.bots) {
      if (b.relic !== 'trafficlight' || b.dead || b.downed) continue;
      // Three lamps over its head, the one that is on bright; round it the reach of what the colour does.
      const on = lightAt(this.sim.time);
      for (let i = 0; i < 3; i++) g.fillStyle(LIGHT[i], i === on ? 1 : 0.18).fillCircle(b.x, b.y - 66 + i * 7, 3);
      if (on !== 1) g.lineStyle(LINE.effect, LIGHT[on], 0.35).strokeCircle(b.x, b.y, RELIC_FX.trafficlight.r);
    }
    // The beacons' finds: a pulsing ring on each downed robot, and at the screen's edge an arrow toward one that is off screen.
    const cam = this.scene.cameras.main, view = cam.worldView;
    const inset = 36 / cam.zoom;
    for (const d of J.found) {
      const pulse = 1 + 0.2 * Math.sin(time / 140);
      g.lineStyle(LINE.effect, 0xffb640, 0.9).strokeCircle(d.x, d.y - 6, 20 * pulse);
      if (view.contains(d.x, d.y)) continue;
      const cx = view.centerX, cy = view.centerY, a = Math.atan2(d.y - cy, d.x - cx);
      const hx = view.width / 2 - inset, hy = view.height / 2 - inset;
      const k = Math.min(hx / Math.max(Math.abs(Math.cos(a)), 1e-6), hy / Math.max(Math.abs(Math.sin(a)), 1e-6));
      const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k, s = 11 / cam.zoom;
      g.fillStyle(0xffb640, 0.9).fillTriangle(ax + Math.cos(a) * s, ay + Math.sin(a) * s, ax + Math.cos(a + 2.5) * s, ay + Math.sin(a + 2.5) * s, ax + Math.cos(a - 2.5) * s, ay + Math.sin(a - 2.5) * s);
    }
    for (const l of this.sim.loot) {
      if (l.dead || !J.marks.includes(l.id)) continue;
      const pulse = 1 + 0.15 * Math.sin(time / 180 + l.id);
      g.lineStyle(LINE.effect, 0x3df2ff, 0.8).strokeCircle(l.x, l.y - 6, 13 * pulse);
    }
  }
}
