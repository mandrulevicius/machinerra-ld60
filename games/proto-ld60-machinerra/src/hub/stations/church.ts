/**
 * The church's research (P16): the Oracle's pick of three punch cards. Opened from her script (the `research` panel, `dialog.ts`
 * `Panel`; `Hub.flush`), not a station on the deck. The rules are `research.ts` (the offer, the picks, the slots) and the
 * slice `researchslice.ts`; this draws the three cards, takes the pick and sends you to the inventory's Cards tab to fit them.
 */
import { promptHtml } from '../../../../../harness/kit';
import { economy } from '../economy';
import { esc } from '../panels';
import { POOL_NAMES, cardOf, dreamAgain, fittedAt, pick, prepare, slotName, waiting, type Card, type Research } from '../research';
import { STOCK, holesSvg, pcClass, pcStyle } from '../punchcard';
import '../../punchcard.css';
import { questBook } from '../talkslice';
import { researchCtx, researchSave } from '../researchslice';
import type { HubHost } from './host';

/** One card on offer, as a punch card (`punchcard.ts`): the name stamped, the rule typed, the holes its own. */
const card = (c: Card) =>
  `<button class="hb-card ${pcClass(c, 'big')}" ${pcStyle(c)} data-a="pick" data-id="${c.id}">${STOCK}<span class="pc__head"><b class="pc__name">${esc(c.name)}</b><em class="pc__tag">${POOL_NAMES[c.pool]} card${c.from ? `, strength from ${esc(c.from.toLowerCase())}` : ', works party-wide wherever it sits'}</em></span><span class="pc__typed">${esc(c.text)}</span>${holesSvg(c.id)}</button>`;

/** One card of your collection: a chip of its holes, and where it is fitted on the right. */
const row = (r: Research, id: string) => {
  const c = cardOf(id)!, at = fittedAt(r, id);
  const where = at ? (at.startsWith('comm:') ? `You, ${slotName(at).toLowerCase()}` : `Every ${at.slice(5)}`) : 'In the collection';
  return `<div class="hb-offer${at ? ' is-owned' : ''}"><i class="${pcClass(c, 'chip')}" ${pcStyle(c)}>${STOCK}${holesSvg(c.id)}</i><div class="hb-offer__what"><b>${esc(c.name)}</b><span>${esc(c.text)}</span></div><em>${where}</em></div>`;
};

/** The panel's body from the state (pure: the tests and the dev tools read it too). */
export function churchBody(r: Research, picks: number, canFit: boolean, again = false) {
  const offer = r.offer.map(cardOf).filter((c): c is Card => !!c);
  const intro = offer.length
    ? `<p class="hb-note">Old research, Communicator: one rule out of three, punched into a card. It is yours for good; slot it, swap it, never lose it. <b>${picks}</b> pick${picks === 1 ? '' : 's'} waiting.</p><div class="hb-cards">${offer.map(card).join('')}</div>`
    : `<p class="hb-note">${r.owned.length ? 'No pick waiting.' : 'Nothing to pick yet.'} A stage that decodes something old brings one.</p>`;
  const cards = r.owned.length ? `<h3 class="hb-note hb-note--dim">Your cards</h3><div class="hb-offers">${r.owned.map((id) => row(r, id)).join('')}</div>` : '';
  const fit = canFit ? '' : `<p class="hb-note hb-note--dim">A new card fits itself into a free slot. Fitting them by hand opens with the satchel, after my first blessing.</p>`;
  return {
    title: 'The Oracle: old research',
    body: `${intro}${cards}${fit}`,
    actions: `${again ? '<button class="ui-btn" data-a="again">Dream again <small>once a visit</small></button>' : ''}${
      canFit && r.owned.length ? `<button class="ui-btn ui-btn--primary" data-a="cards">Fit your cards ${promptHtml('{inventory}')}</button>` : ''
    }`,
  };
}

/** Open the church's research panel (again after each action: it redraws in place). */
export function openChurch(host: HubHost) {
  const eco = economy.get();
  const saved = researchSave.get();
  const r = prepare(saved, researchCtx());
  if (r !== saved) researchSave.set(r);
  const wasOpen = !!host.hud.panel;
  const again = host.s.perks.includes('dreamAgain') && r.offer.length > 0 && questBook.get().dreamed !== eco.haul;
  const b = churchBody(r, waiting(r), host.has('inventory'), again);
  const el = host.hud.open('church', b.title, b.body, b.actions);
  el.querySelectorAll<HTMLElement>('[data-a="pick"]').forEach((t) =>
    t.addEventListener('click', () => {
      const c = cardOf(t.dataset.id!)!;
      const got = pick(researchSave.get(), c.id, researchCtx());
      researchSave.set(got.r);
      host.k.audio.sfx.play('pickup');
      host.k.juice.shake('small');
      host.hud.banner(c.name);
      const swap = host.has('inventory') ? ' Swap it in the satchel if you know better.' : '';
      host.speak('highPriest', got.slot ? `${c.name}: punched, blessed and slotted for you.${swap}` : `${c.name}: punched and blessed. The slots it fits are full, so it waits in the collection until you choose.`);
      openChurch(host);
    }),
  );
  el.querySelector('[data-a="again"]')?.addEventListener('click', () => {
    researchSave.set(dreamAgain(researchSave.get(), researchCtx()));
    questBook.set({ ...questBook.get(), dreamed: economy.get().haul });
    host.k.audio.sfx.play('bell', { gain: 0.35 });
    host.speak('highPriest', 'Then I dream again. Do not make a habit of it.');
    openChurch(host);
  });
  el.querySelector('[data-a="cards"]')?.addEventListener('click', () => {
    host.closePanel();
    host.inv.show('cards');
  });
  if (!wasOpen) host.panelOpened();
}
