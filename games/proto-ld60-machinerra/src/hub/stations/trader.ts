/**
 * The Trader's stall: the Buy and Sell tabs in front of her offers (`trade.ts` holds the rules: the shelf, the buy-back, tiers).
 * Registered as her `OFFER_PANELS` entry (`stations/index.ts`); the `hub shop|buy|sell` dev commands (`hubdev.ts`) use the functions below.
 */
import { PARTS, type PartKind } from '../../sim/defs';
import { ITEMS, QUALITIES, SLOT_NAMES, STATS, scaled } from '../../sim/gear';
import { RELICS, JUNK, type RelicId } from '../../sim/junk';
import { iconUrl } from '../../gearart';
import { relicTex } from '../../relicart';
import { gear } from '../carry';
import { economy, tradeSave } from '../economy';
import { LINES } from '../lines';
import { esc } from '../panels';
import { junkPrice, sellJunk } from '../relics';
import type { HubState, PerkId } from '../state';
import { BOONS, buyBoon, offered, type Boon } from '../specials';
import { talkSave } from '../talkslice';
import { TIERS, buy, buyBack, discounted, left, sell, sellAll, sellable, shelf, type Stall, type Ware } from '../trade';
import { titleStat } from '../titles';
import { questBook, titleSave } from '../talkslice';
import { roster } from '../workshop';
import type { HubHost, OfferPanel } from './host';

/**
 * The Trader's stall, as her panel's Buy and Sell tabs: this lift's shelf (`trade.ts`; Buy, greyed when sold out or short of scrap) and
 * the parts she buys back. `left[i]` is what is left of ware `i`; `tier` is her quest line's steps done.
 */
export function shopHtml(o: {
  wares: Ware[];
  left: number[];
  scrap: number;
  valued: boolean;
  tier: number;
  parts: HubState['parts'];
  partIcon: (k: PartKind) => string;
  /** Old tech in the stock (P19): she pays `JUNK.sell` scrap for a piece. */
  junk?: RelicId[];
  /** What she pays for one (`junkPrice`: The Haggler adds 10%). */
  junkPay?: number;
  relicIcon?: (id: string) => string;
}) {
  const row = (icon: string, cls: string, name: string, sub: string, btn: string) =>
    `<div class="hb-shop__row ${cls}"><img src="${icon}" alt=""><div class="hb-shop__what"><b>${name}</b><small>${sub}</small></div>${btn}</div>`;
  const stat = (k: string) => STATS[k as keyof typeof STATS];
  const shelfRows = o.wares.map((w, i) => {
    const price = discounted(w.price, o.valued), n = o.left[i];
    const btn = `<button class="ui-btn ui-btn--secondary" data-a="buy" data-i="${i}"${n > 0 && o.scrap >= price ? '' : ' disabled'}>${n > 0 ? `Buy · ${price} scrap` : 'Sold out'}</button>`;
    if (w.kind === 'part') return row(o.partIcon(w.part), '', esc(PARTS[w.part].name), `${n} left · a ${PARTS[w.part].slot} part`, btn);
    const d = ITEMS[w.item];
    const stats = Object.entries(scaled({ ...d.stats, ...d.crew }, w.q))
      .slice(0, 3)
      .map(([k, v]) => `${v > 0 ? '+' : ''}${v}${stat(k).pts ? '' : '%'} ${stat(k).name.toLowerCase()}`);
    const slot = d.weapon ? 'weapon' : SLOT_NAMES[(d.comm ?? d.bot)!].toLowerCase() + (d.comm ? '' : ', for a crew');
    return row(iconUrl(w.item), `q-${w.q}`, `${QUALITIES[w.q].name} ${esc(d.name)}`, [slot, ...stats].join(' · '), btn);
  }).join('');
  const mine = (Object.entries(o.parts) as [PartKind, number][]).filter(([k, n]) => n > 0 && sellable(k));
  const buys = mine
    .map(([k, n]) => row(
      o.partIcon(k),
      '',
      `${esc(PARTS[k].name)} ×${n}`,
      `she pays ${buyBack(k)} scrap each`,
      `<button class="ui-btn ui-btn--secondary" data-a="sell" data-k="${k}">Sell one</button>${n > 1 ? `<button class="ui-btn ui-btn--secondary" data-a="sellall" data-k="${k}" title="Sell all ${n} for ${buyBack(k) * n} scrap">Sell all</button>` : ''}`,
    ))
    .join('');
  const old = (o.junk ?? [])
    .map((id, i) => row(
      o.relicIcon?.(id) ?? '',
      '',
      esc(RELICS[id].reading),
      `old ${esc(RELICS[id].item.toLowerCase())}, she pays ${o.junkPay ?? JUNK.sell} scrap`,
      `<button class="ui-btn ui-btn--secondary" data-a="selljunk" data-i="${i}">Sell it</button>`,
    ))
    .join('');
  const next = o.tier < TIERS.length - 1 ? 'Help her with her quests and she stocks better.' : 'Her best shelf: Rare or better, from the far biomes too.';
  const purse = `<div class="hb-shop__h"><span>Restocked every lift. ${next}</span><b>${o.scrap} scrap${o.valued ? ' · 10% off' : ''}</b></div>`;
  const sold = mine.length + (o.junk?.length ?? 0);
  const none = '<p class="hb-note hb-note--dim">No spare parts in the stores. Bring some up from the sands.</p>';
  const sellTab = [
    '<div class="hb-shop__h"><span>Spare parts and old tech from the stores. (Fit old tech to a robot first: the workshop.)</span>',
    `<b>${o.scrap} scrap</b></div>`,
    `<div class="hb-shop">${old}${buys || (old ? '' : none)}</div>`,
  ].join('');
  return [
    { id: 'buy', label: 'Buy', html: `${purse}<div class="hb-shop">${shelfRows}</div>` },
    { id: 'sell', label: `Sell${sold ? ` (${sold})` : ''}`, html: sellTab },
  ];
}

