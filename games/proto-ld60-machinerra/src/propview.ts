/**
 * What the props look like and do on screen (P39, `sim/props.ts` and `sim/crash.ts`): every prop whole, cracked or rubble
 * (rubble lies flat and stays, with a mark on the ground), the hit flash and chips on every blow, a break with debris, shake
 * and sound sized to the prop, the tell of a prop about to burst (a red ring closing in on its blast), the zones on the ground
 * (fire, a puddle, steam, a shock pulse with its warning, an alarm's waves), the energy drinks, and crashes.
 * Drawing (P51, the render budget): the sim holds every prop, the display list only those near the camera. A standing prop is a
 * sprite from a pool, a frame of the one prop atlas (`propart.ts` `PROP_ATLAS`), taken when the prop comes within `NEAR` of the
 * view and given back when it leaves (its state changing is a frame change); its cast shadow is the same, a pooled image
 * (`shadowview.ts` `recast`; `ShadowView` turns it to the light). Rubble is not a sprite: it is stamped once into the baked ground
 * (`groundchunks.ts`), and only its cast shadow is pooled, so it still turns with the sun. Depth stays the foot's y.
 * Add a beat: a `case` in `event`; a new zone kind: a branch in `zones`; a new look: `propart.ts`.
 */
import Phaser from 'phaser';
import { S } from './art';
import { BIOMES } from './sim/defs';
import { DANGER, DANGER_HOT, FRIEND, LINE, SOOT } from './house';
import { stampBuildings } from './buildingview';
import { GroundChunks } from './groundchunks';
import { ViewBase, type G, type Img, type PlayHost } from './playhost';
import { MAT, PROP_ATLAS, propKey } from './propart';
import { PROPS, ZONES } from './sim/defs';
import { PROP_CASTS, blankCast, contactRow, recast } from './shadowview';
import { propState, type Prop, type PropState, type Zone } from './sim/props';
import type { SimEvent } from './sim/sim';

const col = (s: string) => Number.parseInt(s.slice(1), 16);
const SOFT_SOOT = 0x1a120c;
/** How far (px) outside the camera's view a prop still has its sprites (a cast reaches no farther than a prop is tall). */
const NEAR = 140;
/** Depth of the baked ground: rubble lies over the painted ground, the marks and the casts, under every unit's shadow. */
const GROUND_DEPTH = -6;

/** What a prop in or near the view has: its picture (none once it is rubble) and its cast shadow, and where and how they were last set. */
interface Slot {
  img: Img | null;
  /** Null while `PROP_CASTS` is false: a prop has no shadow. */
  cast: Img | null;
  st: PropState;
  x: number;
  y: number;
}

export class PropView extends ViewBase {
  /** By the prop's place in `sim.props.list` (it only grows): its sprites while it is near the view. */
  private slots: (Slot | undefined)[] = [];
  /** By the same index: has its rubble been stamped into the ground, and is it drawn by its place (not here). */
  private baked = new Uint8Array(0);
  private skip = new Uint8Array(0);
  /** A prop's id to its place in the list (the events know a prop by id). */
  private at = new Map<number, number>();
  private freeImgs: Img[] = [];
  private freeCasts: Img[] = [];
  private shown = 0;
  private chunks: GroundChunks;
  private cans = new Map<number, Img>();
  private ground: Phaser.GameObjects.Graphics;
  /** P47: the buildings whose floors are stamped (a dev command may add more). */
  private floors = 0;

  constructor(host: PlayHost) {
    super(host);
    // Over the painted ground and the zones' own marks, under every unit (depth is the unit's y).
    this.ground = host.scene.add.graphics().setDepth(-4);
    const b = host.w.bounds;
    this.chunks = new GroundChunks(host.scene, { width: b.width, height: b.height, key: PROP_ATLAS, depth: GROUND_DEPTH });
    this.floors = stampBuildings(this.chunks, this.sim); // P47's floors, footings and overgrowth, under any rubble
  }

  destroy() {
    this.ground.destroy();
    this.chunks.destroy();
  }

  /** Make room in the bookkeeping for props the sim added since (the list only grows). */
  private index(list: readonly Prop[]) {
    const n = list.length, had = this.at.size;
    if (n === had) return;
    if (n > this.baked.length) {
      const grow = (a: Uint8Array) => {
        const b = new Uint8Array(Math.max(n, a.length * 2));
        b.set(a);
        return b;
      };
      this.baked = grow(this.baked);
      this.skip = grow(this.skip);
    }
    for (let i = had; i < n; i++) {
      this.at.set(list[i].id, i);
      this.skip[i] = PROPS[list[i].kind].placeDrawn ? 1 : 0; // its place draws it (the Cold Box's fridge)
    }
  }

