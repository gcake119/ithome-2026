import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

import { evaluatePublicSeries, fetchLatestSeriesPage, fetchWithRetry, publicationReminder } from './hermes-public-series-watchdog.mjs';

const execFileAsync = promisify(execFile);
const watchdogPath = fileURLToPath(new URL('./hermes-public-series-watchdog.mjs', import.meta.url));

const expected = {
  day: 12,
  date: '2026-09-12',
  title: 'Day 12 test',
  articleUrl: 'https://ithelp.ithome.com.tw/articles/123456',
  canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/12/',
};

const bootstrap = {
  seriesUrl: 'https://ithelp.ithome.com.tw/ironman/456',
  seriesId: '456',
};

const seriesHtml = `
  <main>
    <a href="/articles/123455">Day 11 test</a>
    <a href="/articles/123456">Day 12 test</a>
  </main>`;

const articleHtml = `
  <article>
    <h1>Day 12 test</h1>
    <time>2026-09-12</time>
    <p>本文同步刊載於<a href="https://gcake119.github.io/ithome-2026/day/12/">個人連載網站</a></p>
  </article>`;

describe('Hermes public series watchdog', () => {
  test('runs from outside the repository while resolving repository assets', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'Hermes watchdog-cwd-'));
    const state = join(directory, 'public-watchdog-state.json');
    writeFileSync(state, '{}\n');

    try {
      const { stdout } = await execFileAsync(process.execPath, [
        watchdogPath,
        '--mode', 'reminder',
        '--state', state,
        '--date', '2026-09-09',
        '--dry-run',
      ], { cwd: directory });
      expect(JSON.parse(stdout)).toMatchObject({ status: 'reminder', day: 1, dryRun: true });
    } finally {
      rmSync(directory, { recursive: true });
    }
  });

  test('builds the unconditional morning reminder from the explicit schedule', () => {
    expect(publicationReminder({ day: 17, date: '2026-08-29' })).toEqual({
      kind: 'publication_reminder',
      day: 17,
      date: '2026-08-29',
    });
  });

  test('keeps a correct latest public article silent', () => {
    expect(evaluatePublicSeries({ expected, bootstrap, seriesHtml, articleHtml })).toEqual({
      status: 'verified',
      notifications: [],
      articleUrl: expected.articleUrl,
    });
  });

  test('ignores unrelated article links outside the series main content', () => {
    const htmlWithSidebar = `${seriesHtml}
      <aside><a href="/articles/sidebar-999">Recommended article</a></aside>`;

    expect(evaluatePublicSeries({ expected, bootstrap, seriesHtml: htmlWithSidebar, articleHtml })).toEqual({
      status: 'verified',
      notifications: [],
      articleUrl: expected.articleUrl,
    });
  });

  test('fails as unreadable instead of guessing when the series main content is missing', () => {
    const result = evaluatePublicSeries({
      expected,
      bootstrap,
      seriesHtml: '<div><a href="/articles/123456">Day 12 test</a></div>',
      articleHtml,
    });

    expect(result).toMatchObject({
      status: 'failed',
      notifications: [{ kind: 'public_watchdog_unavailable', reasonCode: 'series_content_unrecognized' }],
    });
  });

  test('notifies when the expected article is absent from the public series page', () => {
    const result = evaluatePublicSeries({
      expected,
      bootstrap,
      seriesHtml: '<main><a href="/articles/123455">Day 11 test</a></main>',
      articleHtml,
    });

    expect(result).toMatchObject({
      status: 'failed',
      notifications: [{ kind: 'public_article_missing', day: 12 }],
    });
  });

  test('notifies when the expected article is listed but is not the latest entry', () => {
    const result = evaluatePublicSeries({
      expected,
      bootstrap,
      seriesHtml: '<main><a href="/articles/123456">Day 12 test</a><a href="/articles/999999">Unexpected</a></main>',
      articleHtml,
    });

    expect(result).toMatchObject({
      status: 'failed',
      notifications: [{ kind: 'public_article_not_latest', day: 12 }],
    });
  });

  test('notifies when title or canonical link does not match', () => {
    const wrongTitle = evaluatePublicSeries({
      expected,
      bootstrap,
      seriesHtml: '<main><a href="/articles/123456">Wrong title</a></main>',
      articleHtml,
    });
    expect(wrongTitle.notifications).toMatchObject([{ kind: 'public_article_mismatch', fields: ['title'] }]);

    const wrongCanonical = evaluatePublicSeries({
      expected,
      bootstrap,
      seriesHtml,
      articleHtml: '<article><h1>Day 12 test</h1><time>2026-09-12</time></article>',
    });
    expect(wrongCanonical.notifications).toMatchObject([{ kind: 'public_article_mismatch', fields: ['canonicalUrl'] }]);

    const wrongDate = evaluatePublicSeries({
      expected,
      bootstrap,
      seriesHtml,
      articleHtml: articleHtml.replace('2026-09-12', '2026-09-11'),
    });
    expect(wrongDate.notifications).toMatchObject([{ kind: 'public_article_mismatch', fields: ['publishedDate'] }]);
  });

  test('uses the last pagination page before checking its final article', async () => {
    const pages = new Map([
      ['https://ithelp.ithome.com.tw/users/20065770/ironman/9031', '<a href="?page=2">2</a><a href="?page=3">3</a>'],
      ['https://ithelp.ithome.com.tw/users/20065770/ironman/9031?page=3', seriesHtml],
    ]);
    const seen = [];
    const html = await fetchLatestSeriesPage('https://ithelp.ithome.com.tw/users/20065770/ironman/9031', {
      fetchPage: async (url) => { seen.push(url); return pages.get(url); },
    });
    expect(html).toBe(seriesHtml);
    expect(seen).toEqual([
      'https://ithelp.ithome.com.tw/users/20065770/ironman/9031',
      'https://ithelp.ithome.com.tw/users/20065770/ironman/9031?page=3',
    ]);
  });

  test('falls back to the official series RSS when the series page is unavailable', async () => {
    const rss = `<?xml version="1.0"?><rss><channel><item>
      <title><![CDATA[Day 1｜做得出來，卻完全改不動]]></title>
      <link>https://ithelp.ithome.com.tw/articles/10408681?sc=rss.iron</link>
    </item></channel></rss>`;
    const seen = [];
    const content = await fetchLatestSeriesPage('https://ithelp.ithome.com.tw/users/20183873/ironman/9371', {
      fetchPage: async (url) => {
        seen.push(url);
        if (url.includes('/users/')) throw new Error('HTTP 403');
        return rss;
      },
    });

    expect(seen).toEqual([
      'https://ithelp.ithome.com.tw/users/20183873/ironman/9371',
      'https://ithelp.ithome.com.tw/rss/series/9371',
    ]);
    expect(evaluatePublicSeries({
      expected: {
        day: 1,
        date: '2026-09-09',
        title: 'Day 1｜做得出來，卻完全改不動',
        articleUrl: 'https://ithelp.ithome.com.tw/articles/10408681',
        canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/01/',
      },
      bootstrap: { seriesUrl: 'https://ithelp.ithome.com.tw/users/20183873/ironman/9371', seriesId: '9371' },
      seriesHtml: content,
      articleHtml: '<time>2026-09-09</time><a href="https://gcake119.github.io/ithome-2026/day/01/">個人連載網站</a>',
    })).toMatchObject({ status: 'verified', notifications: [] });
  });

  test('retries a failed public read at most twice before succeeding', async () => {
    let attempts = 0;
    const sleeps = [];
    const response = await fetchWithRetry('https://ithelp.ithome.com.tw/ironman/456', {
      fetchImpl: async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('temporary failure');
        return { ok: true, url: 'https://ithelp.ithome.com.tw/ironman/456', text: async () => seriesHtml };
      },
      sleep: async (milliseconds) => sleeps.push(milliseconds),
      retryDelayMs: 120_000,
    });

    expect(response).toBe(seriesHtml);
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([120_000, 120_000]);
  });
});
