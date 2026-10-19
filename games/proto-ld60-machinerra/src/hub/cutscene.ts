/**
 * The hub's cut scenes (P44): beats as data, played by `playCutscene` over the deck. One for now: `STOLEN`, the blessing
 * (the main quest's step 9, hub/story.ts) where the Evil Oracle appears at the altar, mocks the Oracle, makes the wife
 * and then himself ethereal, takes the Oracle's beam straight through him, and leaves with her into the Ether
 * (Laimonas, `LaimonasIdeas.md`, 2026-10-18).
 *
 * A beat is a line (`who` says `line`; it stays until Use, Space, Enter or a click moves on: nothing the player reads moves on
 * by itself, Minos) or an act (`act`: something happens with no caption up, then `wait` seconds). The runner letterboxes the screen, pans to the altar, captions the lines and
 * plays the acts on the actors the hub hands it. Add a scene: an array of beats, and the actors it needs in `Actors`.
 */
import Phaser from 'phaser';

export type Who = 'oracle' | 'evil' | 'princess';
export type Act = 'appear' | 'ghostWife' | 'ghostEvil' | 'laser' | 'take';
export type Beat = { who: Who; line: string } | { act: Act; wait: number };

export const NAMES: Record<Who, string> = { oracle: 'The Oracle', evil: 'The Evil Oracle', princess: 'The Princess' };

export const STOLEN: Beat[] = [
  { who: 'oracle', line: 'Kneel, both of you. By the boiler and the bellows, by the Old Way, I bless—' },
  { act: 'appear', wait: 1.4 },
  { who: 'evil', line: 'The Old Way. Sister, you still bless boilers? How quaint. How... brief.' },
  { who: 'oracle', line: 'Brother. You were cast off this ship. Get away from my altar.' },
  { who: 'evil', line: 'Everything you bless rusts. Everything I touch lasts forever. Let me show your little Communicator.' },
  { act: 'ghostWife', wait: 1.4 },
  { who: 'princess', line: 'My brushes... I cannot feel my brushes!' },
  { who: 'evil', line: 'There. Now she will never wear out. And neither will I.' },
  { act: 'ghostEvil', wait: 1.1 },
  { who: 'oracle', line: 'Begone, heretic!' },
  { act: 'laser', wait: 1.3 },
  { who: 'evil', line: 'You cannot burn a ghost, sister. Come and find her in the Ether, Communicator. If you can touch anything there.' },
  { act: 'take', wait: 1.8 },
  { who: 'oracle', line: '...He took her into the Ether. My beam went straight through him. Nothing of ours can touch him there.' },
  { who: 'oracle', line: 'There is a ghost in the Ether older than both of us: the Esteemed Ghost. Free him, and he will lend you his touch. The course table knows the way now.' },
];

/** What the hub hands the runner: its scene and UI root, the actors (the Evil Oracle appears at `evilAt`), and its effects. */
export interface Actors {
  scene: Phaser.Scene;
  ui: HTMLElement;
  oracle: Phaser.GameObjects.Image;
  princess: Phaser.GameObjects.Image;
  /** Where the Evil Oracle appears (feet). */
  evilAt: { x: number; y: number };
  /** His sprite, made by the hub (hidden until he appears). */
  evil: Phaser.GameObjects.Image;
  sfx(key: string, gain?: number): void;
  shake(size: 'small' | 'medium' | 'big'): void;
  burst(x: number, y: number, color: number, size: number): void;
  flash(x: number, y: number, color: number): void;
}

