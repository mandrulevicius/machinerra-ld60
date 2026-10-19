/**
 * The hub's dev commands: `hub <sub> ...` (`__game.cmd('hub rescue all')`; its own word keeps `goto` apart from the built-in
 * scene `goto`), and the workshop's own `workshop ...` (`stations/workshop.ts`). **Add a sub:** one entry in `subs` below,
 * `name: [help, run]`, the help starting with the usage up to a colon. Registered by `Hub.create` through `registerHubCommands`.
 */
import type Phaser from 'phaser';
import { command } from '../../../../harness/dev/commands';
import { getTune, setTune } from '../../../../harness/kit/tune';
import { forgetHubArt, hubArt, hubStrength } from './art/draw';
import { transition } from '../../../../harness/kit';
import { ANOMALIES, CAT, type AnomalyId, type BiomeId, type Enemy, type PartKind } from '../sim/defs';
import { sell as sellParts } from './trade';
import { lineSave, questBook, talkSave, titleSave } from './talkslice';
import { actFacts } from './acts';
import { LINES, activeLines } from './lines';
import { QUESTS, factsFor } from './talk';
import { TITLES, earn, wear } from './titles';
import { features } from './story';
import { RANKED, describeLand, landBoss } from './landings';
import { SLOTS, STATIONS, openLots } from './layout';
import { hub } from './save';
import { CITY_STAGES, NPCS, PERKS, aboard, build, cityStage, freshBuildings, npc, relocate, rescue, unrescue, type HubState } from './state';
import { BUILDINGS, BUILDING_IDS, PRICE_STOCK, isBuildingId, offer, priceOf, raise, slotsOf, slotsUsed, tearDown, type BuildingId } from './buildings';
import { CITY_PERKS, CITY_PERK_IDS, STAGES, crowdOf, districtOf, finishDistrict, grantPerk, offerPerks, picksOwed, pour, scrapMul, setStage, stageOf, whyLocked } from './district';
import { buildBlueprint, economy } from './economy';
import { load } from './expeditions';
import { catLine, hasCat, hasDog } from './companions';
import { isTaught, recipesOf, waitingNote } from './taught';
import { hubLook, moodOf } from './hublight';
import type { Conversation } from './dialog';
import type { TalkView } from './talkview';
import type { HubHost, Thing } from './stations/host';
import { openFor } from './stations/npc';
import { openRedraw } from './stations/planner';
import { buyWare, keepStall, shelfNow, stall } from './stations/trader';
import { workshopCommand } from './stations/workshop';

/** What the dev commands reach on the hub beyond a station's `HubHost`: the conversation, the cut scene, the dev overrides. */
export interface HubDevHost extends HubHost {
  readonly me: Phaser.GameObjects.Image;
  readonly scene: Phaser.Scenes.ScenePlugin;
  readonly textures: Phaser.Textures.TextureManager;
  readonly convo: { id: string; c: Conversation } | null;
  readonly tv: TalkView | null;
  readonly cut: (() => void) | null;
  readonly near: Thing | null;
  use(t: Thing): void;
  talkTo(id: string): void;
  advance(): void;
  leaveTalk(): void;
  stolen(): void;
  outro(): void;
  keepStory(): void;
  showTitle(): void;
  spotOf(id: string): { x: number; y: number } | null;
  savePos(x: number, y: number): void;
  /** A dev override on the picked land's anomaly or tier (kept until the scene restarts). */
  override(o: { anomaly?: AnomalyId; tier?: number }): void;
  /** A dev change to what is open: the bosses down (saved). */
  setBosses(bosses: string[]): void;
  /** The save changed under the scene (`hub wipe`). */
  reload(): void;
}

/** Set a stock at home (saved): the HUD's stores and an open station panel redraw at once, so a shop sees the new value. */
function setStock(host: HubDevHost, what: 'scrap' | 'copper' | 'coal', n: string | undefined) {
  const v = Math.max(0, Math.floor(Number(n)));
  if (n === undefined || !Number.isFinite(v)) return `error: ${what} <n>; now ${economy.get()[what]}`;
  economy.set({ ...economy.get(), [what]: v });
  host.refresh();
  const open = host.hud.panelKind;
  if (open && STATIONS.some((st) => st.id === open)) host.openStation(open as never);
  return `${what} at home ${v}`;
}

