/**
 * What the player is told: the clock's beats (a quiet banner for the day, a sound for dusk, bells for midnight), a hive
 * waking, the Steam bar's refusal, the Oracle's voice (which lights the antenna), and the attention cues (P33): the one
 * warning as oil falls, and the pale ring that finds the Communicator in a crowded fight.
 * Add one: a `case` in `event`, or a cue in `update`.
 */
import Phaser from 'phaser';
import { ALARM } from './attention';
import { promptHtml } from '../../../harness/kit';
import { iconCopy } from './iconkey';
import { css, DANGER, LINE } from './house';
import { ViewBase, type PlayHost } from './playhost';
import { CLOCK, type SimEvent } from './sim/sim';
import { BERSERK } from './sim/defs';
import { menaceNote } from './tips';
import type { DayPhase } from './sim/clock';
import type { Size } from '../../../harness/kit/juice';

/**
 * How loudly each phase change announces itself, in one table: the danger sets the size (design.md: feedback scaled to importance).
 * Morning to day is a murmur; dusk is strong; midnight is the strongest beat the game has. All of it a first guess (Minos asked for "more prominent" with the danger).
 * - `banner` text, `ms` its hold, `tone` its look (`style.css` `.mc-banner[data-tone]`: size, colour, entrance).
 * - `wash` colour, `ms` its length, `a` its peak, `throb` beats it; `shake` camera shakes as `[delay ms, size]`; `flash` and `punch` camera, a size.
 * - `sounds` as `[key, gain, delay ms]`; `bells` a row of tolls (`bell`, `gap` ms apart, gain rising from `gain` by `rise` a toll); `dial` strikes the clock.
 */
interface Beat {
  banner: string;
  /** The line under it, smaller: what the phase means for the player, drawn from what it does (`dayplay.ts`, `foes.ts`, `tiers.ts`). A guess in wording. */
  sub: string;
  ms: number;
  tone: string;
  wash?: { color: string; ms: number; a: number; throb?: boolean };
  shake?: [number, Size][];
  flash?: Size;
  punch?: Size;
  sounds: [string, number, number][];
  bells?: { n: number; gap: number; gain: number; rise: number };
  dial?: 'dusk' | 'midnight';
}
export const BEAT: Partial<Record<DayPhase, Beat>> = {
  day: { banner: 'Day', sub: 'The hives wake and elites begin to appear', ms: 2400, tone: 'day', sounds: [['blip', 0.5, 0]] },
  evening: {
    banner: 'Dusk',
    sub: 'More hives wake and the machines turn twisted',
    ms: 5200,
    tone: 'dusk',
    wash: { color: '#7a40ff', ms: 3400, a: 1 },
    shake: [[0, 'medium']],
    sounds: [['dusk', 1, 0], ['bell', 0.55, 500]],
    dial: 'dusk',
  },
  midnight: {
    banner: 'Midnight',
    sub: `Every ${BERSERK.every} seconds they come stronger, for good`,
    ms: 7500,
    tone: 'midnight',
    wash: { color: css(DANGER), ms: 5600, a: 1, throb: true },
    shake: [[0, 'big'], [900, 'medium'], [1800, 'medium'], [2700, 'small'], [3600, 'small']],
    flash: 'big',
    punch: 'big',
    sounds: [['knell', 1, 0], ['warn', 0.5, 300]],
    bells: { n: 12, gap: 650, gain: 0.5, rise: 0.03 },
    dial: 'midnight',
  },
};

export class HudFx extends ViewBase {
  private ring: Phaser.GameObjects.Graphics;
  /** How much of the ring shows (it eases in with the fight). */
  private ringA = 0;
  private oilCued = false;

  constructor(host: PlayHost) {
    super(host);
    this.ring = host.scene.add.graphics();
    // The antenna lights and a blip sounds when her line shows, not when the Sim queues it.
    // A line's picture: `key:<action>` is that key's cap, anything else a texture or atlas frame drawn small.
    host.hud.iconOf = (icon) => {
      if (icon.startsWith('key:')) {
        const el = document.createElement('span');
        el.innerHTML = promptHtml(`{${icon.slice(4)}}`);
        return el;
      }
      return iconCopy(host.scene, icon, 48);
    };
    host.hud.onSpeak = (tone) => {
      this.comm.pingT = 1.6;
      this.sfx(tone === 'urgent' ? 'warn' : 'blip', undefined, undefined, { gain: 0.6, vary: 0 });
    };
  }

  update(dt: number) {
    this.oilCue();
    // In a fight a pale ring on the ground finds the Communicator among the crowd (the lift is the brightest thing on screen).
    const c = this.sim.controller;
    this.ringA += ((this.host.fight && !c.dead ? 1 : 0) - this.ringA) * Math.min(1, dt * 3);
    this.ring.clear();
    if (this.ringA > 0.02) {
      this.ring.setDepth(c.y - 30).fillStyle(0xfff0c0, 0.1 * this.ringA).fillEllipse(c.x, c.y + 2, 52, 28).lineStyle(LINE.effect, 0xfff0c0, 0.6 * this.ringA).strokeEllipse(c.x, c.y + 2, 52, 28);
    }
  }

