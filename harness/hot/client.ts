/**
 * Page side of hot reload (dev only; bridge.ts loads it). See README.md.
 *
 * Scene modules (see vite-plugin.ts) call `globalThis.__hotSwap(newModule)`; `swap` replaces the registered scene class and
 * restarts the scene if it was alive, passing `{ ...oldData, hot: state }`. Asset files announced by the server drop their
 * Phaser cache entries and restart the alive scenes the same way; audio files are decoded again in place.
 */
import Phaser from 'phaser';
import { mapSwap, rebase } from './swapmap';

type Cls = new () => Phaser.Scene;

/** One reload, for `__game.hot.log`. */
export interface HotEntry {
  t: number;
  what: string;
  scenes: string[];
}

const { START, RUNNING, SLEEPING } = Phaser.Scenes; // INIT is a registered scene that never started

export function installHot(game: Phaser.Game) {
  const log: HotEntry[] = [];
  const memory = new Map<string, unknown>(); // last state handed to each scene: survives a restart that crashed in create()
  const loaded: { type: string; key: string; url: string; parent?: { type: string; key: string } }[] = [];

  const scenes = () => game.scene.scenes as Phaser.Scene[];
  const alive = (s: Phaser.Scene) => s.sys.settings.status >= START && s.sys.settings.status <= SLEEPING;
  const editorDirty = () => !!(window as any).__game?.editor?.dirty?.();

  // ---- toast ----
  let toastEl: HTMLDivElement | null = null;
  let toastTimer = 0;
  const toast = (text: string) => {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.style.cssText =
        'position:fixed;left:12px;bottom:12px;z-index:2147483000;pointer-events:none;padding:4px 10px;border-radius:4px;' +
        'font:12px/1.4 ui-monospace,Consolas,monospace;color:#e8ecf4;background:rgba(18,22,32,.88);border:1px solid #3a4560;transition:opacity .4s';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl && (toastEl.style.opacity = '0'), 2200);
  };

  // ---- restart ----
  const stateOf = (s: Phaser.Scene): unknown => {
    const o = s as any;
    try {
      return s.sys.settings.status >= RUNNING ? (o.hotState ?? o.debugState)?.call(s) : undefined;
    } catch {
      return undefined;
    }
  };

  /**
   * Stop the alive scenes among `targets` (their shutdown handlers run: kit parts, onEscape), run `between`, replace the
   * class where `cls` is given, then start the alive ones again. Returns the restarted keys.
   */
  function reload(targets: { scene: Phaser.Scene; cls?: Cls }[], between?: () => void): string[] {
    // The game menu holds the paused scene instances: close it first (it resumes them), or Resume would touch dead ones.
    const menu = (window as any).__game?.kit?.menu;
    if (menu?.isOpen?.()) menu.close();
    const plans = targets.map(({ scene, cls }) => {
      const key = scene.scene.key;
      const isAlive = alive(scene);
      const state = isAlive ? (stateOf(scene) ?? memory.get(key)) : undefined;
      const data = { ...(scene.sys.settings.data as object) } as Record<string, unknown>;
      if (state !== undefined) {
        data.hot = state;
        memory.set(key, state);
      } else delete data.hot;
      return { key, cls, isAlive, data };
    });
    for (const p of plans) if (p.isAlive) game.scene.stop(p.key);
    between?.();
    for (const p of plans) {
      if (!p.cls) continue;
      game.scene.remove(p.key);
      if (game.scene.getScene(p.key)) throw new Error(`scene ${p.key} could not be replaced`);
      game.scene.add(p.key, p.cls as unknown as typeof Phaser.Scene);
    }
    const ran = plans.filter((p) => p.isAlive);
    for (const p of ran) game.scene.start(p.key, p.data);
    return ran.map((p) => p.key);
  }

  /** A sleeping scene keeps its instance and state; its class is swapped when it next shuts down (a later edit replaces an earlier one). */
  const waiting = new Map<Phaser.Scene, { cls: Cls; between: () => void }>();
  function later(scene: Phaser.Scene, cls: Cls, between: () => void) {
    const queued = waiting.has(scene);
    waiting.set(scene, { cls, between });
    if (queued) return;
    const arm = () =>
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
        setTimeout(() => {
          if (alive(scene)) return arm(); // restarted in the same breath: wait for the next end
          const w = waiting.get(scene)!;
          waiting.delete(scene);
          try {
            reload([{ scene, cls: w.cls }], w.between);
            record('code', [], `reloaded ${scene.scene.key} (it ended)`);
          } catch (e) {
            console.error('[hot] swap failed, reloading the page', e);
            location.reload();
          }
        }),
      );
    arm();
  }

  const record = (what: string, ran: string[], text: string) => {
    log.push({ t: Date.now(), what, scenes: ran });
    if (log.length > 50) log.shift();
    console.info(`[hot] ${text}`);
    toast(text);
  };

  // ---- changes are applied together after a short pause, and not while the editor holds unsaved edits ----
  const classes = new Map<string, Cls>();
  const assetPaths = new Set<string>();
  let timer = 0;
  let held = false;
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(run, 80);
  };

  async function run() {
    if (!classes.size && !assetPaths.size) return;
    if (editorDirty()) {
      if (!held) toast('reload held: unsaved level edits (save to apply)');
      held = true;
      timer = window.setTimeout(run, 500);
      return;
    }
    held = false;
    try {
      if (classes.size) {
        const found = new Map(classes);
        classes.clear();
        const plan = mapSwap(scenes().map((s) => ({ key: s.scene.key, cls: s.constructor })), found, Phaser.Scene);
        const byKey = (key: string) => scenes().find((s) => s.scene.key === key)!;
        const targets = plan.touched.map((key) => ({ scene: byKey(key), cls: (plan.replace.get(key) ?? byKey(key).constructor) as Cls }));
        // A scene asleep (the land under a dungeon) keeps its instance and state: it takes the new code when it ends.
        const asleep = targets.filter((t) => t.scene.sys.settings.status === SLEEPING);
        const now = targets.filter((t) => !asleep.includes(t));
        const reparent = (keys: string[]) => () => {
          for (const r of plan.reparent) {
            if (!keys.includes(r.key)) continue;
            rebase(r.sub, r.base);
          }
        };
        const ran = reload(now, reparent(now.map((t) => t.scene.scene.key)));
        for (const t of asleep) later(t.scene, t.cls, reparent([t.scene.scene.key]));
        const keys = plan.touched;
        const text = keys.length
          ? `${ran.length ? 'reloaded' : 'updated'} ${keys.join(', ')}${asleep.length ? ` (${asleep.map((t) => t.scene.scene.key).join(', ')} asleep: swaps when it ends)` : ''}`
          : `updated ${plan.unused.join(', ')}`;
        record('code', ran, text);
      }
      if (assetPaths.size) {
        const paths = [...assetPaths];
        assetPaths.clear();
        await assets(paths);
      }
    } catch (e) {
      console.error('[hot] swap failed, reloading the page', e);
      location.reload();
    }
  }

  /** Called by a changed scene module. False: nothing here can take this module, so Vite reloads the page. */
  function swap(mod: Record<string, unknown>): boolean {
    const no = (why: string) => (console.info(`[hot] full reload: ${why}`), sessionStorage.setItem('hot:why', why), false);
    const found = new Set(Object.values(mod).filter((v): v is Cls => typeof v === 'function' && v.prototype instanceof Phaser.Scene));
    if (!found.size) return no('the module exports no scene class');
    for (const cls of found) {
      if (!cls.name || cls.name === 'default') return no('anonymous scene class');
      classes.set(cls.name, cls);
    }
    schedule();
    return true;
  }

  // ---- assets ----
  const pathOf = (url: string) => decodeURIComponent(new URL(url, document.baseURI).pathname);
  // Phaser forgets where a cache entry came from, so note every file a loader is given.
  const proto = Phaser.Loader.LoaderPlugin.prototype as any;
  const addFile = proto.addFile;
  proto.addFile = function (this: unknown, files: any) {
    for (const f of Array.isArray(files) ? files : [files]) {
      if (typeof f?.url !== 'string') continue;
      const url = pathOf(f.url);
      if (!loaded.some((l) => l.url === url && l.key === f.key && l.type === f.type))
        loaded.push({ type: f.type, key: f.key, url, parent: f.multiFile && { type: f.multiFile.type, key: f.multiFile.key } });
    }
    return addFile.call(this, files);
  };

  const TEXTURES = new Set(['image', 'multiatlas', 'atlasjson', 'atlasxml', 'unityatlas', 'spritesheet', 'svg', 'normalMap']);
  const dropCache = (type: string, key: string) => {
    if (TEXTURES.has(type)) {
      // Animations are global and kept by key; ones built from this texture would point at its old frames.
      for (const a of Object.values<any>(((game.anims as any).anims).entries)) if (a.frames.some((f: any) => f.textureKey === key)) game.anims.remove(a.key);
      game.textures.exists(key) && game.textures.remove(key);
    } else (game.cache as any)[type]?.remove?.(key);
  };

  async function assets(paths: string[]) {
    const audioDone: string[] = [];
    const drop = new Map<string, { type: string; key: string }>();
    for (const path of paths) {
      const m = /\/public\/audio\/(.+)\.(?:ogg|mp3|wav|m4a)$/.exec(path);
      const audio = (window as any).__game?.kit?.audio;
      if (m && audio) {
        const key = m[1].startsWith('sfx/') ? m[1].slice(4) : m[1];
        if (audio.buffer(key)) {
          try {
            const r = await fetch(`${path}?t=${Date.now()}`);
            if (r.ok && (await audio.decode(key, await r.arrayBuffer()))) audioDone.push(key);
          } catch (e) {
            console.warn(`[hot] could not reload sound ${key}`, e);
          }
        }
      }
      for (const l of loaded.filter((l) => l.url === path)) {
        const target = l.parent ?? l;
        drop.set(`${target.type}:${target.key}`, target);
      }
    }
    if (audioDone.length) record('audio', [], `reloaded sound ${audioDone.join(', ')} (music already playing keeps the old one)`);
    if (drop.size) {
      const ran = reload(scenes().filter(alive).map((scene) => ({ scene })), () => drop.forEach((d) => dropCache(d.type, d.key)));
      record('assets', ran, `reloaded ${ran.join(', ') || 'assets'}: ${[...drop.values()].map((d) => d.key).join(', ')}`);
    }
  }

  // ---- wiring ----
  (globalThis as any).__hotSwap = swap;
  import.meta.hot?.on('harness:toast', ({ text }: { text: string }) => toast(text));
  import.meta.hot?.on('harness:asset', ({ url }: { url: string }) => {
    assetPaths.add(decodeURIComponent(url));
    schedule();
  });
  import.meta.hot?.on('vite:beforeFullReload', (p: { path?: string; triggeredBy?: string }) => {
    try {
      sessionStorage.setItem('hot:full', (p.triggeredBy ?? p.path ?? '').split(/[\\/]/).pop() || 'a module');
    } catch {}
  });
  try {
    const was = sessionStorage.getItem('hot:full');
    if (was) {
      const why = sessionStorage.getItem('hot:why');
      sessionStorage.removeItem('hot:full');
      sessionStorage.removeItem('hot:why');
      toast(`full reload: ${was} cannot be swapped${why ? ` (${why})` : ''}`);
    }
  } catch {}

  return {
    /** Recent reloads (code, assets, audio), newest last. */
    log,
    /** Restart alive scenes (default: all) with their state, without swapping code. Returns the keys. */
    restart: (...keys: string[]) => {
      const ran = reload(scenes().filter((s) => alive(s) && (!keys.length || keys.includes(s.scene.key))).map((scene) => ({ scene })));
      record('restart', ran, `restarted ${ran.join(', ')}`);
      return ran;
    },
  };
}
