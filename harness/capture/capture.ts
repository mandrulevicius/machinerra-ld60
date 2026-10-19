import type Phaser from 'phaser';
import { getSlot, slots } from '../kit/variants';

/**
 * Stills and video of the running game, saved by the dev server to `games/<game>/capture/` (vite-plugin.ts).
 * Exposed as `__game.capture` (bridge.ts); usage in README.md.
 *
 * The game canvas is WebGL and the UI is DOM over it, so a canvas copy misses the HUD. With `ui: true`
 * (the default) the DOM container is rasterised by html-to-image and drawn over the canvas copy.
 * `ui: false` gives the bare canvas, for clean art shots.
 */

const ENDPOINT = '/__capture/save';
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');

export interface Saved {
  /** Repo-relative path of what was written. */
  path: string;
  bytes: number;
  /** Set when the HUD overlay was asked for but could not be drawn. */
  warning?: string;
}

interface VideoOptions {
  ui?: boolean;
  fps?: number;
  bitrate?: number;
}

export function createCapture(game: Phaser.Game, step: (n?: number) => void) {
  const canvas = game.canvas;
  const gameName = () => {
    const m = /^\/games\/([A-Za-z0-9_-]+)\//.exec(location.pathname);
    if (!m) throw new Error(`capture needs the page at /games/<name>/, got ${location.pathname}`);
    return m[1];
  };
  const clean = (name: string | undefined, fallback: string) =>
    (name ?? fallback).replace(/\.(png|webm)$/i, '').replace(/[^A-Za-z0-9_-]/g, '-') || fallback;

  async function save(path: string, body: Blob): Promise<Saved> {
    const r = await fetch(`${ENDPOINT}?path=${encodeURIComponent(path)}`, { method: 'POST', body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`capture save failed (${r.status}): ${j.error ?? ''}. Dev server running? Try: touch vite.config.ts`);
    return { path, bytes: j.bytes };
  }

  // toDataURL, not toBlob: toBlob takes about a second per call in a hidden tab.
  const pngBlob = async (c: HTMLCanvasElement) => (await fetch(c.toDataURL('image/png'))).blob();

  /**
   * Copy of the canvas as of the next render. The WebGL buffer is only readable inside the frame that drew it,
   * so copy in `postrender`. A hidden tab gets no frames from the browser: step one ourselves.
   */
  function grab(stepIfIdle = true): Promise<HTMLCanvasElement> {
    return new Promise((ok) => {
      const onRender = () => {
        clearTimeout(t);
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = canvas.height;
        c.getContext('2d')!.drawImage(canvas, 0, 0);
        ok(c);
      };
      game.events.once('postrender', onRender);
      const t = setTimeout(() => stepIfIdle && step(1), 150);
    });
  }

  /** The DOM container (HUD) as a canvas the size of the game, or null if it has nothing in it. */
  async function rasterUI(fonts: { css?: string } = {}): Promise<HTMLCanvasElement | null> {
    const el = game.domContainer;
    if (!el?.firstElementChild) return null;
    // toSvg, not toCanvas: toCanvas waits on requestAnimationFrame, which a hidden tab never fires.
    const { toSvg, getFontEmbedCSS } = await import('html-to-image');
    fonts.css ??= await getFontEmbedCSS(el); // slow, and the same for every frame
    // Phaser scales and offsets the container to fit the window; draw it at its own 1:1 size instead.
    const url = await toSvg(el, {
      width: canvas.width,
      height: canvas.height,
      fontEmbedCSS: fonts.css,
      style: { transform: 'none', left: '0', top: '0', margin: '0' },
    });
    const img = new Image();
    img.src = url;
    await img.decode();
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    out.getContext('2d')!.drawImage(img, 0, 0);
    return out;
  }

  /** The HUD as a cached bitmap, re-rasterised after the DOM changes (for video, where per-frame raster is too slow). */
  function watchUI() {
    let bitmap: HTMLCanvasElement | null = null;
    let dirty = true;
    let busy = false;
    let warning: string | undefined;
    const fonts = {};
    const run = async () => {
      if (busy || !dirty) return;
      busy = true;
      dirty = false;
      try {
        bitmap = await rasterUI(fonts);
      } catch (e) {
        warning = `HUD overlay failed: ${e}`;
      }
      busy = false;
      run();
    };
    const obs = new MutationObserver(() => {
      dirty = true;
      run();
    });
    obs.observe(game.domContainer, { subtree: true, childList: true, attributes: true, characterData: true });
    run();
    return {
      get bitmap() {
        return bitmap;
      },
      get warning() {
        return warning;
      },
      /** The bitmap once any pending change has been drawn into it. */
      async current() {
        await wait(0);
        while (dirty || busy) await wait(5);
        return bitmap;
      },
      stop: () => obs.disconnect(),
    };
  }

  async function shot(name?: string, o: { ui?: boolean } = {}): Promise<Saved> {
    const out = await grab();
    let warning: string | undefined;
    if (o.ui ?? true) {
      try {
        const ui = await rasterUI();
        if (ui) out.getContext('2d')!.drawImage(ui, 0, 0);
      } catch (e) {
        warning = `HUD overlay failed, canvas only: ${e}`;
      }
    }
    const saved = await save(`games/${gameName()}/capture/${clean(name, 'shot-' + stamp())}.png`, await pngBlob(out));
    return warning ? { ...saved, warning } : saved;
  }

  /** A small webp (default 384 px wide) in `games/<game>/public/previews/<name>.webp`, for menus and hubs; committed. */
  async function thumb(name: string, o: { ui?: boolean; width?: number } = {}): Promise<Saved> {
    const full = await grab();
    if (o.ui ?? true) {
      const ui = await rasterUI().catch(() => null);
      if (ui) full.getContext('2d')!.drawImage(ui, 0, 0);
    }
    const w = o.width ?? 384;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = Math.round((w * full.height) / full.width);
    const g = out.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(full, 0, 0, out.width, out.height);
    const body = await (await fetch(out.toDataURL('image/webp', 0.8))).blob();
    return save(`games/${gameName()}/public/previews/${clean(name, 'thumb')}.webp`, body);
  }

  // Realtime recording: MediaRecorder on the canvas stream. Needs a visible tab producing real frames.
  let rec: { path: string; stop: () => Promise<Saved & { seconds: number; fps: number }> } | null = null;

  async function start(name?: string, o: VideoOptions = {}) {
    if (rec) throw new Error('already recording; call stop()');
    const path = `games/${gameName()}/capture/${clean(name, 'clip-' + stamp())}.webm`;
    const layer = (o.ui ?? true) ? watchUI() : null;
    let track: MediaStreamTrack & { requestFrame?: () => void };
    let drawComposite: (() => void) | null = null;
    if (layer) {
      // Draw canvas + HUD into a 2D canvas on each render and push that frame to the stream.
      const comp = document.createElement('canvas');
      comp.width = canvas.width;
      comp.height = canvas.height;
      const ctx = comp.getContext('2d')!;
      track = (comp as any).captureStream(0).getVideoTracks()[0];
      drawComposite = () => {
        ctx.drawImage(canvas, 0, 0);
        if (layer.bitmap) ctx.drawImage(layer.bitmap, 0, 0);
        track.requestFrame?.();
      };
    } else {
      track = (canvas as any).captureStream(o.fps ?? 60).getVideoTracks()[0];
    }
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const mr = new MediaRecorder(new MediaStream([track]), { mimeType, videoBitsPerSecond: o.bitrate ?? 8_000_000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let frames = 0;
    const onRender = () => {
      frames++;
      drawComposite?.();
    };
    game.events.on('postrender', onRender);
    const t0 = performance.now();
    mr.start(1000);
    rec = {
      path,
      stop: async () => {
        const seconds = (performance.now() - t0) / 1000;
        game.events.off('postrender', onRender);
        const stopped = new Promise((ok) => (mr.onstop = ok));
        mr.stop();
        await stopped;
        track.stop();
        layer?.stop();
        rec = null;
        const blob = new Blob(chunks, { type: 'video/webm' });
        if (!blob.size) throw new Error('recorded no frames: the tab is hidden or stalled. Front it (tabs_select) or use render()');
        const saved = await save(path, blob);
        const warning = layer?.warning;
        return { ...saved, ...(warning && { warning }), seconds: +seconds.toFixed(2), fps: Math.round(frames / seconds) };
      },
    };
    return { recording: path };
  }

  const stop = () => {
    if (!rec) throw new Error('not recording');
    return rec.stop();
  };

  async function record(seconds: number, name?: string, o?: VideoOptions) {
    await start(name, o);
    await wait(seconds * 1000);
    return stop();
  }

  /**
   * Offline render: pause the loop, then per output frame run `each(i)`, advance the game 60/fps steps, and save
   * the frame as a PNG in `games/<game>/capture/<name>.frames/`. Smooth whatever the tab or machine does, because
   * game time is stepped, not waited. Slow (about a tenth of a second per frame). Turn the frames into video
   * with `npm run capture -- mp4 <dir> --fps <fps>`. `each` can drive input (it may be async).
   */
  async function render(seconds: number, o: { name?: string; fps?: number; ui?: boolean; each?: (i: number) => unknown } = {}) {
    const fps = o.fps ?? 30;
    const per = Math.max(1, Math.round(60 / fps));
    const frames = Math.round(seconds * fps);
    const dir = `games/${gameName()}/capture/${clean(o.name, 'clip-' + stamp())}.frames`;
    const layer = (o.ui ?? true) ? watchUI() : null;
    const pending: Promise<unknown>[] = [];
    game.loop.sleep();
    try {
      for (let i = 0; i < frames; i++) {
        await o.each?.(i);
        step(per);
        const out = await grab(); // postrender fired inside step(), so grab's timer never runs
        const ui = await layer?.current();
        if (ui) out.getContext('2d')!.drawImage(ui, 0, 0);
        const file = `${dir}/${String(i).padStart(4, '0')}.png`;
        pending.push(pngBlob(out).then((b) => save(file, b)));
        if (pending.length >= 4) await Promise.all(pending.splice(0));
      }
      await Promise.all(pending);
    } finally {
      layer?.stop();
      game.loop.wake();
    }
    const warning = layer?.warning;
    return { dir, frames, fps, ...(warning && { warning }) };
  }

  /**
   * Shots of one scene under every combination of the given variant slots: `matrix('Title', { titleLayout: ['left',
   * 'center'], theme: ['clean', 'fantasy'] })`. Per combination: set the variants, restart the scene, step `settle`
   * frames (the loop is paused, so a hidden pane works), run `each(combo)` (then 10 more frames), save a shot with the
   * HUD to `capture/matrix/<scene>/<slot>=<value>__<slot>=<value>.png`. One labelled `index.png` holds them all.
   * The variants and the scene are put back afterwards.
   */
  async function matrix(
    sceneKey: string,
    choices: Record<string, string[]>,
    o: { settle?: number; ui?: boolean; data?: object; sheetWidth?: number; each?: (combo: Record<string, string>) => unknown } = {},
  ) {
    const b = (window as any).__game;
    if (!game.scene.getScene(sceneKey)) throw new Error(`matrix: no scene "${sceneKey}" (has: ${b.scenes().join(', ')} running)`);
    const keys = Object.keys(choices);
    if (!keys.length) throw new Error('matrix: give at least one slot, e.g. { theme: ["clean", "fantasy"] }');
    for (const k of keys) {
      const s = getSlot(k);
      if (!s) throw new Error(`matrix: no slot "${k}" (has: ${slots().map((x) => x.key).join(', ')})`);
      if (!choices[k].length) throw new Error(`matrix: slot "${k}" has no values`);
      for (const v of choices[k]) if (!(v in s.variants)) throw new Error(`matrix: slot "${k}" has no variant "${v}" (has: ${Object.keys(s.variants).join(', ')})`);
    }
    const part = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '-');
    const combos = keys.reduce<Record<string, string>[]>(
      (acc, k) => acc.flatMap((c) => choices[k].map((v) => ({ ...c, [k]: v }))),
      [{}],
    );
    const dir = `games/${gameName()}/capture/matrix/${part(sceneKey)}`;
    const label = (c: Record<string, string>) => keys.map((k) => `${k}=${c[k]}`).join('  ');
    const file = (c: Record<string, string>) => keys.map((k) => `${part(k)}=${part(c[k])}`).join('__');

    // Contact sheet: columns follow the last slot's values (one slot: up to 3), rows the rest.
    const cols = keys.length > 1 ? choices[keys[keys.length - 1]].length : Math.min(combos.length, 3);
    const rows = Math.ceil(combos.length / cols);
    const gap = 8;
    const labelH = 22;
    const sheetW = o.sheetWidth ?? 1500;
    const cw = Math.min(canvas.width, Math.floor((sheetW - gap * (cols + 1)) / cols));
    const ch = Math.round((cw * canvas.height) / canvas.width);
    const sheet = document.createElement('canvas');
    sheet.width = gap + cols * (cw + gap);
    sheet.height = gap + rows * (ch + labelH + gap);
    const g = sheet.getContext('2d')!;
    g.fillStyle = '#16181d';
    g.fillRect(0, 0, sheet.width, sheet.height);
    g.imageSmoothingQuality = 'high';
    g.font = '14px system-ui, sans-serif';
    g.textBaseline = 'middle';

    const before = Object.fromEntries(keys.map((k) => [k, getSlot(k)!.name]));
    const wasActive = game.scene.getScenes(true).map((s) => ({ key: s.scene.key, data: s.sys.settings.data }));
    const fonts = {};
    const files: string[] = [];
    let warning: string | undefined;
    game.loop.sleep();
    try {
      for (const [i, c] of combos.entries()) {
        for (const k of keys) getSlot(k)!.set(c[k]);
        b.goto(sceneKey, o.data);
        step(o.settle ?? 60);
        if (o.each) {
          await o.each(c);
          step(10);
        }
        const shot = grab(false); // postrender fires inside the step below
        step(1);
        const out = await shot;
        if (o.ui ?? true) {
          // CSS animations run on wall time, which stepping does not advance (fade-ins would be caught at opacity 0): jump the finite ones to their end.
          for (const a of game.domContainer?.getAnimations({ subtree: true }) ?? []) if (Number.isFinite(a.effect?.getComputedTiming().endTime)) a.finish();
          const ui = await rasterUI(fonts).catch((e) => ((warning ??= `HUD overlay failed: ${e}`), null));
          if (ui) out.getContext('2d')!.drawImage(ui, 0, 0);
        }
        files.push((await save(`${dir}/${file(c)}.png`, await pngBlob(out))).path);
        const x = gap + (i % cols) * (cw + gap);
        const y = gap + Math.floor(i / cols) * (ch + labelH + gap);
        g.drawImage(out, x, y, cw, ch);
        g.fillStyle = '#e8e8ea';
        g.fillText(label(c), x + 4, y + ch + labelH / 2);
      }
    } finally {
      for (const k of keys) getSlot(k)!.set(before[k]);
      // Back to where the page was: the scenes that were running, started again with the data they had (not their state).
      game.scene.getScenes(true).forEach((s) => game.scene.stop(s.scene.key));
      for (const a of wasActive) game.scene.start(a.key, a.data);
      step(1);
      game.loop.wake();
    }
    const index = (await save(`${dir}/index.png`, await pngBlob(sheet))).path;
    return { index, files, ...(warning && { warning }) };
  }

  /**
   * Bug report: `games/<game>/capture/bugs/<stamp>.json` (note, scenes, state(), errors with stacks, recent console
   * warnings and errors, perf) plus `<stamp>.png` with the HUD. After a crash the frame loop is dead (Phaser schedules the
   * next frame only after this one returns), so the picture is skipped if no frame arrives rather than stepping a broken game.
   */
  async function report(note = '', o: { crashed?: boolean } = {}): Promise<Saved & { picture?: string }> {
    const b = (window as any).__game;
    const safe = (f: () => unknown) => {
      try {
        return f();
      } catch (e) {
        return `threw: ${(e as Error).stack ?? e}`;
      }
    };
    const base = `games/${gameName()}/capture/bugs/${stamp()}`;
    const data = {
      note,
      crashed: !!o.crashed,
      time: new Date().toISOString(),
      url: location.href,
      frame: game.loop.frame,
      scenes: safe(b.scenes),
      state: safe(b.state),
      errors: b.errors,
      console: b.console,
      perf: safe(b.perf),
    };
    const saved = await save(`${base}.json`, new Blob([JSON.stringify(data, null, 2)]));
    try {
      const out = await Promise.race([grab(!o.crashed), wait(400).then(() => null)]);
      if (!out) return saved;
      const ui = await rasterUI().catch(() => null);
      if (ui) out.getContext('2d')!.drawImage(ui, 0, 0);
      return { ...saved, picture: (await save(`${base}.png`, await pngBlob(out))).path };
    } catch {
      return saved;
    }
  }

  // F8 still, F9 start/stop recording, F7 bug report (opens the dev console to type the note): for whoever is playing.
  const toast = (text: string, ms = 2500) => {
    const el = Object.assign(document.createElement('div'), { textContent: text });
    el.style.cssText = 'position:fixed;right:12px;bottom:12px;padding:6px 10px;background:#000c;color:#fff;font:13px system-ui;z-index:99999;pointer-events:none';
    document.body.appendChild(el);
    if (ms) setTimeout(() => el.remove(), ms);
  };
  // The first uncaught error saves a report by itself; a frozen game otherwise looks like a hang.
  let crashed = false;
  const onCrash = () => {
    if (crashed) return;
    crashed = true;
    setTimeout(() =>
      report('', { crashed: true }).then(
        (r) => {
          toast(`error: report saved to ${r.path}`, 0);
          (window as any).__game?.logs?.add('log', `report saved: ${r.path}`, true);
        },
        (err) => toast(`error, report failed: ${err.message ?? err}`, 0),
      ),
    );
  };
  addEventListener('error', onCrash);
  addEventListener('unhandledrejection', onCrash);
  addEventListener('keydown', async (e) => {
    if (e.key !== 'F7' && e.key !== 'F8' && e.key !== 'F9') return;
    e.preventDefault();
    try {
      if (e.key === 'F7') {
        const dev = (window as any).__game?.dev;
        if (dev) dev.note(); // Enter in the console saves the report
        else {
          const note = prompt('Bug report: what went wrong?');
          if (note !== null) toast('saved ' + (await report(note)).path, 4000);
        }
      } else if (e.key === 'F8') toast((await shot()).path);
      else if (rec) toast('saved ' + (await stop()).path);
      else toast('recording, F9 to stop: ' + (await start()).recording);
    } catch (err) {
      toast(String((err as Error).message ?? err));
    }
  });

  const api = { shot, thumb, start, stop, record, render, matrix, report };
  // A game may add commands from its own src/dev/places.ts (`installPlaces`).
  try { void (import.meta.glob('../../games/*/src/dev/places.ts') as Record<string, () => Promise<{ installPlaces?: (a: object) => void }>>)[`../../games/${gameName()}/src/dev/places.ts`]?.().then((m) => m.installPlaces?.(api)); } catch { /* no game page */ }
  return api;
}