  /** The Oil bar's alarm has its sound too: one warning as oil falls under `ALARM.urgent`, again only after it has been above half. */
  private oilCue() {
    const c = this.sim.controller;
    const f = c.hp / c.maxHp;
    if (f < ALARM.urgent && !this.oilCued && !this.sim.god && !c.dead) {
      this.oilCued = true;
      this.sfx('warn', undefined, undefined, { gain: 0.9 });
    } else if (f > 0.5) this.oilCued = false;
  }

  event(e: SimEvent) {
    switch (e.e) {
      case 'day':
        this.onDay(e.phase);
        break;
      case 'wake':
        if (e.n.place) break; // a place wakes its own hives, with its own beat
        this.sfx('warn', undefined, undefined, { gain: 0.35 });
        // The clock's own wakings come with the day's banner; any other wake is named by `signview.ts` (who, and where the hive is).
        if (e.by !== CLOCK) this.k.juice.shake('small');
        break;
      case 'berserk':
        this.onBerserk(e.step, e.level);
        break;
      case 'noSteam':
        this.sfx('click', undefined, undefined, { gain: 0.8 });
        this.hud.noSteam();
        break;
      case 'hunt':
        // A hunter pack (menace level 5): a banner and a warning sound as it is announced, a sting as it comes.
        if (e.what === 'warn') {
          this.hud.banner('A hunter pack is coming', 3000);
          this.sfx('warn', undefined, undefined, { gain: 0.7 });
        } else {
          this.sfx('dusk', undefined, undefined, { gain: 0.5 });
          this.k.juice.shake('small');
        }
        break;
      case 'break':
        // An elite or boss breaks: what it lost, over it (P7 draws the body; this is the read).
        this.floater(e.h.x, e.h.y - 40, e.name, '#ffd98a', 2600, 16);
        this.sfx('click', e.h.x, e.h.y, { gain: 0.9, vary: 0.1 });
        this.k.juice.shake('small');
        break;
      case 'oracle':
        if (e.who === 'princess') {
          this.hud.princess(e.text); // her own panel (P58)
          this.comm.pingT = 1.6; // the city calls: the antenna lights up
          this.sfx('blip', undefined, undefined, { gain: 0.6, vary: 0 });
        } else this.hud.oracle(e.text, e.tone, { hold: e.hold, within: e.within, icon: e.icon });
        break;
      default:
        break;
    }
  }

  /**
   * A berserk step past midnight (every `BERSERK.every` s): the dial ticks and a soft click sounds; a new menace level is a beat of its own,
   * a banner, a bell and a red wash, and says what it adds (`menaceNote`). A dev `time` jump may skip steps: this reads where it landed.
   */
  private onBerserk(step: number, level: number) {
    const up = step > 0 && step % BERSERK.perLevel === 0;
    this.hud.dialBeat(up);
    if (!up) return this.sfx('click', undefined, undefined, { gain: 0.45, vary: 0 });
    this.hud.banner(`Menace ${level}: ${menaceNote(level)}`, 3200);
    this.hud.wash(css(DANGER));
    this.sfx('bell', undefined, undefined, { gain: 0.7, vary: 0 });
    this.sfx('warn', undefined, undefined, { gain: 0.4 });
    this.k.juice.shake('small');
  }

  /** The clock enters a phase: the `BEAT` table says how loudly (a murmur for the day, strong for dusk, the strongest for midnight). Nothing here takes input or pauses play. */
  private onDay(phase: DayPhase) {
    const b = BEAT[phase];
    if (!b) return;
    const hud = this.hud;
    hud.banner(b.banner, b.ms, b.tone, b.sub);
    if (b.wash) hud.wash(b.wash.color, b.wash);
    if (b.dial) hud.dialStrike(b.dial);
    for (const [at, size] of b.shake ?? []) this.later(at, () => this.k.juice.shake(size));
    if (b.flash) this.k.juice.flash(b.flash, 0xff3048);
    if (b.punch) this.k.juice.punch(b.punch);
    for (const [key, gain, at] of b.sounds) this.later(at, () => this.sfx(key, undefined, undefined, { gain, vary: 0 }));
    const bells = b.bells;
    if (bells) for (let i = 0; i < bells.n; i++) this.later(i * bells.gap, () => this.sfx('bell', undefined, undefined, { gain: bells.gain + i * bells.rise, vary: 0 }));
  }

  private later(ms: number, fn: () => void) {
    if (ms <= 0) fn();
    else this.scene.time.delayedCall(ms, fn);
  }
}
