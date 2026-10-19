/**
 * The hover highlight (Minos: "on mouse hover, highlight interactibles"): the mouse over something the Communicator can use
 * (an NPC, a booth, the course table, the bench, the D-city window, the lift lever, her sweepings) gives it a pale warm outline
 * and turns the pointer to a hand. One shared highlight for every kind: a single image that borrows the hovered picture and
 * draws only the glow round it (a knocked-out glow filter, made once, free while nothing is hovered). It follows the pointer
 * alone: no prompt, no click (E still uses). The outline is the guide's warm gold, not red or cyan.
 * `Hub` lists what can be hovered (`regions`) and calls `update` each frame; `pickRegion` is the pure part.
 */
import Phaser from 'phaser';

type Img = Phaser.GameObjects.Image;

/** A hoverable picture: its box on the deck, and what it is (a `Thing` id, or null for a picture that only stands for another). */
export interface HoverRegion {
  id: string;
  img: Img;
}

/** The box the pointer must be in: the picture's, trimmed a little (pictures carry some empty margin). */
export const TRIM = 0.1;

/** The first region whose box holds the point (earlier ones sit in front), or null. */
export function pickRegion<T extends { box: { x: number; y: number; w: number; h: number } }>(regions: T[], x: number, y: number): T | null {
  for (const r of regions) {
    const { x: bx, y: by, w, h } = r.box;
    if (x >= bx + w * TRIM && x <= bx + w * (1 - TRIM) && y >= by + h * TRIM && y <= by + h * (1 - TRIM)) return r;
  }
  return null;
}

/** The outline: how far it reaches and how it breathes (guesses). */
export const OUTLINE = { colour: 0xffe9a0, reach: 12, strength: 9, pulse: 0.25, hz: 1.6 } as const;

export class HoverGlow {
  private img: Img;
  private glow: Phaser.Filters.Glow | null = null;
  private on: HoverRegion | null = null;
  private cursor = false;

  constructor(
    private scene: Phaser.Scene,
    unlit: (o: Img) => void,
  ) {
    this.img = scene.add.image(0, 0, '__WHITE').setVisible(false);
    unlit(this.img);
  }

  /** The thing the pointer is over now, or null. */
  get id() {
    return this.on?.id ?? null;
  }

  /** Per frame: `at` is the pointer on the deck (null: nothing can be hovered now: a panel, a talk). */
  update(at: { x: number; y: number } | null, regions: HoverRegion[], now: number) {
    const boxes = at ? regions.filter((r) => r.img.visible).map((r) => ({ r, box: ((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height }))(r.img.getBounds()) })) : [];
    const hit = at ? pickRegion(boxes, at.x, at.y)?.r ?? null : null;
    if (hit !== this.on) this.set(hit);
    if (!this.on) return;
    const o = this.on.img, i = this.img;
    // Wear the hovered picture (it may be a squashed, flipped or re-textured one), just over it (the glow knocks the picture out).
    i.setTexture(o.texture.key, o.frame.name).setOrigin(o.originX, o.originY).setPosition(o.x, o.y).setScale(o.scaleX, o.scaleY).setFlip(o.flipX, o.flipY).setAngle(o.angle).setDepth(o.depth + 0.001);
    if (this.glow) this.glow.outerStrength = OUTLINE.strength * (1 + OUTLINE.pulse * Math.sin(now * OUTLINE.hz * Math.PI * 2));
  }

  private set(r: HoverRegion | null) {
    this.on = r;
    this.img.setVisible(!!r);
    if (r && !this.glow) {
      this.img.enableFilters();
      this.glow = this.img.filters!.internal.addGlow(OUTLINE.colour, OUTLINE.strength, 0, 1, true, 0.1, OUTLINE.reach);
      this.glow.setPaddingOverride(null);
    }
    if (this.glow) this.glow.setActive(!!r);
    const hand = !!r;
    if (hand !== this.cursor) {
      this.cursor = hand;
      this.scene.input.setDefaultCursor(hand ? 'pointer' : '');
    }
  }

  /** Back to the system pointer (a scene ending or a panel opening while hovering). */
  clear() {
    this.set(null);
  }
}
