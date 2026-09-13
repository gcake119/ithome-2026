import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import { assertEventSinkWritable, createClickReceiptStore, loadRunnerConfig, parseRunnerArgs } from './run-browser-publisher.mjs';

describe('browser publisher CLI configuration', () => {
  test('accepts the pnpm argument separator', () => {
    expect(parseRunnerArgs(['--', '--day', '1'])).toEqual({ day: 1 });
  });

  test.each([[], ['--day', '0'], ['--day', '31'], ['--day', '1.5']])('rejects invalid Day arguments: %j', (argv) => {
    expect(() => parseRunnerArgs(argv)).toThrow(/--day/);
  });

  test('loads explicit loopback Chrome and iThome URLs from local environment', () => {
    const eventDir = mkdtempSync(join(tmpdir(), 'ithome-events-'));
    const config = loadRunnerConfig({
      ITHOME_CDP_ENDPOINT: 'http://127.0.0.1:9223',
      ITHOME_DRAFTS_URL: 'https://ithelp.ithome.com.tw/users/example/articles',
      ITHOME_PUBLIC_ARTICLES_URL: 'https://ithelp.ithome.com.tw/users/example/articles',
      ITHOME_EVENT_DIR: eventDir,
      ITHOME_BOOTSTRAP_STATE: '/tmp/ithome-state/series-bootstrap.json',
    });

    expect(config).toMatchObject({ cdpEndpoint: 'http://127.0.0.1:9223', eventDir });
  });

  test('rejects a missing event directory before any browser work can begin', () => {
    expect(() => loadRunnerConfig({
      ITHOME_CDP_ENDPOINT: 'http://127.0.0.1:9223',
      ITHOME_DRAFTS_URL: 'https://ithelp.ithome.com.tw/users/example/articles',
      ITHOME_PUBLIC_ARTICLES_URL: 'https://ithelp.ithome.com.tw/users/example/articles',
      ITHOME_EVENT_DIR: '/tmp/ithome-events-that-do-not-exist',
      ITHOME_BOOTSTRAP_STATE: '/tmp/ithome-state/series-bootstrap.json',
    })).toThrow(/event directory/i);
  });

  test('rejects missing local configuration', () => {
    expect(() => loadRunnerConfig({})).toThrow(/ITHOME_CDP_ENDPOINT/);
  });

  test('probes event persistence before browser work without leaving an artifact', async () => {
    const eventDir = mkdtempSync(join(tmpdir(), 'ithome-events-probe-'));

    await expect(assertEventSinkWritable(eventDir)).resolves.toBeUndefined();
    expect(readdirSync(eventDir)).toEqual([]);
  });

  test('persists one non-overwritable publish-click receipt per Day', async () => {
    const eventDir = mkdtempSync(join(tmpdir(), 'ithome-click-receipt-'));
    const record = createClickReceiptStore(eventDir);

    await expect(record({ day: 12, fingerprint: 'sha256:fresh', runId: 'first-run' })).resolves.toBeUndefined();
    await expect(record({ day: 12, fingerprint: 'sha256:fresh', runId: 'second-run' }))
      .rejects.toMatchObject({ reasonCode: 'prior_publish_click_recorded' });
    expect(readdirSync(eventDir)).toEqual(['.publish-click-day-12.receipt']);
  });
});
