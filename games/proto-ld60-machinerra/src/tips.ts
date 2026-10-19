/**
 * The mission's tooltip words (Minos, decisions.md "Minos on the management UI's detail levels"; the plan is `onboarding.md`): what a HUD
 * element, a place, a hive, a ruin, a foe, a robot or a status says on hover (level 2) and with the full details (level 3), as
 * `Tip`s for `manage/tooltip.ts`. Pure: `tipview.ts` finds what is under the pointer and calls these, so they are tested without a scene.
 * Icons over text where they say it (`ico`: the management kit's glyphs, `glyphs/`), a status as its pip's dot, a counter as its icon.
 * Every number is read from the defs or the Sim; the sentences are guesses at wording.
 */
import { iconSvg } from './counters';
import { lyingTip } from './downedcost';
import { pipColor, statusName, HIDDEN } from './statusview';
import { esc } from './manage/manage';
import { glyph, typeGlyph } from './manage/glyphs';
import type { Tip } from './manage/tooltip';
import { ANOMALIES, BEAST_MODS, BERSERK, CARD_SIGN, COUNTERS, DECODE, ELITE_TRAITS, FOES, MENACE, NEST, REVIVE, ROLES, T, WINCH, bossOf, countersOf, type Role } from './sim/defs';
import { STATUSES, type Mod, type StatusId, type Unit } from './sim/effects';
import { auraOf } from './sim/foes';
import { PLACES } from './sim/places';
import { BEHAVE } from './sim/placeplay';
import { RUIN_FINDS } from './sim/defs/ruins';
import type { Bot, Hornet, Nest, Ruin, Seam } from './sim/types';
import type { PlaceRT } from './sim/placeplay';
import type { Sim } from './sim/sim';

/** A kit glyph in the text (`.mc-ico`, `style.css`). */
export const ico = (name: string) => glyph(name, 'mc-ico');
const p = (s: string) => `<p>${s}</p>`;
const dim = (s: string) => `<span class="mg-tip__dim">${s}</span>`;
/** A title line: the name, with its icon in front. */
const head = (icon: string, name: string) => `<b>${ico(icon)} ${esc(name)}</b>`;

/** The robot types' glyphs: the HUD roster's chips and the tips (placeholders from the kit's set). */
export const ROLE_ICON: Record<Role, string> = {
  controller: 'robot-helmet', gatherer: 'gears', guard: 'bordered-shield', repairer: 'wrench', mule: 'backpack', marksman: 'crosshair', boilermancer: 'steam', lamplighter: 'light-bulb', stalker: 'arrowhead',
};

// ---------------------------------------------------------------- statuses

