/**
 * D-city air support, as it comes: the call's horn, the Wanderer's shadow over the target, the marked ground, each shell's
 * streak and blast, and a Brass Guard's drop. The rules are `sim/support.ts`; the calls are `SUPPORT` in defs.ts.
 * Add a call's look: in `drawStrike` (by its `kind`); a new beat: a `case` in `event`.
 */
import { css, FRIEND, FRIEND_HI, FRIEND_SOFT, LINE, SOOT } from './house';
import { ViewBase, ring, type G, type Img, type PlayHost } from './playhost';
import { SUPPORT, type SupportId } from './sim/defs';
import type { SimEvent } from './sim/sim';
import { shadowPose } from './sim/support';

export class SupportView extends ViewBase {
  /** The Zeppelin Wanderer's shadow, drawn over the ground and everything on it while a call is on its way. */
  private zep: Img;

  constructor(host: PlayHost) {
    super(host);
    this.zep = host.scene.add.image(0, 0, 'zep').setDepth(89000).setVisible(false);
    host.k.lights.unlit(this.zep);
  }

  update(_dt: number, g: G) {
    this.drawStrike(g);
  }

  event(e: SimEvent) {
    const fx = this.k.fx;
    const w = this.w;
    switch (e.e) {
      case 'support':
        this.onSupport(e);
        break;
      case 'shell': {
        const x = e.x, y = e.y;
        if (e.kind === 'drop') {
          // A Brass Guard lands on its rope: dust, a clank.
          fx.burst(x, y, { color: 0xc8a070, size: 1.2 });
          this.sfx('thump', x, y, { gain: 0.7 });
          this.k.juice.shake('small');
          break;
        }
        if (e.kind === 'lance') {
          fx.burst(x, y - 8, { color: 0x9fe8ff, size: 1.4 });
          fx.burst(x, y - 8, { color: 0xffffff, size: 0.8 });
          this.flash(x, y - 10, 0x9fe8ff, 1.6);
          if (e.i % 3 === 0) this.sfx('hiss', x, y, { gain: 0.9, vary: 0.2 });
          if (e.i === 0) this.k.juice.shake('medium');
          w.marks.stamp('world-soft', x, y + 4, { tint: 0x2a3a40, alpha: 0.4, scale: 0.7, kind: false });
          break;
        }
        fx.burst(x, y - 8, { color: 0xffc070, size: 1.8 });
        fx.burst(x, y - 8, { color: 0xffffff, size: 1 });
        fx.burst(x, y, { color: 0x403830, size: 1.5 });
        this.flash(x, y - 10, 0xffd090, 2.4);
        this.sfx('shell', x, y, { gain: 1, vary: 0.1 });
        this.sfx('thump', x, y, { gain: 1 });
        this.k.juice.shake(e.i === 0 ? 'big' : 'small');
        w.marks.stamp('world-soft', x, y + 4, { tint: 0x1a120c, alpha: 0.6, scale: 1.3, kind: false });
        w.marks.stamp('world-splat', x, y + 4, { tint: 0x0c0a08, alpha: 0.5, scale: 0.5, kind: false });
        break;
      }
      default:
        break;
    }
  }

