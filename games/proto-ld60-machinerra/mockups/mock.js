// Machinerra management mockups: the Dry dock, and Arrival -> Pre-flight. Static data, clickable states, not wired into the game.
// Names and numbers are the game's (src/sim/gear.ts ITEMS, src/sim/defs/comm.ts WEAPONS, src/sim/defs/foes.ts FOES, src/sim/junk.ts
// RELICS, src/hub/research.ts CARDS, src/hub/workshop.ts); the save they describe (who owns what) is made up.
import { holesSvg, pcClass, pcStyle, STOCK } from '../src/hub/punchcard.ts';

// ---------------------------------------------------------------- data

const Q = { standard: ['Standard', 1], fine: ['Fine', 1.15], rare: ['Rare', 1.3] };
const ROLES = ['gatherer', 'guard', 'repairer', 'mule'];
const BOT = (slot) => ROLES.map((r) => `${r}.${slot}`);
const WS = ['comm.primary', 'comm.secondary'];

const WEAP = {
  pipeWrench: { type: 'impact', dmg: 14, rate: 0.55, reach: 50 },
  shovel: { type: 'impact', dmg: 9, rate: 0.42, reach: 48 },
  hornetSpear: { type: 'pierce', dmg: 24, rate: 0.95, reach: 96 },
  tazer: { type: 'shock', dmg: 7, rate: 0.3, reach: 42, chains: true, note: 'arcs to the next two foes' },
  steamGun: { type: 'pierce', dmg: 10, rate: 0.2, range: 420 },
  arcGun: { type: 'shock', dmg: 8, rate: 0.26, range: 380, chains: true, note: 'bolts jump to the next foe' },
  rivetScatter: { type: 'pierce', dmg: 5, rate: 0.7, range: 260, note: 'five rivets a shot' },
  slingshot: { type: 'impact', dmg: 6, rate: 0.3, range: 380, note: 'shoots your scrap; bounces' },
  pistonCannon: { type: 'impact', dmg: 22, rate: 0.6, range: 420 },
};

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
  twistedWrench: { name: 'Twisted Pipe wrench', w: 'pipeWrench', fits: WS, note: 'a night piece: a twisted part and a Dark rider' },

  kettleHelm: { name: 'Kettle helm', fits: ['comm.head'], stats: { armour: 6, steam: 15 }, recipe: { scrap: 35 } },
  hornetHead: { name: "Robot hornet's head", fits: ['comm.head', ...BOT('head')], stats: { armour: 8 }, note: 'plain hornets take the wearer for one of theirs', recipe: { scrap: 20, parts: { 'Mechahornet head': 3 } } },
  monocle: { name: "Grandpa's targeting monocle", fits: ['comm.head'], stats: { crit: 10, range: 10 }, recipe: { scrap: 30, parts: { 'Obsession optics': 1 } } },
  pistonFist: { name: 'Piston fist', fits: ['comm.arm'], stats: { meleeDmg: 25, knock: 40 }, recipe: { scrap: 45 } },
  gatlingCuff: { name: 'Gatling cuff', fits: ['comm.arm'], stats: { atkSpeed: 20, rangedDmg: 5 }, recipe: { scrap: 40, parts: { 'Mechahornet stinger': 1 } } },
  leechGauntlet: { name: 'Leech-mouth gauntlet', fits: ['comm.arm', ...BOT('arms')], stats: { meleeDmg: 5 }, note: 'melee hits drink oil back', recipe: { scrap: 30, parts: { 'Leech mouth': 3 } } },
  bellowsLungs: { name: 'Bellows lungs', fits: ['comm.core'], stats: { steam: 40, steamRegen: 20 }, recipe: { scrap: 60 } },
  boilerCorset: { name: 'Boilerplate corset', fits: ['comm.core'], stats: { armour: 18, speed: -10 }, recipe: { scrap: 45 } },
  gasketHeart: { name: 'Gasket heart', fits: ['comm.core'], stats: { oil: 30 }, recipe: { scrap: 80 } },
  brassShins: { name: 'Brass shins', fits: ['comm.legs'], stats: { speed: 10 }, recipe: { scrap: 25 } },
  magBoots: { name: 'Mag-boots', fits: ['comm.legs'], stats: { armour: 8, speed: -5 }, recipe: { scrap: 35 } },
  pressureVent: { name: 'Posterior Pressure Vent', fits: ['comm.rear'], stats: { speed: 5, steam: -10 }, note: 'Dash', recipe: { scrap: 30 } },
  afterburner: { name: 'Afterburner exhaust', fits: ['comm.rear'], note: 'Afterburner dash: foes it passes take 14', recipe: { scrap: 80, parts: { 'Mechahornet wings': 1 } } },
  antenna: { name: 'The support antenna', fits: ['comm.pack'], stats: { armour: 6, steamRegen: 15 }, note: 'Call the Brass Guard', recipe: { scrap: 60, parts: { 'Mechahornet head': 2 } } },
  whistle: { name: 'Boiler whistle', fits: ['comm.pack'], note: 'Boiler Whistle: 16 damage and a shove round you', recipe: { scrap: 55 } },
  scrapMagnet: { name: 'Scrap magnet', fits: ['comm.pack'], stats: { magnet: 100 }, recipe: { scrap: 30 } },

  rivetRepeater: { name: 'Rivet repeater', fits: ['guard.arms'], stats: { dmg: 30, range: 20 }, recipe: { scrap: 35, parts: { 'Mechahornet stinger': 1 } } },
  autoloader: { name: 'Clockwork autoloader', fits: ['guard.arms'], stats: { atkSpeed: 35 }, recipe: { scrap: 40 } },
  stingerBayonet: { name: 'Stinger bayonet', fits: ['guard.arms'], stats: { dmg: 15 }, recipe: { scrap: 35, parts: { 'Mechahornet stinger': 2 } } },
  riotBadge: { name: 'Riot badge', fits: ['guard.head'], stats: { armour: 8, plating: 2 }, recipe: { scrap: 35, parts: { Badge: 2 } } },
  scrapPlating: { name: 'Scrap plating', fits: BOT('back'), stats: { armour: 12, speed: -8 }, recipe: { scrap: 20 } },
  boilerHalo: { name: 'Boiler halo', fits: BOT('back'), note: 'armour +10% to allies within 120 px', recipe: { scrap: 45 } },
  lampOfFaith: { name: 'Lamp of Faith', fits: BOT('back'), note: 'damage +15% to allies within 120 px', recipe: { scrap: 65 } },
  tankTreads: { name: 'Tank treads', fits: BOT('mobility'), stats: { armour: 8, speed: -15 }, recipe: { scrap: 25 } },
  pramWheels: { name: 'Pram wheels', fits: BOT('mobility'), stats: { speed: 20 }, recipe: { scrap: 20 } },
  wingRig: { name: 'Hornet wing rig', fits: BOT('mobility'), stats: { speed: 30, oil: -20 }, recipe: { scrap: 35, parts: { 'Mechahornet wings': 2 } } },
  dowsingEyes: { name: 'Crawlcam dowsing eyes', fits: ['gatherer.head'], stats: { gather: 35 }, recipe: { scrap: 30, parts: { 'Crawlcam lens cluster': 1, 'Mechahornet head': 1 } } },
  deepHose: { name: 'Deep hose', fits: ['gatherer.arms'], stats: { gather: 50 }, recipe: { scrap: 35 } },
  tuskBore: { name: 'Tusk bore', fits: ['gatherer.arms'], stats: { gather: 45 }, recipe: { scrap: 30, parts: { 'Piston tusk': 2 } } },
  wideNozzle: { name: 'Wide nozzle', fits: ['repairer.arms'], stats: { repair: 40 }, recipe: { scrap: 35 } },
  grabbers: { name: 'Long-arm grabbers', fits: ['mule.arms'], stats: { magnet: 80 }, recipe: { scrap: 30, parts: { 'Long arm': 2 } } },
};

const STATN = {
  dmg: 'Damage', meleeDmg: 'Melee damage', rangedDmg: 'Ranged damage', atkSpeed: 'Attack speed', crit: 'Critical', armour: 'Armour',
  oil: 'Max oil', speed: 'Speed', steam: 'Max steam', steamRegen: 'Steam regen', range: 'Range', knock: 'Knockback', gather: 'Work rate',
  repair: 'Repair rate', magnet: 'Loot pull', plating: 'Plating',
};
const PTS = new Set(['oil', 'steam', 'plating']);

