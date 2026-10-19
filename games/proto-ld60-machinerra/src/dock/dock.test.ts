import { describe, expect, it } from 'vitest';
import { ITEMS, addItem, equip, freshGear, type Gear, type ItemId, type Quality } from '../sim/gear';
import { freshHub } from '../hub/state';
import { REBUILD, STOKE_COST, freshRoster, type Roster, type RosterBot } from '../hub/workshop';
import { REPAIR } from '../hub/economy';
import { itemWords } from '../manage/gearwords';
import { bestOf, bulk, deltas, firstEmpty, gearKey, openAt, parseSel, recipeList, rosterRows, slotEntries, type Ctx } from './dock';

const bot = (uid: string, role: RosterBot['role'], o: Partial<RosterBot> = {}): RosterBot => ({ uid, name: uid, role, rank: 0, wreck: false, ...o });
const crew = (bots: RosterBot[]): Roster => ({ ...freshRoster(), bots, next: bots.length + 1 });
/** Gear with these items added (and the uid of each, by id). */
function gearWith(...items: [ItemId, Quality?][]) {
  let g: Gear = freshGear();
  const uid: Record<string, number> = {};
  for (const [id, q] of items) {
    const r = addItem(g, id, q ?? 'standard');
    g = r.gear;
    uid[id] = r.item.uid;
  }
  return { g, uid };
}
const ctx = (g: Gear, o: Partial<Ctx> = {}): Ctx => ({ gear: g, wallet: { scrap: 1000, parts: { 'hornet-stinger': 5, 'hornet-head': 5 } }, aboard: true, ...o });

