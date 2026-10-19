/**
 * The management kit's page (`kit.html`): every component in its states, built with the kit's own builders and the game's real data
 * and art, so the next screens (Arrival, the course table) and other agents build from what is here. Hover anything with a tip; hold
 * Alt for the third level.
 */
import '../../../../harness/ui/tokens.css';
import '../theme.css';
import './manage.css';
import '../punchcard.css';
import './kitpage.css';
import { DAMAGE_TYPES } from '../sim/effects';
import { ITEMS, type ItemId } from '../sim/gear';
import { RELICS } from '../sim/junk';
import { cardOf, CARDS, POOL_NAMES } from '../hub/research';
import { STOCK, holesSvg, pcClass, pcStyle } from '../hub/punchcard';
import { G, SLOT_GLYPH, glyph, glyphNames } from './glyphs';
import { guessedLines, itemWords } from './gearwords';
import { btn, chipHtml, counter, drawer, drawerTab, dt, esc, fr, group, keycap, note, plate, stamp, tag, who } from './manage';
import { Tips, Tooltip, tipHtml } from './tooltip';
import { loadPageArt, pageArt } from './pageart';

await loadPageArt();
const art = pageArt('./');
const tips = new Tips();
const page = document.getElementById('kit')!;

const sec = (title: string, what: string, body: string) => `<section class="kp-sec"><h2>${esc(title)}</h2><p class="kp-what">${what}</p><div class="kp-body">${body}</div></section>`;
const cell = (label: string, html: string, cls = '') => `<figure class="kp-cell ${cls}">${html}<figcaption>${esc(label)}</figcaption></figure>`;
const on = (html: string) => `<div class="kp-on mg-stock">${html}</div>`;
const well = (html: string) => `<div class="kp-on mg-well">${html}</div>`;

const itemTip = (id: ItemId) => {
  const w = itemWords(id, 'fine');
  return tips.add(`<b>${esc(ITEMS[id].name)}</b>Fine${w.line ? `<p>${esc(w.line)}.</p>` : ''}`, w.full.map((l) => `<p>${esc(l)}</p>`).join(''));
};

const swatches = ['stock-hi', 'stock', 'stock-lo', 'stock-short', 'edge', 'ink', 'typed', 'print', 'brass-hi', 'brass', 'brass-lo', 'iron', 'iron-2', 'red', 'green']
  .map((t) => cell(`--mg-${t}`, `<span class="kp-sw kp-sw--${t}"></span>`)).join('');

const frames = [
  ...(['xs', 's', 'm', 'l', 'xl'] as const).map((s) => cell(`fr ${s}`, fr(art.item('pipeWrench'), s))),
  ...(['standard', 'fine', 'rare', 'epic', 'legendary'] as const).map((q) => cell(`quality ${q}`, fr(art.item('kettleHelm'), 'm', { q }))),
  cell('empty', fr(null, 'm')), cell('dim (down)', fr(art.crew('guard'), 'm', { dim: true })), cell('count', fr(art.part('hornet-stinger'), 'm', { n: 4 })), cell('tuned', fr(art.item('bellowsLungs'), 'm', { tuned: true })),
  cell('relic', fr(art.relic('toaster'), 'm')), cell('portrait', fr(art.portrait(), 'm')),
].join('');

const discs = [...DAMAGE_TYPES.map((t) => cell(t, dt(t, { tip: tips.text(`${t} damage`) }))), cell('small', dt('shock', { small: true })), cell('weak to it', dt('shock', { tone: 'up' })), cell('resists it', dt('impact', { tone: 'dn' }))].join('');

const chips = on([
  cell('stat', chipHtml({ glyph: 'bordered-shield', value: '+12%', name: 'Armour' })),
  cell('a cost', chipHtml({ glyph: 'running-shoe', value: '-8%', name: 'Speed', bad: true })),
  cell('better', chipHtml({ glyph: 'open-wound', value: '24', name: 'Damage' }, { d: 1 })),
  cell('worse', chipHtml({ glyph: 'stopwatch', value: '1.1/s', name: 'Hits a second' }, { d: -1 })),
  cell('level', chipHtml({ glyph: 'bullseye', value: '96', name: 'Reach' }, { d: 0 })),
  cell('damage type', chipHtml({ glyph: '', value: 'Pierce', name: 'Pierce damage', type: 'pierce' })),
].join(''));

