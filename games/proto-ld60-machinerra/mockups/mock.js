// Machinerra management mockups: the Dry dock, and Arrival -> Pre-flight. Static data, clickable states, not wired into the game.
// Icons sit in the text: every thing with game art shows it (art.js), and each stat or damage type is a glyph beside its value or
// word; the long details sit in a tooltip. What an item does is read from the game (ITEMS, WEAPONS, SKILLS, RELICS, PARTS: `effectOf`,
// worded as the inventory's card words it, `src/inventory.ts` `defCard`); the save the mock describes (who owns what) is made up.
import { holesSvg, pcClass, pcStyle, STOCK } from '../src/hub/punchcard.ts';
import { ITEMS, SKILLS, STATS, QUALITIES } from '../src/sim/gear.ts';
import { WEAPONS, PARTS, ANOMALIES, COUNTERS, BIOMES } from '../src/sim/defs.ts';
import { RELICS, JUNK } from '../src/sim/junk.ts';
import { buyBack } from '../src/hub/trade.ts';
import { WEAK, RESIST } from '../src/sim/effects.ts';
import { KINDS } from '../src/itemkinds.ts';
import { loadArt, tex, item, crew, foe, HERO, PORTRAIT, counter, glyph } from './art.js';

// ---------------------------------------------------------------- data

const Q = { standard: ['Standard', 1], fine: ['Fine', 1.15], rare: ['Rare', 1.3] };
const ROLES = ['gatherer', 'guard', 'repairer', 'mule'];
const BOT = (slot) => ROLES.map((r) => `${r}.${slot}`);
const WS = ['comm.primary', 'comm.secondary'];

// The game's weapons (src/sim/defs/comm.ts).
const WEAP = WEAPONS;

// Keys are the game's item ids, so item(id) is the inventory's own icon.
const IT = {
  pipeWrench: { name: 'Pipe wrench', w: 'pipeWrench', fits: WS, recipe: { scrap: 35 } },
  shovel: { name: 'Shovel', w: 'shovel', fits: WS, recipe: { scrap: 10 } },
  hornetSpear: { name: "Hornet's spear", w: 'hornetSpear', fits: WS, recipe: { scrap: 45, parts: { 'Mechahornet stinger': 2 } } },
  tazer: { name: 'Heretic tazer', w: 'tazer', fits: WS, recipe: { scrap: 75, parts: { 'Obsession optics': 1 } } },
  rivetScatter: { name: 'Rivet scatter', w: 'rivetScatter', fits: WS, recipe: { scrap: 70, parts: { 'Mechahornet stinger': 1 } } },
  slingshot: { name: 'Steam-propelled slingshot', w: 'slingshot', fits: WS, recipe: { scrap: 30, parts: { 'Mechahornet wings': 1 } } },
  steamGun: { name: 'Steam gun', w: 'steamGun', fits: WS, recipe: { scrap: 140 } },
  arcGun: { name: 'Leyden arc-gun', w: 'arcGun', fits: WS, recipe: { scrap: 115, parts: { 'Piston tusk': 2 } } },
  pistonCannon: { name: 'Piston cannon', w: 'pistonCannon', fits: WS, recipe: { scrap: 110, parts: { 'Destrier legs': 2 } } },
  pipeWrenchNight: { name: 'Twisted Pipe wrench', w: 'pipeWrench', fits: WS, note: 'A night piece: a twisted part and a Dark rider.' },

  kettleHelm: { name: 'Kettle helm', fits: ['comm.head'], stats: { armour: 6, steam: 15 }, recipe: { scrap: 35 } },
  hornetHead: { name: "Robot hornet's head", fits: ['comm.head', ...BOT('head')], stats: { armour: 8 }, note: 'Plain hornets take the wearer for one of theirs.', recipe: { scrap: 20, parts: { 'Mechahornet head': 3 } } },
  monocle: { name: "Grandpa's targeting monocle", fits: ['comm.head'], stats: { crit: 10, range: 10 }, recipe: { scrap: 30, parts: { 'Obsession optics': 1 } } },
  pistonFist: { name: 'Piston fist', fits: ['comm.arm'], stats: { meleeDmg: 25, knock: 40 }, recipe: { scrap: 45 } },
  gatlingCuff: { name: 'Gatling cuff', fits: ['comm.arm'], stats: { atkSpeed: 20, rangedDmg: 5 }, recipe: { scrap: 40, parts: { 'Mechahornet stinger': 1 } } },
  leechGauntlet: { name: 'Leech-mouth gauntlet', fits: ['comm.arm', ...BOT('arms')], stats: { meleeDmg: 5 }, note: 'Melee hits drink oil back.', recipe: { scrap: 30, parts: { 'Leech mouth': 3 } } },
  bellowsLungs: { name: 'Bellows lungs', fits: ['comm.core'], stats: { steam: 40, steamRegen: 20 }, recipe: { scrap: 60 } },
  boilerCorset: { name: 'Boilerplate corset', fits: ['comm.core'], stats: { armour: 18, speed: -10 }, recipe: { scrap: 45 } },
  gasketHeart: { name: 'Gasket heart', fits: ['comm.core'], stats: { oil: 30 }, recipe: { scrap: 80 } },
  brassShins: { name: 'Brass shins', fits: ['comm.legs'], stats: { speed: 10 }, recipe: { scrap: 25 } },
  magBoots: { name: 'Mag-boots', fits: ['comm.legs'], stats: { armour: 8, speed: -5 }, recipe: { scrap: 35 } },
  rearVent: { name: 'Posterior Pressure Vent', fits: ['comm.rear'], stats: { speed: 5, steam: -10 }, note: 'Dash.', recipe: { scrap: 30 } },
  afterburner: { name: 'Afterburner exhaust', fits: ['comm.rear'], note: 'Afterburner dash: foes it passes take 14.', recipe: { scrap: 80, parts: { 'Mechahornet wings': 1 } } },
  supportAntenna: { name: 'The support antenna', fits: ['comm.pack'], stats: { armour: 6, steamRegen: 15 }, note: 'Call the Brass Guard.', recipe: { scrap: 60, parts: { 'Mechahornet head': 2 } } },
  steamWhistle: { name: 'Boiler whistle', fits: ['comm.pack'], note: 'Boiler Whistle: 16 damage and a shove round you.', recipe: { scrap: 55 } },
  scrapMagnet: { name: 'Scrap magnet', fits: ['comm.pack'], stats: { magnet: 100 }, recipe: { scrap: 30 } },

  rivetRepeater: { name: 'Rivet repeater', fits: ['guard.arms'], stats: { dmg: 30, range: 20 }, recipe: { scrap: 35, parts: { 'Mechahornet stinger': 1 } } },
  autoloader: { name: 'Clockwork autoloader', fits: ['guard.arms'], stats: { atkSpeed: 35 }, recipe: { scrap: 40 } },
  stingerBayonet: { name: 'Stinger bayonet', fits: ['guard.arms'], stats: { dmg: 15 }, recipe: { scrap: 35, parts: { 'Mechahornet stinger': 2 } } },
  riotBadge: { name: 'Riot badge', fits: ['guard.head'], stats: { armour: 8, plating: 2 }, recipe: { scrap: 35, parts: { Badge: 2 } } },
  scrapPlating: { name: 'Scrap plating', fits: BOT('back'), stats: { armour: 12, speed: -8 }, recipe: { scrap: 20 } },
  boilerHalo: { name: 'Boiler halo', fits: BOT('back'), note: 'Armour +10% to allies within 120 px.', recipe: { scrap: 45 } },
  lampOfFaith: { name: 'Lamp of Faith', fits: BOT('back'), note: 'Damage +15% to allies within 120 px.', recipe: { scrap: 65 } },
  tankTreads: { name: 'Tank treads', fits: BOT('mobility'), stats: { armour: 8, speed: -15 }, recipe: { scrap: 25 } },
  pramWheels: { name: 'Pram wheels', fits: BOT('mobility'), stats: { speed: 20 }, recipe: { scrap: 20 } },
  wingRig: { name: 'Hornet wing rig', fits: BOT('mobility'), stats: { speed: 30, oil: -20 }, recipe: { scrap: 35, parts: { 'Mechahornet wings': 2 } } },
  dowserEyes: { name: 'Crawlcam dowsing eyes', fits: ['gatherer.head'], stats: { gather: 35 }, recipe: { scrap: 30, parts: { 'Crawlcam lens cluster': 1, 'Mechahornet head': 1 } } },
  deepHose: { name: 'Deep hose', fits: ['gatherer.arms'], stats: { gather: 50 }, recipe: { scrap: 35 } },
  tuskBore: { name: 'Tusk bore', fits: ['gatherer.arms'], stats: { gather: 45 }, recipe: { scrap: 30, parts: { 'Piston tusk': 2 } } },
  wideNozzle: { name: 'Wide nozzle', fits: ['repairer.arms'], stats: { repair: 40 }, recipe: { scrap: 35 } },
  grabberArms: { name: 'Long-arm grabbers', fits: ['mule.arms'], stats: { magnet: 80 }, recipe: { scrap: 30, parts: { 'Long arm': 2 } } },
};

// The game's catalogue wins over the mock's copy: names and stats from ITEMS.
for (const [id, d] of Object.entries(IT)) {
  if (!ITEMS[id]) throw new Error(`mock item ${id} is not in ITEMS`);
  d.name = ITEMS[id].name;
  d.stats = ITEMS[id].stats;
}
const STATN = Object.fromEntries(Object.entries(STATS).map(([k, v]) => [k, v.name]));
const PTS = new Set(Object.keys(STATS).filter((k) => STATS[k].pts));
// Glyphs (icons/, game-icons.net placeholders: the game draws no stat or damage-type icons).
const STAT_G = { dmg: 'open-wound', meleeDmg: 'open-wound', rangedDmg: 'open-wound', atkSpeed: 'stopwatch', crit: 'crosshair', armour: 'bordered-shield', oil: 'oil-can', speed: 'running-shoe', steam: 'boiling-bubbles', steamRegen: 'boiling-bubbles', range: 'bullseye', knock: 'fist', gather: 'gears', repair: 'auto-repair', magnet: 'magnet', plating: 'metal-plate' };
const TYPE_G = { impact: 'hammer-drop', pierce: 'arrowhead', shock: 'focused-lightning', scald: 'steam', steam: 'steam', fire: 'fire', cold: 'snowflake-1', acid: 'acid', dark: 'evil-moon' };
// The slot's own icon, the inventory's item-kind badges (src/itemkinds.ts KINDS); a bot's arms and back read as arm and pack there too.
const SLOT_G = { head: KINDS.head.icon, arm: KINDS.arm.icon, arms: KINDS.arm.icon, core: KINDS.core.icon, legs: KINDS.legs.icon, rear: KINDS.rear.icon, pack: KINDS.pack.icon, back: KINDS.pack.icon, mobility: KINDS.mobility.icon };
/** Primary and secondary are both weapons: a mouse with the button that fires it (left click, right click) tells them apart (a guess). */
const mouseG = (side) => `<span class="g"><svg viewBox="0 0 16 16"><rect x="3.5" y="1" width="9" height="14" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v6M3.5 7h9" stroke="currentColor" stroke-width="1.2"/><path d="${side === 'L' ? 'M8 1.6a4 4 0 0 0-3.9 4.3V6.6H8z' : 'M8 1.6a4 4 0 0 1 3.9 4.3V6.6H8z'}" fill="currentColor"/></svg></span>`;
const slotGlyph = (slot) => (slot === 'primary' ? mouseG('L') : slot === 'secondary' ? mouseG('R') : glyph(SLOT_G[slot]));
const SLOT_TIP = { primary: 'Primary weapon (left click)', secondary: 'Secondary weapon (right click)' };

