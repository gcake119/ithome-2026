import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, test } from 'vitest';

import { isDirectExecution } from './cli-entrypoint.mjs';

describe('Hermes CLI entrypoint detection', () => {
  test('recognizes an absolute script path containing spaces', () => {
    expect(isDirectExecution(
      'file:///Users/hermes/Library/Application%20Support/ithome-ironman-watcher/repo/watchdog.mjs',
      '/Users/hermes/Library/Application Support/ithome-ironman-watcher/repo/watchdog.mjs',
    )).toBe(true);
  });

  test('recognizes a script reached through an equivalent symlinked path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'Hermes CLI '));
    const alias = `${directory} alias`;
    const script = join(directory, 'watchdog.mjs');
    writeFileSync(script, '');
    symlinkSync(directory, alias, 'dir');

    try {
      expect(isDirectExecution(
        pathToFileURL(realpathSync(script)).href,
        join(alias, 'watchdog.mjs'),
      )).toBe(true);
    } finally {
      rmSync(alias);
      rmSync(directory, { recursive: true });
    }
  });
});