const STAT_WORD: Partial<Record<Mod['stat'], string>> = {
  speed: 'speed', attackRate: 'attack rate', damage: 'damage', damageTaken: 'damage taken', maxHp: 'oil', range: 'range', knockback: 'knockback', crit: 'crit', accuracy: 'aim', plating: 'plating', parry: 'parry', lamp: 'light',
};
const FLAG_WORD: Partial<Record<string, string>> = { stunned: 'cannot act', noMove: 'cannot move', blind: 'cannot see', taunted: 'runs at its taunter', frozen: 'frozen solid', invulnerable: 'cannot be hurt', calm: 'calm' };
const sign = (n: number) => (n >= 0 ? '+' : '−');
const modWords = (m: Mod) => {
  const w = STAT_WORD[m.stat] ?? m.stat;
  if (m.pct !== undefined) return `${sign(m.pct)}${Math.round(Math.abs(m.pct) * 100)}% ${w}`;
  if (m.add !== undefined) return `${sign(m.add)}${Math.abs(m.add)} ${w}`;
  if (m.more !== undefined) return `x${m.more} ${w}`;
  return w;
};
/** What a status does, in a line, from its row (`STATUSES`). */
export function statusWords(id: StatusId): string {
  const d = STATUSES[id];
  const bits = [...(d.mods ?? []).map(modWords)];
  if (d.dot) bits.push(`${d.dot.perSecond} ${d.dot.type} damage a second`);
  for (const f of d.flags ?? []) if (FLAG_WORD[f]) bits.push(FLAG_WORD[f]!);
  if (Number.isFinite(d.duration)) bits.push(`${d.duration} s`);
  return bits.join(', ');
}
/** A status's pip as a small dot in its colour (a ring for a buff), as the world draws it. */
export const pipSvg = (id: StatusId) => {
  const c = `#${pipColor(id).toString(16).padStart(6, '0')}`;
  return STATUSES[id].kind === 'buff'
    ? `<svg class="mc-pip" viewBox="-6 -6 12 12" aria-hidden="true"><circle r="3.6" fill="none" stroke="${c}" stroke-width="2"/></svg>`
    : `<svg class="mc-pip" viewBox="-6 -6 12 12" aria-hidden="true"><circle r="4" fill="${c}"/></svg>`;
};
/** The statuses on a unit: a pip, the name and its stacks, and (in the full tip) what each does. */
function statusRows(sim: Sim, u: Unit) {
  const rows: { id: StatusId; stacks: number; left: number }[] = [];
  sim.engine.eachStatus(u, (id, stacks, left) => {
    if (!HIDDEN.has(id)) rows.push({ id, stacks, left });
  });
  const line = (r: (typeof rows)[number]) => `${pipSvg(r.id)} ${esc(statusName(r.id))}${r.stacks > 1 ? ` ×${r.stacks}` : ''}`;
  return {
    more: rows.length ? p(rows.map(line).join(' · ')) : '',
    full: rows.map((r) => p(`${pipSvg(r.id)} <b class="mc-tip__sub">${esc(statusName(r.id))}</b> ${dim(esc(statusWords(r.id)))}`)).join(''),
  };
}

// ---------------------------------------------------------------- the world

/** An enemy: its oil and tier, its statuses; with Alt its traits, counters, weakness, halo and blows. */
export function foeTip(sim: Sim, h: Hornet): Tip {
  const F = FOES[h.kind];
  const name = h.boss ? bossOf(h.kind).name : F.name;
  const tags = [h.boss ? 'Boss' : h.elite ? 'Elite' : h.small ? 'Small' : '', h.menacing ? 'Menacing' : h.twisted ? 'Twisted' : '', h.tier && h.tier > 1 ? `Tier ${'I'.repeat(h.tier)}` : ''].filter(Boolean);
  const st = statusRows(sim, h);
  const more = `${head(h.boss ? 'evil-moon' : 'crosshair', name)}${p(`${ico('oil-can')} ${Math.ceil(h.hp)} / ${Math.ceil(h.maxHp)}${tags.length ? ` · ${esc(tags.join(' · '))}` : ''}`)}${st.more}`;
  const full: string[] = [];
  for (const t of h.traits ?? []) full.push(p(`<b class="mc-tip__sub">${esc(ELITE_TRAITS[t].name)}</b> ${dim(esc(ELITE_TRAITS[t].blurb))}`));
  for (const m of h.mods ?? []) full.push(p(`<b class="mc-tip__sub">${esc(BEAST_MODS[m].name)}</b> ${dim(esc(BEAST_MODS[m].blurb))}`));
  for (const c of countersOf(h)) full.push(p(`${iconSvg(c, 13)} <b class="mc-tip__sub">${esc(COUNTERS[c].name)}</b> ${dim(`punishes ${esc(COUNTERS[c].punishes)}; answer: ${esc(COUNTERS[c].answers)}`)}`));
  const types = (ts: string[] | undefined, w: string) => (ts?.length ? p(`${w} ${ts.map((t) => `${glyph(typeGlyph(t as never), 'mc-ico')} ${esc(t)}`).join(' ')}`) : '');
  full.push(types(F.weak, 'Weak to'), types(F.resist, 'Resists'));
  const a = auraOf(sim, h);
  if (a) full.push(p(`${ico('evil-moon')} <b class="mc-tip__sub">Halo</b> ${dim(`${Math.round(a.radius / T * 10) / 10} tiles: robots inside slow to ${Math.round(a.slow * 100)}% and lose ${a.dps.toFixed(1)} oil a second`)}`));
  full.push(p(`${dim(`Blows: ${esc(F.type ?? 'impact')}, ${Math.round(F.dmg)} a hit`)}`), st.full);
  return { more, full: full.join('') || undefined };
}

