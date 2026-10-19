/**
 * The City Planner's drafting office: the blueprints for the D-city's buildings (`buildings.ts`), the deck redraw (move or
 * swap stations) and the lot picker (your house, the Wanderer's improvements). `deckMap` is the deck from above, also used by the NPC build panel (`npc.ts`).
 * Registered as the Planner's `OFFER_PANELS` entry (`stations/index.ts`).
 */
import { DECK, ROOMS, SLOTS, WALKWAYS, lotOf, openLots, type Slot } from '../layout';
import { esc } from '../panels';
import { BUILDINGS, PRICE_STOCK, drawnThisVisit, isBuildingId, offer, priceOf, slotsOf, slotsOrder, slotsUsed, tearDown, whyNot, type BuildingId } from '../buildings';
import { openDistrict } from './district';
import { economy, buildBlueprint, buildStation } from '../economy';
import { LOT_BUILDINGS, PERKS, npc, relocate, stationCost, type HubState, type NpcDef } from '../state';
import { titleSave } from '../talkslice';
import type { Titles } from '../titles';
import type { HubHost, OfferPanel } from './host';

/**
 * The blueprints: the three this visit offers (`buildings.ts` `offer`), the picked one, what the city has and the slots left.
 * Drawing one up costs `PRICE_STOCK` and puts it on the next free slot as scaffolding; it stands when the next lift docks.
 * `have` is the stock the price is paid from, `all` the dev switch that puts every NPC aboard.
 */
export function plannerBody(s: HubState, o: { pick: string | null; have: number; titles?: Titles; all?: boolean }) {
  const offers = offer(s), why = (id: string) => whyNot(s, id, o.all);
  const chosen = offers.find((id) => id === o.pick) ?? null;
  const cost = chosen ? priceOf(chosen, o.titles) : 0;
  const card = (id: BuildingId) =>
    `<button class="ui-btn hb-card hb-card--bp${id === chosen ? ' is-selected' : ''}" data-a="bp" data-id="${id}"><b>${esc(BUILDINGS[id].name)}</b><span>${esc(BUILDINGS[id].text)}</span><span class="hb-bp__effect">${esc(BUILDINGS[id].effect)}</span><small>${priceOf(id, o.titles)} ${PRICE_STOCK}</small></button>`;
  const standing = slotsOrder(s).map((b) => `${esc(BUILDINGS[b.id].name)} (${b.done ? 'stands' : 'going up'})`);
  const tear = slotsOrder(s).filter((b) => b.done).map((b) => `<button class="ui-btn ui-btn--secondary hb-tear" data-a="tear" data-id="${b.id}" title="Rebuild: tear it down, nothing back, and draw up another in its slot">Tear down ${esc(BUILDINGS[b.id].name)}</button>`).join('');
  const slots = slotsOf(s, o.all);
  const note = drawnThisVisit(s) > 0 && !offers.length
    ? 'Drawn up this visit. The next lift brings the next three.'
    : !offers.length ? 'Everything I can draw is already in the city.' : slotsUsed(s) >= slots ? 'The city has no free slot. Come back when it has grown.' : '"Every city needs one thing it is famous for. Choose, and I will draw it up."';
  const block = chosen ? why(chosen) : null;
  const short = chosen && o.have < cost ? `Not enough ${PRICE_STOCK}: ${cost - o.have} more.` : null;
  return {
    title: 'The City Planner: blueprints',
    body: `<p class="hb-note">${note}</p>
      <div class="hb-cards">${offers.map(card).join('')}</div>
      <p class="hb-note">City slots: <b>${slotsUsed(s)} of ${slots}</b> used. ${standing.length ? `In the city: ${standing.join(', ')}.` : 'Nothing built yet.'}</p>
      ${tear ? `<div class="hb-tears">${tear}</div>` : ''}
      <p class="hb-note hb-note--dim">A blueprint goes up as scaffolding in the D-city window and stands when the next lift docks. One a visit. You have <b>${o.have}</b> ${PRICE_STOCK}.</p>
      ${block && !(drawnThisVisit(s) > 0 && !offers.length) ? `<p class="hb-note hb-note--warn">${esc(block)}</p>` : short ? `<p class="hb-note hb-note--warn">${short}</p>` : ''}`,
    actions: [
      `<button class="ui-btn ui-btn--primary" data-a="draw"${chosen && !block && !short ? '' : ' disabled'}>${chosen ? `Draw up ${esc(BUILDINGS[chosen].name)} (${cost} ${PRICE_STOCK})` : 'Draw up'}</button>`,
    ].join(''),
  };
}

