/**
 * The quest log (J), in a mission and aboard: every quest begun, met, waiting to be taken up or done, its steps, the
 * count of the current one and the title it earns; the titles earned below. DOM over the canvas from the kit's components
 * (`.ui-panel`, `.ui-btn`), like the inventory. The contents are `journal()` (`hub/journal.ts`); the scene owns the key
 * (J) and Esc, and pauses a mission while it is open.
 */
import { command } from '../../../harness/dev/commands';
import { promptHtml } from '../../../harness/kit';
import type { Journal, JournalEntry } from './hub/journal';
import './questlog.css';

export interface QuestLogHost {
  /** The log as it stands (a mission passes its stats so far). */
  data(): Journal;
  /** On the sands, counts wait for the lift. */
  where: 'hub' | 'mission';
  sound(k: 'open' | 'close' | 'click'): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const GROUPS: [string, (e: JournalEntry) => boolean][] = [
  ['Ready to hand in', (e) => e.ready],
  ['Underway', (e) => e.state === 'active' && !e.ready && !e.locked],
  ['Waiting on the story', (e) => e.state === 'active' && !e.ready && !!e.locked],
  ['To take up', (e) => e.state === 'available'],
  ['Done', (e) => e.state === 'done'],
];

export class QuestLog {
  open = false;
  /** The quest shown on the right (the first in the list when none is picked). */
  pick: string | null = null;
  private el: HTMLElement | null = null;

  constructor(private root: HTMLElement, private host: QuestLogHost) {}

  toggle() {
    if (this.open) this.hide();
    else this.show();
  }

  show(pick?: string) {
    if (pick) this.pick = pick;
    if (!this.open) this.host.sound('open');
    this.open = true;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'ui-backdrop ql-backdrop';
      this.el.addEventListener('click', (e) => this.click(e));
      this.root.appendChild(this.el);
    }
    this.render();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.host.sound('close');
    this.el?.remove();
    this.el = null;
  }

  /** For `debugState()` and the dev command. */
  state() {
    const j = this.host.data();
    return { open: this.open, pick: this.shown(j)?.id ?? null, quests: j.entries.map((e) => ({ id: e.id, state: e.ready ? 'ready' : e.locked ? 'locked' : e.state, ...(e.line && { line: e.line }), step: e.step, ...(e.progress && { progress: `${e.progress.have}/${e.progress.n}` }) })), titles: j.titles.map((t) => t.id) };
  }

  private shown(j: Journal) {
    return j.entries.find((e) => e.id === this.pick) ?? j.entries[0];
  }