  /**
   * D-city air support, as it comes: the Wanderer's shadow slides over the target while the ground is marked (the disc
   * the shells will cover, a tick where each will land), it hangs there and the marks burn hot, then each shell shows a
   * falling streak and a closing ring just before its blast. The shadow darkens everything under it.
   */
  private drawStrike(g: Phaser.GameObjects.Graphics) {
    const st = this.sim.strike;
    if (!st) return void this.zep.setVisible(false);
    const d = SUPPORT[st.id];
    const now = this.scene.time.now;
    const p = shadowPose(d, st);
    this.zep.setVisible(true).setPosition(p.x, p.y).setRotation(p.heading).setDisplaySize(d.shadow.len, (d.shadow.len * 104) / 320).setAlpha(0.5 * p.a);
    const hot = st.phase === 'hold' ? 1 : st.phase === 'tell' ? Math.min(1, st.t / d.tell) * 0.6 : 0.7;
    const pulse = 0.5 + 0.5 * Math.sin(now / (st.phase === 'hold' ? 70 : 170));
    // Ours, not a threat: the D-city's marks are cyan (`FRIEND`), never red. A soot underlay keeps the pale line readable on snow and sand.
    const col = st.phase === 'tell' ? FRIEND_SOFT : FRIEND;
    if (st.phase !== 'leave' && d.kind === 'lance') {
      // A lance marks its line: a band from the first shell to the last.
      const a = st.shells[0], b = st.shells[st.shells.length - 1];
      g.lineStyle(d.blast * 1.4, FRIEND_SOFT, (0.06 + 0.14 * hot) * (0.6 + 0.4 * pulse)).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(LINE.accent, SOOT, 0.25 + 0.2 * hot).lineBetween(a.x, a.y, b.x, b.y);
      g.lineStyle(LINE.effect, FRIEND_HI, 0.3 + 0.5 * hot).lineBetween(a.x, a.y, b.x, b.y);
    } else if (st.phase !== 'leave') {
      g.fillStyle(col, (0.06 + 0.12 * hot) * (0.6 + 0.4 * pulse)).fillEllipse(st.x, st.y, d.radius * 2, d.radius * 1.6);
      g.lineStyle(LINE.accent, SOOT, 0.2 + 0.25 * hot).strokeEllipse(st.x, st.y, d.radius * 2, d.radius * 1.6);
      ring(g, st.x, st.y, d.radius, col, 0.4 + 0.5 * hot, now, 0.8);
      if (st.phase !== 'tell') ring(g, st.x, st.y, d.radius * (0.92 - 0.05 * pulse), FRIEND_HI, 0.5 * hot, -now * 1.3, 0.8);
    }
    for (const sh of st.shells) {
      if (sh.done) continue;
      const left = sh.at - st.t;
      if (left > 0.5) {
        g.fillStyle(col, 0.3 + 0.3 * hot).fillCircle(sh.x, sh.y, 3);
        continue;
      }
      const k = Math.max(0, left / 0.5);
      g.lineStyle(LINE.accent, SOOT, 0.35 * (1 - 0.5 * k)).strokeCircle(sh.x, sh.y, d.blast * (0.75 + 0.6 * k));
      g.lineStyle(LINE.effect, FRIEND_HI, 0.9 - 0.5 * k).strokeCircle(sh.x, sh.y, d.blast * (0.75 + 0.6 * k));
      g.fillStyle(FRIEND, 0.14 + 0.2 * (1 - k)).fillCircle(sh.x, sh.y, d.blast * 0.75);
      const top = sh.y - 520 * k;
      g.lineStyle(5, 0xffd890, 0.3).lineBetween(sh.x, top - 90, sh.x, top);
      g.lineStyle(LINE.effect, 0xffffff, 0.95).lineBetween(sh.x, top - 90, sh.x, top);
    }
  }

  /** A D-city call: the horn on the call, a whistle when the shadow settles, the barrage as the loudest, shakiest thing a player can do. */
  private onSupport(e: Extract<SimEvent, { e: 'support' }>) {
    const d = SUPPORT[e.strike.id];
    switch (e.what) {
      case 'call':
        this.sfx('horn');
        this.hud.banner(d.name, 2600);
        this.k.juice.shake('small');
        break;
      case 'hold':
        this.sfx('whistle');
        this.k.juice.shake('small');
        break;
      case 'fall':
        this.hud.wash(css(FRIEND_SOFT));
        break;
      default:
        break;
    }
  }

  /** Call the Zeppelin Wanderer onto the ground at (x, y); a refusal says why. */
  call(id: SupportId, x: number, y: number) {
    const why = this.sim.callSupport(id, x, y);
    if (why) {
      const c = this.sim.controller;
      this.sfx('click', undefined, undefined, { gain: 0.8 });
      this.floater(c.x, c.y - 64, `No air support: ${why}`, '#ffd98a', 1800);
    }
    return why;
  }
}
