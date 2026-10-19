/**
 * The Oracle's guide on screen (P28; the rules and entries are `guide.ts`). A scene makes one `Guide` with a `GuideHost`, calls
 * `update(dt)` every frame it runs and `toggle()` on the `guide` action (H); the Esc menu's entry reaches the live one through
 * `openGuide()`. Open, it is a panel over the scene (the scene pauses a mission while `open`, like the quest log); picking a row
 * closes it and points at the thing: a brass pointer and a pulse ring for `GUIDE.pointS` seconds, the line on the tape. The tape
 * is also the unprompted line, with its "Show me" lever. DOM over the canvas, laid out in game pixels like the rest of `#ui`.
 */
import { command } from '../../../harness/dev/commands';
import { promptHtml } from '../../../harness/kit';
import { GUIDE, did, dueNow, guideSave, offered, type Cue, type GuideEntry, type Where } from './guide';
import './guide.css';

/** A rectangle in game pixels (the 1280 x 720 stage `#ui` is laid out in). */
export interface Box { x: number; y: number; w: number; h: number }

export interface GuideHost {
  where: Where;
  /** The UI root: the HUD's elements are looked up in it and the guide's own are added to it. */
  root: HTMLElement;
  /** The entries for what is aboard now (`entriesFor`). */
  entries(): GuideEntry[];
  cue(): Cue;
  /** A thing in the world as a screen spot in game pixels with a radius, or null (a `{ world }` anchor). */
  spot(key: string): { x: number; y: number; r: number } | null;
  /** A fine moment for an unprompted line: nothing modal, nobody talking, the mission running. */
  idle(): boolean;
  /** The guide may open now (not over the inventory, a conversation, the results). */
  canOpen(): boolean;
  /** The scene's first chance to tidy up before the panel opens (close the map). */
  opening?(): void;
  sound(k: 'open' | 'close' | 'click'): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const ARROW = '<svg viewBox="0 0 40 58" width="40" height="58" aria-hidden="true"><path d="M20 2 L38 26 H27 V54 H13 V26 H2 Z" fill="var(--brass-hi, #f0cf7a)" stroke="#1d1a17" stroke-width="3" stroke-linejoin="round"/><path d="M20 9 L31 23 H23 V50 H17 V23 H9 Z" fill="var(--brass, #c8963c)" opacity="0.55"/></svg>';

/** The Back button of a standard pad. */
const PAD_BACK = 8;
const padBack = () => {
  try {
    return Array.from(navigator.getGamepads?.() ?? []).some((p) => p?.buttons[PAD_BACK]?.pressed);
  } catch {
    return false;
  }
};

let active: Guide | null = null;
/** The Esc menu's entry: open the guide of the scene that is running (none: nothing). */
export const openGuide = () => active?.show();

export class Guide {
  open = false;
  private back: HTMLElement | null = null;
  private point: { el: HTMLElement; ring: HTMLElement; arrow: HTMLElement; entry: GuideEntry; t: number } | null = null;
  private tape: HTMLElement;
  private typing: { html: string; plain: string; shown: number } | null = null;
  private tapeEntry: GuideEntry | null = null;
  private tapeT = 0;
  /** The tape is an unprompted line waiting for an answer (its levers show). */
  private asking = false;
  /** Seconds of the scene that have run, and since an unprompted line was last shown (a fresh scene waits `settleS`). */
  private t = 0;
  private since = GUIDE.gapS;
  private check = 0;
  private padT = 0;
  private padDone = false;