const ROOM_LABEL: Record<string, string> = { workshop: 'Workshop', lift: 'Lift', planner: 'Course table', church: 'Church', colony: 'Colony' };
const shortName = (id: string) => npc(id)?.name.replace(/^The (City )?/, '') ?? id;

/**
 * The deck from above, drawn as the City Planner's draft (SVG in deck px): rooms and catwalks, every lot with its
 * stencilled number, the stations standing on them, and the Communicator. `pick` lots are clickable (`data-a="lot"`),
 * `sel` is outlined, `open` lots (free and joined to the deck) are marked as buildable.
 */
export function deckMap(s: HubState, o: { pick: string[]; open: string[]; sel?: string | null; me?: { x: number; y: number } }) {
  const on = Object.fromEntries(Object.entries(s.stations).map(([id, l]) => [l, id]));
  const rect = (r: { x: number; y: number; w: number; h: number }, cls: string) =>
    `<rect class="${cls}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="10"/>`;
  const lots = SLOTS.map((l) => {
    const who = on[l.id];
    const free = o.open.includes(l.id);
    const pick = o.pick.includes(l.id);
    const cx = l.x + l.w / 2, cy = l.y + l.h / 2;
    const title = `Lot ${l.n}${who ? `: ${esc(npc(who)?.station?.name ?? who)}` : free ? ': free' : ': open air, not joined to the deck yet'}`;
    return `<g class="hb-dm-lot ${who ? 'is-built' : free ? 'is-open' : 'is-air'}${pick ? ' is-pick' : ''}${o.sel === l.id ? ' is-sel' : ''}"${pick ? ` data-a="lot" data-id="${l.id}"` : ''}>
      <title>${title}</title>
      ${rect(l, 'hb-dm-lot__r')}<text class="hb-dm-n" x="${l.x + 22}" y="${l.y + 58}">${l.n}</text>
      ${who ? `<text class="hb-dm-who" x="${cx}" y="${cy + 14}">${esc(shortName(who))}</text>` : free ? `<text class="hb-dm-free" x="${cx}" y="${cy + 14}">free</text>` : ''}</g>`;
  }).join('');
  const rooms = ROOMS.map((r) => `${rect(r, 'hb-dm-room')}<text class="hb-dm-room__t" x="${r.x + r.w / 2}" y="${r.y + r.h / 2 + 14}">${ROOM_LABEL[r.id] ?? esc(r.name)}</text>`).join('');
  const walks = WALKWAYS.map((w) => rect(w, 'hb-dm-walk')).join('');
  const me = o.me ? `<circle class="hb-dm-me" cx="${o.me.x}" cy="${o.me.y}" r="26"><title>You</title></circle>` : '';
  const deck = rect({ x: 0, y: 0, w: DECK.w, h: DECK.h }, 'hb-dm-deck');
  return `<svg class="hb-dm" viewBox="-20 -20 ${DECK.w + 40} ${DECK.h + 40}" role="img" aria-label="The deck">${deck}${lots}${walks}${rooms}${me}</svg>`;
}

/**
 * The City Planner redraws the deck (free): pick a station, then a free lot to move it to, or another station to swap the
 * two. `build` lots (free, joined to the deck; only once the main quest opens building) are clickable too: a building goes up there.
 */
export function redrawBody(s: HubState, sel: string | null, open: string[], me?: { x: number; y: number }, build: string[] = []) {
  const built = Object.values(s.stations);
  const selId = Object.keys(s.stations).find((k) => s.stations[k] === sel);
  const hint = selId
    ? `Moving the <b>${esc(npc(selId)?.station?.name ?? selId)}</b>: pick a free lot, or another station to swap the two. Click it again to leave it be.`
    : build.length ? 'Pick a station to move, or a free lot to build on.' : 'Pick a station to move.';
  const map = deckMap(s, { pick: sel ? [...built, ...open] : [...built, ...build], open: sel ? open : build, sel, me });
  return {
    title: 'The City Planner: redraw the deck',
    body: `<div class="hb-dm-wrap">${map}<div class="hb-dm-side">
      <p class="hb-note">"Nothing aboard is bolted down that I cannot unbolt. Point, and my crews will carry it."</p>
      <p class="hb-note">${hint}</p>
      <p class="hb-note hb-note--dim">Moving is free of charge. Every station must still join the deck.</p>
    </div></div>`,
  };
}

/**
 * A free lot picked on the City Planner's map: what can go up on it (your house, the Wanderer's improvements), each once,
 * at a station's price. `choices` are the buildings not yet built; `pick` the one chosen.
 */