const sign = (v) => (v > 0 ? `+${v}` : `${v}`);
/** One stat as glyph and value, the inventory's numbers (`STATS`: percent unless points). */
const chip = (g, val, title, bad = false) => `<span class="chip${bad ? ' is-bad' : ''}" ${tt(title)}>${g}<b>${val}</b></span>`;

/**
 * What an item does, from the game's data at a quality: `chips` (glyph and value) and `line` (the words the inventory's card uses for
 * what is not a number: a weapon's extras, a skill, an aura, the calm; `defCard` in src/inventory.ts). `gap` names a rule the game holds
 * as an effect with no words of its own (the card shows only its flavour there), worded here from the effect.
 */
function effectOf(id, q = 'standard') {
  const d = ITEMS[id];
  const m = QUALITIES[q].mult;
  const chips = [], line = [];
  let gap = null;
  if (d.weapon) {
    const w = WEAPONS[d.weapon];
    chips.push(`<span class="chip chip--type" ${tt(`${w.type} damage`)}>${dt(w.type, 'dt--s')}<b>${w.type[0].toUpperCase() + w.type.slice(1)}</b></span>`);
    chips.push(chip(glyph('open-wound'), `${Math.round(w.dmg * m)}${w.pellets ? `×${w.pellets.n}` : ''}`, w.pellets ? `Damage a rivet, ${w.pellets.n} rivets` : 'Damage a hit'));
    chips.push(chip(glyph('stopwatch'), `${(1 / w.rate).toFixed(1)}/s`, 'Hits a second'));
    chips.push(chip(glyph('bullseye'), w.kind === 'melee' ? w.reach : w.range, w.kind === 'melee' ? 'Reach (px)' : 'Range (px)'));
    if (w.crit) line.push(`${Math.round(w.crit * 100)}% critical${w.bounce ? ', a crit ricochets on' : ''}`);
    if (w.chain) line.push(`arcs to ${w.chain.n} more foes`);
    if (w.kind === 'gun') line.push(w.ammo === 'scrap' ? 'shoots scrap (1 a shot)' : 'spends steam');
    else if (w.knock > 400) line.push('big knockback');
  }
  for (const [k, v] of Object.entries(d.stats ?? {})) {
    const val = Math.round(v > 0 ? v * m : v);
    chips.push(chip(glyph(STAT_G[k] ?? 'cog'), `${sign(val)}${PTS.has(k) ? '' : '%'}`, STATN[k], val < 0));
  }
  const words = (st) => Object.entries(st).map(([k, v]) => `${sign(Math.round(v > 0 ? v * m : v))}${PTS.has(k) ? '' : '%'} ${STATN[k].toLowerCase()}`).join(', ');
  if (d.crew) line.push(`every bot ${words(d.crew)}`);
  if (d.aura) line.push(`allies within ${d.aura.r} px ${words(d.aura.stats)}`);
  if (d.calm) line.push('plain hornets leave the wearer alone');
  if (d.skill) line.push(`${SKILLS[d.skill].name}: ${SKILLS[d.skill].steam} steam${SKILLS[d.skill].key === 'skill' ? `, ${SKILLS[d.skill].cd} s` : ''}`);
  if (d.effects?.length) {
    const e = d.effects[0];
    const act = Array.isArray(e.do) ? e.do[0] : e.do;
    const on = e.if?.via ? `${[].concat(e.if.via).join(' or ')} hits` : e.when === 'hurt' ? 'when hurt' : '';
    gap = act.do === 'heal' ? `${on}: +${act.amount} oil` : act.do === 'status' ? `${on}: ${e.chance ? `${Math.round(e.chance * 100)}% ` : ''}${act.id[0].toUpperCase() + act.id.slice(1)}` : null;
    if (gap) line.push(gap);
  }
  const text = line.join('; ');
  return { chips: chips.join(''), line: text ? text[0].toUpperCase() + text.slice(1) : '', gap, skill: d.skill ? SKILLS[d.skill].text : '' };
}

const relicTip = (id) => tip(`<b>${RELIC[id].reading}</b>${RELIC[id].item}, misread. ${RELIC[id].socket[0].toUpperCase() + RELIC[id].socket.slice(1)} socket.<div class="note">${RELIC[id].effect}. Flaw: ${RELIC[id].flaw}.</div>`);
const PART_TEX = {
  'Mechahornet head': 'part-hornet-head', 'Mechahornet stinger': 'part-hornet-stinger', 'Mechahornet wings': 'part-hornet-wings', 'Crawlcam lens cluster': 'part-spider-lens',
  'Obsession optics': 'part-drone-optics', Badge: 'part-officer-badge', 'Destrier legs': 'part-charger-legs', 'Leech mouth': 'part-leech-mouth', 'Piston tusk': 'part-boar-tusk',
  'Long arm': 'part-monkey-arm', 'Spring haunches': 'part-cat-haunches', Briefcase: 'part-commuter-case', 'Crawlcam legs': 'part-spider-legs',
};

// The relics (src/sim/junk.ts): reading, effect and flaw as the game words them.
const RELIC = RELICS;

const CARD = {
  ricochetRivets: { name: 'Ricochet Rivets', pool: 'gun', tag: 'Gun card', text: 'Bolts bounce once, to the next foe.' },
  wideSwing: { name: 'Wide Swing', pool: 'melee', tag: 'Melee card', text: 'The swing is a full circle.' },
  bootPolish: { name: 'Boot Polish', pool: 'kick', tag: 'Kick card', text: 'Crashes Stagger what they crash into.' },
  rallyKick: { name: 'Rally Kick', pool: 'crew', tag: 'Crew card', text: 'When you kick, the crew within 200 px gains Haste for 2 s.' },
  pressureRelease: { name: 'Pressure Release', pool: 'gatherer', tag: 'Gatherer card', text: 'Hurt while stripping or mining: a Steam and Wet vent round the gatherer.' },
  deepDraw: { name: 'Deep Draw', pool: 'gatherer', tag: 'Gatherer card', text: 'Stripping a ruin also brings up a scrap gob, now and then.' },
  sawTeeth: { name: 'Saw Teeth', pool: 'guard', tag: 'Guard card', text: "The guard's saw hits leave the foe Corroded." },
  shieldBrothers: { name: 'Shield Brothers', pool: 'guard', tag: 'Guard card', text: 'Guards within 120 px of each other share the damage they take, evenly.' },
  overpressure: { name: 'Overpressure', pool: 'repairer', tag: 'Repairer card', text: 'A heal above full becomes Overcharge, a shield.' },
  fieldTinker: { name: 'Field Tinker', pool: 'repairer', tag: 'Repairer card', text: "A field fix also clears the fixed robot's negative statuses." },
};
const COMM_POOLS = ['gun', 'melee', 'kick', 'body', 'crew', 'dog', 'keystone'];

// The lands on the course table (src/sim/defs/biomes.ts, src/sim/defs/foes.ts; the desert's weak/resist as the course table shows them).
// A machine: [name, weak, resist, art, note, counter].
const LANDS = {
  desert: { name: 'Desert', tier: 'I', boss: 'hornet-boss', sky: 'Plain Sky', twist: null, parts: ['Mechahornet head', 'Mechahornet stinger', 'Mechahornet wings', 'Crawlcam lens cluster'],
    foes: [['Mechahornet', ['shock'], ['impact', 'dark'], 'hornet'], ['Crawlcam', ['impact'], ['pierce', 'dark'], 'tex:spider-body'], ['The Hornet Queen', ['shock'], ['impact', 'dark'], 'hornet-boss', 'holds the land']] },
  jungle: { name: 'Rustwood Jungle', tier: 'II', boss: 'gorilla-boss', sky: 'Plain Sky', twist: 'Rain: everything Wet', parts: ['Spring haunches', 'Piston tusk', 'Long arm'],
    foes: [['Pounce-cat', ['impact'], ['pierce'], 'cat'], ['Ramjet boar', ['shock'], ['impact'], 'boar'], ['Spanner monkey', ['impact'], [], 'monkey'], ['The Ironback', ['shock'], ['impact'], 'gorilla-boss', 'at dusk']] },
  city: { name: 'Hollow City', tier: 'III', boss: 'knight-boss', sky: 'Plain Sky', twist: 'Rush hours: a calm crowd turns when bumped', parts: ['Briefcase', 'Badge', 'Destrier legs'],
    foes: [['Commuter', ['impact'], ['shock'], 'commuter'], ['Officer unit', ['scald'], ['shock'], 'officer', null, 'grounded'], ['Carousel charger', ['pierce'], ['impact'], 'charger'], ['Sir Lancelot-9', ['impact'], ['pierce'], 'knight-boss', 'at dusk']] },
  frost: { name: 'Frostspine', boss: 'bear-boss', locked: true },
};

