/**
 * The inventory (I), in a mission and aboard: Laimonas's design (games/ludum-dare-60/docs/inventory.md). DOM over the
 * canvas, built from the kit's components (`.ui-panel`, `.ui-tabs`, `.ui-slot`, `.ui-btn`) and restyled by the theme.
 *
 * Tabs: **Dry dock** (`dock/dockview.ts`, its own screen: the Communicator's and each robot type's slots, their cards, the robots;
 * the scene attaches it, `attachDock`), **Cards** (the punch cards, `hub/research.ts`: his three slots and each type's one; fitted aboard
 * only), **Stats**, **Materials** (what crafting spends: on you and in the stores) and **Workbench** (every recipe; crafting only aboard). Filters (a search box, tags, quality, the slot picked) narrow every list: the
 * search finds an item by its name or by what it is made of (`searchHit`), and suggests names as you type (`suggest`, drawn in the theme, not the browser's list); an item's border and
 * name take its quality's colour (`--q-<quality>`, theme.css). The scene owns the key (I) and Esc; this owns the rest.
 * Drag and drop (Laimonas): a card onto a card slot fits it, a fitted one onto the collection takes it out. `data-drag` marks what can be dragged, `data-drop` where it lands.
 * Rules are `sim/gear.ts`; the gear and loadout are written through `gear` (`hub/carry.ts`).
 */
import { command } from '../../../harness/dev/commands';
import { promptHtml } from '../../../harness/kit';
import { PARTS, WEAPONS, type BiomeId, type PartKind } from './sim/defs';
import { FITS_NAMES, MODS, MOD_IDS, isMod } from './sim/defs/mods';
import {
  BOT_SLOTS, COMM_SLOTS, CREW_ROLES, ITEMS, LANDS, QUALITIES, QUALITY_ORDER, SKILLS, SLOT_NAMES, STATS, TAGS, TAG_NAMES,
  TUNE_UP, addItem, addLug, craft, craftable, equip, fitMod, fitsBot, fittedOn, hasAntenna, itemIds, landsOf, lugCount, matches, modFitsWeapon, owned, ownedMods, salvage, scaled, scrapCost, shortfall, suggest, tunable, unequip, unfitMod, wornAt,
  type BotSlot, type CommSlot, type CrewRole, type Gear, type ItemId, type Owned, type Quality, type SearchTerm, type Stats, type Tag, type Wallet,
} from './sim/gear';
import { iconUrl } from './gearart';
import { KINDS, itemKind } from './itemkinds';
import { icon } from '../../../harness/ui';
import { gear as gearSlice } from './hub/carry';
import { fittedPick } from './hub/questpay';
import { FOURTH_SLOT, POOL_NAMES, cardOf, commKeys, fit as fitCard, fittedAt, slotName, slotsFor, typeSlot, unfit as unfitCard, type Card, type Research, type SlotKey } from './hub/research';
import { researchSave } from './hub/researchslice';
import { STOCK, holesSvg, pcClass, pcStyle } from './hub/punchcard';
import { isBotType } from './sim/specs';
import { StatsView } from './stats';
import type { Subject } from './statsrows';
import './inventory.css';
import './punchcard.css';

export type InvTab = 'dock' | 'cards' | 'stats' | 'mats' | 'bench';
const TABS: [InvTab, string][] = [['dock', 'Dry dock'], ['cards', 'Cards'], ['stats', 'Stats'], ['mats', 'Materials'], ['bench', 'Workbench']];
/** The Dry dock as the inventory's first tab: the scene makes it (`dock/dockview.ts`) and attaches it. */
export interface DockTab { open: boolean; show(at?: { from?: 'forge' | 'clinic' | 'workshop' | 'key' | 'dev' }): void; hide(): void; refresh(): void; state(): unknown }
const ROLE_NAMES: Record<CrewRole, string> = { gatherer: 'Gatherers', guard: 'Guards', repairer: 'Repairers', mule: 'Mules', marksman: 'Marksmen', boilermancer: 'Boilermancers', lamplighter: 'Lamplighters', stalker: 'Stalkers' };
/** The land filter's chips: the land an item's weapon or parts come from (`landsOf`). */
const LAND_NAMES: Record<BiomeId, string> = { desert: 'Desert', jungle: 'Rustwood', city: 'Hollow City', mountains: 'Frostspine', demon: 'Wastes', ether: 'Ether' };

/** The stores: crafting spends `scrap` and `parts` (the Wallet); the rest is shown (copper, insight, cores). */
export interface Stores extends Wallet { insight: number; cores: number; copper: number }
/** What the Communicator carries on a mission. */
export interface Carried extends Wallet { copper: number }
export interface InvHost {
  /** Crafting and salvage work only aboard (the workbench is in the hub). */
  where: 'hub' | 'mission';
  /** What the stores hold (scrap, parts, copper, insight, cores). */
  stores(): Stores;
  /** What the Communicator carries this mission (a mission only). */
  carried?(): Carried;
  /** Keep the stores after crafting or salvage spent or paid (scrap, parts). */
  spend?(w: Wallet): void;
  /** The gear changed: wear it (a mission's Sim takes it at once). */
  changed?(g: Gear): void;
  sound(k: 'open' | 'close' | 'click' | 'equip' | 'craft' | 'deny'): void;
  /** A part's icon (the atlas' `part-<kind>`). */
  partIcon(k: PartKind): string;
  /** The workbench is open (the main quest's step 2, hub/story.ts); crafting and salvage wait for it. */
  bench?(): boolean;
  /** Is this recipe taught yet (`hub/taught.ts`: Hob weapons, Gasket body parts, Sprocket crew pieces, a few basics from the start); without it every recipe is listed. */
  taught?(id: ItemId): boolean;
  /** The note under the recipes: who has recipes still to teach (`hub/taught.ts` `waitingNote`). */
  waiting?(): string;
  /** What the Stats tab reads: the Communicator, the robot types and the robots (`statsunit.ts`); without it there is no tab. */
  stats?(): Subject[];
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const fmt = (k: keyof typeof STATS, v: number) => `${v > 0 ? '+' : ''}${v}${STATS[k].pts ? '' : '%'} ${STATS[k].name}`;
/** The small icon of an item's kind (weapon, or the slot it fits) in the corner of its tile. */
const kindBadge = (id: ItemId) => {
  const k = itemKind(id);
  return k ? `<span class="inv-kind" title="${KINDS[k].name}">${icon(KINDS[k].icon)}</span>` : '';
};
const statLines = (s: Stats, cls = '') =>
  (Object.entries(s) as [keyof typeof STATS, number][]).map(([k, v]) => `<li class="${v < 0 ? 'is-bad' : ''} ${cls}">${fmt(k, v)}</li>`).join('');

export class Inventory {
  open = false;
  tab: InvTab = 'dock';
  /** The Dry dock (the first tab), once the scene has attached it. */
  dock: DockTab | null = null;
  role: CrewRole = 'guard';
  /** The picked item (an owned uid) or recipe (an item id on the workbench). */
  pick: number | null = null;
  recipe: ItemId | null = null;
  /** The Cards tab: the card picked, and the slot its list is narrowed to. */
  cardId: string | null = null;
  cardSlot: SlotKey | null = null;
  filter: { text: string; tags: Tag[]; qualities: Quality[]; lands: BiomeId[]; slot?: CommSlot | BotSlot; craftable: boolean } = { text: '', tags: [], qualities: [], lands: [], craftable: false };
  /** The weapon (an owned uid) whose lug was picked: the list shows the mods that fit it (P57). */
  lugFor: number | null = null;
  /** The last craft, for its reveal. */
  private reveal: Owned | null = null;
  private el: HTMLElement | null = null;
  /** The Stats tab (`stats.ts`). */
  private statsView = new StatsView();
  private note = '';
  /** The item whose Salvage was pressed once and waits for the second press (salvage cannot be undone, as taking a robot apart cannot). */
  private armed: number | null = null;
  /** The card being dragged (its id), while a drag lasts. */
  private dragging: { kind: 'card'; id: string } | null = null;
  /** Why the last action failed (the dev commands report it). */
  get lastNote() {
    return this.note;
  }