export function lotBody(s: HubState, lot: Slot, choices: NpcDef[], pick: string | null, me?: { x: number; y: number }) {
  const cost = stationCost(s, titleSave.get()), have = economy.get().copper, afford = have >= cost;
  const chosen = choices.find((c) => c.id === pick);
  const card = (c: NpcDef) =>
    `<button class="ui-btn hb-card hb-card--lot${c.id === pick ? ' is-selected' : ''}" data-a="choose" data-id="${c.id}">${[
      `<b>${esc(c.station!.name)}</b>`,
      `<span>${esc(PERKS[c.station!.gift].text)}</span>`,
    ].join('')}</button>`;
  const cards = choices.map(card).join('');
  const actions = [
    '<button class="ui-btn ui-btn--secondary" data-a="back">Back to the map</button>',
    `<button class="ui-btn ui-btn--primary" data-a="build"${chosen && afford ? '' : ' disabled'}>${chosen ? `Build the ${esc(chosen.station!.name)}` : 'Build'}</button>`,
  ].join('');
  return {
    title: `The City Planner: lot ${lot.n}`,
    body: `<div class="hb-dm-wrap">${deckMap(s, { pick: [], open: [lot.id], sel: lot.id, me })}<div class="hb-dm-side">
      <p class="hb-note">"A clean lot${lot.w > 400 ? ', and a wide one' : ''}. What do we put up?"</p>
      ${choices.length ? `<div class="hb-lotpick">${cards}</div>` : '<p class="hb-note">Everything I can draw is already built.</p>'}
      ${chosen ? `<p class="hb-note hb-note--dim">${esc(chosen.intro)}</p>` : ''}
      <p class="hb-note">Each costs <b>${cost} copper</b> (you have <b>${have}</b>).</p>
      ${afford ? '' : `<p class="hb-note hb-note--warn">Not enough copper: strip ${cost - have} more from the ruins.</p>`}
    </div></div>`,
    actions,
  };
}

/** The blueprints: pick one of the three, then draw it up (paid in `PRICE_STOCK`, going up on the next free city slot). */
export function openPlanner(host: HubHost, pick: string | null = null) {
  const titles = titleSave.get();
  const b = plannerBody(host.s, { pick, have: economy.get()[PRICE_STOCK], titles, all: host.allRescued });
  const wasOpen = !!host.hud.panel;
  const el = host.hud.open('planner', b.title, b.body, b.actions, '{esc} to close');
  el.querySelectorAll<HTMLElement>('[data-a="bp"]').forEach((c) =>
    c.addEventListener('click', () => {
      host.k.audio.sfx.play('click', { gain: 0.4 });
      openPlanner(host, c.dataset.id!);
    }),
  );
  el.querySelector('[data-a="draw"]')?.addEventListener('click', () => {
    if (!pick) return;
    try {
      host.pay(buildBlueprint({ eco: economy.get(), hub: host.s }, pick, titles, host.allRescued));
    } catch (e) {
      host.hud.say('The City Planner', (e as Error).message);
      host.k.audio.sfx.play('click');
      return;
    }
    host.k.audio.sfx.play('ratchet');
    host.k.audio.sfx.play('latch', { gain: 0.6 });
    host.hud.banner(`${BUILDINGS[pick as BuildingId].name} is drawn up: it goes up in the D-city while you are away.`);
    openPlanner(host);
  });
  el.querySelectorAll<HTMLElement>('[data-a="tear"]').forEach((c) => c.addEventListener('click', () => openTear(host, c.dataset.id!)));
  if (!wasOpen) host.panelOpened();
}

/** Rebuild's confirm (D48): tearing a building down gives nothing back. */
export function tearBody(s: HubState, id: BuildingId) {
  return {
    title: `The City Planner: tear down ${BUILDINGS[id].name}`,
    body: `<p class="hb-note">"Down it comes, Communicator, and nothing comes back, not a coin of the copper. Its slot is free for another, drawn up at full price, one a visit."</p>
      <p class="hb-note"><b>${esc(BUILDINGS[id].name)}</b>: ${esc(BUILDINGS[id].effect)} That stops at once.${id === 'reliquary' ? ' The AI core it gave stays; a Reliquary built again gives none.' : ''}</p>
      <p class="hb-note hb-note--dim">It comes back into my offers.</p>`,
    actions: '<button class="ui-btn ui-btn--secondary" data-a="keep">Keep it</button><button class="ui-btn ui-btn--primary" data-a="tear">Tear it down</button>',
  };
}

