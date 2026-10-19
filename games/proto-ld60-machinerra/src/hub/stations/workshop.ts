/**
 * The workbench: your robots, new bodies, the Communicator's chassis, the parts. Rules are in `workshop.ts` (one level up);
 * this is the panel (`workshopBody`, tabs), its wiring (`drawWorkshop`) and the `workshop` dev command.
 * Add a tab: an entry in `workshopBody`'s `tabbed([...])`. Add a button: a `data-a` and its case in `drawWorkshop`.
 */
import { command } from '../../../../../harness/dev/commands';
import { PARTS, ROLES, type PartKind } from '../../sim/defs';
import { CHASSIS, CHASSIS_IDS, RANK_MAX, RANK_NAMES, RANK_WORK, rankStats, type ChassisId } from '../../sim/bots';
import { CREW_ROLES, STATS, type CrewRole } from '../../sim/gear';
import { RELIC_IDS, JUNK, RELICS, isRelic, isUnique, relicName, type RelicId } from '../../sim/junk';
import { BOT_TYPES, SPECS, SPEC_IDS, TYPES, isBotType, type BotType, type SpecId } from '../../sim/specs';
import { relicTex } from '../../relicart';
import { STOKE } from '../../sim/stoke';
import { BOOST, gaugesOf, profile, type GaugeRow, type Profile } from '../deeds';
import { economy, repairCost } from '../economy';
import { esc, tabbed } from '../panels';
import { benchRelics, fit as fitRelicTo, offerable, offerJunk, relicLabel, sellJunk, unfit as unfitRelic, type Source as RelicSource } from '../relics';
import type { HubState } from '../state';
import {
  BODY,
  CHASSIS_COST,
  PROMOTE,
  RANK_COST,
  REBUILD,
  SALVAGE,
  STOKE_COST,
  buy as buyBot,
  bodyCost,
  canBuild,
  chassisUp,
  costText,
  fitRelic,
  foundried,
  freeCores,
  freshName,
  freshRoster,
  noCore,
  promote,
  rankUp,
  rebuild,
  repairDowned,
  riders,
  roster,
  salvage,
  stoke,
  type Roster,
  type Shop,
} from '../workshop';
import type { HubHost, StationPanel } from './host';

/** What the workshop panel shows of a robot type: its sprite (`face(role)`, a data URL) and a part's (`icon(kind)`). */
export interface WorkshopArt {
  icon: (k: PartKind) => string;
  face: (role: CrewRole) => string;
  /** A relic's picture (`relicart.ts` `relicTex`). */
  relic: (id: string) => string;
}

/** What the bench holds: the junk in the stock, and which tile (`junk:<i>`, `part:<kind>`) or robot's socket (`bot:<uid>`) is picked up to be fitted by a click. */
export interface Bench {
  junk: RelicId[];
  picked: string | null;
}

/** A relic's words (the stores' pop-up, a worn socket's pop-up, the strip of the piece picked up): reading, item and socket, effect, flaw. */
export function relicCard(id: string, n = 1) {
  if (!isRelic(id)) return `<b>${esc(relicName(id))}</b>`;
  const def = RELICS[id];
  return [
    `<b>${esc(def.reading)}${n > 1 ? ` <i>× ${n}</i>` : ''}</b>`,
    `<small>${def.no === 'U' ? 'Unique' : esc(def.item)} · ${def.socket}</small>`,
    `<span>${esc(def.effect)}</span>`,
    `<em>${esc(def.flaw)}</em>`,
  ].join('');
}

type Cost = { scrap?: number; copper?: number; parts?: number };
type Bot = Roster['bots'][number];

/**
 * The workshop (`workshop.ts` holds its rules): your robots and who rides the lift down, new bodies, the Communicator's
 * chassis, and the parts brought home. Buttons carry `data-a` (rank, rebuild, salvage, buy, chassis, gear)
 * and `data-id`; `drawWorkshop` wires them. `tab` is the tab left open last time. A robot's spec shows on its row; Promote
 * (`pick`, then `promote` with `data-spec`) opens `pick`'s spec picker under its row: its type's three specs, the unlocked
 * ones choosable for `PROMOTE`, the locked ones showing their deed gauge (`deeds.ts`, the profile `deeds`, also the Deeds tab).
 */