const fresh = () => ({
  view: 'deck', from: null, back: null, sel: 'comm', slot: null, tab: 'slot', toast: null, isNew: null, inputs: 0, step: 0, flow: null,
  land: 'jungle', call: 'Steam barrage', haulDone: {},
  stores: { scrap: 2590, copper: 540, coal: 62 },
  parts: { 'Mechahornet head': 7, 'Mechahornet stinger': 6, 'Mechahornet wings': 4, 'Crawlcam lens cluster': 2, 'Obsession optics': 0, Badge: 0, 'Destrier legs': 0, 'Leech mouth': 0, 'Piston tusk': 1, 'Long arm': 0, 'Spring haunches': 0 },
  worn: {
    'comm.primary': { id: 'pipeWrench', q: 'standard' }, 'comm.secondary': { id: 'steamGun', q: 'standard' },
    'comm.head': { id: 'kettleHelm', q: 'standard' }, 'comm.arm': { id: 'pistonFist', q: 'fine' }, 'comm.core': { id: 'bellowsLungs', q: 'standard' },
    'comm.legs': { id: 'brassShins', q: 'standard' }, 'comm.rear': { id: 'rearVent', q: 'standard' }, 'comm.pack': { id: 'supportAntenna', q: 'standard' },
    'gatherer.head': { id: 'dowserEyes', q: 'standard' }, 'gatherer.arms': { id: 'deepHose', q: 'fine' }, 'gatherer.mobility': { id: 'pramWheels', q: 'standard' },
    'guard.arms': { id: 'rivetRepeater', q: 'standard' }, 'guard.back': { id: 'scrapPlating', q: 'standard' }, 'guard.mobility': { id: 'tankTreads', q: 'standard' },
    'repairer.arms': { id: 'wideNozzle', q: 'standard' },
  },
  stores_items: [{ id: 'pipeWrench', q: 'fine' }, { id: 'shovel', q: 'standard' }, { id: 'stingerBayonet', q: 'fine' }, { id: 'magBoots', q: 'standard' }, { id: 'boilerCorset', q: 'standard' }, { id: 'scrapMagnet', q: 'standard' }],
  shelf: [{ id: 'pipeWrenchNight', q: 'rare', price: 115 }, { id: 'leechGauntlet', q: 'rare', price: 125 }],
  relics: ['fan'],
  cards: { comm: ['ricochetRivets', 'wideSwing', null], gatherer: 'pressureRelease', guard: null, repairer: 'overpressure', mule: null },
  cardsOwned: ['bootPolish', 'rallyKick', 'deepDraw', 'sawTeeth', 'shieldBrothers', 'fieldTinker'],
  crew: {
    gatherer: [{ n: 'Ladle', spec: 'Miner', rank: 1, relic: 'smartphone', stoked: true }, { n: 'Funnel', rank: 0 }, { n: 'Sump', spec: 'Sweeper', rank: 0 }],
    guard: [{ n: 'Anvil', spec: 'Bulwark', rank: 2, relic: 'toaster' }, { n: 'Bolt', rank: 0 }],
    repairer: [{ n: 'Solder', spec: 'Medic', rank: 1, down: true }],
    mule: [{ n: 'Clover', rank: 0, wreck: true }],
  },
});

const RANKS = ['As built', 'Tuned', 'Overhauled', 'Masterwork'];
const ROLE_NAME = { gatherer: ['Gatherer', 'Gatherers'], guard: ['Guard', 'Guards'], repairer: ['Repairer', 'Repairers'], mule: ['Mule', 'Mules'] };
const SLOT_NAME = { primary: 'Primary', secondary: 'Secondary', head: 'Head', arm: 'Arm', core: 'Core', legs: 'Legs', rear: 'Rear', pack: 'Pack', arms: 'Arms', back: 'Back', mobility: 'Mobility' };

let S = fresh();
/** Which course table the mock shows (A: the grid, B: in words); kept across flows. */
let CT = 'A';
const PAGE = document.body.dataset.page;

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r1 = (v) => Math.round(v * 10) / 10;
const qName = (q) => Q[q][0];
const qMul = (q) => Q[q][1];
const slotLabel = (key) => SLOT_NAME[key.split('.')[1]];
const partsTotal = () => 230 + Object.values(S.parts).reduce((a, b) => a + b, 0);
const robotsOf = (role) => S.crew[role];

// Tooltips: a text one (`data-tt`) or a rich one (`data-tip`, its HTML kept here for the render).
let TIPS = {};
let tipN = 0;
const tip = (html) => {
  const id = `t${tipN++}`;
  TIPS[id] = html;
  return `data-tip="${id}"`;
};
const tt = (text) => `data-tt="${esc(text)}"`;

/** A picture in the one frame. */
const fr = (src, size = 'm', extra = '') => `<span class="fr fr--${size}${src ? '' : ' fr--empty'}" ${extra}>${src ? `<img src="${src}" alt="">` : ''}</span>`;
const itemFr = (o, size = 'm', extra = '') => `<span class="fr fr--${size}" data-q="${o.q}" ${extra}><img src="${item(o.id)}" alt=""></span>`;
const partFr = (p, size = 'xs') => fr(tex(PART_TEX[p]), size, tt(p));
const foeSrc = (a) => (a.startsWith('tex:') ? tex(a.slice(4)) : foe(a));
/** A damage type's glyph disc. */
const dt = (type, mod = '', title = '') => `<span class="dt ${mod}" ${tt(title || `${type} damage`)}>${glyph(TYPE_G[type])}</span>`;
const arrow = (d) => (d > 0.001 ? '<span class="up">▲</span>' : d < -0.001 ? '<span class="down">▼</span>' : '<span style="opacity:.5">·</span>');
/** A stat in the drawer: glyph, the item's value, and an arrow against what the slot wears. */
const st = (g, d, title, val) => `<span class="st" ${tt(title)}>${glyph(g, 'g--s')}<b>${val}</b>${arrow(d)}</span>`;

function canPay(recipe) {
  if (S.stores.scrap < recipe.scrap) return false;
  return Object.entries(recipe.parts ?? {}).every(([p, n]) => (S.parts[p] ?? 0) >= n);
}

