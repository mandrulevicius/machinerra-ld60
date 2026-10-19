/**
 * Results screen: win, lose or level complete, with stat rows that count up and buttons for what comes next.
 *
 *   results(this, {
 *     title: 'Level complete', tone: 'win',
 *     stats: [{ label: 'Score', value: 12450 }, { label: 'Time', value: 192, format: mmss }, { label: 'Coins', value: 128, best: true }],
 *     actions: [{ label: 'Next level', to: 'Play', data: { level: 2 }, primary: true, key: 'N' }, { label: 'Retry', to: 'Play', key: 'R' }, { label: 'Title', run: () => ... }],
 *   });
 *
 * Built only from the UI components' classes (`.ui-results` in harness/ui/components.css, `.ui-panel`, `.ui-stat`, `.ui-btn`, `.ui-key`),
 * so the game's theme restyles it. It goes into `#ui` and is removed when the scene shuts down (scenes rewrite `#ui`).
 * Slot `resultsLayout` (dev sidebar, export into `variants`): center | left | banner.
 *
 * - An action with `to` runs `transition(scene, to, data)` (the `transition` slot); one with `run` calls it. `key` is a
 *   shortcut ('R', 'Enter', 'Escape'), shown as a hint. Escape goes through `onEscape` (escape.ts), so the game menu does not open too.
 * - Rows count up one after another (~1 s for four rows); Enter, Space, Esc or a click skips to the end. The buttons are inert until then,
 *   and for 250 ms after a skip, so a player mashing Space through the last seconds of a level cannot press Retry by accident.
 *   `count: false` or `prefers-reduced-motion` shows the final numbers at once (the buttons still wait 250 ms).
 * - The count runs on the scene's update event: it pauses with the scene and `__game.step(n)` advances it.
 */
import Phaser from 'phaser';
import { slot } from './variants';
import { el, esc, navKeys, sysLayer, typing } from './menu-parts';
import { transition, type TransitionOpts } from './transition';
import { onEscape } from './escape';

export type ResultsLayout = 'center' | 'left' | 'banner';
export const resultsLayoutSlot = slot<ResultsLayout>('resultsLayout', { center: 'center', left: 'left', banner: 'banner' });

export interface ResultStat {
  label: string;
  /** A number counts up; a string is shown as is. */
  value: number | string;
  /** Text for a number (default: thousands separators). `mmss` is provided. */
  format?: (n: number) => string;
  /** Marks the row "New best". */
  best?: boolean;
}

export interface ResultAction {
  label: string;
  /** Go to this scene with a transition (from the results' scene). */
  to?: string;
  data?: object;
  /** Overrides the slot and options of that transition. */
  transition?: TransitionOpts;
  /** Or do something else (runs instead of `to`). */
  run?: () => void;
  primary?: boolean;
  /** Keyboard shortcut: a letter, 'Enter', 'Escape'. */
  key?: string;
}

export interface ResultsOptions {
  title: string;
  /** A line under the title. */
  subtitle?: string;
  /** Colours the title: win (accent), lose (danger). */
  tone?: 'win' | 'lose' | 'neutral';
  stats?: ResultStat[];
  actions: ResultAction[];
  /** Count the numbers up (default true). */
  count?: boolean;
  /** Overrides the slot. */
  layout?: ResultsLayout;
}

export interface Results {
  readonly root: HTMLElement;
  /** Buttons are live. */
  readonly ready: boolean;
  /** Counting is over. */
  readonly counted: boolean;
  /** Jump to the final numbers. */
  skip(): void;
  close(): void;
}

/** Seconds as 3:12. */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const LEAD = 240; // ms before the first row
const STAGGER = 140; // ms between rows
const COUNT = 650; // ms a number takes
const GUARD = 250; // ms the buttons stay inert after the numbers are done
const outCubic = (t: number) => 1 - (1 - t) ** 3;
const plain = (n: number) => Math.round(n).toLocaleString();