const buttons = on([
  cell('main (one a state)', btn('Craft &amp; fit', { main: true })),
  cell('secondary', btn('Fit')),
  cell('with a cost', btn(`${glyph(G.wrench)} Repair`, { small: '15' })),
  cell('faint', btn('Take off', { faint: true })),
  cell('on (stoked)', btn(`${glyph(G.coal)}5`, { on: true })),
  cell('disabled', btn('Craft &amp; fit', { main: true, disabled: true })),
  cell('key cap', btn(`${keycap('Esc')} Close`)),
].join(''));

const stamps = on([cell('down', stamp('Down')), cell('wreck', stamp('Wreck')), cell('done', stamp('Fitted', 'green')), cell('ink', stamp('Sold', 'ink'))].join(''));

const counters = well(`<div class="mg-counters">${[counter(fr(art.scrap(), 'xs'), 2590, tips.text('Scrap in the stores')), counter(fr(art.copper(), 'xs'), 540, tips.text('Copper')), counter(glyph(G.coal), 62, tips.text('Coal')), counter(glyph(G.parts), 250, tips.text('Parts')), counter(`${fr(art.scrap(), 'xs')}<small>on you</small>`, 31)].join('')}</div>`);

const state = (n: number, g: string, cls = '') => `<span class="${cls}">${glyph(g, 'mg-g--s')}${n}</span>`;
const roster = well(`<div class="kp-col">${[
  cell('the Communicator, picked', who({ pic: art.portrait(), name: 'Communicator', sel: true })),
  cell('a type: count and state', who({ pic: art.crew('gatherer'), name: 'Gatherers', n: '×3', state: state(2, G.coal) + `<span>${fr(null, 'xs')}1</span>` })),
  cell('a type needing care', who({ pic: art.crew('repairer'), name: 'Repairers', n: '×1', state: state(1, G.down, 'mg-down') })),
].join('')}</div>`);

const w = (id: ItemId) => itemWords(id);
const plates = on(`<div class="kp-row">${[
  cell('filled', plate({ slotGlyph: SLOT_GLYPH.head, pic: art.item('kettleHelm'), q: 'standard', name: ITEMS.kettleHelm.name, chips: w('kettleHelm').chips, tip: itemTip('kettleHelm') })),
  cell('weapon, picked, a lug', plate({ slotGlyph: SLOT_GLYPH.primary, pic: art.item('pipeWrench'), q: 'fine', name: ITEMS.pipeWrench.name, chips: w('pipeWrench').chips, line: w('pipeWrench').line, sel: true, extra: '<span class="mg-plate__lugs"><button type="button" class="mg-lug"></button></span>' })),
  cell('a line of what it does', plate({ slotGlyph: SLOT_GLYPH.pack, pic: art.item('supportAntenna'), name: ITEMS.supportAntenna.name, chips: w('supportAntenna').chips, line: w('supportAntenna').line })),
  cell('just fitted', plate({ slotGlyph: SLOT_GLYPH.arms, pic: art.item('rivetRepeater'), q: 'rare', name: ITEMS.rivetRepeater.name, chips: w('rivetRepeater').chips, fresh: true })),
  cell('empty', plate({ slotGlyph: SLOT_GLYPH.back })),
].join('')}</div>`);

