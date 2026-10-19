/**
 * Machinerra's management-screen kit, the markup half (`manage.css` is the look, `kit.html` shows every piece): small builders that
 * return HTML strings, so a screen is a template of these. They take data (a picture's URL, a `Chip`, a label) and never colours or
 * sizes. Buttons and picks carry `data-act` and their own `data-*`; a screen wires one click handler on its root. Tooltips: pass
 * `tip` (an attribute string from `Tips.add`, `tooltip.ts`).
 *
 * Add a component: its classes in `manage.css`, a builder here, its states on the kit page (`kitpage.ts`).
 */
import type { DamageType } from '../sim/effects';
import type { Quality } from '../sim/gear';
import type { Chip } from './gearwords';
import { G, glyph, typeGlyph } from './glyphs';

export const esc = (s: string | number) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** `data-*` attributes from an object (`{ act: 'fit', key: 'comm.head' }` -> ` data-act="fit" data-key="comm.head"`). */
export const dataAttrs = (d: Record<string, string | number | undefined> = {}) =>
  Object.entries(d).filter(([, v]) => v !== undefined).map(([k, v]) => ` data-${k}="${esc(v!)}"`).join('');

export type FrSize = 'xs' | 's' | 'm' | 'l' | 'xl';
export interface FrOpts { q?: Quality; n?: number; dim?: boolean; tuned?: boolean; tip?: string; cls?: string }
/** A picture in the brass frame (`src` empty: the empty socket's dashed square). `q` puts the quality dot in its corner, `n` a count. */
export function fr(src: string | null | undefined, size: FrSize = 'm', o: FrOpts = {}) {
  const cls = `mg-fr mg-fr--${size}${src ? '' : ' mg-fr--empty'}${o.dim ? ' mg-fr--dim' : ''}${o.cls ? ` ${o.cls}` : ''}`;
  return `<span class="${cls}"${o.q ? ` data-q="${o.q}"` : ''}${o.tip ?? ''}>${src ? `<img src="${src}" alt="" draggable="false">` : ''}${o.n !== undefined && o.n > 1 ? `<span class="mg-fr__n">×${o.n}</span>` : ''}${o.tuned ? `<span class="mg-fr__tuned">${glyph(G.wrench)}</span>` : ''}</span>`;
}

/** A damage type's disc; `tone` up (green: weak to it) or dn (red: resists it). */
export const dt = (type: DamageType, o: { small?: boolean; tone?: 'up' | 'dn'; tip?: string } = {}) =>
  `<span class="mg-dt${o.small ? ' mg-dt--s' : ''}${o.tone ? ` mg-dt--${o.tone}` : ''}"${o.tip ?? ''}>${glyph(typeGlyph(type))}</span>`;

/** The arrow beside a value: up, down or level against what is worn. */
export const arrow = (d: number | undefined) =>
  d === undefined ? '' : `<span class="mg-chip__arrow ${d > 0.001 ? 'mg-up' : d < -0.001 ? 'mg-down' : 'mg-flat'}">${d > 0.001 ? '▲' : d < -0.001 ? '▼' : '·'}</span>`;

/** A stat chip: its glyph (or a damage-type disc) and value; `d` adds the arrow against what is worn. */
export const chipHtml = (c: Chip, o: { d?: number; tip?: string } = {}) =>
  `<span class="mg-chip${c.bad ? ' is-bad' : ''}"${o.tip ?? ''}>${c.type ? dt(c.type, { small: true }) : glyph(c.glyph)}<b>${esc(c.value)}</b>${arrow(o.d)}</span>`;
export const chipsHtml = (cs: Chip[], deltas?: (number | undefined)[]) => `<span class="mg-chips">${cs.map((c, i) => chipHtml(c, { d: deltas?.[i] })).join('')}</span>`;

export interface BtnOpts { main?: boolean; faint?: boolean; on?: boolean; disabled?: boolean; data?: Record<string, string | number | undefined>; tip?: string; cls?: string; small?: string }
/** A button: secondary (iron) by default, `main` the brass one (one per state: attention), `faint` a quiet word. `label` is markup. */
export function btn(label: string, o: BtnOpts = {}) {
  const cls = `mg-btn${o.main ? ' mg-btn--main' : ''}${o.faint ? ' mg-btn--faint' : ''}${o.on ? ' is-on' : ''}${o.cls ? ` ${o.cls}` : ''}`;
  return `<button type="button" class="${cls}"${dataAttrs(o.data)}${o.disabled ? ' disabled' : ''}${o.tip ?? ''}>${label}${o.small ? `<small>${o.small}</small>` : ''}</button>`;
}

/** A rubber stamp: Down, Wreck (red), Fitted (green). */
export const stamp = (text: string, tone: 'red' | 'green' | 'ink' = 'red') => `<span class="mg-stamp mg-stamp--${tone}">${esc(text)}</span>`;
export const keycap = (text: string) => `<span class="mg-key">${esc(text)}</span>`;