  constructor(private host: GuideHost) {
    this.tape = document.createElement('div');
    this.tape.className = 'mc-oracle gd-tape';
    this.tape.innerHTML = `<div class="mc-oracle__eye"><i></i></div>
      <div class="mc-oracle__col"><div class="mc-oracle__name">The Oracle</div><div class="mc-oracle__text" data-r="text"></div>
        <div class="gd-tape__act"><button class="ui-btn ui-btn--primary" data-a="show">Show me</button><button class="ui-btn ui-btn--faint" data-a="dismiss">Not now</button></div></div>`;
    this.tape.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'show' && this.tapeEntry) this.pointAt(this.tapeEntry);
      else if (a === 'dismiss') this.hideTape();
    });
    host.root.appendChild(this.tape);
    active = this;
  }

  destroy() {
    this.hide(true);
    this.clearPoint();
    this.tape.remove();
    if (active === this) active = null;
  }

  // ---- what is on screen ----

  /** The stage's size in its own pixels and the factor from screen pixels. */
  private stage() {
    const r = this.host.root.getBoundingClientRect();
    const w = this.host.root.offsetWidth || 1280, h = this.host.root.offsetHeight || 720;
    return { left: r.left, top: r.top, k: r.width ? r.width / w : 1, w, h };
  }

  /** An element's box in game pixels when it can be seen (shown, not hidden or transparent, inside the stage), else null. */
  private boxOf(el: Element): Box | null {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.2) return null;
    const s = this.stage();
    const b = { x: (r.left - s.left) / s.k, y: (r.top - s.top) / s.k, w: r.width / s.k, h: r.height / s.k };
    return b.x + b.w < 0 || b.y + b.h < 0 || b.x > s.w || b.y > s.h ? null : b;
  }

  /** Where an entry is on screen now, or null: its first anchor that is. */
  where(e: GuideEntry): Box | null {
    if ('world' in e.at) {
      const p = this.host.spot(e.at.world);
      const s = this.stage();
      if (!p || p.x < 0 || p.y < 0 || p.x > s.w || p.y > s.h) return null;
      return { x: p.x - p.r, y: p.y - p.r, w: 2 * p.r, h: 2 * p.r };
    }
    for (const sel of e.at.dom) {
      for (const el of Array.from(this.host.root.querySelectorAll(sel))) {
        if (el.closest('.gd-tape, .gd-back, .gd-point')) continue;
        const b = this.boxOf(el);
        if (b) return b;
      }
    }
    return null;
  }

  /** The entries that can be pointed at right now. */
  listed() {
    return this.host.entries().filter((e) => this.where(e));
  }

  // ---- the panel ----

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show() {
    if (this.open || !this.host.canOpen()) return;
    this.host.opening?.();
    this.hideTape();
    this.clearPoint();
    this.open = true;
    this.host.sound('open');
    const back = (this.back = document.createElement('div'));
    back.className = 'ui-backdrop gd-back';
    back.addEventListener('click', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (row?.dataset.a === 'pick') {
        const entry = this.host.entries().find((x) => x.id === row.dataset.v);
        this.hide();
        if (entry) this.pointAt(entry);
      } else if (!row && e.target === back) this.hide();
      else if (row?.dataset.a === 'close') this.hide();
    });
    const rows = this.listed();
    back.innerHTML = `<div class="ui-panel gd" role="dialog" aria-label="The Oracle's guide">
      <div class="gd__head"><h2 class="ui-heading gd__title">The Oracle's guide</h2><button class="ui-btn ui-btn--faint" data-a="close">${promptHtml('{guide}')} Close</button></div>
      <p class="gd__sub">Pick one and I will point at it.</p>
      <div class="gd__list">${rows.map((e) => `<button class="gd-row" data-a="pick" data-v="${e.id}"><b>${esc(e.name)}</b><span>${promptHtml(e.line)}</span></button>`).join('') || '<p class="gd__empty">Nothing on screen to point at.</p>'}</div>
    </div>`;
    this.host.root.appendChild(back);
    (back.querySelector('.gd-row') as HTMLElement | null)?.focus();
  }

  hide(quiet = false) {
    if (!this.open) return;
    this.open = false;
    if (!quiet) this.host.sound('close');
    this.back?.remove();
    this.back = null;
  }

  // ---- pointing and the tape ----

  /** Point at an entry: the pointer and its ring for `pointS` seconds, its line on the tape. Not on screen: only the line. */
  pointAt(e: GuideEntry) {
    this.clearPoint();
    this.say(e, false);
    this.tapeT = Math.max(GUIDE.pointS, 2 + e.line.length * 0.05);
    this.host.sound('click');
    if (!this.where(e)) return;
    const el = document.createElement('div');
    el.className = 'gd-point';
    el.innerHTML = `<i class="gd-ring"></i><i class="gd-arrow">${ARROW}</i>`;
    this.host.root.appendChild(el);
    this.point = { el, ring: el.firstElementChild as HTMLElement, arrow: el.lastElementChild as HTMLElement, entry: e, t: GUIDE.pointS };
    this.place();
  }

  private clearPoint() {
    this.point?.el.remove();
    this.point = null;
  }

  /** Follow the target (a bar changes size, the camera moves past a station): ring round it, the arrow on the side with room. */
  private place() {
    const p = this.point;
    if (!p) return;
    const b = this.where(p.entry);
    p.el.style.visibility = b ? '' : 'hidden';
    if (!b) return;
    const s = this.stage();
    const pad = 6;
    Object.assign(p.ring.style, { left: `${b.x - pad}px`, top: `${b.y - pad}px`, width: `${b.w + 2 * pad}px`, height: `${b.h + 2 * pad}px` });
    // The side with room for the arrow (66 px), below first, then above, right, left.
    const room = { below: s.h - (b.y + b.h), above: b.y, right: s.w - (b.x + b.w), left: b.x };
    const side = (['below', 'above', 'right', 'left'] as const).find((k) => room[k] >= 74) ?? 'below';
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, gap = pad + 4;
    const tip = { below: [cx, b.y + b.h + gap], above: [cx, b.y - gap], right: [b.x + b.w + gap, cy], left: [b.x - gap, cy] }[side];
    const turn = { below: 0, above: 180, right: -90, left: 90 }[side];
    Object.assign(p.arrow.style, { left: `${tip[0]}px`, top: `${tip[1]}px`, transform: `rotate(${turn}deg)` });
  }

  private say(e: GuideEntry, ask: boolean) {
    this.tapeEntry = e;
    this.asking = ask;
    const html = promptHtml(e.line);
    this.typing = ask ? { html, plain: html.replace(/<[^>]+>/g, ''), shown: 0 } : null;
    const text = this.tape.querySelector('[data-r="text"]') as HTMLElement;
    if (ask) text.textContent = '';
    else text.innerHTML = html;
    this.tape.classList.toggle('is-asking', ask);
    this.tape.classList.add('is-on');
    this.tape.classList.remove('is-quiet');
    this.tapeT = ask ? GUIDE.hintS : 0;
    this.since = 0;
  }

  private hideTape() {
    this.tape.classList.remove('is-on', 'is-asking');
    this.typing = null;
    this.asking = false;
    this.tapeEntry = null;
  }

  // ---- every frame ----

  /** Counts the scene's running time, ends the pointer and the tape, makes the unprompted offer, reads the pad's Back. */
  update(dt: number) {
    this.t += dt;
    this.since += dt;
    this.pad(dt);
    if (this.typing) {
      const ty = this.typing;
      ty.shown += dt * 55;
      const text = this.tape.querySelector('[data-r="text"]') as HTMLElement;
      if (ty.shown >= ty.plain.length) {
        text.innerHTML = ty.html;
        this.typing = null;
      } else text.textContent = ty.plain.slice(0, Math.floor(ty.shown));
    }
    if (this.point) {
      this.point.t -= dt;
      this.point.el.classList.toggle('is-out', this.point.t < 0.4);
      if (this.point.t <= 0) this.clearPoint();
      else this.place();
    }
    if (this.tapeEntry && this.tapeT > 0) {
      this.tapeT -= dt;
      if (this.tapeT <= 0) this.hideTape();
    }
    // A scene's HUD may rewrite the UI root under us (the hub's): hang back on.
    if (!this.tape.isConnected) this.host.root.appendChild(this.tape);
    this.check += dt;
    if (this.check < 1) return;
    this.check = 0;
    this.offer();
  }

  /** Back held on a pad opens the guide (a tap is the map). */
  private pad(dt: number) {
    if (!padBack()) {
      this.padT = 0;
      this.padDone = false;
      return;
    }
    this.padT += dt;
    if (this.padT >= GUIDE.padHoldS && !this.padDone) {
      this.padDone = true;
      this.show();
    }
  }

  /** The unprompted line: one whose condition holds, not yet offered, with something on screen to point at. */
  private offer() {
    if (this.open || this.point || this.tapeEntry || !this.host.idle() || this.t < GUIDE.settleS || this.since < GUIDE.gapS) return;
    const st = guideSave.get();
    const e = dueNow(this.host.entries().filter((x) => this.where(x)), this.host.cue(), st);
    if (e) this.offerNow(e);
  }

  /** Offer an entry unprompted now, whatever its condition (the dev command and `offer`): it is marked offered at once. */
  offerNow(e: GuideEntry) {
    guideSave.set(offered(guideSave.get(), e.id));
    this.say(e, true);
    this.host.sound('open');
  }

  /** The player did a thing the cues ask about (`GuideState.used`). */
  note(what: string) {
    const s = guideSave.get();
    if (!s.used.includes(what)) guideSave.set(did(s, what));
  }

  /** For `debugState()` and the dev command. */
  state() {
    const s = guideSave.get();
    return { open: this.open, pointing: this.point?.entry.id ?? null, tape: this.tapeEntry ? { id: this.tapeEntry.id, asking: this.asking } : null, listed: this.listed().map((e) => e.id), hints: s.hints, seen: s.seen, used: s.used };
  }

  /** `guide [list|open|close|point <id>|hint <id>|hints on|off|reset]`. */
  commands() {
    return command('guide', ([sub = 'list', id, arg]) => {
      const e = this.host.entries().find((x) => x.id === id);
      switch (sub) {
        case 'open': this.show(); break;
        case 'close': this.hide(); break;
        case 'point': if (!e) return `error: no entry ${id}`; this.pointAt(e); break;
        case 'hint': if (!e) return `error: no entry ${id}`; this.offerNow(e); break;
        case 'hints': guideSave.set({ ...guideSave.get(), hints: id !== 'off' }); break;
        case 'reset': guideSave.set({ hints: true, seen: [], used: [] }); break;
        case 'list': break;
        default: return `error: guide [list|open|close|point <id>|hint <id>|hints on|off|reset] ${arg ?? ''}`;
      }
      return JSON.stringify(this.state());
    }, 'guide [list|open|close|point <id>|hint <id>|hints on|off|reset]: the Oracle\'s guide: what is listed now; point at an entry; make its unprompted offer; turn the unprompted lines on or off; forget what was offered and done', { group: 'guide', args: () => ['list', 'open', 'close', 'point', 'hint', 'hints', 'reset'] });
  }
}

/** The Options tab: the unprompted lines on or off (`bootGame`'s `tabs`). */
export function guideTab(): HTMLElement {
  const root = document.createElement('div');
  root.className = 'ui-stack';
  root.innerHTML = `<label class="ui-field"><span>The Oracle's unprompted hints</span><span class="ui-toggle"><input type="checkbox" aria-label="The Oracle's unprompted hints" ${guideSave.get().hints ? 'checked' : ''}><span class="ui-toggle__track"></span></span></label>
    <p class="ui-note">When a thing goes unused, the Oracle offers one line about it, once, with a Show me lever. The guide itself stays on the Esc menu.</p>`;
  root.querySelector('input')!.addEventListener('change', (e) => guideSave.set({ ...guideSave.get(), hints: (e.target as HTMLInputElement).checked }));
  return root;
}
