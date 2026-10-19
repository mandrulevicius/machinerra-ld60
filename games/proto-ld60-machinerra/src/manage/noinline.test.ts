// The management kit and the Dry dock carry no inline styles (Minos: "do a stylesheet for the style, do a kit, build from it, avoid
// inline"): no `style=` in markup, no `el.style.x =`, no `cssText`. A runtime value CSS cannot know (a tooltip's place) is a custom
// property set from TS (`style.setProperty('--x', ...)`); the punch cards' smudge (`pcStyle`, `hub/punchcard.ts`) is one too.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guessedLines, itemWords } from './gearwords';

const here = join(__dirname);
const files = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? files(join(dir, n)) : [join(dir, n)]));
const scanned = [...files(here), ...files(join(here, '../dock')), join(here, '../../kit.html')].filter((f) => /\.(ts|html)$/.test(f) && !f.endsWith('.test.ts'));

describe('the management kit', () => {
  it('has no inline styles in the kit, the Dry dock or the kit page', () => {
    const bad: string[] = [];
    for (const f of scanned) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        const hit = /\sstyle\s*=/.test(line) || /\.style\.(?!setProperty\(\s*['"`]--)/.test(line) || /cssText/.test(line);
        if (hit) bad.push(`${f.slice(here.length - 6)}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it('words every item from its data: chips for numbers, a weapon its type first', () => {
    const w = itemWords('pipeWrench');
    expect(w.chips[0].type).toBe('impact');
    expect(w.chips.map((c) => c.key)).toEqual(['type', 'hit', 'rate', 'dist']);
    const plating = itemWords('scrapPlating');
    expect(plating.chips.find((c) => c.key === 'speed')!.bad).toBe(true);
    expect(itemWords('hornetHead').line).toMatch(/plain hornets leave the wearer alone/i);
    expect(itemWords('kettleHelm', 'fine').chips[0].value).toBe('+7%');
  });

  it('marks the effect lines it words itself (guesses), the leech gauntlet among them', () => {
    const g = guessedLines();
    expect(g.map((x) => x.id)).toContain('leechGauntlet');
    expect(g.find((x) => x.id === 'leechGauntlet')!.guess).toBe('melee hits: +2 oil');
  });
});
