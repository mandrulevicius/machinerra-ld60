/**
 * Pickup fanfare (Minos; `docs/onboarding.md`): what is gained says so where the player is looking.
 * - A counted resource (scrap, copper, coal, enemy parts) flies from where it was gained to its HUD slot, which pulses
 *   (`Hud.pulse`). Gains within `FLY.merge` s of each other are one flier carrying the sum, and while `FLY.cap` fliers are up
 *   the rest wait and add together, so a drop of fifty gobs is a few fliers, not fifty.
 * - An item (a found weapon, a wild mod, a unique part, an AI core, or an `item` event from `Onboard.item`) arcs to the
 *   Communicator, hovers about a second above him with its name and a glow in its quality's colour (`QUALITIES`, the theme's `--q-*`), then goes in. At most
 *   `FIND.cap` hover at once; the rest wait, and the same name waiting joins into one ("x3").
 * Both are DOM in the HUD's layer, laid out in the HUD's pixels, so they stay sharp and follow the camera by `toUi`.
 * A new thing that flies to a slot: `fly(id, n, x, y)`; a new item: an `item` event.
 */
import { iconCanvas } from './iconkey';
import { ViewBase, type PlayHost } from './playhost';
import { gear } from './hub/carry';
import { MULE, PARTS } from './sim/defs';
import { ITEMS, itemOfWeapon, QUALITIES, type Quality } from './sim/gear';
import type { Gained, HudId } from './sim/onboard';
import type { SimEvent } from './sim/sim';

/** Seconds and pixels (guesses). `time` a flier's flight, `merge` how long gains join, `arc` how high its path bows, `cap` fliers at once. */
export const FLY = { time: 0.75, merge: 0.15, arc: 46, cap: 10, coalDelay: 0.45 };
/** An item's three beats (s): the arc to him, the hover, the way in; `rise` px above his feet, `stack` px between two, `cap` at once. */
export const FIND = { arc: 0.5, hover: 1, into: 0.3, rise: 104, stack: 54, cap: 2 };

/** The colour of what flies, as the floaters of the pickups have always had it. */
const COLOR: Partial<Record<HudId, string>> = { scrap: '#ffd98a', copper: '#e09a62', coal: '#cfc7bc', parts: '#9ff6ff' };
/**
 * Things that carry no quality take the nearest tier: an AI core is epic (rare, and never lost), a boss's wild mod epic (a mod has no quality, one copy,
 * and a boss gives it), a unique boss part legendary (one of its kind).
 */
export const NO_QUALITY: Record<'core' | 'mod' | 'unique', Quality> = { core: 'epic', mod: 'epic', unique: 'legendary' };