  constructor(private root: HTMLElement, private host: InvHost) {}

  attachDock(d: DockTab) {
    this.dock = d;
  }

  toggle(tab?: InvTab) {
    if (this.open && (!tab || tab === this.tab)) this.hide();
    else this.show(tab);
  }

  /** Open the Dry dock on a way in (a station, the I key, dev): `dock.ts` `openAt` says where. */
  showDock(from: 'forge' | 'clinic' | 'workshop' | 'key' | 'dev' = 'key') {
    this.show('dock', from);
  }

  show(tab?: InvTab, from?: 'forge' | 'clinic' | 'workshop' | 'key' | 'dev') {
    if (tab) this.tab = tab;
    if (this.tab === 'dock' && !this.dock) this.tab = 'cards';
    if (!this.open) this.host.sound('open');
    this.open = true;
    if (this.tab === 'dock') {
      // The dock is its own screen: the inventory's panel goes while it shows.
      this.el?.remove();
      this.el = null;
      this.dock!.show(from ? { from } : undefined);
      return;
    }
    this.dock?.hide();
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'ui-backdrop inv-backdrop';
      this.el.addEventListener('click', (e) => this.click(e));
      this.el.addEventListener('input', (e) => this.type(e));
      this.el.addEventListener('mouseover', (e) => this.tab === 'stats' && this.statsView.hover(this.el!, e, true));
      this.el.addEventListener('mouseout', (e) => this.tab === 'stats' && this.statsView.hover(this.el!, e, false));
      this.el.addEventListener('keydown', (e) => this.searchKey(e));
      this.el.addEventListener('focusout', (e) => (e.target as HTMLElement).matches?.('[data-search]') && this.hideSuggest());
      // Pressing a suggestion takes it before the box loses focus.
      this.el.addEventListener('mousedown', (e) => {
        const li = (e.target as HTMLElement).closest('[data-term]') as HTMLElement | null;
        if (!li) return;
        e.preventDefault();
        this.take(li.dataset.term!);
      });
      this.el.addEventListener('dragstart', (e) => this.dragStart(e));
      this.el.addEventListener('dragover', (e) => this.dragOver(e));
      this.el.addEventListener('dragleave', (e) => (e.target as HTMLElement).closest?.('[data-drop]')?.classList.remove('is-over'));
      this.el.addEventListener('drop', (e) => this.dropped(e));
      this.el.addEventListener('dragend', () => this.dragEnd());
      this.root.appendChild(this.el);
    }
    this.render();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.host.sound('close');
    this.dock?.hide();
    this.el?.remove();
    this.el = null;
    this.reveal = null;
  }

  /** Something changed behind the open panel (a weapon found): draw it again. */
  refresh() {
    if (!this.open) return;
    if (this.tab === 'dock') this.dock?.refresh();
    else this.render();
  }

  /** For `debugState()` and the dev commands. */
  state() {
    const g = gearSlice.get();
    return { open: this.open, tab: this.tab, role: this.role, pick: this.pick, recipe: this.recipe, filter: this.filter, lugFor: this.lugFor, lugs: lugCount(g), items: g.items.length, stats: this.statsView.state(), dock: this.dock?.state() ?? null };
  }

  /** The Stats tab as text (dev `stats`): open on a subject (`who`) and read its rows. */
  statsReport(who?: string) {
    const out = this.statsView.report(this.host.stats?.() ?? [], who);
    if (this.host.stats) this.show('stats');
    return out;
  }

  // ---- actions (also the dev commands') ----

  wear(uid: number, who: 'comm' | CrewRole, slot: CommSlot | BotSlot) {
    return this.write(() => equip(gearSlice.get(), uid, who, slot), 'equip');
  }
  takeOff(uid: number) {
    return this.write(() => unequip(gearSlice.get(), uid), 'click');
  }
  /** Fit a mod on a weapon's lug (P57). Aboard only: in a mission the lugs are locked, as the card slots are. */
  fit(modUid: number, weaponUid: number, force = false) {
    if (this.host.where !== 'hub' && !force) return this.fail('Mods are fitted aboard the Wanderer: the lugs are locked on the sands.') !== null;
    return this.write(() => fitMod(gearSlice.get(), modUid, weaponUid), 'equip');
  }
  /** How many lugs every weapon has (dev: the second is Hob's reward). */
  setLugs(n: 1 | 2) {
    const g = gearSlice.get();
    this.commit(n === 2 ? addLug(g) : { ...g, lugs: 1 });
    this.refresh();
    return lugCount(gearSlice.get());
  }
  /** Take a mod off its lug (aboard only). */
  unfit(modUid: number, force = false) {
    if (this.host.where !== 'hub' && !force) return this.fail('Mods are fitted aboard the Wanderer: the lugs are locked on the sands.') !== null;
    return this.write(() => unfitMod(gearSlice.get(), modUid), 'click');
  }
  make(id: ItemId) {
    if (this.host.where !== 'hub' || !this.host.spend) return this.fail('Craft at the workbench, aboard the Wanderer.');
    if (this.host.bench && !this.host.bench()) return this.fail('The Oracle has not blessed the workbench yet: follow her quest.');
    if (this.host.taught && !this.host.taught(id)) return this.fail(`Nobody has taught you the ${ITEMS[id].name} yet. ${this.host.waiting?.() ?? ''}`.trim());
    if (!craftable(id)) return this.fail(`${ITEMS[id].name} cannot be made, only found.`);
    const g = gearSlice.get();
    try {
      const st = this.host.stores();
      // The quality roll: a seeded stream per run, by craft count (a run replays).
      const u = frac(Math.sin((g.crafted + 1) * 12.9898 + g.next * 78.233) * 43758.5453);
      const r = craft(g, id, st, u);
      this.host.spend(r.wallet);
      this.commit(r.gear);
      this.reveal = r.item;
      this.pick = r.item.uid;
      this.note = '';
      this.host.sound('craft');
      this.render();
      return r.item;
    } catch (e) {
      return this.fail(`Cannot craft: ${(e as Error).message}.`);
    }
  }
  scrapIt(uid: number) {
    if (this.host.where !== 'hub' || !this.host.spend) return this.fail('Salvage at the workbench, aboard the Wanderer.');
    if (this.host.bench && !this.host.bench()) return this.fail('The Oracle has not blessed the workbench yet: follow her quest.');
    try {
      const r = salvage(gearSlice.get(), uid);
      const st = this.host.stores();
      this.host.spend({ scrap: st.scrap + r.scrap, parts: st.parts });
      this.commit(r.gear);
      this.pick = null;
      this.note = `Salvaged for ${r.scrap} scrap.`;
      this.host.sound('click');
      this.render();
      return r.scrap;
    } catch (e) {
      return this.fail(`${(e as Error).message}.`);
    }
  }

