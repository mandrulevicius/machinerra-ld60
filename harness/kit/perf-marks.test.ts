import { afterEach, describe, expect, it, vi } from 'vitest';
import { perfEnd, perfMarksOn, perfStart, setPerfMarks } from './perf-marks';

afterEach(() => {
  setPerfMarks(false);
  vi.restoreAllMocks();
});

describe('perf marks', () => {
  it('off, a start and end pair touches no performance entry', () => {
    const mark = vi.spyOn(performance, 'mark');
    const measure = vi.spyOn(performance, 'measure');
    perfStart('a');
    perfEnd('a');
    expect(mark).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
  });

  it('on, perfEnd measures perf:<name> from the start mark', () => {
    const measure = vi.spyOn(performance, 'measure');
    setPerfMarks(true);
    expect(perfMarksOn()).toBe(true);
    perfStart('chunks');
    perfEnd('chunks');
    expect(measure).toHaveBeenCalledTimes(1);
    expect(measure.mock.calls[0][0]).toBe('perf:chunks');
    expect(performance.getEntriesByName('perf:chunks')).toHaveLength(0);
    expect(performance.getEntriesByName('perf:chunks:s')).toHaveLength(0);
  });

  it('an end without a start measures nothing', () => {
    const measure = vi.spyOn(performance, 'measure');
    setPerfMarks(true);
    perfEnd('never-started');
    expect(measure).not.toHaveBeenCalled();
  });
});
