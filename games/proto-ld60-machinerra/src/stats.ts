/**
 * The stats screen (P27, systems.md "UI"): the inventory's Stats tab, aboard and on the sands. Pick the Communicator, a robot
 * type or a robot of yours; each stat that something changes is a row with its final value, its base and every contribution
 * (gear with its quality, relic, spec, punch card, title, rescue passive, building, and in a mission statuses with their seconds
 * left); each damage type has your chance to apply its status and what touches it. Hovering any entry lights the same thing
 * everywhere it appears, including in the "what is on it" list that says where it lives (the slot, the socket, the title).
 * Lists only. The rows are built by `statsrows.ts` from `fx.explain` and tested there; this draws them as DOM in the
 * inventory's body (`inventory.ts` hands it the subjects from its host: `statsunit.ts`).
 */
import { icon } from '../../../harness/ui';
import { ITEMS, QUALITIES, type ItemId, type Quality } from './sim/gear';
import { iconUrl } from './gearart';
import { gear } from './hub/carry';
import { titleSave } from './hub/talkslice';
import { roster } from './hub/workshop';
import type { Sim } from './sim/sim';
import { offlineSubjects, subjectOf, type Build } from './statsunit';
import { GROUPS, fitted, rowText, showValue, statRows, typeRows, type Fitted, type Group, type Part, type Row, type Subject, type TypeRow } from './statsrows';
import './stats.css';

/** A kind's placeholder icon (`npm run icons`, `public/icons/`) and its role colour. Gear shows the item's own art instead. */
const KIND_ICON: Record<Group, [string, string]> = {
  gear: ['cog', ''], mod: ['cog', 'accent'], relic: ['toaster', 'warn'], spec: ['wrench', 'accent'], type: ['robot-golem', ''], research: ['scroll-unfurled', 'arcane'],
  title: ['crown', 'accent'], rescue: ['hand-bandage', 'good'], building: ['brick-wall', ''], trait: ['evil-hand', 'danger'], other: ['cog', ''], status: ['hourglass', 'frost'],
};
/** Stats where more is worse: a green or red sign follows what it means, not just its direction. */
const LESS_IS_BETTER = /^(damageTaken|steamCost|auraBurnTaken|auraSlowTaken)/;

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const secs = (n: number) => `${n.toFixed(1)} s`;

export class StatsView {
  /** The picked subject's key (`comm`, `type:guard`, `bot:<uid>`); the first one when it is gone. */
  pick = 'comm';

  state() {
    return { pick: this.pick };
  }

  private art(group: Group, key: string): string {
    const id = (group === 'mod' ? key.replace(/^mod:/, '') : key) as ItemId;
    if ((group === 'gear' || group === 'mod') && ITEMS[id]) return `<img class="st-ico" src="${iconUrl(id)}" alt="">`;
    return icon(...KIND_ICON[group]);
  }

  private part(p: Part, stat: string): string {
    const dir = Math.sign(p.pct || p.add || p.more - 1) * (LESS_IS_BETTER.test(stat) ? -1 : 1);
    const q = p.quality && QUALITIES[p.quality as Quality] ? ` q-${p.quality}` : '';
    const name = esc(p.name) + (p.stacks && p.stacks > 1 ? ` <i>x${p.stacks}</i>` : '');
    return `<li class="st-part${q}" data-key="${esc(p.key)}" title="${GROUPS[p.group]}${p.aura ? ", from a friend's aura" : ''}">
      ${this.art(p.group, p.key)}<span class="st-part__name">${name}${p.quality && p.quality !== 'standard' ? `<small>${QUALITIES[p.quality as Quality]?.name ?? ''}</small>` : ''}${p.aura ? '<small>aura</small>' : ''}${p.left !== undefined ? `<small>${secs(p.left)} left</small>` : ''}</span>
      <b class="${dir > 0 ? 'is-good' : dir < 0 ? 'is-bad' : ''}">${esc(p.text)}</b></li>`;
  }

  private row(r: Row): string {
    const changed = Math.abs(r.value - r.base) > 1e-9;
    return `<section class="st-row" data-stat="${esc(r.stat)}">
      <header><h4>${esc(r.label)}${r.note ? ` <small>${esc(r.note)}</small>` : ''}</h4>
        <span class="st-value">${changed ? `<s>${showValue(r.shape, r.base)}</s> ` : ''}<b>${showValue(r.shape, r.value)}</b></span></header>
      <ul>${r.parts.map((p) => this.part(p, r.stat)).join('')}</ul></section>`;
  }

  private type(t: TypeRow): string {
    const touches = t.touches.length
      ? `<ul>${t.touches.map((x) => `<li class="st-part${x.part.quality ? ` q-${x.part.quality}` : ''}" data-key="${esc(x.part.key)}" title="${GROUPS[x.part.group]}">${this.art(x.part.group, x.part.key)}<span class="st-part__name">${esc(x.part.name)}<small>${esc(x.what)}</small></span><b>${esc(x.part.text)}</b></li>`).join('')}</ul>`
      : '';
    const pct = (n: number) => `${Math.round(n * 100)}%`;
    return `<section class="st-type st-type--${t.type}"><header><h4>${esc(t.name)}</h4>
      <span class="st-value" title="Chance a hit of ${t.name} applies ${esc(t.status)}: a hit of 20 or more has the second chance">${esc(t.status)} <b>${pct(t.chance)}</b>${t.chanceBig !== t.chance ? ` <small>${pct(t.chanceBig)} on big hits</small>` : ''}</span></header>${touches}</section>`;
  }