  private write(f: () => Gear, sound: 'equip' | 'click') {
    try {
      this.commit(f());
      this.note = '';
      this.host.sound(sound);
      this.render();
      return true;
    } catch (e) {
      this.fail(`${(e as Error).message}.`);
      return false;
    }
  }
  /** Fit a card into a slot (or take it out: no slot). Aboard only: in a mission the slots are locked. */
  private putCard(id: string, slot: SlotKey | null) {
    if (this.host.where !== 'hub') return this.fail('Cards are fitted aboard the Wanderer: the slots are locked on the sands.');
    try {
      const r = researchSave.get();
      researchSave.set(slot ? fitCard(r, id, slot) : unfitCard(r, id));
      this.cardId = id;
      this.note = '';
      this.host.sound('equip');
      this.render();
      return true;
    } catch (e) {
      return this.fail(`${(e as Error).message}.`);
    }
  }
  private commit(g: Gear) {
    gearSlice.set(g);
    this.host.changed?.(gearSlice.get());
  }
  private fail(msg: string) {
    this.note = msg;
    this.host.sound('deny');
    this.render();
    return null;
  }

  // ---- input ----

  private click(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (!t) return;
    const a = t.dataset.a!, v = t.dataset.v ?? '';
    const f = this.filter;
    const armed = this.armed;
    this.armed = null;
    switch (a) {
      case 'close': return this.hide();
      case 'tab':
        if (v === 'dock') return this.show('dock');
        this.tab = v as InvTab; this.pick = null; this.recipe = null; this.cardSlot = null; this.lugFor = null; f.slot = undefined; this.reveal = null; break;
      case 'cslot': this.cardSlot = this.tab === 'cards' && this.cardSlot === v ? null : v; this.cardId = researchSave.get().fit[v] ?? (this.cardSlot ? null : this.cardId); this.tab = 'cards'; break;
      case 'cpick': this.cardId = v; break;
      case 'cfit': { const [id, slot] = v.split('|'); this.putCard(id, slot); return; }
      case 'cout': this.putCard(v, null); return;
      case 'cclear': this.cardSlot = null; break;
      case 'who': this.statsView.pick = v; break;
      case 'tag': f.tags = f.tags.includes(v as Tag) ? f.tags.filter((x) => x !== v) : [...f.tags, v as Tag]; break;
      case 'land': f.lands = f.lands.includes(v as BiomeId) ? f.lands.filter((x) => x !== v) : [...f.lands, v as BiomeId]; break;
      case 'q': f.qualities = f.qualities.includes(v as Quality) ? f.qualities.filter((x) => x !== v) : [...f.qualities, v as Quality]; break;
      case 'craftable': f.craftable = !f.craftable; break;
      case 'clear': this.filter = { text: '', tags: [], qualities: [], lands: [], craftable: false }; this.lugFor = null; break;
      case 'fit': { const [m, w] = v.split(':').map(Number); this.fit(m, w); return; }
      case 'unfit': this.unfit(Number(v)); return;
      case 'recipe': this.recipe = v as ItemId; this.reveal = null; break;
      case 'wear': {
        const [who, slot] = v.split(':');
        this.wear(this.pick!, who as 'comm' | CrewRole, slot as CommSlot | BotSlot);
        return;
      }
      case 'craft': this.make(v as ItemId); return;
      case 'salvage': {
        // The first press asks, the second (on the same item) does it.
        if (armed !== this.pick) {
          this.armed = this.pick;
          const o = owned(gearSlice.get(), this.pick ?? undefined);
          this.note = `Take the ${o ? ITEMS[o.id].name : 'item'} apart for good? Press Salvage again to confirm.`;
          this.host.sound('click');
          this.render();
          return;
        }
        this.scrapIt(this.pick!);
        return;
      }
      default: return;
    }
    this.host.sound('click');
    this.note = '';
    this.render();
  }

  /** Typing in the search box: only the chips and the lists redraw, so the box keeps its focus and its suggestions. */
  private type(e: Event) {
    const box = e.target as HTMLInputElement;
    if (!box.matches('[data-search]')) return;
    this.filter.text = box.value;
    this.refreshHits();
    this.showSuggest(box);
  }
  /**
   * Up and Down walk the suggestions, Enter or Tab takes the one lit (Tab the first), Enter with none leaves the box;
   * Esc closes the suggestions, then empties the box, then leaves it (the next Esc closes the inventory).
   */
  private searchKey(e: KeyboardEvent) {
    const box = e.target as HTMLInputElement;
    if (!box.matches?.('[data-search]')) return;
    const n = this.hints.length;
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && n) {
      this.lit = e.key === 'ArrowDown' ? (this.lit + 1) % n : (this.lit <= 0 ? n : this.lit) - 1;
      this.drawSuggest(box);
    } else if (e.key === 'Tab' && n) this.take(this.hints[Math.max(0, this.lit)].name);
    else if (e.key === 'Enter') {
      if (this.lit >= 0 && n) this.take(this.hints[this.lit].name);
      else box.blur();
    } else if (e.key === 'Escape') {
      if (n) this.hideSuggest();
      else if (box.value) {
        box.value = this.filter.text = '';
        this.refreshHits();
      } else box.blur();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }
  /** The suggestions under the box. */
  private hints: SearchTerm[] = [];
  private lit = -1;
  private showSuggest(box: HTMLInputElement) {
    this.hints = suggest(box.value);
    this.lit = -1;
    this.drawSuggest(box);
  }
  private hideSuggest() {
    this.hints = [];
    this.lit = -1;
    this.el?.querySelector('.inv-suggest')?.remove();
  }
  private take(name: string) {
    const box = this.el?.querySelector('[data-search]') as HTMLInputElement | null;
    if (!box) return;
    box.value = this.filter.text = name;
    this.hideSuggest();
    this.host.sound('click');
    this.refreshHits();
  }
  private drawSuggest(box: HTMLInputElement) {
    if (!this.el) return;
    let ul = this.el.querySelector('.inv-suggest') as HTMLElement | null;
    if (!this.hints.length) return ul?.remove();
    if (!ul) {
      ul = document.createElement('ul');
      ul.className = 'inv-suggest';
      ul.setAttribute('role', 'listbox');
      this.el.appendChild(ul);
    }
    // Under the box, in the backdrop's own pixels (the UI root may be scaled to the canvas).
    const er = this.el.getBoundingClientRect(), br = box.getBoundingClientRect();
    const k = this.el.offsetWidth / (er.width || 1);
    Object.assign(ul.style, { left: `${(br.left - er.left) * k + 14}px`, top: `${(br.bottom - er.top) * k + 4}px`, width: `${Math.min(420, br.width * k - 28)}px` });
    const t = box.value.trim();
    const mark = (n: string) => {
      const i = n.toLowerCase().indexOf(t.toLowerCase());
      return i < 0 ? esc(n) : `${esc(n.slice(0, i))}<b>${esc(n.slice(i, i + t.length))}</b>${esc(n.slice(i + t.length))}`;
    };
    const icon = (h: SearchTerm) =>
      h.kind === 'item' ? `<img src="${iconUrl(h.id as ItemId)}" alt="">`
        : h.id === 'scrap' ? '<span class="inv-suggest__glyph">&#9881;</span>'
          : `<img src="${this.host.partIcon(h.id as PartKind)}" alt="">`;
    ul.innerHTML = this.hints
      .map((h, i) => `<li role="option" class="${i === this.lit ? 'is-lit' : ''}" data-term="${esc(h.name)}" aria-selected="${i === this.lit}">${icon(h)}<span>${mark(h.name)}</span>${h.kind === 'material' ? '<em>made of</em>' : ''}</li>`)
      .join('');
  }
  private refreshHits() {
    if (!this.el) return;
    const g = gearSlice.get();
    const st = this.host.stores();
    const t = document.createElement('template');
    t.innerHTML = this.body(g, st);
    for (const sel of ['.inv__chips', '.inv__hits']) {
      const now = this.el.querySelector(sel), next = t.content.querySelector(sel);
      if (now && next) now.innerHTML = next.innerHTML;
    }
  }
  private body(g: Gear, st: Stores) {
    return this.tab === 'cards' ? this.cardsTab() : this.tab === 'stats' ? this.statsView.body(this.host.stats?.() ?? []) : this.tab === 'mats' ? this.matsTab(st) : this.benchTab(g, st);
  }

