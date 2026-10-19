/**
 * The Dry dock on screen (`dock.ts` holds its rules; the kit is `../manage/`): the roster on the left (the Communicator, each robot type
 * owned), the drawing in the middle (slot plates round the figure; under it the cards and chassis, or the type's robots), the drawer on
 * the right (slot-first: what fits the picked slot, in the stores, can be made, on the Trader's shelf; and a Recipes tab).
 *
 * It is the inventory's first tab (`Inventory.show('dock')`, I): the inventory owns open and close, so every "is a panel open" check holds.
 * It changes nothing itself: wearing, crafting and salvage go through the inventory (`inv.wear`, `make`, `scrapIt`, `fit`), buying through
 * the Trader's stall, the robots through the workshop's rules, all via `DockHost`. Aboard only: crafting, buying, cards, mods, relics and
 * the robots; in a mission wearing works and the rest says it waits for the Wanderer.
 *
 * Attention (design.md, Minos): one strong signal a state, the picked plate and the drawer's best main button (`bestOf`); after an
 * action the plate rings green and one typed line says what happened; nothing else moves.
 */
import { promptText } from '../../../../harness/kit';
import { ROLES, type PartKind } from '../sim/defs';
import { CHASSIS, CHASSIS_IDS, RANK_MAX, RANK_NAMES } from '../sim/bots';
import {
  BOT_SLOTS, ITEMS, QUALITIES, SKILLS, SLOT_NAMES, STATS, commSlots, gearMods, hasAntenna, lugCount, modsOn, owned, scaled, shortfall,
  type BotSlot, type CommSlot, type CrewRole, type Gear, type GearStat, type ItemId, type Owned, type Stats,
} from '../sim/gear';
import { isBotType, SPECS, type BotType, type SpecId } from '../sim/specs';
import { RELICS, isRelic, relicName, type RelicId } from '../sim/junk';
import { commKeys, cardOf, fit as fitCard, slotName, typeSlot, unfit as unfitCard, POOL_NAMES, type Card } from '../hub/research';
import { researchSave } from '../hub/researchslice';
import { STOCK, holesSvg, pcClass, pcStyle } from '../hub/punchcard';
import { gear as gearSlice } from '../hub/carry';
import { roster as rosterSlice, PROMOTE, RANK_COST, STOKE_COST, SALVAGE, BODY, costText, rankUp, rebuild, rebuildAll, repairAll, repairDowned, promote, salvage as salvageBot, stoke, stokeAll, type RosterBot, type Shop } from '../hub/workshop';
import { benchRelics, fit as fitRelic, offerJunk, offerable, sellJunk, unfit as unfitRelic, junkPrice, type Source as RelicSource } from '../hub/relics';
import { gaugesOf, profile } from '../hub/deeds';
import { JUNK } from '../sim/junk';
import type { Inventory } from '../inventory';
import { G, SLOT_GLYPH, STAT_GLYPH, glyph } from '../manage/glyphs';
import { itemWords, statText, weaponNumbers, type Chip } from '../manage/gearwords';
import { btn, chipHtml, counter, drawer, drawerTab, esc, fr, group, keycap, note, plate, stamp, tag, who as whoHtml } from '../manage/manage';
import { Tips, Tooltip } from '../manage/tooltip';
import type { Art } from '../manage/art';
import {
  FROM_NAMES, bestOf, botsOf, bulk, cardsFor, costOf, firstEmpty, gearKey, lugEntries, lugRecipes, openAt, parseSel, partName, recipeList, rosterRows, selOwner, slotEntries, wornIn, wornOnly,
  type Ctx, type Entry, type From, type Sel, type Ware, type Who,
} from './dock';
import '../manage/manage.css';
import '../punchcard.css';
import './dock.css';

/** The pictures the dock shows (`../manage/art.ts`). */
export type DockArt = Art;

/** The stores the header counts. */
export interface Stores { scrap: number; copper: number; coal: number; parts: Partial<Record<PartKind, number>> }

export interface DockHost {
  where: 'hub' | 'mission';
  inv: Inventory;
  art: DockArt;
  stores(): Stores;
  /** What the Communicator carries on the sands (a mission). */
  carried?(): { scrap: number };
  sound(k: 'click' | 'equip' | 'craft' | 'deny' | 'ratchet'): void;
  taught?(id: ItemId): boolean;
  /** Aboard: the workshop's books (economy, hub, roster), and keeping what a rule returned. */
  shop?(): Shop;
  keep?(s: Shop): void;
  /** Aboard, with her stall built: the Trader's shelf this lift, and buying one ware (the new item). */
  shelf?(): Ware[];
  buy?(i: number): Owned;
  /** Aboard: the workshop panel (build a robot, deeds, the chassis, parts). */
  workshop?(): void;
}

const plural = (role: CrewRole) => (ROLES[role].name.endsWith('man') ? `${ROLES[role].name.slice(0, -3)}men` : `${ROLES[role].name}s`);
const whoName = (w: Who) => (w === 'comm' ? 'Communicator' : plural(w));
const pct = (k: GearStat, v: number) => statText(k, v);

// The drawing: the figure's box, and where each slot's plate sits ([slot, side, row]) and its leader line ends on the figure.
const DOLL_W = 548, PW = 182, PH = 88, GAP = 4;
const COMM_DOLL: [CommSlot, 0 | 1, number, number, number][] = [['pack', 0, 0, 252, 90], ['primary', 0, 1, 208, 132], ['arm', 0, 2, 230, 172], ['legs', 0, 3, 268, 262], ['head', 1, 0, 316, 74], ['core', 1, 1, 306, 146], ['secondary', 1, 2, 338, 202], ['rear', 1, 3, 322, 244]];
const BOT_DOLL: [BotSlot, 0 | 1, number, number, number][] = [['head', 0, 0, 274, 64], ['back', 0, 1, 236, 150], ['arms', 1, 0, 316, 132], ['mobility', 1, 1, 276, 226]];
const BOT_TOP = [16, 168];
const plateXY = (bot: boolean, side: number, row: number) => [side ? DOLL_W - PW : 0, bot ? BOT_TOP[row] : row * (PH + GAP)];

export class DryDock {
  open = false;
  from: From = 'key';
  sel: Who = 'comm';
  slot: string | null = null;
  tab: 'slot' | 'recipes' = 'slot';
  search = '';
  /** The slot just fitted: its plate rings green until the next pick. */
  fresh: string | null = null;
  private msg: { html: string; bad: boolean } | null = null;
  /** A robot whose Take apart was pressed once (the second press does it). */
  private armed: string | null = null;
  private el: HTMLElement | null = null;
  private tips = new Tips();
  private tip: Tooltip | null = null;

  constructor(private root: HTMLElement, private host: DockHost) {}

  // ---- open, close, state ----