/** Play a cut scene; `done` runs when it is over (the last line moved on). Returns a function that skips to the end. */
export function playCutscene(a: Actors, beats: Beat[], done: () => void): () => void {
  const { scene } = a;
  const root = document.createElement('div');
  root.className = 'hb-cut';
  root.innerHTML = `<div class="hb-cut__bar hb-cut__bar--top"></div><div class="hb-cut__bar hb-cut__bar--bottom"></div>
    <div class="hb-cut__cap" hidden><b class="hb-cut__who"></b><span class="hb-cut__line"></span><small class="hb-cut__more">Use to go on</small></div>`;
  a.ui.appendChild(root);
  requestAnimationFrame(() => root.classList.add('is-on'));
  const cap = root.querySelector<HTMLElement>('.hb-cut__cap')!;
  const who = root.querySelector<HTMLElement>('.hb-cut__who')!;
  const text = root.querySelector<HTMLElement>('.hb-cut__line')!;
  const cam = scene.cameras.main;
  cam.pan(a.oracle.x, a.oracle.y - 40, 900, 'Sine.easeInOut');
  const g = scene.add.graphics().setDepth(100000);

  let i = -1;
  let timer: Phaser.Time.TimerEvent | null = null;
  let over = false;
  const next = () => {
    if (over) return;
    timer?.remove();
    i++;
    if (i >= beats.length) return finish();
    const b = beats[i];
    if ('line' in b) {
      cap.hidden = false;
      who.textContent = NAMES[b.who];
      cap.dataset.who = b.who;
      text.textContent = b.line;
      a.sfx('tgTick', b.who === 'evil' ? 0.7 : 0.5);
    } else {
      cap.hidden = true;
      act(b.act);
      timer = scene.time.delayedCall(b.wait * 1000, next);
    }
  };
  const act = (k: Act) => {
    const { oracle, princess, evil } = a;
    if (k === 'appear') {
      evil.setPosition(a.evilAt.x, a.evilAt.y).setAlpha(0).setVisible(true).setDepth(a.evilAt.y + 6);
      scene.tweens.add({ targets: evil, alpha: 1, duration: 900 });
      a.burst(a.evilAt.x, a.evilAt.y - 40, 0x9040ff, 2);
      a.flash(a.evilAt.x, a.evilAt.y - 40, 0x9040ff);
      a.sfx('thunk', 0.9);
      a.shake('medium');
    } else if (k === 'ghostWife') {
      princess.setTint(0xc0a0ff);
      scene.tweens.add({ targets: princess, alpha: 0.45, y: princess.y - 10, duration: 900, ease: 'Sine.easeOut' });
      scene.tweens.add({ targets: princess, angle: { from: -4, to: 4 }, duration: 700, yoyo: true, repeat: -1 });
      a.burst(princess.x, princess.y - 30, 0xc0a0ff, 1.4);
      a.sfx('tgFeed', 0.7);
    } else if (k === 'ghostEvil') {
      evil.setTint(0xb090ff);
      scene.tweens.add({ targets: evil, alpha: 0.4, duration: 700 });
      a.burst(evil.x, evil.y - 40, 0xb090ff, 1.4);
      a.sfx('tgFeed', 0.7);
    } else if (k === 'laser') {
      // The Oracle's eye fires: the beam passes through him and scorches the deck behind.
      const x0 = oracle.x, y0 = oracle.y - oracle.displayHeight * 0.8;
      const dx = evil.x - x0, dy = evil.y - 50 - y0, d = Math.hypot(dx, dy) || 1;
      const x1 = x0 + (dx / d) * (d + 260), y1 = y0 + (dy / d) * (d + 260);
      const beam = { k: 1 };
      scene.tweens.add({
        targets: beam,
        k: 0,
        duration: 900,
        onUpdate: () => {
          g.clear();
          g.lineStyle(14 * beam.k, 0x3df2ff, 0.35 * beam.k).lineBetween(x0, y0, x1, y1);
          g.lineStyle(4 * beam.k, 0xffffff, 0.95 * beam.k).lineBetween(x0, y0, x1, y1);
        },
        onComplete: () => g.clear(),
      });
      a.flash(x0, y0, 0x3df2ff);
      a.burst(x1, y1, 0x3df2ff, 1.8);
      a.burst(evil.x, evil.y - 50, 0xffffff, 0.8);
      a.sfx('latch', 1);
      a.shake('big');
    } else {
      // He takes her: she drifts to him, and both fade into nothing.
      scene.tweens.killTweensOf(princess);
      scene.tweens.add({
        targets: princess,
        x: evil.x + 24,
        y: evil.y,
        duration: 700,
        ease: 'Sine.easeIn',
        onComplete: () => {
          scene.tweens.add({ targets: [princess, evil], alpha: 0, scaleX: '*=0.3', scaleY: '*=1.6', duration: 600, ease: 'Sine.easeIn' });
          a.burst(evil.x, evil.y - 40, 0x9040ff, 2.2);
          a.sfx('lift', 0.6);
          a.shake('medium');
        },
      });
    }
  };
  const key = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter') {
      e.preventDefault();
      next();
    }
    if (e.code === 'Escape') finish();
  };
  window.addEventListener('keydown', key);
  root.addEventListener('click', next);
  const finish = () => {
    if (over) return;
    over = true;
    timer?.remove();
    window.removeEventListener('keydown', key);
    g.destroy();
    root.classList.remove('is-on');
    setTimeout(() => root.remove(), 400);
    done();
  };
  scene.time.delayedCall(700, next);
  return finish;
}
