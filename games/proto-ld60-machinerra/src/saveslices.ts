/**
 * The save audit's wiring (`saveaudit.ts` does the proving): the slices it fills with their samples, the dev commands `save`
 * (audit, show) and `stock` (the economy's stocks). A slice carries its own sample: `persist('key', fresh, { sample })` in the
 * file that declares it. Importing the slice modules below is what registers them.
 *
 * **Add a slice** (`persist('key', ...)`): give it `{ sample }`, every field with non-default data, lists and records
 * filled (the type makes the compiler name a missing field). `saveslices.test.ts` fails for a slice without one, and `save audit`
 * in the game names it. Import its module below if nothing else loads it. Run `save audit` after every feature that adds state.
 */
import { command } from '../../../harness/dev/commands';
import { audit, type AuditSlice } from './saveaudit';
import { hub, registeredKeys, sliceEntries, slot } from './hub/save';
// Importing a module registers its slices: these are all of them (the test checks the source for any other).
import { discovered } from './hub/carry';
import { economy } from './hub/economy';
import './hub/deeds';
import './hub/researchslice';
import './hub/talkslice';
import './hub/princessslice';
import './hub/workshop';
import './hub/playtime';
import './guide';
import { registerResearchCommands } from './hub/researchdev';
import { SUPPORT, type SupportId } from './sim/defs';

/** The registered slices that have a sample (a slice without one is left out: `audit` reports it). */
export function auditSlices(): AuditSlice[] {
  return sliceEntries().filter((e) => e.sample !== undefined);
}

/** A slice's sample, by key (the tests). */
export const sampleOf = (key: string): unknown => sliceEntries().find((e) => e.key === key)?.sample;

/** The slot's file, for the audit to put back. */
export const slotFile = {
  read: () => slot.list()[0]?.data,
  write: (data: unknown) => slot.put(0, data),
  clear: () => slot.clear(0),
};

/** Run the audit on the live save: the problems, empty when every slice survives a save and a reload. */
export const auditSave = () => audit(auditSlices(), registeredKeys(), slotFile);

const STOCKS = ['scrap', 'insight', 'cores', 'copper', 'coal'] as const;

/** Dev commands that work in every scene (the save belongs to none of them). */
export function registerSaveCommands() {
  registerResearchCommands();
  command('save', ([what = 'audit']) => {
    if (what === 'show') return Object.fromEntries(sliceEntries().map((e) => [e.key, `${JSON.stringify(e.get()).length} bytes`]));
    if (what !== 'audit') return 'error: save [audit|show]';
    const problems = auditSave();
    return problems.length ? `${problems.length} problem${problems.length > 1 ? 's' : ''}:\n${problems.join('\n')}` : `clean: ${registeredKeys().length} slices survive a save and a reload (${registeredKeys().join(', ')})`;
  }, 'save [audit|show]: audit fills every slice with its sample, saves, reloads and lists whatever came back different (then puts your save back); show lists the slices and their size', { group: 'save', args: () => ['audit', 'show'] });
  command('stock', ([what, n, m]) => {
    const e = economy.get();
    if (!what) return { ...e, haul: undefined, parts: hub.get().parts };
    if (what === 'charges') {
      if (!(n in SUPPORT)) return `error: stock charges <${Object.keys(SUPPORT).join('|')}> <n>`;
      economy.set({ ...e, charges: { ...e.charges, [n as SupportId]: Math.max(0, Math.floor(Number(m) || 0)) } });
      return `${n} charges kept: ${Math.max(0, Math.floor(Number(m) || 0))} (the next lift goes down with them)`;
    }
    if (!(STOCKS as readonly string[]).includes(what) || n === undefined || !Number.isFinite(Number(n)) || Number(n) < 0) return `error: stock [${STOCKS.join('|')}] <n>, or stock charges <call> <n>`;
    economy.set({ ...e, [what]: Math.floor(Number(n)) });
    return `${what}: ${Math.floor(Number(n))} (was ${e[what as (typeof STOCKS)[number]]})`;
  }, 'stock [scrap|insight|cores|copper|coal <n> | charges <call> <n>]: the economy\'s stocks at home (no argument: show them)', { group: 'save', args: () => [...STOCKS, 'charges'] });
  command('discovered', () => discovered.get(), 'discovered: the kinds of place found on any land so far (saved)', { group: 'save' });
}
