/**
 * Contextual hints: teach a control where it is needed instead of in a tutorial (docs/design/design.md, "Intuitive").
 *
 *   hint(this, hero, 'Press {jump} to jump', { until: 'jump', delay: 2000 });
 *   hint(this, { x: 640, y: 300 }, 'Hold {fire} to charge', { until: () => this.charged, id: 'charge' });
 *
 * A small themed Phaser Text above `target` (a game object, followed while it moves, or a point). It appears after `delay`
 * ms of scene time (default 1500; a paused scene does not count) unless the player already did the thing, fades in, and
 * fades out for good once `until` happens: an action name (pressed) or a predicate checked every frame. `{jump}` becomes the
 * binding as the player has it, and follows rebinding and a switch between keyboard and gamepad. With `id`, a finished hint is
 * remembered (saved per game) and never shows again, also after a restart; without it, it shows again in a new run.
 * Hints end with their scene. Needs `actions` in bootGame for `{action}` text and for action names in `until`.
 */
import Phaser from 'phaser';
import { createSave, type Save } from '../save';
import { gameId } from './state';
import { kit } from './scene';
import { inputFor, promptText } from './input';

export interface HintOpts {
  /** What ends the hint: an action name (when pressed) or a predicate (when it returns true). */
  until: string | (() => boolean);
  /** Milliseconds of scene time before it shows. Default 1500. */
  delay?: number;
  /** Remember it as learned: never shown again once done. */
  id?: string;
  /** Pixels above the target's top. Default 14. */
  gap?: number;
  size?: number;
}

export interface Hint {
  readonly state: 'waiting' | 'shown' | 'done';
  /** End it now, as if `until` had happened (remembered when it has an `id`). */
  dismiss(): void;
  /** The text object once shown. */
  readonly text: Phaser.GameObjects.Text | null;
}

type Target = Phaser.GameObjects.GameObject | { x: number; y: number };

let learned: Save<{ done: string[] }> | null = null;
let learnedFor = '';
const learnedSave = () => {
  if (!learned || learnedFor !== gameId()) (learned = createSave(`${(learnedFor = gameId())}:hints`, { done: [] as string[] }));
  return learned;
};

/** Forget the hints marked with an `id` (they show again). */
export const resetHints = () => learnedSave().reset();

export function hint(scene: Phaser.Scene, target: Target, template: string, o: HintOpts): Hint {
  const input = inputFor(scene);
  if (typeof o.until === 'string' && !input.has(o.until)) throw new Error(`hint: unknown action '${o.until}' in until`);
  const delay = o.delay ?? 1500;
  let state: Hint['state'] = 'waiting';
  let text: Phaser.GameObjects.Text | null = null;
  let waited = 0;

  const h: Hint = { get state() { return state; }, get text() { return text; }, dismiss: () => finish() };
  if (o.id && learnedSave().get().done.includes(o.id)) {
    state = 'done';
    return h;
  }

  const k = kit(scene);
  const top = () => {
    const t = target as Partial<Phaser.GameObjects.Components.GetBounds> & { x: number; y: number };
    return { x: t.x, y: t.getTopCenter ? t.getTopCenter().y : t.y };
  };
  const place = () => {
    const p = top();
    text!.setPosition(p.x, p.y - (o.gap ?? 14));
  };
  const redraw = () => text?.setText(promptText(template));

  function show() {
    state = 'shown';
    text = k.text(0, 0, promptText(template), { size: o.size ?? 24, font: 'body', color: 'textDim' }).setOrigin(0.5, 1).setDepth(1000).setAlpha(0);
    text.setStroke(`#${k.theme.c.bg.toString(16).padStart(6, '0')}`, 5);
    place();
    scene.tweens.add({ targets: text, alpha: 0.9, ...k.theme.motion() });
  }

  function finish() {
    if (state === 'done') return;
    state = 'done';
    if (o.id) learnedSave().set({ done: [...learnedSave().get().done, o.id] });
    detach();
    if (text) scene.tweens.add({ targets: text, alpha: 0, ...k.theme.motion(), onComplete: () => text?.destroy() });
  }

  const happened = () => (typeof o.until === 'string' ? input.pressed(o.until) : o.until());
  const update = (_t: number, dt: number) => {
    if (happened() || ('active' in target && !target.active)) return finish(); // done, or the target was destroyed
    if (state === 'waiting') {
      waited += dt;
      if (waited >= delay) show();
    } else if (text) {
      place();
    }
  };

  const offInput = input.onChange(redraw);
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  const detach = () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, update);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
    offInput();
  };
  const onShutdown = () => {
    detach();
    text?.destroy();
    state = 'done';
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  return h;
}
