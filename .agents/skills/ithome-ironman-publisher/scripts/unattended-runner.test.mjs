import { describe, expect, test, vi } from 'vitest';

import { runUnattendedPublisher } from './unattended-runner.mjs';

const project = {
  repository: 'gcake119/ithome-2026',
  seriesKey: 'ithome-2026',
  githubPages: { publicUrl: 'https://gcake119.github.io/ithome-2026' },
};

const payload = {
  day: 12,
  dayString: '12',
  sourcePath: 'src/content/ironman/day-12.md',
  title: 'Day 12 test',
  body: '本文同步刊載於[個人連載網站](https://gcake119.github.io/ithome-2026/day/12/)\n\nBody',
  canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/12/',
  syncLine: '本文同步刊載於[個人連載網站](https://gcake119.github.io/ithome-2026/day/12/)',
};

describe('unattended local publisher runner', () => {
  test('keeps a verified publish silent while recording a verified event', async () => {
    const events = [];
    const result = await runUnattendedPublisher({
      day: 12,
      project,
      prepare: async () => payload,
      publish: async ({ fingerprint }) => ({
        status: 'verified',
        fingerprint,
        result: {
          reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified',
          articleUrl: 'https://ithelp.ithome.com.tw/articles/123456', title: payload.title, canonicalUrl: payload.canonicalUrl,
        },
      }),
      emit: async (event) => events.push(event),
      now: () => '2026-09-12T01:00:00.000Z',
      runId: 'runner-test-success',
    });

    expect(result).toMatchObject({ exitCode: 0, silent: true, status: 'verified' });
    expect(events).toMatchObject([{ operation: 'publish-day', day: 12, status: 'verified', result: { articleUrl: 'https://ithelp.ithome.com.tw/articles/123456' } }]);
  });

  test('fails closed before the driver when the source payload is missing', async () => {
    const publish = vi.fn();
    const events = [];
    const result = await runUnattendedPublisher({
      day: 12,
      project,
      prepare: async () => { throw Object.assign(new Error('missing'), { code: 'ENOENT' }); },
      publish,
      emit: async (event) => events.push(event),
      now: () => '2026-09-12T01:00:00.000Z',
      runId: 'runner-test-missing',
    });

    expect(publish).not.toHaveBeenCalled();
    expect(result).toMatchObject({ exitCode: 1, silent: false, status: 'blocked' });
    expect(events[0].result).toMatchObject({ reasonCode: 'payload_missing', publishClickCount: 0 });
  });

  test.each(['blocked', 'failed', 'uncertain'])('surfaces %s driver outcomes as abnormal events', async (status) => {
    const events = [];
    const result = await runUnattendedPublisher({
      day: 12,
      project,
      prepare: async () => payload,
      publish: async ({ fingerprint }) => ({
        status,
        fingerprint,
        result: { reasonCode: `${status}_test`, publishClickCount: 0, publicVerification: 'not_started' },
      }),
      emit: async (event) => events.push(event),
      now: () => '2026-09-12T01:00:00.000Z',
      runId: `runner-test-${status}`,
    });

    expect(result).toMatchObject({ exitCode: 1, silent: false, status });
    expect(events[0]).toMatchObject({ status, result: { reasonCode: `${status}_test` } });
  });

  test('converts a driver fingerprint mismatch into an uncertain stale result', async () => {
    const events = [];
    const result = await runUnattendedPublisher({
      day: 12,
      project,
      prepare: async () => payload,
      publish: async () => ({
        status: 'verified',
        fingerprint: 'sha256:stale',
        result: { reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified' },
      }),
      emit: async (event) => events.push(event),
      now: () => '2026-09-12T01:00:00.000Z',
      runId: 'runner-test-stale',
    });

    expect(result).toMatchObject({ exitCode: 1, silent: false, status: 'uncertain' });
    expect(events[0].result).toMatchObject({ reasonCode: 'driver_payload_stale', publishClickCount: 1 });
  });

  test('preserves the publish result when event persistence fails after the driver returns', async () => {
    const result = await runUnattendedPublisher({
      day: 12,
      project,
      prepare: async () => payload,
      publish: async ({ fingerprint }) => ({
        status: 'verified',
        fingerprint,
        result: {
          reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified',
          articleUrl: 'https://ithelp.ithome.com.tw/articles/123456', title: payload.title, canonicalUrl: payload.canonicalUrl,
        },
      }),
      emit: async () => { throw new Error('event directory unavailable'); },
      now: () => '2026-09-12T01:00:00.000Z',
      runId: 'runner-test-event-failure',
    });

    expect(result).toMatchObject({
      exitCode: 1,
      silent: false,
      status: 'verified',
      eventPersisted: false,
      eventError: 'event_write_failed',
      result: { reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified' },
    });
  });
});
