/**
 * What the effect engine's statuses look like on the mission's screen (P11): a row of pips under every afflicted robot and enemy
 * (a filled dot for a debuff, a ring for a buff, one tick under it per extra stack, blinking as it runs out), and small words that
 * rise and fade ("Parry", "Burning" on a robot) from a fixed pool of texts. Cheap by design: the pips are drawn into the scene's one
 * Graphics, the statuses are read with `Effects.eachStatus` (no allocation), and the words reuse eight Text objects.
 *
 * Add a status that shows: its colour in `LOOK`. One that must not (a marker the sim keeps fresh) goes in `HIDDEN`.
 */
import type Phaser from 'phaser';
import { STATUSES, type Effects, type StatusId, type Unit } from './sim/effects';
import { FRIEND, LINE } from './house';

/** A status's pip colour, by its damage type's mood: fire orange, steam white, shock cyan, cold pale blue, acid green, dark violet. */
export const LOOK: Partial<Record<StatusId, number>> = {
  staggered: 0xffd84a, braced: 0xd8a860, punctured: 0xc04838, keen: 0xe8e0a0, burning: 0xff7a20, stoked: 0xffb040, scalded: 0xf0f4f8, steaming: 0xd8e4ec,
  shocked: 0x58e8ff, charged: 0x9ff4ff, chilled: 0x9fd8ff, frozen: 0xe8fbff, quenched: 0x6ab8d8, corroded: 0x9ad040, etched: 0xc8e870, dread: 0xa060e0,
  shadowed: 0x7048a0, wet: 0x4a90d8, rooted: 0x8a6a40, slowed: 0x8890a0, blinded: 0xb0a8b8, marked: FRIEND, taunted: 0xff9a40, haste: 0xffe070, fury: 0xff4040,
};
/** Statuses the sim keeps fresh as markers or that only bookkeep: no pip. */
export const HIDDEN: ReadonlySet<StatusId> = new Set<StatusId>(['twistedAura', 'webbed', 'lit', 'menace', 'charge', 'grace', 'steady']);
export const pipColor = (id: StatusId) => LOOK[id] ?? 0xcccccc;
/** The player-read names that differ from the id: fire's positive status is `stoked` in code; coal stoking keeps "Stoke". */
const NAMES: Partial<Record<StatusId, string>> = { stoked: 'Fired up' };
export const statusName = (id: StatusId) => NAMES[id] ?? id[0].toUpperCase() + id.slice(1);

const MAX_PIPS = 5, SPACING = 9, R = 3.2, SOOT = 0x1d1a17;
/** The statuses of the unit being drawn now (module scratch, so a frame allocates nothing). */
const ids: StatusId[] = [];
const stacks: number[] = [];
const lefts: number[] = [];
let n = 0;
const collect = (id: StatusId, st: number, left: number) => {
  if (n >= MAX_PIPS || HIDDEN.has(id)) return;
  ids[n] = id;
  stacks[n] = st;
  lefts[n] = left;
  n++;
};

interface Pop { t: Phaser.GameObjects.Text; age: number; life: number; x: number; y: number; on: boolean }
const POPS = 8;

export class StatusView {
  private pops: Pop[] = [];
  private next = 0;
  /** `text(size)` makes a world Text (hidden until used). */
  constructor(private text: (size: number) => Phaser.GameObjects.Text) {}

  /** Draw the pips of one unit, centred under (x, y) (its feet). `ms` is the scene clock, for the blink of one running out. */
  pips(g: Phaser.GameObjects.Graphics, fx: Effects, u: Unit, x: number, y: number, ms: number): void {
    n = 0;
    fx.eachStatus(u, collect);
    if (!n) return;
    const blink = Math.floor(ms / 100) % 2 === 0;
    for (let i = 0; i < n; i++) {
      const id = ids[i], px = x + (i - (n - 1) / 2) * SPACING, col = pipColor(id);
      const fading = lefts[i] < 0.7;
      const a = fading && !blink ? 0.35 : 1;
      g.fillStyle(SOOT, a).fillCircle(px, y, R + 1.6);
      if (STATUSES[id].kind === 'buff') g.lineStyle(LINE.accent, col, a).strokeCircle(px, y, R - 1);
      else g.fillStyle(col, a).fillCircle(px, y, R);
      for (let k = 1; k < stacks[i]; k++) g.fillStyle(col, a).fillCircle(px + (k - (stacks[i] - 1) / 2) * 3.4, y + R + 4, 1.2);
    }
  }

  /** A small word that rises from (x, y) and fades. When all eight are busy the oldest is reused. */
  pop(x: number, y: number, word: string, color: string, life = 0.9, size = 12): void {
    let p = this.pops.find((q) => !q.on);
    if (!p) {
      if (this.pops.length < POPS) this.pops.push((p = { t: this.text(size), age: 0, life, x, y, on: false }));
      else p = this.pops[this.next++ % POPS];
    }
    p.on = true;
    p.age = 0;
    p.life = life;
    p.x = x;
    p.y = y;
    p.t.setText(word).setColor(color).setFontSize(size).setPosition(x, y).setAlpha(1).setVisible(true);
  }

  update(dt: number): void {
    for (const p of this.pops) {
      if (!p.on) continue;
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.on = false;
        p.t.setVisible(false);
        continue;
      }
      p.t.setPosition(p.x, p.y - 22 * k).setAlpha(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4);
    }
  }
}
