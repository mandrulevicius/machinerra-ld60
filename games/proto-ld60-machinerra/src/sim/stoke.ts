/**
 * Stoking (Minos, decisions.md "Minos on stoking"): a robot fed coal at the workshop rides the next mission stoked, one
 * mission only. Stoked, it moves `STOKE.speed` faster (swoosh streaks, `stokeview.ts`); a stoked Firebrand also does
 * `STOKE.damage` more, and the fire it lays burns hotter (`Zone.stoked`, drawn bigger and whiter). Binary: on or off,
 * no levels. Not the Firebrand's aura status `stoked` (`effects.ts`), which is a 4 s buff it gives allies mid-fight.
 * The flag is `Bot.stoked` (the roster's `RosterBot.stoked`, `CrewBot.stoked`); `Sim.dress` puts `stokeSource` on it.
 * Plain TS, no Phaser; tests in `stoke.test.ts`.
 */
import type { Source } from './effects';
import type { SpecId } from './specs';

/** +30% move speed (Minos: "30% cap, on movespeed only"), and the same on a Firebrand's damage ("equivalent damage buff"). */
export const STOKE = { speed: 0.3, damage: 0.3 };

/** What a stoked robot is: its speed, and for a Firebrand its damage. */
export const stokeSource = (spec?: SpecId): Source => ({
  id: 'stoke',
  kind: 'other',
  name: 'Stoked',
  effects: [
    { when: 'always', do: { do: 'stat', stat: 'speed', pct: STOKE.speed } },
    ...(spec === 'firebrand' ? [{ when: 'always', do: { do: 'stat', stat: 'damage', pct: STOKE.damage } } as const] : []),
  ],
});
