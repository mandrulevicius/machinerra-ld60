import { quality } from '../../../../harness/kit';
import { command } from '../../../../harness/dev/commands';
import { setTier, tierState } from '../tier';

const show = () => {
  const s = tierState();
  return `render ${s.level} (player ${s.player}, measured ${s.measured}, held ${s.held ?? '-'}, ${s.auto ? (s.measuring ? 'measuring' : 'measured') : 'auto off'}): ground detail ${s.detail}, light cap ${s.lightCap ?? 'the player\'s'}`;
};

/** `render`: the render tier (tier.ts) shown, held for a test, or freed. Game-wide, so registered once at boot. */
export function tierCommands() {
  command('render', ([what]) => {
    if (what === 'low' || what === 'medium' || what === 'high') setTier({ held: what });
    else if (what === 'auto') setTier({ held: null, auto: true, reset: true });
    else if (what === 'off') setTier({ held: null, auto: false, reset: true });
    else if (what) return 'render [low|medium|high|auto|off]';
    // The kit puts its light cap back (or lower) from the player's quality; the mission's next frame applies the tier on top.
    if (what) quality().set({});
    return show();
  }, 'render [low|medium|high|auto|off]: show the render tier; hold one (never above the player\'s quality), `auto` frees it and measures again, `off` stops measuring', { group: 'mission', args: () => ['low', 'medium', 'high', 'auto', 'off'] });
}
