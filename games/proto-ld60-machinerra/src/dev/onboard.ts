/**
 * Dev commands, group `onboard`: the HUD's reveals, the world's cues, the pickup fanfare and the lessons (`sim/onboard.ts`, `cueview.ts`, `fanfare.ts`, `sim/lessons.ts`).
 * Add one: a `command(...)` in this file's function; `dev/index.ts` registers it with the scene.
 */
import { command } from '../../../../harness/dev/commands';
import type { Play } from '../Play';
import { ITEMS, QUALITY_ORDER, type ItemId, type Quality } from '../sim/gear';
import { HUD_IDS, isHudId, type HudId } from '../sim/onboard';
import { gates } from '../sim/lessons';
import { T } from '../sim/defs';

export function onboardCommands(play: Play) {
  const sim = play.sim, ob = sim.onboard, g = { group: 'onboard' };
  const ids = (what: string | undefined): HudId[] | null => (what === 'all' ? [...HUD_IDS] : what && isHudId(what) ? [what] : null);
  const state = () => `up: ${ob.revealed.join(' ') || 'nothing'}${ob.empty ? ' (this run started empty)' : ''}`;
  command('hud', ([what, id]) => {
    if (!what) return `${state()}; held back: ${HUD_IDS.filter((q) => !ob.shows(q)).join(' ') || 'nothing'}`;
    if (what === 'reveal' || what === 'hide') {
      const list = ids(id);
      if (!list) return `error: hud ${what} <${HUD_IDS.join('|')}|all>`;
      if (what === 'reveal') ob.reveal(...list);
      else ob.hide(...list);
      return state();
    }
    return 'error: hud [reveal|hide <id|all>]';
  }, `hud [reveal|hide <id|all>]: which HUD elements are up (ids: ${HUD_IDS.join(', ')}); a reveal arrives with a highlight; a resource shows once carried`, { ...g, args: () => ['reveal', 'hide', ...HUD_IDS, 'all'] });

  command('cue', ([what, a, b]) => {
    const c = sim.controller;
    if (what === 'list' || !what) return ob.summary().cues.join('; ') || 'no cues (cue <icon|-> [action])';
    if (what === 'take') {
      const list = a === 'all' ? ob.cues.filter((q) => !q.taken) : ob.cues.filter((q) => q.id === Number(a) || (a === undefined && q === ob.glowing));
      for (const q of list) ob.take(q.id);
      return `taken ${list.map((q) => q.id).join(', ') || 'nothing'}; glowing: ${ob.glowing?.id ?? 'none'}`;
    }
    // A cue two tiles ahead of him (where he faces), then further along for the next one: `cue scrapgob`, `cue - use`, `cue gear-shovel`.
    const k = ob.cues.length + 2;
    const x = c.x + Math.cos(sim.facing) * T * k, y = c.y + Math.sin(sim.facing) * T * k;
    const at = sim.passableNear(x, y);
    const id = ob.cue({ x: at.x, y: at.y + 14, icon: what === '-' ? '' : what, ...(a && { key: a }), ...(b === 'wall' && { wall: true }) });
    return `cue ${id} at ${Math.round(at.x)},${Math.round(at.y)}${ob.glowing?.id === id ? ' (glows)' : ' (waits)'}`;
  }, 'cue <icon|-> [action] [wall] | take [id|all] | list: place a cue ahead of him (icon a texture key: scrapgob, gear-shovel, oilcan; action an input: use, kick, fire), take the glowing one (or id, or all)', { ...g, args: () => ['scrapgob', 'gear-shovel', 'oilcan', '-', 'take', 'list'] });

  command('fanfare', ([what, n, quality]) => {
    const c = sim.controller;
    if (what === 'item') {
      const id = n ?? 'shovel';
      if (!(id in ITEMS)) return `error: fanfare item <item id> [quality]; ids: ${Object.keys(ITEMS).slice(0, 12).join(' ')} ...`;
      const q = QUALITY_ORDER.includes(quality as Quality) ? (quality as Quality) : 'standard';
      ob.item({ id: id as ItemId, quality: q, x: c.x + 120, y: c.y - 20 });
      return `item ${ITEMS[id as ItemId].name} (${q})`;
    }
    const slot = what;
    if (slot !== 'scrap' && slot !== 'copper' && slot !== 'coal' && slot !== 'parts') return 'error: fanfare <scrap|copper|coal|parts> [n] | item [name] [standard|fine|rare|epic|legendary]';
    const amount = Math.max(1, Math.floor(Number(n) || 5));
    if (slot === 'scrap') sim.scrap += amount;
    else if (slot === 'copper') sim.copper += amount;
    else if (slot === 'coal') sim.coal += amount;
    else sim.stats.parts = (sim.stats.parts ?? 0) + amount;
    play.fanfare.fly(slot, amount, c.x + 140, c.y - 10);
    return `${slot} +${amount} flies to its slot`;
  }, 'fanfare <scrap|copper|coal|parts> [n] | item [item id] [quality]: a gain flies to its slot, or an item hovers over him (`drop scrap` and `drop core` play the real thing)', { ...g, args: () => ['scrap', 'copper', 'coal', 'parts', 'item'] });

  command('lessons', ([what, n]) => {
    const L = sim.lessons;
    if (what === 'flown' && n !== undefined) {
      L.flown = Math.max(0, Math.floor(Number(n)) || 0);
      gates(sim);
      if (L.open('map')) ob.reveal('map');
      if (L.open('barrage')) ob.reveal('support');
    } else if (what === 'go') L.hush = null;
    else if (what) return 'error: lessons [flown <n>|go]';
    return JSON.stringify(L.summary());
  }, 'lessons [flown <n>|go]: what is taught on this mission (missions flown: 2 opens the map and command mode, 3 the call; ?flown=<n> starts a mission so), `go` ends an Oracle pause', { ...g, args: () => ['flown', 'go'] });
}
