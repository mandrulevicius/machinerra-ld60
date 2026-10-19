import { describe, expect, it } from 'vitest';
import { formatLevel } from './format';
import { levelFile } from './vite-plugin';

describe('save endpoint paths', () => {
  const root = '/repo';
  it('accepts games/<game>/levels/<name>.json', () => {
    expect(levelFile(root, 'games/lab/levels/demo.json')).toMatch(/lab.levels.demo.json$/);
  });
  it('accepts one folder down: games/<game>/levels/<folder>/<name>.json', () => {
    expect(levelFile(root, 'games/lab/levels/places/graveyard.json')).toMatch(/lab.levels.places.graveyard.json$/);
  });
  it.each([
    'games/lab/src/main.ts',
    '../vite.config.ts',
    'games/lab/levels/../../x.json',
    'games/lab/levels/a/b/x.json',
    'games/lab/levels/../x.json',
    'games/lab/levels//x.json',
    'games/lab/levels/.json',
    '/etc/x.json',
    'harness/levels/x.json',
    'games/lab/levels/x.json\0.txt',
    42,
  ])('rejects %s', (p) => expect(levelFile(root, p)).toBeNull());
});

describe('formatLevel', () => {
  it('writes one entity per line and round-trips', () => {
    const data = { name: 'a', entities: [{ id: 'a', type: 't', x: 1, y: 2 }, { id: 'b', type: 't', x: 3, y: 4, scale: 2 }] };
    const text = formatLevel(data);
    expect(text.split('\n')).toHaveLength(8);
    expect(JSON.parse(text)).toEqual(data);
    expect(JSON.parse(formatLevel({ entities: [] }))).toEqual({ entities: [] });
  });
});
