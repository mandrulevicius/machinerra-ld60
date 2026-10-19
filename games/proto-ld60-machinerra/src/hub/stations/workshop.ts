/**
 * The workbench: new bodies, the deeds, the Communicator's chassis, the parts. Rules are in `workshop.ts` (one level up); this is the
 * panel (`workshopBody`, tabs), its wiring (`drawWorkshop`) and the `workshop` dev command. The robots themselves (stoke, repair,
 * rebuild, rank, calling, relics) are looked after in the Dry dock (`dock/`), one press away: the panel's Dry dock button.
 * Add a tab: an entry in `workshopBody`'s `tabbed([...])`. Add a button: a `data-a` and its case in `drawWorkshop`.
 */
import { command } from '../../../../../harness/dev/commands';
import { PARTS, ROLES, type PartKind } from '../../sim/defs';
import { CHASSIS, CHASSIS_IDS, type ChassisId } from '../../sim/bots';
import { CREW_ROLES, STATS, type CrewRole } from '../../sim/gear';
import { RELIC_IDS, isRelic, isUnique } from '../../sim/junk';
import { BOT_TYPES, SPECS, SPEC_IDS, TYPES, type SpecId } from '../../sim/specs';
import { BOOST, gaugesOf, profile, type GaugeRow, type Profile } from '../deeds';
import { texUrl } from '../../gearart';
import { economy } from '../economy';
import { esc, tabbed } from '../panels';
import { fit as fitRelicTo, offerJunk, sellJunk, unfit as unfitRelic } from '../relics';
import type { HubState } from '../state';
import {
  CHASSIS_COST,
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
  stokeAll,
  repairAll,
  type Roster,
  type Shop,
} from '../workshop';
import type { HubHost, StationPanel } from './host';

/** What the workshop panel shows of a robot type: its sprite (`face(role)`, a data URL) and a part's (`icon(kind)`). */
export interface WorkshopArt {
  icon: (k: PartKind) => string;
  face: (role: CrewRole) => string;
}

type Cost = { scrap?: number; copper?: number; parts?: number };
type Bot = Roster['bots'][number];

/**
 * The workshop (`workshop.ts` holds its rules): new bodies, the deeds, the Communicator's chassis, and the parts brought home. Buttons
 * carry `data-a` (buy, chassis, dock) and `data-id`; `drawWorkshop` wires them. `tab` is the tab left open last time.
 */