  private click(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!t) {
      if (e.target === this.el) this.hide(); // a click on the backdrop
      return;
    }
    if (t.dataset.a === 'close') this.hide();
    else if (t.dataset.a === 'pick') {
      this.pick = t.dataset.v ?? null;
      this.host.sound('click');
      this.render();
    }
  }

  private render() {
    if (!this.el) return;
    // A scene's HUD can rewrite the UI root under us: hang back on.
    if (!this.el.isConnected) this.root.appendChild(this.el);
    const j = this.host.data();
    const cur = this.shown(j);
    const list = GROUPS.map(([name, f]) => {
      const es = j.entries.filter(f);
      if (!es.length) return '';
      return `<h3 class="ql__h">${name}</h3>${es.map((e) => this.row(e, e === cur)).join('')}`;
    }).join('');
    this.el.innerHTML = `
      <div class="ui-panel ql" role="dialog" aria-label="Quest log">
        <div class="ql__head">
          <h2 class="ui-heading ql__title">Quest log</h2>
          <button class="ui-btn ui-btn--faint ql__close" data-a="close">${promptHtml('{journal}')} Close</button>
        </div>
        <div class="ql__body">
          <div class="ql__list">${list || '<p class="ql__empty">No quests yet. The Oracle has words for you.</p>'}</div>
          <div class="ql__detail">${cur ? this.detail(cur) : ''}</div>
        </div>
        ${this.titles(j)}
      </div>`;
  }

  private row(e: JournalEntry, on: boolean) {
    const sub = e.state === 'available' ? `Ask ${e.giver}` : e.state === 'done' ? 'Done' : e.ready ? `Talk to ${e.giver}` : e.locked ? 'Not open yet' : e.progress ? `${e.progress.have}/${e.progress.n}` : `Step ${e.step} of ${e.steps.length}`;
    return `<button class="ql-row ${on ? 'is-selected' : ''} ql-row--${e.ready ? 'ready' : e.state} ${e.kind === 'main' ? 'ql-row--main' : ''}" data-a="pick" data-v="${e.id}">
      <b>${esc(e.title)}</b><small>${esc(sub)}</small></button>`;
  }

  private detail(e: JournalEntry) {
    const p = e.progress;
    const bar = p && !e.locked
      ? `<div class="ql-bar" title="${p.have}/${p.n}"><i style="width:${(100 * p.have) / p.n}%"></i>${p.pending ? `<i class="ql-bar__pending" style="width:${(100 * p.pending) / p.n}%"></i>` : ''}</div>
         <p class="ql__count"><b>${p.have}/${p.n}</b>${p.pending ? ` <span class="ql__pending">+${p.pending} this run, counted once you ride the lift home</span>` : ''}</p>`
      : '';
    const what =
      e.state === 'available'
        ? `<p class="ql__note">${esc(e.giver)} has work: ${e.kind === 'main' ? 'talk to them to begin.' : 'ask them "Any work for me?"'}</p>`
        : e.ready
          ? `<p class="ql__note ql__note--ready">Done: talk to ${esc(e.giver)} to hand it in.</p>`
          : e.locked
            ? `<p class="ql__note">Not open yet. Ask ${esc(e.giver)} what it waits for.</p>`
            : '';
    const steps = e.steps
      .map((s) => `<li class="ql-step ql-step--${s.state}"><span class="ql-step__mark">${s.state === 'done' ? '&#10003;' : s.state === 'current' ? '&#9656;' : '&middot;'}</span>${esc(s.text)}</li>`)
      .join('');
    const reward = e.grants ? `<p class="ql__reward">Earns the title <b>${esc(e.grants.name)}</b>${e.grants.earned ? ' (earned)' : ''}<br><span>${esc(e.grants.passive)}</span></p>` : '';
    return `
      <p class="ql__kind">${e.kind === 'main' ? 'Main quest' : e.line === 'story' ? 'Story line' : e.line === 'ladder' ? 'Mastery ladder' : 'Side quest'} &middot; ${esc(e.giver)}</p>
      <h3 class="ql__name">${esc(e.title)}</h3>
      ${what}
      ${bar}
      <ol class="ql__steps">${steps}</ol>
      ${reward}`;
  }

  private titles(j: Journal) {
    if (!j.titles.length) return '';
    return `<div class="ql__titles"><span class="ql__h">Titles</span>${j.titles
      .map((t) => `<span class="ql-title ${t.worn ? 'is-worn' : ''}" title="${esc(t.passive)}">${esc(t.name)}${t.worn ? ' (worn)' : ''}</span>`)
      .join('')}${this.host.where === 'hub' ? '<span class="ql__dim">Click the name plate to wear another.</span>' : ''}</div>`;
  }
}

/** `quests [<id>|close]`: open the log (on a quest) or close it; prints its state. Returns the unregister function. */
export function questLogCommand(log: QuestLog) {
  return command('quests', ([id]) => {
    if (id === 'close') log.hide();
    else log.show(id);
    return JSON.stringify(log.state());
  }, 'quests [<id>|close]: open the quest log (on a quest) or close it; shows every quest, its state and count', { group: 'quest', args: () => [...log.state().quests.map((q) => q.id), 'close'] });
}
