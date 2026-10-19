import { describe, expect, it } from 'vitest';
import { sequences } from './assets';

describe('sequences', () => {
  it('groups numbered frames in number order and ignores singles', () => {
    const s = sequences(['hero/idle-10', 'hero/idle-2', 'hero/idle-1', 'hero/run_01', 'hero/run_02', 'ui/star', 'bg/sky2', 'ui/star2']);
    expect([...s.keys()].sort()).toEqual(['hero/idle', 'hero/run']);
    expect(s.get('hero/idle')).toEqual(['hero/idle-1', 'hero/idle-2', 'hero/idle-10']);
  });
});