const RELIC = {
  toaster: { item: 'toaster', reading: 'Twin-barrel bread cannon', effect: 'every 3 s, two hot slugs: 14 Impact each', flaw: 'takes a quarter more damage' },
  smartphone: { item: 'smartphone', reading: 'Brain of a thousand voices', effect: 'clears fog and marks loot within 15 tiles', flaw: 'says it is "scrolling"' },
  fan: { item: 'desk fan', reading: 'Prayer wheel', effect: 'immune to aura slow; robots near it take half aura burn', flaw: 'draws hornets from farther' },
  sprinkler: { item: 'garden sprinkler', reading: 'The Rain-maker', effect: 'wets everything within 100 px every 5 s', flaw: 'wets your crew too' },
  zapper: { item: 'bug-zapper racket', reading: 'The Lightning Paddle', effect: 'melee swat: 12 Shock, flyers take triple', flaw: 'zaps its bearer when Wet' },
};

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
const LANDS = {
  desert: { name: 'Desert', tier: 'I', sky: 'Plain Sky', skyText: 'Nothing odd about the weather.', twist: null,
    foes: [['Mechahornet', ['shock'], ['impact', 'dark']], ['Crawlcam', ['impact'], ['pierce', 'dark']], ['The Hornet Queen', ['shock'], ['impact', 'dark'], 'holds the land']],
    counters: [['Thorns', 'Carapace Mechahornet', 'punishes attack-speed stacking']], parts: 'Mechahornet head, stinger, wings; Crawlcam lens cluster, legs' },
  jungle: { name: 'Rustwood Jungle', tier: 'II', sky: 'Plain Sky', skyText: 'Nothing odd about the weather.', twist: 'Rain each part of the day: everything Wet.',
    foes: [['Pounce-cat', ['impact'], ['pierce']], ['Ramjet boar', ['shock'], ['impact']], ['Spanner monkey', ['impact'], []], ['The Ironback', ['shock'], ['impact'], 'at dusk']],
    counters: [], parts: 'Spring haunches, Piston tusk, Long arm' },
  city: { name: 'Hollow City', tier: 'III', sky: 'Plain Sky', skyText: 'Nothing odd about the weather.', twist: 'Rush hours: a calm crowd that turns when bumped or hit.',
    foes: [['Commuter', ['impact'], ['shock']], ['Officer unit', ['scald'], ['shock'], null, 'Grounded'], ['Carousel charger', ['pierce'], ['impact']], ['Sir Lancelot-9', ['impact'], ['pierce'], 'at dusk']],
    counters: [['Grounded', 'Officer unit', 'punishes Shock chains']], parts: 'Briefcase, Badge, Destrier legs' },
  frost: { name: 'Frostspine', locked: true },
};