  private takeImg(): Img {
    const img = this.freeImgs.pop();
    if (img) return img.setVisible(true);
    return this.scene.add.image(0, 0, PROP_ATLAS).setOrigin(0.5, 1).setScale(1 / S);
  }

  private giveImg(img: Img) {
    img.setVisible(false).clearTint().setTintMode(Phaser.TintModes.MULTIPLY).setScale(1 / S);
    this.freeImgs.push(img);
  }

  private takeCast(): Img | null {
    if (!PROP_CASTS) return null; // Minos: props have no shadow
    const c = this.freeCasts.pop();
    if (c) return c.setVisible(true);
    const paint = BIOMES[this.host.land.biome].paint;
    this.scene.events.emit('cast-added'); // so `ShadowView` finds it within the frame
    return blankCast(this.scene, paint, -7.9).setVisible(true);
  }

  private giveCast(c: Img | null) {
    if (!c) return;
    c.setVisible(false);
    this.freeCasts.push(c);
  }

  /** A prop leaves the view: its sprites go back to the pools. */
  private drop(i: number) {
    const s = this.slots[i];
    if (!s) return;
    if (s.img) this.giveImg(s.img);
    this.giveCast(s.cast);
    this.slots[i] = undefined;
    this.shown--;
  }

  /** Set a prop's sprites to what it is now: its frame for its state, where it stands, the cast under it. */
  private seat(i: number, p: Prop, st: PropState) {
    let s = this.slots[i];
    if (!s) {
      s = this.slots[i] = { img: null, cast: this.takeCast(), st: '' as PropState, x: NaN, y: NaN };
      this.shown++;
    }
    const rubble = st === 'rubble', foot = p.y + (p.kind === 'wall' ? 18 : 12), y = rubble ? p.y + 10 : foot, name = propKey(p.kind, p.material, st);
    if (s.st !== st) {
      // A new picture: its frame, and the shadow of that picture (a rubble heap is stamped into the ground and is only a cast here).
      if (rubble) {
        if (s.img) this.giveImg(s.img);
        s.img = null;
      } else {
        s.img ??= this.takeImg();
        s.img.setFrame(name);
      }
      if (s.cast) recast(this.scene, s.cast, this.scene.textures.getFrame(PROP_ATLAS, name), 1 / S, 1, { foot: contactRow({ frame: this.scene.textures.getFrame(PROP_ATLAS, name) }) });
      s.st = st;
    }
    if (s.img) {
      // The tie-break by x keeps overlapping neighbours in one order, whichever sprite the pool gave each.
      s.img.setPosition(p.x, y).setDepth(foot + p.x * 1e-6);
    }
    if (s.cast) s.cast.setPosition(p.x, y - (s.cast.getData('cast') as { lift: number }).lift / S);
    s.x = p.x;
    s.y = p.y;
  }

  /** A broken prop's rubble goes into the baked ground, once. */
  private settle(i: number, p: Prop) {
    this.baked[i] = 1;
    this.chunks.add({ id: p.id, frame: propKey(p.kind, p.material, 'rubble'), x: p.x, y: p.y + 10, ox: 0.5, oy: 1, scale: 1 / S });
  }