/** Confirm, then tear a standing building down. */
export function openTear(host: HubHost, id: string) {
  if (!isBuildingId(id)) return;
  const wasOpen = !!host.hud.panel;
  const b = tearBody(host.s, id);
  const el = host.hud.open('planner-tear', b.title, b.body, b.actions, '{esc} to close');
  el.querySelector('[data-a="keep"]')?.addEventListener('click', () => openPlanner(host));
  el.querySelector('[data-a="tear"]')?.addEventListener('click', () => {
    try {
      host.save(tearDown(host.s, id, host.allRescued));
    } catch (e) {
      host.hud.say('The City Planner', (e as Error).message);
      host.k.audio.sfx.play('click');
      return;
    }
    host.k.audio.sfx.play('ratchet');
    host.hud.banner(`${BUILDINGS[id].name} comes down. Its slot is free.`);
    openPlanner(host);
  });
  if (!wasOpen) host.panelOpened();
}

/**
 * The City Planner's redraw: the deck's map; pick a station, then a free lot (it moves) or another station (they swap).
 * Free. The booths are pulled down and put up again where the save now says.
 */
export function openRedraw(host: HubHost, sel: string | null = null) {
  const wasOpen = !!host.hud.panel;
  const from = Object.keys(host.s.stations).find((k) => host.s.stations[k] === sel);
  const open = from ? openLots(Object.values(host.s.stations).filter((l) => l !== sel)).map((l) => l.id).filter((l) => l !== sel) : [];
  // Once the main quest opens building (the house), a free lot is a building site: your house, the Wanderer's improvements.
  const build = !from && host.has('house') ? openLots(Object.values(host.s.stations)).map((l) => l.id) : [];
  const b = redrawBody(host.s, sel, open, host.me, build);
  const el = host.hud.open('redraw', b.title, b.body, '', '{esc} to close');
  el.querySelectorAll('[data-a="lot"]').forEach((g) =>
    g.addEventListener('click', () => {
      const lot = (g as HTMLElement).dataset.id!;
      if (build.includes(lot)) {
        host.k.audio.sfx.play('ratchet');
        return openLot(host, lot);
      }
      if (!from || lot === sel) {
        host.k.audio.sfx.play('ratchet');
        return openRedraw(host, lot === sel ? null : lot);
      }
      try {
        host.moveStations(relocate(host.s, from, lot, host.allRescued));
      } catch (e) {
        host.hud.say('The City Planner', (e as Error).message);
        host.k.audio.sfx.play('click');
        return;
      }
      host.raised(lot);
      host.hud.banner(`${npc(from)!.station!.name} moved`);
      openRedraw(host);
    }),
  );
  if (!wasOpen) host.panelOpened();
}

/** A free lot from the City Planner's map: pick what goes up on it (your house, an improvement for the Wanderer) and pay its copper. */
export function openLot(host: HubHost, lot: string, pick: string | null = null) {
  const wasOpen = !!host.hud.panel;
  const choices = LOT_BUILDINGS.filter((b) => !host.s.stations[b.id]);
  const b = lotBody(host.s, lotOf(lot), choices, pick ?? (choices.length === 1 ? choices[0].id : null), host.me);
  const el = host.hud.open('lot', b.title, b.body, b.actions, '{esc} to close');
  el.querySelectorAll<HTMLElement>('[data-a="choose"]').forEach((c) =>
    c.addEventListener('click', () => {
      host.k.audio.sfx.play('click', { gain: 0.4 });
      openLot(host, lot, c.dataset.id!);
    }),
  );
  el.querySelector('[data-a="back"]')?.addEventListener('click', () => openRedraw(host));
  el.querySelector('[data-a="build"]')?.addEventListener('click', () => {
    const id = pick ?? (choices.length === 1 ? choices[0].id : null);
    if (!id) return;
    try {
      host.pay(buildStation({ eco: economy.get(), hub: host.s }, id, lot, host.allRescued, false, titleSave.get()));
    } catch (e) {
      host.hud.say('The City Planner', (e as Error).message);
      host.k.audio.sfx.play('click');
      return;
    }
    host.raised(lot);
    const what = npc(id)!;
    host.hud.banner(id === 'home' ? 'Your house stands. A bed of your own: you land rested, Hasted for the first minute.' : `${what.station!.name} built: ${what.unlocks}`);
    openRedraw(host);
  });
  if (!wasOpen) host.panelOpened();
}

export const plannerOffer: OfferPanel = {
  actions: [
    '<button class="ui-btn ui-btn--secondary" data-a="redraw">Redraw the deck</button>',
    '<button class="ui-btn ui-btn--secondary" data-a="planner">Draw up a building</button>',
    '<button class="ui-btn ui-btn--secondary" data-a="district">The Rising District</button>',
  ].join(''),
  wire: (host, el) => {
    el.querySelector('[data-a="planner"]')?.addEventListener('click', () => openPlanner(host));
    el.querySelector('[data-a="district"]')?.addEventListener('click', () => openDistrict(host, () => openPlanner(host)));
    el.querySelector('[data-a="redraw"]')?.addEventListener('click', () => openRedraw(host));
  },
};
