/**
 * Console commands: a registry any game can add to, run from the dev console and by agents (`__game.cmd('goto Play')`).
 *
 *   command('god', (args) => { god = args[0] !== 'off'; return `god ${god ? 'on' : 'off'}` }, 'god [off]: no damage');
 *
 * `run` gets the words after the name (quotes group: `say "hi there"`) and may return anything or a promise: a string is
 * shown as is, undefined as `ok`, other values as JSON; a throw is shown as `error: ...`. Every command is in a group
 * (default: the game's id); names stay short and `group.name` is needed only where two groups share a name. Registering
 * a name in the same group again replaces it (a scene's create() can register). Pure logic; the built-ins are in
 * builtins.ts. Tiny, so builds keep it.
 */
export type CommandRun = (args: string[]) => unknown | Promise<unknown>;

export interface Command {
  name: string;
  /** The module it belongs to: `dev` / `kit` for built-ins, else the game's id or what the game passed. */
  group: string;
  run: CommandRun;
  help: string;
  /** Candidates for the first argument, for Tab completion. */
  args?: () => string[];
}

export interface CommandOptions {
  /** Defaults to the game's id. */
  group?: string;
  args?: () => string[];
}

/** Groups of the harness's own commands; `help` lists them after the game's. */
export const BUILTIN_GROUPS = ['dev', 'kit'];

let gameGroup = 'game';
/** The default group for commands registered from now on; `initKit` sets it to the game id. */
export const setGameGroup = (id: string) => void (gameGroup = id);

const registry = new Map<string, Command>(); // keyed `group.name`
const keyOf = (c: { group: string; name: string }) => `${c.group}.${c.name}`;

/**
 * Add a command; returns a function that removes it. `help` is one line, usually `name <args>: what it does`. The fourth
 * argument is either the Tab candidates for the first argument or `{ group, args }`.
 */
export function command(name: string, run: CommandRun, help = '', opts?: (() => string[]) | CommandOptions) {
  const o = typeof opts === 'function' ? { args: opts } : opts ?? {};
  const group = o.group ?? gameGroup;
  for (const w of [name, group]) if (!w || /[\s.]/.test(w) || w.startsWith('>')) throw new Error(`bad command name "${w}"`);
  const c: Command = { name, group, run, help, args: o.args };
  registry.set(keyOf(c), c);
  return () => void (registry.get(keyOf(c)) === c && registry.delete(keyOf(c)));
}

export const commands = () => [...registry.values()].sort((a, b) => a.name.localeCompare(b.name) || a.group.localeCompare(b.group));

/** A command by `name` or `group.name`; a bare name in several groups is ambiguous and says how to qualify it. */
export function find(word: string): { cmd: Command } | { error: string } {
  const hits = commands().filter((c) => word === c.name || word === keyOf(c));
  if (hits.length === 1) return { cmd: hits[0] };
  if (!hits.length) return { error: `unknown command "${word}". Try: help` };
  return { error: `"${word}" is in several groups; use ${hits.map(keyOf).join(' or ')}` };
}

/**
 * The text of `help`: one line per group (a name that exists in another group too is shown qualified); `help <group>`
 * the usage and help of each command in it; `help <command>` that command's. Throws for an unknown topic.
 */
export function helpText(topic?: string): string {
  const all = commands();
  const groups = new Map<string, Command[]>();
  for (const c of all) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
  const line = (c: Command) => c.help || c.name;
  if (!topic) {
    const rank = (g: string) => (BUILTIN_GROUPS.includes(g) ? 1 : 0);
    const dup = (n: string) => all.filter((c) => c.name === n).length > 1;
    const lines = [...groups.keys()]
      .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
      .map((g) => `${g}: ${groups.get(g)!.map((c) => (dup(c.name) ? keyOf(c) : c.name)).join(' ')}`);
    return [...lines, 'help <group> or help <command> shows usage'].join('\n');
  }
  const parts: string[] = [];
  const members = groups.get(topic);
  if (members) parts.push(members.map(line).join('\n'));
  const r = find(topic);
  if ('cmd' in r) {
    if (r.cmd.group !== topic) parts.push(line(r.cmd));
  } else if (!members) throw new Error(r.error.startsWith('unknown') ? `no command or group "${topic}". Try: help` : r.error);
  return parts.join('\n\n');
}

/** Words of a line; "double" or 'single' quotes keep spaces inside one word. */
export function parseLine(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

const show = (v: unknown) => {
  if (v === undefined) return 'ok';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
};

/**
 * Run a line. `> text` is a note for agents and runs `dev.report text`. Never throws: failures come back with `ok: false`
 * and text starting `error: `.
 */
export async function runLine(line: string): Promise<{ ok: boolean; text: string }> {
  const t = line.trim();
  const words = t.startsWith('>') ? ['dev.report', t.slice(1).trim()] : parseLine(t);
  if (!words.length) return { ok: true, text: '' };
  const found = find(words[0]);
  if ('error' in found) return { ok: false, text: `error: ${found.error}` };
  const c = found.cmd;
  try {
    return { ok: true, text: show(await c.run(words.slice(1))) };
  } catch (e) {
    return { ok: false, text: `error: ${(e as Error).message ?? e}` };
  }
}

const common = (words: string[]) => words.reduce((p, w) => { let i = 0; while (i < p.length && p[i] === w[i]) i++; return p.slice(0, i); });

/** Tab completion: the line with its last word completed as far as it is unambiguous, and the candidates. */
export function complete(line: string): { line: string; options: string[] } {
  const m = /^(.*?)(\S*)$/s.exec(line)!;
  const [, head, word] = m;
  const words = parseLine(head);
  let pool: string[] = [];
  if (!words.length) {
    // Bare names; where a name is in several groups only its qualified forms. `group.` narrows to qualified names.
    const all = commands();
    pool = word.includes('.') ? all.map(keyOf) : all.map((c) => (all.some((d) => d !== c && d.name === c.name) ? keyOf(c) : c.name));
  } else if (words.length === 1) {
    const f = find(words[0]);
    pool = 'cmd' in f ? f.cmd.args?.() ?? [] : [];
  }
  const options = [...new Set(pool.filter((n) => n.startsWith(word)))].sort();
  if (!options.length) return { line, options };
  const done = options.length === 1 ? options[0] + ' ' : common(options);
  return { line: head + done, options };
}
