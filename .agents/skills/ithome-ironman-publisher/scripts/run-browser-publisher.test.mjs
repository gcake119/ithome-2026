import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

import { loadRunnerConfig, parseRunnerArgs } from './run-browser-publisher.mjs';

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
});
