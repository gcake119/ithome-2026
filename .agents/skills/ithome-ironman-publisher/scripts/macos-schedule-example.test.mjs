import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

const exampleRoot = new URL('../examples/macos/', import.meta.url);

describe('macOS unattended publisher examples', () => {
  test('keeps the wrapper reusable and the CDP endpoint loopback-only', async () => {
    const script = await readFile(new URL('run-publisher.zsh', exampleRoot), 'utf8');
    expect(script).toContain('http://127.0.0.1:$cdp_port');
    expect(script).toContain('run-scheduled-browser-publisher.mjs');
    expect(script).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
    expect(script).not.toMatch(/cookie|password|token/i);
  });

  test('provides a visible login launcher for the isolated publisher profile', async () => {
    const script = await readFile(new URL('open-login-chrome.zsh', exampleRoot), 'utf8');
    expect(script).toContain('--remote-debugging-address=127.0.0.1');
    expect(script).toContain('--user-data-dir=$chrome_profile');
    expect(script).toContain('--new-window');
    expect(script).toContain('Google Chrome');
    expect(script).not.toContain('run-scheduled-browser-publisher.mjs');
    expect(script).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
    expect(script).not.toMatch(/cookie|password|token/i);
  });

  test('schedules 09:30 and keeps local paths as explicit placeholders', async () => {
    const plist = await readFile(new URL('com.example.ithome-ironman-publisher.plist', exampleRoot), 'utf8');
    expect(plist).toContain('<key>Hour</key><integer>9</integer>');
    expect(plist).toContain('<key>Minute</key><integer>30</integer>');
    expect(plist).toContain('__PUBLISHER_REPO__');
    expect(plist).toContain('__CHROME_PROFILE__');
    expect(plist).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
  });

  test('provides a separate visible 09:25 browser prewarm without invoking the publisher', async () => {
    const script = await readFile(new URL('prewarm-browser.zsh', exampleRoot), 'utf8');
    const plist = await readFile(new URL('com.example.ithome-ironman-prewarm.plist', exampleRoot), 'utf8');

    expect(script).toContain('--remote-debugging-address=127.0.0.1');
    expect(script).toContain('--user-data-dir=$ITHOME_CHROME_PROFILE');
    expect(script).toContain('--new-window');
    expect(script).not.toContain('run-scheduled-browser-publisher.mjs');
    expect(plist).toContain('<key>Hour</key><integer>9</integer>');
    expect(plist).toContain('<key>Minute</key><integer>25</integer>');
    expect(plist).toContain('__PREWARM_SCRIPT__');
    expect(script).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
    expect(plist).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
  });
});