/** The Trader's quest line steps done: her shelf's tier (`trade.ts` TIERS). */
const traderTier = (host: HubHost) => LINES.trader.steps.filter((st) => st.reward.perk && host.s.perks.includes(st.reward.perk as PerkId)).length;

/** What a trade at her stall touches, now. */
export function stall(host: HubHost): Stall {
  return {
    missions: host.s.missions,
    tier: traderTier(host),
    trade: tradeSave.get(),
    scrap: economy.get().scrap,
    parts: host.s.parts,
    gear: gear.get(),
    valued: titleStat(titleSave.get(), 'hub', 'boonCost', 1) < 1,
  };
}

export function shelfLeft(host: HubHost) {
  const t = stall(host);
  return shelf(t.missions, t.tier).map((_, i) => left(t.trade, t.missions, i, t.tier));
}

/** The wares on her shelf this lift, as the dev `hub shop` shows them. */
export function shelfNow(host: HubHost) {
  const t = stall(host), l = shelfLeft(host);
  return { tier: t.tier, scrap: t.scrap, valued: t.valued, shelf: shelf(t.missions, t.tier).map((w, i) => ({ i, ...w, left: l[i] })) };
}

/** Keep what a trade changed: the trade log, the scrap, the gear and the parts. */
export function keepStall(host: HubHost, t: Stall) {
  tradeSave.set(t.trade);
  economy.set({ ...economy.get(), scrap: t.scrap });
  gear.set(t.gear);
  host.save({ ...host.s, parts: t.parts });
}

export function buyWare(host: HubHost, i: number) {
  const t = buy(stall(host), i);
  keepStall(host, t);
  questBook.set({ ...questBook.get(), bought: questBook.get().bought + 1 }); // trader.story 2
  const w = t.ware;
  return w.kind === 'part' ? PARTS[w.part].name : `${QUALITIES[w.q].name} ${ITEMS[w.item].name}`;
}

export function sellPart(host: HubHost, k: PartKind) {
  keepStall(host, sell(stall(host), k));
  questBook.set({ ...questBook.get(), sold: questBook.get().sold + 1 }); // trader.story 1
  return `Sold: ${PARTS[k].name}`;
}

