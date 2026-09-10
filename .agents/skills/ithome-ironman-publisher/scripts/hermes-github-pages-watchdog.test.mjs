import { describe, expect, test } from 'vitest';

import { checkGithubPages, evaluateGithubPages, suppressDelivered } from './hermes-github-pages-watchdog.mjs';

const expected = {
  day: 2,
  date: '2026-09-10',
  url: 'https://gcake119.github.io/ithome-2026/day/02/',
};

const validHtml = `<!doctype html><html><head>
  <link rel="canonical" href="https://gcake119.github.io/ithome-2026/day/02/">
  </head><body><main><p>Day 02</p><time>2026/9/10</time></main></body></html>`;

describe('Hermes GitHub Pages watchdog', () => {
  test('keeps the exact published page silent', () => {
    expect(evaluateGithubPages({ expected, status: 200, finalUrl: expected.url, html: validHtml })).toEqual({
      status: 'verified',
      result: 'verified',
      notifications: [],
    });
  });

  test('distinguishes a missing page from content mismatch', () => {
    expect(evaluateGithubPages({ expected, status: 404, finalUrl: expected.url, html: '' })).toMatchObject({
      result: 'missing', notifications: [{ kind: 'github_pages_missing', day: 2 }],
    });
    expect(evaluateGithubPages({
      expected,
      status: 200,
      finalUrl: expected.url,
      html: validHtml.replace('/day/02/', '/day/01/').replace('2026/9/10', '2026/9/9').replace('Day 02', 'Day 01'),
    })).toMatchObject({
      result: 'mismatch',
      notifications: [{ kind: 'github_pages_mismatch', fields: ['canonical', 'day', 'date'] }],
    });
  });

  test('treats an unexpected redirect as a content mismatch', () => {
    expect(evaluateGithubPages({ expected, status: 200, finalUrl: 'https://example.com/day/02/', html: validHtml })).toMatchObject({
      result: 'mismatch', notifications: [{ kind: 'github_pages_mismatch', fields: ['finalUrl'] }],
    });
  });

  test('retries network failures three times before reporting unavailable', async () => {
    let attempts = 0;
    const sleeps = [];
    const result = await checkGithubPages(expected, {
      fetchImpl: async () => { attempts += 1; throw new Error('offline'); },
      sleep: async (milliseconds) => sleeps.push(milliseconds),
      retryDelayMs: 120_000,
    });
    expect(result).toMatchObject({ result: 'unavailable', notifications: [{ kind: 'github_pages_unavailable' }] });
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([120_000, 120_000]);
  });

  test('uses the required date-scoped result key and suppresses a repeat', () => {
    const result = evaluateGithubPages({ expected, status: 404, finalUrl: expected.url, html: '' });
    const first = suppressDelivered({ date: expected.date, result, state: {} });
    expect(first.key).toBe('2026-09-10:github-pages-0925:missing');
    expect(first.notifications).toHaveLength(1);
    expect(suppressDelivered({ date: expected.date, result, state: first.nextState }).notifications).toEqual([]);
  });
});
