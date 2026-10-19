/**
 * Staggered updates: per-entity logic that does not need every frame (far, idle or slow things) runs once every
 * `every` frames per entity, spread so each frame handles 1/every of them and the cost stays even. No Phaser: tested in
 * stagger.test.ts. Entities near the camera belong in `cull.forNear` (every frame); `skip` leaves them out here.
 *
 *   const far = new Stagger<Critter>(8, (c, dt) => c.think(dt));   // dt = ms since this entity's last turn
 *   far.add(c); ... far.update(delta);                              // once per frame
 *
 * Adding or removing entities (also from inside the callback) is safe; an entity swapped into a slot that was already
 * passed this frame waits one extra round.
 */
interface Slot<T> {
  item: T;
  last: number;
  i: number;
}

export class Stagger<T> {
  private slots: Slot<T>[] = [];
  private by = new Map<T, Slot<T>>();
  private frame = 0;
  private clock = 0;

  /**
   * @param every   frames between turns of one entity (>= 1).
   * @param fn      the logic; `dt` is the ms since this entity's last turn (so movement and timers stay correct).
   * @param skip    return true for entities handled elsewhere right now (e.g. near the camera); they are not called.
   */
  constructor(public every: number, private fn: (item: T, dt: number) => void, private skip?: (item: T) => boolean) {}

  get size() {
    return this.slots.length;
  }
  has(item: T) {
    return this.by.has(item);
  }

  add(item: T) {
    if (this.by.has(item)) return;
    const s: Slot<T> = { item, last: this.clock, i: this.slots.length };
    this.slots.push(s);
    this.by.set(item, s);
  }

  remove(item: T) {
    const s = this.by.get(item);
    if (!s) return;
    const last = this.slots.pop()!;
    if (last !== s) {
      this.slots[s.i] = last;
      last.i = s.i;
    }
    this.by.delete(item);
  }

  /** Call once per frame with the frame's dt (ms). */
  update(dt: number) {
    this.clock += dt;
    const step = Math.max(1, Math.floor(this.every));
    for (let i = this.frame % step; i < this.slots.length; i += step) {
      const s = this.slots[i];
      const d = this.clock - s.last;
      s.last = this.clock;
      if (!this.skip || !this.skip(s.item)) this.fn(s.item, d);
      if (this.slots[i] !== s) i -= step; // removed by its own callback: the entity swapped into this slot is next
    }
    this.frame++;
  }
}
