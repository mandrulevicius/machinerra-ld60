/**
 * Console tab: the game's console output (errors with stacks, warnings, logs), a command line, and notes for agents.
 * Enter runs a command (commands.ts); a line starting with `>` saves a bug report with that text as the note.
 * Keys typed here must not reach the game: the sidebar stops key events from bubbling to Phaser (sidebar.ts).
 */
import { complete } from './commands';
import type { LogEntry } from '../bridge';
import type { Tab } from './sidebar';

const MAX_ROWS = 500;
const history: string[] = [];
const pad = (n: number) => String(n).padStart(2, '0');
const clock = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export function consoleTab(): Tab & { note(text?: string): void; destroy(): void } {
  const g = () => (window as any).__game;
  const el = document.createElement('div');
  el.className = 'dv-console';
  el.innerHTML = `
    <div class="dv-wrap dv-filters">
      ${(['error', 'warn', 'log'] as const).map((l) => `<label class="dv-check"><input type="checkbox" data-level="${l}" checked>${l}</label>`).join('')}
      <button class="dv-btn" data-act="clear" style="margin-left:auto">Clear</button>
    </div>
    <div class="dv-log" data-log></div>
    <div class="dv-input">
      <input type="text" data-line spellcheck="false" autocomplete="off" placeholder="command (help), or > note for agents">
      <button class="dv-btn" data-act="note" title="Save a bug report with the text as the note">Note</button>
    </div>`;
  const log = el.querySelector<HTMLElement>('[data-log]')!;
  const input = el.querySelector<HTMLInputElement>('[data-line]')!;
  const hidden = new Set<string>();
  let hi = 0; // history position

  const rowOf = (e: LogEntry) => {
    const row = document.createElement('div');
    row.className = `dv-l dv-l-${e.cmd ? 'cmd' : e.level}${e.level === 'error' ? ' dv-err' : ''}`;
    row.innerHTML = `<time>${clock(e.t)}</time><pre>${esc(e.text)}</pre>`;
    return row;
  };
  const add = (e: LogEntry) => {
    const stuck = log.scrollTop + log.clientHeight >= log.scrollHeight - 24;
    log.appendChild(rowOf(e));
    while (log.childElementCount > MAX_ROWS) log.firstElementChild!.remove();
    if (stuck) log.scrollTop = log.scrollHeight;
  };
  // Rows are built only while the tab is on screen (subscribed in show, dropped in hide); the entries are stored by the bridge
  // either way, so opening the tab rebuilds from them.
  let off: (() => void) | null = null;
  const stop = () => {
    off?.();
    off = null;
  };

  const submit = async (line: string) => {
    const text = line.trim();
    if (!text) return;
    if (history[history.length - 1] !== text) history.push(text);
    hi = history.length;
    const note = text.startsWith('>');
    g().logs.add('log', note ? `note: ${text.slice(1).trim()}` : `$ ${text}`, true);
    const r = await g().cmd(text);
    // cmd() gives the text only; a failure starts with "error: ".
    g().logs.add(r.startsWith('error: ') ? 'error' : 'log', r, true);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const line = input.value;
      input.value = '';
      submit(line);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const r = complete(input.value);
      input.value = r.line;
      if (r.options.length > 1) g().logs.add('log', r.options.join('  '), true);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      hi = Math.max(0, Math.min(history.length, hi + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[hi] ?? '';
    } else if (e.key === 'Escape') input.blur();
  });

  el.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.dataset.level) return;
    t.checked ? hidden.delete(t.dataset.level) : hidden.add(t.dataset.level);
    log.dataset.hide = [...hidden].join(' ');
  });
  el.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'clear') g().logs.clear();
    else if (act === 'note') {
      const text = input.value.replace(/^>\s*/, '');
      input.value = '';
      submit(`> ${text}`);
    }
  });

  return {
    el,
    show() {
      stop();
      const rows = document.createDocumentFragment();
      g().logs.entries.slice(-MAX_ROWS).forEach((e: LogEntry) => rows.appendChild(rowOf(e)));
      log.replaceChildren(rows);
      log.scrollTop = log.scrollHeight;
      off = g().logs.on((e: LogEntry | null) => (e ? add(e) : (log.textContent = '')));
    },
    hide: stop,
    /** Focus the input with `> ` ready, for F7. */
    note(text = '') {
      input.value = `> ${text || input.value.replace(/^>\s*/, '')}`;
      input.focus();
    },
    destroy: stop,
  };
}
