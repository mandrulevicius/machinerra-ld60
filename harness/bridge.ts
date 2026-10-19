import Phaser from 'phaser';
import { runLine } from './dev/commands';

export type LogLevel = 'log' | 'warn' | 'error';
/** One console line. `cmd` marks the dev console's own input echo and command output. */
export interface LogEntry {
  t: number;
  level: LogLevel;
  text: string;
  cmd?: boolean;
}

/**
 * Debug bridge for agents: `window.__game` in the browser.
 *   __game.scenes()          active scene keys
 *   __game.state()           each active scene's debugState(), if it defines one
 *   __game.scene(key)        the scene instance, to call its debug methods
 *   __game.goto(key, data)   stop active scenes, start `key`
 *   __game.perf()            fps and display-object count per active scene
 *   __game.errors            uncaught errors since load, with stacks
 *   __game.console           the last 30 console warnings and errors
 *   __game.logs              the dev console's log: entries (last 500: log, warn, error, uncaught errors with stacks), on(fn), clear()
 *   __game.cmd(line)         run a dev console command (`help`, `goto Play`, `> note`); promise of its output (harness/dev/README.md)
 *   __game.dev               the dev sidebar: open(tab?), close(), toggle(), note(text?) (harness/dev/README.md)
 *   __game.capture           shot / record / render / report to games/<game>/capture/ (dev only; harness/capture/README.md)
 *   __game.hot               hot reload (dev server only; harness/hot/README.md): log of reloads, restart(...keys) restarts scenes with their state
 * URL `?scene=Key&a=1` starts at that scene with data {a: 1} (see startScene).
 * Console capture and commands need the dev server or `?dev=1`.
 */
export function installBridge(game: Phaser.Game) {
  const dev = import.meta.env.DEV || new URLSearchParams(location.search).get('dev') === '1';
  const errors: string[] = [];
  const logs = createLogs();
  addEventListener('error', (e) => {
    const text = String(e.error?.stack ?? e.message);
    errors.push(text);
    if (dev) logs.add('error', text);
  });
  addEventListener('unhandledrejection', (e) => {
    const text = String(e.reason?.stack ?? e.reason);
    errors.push(text);
    if (dev) logs.add('error', text);
  });
  // Kept for bug reports (capture/README.md): what the engine and game warned about before things went wrong.
  const log: string[] = [];
  if (dev) {
    for (const [method, level] of [['log', 'log'], ['info', 'log'], ['debug', 'log'], ['warn', 'warn'], ['error', 'error']] as const) {
      const orig = console[method].bind(console);
      console[method] = (...args: unknown[]) => {
        const text = args.map(show).join(' ').slice(0, 4000);
        logs.add(level, text);
        if (level !== 'log') {
          log.push(`${level}: ${text}`);
          if (log.length > 30) log.shift();
        }
        orig(...args);
      };
    }
  }
  const active = () => game.scene.getScenes(true);
  let lastStep = 0;
  // The dev modules load a moment after boot; cmd() waits for them.
  let ready: Promise<unknown> = Promise.resolve();
  const bridge = {
    game,
    errors,
    console: log,
    logs,
    scenes: () => active().map((s) => s.scene.key),
    scene: (key: string) => game.scene.getScene(key),
    state: () =>
      Object.fromEntries(active().map((s) => [s.scene.key, (s as any).debugState?.() ?? null])),
    perf: () => ({
      fps: Math.round(game.loop.actualFps),
      objects: Object.fromEntries(active().map((s) => [s.scene.key, s.children.length])),
    }),
    step: (n = 1) => {
      // Monotonic: a later call must not restart behind where the previous one ended.
      let t = Math.max(performance.now(), lastStep);
      for (let i = 0; i < n; i++) game.step((t += 1000 / 60), 1000 / 60);
      lastStep = t;
    },
    goto: (key: string, data?: object) => {
      // start() restarts a running scene itself; stopping it first as well leaves it stopped.
      active().forEach((s) => s.scene.key !== key && s.scene.stop());
      game.scene.start(key, data);
    },
    /** Resolves when the dev modules (console commands, capture, hot reload) are loaded; bootGame waits for it before the first scene. */
    whenReady: () => ready.catch(() => {}),
    cmd: async (line: string) => {
      await ready;
      return (await runLine(line)).text;
    },
  };
  (window as any).__game = bridge;
  if (dev) {
    ready = Promise.all([
      import('./dev/builtins').then((m) => m.registerBuiltins(game, bridge)),
      // The save endpoint exists only on the dev server.
      import.meta.env.DEV ? import('./capture/capture').then((m) => ((bridge as any).capture = m.createCapture(game, bridge.step))) : null,
      import.meta.env.DEV ? import('./hot/client').then((m) => ((bridge as any).hot = m.installHot(game))) : null,
    ]);
  }
  return bridge;
}

/** Text of one console argument: strings as is, errors with their stack, other values as JSON. */
function show(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return a.stack ?? String(a);
  try {
    return (JSON.stringify(a) ?? String(a)).slice(0, 2000);
  } catch {
    return String(a);
  }
}

function createLogs() {
  const MAX = 500;
  const entries: LogEntry[] = [];
  const subs = new Set<(e: LogEntry | null) => void>();
  return {
    entries,
    /** Add a line (the dev console uses it for its own output). */
    add(level: LogLevel, text: string, cmd = false) {
      const e: LogEntry = { t: Date.now(), level, text, ...(cmd && { cmd }) };
      entries.push(e);
      if (entries.length > MAX) entries.shift();
      subs.forEach((f) => f(e));
      return e;
    },
    /** Called with each new entry, or null after clear(); returns an unsubscribe function. */
    on(fn: (e: LogEntry | null) => void) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    clear() {
      entries.length = 0;
      subs.forEach((f) => f(null));
    },
  };
}

/** Scene to boot into: `?scene=Key` overrides `fallback`; other params become its data (numbers parsed). */
export function startScene(fallback: string): { key: string; data: Record<string, string | number> } {
  const { scene, ...params } = Object.fromEntries(new URLSearchParams(location.search));
  const data = Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, v !== '' && !isNaN(Number(v)) ? Number(v) : v]),
  );
  return { key: scene ?? fallback, data };
}