const fresh = () => ({
  view: 'deck', from: null, back: null, sel: 'comm', slot: null, tab: 'slot', toast: null, isNew: null, inputs: 0, step: 0, flow: null,
  land: 'jungle', call: 'Steam barrage', haulDone: {}, fixed: false,
  stores: { scrap: 2590, copper: 540, coal: 62 },
  parts: { 'Mechahornet head': 7, 'Mechahornet stinger': 6, 'Mechahornet wings': 4, 'Crawlcam lens cluster': 2, 'Obsession optics': 0, Badge: 0, 'Destrier legs': 0, 'Leech mouth': 0, 'Piston tusk': 1, 'Long arm': 0, 'Spring haunches': 0 },
  worn: {
    'comm.primary': { id: 'pipeWrench', q: 'standard' }, 'comm.secondary': { id: 'steamGun', q: 'standard' },
    'comm.head': { id: 'kettleHelm', q: 'standard' }, 'comm.arm': { id: 'pistonFist', q: 'fine' }, 'comm.core': { id: 'bellowsLungs', q: 'standard' },
    'comm.legs': { id: 'brassShins', q: 'standard' }, 'comm.rear': { id: 'pressureVent', q: 'standard' }, 'comm.pack': { id: 'antenna', q: 'standard' },
    'gatherer.head': { id: 'dowsingEyes', q: 'standard' }, 'gatherer.arms': { id: 'deepHose', q: 'fine' }, 'gatherer.mobility': { id: 'pramWheels', q: 'standard' },
    'guard.arms': { id: 'rivetRepeater', q: 'standard' }, 'guard.back': { id: 'scrapPlating', q: 'standard' }, 'guard.mobility': { id: 'tankTreads', q: 'standard' },
    'repairer.arms': { id: 'wideNozzle', q: 'standard' },
  },
  stores_items: [{ id: 'pipeWrench', q: 'fine' }, { id: 'shovel', q: 'standard' }, { id: 'stingerBayonet', q: 'fine' }, { id: 'magBoots', q: 'standard' }, { id: 'boilerCorset', q: 'standard' }, { id: 'scrapMagnet', q: 'standard' }],
  shelf: [{ id: 'twistedWrench', q: 'rare', price: 115 }, { id: 'leechGauntlet', q: 'rare', price: 125 }],
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
const PAGE = document.body.dataset.page;

// ---------------------------------------------------------------- helpers

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r1 = (v) => Math.round(v * 10) / 10;
const qName = (q) => Q[q][0];
const qMul = (q) => Q[q][1];
const slotLabel = (key) => SLOT_NAME[key.split('.')[1]];
const partsTotal = () => 230 + Object.values(S.parts).reduce((a, b) => a + b, 0);
const robotsOf = (role) => S.crew[role];

function canPay(recipe) {
  if (S.stores.scrap < recipe.scrap) return false;
  return Object.entries(recipe.parts ?? {}).every(([p, n]) => (S.parts[p] ?? 0) >= n);
}

/** The compare lines of an item (at quality q) against what the slot wears now. */
function compare(id, q, key) {
  const d = IT[id];
  const cur = S.worn[key];
  const out = [];
  const delta = (a, b, unit = '', dp = 0) => {
    const dv = dp ? r1(a - b) : Math.round(a - b);
    if (!cur || dv === 0) return '';
    return ` <span class="${dv > 0 ? 'up' : 'down'}">${dv > 0 ? '▲' : '▼'}${Math.abs(dv)}${unit}</span>`;
  };
  if (d.w) {
    const w = WEAP[d.w], m = qMul(q);
    const cw = cur && IT[cur.id].w ? WEAP[IT[cur.id].w] : null, cm = cur ? qMul(cur.q) : 1;
    const hit = w.dmg * m, ps = (w.dmg * m) / w.rate;
    out.push(`<span>${w.type}${cw && cw.type !== w.type ? ` <span class="down">(was ${cw.type})</span>` : ''}</span>`);
    out.push(`<span>Hit ${r1(hit)}${cw ? delta(hit, cw.dmg * cm, '', 1) : ''}</span>`);
    out.push(`<span>Per s ${r1(ps)}${cw ? delta(ps, (cw.dmg * cm) / cw.rate, '', 1) : ''}</span>`);
    if (w.reach) out.push(`<span>Reach ${w.reach}${cw?.reach ? delta(w.reach, cw.reach) : cw ? ' (melee)' : ''}</span>`);
    else out.push(`<span>Range ${w.range}${cw?.range ? delta(w.range, cw.range) : cw ? ' (gun)' : ''}</span>`);
    return out.join('');
  }
  const a = d.stats ?? {}, b = cur ? IT[cur.id].stats ?? {} : {};
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) {
    const av = Math.round((a[k] ?? 0) * (a[k] > 0 ? qMul(q) : 1)), bv = Math.round((b[k] ?? 0) * (b[k] > 0 && cur ? qMul(cur.q) : 1));
    const unit = PTS.has(k) ? '' : '%';
    const dv = av - bv;
    out.push(`<span>${STATN[k]} ${av > 0 ? '+' : ''}${av}${unit}${dv ? ` <span class="${dv > 0 ? 'up' : 'down'}">${dv > 0 ? '▲' : '▼'}${Math.abs(dv)}</span>` : ''}</span>`);
  }
  return out.join('') || '<span>no stats</span>';
}

/** What a weapon meets on a land: the machines weak to it and those that resist it. */
function meets(wid, land) {
  const t = WEAP[wid].type;
  const L = LANDS[land];
  return { up: L.foes.filter((f) => f[1].includes(t)).map((f) => f[0]), down: L.foes.filter((f) => f[2].includes(t)).map((f) => f[0]) };
}

/** The flags on a land for what the Communicator carries. Guess (open): a weapon flags when more of the land's machines resist it than are weak to it, or when it chains and the land has Grounded machines. */
function flagsFor(land) {
  const out = [];
  for (const key of WS) {
    const cur = S.worn[key];
    const wid = IT[cur.id].w;
    const { up, down } = meets(wid, land);
    const name = IT[cur.id].name;
    if (down.length > up.length) out.push({ key, text: `Your ${name} (${slotLabel(key)}) deals ${WEAP[wid].type}: ${down.join(' and ')} resist it, ${up.length ? up.join(', ') + ' fear it' : 'nothing here fears it'}.` });
    const grounded = LANDS[land].foes.filter((f) => f[4] === 'Grounded').map((f) => f[0]);
    if (WEAP[wid].chains && grounded.length) out.push({ key, text: `${grounded.join(', ')}: Grounded. The ${name}'s Shock chains stop at them.` });
  }
  return out;
}

// ---------------------------------------------------------------- the dock

const PLATES = {
  comm: [['head', 0, 4, 228, 72], ['arm', 0, 86, 202, 150], ['core', 0, 168, 222, 170], ['legs', 0, 250, 240, 262],
    ['primary', 356, 4, 320, 192], ['secondary', 356, 86, 292, 206], ['rear', 356, 168, 304, 218], ['pack', 356, 250, 312, 140]],
  guard: [['head', 0, 20, 228, 50], ['back', 0, 176, 204, 128], ['arms', 356, 20, 330, 140], ['mobility', 356, 176, 306, 200]],
  bot: [['head', 0, 20, 238, 50], ['arms', 0, 176, 182, 168], ['back', 356, 20, 318, 112], ['mobility', 356, 176, 302, 196]],
};
const PW = 160, PH = 68;

const FIG = {
  comm: `<g class="dk-fig" fill="rgba(233,217,169,0.65)" stroke="#2c1f13" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <line x1="258" y1="52" x2="272" y2="16"/><circle cx="273" cy="13" r="4" fill="#2c1f13"/>
    <rect x="312" y="112" width="18" height="64" rx="4" fill="url(#hatch)"/>
    <polyline points="222,112 200,150 196,186" style="stroke-width:14"/><polyline points="222,112 200,150 196,186" style="stroke:#e9d9a9;stroke-width:9"/>
    <polyline points="294,112 316,150 320,186" style="stroke-width:14"/><polyline points="294,112 316,150 320,186" style="stroke:#e9d9a9;stroke-width:9"/>
    <circle cx="196" cy="192" r="8"/><circle cx="320" cy="192" r="8"/>
    <rect x="228" y="52" width="60" height="44" rx="10"/><circle cx="258" cy="74" r="11"/><circle cx="258" cy="74" r="4" fill="#2c1f13"/>
    <rect x="250" y="96" width="16" height="8"/>
    <rect x="222" y="104" width="72" height="92" rx="12"/><circle cx="258" cy="138" r="13"/><line x1="258" y1="138" x2="266" y2="131" stroke-width="1.2" fill="none"/>
    <circle cx="232" cy="114" r="2" fill="#2c1f13"/><circle cx="284" cy="114" r="2" fill="#2c1f13"/><circle cx="232" cy="186" r="2" fill="#2c1f13"/><circle cx="284" cy="186" r="2" fill="#2c1f13"/>
    <line x1="236" y1="166" x2="280" y2="166" stroke-width="1.2" fill="none"/><line x1="236" y1="174" x2="280" y2="174" stroke-width="1.2" fill="none"/>
    <rect x="232" y="196" width="52" height="16" rx="3"/><rect x="298" y="210" width="14" height="10" rx="2"/>
    <polyline points="244,212 240,250 242,290" style="stroke-width:14"/><polyline points="244,212 240,250 242,290" style="stroke:#e9d9a9;stroke-width:9"/>
    <polyline points="272,212 276,250 274,290" style="stroke-width:14"/><polyline points="272,212 276,250 274,290" style="stroke:#e9d9a9;stroke-width:9"/>
    <rect x="226" y="288" width="28" height="12" rx="3"/><rect x="262" y="288" width="28" height="12" rx="3"/>
  </g>`,
  guard: `<g class="dk-fig" fill="rgba(233,217,169,0.65)" stroke="#2c1f13" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <rect x="198" y="80" width="16" height="80" rx="3" fill="url(#hatch)"/>
    <rect x="170" y="96" width="44" height="14" rx="2"/><rect x="164" y="93" width="8" height="20" rx="2"/>
    <polyline points="302,100 330,138" style="stroke-width:12"/><polyline points="302,100 330,138" style="stroke:#e9d9a9;stroke-width:7"/>
    <circle cx="338" cy="152" r="20" style="stroke-dasharray:4 3;stroke-width:3"/><circle cx="338" cy="152" r="6" fill="#2c1f13"/>
    <path d="M226 70 V52 a32 32 0 0 1 64 0 V70 Z"/><rect x="236" y="44" width="44" height="10" rx="2" fill="#2c1f13"/>
    <rect x="214" y="70" width="88" height="100" rx="8"/>
    <line x1="228" y1="90" x2="288" y2="90" stroke-width="1.2" fill="none"/><line x1="228" y1="100" x2="288" y2="100" stroke-width="1.2" fill="none"/><line x1="228" y1="110" x2="288" y2="110" stroke-width="1.2" fill="none"/>
    <circle cx="222" cy="78" r="2" fill="#2c1f13"/><circle cx="294" cy="78" r="2" fill="#2c1f13"/><circle cx="222" cy="162" r="2" fill="#2c1f13"/><circle cx="294" cy="162" r="2" fill="#2c1f13"/>
    <rect x="206" y="176" width="104" height="42" rx="20"/>
    <circle cx="228" cy="197" r="12"/><circle cx="258" cy="197" r="12"/><circle cx="288" cy="197" r="12"/>
  </g>`,
  bot: `<g class="dk-fig" fill="rgba(233,217,169,0.65)" stroke="#2c1f13" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
    <rect x="300" y="84" width="18" height="66" rx="5" fill="url(#hatch)"/>
    <path d="M216 100 C 180 110, 196 150, 180 172" style="stroke-width:12;fill:none"/><path d="M216 100 C 180 110, 196 150, 180 172" style="stroke:#e9d9a9;stroke-width:7;fill:none"/>
    <rect x="170" y="168" width="20" height="12" rx="2"/>
    <rect x="238" y="34" width="40" height="32" rx="6"/><circle cx="250" cy="50" r="5"/><circle cx="266" cy="50" r="5"/>
    <rect x="216" y="70" width="84" height="98" rx="30"/><line x1="218" y1="100" x2="298" y2="100" stroke-width="1.2" fill="none"/><line x1="218" y1="138" x2="298" y2="138" stroke-width="1.2" fill="none"/>
    <line x1="232" y1="170" x2="284" y2="170"/>
    <circle cx="232" cy="190" r="20"/><circle cx="232" cy="190" r="5" fill="#2c1f13"/><circle cx="284" cy="190" r="20"/><circle cx="284" cy="190" r="5" fill="#2c1f13"/>
  </g>`,
};

function plateKey(who, slot) { return `${who}.${slot}`; }

function slotHtml(who, [slot, x, y, ax, ay]) {
  const key = plateKey(who, slot);
  const cur = S.worn[key];
  const flag = S.back === 'table' && S.fixKey === key && !S.fixed;
  const item = cur ? `${esc(IT[cur.id].name)} <span class="dk-slot__q">${qName(cur.q)}</span>` : 'empty';
  return `<button class="dk-slot mk-plate${S.slot === key ? ' is-sel' : ''}${flag ? ' is-flag' : ''}${S.isNew === key ? ' is-new' : ''}" style="left:${x}px;top:${y}px;width:${PW}px;height:${PH}px" data-act="slot" data-key="${key}">
    <span class="dk-slot__label">${SLOT_NAME[slot]}</span><span class="dk-slot__item${cur ? '' : ' is-empty'}">${item}</span></button>`;
}

function leaders(plates) {
  return plates.map(([slot, x, y, ax, ay]) => {
    const sx = x === 0 ? PW : x, sy = y + PH / 2;
    return `<path d="M${sx} ${sy} L${ax} ${ay}" fill="none" stroke="#43321f" stroke-width="1.1"/><circle cx="${ax}" cy="${ay}" r="3" fill="#43321f"/>`;
  }).join('');
}

function cardHtml(id, label, key, extra = '') {
  if (!id) return `<div class="dk-cardslot${S.slot === key ? ' is-sel' : ''}" data-act="slot" data-key="${key}" ${extra}><div class="dk-cardslot__label">${label}</div>
    <div class="pc pc--sm pc--empty">${STOCK}<span class="pc__head"><span class="pc__name">Empty pocket</span><span class="pc__tag">a card fits here</span></span></div></div>`;
  const c = { id, pool: CARD[id].pool };
  return `<div class="dk-cardslot${S.slot === key ? ' is-sel' : ''}" data-act="slot" data-key="${key}" ${extra}><div class="dk-cardslot__label">${label}</div>
    <div class="${pcClass(c, 'sm')}" ${pcStyle(c)}>${STOCK}<span class="pc__head"><span class="pc__name">${CARD[id].name}</span><span class="pc__tag">${CARD[id].tag}</span></span>${holesSvg(id)}</div></div>`;
}

function botTag(role, b, i) {
  const relicKey = `relic.${role}.${i}`;
  const relic = b.relic ? `<i>Relic:</i> ${RELIC[b.relic].reading} <i>(a ${RELIC[b.relic].item})</i>` : '<i>Relic socket: empty</i>';
  let acts;
  if (b.wreck) acts = `<button class="mk-btn mk-btn--main" data-act="rebuild" data-role="${role}" data-i="${i}">Rebuild <small>30 scrap, 1 part</small></button>`;
  else if (b.down) acts = `<button class="mk-btn mk-btn--main" data-act="repair" data-role="${role}" data-i="${i}">Repair <small>15 scrap</small></button>`;
  else acts = `<button class="mk-btn${b.stoked ? ' is-on' : ''}" data-act="stoke" data-role="${role}" data-i="${i}">${b.stoked ? 'Stoked' : 'Stoke'} <small>5 coal</small></button><button class="mk-btn" data-act="promote">Promote</button>`;
  const stamp = b.wreck ? '<span class="mk-stamp mk-stamp--red">Wreck</span>' : b.down ? '<span class="mk-stamp mk-stamp--red">Down</span>' : '';
  return `<div class="dk-bot${b.wreck ? ' is-wreck' : ''}"><div class="dk-bot__name">${b.n}</div>
    <div class="dk-bot__rank">${RANKS[b.rank]}${b.spec ? `, ${b.spec}` : ''}</div>
    <div><button class="dk-bot__relic${S.slot === relicKey ? ' is-sel' : ''}" data-act="slot" data-key="${relicKey}">${relic}</button></div>
    <div class="dk-bot__acts">${acts}</div>${stamp}</div>`;
}

function rosterHtml() {
  const who = (id, name, n, state, cls = '') => `<button class="dk-who mk-stock${S.sel === id ? ' is-sel' : ''}${cls}" data-act="who" data-who="${id}">
    <span class="dk-who__name">${name}</span><span class="dk-who__n">${n}</span><span class="dk-who__state">${state}</span></button>`;
  const rows = [who('comm', 'Communicator', '', 'you, 8 slots, 3 cards', ' dk-who--you'), '<div class="dk-roster__sep"></div>'];
  let cold = 0, down = 0, wreck = 0;
  for (const r of ROLES) {
    const bots = robotsOf(r);
    const st = [];
    const c = bots.filter((b) => !b.wreck && !b.down && !b.stoked).length;
    const d = bots.filter((b) => b.down).length, w = bots.filter((b) => b.wreck).length;
    cold += c; down += d; wreck += w;
    if (w) st.push(`<span class="down">${w} wreck</span>`);
    if (d) st.push(`<span class="down">${d} down</span>`);
    if (c) st.push(`${c} not stoked`);
    const empty = ['head', 'arms', 'back', 'mobility'].filter((s) => !S.worn[`${r}.${s}`]);
    if (empty.length === 1) st.push(`${SLOT_NAME[empty[0]].toLowerCase()} empty`);
    else if (empty.length) st.push(`${empty.length} slots empty`);
    rows.push(who(r, ROLE_NAME[r][1], `×${bots.length}`, st.join(', '), d || w ? ' is-hurt' : ''));
  }
  rows.push(`<div class="dk-roster__bulk">
    <button class="mk-btn" data-act="bulk" data-what="stoke"${cold ? '' : ' disabled'}><span>Stoke all ${cold}</span><small>${cold * 5} coal</small></button>
    <button class="mk-btn" data-act="bulk" data-what="repair"${down ? '' : ' disabled'}><span>Repair all ${down}</span><small>${down * 15} scrap</small></button>
    <button class="mk-btn" data-act="bulk" data-what="rebuild"${wreck ? '' : ' disabled'}><span>Rebuild all ${wreck}</span><small>${wreck * 30} scrap, ${wreck} part</small></button>
    <div class="dk-roster__hint">Every robot that is not a wreck rides the lift.</div></div>`);
  return `<div class="dk-roster">${rows.join('')}</div>`;
}

function sheetHtml() {
  const who = S.sel;
  if (who === 'comm') {
    const plates = PLATES.comm;
    const cards = S.cards.comm.map((id, i) => cardHtml(id, `Card slot ${i + 1}`, `card.comm.${i}`)).join('');
    return `<div class="dk-sheet mk-stock"><div class="dk-title"><b>The Communicator</b>fig. 1, as worn</div><div class="dk-doll"><svg viewBox="0 0 516 330"><defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#2c1f13" stroke-width="1"/></pattern></defs>${FIG.comm}${leaders(plates)}</svg>${plates.map((p) => slotHtml('comm', p)).join('')}</div>
      <div class="dk-under"><span class="dk-under__label">your punch cards and chassis</span><div class="dk-cards">${cards}</div>
      <div class="dk-chassis"><h4>Chassis</h4><div class="row"><span>Oil tank</span><span>1 of 3</span></div><div class="row"><span>Boiler</span><span>0 of 3</span></div><div class="row"><span>Riveted plating</span><span>2 of 3</span></div><div class="row"><span>Leg pistons</span><span>1 of 3</span></div></div></div>
      </div>`;
  }
  const fig = who === 'guard' ? 'guard' : 'bot';
  const plates = PLATES[fig];
  const bots = robotsOf(who);
  const n = bots.length;
  return `<div class="dk-sheet mk-stock"><div class="dk-title"><b>${ROLE_NAME[who][0]}</b>type sheet: all ${n} wear this gear</div><div class="dk-doll"><svg viewBox="0 0 516 330"><defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#2c1f13" stroke-width="1"/></pattern></defs>${FIG[fig]}${leaders(plates)}</svg>
      ${plates.map((p) => slotHtml(who, p)).join('')}
      <div style="position:absolute;left:166px;top:248px;width:184px">${cardHtml(S.cards[who], 'Type card', `card.${who}`)}</div></div>
    <div class="dk-under"><span class="dk-under__label">each ${ROLE_NAME[who][0].toLowerCase()}: rank, relic and stoke are its own</span>${bots.map((b, i) => botTag(who, b, i)).join('')}</div>
</div>`;
}

/** The drawer's tags for a gear slot: owned, craftable, buyable. */
function slotEntries(key) {
  const owned = [], craft = [], buy = [];
  S.stores_items.forEach((o, i) => { if (IT[o.id].fits.includes(key)) owned.push({ ...o, src: 'owned', i }); });
  if (WS.includes(key)) {
    const other = WS.find((k) => k !== key);
    const o = S.worn[other];
    if (o) owned.push({ ...o, src: 'swap', other });
  }
  for (const [id, d] of Object.entries(IT)) if (d.recipe && d.fits.includes(key) && id !== 'steamGun' && id !== 'pipeWrench' && id !== 'shovel' && id !== 'arcGun') craft.push({ id, q: 'standard', src: 'craft' });
  S.shelf.forEach((o, i) => { if (IT[o.id].fits.includes(key)) buy.push({ ...o, src: 'buy', i }); });
  return { owned, craft, buy };
}

function tagHtml(e, key) {
  const d = IT[e.id];
  const back = S.back ? ' & return' : '';
  let btn, cost = '', short = false;
  if (e.src === 'owned') btn = `Fit${back}`;
  else if (e.src === 'swap') btn = `Swap${back}`;
  else if (e.src === 'buy') { btn = `Buy & fit${back}`; cost = `<span>${e.price} scrap <span class="${S.stores.scrap >= e.price ? '' : 'short'}">(have ${S.stores.scrap})</span></span><span>Trader's shelf, this lift</span>`; short = S.stores.scrap < e.price; }
  else {
    btn = `Craft & fit${back}`;
    short = !canPay(d.recipe);
    cost = `<span class="${S.stores.scrap >= d.recipe.scrap ? '' : 'short'}">${d.recipe.scrap} scrap</span>` + Object.entries(d.recipe.parts ?? {}).map(([p, n]) => `<span class="${(S.parts[p] ?? 0) >= n ? '' : 'short'}">${p} ${n} (have ${S.parts[p] ?? 0})</span>`).join('');
  }
  const qtext = e.src === 'craft' ? '<small>rolls its quality</small>' : `<small>${qName(e.q)}</small>`;
  const note = [d.note, d.w && WEAP[d.w].note, e.src === 'swap' ? `worn in ${slotLabel(e.other)}: the two swap` : ''].filter(Boolean).join('; ');
  let answers = '', pick = false;
  if (S.back === 'table' && d.w) {
    const m = meets(d.w, S.land);
    const was = S.worn[key];
    S.worn[key] = { id: e.id, q: e.q };
    if (e.src === 'swap') S.worn[e.other] = was;
    pick = flagsFor(S.land).length === 0;
    S.worn[key] = was;
    if (e.src === 'swap') S.worn[e.other] = { id: e.id, q: e.q };
    answers = `<div class="tag__answers">${pick ? 'Clears the flags. ' : ''}${m.up.length ? `▲ ${m.up.join(', ')}` : ''}${m.down.length ? ` <span class="down">▼ ${m.down.join(', ')}</span>` : ''}${!m.up.length && !m.down.length ? '<span class="mk-typed">nothing here fears or resists it</span>' : ''}</div>`;
  }
  return `<div class="tag${short ? ' is-short' : ''}${pick ? ' is-pick' : ''}"><div class="tag__name">${esc(d.name)} ${qtext}</div>
    <div class="tag__act"><button class="mk-btn${short ? '' : ' mk-btn--main'}" data-act="take" data-src="${e.src}" data-id="${e.id}" data-q="${e.q}" data-i="${e.i ?? ''}" data-key="${key}"${short ? ' disabled' : ''}>${btn}</button></div>
    <div class="tag__cmp">${compare(e.id, e.q, key)}</div>${note ? `<div class="tag__note">${esc(note)}</div>` : ''}${answers}${cost ? `<div class="tag__cost">${cost}</div>` : ''}</div>`;
}

function group(label, note, body, empty) {
  return `<div class="dk-group"><span class="dk-group__tab">${label}</span><span class="dk-group__note">${note}</span><span class="dk-group__rule"></span></div>${body || `<div class="dk-empty">${empty}</div>`}`;
}

function drawerHtml() {
  const key = S.slot;
  let head = '', worn = '', list = '';
  if (S.tab === 'recipes') {
    head = `<h3>Recipes</h3><span>the whole bench</span>`;
    const rows = Object.entries(IT).filter(([, d]) => d.recipe).slice(0, 14).map(([id, d]) => {
      const ok = canPay(d.recipe);
      const cost = `<span class="${S.stores.scrap >= d.recipe.scrap ? '' : 'short'}">${d.recipe.scrap} scrap</span>` + Object.entries(d.recipe.parts ?? {}).map(([p, n]) => `<span class="${(S.parts[p] ?? 0) >= n ? '' : 'short'}">${p} ${n} (have ${S.parts[p] ?? 0})</span>`).join('');
      return `<div class="tag${ok ? '' : ' is-short'}"><div class="tag__name">${esc(d.name)} <small>${d.w ? 'a weapon' : d.fits.map((f) => f.startsWith('comm') ? 'you: ' + slotLabel(f) : ROLE_NAME[f.split('.')[0]][1].toLowerCase() + ': ' + slotLabel(f)).slice(0, 2).join(', ')}</small></div>
        <div class="tag__act"><button class="mk-btn" data-act="craft" data-id="${id}"${ok ? '' : ' disabled'}>Craft</button></div><div class="tag__cost">${cost}</div></div>`;
    }).join('');
    list = `<div class="dk-empty">Craft puts the piece in the stores. Search by name or material, as the bench does today. <input class="dk-search" placeholder="Search: tusk, stinger, head…"></div>${rows}`;
  } else if (!key) {
    head = `<h3>${S.sel === 'comm' ? 'The Communicator' : ROLE_NAME[S.sel][1]}</h3><span>pick a slot</span>`;
    list = `<div class="dk-empty">Click a slot on the drawing, a card pocket or a relic socket. The drawer fills with what fits it: what you own, what the bench can make, what the Trader has.</div>`;
  } else if (key.startsWith('card.')) {
    const [, who, idx] = key.split('.');
    const curId = who === 'comm' ? S.cards.comm[+idx] : S.cards[who];
    const pools = who === 'comm' ? COMM_POOLS : [who];
    head = `<h3>${who === 'comm' ? `Card slot ${+idx + 1}` : 'Type card'}</h3><span>${who === 'comm' ? 'yours: gun, melee, kick, body, crew' : `every ${ROLE_NAME[who][0].toLowerCase()} reads it`}</span>`;
    worn = curId ? `<div class="dk-worn">In the pocket: <b>${CARD[curId].name}</b></div>` : '<div class="dk-worn">The pocket is empty.</div>';
    const fits = S.cardsOwned.filter((id) => pools.includes(CARD[id].pool));
    list = group('Your cards', `${fits.length} fit`, fits.map((id) => {
      const c = { id, pool: CARD[id].pool };
      return `<div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center"><div class="${pcClass(c, 'sm')}" ${pcStyle(c)}>${STOCK}<span class="pc__head"><span class="pc__name">${CARD[id].name}</span><span class="pc__tag">${CARD[id].tag}</span></span><span class="pc__typed">${CARD[id].text}</span>${holesSvg(id)}</div>
        <button class="mk-btn mk-btn--main" data-act="card" data-id="${id}" data-key="${key}">Slot it</button></div>`;
    }).join(''), 'No card you own fits this pocket. The Oracle offers a pick after each landing.');
  } else if (key.startsWith('relic.')) {
    const [, role, i] = key.split('.');
    const b = robotsOf(role)[+i];
    head = `<h3>${b.n}'s relic</h3><span>one socket a robot</span>`;
    worn = b.relic ? `<div class="dk-worn">In the socket: <b>${RELIC[b.relic].reading}</b></div>` : '<div class="dk-worn">The socket is empty.</div>';
    list = group('In the stores', `${S.relics.length} relics`, S.relics.map((id) => `<div class="tag"><div class="tag__name">${RELIC[id].reading} <small>a ${RELIC[id].item}, misread</small></div>
      <div class="tag__act"><button class="mk-btn mk-btn--main" data-act="relic" data-id="${id}" data-key="${key}">Fit${S.back ? ' & return' : ''}</button></div>
      <div class="tag__note" style="grid-row:2;grid-column:1;color:var(--mk-typed)">${RELIC[id].effect}</div><div class="tag__note">Flaw: ${RELIC[id].flaw}</div></div>`).join(''), 'No relics in the stores.');
  } else {
    const [who] = key.split('.');
    head = `<h3>${slotLabel(key)}</h3><span>${who === 'comm' ? 'yours' : `fits ${ROLE_NAME[who][1].toLowerCase()}, all ${robotsOf(who).length} wear it`}</span>`;
    const cur = S.worn[key];
    worn = cur ? `<div class="dk-worn">Worn now: <b>${esc(IT[cur.id].name)}</b> ${qName(cur.q)}</div>` : '<div class="dk-worn">Nothing worn here yet.</div>';
    const { owned, craft, buy } = slotEntries(key);
    list = group('In the stores', `${owned.length}`, owned.map((e) => tagHtml(e, key)).join(''), 'Nothing in the stores fits this slot.')
      + group('Can be made', `${craft.filter((e) => canPay(IT[e.id].recipe)).length} of ${craft.length} affordable`, craft.map((e) => tagHtml(e, key)).join(''), 'No recipe on the bench makes a piece for this slot yet.')
      + group("Trader's shelf", 'this lift', buy.map((e) => tagHtml(e, key)).join(''), `Nothing for this slot on her shelf this lift.`);
  }
  const back = S.back === 'haul' ? '<div class="dk-worn">Opened from the haul: fitting takes you back to it.</div>' : S.back === 'table' ? '<div class="dk-worn">Opened from the course table: fitting takes you back to it.</div>' : '';
  const toast = S.toast ? `<div class="dk-toast">${S.toast}</div>` : '<div></div>';
  return `<div class="dk-drawer"><div class="dk-drawer__head">${head}<div class="dk-tabs"><button class="dk-tab" data-act="tab" data-tab="slot" aria-selected="${S.tab === 'slot'}">This slot</button><button class="dk-tab" data-act="tab" data-tab="recipes" aria-selected="${S.tab === 'recipes'}">Recipes</button></div></div>
    <div>${worn}${back}</div><div class="dk-list">${list}</div>${toast}</div>`;
}

const FROM = { forge: "Hob's forge", clinic: "Gasket's clinic", bench: "Sprocket's bench", I: 'the I key', haul: 'the haul', table: 'the course table' };

function gauges() {
  return `<div class="mk-gauges"><div class="mk-gauge"><b>${S.stores.scrap}</b><span>scrap</span></div><div class="mk-gauge"><b>${S.stores.copper}</b><span>copper</span></div><div class="mk-gauge"><b>${S.stores.coal}</b><span>coal</span></div><div class="mk-gauge"><b>${partsTotal()}</b><span>parts</span></div></div>`;
}

function dockHtml() {
  return `<div class="mk-panel"><div class="mk-head"><div class="mk-plate">Dry dock</div><span class="mk-head__from">opened at ${FROM[S.from]}</span>${gauges()}
    <button class="mk-btn mk-close" data-act="close"><span class="mk-key">Esc</span> ${S.back ? 'Back' : 'Close'}</button></div>
    <div class="dk">${rosterHtml()}${sheetHtml()}${drawerHtml()}</div></div>`;
}

// ---------------------------------------------------------------- arrival

const HAUL = [
  { sec: 'Found', key: 'arc', name: 'Leyden arc-gun', small: 'under the shrine\'s glass', note: 'A shock gun; its bolts jump to the next foe. In the stores now.', tags: [['fit', 'Fit to Secondary', 'comm.secondary'], ['salvage', 'Salvage'], ['keep', 'Keep']] },
  { sec: 'Relics', key: 'sprinkler', name: 'The Rain-maker', small: 'a garden sprinkler, misread', note: 'Back socket. Wets everything within 100 px every 5 s; wets your crew too.', tags: [['fitrelic', 'Fit to Funnel', 'relic.gatherer.1'], ['sell', 'Sell: 6 scrap'], ['keep', 'Keep']] },
  { sec: 'Relics', key: 'zapper', name: 'The Lightning Paddle', small: 'a bug-zapper racket, misread', note: 'Arms socket. Melee swat: 12 Shock, flyers take triple.', tags: [['fitrelic', 'Fit to Bolt', 'relic.guard.1'], ['sell', 'Sell: 6 scrap'], ['keep', 'Keep']] },
  { sec: 'Parts', key: 'tusk', name: 'Piston tusk', small: '×4', note: 'Used by: Leyden arc-gun, Tusk bore, Leyden-jar sights, Tusk bellows.', tags: [['sell', 'Sell 4: 20 scrap'], ['keep', 'Keep']] },
  { sec: 'Parts', key: 'arm', name: 'Long arm', small: '×3', note: 'Used by: Long-arm grabbers, Leyden-jar sights.', tags: [['sell', 'Sell 3: 15 scrap'], ['keep', 'Keep']] },
  { sec: 'Parts', key: 'haunch', name: 'Spring haunches', small: '×2', note: 'No recipe uses them: spare.', tags: [['sell', 'Sell 2: 10 scrap'], ['keep', 'Keep']], spare: true },
  { sec: 'Crew', key: 'home', name: 'Anvil, Bolt, Ladle, Funnel, Sump', small: 'home on the lift', note: 'Stoking wore off as the lift docked.', tags: [] },
  { sec: 'Crew', key: 'solder', name: 'Solder', small: 'carried home, down', note: 'Repaired, it rides again, rank and relic as they were.', tags: [['repair', 'Repair: 15 scrap']] },
  { sec: 'Crew', key: 'clover', name: 'Clover', small: 'left on the sands', note: 'A wreck until rebuilt; it keeps its rank.', tags: [['rebuild', 'Rebuild: 30 scrap, 1 part']] },
  { sec: 'Old research', key: 'pick', name: 'One card pick waiting', small: 'at the Oracle', note: 'She punches three rules into cards; you keep one.', tags: [['church', 'Go to her', null, true]] },
];
const DONE_TEXT = { fit: 'Fitted to Secondary', fitrelic: 'Fitted', salvage: 'Salvaged', sell: 'Sold', keep: 'Kept', repair: 'Repaired', rebuild: 'Rebuilt' };

function arrivalHtml() {
  let sec = '';
  const rows = HAUL.map((h) => {
    const head = h.sec !== sec ? `<div class="ar-sec">${(sec = h.sec)}</div>` : '';
    const done = S.haulDone[h.key];
    const tags = done ? `<span class="mk-stamp mk-stamp--green">${DONE_TEXT[done]}</span>` : h.tags.map(([act, label, key, open]) =>
      `<button class="mk-btn${act === 'fit' || act === 'fitrelic' ? ' mk-btn--main' : ''}" data-act="haul" data-what="${act}" data-row="${h.key}" data-key="${key ?? ''}">${label}</button>${open ? ' <span class="mk-open" title="The pick sits behind the Oracle\'s talk today; a straight link is the audit\'s open question.">open</span>' : ''}`).join('');
    return `${head}<div class="ar-row${done ? ' is-done' : ''}"><div class="ar-row__what"><div class="ar-row__name">${h.name}<small>${h.small}</small></div><div class="ar-row__note">${h.note}</div></div><div class="ar-tags">${tags}</div></div>`;
  }).join('');
  const spareLeft = HAUL.filter((h) => h.spare && !S.haulDone[h.key]).length;
  return `<div class="mk-panel"><div class="mk-head"><div class="mk-plate">Home</div><span class="mk-head__from">the lift has docked</span>${gauges()}</div>
    <div class="ar"><div class="ar-bill mk-stock"><div><h2>From the Rustwood Jungle</h2><div class="ar-bill__sub">landing 7, back before dusk. Everything below is already in the stores.</div></div><div class="ar-rows">${rows}</div></div>
    <div class="ar-side"><div class="ar-box"><h3>Banked</h3><div class="ar-gauges"><div class="mk-gauge"><b>312</b><span>scrap</span></div><div class="mk-gauge"><b>46</b><span>copper</span></div><div class="mk-gauge"><b>18</b><span>coal</span></div><div class="mk-gauge"><b>1</b><span>AI core</span></div><div class="mk-gauge"><b>1</b><span>insight</span></div><div class="mk-gauge"><b>9</b><span>parts</span></div></div></div>
      <div class="ar-box"><h3>Spare</h3><div class="ar-note">Parts no recipe on the bench uses. <span class="mk-open" title="What counts as spare is not decided; the mock's guess is: no recipe uses it.">open</span></div>
      <div style="margin-top:8px"><button class="mk-btn" data-act="haul" data-what="sellspare"${spareLeft ? '' : ' disabled'}><span>Sell all spare</span><small>${spareLeft ? '2 parts: 10 scrap' : 'none left'}</small></button></div></div>
      <div class="ar-side__go"><div class="ar-note">Unmarked rows stay in the stores, as today.</div><button class="mk-btn mk-btn--main" data-act="done"><span>Done</span><span class="mk-key">E</span></button></div></div></div></div>`;
}

// ---------------------------------------------------------------- pre-flight

function preflightHtml() {
  const L = LANDS[S.land];
  const lands = Object.entries(LANDS).map(([id, l]) => l.locked
    ? `<div class="pf-land mk-stock is-locked"><b>${l.name}</b><span>locked</span></div>`
    : `<button class="pf-land mk-stock${S.land === id ? ' is-sel' : ''}" data-act="land" data-land="${id}"><b>${l.name}</b><span>Tier ${l.tier}${id === 'jungle' ? ', flown last' : ''}</span>${flagsFor(id).length ? '<span class="mk-stamp mk-stamp--red">flagged</span>' : '<span class="mk-stamp mk-stamp--green">ready</span>'}</button>`).join('');
  const wkeys = WS.map((k) => ({ k, it: IT[S.worn[k].id], w: WEAP[IT[S.worn[k].id].w] }));
  const head = `<tr><th>Machines</th>${wkeys.map((x) => `<th>${x.it.name}<small>${slotLabel(x.k)}, ${x.w.type}</small></th>`).join('')}<th>Weak to<small>▲ ×1.5</small></th><th>Resists<small>▼ ×0.5</small></th></tr>`;
  const body = L.foes.map(([name, weak, resist, when, counter]) => `<tr><td><b>${name}</b>${counter ? `<span class="pf-counter" title="Soft counter: punishes Shock chains">${counter}</span>` : ''}${when ? `<small>${when}</small>` : ''}</td>${wkeys.map((x) => {
    const up = weak.includes(x.w.type), down = resist.includes(x.w.type);
    return `<td class="pf-cell ${up ? 'up' : down ? 'down' : ''}">${up ? '▲' : down ? '▼' : '·'}</td>`;
  }).join('')}<td>${weak.join(', ')}</td><td>${resist.join(', ') || '–'}</td></tr>`).join('');
  const flags = flagsFor(S.land);
  const flagHtml = flags.length
    ? flags.map((f) => `<div class="pf-flag"><span class="mk-stamp mk-stamp--red">Unanswered</span><p>${f.text}</p><button class="mk-btn mk-btn--main" data-act="fix" data-key="${f.key}">Fix: ${slotLabel(f.key)}</button></div>`).join('')
    : `<div class="pf-flag is-ok"><span class="mk-stamp mk-stamp--green">Answered</span><p>No weapon you carry is shrugged off here more than it is feared.${S.fixed ? ' The Steam gun is back in Secondary.' : ''}</p></div>`;
  const crew = ROLES.map((r) => {
    const bots = robotsOf(r);
    const rides = bots.filter((b) => !b.wreck && !b.down);
    const stays = bots.filter((b) => b.wreck || b.down);
    const gear = ['head', 'arms', 'back', 'mobility'].map((s) => S.worn[`${r}.${s}`] ? IT[S.worn[`${r}.${s}`].id].name : `<span class="who">${SLOT_NAME[s].toLowerCase()} empty</span>`).join(', ');
    return (rides.length ? `<div class="pf-mrow"><b>${ROLE_NAME[r][rides.length > 1 ? 1 : 0]} ×${rides.length}</b> <span class="who">${rides.map((b) => b.n + (b.stoked ? ' (stoked)' : '')).join(', ')}</span><br>${gear}</div>` : '')
      + stays.map((b) => `<div class="pf-mrow is-stays"><b>${b.n}</b> stays aboard: ${b.wreck ? 'a wreck' : 'down, repair it first'}</div>`).join('');
  }).join('');
  const you = `<div class="pf-mrow"><b>You</b> <span class="who">${wkeys.map((x) => `${x.it.name} (${x.w.type})`).join(', ')}</span><br>${['head', 'arm', 'core', 'legs', 'rear', 'pack'].map((s) => IT[S.worn['comm.' + s].id].name).join(', ')}</div>`;
  const riders = ROLES.reduce((n, r) => n + robotsOf(r).filter((b) => !b.wreck && !b.down).length, 0);
  return `<div class="mk-panel"><div class="mk-head"><div class="mk-plate">Course table</div><span class="mk-head__from">pre-flight</span>${gauges()}<button class="mk-btn mk-close" data-act="away"><span class="mk-key">Esc</span> Close</button></div>
    <div class="pf"><div class="pf-lands">${lands}</div>
    <div class="pf-chart mk-stock"><div><h2>${L.name} <span>Tier ${L.tier}</span></h2><div class="pf-sky"><b>${L.sky}</b>${L.skyText}${L.twist ? ` ${L.twist}` : ''}<br>Parts here: ${L.parts}</div></div>
      <table class="pf-grid">${head}${body}</table><div></div>
      <div class="pf-flags">${flagHtml}<div class="ar-note" style="color:var(--mk-print);font:12px var(--mk-mono)">The flag reads your two weapons only; the robots' own hits are not on the table. <span class="mk-open" title="Flag rule is a guess: a weapon flags when more machines resist it than fear it, or when it chains into Grounded machines. Robots' damage types are left out.">open</span></div></div></div>
    <div class="pf-crew"><div class="pf-call">The Wanderer's call ${['Steam barrage', 'Brass Drop', 'Steam Lance'].map((c) => `<button class="mk-btn" data-act="call" data-call="${c}" aria-pressed="${S.call === c}">${c}</button>`).join('')}</div>
      <div class="pf-manifest mk-stock"><h3>Riding down <span class="mk-typed" style="font-size:12px">you and ${riders} robots</span></h3>${you}${crew}
      <div class="ar-note" style="margin-top:6px;color:var(--mk-print);font:12px var(--mk-mono)">Who rides is not a choice here: every robot that is not a wreck, as built. <span class="mk-open" title="Choosing who rides is Minos's open question.">open</span></div></div>
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
    <button class="mk-btn" data-act="table"><span class="mk-key">E</span> at the course table</button>
    <button class="mk-btn" data-act="table"><span class="mk-key">E</span> at the lift lever</button></div>
    <div class="ar-note" style="color:var(--ui-c-scene-text-dim)">Both open the course table. <span class="mk-open" title="Today the lever launches in one press, skipping the table. Should it open pre-flight instead?">open</span></div></div>`;
}

function endHtml() {
  const f = FLOWS[S.flow];
  return `<div class="mk-end mk-stock"><h2>The lift goes down</h2><p>${S.inputs} inputs from the docking to the lift, with one found item fitted, the spare sold and a flagged danger fixed.</p>
    <table><tr><td>This mock</td><td>${S.inputs}</td></tr><tr><td>Today (audit rows 1, 2, 6, 12, 13)</td><td>${f.audit}</td></tr></table>
    <p>“Arrival to the lift” in the bar above starts over.</p></div>`;
}

// ---------------------------------------------------------------- flows and counting

const FLOWS = {
  weapon: { name: 'Craft and fit a weapon', audit: '8 + scrolling', page: 'dock', steps: [
    ['Press E at Hob\'s forge', (a, d) => a === 'open' && d.from === 'forge', '[data-act="open"][data-from="forge"]'],
    ['Craft & fit the Hornet\'s spear', (a, d) => a === 'take' && d.id === 'hornetSpear', '[data-act="take"][data-id="hornetSpear"]'],
    ['Close the dock', (a) => a === 'close', '[data-act="close"]']] },
  crew: { name: 'Crew piece to the guards', audit: '9', page: 'dock', steps: [
    ['Press I anywhere aboard', (a, d) => a === 'open' && d.from === 'I', '[data-act="open"][data-from="I"]'],
    ['Pick the Guards on the roster', (a, d) => a === 'who' && d.who === 'guard', '[data-act="who"][data-who="guard"]'],
    ['Craft & fit the Robot hornet\'s head (the empty Head slot opened by itself)', (a, d) => a === 'take' && d.id === 'hornetHead', '[data-act="take"][data-id="hornetHead"]'],
    ['Close the dock', (a) => a === 'close', '[data-act="close"]']] },
  loop: { name: 'Arrival to the lift', audit: 'about 15, plus 2 and 1 per part unit sold', page: 'home', steps: [
    ['Fit the found Leyden arc-gun', (a, d) => a === 'haul' && d.row === 'arc' && d.what === 'fit', '[data-act="haul"][data-row="arc"][data-what="fit"]'],
    ['Fit & return: the arc-gun replaces the Steam gun', (a, d) => a === 'take' && d.id === 'arcGun', '[data-act="take"][data-id="arcGun"]'],
    ['Sell all spare', (a, d) => a === 'haul' && d.what === 'sellspare', '[data-act="haul"][data-what="sellspare"]'],
    ['Done', (a) => a === 'done', '[data-act="done"]'],
    ['Press E at the course table', (a) => a === 'table', '[data-act="table"]'],
    ['Pick the Hollow City', (a, d) => a === 'land' && d.land === 'city', '[data-act="land"][data-land="city"]'],
    ['Fix the flagged Secondary', (a) => a === 'fix', '[data-act="fix"]'],
    ['Swap & return: the Steam gun (pierce) answers the chargers', (a, d) => a === 'take' && d.id === 'steamGun', '[data-act="take"][data-id="steamGun"]'],
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

function take(d) {
  const key = d.key;
  const was = S.worn[key];
  let item, msg;
  if (d.src === 'craft') {
    const r = IT[d.id].recipe;
    S.stores.scrap -= r.scrap;
    for (const [p, n] of Object.entries(r.parts ?? {})) S.parts[p] -= n;
    const q = d.id === 'hornetSpear' ? 'fine' : 'standard';
    item = { id: d.id, q };
    msg = `${IT[d.id].name} made: it came out ${qName(q)}. Fitted to ${slotLabel(key)}`;
  } else if (d.src === 'buy') {
    const o = S.shelf.splice(+d.i, 1)[0];
    S.stores.scrap -= o.price;
    item = { id: o.id, q: o.q };
    msg = `${qName(o.q)} ${IT[o.id].name} bought and fitted to ${slotLabel(key)}`;
  } else if (d.src === 'swap') {
    const other = WS.find((k) => k !== key);
    item = S.worn[other];
    S.worn[other] = was;
    S.worn[key] = item;
    msg = `${IT[item.id].name} to ${slotLabel(key)}, ${IT[was.id].name} to ${slotLabel(other)}`;
    return finish(key, msg + '.');
  } else {
    item = S.stores_items.splice(+d.i, 1)[0];
    msg = `${IT[item.id].name} fitted to ${slotLabel(key)}`;
  }
  S.worn[key] = item;
  if (was) { S.stores_items.push(was); msg += `; the ${IT[was.id].name} went back to the stores`; }
  if (!key.startsWith('comm')) msg += `. All ${robotsOf(key.split('.')[0]).length} ${ROLE_NAME[key.split('.')[0]][1].toLowerCase()} wear it`;
  finish(key, msg + '.');
}

function finish(key, msg) {
  S.toast = msg;
  S.isNew = key;
  if (S.back === 'haul') { S.haulDone.arc = 'fit'; S.view = 'arrival'; S.back = null; }
  else if (S.back === 'table') { S.fixed = true; S.view = 'preflight'; S.back = null; }
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
      S.toast = `${IT[d.id].name} made: Standard. It is in the stores.`;
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
      S.toast = d.what === 'stoke' ? 'Every robot that rides is stoked for the next landing.' : d.what === 'repair' ? 'Repaired: they ride again.' : 'Rebuilt, ranks kept.';
      break;
    case 'promote': S.toast = 'Promote: as the workshop does it today (a pick of specs).'; break;
    case 'close': if (S.back === 'haul') S.view = 'arrival'; else if (S.back === 'table') S.view = 'preflight'; else S.view = 'deck'; S.back = null; break;
    case 'haul': {
      const row = HAUL.find((h) => h.key === d.row);
      if (d.what === 'fit') { openDock('haul', 'comm', d.key, 'haul'); break; }
      if (d.what === 'fitrelic') { const [, role] = d.key.split('.'); openDock('haul', role, d.key, 'haul'); break; }
      if (d.what === 'sellspare') { for (const h of HAUL) if (h.spare) S.haulDone[h.key] = 'sell'; S.stores.scrap += 10; S.parts['Spring haunches'] = 0; break; }
      if (d.what === 'church') break;
      if (d.what === 'repair') { robotsOf('repairer')[0].down = false; S.stores.scrap -= 15; }
      if (d.what === 'rebuild') { robotsOf('mule')[0].wreck = false; S.stores.scrap -= 30; }
      if (d.what === 'sell') S.stores.scrap += { tusk: 20, arm: 15, haunch: 10, sprinkler: 6, zapper: 6 }[row.key] ?? 0;
      S.haulDone[row.key] = d.what;
      break;
    }
    case 'done': S.view = 'deck'; break;
    case 'table': S.view = 'preflight'; S.land = 'jungle'; break;
    case 'land': S.land = d.land; break;
    case 'fix': S.fixKey = d.key; openDock('table', 'comm', d.key, 'table'); break;
    case 'call': S.call = d.call; break;
    case 'away': S.view = 'deck'; break;
    case 'lower': S.view = 'end'; break;
  }
}

// ---------------------------------------------------------------- render

const stage = document.querySelector('.stage');
const ui = document.getElementById('ui');

function render() {
  const deck = document.querySelector('.mk-deck');
  deck.classList.toggle('is-clear', S.view === 'deck');
  ui.innerHTML = S.view === 'dock' ? dockHtml() : S.view === 'arrival' ? arrivalHtml() : S.view === 'preflight' ? preflightHtml() : S.view === 'end' ? endHtml() : deckHtml();
  const f = FLOWS[S.flow];
  const step = f?.steps[S.step];
  document.querySelectorAll('.is-next').forEach((n) => n.classList.remove('is-next'));
  if (step) ui.querySelector(step[2])?.classList.add('is-next');
  const bar = document.querySelector('.mk-chrome__step');
  bar.innerHTML = f ? (step ? `Step ${S.step + 1} of ${f.steps.length}: <b>${step[0]}</b>` : `<b>Flow done.</b> ${f.name}.`) : 'Free play: click anything.';
  document.querySelector('.mk-chrome__count').innerHTML = `inputs <b>${S.inputs}</b>${f ? ` <em>today: ${f.audit}</em>` : ''}`;
  document.querySelectorAll('[data-flow]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.flow === (S.flow ?? 'free'))));
}

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
  const close = ui.querySelector('[data-act="close"], [data-act="away"]');
  if (close) close.click();
});

document.querySelector('.mk-chrome').addEventListener('click', (e) => {
  const b = e.target.closest('[data-flow]');
  if (!b) return;
  if (b.dataset.flow === 'free') { startFlow(null); } else startFlow(b.dataset.flow);
});

function fit() {
  const wrap = document.querySelector('.mk-fit');
  const s = Math.min((innerWidth) / 1280, (innerHeight - 44) / 720);
  stage.style.transform = `scale(${s})`;
  wrap.style.width = 1280 * s + 'px';
  wrap.style.height = 720 * s + 'px';
}
addEventListener('resize', fit);
fit();
startFlow(PAGE === 'home' ? 'loop' : 'weapon');

// For screenshots and tests from the pane: jump to a named state.
window.mock = { get S() { return S; }, act: (a, d = {}) => { S.inputs++; const f = FLOWS[S.flow]; const st = f?.steps[S.step]; act(a, d); if (st && st[1](a, d)) S.step++; render(); }, start: startFlow };
// Dev only: save the stage as a PNG through the capture endpoint (games/proto-ld60-machinerra/capture/<name>.png).
window.mock.shot = async (name) => {
  const m = await import(/* @vite-ignore */ '/node_modules/html-to-image/es/index.js');
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