/** Every unit of a part kind at once: the same as selling them one by one (each counts for her story's sales). */
export function sellAllParts(host: HubHost, k: PartKind) {
  const n = host.s.parts[k] ?? 0;
  keepStall(host, sellAll(stall(host), k));
  questBook.set({ ...questBook.get(), sold: questBook.get().sold + n }); // trader.story 1
  return `Sold ${n}: ${n === 1 ? PARTS[k].name : PARTS[k].plural}`;
}

const REPLIES = ['No refunds!', 'Pleasure doing business, friend.', 'Polished it myself. Mostly.', 'Honest brass. Honestly.', 'A fine choice. They are all fine choices.'];

/** A click at her stall: the trade, a banner and a line from her, and the panel redrawn; a refusal is said, not thrown. */
function trade(host: HubHost, again: () => void, f: () => string) {
  const said = host.memo('trader', () => ({ n: 0 }));
  try {
    const what = f();
    host.k.audio.sfx.play('pickup');
    host.hud.banner(what);
    host.speak('trader', REPLIES[said.n++ % REPLIES.length]);
  } catch (e) {
    host.k.audio.sfx.play('click', { gain: 0.3 });
    host.hud.banner((e as Error).message);
  }
  again();
}

/** The specials shelf (`specials.ts`): biscuits and star oil, once her story steps have been done. Empty before. */
function specialsTab(host: HubHost): { id: string; label: string; html: string }[] {
  const on = offered(talkSave.get(), host.s.missions);
  if (!on.length) return [];
  const book = questBook.get(), scrap = economy.get().scrap;
  const rows = on.map((b) => {
    const d = BOONS[b], have = book.pack[b] ?? 0;
    return `<div class="hb-shop__row"><div class="hb-shop__what"><b>${esc(d.name)}${have ? ` (${have} in your pack)` : ''}</b><small>${esc(d.text)}</small></div><button class="ui-btn ui-btn--secondary" data-a="boon" data-k="${b}"${scrap >= d.price ? '' : ' disabled'}>Buy · ${d.price} scrap</button></div>`;
  }).join('');
  return [{ id: 'special', label: 'Boons', html: `<div class="hb-shop__h"><span>For the next landing. Star oil is drunk on the sands: press Use with nothing else in reach, twice.</span><b>${scrap} scrap</b></div><div class="hb-shop">${rows}</div>` }];
}

export const traderOffer: OfferPanel = {
  tabs: (host) => [
    ...shopHtml({
      ...stall(host),
      wares: shelf(host.s.missions, traderTier(host)),
      left: shelfLeft(host),
      partIcon: (k) => host.textures.getBase64(`part-${k}`),
      junk: economy.get().junk,
      junkPay: junkPrice(titleSave.get()),
      relicIcon: (r) => host.textures.getBase64(relicTex(r)),
    }),
    ...specialsTab(host),
  ],
  wire: (host, el, again) => {
    const act = (btn: HTMLElement, f: () => string) => btn.addEventListener('click', () => trade(host, again, f));
    el.querySelectorAll<HTMLElement>('[data-a="buy"]').forEach((btn) => act(btn, () => buyWare(host, Number(btn.dataset.i))));
    el.querySelectorAll<HTMLElement>('[data-a="selljunk"]').forEach((btn) =>
      act(btn, () => {
        const r = sellJunk({ eco: economy.get(), hub: host.s, roster: roster.get() }, Number(btn.dataset.i), titleSave.get());
        economy.set(r.eco);
        questBook.set({ ...questBook.get(), sold: questBook.get().sold + 1 });
        return `Sold: ${r.id}`;
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-a="boon"]').forEach((btn) =>
      act(btn, () => {
        const b = btn.dataset.k as Boon;
        const r = buyBoon(questBook.get(), economy.get().scrap, b, stall(host).valued);
        questBook.set({ ...r.book, bought: r.book.bought + 1 });
        economy.set({ ...economy.get(), scrap: r.scrap });
        return `Bought: ${BOONS[b].name}`;
      }),
    );
    el.querySelectorAll<HTMLElement>('[data-a="sell"]').forEach((btn) => act(btn, () => sellPart(host, btn.dataset.k as PartKind)));
    el.querySelectorAll<HTMLElement>('[data-a="sellall"]').forEach((btn) => act(btn, () => sellAllParts(host, btn.dataset.k as PartKind)));
  },
};
