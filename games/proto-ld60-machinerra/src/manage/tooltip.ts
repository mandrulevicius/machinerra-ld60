/**
 * The three levels of detail (Minos, decisions.md): the screen shows icons with short text; hovering shows a tooltip with more; holding
 * Alt while hovering shows the full details. A tip that has more says so on its last line ("Alt: details", the wording a guess).
 *
 * A screen keeps a `Tips` registry, cleared at each render: `tips.add(more, full?)` returns the attribute to put on the element
 * (` data-tip="t3"`), `tips.text(words)` a plain one. `Tooltip` shows them over a root (the screen's backdrop): one element, moved by
 * the `--tip-x` / `--tip-y` custom properties (the only runtime style the kit sets). The DOM HUD sits inside the scaled canvas, so
 * screen pixels are divided by that scale.
 *
 * The mission (`tipview.ts`) drives it by hand: `dom: false` (its HUD takes no pointer events, and the canvas has no elements) and
 * `point(tip, x, y)` each frame, the tip following the pointer. There a tip shows only while Alt is held (`needAlt`: Alt then shows the
 * hover and the full details together, no hint); in command mode `needAlt` is false, so hover alone shows it and Alt adds more.
 */
import { esc } from './manage';

export interface Tip { more: string; full?: string }

export class Tips {
  private map = new Map<string, Tip>();
  private n = 0;
  clear() {
    this.map.clear();
    this.n = 0;
  }
  /** A tip: `more` (markup) on hover, `full` (markup) added while Alt is held. */
  add(more: string, full?: string) {
    const id = `t${this.n++}`;
    this.map.set(id, { more, full: full || undefined });
    return ` data-tip="${id}"`;
  }
  /** A plain-text tip. */
  text(words: string, full?: string) {
    return this.add(esc(words), full ? `<p>${esc(full)}</p>` : undefined);
  }
  /** A tip under a name of the caller's own (`data-tip="clock"`), replaced as its words change (the mission HUD's). */
  put(id: string, more: string, full?: string) {
    this.map.set(id, { more, full: full || undefined });
    return id;
  }
  get(id: string) {
    return this.map.get(id);
  }
}

/** The hint at the foot of a tip that has more. */
export const ALT_HINT = 'Alt: details';

/** A tip's markup at a level: 2 (hover) or 3 (Alt held). */
export function tipHtml(t: Tip, alt: boolean) {
  if (!t.full) return t.more;
  return alt ? `${t.more}<div class="mg-tip__full">${t.full}</div>` : `${t.more}<div class="mg-tip__alt">${ALT_HINT}</div>`;
}

/** A tip with both levels together: what Alt shows where it is the only gate (the mission, outside command mode). */
const whole = (t: Tip) => (t.full ? `${t.more}<div class="mg-tip__full">${t.full}</div>` : t.more);

export interface TooltipOpts {
  /** Hover over the root's `[data-tip]` elements (default). Off, the owner calls `point` / `hover` itself. */
  dom?: boolean;
  /** `point` shows nothing unless Alt is held, and Alt then shows everything (the mission's rule outside command mode). */
  needAlt?: () => boolean;
}

export class Tooltip {
  readonly el: HTMLDivElement;
  private over: HTMLElement | null = null;
  /** Alt is held (level 3). */
  alt = false;
  private offs: (() => void)[] = [];
  /** What `point` shows now (so the markup is set again only when it changes). */
  private html = '';

  constructor(private root: HTMLElement, private tips: Tips, private o: TooltipOpts = {}) {
    this.el = document.createElement('div');
    this.el.className = 'mg-tip';
    this.el.hidden = true;
    root.append(this.el);
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, k: K, f: (e: HTMLElementEventMap[K]) => void) => {
      t.addEventListener(k, f as EventListener);
      this.offs.push(() => t.removeEventListener(k, f as EventListener));
    };
    if (o.dom !== false) {
      on(root, 'mouseover', (e) => this.hover((e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null));
      on(root, 'mouseleave', () => this.hover(null));
    }
    // Alt alone would move focus to the browser's menu bar: the screen keeps it while a tip can use it.
    on(window, 'keydown', (e) => {
      if (e.key !== 'Alt') return;
      e.preventDefault();
      this.setAlt(true);
    });
    on(window, 'keyup', (e) => e.key === 'Alt' && this.setAlt(false));
    on(window, 'blur', () => this.setAlt(false));
  }

  /** Hold or let go of Alt (the key, or a test). */
  setAlt(on: boolean) {
    if (this.alt === on) return;
    this.alt = on;
    if (this.over) this.show(this.over);
  }

  /**
   * Show a tip at the pointer (screen pixels, `clientX`/`clientY`), or hide it (null). Called every frame by an owner that finds what is
   * under the pointer itself; the markup is rewritten only when it changes.
   */
  point(t: Tip | null, cx: number, cy: number) {
    this.over = null;
    const gated = !!this.o.needAlt?.();
    if (!t || (gated && !this.alt)) {
      this.el.hidden = true;
      this.html = '';
      return;
    }
    const html = gated ? whole(t) : tipHtml(t, this.alt);
    if (html !== this.html) {
      this.html = html;
      this.el.innerHTML = html;
    }
    this.el.hidden = false;
    const box = this.root.getBoundingClientRect();
    const k = box.width / (this.root.offsetWidth || box.width) || 1;
    const W = this.root.offsetWidth, H = this.root.offsetHeight, w = this.el.offsetWidth, h = this.el.offsetHeight;
    let x = (cx - box.left) / k + 16, y = (cy - box.top) / k + 20;
    if (x + w > W - 8) x = (cx - box.left) / k - w - 12;
    if (y + h > H - 8) y = (cy - box.top) / k - h - 12;
    this.el.style.setProperty('--tip-x', `${Math.max(8, x)}px`);
    this.el.style.setProperty('--tip-y', `${Math.max(8, y)}px`);
  }

  /** Show the tip of an element (null hides it). */
  hover(el: HTMLElement | null) {
    this.over = el;
    if (!el) {
      this.el.hidden = true;
      return;
    }
    this.show(el);
  }

  /** The tip shown now, as text (`debugState`, tests). */
  state() {
    return { shown: !this.el.hidden, alt: this.alt, text: this.el.hidden ? '' : this.el.textContent ?? '' };
  }

  /** The page redrew: the element under the pointer may be gone. */
  redrawn() {
    if (this.over && !this.over.isConnected) this.hover(null);
  }

  private show(el: HTMLElement) {
    const t = this.tips.get(el.dataset.tip ?? '');
    if (!t) {
      this.el.hidden = true;
      return;
    }
    this.el.innerHTML = tipHtml(t, this.alt);
    this.el.hidden = false;
    const box = this.root.getBoundingClientRect(), r = el.getBoundingClientRect();
    const k = box.width / (this.root.offsetWidth || box.width) || 1;
    const W = this.root.offsetWidth, H = this.root.offsetHeight;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    let x = (r.left - box.left) / k, y = (r.bottom - box.top) / k + 6;
    // Right of centre (a drawer): beside the thing, to its left, so the list stays readable.
    if (x > W * 0.62) {
      x = (r.left - box.left) / k - w - 10;
      y = (r.top - box.top) / k;
    }
    if (x + w > W - 10) x = W - 10 - w;
    if (y + h > H - 8) y = (r.top - box.top) / k - h - 6;
    this.el.style.setProperty('--tip-x', `${Math.max(8, x)}px`);
    this.el.style.setProperty('--tip-y', `${Math.max(8, y)}px`);
  }

  destroy() {
    this.offs.forEach((f) => f());
    this.el.remove();
  }
}
