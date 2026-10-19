/**
 * The relationship track's dev command (P52, group `quest`): `bond` alone lists every NPC's steps lit; `bond <npc> <0-5>` sets a track
 * (saved; the gauge redraws when its panel opens, a gift waits for the NPC's next talk); `bond <npc> hand` lights the next step as a
 * handed-in quest would (with the banner and click `Hub.bondUp` gives it).
 */
import { command } from '../../../../harness/dev/commands';
import { BONDS, STEPS, bondOf, giftWaiting, setBond } from './bonds';
import { bondSave, talkSave } from './talkslice';

export function registerBondCommand(handIn: (npc: string) => void, changed: () => void) {
  const ids = Object.keys(BONDS);
  return command(
    'bond',
    ([id, n]) => {
      if (!id) {
        const b = bondSave.get();
        return Object.fromEntries(ids.map((i) => [i, `${bondOf(b, i)}/${STEPS} ${bondOf(b, i) > 0 ? BONDS[i].steps[bondOf(b, i) - 1] : ''}${giftWaiting(bondOf(b, i), i, talkSave.get().flags) ? ' (gift waits)' : ''}`.trim()]));
      }
      if (!BONDS[id]) return `error: bond <${ids.join('|')}> <0-${STEPS}|hand>`;
      if (n === 'hand') {
        handIn(id);
        return `${id}: ${bondOf(bondSave.get(), id)}/${STEPS}`;
      }
      if (n === undefined || !Number.isFinite(Number(n))) return `error: bond ${id} <0-${STEPS}|hand>`;
      bondSave.set(setBond(bondSave.get(), id, Number(n)));
      changed();
      return `${id}: ${bondOf(bondSave.get(), id)}/${STEPS}`;
    },
    `bond [<npc> <0-${STEPS}|hand>]: the relationship tracks (no argument: list them); a number sets one, "hand" lights the next step as a hand-in does; npcs: ${ids.join(', ')}`,
    { group: 'quest', args: () => ids },
  );
}