  update(dt: number, g: G) {
    const sim = this.sim, now = this.scene.time.now, view = this.scene.cameras.main.worldView, list = sim.props.list;
    this.index(list);
    if ((sim.map.buildings?.length ?? 0) > this.floors) this.floors = stampBuildings(this.chunks, sim, this.floors);
    const x0 = view.x - NEAR, x1 = view.right + NEAR, y0 = view.y - NEAR, y1 = view.bottom + NEAR;
    for (let i = 0; i < list.length; i++) {
      if (this.skip[i]) continue;
      const p = list[i], s = this.slots[i];
      if (p.gone) {
        // Taken by its place (a shell into the gun): nothing left to draw.
        if (s) this.drop(i);
        continue;
      }
      if (p.broken && !this.baked[i]) this.settle(i, p);
      const live = p.fling !== undefined || p.primed !== undefined || p.carriedBy !== undefined;
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) {
        // Out of reach: its sprites go back; only what moves or is about to burst keeps them (it is drawn where it is, as it always was).
        if (!s) continue;
        if (!live) {
          this.drop(i);
          continue;
        }
      }
      const st = propState(p);
      if (!s || s.st !== st || s.x !== p.x || s.y !== p.y) this.seat(i, p, st);
      const img = this.slots[i]!.img;
      if (!img) continue;
      if (p.primed !== undefined) {
        // Swelling and shaking: it is about to go.
        const b = PROPS[p.kind].fx?.burst;
        const k = 1 + Math.sin(now / 45) * 0.05 * (1 - p.primed / (PROPS[p.kind].fx?.tell ?? 1));
        img.setScale(k / S, k / S).setTint(now % 220 < 110 ? 0xffd0a0 : 0xffffff);
        if (b) {
          const f = 1 - Math.max(0, p.primed) / (PROPS[p.kind].fx?.tell ?? 1);
          g.lineStyle(LINE.accent, SOOT, 0.5).strokeEllipse(p.x, p.y + 6, b.r * 2, b.r * 1.3);
          g.lineStyle(LINE.effect, DANGER, 0.5 + 0.4 * f).strokeEllipse(p.x, p.y + 6, b.r * 2, b.r * 1.3);
          g.fillStyle(DANGER, 0.08 + 0.18 * f).fillEllipse(p.x, p.y + 6, b.r * 2 * f, b.r * 1.3 * f);
        }
      } else if (img.isTinted) img.clearTint().setScale(1 / S);
    }
    this.chunks.update(view);
    this.ground.clear();
    for (const z of sim.props.zones) this.zone(z, g, now);
    for (const c of sim.props.cans) {
      let img = this.cans.get(c.id);
      if (!img) {
        img = this.scene.add.image(c.x, c.y, 'oilcan').setScale(1.1 / S).setTint(0xf0c040);
        this.cans.set(c.id, img);
      }
      img.setPosition(c.x, c.y - 6 + Math.sin(now / 220 + c.id) * 2).setDepth(c.y).setAlpha(c.t < 6 ? 0.4 + 0.6 * Math.abs(Math.sin(now / 120)) : 1);
      g.lineStyle(LINE.effect, FRIEND, 0.5 + 0.2 * Math.sin(now / 200)).strokeEllipse(c.x, c.y + 2, 26, 14);
    }
    for (const [id, img] of this.cans) if (!sim.props.cans.some((c) => c.id === id)) {
      img.destroy();
      this.cans.delete(id);
    }
    void dt;
  }

  /** A zone on the ground, by kind. The ones that hurt are red-leaning (danger); water is only water. */
  private zone(z: Zone, g: G, now: number) {
    const gr = this.ground, view = this.scene.cameras.main.worldView;
    if (z.x < view.x - z.r || z.x > view.right + z.r || z.y < view.y - z.r || z.y > view.bottom + z.r) return;
    const fade = Math.min(1, z.life / 1.5);
    switch (z.kind) {
      case 'fire': {
        // A stoked Firebrand's fire (`sim/stoke.ts`) burns hotter: more and taller tongues, a white-yellow heart, a bright rim.
        const hot = !!z.stoked, n = hot ? 14 : 9, tall = hot ? 1.7 : 1;
        gr.fillStyle(0x2a1a10, 0.35 * fade).fillEllipse(z.x, z.y + 4, z.r * 2, z.r * 1.3);
        if (hot) gr.fillStyle(0xff8a20, 0.28 * fade).fillEllipse(z.x, z.y + 3, z.r * 1.8, z.r * 1.15);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + z.id, rr = z.r * (0.25 + 0.55 * ((i * 37) % 10) / 10);
          const x = z.x + Math.cos(a) * rr, y = z.y + Math.sin(a) * rr * 0.65, h = (10 + 8 * Math.sin(now / (hot ? 60 : 90) + i * 2)) * tall;
          gr.fillStyle(i % 2 ? DANGER_HOT : hot ? 0xffe070 : 0xffc040, 0.8 * fade).fillTriangle(x - 5, y + 2, x + 5, y + 2, x, y - h);
          if (hot) gr.fillStyle(0xfff6d0, 0.85 * fade).fillTriangle(x - 2.5, y + 2, x + 2.5, y + 2, x, y - h * 0.62);
        }
        if (hot) gr.fillStyle(0xfff0b0, 0.35 * fade).fillEllipse(z.x, z.y + 2, z.r * 0.8, z.r * 0.5);
        g.lineStyle(hot ? LINE.accent : LINE.effect, hot ? 0xffa030 : DANGER, (hot ? 0.7 : 0.45) * fade).strokeEllipse(z.x, z.y + 4, z.r * 2, z.r * 1.3);
        break;
      }
      case 'puddle':
        gr.fillStyle(0x7fa6bc, 0.4 * fade).fillEllipse(z.x, z.y + 6, z.r * 2, z.r * 1.2);
        gr.lineStyle(LINE.detail, 0xd8eef8, 0.5 * fade).strokeEllipse(z.x, z.y + 6, z.r * 1.6 + Math.sin(now / 400) * 4, z.r * 0.95);
        break;
      case 'slick':
        // A Firebrand's coal slick: a dark, glossy pool; the fire that lights it is the 'fire' zone.
        gr.fillStyle(SOOT, 0.55 * fade).fillEllipse(z.x, z.y + 5, z.r * 2, z.r * 1.2);
        gr.fillStyle(0x6a5a3a, 0.25 * fade).fillEllipse(z.x - z.r * 0.25, z.y + 2, z.r * 0.8, z.r * 0.4);
        gr.lineStyle(LINE.detail, 0x8a7a58, 0.4 * fade).strokeEllipse(z.x, z.y + 5, z.r * 1.7 + Math.sin(now / 500) * 3, z.r * 0.95);
        break;
      case 'mud':
        // A Mud tank boar's mud (P31): a brown smear, wet at its heart.
        gr.fillStyle(0x4a3420, 0.5 * fade).fillEllipse(z.x, z.y + 5, z.r * 2, z.r * 1.2);
        gr.fillStyle(0x6a5030, 0.35 * fade).fillEllipse(z.x - z.r * 0.2, z.y + 3, z.r * 1.1, z.r * 0.55);
        break;
      case 'steam':
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + now / 900, r = z.r * 0.5 * (0.4 + (i % 3) * 0.3);
          gr.fillStyle(0xf4efe6, 0.35 * fade).fillCircle(z.x + Math.cos(a) * r, z.y - 6 + Math.sin(a) * r * 0.6 - ((now / 20 + i * 11) % 24), 9 + (i % 3) * 3);
        }
        g.lineStyle(LINE.effect, DANGER_HOT, 0.4 * fade).strokeEllipse(z.x, z.y + 4, z.r * 2, z.r * 1.3);
        break;
      case 'shock': {
        // The ring closes in on the pulse (the warning), then flashes.
        const left = Math.max(0, z.next), E = ZONES.shock.every, warn = left < 0.6 ? 1 - left / 0.6 : 0;
        gr.fillStyle(0xf0cf3a, 0.1 + 0.2 * warn).fillEllipse(z.x, z.y + 4, z.r * 2, z.r * 1.3);
        g.lineStyle(LINE.accent, SOOT, 0.5).strokeEllipse(z.x, z.y + 4, z.r * 2, z.r * 1.3);
        g.lineStyle(LINE.effect, DANGER_HOT, 0.5 + 0.4 * warn).strokeEllipse(z.x, z.y + 4, z.r * 2, z.r * 1.3);
        if (warn > 0) g.lineStyle(LINE.effect, 0xfff4d0, 0.8).strokeEllipse(z.x, z.y + 4, z.r * 2 * (1 - warn * 0.7), z.r * 1.3 * (1 - warn * 0.7));
        void E;
        break;
      }
      case 'alarm': {
        const t = (now % 1000) / 1000;
        for (const k of [0, 0.5]) g.lineStyle(LINE.detail, 0xf0cf7a, 0.4 * (1 - ((t + k) % 1))).strokeEllipse(z.x, z.y, 120 * ((t + k) % 1) + 20, 70 * ((t + k) % 1) + 12);
        break;
      }
    }
  }

  event(e: SimEvent) {
    const fx = this.k.fx, w = this.w;
    switch (e.e) {
      case 'prop': {
        const p = e.p, c = col(MAT[p.material][0]), big = PROPS[p.kind].size;
        switch (e.what) {
          case 'hit': {
            const img = this.slots[this.at.get(p.id) ?? -1]?.img;
            if (img) this.k.juice.flashSprite(img, 70);
            fx.burst(p.x, p.y - 10, { color: c, size: 0.35 + Math.min(0.4, (e.dmg ?? 0) / 25) });
            this.sfx(p.material === 'concrete' || p.material === 'brass' ? 'rock' : 'thump', p.x, p.y, { gain: 0.35, vary: 0.25 });
            break;
          }
          case 'crack':
            fx.burst(p.x, p.y - 12, { color: c, size: 0.7 });
            this.sfx('creak', p.x, p.y, { gain: 0.4, vary: 0.2 });
            break;
          case 'tell':
            this.sfx(p.kind === 'tank' ? 'whistle' : 'hiss', p.x, p.y, { gain: 0.6 });
            this.flash(p.x, p.y - 14, 0xffa050, 0.8);
            break;
          case 'break':
            fx.burst(p.x, p.y - 8, { color: c, size: 0.8 + big * 0.3 });
            fx.burst(p.x, p.y - 4, { color: 0x3d3833, size: 0.6 + big * 0.2 });
            this.sfx(p.material === 'glass' ? 'pop' : 'rock', p.x, p.y, { gain: 0.5 + big * 0.1, vary: 0.2 });
            if (big >= 1.5) this.k.juice.shake(big >= 3 ? 'medium' : 'small');
            w.marks.stamp('world-soft', p.x, p.y + 8, { tint: SOFT_SOOT, alpha: 0.3, scale: 0.35 + big * 0.12, kind: false });
            break;
          case 'kick':
            this.sfx('thump', p.x, p.y, { gain: 0.6, vary: 0.15 });
            fx.burst(p.x, p.y - 4, { color: 0xd8c8a8, size: 0.5 });
            break;
        }
        break;
      }
      case 'burst':
        fx.burst(e.x, e.y - 10, { color: e.fire ? 0xffa040 : 0xdff4ff, size: Math.min(2.4, e.r / 40) });
        this.flash(e.x, e.y - 12, e.fire ? 0xffa050 : 0xf4efe6, 2);
        this.sfx('boom', e.x, e.y, { gain: 0.8, vary: 0.1 });
        this.k.juice.shake(e.r >= 90 ? 'medium' : 'small');
        w.marks.stamp('world-soft', e.x, e.y + 4, { tint: SOFT_SOOT, alpha: e.fire ? 0.55 : 0.3, scale: e.r / 36, kind: false });
        break;
      case 'zone':
        if (e.what === 'new' && e.z.kind === 'alarm') this.sfx('horn', e.z.x, e.z.y, { gain: 0.6 });
        if (e.what === 'new' && e.z.kind === 'puddle') this.sfx('hiss', e.z.x, e.z.y, { gain: 0.4 });
        if (e.what === 'pulse') {
          this.sfx('zap', e.z.x, e.z.y, { gain: 0.6, vary: 0.1 });
          this.flash(e.z.x, e.z.y - 10, 0xf0cf3a, 1.4);
          fx.burst(e.z.x, e.z.y - 10, { color: 0xf0cf3a, size: 1.2 });
        }
        if (e.what === 'end' && e.z.kind === 'fire') w.marks.stamp('world-soft', e.z.x, e.z.y + 4, { tint: SOFT_SOOT, alpha: 0.4, scale: e.z.r / 40, kind: false });
        break;
      case 'crash': {
        const big = e.dmg >= 14;
        fx.burst(e.x, e.y - 8, { color: 0xe8e0d0, size: big ? 1.1 : 0.7 });
        this.sfx('thump', e.x, e.y, { gain: big ? 0.9 : 0.6, vary: 0.15 });
        if (big) this.k.juice.shake('small');
        if (e.what === 'foe') this.floater(e.x, e.y - 40, 'CRASH', '#ffe9b0', 700, 15);
        break;
      }
      case 'ruinbreak':
        this.floater(e.ruin.x, e.ruin.y - 56, e.ruin.live ? 'The walls are down. It still hums.' : 'Flattened.', '#fff3d6', 2600, 16);
        this.sfx('rock', e.ruin.x, e.ruin.y, { gain: 0.7 });
        this.k.juice.shake('small');
        break;
      case 'can':
        if (e.what === 'drop') this.sfx('click', e.x, e.y, { gain: 0.5, vary: 0.2 });
        else {
          this.sfx('pickup', e.x, e.y, { gain: 0.7 });
          this.floater(e.x, e.y - 24, 'Haste!', '#9ff6ff', 1200, 15);
        }
        break;
    }
  }

  debug() {
    return { props: this.shown, propsPooled: this.freeImgs.length, castsPooled: this.freeCasts.length, cans: this.cans.size, ground: this.chunks.stats };
  }
}
