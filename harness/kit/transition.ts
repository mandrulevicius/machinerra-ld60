/**
 * Scene transitions: cover the screen, switch scenes, uncover.
 *
 *   transition(this, 'Play', { level: 2 });                       // from a scene: replaces it (scene.start)
 *   transition(this, 'Play', undefined, { at: pointer });          // iris closes on the pointer or a game object
 *   transition(game, 'KitTitle');                                  // from the game: stops every running scene first
 *
 * The slot `transition` (dev sidebar, export into `variants`) picks the look: fade | wipe | iris | blocks | dissolve, coloured
 * from the theme (cover `--kit-bg`, edge `--ui-c-accent`); `transitionSlot.add(name, { kind, ms, ... })` adds one.
 *
 * What it rests on:
 * - The cover is one small `<canvas>` in `#ui-sys`, not a Phaser object: it is above the HUD and the menus too (a canvas
 *   cover would leave the DOM UI showing), it survives `scene.start`, and the browser scales it (soft edges for free, hard
 *   cells for `blocks`). The GPU does nothing for it: a few thousand pixels are filled on the CPU per frame (~0.1 ms, see
 *   `transitionInfo().frameMs`) and uploaded as a texture. No WebGL filter or shader, no snapshot of the scene.
 * - It is driven by the game's step event, so `__game.step(n)` runs it and it pauses with the game loop.
 * - The reveal starts when the target scene has finished `create()` (a scene that loads assets keeps the cover up), with a
 *   4 s fallback. The cover blocks clicks and keydowns (F-keys pass), and `inputFor` actions read as idle while it is up.
 * - One at a time: a call during a transition returns false. `prefers-reduced-motion` turns every look into a short fade.
 * Wipe maths and its tests: wipes.ts.
 */
import Phaser from 'phaser';
import { slot } from './variants';
import { theme } from './theme';
import { resolveColor, type ColorKey } from './particles';
import { el, sysLayer } from './menu-parts';
import { coverage, field, smooth, type WipeKind } from './wipes';

export interface TransitionLook {
  kind: WipeKind;
  /** Milliseconds for each half: cover, then reveal. */
  ms: number;
  /** Cells across (the cover canvas is that many pixels wide). Default per kind; blocks: how many blocks. */
  res?: number;
  /** Softness of the edge, a share of the progress. */
  soft?: number;
  /** How strongly the edge takes the edge colour, 0..1. */
  rim?: number;
  /** Cover colour: a theme colour, `'bg'` (the theme background, default) or 0xRRGGBB. */
  color?: ColorKey | 'bg' | number;
  /** Edge colour (default the theme accent). */
  edge?: ColorKey | number;
}

const SHAPE: Record<WipeKind, { res: number; soft: number; rim: number }> = {
  fade: { res: 1, soft: 1, rim: 0 },
  wipe: { res: 256, soft: 0.14, rim: 0.9 },
  iris: { res: 480, soft: 0.04, rim: 0.8 },
  blocks: { res: 32, soft: 0.04, rim: 0 },
  dissolve: { res: 200, soft: 0.2, rim: 1 },
};

export const transitionSlot = slot<TransitionLook>('transition', {
  fade: { kind: 'fade', ms: 300 },
  wipe: { kind: 'wipe', ms: 380 },
  iris: { kind: 'iris', ms: 450 },
  blocks: { kind: 'blocks', ms: 380 },
  dissolve: { kind: 'dissolve', ms: 500 },
});

export interface TransitionOpts {
  /** A variant of the `transition` slot for this call (default: the slot's current one). */
  variant?: string;
  /** Milliseconds per half. */
  ms?: number;
  /** Where the iris closes: a screen position in game px (`pointer`), or a game object (its camera maps it). Default the centre. */
  at?: { x: number; y: number };
  /** Runs at full cover, just before the scenes switch. */
  onSwitch?: () => void;
  /** Runs when the screen is uncovered. */
  onDone?: () => void;
}

interface Run {
  game: Phaser.Game;
  look: TransitionLook;
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  img: ImageData | null;
  px: Uint32Array | null;
  f: Float32Array | null;
  soft: number;
  rim: number;
  base: [number, number, number];
  edge: [number, number, number];
  at: [number, number];
  phase: 'out' | 'wait' | 'in';
  t: number;
  waited: number;
  waitMs: number;
  p: number;
  off: () => void;
  switchScenes: () => void;
  target: string;
  opts: TransitionOpts;
  frames: number;
  msSum: number;
}

let run: Run | null = null;
let lastFrameMs = 0;

// Installed at import so it runs before the game's and the menus' window listeners: keydowns die here while a cover is up.
if (typeof addEventListener !== 'undefined') {
  addEventListener('keydown', (e) => run && !/^F\d+$/.test(e.key) && e.stopImmediatePropagation(), true);
}

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** Is a transition running? */
export const transitionBusy = () => run !== null;

/** For debugging and the lab probe: the running transition and the mean cost of one frame of it (CPU fill + upload call). */
export function transitionInfo() {
  return run
    ? { busy: true, phase: run.phase, p: +run.p.toFixed(3), kind: run.look.kind, target: run.target, cells: `${run.w}x${run.h}`, frameMs: +(run.msSum / Math.max(1, run.frames)).toFixed(3) }
    : { busy: false, frameMs: +lastFrameMs.toFixed(3) };
}

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Cover the screen, switch to scene `to` with `data`, uncover. From a Scene it is `scene.scene.start(to, data)` at full
 * cover (that scene stops, others keep running); from the Game every running scene stops first. Returns false, and does
 * nothing, while another transition runs. Throws if `to` is not a registered scene.
 */
