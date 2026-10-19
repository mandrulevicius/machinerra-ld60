/**
 * The `dock` dev command (group `dock`, both scenes): open the Dry dock on a way in or on an entry and slot, pick, take a drawer
 * entry (fit, craft and fit, buy and fit), craft, hold Alt over a tooltip, read its state. It drives the dock's own actions, so a
 * test does what a click does.
 */
import { command } from '../../../../harness/dev/commands';
import { CREW_ROLES, ITEMS, type ItemId } from '../sim/gear';
import type { Inventory } from '../inventory';
import { parseSel, type From, type Who } from './dock';
import type { DryDock } from './dockview';

const FROMS: From[] = ['forge', 'clinic', 'workshop', 'key'];

export function dockCommands(dock: DryDock, inv: Inventory) {
  const state = () => JSON.stringify(dock.state());
  const subs: Record<string, (a: string[]) => string> = {
    open: ([at, slot]) => {
      if (!at || FROMS.includes(at as From)) {
        inv.showDock((at as From) ?? 'key');
        return state();
      }
      if (at !== 'comm' && !CREW_ROLES.includes(at as never)) return `error: dock open <${FROMS.join('|')}|comm|<role>> [slot key]`;
      inv.showDock('dev');
      if (slot) dock.pickSlot(slot.includes(':') ? slot : `gear:${at}.${slot}`);
      else dock.pick(at as Who);
      return state();
    },
    pick: ([key]) => {
      if (!parseSel(key)) return 'error: dock pick <gear:comm.primary|gear:guard.head|lug:primary.0|card:comm:0|card:type:guard|relic:<uid>|bot:<uid>>';
      if (!dock.open) inv.showDock('dev');
      dock.pickSlot(key);
      return state();
    },
    take: ([id, src]) => {
      const s = parseSel(dock.slot);
      if (s?.kind !== 'gear') return 'error: pick a gear slot first (dock open <who> <slot>)';
      if (!(id in ITEMS)) return 'error: dock take <item> [owned|swap|move|craft|buy]';
      return dock.takeById(id as ItemId, src) ? state() : `cannot: ${dock.state().note}`;
    },
    craft: ([id]) => {
      if (!(id in ITEMS)) return 'error: dock craft <item>';
      return dock.craft(id as ItemId) ? state() : `cannot: ${dock.state().note}`;
    },
    off: () => (dock.takeOff() ? state() : `cannot: ${dock.state().note}`),
    bulk: ([what]) => (dock.bulkDo(what as 'stoke') ? state() : `cannot: ${dock.state().note}`),
    alt: ([on]) => {
      dock.alt(on !== 'off');
      return JSON.stringify(dock.state().tip);
    },
    tip: (sel) => dock.hoverOn(sel.join(' ')) || '(no tip)',
    state: () => state(),
    close: () => (inv.hide(), 'closed'),
  };
  return command(
    'dock',
    ([sub = 'state', ...rest]) => (subs[sub] ? subs[sub](rest) : `error: dock ${Object.keys(subs).join(' | ')}`),
    'dock [open [forge|clinic|workshop|key|comm|<role> [slot]]|pick <key>|take <item> [owned|swap|move|craft|buy]|craft <item>|off|bulk stoke|repair|rebuild|alt [on|off]|tip <css selector>|state|close]: the Dry dock: open it, pick a slot, fit or craft-and-fit from the drawer, read it',
    { group: 'dock', args: () => [...Object.keys(subs), ...FROMS, 'comm', ...CREW_ROLES] },
  );
}
