import { describe, expect, it } from 'vitest';
import { NO_INPUT, Sim, type SimEvent } from './sim';
import { VOICE, VOICE_LINES, staticOf } from './princessvoice';

const alone = (wife?: 'home' | 'stolen') => {
  const s = new Sim(7, [], 'desert', [], undefined, undefined, { tier: 1, ...(wife && { wife }) });
  s.bots = [s.controller];
  s.cfg.swarm = 0;
  s.controller.hp = s.controller.maxHp = 1e6;
  return s;
};
/** Her lines said over `secs`. */
const said = (s: Sim, secs: number, each?: (s: Sim) => void) => {
  const out: string[] = [];
  for (let i = 0; i < secs * 30; i++) {
    each?.(s);
    s.step(1 / 30, NO_INPUT);
    for (const e of s.events.splice(0) as SimEvent[]) if (e.e === 'oracle' && 'who' in e && e.who === 'princess') out.push(e.text);
  }
  return out;
};

describe('her voice on the antenna (P58 E)', () => {
  it('says a landing line once the field is quiet, and nothing when she was never home', () => {
    expect(said(alone(), 40)).toEqual([]);
    const lines = said(alone('home'), 40);
    expect(lines).toHaveLength(1);
    expect(VOICE_LINES.land).toContain(lines[0]);
  });

  it('never mid-fight: a foe close by holds the line until it is gone, and a stale one is dropped', () => {
    const s = alone('home');
    const c = s.controller;
    const h = s.spawnHornet(c.x + 100, c.y, 0, false, false, 'hornet');
    h.hp = h.maxHp = 1e9;
    const keep = (x: Sim) => {
      h.x = x.controller.x + 100;
      h.y = x.controller.y;
      h.vx = h.vy = 0;
    };
    expect(said(s, 20, keep)).toEqual([]);
    h.dead = true;
    expect(said(s, 10)).toHaveLength(1);
    // A line held past `stale` goes unsaid.
    const t = alone('home');
    const f = t.spawnHornet(t.controller.x + 100, t.controller.y, 0, false, false, 'hornet');
    f.hp = f.maxHp = 1e9;
    said(t, VOICE.land + VOICE.stale + 2, (x) => ((f.x = x.controller.x + 100), (f.y = x.controller.y)));
    f.dead = true;
    expect(said(t, 10)).toEqual([]);
  });

  it('a robot down and a boss down each queue a line; a few a mission at most', () => {
    const s = alone('home');
    said(s, 40);
    s.stats.downed = 1;
    expect(said(s, 10)).toEqual([expect.stringMatching(/Count them|Pick that one/)]);
    s.bossesDown.push('hornet');
    expect(said(s, 10)).toHaveLength(1);
    for (let i = 2; i < 9; i++) {
      s.stats.downed = i;
      said(s, 5);
    }
    expect(s.voice!.said).toBe(VOICE.max);
  });

  it('while she is gone her idle lines come through as static, at landing only (and dusk)', () => {
    const s = alone('stolen');
    const lines = said(s, 40);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\(static\)/);
    s.stats.downed = 1;
    expect(said(s, 8)).toEqual([]);
    expect(staticOf('Wipe your feet when you are back.', 1)).toMatch(/\.\.\.$/);
  });
});