export function workshopBody(
  s: HubState,
  ro: Roster,
  scrap: number,
  art: WorkshopArt,
  tab = 'robots',
  pick: string | null = null,
  deeds: Profile = profile.get(),
  bench: Bench = { junk: economy.get().junk, picked: null },
  cores = Infinity,
) {
  const spare = Object.entries(s.parts).filter(([k]) => !PARTS[k as PartKind]?.unique);
  const have = { scrap, copper: economy.get().copper, coal: economy.get().coal, parts: spare.reduce((n, [, v]) => n + (v ?? 0), 0) };
  const can = (c: Cost) => (c.scrap ?? 0) <= have.scrap && (c.copper ?? 0) <= have.copper && (c.parts ?? 0) <= have.parts;
  const btn = (a: string, id: string, label: string, c?: Cost, off = false, cls = 'ui-btn--secondary') =>
    `<button class="ui-btn ${cls} hb-wbtn"
      data-a="${a}"
      data-id="${esc(id)}"${off || (c && !can(c)) ? ' disabled' : ''}>${label}${c ? `<small>${costText(c)}</small>` : ''}</button>`;
  const stars = (n: number, max = RANK_MAX) => `<span class="hb-stars" title="${RANK_NAMES[n] ?? ''}">${'★'.repeat(n)}${'☆'.repeat(max - n)}</span>`;
  const work = (role: CrewRole, rank: number) => {
    const st = rankStats(role, rank);
    const oil = ROLES[role].hp + (st.oil ?? 0);
    const more = RANK_WORK[role].map((k) => (st[k] ? `${STATS[k].name} +${st[k]}%` : '')).filter(Boolean);
    return [`Oil ${oil}`, ...(st.armour ? [`Armour ${st.armour}%`] : []), ...more].join(' · ');
  };
  const FOCUS = { core: 'Core', secondary: 'Secondary', inverted: 'Inverted' };
  const gauge = (g: GaugeRow) =>
    `<span class="hb-gauge${g.full ? ' is-full' : ''}"
      style="--fill:${Math.round((g.have / g.size) * 100)}%"
      title="${esc(g.deed)}"><i></i></span>`;
  // Stoke (Minos): feed it coal for the next mission, one click, on or off. Beside Rank, where the lift's crew is readied.
  const stokeBtn = (b: Bot) => {
    const tip = `Feed it coal for the next mission: +${STOKE.speed * 100}% move speed${b.spec === 'firebrand' ? `, and its damage and fire +${STOKE.damage * 100}%` : ''}. Click again to take it back.`;
    return `<button class="ui-btn ${b.stoked ? 'ui-btn--primary' : 'ui-btn--secondary'} hb-wbtn"
      data-a="stoke"
      data-id="${esc(b.uid)}"
      aria-pressed="${!!b.stoked}"
      title="${esc(tip)}"${b.stoked || have.coal >= STOKE_COST.coal ? '' : ' disabled'}>${b.stoked ? 'Stoked' : 'Stoke'}<small>${b.stoked ? 'click to cool' : `${STOKE_COST.coal} coal`}</small></button>`;
  };
  // The spec picker under a robot's row: its type's three specs.
  const picker = (b: Bot) => {
    const type = b.role as BotType;
    const cards = gaugesOf(deeds, type).map((g) => {
      const d = SPECS[g.spec];
      const tail = g.full
        ? `<button class="ui-btn ui-btn--primary hb-wbtn"
            data-a="promote"
            data-id="${esc(b.uid)}"
            data-spec="${g.spec}"${can(PROMOTE) ? '' : ' disabled'}>Choose<small>${costText(PROMOTE)}</small></button>`
        : `${gauge(g)}<small>${g.have} / ${g.size}: ${esc(g.deed)}</small>`;
      return [
        `<div class="hb-spec__card${g.full ? '' : ' is-locked'}">`,
        `<b>${d.name}</b>`,
        `<em>${FOCUS[g.focus]}</em>`,
        `<span>${esc(d.text)}</span>`,
        tail,
        '</div>',
      ].join('');
    });
    const note = [
      `${esc(b.name)} takes one calling for good (it stays through a rebuild). `,
      `A locked one opens when its ${TYPES[type].name} deed gauge fills, in any mission.`,
    ].join('');
    return `<div class="hb-spec"><p class="hb-note hb-note--dim">${note}</p><div class="hb-spec__cards">${cards.join('')}</div></div>`;
  };
  // The relic socket (P19, D10): drag a relic from the old tech below onto it, or pick one up and click it. A worn relic can be dragged to another robot's socket (they swap).
  const picked = bench.picked;
  const socket = (b: Bot) => {
    const r = b.relic;
    const cls = `hb-socket${r ? ' is-full' : ''}${picked && picked !== `bot:${b.uid}` ? ' is-ready' : ''}${picked === `bot:${b.uid}` ? ' is-picked' : ''}`;
    const img = r ? `<img src="${art.relic(r)}" alt="${esc(relicName(r))}" draggable="true" data-drag="bot:${esc(b.uid)}">` : '<i></i>';
    // A worn relic says what it does in the pop-up (`data-relic`); an empty socket keeps its plain tip.
    const tip = r ? `data-relic="${esc(r)}"` : 'title="Relic socket: drag a piece of old tech here"';
    return `<span class="${cls}"
      data-socket="${esc(b.uid)}"
      data-a="${r && !picked ? 'rpick' : 'fit'}"
      data-id="${esc(r && !picked ? `bot:${b.uid}` : b.uid)}"
      ${tip}
      role="button"
      tabindex="0">${img}</span>`;
  };
  const stock = benchRelics({ eco: { junk: bench.junk }, hub: s });
  const dupes = new Set(offerable({ eco: { junk: bench.junk }, roster: ro }));
  // The stores stack by relic (Laimonas): a small icon each, the count on its corner, the words in the pop-up on hover.
  const stacks = new Map<string, { id: RelicId; srcs: string[]; junk: number[] }>();
  for (const it of stock) {
    const key = 'part' in it ? `part:${it.part}` : it.id;
    const st = stacks.get(key) ?? { id: it.id, srcs: [], junk: [] };
    st.srcs.push('part' in it ? `part:${it.part}` : `junk:${it.junk}`);
    if ('junk' in it) st.junk.push(it.junk);
    stacks.set(key, st);
  }
  const tile = (st: { id: RelicId; srcs: string[] }) => {
    const on = st.srcs.find((x) => x === picked);
    const src = on ?? st.srcs[0];
    const n = st.srcs.length;
    return `<div class="hb-relic${on ? ' is-picked' : ''}"
      draggable="true"
      data-drag="${src}"
      data-a="rpick"
      data-id="${src}"
      data-relic="${esc(st.id)}"
      data-n="${n}"
      role="button"
      aria-label="${esc(RELICS[st.id].reading)}"
      tabindex="0">
      <img src="${art.relic(st.id)}" alt="" draggable="false">${n > 1 ? `<span class="hb-relic__n">${n}</span>` : ''}
    </div>`;
  };
  // The stack picked up: its words, and Offer and Sell, in a strip under the icons (the pop-up only shows).
  const held = [...stacks.values()].find((st) => picked && st.srcs.includes(picked));
  const heldJunk = held && picked?.startsWith('junk:') ? Number(picked.slice(5)) : null;
  const heldOffer = held?.junk.find((i) => dupes.has(i));
  const sell = heldJunk !== null
    ? `<button class="ui-btn ui-btn--faint hb-wbtn"
        data-a="junksell"
        data-id="${heldJunk}"
        title="The Trader pays ${JUNK.sell} scrap">Sell<small>${JUNK.sell} scrap</small></button>`
    : '';
  const offer = heldOffer !== undefined
    ? `<button class="ui-btn ui-btn--faint hb-wbtn"
        data-a="junkoffer"
        data-id="${heldOffer}"
        title="You already have one fitted: the Oracle will take this one">Offer<small>${JUNK.offer} insight</small></button>`
    : '';
  const strip = held
    ? `<div class="hb-relichold">
        <img src="${art.relic(held.id)}" alt="">
        <div class="hb-relic__what">${relicCard(held.id, held.srcs.length)}<small>Now click a robot's socket below to fit it.</small></div>
        <div class="hb-relic__do">${offer}${sell}</div>
      </div>`
    : '';
  const oldTechNote = stock.length
    ? [
        "Old tech from the sands, misread. Hover a piece to read it; drag it onto a robot's socket below (or click it, then the socket). ",
        'One socket a robot; a robot left behind keeps its relic.',
      ].join('')
    : 'No old tech in the stores. Search dead ruins for junk (hold Use); it rides home on the carry strip.';
  const oldTech = `<div class="hb-oldtech"><p class="hb-note hb-note--dim">${oldTechNote}</p>${
    stock.length ? `<div class="hb-relics">${[...stacks.values()].map(tile).join('')}</div>${strip}` : ''
  }</div>`;
  // Every robot that is not a wreck rides; a new body needs a free AI core (`noCore`).
  const goes = riders(ro).length;
  const stoked = riders(ro).filter((b) => b.stoked).length;
  const noBuild = noCore(ro, { cores });
  const bots = ro.bots.length
    ? ro.bots
        .map((b) => {
          const next = b.rank < RANK_MAX ? RANK_COST[b.rank + 1] : null;
          const hurt = b.wreck || b.downed;
          const state = b.wreck
            ? btn('rebuild', b.uid, 'Rebuild', foundried(s, REBUILD), false, 'ui-btn--primary')
            : b.downed
              ? btn('repair', b.uid, 'Repair', foundried(s, { scrap: repairCost('carried').scrap }), false, 'ui-btn--primary')
              : `${stokeBtn(b)}${next ? btn('rank', b.uid, RANK_NAMES[b.rank + 1], next) : ''}${!b.spec && isBotType(b.role) ? btn('pick', b.uid, pick === b.uid ? 'Close' : 'Promote') : ''}`;
          const picking = pick === b.uid && !hurt && !b.spec && isBotType(b.role);
          const kind = ROLES[b.role].name
            + (b.spec ? ` · <i class="hb-spectag" title="${esc(SPECS[b.spec].text)}">${SPECS[b.spec].name}</i>` : '')
            + (b.wreck ? ' · <em>a wreck, left on the sands</em>' : b.downed ? ' · <em>carried home, down</em>' : '');
          return `<div class="hb-wgroup"><div class="hb-wbot${hurt ? ' is-wreck' : ''}${hurt ? '' : ' is-field'}">
            <img class="hb-wbot__face" src="${art.face(b.role)}" alt="">
            ${socket(b)}
            <div class="hb-wbot__what"><b>${esc(b.name)} ${stars(b.rank)}</b><span>${kind}</span><small>${work(b.role, b.rank)}</small></div>
            <div class="hb-wbot__do">${state}${btn('salvage', b.uid, 'Salvage', undefined, false, 'ui-btn--faint')}</div>
          </div>${picking ? picker(b) : ''}</div>`;
        })
        .join('')
    : '<p class="hb-note hb-note--dim">No robots yet: you start alone. Build one (it needs a free AI core), or find one on the sands.</p>';
  const coreNote = Number.isFinite(cores)
    ? ` · <span title="One robot per AI core. Cores come from Core Vaults and from bosses.">${cores} AI core${cores === 1 ? '' : 's'}</span>`
    : '';
  const robots = `${oldTech}<div class="hb-row hb-row--mid"><span>On the lift: <b>${goes} / ${ro.bots.length}</b>${stoked ? ` · <span title="Fed coal for the next mission">${stoked} stoked</span>` : ''}${coreNote}</span></div>
    <div class="hb-wbots">${bots}</div>
    <p class="hb-note hb-note--dim">${[
      'Only robots standing on the lift when it rises come home; the rest are wrecks until rebuilt (rank kept). A downed one you carried up is repaired for less. Stoke feeds a robot coal for one mission. ',
      'Gear goes by type: the inventory (I), Underlings.',
    ].join('')}</p>`;
  // The bench display: each type's three gauges, compact.
  const deedRows = BOT_TYPES.filter((ty) => (CREW_ROLES as string[]).includes(ty))
    .map((ty) => {
      const rows = gaugesOf(deeds, ty);
      const boost = deeds.boost === ty ? `<em title="Sprocket's patterns">+${BOOST * 100}%</em>` : '';
      const gaugeRow = (g: GaugeRow) =>
        `<div class="hb-deed__g${g.full ? ' is-full' : ''}" title="${esc(g.deed)}">${[
          `<span>${g.name}</span>`,
          gauge(g),
          `<small>${g.full ? 'open' : `${g.have} / ${g.size}`}</small>`,
        ].join('')}</div>`;
      return `<div class="hb-deed">${[
        `<img class="hb-deed__face" src="${art.face(ty as CrewRole)}" alt="">`,
        `<b>${TYPES[ty].name}${boost}</b>`,
        rows.map(gaugeRow).join(''),
      ].join('')}</div>`;
    })
    .join('');
  const deedsTab = `<div class="hb-deeds">${deedRows}</div><p class="hb-note hb-note--dim">${[
    "Every robot of a type fills its gauges, in any mission you ride home from; a full one opens that calling for good (Promote on the robot's row). ",
    'Booting a robot into a foe fills the third.',
  ].join('')}</p>`;
  const build = `<div class="hb-wbots">${CREW_ROLES.map((role) => {
    const B = bodyCost(role, s);
    const open = canBuild(role, ro);
    return `<div class="hb-wbot${open ? '' : ' is-locked'}">
      <img class="hb-wbot__face" src="${art.face(role)}" alt="">
      <div class="hb-wbot__what"><b>${ROLES[role].name}</b><span>${esc(ROLES[role].blurb)}</span>${open ? '' : `<small class="hb-note--warn">${esc(B.found!)}</small>`}</div>
      <div class="hb-wbot__do">${btn('buy', role, 'Build', foundried(s, B), !open || !!noBuild, 'ui-btn--primary')}</div>
    </div>`;
  }).join('')}</div>
    <p class="hb-note hb-note--dim">${[
      noBuild ? `<span class="hb-note--warn">Nothing can be built: ${esc(noBuild)}.</span> ` : 'A new body needs a free AI core. ',
      "Parts come from the most plentiful in the stores (never a boss's unique).",
    ].join('')}</p>`;
  const chassis = `<div class="hb-wbots">${CHASSIS_IDS.map((id) => {
    const C = CHASSIS[id];
    const lv = ro.chassis[id] ?? 0;
    const per = (Object.entries(C.per) as [keyof typeof STATS, number][]).map(([k, v]) => `${STATS[k].name} +${v}${STATS[k].pts ? '' : '%'}`).join(', ');
    return `<div class="hb-wbot">
      <div class="hb-wbot__what"><b>${C.name} ${stars(lv, C.max)}</b><span>${esc(C.text)}</span><small>Each level: ${per}</small></div>
      <div class="hb-wbot__do">${lv < C.max ? btn('chassis', id, `Level ${lv + 1}`, CHASSIS_COST[lv + 1]) : '<em class="hb-note--dim">Full</em>'}</div>
    </div>`;
  }).join('')}</div>
    <div class="hb-row hb-row--mid"><span class="hb-note--dim">Weapons and body parts are fitted and crafted in the inventory.</span>${btn('gear', 'comm', 'Gear and crafting (I)')}</div>`;
  const kinds = Object.keys(PARTS) as PartKind[];
  const part = (k: PartKind) => {
    const n = s.parts[k] ?? 0;
    const p = PARTS[k];
    const slot = `<div class="ui-slot hb-part${p.unique ? ' hb-part--unique' : ''}" title="${esc(p.name)}"><img src="${art.icon(k)}" alt=""><span class="ui-slot__count">${n}</span></div>`;
    // A boss's unique: a gilded slot, its source and its flavour; a dim one with a question mark until it is taken.
    if (p.unique) {
      return n
        ? `${slot}
        <div class="hb-part__name hb-part__name--unique">${[
          esc(p.name),
          `<small>Unique ${p.slot}, from ${esc(p.source ?? p.from)}</small>`,
          `<em>${esc(p.flavour ?? '')}</em>`,
        ].join('')}</div>`
        : `<div class="ui-slot hb-part hb-part--unique is-empty" title="Unique"><span class="hb-part__q">?</span></div>
        <div class="hb-part__name hb-part__name--unique">A unique ${p.slot}<small>Taken from ${esc(p.source ?? p.from)}</small></div>`;
    }
    return n
      ? `${slot}
        <div class="hb-part__name">${esc(p.name)}<small>${p.slot}, from ${p.from}s</small></div>`
      : '';
  };
  const slots = [...kinds.filter((k) => !PARTS[k].unique), ...kinds.filter((k) => PARTS[k].unique)].map(part).join('');
  return {
    title: 'Workshop',
    body: `<p class="hb-note hb-note--dim">${have.scrap} scrap · ${have.copper} copper · ${have.coal} coal · ${have.parts} parts to spend</p>${tabbed(
      [
        { id: 'robots', label: 'Your robots', html: robots },
        { id: 'build', label: 'Build a robot', html: build },
        { id: 'deeds', label: 'Deeds', html: deedsTab },
        { id: 'chassis', label: 'Communicator', html: chassis },
        { id: 'parts', label: 'Parts', html: `<div class="hb-parts">${slots}</div>` },
      ],
      tab,
    )}`,
  };
}

