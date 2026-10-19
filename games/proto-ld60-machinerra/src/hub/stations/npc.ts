/**
 * An NPC's own station panels: building it on a lot (`openBuild`), and the offer panel at the built booth (`openOffer`: the one
 * thing they give, free the first time, then their quest line's offers). What a station adds to its offer panel (tabs, buttons)
 * is its `OFFER_PANELS` entry (`stations/index.ts`); this file stays the same for every NPC.
 */
import { promptHtml } from '../../../../../harness/kit';
import { buildStation, economy } from '../economy';
import { DONE, stepOf, type Flags, type Talk } from '../dialog';
import { LINES, isOpen } from '../lines';
import { factsFor } from '../talk';
import { lineSave, talkSave, titleSave } from '../talkslice';
import { openLots, type Slot } from '../layout';
import { esc, tabbed } from '../panels';
import { PERKS, npc, claim, stationCost, type HubState, type NpcDef, type PerkId } from '../state';
import type { HubHost } from './host';
import { OFFER_PANELS } from './index';
import { deckMap, openPlanner } from './planner';

/** The NPC's own panel: build their station, take their gift, plan with the Planner. */
export function openFor(host: HubHost, id: string) {
  const n = npc(id)!;
  if (n.station) return host.s.stations[id] ? openOffer(host, id) : openBuild(host, id);
  if (n.panel === 'planner') openPlanner(host);
}

/**
 * A rescued NPC waiting in the centre: build their station. The deck's map: click a free lot that joins the deck (its
 * number is stencilled on its girder), then build there. Greyed out without the copper.
 */
export function buildBody(s: HubState, n: NpcDef, lots: Slot[], sel: string | null, me?: { x: number; y: number }) {
  const st = n.station!;
  const cost = stationCost(s, titleSave.get()), have = economy.get().copper, afford = have >= cost;
  const gift = PERKS[st.gift];
  const open = lots.map((l) => l.id);
  const lot = lots.find((l) => l.id === sel);
  const who = esc(n.name.replace(/^The /, 'the '));
  const what = !open.length ? 'No free lot joins the deck.' : lot ? `<b>Lot ${lot.n}</b>${lot.w > 400 ? ', a wide one' : ''}.` : 'Pick a free lot on the map.';
  return {
    title: `${n.name}: ${st.name}`,
    body: `<div class="hb-dm-wrap">${deckMap(s, { pick: open, open, sel, me })}<div class="hb-dm-side">
      <p class="hb-note">${esc(n.intro)}</p>
      <p class="hb-note">Build the <b>${esc(st.name)}</b> on a free lot: <b>${cost} copper</b> (you have <b>${have}</b>).</p>
      <p class="hb-note hb-note--dim">${[
        `Once it stands, ${who} moves in, ${esc(n.unlocks)} works, `,
        `and the first thing they ${gift.how === 'teach' ? 'teach' : 'sell'} is free: <b>${esc(gift.name)}</b>.`,
      ].join('')}</p>
      ${afford ? '' : `<p class="hb-note hb-note--warn">Not enough copper: strip ${cost - have} more from the ruins.</p>`}
      <p class="hb-note">${what}</p>
    </div></div>`,
    actions: `<button class="ui-btn ui-btn--primary" data-a="build"${lot && afford ? '' : ' disabled'}>${lot ? `Build on lot ${lot.n}` : 'Build'}</button>`,
  };
}

/** A rescued NPC waiting in the centre: pick a lot on the deck's map and pay the copper for their station. */
export function openBuild(host: HubHost, id: string, sel: string | null = null) {
  const n = npc(id)!;
  const wasOpen = !!host.hud.panel;
  const b = buildBody(host.s, n, openLots(Object.values(host.s.stations)), sel, host.me);
  const el = host.hud.open('build', b.title, b.body, b.actions, 'Esc to close');
  el.querySelectorAll('[data-a="lot"]').forEach((g) =>
    g.addEventListener('click', () => {
      const lot = (g as HTMLElement).dataset.id!;
      host.k.audio.sfx.play('ratchet');
      openBuild(host, id, lot === sel ? null : lot);
    }),
  );
  el.querySelector('[data-a="build"]')?.addEventListener('click', () => {
    if (!sel) return;
    try {
      host.pay(buildStation({ eco: economy.get(), hub: host.s }, id, sel, host.allRescued, false, titleSave.get()));
    } catch (e) {
      host.hud.say(n.name, (e as Error).message);
      host.k.audio.sfx.play('click');
      return;
    }
    host.raised(sel);
    if (id === 'home') {
      host.hud.close();
      host.hud.banner('Your house stands. A bed of your own: you land rested, Hasted for the first minute.');
      host.refresh();
      return;
    }
    host.hud.banner(`${n.station!.name} built. Unlocked: ${n.unlocks}`, 4200);
    openOffer(host, id);
  });
  if (!wasOpen) host.panelOpened();
}

/** One of an NPC's offers: a compact row, its state on the right (Yours / Learned / free / the quest that unlocks it). */
const offerRow = (name: string, text: string, state: string, cls = '') =>
  `<div class="hb-offer ${cls}"><div class="hb-offer__what"><b>${esc(name)}</b><span>${promptHtml(text)}</span></div><em>${state}</em></div>`;