  // ---- drag and drop ----

  private dragStart(e: DragEvent) {
    const t = (e.target as HTMLElement).closest?.('[data-drag]') as HTMLElement | null;
    if (!t) return;
    const v = t.dataset.drag!;
    this.dragging = { kind: 'card', id: v.slice(5) };
    e.dataTransfer?.setData('text/plain', v);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    this.hideSuggest();
    // Light every place it can land.
    this.el?.querySelectorAll<HTMLElement>('[data-drop]').forEach((d) => d.classList.toggle('is-target', this.accepts(d.dataset.drop!)));
  }
  private dragOver(e: DragEvent) {
    const t = (e.target as HTMLElement).closest?.('[data-drop]') as HTMLElement | null;
    if (!t || !this.dragging || !this.accepts(t.dataset.drop!)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    t.classList.add('is-over');
  }
  private dropped(e: DragEvent) {
    const t = (e.target as HTMLElement).closest?.('[data-drop]') as HTMLElement | null;
    const d = this.dragging;
    this.dragEnd();
    if (!t || !d || !this.accepts(t.dataset.drop!, d)) return;
    e.preventDefault();
    const [kind, a] = t.dataset.drop!.split('|');
    this.putCard(d.id, kind === 'card' ? a : null);
  }
  private dragEnd() {
    this.dragging = null;
    this.el?.querySelectorAll('.is-target, .is-over').forEach((d) => d.classList.remove('is-target', 'is-over'));
  }
  /** Can what is dragged land here: `card|<slot key>`, `cout` (the collection). */
  private accepts(drop: string, d = this.dragging) {
    if (!d) return false;
    const [kind, a] = drop.split('|');
    const r = researchSave.get();
    const c = cardOf(d.id);
    if (kind === 'cout') return !!fittedAt(r, d.id);
    return kind === 'card' && !!c && slotsFor(c).includes(a as SlotKey) && (a !== FOURTH_SLOT || !!r.fourth) && fittedAt(r, d.id) !== a;
  }

  /**
   * Where a crafted piece goes with one press (the Workbench's Wear): his slot for a weapon or body part, else the robot type last
   * shown if the piece fits it, else the first type it is made for.
   */
  private wearTarget(g: Gear, o: Owned): { who: 'comm' | CrewRole; slot: CommSlot | BotSlot } | null {
    const d = ITEMS[o.id];
    const onComm = !!(d.weapon || d.comm);
    if (onComm) {
      if (d.weapon) return { who: 'comm', slot: this.filter.slot === 'secondary' || (g.comm.primary !== undefined && !wornAt(g, o.uid)) ? 'secondary' : 'primary' };
      // Gasket's Second Heart (P52): a core goes in the second slot when the first is taken by another piece.
      if (d.comm === 'core' && g.heart && g.comm.core !== undefined && g.comm.core !== o.uid && g.comm.heart !== o.uid) return { who: 'comm', slot: 'heart' };
      return d.comm ? { who: 'comm', slot: d.comm } : null;
    }
    if (!d.bot) return null;
    const role = fitsBot(d, this.role) ? this.role : CREW_ROLES.find((r) => fitsBot(d, r));
    return role && fitsBot(d, role) ? { who: role, slot: d.bot } : null;
  }

  // ---- drawing ----

  private render() {
    if (!this.el) return;
    // A scene's HUD can rewrite the UI root under us: hang back on.
    if (!this.el.isConnected) this.root.appendChild(this.el);
    const g = gearSlice.get();
    const st = this.host.stores();
    const body = this.body(g, st);
    // The redraw drops the suggestions with the box they hung from.
    this.hints = [];
    this.lit = -1;
    // A redraw replaces the lists: keep where each was scrolled to while the tab stays the same.
    const sameTab = this.el.querySelector(`.inv__body--${this.tab}`);
    const scrolls = sameTab ? [...this.el.querySelectorAll('.inv__col')].map((c) => c.scrollTop) : [];
    this.el.innerHTML = `
      <div class="ui-panel inv" role="dialog" aria-label="Inventory">
        <div class="inv__head">
          <h2 class="ui-heading inv__title">Inventory</h2>
          <div class="inv__purse"><span title="Scrap in the stores">&#9881; ${st.scrap} scrap</span><span title="Copper in the stores: the building material">${st.copper} copper</span>${this.host.carried ? `<span class="inv__dim">on you: ${this.host.carried!().scrap} scrap</span>` : ''}</div>
          <button class="ui-btn ui-btn--faint inv__close" data-a="close">${promptHtml('{inventory}')} Close</button>
        </div>
        <div class="ui-tabs inv__tabs" role="tablist">${TABS.filter(([id]) => id !== 'stats' || this.host.stats).map(([id, name]) => `<button class="ui-tab" role="tab" data-a="tab" data-v="${id}" aria-selected="${this.tab === id}">${name}</button>`).join('')}</div>
        <div class="inv__body inv__body--${this.tab}">${body}</div>
        <div class="inv__note ${this.note ? 'is-on' : ''}">${esc(this.note)}</div>
      </div>`;
    this.el.querySelectorAll('.inv__col').forEach((c, i) => (c.scrollTop = scrolls[i] ?? 0));
  }

  private filters(withCraftable = false) {
    const f = this.filter;
    return `<div class="inv__filters">
      <input class="inv-search" type="text" data-search value="${esc(f.text)}" placeholder="Search a name, or what it's made of" autocomplete="off" spellcheck="false" aria-label="Search items" aria-autocomplete="list">
      <span class="inv__chips">${TAGS.map((t) => `<button class="inv-chip ${f.tags.includes(t) ? 'is-on' : ''}" data-a="tag" data-v="${t}">${TAG_NAMES[t]}</button>`).join('')}
      <span class="inv__sep"></span>
      ${QUALITY_ORDER.map((q) => `<button class="inv-chip inv-chip--q q-${q} ${f.qualities.includes(q) ? 'is-on' : ''}" data-a="q" data-v="${q}" title="${QUALITIES[q].name}"><i></i>${QUALITIES[q].name}</button>`).join('')}
      ${withCraftable ? `<button class="inv-chip ${f.craftable ? 'is-on' : ''}" data-a="craftable">Can craft</button>` : ''}
      <span class="inv__sep"></span>
      ${LANDS.map((b) => `<button class="inv-chip inv-chip--land ${f.lands.includes(b) ? 'is-on' : ''}" data-a="land" data-v="${b}" title="Made from what ${LAND_NAMES[b]} drops">${LAND_NAMES[b]}</button>`).join('')}
      ${f.text.trim() || f.tags.length || f.qualities.length || f.lands.length || f.slot || f.craftable ? `<button class="inv-chip inv-chip--clear" data-a="clear">Clear${f.slot ? ` (${SLOT_NAMES[f.slot]})` : ''}</button>` : ''}</span>
    </div>`;
  }

  /** Card slots as rows: the slot's name and the card in it. Pressing one opens the Cards tab on it. */
  private cardSlots(keys: SlotKey[]) {
    const r = researchSave.get();
    const aboard = this.host.where === 'hub';
    return `<div class="inv__cslots">${keys
      .map((k) => {
        const c = r.fit[k] ? cardOf(r.fit[k]) : undefined;
        const face = c ? `${pcClass(c, 'sm')}" ${pcStyle(c)}` : 'pc pc--sm pc--empty"';
        return `<button class="inv-cslot ${c ? (c.pool === 'keystone' ? 'is-key' : '') : 'is-empty'} ${this.tab === 'cards' && this.cardSlot === k ? 'is-selected' : ''} ${face} data-a="cslot" data-v="${k}"${aboard ? ` data-drop="card|${k}"` : ''}${aboard && c ? ` draggable="true" data-drag="card|${c.id}"` : ''} title="${esc(c ? c.text : 'Press to see the cards that fit here')}">${STOCK}<span class="pc__head"><b class="pc__name">${esc(c ? c.name : 'Empty')}</b><em class="pc__tag">${slotName(k)}${c?.pool === 'keystone' ? ', keystone' : ''}</em></span>${c ? holesSvg(c.id) : ''}</button>`;
      })
      .join('')}</div>`;
  }

  /** The Cards tab: the slots, the collection (narrowed to a slot's kind when one is picked), and the picked card. */
  private cardsTab() {
    const r = researchSave.get();
    const aboard = this.host.where === 'hub';
    const owned = r.owned.map(cardOf).filter((c): c is Card => !!c);
    // A fitted card shows in its slot only, not in the collection too.
    const loose = owned.filter((c) => !fittedAt(r, c.id));
    const shown = this.cardSlot ? loose.filter((c) => slotsFor(c).includes(this.cardSlot!)) : loose;
    const typeKeys = (CREW_ROLES as string[]).filter(isBotType).map(typeSlot);
    const tile = (c: Card) =>
      `<button class="inv-ctile ${c.pool === 'keystone' ? 'is-key' : ''} ${this.cardId === c.id ? 'is-selected' : ''} ${pcClass(c, 'sm')}" ${pcStyle(c)} data-a="cpick" data-v="${c.id}" title="${esc(c.text)}"${aboard ? ` draggable="true" data-drag="card|${c.id}"` : ''}>${STOCK}<span class="pc__head"><b class="pc__name">${esc(c.name)}</b><em class="pc__tag">${POOL_NAMES[c.pool]}</em></span>${holesSvg(c.id)}</button>`;
    const list = shown.length
      ? `<div class="inv__ctiles">${shown.map(tile).join('')}</div>`
      : `<p class="inv__empty">${!owned.length ? 'No cards yet. The Oracle offers one pick of three each time you return from the sands, and one more for every insight you spend.' : !loose.length ? 'All your cards are fitted.' : `No loose card of yours fits ${this.cardSlot ? slotName(this.cardSlot).toLowerCase() : 'here'}.`}</p>`;
    return `
      <div class="inv__col inv__doll">
        <h3 class="inv__h">You</h3>
        ${this.cardSlots(commKeys(researchSave.get()))}
        <h3 class="inv__h">Underlings</h3>
        ${this.cardSlots(typeKeys)}
        <p class="inv__dim">${aboard ? 'Press a slot to see what fits it, or drag a card onto one. A card is in one slot at a time; a keystone works party-wide and only one can be fitted.' : 'The slots are locked on the sands: fit your cards aboard the Wanderer.'}</p>
      </div>
      <div class="inv__col inv__list"${aboard ? ' data-drop="cout"' : ''}>${this.cardSlot ? `<div class="inv__chips"><button class="inv-chip inv-chip--clear" data-a="cclear">Showing what fits ${slotName(this.cardSlot).toLowerCase()}: show all</button></div>` : ''}${list}</div>
      <div class="inv__col inv__card">${this.cardDetail(r, aboard)}</div>`;
  }

  /** The picked card: its rule, where its strength comes from, and the slots it can go in. */
  private cardDetail(r: Research, aboard: boolean) {
    const c = this.cardId ? cardOf(this.cardId) : undefined;
    if (!c || !r.owned.includes(c.id)) return '<p class="inv__dim">Pick a card to see it and fit it.</p>';
    const now = fittedAt(r, c.id);
    const slotBtn = (k: SlotKey) => {
      const other = r.fit[k] && r.fit[k] !== c.id ? cardOf(r.fit[k]) : undefined;
      return `<button class="ui-btn ${now === k ? 'ui-btn--primary' : ''}" data-a="cfit" data-v="${c.id}|${k}"${aboard && now !== k ? '' : ' disabled'}>${slotName(k)}${k.startsWith('comm:') ? ' (you)' : ''}${other ? ` <small>swaps out ${esc(other.name)}</small>` : ''}</button>`;
    };
    const keys = this.cardSlot && slotsFor(c).includes(this.cardSlot) ? [this.cardSlot] : slotsFor(c).filter((k) => k !== FOURTH_SLOT || r.fourth);
    return `<div class="${pcClass(c, 'mid')}" ${pcStyle(c)}>${STOCK}
        <span class="pc__head"><b class="pc__name">${esc(c.name)}</b></span>
        <em class="pc__tag">${POOL_NAMES[c.pool]} card${now ? `, fitted: ${slotName(now)}` : ', in the collection'}</em>
        <span class="pc__typed">${esc(c.text)}</span>
        ${holesSvg(c.id)}
        <span class="pc__foot">${c.from ? `Strength from: ${esc(c.from.toLowerCase())}` : 'A keystone: works party-wide, wherever it sits'}</span>
      </div>
      ${c.pool === 'keystone' ? '<p class="inv__dim">Only one keystone is fitted at a time: fitting this takes the other out.</p>' : ''}
      <h3 class="inv__h">Fit it in</h3>
      <div class="inv__acts">${keys.map(slotBtn).join('')}${now && aboard ? `<button class="ui-btn ui-btn--faint" data-a="cout" data-v="${c.id}">Take out</button>` : ''}</div>
      ${aboard ? '' : '<p class="inv__dim">Locked on the sands: fit it aboard the Wanderer.</p>'}`;
  }

  private matsTab(st: Stores) {
    const row = (icon: string, name: string, n: number, sub = '') => `<li class="inv-mat"><span class="inv-mat__icon">${icon}</span><b>${esc(name)}</b><small>${esc(sub)}</small><em>${n}</em></li>`;
    const parts = (p: Wallet['parts']) =>
      (Object.keys(PARTS) as PartKind[]).filter((k) => (p[k] ?? 0) > 0).map((k) => row(`<img src="${this.host.partIcon(k)}" alt="">`, PARTS[k].name, p[k]!, PARTS[k].unique ? 'unique' : `from ${PARTS[k].from}s`)).join('') || '<li class="inv__dim">No parts yet: elites and bosses drop them.</li>';
    const c = this.host.carried?.();
    return `
      <div class="inv__col">
        <h3 class="inv__h">In the stores (aboard)</h3>
        <ul class="inv-mats">
          ${row('&#9881;', 'Scrap', st.scrap, 'the main currency, from kills; repairs, robots and crafting spend it')}
          ${row('&#9650;', 'Copper', st.copper, 'building and one-time upgrades: stations, ranks, the city')}
          ${row('&#10070;', 'Insight', st.insight, 'old research')}
          ${row('&#9673;', 'AI cores', st.cores, 'one per fielded bot')}
          ${parts(st.parts)}
        </ul>
      </div>
      ${c ? `<div class="inv__col"><h3 class="inv__h">On you (this mission)</h3><ul class="inv-mats">${row('&#9881;', 'Scrap', c.scrap, 'the slingshot shoots it')}${row('&#9650;', 'Copper', Math.floor(c.copper))}${parts(c.parts)}</ul><p class="inv__dim">It all goes into the stores when the lift docks.</p></div>` : ''}`;
  }

  private benchTab(g: Gear, st: Stores) {
    const f = this.filter;
    const ids = itemIds.filter((id) => craftable(id) && (!this.host.taught || this.host.taught(id)) && matches(id, null, { text: f.text, tags: f.tags, lands: f.lands, slot: f.slot }) && (!f.craftable || !shortfall(id, st, g).length));
    const waiting = this.host.waiting?.() ?? '';
    const aboard = this.host.where === 'hub';
    const groups: [string, (id: ItemId) => boolean][] = [
      ['Weapons', (id) => !!ITEMS[id].weapon],
      ['Weapon mods', (id) => !!ITEMS[id].mod],
      ['Body parts', (id) => !!ITEMS[id].comm],
      ['For any robot', (id) => !!ITEMS[id].bot && !ITEMS[id].comm && !ITEMS[id].roles],
      ...CREW_ROLES.map((r): [string, (id: ItemId) => boolean] => [`For ${ROLE_NAMES[r].toLowerCase()}`, (id) => !ITEMS[id].comm && !!ITEMS[id].roles?.includes(r)]),
    ];
    const list = groups
      .map(([name, ok]) => {
        const these = ids.filter(ok);
        if (!these.length) return '';
        return `<h3 class="inv__h">${name}</h3><div class="inv__recipes">${these
          .map((id) => {
            const can = !shortfall(id, st, g).length;
            return `<button class="inv-recipe ${this.recipe === id ? 'is-selected' : ''} ${can ? 'is-can' : ''}" data-a="recipe" data-v="${id}"><img src="${iconUrl(id)}" alt="">${kindBadge(id)}<span>${esc(ITEMS[id].name)}</span></button>`;
          })
          .join('')}</div>`;
      })
      .join('');
    const id = this.recipe;
    let card = '<p class="inv__dim">Pick a recipe. What you craft rolls a quality: mostly Standard, sometimes Fine, Rare or Epic, once in a long while Legendary. A weapon mod has none: it is a behaviour, one of a kind.</p>';
    if (this.reveal) card = `<div class="inv-reveal q-${this.reveal.q}">${ITEMS[this.reveal.id].mod ? 'Made!' : `${QUALITIES[this.reveal.q].name}!`}</div>` + this.revealCard(g, this.reveal);
    else if (id) {
      const r = ITEMS[id].recipe;
      const need = (have: number, n: number, name: string, icon = '') => `<li class="${have >= n ? '' : 'is-bad'}">${icon}${n} ${esc(name)} <span>(${have})</span></li>`;
      card = `${this.defCard(id, 'standard')}
        <h3 class="inv__h">Costs</h3>
        <ul class="inv__cost">
          ${need(st.scrap, scrapCost(id, g), scrapCost(id, g) < r.scrap ? `scrap (${r.scrap - scrapCost(id, g)} off: on sale)` : 'scrap')}
          ${(Object.entries(r.parts ?? {}) as [PartKind, number][]).map(([k, n]) => need(st.parts[k] ?? 0, n, n === 1 ? PARTS[k].name : PARTS[k].plural, `<img src="${this.host.partIcon(k)}" alt="">`)).join('')}
        </ul>
        <button class="ui-btn ui-btn--primary inv__craft" data-a="craft" data-v="${id}" ${aboard && !shortfall(id, st, g).length ? '' : 'disabled'}>${aboard ? 'Craft' : 'Craft aboard the Wanderer'}</button>`;
    }
    return `
      <div class="inv__col inv__list inv__list--bench">${this.filters(true)}<div class="inv__hits">${list || '<p class="inv__empty">No recipe matches the filters.</p>'}${waiting ? `<p class="inv__dim">${esc(waiting)}</p>` : ''}</div></div>
      <div class="inv__col inv__card">${card}</div>`;
  }

  /** A crafted piece's card with its Wear (or Fit to <type>) button: the same wear as the Communicator and Underlings tabs. A mod gets its Fit buttons. */
  private revealCard(g: Gear, o: Owned) {
    if (ITEMS[o.id].mod) return this.modCard(g, o);
    const t = this.wearTarget(g, o);
    const at = wornAt(g, o.uid);
    const label = t?.who === 'comm' ? (ITEMS[o.id].weapon ? `Wear as ${SLOT_NAMES[t.slot].toLowerCase()}` : 'Wear') : t ? `Fit to ${ROLE_NAMES[t.who].toLowerCase()}` : '';
    const worn = at ? `<p class="inv__dim">Worn: ${at.who === 'comm' ? 'by you' : `by every ${at.who}`}, ${SLOT_NAMES[at.slot].toLowerCase()}.</p>` : '';
    const act = t && !(at && at.who === t.who) ? `<div class="inv__acts"><button class="ui-btn ui-btn--primary" data-a="wear" data-v="${t.who}:${t.slot}">${label}</button></div>` : '';
    return this.itemCard(g, o) + worn + act;
  }

  /** A picked mod: its rule, where it is fitted, and the weapons it can be fitted on (aboard only; the lugs are locked on the sands). */
  private modCard(g: Gear, o: Owned) {
    const d = ITEMS[o.id];
    const on = fittedOn(g, o.uid);
    const aboard = this.host.where === 'hub';
    const targets = [...(this.lugFor !== null ? [owned(g, this.lugFor)] : [owned(g, g.comm.primary), owned(g, g.comm.secondary)])]
      .filter((w, i, a): w is Owned => !!w && modFitsWeapon(o, w) && a.findIndex((x) => x?.uid === w.uid) === i);
    const acts = targets.map((w) => `<button class="ui-btn ${on?.uid === w.uid ? '' : 'ui-btn--primary'}" data-a="fit" data-v="${o.uid}:${w.uid}"${aboard && on?.uid !== w.uid ? '' : ' disabled'}>${on?.uid === w.uid ? 'Fitted on' : 'Fit on'} the ${esc(ITEMS[w.id].name)}${w.uid === g.comm.primary ? ' (primary)' : w.uid === g.comm.secondary ? ' (secondary)' : ''}</button>`);
    if (on && aboard) acts.push(`<button class="ui-btn ui-btn--faint" data-a="unfit" data-v="${o.uid}">Take off the lug</button>`);
    if (!on && aboard && craftable(o.id)) acts.push(`<button class="ui-btn ui-btn--faint" data-a="salvage">Salvage (${Math.floor(d.recipe.scrap / 2)} scrap)</button>`);
    return `${this.itemCard(g, o)}${on ? `<p class="inv__dim">Fitted on the ${esc(ITEMS[on.id].name)}.</p>` : ''}${targets.length ? '' : '<p class="inv__dim">No weapon you carry takes it: pick a lug on a weapon of the right kind.</p>'}<div class="inv__acts">${acts.join('')}</div>${aboard ? '' : '<p class="inv__dim">Locked on the sands: fit it aboard the Wanderer.</p>'}`;
  }

  private itemCard(g: Gear, o: Owned) {
    const d = ITEMS[o.id];
    const needs = d.needs ? `<p class="inv-card__needs ${hasAntenna(g) ? 'is-met' : ''}">Needs a transponding antenna on you${hasAntenna(g) ? ' (you have one)' : ': not working'}.</p>` : '';
    return this.defCard(o.id, o.q, o.tuned) + needs;
  }

  /** An item's card at a quality: name, kind, stats, skill, look and flavour. */
  private defCard(id: ItemId, q: Quality, tuned = false) {
    const d = ITEMS[id];
    const lands = landsOf(id);
    const mod = d.mod ? MODS[d.mod] : null;
    const where = [mod && `Weapon mod${mod.wild ? ' · wild' : ''} · fits: ${FITS_NAMES[mod.fits]}`, d.weapon && 'Weapon', d.comm && `${SLOT_NAMES[d.comm]} (you)`, d.bot && `${SLOT_NAMES[d.bot]} (${d.roles ? d.roles.map((r) => r).join(', ') : 'any robot'})`, lands.length && `from ${lands.map((b) => LAND_NAMES[b]).join(', ')}`].filter(Boolean).join(' · ');
    let weapon = '';
    if (d.weapon) {
      const w = WEAPONS[d.weapon];
      const m = QUALITIES[q].mult;
      const lines = [
        `${Math.round(w.dmg * m)} damage${w.pellets ? ` x${w.pellets.n} rivets` : ''}`,
        `${(1 / w.rate).toFixed(1)} a second`,
        w.kind === 'melee' ? `${w.reach} px reach` : `${w.range} px range`,
        w.crit ? `${Math.round(w.crit * 100)}% critical${w.bounce ? ', a crit ricochets on' : ''}` : '',
        w.chain ? `arcs to ${w.chain.n} more foes` : '',
        w.kind === 'gun' ? (w.ammo === 'scrap' ? 'shoots scrap (1 a shot)' : 'spends steam') : w.knock > 400 ? 'big knockback' : '',
      ].filter(Boolean);
      weapon = `<ul class="inv__stats">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
    }
    const sk = d.skill ? `<p class="inv-card__skill">${promptHtml(`{${SKILLS[d.skill].key}}`)} <b>${SKILLS[d.skill].name}</b>: ${esc(SKILLS[d.skill].text)} <span>${SKILLS[d.skill].steam} steam</span></p>` : '';
    return `
      <div class="inv-card q-${q}">
        <div class="inv-card__top"><img src="${iconUrl(id)}" alt=""><div><b class="inv-card__name">${esc(d.name)}</b><small>${mod ? '' : `${QUALITIES[q].name} · `}${where}</small></div></div>
        ${tuned ? `<p class="inv-card__tuned">${icon('wrench')} Tuned +${Math.round((TUNE_UP.mult - 1) * 100)}%</p>` : ''}
        <div class="inv-card__tags">${d.tags.map((t) => `<span>${TAG_NAMES[t]}</span>`).join('')}</div>
        ${weapon}
        ${mod ? `<p class="inv-card__skill"><b>${FITS_NAMES[mod.fits]} mod:</b> ${esc(mod.text)}</p>` : ''}
        ${d.stats ? `<ul class="inv__stats">${statLines(scaled(d.stats, q, tuned))}</ul>` : ''}
        ${d.crew ? `<p class="inv__h2">Every bot gets</p><ul class="inv__stats">${statLines(scaled(d.crew, q, tuned))}</ul>` : ''}
        ${d.aura ? `<p class="inv__h2">Allies within ${d.aura.r} px get</p><ul class="inv__stats">${statLines(scaled(d.aura.stats, q, tuned))}</ul>` : ''}
        ${d.calm ? '<p class="inv__h2">Plain hornets leave the wearer alone.</p>' : ''}
        ${sk}
        <p class="inv-card__look"><b>Looks:</b> ${esc(d.look)}</p>
        <p class="inv-card__flavour">${esc(d.flavour)}</p>
      </div>`;
  }
}

