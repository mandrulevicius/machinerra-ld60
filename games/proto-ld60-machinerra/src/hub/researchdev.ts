/**
 * The punch cards' dev command, in every scene (`__game.cmd('cards')`): look at the collection and the slots, give cards, fit them,
 * add picks. Registered by `registerSaveCommands` (`saveslices.ts`). Add a sub: one entry in `subs`, `name: [help, run]`.
 */
import { command } from '../../../../harness/dev/commands';
import { CARDS, COMM_SLOT_KEYS, TYPE_SLOT_KEYS, cardOf, fit, fittedAt, offerFor, prepare, slotName, unfit, waiting } from './research';
import { economy } from './economy';
import { liveCards, researchCtx, researchSave } from './researchslice';

type Sub = [help: string, run: (a: string[]) => string];

export function registerResearchCommands() {
  const show = () => {
    const r = researchSave.get();
    const at = (id: string) => fittedAt(r, id);
    return [
      `${r.owned.length} card(s) owned, ${waiting(r)} pick(s) waiting${r.offer.length ? `, on offer: ${r.offer.join(', ')}` : ''}`,
      ...r.owned.map((id) => `  ${id}${at(id) ? ` (${at(id)})` : ''}`),
      `at work: comm ${liveCards().comm.map((s) => s.id).join(', ') || 'none'}; party ${liveCards().party.map((s) => s.id).join(', ') || 'none'}; types ${JSON.stringify(Object.fromEntries(Object.entries(liveCards().roles).map(([k, v]) => [k, v!.map((s) => s.id)])))}`,
    ].join('\n');
  };
  const subs: Record<string, Sub> = {
    list: ['list: every card in the game, by pool', () => CARDS.map((c) => `${c.pool} ${c.id}: ${c.text}`).join('\n')],
    give: [
      'give <id|all>: add cards to the collection (each fits itself if a slot is free)',
      ([id]) => {
        const ids = id === 'all' ? CARDS.map((c) => c.id) : CARDS.filter((c) => c.id === id).map((c) => c.id);
        if (!ids.length) return `give <id|all>: ${CARDS.map((c) => c.id).join(', ')}`;
        let r = researchSave.get();
        for (const x of ids) if (!r.owned.includes(x)) r = { ...r, owned: [...r.owned, x] };
        researchSave.set(r);
        return `${ids.length} card(s) given`;
      },
    ],
    fit: [
      `fit <id> <slot>: fit an owned card (slots: ${[...COMM_SLOT_KEYS, ...TYPE_SLOT_KEYS].join(', ')})`,
      ([id, slot]) => {
        try {
          researchSave.set(fit(researchSave.get(), id, slot));
          return `${cardOf(id)?.name} fitted in ${slotName(slot)}`;
        } catch (e) {
          return (e as Error).message;
        }
      },
    ],
    unfit: ['unfit <id>: take a card out of its slot', ([id]) => (researchSave.set(unfit(researchSave.get(), id)), `${id} taken out`)],
    picks: [
      'picks <n>: add n picks (and draw the offer)',
      ([n]) => {
        const r = researchSave.get();
        researchSave.set(prepare({ ...r, credit: r.credit + Math.max(0, Math.floor(Number(n) || 1)) }, researchCtx()));
        return show();
      },
    ],
    offer: ['offer: what the offer rule would show now (not kept)', () => offerFor(researchSave.get(), researchCtx(), `dev/${Math.random()}`).join(', ')],
    clear: ['clear: empty the collection', () => (researchSave.set({ owned: [], fit: {}, credit: 0, seen: economy.get().haul, offer: [] }), 'collection emptied')],
  };
  command('cards', ([sub, ...rest]) => (subs[sub ?? ''] ? subs[sub!][1](rest) : sub ? `cards <${Object.keys(subs).join('|')}>` : show()),
    `cards [${Object.keys(subs).join('|')}]: the punch cards (no argument: the collection, the picks and what is at work); ${Object.values(subs).map(([h]) => h).join(' | ')}`,
    { group: 'cards', args: () => Object.keys(subs) });
}
