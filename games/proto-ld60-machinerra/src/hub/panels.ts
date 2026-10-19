/**
 * The hub's DOM HUD: the room, the stores, the prompt for what is in reach, a speaker panel in the Oracle's style for NPC
 * lines, banners, and the frame every station panel opens in (kit `.ui-backdrop` / `.ui-panel` / `.ui-btn`, restyled by the
 * machinerra theme). A station's own panel body lives in its file, `stations/<id>.ts`; the shared helpers are `esc` and `tabbed`.
 */
import { promptHtml } from '../../../../harness/kit';
import { Fader } from '../attention';
import type { HubState } from './state';
import { capExtraOf, economy, spareCap } from './economy';
import { riders, roster } from './workshop';

export const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

export class HubHud {
  private q: (k: string) => HTMLElement;
  private typing: { html: string; plain: string; shown: number } | null = null;
  private quietT = 0;
  /** Attention (P33): the room's name rests and comes forward when the room changes; the stores rest, and come forward for a haul (`storesUp`) or the pointer. */
  private fade = { where: new Fader(), stores: new Fader() };
  panel: HTMLElement | null = null;
  panelKind: string | null = null;

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="mc-hud hb-hud">
        <div class="hb-where" data-k="where">${[
          '<div class="hb-where__ship">Zeppelin Wanderer</div>',
          '<div class="hb-where__room" data-k="room"></div>',
          '<button class="hb-where__me" data-k="me"></button>',
        ].join('')}</div>
        <div class="hb-stores" data-k="stores"></div>
        <div class="hb-prompt" data-k="prompt"></div>
        <div class="mc-oracle hb-say" data-k="say">
          <div class="mc-oracle__eye"><i></i></div>
          <div class="mc-oracle__col"><div class="mc-oracle__name" data-k="who"></div><div class="mc-oracle__text" data-k="text"></div></div>
        </div>
        <div class="mc-banner" data-k="banner"></div>
        <div class="hb-notice" data-k="notice"></div>
        <div data-k="modal"></div>
      </div>`;
    this.q = (k) => root.querySelector(`[data-k="${k}"]`) as HTMLElement;
    this.fade.where.poke(6);
  }

  /** False once something else rewrote the UI root (a scene shutting down after this one started). */
  get attached() {
    return !!this.root.querySelector('.hb-hud');
  }

  room(name: string) {
    this.q('room').textContent = name;
    this.fade.where.see(name);
  }

  /** The Communicator's name with the title worn, under the room; a click puts on the next title earned (`onTitle`). */
  me(name: string, worn: string | null, earned: number, onTitle: () => void) {
    const el = this.q('me');
    el.textContent = name;
    el.title = earned > 1 ? 'Click to wear another title' : earned === 1 ? 'Click to take the title off or put it on' : '';
    el.classList.toggle('is-titled', !!worn);
    el.onclick = earned ? onTitle : null;
  }

  stores(s: HubState) {
    const parts = Object.values(s.parts).reduce((a, n) => a + (n ?? 0), 0);
    const eco = economy.get();
    const stat = (g: string, title: string, text: string) => `<span data-g="${g}" title="${title}">${text}</span>`;
    this.q('stores').innerHTML = [
      `<span data-g="scrap" title="Scrap: the main currency, from kills"><span class="mc-cog"></span> ${eco.scrap} scrap</span>`,
      stat('copper', 'Copper: building and one-time upgrades (stations, ranks, the chassis, the city)', `${eco.copper} copper`),
      stat('coal', 'Coal: fuel for expeditions, mined from seams by gatherers', `${eco.coal} coal`),
      stat('cans', 'Spare oil cans: lives. Every lift goes down with a full pack, refilled at home', `${spareCap(capExtraOf(s.perks, s.buildings?.built))} oil cans`),
      `<span data-g="parts">${parts} parts</span>`,
      stat('robots', 'Your robots (the Dry dock, I): on the lift / all. Every robot that is not a wreck rides', `${riders(roster.get()).length} / ${roster.get().bots.length} robots`),
      stat('cores', 'AI cores: one per robot; a new body needs a free one. They come from Core Vaults and from bosses', `${economy.get().cores} AI cores`),
    ].join('');
  }

  /** The stores come forward for a moment: a haul has just come up. A count the player changes with a click (buy, sell, build) never brings them forward. */
  storesUp() {
    this.fade.stores.poke();
  }

  prompt(text: string | null) {
    const el = this.q('prompt');
    el.classList.toggle('is-on', !!text);
    if (text) el.innerHTML = promptHtml(text);
  }

  /** A line in the speaker panel, typed out; `oracle` gives it the Oracle's eye and colours (the Oracle, the `highPriest` NPC). */
  say(who: string, text: string, oracle = false) {
    const el = this.q('say');
    el.classList.add('is-on');
    el.classList.remove('is-quiet');
    el.classList.toggle('hb-say--npc', !oracle);
    this.q('who').textContent = who;
    this.typing = { html: promptHtml(text), plain: text, shown: 0 };
    this.quietT = 0;
  }

  banner(text: string, ms = 3200) {
    const el = this.q('banner');
    el.textContent = text;
    el.classList.remove('is-on');
    void el.offsetWidth;
    el.classList.add('is-on');
    setTimeout(() => el.classList.remove('is-on'), ms);
  }

  /** A small line under the banner with key prompts (`promptHtml`), e.g. the quest log's "updated" note; a second call restarts it. */
  notice(text: string, ms = 4200) {
    const el = this.q('notice');
    el.innerHTML = promptHtml(text);
    el.classList.add('is-on');
    clearTimeout(this.noticeT);
    this.noticeT = setTimeout(() => el.classList.remove('is-on'), ms);
  }

  private noticeT: ReturnType<typeof setTimeout> | undefined;

  update(dt: number) {
    for (const [k, f] of Object.entries(this.fade)) {
      f.step(dt);
      const el = this.q(k === 'where' ? 'where' : k);
      const w = f.forward() ? 'up' : 'rest';
      if (el.dataset.w !== w) el.dataset.w = w;
    }
    if (this.typing) {
      const t = this.typing;
      t.shown += dt * 55;
      if (t.shown >= t.plain.length) {
        this.q('text').innerHTML = t.html;
        this.typing = null;
      } else this.q('text').textContent = t.plain.slice(0, Math.floor(t.shown));
    } else {
      this.quietT += dt;
      if (this.quietT > 9) this.q('say').classList.add('is-quiet');
    }
  }

  get speaking() {
    return !!this.typing;
  }

  /**
   * Show a panel. A click that redraws the panel one is already looking at (a purchase, a tab, a pick) calls this again: the new
   * copy takes over with no entrance (`is-again`: it must never blink) and the scroll places the player had.
   */
  open(kind: string, title: string, body: string, actions = '', closeHint = '{use} or Esc to close') {
    const again = !!this.panel && this.panelKind === kind;
    const scrolls = again ? this.scrolls(this.panel!) : [];
    this.close();
    const m = this.q('modal');
    m.innerHTML = `<div class="ui-backdrop hb-backdrop${again ? ' is-again is-still' : ''}"><div class="ui-panel ui-dialog hb-panel" data-kind="${kind}">
      <div class="hb-panel__head"><h2 class="ui-panel__title">${esc(title)}</h2><span class="hb-panel__close">${promptHtml(closeHint)}</span></div>
      <div class="ui-dialog__body hb-panel__body">${body}</div>
      <div class="ui-dialog__actions">${actions}</div></div></div>`;
    this.panel = m.querySelector('.hb-panel');
    this.panelKind = kind;
    const all = [this.panel!, ...this.panel!.querySelectorAll<HTMLElement>('*')];
    for (const [i, top] of scrolls) if (all[i]) all[i].scrollTop = top;
    // The button under the pointer takes its hover a moment after the copy goes in: no fade for that (`is-still`), or it would flash.
    const back = m.firstElementChild as HTMLElement;
    if (again) window.setTimeout(() => back.classList.remove('is-still'), 300);
    return this.panel!;
  }

  /** The scroll of every scrolled element in a panel, by its place in the panel's tree (a redraw of the same panel has the same tree). */
  private scrolls(panel: HTMLElement): [number, number][] {
    return [panel, ...panel.querySelectorAll<HTMLElement>('*')].flatMap((e, i): [number, number][] => (e.scrollTop > 0 ? [[i, e.scrollTop]] : []));
  }

  close() {
    this.q('modal').innerHTML = '';
    this.panel = null;
    this.panelKind = null;
  }
}

/** Tabs over a panel's body (kit `.ui-tabs`); `Hub` flips them (`data-tab`) and remembers the open one per station. */
export function tabbed(tabs: { id: string; label: string; html: string }[], open: string) {
  const on = tabs.some((t) => t.id === open) ? open : tabs[0].id;
  const tab = (t: { id: string; label: string }) =>
    `<button class="ui-tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === on}">${t.label}</button>`;
  return `<div class="ui-tabs hb-tabs" role="tablist">${tabs.map(tab).join('')}</div>
    ${tabs.map((t) => `<div class="hb-tabpanel" role="tabpanel" data-pane="${t.id}"${t.id === on ? '' : ' hidden'}>${t.html}</div>`).join('')}`;
}