/** A quality's colour as light, read from the theme's `--q-*` (theme.css), so the glow and the inventory's frames never disagree. */
function qualityLight(q: Quality): number {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--q-${q}`).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? parseInt(v.slice(1), 16) : 0xd8d0c0;
}

const ease = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

interface Fly {
  el: HTMLElement;
  id: HudId;
  wx: number;
  wy: number;
  delay: number;
  age: number;
}
interface Find extends Required<Pick<Gained, 'name' | 'icon'>> {
  quality: Quality;
  x: number;
  y: number;
  n: number;
}
interface Hover {
  el: HTMLElement;
  find: Find;
  age: number;
}

export class FanfareView extends ViewBase {
  private layer: HTMLElement;
  private fliers: Fly[] = [];
  /** Gains not yet flown: summed per slot, from where the first one came. */
  private pend = new Map<HudId, { n: number; x: number; y: number; wait: number; delay: number }>();
  private hovers: Hover[] = [];
  private waiting: Find[] = [];

  constructor(host: PlayHost) {
    super(host);
    this.layer = document.createElement('div');
    this.layer.className = 'mc-fx';
    host.ui.appendChild(this.layer);
  }

  destroy() {
    this.layer.remove();
  }

  /** A world point in the HUD's pixels. */
  private toUi(x: number, y: number) {
    const cam = this.scene.cameras.main;
    return { x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom };
  }

  /** `n` of a counted resource gained at a world point: it flies to its slot (`delay` s from now). */
  fly(id: HudId, n: number, x: number, y: number, delay = 0) {
    const p = this.pend.get(id);
    if (p) p.n += n;
    else this.pend.set(id, { n, x, y, wait: 0, delay });
  }

  /** An item gained: it hovers over the Communicator with its name. */
  find(g: Gained) {
    const c = this.sim.controller;
    const f: Find = { name: g.name ?? ITEMS[g.id!].name, icon: g.icon ?? `gear-${g.id}`, quality: g.quality ?? 'standard', x: g.x ?? c.x, y: g.y ?? c.y - 20, n: 1 };
    const same = this.waiting.find((w) => w.name === f.name && w.quality === f.quality);
    if (same) same.n++;
    else this.waiting.push(f);
  }

  event(e: SimEvent) {
    switch (e.e) {
      case 'pickup': {
        const l = e.l;
        if (l.kind === 'scrap') this.fly('scrap', Math.round(l.amt * (e.by.role === 'mule' ? MULE.scrap : 1)), l.x, l.y - 10);
        else if (l.kind === 'copper') this.fly('copper', Math.round(l.amt), l.x, l.y - 10);
        else if (l.kind === 'core') this.find({ name: 'AI core', icon: 'ai-core', quality: NO_QUALITY.core, x: l.x, y: l.y - 10 });
        else if (l.kind === 'part') {
          const p = PARTS[l.part!];
          if (p.unique) this.find({ name: p.name, icon: `part-${l.part}`, quality: NO_QUALITY.unique, x: l.x, y: l.y - 10 });
          else this.fly('parts', 1, l.x, l.y - 10);
        }
        break;
      }
      case 'coal':
        this.fly('coal', e.n, e.by.x, e.by.y - 10, FLY.coalDelay);
        break;
      case 'found':
        // The weapon is an item now (`GearView.found` has filed it): its own quality.
        this.find({ id: itemOfWeapon(e.weapon), quality: gear.get().items.find((o) => ITEMS[o.id].weapon === e.weapon)?.q });
        break;
      case 'modFound':
        this.find({ id: e.mod, quality: NO_QUALITY.mod, x: e.x, y: e.y - 20 });
        break;
      case 'item':
        this.find(e.item);
        break;
    }
  }

  update(dt: number) {
    this.flights(dt);
    this.hovering(dt);
  }

  private flights(dt: number) {
    for (const [id, p] of this.pend) {
      p.wait += dt;
      if (p.wait < FLY.merge || this.fliers.length >= FLY.cap) continue;
      this.pend.delete(id);
      const el = document.createElement('div');
      el.className = 'mc-fly';
      el.style.setProperty('--c', COLOR[id] ?? '#fff');
      el.innerHTML = `<i></i><b>+${p.n}</b>`;
      el.style.opacity = '0';
      this.layer.appendChild(el);
      this.fliers.push({ el, id, wx: p.x, wy: p.y, delay: p.delay, age: 0 });
    }
    const slots = new Map<HudId, { x: number; y: number } | null>();
    this.fliers = this.fliers.filter((f) => {
      f.age += dt;
      const t = (f.age - f.delay) / FLY.time;
      if (t < 0) return true;
      if (!slots.has(f.id)) slots.set(f.id, this.hud.slotAt(f.id));
      const to = slots.get(f.id);
      if (t >= 1 || !to) {
        if (to) {
          this.hud.pulse(f.id);
          this.sfx('click', undefined, undefined, { gain: 0.25, vary: 0.2 });
        }
        f.el.remove();
        return false;
      }
      const from = this.toUi(f.wx, f.wy), k = ease(t);
      const x = from.x + (to.x - from.x) * k;
      const y = from.y + (to.y - from.y) * k - Math.sin(Math.PI * k) * FLY.arc;
      f.el.style.opacity = String(Math.min(1, t * 8));
      f.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${(1.15 - 0.3 * k).toFixed(2)})`;
      return true;
    });
  }

  private hovering(dt: number) {
    while (this.hovers.length < FIND.cap && this.waiting.length) this.start(this.waiting.shift()!);
    const c = this.sim.controller, me = this.toUi(c.x, c.y);
    const total = FIND.arc + FIND.hover + FIND.into;
    this.hovers = this.hovers.filter((h, i) => {
      h.age += dt;
      if (h.age >= total) {
        h.el.remove();
        this.k.fx.burst(c.x, c.y - 30, { color: qualityLight(h.find.quality), size: 0.5 });
        return false;
      }
      const spot = { x: me.x, y: me.y - FIND.rise - i * FIND.stack };
      let x: number, y: number, s: number, a: number;
      if (h.age < FIND.arc) {
        const t = ease(h.age / FIND.arc), from = this.toUi(h.find.x, h.find.y);
        x = from.x + (spot.x - from.x) * t;
        y = from.y + (spot.y - from.y) * t - Math.sin(Math.PI * t) * 60;
        s = 0.5 + 0.5 * t;
        a = clamp01(t * 3);
      } else if (h.age < FIND.arc + FIND.hover) {
        const t = h.age - FIND.arc;
        x = spot.x;
        y = spot.y + Math.sin(t * 5) * 3;
        s = 1;
        a = 1;
      } else {
        const t = ease((h.age - FIND.arc - FIND.hover) / FIND.into);
        x = spot.x + (me.x - spot.x) * t;
        y = spot.y + (me.y - 30 - spot.y) * t;
        s = 1 - 0.75 * t;
        a = 1 - t;
      }
      h.el.style.setProperty('--glow', (0.5 + 0.5 * Math.sin(h.age * 8)).toFixed(2));
      h.el.style.opacity = a.toFixed(2);
      h.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${s.toFixed(2)})`;
      return true;
    });
  }

  private start(f: Find) {
    const el = document.createElement('div');
    el.className = 'mc-find';
    el.style.setProperty('--q', `var(--q-${f.quality})`);
    el.style.opacity = '0';
    const icon = iconCanvas(this.scene, f.icon, 40);
    if (icon) {
      const c = document.createElement('canvas');
      c.width = icon.width;
      c.height = icon.height;
      c.getContext('2d')!.drawImage(icon, 0, 0);
      el.appendChild(c);
    }
    const words = document.createElement('div');
    words.innerHTML = '<div class="mc-find__name"></div><div class="mc-find__rarity"></div>';
    (words.firstChild as HTMLElement).textContent = f.n > 1 ? `${f.name} x${f.n}` : f.name;
    (words.lastChild as HTMLElement).textContent = QUALITIES[f.quality].name;
    el.appendChild(words);
    this.layer.appendChild(el);
    this.hovers.push({ el, find: f, age: 0 });
    this.sfx(f.quality === 'standard' || f.quality === 'fine' ? 'pickup' : 'unlock', undefined, undefined, { gain: 0.7 });
  }

  debug() {
    return { fanfare: { fliers: this.fliers.length, pending: [...this.pend.keys()], hovering: this.hovers.map((h) => h.find.name), waiting: this.waiting.map((w) => w.name) } };
  }
}