  private fit(f: Fitted): string {
    const q = f.quality ? ` q-${f.quality}` : '';
    return `<li class="st-part${q}" data-key="${esc(f.key)}">${this.art(f.group, f.key)}<span class="st-part__name">${esc(f.name)}${f.stacks ? ` <i>x${f.stacks}</i>` : ''}<small>${esc(f.where || GROUPS[f.group])}${f.left !== undefined ? `, ${secs(f.left)} left` : ''}</small></span></li>`;
  }

  /** The tab's three columns. */
  body(subjects: Subject[]): string {
    if (!subjects.length) return '<div class="inv__col"><p class="inv__dim">Nothing to read yet.</p></div>';
    const s = subjects.find((x) => x.key === this.pick) ?? subjects[0];
    this.pick = s.key;
    const chip = (x: Subject) => `<button class="inv-chip ${x.key === s.key ? 'is-on' : ''}" data-a="who" data-v="${esc(x.key)}" title="${esc(x.sub ?? '')}">${esc(x.label)}</button>`;
    const types = subjects.filter((x) => x.key.startsWith('type:'));
    const bots = subjects.filter((x) => x.key.startsWith('bot:'));
    const rows = statRows(s);
    const on = fitted(s);
    return `
      <div class="inv__col st-who">
        <div class="st-pick">${chip(subjects[0])}</div>
        ${types.length ? `<h3 class="inv__h">Robot types</h3><div class="st-pick">${types.map(chip).join('')}</div>` : ''}
        ${bots.length ? `<h3 class="inv__h">Your robots</h3><div class="st-pick">${bots.map(chip).join('')}</div>` : ''}
        <h3 class="inv__h">On ${esc(s.label)}</h3>
        ${s.key.startsWith('type:') ? '<p class="inv__dim">What every one of them wears. Pick a robot of yours to add its rank, spec and relic.</p>' : ''}
        ${s.live ? '' : '<p class="inv__dim">Aboard, your crew counts as standing beside you: their auras show.</p>'}
        <ul class="st-list">${on.map((f) => this.fit(f)).join('') || '<li class="inv__dim">Nothing worn.</li>'}</ul>
      </div>
      <div class="inv__col st-rows">
        <h3 class="inv__h">${esc(s.label)}${s.live ? ' <small class="inv__dim">in this mission, now</small>' : ''}</h3>
        ${rows.map((r) => this.row(r)).join('') || `<p class="inv__dim">Nothing changes ${esc(s.label)}'s stats yet. Wear gear, earn a title or fit a relic and it shows here.</p>`}
      </div>
      <div class="inv__col st-types">
        <h3 class="inv__h">Damage types</h3>
        <p class="inv__dim">Your chance to apply each status, and what touches it. Hover an entry to see where it lives.</p>
        ${typeRows(s).map((t) => this.type(t)).join('')}
      </div>`;
  }

  /** The picked subject (`who`: a key or a name, else the current pick) as text, for the dev command `stats`. */
  report(subjects: Subject[], who?: string): string {
    const w = who?.toLowerCase();
    const s = (w && subjects.find((x) => x.key.toLowerCase() === w || x.label.toLowerCase() === w || x.key.toLowerCase().endsWith(`:${w}`))) || subjects.find((x) => x.key === this.pick) || subjects[0];
    if (!s) return 'nothing to read';
    this.pick = s.key;
    const rows = statRows(s).map(rowText);
    const types = typeRows(s).map((t) => `${t.name}: ${t.status} ${Math.round(t.chance * 100)}%/${Math.round(t.chanceBig * 100)}%${t.touches.length ? ` <- ${t.touches.map((x) => `${x.part.name} ${x.part.text}`).join(', ')}` : ''}`);
    return [`${s.label}${s.live ? ' (live)' : ''}; on it: ${fitted(s).map((f) => f.name).join(', ') || 'nothing'}`, ...rows, '-- damage types', ...types].join('\n');
  }

  /** Hovering an entry lights it everywhere it appears (the row, the damage types, the "on it" list). */
  hover(root: HTMLElement, e: Event, on: boolean) {
    const k = (e.target as HTMLElement).closest?.('[data-key]') as HTMLElement | null;
    if (!k) return;
    root.querySelectorAll('.is-lit').forEach((x) => x.classList.remove('is-lit'));
    if (!on) return;
    for (const x of root.querySelectorAll<HTMLElement>('[data-key]')) if (x.dataset.key === k.dataset.key) x.classList.add('is-lit');
  }
}

/** What the saves hold of the build, for `offlineSubjects` (a robot left on the sands as a wreck is not read). */
export const savedBuild = (): Build => {
  const r = roster.get();
  return { gear: gear.get(), earned: titleSave.get().earned, chassis: r.chassis, robots: r.bots.filter((b) => !b.wreck) };
};

/** The Stats tab aboard: everything from the saves. */
export const hubSubjects = (): Subject[] => offlineSubjects(savedBuild());

/**
 * The Stats tab in a mission: the Communicator and every robot in the field are the Sim's own units (their statuses and the
 * auras round them are real); the robot types are the saves' (gear only).
 */
export function missionSubjects(sim: Sim): Subject[] {
  const b = savedBuild();
  const off = offlineSubjects({ ...b, robots: [] });
  const weapons = [sim.weapon, ...(sim.secondary ? [sim.secondary] : [])];
  const comm = subjectOf(sim.engine, sim.controller, { key: 'comm', label: 'The Communicator', role: 'controller', gear: b.gear, weapons, live: true });
  const bots = sim.bots
    .filter((x) => x.role !== 'controller' && !x.dead && !x.ttl && !x.place)
    .map((x) => subjectOf(sim.engine, x, { key: `bot:${x.uid ?? `s${x.id}`}`, label: x.name, sub: x.role, role: x.role, gear: b.gear, live: true }));
  return [comm, ...off.filter((x) => x.key.startsWith('type:')), ...bots];
}