/** The glyph row of an item against what the slot wears, and the tooltip table with the numbers. */
function compare(id, q, key) {
  const d = IT[id];
  const cur = S.worn[key];
  const curD = cur ? IT[cur.id] : null;
  if (d.w) {
    const w = WEAP[d.w], m = qMul(q);
    const cw = curD?.w ? WEAP[curD.w] : null, cm = cur ? qMul(cur.q) : 1;
    const hit = w.dmg * m, chit = cw ? cw.dmg * cm : 0;
    const dist = w.reach ?? w.range, cdist = cw ? cw.reach ?? cw.range : 0;
    const glyphs = `<span class="st" ${tt(`${w.type} damage${cw && cw.type !== w.type ? ` (worn: ${cw.type})` : ''}`)}>${dt(w.type, 'dt--s')}<b>${w.type[0].toUpperCase() + w.type.slice(1)}</b></span>`
      + st('open-wound', hit - chit, 'Damage a hit', Math.round(hit)) + st('stopwatch', cw ? cw.rate - w.rate : 1, 'Hits a second', `${(1 / w.rate).toFixed(1)}/s`) + st('bullseye', dist - cdist, w.reach ? 'Reach (px)' : 'Range (px)', dist);
    const row = (label, a, b) => `<tr><th>${label}</th><td>${a}</td><td>${b ?? '–'}</td></tr>`;
    const table = `<table><tr><th></th><th>This</th><th>Worn</th></tr>${row('Type', w.type, cw?.type)}${row('Hit', r1(hit), cw && r1(chit))}${row('Per second', r1(hit / w.rate), cw && r1(chit / cw.rate))}${row(w.reach ? 'Reach' : 'Range', dist + (w.reach ? ' (melee)' : ' (gun)'), cw && cdist + (cw.reach ? ' (melee)' : ' (gun)'))}</table>`;
    return { glyphs, table };
  }
  const a = d.stats ?? {}, b = curD?.stats ?? {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const val = (s, k, qq) => Math.round((s[k] ?? 0) * (s[k] > 0 ? qMul(qq) : 1));
  const fmt = (v, k) => (v ? `${v > 0 ? '+' : ''}${v}${PTS.has(k) ? '' : '%'}` : '–');
  const glyphs = keys.map((k) => st(STAT_G[k] ?? 'cog', val(a, k, q) - (cur ? val(b, k, cur.q) : 0), STATN[k], fmt(val(a, k, q), k))).join('');
  const table = keys.length ? `<table><tr><th></th><th>This</th><th>Worn</th></tr>${keys.map((k) => `<tr><th>${STATN[k]}</th><td>${fmt(val(a, k, q), k)}</td><td>${cur ? fmt(val(b, k, cur.q), k) : '–'}</td></tr>`).join('')}</table>` : '';
  return { glyphs, table };
}

/** What a weapon meets on a land: the machines weak to it and those that resist it. */
function meets(wid, land) {
  const t = WEAP[wid].type;
  const L = LANDS[land];
  return { up: L.foes.filter((f) => f[1].includes(t)), down: L.foes.filter((f) => f[2].includes(t)) };
}

// ---------------------------------------------------------------- the dock

// The painted figure on the drawing, its box in the drawing, and where each slot's line ends on it ([slot, side, row, x, y]).
// A plate: the slot's icon in its top-right corner, the worn item's picture and name, its stats as glyph and value in the middle
// (down a column, then a second column), and a line of what it does that is not a number.
const DOLL_W = 548, PW = 182, PH = 88, GAP = 4;
const DOLL = {
  comm: { box: [190, 18, 169, 300], plates: [['pack', 0, 0, 252, 90], ['primary', 0, 1, 208, 132], ['arm', 0, 2, 230, 172], ['legs', 0, 3, 268, 262],
    ['head', 1, 0, 316, 74], ['core', 1, 1, 306, 146], ['secondary', 1, 2, 338, 202], ['rear', 1, 3, 322, 244]] },
  bot: { box: [204, 34, 140, 210], top: [16, 168], plates: [['head', 0, 0, 274, 64], ['back', 0, 1, 236, 150], ['arms', 1, 0, 316, 132], ['mobility', 1, 1, 276, 226]] },
};
const plateXY = (doll, side, row) => [side ? DOLL_W - PW : 0, doll.top ? doll.top[row] : row * (PH + GAP)];

function slotHtml(who, doll, [slot, side, row]) {
  const key = `${who}.${slot}`;
  const cur = S.worn[key];
  const [x, y] = plateXY(doll, side, row);
  const name = SLOT_TIP[slot] ?? SLOT_NAME[slot];
  const corner = `<span class="pl-slot" ${tt(name)}>${slotGlyph(slot)}</span>`;
  const cls = `dk-plate mk-plate${S.slot === key ? ' is-sel' : ''}${S.isNew === key ? ' is-new' : ''}${cur ? '' : ' is-empty'}`;
  if (!cur) return `<button class="${cls}" style="left:${x}px;top:${y}px" data-act="slot" data-key="${key}">${corner}${fr(null, 's')}<span class="pl-name">Empty</span><span class="pl-line">Nothing worn</span></button>`;
  const d = IT[cur.id];
  const e = effectOf(cur.id, cur.q);
  const { table } = compare(cur.id, cur.q, key);
  const t = tip(`<b>${esc(d.name)}</b>${qName(cur.q)}, ${name.toLowerCase()}${table}${e.line ? `<div class="note">${esc(e.line)}.</div>` : ''}${e.skill ? `<div class="note">${esc(e.skill)}</div>` : ''}`);
  return `<button class="${cls}" style="left:${x}px;top:${y}px" data-act="slot" data-key="${key}" ${t}>${corner}${itemFr(cur, 's')}<span class="pl-name">${esc(d.name)}</span>
    <span class="pl-stats">${e.chips}</span>${e.line ? `<span class="pl-line">${esc(e.line)}</span>` : ''}</button>`;
}

const leaders = (doll) => doll.plates.map(([, side, row, ax, ay]) => {
  const [x, y] = plateXY(doll, side, row);
  const sx = side ? x : PW, sy = y + PH / 2;
  return `<path d="M${sx} ${sy} L${ax} ${ay}" fill="none" stroke="#43321f" stroke-width="1.2"/><circle cx="${ax}" cy="${ay}" r="3.5" fill="#43321f" stroke="#e9d9a9" stroke-width="1"/>`;
}).join('');

function cardHtml(id, label, key, name = label) {
  const lab = label ? `<div class="dk-cardslot__label">${label}</div>` : '';
  if (!id) return `<div class="dk-cardslot${S.slot === key ? ' is-sel' : ''}" data-act="slot" data-key="${key}" ${tt(`${name}: empty`)}>${lab}
    <div class="pc pc--sm pc--empty">${STOCK}<span class="pc__head"><span class="pc__name">Empty pocket</span></span></div></div>`;
  const c = { id, pool: CARD[id].pool };
  return `<div class="dk-cardslot${S.slot === key ? ' is-sel' : ''}" data-act="slot" data-key="${key}" ${tt(`${name}: ${CARD[id].text}`)}>${lab}
    <div class="${pcClass(c, 'sm')}" ${pcStyle(c)}>${STOCK}<span class="pc__head"><span class="pc__name">${CARD[id].name}</span><span class="pc__tag">${CARD[id].tag}</span></span>${holesSvg(id)}</div></div>`;
}

function botTag(role, b, i) {
  const relicKey = `relic.${role}.${i}`;
  const socket = `<button class="dk-socket${S.slot === relicKey ? ' is-sel' : ''}" data-act="slot" data-key="${relicKey}">${b.relic
    ? fr(tex(`relic-${b.relic}`), 's', relicTip(b.relic))
    : fr(null, 's', tt('Relic socket: empty'))}</button>`;
  let acts;
  if (b.wreck) acts = `<button class="mk-btn mk-btn--main" data-act="rebuild" data-role="${role}" data-i="${i}" ${tt('Rebuild: 30 scrap and the part it last fitted; rank kept')}>${glyph('anvil', 'g--s')}${glyph('cog', 'g--s')}30 ${glyph('gear-hammer', 'g--s')}1</button>`;
  else if (b.down) acts = `<button class="mk-btn mk-btn--main" data-act="repair" data-role="${role}" data-i="${i}" ${tt('Repair: 15 scrap')}>${glyph('wrench', 'g--s')}${glyph('cog', 'g--s')}15</button>`;
  else acts = `<button class="mk-btn${b.stoked ? ' is-on' : ''}" data-act="stoke" data-role="${role}" data-i="${i}" ${tt(b.stoked ? 'Stoked for the next landing; click to let it go cold (coal back)' : 'Stoke for the next landing: 5 coal')}>${glyph('coal-pile', 'g--s')}5</button><button class="mk-btn" data-act="promote" ${tt('Promote: as the workshop does it today')}>${glyph('light-bulb', 'g--s')}Promote</button>`;
  const stamp = b.wreck ? '<span class="mk-stamp mk-stamp--red">Wreck</span>' : b.down ? '<span class="mk-stamp mk-stamp--red">Down</span>' : '';
  return `<div class="dk-bot2">${fr(crew(role), 'm', b.wreck || b.down ? 'style="filter:grayscale(.8)"' : '')}<div><div class="dk-bot2__name">${b.n}</div><span class="dk-bot2__stars" ${tt(`${RANKS[b.rank]}${b.spec ? `, ${b.spec}` : ''}`)}>${'★'.repeat(b.rank)}${'☆'.repeat(3 - b.rank)}</span></div>
    <div class="dk-bot2__row">${socket}${acts}</div>${stamp}</div>`;
}

function rosterHtml() {
  const who = (id, src, name, n, chips) => `<button class="dk-who2 mk-stock${S.sel === id ? ' is-sel' : ''}" data-act="who" data-who="${id}">
    ${fr(src, 'm')}<span class="dk-who__name">${name}</span><span class="dk-who__n">${n}</span><span class="dk-chips">${chips}</span></button>`;
  const rows = [who('comm', PORTRAIT, 'Communicator', '', ''), '<div class="dk-roster__sep"></div>'];
  let cold = 0, down = 0, wreck = 0;
  for (const r of ROLES) {
    const bots = robotsOf(r);
    const c = bots.filter((b) => !b.wreck && !b.down && !b.stoked).length;
    const d = bots.filter((b) => b.down).length, w = bots.filter((b) => b.wreck).length;
    cold += c; down += d; wreck += w;
    const empty = ['head', 'arms', 'back', 'mobility'].filter((s) => !S.worn[`${r}.${s}`]);
    const chips = (w ? `<span class="down" ${tt(`${w} a wreck`)}>${glyph('broken-skull', 'g--s')}${w}</span>` : '')
      + (d ? `<span class="down" ${tt(`${d} down`)}>${glyph('hand-bandage', 'g--s')}${d}</span>` : '')
      + (c ? `<span ${tt(`${c} not stoked`)}>${glyph('coal-pile', 'g--s')}${c}</span>` : '')
      + (empty.length ? `<span ${tt(`Empty: ${empty.map((s) => SLOT_NAME[s].toLowerCase()).join(', ')}`)}>${fr(null, 'xs')}${empty.length}</span>` : '');
    rows.push(who(r, crew(r), ROLE_NAME[r][1], `×${bots.length}`, chips));
  }
  rows.push(`<div class="dk-roster__bulk">
    <button class="mk-btn" data-act="bulk" data-what="stoke"${cold ? '' : ' disabled'} ${tt('Stoke every robot that rides')}><span>${glyph('coal-pile', 'g--s')} Stoke all</span><small>${glyph('coal-pile', 'g--s')}${cold * 5}</small></button>
    <button class="mk-btn" data-act="bulk" data-what="repair"${down ? '' : ' disabled'} ${tt('Repair every robot carried home down')}><span>${glyph('wrench', 'g--s')} Repair all</span><small>${glyph('cog', 'g--s')}${down * 15}</small></button>
    <button class="mk-btn" data-act="bulk" data-what="rebuild"${wreck ? '' : ' disabled'} ${tt('Rebuild every wreck: 30 scrap and 1 part each')}><span>${glyph('anvil', 'g--s')} Rebuild all</span><small>${glyph('cog', 'g--s')}${wreck * 30} ${glyph('gear-hammer', 'g--s')}${wreck}</small></button></div>`);
  return `<div class="dk-roster">${rows.join('')}</div>`;
}

function sheetHtml() {
  const who = S.sel;
  const doll = who === 'comm' ? DOLL.comm : DOLL.bot;
  const [bx, by, bw, bh] = doll.box;
  const src = who === 'comm' ? HERO : crew(who);
  const figure = `<div class="dk-paint" style="left:${bx}px;top:${by}px;width:${bw}px;height:${bh}px"><img src="${src}" alt=""></div>`;
  const svg = `<svg viewBox="0 0 ${DOLL_W} 364">${leaders(doll)}</svg>`;
  if (who === 'comm') {
    const cards = S.cards.comm.map((id, i) => cardHtml(id, '', `card.comm.${i}`, `Card ${i + 1}`)).join('');
    const ch = (g, word, name, n) => `<div class="row" ${tt(name)}>${glyph(g)}<span>${word}</span><span class="pips">${'●'.repeat(n)}${'○'.repeat(3 - n)}</span></div>`;
    return `<div class="dk-sheet mk-stock"><div class="dk-title"><b>The Communicator</b>fig. 1</div><div class="dk-doll">${figure}${svg}${doll.plates.map((p) => slotHtml('comm', doll, p)).join('')}</div>
      <div class="dk-under"><div class="dk-cards">${cards}</div>
      <div class="dk-chassis2"><h4>Chassis</h4>${ch('oil-can', 'Oil tank', 'Oil tank: 1 of 3', 1)}${ch('boiling-bubbles', 'Boiler', 'Boiler: 0 of 3', 0)}${ch('bordered-shield', 'Plating', 'Riveted plating: 2 of 3', 2)}${ch('running-shoe', 'Pistons', 'Leg pistons: 1 of 3', 1)}</div></div></div>`;
  }
  const bots = robotsOf(who);
  return `<div class="dk-sheet mk-stock"><div class="dk-title"><b>${ROLE_NAME[who][1]}</b>all ${bots.length} wear this</div><div class="dk-doll">${figure}${svg}
      ${doll.plates.map((p) => slotHtml(who, doll, p)).join('')}
      <div style="position:absolute;left:182px;top:278px;width:184px">${cardHtml(S.cards[who], 'Type card', `card.${who}`)}</div></div>
    <div class="dk-under">${bots.map((b, i) => botTag(who, b, i)).join('')}</div></div>`;
}

/** The drawer's entries for a gear slot: owned, craftable, buyable. */
function slotEntries(key) {
  const owned = [], craft = [], buy = [];
  S.stores_items.forEach((o, i) => { if (IT[o.id].fits.includes(key)) owned.push({ ...o, src: 'owned', i }); });
  if (WS.includes(key)) {
    const other = WS.find((k) => k !== key);
    const o = S.worn[other];
    if (o) owned.push({ ...o, src: 'swap', other });
  }
  for (const [id, d] of Object.entries(IT)) if (d.recipe && d.fits.includes(key) && !['steamGun', 'pipeWrench', 'shovel', 'arcGun'].includes(id)) craft.push({ id, q: 'standard', src: 'craft' });
  S.shelf.forEach((o, i) => { if (IT[o.id].fits.includes(key)) buy.push({ ...o, src: 'buy', i }); });
  return { owned, craft, buy };
}

function costHtml(recipe) {
  const scrap = `<span class="${S.stores.scrap >= recipe.scrap ? '' : 'short'}">${glyph('cog', 'g--s')}${recipe.scrap}</span>`;
  const parts = Object.entries(recipe.parts ?? {}).map(([p, n]) => `<span class="${(S.parts[p] ?? 0) >= n ? '' : 'short'}" ${tt(`${p}: ${n} needed, ${S.parts[p] ?? 0} in the stores`)}>${partFr(p)}${n}<small style="opacity:.7">/${S.parts[p] ?? 0}</small></span>`).join('');
  return scrap + parts;
}

function tagHtml(e, key) {
  const d = IT[e.id];
  const back = S.back ? ' & return' : '';
  let btn, cost = '', short = false;
  if (e.src === 'owned') btn = `Fit${back}`;
  else if (e.src === 'swap') btn = `Swap${back}`;
  else if (e.src === 'buy') { btn = `Buy & fit${back}`; short = S.stores.scrap < e.price; cost = `<span class="${short ? 'short' : ''}">${glyph('cog', 'g--s')}${e.price}</span>`; }
  else { btn = `Craft & fit${back}`; short = !canPay(d.recipe); cost = costHtml(d.recipe); }
  const { glyphs, table } = compare(e.id, e.q, key);
  const eff = effectOf(e.id, e.q);
  const notes = [eff.skill, e.src === 'swap' ? `Worn in ${slotLabel(e.other)}: the two swap.` : '', e.src === 'craft' ? 'Crafting rolls its quality.' : ''].filter(Boolean).join(' ');
  let foes = '';
  if (S.back === 'table' && d.w) {
    const m = meets(d.w, S.land);
    foes = `<div class="itag__foes">${m.up.map((f) => fr(foeSrc(f[3]), 'xs', tt(`${f[0]}: weak to it`))).join('')}${m.up.length ? '<span class="up">▲</span>' : ''} ${m.down.map((f) => fr(foeSrc(f[3]), 'xs', tt(`${f[0]}: resists it`))).join('')}${m.down.length ? '<span class="down">▼</span>' : ''}</div>`;
  }
  const t = tip(`<b>${esc(d.name)}</b>${e.src === 'craft' ? 'Rolls Standard to Legendary' : qName(e.q)}${table}${notes ? `<div class="note">${esc(notes)}</div>` : ''}`);
  return `<div class="itag${short ? ' is-short' : ''}" ${t}>${itemFr(e, 'm')}
    <div class="itag__body"><div class="itag__name">${esc(d.name)}</div><div class="sts">${glyphs}</div>${eff.line ? `<div class="itag__line">${esc(eff.line)}</div>` : ''}${foes}${cost ? `<div class="itag__cost">${cost}</div>` : ''}</div>
    <button class="mk-btn${short ? '' : ' mk-btn--main'}" data-act="take" data-src="${e.src}" data-id="${e.id}" data-q="${e.q}" data-i="${e.i ?? ''}" data-key="${key}"${short ? ' disabled' : ''}>${btn}</button></div>`;
}

const group = (label, body, empty) => `<div class="dk-group"><span class="dk-group__tab">${label}</span><span class="dk-group__rule"></span></div>${body || `<div class="dk-empty">${empty}</div>`}`;

function drawerHtml() {
  const key = S.slot;
  let head = '', list = '';
  if (S.tab === 'recipes') {
    head = '<h3>Recipes</h3>';
    const rows = Object.entries(IT).filter(([, d]) => d.recipe).slice(0, 16).map(([id, d]) => {
      const ok = canPay(d.recipe);
      return `<div class="itag${ok ? '' : ' is-short'}" ${tt(d.name)}>${itemFr({ id, q: 'standard' }, 'm')}<div class="itag__body"><div class="itag__name">${esc(d.name)}</div><div class="itag__cost">${costHtml(d.recipe)}</div></div>
        <button class="mk-btn" data-act="craft" data-id="${id}"${ok ? '' : ' disabled'}>Craft</button></div>`;
    }).join('');
    list = `<input class="dk-search" placeholder="Search: tusk, stinger, head…">${rows}`;
  } else if (!key) {
    head = `<h3>${S.sel === 'comm' ? 'Communicator' : ROLE_NAME[S.sel][1]}</h3>`;
    list = '<div class="dk-empty">Pick a slot.</div>';
  } else if (key.startsWith('card.')) {
    const [, who, idx] = key.split('.');
    const pools = who === 'comm' ? COMM_POOLS : [who];
    head = `<h3>${who === 'comm' ? `Card ${+idx + 1}` : 'Type card'}</h3>`;
    const fits = S.cardsOwned.filter((id) => pools.includes(CARD[id].pool));
    list = group('Your cards', fits.map((id) => {
      const c = { id, pool: CARD[id].pool };
      return `<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center"><div class="${pcClass(c, 'sm')}" ${pcStyle(c)}>${STOCK}<span class="pc__head"><span class="pc__name">${CARD[id].name}</span><span class="pc__tag">${CARD[id].tag}</span></span><span class="pc__typed">${CARD[id].text}</span>${holesSvg(id)}</div>
        <button class="mk-btn mk-btn--main" data-act="card" data-id="${id}" data-key="${key}">Slot it</button></div>`;
    }).join(''), 'No card you own fits this pocket.');
  } else if (key.startsWith('relic.')) {
    const [, role, i] = key.split('.');
    const b = robotsOf(role)[+i];
    head = `<h3>${b.n}'s relic</h3>`;
    list = group('In the stores', S.relics.map((id) => `<div class="itag" ${relicTip(id)}>${fr(tex(`relic-${id}`), 'm')}
      <div class="itag__body"><div class="itag__name">${RELIC[id].reading}</div><div class="itag__line">${esc(RELIC[id].effect)}.</div></div><button class="mk-btn mk-btn--main" data-act="relic" data-id="${id}" data-key="${key}">Fit${S.back ? ' & return' : ''}</button></div>`).join(''), 'No relics in the stores.');
  } else {
    const [who] = key.split('.');
    const cur = S.worn[key];
    head = `<h3>${slotLabel(key)}</h3>${cur ? itemFr(cur, 's', tt(`Worn: ${IT[cur.id].name}`)) : ''}${who === 'comm' ? '' : `<span ${tt(`Every one of the ${robotsOf(who).length} wears it`)}>${glyph('gears', 'g--s')} all ${robotsOf(who).length}</span>`}`;
    const { owned, craft, buy } = slotEntries(key);
    list = group('In the stores', owned.map((e) => tagHtml(e, key)).join(''), 'Nothing in the stores fits.')
      + group('Can be made', craft.map((e) => tagHtml(e, key)).join(''), 'No recipe for this slot yet.')
      + group("Trader's shelf", buy.map((e) => tagHtml(e, key)).join(''), 'Nothing on her shelf this lift.');
  }
  const back = S.back ? `<span class="mk-head__from" ${tt('Fitting takes you back')}>↩ ${S.back === 'haul' ? 'haul' : 'table'}</span>` : '';
  const toast = S.toast ? `<div class="dk-toast">${S.toast}</div>` : '<div></div>';
  return `<div class="dk-drawer"><div class="dk-drawer__head">${head}${back}<div class="dk-tabs"><button class="dk-tab" data-act="tab" data-tab="slot" aria-selected="${S.tab === 'slot'}">This slot</button><button class="dk-tab" data-act="tab" data-tab="recipes" aria-selected="${S.tab === 'recipes'}">Recipes</button></div></div>
    <div></div><div class="dk-list">${list}</div>${toast}</div>`;
}

const FROM = { forge: "Hob's forge", clinic: "Gasket's clinic", bench: "Sprocket's bench", I: 'the I key', haul: 'the haul', table: 'the course table' };

function gauges(plus) {
  const g = (pic, n, name) => `<span class="mk-gauge2" ${tt(name)}>${pic}${plus ? '+' : ''}${n}</span>`;
  const v = plus ?? { scrap: S.stores.scrap, copper: S.stores.copper, coal: S.stores.coal, parts: partsTotal() };
  return `<div class="mk-gauges">${g(fr(tex('scrapgob'), 'xs'), v.scrap, 'Scrap')}${g(fr(tex('coppergob'), 'xs'), v.copper, 'Copper')}${g(glyph('coal-pile'), v.coal, 'Coal')}${g(glyph('gear-hammer'), v.parts, 'Parts')}${plus ? g(glyph('processor'), plus.cores, 'AI core') + g(glyph('light-bulb'), plus.insight, 'Insight') : ''}</div>`;
}

function dockHtml() {
  return `<div class="mk-panel"><div class="mk-head"><div class="mk-plate">Dry dock</div><span class="mk-head__from">at ${FROM[S.from]}</span>${gauges()}
    <button class="mk-btn mk-close" data-act="close"><span class="mk-key">Esc</span> ${S.back ? 'Back' : 'Close'}</button></div>
    <div class="dk">${rosterHtml()}${sheetHtml()}${drawerHtml()}</div></div>`;
}

// ---------------------------------------------------------------- arrival

const partKind = (name) => Object.keys(PARTS).find((k) => PARTS[k].name === name);
/** The workbench pieces a part goes into (the game's catalogue: every recipe naming it, gifts and mods left out). */
const makes = (name) => Object.keys(ITEMS).filter((id) => !ITEMS[id].gift && !ITEMS[id].mod && ITEMS[id].recipe.parts?.[partKind(name)]);
const relicTile = (id, socket, who) => ({ sec: 'Relics', key: id, pic: () => tex(`relic-${id}`), name: RELIC[id].reading, kind: 'relic', relic: id,
  left: ['sell', 'two-coins', JUNK.sell, `Sell to the Trader: ${JUNK.sell} scrap`], right: ['fitrelic', socket, `Fit: opens the Dry dock at ${who}'s socket`] });
const partTile = (name, key, n) => ({ sec: 'Parts', key, pic: () => tex(PART_TEX[name]), n, name, kind: 'part', part: name,
  left: ['sell', 'two-coins', buyBack(partKind(name)) * n, `Sell all ${n} to the Trader: ${buyBack(partKind(name))} scrap each`] });
const SALVAGE = Math.floor(ITEMS.arcGun.recipe.scrap / 2); // the game's `salvage`: half the recipe's scrap
const HAUL = [
  { sec: 'Found', key: 'arc', pic: () => item('arcGun'), name: ITEMS.arcGun.name, kind: 'item', id: 'arcGun', where: "Under the shrine's glass.",
    left: ['salvage', 'hammer-break', SALVAGE, `Salvage: ${SALVAGE} scrap, half its recipe`], right: ['fit', 'comm.secondary', 'Fit: opens the Dry dock at Secondary'] },
  relicTile('sprinkler', 'relic.gatherer.1', 'Funnel'),
  relicTile('zapper', 'relic.guard.1', 'Bolt'),
  partTile('Piston tusk', 'tusk', 4),
  partTile('Long arm', 'arm', 3),
  partTile('Spring haunches', 'haunch', 2),
  { sec: 'Crew', key: 'solder', pic: () => crew('repairer'), name: 'Solder', kind: 'bot', type: 'Repairer, Medic', stamp: 'Down', tip: 'Carried home, down. Repaired, it rides again, rank and relic as they were.',
    cost: ['repair', 'wrench', () => `${glyph('cog', 'g--s')}15`, 'Repair: 15 scrap'] },
  { sec: 'Crew', key: 'clover', pic: () => crew('mule'), name: 'Clover', kind: 'bot', type: 'Mule', stamp: 'Wreck', tip: 'Left on the sands: a wreck until rebuilt; it keeps its rank.',
    cost: ['rebuild', 'anvil', () => `${glyph('cog', 'g--s')}30 ${glyph('gear-hammer', 'g--s')}1`, 'Rebuild: 30 scrap and the part it last fitted'] },
];
const DONE_TEXT = { fit: 'Fitted', fitrelic: 'Fitted', salvage: 'Salvaged', sell: 'Sold', repair: 'Repaired', rebuild: 'Rebuilt' };
const HOME = [['Anvil', 'guard'], ['Bolt', 'guard'], ['Ladle', 'gatherer'], ['Funnel', 'gatherer'], ['Sump', 'gatherer']];

/** A haul tile, top to bottom: name, picture, what it does (stats, or the written effect), then its value on the left and Fit on the right. */
function haulTile(h) {
  const done = S.haulDone[h.key];
  const btn = (act, inner, key, title, main = false) => `<button class="mk-btn${main ? ' mk-btn--main' : ''}" data-act="haul" data-what="${act}" data-row="${h.key}" data-key="${key ?? ''}" ${tt(title)}>${inner}</button>`;
  const pic = `<span class="fr fr--l${h.stamp && !done ? ' fr--dim' : ''}"><img src="${h.pic()}" alt="">${h.n ? `<span class="fr__n">×${h.n}</span>` : ''}</span>`;
  let body = '', tipHtml = '';
  if (h.kind === 'item') {
    const e = effectOf(h.id);
    body = `<span class="ar-tile__stats">${e.chips}</span>${e.line ? `<span class="ar-tile__fx">${esc(e.line)}</span>` : ''}`;
    tipHtml = `<b>${esc(h.name)}</b>${h.where} ${esc(ITEMS[h.id].flavour)}`;
  } else if (h.kind === 'relic') {
    const R = RELIC[h.relic];
    body = `<span class="ar-tile__fx">${esc(R.effect)}.</span><span class="ar-tile__flaw">${esc(R.flaw)}.</span>`;
    tipHtml = `<b>${R.reading}</b>${R.item}, misread. ${R.socket[0].toUpperCase() + R.socket.slice(1)} socket.`;
  } else if (h.kind === 'part') {
    const ids = makes(h.part);
    body = !ids.length ? '<span class="ar-tile__makes">No recipe uses it</span>' : `<span class="ar-tile__makes"><span>Makes</span>${ids.slice(0, 3).map((id) => fr(item(id), 'xs', tt(ITEMS[id].name))).join('')}${ids.length > 3 ? `<span ${tt(ids.slice(3).map((id) => ITEMS[id].name).join(', '))}>+${ids.length - 3}</span>` : ''}</span>`;
    tipHtml = `<b>${esc(h.name)}</b>${ids.length ? `Used by: ${ids.map((id) => ITEMS[id].name).join(', ')}.` : 'No workbench recipe uses it yet.'}`;
  } else {
    body = `<span class="ar-tile__type">${esc(h.type)}</span>${done ? '' : `<span class="mk-stamp mk-stamp--red">${h.stamp}</span>`}`;
    tipHtml = `<b>${h.name}</b>${h.tip}`;
  }
  let foot;
  if (done) foot = `<div class="ar-tile__foot is-one"><span class="mk-stamp mk-stamp--green">${DONE_TEXT[done]}</span></div>`;
  else if (h.cost) foot = `<div class="ar-tile__foot is-one">${btn(h.cost[0], `${glyph(h.cost[1])}${h.cost[2]()}`, null, h.cost[3])}</div>`;
  else {
    const [act, g, val, title] = h.left;
    foot = `<div class="ar-tile__foot">${btn(act, `${glyph(g, 'g--s')}${glyph('cog', 'g--s')}${val}`, null, title)}${h.right ? btn(h.right[0], 'Fit', h.right[1], h.right[2], true) : ''}</div>`;
  }
  return `<div class="ar-tile ar-tile--${h.kind}${done ? ' is-done' : ''}" ${tip(tipHtml)}><span class="ar-tile__name">${esc(h.name)}</span>${pic}${body}${foot}</div>`;
}

function arrivalHtml() {
  let sec = '', out = '';
  for (const h of HAUL) {
    if (h.sec !== sec) {
      if (sec) out += '</div></div>';
      sec = h.sec;
      out += `<div class="ar-group"><div class="ar-sec2">${sec}</div><div class="ar-tiles">`;
      if (sec === 'Crew') out += `<div class="ar-tile" ${tt('Home on the lift: Anvil, Bolt, Ladle, Funnel, Sump. Stoking wore off as the lift docked.')}><span class="ar-tile__name">5 home</span><div class="ar-crew">${HOME.map(([n, r]) => fr(crew(r), 's', tt(n))).join('')}</div></div>`;
    }
    out += haulTile(h);
  }
  out += '</div></div>';
  const card = { id: 'pick', pool: 'gun' };
  out += `<div class="ar-group"><div class="ar-sec2">Old research</div><div class="ar-tiles"><div class="ar-tile" ${tt('One card pick waits at the Oracle')}><span class="ar-tile__name">1 pick</span><div class="pc pc--chip" ${pcStyle(card)}>${STOCK}${holesSvg('pick')}</div>
    <div class="ar-tile__foot is-one"><button class="mk-btn" data-act="haul" data-what="church" data-row="pick">Go to her</button> <span class="mk-open" ${tt('The pick sits behind the Oracle\'s talk today; a straight link is the audit\'s open question.')}>open</span></div></div></div></div>`;
  return `<div class="mk-panel"><div class="mk-head"><div class="mk-plate">Home</div><span class="mk-head__from">from the Rustwood Jungle</span>${gauges()}</div>
    <div class="ar"><div class="ar-bill mk-stock"><div><h2>The haul</h2><div class="ar-bill__sub">already in the stores; hover for details</div></div><div class="ar-rows">${out}</div></div>
    <div class="ar-side"><div class="ar-box"><h3>Banked</h3>${gauges({ scrap: 312, copper: 46, coal: 18, parts: 9, cores: 1, insight: 1 })}</div>
      <div class="ar-side__go"><button class="mk-btn mk-btn--main" data-act="done"><span>Done</span><span class="mk-key">E</span></button></div></div></div></div>`;
}

// ---------------------------------------------------------------- pre-flight

// Only what the game knows goes on the table: the land, its machines' weak and resist, the crew and their gear. Version A is the
// grid of pass 2; version B writes the same facts out in words beside their glyphs (the mock chrome switches them).
const typeWord = (t) => t[0].toUpperCase() + t.slice(1);
const mulOf = (t, weak, resist) => (weak.includes(t) ? WEAK : resist.includes(t) ? RESIST : 1);

function manifestHtml(words) {
  const wkeys = WS.map((k) => S.worn[k]);
  const ride = (pics, gear, label = '') => `<div class="pf-ride">${label}${pics}<span class="pf-ride__gear">${gear}</span></div>`;
  const lab = (text) => (words ? `<span class="pf-ride__who">${text}</span>` : '');
  const crewRows = ROLES.map((r) => {
    const bots = robotsOf(r);
    const rides = bots.filter((b) => !b.wreck && !b.down);
    const stays = bots.filter((b) => b.wreck || b.down);
    const gear = ['head', 'arms', 'back', 'mobility'].map((s) => S.worn[`${r}.${s}`] ? itemFr(S.worn[`${r}.${s}`], 'xs', tt(IT[S.worn[`${r}.${s}`].id].name)) : fr(null, 'xs', tt(`${SLOT_NAME[s]}: empty`))).join('');
    return (rides.length ? ride(rides.map((b) => fr(crew(r), 's', tt(`${b.n}${b.stoked ? ', stoked' : ''}`))).join(''), gear, lab(`${ROLE_NAME[r][rides.length > 1 ? 1 : 0]} ${rides.length}`)) : '')
      + stays.map((b) => ride(`<span class="fr fr--s fr--dim" ${tt(`${b.n} stays aboard: ${b.wreck ? 'a wreck' : 'down, repair it first'}`)}><img src="${crew(r)}" alt=""></span><span class="pf-stays">${glyph(b.wreck ? 'broken-skull' : 'hand-bandage', 'g--s')}${words ? ` ${b.n} stays: ${b.wreck ? 'wreck' : 'down'}` : ''}</span>`, '')).join('');
  }).join('');
  const you = ride(fr(PORTRAIT, 's', tt('You')) + wkeys.map((o) => itemFr(o, 'xs', tt(IT[o.id].name))).join(''), ['head', 'arm', 'core', 'legs', 'rear', 'pack'].map((s) => itemFr(S.worn['comm.' + s], 'xs', tt(IT[S.worn['comm.' + s].id].name))).join(''), lab('You'));
  const riders = ROLES.reduce((n, r) => n + robotsOf(r).filter((b) => !b.wreck && !b.down).length, 0);
  return `<div class="pf-manifest mk-stock"><h3>Riding down <span class="mk-typed" style="font-size:12px">you + ${riders}</span><button class="mk-btn pf-dock" data-act="dock" ${tt('Change gear: opens the Dry dock; closing it brings you back here')}>${glyph('gears', 'g--s')} Dry dock</button></h3>${you}${crewRows}
      <div style="margin-top:6px;font:12px var(--mk-mono);color:var(--mk-print)">Every robot not a wreck rides. <span class="mk-open" ${tt("Choosing who rides is Minos's open question.")}>open</span></div></div>`;
}

/** Version A: the machines against your two weapons as a grid of arrows and glyphs. */
function chartA(L) {
  const wkeys = WS.map((k) => ({ k, o: S.worn[k], it: IT[S.worn[k].id], w: WEAP[IT[S.worn[k].id].w] }));
  const head = `<tr><th></th>${wkeys.map((x) => `<th><span class="pf-wcol">${itemFr(x.o, 's', tt(`${x.it.name} (${slotLabel(x.k)})`))}${dt(x.w.type, 'dt--s')}</span></th>`).join('')}<th>Weak</th><th>Resists</th></tr>`;
  const body = L.foes.map(([name, weak, resist, art, when, ctr]) => `<tr><td><span class="pf-foe">${fr(foeSrc(art), 'm')}<span>${name}${ctr ? ` <span ${tt(`${COUNTERS[ctr].name}: punishes ${COUNTERS[ctr].punishes}`)}>${counter(ctr, 14)}</span>` : ''}${when ? `<small>${when}</small>` : ''}</span></span></td>${wkeys.map((x) => {
    const up = weak.includes(x.w.type), down = resist.includes(x.w.type);
    return `<td><span class="pf-arrow ${up ? 'up' : down ? 'down' : ''}">${up ? '▲' : down ? '▼' : '·'}</span></td>`;
  }).join('')}<td><span class="pf-dts">${weak.map((t) => dt(t, 'dt--up dt--s', `weak to ${t}: ×${WEAK}`)).join('')}</span></td><td><span class="pf-dts">${resist.map((t) => dt(t, 'dt--dn dt--s', `resists ${t}: ×${RESIST}`)).join('')}</span></td></tr>`).join('');
  return `<div><h2>${L.name} <span>Tier ${L.tier}</span></h2><div class="pf-sky"><b>${L.sky}</b>${L.twist ?? ''} <span style="margin-left:8px">${L.parts.map((p) => partFr(p, 'xs')).join(' ')}</span></div></div>
      <table class="pf-grid2">${head}${body}</table>`;
}

/** Version B: the same facts in words beside their glyphs; your weapons' multiplier on each machine. */
function chartB(L, id) {
  const sky = ANOMALIES.plain;
  const wkeys = WS.map((k) => ({ k, o: S.worn[k], it: IT[S.worn[k].id], w: WEAP[IT[S.worn[k].id].w] }));
  const dts = (list, mod, mul) => (list.length ? list.map((t) => `<span class="pf-dtw">${dt(t, `${mod} dt--s`)}${typeWord(t)} <i>×${mul}</i></span>`).join('') : '<span class="pf-none">none</span>');
  const rows = L.foes.map(([name, weak, resist, art, when, ctr]) => {
    const you = wkeys.map((x) => {
      const m = mulOf(x.w.type, weak, resist);
      return `<span class="pf-you ${m > 1 ? 'up' : m < 1 ? 'down' : ''}" ${tt(`${x.it.name}: ${typeWord(x.w.type)}, ×${m}`)}>${itemFr(x.o, 'xs')}×${m}</span>`;
    }).join('');
    const ctrLine = ctr ? `<span class="pf-ctr">${counter(ctr, 14)}<b>${COUNTERS[ctr].name}</b> punishes ${COUNTERS[ctr].punishes}; answer: ${COUNTERS[ctr].answers}</span>` : '';
    return `<div class="pf-mach">${fr(foeSrc(art), 'm')}<div class="pf-mach__who"><b>${name}</b>${when ? `<small>${when}</small>` : ''}</div>
      <div class="pf-mach__wr">${dts(weak, 'dt--up', WEAK)}</div><div class="pf-mach__wr">${dts(resist, 'dt--dn', RESIST)}</div>
      <div class="pf-mach__you">${you}</div>${ctrLine}</div>`;
  }).join('');
  return `<div><h2>${L.name} <span>Tier ${L.tier}</span></h2><p class="pf-blurb">${esc(BIOMES[id]?.blurb ?? '')}</p></div>
      <div class="pf-facts">
        <div class="pf-fact">${glyph('sun-cloud')}<b>${sky.name}</b><span>${esc(sky.blurb)}</span></div>
        ${L.twist ? `<div class="pf-fact">${glyph('stopwatch')}<b>Twist</b><span>${esc(L.twist)}.</span></div>` : ''}
        <div class="pf-fact pf-fact--parts">${glyph('gear-hammer')}<b>Parts</b>${L.parts.map((p) => `<span class="pf-part">${partFr(p, 'xs')}${esc(p)}</span>`).join('')}</div>
      </div>
      <div class="pf-machs"><div class="pf-machs__head"><span></span><span>Machine</span><span>Weak to</span><span>Resists</span><span>Your weapons</span></div>${rows}</div>`;
}

function preflightHtml() {
  const L = LANDS[S.land];
  const lands = Object.entries(LANDS).map(([id, l]) => l.locked
    ? `<div class="pf-land2 mk-stock is-locked">${fr(foe(l.boss), 'm', 'style="filter:brightness(.4)"')}<b>${l.name}</b><span class="mk-typed" style="font-size:12px">locked</span></div>`
    : `<button class="pf-land2 mk-stock${S.land === id ? ' is-sel' : ''}" data-act="land" data-land="${id}" ${tt(BIOMES[id]?.blurb ?? l.name)}>${fr(foe(l.boss), 'm')}<b>${l.name}</b><span class="mk-typed pf-land2__tier">Tier ${l.tier}</span></button>`).join('');
  const chart = CT === 'B' ? chartB(L, S.land) : chartA(L);
  return `<div class="mk-panel"><div class="mk-head"><div class="mk-plate">Course table</div><span class="mk-head__from">pre-flight</span>${gauges()}<button class="mk-btn mk-close" data-act="away"><span class="mk-key">Esc</span> Close</button></div>
    <div class="pf"><div class="pf-lands">${lands}</div>
    <div class="pf-chart pf-chart--${CT} mk-stock">${chart}</div>
    <div class="pf-crew"><div class="pf-call">Call ${['Steam barrage', 'Brass Drop', 'Steam Lance'].map((c) => `<button class="mk-btn" data-act="call" data-call="${c}" aria-pressed="${S.call === c}">${c}</button>`).join('')}</div>
      ${manifestHtml(CT === 'B')}
      <button class="mk-btn mk-btn--main pf-lower" data-act="lower"><span>Lower the lift</span><span class="mk-key">E</span></button></div></div></div>`;
}

// ---------------------------------------------------------------- the deck between, the end

function deckHtml() {
  if (PAGE === 'dock') return `<div class="mk-walk"><div class="mk-plate">On the deck</div><div class="mk-walk__btns">
    <button class="mk-btn" data-act="open" data-from="forge"><span class="mk-key">E</span> at Hob's forge</button>
    <button class="mk-btn" data-act="open" data-from="clinic"><span class="mk-key">E</span> at Gasket's clinic</button>
    <button class="mk-btn" data-act="open" data-from="bench"><span class="mk-key">E</span> at Sprocket's bench</button>
    <button class="mk-btn" data-act="open" data-from="I"><span class="mk-key">I</span> anywhere aboard</button></div></div>`;
  return `<div class="mk-walk"><div class="mk-plate">On the deck</div><div class="mk-walk__btns">
    <button class="mk-btn" data-act="table"><span class="mk-key">E</span> at the course table</button></div>
    <div class="ar-note" style="color:var(--ui-c-scene-text-dim)">The lift lever still launches in one press.</div></div>`;
}

function endHtml() {
  const f = FLOWS[S.flow];
  return `<div class="mk-end mk-stock"><h2>The lift goes down</h2><p>${S.inputs} inputs from the docking to the lift: a found gun fitted, a land picked.</p>
    <table><tr><td>This mock</td><td>${S.inputs}</td></tr><tr><td>Today (audit rows 1, 2, 12)</td><td>${f?.audit ?? '–'}</td></tr></table></div>`;
}

// ---------------------------------------------------------------- flows and counting

const FLOWS = {
  weapon: { name: 'Craft and fit a weapon', audit: '8 + scrolling', steps: [
    ["Press E at Hob's forge", (a, d) => a === 'open' && d.from === 'forge', '[data-act="open"][data-from="forge"]'],
    ["Craft & fit the Hornet's spear", (a, d) => a === 'take' && d.id === 'hornetSpear', '[data-act="take"][data-id="hornetSpear"]'],
    ['Close the dock', (a) => a === 'close', '[data-act="close"]']] },
  crew: { name: 'Crew piece to the guards', audit: '9', steps: [
    ['Press I anywhere aboard', (a, d) => a === 'open' && d.from === 'I', '[data-act="open"][data-from="I"]'],
    ['Pick the Guards on the roster', (a, d) => a === 'who' && d.who === 'guard', '[data-act="who"][data-who="guard"]'],
    ["Craft & fit the Robot hornet's head (the empty Head slot opened by itself)", (a, d) => a === 'take' && d.id === 'hornetHead', '[data-act="take"][data-id="hornetHead"]'],
    ['Close the dock', (a) => a === 'close', '[data-act="close"]']] },
  loop: { name: 'Arrival to the lift', audit: 'about 14', steps: [
    ['Fit the found Leyden arc-gun', (a, d) => a === 'haul' && d.row === 'arc' && d.what === 'fit', '[data-act="haul"][data-row="arc"][data-what="fit"]'],
    ['Fit & return: the arc-gun replaces the Steam gun', (a, d) => a === 'take' && d.id === 'arcGun', '[data-act="take"][data-id="arcGun"]'],
    ['Done', (a) => a === 'done', '[data-act="done"]'],
    ['Press E at the course table', (a) => a === 'table', '[data-act="table"]'],
    ['Pick the Hollow City', (a, d) => a === 'land' && d.land === 'city', '[data-act="land"][data-land="city"]'],
    ['Lower the lift', (a) => a === 'lower', '[data-act="lower"]']] },
};

function startFlow(id) {
  S = fresh();
  S.flow = id;
  if (PAGE === 'home') { S.view = 'arrival'; Object.assign(S.parts, { 'Piston tusk': 5, 'Long arm': 3, 'Spring haunches': 2 }); S.relics = ['fan', 'sprinkler', 'zapper']; S.stores_items.push({ id: 'arcGun', q: 'standard' }); }
  render();
}

// ---------------------------------------------------------------- actions

function openDock(from, sel = 'comm', slot = null, back = null) {
  Object.assign(S, { view: 'dock', from, sel, slot, back, tab: 'slot', toast: null, isNew: null });
}

function firstEmpty(who) {
  const s = ['head', 'arms', 'back', 'mobility'].find((x) => !S.worn[`${who}.${x}`]);
  return s ? `${who}.${s}` : null;
}

const toastOf = (o, key, was) => `${itemFr(o, 'xs')} <b>${IT[o.id].name}</b> (${qName(o.q)}) in ${slotLabel(key)}${was ? `; ${IT[was.id].name} to the stores` : ''}${key.startsWith('comm') ? '' : `; all ${robotsOf(key.split('.')[0]).length} wear it`}.`;

function take(d) {
  const key = d.key;
  const was = S.worn[key];
  let o;
  if (d.src === 'craft') {
    const r = IT[d.id].recipe;
    S.stores.scrap -= r.scrap;
    for (const [p, n] of Object.entries(r.parts ?? {})) S.parts[p] -= n;
    o = { id: d.id, q: d.id === 'hornetSpear' ? 'fine' : 'standard' };
  } else if (d.src === 'buy') {
    const s = S.shelf.splice(+d.i, 1)[0];
    S.stores.scrap -= s.price;
    o = { id: s.id, q: s.q };
  } else if (d.src === 'swap') {
    const other = WS.find((k) => k !== key);
    o = S.worn[other];
    S.worn[other] = was;
    S.worn[key] = o;
    return finish(key, `${itemFr(o, 'xs')} ${IT[o.id].name} to ${slotLabel(key)}, ${IT[was.id].name} to ${slotLabel(other)}.`);
  } else o = S.stores_items.splice(+d.i, 1)[0];
  S.worn[key] = o;
  if (was) S.stores_items.push(was);
  finish(key, toastOf(o, key, was));
}

function finish(key, msg) {
  S.toast = msg;
  S.isNew = key;
  if (S.back === 'haul') { S.haulDone.arc = 'fit'; S.view = 'arrival'; S.back = null; }
  else if (S.back === 'table') { S.view = 'preflight'; S.back = null; }
}

function act(a, d) {
  switch (a) {
    case 'open':
      if (d.from === 'forge') openDock('forge', 'comm', 'comm.primary');
      else if (d.from === 'clinic') openDock('clinic', 'repairer', null);
      else if (d.from === 'bench') openDock('bench', 'guard', firstEmpty('guard'));
      else openDock('I', 'comm', null);
      break;
    case 'who': S.sel = d.who; S.slot = d.who === 'comm' ? null : firstEmpty(d.who); S.tab = 'slot'; S.toast = null; S.isNew = null; break;
    case 'slot': S.slot = d.key; S.tab = 'slot'; S.toast = null; break;
    case 'tab': S.tab = d.tab; break;
    case 'take': take(d); break;
    case 'craft': {
      const r = IT[d.id].recipe;
      S.stores.scrap -= r.scrap;
      for (const [p, n] of Object.entries(r.parts ?? {})) S.parts[p] -= n;
      S.stores_items.push({ id: d.id, q: 'standard' });
      S.toast = `${itemFr({ id: d.id, q: 'standard' }, 'xs')} ${IT[d.id].name} made, Standard: in the stores.`;
      break;
    }
    case 'card': {
      const [, who, idx] = d.key.split('.');
      const old = who === 'comm' ? S.cards.comm[+idx] : S.cards[who];
      if (who === 'comm') S.cards.comm[+idx] = d.id; else S.cards[who] = d.id;
      S.cardsOwned = S.cardsOwned.filter((c) => c !== d.id).concat(old ? [old] : []);
      S.toast = `${CARD[d.id].name} slotted.`;
      break;
    }
    case 'relic': {
      const [, role, i] = d.key.split('.');
      const b = robotsOf(role)[+i];
      if (b.relic) S.relics.push(b.relic);
      b.relic = d.id;
      S.relics = S.relics.filter((r) => r !== d.id);
      S.toast = `${RELIC[d.id].reading} fitted to ${b.n}.`;
      if (S.back === 'haul') { S.haulDone[d.id] = 'fitrelic'; S.view = 'arrival'; S.back = null; }
      break;
    }
    case 'stoke': { const b = robotsOf(d.role)[+d.i]; b.stoked = !b.stoked; S.stores.coal += b.stoked ? -5 : 5; break; }
    case 'repair': { const b = robotsOf(d.role)[+d.i]; b.down = false; S.stores.scrap -= 15; break; }
    case 'rebuild': { const b = robotsOf(d.role)[+d.i]; b.wreck = false; S.stores.scrap -= 30; break; }
    case 'bulk':
      for (const r of ROLES) for (const b of robotsOf(r)) {
        if (d.what === 'stoke' && !b.wreck && !b.down && !b.stoked) { b.stoked = true; S.stores.coal -= 5; }
        if (d.what === 'repair' && b.down) { b.down = false; S.stores.scrap -= 15; }
        if (d.what === 'rebuild' && b.wreck) { b.wreck = false; S.stores.scrap -= 30; }
      }
      S.toast = d.what === 'stoke' ? 'Every robot that rides is stoked.' : d.what === 'repair' ? 'Repaired: they ride again.' : 'Rebuilt, ranks kept.';
      break;
    case 'promote': S.toast = 'Promote: as the workshop does it today (a pick of specs).'; break;
    case 'close': S.view = S.back === 'haul' ? 'arrival' : S.back === 'table' ? 'preflight' : 'deck'; S.back = null; break;
    case 'haul': {
      if (d.what === 'fit') { openDock('haul', 'comm', d.key, 'haul'); break; }
      if (d.what === 'fitrelic') { const [, role] = d.key.split('.'); openDock('haul', role, d.key, 'haul'); break; }
      if (d.what === 'church') break;
      if (d.what === 'repair') { robotsOf('repairer')[0].down = false; S.stores.scrap -= 15; }
      if (d.what === 'rebuild') { robotsOf('mule')[0].wreck = false; S.stores.scrap -= 30; }
      if (d.what === 'sell' || d.what === 'salvage') S.stores.scrap += HAUL.find((h) => h.key === d.row).left[2];
      S.haulDone[d.row] = d.what;
      break;
    }
    case 'done': S.view = 'deck'; break;
    case 'table': S.view = 'preflight'; S.land = 'jungle'; break;
    case 'land': S.land = d.land; break;
    case 'dock': openDock('table', 'comm', null, 'table'); break;
    case 'call': S.call = d.call; break;
    case 'away': S.view = 'deck'; break;
    case 'lower': S.view = 'end'; break;
  }
}

// ---------------------------------------------------------------- render, tooltips

const stage = document.querySelector('.stage');
const ui = document.getElementById('ui');
const tipEl = Object.assign(document.createElement('div'), { className: 'tip', hidden: true });
stage.append(tipEl);

function render() {
  TIPS = {};
  tipN = 0;
  tipEl.hidden = true;
  document.querySelector('.mk-deck').classList.toggle('is-clear', S.view === 'deck');
  ui.innerHTML = S.view === 'dock' ? dockHtml() : S.view === 'arrival' ? arrivalHtml() : S.view === 'preflight' ? preflightHtml() : S.view === 'end' ? endHtml() : deckHtml();
  const f = FLOWS[S.flow];
  const step = f?.steps[S.step];
  if (step) ui.querySelector(step[2])?.classList.add('is-next');
  document.querySelector('.mk-chrome__step').innerHTML = f ? (step ? `Step ${S.step + 1} of ${f.steps.length}: <b>${step[0]}</b>` : `<b>Flow done.</b> ${f.name}.`) : 'Free play: click anything.';
  document.querySelector('.mk-chrome__count').innerHTML = `inputs <b>${S.inputs}</b>${f ? ` <em>today: ${f.audit}</em>` : ''}`;
  document.querySelectorAll('[data-flow]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.flow === (S.flow ?? 'free'))));
}

function showTip(el) {
  const html = el.dataset.tip ? TIPS[el.dataset.tip] : esc(el.dataset.tt);
  if (!html) return;
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  const s = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), k = s.width / 1280;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = (r.left - s.left) / k, y = (r.bottom - s.top) / k + 6;
  // Right of centre (the drawer): beside the thing, to its left, so the list stays readable.
  if (x > 800) { x = x - w - 10; y = (r.top - s.top) / k; }
  if (x + w > 1270) x = 1270 - w;
  if (y + h > 712) y = (r.top - s.top) / k - h - 6;
  tipEl.style.left = `${Math.max(8, x)}px`;
  tipEl.style.top = `${Math.max(8, y)}px`;
}
ui.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-tt], [data-tip]');
  if (el) showTip(el);
  else tipEl.hidden = true;
});
ui.addEventListener('mouseleave', () => (tipEl.hidden = true));