export function workshopBody(s: HubState, ro: Roster, scrap: number, art: WorkshopArt, tab = 'build', deeds: Profile = profile.get(), cores = Infinity) {
  const spare = Object.entries(s.parts).filter(([k]) => !PARTS[k as PartKind]?.unique);
  const have = { scrap, copper: economy.get().copper, coal: economy.get().coal, parts: spare.reduce((n, [, v]) => n + (v ?? 0), 0) };
  const can = (c: Cost) => (c.scrap ?? 0) <= have.scrap && (c.copper ?? 0) <= have.copper && (c.parts ?? 0) <= have.parts;
  const btn = (a: string, id: string, label: string, c?: Cost, off = false, cls = 'ui-btn--secondary') =>
    `<button class="ui-btn ${cls} hb-wbtn"
      data-a="${a}"
      data-id="${esc(id)}"${off || (c && !can(c)) ? ' disabled' : ''}>${label}${c ? `<small>${costText(c)}</small>` : ''}</button>`;
  const stars = (n: number, max: number) => `<span class="hb-stars">${'★'.repeat(n)}${'☆'.repeat(max - n)}</span>`;
  const gauge = (g: GaugeRow) =>
    `<span class="hb-gauge${g.full ? ' is-full' : ''}"
      style="--fill:${Math.round((g.have / g.size) * 100)}%"
      title="${esc(g.deed)}"><i></i></span>`;
  // Every robot that is not a wreck rides; a new body needs a free AI core (`noCore`).
  const goes = riders(ro).length;
  const noBuild = noCore(ro, { cores });
  const coreNote = Number.isFinite(cores)
    ? ` · <span title="One robot per AI core. Cores come from Core Vaults and from bosses.">${cores} AI core${cores === 1 ? '' : 's'}</span>`
    : '';
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
    'Every robot of a type fills its gauges, in any mission you ride home from; a full one opens that calling for good (Promote, in the Dry dock). ',
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
      "Parts come from the most plentiful in the stores (never a boss's unique). Your robots are looked after in the Dry dock.",
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
    <p class="hb-note hb-note--dim">Weapons and body parts are fitted and crafted in the Dry dock (I).</p>`;
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
  // The robots' tab moved to the Dry dock: a panel last left on it opens on Build.
  const open = tab === 'robots' ? 'build' : tab;
  return {
    title: 'Workshop',
    body: `<p class="hb-note hb-note--dim">${have.scrap} scrap · ${have.copper} copper · ${have.coal} coal · ${have.parts} parts to spend · on the lift: <b>${goes} / ${ro.bots.length}</b>${coreNote}</p>${tabbed(
      [
        { id: 'build', label: 'Build a robot', html: build },
        { id: 'deeds', label: 'Deeds', html: deedsTab },
        { id: 'chassis', label: 'Communicator', html: chassis },
        { id: 'parts', label: 'Parts', html: `<div class="hb-parts">${slots}</div>` },
      ],
      open,
    )}`,
    actions: '<button class="ui-btn ui-btn--primary" data-a="dock">Dry dock<small>your robots</small></button>',
  };
}

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

/** The workshop's panel: new bodies, the deeds, the chassis, the parts. Re-drawn after every change, on the same tab. */
function drawWorkshop(host: HubHost) {
  const ro = roster.get();
  const art: WorkshopArt = {
    icon: (k) => texUrl(host, `part-${k}`),
    face: (r) => texUrl(host, 'atlas', `crew/${r}`),
  };
  const b = workshopBody(host.s, ro, economy.get().scrap, art, host.tabs.workshop, undefined, economy.get().cores);
  // A redraw keeps each tab's scroll, so a button low in the list stays under the pointer.
  const scroll = new Map<string, number>();
  if (host.hud.panelKind === 'workshop') host.hud.panel?.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => scroll.set(p.dataset.pane!, p.scrollTop));
  const el = host.hud.open('workshop', b.title, b.body, b.actions);
  el.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.scrollTop = scroll.get(p.dataset.pane!) ?? 0));
  el.querySelectorAll<HTMLElement>('[data-tab]').forEach((t) =>
    t.addEventListener('click', () => {
      host.tabs.workshop = t.dataset.tab!;
      el.querySelectorAll<HTMLElement>('[data-tab]').forEach((o) => o.setAttribute('aria-selected', String(o === t)));
      el.querySelectorAll<HTMLElement>('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
      host.k.audio.sfx.play('click', { gain: 0.3 });
    }),
  );
  el.querySelectorAll<HTMLElement>('[data-a]').forEach((btn) => {
    const a = btn.dataset.a!, id = btn.dataset.id!;
    btn.addEventListener('click', () => {
      if (a === 'dock') {
        // The robots' place: the Dry dock, on the first type and its first empty slot.
        host.closePanel();
        host.inv.showDock('workshop');
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
        if (a === 'chassis') return done(chassisUp(shop, id as ChassisId), `${CHASSIS[id as ChassisId].name}: level ${(ro.chassis[id as ChassisId] ?? 0) + 1}`);
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
  return JSON.stringify({ scrap: r.eco.scrap, copper: r.eco.copper, coal: r.eco.coal, junk: r.eco.junk, bots, chassis: r.roster.chassis });
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
    stoke: ([uid]) => shopDo(host, (sh) => (uid === 'all' ? stokeAll(sh) : stoke(sh, uid))),
    rebuild: ([uid]) => shopDo(host, (sh) => rebuild(sh, uid)),
    repair: ([uid]) => shopDo(host, (sh) => (uid === 'all' ? repairAll(sh) : repairDowned(sh, uid))),
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
    '|buy <role> (needs a free AI core)|give <role> (free, any type)|rank <uid>|stoke <uid|all> (coal; again to cool: the next mission only; all: every cold robot, till the coal runs out)|rebuild <uid> (a wreck)|repair <uid|all> (a robot carried home down; all: every one, till the scrap runs out)',
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
