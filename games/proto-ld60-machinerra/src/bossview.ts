/**
 * A boss's moments: its arrival, wind-ups, attacks, forms and fall, each with its own beat; and the wind-up shapes it
 * draws on the ground. A boss is a foe (`foeview.ts` draws its painting).
 * Add a move: a `case` in `onBoss` for its `boss` event `what` (the sim names them: `sim/sim.ts`).
 */
import { css, DANGER, DANGER_TEXT } from './house';
import { VIOLET, ViewBase } from './playhost';
import { bossNow, bossOf } from './sim/defs';
import type { SimEvent } from './sim/sim';

export class BossView extends ViewBase {
  event(e: SimEvent) {
    if (e.e === 'boss') this.onBoss(e);
    else if (e.e === 'break' && e.h.boss && e.what !== 'form') this.onBreak(e);
  }

  /** A boss breaks (P22): the loudest read of a damage state: its name and what it lost across the screen, a hit-stop, the sparks of the part that fell. (`hudfx.ts` floats the name over it.) */
  private onBreak(e: Extract<SimEvent, { e: 'break' }>) {
    const { h } = e;
    const x = h.x, y = h.y - 18;
    this.hud.banner(`${bossOf(h.kind).name}: ${e.name}`, 2800);
    this.k.juice.hit('big');
    this.k.juice.shake('medium');
    this.sfx('boom', x, h.y, { gain: 0.6, vary: 0.1 });
    this.k.fx.burst(x, y, { color: 0xffd98a, size: 1.6 });
    this.k.fx.burst(x, y, { color: bossOf(h.kind).color, size: 1.2 });
    this.flash(x, y, 0xffd98a, 2);
  }

  /** The queen: her arrival is the loudest thing so far; each wind-up and attack has its own beat. */
  private onBoss(e: Extract<SimEvent, { e: 'boss' }>) {
    const { h } = e;
    const fx = this.k.fx;
    const x = h.x, y = h.y - 18;
    switch (e.what) {
      case 'arrive':
        this.hud.banner(bossOf(h.kind).name, 3800);
        this.hud.wash(css(DANGER));
        this.sfx('queen');
        this.k.juice.hit('big');
        this.k.juice.shake('big');
        this.flash(x, y, bossOf(h.kind).color, 2.4);
        fx.burst(x, y, { color: bossOf(h.kind).color, size: 2 });
        fx.burst(x, y, { color: 0xffffff, size: 1 });
        break;
      case 'tell':
        this.sfx('warn', x, h.y, { gain: 0.3 });
        break;
      case 'volley':
        this.sfx('shot', x, h.y, { gain: 1, vary: 0.05 });
        this.k.juice.shake('small');
        this.flash(x, y, bossOf(h.kind).color, 1.6);
        break;
      case 'charge':
        this.sfx('swish', x, h.y, { gain: 1, vary: 0.05 });
        this.k.juice.shake('small');
        break;
      case 'summon':
        for (let i = 0; i < 6; i++) fx.burst(x + Math.cos(i) * 40, y + Math.sin(i) * 26, { color: VIOLET, size: 0.9 });
        this.sfx('twist', x, h.y, { gain: 1, vary: 0.05 });
        this.flash(x, y, VIOLET, 2);
        break;
      case 'quake':
        this.sfx('swish', x, h.y, { gain: 1, vary: 0.1 });
        this.k.juice.shake('medium');
        fx.burst(x, h.y, { color: bossOf(h.kind).color, size: 1.4 });
        break;
      case 'leap':
        this.sfx('swish', x, h.y, { gain: 0.8, vary: 0.2 });
        fx.burst(x, h.y, { color: 0xffffff, size: 1.2 });
        break;
      case 'slam':
        this.sfx('queen', x, h.y, { gain: 0.6, vary: 0.2 });
        this.k.juice.hit('big');
        this.k.juice.shake('big');
        this.flash(x, h.y, bossOf(h.kind).color, 2);
        fx.burst(x, h.y, { color: 0xffffff, size: 2 });
        fx.burst(x, h.y, { color: bossOf(h.kind).color, size: 1.6 });
        break;
      case 'stuck':
        this.floater(x, y - 60, 'STUCK: kick it!', '#ffe080', 1600, 20);
        this.sfx('click', x, h.y, { gain: 0.8 });
        break;
      case 'shift':
        this.floater(x, y - 70, h.kind === 'knight' ? 'UNHORSED' : 'CHANGING', '#ffffff', 2000, 24);
        this.sfx('twist', x, h.y, { gain: 1 });
        this.k.juice.shake('medium');
        break;
      case 'cancel':
        this.floater(x, y - 70, 'STOPPED', '#ffe080', 1800, 24);
        this.k.juice.hit('big');
        break;
      case 'phase2':
        this.hud.banner(bossNow(h.kind, 2).name, 3200);
        this.hud.wash('#ffffff');
        this.sfx('queen');
        this.k.juice.shake('big');
        fx.burst(x, y, { color: bossOf(h.kind).color, size: 2 });
        break;
      case 'crash':
        this.floater(x, y - 70, 'CRASH! STUCK', '#ffe080', 1800, 22);
        this.sfx('rock', x, h.y, { gain: 1 });
        this.k.juice.hit('big');
        this.k.juice.shake('medium');
        fx.burst(x, h.y, { color: 0xc89060, size: 1.4 });
        break;
      case 'veil':
        this.floater(x, y - 70, 'VEILED', '#c0a0ff', 1400, 20);
        this.sfx('twist', x, h.y, { gain: 0.6 });
        break;
      case 'unveil':
        this.floater(x, y - 70, 'SOLID: HIT HIM', '#ffe080', 1400, 20);
        break;
      case 'phase1':
        this.floater(x, y - 70, 'LANDED', '#ffffff', 1600, 22);
        this.k.juice.shake('medium');
        break;
      case 'leave':
        this.hud.banner(`${bossOf(h.kind).name} is hunting`, 3000);
        this.hud.wash(css(DANGER));
        break;
      case 'block':
        this.floater(x, y - 50, 'BLOCKED', '#c0c8d0', 900, 14);
        this.sfx('click', x, h.y, { gain: 0.5, vary: 0.2 });
        break;
      case 'rage':
        this.floater(x, y - 70, 'ENRAGED', DANGER_TEXT, 2200, 26);
        this.sfx('queen', undefined, undefined, { gain: 0.7 });
        this.k.juice.shake('medium');
        this.hud.wash(css(DANGER));
        break;
    }
  }
}