/** The workshop's UI state while the hub runs: the robot whose spec picker is open, the relic picked up to be fitted (`junk:<i>`, `part:<kind>`, `bot:<uid>`). */
const ui = (host: HubHost) => host.memo('workshop', () => ({ promoting: null as string | null, relicPick: null as string | null }));

export const workshopStation: StationPanel = (host: HubHost) => {
  // D29: the workshop opens with Sprocket's station (her bench), not with the Oracle's quest.
  if (!host.s.stations.sprocket && !host.allRescued) {
    host.hud.say('The Workbench', 'Covered with a cloth. A note: "Needs someone who knows which end of a spanner to hold." Find her on the sands.');
    host.k.audio.sfx.play('click');
    return false;
  }
  drawWorkshop(host);
  return true;
};

/** The workshop's panel: your robots, new bodies, the chassis, the parts. Re-drawn after every change, on the same tab. */
function drawWorkshop(host: HubHost) {
  const state = ui(host);
  const ro = roster.get();
  const art: WorkshopArt = {
    icon: (k) => host.textures.getBase64(`part-${k}`),
    face: (r) => host.textures.getBase64('atlas', `crew/${r}`),
    relic: (id) => host.textures.getBase64(relicTex(id)),
  };
  const b = workshopBody(host.s, ro, economy.get().scrap, art, host.tabs.workshop, state.promoting, undefined, { junk: economy.get().junk, picked: state.relicPick }, economy.get().cores);
  // A redraw keeps each tab's scroll, so a button low in the list stays under the pointer.
  const scroll = new Map<string, number>();
  if (host.hud.panelKind === 'workshop') host.hud.panel?.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => scroll.set(p.dataset.pane!, p.scrollTop));
  const el = host.hud.open('workshop', b.title, b.body);
  el.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.scrollTop = scroll.get(p.dataset.pane!) ?? 0));
  el.querySelectorAll<HTMLElement>('[data-tab]').forEach((t) =>
    t.addEventListener('click', () => {
      host.tabs.workshop = t.dataset.tab!;
      el.querySelectorAll<HTMLElement>('[data-tab]').forEach((o) => o.setAttribute('aria-selected', String(o === t)));
      el.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
      host.k.audio.sfx.play('click', { gain: 0.3 });
    }),
  );
  const name = (uid: string) => ro.bots.find((x) => x.uid === uid)?.name ?? uid;
  // Relics (P19, D10): drag a piece of old tech (or a worn relic) onto a socket; a click picks it up, a click on a socket fits it.
  const relicSrc = (key: string): RelicSource | null => {
    const kind = key.slice(0, key.indexOf(':')), v = key.slice(key.indexOf(':') + 1);
    return kind === 'junk' ? { junk: Number(v) } : kind === 'part' ? { part: v as PartKind } : kind === 'bot' ? { bot: v } : null;
  };
  const fitFrom = (uid: string, key: string) => {
    const src = relicSrc(key);
    if (!src) return;
    state.relicPick = null;
    run(host, () => {
      const r = fitRelicTo({ eco: economy.get(), hub: host.s, roster: ro }, uid, src);
      economy.set(r.eco);
      roster.set(r.roster);
      host.save(r.hub);
      return `${name(uid)} wears the ${relicLabel(r.roster.bots.find((x) => x.uid === uid)!.relic!)}`;
    });
  };
  el.querySelectorAll<HTMLElement>('[data-drag]').forEach((d) =>
    d.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', d.dataset.drag!);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      e.stopPropagation();
    }),
  );
  el.querySelectorAll<HTMLElement>('[data-socket]').forEach((sock) => {
    sock.addEventListener('dragover', (e) => {
      e.preventDefault();
      sock.classList.add('is-over');
    });
    sock.addEventListener('dragleave', () => sock.classList.remove('is-over'));
    sock.addEventListener('drop', (e) => {
      e.preventDefault();
      const key = e.dataTransfer?.getData('text/plain');
      if (key) fitFrom(sock.dataset.socket!, key);
    });
  });
  // The pop-up over a relic (a stores icon, a worn socket) on hover or focus. It sits on the backdrop, outside the panel's scroll;
  // the HUD is scaled with the canvas, so screen pixels are divided by that scale.
  const back = el.parentElement!;
  const pop = document.createElement('div');
  pop.className = 'hb-relicpop';
  pop.hidden = true;
  back.append(pop);
  const showPop = (t: HTMLElement) => {
    pop.innerHTML = `<div class="hb-relic__what">${relicCard(t.dataset.relic!, Number(t.dataset.n ?? 1))}</div>`;
    pop.hidden = false;
    const a = t.getBoundingClientRect(), b = back.getBoundingClientRect(), p = pop.getBoundingClientRect();
    const k = b.width / (back.offsetWidth || b.width) || 1;
    const x = Math.min(Math.max(a.left + a.width / 2 - p.width / 2, b.left + 8), b.right - p.width - 8);
    const y = a.top - p.height - 8 >= b.top ? a.top - p.height - 8 : a.bottom + 8;
    pop.style.left = `${(x - b.left) / k}px`;
    pop.style.top = `${(y - b.top) / k}px`;
  };
  el.querySelectorAll<HTMLElement>('[data-relic]').forEach((t) => {
    t.addEventListener('mouseenter', () => showPop(t));
    t.addEventListener('focus', () => showPop(t));
    for (const off of ['mouseleave', 'blur', 'dragstart']) t.addEventListener(off, () => (pop.hidden = true));
  });
  el.querySelectorAll<HTMLElement>('.hb-socket, .hb-relic').forEach((t) =>
    t.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === t) {
        e.preventDefault();
        t.click();
      }
    }),
  );
  el.querySelectorAll<HTMLElement>('[data-a]').forEach((btn) => {
    const a = btn.dataset.a!, id = btn.dataset.id!;
    btn.addEventListener('click', (ev) => {
      if (a === 'rpick') {
        // Pick up (or put down) a relic for the next click on a socket. A button inside the tile is its own.
        if ((ev.target as HTMLElement).closest('.hb-wbtn')) return;
        state.relicPick = state.relicPick === id ? null : id;
        host.k.audio.sfx.play('click', { gain: 0.3 });
        drawWorkshop(host);
        return;
      }
      if (a === 'fit') {
        if (state.relicPick) fitFrom(id, state.relicPick);
        return;
      }
      if (a === 'junksell' || a === 'junkoffer') {
        ev.stopPropagation();
        state.relicPick = null;
        run(host, () => {
          const shop = { eco: economy.get(), hub: host.s, roster: ro };
          const r = a === 'junksell' ? sellJunk(shop, Number(id)) : offerJunk(shop, Number(id));
          economy.set(r.eco);
          // The rest of the stack stays picked up, so a pile sells click after click.
          const left = r.eco.junk.indexOf(r.id);
          state.relicPick = left >= 0 ? `junk:${left}` : null;
          return a === 'junksell'
            ? `The Trader takes the ${relicLabel(r.id)}: ${'scrap' in r ? r.scrap : 0} scrap`
            : `The Oracle accepts the ${relicLabel(r.id)}: 1 insight. A second one is only a prayer.`;
        });
        return;
      }
      if (a === 'gear') {
        host.hud.close();
        host.inv.show('comm');
        return;
      }
      if (a === 'salvage' && !btn.dataset.armed) {
        // Taking a robot apart cannot be undone: the first click asks.
        btn.dataset.armed = '1';
        const back = document.createElement('small');
        back.textContent = `${Math.floor(BODY[ro.bots.find((x) => x.uid === id)!.role].scrap * SALVAGE)} scrap back`;
        btn.textContent = `Take ${name(id)} apart?`;
        btn.append(back);
        host.k.audio.sfx.play('click', { gain: 0.3 });
        return;
      }
      if (a === 'pick') {
        // Promote opens (or closes) the robot's spec picker; nothing is spent until a spec is chosen.
        state.promoting = state.promoting === id ? null : id;
        host.k.audio.sfx.play('click', { gain: 0.3 });
        drawWorkshop(host);
        return;
      }
      run(host, () => {
        const shop = { eco: economy.get(), hub: host.s, roster: ro };
        const done = (r: Shop, said: string) => {
          economy.set(r.eco);
          roster.set(r.roster);
          host.save(r.hub);
          return said;
        };
        if (a === 'buy') {
          const r = buyBot(shop, id as CrewRole);
          return done(r, `${r.bot.name} the ${ROLES[r.bot.role].name} is built`);
        }
        if (a === 'stoke') {
          const r = stoke(shop, id);
          return done(r, r.on ? `${name(id)} is stoked for the next mission` : `${name(id)} is cold again`);
        }
        if (a === 'rank') {
          const r = rankUp(shop, id);
          return done(r, `${name(id)}: ${RANK_NAMES[r.roster.bots.find((x) => x.uid === id)!.rank]}`);
        }
        if (a === 'promote') {
          const spec = btn.dataset.spec as SpecId;
          const r = promote(shop, id, spec);
          state.promoting = null;
          return done(r, `${name(id)} is a ${SPECS[spec].name} for good`);
        }
        if (a === 'rebuild') {
          const r = rebuild(shop, id);
          return done(r, `${name(id)} is rebuilt`);
        }
        if (a === 'repair') return done(repairDowned(shop, id), `${name(id)} is repaired`);
        if (a === 'chassis') return done(chassisUp(shop, id as ChassisId), `${CHASSIS[id as ChassisId].name}: level ${(ro.chassis[id as ChassisId] ?? 0) + 1}`);
        if (a === 'salvage') {
          const r = salvage(shop, id);
          return done(r, `${name(id)} taken apart: ${r.scrap} scrap`);
        }
        return '';
      });
    });
  });
}