const frac = (x: number) => x - Math.floor(x);

/**
 * The `gear` dev commands (both scenes): open the inventory on a tab, search it, give any item at any quality, wear it, fill the
 * stores for crafting, craft. `materials` needs the scene's `fill` (aboard it fills the stores, in a mission the pack).
 */
export function gearCommands(inv: Inventory, fill: (scrap: number, parts: number) => void) {
  const g = { group: 'gear' };
  const qs = QUALITY_ORDER as string[];
  const unsubs = [
    command('inv', ([tab]) => {
      if (tab === 'close') inv.hide();
      else inv.show((TABS.find(([id, n]) => id === tab || n.toLowerCase() === tab)?.[0] ?? undefined) as InvTab | undefined);
      return JSON.stringify(inv.state());
    }, 'inv [dock|cards|stats|mats|bench|close]: open the inventory (on a tab; dock: the Dry dock) or close it', { ...g, args: () => [...TABS.map(([id]) => id), 'close'] }),
    command('stats', ([who]) => inv.statsReport(who), 'stats [comm|<type>|<robot name>]: open the Stats tab on one and print its rows (value, base, what changes it) and the damage types', g),
    command('search', (words) => {
      inv.filter.text = words.join(' ');
      inv.show();
      const hits = itemIds.filter((id) => matches(id, null, { text: inv.filter.text }));
      return `${hits.length} item(s): ${hits.map((id) => ITEMS[id].name).join(', ')}`;
    }, 'search [text]: type into the inventory search box (a name, or what it is made of); none empties it', g),
    command('lands', (ids) => {
      const bad = ids.filter((b) => !LANDS.includes(b as BiomeId) && b !== 'off');
      if (bad.length) return `lands <${LANDS.join('|')}...|off>: unknown ${bad.join(', ')}`;
      inv.filter.lands = ids.includes('off') ? [] : (ids as BiomeId[]);
      inv.show();
      const hits = itemIds.filter((id) => matches(id, null, { lands: inv.filter.lands }));
      return `${hits.length} item(s): ${hits.map((id) => ITEMS[id].name).join(', ')}`;
    }, 'lands [land ...|off]: the inventory\'s land filter (items made from what those lands drop, or their shrine guns); none or off clears it', { ...g, args: () => [...LANDS, 'off'] }),
    command('give', ([id, q]) => {
      const ids = id === 'all' ? itemIds : itemIds.filter((x) => x === id);
      if (!ids.length) return `give <item|all> [quality]: ${itemIds.join(', ')}`;
      let gear = gearSlice.get();
      for (const x of ids) gear = addItem(gear, x, (qs.includes(q) ? q : 'standard') as Quality).gear;
      gearSlice.set(gear);
      if (inv.open) inv.show();
      return `gave ${ids.length} item(s); ${gear.items.length} owned`;
    }, 'give <item|all> [standard|fine|rare|epic|legendary]: add items to the inventory', { ...g, args: () => [...itemIds, 'all', ...qs] }),
    command('mod', ([id, what, slot]) => {
      const gear = gearSlice.get();
      if (!id) return `mod <id> [fit [primary|secondary]] | mod pick [wild]: ${MOD_IDS.join(', ')} (owned: ${ownedMods(gear).join(', ') || 'none'})`;
      if (id === 'pick') {
        const pick = fittedPick(gear, `dev:${gear.items.length}:${(gear.modPicks ?? []).length}`, what === 'wild' ? 3 : 1);
        gearSlice.set({ ...gear, modPicks: [...(gear.modPicks ?? []), pick] });
        return `Hob owes a Fitted mod: ${pick.map((m) => MODS[m].name).join(' or ')} (pick it at his forge: hub panel hob)`;
      }
      if (!isMod(id)) return `mod: unknown ${id}`;
      let g = gear;
      if (!g.items.some((o) => o.id === id)) g = addItem(g, id).gear;
      const m = g.items.find((o) => o.id === id)!;
      gearSlice.set(g);
      if (what === 'fit' || what === 'off') {
        const w = owned(g, g.comm[(slot === 'secondary' ? 'secondary' : 'primary') as CommSlot]);
        if (what === 'off') return inv.unfit(m.uid, true) ? `${MODS[id].name} off its lug` : inv.lastNote;
        if (!w) return `mod: no weapon in the ${slot ?? 'primary'} slot`;
        return inv.fit(m.uid, w.uid, true) ? `${MODS[id].name} fitted on the ${ITEMS[w.id].name} (${lugCount(gearSlice.get())} lug${lugCount(gearSlice.get()) > 1 ? 's' : ''})` : inv.lastNote;
      }
      if (inv.open) inv.show();
      return `${MODS[id].name}: in the inventory`;
    }, 'mod [<id> [fit|off [primary|secondary]] | pick [wild]]: give a weapon mod, fit it on the weapon in a slot (ignores the mission lock), or owe Hob a Fitted-mod pick', { ...g, args: () => [...MOD_IDS, 'pick', 'fit', 'off', 'primary', 'secondary', 'wild'] }),
    command('tuneup', ([n]) => {
      const gear = gearSlice.get(), k = Math.max(0, Math.floor(Number(n ?? 1)) || 0);
      gearSlice.set({ ...gear, tunes: (gear.tunes ?? 0) + k });
      if (inv.open) inv.show();
      return `Gasket owes ${gearSlice.get().tunes ?? 0} Tune-up(s); worn pieces he can tune: ${tunable(gearSlice.get()).map((o) => ITEMS[o.id].name).join(', ') || 'none'} (pick at his clinic: hub panel gasket)`;
    }, 'tuneup [n]: owe Gasket n Tune-ups (his repeatable job pays one), picked at his clinic', { ...g, args: () => ['1', '2'] }),
    command('lugs', ([n]) => `${inv.setLugs(Number(n) >= 2 ? 2 : 1)} lug(s) on every weapon`, 'lugs [1|2]: how many lugs every weapon has (Hob\'s second lug is a quest reward)', { ...g, args: () => ['1', '2'] }),
    command('wear', ([id, who, slot]) => {
      const gear = gearSlice.get();
      const worn = (x: Owned) => (wornAt(gear, x.uid) ? 1 : 0); // a copy not worn yet first, so one piece can go on several roles
      const o = gear.items.filter((x) => x.id === id).sort((a, b) => worn(a) - worn(b) || QUALITY_ORDER.indexOf(b.q) - QUALITY_ORDER.indexOf(a.q))[0];
      if (!o) return `not owned: ${id} (give it first)`;
      const d = ITEMS[o.id];
      const w = (who ?? (d.weapon || d.comm ? 'comm' : 'guard')) as 'comm' | CrewRole;
      const s = (slot ?? (w === 'comm' ? (d.weapon ? 'primary' : d.comm) : d.bot)) as CommSlot | BotSlot;
      return inv.wear(o.uid, w, s) ? `wearing ${d.name} (${w}, ${s})` : `cannot: ${inv.lastNote}`;
    }, 'wear <item> [comm|gatherer|guard|repairer] [slot]: wear the best one owned', { ...g, args: () => [...itemIds, 'comm', ...CREW_ROLES, ...COMM_SLOTS, ...BOT_SLOTS] }),
    command('mats', ([n]) => {
      const k = Number(n ?? 1);
      fill(500 * k, 5 * k);
      if (inv.open) inv.show();
      return `added ${500 * k} scrap, ${5 * k} of every part`;
    }, 'mats [k]: add k x (500 scrap, 5 of every part) for crafting', g),
    command('craft', ([id]) => {
      if (!(id in ITEMS)) return `craft <item>: ${itemIds.join(', ')}`;
      const r = inv.make(id as ItemId);
      return r ? `crafted ${QUALITIES[r.q].name} ${ITEMS[r.id].name}` : inv.lastNote;
    }, 'craft <item>: craft it at the workbench (aboard only)', { ...g, args: () => itemIds }),
  ];
  return () => unsubs.forEach((u) => u());
}
