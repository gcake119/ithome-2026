import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

const skillRoot = new URL('../', import.meta.url);

describe('automation documentation examples', () => {
  test('keeps the Codex heartbeat reusable and post-click read-only', async () => {
    const example = await readFile(new URL('examples/codex/public-verification-heartbeat.md', skillRoot), 'utf8');
    expect(example).toContain('<REPO_ABSOLUTE_PATH>');
    expect(example).toContain('<PUBLIC_WATCHDOG_STATE>');
    expect(example).toContain('lastVerified');
    expect(example).toContain('permanently forbids another publish click');
    expect(example).toContain('That notification makes the Day terminal');
    expect(example).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
    expect(example).not.toMatch(/Telegram bot token|chat id|cookie value/i);
  });

  test('documents one-way responsibility boundaries', async () => {
    const reference = await readFile(new URL('references/automation-topology.md', skillRoot), 'utf8');
    expect(reference).toContain('Public-series watchdog');
    expect(reference).toContain('Codex heartbeat');
    expect(reference).toContain('Computer Use');
    expect(reference).toContain('A verified Day is a stopping condition');
    expect(reference).toContain('Only one component writes each state file');
  });
});
