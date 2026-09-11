import { describe, expect, test, vi } from 'vitest';

import { createPlaywrightIthomeDriver, matchDraftEntries, PUBLISH_MENU_SELECTOR } from './playwright-browser-driver.mjs';

function fakePage(bodyText = '') {
  return {
    url: vi.fn(() => 'https://ithelp.ithome.com.tw/users/me/articles'),
    goto: vi.fn(async () => {}),
    evaluate: vi.fn(async () => bodyText),
    getByText: vi.fn(() => ({ count: vi.fn(async () => 1) })),
  };
}

function fakeChromium(page) {
  return {
    connectOverCDP: vi.fn(async () => ({
      contexts: () => [{ pages: () => [page], newPage: vi.fn(async () => page) }],
    })),
  };
}

const config = {
  cdpEndpoint: 'http://127.0.0.1:9222',
  draftsUrl: 'https://ithelp.ithome.com.tw/users/me/articles',
  expectedAccount: 'gcake119',
  expectedSeriesTitle: 'AI 都會寫程式了，我還要學什麼？——從「做得出來」到學會開發的 30 天',
  expectedContestTag: '18th鐵人賽',
};

describe('Playwright iThome browser driver', () => {
  test('scopes the publish dropdown to the editor save group', () => {
    expect(PUBLISH_MENU_SELECTOR).toBe('button.save-group__dropdown-toggle:visible');
  });

  test('normalizes whitespace around server-rendered draft hrefs', () => {
    expect(matchDraftEntries([{
      href: '\n https://ithelp.ithome.com.tw/articles/example-draft/draft \n',
      title: 'Day 1｜做得出來，卻完全改不動',
      text: '草稿\nDay 1｜做得出來，卻完全改不動',
    }], 'Day 1｜做得出來，卻完全改不動')).toHaveLength(1);
  });

  test('refuses a non-loopback CDP endpoint', () => {
    expect(() => createPlaywrightIthomeDriver({
      chromiumImpl: fakeChromium(fakePage()),
      config: { ...config, cdpEndpoint: 'http://192.168.1.10:9222' },
    })).toThrow(/loopback/i);
  });

  test('connects to the configured local Chrome without launching another browser', async () => {
    const page = fakePage('gcake119 18th鐵人賽');
    const chromiumImpl = fakeChromium(page);
    const driver = createPlaywrightIthomeDriver({ chromiumImpl, config });

    await driver.connect();

    expect(chromiumImpl.connectOverCDP).toHaveBeenCalledWith(config.cdpEndpoint);
  });

  test('reports Cloudflare as anti-automation state', async () => {
    const page = fakePage('Attention Required! Cloudflare');
    const driver = createPlaywrightIthomeDriver({ chromiumImpl: fakeChromium(page), config });
    await driver.connect();

    const session = await driver.inspectSession();

    expect(session).toMatchObject({ authenticated: false, antiAutomation: 'cloudflare' });
  });

  test('reports an expired login instead of treating the account as authenticated', async () => {
    const page = fakePage('登入 iThome');
    page.getByText = vi.fn(() => ({ count: vi.fn(async () => 0) }));
    const driver = createPlaywrightIthomeDriver({ chromiumImpl: fakeChromium(page), config });
    await driver.connect();

    const session = await driver.inspectSession();

    expect(session).toMatchObject({ authenticated: false, antiAutomation: null });
  });

  test('follows draft-list pagination until it finds the expected draft', async () => {
    const page = fakePage('gcake119 18th鐵人賽');
    page.evaluate = vi.fn(async (callback) => {
      const source = String(callback);
      if (source.includes('document.body')) return 'gcake119 18th鐵人賽';
      if (page.goto.mock.calls.at(-1)?.[0]?.endsWith('?page=2')) {
        return {
          entries: [{
            href: '/articles/day-2/draft',
            title: 'Day 2｜當實作跑得比理解更快',
            text: '草稿\nDay 2｜當實作跑得比理解更快',
          }],
          nextHref: null,
        };
      }
      return { entries: [], nextHref: '/users/me/articles?page=2' };
    });
    const driver = createPlaywrightIthomeDriver({ chromiumImpl: fakeChromium(page), config });
    await driver.connect();

    const drafts = await driver.scanDrafts({ payload: { title: 'Day 2｜當實作跑得比理解更快' } });

    expect(page.goto).toHaveBeenCalledWith(
      'https://ithelp.ithome.com.tw/users/me/articles?page=2',
      expect.any(Object),
    );
    expect(drafts).toHaveLength(1);
  });

  test('reads the visible CodeMirror editor instead of an unrelated visible textarea', async () => {
    const page = fakePage('Software Development 18th鐵人賽 儲存草稿');
    page.locator = vi.fn((selector) => {
      if (selector.includes('好標題')) return { count: vi.fn(async () => 1), inputValue: vi.fn(async () => 'Day 1 title') };
      if (selector.includes('CodeMirror-code')) return { count: vi.fn(async () => 1), innerText: vi.fn(async () => 'canonical sync line\n\nBody') };
      throw new Error(`unexpected selector: ${selector}`);
    });
    const driver = createPlaywrightIthomeDriver({ chromiumImpl: fakeChromium(page), config });
    await driver.connect();

    const draft = await driver.inspectDraft({ draft: { url: 'https://ithelp.ithome.com.tw/articles/example-draft/draft' } });

    expect(draft).toMatchObject({
      title: 'Day 1 title',
      firstBodyLine: 'canonical sync line',
      status: 'draft',
      contestTag: '18th鐵人賽',
    });
  });
});
