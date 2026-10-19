/** Kit-wide state: the game id (save key) and the quality settings. `initKit` once, before scenes use the kit. */
import { createQuality, type Quality } from './quality';
import { applyVariants } from './variants';
import { applyTunes, type TuneValue } from './tune';
import { applyThemeAttr } from './theme';
import { setGameGroup } from '../dev/commands';

let gameId_ = 'game';
let q: Quality | null = null;

export function initKit(opts: { id: string; variants?: Record<string, string>; tunes?: Record<string, TuneValue> }) {
  setGameGroup(opts.id); // the default group of the game's console commands
  if (!q || gameId_ !== opts.id) {
    gameId_ = opts.id;
    q = createQuality(gameId_, location.search);
  }
  if (opts.variants) applyVariants(opts.variants);
  if (opts.tunes) applyTunes(opts.tunes);
  applyThemeAttr();
  return q;
}

/** The game id given to initKit ('game' before that). */
export const gameId = () => gameId_;

/** The quality settings (created with id 'game' if initKit was not called). */
export function quality(): Quality {
  return (q ??= createQuality(gameId_, location.search));
}
