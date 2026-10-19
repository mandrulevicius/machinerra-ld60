import { describe, expect, it } from 'vitest';
import { settleJob } from './carry';
import { freshBook } from './questbook';
import { REPEATS, TAP_SCRAP, jobDone, jobFor, jobProgress, jobText, type Job } from './repeats';
import { economy } from './economy';
import { questBook } from './talkslice';
import { researchSave } from './researchslice';

const land = { biome: 'desert' as const, seed: 4242, tier: 1, foes: ['hornet', 'spider'] as const };
const L = () => ({ ...land, foes: [...land.foes] });
/** The kicker's crash job (the kicker has two). */
const crashJob = (): Job => { for (let seed = 1; seed < 99; seed++) { const j = jobFor({ ...L(), seed }, ['kicker'])!; if (j.id === 'rep.kicker.crash') return j; } throw new Error('no crash job'); };
const everyone = ['sprocket', 'hob', 'gasket', 'expeditioner', 'cityPlanner', 'kicker', 'trader', 'highPriest'];

describe('the repeatable jobs (P38)', () => {
  it('one job a land, drawn from the NPCs aboard, the same every time for the same land', () => {
    const a = jobFor({ ...land, foes: [...land.foes] }, everyone)!;
    expect(a).toEqual(jobFor({ ...land, foes: [...land.foes] }, everyone));
    expect(everyone).toContain(a.giver);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) expect(jobFor({ ...L(), seed }, ['kicker'])!.id).toMatch(/^rep\.kicker\./);
    expect(jobFor({ ...land, foes: [...land.foes] }, ['dog'])).toBeNull();
    expect(new Set(Array.from({ length: 60 }, (_, seed) => jobFor({ ...land, seed, foes: [...land.foes] }, everyone)!.id)).size).toBe(REPEATS.filter((t) => everyone.includes(t.giver)).length);
  });

  it('N scales with the land\'s tier', () => {
    const n = (tier: number) => jobFor({ ...L(), tier }, ['expeditioner'])!.goal.n;
    expect([n(1), n(2), n(3)]).toEqual([4, 6, 8]);
  });

  it('is met by the mission\'s stats; "under" needs the stat to exist (leaving before dusk is no clean day)', () => {
    const crash = crashJob();
    expect(jobDone(crash, { crashKills: 7 })).toBe(false);
    expect(jobDone(crash, { crashKills: 8 })).toBe(true);
    const clean = jobFor({ ...land, foes: [...land.foes] }, ['gasket'])!;
    expect(jobDone(clean, {})).toBe(false);
    expect(jobDone(clean, { dmgDusk: 0 })).toBe(true);
    expect(jobDone(clean, { dmgDusk: 61 })).toBe(false);
    expect(jobProgress(crash, { crashKills: 3 })).toMatch(/3\/8/);
    expect(jobText(crash, 'The Kicker')).toMatch(/Rock\. Answer\. Again\./);
  });

  it('a job done pays its reward and clears either way; the hub says how it ended', () => {
    const job: Job = jobFor({ ...land, foes: [...land.foes] }, ['highPriest'])!;
    expect(job.reward).toBe('scrap'); // Minos: one card a stage, so the tap job pays scrap
    const before = researchSave.get().credit;
    const scrap = economy.get().scrap;
    const done = settleJob({ ...freshBook(), job }, { tapped: 80 }, 'h1');
    expect(done.job).toBeNull();
    expect(done.lastJob).toMatchObject({ done: true });
    expect(researchSave.get().credit).toBe(before);
    expect(economy.get().scrap).toBe(scrap + TAP_SCRAP);
    expect(done.repeatsDone.highPriest).toBe(1);
    const missed = settleJob({ ...freshBook(), job }, { tapped: 10 }, 'h2');
    expect(missed.lastJob).toMatchObject({ done: false });
    expect(economy.get().scrap).toBe(scrap + TAP_SCRAP);
    expect(settleJob(freshBook(), {}, 'h3')).toEqual(freshBook());
  });

  it('pays the planner in a little copper and the trader in a batch of biscuits', () => {
    const copper = economy.get().copper;
    const plan = jobFor({ ...land, foes: [...land.foes] }, ['cityPlanner'])!;
    settleJob({ ...freshBook(), job: plan }, { [plan.goal.stat]: 999 }, 'h4');
    expect(economy.get().copper).toBeGreaterThan(copper);
    const trade = jobFor({ ...land, foes: [...land.foes] }, ['trader'])!;
    const b = settleJob({ ...freshBook(), job: trade }, { [trade.goal.stat]: 1 }, 'h5');
    expect(b.lastJob?.done).toBe(true);
    expect(questBook.get().pack.biscuits).toBeGreaterThanOrEqual(1);
  });
});