/** Run one workshop change: a banner with what happened (or why not), a sound, the panel again. */
function run(host: HubHost, f: () => string) {
  try {
    const said = f();
    host.k.audio.sfx.play('ratchet');
    if (said) host.hud.banner(said);
  } catch (e) {
    host.k.audio.sfx.play('click', { gain: 0.3 });
    host.hud.banner((e as Error).message.replace(/^./, (c) => c.toUpperCase()));
  }
  host.hud.stores(host.s);
  drawWorkshop(host);
}

/** One robot as the dev commands and `debugState` list it: `r1 Bellows gatherer r2 siphoner relic:toaster wreck`. */
export const botLine = (b: Bot) =>
  `${b.uid} ${b.name} ${b.role} r${b.rank}${b.spec ? ` ${b.spec}` : ''}${b.relic ? ` relic:${b.relic}` : ''}${b.stoked ? ' stoked' : ''}${b.wreck ? ' wreck' : ''}${b.downed ? ' downed' : ''}`;

/** A workshop rule run on the books and committed (dev). */
function shopDo(host: HubHost, f: (s: Shop) => Shop) {
  const r = f({ eco: economy.get(), hub: host.s, roster: roster.get() });
  economy.set(r.eco);
  roster.set(r.roster);
  host.save(r.hub);
  const bots = r.roster.bots.map(botLine);
  return JSON.stringify({ scrap: r.eco.scrap, copper: r.eco.copper, coal: r.eco.coal, insight: r.eco.insight, junk: r.eco.junk, bots, chassis: r.roster.chassis });
}