/**
 * The relationship gauge (quests.md): one tooth per step of the NPC's story line, lit when the step is done; under it what is next, or what
 * it waits for (the lock). Empty for an NPC with no story line.
 */
export function gaugeHtml(id: string, talk: Talk, facts: Flags): string {
  const l = LINES[`${id}.story`];
  if (!l) return '';
  const step = stepOf(talk, `${id}.story`);
  const done = step === DONE ? l.steps.length : Math.max(0, step - 1);
  const cur = step > 0 && step !== DONE ? l.steps[step - 1] : null;
  const lock = cur && !isOpen(cur, talk, facts) ? lineText(cur.lock?.[0]) : '';
  const note = step === DONE ? 'Their story is told.' : !cur ? 'Ask them for work, and they will tell you more.' : lock ? `Waiting: ${lock}` : `Next: ${cur.task}`;
  const teeth = l.steps.map((_, i) => `<i class="hb-tooth${i < done ? ' is-lit' : ''}"></i>`).join('');
  return `<div class="hb-story" title="Their story with you"><span class="hb-story__teeth">${teeth}</span><span class="hb-story__note">${esc(note)}</span></div>`;
}
const lineText = (l: string | { t: string } | undefined) => (l === undefined ? '' : typeof l === 'string' ? l : l.t);

/** The rest of what they teach or sell: each unlocked by a step of their quest line (`lines.ts`), in order. */
function lineOffers(s: HubState, id: string) {
  const steps = LINES[id]?.steps ?? [];
  return steps
    .filter((st) => st.reward.perk)
    .map((st) => {
      const p = PERKS[st.reward.perk as PerkId], owned = s.perks.includes(st.reward.perk as PerkId);
      return offerRow(p.name, p.text, owned ? (p.how === 'teach' ? '✓ Learned' : '✓ Yours') : `Quest: ${esc(st.task)}`, owned ? 'is-owned' : 'hb-offer--locked');
    })
    .join('');
}

/**
 * An NPC at their station: the one thing they give, free the first time, and the rest of their quest line's offers.
 * `extra` puts more tabs in front (the Trader's Buy and Sell); with none, there are no tabs. `more` is extra footer buttons.
 */
export function offerBody(s: HubState, n: NpcDef, extra: { id: string; label: string; html: string }[] = [], tab = '', more = '', gauge = '') {
  const gift = PERKS[n.station!.gift];
  const owned = s.perks.includes(n.station!.gift);
  const verb = gift.how === 'teach' ? 'Learn it' : 'Take it';
  const state = owned ? (gift.how === 'teach' ? '✓ Learned' : '✓ Yours') : 'Free, the first one';
  const quests = `<div class="hb-offers">${offerRow(gift.name, gift.text, state, owned ? 'is-owned' : 'is-free')}${lineOffers(s, n.id)}</div>`;
  const tabs = extra.length ? [...extra, { id: 'quests', label: gift.how === 'teach' ? 'Lessons' : 'Specials', html: quests }] : [];
  return {
    title: `${n.name}: ${n.station!.name}`,
    body: `<p class="hb-note hb-note--intro">${esc(n.intro)}</p>${gauge}${tabs.length ? tabbed(tabs, tab) : quests}`,
    actions: `${more}${owned ? '' : `<button class="ui-btn ui-btn--primary" data-a="claim">${verb}</button>`}`,
  };
}

/** An NPC at their station: the one thing they give, free the first time (and what their station adds: `OFFER_PANELS`). */
export function openOffer(host: HubHost, id: string) {
  const n = npc(id)!;
  const wasOpen = !!host.hud.panel;
  const extra = OFFER_PANELS[id];
  const talk = talkSave.get();
  const b = offerBody(host.s, n, extra?.tabs?.(host) ?? [], host.tabs[id], extra?.actions, gaugeHtml(id, talk, factsFor(host.s, id, talk, lineSave.get())));
  const el = host.hud.open('offer', b.title, b.body, b.actions);
  el.querySelectorAll<HTMLElement>('[data-tab]').forEach((t) =>
    t.addEventListener('click', () => {
      host.tabs[id] = t.dataset.tab!;
      el.querySelectorAll<HTMLElement>('[data-tab]').forEach((o) => o.setAttribute('aria-selected', String(o === t)));
      el.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
      host.k.audio.sfx.play('click', { gain: 0.3 });
    }),
  );
  extra?.wire?.(host, el, () => openOffer(host, id));
  el.querySelector('[data-a="claim"]')?.addEventListener('click', () => {
    host.save(claim(host.s, id));
    const gift = PERKS[n.station!.gift];
    host.k.audio.sfx.play('pickup');
    host.k.juice.shake('small');
    host.hud.banner(gift.name);
    host.speak(id, gift.how === 'teach' ? 'There. Now you know. Do not make me teach you twice.' : 'On the house. The next one will not be.');
    openOffer(host, id);
  });
  if (!wasOpen) host.panelOpened();
}