type Sub = [help: string, run: (a: string[]) => string];

const places = (): string[] => [...STATIONS.map((s) => s.id), ...NPCS.map((n) => n.id), 'hatch'];
const stationsOf = (s: HubState) => Object.entries(s.stations).map(([n, l]) => `${n}@${l}`).join(', ');

export function registerHubCommands(host: HubDevHost) {
  const ids = ['all', ...NPCS.filter((n) => !n.always).map((n) => n.id)];
  const where = places();
  const lookLine = () => `hub light: mood ${hubLook.get().mood}${hubLook.get().mood === 'auto' ? ` (visit ${host.s.missions}: ${moodOf(host.s.missions)})` : ''}, cone ${hubLook.get().cone ? 'on' : 'off'}`;
  const subs: Record<string, Sub> = {
    rescue: [
      'rescue <id|all>: an NPC is rescued and lives in the hub (saved)',
      ([id]) => {
        host.save(rescue(host.s, id ?? 'all'));
        return `aboard: ${aboard(host.s).map((n) => n.id).join(', ')}`;
      },
    ],
    unrescue: [
      'unrescue <id|all>: send an NPC away again (saved)',
      ([id]) => {
        host.save(unrescue(host.s, id ?? 'all'));
        return `aboard: ${aboard(host.s).map((n) => n.id).join(', ')}`;
      },
    ],
    recipes: [
      'recipes [open|close]: which workbench recipes are taught (Hob weapons, Gasket body parts, Sprocket crew pieces once their stations stand; a few basics always); open lists every one, close goes back to the stations (not saved)',
      ([v]) => {
        if (v === 'open' || v === 'close') setTune('allRecipes', v === 'open');
        else if (v) return 'error: recipes [open|close]';
        const all = !!getTune('allRecipes')?.value;
        const teach = (['basics', 'hob', 'gasket', 'sprocket'] as const).map((t) => `${t} ${recipesOf(t).filter((id) => isTaught(host.s, id, all)).length}/${recipesOf(t).length}`);
        return `recipes taught: ${teach.join(', ')}${all ? ' (dev: all open)' : ''}${waitingNote(host.s, all) ? `; ${waitingNote(host.s, all)}` : ''}`;
      },
    ],
    cutscene: [
      'cutscene: play the blessing cut scene (the Evil Oracle takes the wife) as a preview: the quest and the save are not changed',
      () => {
        if (host.cut) return 'a cut scene is already playing';
        if (host.convo) return 'end the conversation first';
        host.stolen();
        return 'cut scene playing (Esc skips)';
      },
    ],
    outro: [
      'outro: play the outro (last boss, thanks, time to finish, credits); keeps the time to finish if the run had none',
      () => (host.outro(), 'outro playing'),
    ],
    story: [
      'story <step|done>: jump the main quest (hub/story.ts) to a step (1-11) and open what it has opened; boss kills, the house and the wife are not changed',
      ([n]) => {
        const t = talkSave.get();
        const step = n === 'done' ? 99 : Math.max(1, Math.min(11, Math.floor(Number(n ?? 1))));
        talkSave.set({ ...t, quests: { ...t.quests, main: step } });
        host.keepStory();
        host.refresh();
        return `main quest at step ${step}: ${[...features(talkSave.get())].join(', ') || 'nothing open yet'}`;
      },
    ],
    city: [
      'city <n>: set the copper the D-city has grown on (it grows with it once the Expeditioner is aboard)',
      ([n]) => {
        host.save({ ...host.s, city: Math.max(0, Math.floor(Number(n ?? 0))) });
        const st = cityStage(host.s, host.allRescued);
        return `city ${host.s.city} copper, stage ${st} (${CITY_STAGES[st].name})`;
      },
    ],
    mood: [
      'mood [auto|day|evening|night]: the hub\'s light (auto: the first visit is day, each later homecoming a random mood seeded by the visit - `moodOf` in hublight.ts; saved in this browser; the F10 Game tab has it too)',
      ([v]) => {
        if (v === 'auto' || v === 'day' || v === 'evening' || v === 'night') hubLook.set({ mood: v });
        else if (v) return 'error: mood [auto|day|evening|night]';
        return lookLine();
      },
    ],
    cone: [
      'cone [on|off]: the lantern a cone that lights only the way he faces (evening and night), a small glow at his feet; no word flips it (saved in this browser)',
      ([v]) => (hubLook.set({ cone: v === 'on' ? true : v === 'off' ? false : !hubLook.get().cone }), lookLine()),
    ],
    blueprints: [
      'blueprints [draw <id>|up <id>|done <id>|clear]: the D-city\'s buildings (P41): no word lists this visit\'s three, the slots and what stands; draw pays and goes up as scaffolding (as the Planner\'s panel); up/done put one straight up as scaffolding or finished (free, any slot); clear empties the city and this visit\'s pick',
      ([what, id]) => {
        const all = host.allRescued;
        if (what === 'clear') {
          host.save({ ...host.s, buildings: freshBuildings() });
          return 'the city is empty';
        }
        if (what === 'draw' || what === 'up' || what === 'done') {
          if (!isBuildingId(id)) return `error: buildings are ${BUILDING_IDS.join(', ')}`;
          if (what === 'draw') {
            try {
              host.pay(buildBlueprint({ eco: economy.get(), hub: host.s }, id, titleSave.get(), all));
            } catch (e) {
              return `error: ${(e as Error).message}`;
            }
          } else host.save(raise(host.s, id, what === 'done'));
          return `${BUILDINGS[id].name}: ${what === 'draw' || what === 'up' ? 'going up' : 'stands'}`;
        }
        const b = host.s.buildings;
        return [
          `this visit (${host.s.missions}) offers: ${offer(host.s).join(', ') || 'nothing (one is drawn up already, or all are built)'}`,
          `slots ${slotsUsed(host.s)} of ${slotsOf(host.s, all)}; stand: ${b.built.join(', ') || '-'}; going up: ${b.raising.join(', ') || '-'}; picked at visit ${b.pickedAt}`,
          `prices (${PRICE_STOCK}): ${BUILDING_IDS.map((x) => `${x} ${priceOf(x, titleSave.get())}`).join(', ')}`,
        ].join('\n');
      },
    ],
    tear: [
      'tear <building id>: Rebuild (P55 B): a standing building comes down for nothing back and its slot is free (as the Planner\'s panel)',
      ([id]) => {
        try {
          host.save(tearDown(host.s, id ?? '', host.allRescued));
        } catch (e) {
          return `error: ${(e as Error).message}`;
        }
        return `${BUILDINGS[id as BuildingId].name} torn down; slots ${slotsUsed(host.s)} of ${slotsOf(host.s, host.allRescued)}`;
      },
    ],
    district: [
      `district [<0-5>|pour <n>|perk <id>|up]: the Rising District (P55 B): no word shows it; a number puts that many stages straight up (free); pour pays copper as the Planner's lever does; perk takes a city perk straight (${CITY_PERK_IDS.join(', ')}); up lets the stage going up stand, as the next lift would`,
      ([what, a]) => {
        if (what === 'pour') {
          try {
            host.pay(pour({ eco: economy.get(), hub: host.s }, Math.floor(Number(a ?? 0)), host.allRescued));
          } catch (e) {
            return `error: ${(e as Error).message}`;
          }
        } else if (what === 'perk') {
          if (!a || !(a in CITY_PERKS)) return `error: perks are ${CITY_PERK_IDS.join(', ')}`;
          host.save(grantPerk(host.s, a));
        } else if (what === 'up') host.save(finishDistrict(host.s).hub);
        else if (what !== undefined) {
          if (!/^[0-5]$/.test(what)) return 'error: district [<0-5>|pour <n>|perk <id>|up]';
          host.save(setStage(host.s, Number(what)));
        }
        const d = districtOf(host.s);
        const st = stageOf(d);
        return `${d.stage} of ${STAGES.length} stages stand${st ? `; ${st.name}: ${d.raising ? 'going up' : `${d.poured} of ${st.price} copper poured`}` : ''}; ${crowdOf(d)} civilians, scrap x${scrapMul(d).toFixed(1)}; perks ${d.perks.join(', ') || '-'}; ${picksOwed(d)} pick(s) owed ${offerPerks(host.s).join('/') || ''}; ${whyLocked(host.s, host.allRescued) ?? 'open'}`;
      },
    ],
    expedition: [
      'expedition [feed <n>|set <load> <out>]: the colony\'s expedition (P41): no word shows it; feed moves coal from the stores to the load (negative takes back); set puts the load and the coal already out straight in (dev, no stock moves); it departs with the lift and returns with the next',
      ([what, a, b]) => {
        if (what === 'feed') {
          try {
            host.pay(load({ eco: economy.get(), hub: host.s }, Math.floor(Number(a ?? 0)), host.allRescued));
          } catch (e) {
            return `error: ${(e as Error).message}`;
          }
        } else if (what === 'set') host.save({ ...host.s, expedition: { ...host.s.expedition, load: Math.max(0, Math.floor(Number(a ?? 0))), out: Math.max(0, Math.floor(Number(b ?? 0))) } });
        else if (what) return 'error: expedition [feed <n>|set <load> <out>]';
        const e = host.s.expedition;
        return `coal in the stores ${economy.get().coal}; fed for the next lift ${e.load}; out now ${e.out}; charted: ${e.charted.join(', ') || 'none'}`;
      },
    ],
    civilians: [
      'civilians <n>: set how many civilians (the Lost Expedition\'s husks brought home) walk the D-city window (saved)',
      ([n]) => {
        host.save({ ...host.s, civilians: Math.max(0, Math.floor(Number(n ?? 0))) });
        return `${host.s.civilians} civilians`;
      },
    ],
    copper: ['copper <n>: set the copper at home (saved; stores and an open shop redraw)', ([n]) => setStock(host, 'copper', n)],
    scrap: ['scrap <n>: set the scrap at home (saved; stores and an open shop redraw)', ([n]) => setStock(host, 'scrap', n)],
    coal: ['coal <n>: set the coal at home (saved; stores and an open shop redraw)', ([n]) => setStock(host, 'coal', n)],
    goto: [
      `goto <${where.join('|')}>: put the Communicator there`,
      ([id]) => {
        const p = host.spotOf(id ?? 'hatch');
        if (!p) return `error: places are ${where.join(', ')}`;
        if (!host.scene.isActive()) {
          transition(host, 'Hub', { at: id });
          return `to the hub, at ${id}`;
        }
        host.hud.close();
        host.me.setPosition(p.x, p.y);
        host.savePos(p.x, p.y);
        host.cameras.main.centerOn(p.x, p.y - 30);
        return `Communicator at ${id}`;
      },
    ],
    slots: [
      'slots: the building lots, what stands on each, and which are open to build on',
      () => {
        const open = openLots(Object.values(host.s.stations)).map((l) => l.id);
        const on = Object.fromEntries(Object.entries(host.s.stations).map(([id, l]) => [l, id]));
        return SLOTS.map((s) => `${s.id} ${s.w}x${s.h}${on[s.id] ? ` ${on[s.id]}'s station` : open.includes(s.id) ? ' open' : ''}`).join('\n');
      },
    ],
    build: [
      "build <id|all> [lot]: build an NPC's station free (dev; rescues them first), on the given lot or the first open one",
      ([id, lot]) => {
        const some = id === 'all' ? NPCS.filter((n) => n.station).map((n) => n.id) : [id];
        let s = host.s;
        for (const one of some) {
          if (!npc(one)?.station) return `error: no station for ${one}`;
          if (s.stations[one]) continue;
          s = rescue(s, one);
          s = build(s, one, lot && some.length === 1 ? lot : openLots(Object.values(s.stations))[0].id);
        }
        host.save(s);
        return `stations: ${stationsOf(host.s)}`;
      },
    ],
    relocate: [
      'relocate <id> <lot>: the City Planner moves the station of that NPC to a free lot, or swaps it with the one there; redraw: opens her map',
      ([id, lot]) => {
        if (id === 'redraw' || !id) return openRedraw(host), 'redraw panel open';
        try {
          host.moveStations(relocate(host.s, id, lot, host.allRescued));
        } catch (e) {
          return `error: ${(e as Error).message}`;
        }
        return `stations: ${stationsOf(host.s)}`;
      },
    ],
    perks: [
      'perks [all]: what the stations gave (all: every perk, dev)',
      ([a]) => {
        if (a === 'all') host.save({ ...host.s, perks: Object.keys(PERKS) as HubState['perks'] });
        return `perks: ${host.s.perks.join(', ') || 'none'}`;
      },
    ],
    companion: [
      'companion <dog|cat> [off]: make the dog or the cat yours (or not), as a lift home with it would (P42); no argument: who is aboard and the cat count in the Oracle church',
      ([who, off]) => {
        const id = who === 'dog' ? 'companionDog' : who === 'cat' ? 'companionCat' : null;
        if (who && !id) return 'error: companion <dog|cat> [off]';
        if (id) host.save({ ...host.s, perks: off === 'off' ? host.s.perks.filter((p) => p !== id) : [...new Set([...host.s.perks, id])] as HubState['perks'] });
        return `dog ${hasDog(host.s) ? 'aboard' : 'no'}, cat ${hasCat(host.s) ? 'aboard' : 'no'}${hasCat(host.s) ? `, home pays ${CAT.home} scrap` : ''}; cat count ${questBook.get().cats}: ${catLine(questBook.get().cats)}`;
      },
    ],
    talk: [
      `talk <${NPCS.map((n) => n.id).join('|')}>: start that NPC's conversation (as the Use key beside them)`,
      ([id]) => {
        if (!npc(id ?? '')) return `error: NPCs are ${NPCS.map((n) => n.id).join(', ')}`;
        if (host.convo) return 'error: already talking (hub bye)';
        if (!host.hud.attached) return 'error: the hub is not running';
        host.hud.close();
        host.talkTo(id);
        return `talking to ${id}`;
      },
    ],
    panel: [
      `panel <${NPCS.filter((n) => n.station || n.panel).map((n) => n.id).join('|')}|command|window|workshop>: open a station panel directly, no talk first (an NPC's: their offer panel, or the build panel while their station is not built)`,
      ([id]) => {
        if (host.convo) return 'error: talking (hub bye)';
        if (!host.hud.attached) return 'error: the hub is not running';
        if (id === 'command' || id === 'window' || id === 'workshop') host.openStation(id);
        else if (npc(id ?? '')?.station || npc(id ?? '')?.panel) openFor(host, id);
        else return `error: panels are ${NPCS.filter((n) => n.station || n.panel).map((n) => n.id).join(', ')}, command, window, workshop`;
        return `panel ${host.hud.panelKind ?? 'none'} open`;
      },
    ],
    next: [
      'next: finish the line being typed, then the next (as a click)',
      () => (host.convo ? (host.advance(), JSON.stringify(host.tv?.state())) : 'error: not talking'),
    ],
    pull: [
      'pull <n>: pull lever n (0 is the first) as a click would',
      ([n]) => {
        if (!host.convo || !host.tv?.choosing) return 'error: no levers showing';
        host.tv.pull(Number(n ?? 0));
        return `pulled ${n ?? 0}`;
      },
    ],
    bye: ['bye: walk away from the conversation (Esc)', () => (host.convo ? (host.leaveTalk(), 'left') : 'not talking')],
    flags: [
      'flags [name [n]]: every conversation flag and quests (saved); with a name, set it (default 1)',
      ([name, n]) => {
        const t = talkSave.get();
        if (name) talkSave.set({ ...t, flags: { ...t.flags, [name]: n === undefined ? 1 : Number(n) } });
        return JSON.stringify(talkSave.get());
      },
    ],
    quest: [
      `quest <${Object.keys(QUESTS).join('|')}> <step|done|none>: move a quest (saved)`,
      ([id, step]) => {
        if (!QUESTS[id ?? '']) return `error: quests are ${Object.keys(QUESTS).join(', ')}`;
        const t = talkSave.get();
        const quests = { ...t.quests };
        if (step === 'none') delete quests[id];
        else quests[id] = step === 'done' ? 99 : Number(step);
        talkSave.set({ ...t, quests });
        return JSON.stringify(talkSave.get().quests);
      },
    ],
    title: [
      `title [id|none|earn <id>]: the worn title and those earned (saved); id wears one, earn grants one (${Object.keys(TITLES).join(', ')})`,
      ([a, b]) => {
        let t = titleSave.get();
        if (a === 'earn') {
          if (!TITLES[b ?? '']) return `error: titles are ${Object.keys(TITLES).join(', ')}`;
          t = earn(t, b!);
        } else if (a === 'none') t = wear(t, null);
        else if (a) {
          if (!t.earned.includes(a)) return `error: not earned (earned: ${t.earned.join(', ') || 'none'})`;
          t = wear(t, a);
        }
        titleSave.set(t);
        if (host.hud?.attached) host.showTitle();
        return JSON.stringify(t);
      },
    ],
    book: [
      "book [<field> <n>]: the quest book (P38: wares sold and bought, best robots home, fragments, the Oracle's advice) and which acts are open or done; with a field and n, set it (a number; frags takes n fragments; saved)",
      ([field, n]) => {
        const b = questBook.get();
        if (field) {
          if (field === 'items') questBook.set({ ...b, items: (n ?? '').split(',').filter(Boolean) });
          else if (field === 'frags') questBook.set({ ...b, frags: Array.from({ length: Math.max(0, Number(n ?? 0)) }, (_, i) => `dev:${i}`) });
          else if (typeof (b as unknown as Record<string, unknown>)[field] === 'number') questBook.set({ ...b, [field]: Number(n ?? 0) });
          else throw new Error(`book <${Object.keys(b).filter((k) => typeof (b as unknown as Record<string, unknown>)[k] === 'number').join('|')}|frags> <n>`);
        }
        const acts = actFacts(host.s, questBook.get());
        return JSON.stringify({ book: questBook.get(), acts: [1, 2, 3, 4, 5].map((i) => `${i}:${acts[`act.${i}.done`] ? 'done' : acts[`act.${i}.open`] ? 'open' : 'closed'}`).join(' ') });
      },
    ],
    forget: ['forget: clear every conversation flag and quest (saved)', () => (talkSave.set({ flags: {}, quests: {} }), lineSave.set({}), 'conversations forgotten')],
    lines: [
      'lines [<line> <n>]: the NPC quest lines, step and progress; with a line and n, set the count of its current step (saved)',
      ([id, n]) => {
        const t = talkSave.get();
        if (id) {
          if (!LINES[id]) return `error: no line "${id}" (${Object.keys(LINES).join(', ')})`;
          const step = t.quests[id] ?? 0;
          if (!(step >= 1 && step <= LINES[id].steps.length)) return `error: ${id} has no active step (hub quest ${id} 1 starts it)`;
          lineSave.set({ ...lineSave.get(), [id]: { step, n: Number(n ?? 0) } });
        }
        return JSON.stringify(activeLines(talkSave.get(), lineSave.get(), factsFor(host.s, '')));
      },
    ],
    use: [
      'use: use what is in reach (as the Use key)',
      () => {
        if (!host.near) return 'error: nothing in reach';
        host.use(host.near);
        return `used ${host.near.id}`;
      },
    ],
    shop: ["shop: the Trader's shelf this lift (index, ware, price, left), her tier and your scrap", () => JSON.stringify(shelfNow(host))],
    buy: ["buy <i>: buy ware i off the Trader's shelf (as a click; her stall need not be built)", ([i]) => `bought ${buyWare(host, Number(i ?? 0))}; ${economy.get().scrap} scrap left`],
    sell: [
      'sell <part> [n]: sell parts to the Trader',
      ([k, n]) => {
        keepStall(host, sellParts(stall(host), k as PartKind, n === undefined ? 1 : Number(n)));
        return `${economy.get().scrap} scrap`;
      },
    ],
    close: ['close: close the open panel', () => (host.hud.panel ? (host.closePanel(), 'closed') : 'no panel')],
    lands: [
      'lands: the opened lands (the picked one marked) with tier, anomaly, seed, boss and stranded NPC, and any dev override',
      () => host.lands().map((l) => `${l.biome === host.landing().biome ? '>' : ' '} ${l.biome}: ${describeLand(l)}`).join('\n'),
    ],
    land: [
      `land <id>: pick an opened land (${RANKED.join(', ')}, ether) as a click on the course table does`,
      ([id]) => {
        const l = host.lands().find((x) => x.biome === id);
        if (!l) throw new Error(`land ${host.lands().map((x) => x.biome).join(' | ')} (open one with: open <id>)`);
        host.pickLand(l.biome);
        return describeLand(host.landing());
      },
    ],
    open: [
      "open <id|all>: open a land by putting down the bosses of the lands before it (saved; the Ether is the story's: hub story)",
      ([id]) => {
        const at = id === 'all' ? RANKED.length - 1 : RANKED.indexOf(id as BiomeId);
        if (at < 0) throw new Error(`open ${RANKED.join(' | ')} | all`);
        const before = RANKED.slice(0, id === 'all' ? at + 1 : at).map(landBoss).filter((b): b is Enemy => !!b);
        host.setBosses([...new Set([...host.s.story.bosses, ...before])]);
        return `open: ${host.lands().map((l) => l.biome).join(', ')}`;
      },
    ],
    lock: [
      'lock <id>: lock a land and every land past it (saved): the boss before it is up again',
      ([id]) => {
        const at = RANKED.indexOf(id as BiomeId);
        if (at < 1) throw new Error(`lock ${RANKED.slice(1).join(' | ')}`);
        const up: string[] = RANKED.slice(at - 1).map(landBoss).filter((b): b is Enemy => !!b);
        host.setBosses(host.s.story.bosses.filter((b) => !up.includes(b)));
        return `open: ${host.lands().map((l) => l.biome).join(', ')}`;
      },
    ],
    boss: [
      'boss [list|<enemy>|all|none]: the bosses down (saved; a kind toggles): hornet, gorilla, knight, bear, drone (the Harbinger), evilOracle',
      ([b]) => {
        const kinds: string[] = [...RANKED, 'ether' as BiomeId].map(landBoss).filter((k): k is Enemy => !!k);
        if (b === 'all') host.setBosses([...new Set([...host.s.story.bosses, ...kinds])]);
        else if (b === 'none') host.setBosses([]);
        else if (b && b !== 'list') {
          if (!kinds.includes(b)) throw new Error(`boss ${kinds.join(' | ')} | all | none`);
          host.setBosses(host.s.story.bosses.includes(b) ? host.s.story.bosses.filter((x) => x !== b) : [...host.s.story.bosses, b]);
        }
        return `down: ${host.s.story.bosses.join(', ') || 'none'}`;
      },
    ],
    anomaly: [
      `anomaly <id>: the picked land gets this anomaly (${Object.keys(ANOMALIES).join(', ')}); not saved`,
      ([id]) => {
        if (!(id in ANOMALIES)) throw new Error(`anomaly ${Object.keys(ANOMALIES).join(' | ')}`);
        host.override({ anomaly: id as AnomalyId });
        return describeLand(host.landing());
      },
    ],
    tier: [
      "tier <1-3>: the picked land's threat tier; not saved",
      ([n]) => {
        const t = Number(n);
        if (!Number.isInteger(t) || t < 1 || t > 3) throw new Error('tier 1-3');
        host.override({ tier: t });
        return describeLand(host.landing());
      },
    ],
    launch: ['launch: lower the lift to the next course (free)', () => `lift down to sands ${host.launch()}`],
    art: [
      'art [0..1]: how much of the house style the hub art takes (0 his art, 1 the full pass; needs `?v.hubart=house`); redraws it and restarts the hub',
      ([n]) => {
        if (n === undefined) return `hub art ${hubStrength()} (${hubArt.name})`;
        if (!setTune('hubart', n)) throw new Error('art <0..1>');
        if (hubArt.name !== 'house') hubArt.set('house');
        forgetHubArt(host);
        host.scene.restart();
        return `hub art ${hubStrength()}, hub restarting`;
      },
    ],
    wipe: [
      'wipe: forget the hub save (rescued, stores, totals)',
      () => {
        hub.reset();
        host.reload();
        return 'hub save wiped';
      },
    ],
  };
  const usage = Object.values(subs).map(([h]) => h.split(':')[0]);
  command('hub', ([sub, ...rest]) => {
    const c = subs[sub];
    if (!c) return `error: hub ${usage.join(' | ')}`;
    try {
      return c[1](rest);
    } catch (e) {
      return `error: ${(e as Error).message}`;
    }
  }, `hub <${Object.keys(subs).join('|')}> ...: the D-hub (${usage.join('; ')}); rescue ids: ${ids.join(', ')}`, { group: 'hub', args: () => Object.keys(subs) });
  workshopCommand(host);
}