/** One of ours: its role, oil, crew and what it is doing; a downed one says what leaving it costs. */
export function botTip(sim: Sim, b: Bot): Tip {
  const R = ROLES[b.role];
  const st = statusRows(sim, b);
  const state = b.downed ? (b.downed.wreck ? 'a wreck' : 'down') : b.own ? 'on its own order' : b.state === 'idle' ? '' : b.state;
  const lines = b.downed ? lyingTip(b.name, !!b.downed.wreck).split('\n').slice(1) : [];
  const more = `${head(ROLE_ICON[b.role], b.name)}${p(`${esc(R.name)}${b.crew > 0 ? ` · crew ${b.crew}` : ''}${state ? ` · ${esc(state)}` : ''}`)}${p(`${ico('oil-can')} ${Math.ceil(b.hp)} / ${Math.ceil(b.maxHp)}`)}${lines.map((l) => p(esc(l))).join('')}${st.more}`;
  return { more, full: `${p(dim(esc(R.blurb)))}${st.full}` };
}

/** A hive: asleep or awake and what wakes it. */
export function nestTip(sim: Sim, n: Nest): Tip {
  const talk = sim.biome.talk;
  if (n.dead) return { more: `${head('broken-skull', `Ruined ${talk.hive}`)}${p('Nothing comes out of it any more.')}` };
  if (n.awake) return { more: `${head('open-wound', `${talk.hive[0].toUpperCase()}${talk.hive.slice(1)}`)}${p('Awake: it keeps sending foes out.')}`, full: p(dim(`Break it (${Math.ceil(n.hp)} / ${n.maxHp} oil) to stop it.`)) };
  return {
    more: `${head('open-wound', `${talk.hive[0].toUpperCase()}${talk.hive.slice(1)}`)}${p('Asleep. Noise wakes it.')}`,
    full: p(dim(`A hit, a decode or a mast nearby, or a gatherer working within ${NEST.wakeTiles} tiles of it (not in the morning). The clock wakes more of them at dusk and midnight.`)),
  };
}

/** What a source of insight says of the stage's one punch card (Minos: not more than one a stage). */
const cardWords = (sim: Sim) => (sim.cardEarned ? CARD_SIGN.tipLater : CARD_SIGN.tipFirst);

/** A place: its name, where it stands in its work, and what Use does there. */
export function placeTip(sim: Sim, pl: PlaceRT): Tip {
  const B = BEHAVE[pl.id];
  const verb = B.use?.ready(sim, pl) ? B.use.verb(sim, pl) : '';
  const status = B.status?.(sim, pl);
  return {
    more: `${head('gears', PLACES[pl.id].name)}${verb ? p(`Use: ${esc(verb)}`) : ''}${status ? p(dim(esc(status))) : ''}${pl.id === 'mast' && pl.state === 'dark' ? p(esc(cardWords(sim))) : ''}`,
  };
}

/** A ruin: dead ones are searched for scrap and old tech, a live one is decoded, loudly. */
export function ruinTip(sim: Sim, r: Ruin): Tip {
  const name = r.kind.replace(/^./, (c) => c.toUpperCase());
  if (r.searched) return { more: `${head('cog', name)}${p('Stripped.')}` };
  if (RUIN_FINDS[r.kind].pry) return { more: `${head('wrench', 'Old charging dock')}${p('Use: pry its contacts loose, for the Princess.')}` };
  if (r.live) {
    return {
      more: `${head('light-bulb', `${name} (live)`)}${p(`Use: decode, ${DECODE.time} s near it.`)}${p(`${ico('open-wound')} It wakes the nearest sleeping ${esc(sim.biome.talk.hive)}.`)}${p(esc(cardWords(sim)))}`,
      full: p(dim(`Loud: every ${DECODE.ping} s it calls the foes within ${DECODE.pullTiles} tiles to you. A hit on you breaks the hold.`)),
    };
  }
  return { more: `${head('cog', name)}${p('Use: search it for scrap and old tech.')}`, full: p(dim('A gatherer strips it faster and richer, and the noise can wake a hive near it.')) };
}

