import { describe, expect, test, vi } from 'vitest';

import { runScheduledBrowserPublisher, scheduledDayForDate } from './run-scheduled-browser-publisher.mjs';

const schedule = [
  { day: 1, date: '2026-09-09' },
  { day: 2, date: '2026-09-10' },
  { day: 30, date: '2026-10-08' },
];

describe('scheduled browser publisher', () => {
  test('selects only an explicit Day from the configured schedule', () => {
    expect(scheduledDayForDate(schedule, '2026-09-10')).toBe(2);
    expect(scheduledDayForDate(schedule, '2026-10-09')).toBeNull();
  });

  test('uses the Asia/Taipei calendar date and runs the matching Day once', async () => {
    const runPublisher = vi.fn(async ({ day }) => ({
      status: 'verified',
      silent: true,
      exitCode: 0,
      result: { reasonCode: 'published', publishClickCount: 1 },
    }));
    const result = await runScheduledBrowserPublisher({
      now: new Date('2026-09-09T16:30:00.000Z'),
      loadConfig: async () => ({ schedule }),
      runPublisher,
    });

    expect(runPublisher).toHaveBeenCalledOnce();
    expect(runPublisher).toHaveBeenCalledWith({ day: 2 });
    expect(result).toMatchObject({ status: 'verified', date: '2026-09-10', day: 2 });
  });

  test('stays silent outside the configured Day 1 to Day 30 schedule', async () => {
    const runPublisher = vi.fn();
    const result = await runScheduledBrowserPublisher({
      now: new Date('2026-10-08T16:30:00.000Z'),
      loadConfig: async () => ({ schedule }),
      runPublisher,
    });

    expect(runPublisher).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'not_scheduled', date: '2026-10-09', day: null, exitCode: 0 });
  });
});
