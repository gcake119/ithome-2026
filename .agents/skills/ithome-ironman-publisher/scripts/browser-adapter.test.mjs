import { describe, expect, test, vi } from 'vitest';

import { createIthomeBrowserAdapter } from './browser-adapter.mjs';

const payload = {
  day: 12,
  dayString: '12',
  title: 'Day 12 test',
  body: '本文同步刊載於[個人連載網站](https://gcake119.github.io/ithome-2026/day/12/)\n\nBody',
  canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/12/',
  syncLine: '本文同步刊載於[個人連載網站](https://gcake119.github.io/ithome-2026/day/12/)',
};

function verifiedBootstrap() {
  return { status: 'verified', seriesUrl: 'https://ithelp.ithome.com.tw/ironman/1234', seriesId: '1234' };
}

function driver(overrides = {}) {
  return {
    connect: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    inspectSession: vi.fn(async () => ({
      authenticated: true,
      account: 'gcake119',
      seriesTitle: 'AI 都會寫程式了，我還要學什麼？——從「做得出來」到學會開發的 30 天',
      contestTag: '18th鐵人賽',
    })),
    scanDrafts: vi.fn(async () => [{ id: 'draft-12', title: payload.title, status: 'draft' }]),
    scanPublic: vi.fn(async () => []),
    inspectDraft: vi.fn(async () => ({
      title: payload.title,
      firstBodyLine: payload.syncLine,
      status: 'draft',
      seriesTitle: 'AI 都會寫程式了，我還要學什麼？——從「做得出來」到學會開發的 30 天',
      contestTag: '18th鐵人賽',
    })),
    publishOnce: vi.fn(async () => ({ clicked: true })),
    verifyPublic: vi.fn(async () => ({ verified: true, articleUrl: 'https://ithelp.ithome.com.tw/articles/123456' })),
    ...overrides,
  };
}

function adapter(browserDriver, loadBootstrap = async () => verifiedBootstrap()) {
  return createIthomeBrowserAdapter({
    driver: browserDriver,
    expectedAccount: 'gcake119',
    expectedSeriesTitle: 'AI 都會寫程式了，我還要學什麼？——從「做得出來」到學會開發的 30 天',
    expectedContestTag: '18th鐵人賽',
    loadBootstrap,
  });
}

describe('iThome browser adapter', () => {
  test('blocks Day 2–30 before connecting when verified bootstrap state is missing', async () => {
    const browserDriver = driver();
    const publish = adapter(browserDriver, async () => null);

    const outcome = await publish({ payload, fingerprint: 'sha256:fresh', runId: 'missing-bootstrap' });

    expect(outcome).toMatchObject({ status: 'blocked', result: { reasonCode: 'series_bootstrap_missing', publishClickCount: 0 } });
    expect(browserDriver.connect).not.toHaveBeenCalled();
  });

  test('blocks duplicate drafts without clicking publish', async () => {
    const browserDriver = driver({
      scanDrafts: vi.fn(async () => [
        { id: 'draft-a', title: payload.title, status: 'draft' },
        { id: 'draft-b', title: payload.title, status: 'draft' },
      ]),
    });

    const outcome = await adapter(browserDriver)({ payload, fingerprint: 'sha256:fresh', runId: 'duplicate' });

    expect(outcome).toMatchObject({ status: 'blocked', result: { reasonCode: 'draft_duplicate', publishClickCount: 0 } });
    expect(browserDriver.publishOnce).not.toHaveBeenCalled();
  });

  test('reports anti-automation before an unauthenticated session state', async () => {
    const browserDriver = driver({
      inspectSession: vi.fn(async () => ({ authenticated: false, antiAutomation: 'cloudflare' })),
    });

    const outcome = await adapter(browserDriver)({ payload, fingerprint: 'sha256:fresh', runId: 'cloudflare' });

    expect(outcome).toMatchObject({ status: 'blocked', result: { reasonCode: 'anti_automation', publishClickCount: 0 } });
    expect(browserDriver.scanDrafts).not.toHaveBeenCalled();
    expect(browserDriver.publishOnce).not.toHaveBeenCalled();
  });

  test('blocks a draft from an unexpected series', async () => {
    const browserDriver = driver({
      inspectDraft: vi.fn(async () => ({
        title: payload.title,
        firstBodyLine: payload.syncLine,
        status: 'draft',
        seriesTitle: '另一個系列',
        contestTag: '18th鐵人賽',
      })),
    });

    const outcome = await adapter(browserDriver)({ payload, fingerprint: 'sha256:fresh', runId: 'wrong-series' });

    expect(outcome).toMatchObject({ status: 'blocked', result: { reasonCode: 'draft_mismatch', publishClickCount: 0 } });
    expect(browserDriver.publishOnce).not.toHaveBeenCalled();
  });

  test('publishes exactly once and verifies the public article', async () => {
    const browserDriver = driver();

    const outcome = await adapter(browserDriver)({ payload, fingerprint: 'sha256:fresh', runId: 'verified' });

    expect(browserDriver.publishOnce).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      status: 'verified',
      fingerprint: 'sha256:fresh',
      result: {
        reasonCode: 'published',
        publishClickCount: 1,
        publicVerification: 'verified',
        articleUrl: 'https://ithelp.ithome.com.tw/articles/123456',
        title: payload.title,
        canonicalUrl: payload.canonicalUrl,
      },
    });
  });

  test('returns uncertain without retry when verification fails after the click', async () => {
    const browserDriver = driver({ verifyPublic: vi.fn(async () => { throw new Error('navigation timeout'); }) });

    const outcome = await adapter(browserDriver)({ payload, fingerprint: 'sha256:fresh', runId: 'uncertain' });

    expect(browserDriver.publishOnce).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({
      status: 'uncertain',
      result: { reasonCode: 'post_publish_unverified', publishClickCount: 1, publicVerification: 'uncertain' },
    });
  });
});