/** A coal seam. */
export const seamTip = (s: Seam): Tip => ({ more: `${head('coal-pile', 'Coal seam')}${p(`${Math.ceil(s.amount)} / ${s.max} left`)}`, full: p(dim('Use mines it by hand, slowly. A gatherer is faster, and its noise can wake a hive.')) });

/** The world, by what is nearest the point: [priority] a foe or robot under it, a hive, a place, a ruin, a seam. Null over bare ground. */
export function worldTip(sim: Sim, x: number, y: number): Tip | null {
  let best: { d: number; tip: () => Tip } | null = null;
  const take = (d: number, r: number, tip: () => Tip) => {
    if (d <= r && (!best || d < best.d)) best = { d, tip };
  };
  const dist = (ax: number, ay: number) => Math.hypot(ax - x, ay - y);
  for (const h of sim.hornets) if (!h.dead && !h.under) take(dist(h.x, h.y - 14) - 4, h.r + 14, () => foeTip(sim, h));
  for (const b of sim.bots) if (!b.dead && !b.hidden && !b.place) take(dist(b.x, b.y - 14) - 4, ROLES[b.role].r + 14, () => botTip(sim, b));
  for (const n of sim.nests) if (!n.place) take(dist(n.x, n.y) - 12, 44, () => nestTip(sim, n));
  for (const pl of sim.places) if (pl.visited) for (const q of pl.parts) take(dist(q.x, q.y) - 20, 56, () => placeTip(sim, pl));
  for (const r of sim.ruins) take(dist(r.x, r.y) - 20, 56, () => ruinTip(sim, r));
  for (const s of sim.seams) if (s.amount > 0) take(dist(s.x, s.y) - 10, 36, () => seamTip(s));
  const hit = best as { tip: () => Tip } | null;
  return hit ? hit.tip() : null;
}

// ---------------------------------------------------------------- the HUD

/** The winch's fee if he fell now with no can: scrap (a share of what he carries) and the day's seconds. */
export const winchFee = (sim: Sim) => ({ scrap: Math.floor(sim.scrap * WINCH.cost), clock: WINCH.clock });
/** The spare oil's short line when no can is left: what the fall costs. */
export const winchLine = (sim: Sim) => {
  const f = winchFee(sim);
  return `${f.scrap ? `−${f.scrap} ${ico('cog')} ` : ''}−${f.clock} s`;
};

const MENACE_AT = [
  'wider, sharper halos',
  `twisted dashes chain (from level ${MENACE.chain})`,
  `elites more likely (from level ${MENACE.elite})`,
  `elites carry two traits (from level ${MENACE.traits})`,
  `a hunter pack every ${MENACE.pack.every} s (from level ${MENACE.pack.from})`,
];
/** What a menace level adds, in a few words (the banner, the dial's tip). */
export const menaceNote = (level: number) => (level >= MENACE.pack.from ? 'hunter packs, and more of everything' : level === MENACE.chain ? 'twisted dashes chain' : level === MENACE.elite ? 'elites more likely' : level === MENACE.traits ? 'elites carry two traits' : 'wider, sharper halos');

const clockTip = (sim: Sim): Tip => {
  const d = sim.day;
  const now = d.phase === 'midnight' ? `Menace ${d.level}: ${menaceNote(d.level)}.` : '';
  return {
    more: `${head('sun-cloud', 'The day')}${p('Noon at the top, midnight at the bottom.')}${now ? p(esc(now)) : ''}`,
    full: p(dim(`Past midnight a step every ${BERSERK.every} s makes new enemies stronger; every ${BERSERK.perLevel}th step is a menace level. ${MENACE_AT.map((m) => esc(m)).join('; ')}.`)),
  };
};
const bellTip = (sim: Sim): Tip => {
  const t = sim.places.find((pl) => pl.id === 'bell')?.v.tolls ?? 0;
  return { more: `${head('bordered-shield', `The Dinner Bell: ${t} toll${t === 1 ? '' : 's'}`)}${p('Each toll brings more foes, more elites and more loot.')}`, full: p(dim(`Spawns x${sim.mods.spawn.toFixed(2)}, elites x${sim.mods.elite.toFixed(1)}, loot x${sim.mods.loot.toFixed(2)} now.`)) };
};