const cost = (id: ItemId, short = false) => {
  const r = ITEMS[id].recipe;
  return `<span>${glyph(G.scrap, 'mg-g--s')}${r.scrap}</span>` + Object.entries(r.parts ?? {}).map(([k, n]) => `<span class="${short ? 'is-short' : ''}">${fr(art.part(k as never), 'xs')}${n}<small>/${short ? 0 : 6}</small></span>`).join('');
};
const tagChips = (id: ItemId, d: number[]) => `<span class="mg-chips">${w(id).chips.map((c, i) => chipHtml(c, { d: c.key === 'type' ? undefined : d[i] })).join('')}</span>`;
const tags = well(`<div class="kp-col kp-col--tags">${[
  cell('in the stores: the one main button', tag({ pic: art.item('pipeWrench'), q: 'fine', name: ITEMS.pipeWrench.name, chips: tagChips('pipeWrench', [0, 1, -1, 1]), acts: btn('Fit', { main: true }) + btn(`${glyph(G.salvage)}17`, { faint: true }), tip: itemTip('pipeWrench') })),
  cell('can be made', tag({ pic: art.item('hornetSpear'), name: ITEMS.hornetSpear.name, chips: tagChips('hornetSpear', [0, 1, -1, 1]), line: w('hornetSpear').line, cost: cost('hornetSpear'), acts: btn('Craft &amp; fit') })),
  cell('short of parts', tag({ pic: art.item('tazer'), name: ITEMS.tazer.name, chips: tagChips('tazer', [0, -1, 1, -1]), line: w('tazer').line, cost: cost('tazer', true), acts: btn('Craft &amp; fit', { disabled: true }), short: true })),
  cell('a relic', tag({ pic: art.relic('fan'), name: RELICS.fan.reading, line: `${RELICS.fan.effect}.`, acts: btn('Fit') })),
].join('')}</div>`);

const drawerDemo = drawer({
  title: 'Primary',
  note: fr(art.item('pipeWrench'), 's', { q: 'fine' }) + btn('Take off', { faint: true }),
  tabs: drawerTab('This slot', true, {}) + drawerTab('Recipes', false, {}),
  list: group('In the stores', tag({ pic: art.item('shovel'), name: ITEMS.shovel.name, chips: tagChips('shovel', [0, -1, 1, -1]), acts: btn('Fit', { main: true }) }), '') + group('Can be made', '', 'No recipe for this slot yet: the stations teach them.') + group("Trader's shelf", '', 'Nothing on her shelf for this slot this lift.'),
  foot: note(`${fr(art.item('hornetSpear'), 'xs')} <b>Hornet's spear (Fine)</b> made and fitted in primary; Pipe wrench to the stores.`),
  cls: 'kp-drawer',
});

const t2 = { more: `<b>${esc(ITEMS.supportAntenna.name)}</b>Standard, pack<table><tr><th></th><th>This</th><th>Worn</th></tr><tr><th>Armour</th><td>+6%</td><td>+6%</td></tr></table><p>${esc(w('supportAntenna').line)}.</p>`, full: w('supportAntenna').full.map((l) => `<p>${esc(l)}</p>`).join('') };
const tooltips = `<div class="kp-row kp-static">${cell('level 1: the screen', plate({ slotGlyph: SLOT_GLYPH.pack, pic: art.item('supportAntenna'), name: ITEMS.supportAntenna.name, chips: w('supportAntenna').chips, line: w('supportAntenna').line, tip: tips.add(t2.more, t2.full) }))}${cell('level 2: hover (says Alt has more)', `<div class="mg-tip">${tipHtml(t2, false)}</div>`)}${cell('level 3: Alt held', `<div class="mg-tip">${tipHtml(t2, true)}</div>`)}${cell('no more to say: no hint', `<div class="mg-tip">${tipHtml({ more: 'Scrap in the stores' }, false)}</div>`)}</div>`;

const card = cardOf(CARDS[0].id)!;
const cards = on(`<div class="kp-row">${cell('a card in a pocket', `<div class="kp-card"><div class="${pcClass(card, 'sm')}" ${pcStyle(card)}>${STOCK}<span class="pc__head"><span class="pc__name">${esc(card.name)}</span><span class="pc__tag">${esc(POOL_NAMES[card.pool])} card</span></span>${holesSvg(card.id)}</div></div>`)}${cell('an empty pocket', `<div class="kp-card"><div class="pc pc--sm pc--empty">${STOCK}<span class="pc__head"><span class="pc__name">Empty pocket</span></span></div></div>`)}</div>`);