export function transition(from: Phaser.Scene | Phaser.Game, to: string, data?: object, opts: TransitionOpts = {}): boolean {
  if (run) return false;
  const game = from instanceof Phaser.Game ? from : from.game;
  if (!game.scene.getScene(to)) throw new Error(`kit: transition to "${to}": no such scene (has: ${game.scene.getScenes(false).map((s) => s.scene.key).join(', ')})`);
  const name = opts.variant ?? transitionSlot.name;
  let look = transitionSlot.variants[name];
  if (!look) throw new Error(`kit: no transition variant "${name}" (has: ${Object.keys(transitionSlot.variants).join(', ')})`);
  if (reduced()) look = { kind: 'fade', ms: 150 };
  if (opts.ms !== undefined) look = { ...look, ms: opts.ms };

  const shape = { ...SHAPE[look.kind], ...(look.res !== undefined && { res: look.res }), ...(look.soft !== undefined && { soft: look.soft }), ...(look.rim !== undefined && { rim: look.rim }) };
  const W = game.scale.width;
  const H = game.scale.height;
  const w = look.kind === 'fade' ? 1 : shape.res;
  const h = look.kind === 'fade' ? 1 : Math.max(1, Math.round((w * H) / W));
  const th = theme();
  const base = rgb(look.color === 'bg' || look.color === undefined ? th.c.bg : resolveColor(th, look.color, th.c.bg));
  const edge = rgb(resolveColor(th, look.edge, th.c.accent));

  let at: [number, number] = [0.5, 0.5];
  if (opts.at) {
    let { x, y } = opts.at;
    const cam = (opts.at as Partial<Phaser.GameObjects.GameObject>).scene?.cameras?.main;
    if (cam) ((x = (x - cam.worldView.x) * cam.zoom), (y = (y - cam.worldView.y) * cam.zoom));
    at = [Math.min(1, Math.max(0, x / W)), Math.min(1, Math.max(0, y / H))];
  }

  const cv = el(`<canvas class="ui-cover" width="${w}" height="${h}" aria-hidden="true"></canvas>`) as HTMLCanvasElement;
  if (look.kind === 'blocks') cv.dataset.crisp = '';
  const ctx = cv.getContext('2d')!;
  if (look.kind === 'fade') {
    ctx.fillStyle = `rgb(${base.join(',')})`;
    ctx.fillRect(0, 0, 1, 1);
    cv.style.opacity = '0';
  }
  sysLayer(game).append(cv);

  const r: Run = {
    game, look, cv, ctx, w, h, soft: shape.soft, rim: shape.rim, base, edge, at,
    img: null, px: null, f: field(look.kind, w, h, { at }),
    phase: 'out', t: 0, waited: 0, waitMs: 0, p: 0, frames: 0, msSum: 0,
    target: to, opts,
    off: () => {},
    switchScenes: () => {
      if (from instanceof Phaser.Game) {
        game.scene.getScenes(true).forEach((s) => s.scene.key !== to && s.scene.stop());
        game.scene.start(to, data);
      } else from.scene.start(to, data);
    },
  };
  if (r.f) {
    r.img = ctx.createImageData(w, h);
    r.px = new Uint32Array(r.img.data.buffer);
  }
  const tick = (_t: number, delta: number) => step(r, Math.min(delta, 50));
  game.events.on(Phaser.Core.Events.POST_STEP, tick);
  r.off = () => game.events.off(Phaser.Core.Events.POST_STEP, tick);
  run = r;
  paint(r, 0);
  return true;
}

function paint(r: Run, p: number) {
  r.p = p;
  if (!r.f) {
    r.cv.style.opacity = String(p);
    return;
  }
  const { f, px, img, soft, rim, base, edge } = r;
  const solid = (255 << 24) | (base[2] << 16) | (base[1] << 8) | base[0];
  for (let i = 0; i < f.length; i++) {
    const a = coverage(f[i], p, soft);
    if (a >= 1) px![i] = solid;
    else if (a <= 0) px![i] = 0;
    else {
      const k = 4 * a * (1 - a) * rim;
      const cr = base[0] + (edge[0] - base[0]) * k;
      const cg = base[1] + (edge[1] - base[1]) * k;
      const cb = base[2] + (edge[2] - base[2]) * k;
      px![i] = ((a * 255) << 24) | (cb << 16) | (cg << 8) | cr;
    }
  }
  r.ctx.putImageData(img!, 0, 0);
}

function step(r: Run, dt: number) {
  const t0 = performance.now();
  const ms = r.look.ms;
  if (r.phase === 'out') {
    r.t += dt / ms;
    if (r.t < 1) paint(r, smooth(r.t));
    else {
      paint(r, 1);
      r.opts.onSwitch?.();
      r.switchScenes();
      r.phase = 'wait';
    }
  } else if (r.phase === 'wait') {
    r.waited++;
    r.waitMs += dt;
    const target = r.game.scene.getScene(r.target);
    // two frames for a queued stop/start to run, then until create() has finished (a loading scene keeps the cover up)
    if ((r.waited >= 2 && target.sys.settings.status === Phaser.Scenes.RUNNING) || r.waitMs > 4000) {
      r.phase = 'in';
      r.t = 0;
      r.f = field(r.look.kind, r.w, r.h, { at: r.at, flip: true });
    }
  } else {
    r.t += dt / ms;
    if (r.t < 1) paint(r, 1 - smooth(r.t));
    else {
      finish(r);
      return;
    }
  }
  r.frames++;
  r.msSum += performance.now() - t0;
}

function finish(r: Run) {
  r.off();
  r.cv.remove();
  lastFrameMs = r.msSum / Math.max(1, r.frames);
  run = null;
  r.opts.onDone?.();
}
