/**
 * The console's built-in commands, registered by the bridge when dev tools are on (bridge.ts).
 * `paused` / `setPaused` are shared with the Debug tab.
 */
import type Phaser from 'phaser';
import { command, commands, helpText } from './commands';
import { quality } from '../kit/state';
import { getTune, setTune, syncTunesToUrl, tunes } from '../kit/tune';
import { LEVELS, type QualityTier } from '../kit/quality';

export const paused = (game: Phaser.Game) => !game.loop.running;
export function setPaused(game: Phaser.Game, on: boolean) {
  if (on) game.loop.sleep();
  else game.loop.wake();
}

/** Save a bug report with `note`; the answer names the files. Used by `report`, `> note` and the Debug tab's button. */
export async function saveReport(note: string) {
  const capture = (window as any).__game?.capture;
  if (!capture) throw new Error('bug reports need the dev server (capture is not loaded)');
  const r = await capture.report(note);
  return `saved ${r.path}${r.picture ? ` and ${r.picture}` : ''}`;
}

export function registerBuiltins(game: Phaser.Game, bridge: { step(n?: number): void; goto(key: string): void }) {
  const dev = { group: 'dev' };
  const scenes = () => Object.keys(game.scene.keys);

  command(
    'help',
    ([topic]) => helpText(topic),
    'help [group|command]: list the groups; a group or command shows its usage',
    { group: 'dev', args: () => [...new Set(commands().flatMap((c) => [c.group, c.name]))] },
  );

  command(
    'goto',
    ([key]) => {
      if (!key || !scenes().includes(key)) throw new Error(`goto <scene>, one of: ${scenes().join(', ')}`);
      bridge.goto(key);
      return `now in ${key}`;
    },
    'goto <scene>: stop the running scenes and start <scene>',
    { group: 'dev', args: scenes },
  );

  command(
    'tune',
    ([key, value]) => {
      if (!key) return tunes().map((t) => `${t.key} = ${t.value}`).join('\n') || 'no tunes in this game';
      const t = getTune(key);
      if (!t) throw new Error(`no tune "${key}". Have: ${tunes().map((x) => x.key).join(', ') || 'none'}`);
      if (value === undefined) return `${key} = ${t.value}`;
      if (!setTune(key, value)) throw new Error(`"${value}" does not fit ${key} (${t.kind === 'number' ? `${t.min} to ${t.max}` : t.kind === 'choice' ? t.options.join('|') : 'true|false'})`);
      syncTunesToUrl();
      return `${key} = ${t.value}`;
    },
    'tune [key] [value]: list the live tuning values, read one, or set one',
    { group: 'kit', args: () => tunes().map((t) => t.key) },
  );

  command(
    'quality',
    ([level]) => {
      if (level) {
        if (!(level in LEVELS)) throw new Error('quality <low|medium|high>');
        quality().set({ level: level as QualityTier });
      }
      return quality().get();
    },
    'quality [low|medium|high]: show or set the quality level',
    { group: 'kit', args: () => Object.keys(LEVELS) },
  );

  command(
    'step',
    ([n]) => {
      const count = n === undefined ? 1 : Number(n);
      if (!Number.isInteger(count) || count < 1) throw new Error('step [n]: n is a whole number of frames');
      bridge.step(count);
      return `stepped ${count} frame${count === 1 ? '' : 's'}`;
    },
    'step [n]: advance n frames (default 1); with the game paused it moves frame by frame',
    { group: 'dev' },
  );

  command('pause', () => (setPaused(game, true), 'paused'), 'pause: stop the game loop (step still advances it)', dev);
  command('resume', () => (setPaused(game, false), 'running'), 'resume: restart the game loop', dev);
  command('report', (words) => saveReport(words.join(' ')), 'report [note]: save a bug report (state, errors, picture) with the note; "> note" does the same', dev);
}
