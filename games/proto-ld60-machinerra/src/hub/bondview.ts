/**
 * The relationship gauge (P52), as markup: five brass teeth round a small cog, one lit per quest handed in to the NPC, the name of the
 * step reached under it. A tooth lit since the gauge was last drawn pops once (`fresh` of them); the fifth turns the cog. Pure strings,
 * so the station panel (`stations/npc.ts`) and the quest log (`questlog.ts`) draw the same one. Look: `bond.css`.
 */
import { BONDS, STEPS } from './bonds';
import './bond.css';

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);

/** The cog and its teeth as an SVG: tooth `i` is lit when `i < n`, and pops when it is among the last `fresh` lit. */
export function cogSvg(n: number, fresh = 0): string {
  const teeth = Array.from({ length: STEPS }, (_, i) =>
    `<rect class="hb-tooth${i < n ? ' is-lit' : ''}${i < n && i >= n - fresh ? ' is-new' : ''}" x="-4.5" y="-24" width="9" height="11" rx="2" transform="translate(28 28) rotate(${i * (360 / STEPS)})"/>`,
  ).join('');
  const turn = n >= STEPS && fresh > 0 ? ' is-turning' : '';
  return `<svg class="hb-cog${turn}" viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">${teeth}<circle class="hb-cog__body" cx="28" cy="28" r="14"/><circle class="hb-cog__hub" cx="28" cy="28" r="4"/><path class="hb-cog__spokes" d="M28 16v8M28 32v8M16 28h8M32 28h8"/></svg>`;
}

/** The gauge: the cog, the step's name under it, and `note` (what is next, or what it waits on) beside. Empty for an NPC with no track. */
export function bondHtml(npc: string, n: number, note = '', fresh = 0): string {
  const def = BONDS[npc];
  if (!def) return '';
  const name = n > 0 ? def.steps[Math.min(n, STEPS) - 1] : 'Strangers';
  return `<div class="hb-story hb-bond" title="Their bond with you: five steps, one for each quest you hand in to them"><span class="hb-bond__cog">${cogSvg(n, fresh)}<small>${esc(name)}</small></span>${note ? `<span class="hb-story__note">${esc(note)}</span>` : ''}</div>`;
}
