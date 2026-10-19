import type { LevelData } from './level';

/** Level file text: one entity per line, so diffs stay readable. Shared by the editor and the save endpoint. */
export function formatLevel(data: LevelData): string {
  const { entities, ...rest } = data;
  const parts = Object.entries(rest).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const rows = entities.map((e) => `    ${JSON.stringify(e)}`).join(',\n');
  parts.push(`  "entities": [${entities.length ? `\n${rows}\n  ` : ''}]`);
  return `{\n${parts.join(',\n')}\n}\n`;
}