  /** Open (or redraw) on a way in (`openAt`), or on an entry and slot. */
  show(at?: { from?: From; sel?: Who; slot?: string | null }) {
    if (at?.from) {
      const o = openAt(at.from, rosterSlice.get(), gearSlice.get());
      this.from = at.from;
      this.sel = at.sel ?? o.sel;
      this.slot = at.slot !== undefined ? at.slot : o.slot;
      this.tab = 'slot';
      this.msg = null;
      this.fresh = null;
    } else if (at?.sel) {
      this.sel = at.sel;
      this.slot = at.slot ?? null;
      this.tab = 'slot';
    }
    this.open = true;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.className = 'ui-backdrop dk-backdrop mg';
      this.el.addEventListener('click', (e) => this.click(e));
      this.el.addEventListener('keydown', (e) => this.key(e));
      this.el.addEventListener('input', (e) => this.typed(e));
      this.el.addEventListener('dragstart', (e) => this.dragStart(e));
      this.el.addEventListener('dragover', (e) => this.dragOver(e));
      this.el.addEventListener('dragleave', (e) => (e.target as HTMLElement).closest?.('[data-socket], [data-plate]')?.classList.remove('is-over'));
      this.el.addEventListener('drop', (e) => this.drop(e));
      this.root.appendChild(this.el);
      this.tip = new Tooltip(this.el, this.tips);
    }
    this.render();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.tip?.destroy();
    this.tip = null;
    this.el?.remove();
    this.el = null;
    this.armed = null;
  }

  refresh() {
    if (this.open) this.render();
  }

  /** For `debugState()` and the dev commands: what is open, picked, and what the drawer offers. */
  state() {
    const sel = parseSel(this.slot);
    let groups: Record<string, string[]> | null = null;
    if (sel?.kind === 'gear') {
      const e = slotEntries(this.ctx(), sel);
      const name = (x: Entry) => `${x.src}:${x.id}${x.q !== 'standard' ? `(${x.q})` : ''}${x.short ? ' short' : ''}`;
      groups = { worn: e.worn ? [e.worn.id] : [], stores: e.owned.map(name), made: e.craft.map(name), shelf: e.buy.map(name), best: [bestOf(e)?.id ?? ''] };
    }
    return { open: this.open, from: this.from, entry: this.sel, slot: this.slot, tab: this.tab, fresh: this.fresh, note: this.msg?.html.replace(/<[^>]+>/g, '') ?? '', groups, tip: this.tip?.state() ?? null };
  }

  /** Hold Alt (tests and the dev command): the tooltip's third level. */
  alt(on: boolean) {
    this.tip?.setAlt(on);
  }

  /** Show the tooltip of the element a selector finds (dev `dock tip`); returns its text. */
  hoverOn(selector: string) {
    const el = this.el?.querySelector<HTMLElement>(selector) ?? null;
    this.tip?.hover(el);
    return this.tip?.state().text ?? '';
  }

  private get aboard() {
    return this.host.where === 'hub';
  }

  private ctx(): Ctx {
    const st = this.host.stores();
    return { gear: gearSlice.get(), wallet: { scrap: st.scrap, parts: st.parts }, aboard: this.aboard, taught: this.host.taught, shelf: this.aboard ? this.host.shelf?.() ?? [] : [] };
  }

  // ---- actions (the dev commands call these too) ----

  /** Pick a roster entry: its first empty slot opens by itself (none: the drawer says "Pick a slot"). */
  pick(w: Who) {
    this.sel = w;
    this.slot = w === 'comm' ? null : firstEmpty(gearSlice.get(), w);
    this.tab = 'slot';
    this.fresh = null;
    this.msg = null;
    this.render();
  }

  /** Pick a slot (a gear slot, a lug, a card slot, a relic socket, a robot). */
  pickSlot(key: string) {
    const s = parseSel(key);
    if (!s) return;
    const owner = selOwner(s, rosterSlice.get());
    if (owner) this.sel = owner;
    this.slot = key;
    this.tab = 'slot';
    this.fresh = null;
    this.msg = null;
    this.render();
  }

  /** Take a drawer entry into the picked gear slot: fit (or swap, move), craft and fit, buy and fit. Returns whether it is worn. */
  take(src: string, ref: string) {
    const s = parseSel(this.slot);
    if (s?.kind !== 'gear') return this.fail('Pick a slot first.');
    const inv = this.host.inv;
    const g0 = gearSlice.get();
    const was = wornIn(g0, s);
    let o: Owned | undefined;
    if (src === 'craft') {
      const made = inv.make(ref as ItemId);
      if (!made) return this.fail(esc(inv.lastNote));
      o = made;
    } else if (src === 'buy') {
      if (!this.host.buy) return this.fail('The Trader sells aboard, at her stall.');
      try {
        o = this.host.buy(Number(ref));
      } catch (e) {
        return this.fail(esc(cap((e as Error).message)));
      }
    } else o = owned(g0, Number(ref));
    if (!o) return this.fail('Not in the stores.');
    const other = src === 'swap' || src === 'move' ? wornAtKey(g0, o.uid) : null;
    const otherWhere = other ? whereName(other) : '';
    if (!inv.wear(o.uid, s.who, s.slot)) return this.fail(`${src === 'craft' || src === 'buy' ? `${esc(ITEMS[o.id].name)} is in the stores, but ` : ''}${esc(inv.lastNote)}`);
    const name = `${esc(ITEMS[o.id].name)}${ITEMS[o.id].mod ? '' : ` (${QUALITIES[o.q].name})`}`;
    const verb = src === 'craft' ? 'made and fitted' : src === 'buy' ? 'bought and fitted' : 'fitted';
    const after = src === 'swap' && was ? `; ${esc(ITEMS[was.id].name)} to ${otherWhere}` : src === 'move' ? `; off the ${otherWhere}${was ? `, ${esc(ITEMS[was.id].name)} to the stores` : ''}` : was ? `; ${esc(ITEMS[was.id].name)} to the stores` : '';
    const all = s.who === 'comm' ? '' : `; all ${botsOf(rosterSlice.get(), s.who).length} ${plural(s.who).toLowerCase()} wear it`;
    this.done(`${frSmall(this.host.art.item(o.id))} <b>${name}</b> ${verb} in ${SLOT_NAMES[s.slot].toLowerCase()}${after}${all}.`, this.slot, src === 'craft' ? 'craft' : 'equip');
    return true;
  }

  /** Take the first drawer entry of an item (dev, tests): `src` narrows it (owned, swap, move, craft, buy). */
  takeById(id: ItemId, src?: string) {
    const s = parseSel(this.slot);
    if (s?.kind !== 'gear') return this.fail('Pick a slot first.');
    const e = slotEntries(this.ctx(), s);
    const x = [...e.owned, ...e.craft, ...e.buy].find((y) => y.id === id && (!src || y.src === src));
    if (!x) return this.fail(`No ${esc(ITEMS[id].name)} in this slot's drawer.`);
    return this.take(x.src, x.src === 'craft' ? x.id : x.src === 'buy' ? String(x.shelf) : String(x.uid));
  }

  /** Take the picked slot's piece off (to the stores). */
  takeOff() {
    const s = parseSel(this.slot);
    if (s?.kind !== 'gear') return false;
    const o = wornIn(gearSlice.get(), s);
    if (!o) return false;
    if (!this.host.inv.takeOff(o.uid)) return this.fail(esc(this.host.inv.lastNote));
    this.done(`${esc(ITEMS[o.id].name)} to the stores.`, null, 'click');
    return true;
  }

  /** Take an owned piece apart for half its recipe's scrap (aboard). The first press asks. */
  salvageItem(uid: number) {
    const o = owned(gearSlice.get(), uid);
    if (!o) return false;
    const key = `item:${uid}`;
    if (this.armed !== key) {
      this.armed = key;
      this.msg = { html: `Take the ${esc(ITEMS[o.id].name)} apart for good? Press Salvage again.`, bad: true };
      this.host.sound('click');
      this.render();
      return false;
    }
    this.armed = null;
    const scrap = this.host.inv.scrapIt(uid);
    if (scrap === null) return this.fail(esc(this.host.inv.lastNote));
    this.done(`${esc(ITEMS[o.id].name)} salvaged: ${scrap} scrap.`, null, 'click');
    return true;
  }

  /** Craft a recipe into the stores (the Recipes tab). */
  craft(id: ItemId) {
    const made = this.host.inv.make(id);
    if (!made) return this.fail(esc(this.host.inv.lastNote));
    this.done(`${frSmall(this.host.art.item(id))} <b>${esc(ITEMS[id].name)}</b>${ITEMS[id].mod ? '' : `, ${QUALITIES[made.q].name}`}: made, in the stores.`, null, 'craft');
    return true;
  }

  /** Fit an owned mod on the picked lug (aboard), or craft one and fit it. */
  fitMod(src: 'owned' | 'craft', ref: string) {
    const s = parseSel(this.slot);
    if (s?.kind !== 'lug') return false;
    const inv = this.host.inv;
    const w = owned(gearSlice.get(), gearSlice.get().comm[s.weapon]);
    if (!w) return this.fail('No weapon in that hand.');
    let m: Owned | null | undefined = src === 'owned' ? owned(gearSlice.get(), Number(ref)) : inv.make(ref as ItemId);
    if (!m) return this.fail(esc(inv.lastNote || 'Not in the stores.'));
    // A lug holds one: the mod on it now comes off first.
    const on = modsOn(gearSlice.get(), w.uid)[s.i];
    if (on && on.uid !== m.uid) inv.unfit(on.uid);
    if (!inv.fit(m.uid, w.uid)) return this.fail(esc(inv.lastNote));
    m = owned(gearSlice.get(), m.uid)!;
    this.done(`${esc(ITEMS[m.id].name)} on the ${esc(ITEMS[w.id].name)}.`, this.slot, 'equip');
    return true;
  }
  unfitMod(uid: number) {
    if (!this.host.inv.unfit(uid)) return this.fail(esc(this.host.inv.lastNote));
    this.done(`${esc(ITEMS[owned(gearSlice.get(), uid)!.id].name)} off its lug.`, null, 'click');
    return true;
  }

  /** Fit a card in the picked card slot, or take it out (aboard). */
  card(id: string, out = false) {
    const s = parseSel(this.slot);
    if (s?.kind !== 'card') return false;
    if (!this.aboard) return this.fail('Cards are fitted aboard the Wanderer: the slots are locked on the sands.');
    try {
      const r = researchSave.get();
      researchSave.set(out ? unfitCard(r, id) : fitCard(r, id, s.key));
    } catch (e) {
      return this.fail(esc(cap((e as Error).message)));
    }
    this.done(`${esc(cardOf(id)!.name)} ${out ? 'taken out' : `in ${slotName(s.key).toLowerCase()}`}.`, out ? null : this.slot, 'equip');
    return true;
  }

  /** A workshop rule on the books (aboard): stoke, repair, rebuild, rank, promote, the bulk buttons, relics. */
  private shopDo(f: (s: Shop) => Shop & { n?: number; stopped?: boolean }, said: (s: Shop & { n?: number; stopped?: boolean }) => string, fresh: string | null = null) {
    if (!this.host.shop || !this.host.keep) return this.fail('The robots are looked after aboard the Wanderer.');
    try {
      const r = f(this.host.shop());
      this.host.keep(r);
      this.done(said(r), fresh, 'ratchet');
      return true;
    } catch (e) {
      return this.fail(esc(cap((e as Error).message)));
    }
  }
  private botName = (uid: string) => esc(rosterSlice.get().bots.find((b) => b.uid === uid)?.name ?? uid);
  stokeBot(uid: string) {
    return this.shopDo((s) => stoke(s, uid), (r) => `${this.botName(uid)} ${(r as Shop & { on: boolean }).on ? 'is stoked for the next landing' : 'is cold again: coal back'}.`);
  }
  repairBot(uid: string) {
    return this.shopDo((s) => repairDowned(s, uid), () => `${this.botName(uid)} is repaired: it rides again.`);
  }
  rebuildBot(uid: string) {
    return this.shopDo((s) => rebuild(s, uid), () => `${this.botName(uid)} is rebuilt, rank kept.`);
  }
  rankBot(uid: string) {
    return this.shopDo((s) => rankUp(s, uid), () => `${this.botName(uid)}: ${RANK_NAMES[rosterSlice.get().bots.find((b) => b.uid === uid)!.rank]}.`, `bot:${uid}`);
  }
  promoteBot(uid: string, spec: SpecId) {
    return this.shopDo((s) => promote(s, uid, spec), () => `${this.botName(uid)} is a ${SPECS[spec].name} for good.`, `bot:${uid}`);
  }
  bulkDo(what: 'stoke' | 'repair' | 'rebuild') {
    const f = what === 'stoke' ? stokeAll : what === 'repair' ? repairAll : rebuildAll;
    const word = what === 'stoke' ? 'stoked' : what === 'repair' ? 'repaired' : 'rebuilt';
    const out = what === 'stoke' ? 'out of coal' : 'out of scrap';
    return this.shopDo(f, (r) => `${r.n} robot${r.n === 1 ? '' : 's'} ${word}${r.stopped ? `: ${out}` : ''}.`);
  }
  /** Take a robot apart (aboard). The first press asks. */
  salvageBot(uid: string) {
    const b = rosterSlice.get().bots.find((x) => x.uid === uid);
    if (!b) return false;
    if (this.armed !== `bot:${uid}`) {
      this.armed = `bot:${uid}`;
      this.msg = { html: `Take ${esc(b.name)} apart for ${Math.floor(BODY[b.role].scrap * SALVAGE)} scrap? Press again: it cannot be undone.`, bad: true };
      this.host.sound('click');
      this.render();
      return false;
    }
    this.armed = null;
    const ok = this.shopDo((s) => salvageBot(s, uid), (r) => `${esc(b.name)} taken apart: ${(r as Shop & { scrap: number }).scrap} scrap.`);
    if (ok && this.slot === `bot:${uid}`) this.slot = null;
    this.render();
    return ok;
  }
  /** Fit a relic from the stores (`junk:<i>`, `part:<kind>`) or another robot's socket (`bot:<uid>`) to a robot (aboard). */
  fitRelic(uid: string, from: string) {
    const i = from.indexOf(':');
    const kind = from.slice(0, i), v = from.slice(i + 1);
    const src: RelicSource | null = kind === 'junk' ? { junk: Number(v) } : kind === 'part' ? { part: v as PartKind } : kind === 'bot' ? { bot: v } : null;
    if (!src) return false;
    return this.shopDo((s) => fitRelic(s, uid, src), (r) => `${this.botName(uid)} wears ${esc(the(relicName(r.roster.bots.find((b) => b.uid === uid)!.relic!)))}.`, `relic:${uid}`);
  }
  unfitRelic(uid: string) {
    return this.shopDo((s) => unfitRelic(s, uid), () => `${this.botName(uid)}'s relic is back in the stores.`);
  }
  sellRelic(junk: number) {
    return this.shopDo((s) => sellJunk(s, junk), (r) => `The Trader takes ${esc(the(relicName((r as Shop & { id: string }).id)))}: ${(r as Shop & { scrap: number }).scrap} scrap.`);
  }
  offerRelic(junk: number) {
    return this.shopDo((s) => offerJunk(s, junk), (r) => `The Oracle accepts ${esc(the(relicName((r as Shop & { id: string }).id)))}: ${JUNK.offer} scrap.`);
  }

  private done(html: string, fresh: string | null, sound: 'equip' | 'craft' | 'click' | 'ratchet') {
    this.msg = { html, bad: false };
    this.fresh = fresh;
    this.armed = null;
    this.host.sound(sound);
    this.render();
  }
  private fail(html: string) {
    this.msg = { html, bad: true };
    this.host.sound('deny');
    this.render();
    return false;
  }

  // ---- input ----

  private click(e: MouseEvent) {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) return;
    const d = t.dataset;
    if (d.act !== 'salvage' && d.act !== 'apart') this.armed = null;
    switch (d.act) {
      case 'close': return this.host.inv.hide();
      case 'inv': return this.host.inv.show(d.tab as 'cards');
      case 'workshop': return this.host.workshop?.();
      case 'who': this.host.sound('click'); return this.pick(d.who as Who);
      case 'slot': this.host.sound('click'); return this.pickSlot(d.key!);
      case 'tab': this.tab = d.tab as 'slot' | 'recipes'; this.msg = null; this.host.sound('click'); return this.render();
      case 'take': this.take(d.src!, d.ref!); return;
      case 'off': this.takeOff(); return;
      case 'salvage': this.salvageItem(Number(d.uid)); return;
      case 'craft': this.craft(d.id as ItemId); return;
      case 'mod': this.fitMod(d.src as 'owned' | 'craft', d.ref!); return;
      case 'unmod': this.unfitMod(Number(d.uid)); return;
      case 'card': this.card(d.id!, d.out === '1'); return;
      case 'stoke': this.stokeBot(d.uid!); return;
      case 'repair': this.repairBot(d.uid!); return;
      case 'rebuild': this.rebuildBot(d.uid!); return;
      case 'rank': this.rankBot(d.uid!); return;
      case 'promote': this.promoteBot(d.uid!, d.spec as SpecId); return;
      case 'bulk': this.bulkDo(d.what as 'stoke'); return;
      case 'apart': this.salvageBot(d.uid!); return;
      case 'relic': this.fitRelic(d.uid!, d.from!); return;
      case 'unrelic': this.unfitRelic(d.uid!); return;
      case 'sell': this.sellRelic(Number(d.junk)); return;
      case 'offer': this.offerRelic(Number(d.junk)); return;
    }
  }
  /** Enter or Space on a plate (a div acting as a button: it holds its lug buttons). */
  private key(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if ((e.key === 'Enter' || e.key === ' ') && t.getAttribute('role') === 'button' && t.dataset.act) {
      e.preventDefault();
      t.click();
    }
  }
  private typed(e: Event) {
    const box = e.target as HTMLInputElement;
    if (!box.matches('[data-search]')) return;
    this.search = box.value;
    // Only the list redraws, so the box keeps its focus.
    const list = this.el?.querySelector('.dk-recipes');
    if (list) list.innerHTML = this.recipeRows();
  }

  // Drag: a relic tile or a worn socket onto a robot's socket (`junk:`, `part:`, `bot:`); a drawer entry onto a slot plate (`fit:<src>:<ref>`),
  // the same action as its button.
  private dragStart(e: DragEvent) {
    const t = (e.target as HTMLElement).closest?.('[data-drag]') as HTMLElement | null;
    if (!t) return;
    const what = t.dataset.drag!;
    e.dataTransfer?.setData('text/plain', what);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    this.tip?.hover(null);
    this.el?.querySelectorAll(what.startsWith('fit:') ? '[data-plate]' : '[data-socket]').forEach((s) => s.classList.add('is-target'));
  }
  private dragOver(e: DragEvent) {
    const t = (e.target as HTMLElement).closest?.('[data-socket], [data-plate]') as HTMLElement | null;
    if (!t) return;
    e.preventDefault();
    t.classList.add('is-over');
  }
  private drop(e: DragEvent) {
    this.el?.querySelectorAll('.is-target, .is-over').forEach((s) => s.classList.remove('is-target', 'is-over'));
    const t = (e.target as HTMLElement).closest?.('[data-socket], [data-plate]') as HTMLElement | null;
    const from = e.dataTransfer?.getData('text/plain');
    if (!t || !from) return;
    e.preventDefault();
    if (t.dataset.plate) return from.startsWith('fit:') ? this.dropOn(t.dataset.plate, from) : undefined;
    if (from.startsWith('fit:') || from === `bot:${t.dataset.socket}`) return;
    this.fitRelic(t.dataset.socket!, from);
  }
  /** A drawer entry dropped on a plate: that slot's drawer must offer the same piece, then it is taken as the button would. */
  private dropOn(key: string, from: string) {
    const [, src, ref] = from.split(':');
    const s = parseSel(key);
    if (s?.kind !== 'gear') return;
    this.pickSlot(key);
    const e = slotEntries(this.ctx(), s);
    const home = [...e.owned, ...e.craft, ...e.buy].find((x) => (src === 'craft' ? x.src === 'craft' && x.id === ref : src === 'buy' ? x.src === 'buy' && String(x.shelf) === ref : x.src !== 'craft' && x.src !== 'buy' && String(x.uid) === ref));
    if (!home) return void this.fail(`That does not fit the ${esc(SLOT_NAMES[s.slot].toLowerCase())}.`);
    this.take(home.src, src === 'craft' ? home.id : src === 'buy' ? String(home.shelf) : String(home.uid));
  }

  // ---- drawing ----

  private render() {
    if (!this.el) return;
    if (!this.el.isConnected) this.root.appendChild(this.el);
    this.tips.clear();
    const scroll = this.el.querySelector('.mg-drawer__list')?.scrollTop ?? 0;
    const sameSlot = this.el.dataset.slot === `${this.slot}|${this.tab}`;
    this.el.dataset.slot = `${this.slot}|${this.tab}`;
    const focus = document.activeElement === this.el.querySelector('[data-search]');
    const panel = `<div class="dk-panel" role="dialog" aria-label="Dry dock">${this.head()}<div class="dk">${this.roster()}${this.sheet()}${this.drawerHtml()}</div></div>`;
    // The tooltip element stays (it is the Tooltip's); the panel is replaced.
    this.el.querySelector('.dk-panel')?.remove();
    this.el.insertAdjacentHTML('afterbegin', panel);
    const list = this.el.querySelector('.mg-drawer__list');
    if (list && sameSlot) list.scrollTop = scroll;
    if (focus) {
      const box = this.el.querySelector<HTMLInputElement>('[data-search]');
      box?.focus();
      box?.setSelectionRange(box.value.length, box.value.length);
    }
    this.tip?.redrawn();
  }

  private head() {
    const st = this.host.stores();
    const parts = Object.values(st.parts).reduce((n: number, v) => n + (v ?? 0), 0);
    const art = this.host.art;
    const c = this.host.carried?.();
    const counters = [
      counter(fr(art.scrap(), 'xs'), st.scrap, this.tips.text('Scrap in the stores')),
      counter(fr(art.copper(), 'xs'), st.copper, this.tips.text('Copper in the stores')),
      counter(glyph(G.coal), st.coal, this.tips.text('Coal in the stores')),
      counter(glyph(G.parts), parts, this.tips.text('Parts in the stores')),
      c ? counter(`${fr(art.scrap(), 'xs')}<small>on you</small>`, c.scrap, this.tips.text('Scrap you carry: it goes into the stores when the lift docks')) : '',
    ].join('');
    const tabs = (['cards', 'stats', 'mats', 'bench'] as const).map((t) => btn({ cards: 'Cards', stats: 'Stats', mats: 'Materials', bench: 'Workbench' }[t], { faint: true, data: { act: 'inv', tab: t }, cls: 'dk-invtab' })).join('');
    const from = FROM_NAMES[this.from] || (this.aboard ? '' : 'on the sands');
    return `<div class="dk-head"><div class="mg-brass dk-head__plate">Dry dock</div><span class="dk-head__from">${esc(from)}</span><nav class="dk-head__inv" aria-label="Inventory">${tabs}</nav>
      <div class="mg-counters">${counters}</div>${btn(`${keycap(promptText('{esc}'))} Close`, { data: { act: 'close' }, cls: 'dk-close' })}</div>`;
  }

  private roster() {
    const ro = rosterSlice.get(), g = gearSlice.get();
    const t = this.tips;
    const rows = rosterRows(ro, g).map((r) => {
      if (r.who === 'comm') return whoHtml({ pic: this.host.art.portrait(), name: 'Communicator', sel: this.sel === 'comm', data: { act: 'who', who: 'comm' }, tip: t.text('You: your weapons, body parts and cards') }) + '<div class="dk-roster__sep"></div>';
      const chips = [
        r.wreck ? `<span class="mg-down"${t.text(`${r.wreck} a wreck`)}>${glyph(G.wreck, 'mg-g--s')}${r.wreck}</span>` : '',
        r.down ? `<span class="mg-down"${t.text(`${r.down} down`)}>${glyph(G.down, 'mg-g--s')}${r.down}</span>` : '',
        this.aboard && r.cold ? `<span${t.text(`${r.cold} not stoked`)}>${glyph(G.coal, 'mg-g--s')}${r.cold}</span>` : '',
        r.empty.length ? `<span${t.text(`Empty: ${r.empty.map((s) => SLOT_NAMES[s].toLowerCase()).join(', ')}`)}>${fr(null, 'xs')}${r.empty.length}</span>` : '',
      ].join('');
      return whoHtml({ pic: this.host.art.crew(r.who), name: plural(r.who), n: `×${r.n}`, state: chips, sel: this.sel === r.who, data: { act: 'who', who: r.who } });
    });
    let foot = '';
    if (this.aboard && this.host.shop) {
      const b = bulk(ro, this.host.shop().hub);
      const st = this.host.stores();
      foot = `<div class="dk-roster__bulk">
        ${btn(`${glyph(G.coal)} Stoke all`, { data: { act: 'bulk', what: 'stoke' }, disabled: !b.stoke.n || st.coal < STOKE_COST.coal, small: `${b.stoke.coal} coal`, tip: t.text(`Stoke every robot that rides and is cold: ${STOKE_COST.coal} coal each, in order, until the coal runs out`) })}
        ${btn(`${glyph(G.wrench)} Repair all`, { data: { act: 'bulk', what: 'repair' }, disabled: !b.repair.n || st.scrap < b.repair.each, small: `${b.repair.scrap} scrap`, tip: t.text(`Repair every robot carried home down: ${b.repair.each} scrap each, in order, until the scrap runs out`) })}
        ${btn(`${glyph(G.rebuild)} Rebuild all`, { data: { act: 'bulk', what: 'rebuild' }, disabled: !b.rebuild.n || st.scrap < b.rebuild.each, small: `${b.rebuild.scrap} scrap`, tip: t.text(`Rebuild every wreck: ${b.rebuild.each} scrap each, rank kept, until the scrap runs out`) })}
        ${this.host.workshop ? btn('Build, deeds, chassis', { faint: true, data: { act: 'workshop' }, cls: 'dk-roster__shop', tip: t.text('The workshop: build a robot, its deeds, your chassis, the parts') }) : ''}
      </div>`;
    } else if (!this.aboard) foot = '<p class="dk-roster__hint">Robots are stoked, repaired and rebuilt aboard.</p>';
    return `<div class="dk-roster mg-well">${rows.join('')}${foot}</div>`;
  }

  private sheet() {
    const g = gearSlice.get();
    const comm = this.sel === 'comm';
    const role = this.sel as CrewRole;
    const doll = comm ? COMM_DOLL : BOT_DOLL;
    const src = comm ? this.host.art.hero() : this.host.art.crew(role);
    const leaders = doll
      .map(([, side, row, ax, ay]) => {
        const [x, y] = plateXY(!comm, side, row);
        const sx = side ? x : PW, sy = y + PH / 2;
        return `<path class="dk-lead" d="M${sx} ${sy} L${ax} ${ay}"/><circle class="dk-lead-dot" cx="${ax}" cy="${ay}" r="3.5"/>`;
      })
      .join('');
    const plates = doll.map(([slot, side, row]) => this.plateOf(comm ? 'comm' : role, slot, `dk-at--${comm ? 'c' : 'b'}${side ? 'r' : 'l'}${row}`)).join('');
    const figure = `<div class="dk-paint dk-paint--${comm ? 'comm' : 'bot'}"><img src="${src}" alt="" draggable="false"></div>`;
    const svg = `<svg class="dk-leads" viewBox="0 0 ${DOLL_W} 364" aria-hidden="true">${leaders}</svg>`;
    if (comm) {
      const r = researchSave.get();
      const cards = commKeys(r).map((k) => this.cardSlot(k)).join('');
      const heart = commSlots(g).includes('heart') ? `<div class="dk-heart">${this.plateOf('comm', 'heart', '')}</div>` : '';
      const ro = rosterSlice.get();
      const chassis = CHASSIS_IDS.map((id) => {
        const lv = ro.chassis[id] ?? 0, C = CHASSIS[id];
        const per = (Object.entries(C.per) as [GearStat, number][]).map(([k, v]) => `${STATS[k].name} ${pct(k, v)}`).join(', ');
        return `<div class="dk-chassis__row"${this.tips.text(`${C.name}: level ${lv} of ${C.max}. Each level: ${per}. Levelled at the workshop.`)}>${glyph(chassisGlyph(id))}<span>${esc(C.name)}</span><span class="dk-pips">${'●'.repeat(lv)}${'○'.repeat(C.max - lv)}</span></div>`;
      }).join('');
      return `<div class="dk-sheet mg-stock"><div class="dk-title"><b>The Communicator</b>fig. 1</div><div class="dk-doll">${figure}${svg}${plates}</div>
        <div class="dk-under"><div class="dk-cards">${cards}</div><div class="dk-side">${heart}<div class="dk-chassis"><h4>Chassis</h4>${chassis}</div></div></div></div>`;
    }
    const bots = botsOf(rosterSlice.get(), role);
    const typeCard = isBotType(role) ? `<div class="dk-typecard">${this.cardSlot(typeSlot(role as BotType), 'Type card')}</div>` : '';
    return `<div class="dk-sheet mg-stock"><div class="dk-title"><b>${esc(plural(role))}</b>all ${bots.length} wear this</div><div class="dk-doll">${figure}${svg}${plates}${typeCard}</div>
      <div class="dk-under dk-under--bots">${bots.map((b) => this.botTag(b)).join('')}</div></div>`;
  }

  /** A slot plate on the drawing (a weapon's carries its lugs). */
  private plateOf(w: Who, slot: CommSlot | BotSlot, at: string) {
    const g = gearSlice.get();
    const key = gearKey(w, slot);
    const o = owned(g, w === 'comm' ? g.comm[slot as CommSlot] : g.bots[w][slot as BotSlot]);
    const slotName = slot === 'primary' ? 'Primary weapon (left click)' : slot === 'secondary' ? 'Secondary weapon (right click)' : SLOT_NAMES[slot];
    const base = { slotGlyph: SLOT_GLYPH[slot], slotTip: this.tips.text(slotName), sel: this.slot === key, fresh: this.fresh === key, data: { act: 'slot', key, plate: key }, cls: `dk-plate ${at}` };
    if (!o) return plate({ ...base, tip: this.tips.text(`${slotName}: nothing worn. Pick it to see what fits.`) });
    const words = itemWords(o.id, o.q, o.tuned);
    const idle = !!ITEMS[o.id].needs && !hasAntenna(g);
    const lugs = w === 'comm' && (slot === 'primary' || slot === 'secondary') && this.aboard ? this.lugs(g, o, slot) : '';
    return plate({ ...base, pic: this.host.art.item(o.id), q: ITEMS[o.id].mod ? undefined : o.q, tuned: o.tuned, name: ITEMS[o.id].name, chips: words.chips, line: words.line, idle, extra: lugs, tip: this.itemTip(o.id, o.q, o.tuned, slotName) });
  }

  /** A weapon's lugs on its plate: each a pip with its mod's picture; picking one opens the lug's drawer. */
  private lugs(g: Gear, w: Owned, slot: 'primary' | 'secondary') {
    const mods = modsOn(g, w.uid);
    return `<span class="mg-plate__lugs">${Array.from({ length: lugCount(g) }, (_, i) => {
      const m = mods[i], key = `lug:${slot}.${i}`;
      return `<button type="button" class="mg-lug${this.slot === key ? ' is-sel' : ''}" data-act="slot" data-key="${key}"${this.tips.text(m ? `${ITEMS[m.id].name} (lug ${i + 1})` : `Lug ${i + 1}: empty. A mod changes how the weapon works.`)}>${m ? `<img src="${this.host.art.item(m.id)}" alt="">` : ''}</button>`;
    }).join('')}</span>`;
  }

  /** A card pocket: the punch card in it, or an empty pocket. */
  private cardSlot(k: string, label = '') {
    const r = researchSave.get();
    const c = r.fit[k] ? cardOf(r.fit[k]) : undefined;
    const key = `card:${k}`;
    const lab = label ? `<div class="dk-cardslot__label">${esc(label)}</div>` : '';
    const face = c
      ? `<div class="${pcClass(c, 'sm')}" ${pcStyle(c)}>${STOCK}<span class="pc__head"><span class="pc__name">${esc(c.name)}</span><span class="pc__tag">${esc(POOL_NAMES[c.pool])} card</span></span>${holesSvg(c.id)}</div>`
      : `<div class="pc pc--sm pc--empty">${STOCK}<span class="pc__head"><span class="pc__name">Empty pocket</span></span></div>`;
    return `<div role="button" tabindex="0" class="dk-cardslot${this.slot === key ? ' is-sel' : ''}${this.fresh === key ? ' is-new' : ''}" data-act="slot" data-key="${key}"${this.tips.text(c ? `${c.name}: ${c.text}` : `${slotName(k)}: empty`)}>${lab}${face}</div>`;
  }

  /** A robot under the drawing: portrait, name and rank, its relic socket, and what it needs (repair, rebuild) or stoke and promote. */
  private botTag(b: RosterBot) {
    const t = this.tips, art = this.host.art;
    const hurt = b.wreck || b.downed;
    const relicKey = `relic:${b.uid}`;
    const sock = b.relic
      ? `<img src="${art.relic(b.relic)}" alt=""${this.aboard ? ` draggable="true" data-drag="bot:${b.uid}"` : ' draggable="false"'}>`
      : '';
    const socket = `<button type="button" class="dk-socket mg-fr mg-fr--s${b.relic ? '' : ' mg-fr--empty'}${this.slot === relicKey ? ' is-sel' : ''}${this.fresh === relicKey ? ' is-new' : ''}" data-act="slot" data-key="${relicKey}"${this.aboard ? ` data-socket="${b.uid}"` : ''}${b.relic ? this.relicTip(b.relic) : t.text('Relic socket: empty. Pick it, or drag a relic here.')}>${sock}</button>`;
    let acts = '';
    if (this.aboard && this.host.shop) {
      const h = this.host.shop().hub;
      const st = this.host.stores();
      const bb = bulk({ ...rosterSlice.get(), bots: [b] }, h);
      if (b.wreck) acts = btn(`${glyph(G.rebuild)} Rebuild`, { data: { act: 'rebuild', uid: b.uid }, disabled: st.scrap < bb.rebuild.each, small: `${bb.rebuild.each}`, tip: t.text(`Rebuild: ${bb.rebuild.each} scrap; rank, calling and relic kept`) });
      else if (b.downed) acts = btn(`${glyph(G.wrench)} Repair`, { data: { act: 'repair', uid: b.uid }, disabled: st.scrap < bb.repair.each, small: `${bb.repair.each}`, tip: t.text(`Repair: ${bb.repair.each} scrap; it rides again`) });
      else acts = btn(`${glyph(G.coal)}${STOKE_COST.coal}`, { on: b.stoked, data: { act: 'stoke', uid: b.uid }, disabled: !b.stoked && st.coal < STOKE_COST.coal, tip: t.text(b.stoked ? 'Stoked for the next landing: click to let it go cold (coal back)' : `Stoke for the next landing: ${STOKE_COST.coal} coal, +30% speed`) });
      acts += btn(`${glyph(G.promote)} ${b.spec ? 'Rank' : 'Promote'}`, { data: { act: 'slot', key: `bot:${b.uid}` }, tip: t.text(b.spec ? `${SPECS[b.spec].name}. Rank, or take it apart` : 'Rank, calling, or take it apart') });
    }
    const st = b.wreck ? stamp('Wreck') : b.downed ? stamp('Down') : '';
    const rank = `${RANK_NAMES[b.rank]}${b.spec ? `, ${SPECS[b.spec].name}` : ''}`;
    return `<div class="dk-bot${this.slot === `bot:${b.uid}` ? ' is-sel' : ''}${this.fresh === `bot:${b.uid}` ? ' is-new' : ''}">${fr(art.crew(b.role), 'm', { dim: hurt })}<div class="dk-bot__who"><div class="dk-bot__name">${esc(b.name)}</div><span class="dk-bot__stars"${t.text(rank)}>${'★'.repeat(b.rank)}${'☆'.repeat(RANK_MAX - b.rank)}</span></div>
      <div class="dk-bot__row">${socket}${acts}</div>${st ? `<span class="dk-bot__stamp">${st}</span>` : ''}</div>`;
  }

  // ---- the drawer ----

  private drawerHtml() {
    const tabs = drawerTab('This slot', this.tab === 'slot', { act: 'tab', tab: 'slot' }) + (this.aboard ? drawerTab('Recipes', this.tab === 'recipes', { act: 'tab', tab: 'recipes' }) : '');
    const foot = note(this.msg?.html ?? '', this.msg?.bad);
    if (this.tab === 'recipes') return drawer({ title: 'Recipes', tabs, list: `<input class="mg-search" data-search type="text" value="${esc(this.search)}" placeholder="Search: a name, or what it is made of" autocomplete="off" spellcheck="false" aria-label="Search recipes"><div class="dk-recipes">${this.recipeRows()}</div>`, foot, cls: 'dk-drawer' });
    const s = parseSel(this.slot);
    let title = '', head = '', list = '';
    if (!s) [title, list] = [esc(whoName(this.sel)), this.summary()];
    else if (s.kind === 'gear') [title, head, list] = this.gearDrawer(s);
    else if (s.kind === 'lug') [title, head, list] = this.lugDrawer(s);
    else if (s.kind === 'card') [title, head, list] = this.cardDrawer(s.key);
    else if (s.kind === 'relic') [title, head, list] = this.relicDrawer(s.uid);
    else [title, head, list] = this.botDrawer(s.uid);
    return drawer({ title, note: head, tabs, list, foot, cls: 'dk-drawer' });
  }

  /** Nothing picked: "Pick a slot", and what the entry's gear gives together (the inventory's old summary). */
  private summary() {
    const m = gearMods(gearSlice.get());
    const lines = (s: Stats) => (Object.entries(s) as [GearStat, number][]).map(([k, v]) => chipHtml({ glyph: STAT_GLYPH[k], value: pct(k, v), name: STATS[k].name, bad: v < 0 }, { tip: this.tips.text(STATS[k].name) })).join('');
    const block = (h: string, body: string) => (body ? `<div class="dk-sum"><h4>${h}</h4><div class="mg-chips">${body}</div></div>` : '');
    const pick = '<p class="mg-empty">Pick a slot.</p>';
    if (this.sel === 'comm') {
      const skills = [m.dash, m.skill].filter(Boolean).map((k) => `<p class="dk-sum__skill"><b>${esc(SKILLS[k!].name)}</b> ${SKILLS[k!].steam} steam${SKILLS[k!].key === 'skill' ? `, ${SKILLS[k!].cd} s` : ''}</p>`).join('');
      return pick + block('What you wear gives', lines(m.comm)) + block('Every robot gets', lines(crewShare())) + (skills ? `<div class="dk-sum"><h4>Skills</h4>${skills}</div>` : '');
    }
    const role = this.sel as CrewRole;
    const auras = m.auras.filter((a) => a.who === role).map((a) => `<p class="dk-sum__skill">Allies within ${a.r} px: ${(Object.entries(a.stats) as [GearStat, number][]).map(([k, v]) => `${pct(k, v)} ${STATS[k].name.toLowerCase()}`).join(', ')}</p>`).join('');
    return pick + block(`${plural(role)} get`, lines(m.roles[role])) + (auras ? `<div class="dk-sum"><h4>Auras</h4>${auras}</div>` : '');
  }

  private gearDrawer(s: Extract<Sel, { kind: 'gear' }>): [string, string, string] {
    const ctx = this.ctx();
    const e = slotEntries(ctx, s);
    const best = bestOf(e);
    const t = this.tips;
    const n = s.who === 'comm' ? 0 : botsOf(rosterSlice.get(), s.who).length;
    const worn = e.worn;
    const head = [
      worn ? fr(this.host.art.item(worn.id), 's', { q: worn.q, tip: t.text(`Worn: ${ITEMS[worn.id].name}`) }) : '',
      s.who === 'comm' ? '' : `<span${t.text(`Every one of the ${n} wears it`)}>${glyph(G.crew, 'mg-g--s')} all ${n}</span>`,
      worn && !(s.who === 'comm' && s.slot === 'primary') ? btn('Take off', { faint: true, cls: 'dk-off', data: { act: 'off' }, tip: t.text(`${ITEMS[worn.id].name} to the stores`) }) : '',
    ].join('');
    const rows = (list: Entry[]) => list.map((x) => this.entryTag(x, s, x === best)).join('');
    const madeEmpty = !this.aboard ? 'Crafted aboard the Wanderer, at the workbench.' : 'No recipe for this slot yet: the stations teach them.';
    const list = group('In the stores', rows(e.owned), 'Nothing in the stores fits.')
      + group('Can be made', rows(e.craft), madeEmpty)
      + (this.aboard && this.host.shelf ? group("Trader's shelf", rows(e.buy), 'Nothing on her shelf for this slot this lift.') : '');
    return [esc(s.slot === 'heart' ? 'Second heart' : SLOT_NAMES[s.slot]), head, list];
  }

  /** One drawer entry as a shipping tag: its chips with arrows against what is worn, its line, its cost, one button. */
  private entryTag(x: Entry, s: Extract<Sel, { kind: 'gear' }>, best: boolean) {
    const g = gearSlice.get();
    const worn = wornIn(g, s);
    const words = itemWords(x.id, x.q, x.tuned);
    const extra = wornOnly(x, worn).map(([k]): Chip => ({ glyph: STAT_GLYPH[k], value: '–', name: STATS[k].name, key: k }));
    const chips = [...words.chips, ...extra];
    const chipRow = `<span class="mg-chips">${chips.map((c, i) => chipHtml(c, { d: c.key === 'type' ? undefined : x.deltas[i] })).join('')}</span>`;
    const label = x.src === 'owned' ? 'Fit' : x.src === 'swap' ? 'Swap' : x.src === 'move' ? 'Move here' : x.src === 'craft' ? 'Craft &amp; fit' : 'Buy &amp; fit';
    const ref = x.src === 'craft' ? x.id : x.src === 'buy' ? String(x.shelf) : String(x.uid);
    const main = btn(label, { main: best, data: { act: 'take', src: x.src, ref }, disabled: x.short, tip: this.tips.text(x.short ? 'Not enough in the stores' : actTip(x)) });
    const salvage = x.src === 'owned' && this.aboard ? btn(`${glyph(G.salvage)}${Math.floor(ITEMS[x.id].recipe.scrap / 2)}`, { faint: true, data: { act: 'salvage', uid: x.uid }, tip: this.tips.text(`Salvage: take it apart for ${Math.floor(ITEMS[x.id].recipe.scrap / 2)} scrap (asks once)`) }) : '';
    let cost = '';
    if (x.cost) cost = this.costRow(x.id);
    else if (x.price !== undefined) cost = `<span class="${x.short ? 'is-short' : ''}">${glyph(G.scrap, 'mg-g--s')}${x.price}</span>`;
    const sub = x.src === 'swap' || x.src === 'move' ? `worn: ${whereName(x.from!)}` : '';
    return tag({ pic: this.host.art.item(x.id), q: ITEMS[x.id].mod ? undefined : x.q, name: ITEMS[x.id].name, sub: esc(sub), chips: chipRow, line: words.line, cost, acts: main + salvage, short: x.short, drag: `fit:${x.src}:${ref}`, tip: this.itemTip(x.id, x.q, x.tuned, '', worn, x.src === 'craft') });
  }

  private lugDrawer(s: Extract<Sel, { kind: 'lug' }>): [string, string, string] {
    const g = gearSlice.get();
    const e = lugEntries(g, s);
    const t = this.tips;
    if (!e.weapon) return [`Lug ${s.i + 1}`, '', '<p class="mg-empty">No weapon in that hand.</p>'];
    const head = `${esc(ITEMS[e.weapon.id].name)}${e.on ? btn('Take off', { faint: true, data: { act: 'unmod', uid: e.on.uid }, tip: t.text(`${ITEMS[e.on.id].name} off the lug`) }) : ''}`;
    if (!this.aboard) return [`Lug ${s.i + 1}`, head, `${e.on ? this.modTag(e.on.id, '') : ''}<p class="mg-empty">Mods are fitted aboard the Wanderer: the lugs are locked on the sands.</p>`];
    const st = this.host.stores();
    const recipes = lugRecipes(g, e.weapon, this.host.taught);
    const firstOwned = e.mods[0]?.uid;
    const ownedRows = e.mods.map((m) => this.modTag(m.id, btn('Fit', { main: m.uid === firstOwned, data: { act: 'mod', src: 'owned', ref: m.uid } }))).join('');
    const craftRows = recipes.map((id) => {
      const short = costShort(id, st, g);
      return this.modTag(id, btn('Craft &amp; fit', { main: !firstOwned && id === recipes.find((r) => !costShort(r, st, g)), data: { act: 'mod', src: 'craft', ref: id }, disabled: short }), true);
    }).join('');
    return [`Lug ${s.i + 1}`, head, (e.on ? group('On it', this.modTag(e.on.id, ''), '') : '') + group('In the stores', ownedRows, 'No mod you own fits this weapon.') + group('Can be made', craftRows, 'No mod recipe for this weapon yet: Hob teaches them.')];
  }
  private modTag(id: ItemId, acts: string, cost = false) {
    const words = itemWords(id);
    const c = cost ? this.costRow(id) : '';
    return tag({ pic: this.host.art.item(id), name: ITEMS[id].name, line: words.line, cost: c, acts, tip: this.tips.add(`<b>${esc(ITEMS[id].name)}</b>${esc(words.line)}`, words.full.map((l) => `<p>${esc(l)}</p>`).join('')) });
  }
  /** A recipe's cost: scrap, then each part with what the stores hold (red when short). */
  private costRow(id: ItemId) {
    const st = this.host.stores();
    const c = costOf(id, { scrap: st.scrap, parts: st.parts }, gearSlice.get());
    return `<span class="${st.scrap >= c.scrap ? '' : 'is-short'}">${glyph(G.scrap, 'mg-g--s')}${c.scrap}</span>` + c.parts.map(([k, n, have]) => `<span class="${have >= n ? '' : 'is-short'}"${this.tips.text(`${partName(k, n)}: ${n} needed, ${have} in the stores`)}>${fr(this.host.art.part(k), 'xs')}${n}<small>/${have}</small></span>`).join('');
  }

  private cardDrawer(k: string): [string, string, string] {
    const r = researchSave.get();
    const c = cardsFor(r, k);
    const head = c.inSlot && this.aboard ? btn('Take out', { faint: true, data: { act: 'card', id: c.inSlot.id, out: '1' } }) : '';
    const face = (card: Card, acts: string) => `<div class="dk-cardrow"><div class="${pcClass(card, 'sm')}" ${pcStyle(card)}>${STOCK}<span class="pc__head"><span class="pc__name">${esc(card.name)}</span><span class="pc__tag">${esc(POOL_NAMES[card.pool])} card</span></span><span class="pc__typed">${esc(card.text)}</span>${holesSvg(card.id)}</div>${acts}</div>`;
    const inSlot = c.inSlot ? group('In this pocket', face(c.inSlot, ''), '') : '';
    if (!this.aboard) return [esc(slotName(k)), '', `${inSlot}<p class="mg-empty">Cards are fitted aboard the Wanderer: the slots are locked on the sands.</p>`];
    const rows = c.loose.map((card, i) => face(card, btn('Slot it', { main: i === 0, data: { act: 'card', id: card.id } }))).join('');
    return [esc(slotName(k)), head, inSlot + group('Your cards', rows, r.owned.length ? 'No loose card of yours fits this pocket.' : 'No cards yet: the Oracle offers a pick each time you come home.')];
  }

  private relicDrawer(uid: string): [string, string, string] {
    const ro = rosterSlice.get();
    const b = ro.bots.find((x) => x.uid === uid);
    if (!b) return ['Relic', '', ''];
    const t = this.tips;
    const head = b.relic && this.aboard ? btn('Take off', { faint: true, data: { act: 'unrelic', uid }, tip: t.text('Back to the stores') }) : '';
    const worn = b.relic ? group('In the socket', this.relicTag(b.relic, '', 1), '') : '';
    if (!this.aboard || !this.host.shop) return [`${esc(b.name)}'s relic`, '', `${worn}<p class="mg-empty">Relics are fitted aboard, at the workshop's sockets.</p>`];
    const shop = this.host.shop();
    const stock = benchRelics({ eco: shop.eco, hub: shop.hub });
    const dupes = new Set(offerable({ eco: shop.eco, roster: ro }));
    const stacks = new Map<string, { id: RelicId; srcs: string[]; junk: number[] }>();
    for (const it of stock) {
      const k = 'part' in it ? `part:${it.part}` : it.id;
      const st = stacks.get(k) ?? { id: it.id, srcs: [], junk: [] };
      st.srcs.push('part' in it ? `part:${it.part}` : `junk:${it.junk}`);
      if ('junk' in it) st.junk.push(it.junk);
      stacks.set(k, st);
    }
    let first = true;
    const rows = [...stacks.values()].map((st) => {
      const fit = btn('Fit', { main: first, data: { act: 'relic', uid, from: st.srcs[0] } });
      first = false;
      const sell = st.junk.length ? btn(`${glyph(G.sell)}${junkPrice()}`, { faint: true, data: { act: 'sell', junk: st.junk[0] }, tip: t.text(`Sell one to the Trader: ${junkPrice()} scrap`) }) : '';
      const off = st.junk.find((j) => dupes.has(j));
      const offer = off !== undefined ? btn(`Offer`, { faint: true, data: { act: 'offer', junk: off }, tip: t.text(`A robot already wears one: the Oracle takes this one for ${JUNK.offer} scrap`) }) : '';
      return this.relicTag(st.id, fit + sell + offer, st.srcs.length, st.srcs[0]);
    }).join('');
    return [`${esc(b.name)}'s relic`, head, worn + group('In the stores', rows, 'No relics in the stores: search dead ruins for old tech.', 'drag one onto a socket')];
  }
  private relicTag(id: string, acts: string, n: number, drag?: string) {
    const r = isRelic(id) ? RELICS[id] : null;
    return tag({ pic: this.host.art.relic(id), name: relicName(id), sub: n > 1 ? `×${n}` : '', line: r ? `${r.effect}.` : '', acts, tip: this.relicTip(id), drag });
  }
  private relicTip(id: string) {
    const r = isRelic(id) ? RELICS[id] : null;
    if (!r) return this.tips.text(relicName(id));
    return this.tips.add(`<b>${esc(r.reading)}</b>${esc(r.item)}, misread. ${esc(cap(r.socket))} socket.<p>${esc(r.effect)}.</p><p class="mg-down">Flaw: ${esc(r.flaw)}.</p>`);
  }

  private botDrawer(uid: string): [string, string, string] {
    const b = rosterSlice.get().bots.find((x) => x.uid === uid);
    if (!b) return ['Robot', '', '<p class="mg-empty">Gone.</p>'];
    const t = this.tips;
    if (!this.aboard || !this.host.shop) return [esc(b.name), '', `<p class="mg-empty">${esc(RANK_NAMES[b.rank])}${b.spec ? `, ${esc(SPECS[b.spec].name)}` : ''}. Robots are ranked and promoted aboard.</p>`];
    const shop = this.host.shop();
    const have = { copper: shop.eco.copper, parts: Object.entries(shop.hub.parts).reduce((n, [, v]) => n + (v ?? 0), 0) };
    const can = (c: { copper?: number; parts?: number }) => (c.copper ?? 0) <= have.copper && (c.parts ?? 0) <= have.parts;
    const hurt = b.wreck || b.downed;
    const next = b.rank < RANK_MAX ? RANK_COST[b.rank + 1] : null;
    const rank = next
      ? `<div class="dk-row"><span>${'★'.repeat(b.rank)}${'☆'.repeat(RANK_MAX - b.rank)} ${esc(RANK_NAMES[b.rank])}</span>${btn(`To ${esc(RANK_NAMES[b.rank + 1])}`, { main: !hurt && can(next), data: { act: 'rank', uid }, disabled: hurt || !can(next), small: costText(next) })}</div>`
      : `<p class="mg-empty">${esc(RANK_NAMES[b.rank])}: as good as it gets.</p>`;
    let calling = '';
    if (b.spec) calling = `<p class="dk-spec__text"><b>${esc(SPECS[b.spec].name)}</b> ${esc(SPECS[b.spec].text)}</p>`;
    else if (isBotType(b.role)) {
      calling = gaugesOf(profile.get(), b.role as BotType).map((g) => {
        const d = SPECS[g.spec];
        const tail = g.full ? btn('Choose', { data: { act: 'promote', uid, spec: g.spec }, disabled: hurt || !can(PROMOTE), small: costText(PROMOTE) }) : `<span class="dk-gauge"${t.text(g.deed)}>${g.have} / ${g.size}</span>`;
        return `<div class="dk-spec${g.full ? '' : ' is-locked'}"><div><b>${esc(d.name)}</b><p>${esc(d.text)}</p>${g.full ? '' : `<p class="dk-spec__deed">${esc(g.deed)}</p>`}</div>${tail}</div>`;
      }).join('') + `<p class="mg-empty">One calling for good; a locked one opens when its deed gauge fills, in any mission.</p>`;
    } else calling = '<p class="mg-empty">Mules take no calling.</p>';
    const apart = btn(this.armed === `bot:${uid}` ? `Take ${esc(b.name)} apart?` : 'Take apart', { faint: true, data: { act: 'apart', uid }, small: `${Math.floor(BODY[b.role].scrap * SALVAGE)} scrap back`, tip: t.text('Its relic goes back to the stores; asks once') });
    return [esc(b.name), `${esc(ROLES[b.role].name)}`, group('Rank', rank, '') + group('Calling', calling, '') + `<div class="dk-apart">${apart}</div>`];
  }

  private recipeRows() {
    const rows = recipeList(this.ctx(), this.search);
    if (!rows.length) return `<p class="mg-empty">No recipe matches.</p>`;
    return rows.map((r) => {
      return tag({ pic: this.host.art.item(r.id), name: ITEMS[r.id].name, cost: this.costRow(r.id), acts: btn('Craft', { data: { act: 'craft', id: r.id }, disabled: r.short, tip: this.tips.text(r.short ? 'Not enough in the stores' : 'Made into the stores; it rolls its quality') }), short: r.short, tip: this.itemTip(r.id, 'standard', false, '', undefined, true) });
    }).join('');
  }

  /** An item's tooltip: its numbers against what is worn (level 2), and everything the card says with Alt (level 3). */
  private itemTip(id: ItemId, q: Owned['q'], tuned: boolean | undefined, slotWord: string, worn?: Owned, rolls = false) {
    const d = ITEMS[id];
    const words = itemWords(id, q, tuned);
    const head = `<b>${esc(d.name)}</b>${d.mod ? 'Weapon mod' : rolls ? 'Rolls its quality: mostly Standard' : `${QUALITIES[q].name}${tuned ? ', tuned' : ''}`}${slotWord ? `, ${esc(slotWord.toLowerCase())}` : ''}`;
    const vs = worn && worn.id !== id ? itemWords(worn.id, worn.q, worn.tuned) : null;
    let table = '';
    if (d.weapon) {
      const a = weaponNumbers(id, q), b = worn && ITEMS[worn.id].weapon ? weaponNumbers(worn.id, worn.q) : null;
      const row = (label: string, x: string | number, y?: string | number) => `<tr><th>${label}</th><td>${x}</td>${vs ? `<td>${y ?? '–'}</td>` : ''}</tr>`;
      table = `<table>${vs ? '<tr><th></th><th>This</th><th>Worn</th></tr>' : ''}${row('Type', cap(a.type), b ? cap(b.type) : undefined)}${row('Hit', `${a.hit}${a.pellets ? ` ×${a.pellets}` : ''}`, b ? `${b.hit}${b.pellets ? ` ×${b.pellets}` : ''}` : undefined)}${row('Hits a second', a.rate.toFixed(1), b?.rate.toFixed(1))}${row(a.melee ? 'Reach' : 'Range', `${a.dist} px`, b ? `${b.dist} px` : undefined)}</table>`;
    } else {
      const mine = scaled(d.stats, q, tuned), theirs = worn ? scaled(ITEMS[worn.id].stats, worn.q, worn.tuned) : {};
      const keys = [...new Set([...Object.keys(mine), ...(vs ? Object.keys(theirs) : [])])] as GearStat[];
      const f = (s: Stats, k: GearStat) => (s[k] ? pct(k, s[k]!) : '–');
      if (keys.length) table = `<table>${vs ? '<tr><th></th><th>This</th><th>Worn</th></tr>' : ''}${keys.map((k) => `<tr><th>${esc(STATS[k].name)}</th><td>${f(mine, k)}</td>${vs ? `<td>${f(theirs, k)}</td>` : ''}</tr>`).join('')}</table>`;
    }
    const line = words.line ? `<p>${esc(words.line)}.</p>` : '';
    const skill = words.skill ? `<p class="mg-tip__dim">${esc(words.skill)}</p>` : '';
    return this.tips.add(head + table + line + skill, words.full.map((l) => `<p>${esc(l)}</p>`).join(''));
  }
}

