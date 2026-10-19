import { describe, expect, it } from 'vitest';
import { OracleQueue, QUEUE, isSentence, readMs, type OracleLine } from './oraclequeue';

const line = (text: string, tone: OracleLine['tone'] = 'calm', hold?: boolean): OracleLine => ({ text, tone, hold });
const at = { x: 0, y: 0 };
const run = (q: OracleQueue, seconds: number, s: { typed?: boolean; busy?: boolean; at?: { x: number; y: number }; paused?: boolean; manual?: boolean } = {}) => {
  const shown: string[] = [];
  for (let t = 0; t < seconds; t += 0.1) {
    const l = q.step(0.1, { typed: s.typed ?? true, busy: s.busy ?? false, at: s.at ?? at, paused: s.paused, manual: s.manual });
    if (l) shown.push(l.text);
  }
  return shown;
};

describe('OracleQueue', () => {
  it('shows a line at once and the next only after the first is read', () => {
    const q = new OracleQueue();
    q.push(line('one'));
    q.push(line('two'));
    expect(run(q, 1)).toEqual(['one']);
    expect(run(q, QUEUE.read.base + 0.5)).toEqual(['two']);
  });

  it('a long line is read longer', () => {
    const q = new OracleQueue();
    q.push(line('x'.repeat(100)));
    q.push(line('next'));
    expect(run(q, QUEUE.read.base + 1)).toEqual(['x'.repeat(100)]);
    expect(run(q, QUEUE.read.perChar * 100)).toEqual(['next']);
  });

  it('does not count reading time while the line is still typing', () => {
    const q = new OracleQueue();
    q.push(line('one'));
    q.push(line('two'));
    expect(run(q, 20, { typed: false })).toEqual(['one']);
  });

  it('a calm line waits while the screen is busy, a warning does not', () => {
    const q = new OracleQueue();
    q.push(line('calm'));
    expect(run(q, 5, { busy: true })).toEqual([]);
    q.push(line('warn', 'warn'));
    expect(run(q, 1, { busy: true })).toEqual(['warn']);
    expect(run(q, 5, { busy: false })).toEqual(['calm']);
  });

  it('a warning goes ahead of calm lines but never cuts the line on screen', () => {
    const q = new OracleQueue();
    q.push(line('a'));
    run(q, 0.2);
    q.push(line('b'));
    q.push(line('urgent', 'urgent'));
    expect(run(q, 0.5)).toEqual([]);
    expect(run(q, 5)).toEqual(['urgent', 'b']);
  });

  it('drops a calm line that waited too long', () => {
    const q = new OracleQueue();
    q.push(line('old'));
    expect(run(q, QUEUE.stale + 2, { busy: true })).toEqual([]);
    expect(q.length).toBe(0);
  });

  it('a line is dropped when it waited longer than its own limit, a warning only if it asks', () => {
    const q = new OracleQueue();
    q.push({ ...line('moment'), within: 2 });
    q.push({ ...line('warn', 'warn'), within: 2 });
    q.push(line('keeps', 'warn'));
    q.push(line('first'));
    expect(run(q, 0.1, { busy: true })).toEqual(['warn']);
    expect(run(q, 3, { busy: true })).toEqual(['keeps']); // 'moment' waited past its 2 s and is gone; 'keeps' has no limit
    expect(run(q, 3)).toEqual(['first']);
  });

  it('a line is never taken away: with nothing behind it, it stays however long it has been read', () => {
    const q = new OracleQueue();
    q.push(line('one'));
    expect(run(q, 1)).toEqual(['one']);
    expect(run(q, 600)).toEqual([]);
    q.push(line('two'));
    expect(run(q, 0.2)).toEqual(['two']); // read long ago: the next comes at once
  });

  it('the next line waits for the time to read the one on screen, a generous one', () => {
    const text = 'x'.repeat(80);
    const q = new OracleQueue();
    q.push(line(text));
    q.push(line('next'));
    expect(run(q, 0.1)).toEqual([text]);
    expect(run(q, readMs(text) / 1000 - 0.5)).toEqual([]);
    expect(run(q, 1)).toEqual(['next']);
    expect(readMs(text)).toBeGreaterThan(5000); // 80 letters: more than five seconds
  });

  it('the read clock stands still while the player cannot be reading (a panel, the map)', () => {
    const q = new OracleQueue();
    q.push(line('one'));
    q.push(line('two'));
    run(q, 0.1);
    expect(run(q, 60, { paused: true })).toEqual([]);
    expect(run(q, QUEUE.read.base + 1)).toEqual(['two']);
  });

  it('a waiting line is not dropped as stale while the player cannot be reading', () => {
    const q = new OracleQueue();
    q.push(line('one'));
    q.push(line('calm waits'));
    run(q, 0.1);
    run(q, QUEUE.stale * 3, { paused: true });
    expect(q.length).toBe(1);
  });

  it('a stopped moment (manual) brings no line by itself, only on a press', () => {
    const q = new OracleQueue();
    q.push(line('one', 'warn'));
    q.push(line('two', 'warn'));
    expect(run(q, 1, { manual: true })).toEqual(['one']);
    expect(run(q, 600, { manual: true })).toEqual([]);
    expect(q.advance()).toBe(true);
    expect(run(q, 0.2, { manual: true })).toEqual(['two']);
    expect(run(q, 600, { manual: true })).toEqual([]);
    expect(q.advance()).toBe(false); // nothing left: the press ends the moment
  });

  it('what counts as a sentence', () => {
    expect(isSentence('Dusk')).toBe(false);
    expect(isSentence('A hunter pack is coming')).toBe(false);
    expect(isSentence('An AI core: one more robot rides the lift')).toBe(true);
    expect(isSentence('')).toBe(false);
  });

  it('a hold line stays until he moves', () => {
    const q = new OracleQueue();
    q.push(line('stay', 'calm', true));
    q.push({ ...line('after'), within: 100 });
    expect(run(q, 0.5)).toEqual(['stay']);
    expect(q.holding).toBe(true);
    expect(run(q, 30)).toEqual([]);
    expect(run(q, 0.2, { at: { x: 4, y: 0 } })).toEqual([]);
    expect(run(q, QUEUE.read.base + 1, { at: { x: QUEUE.moved + 1, y: 0 } })).toEqual(['after']);
    expect(q.holding).toBe(false);
  });
});
