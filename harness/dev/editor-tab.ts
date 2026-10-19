/** Editor tab: opens and closes the level editor (same as F2) and lists its keys. The editor itself is harness/editor/. */
import type { Tab } from './sidebar';

const KEYS: [string, string][] = [
  ['Click, Shift+click, drag on empty', 'select, toggle, marquee'],
  ['Drag (Alt: free)', 'move, snapped to the grid'],
  ['Q, E', 'rotate -/+'],
  ['[ , ]', 'scale -/+ 0.1'],
  ['Arrows (Shift: 1 px)', 'nudge by grid'],
  ['Delete, Ctrl+D', 'delete, duplicate'],
  ['Ctrl+C, X, V', 'copy, cut, paste at the mouse'],
  ['Ctrl+Z, Ctrl+Shift+Z', 'undo, redo'],
  ['Ctrl+S', 'save the level file'],
  ['G', 'grid snap on/off'],
  ['P', 'run the scene while editing'],
  ['F2', 'open or close the editor'],
];

export function editorTab(close: () => void): Tab {
  const el = document.createElement('div');
  el.className = 'dv-stack';
  const editor = () => (window as any).__game?.editor;

  const render = () => {
    const ed = editor();
    el.innerHTML = `
      ${
        ed
          ? `<div class="dv-wrap"><button class="dv-btn dv-on" data-act="toggle">${ed.editing() ? 'Close editor' : 'Open editor'}</button></div>
             <div class="dv-note">${ed.path ? `File: ${ed.path}` : 'No file path: this level cannot be saved.'}${ed.editing() && ed.dirty() ? ' · unsaved changes' : ''}</div>`
          : `<div class="dv-note">No level in this scene. A scene gets the editor by calling loadLevel (harness/editor/README.md).</div>`
      }
      <table class="dv-keys">${KEYS.map(([k, d]) => `<tr><td>${k}</td><td>${d}</td></tr>`).join('')}</table>`;
  };

  el.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act=toggle]');
    const ed = editor();
    if (!t || !ed) return;
    if (ed.editing()) ed.close();
    else {
      ed.open();
      close(); // the editor has its own panels on the right
    }
    render();
  });

  return { el, show: render };
}