const glyphs = glyphNames().map((n) => cell(n, `<span class="kp-glyph">${glyph(n)}</span>`, 'kp-cell--g')).join('');
const guesses = `<table class="kp-table"><tr><th>Item</th><th>Line worded from its effect (a guess)</th></tr>${guessedLines().map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.guess)}</td></tr>`).join('')}</table>`;

page.innerHTML = [
  `<header class="kp-head"><div class="mg-brass kp-plate">Management kit</div><p>Machinerra's management screens are built from these (<code>src/manage/</code>: <code>manage.css</code> the look, <code>manage.ts</code> the builders, <code>tooltip.ts</code> the three levels). Tokens live in <code>src/theme.css</code> as <code>--mg-*</code>. The Dry dock (<code>src/dock/</code>) is the first screen made of them. Hover for tips; hold Alt for details.</p></header>`,
  sec('Tokens', 'Card stock and typed ink, brass in three ramps, soot iron behind. Red marks a cost or a fault, green a gain or what was just done.', `<div class="kp-grid">${swatches}</div>`),
  sec('Brass-framed picture', '<code>fr(src, size, { q, n, dim, tuned })</code>: every picture in the one frame, one size per context; the quality dot in its corner (none for Standard).', `<div class="kp-grid">${frames}</div>`),
  sec('Damage-type disc', '<code>dt(type, { small, tone })</code>: the type\'s glyph in an ink disc; green: a foe weak to it, red: one that resists it.', `<div class="kp-grid">${discs}</div>`),
  sec('Stat chip', '<code>chipHtml(chip, { d })</code>: a glyph beside its value; red when it costs; the arrow compares with what is worn.', chips),
  sec('Buttons', '<code>btn(label, { main, faint, on, disabled, small })</code>: one main (brass) button per state; the rest iron or faint.', buttons),
  sec('Stamp', '<code>stamp(text, tone)</code>: rubber ink for a robot down or a wreck, green once done.', stamps),
  sec('Resource counter', '<code>counter(pic, value)</code> in a <code>.mg-counters</code> row.', counters),
  sec('Roster entry', '<code>who({ pic, name, n, state, sel })</code>: a time card on the rack; picked, it slides out with the accent tab.', roster),
  sec('Slot plate', '<code>plate({ slotGlyph, pic, name, chips, line, sel, fresh })</code>: the slot\'s glyph top right, the worn piece\'s picture and name, its stats in columns, one line of what it does.', plates),
  sec('Shipping tag', '<code>tag({ pic, name, chips, line, cost, acts, short })</code>: an item in a drawer, against what is worn, with its one button.', tags),
  sec('Drawer and groups', '<code>drawer({ title, note, tabs, list, foot })</code>, <code>group(label, rows, empty)</code>, <code>note(html)</code>: slot-first; the foot says what the last action did.', `<div class="kp-drawerbox">${drawerDemo}</div>`),
  sec('Tooltip: three levels', '<code>Tips.add(more, full)</code> and <code>Tooltip</code>: the screen shows the gist, hover the numbers, Alt the full details; a tip with more says "Alt: details".', tooltips),
  sec('Punch cards', 'The research cards keep their own look (<code>hub/punchcard.ts</code>); the dock shows them in pockets.', cards),
  sec('Glyphs', 'Placeholders from game-icons.net (<code>src/manage/glyphs/</code>, credit in its <code>CREDITS.md</code>); <code>glyph(name)</code> fills them with the text colour.', `<div class="kp-grid">${glyphs}</div>`),
  sec('Guessed effect lines', 'Items whose rule is an effect with no words of its own: the line is worded here from the effect\'s data (<code>gearwords.ts</code>).', guesses),
].join('');

new Tooltip(document.body, tips);