// ---- helpers ----

/** "the Crown of the hive", "The Rain-maker" (already has its article). */
const the = (n: string) => (/^the /i.test(n) ? n : `the ${n}`);
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const frSmall = (src: string) => fr(src, 'xs');
const chassisGlyph = (id: string) => ({ tank: 'oil-can', boiler: 'boiling-bubbles', plating: 'bordered-shield', pistons: 'running-shoe' })[id] ?? 'cog';
const costShort = (id: ItemId, st: Stores, g: Gear) => shortfall(id, { scrap: st.scrap, parts: st.parts }, g).length > 0;
/** Where a piece is worn, in words (`gear:guard.back` -> "guards' back"). */
function whereName(key: string) {
  const s = parseSel(key);
  if (s?.kind !== 'gear') return '';
  return s.who === 'comm' ? SLOT_NAMES[s.slot].toLowerCase() : `${plural(s.who).toLowerCase()}' ${SLOT_NAMES[s.slot].toLowerCase()}`;
}
function wornAtKey(g: Gear, uid: number): string | null {
  for (const s of commSlots(g)) if (g.comm[s] === uid) return gearKey('comm', s);
  for (const r of Object.keys(g.bots) as CrewRole[]) for (const s of BOT_SLOTS) if (g.bots[r][s] === uid) return gearKey(r, s);
  return null;
}
/** What the button does, in words. */
function actTip(x: Entry) {
  if (x.src === 'owned') return 'Fit it: what the slot wore goes to the stores';
  if (x.src === 'swap') return 'The two weapons swap hands';
  if (x.src === 'move') return `Move it here: it comes off the ${whereName(x.from!)}`;
  if (x.src === 'craft') return 'Craft it (it rolls its quality) and fit it';
  return `Buy it from the Trader (${x.price} scrap) and fit it`;
}
/** What the crews get from what the Communicator wears (the inventory's old "Every bot gets": the worn pieces' `crew`). */
function crewShare(): Stats {
  const g = gearSlice.get();
  const out: Stats = {};
  for (const s of commSlots(g)) {
    const o = owned(g, g.comm[s]);
    if (o && ITEMS[o.id].crew && (!ITEMS[o.id].needs || hasAntenna(g))) for (const [k, v] of Object.entries(scaled(ITEMS[o.id].crew, o.q, o.tuned)) as [GearStat, number][]) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