ui.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const a = el.dataset.act, d = el.dataset;
  S.inputs++;
  const f = FLOWS[S.flow];
  const step = f?.steps[S.step];
  act(a, d);
  if (step && step[1](a, d)) S.step++;
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  ui.querySelector('[data-act="close"], [data-act="away"]')?.click();
});

const setCt = (v) => {
  CT = v;
  document.querySelectorAll('[data-ct]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ct === v)));
  render();
};
const setTint = (on) => {
  document.body.classList.toggle('tint', on);
  document.querySelector('[data-tint]')?.setAttribute('aria-pressed', String(on));
};
document.querySelector('.mk-chrome').addEventListener('click', (e) => {
  if (e.target.closest('[data-tint]')) return setTint(!document.body.classList.contains('tint'));
  const ct = e.target.closest('[data-ct]');
  if (ct) return setCt(ct.dataset.ct);
  const b = e.target.closest('[data-flow]');
  if (b) startFlow(b.dataset.flow === 'free' ? null : b.dataset.flow);
});

function fit() {
  const wrap = document.querySelector('.mk-fit');
  const s = Math.min(innerWidth / 1280, (innerHeight - 44) / 720);
  stage.style.transform = `scale(${s})`;
  wrap.style.width = 1280 * s + 'px';
  wrap.style.height = 720 * s + 'px';
}
addEventListener('resize', fit);
fit();

// For screenshots and tests from the pane.
window.mock = {
  get S() { return S; },
  act: (a, d = {}) => { S.inputs++; const f = FLOWS[S.flow]; const st2 = f?.steps[S.step]; act(a, d); if (st2 && st2[1](a, d)) S.step++; render(); },
  start: startFlow,
  tint: setTint,
  ct: setCt,
  tip: (sel) => { const el = ui.querySelector(sel); if (el) showTip(el); return !!el; },
};
// Dev only: save the stage as a PNG through the capture endpoint (games/proto-ld60-machinerra/capture/<name>.png).
window.mock.shot = async (name) => {
  const m = await import(/* @vite-ignore */ '/node_modules/html-to-image/es/index.js');
  await document.fonts.ready;
  const svg = await m.toSvg(stage, { width: 1280, height: 720, style: { transform: 'none' } });
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = svg; });
  const c = document.createElement('canvas');
  c.width = 1280; c.height = 720;
  c.getContext('2d').drawImage(img, 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const r = await fetch(`/__capture/save?path=games/proto-ld60-machinerra/capture/${name}.png`, { method: 'POST', body: blob });
  return (await r.json()).path;
};

setTint(true);
await loadArt();
startFlow(PAGE === 'home' ? 'loop' : 'weapon');
window.mock.ready = true;
