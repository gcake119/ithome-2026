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

  test('keeps browser startup inside the formal publisher and still enters the event-emitting runner', async () => {
    const script = await readFile(new URL('run-publisher.zsh', exampleRoot), 'utf8');
    expect(script).toContain("open -na 'Google Chrome'");
    expect(script).toContain('run-scheduled-browser-publisher.mjs');
    expect(script).not.toMatch(/json\/version" >\/dev\/null \|\| exit 1/);
  });

  test('provides a locked-screen-safe public watchdog wrapper without browser dependencies', async () => {
    const script = await readFile(new URL('run-public-watchdog.zsh', exampleRoot), 'utf8');
    expect(script).toContain('hermes-public-series-watchdog.mjs');
    expect(script).toContain('hermes-watcher-notify.mjs');
    expect(script).toContain('public-1900|public-2230');
    expect(script).toContain('ITHOME_PUBLIC_WATCHDOG_STATE');
    expect(script).not.toMatch(/Chrome|CDP|cookie|password|token/i);
    expect(script).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
  });

  test('provides separate 19:00 and 22:30 public watchdog schedules', async () => {
    const first = await readFile(new URL('com.example.ithome-public-watchdog-1900.plist', exampleRoot), 'utf8');
    const second = await readFile(new URL('com.example.ithome-public-watchdog-2230.plist', exampleRoot), 'utf8');
    expect(first).toContain('<key>Hour</key><integer>19</integer>');
    expect(first).toContain('<key>Minute</key><integer>0</integer>');
    expect(first).toContain('<string>public-1900</string>');
    expect(second).toContain('<key>Hour</key><integer>22</integer>');
    expect(second).toContain('<key>Minute</key><integer>30</integer>');
    expect(second).toContain('<string>public-2230</string>');
    for (const plist of [first, second]) {
      expect(plist).toContain('__RUN_PUBLIC_WATCHDOG_SCRIPT__');
      expect(plist).toContain('__PUBLIC_WATCHDOG_STATE__');
      expect(plist).not.toMatch(/\/Users\/[A-Za-z0-9._-]+/);
    }
  });
});