describe('the Dry dock', () => {
  it('selection keys round-trip, and a bad one is null', () => {
    expect(parseSel(gearKey('comm', 'primary'))).toEqual({ kind: 'gear', who: 'comm', slot: 'primary' });
    expect(parseSel('gear:guard.head')).toEqual({ kind: 'gear', who: 'guard', slot: 'head' });
    expect(parseSel('lug:secondary.1')).toEqual({ kind: 'lug', weapon: 'secondary', i: 1 });
    expect(parseSel('card:type:guard')).toEqual({ kind: 'card', key: 'type:guard' });
    expect(parseSel('relic:r3')).toEqual({ kind: 'relic', uid: 'r3' });
    expect(parseSel('gear:guard.primary')).toBeNull();
    expect(parseSel('gear:nobody.head')).toBeNull();
  });

  it('the roster is the Communicator, then each type owned, with its count and state', () => {
    const r = crew([bot('r1', 'guard'), bot('r2', 'gatherer', { stoked: true }), bot('r3', 'guard', { downed: true }), bot('r4', 'mule', { wreck: true })]);
    const rows = rosterRows(r, freshGear());
    expect(rows.map((x) => x.who)).toEqual(['comm', 'gatherer', 'guard', 'mule']);
    expect(rows.find((x) => x.who === 'guard')).toMatchObject({ n: 2, down: 1, wreck: 0, cold: 1, empty: ['head', 'arms', 'back', 'mobility'] });
    expect(rows.find((x) => x.who === 'gatherer')!.cold).toBe(0);
    expect(rows.find((x) => x.who === 'mule')!.wreck).toBe(1);
  });

  it('each way in opens where the station works', () => {
    const g = freshGear();
    const r = crew([bot('r1', 'gatherer'), bot('r2', 'guard', { downed: true })]);
    expect(openAt('forge', r, g)).toEqual({ sel: 'comm', slot: 'gear:comm.primary' });
    expect(openAt('clinic', r, g)).toEqual({ sel: 'guard', slot: null });
    expect(openAt('workshop', r, g)).toEqual({ sel: 'gatherer', slot: 'gear:gatherer.head' });
    expect(openAt('key', r, g)).toEqual({ sel: 'comm', slot: null });
    expect(openAt('workshop', crew([]), g)).toEqual({ sel: 'comm', slot: null });
    expect(firstEmpty(g, 'comm')).toBe('gear:comm.secondary');
  });

  it("a slot's drawer: the stores (with the swap and a move), what can be made, the shelf", () => {
    const { g: g0, uid } = gearWith(['pipeWrench', 'fine'], ['steamGun'], ['scrapPlating'], ['kettleHelm']);
    let g = equip(g0, uid.steamGun, 'comm', 'secondary');
    g = equip(g, uid.scrapPlating, 'gatherer', 'back');
    const shelf = [{ i: 0, item: 'hornetSpear' as ItemId, q: 'fine' as Quality, price: 9999, left: 1 }, { i: 1, item: 'tazer' as ItemId, q: 'fine' as Quality, price: 10, left: 0 }];
    const prim = slotEntries(ctx(g, { shelf }), { kind: 'gear', who: 'comm', slot: 'primary' });
    expect(prim.worn?.id).toBe('shovel');
    expect(prim.owned.map((e) => `${e.src}:${e.id}`)).toEqual(['owned:pipeWrench', 'swap:steamGun']);
    expect(prim.craft.some((e) => e.id === 'hornetSpear' && !e.short)).toBe(true);
    expect(prim.craft.every((e) => e.src === 'craft')).toBe(true);
    // Short of scrap on the shelf; a sold-out ware is not shown.
    expect(prim.buy.map((e) => [e.id, e.short])).toEqual([['hornetSpear', true]]);
    // Another type's piece moves; the kettle helm is not for robots.
    const back = slotEntries(ctx(g), { kind: 'gear', who: 'guard', slot: 'back' });
    expect(back.owned.map((e) => `${e.src}:${e.id}`)).toEqual(['move:scrapPlating']);
    expect(back.owned[0].from).toBe('gear:gatherer.back');
  });

  it('only taught recipes are offered, and none and no shelf on the sands', () => {
    const { g } = gearWith();
    const taught = (id: ItemId) => id === 'pipeWrench';
    const s = { kind: 'gear', who: 'comm', slot: 'primary' } as const;
    expect(slotEntries(ctx(g, { taught }), s).craft.map((e) => e.id)).toEqual(['pipeWrench']);
    const sands = slotEntries(ctx(g, { aboard: false, shelf: [{ i: 0, item: 'pipeWrench', q: 'fine', price: 1, left: 1 }] }), s);
    expect(sands.craft).toEqual([]);
    expect(sands.buy).toEqual([]);
  });

  it('short of parts greys a recipe', () => {
    const { g } = gearWith();
    const e = slotEntries(ctx(g, { wallet: { scrap: 1000, parts: {} } }), { kind: 'gear', who: 'comm', slot: 'primary' });
    expect(e.craft.find((x) => x.id === 'hornetSpear')!.short).toBe(true);
    expect(e.craft.find((x) => x.id === 'pipeWrench')!.short).toBe(false);
  });

  it('arrows: each chip against what is worn; with nothing worn bonuses are up and drawbacks down', () => {
    const plate = deltas({ id: 'scrapPlating', q: 'standard' });
    const chips = itemWords('scrapPlating').chips.map((c) => c.key);
    expect(chips).toEqual(['armour', 'speed']);
    expect(plate[0]).toBeGreaterThan(0);
    expect(plate[1]).toBeLessThan(0);
    // Kettle helm (armour 6, steam 15) against Grandpa's monocle worn (crit, range): its own stats up, the monocle's two only it had, down.
    const d = deltas({ id: 'kettleHelm', q: 'standard' }, { id: 'monocle', q: 'standard' });
    expect(d.slice(0, 2).every((x) => x > 0)).toBe(true);
    expect(d.slice(2)).toHaveLength(2);
    expect(d.slice(2).every((x) => x < 0)).toBe(true);
    // A weapon against the shovel: damage a hit up for the pipe wrench, the type has no arrow.
    const w = deltas({ id: 'pipeWrench', q: 'standard' }, { id: 'shovel', q: 'standard' });
    expect(w[0]).toBe(0);
    expect(w[1]).toBeGreaterThan(0);
  });

  it("the drawer's one main button goes to the takeable entry with the best arrows", () => {
    const { g } = gearWith(['pipeWrench']);
    const e = slotEntries(ctx(g), { kind: 'gear', who: 'comm', slot: 'primary' });
    const best = bestOf(e)!;
    expect(best.short).toBe(false);
    const net = (x: typeof best) => x.deltas.reduce((n, d) => n + Math.sign(d), 0);
    for (const x of [...e.owned, ...e.craft, ...e.buy]) if (!x.short) expect(net(x)).toBeLessThanOrEqual(net(best));
    expect(bestOf({ owned: [], craft: [{ ...best, short: true }], buy: [] })).toBeNull();
  });

  it('the bulk buttons count and price as the workshop does', () => {
    const r = crew([bot('r1', 'guard'), bot('r2', 'guard', { stoked: true }), bot('r3', 'gatherer', { downed: true }), bot('r4', 'mule', { wreck: true }), bot('r5', 'mule', { wreck: true })]);
    const b = bulk(r, freshHub());
    expect(b.stoke).toEqual({ n: 1, coal: STOKE_COST.coal });
    expect(b.repair).toEqual({ n: 1, scrap: REPAIR.carried.scrap, each: REPAIR.carried.scrap });
    expect(b.rebuild).toEqual({ n: 2, scrap: 2 * REBUILD.scrap, each: REBUILD.scrap });
  });

  it('the Recipes tab lists the taught recipes, weapons first, and searches by name or material', () => {
    const { g } = gearWith();
    const all = recipeList(ctx(g));
    expect(all.length).toBeGreaterThan(10);
    expect(ITEMS[all[0].id].weapon).toBeTruthy();
    const stinger = recipeList(ctx(g), 'stinger').map((r) => r.id);
    expect(stinger).toContain('hornetSpear');
    expect(stinger).not.toContain('kettleHelm');
  });
});