/** The `workshop` dev command: the workshop's rules as the panel runs them (costs are paid; `gear mats <n>` gives the materials). */
export function workshopCommand(host: HubHost) {
  const ws: Record<string, (a: string[]) => string> = {
    list: () => JSON.stringify(roster.get()),
    open: () => (host.openStation('workshop'), 'workshop open'),
    lift: () => JSON.stringify({
      cores: economy.get().cores,
      free: freeCores(roster.get(), economy.get()),
      noCore: noCore(roster.get(), economy.get()),
      go: riders(roster.get()).map((b) => b.name),
    }),
    buy: ([role]) => shopDo(host, (sh) => buyBot(sh, role as CrewRole)),
    rank: ([uid]) => shopDo(host, (sh) => rankUp(sh, uid)),
    stoke: ([uid]) => shopDo(host, (sh) => stoke(sh, uid)),
    rebuild: ([uid]) => shopDo(host, (sh) => rebuild(sh, uid)),
    repair: ([uid]) => shopDo(host, (sh) => repairDowned(sh, uid)),
    promote: ([uid, spec]) => shopDo(host, (sh) => promote(sh, uid, spec as SpecId)),
    spec: ([uid, spec]) => {
      // Dev: the spec for free, with no deed (`deeds fill` opens the gauge instead); `off` clears it.
      const r = roster.get();
      if (spec !== 'off' && !SPECS[spec as SpecId]) throw new Error(`specs: ${SPEC_IDS.join(', ')}`);
      if (!r.bots.some((b) => b.uid === uid)) throw new Error(`no robot "${uid}"`);
      roster.set({ ...r, bots: r.bots.map((b) => (b.uid === uid ? { ...b, spec: spec === 'off' ? undefined : (spec as SpecId) } : b)) });
      return `${uid}: ${spec === 'off' ? 'no spec' : spec}`;
    },
    relic: ([uid, relic]) => (roster.set(fitRelic(roster.get(), uid, !relic || relic === 'off' ? null : relic)), `${uid}: ${!relic || relic === 'off' ? 'no relic' : relic}`),
    junk: ([what, id]) => {
      // The stock of old tech at home (P19): `give` a relic, `clear` it.
      const e = economy.get();
      if (what === 'give') {
        if (!isRelic(id) || isUnique(id)) throw new Error(`junk give <${RELIC_IDS.filter((r) => !isUnique(r)).join('|')}>`);
        economy.set({ ...e, junk: [...e.junk, id] });
      } else if (what === 'clear') economy.set({ ...e, junk: [] });
      return `old tech in the stores: ${economy.get().junk.map((j, i) => `${i}:${j}`).join(', ') || 'none'}`;
    },
    fit: ([uid, src]) =>
      shopDo(host, (sh) => fitRelicTo(sh, uid, /^\d+$/.test(src) ? { junk: Number(src) } : src?.startsWith('bot:') ? { bot: src.slice(4) } : { part: src as PartKind })),
    unfit: ([uid]) => shopDo(host, (sh) => unfitRelic(sh, uid)),
    sell: ([i]) => shopDo(host, (sh) => sellJunk(sh, Number(i))),
    offer: ([i]) => shopDo(host, (sh) => offerJunk(sh, Number(i))),
    chassis: ([id]) => shopDo(host, (sh) => chassisUp(sh, id as ChassisId)),
    salvage: ([uid]) => shopDo(host, (sh) => salvage(sh, uid)),
    give: ([role]) => {
      if (!CREW_ROLES.includes(role as CrewRole)) throw new Error(`roles: ${CREW_ROLES.join(', ')}`);
      const r = roster.get();
      const bot = { uid: `r${r.next}`, name: freshName(r, role as CrewRole), role: role as CrewRole, rank: 0, wreck: false };
      roster.set({ ...r, bots: [...r.bots, bot], next: r.next + 1 });
      return `${bot.uid} ${bot.name} the ${role} rides`;
    },
    down: ([uid]) => (roster.set({ ...roster.get(), bots: roster.get().bots.map((b) => (b.uid === uid && !b.wreck ? { ...b, downed: true } : b)) }), `${uid} is carried home, down`),
    wreck: ([uid]) => (roster.set({ ...roster.get(), bots: roster.get().bots.map((b) => (b.uid === uid ? { ...b, wreck: true } : b)) }), `${uid} is a wreck`),
    reset: () => (roster.set(freshRoster()), 'roster reset to the old crew'),
  };
  const help = [
    'workshop [list|open|lift (who goes down: every robot that is not a wreck; the free AI cores)',
    '|buy <role> (needs a free AI core)|give <role> (free, any type)|rank <uid>|stoke <uid> (coal; again to cool: the next mission only)|rebuild <uid> (a wreck)|repair <uid> (a robot carried home down)',
    '|promote <uid> <spec> (40 scrap, a part; the spec unlocked by `deeds fill`)|spec <uid> <spec|off> (free)',
    '|relic <uid> [id|off] (raw)|junk [give <relic>|clear] (the stock of old tech)',
    '|fit <uid> <stock index|queens-crown|harbinger-heart|bot:<uid>>|unfit <uid>',
    '|sell <index> (the Trader)|offer <index> (a duplicate to the Oracle)',
    '|chassis <tank|boiler|plating|pistons>|salvage <uid>|wreck <uid>|down <uid>|reset]',
    ': your robots, who rides down, bodies, ranks, the chassis (roles: gatherer, guard, repairer, mule, marksman)',
  ].join('');
  command('workshop', ([sub = 'list', ...rest]) => {
    const f = ws[sub];
    if (!f) return `error: workshop ${Object.keys(ws).join(' | ')}`;
    try {
      const out = f(rest);
      if (host.hud?.panelKind === 'workshop') drawWorkshop(host);
      return out;
    } catch (e) {
      return `error: ${(e as Error).message}`;
    }
  }, help, { group: 'hub', args: () => Object.keys(ws) });
}