/** The HUD's tips by the `data-tip` id on its elements (`hud.ts`); each is made when the pointer rests on it, so it is always current. */
export const HUD_TIPS: Record<string, (sim: Sim) => Tip> = {
  clock: clockTip,
  bells: bellTip,
  boss: () => ({ more: `${head('evil-moon', 'The dusk boss')}${p('It comes at this mark on the dial, on a land that has one.')}` }),
  weather: (sim) => ({ more: `${head('sun-cloud', 'A passing weather')}${p(`The bar counts down to its start, then to its end.`)}`, full: p(dim(esc(ANOMALIES[sim.fx.id].blurb))) }),
  face: () => ({ more: `${head('robot-helmet', 'The Communicator')}${p('You. Your oil is your health.')}` }),
  oil: (sim) => ({ more: `${head('oil-can', 'Oil')}${p('Your health. At zero you fall: a spare can stands you up, else the winch.')}`, full: p(dim(`${Math.ceil(sim.controller.hp)} / ${sim.controller.maxHp}. The screen edge reddens as it runs low.`)) }),
  steam: () => ({ more: `${head('steam', 'Steam')}${p('A gun spends it on every shot, and it builds back when you stop.')}` }),
  weapon: () => ({ more: `${head('mouse-left', 'Your weapons')}${p(`${ico('mouse-left')} left click, ${ico('mouse-right')} right click.`)}` }),
  cans: (sim) => {
    const f = winchFee(sim);
    const none = sim.spare < REVIVE.cost;
    return {
      more: `${head('oil-can', 'Spare oil')}${p(`Cans on your pack: out of oil, a can stands you up where you fell.`)}${none ? p(`${ico('wrench')} No can: the Oracle winches you to the lift, ${f.scrap ? `−${f.scrap} scrap and ` : ''}−${f.clock} s of day.`) : ''}`,
      full: p(dim(`The winch's fee is ${Math.round(WINCH.cost * 100)}% of the scrap you carry and ${WINCH.clock} s of daylight. Up to ${REVIVE.cans} cans.`)),
    };
  },
  stock: () => ({ more: `${head('cog', 'Carried')}${p('Rides home with the lift: scrap from kills, copper from ruins, coal from seams.')}` }),
  scrap: () => ({ more: `${head('cog', 'Scrap')}${p('From kills. Shots and repairs are paid in it.')}` }),
  copper: () => ({ more: `${head('two-coins', 'Copper')}${p('From ruins. Upgrades are paid in it.')}` }),
  coal: () => ({ more: `${head('coal-pile', 'Coal')}${p('From seams. It fuels the colony’s expeditions.')}` }),
  parts: () => ({ more: `${head('gear-hammer', 'Enemy parts')}${p('Dropped by elites and the twisted: they build better gear.')}` }),
  junk: () => ({ more: `${head('processor', 'Old tech')}${p('Found in dead ruins. It rides home with you; fit it to a robot at the workshop.')}` }),
  objective: () => ({ more: `${head('bullseye', 'The objective')}${p('What this land asks of you now.')}` }),
  support: () => ({ more: `${head('rocket-thruster', 'D-city air support')}${p('The Zeppelin Wanderer, far above, answers a call a mission.')}` }),
  map: () => ({ more: `${head('bullseye', 'The map')}${p('Your crews, the land and its signals. It pauses the mission.')}` }),
  chip: () => ({ more: `${head('gears', 'Your crew')}${p('Hover a robot for its oil and state.')}` }),
};
export const hudTip = (id: string, sim: Sim): Tip | null => HUD_TIPS[id]?.(sim) ?? null;