export function results(scene: Phaser.Scene, o: ResultsOptions): Results {
  const host: HTMLElement = scene.registry.get('ui') ?? sysLayer(scene.game);
  const stats = o.stats ?? [];
  const animate = (o.count ?? true) && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const text = (s: ResultStat, v: number | string) => (typeof v === 'string' ? esc(v) : (s.format ?? plain)(v));

  const root = el(`<div class="ui-results" data-layout="${o.layout ?? resultsLayoutSlot.value}" data-tone="${o.tone ?? 'neutral'}" role="dialog" aria-label="${esc(o.title)}">
    <div class="ui-results__head"><h1 class="ui-title">${esc(o.title)}</h1>${o.subtitle ? `<p class="ui-heading ui-dim">${esc(o.subtitle)}</p>` : ''}</div>
    ${stats.length ? `<div class="ui-panel ui-results__stats">${stats
      .map((s, i) => `<div class="ui-stat" style="--i:${i}"><span>${esc(s.label)}</span><span>${s.best ? '<span class="ui-results__best">New best</span>' : ''}<span class="ui-stat__value" data-v="${i}">${text(s, typeof s.value === 'number' && animate ? 0 : s.value)}</span></span></div>`)
      .join('')}</div>` : ''}
    <div class="ui-results__actions" inert>${o.actions
      .map((a, i) => `<button class="ui-btn ${a.primary ? 'ui-btn--primary' : 'ui-btn--secondary'}" data-a="${i}">${esc(a.label)}</button>`)
      .join('')}</div>
    <div class="ui-results__hints">${o.actions
      .filter((a) => a.key)
      .map((a) => `<span class="ui-hint"><kbd class="ui-key">${esc(a.key!)}</kbd> ${esc(a.label)}</span>`)
      .join('')}</div>
  </div>`);
  root.style.setProperty('--lead', `${animate ? LEAD : 0}ms`);
  root.style.setProperty('--stagger', `${animate ? STAGGER : 0}ms`);
  host.append(root);
  navKeys(root);

  const offLayout = o.layout ? () => {} : resultsLayoutSlot.on(() => (root.dataset.layout = resultsLayoutSlot.value));
  const actions = root.querySelector<HTMLElement>('.ui-results__actions')!;
  const values = [...root.querySelectorAll<HTMLElement>('[data-v]')];
  const endCount = animate && stats.length ? LEAD + (stats.length - 1) * STAGGER + COUNT : 0;
  let clock = 0;
  let readyAt = Math.max(endCount, 0) + GUARD;
  let live = false;
  let closed = false;

  const draw = () => {
    stats.forEach((s, i) => {
      if (typeof s.value !== 'number') return;
      const t = animate ? Math.min(1, Math.max(0, (clock - LEAD - i * STAGGER) / COUNT)) : 1;
      values[i].textContent = text(s, s.value * outCubic(t));
    });
  };
  const goLive = () => {
    live = true;
    actions.removeAttribute('inert');
    (actions.querySelector<HTMLElement>('.ui-btn--primary') ?? actions.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
  };
  const tick = (_t: number, dt: number) => {
    clock += Math.min(dt, 50);
    draw();
    if (!live && clock >= readyAt) goLive();
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, tick);

  const r: Results = {
    root,
    get ready() { return live; },
    get counted() { return clock >= endCount; },
    skip() {
      if (clock < endCount) clock = endCount;
      readyAt = Math.min(readyAt, clock + GUARD);
      draw();
    },
    close() {
      if (closed) return;
      closed = true;
      offLayout();
      scene.events.off(Phaser.Scenes.Events.UPDATE, tick);
      scene.events.off(Phaser.Scenes.Events.SHUTDOWN, r.close);
      removeEventListener('keydown', onKey, true);
      offEsc();
      root.remove();
    },
  };

  const act = (a: ResultAction) => {
    if (a.run) a.run();
    else if (a.to) transition(scene, a.to, a.data, a.transition);
  };
  // Esc skips the count, then runs the action keyed 'Escape'; through the Esc stack so the game menu does not open as well.
  const offEsc = onEscape(scene, () => {
    if (!live) return r.skip(), true;
    const a = o.actions.find((x) => x.key === 'Escape');
    return a ? (act(a), true) : false;
  });
  actions.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (b && live) act(o.actions[Number(b.dataset.a)]);
  });
  root.addEventListener('pointerdown', () => !live && r.skip());
  // left and right move between the buttons (navKeys has up and down)
  actions.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const all = [...actions.querySelectorAll<HTMLElement>('button')];
    all[(all.indexOf(e.target as HTMLElement) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]?.focus();
    e.preventDefault();
  });

  // Shortcuts, and: before the buttons are live Enter or Space skips the count instead of reaching the game (Esc: onEscape above).
  const onKey = (e: KeyboardEvent) => {
    if (typing() || e.repeat) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!live) {
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        e.stopPropagation();
        r.skip();
      }
      return;
    }
    const a = o.actions.find((x) => x.key && (x.key.length === 1 ? x.key.toLowerCase() : x.key) === k);
    if (a) {
      e.preventDefault();
      e.stopPropagation();
      act(a);
    }
  };
  addEventListener('keydown', onKey, true);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, r.close);
  draw();
  return r;
}