/** A resource counter: its picture (a framed one, or a glyph) and value. */
export const counter = (pic: string, value: string | number, tip = '') => `<span class="mg-counter"${tip}>${pic}${esc(value)}</span>`;

/** A drawer group: the brass divider tab, then its rows, or a line saying it is empty. */
export const group = (label: string, body: string, empty: string, note = '') =>
  `<div class="mg-group"><span class="mg-group__tab">${esc(label)}</span>${note ? `<span class="mg-group__note">${note}</span>` : ''}<span class="mg-group__rule"></span></div>${body || `<p class="mg-empty">${empty}</p>`}`;

/** A roster entry: a portrait, the name, a count, a row of state chips (glyph and number). */
export function who(o: { pic: string; name: string; n?: string; state?: string; sel?: boolean; data?: Record<string, string>; tip?: string }) {
  return `<button type="button" class="mg-who mg-stock${o.sel ? ' is-sel' : ''}"${dataAttrs(o.data)}${o.tip ?? ''}>${fr(o.pic, 'm')}<span class="mg-who__name">${esc(o.name)}</span><span class="mg-who__n">${esc(o.n ?? '')}</span><span class="mg-who__state">${o.state ?? ''}</span></button>`;
}

/** A slot plate: the slot's glyph in the corner, the worn item's picture and name, its chips, one line. Empty: a dashed socket and "Nothing worn". */
export function plate(o: { slotGlyph: string; slotTip?: string; pic?: string; q?: Quality; tuned?: boolean; name?: string; chips?: Chip[]; line?: string; sel?: boolean; fresh?: boolean; idle?: boolean; data?: Record<string, string>; tip?: string; cls?: string; extra?: string }) {
  const empty = !o.name;
  const cls = `mg-plate mg-brass${o.sel ? ' is-sel' : ''}${o.fresh ? ' is-new' : ''}${empty ? ' is-empty' : ''}${o.idle ? ' is-idle' : ''}${o.cls ? ` ${o.cls}` : ''}`;
  const corner = `<span class="mg-plate__slot"${o.slotTip ?? ''}>${glyph(o.slotGlyph)}</span>`;
  const body = empty
    ? `${fr(null, 's')}<span class="mg-plate__name">Empty</span><span class="mg-plate__line">Nothing worn</span>`
    : `${fr(o.pic, 's', { q: o.q, tuned: o.tuned })}<span class="mg-plate__name">${esc(o.name!)}</span><span class="mg-plate__stats">${(o.chips ?? []).map((c) => chipHtml(c)).join('')}</span>${o.line ? `<span class="mg-plate__line">${esc(o.line)}</span>` : ''}`;
  // A div acting as a button: a weapon's plate holds its lug buttons, and a button may not hold buttons.
  return `<div role="button" tabindex="0" class="${cls}"${dataAttrs(o.data)}${o.tip ?? ''}>${corner}${body}${o.extra ?? ''}</div>`;
}

/** A shipping tag (an item in a drawer): its picture, name, chips with arrows, a line, a cost row, and its buttons on the right. */
export function tag(o: { pic: string; q?: Quality; name: string; sub?: string; chips?: string; line?: string; cost?: string; acts: string; short?: boolean; tip?: string; drag?: string; cls?: string }) {
  return `<div class="mg-tag${o.short ? ' is-short' : ''}${o.cls ? ` ${o.cls}` : ''}"${o.tip ?? ''}${o.drag ? ` draggable="true" data-drag="${esc(o.drag)}"` : ''}>${fr(o.pic, 'm', { q: o.q })}
    <div class="mg-tag__body"><div class="mg-tag__name">${esc(o.name)}${o.sub ? ` <small>${o.sub}</small>` : ''}</div>${o.chips ?? ''}${o.line ? `<div class="mg-tag__line">${esc(o.line)}</div>` : ''}${o.cost ? `<div class="mg-tag__cost">${o.cost}</div>` : ''}</div>
    <div class="mg-tag__acts">${o.acts}</div></div>`;
}

/** A drawer: its head (a title and a note, its tabs), the list, and a foot (the last action's note). */
export function drawer(o: { title: string; note?: string; tabs?: string; list: string; foot?: string; cls?: string }) {
  return `<div class="mg-drawer mg-well${o.cls ? ` ${o.cls}` : ''}"><div class="mg-drawer__head"><h3>${o.title}</h3>${o.note ? `<span class="mg-drawer__note">${o.note}</span>` : ''}${o.tabs ? `<div class="mg-drawer__tabs" role="tablist">${o.tabs}</div>` : ''}</div>
    <div class="mg-drawer__list">${o.list}</div><div class="mg-drawer__foot">${o.foot ?? ''}</div></div>`;
}
export const drawerTab = (label: string, on: boolean, data: Record<string, string>) => `<button type="button" class="mg-drawer__tab" role="tab" aria-selected="${on}"${dataAttrs(data)}>${esc(label)}</button>`;

/** The note under a drawer: what the last action did, in one typed line (`bad`: why it could not). */
export const note = (html: string, bad = false) => (html ? `<div class="mg-note${bad ? ' is-bad' : ''}">${html}</div>` : '');
