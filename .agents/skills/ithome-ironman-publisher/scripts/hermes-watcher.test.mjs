import { describe, expect, test } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { evaluateWatcher } from './hermes-watcher.mjs';

const now = '2026-09-01T11:00:00.000Z';
const common = {
  schemaVersion: 1,
  source: 'codex-ithome-ironman-publisher',
  repository: 'gcake119/ithome-2026',
  series: 'ithome-2026',
  operation: 'audit-drafts',
  expected: 30,
  foundUnique: 30,
  missing: [],
  duplicate: [],
  mismatch: [],
  unclassifiedCount: 0,
  confidence: 'complete',
  auditedAt: '2026-09-01T10:55:00.000Z',
  completedAt: '2026-09-01T10:55:00.000Z',
  runId: 'audit-test',
};

function evaluate(events, options = {}) {
  return evaluateWatcher({ events, bootstrap: options.bootstrap ?? null, state: options.state ?? {}, now, checkpoint: options.checkpoint });
}

describe('Hermes watcher decision engine', () => {
  test('keeps a complete audit silent and records its eventId', () => {
    const result = evaluate([{ ...common, eventId: 'audit-complete', status: 'complete' }]);
    expect(result.notifications).toEqual([]);
    expect(result.nextState.processedEventIds).toEqual(['audit-complete']);
  });

  test('notifies missing, duplicate, mismatch, and failed audit outcomes', () => {
    const events = [
      { ...common, eventId: 'audit-missing', status: 'incomplete', foundUnique: 28, missing: [7, 19] },
      { ...common, eventId: 'audit-duplicate', status: 'conflict', foundUnique: 29, duplicate: [{ day: 12, count: 2 }] },
      { ...common, eventId: 'audit-mismatch', status: 'conflict', foundUnique: 29, mismatch: [{ day: 4, fields: ['title'] }] },
      { ...common, eventId: 'audit-failed', status: 'failed', foundUnique: 0, confidence: 'unknown', failure: { reasonCode: 'ui_unreadable', phase: 'scan' } },
    ];
    expect(evaluate(events).notifications.map((item) => item.kind)).toEqual([
      'audit_missing', 'audit_duplicate', 'audit_mismatch', 'audit_failed',
    ]);
  });

  test('deduplicates repeated eventIds even across different files or later runs', () => {
    const event = { ...common, eventId: 'audit-missing', status: 'incomplete', foundUnique: 29, missing: [7] };
    expect(evaluate([event, event]).notifications).toHaveLength(1);
    expect(evaluate([event], { state: { processedEventIds: ['audit-missing'] } }).notifications).toEqual([]);
  });

  test.each(['blocked', 'failed', 'uncertain'])('emits one publish_failed notification for %s publish evidence', (status) => {
    const event = { ...common, eventId: `publish-${status}`, operation: 'publish-day', day: 2, status, result: { reasonCode: 'fixture_failure' } };
    const first = evaluate([event]);
    expect(first.notifications).toMatchObject([{ kind: 'publish_failed', day: 2, status }]);
    expect(evaluate([event], { state: first.nextState }).notifications).toEqual([]);
  });

  test('keeps verified publish evidence silent', () => {
    const event = {
      ...common, eventId: 'publish-verified', operation: 'publish-day', day: 2, status: 'verified',
      result: {
        reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified',
        articleUrl: 'https://ithelp.ithome.com.tw/articles/day2', title: 'Day 2 title',
        canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/02/',
      },
    };
    expect(evaluate([event]).notifications).toEqual([]);
  });

  test('suppresses an earlier uncertain publish when a newer verified event exists for the same day', () => {
    const uncertain = {
      ...common,
      eventId: 'publish-day3-uncertain',
      operation: 'publish-day',
      day: 3,
      status: 'uncertain',
      completedAt: '2026-09-01T10:55:00.000Z',
      result: { reasonCode: 'post_publish_unverified', publishClickCount: 1, publicVerification: 'uncertain' },
    };
    const verified = {
      ...common,
      eventId: 'publish-day3-verified',
      operation: 'publish-day',
      day: 3,
      status: 'verified',
      completedAt: '2026-09-01T10:57:00.000Z',
      result: {
        reasonCode: 'published',
        publishClickCount: 1,
        publicVerification: 'verified',
        articleUrl: 'https://ithelp.ithome.com.tw/articles/day3',
        title: 'Day 3 title',
        canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/03/',
      },
    };

    const result = evaluate([verified, uncertain]);

    expect(result.notifications).toEqual([]);
    expect(result.nextState.processedEventIds).toEqual(['publish-day3-verified', 'publish-day3-uncertain']);
  });

  test('still notifies when the latest publish event for a day is abnormal', () => {
    const verified = { ...common, eventId: 'publish-day3-verified', operation: 'publish-day', day: 3, status: 'verified', completedAt: '2026-09-01T10:55:00.000Z' };
    const uncertain = { ...common, eventId: 'publish-day3-uncertain', operation: 'publish-day', day: 3, status: 'uncertain', completedAt: '2026-09-01T10:57:00.000Z', result: { reasonCode: 'post_publish_unverified' } };

    expect(evaluate([uncertain, verified]).notifications).toMatchObject([
      { kind: 'publish_failed', day: 3, status: 'uncertain' },
      { kind: 'publish_failed', day: 3, status: 'verified', result: { reasonCode: 'verified_evidence_invalid' } },
    ]);
  });

  test('does not let malformed verified evidence suppress an earlier anomaly', () => {
    const uncertain = { ...common, eventId: 'publish-day3-uncertain', operation: 'publish-day', day: 3, status: 'uncertain', completedAt: '2026-09-01T10:55:00.000Z', result: { reasonCode: 'post_publish_unverified' } };
    const malformedVerified = { ...common, eventId: 'publish-day3-malformed', operation: 'publish-day', day: 3, status: 'verified', completedAt: '2026-09-01T10:57:00.000Z', result: { publicVerification: 'verified' } };

    expect(evaluate([uncertain, malformedVerified]).notifications).toMatchObject([
      { kind: 'publish_failed', day: 3, status: 'uncertain' },
      { kind: 'publish_failed', day: 3, status: 'verified', result: { reasonCode: 'verified_evidence_invalid' } },
    ]);
  });

  test('does not let a foreign article URL suppress an earlier anomaly', () => {
    const uncertain = { ...common, eventId: 'foreign-url-uncertain', operation: 'publish-day', day: 3, status: 'uncertain', result: { reasonCode: 'post_publish_unverified' } };
    const foreignVerified = {
      ...common,
      eventId: 'foreign-url-verified',
      operation: 'publish-day',
      day: 3,
      status: 'verified',
      completedAt: '2026-09-01T10:57:00.000Z',
      result: {
        reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified',
        articleUrl: 'https://example.com/articles/day3', title: 'Day 3 title',
        canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/03/',
      },
    };

    expect(evaluate([uncertain, foreignVerified]).notifications).toMatchObject([
      { kind: 'publish_failed', status: 'uncertain' },
      { kind: 'publish_failed', status: 'verified', result: { reasonCode: 'verified_evidence_invalid' } },
    ]);
  });

  test('lets complete verified evidence supersede an abnormal event with the same timestamp', () => {
    const uncertain = { ...common, eventId: 'same-time-uncertain', operation: 'publish-day', day: 3, status: 'uncertain', result: { reasonCode: 'post_publish_unverified' } };
    const verified = {
      ...common,
      eventId: 'same-time-verified',
      operation: 'publish-day',
      day: 3,
      status: 'verified',
      result: {
        reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified',
        articleUrl: 'https://ithelp.ithome.com.tw/articles/day3', title: 'Day 3 title',
        canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/03/',
      },
    };

    expect(evaluate([uncertain, verified]).notifications).toEqual([]);
  });

  test('lets complete verified evidence suppress a later zero-click draft_missing observation for the same day', () => {
    const verified = {
      ...common,
      eventId: 'day6-verified',
      operation: 'publish-day',
      day: 6,
      status: 'verified',
      completedAt: '2026-09-01T10:55:00.000Z',
      result: {
        reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified',
        articleUrl: 'https://ithelp.ithome.com.tw/articles/day6', title: 'Day 6 title',
        canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/06/',
      },
    };
    const laterDraftMissing = {
      ...common,
      eventId: 'day6-later-draft-missing',
      operation: 'publish-day',
      day: 6,
      status: 'blocked',
      completedAt: '2026-09-01T10:57:00.000Z',
      result: { reasonCode: 'draft_missing', publishClickCount: 0, publicVerification: 'not_started' },
    };

    expect(evaluate([verified, laterDraftMissing]).notifications).toEqual([]);
  });

  test('still notifies a later click-one uncertain result even when that day has verified evidence', () => {
    const verified = {
      ...common,
      eventId: 'day7-verified',
      operation: 'publish-day',
      day: 7,
      status: 'verified',
      completedAt: '2026-09-01T10:55:00.000Z',
      result: {
        reasonCode: 'published', publishClickCount: 1, publicVerification: 'verified',
        articleUrl: 'https://ithelp.ithome.com.tw/articles/day7', title: 'Day 7 title',
        canonicalUrl: 'https://gcake119.github.io/ithome-2026/day/07/',
      },
    };
    const laterUncertain = {
      ...common,
      eventId: 'day7-later-uncertain',
      operation: 'publish-day',
      day: 7,
      status: 'uncertain',
      completedAt: '2026-09-01T10:57:00.000Z',
      result: { reasonCode: 'post_publish_unverified', publishClickCount: 1, publicVerification: 'uncertain' },
    };

    expect(evaluate([verified, laterUncertain]).notifications).toMatchObject([
      { kind: 'publish_failed', eventId: 'day7-later-uncertain', day: 7, status: 'uncertain' },
    ]);
  });

  test('uses a later public-watchdog verification to suppress prior manual-publish anomalies only for that day', () => {
    const day7Uncertain = {
      ...common,
      eventId: 'day7-manual-uncertain',
      operation: 'publish-day',
      day: 7,
      status: 'uncertain',
      completedAt: '2026-09-15T04:53:21.615Z',
      result: { reasonCode: 'post_publish_unverified', phase: 'public_verification', publishClickCount: 1, publicVerification: 'uncertain' },
    };
    const day7Interlock = {
      ...common,
      eventId: 'day7-prior-click',
      operation: 'publish-day',
      day: 7,
      status: 'blocked',
      completedAt: '2026-09-15T04:53:35.896Z',
      result: { reasonCode: 'prior_publish_click_recorded', phase: 'publish_interlock', publishClickCount: 0, publicVerification: 'not_started' },
    };
    const day8Blocked = {
      ...common,
      eventId: 'day8-anti-automation',
      operation: 'publish-day',
      day: 8,
      status: 'blocked',
      completedAt: '2026-09-16T01:30:05.571Z',
      result: { reasonCode: 'anti_automation', phase: 'browser_session', publishClickCount: 0, publicVerification: 'not_started' },
    };
    const publicState = {
      schemaVersion: 1,
      lastCheck: { date: '2026-09-15', day: 7, status: 'verified' },
      updatedAt: '2026-09-15T16:26:21.142Z',
    };

    const result = evaluateWatcher({
      events: [day7Uncertain, day7Interlock, day8Blocked],
      bootstrap: null,
      publicState,
      now: '2026-09-16T01:35:00.000Z',
    });

    expect(result.notifications).toMatchObject([
      { kind: 'publish_failed', eventId: 'day8-anti-automation', day: 8, status: 'blocked' },
    ]);
  });

  test('reports stale abnormal evidence separately instead of presenting it as current', () => {
    const event = { ...common, eventId: 'old-failure', status: 'failed', completedAt: '2026-08-29T00:00:00.000Z', failure: { reasonCode: 'ui_unreadable', phase: 'scan' } };
    expect(evaluate([event]).notifications).toMatchObject([{ kind: 'stale_event', eventId: 'old-failure' }]);
  });

  test('does not silently treat an old complete audit as fresh evidence', () => {
    const event = { ...common, eventId: 'old-complete', status: 'complete', completedAt: '2026-08-29T00:00:00.000Z' };
    expect(evaluate([event]).notifications).toMatchObject([{ kind: 'stale_event', eventId: 'old-complete' }]);
  });

  test.each(['day1-1900', 'day1-2230'])('reminds once at %s when verified bootstrap is absent', (checkpoint) => {
    const first = evaluate([], { checkpoint });
    expect(first.notifications).toMatchObject([{ kind: 'bootstrap_missing', checkpoint }]);
    const second = evaluate([], { checkpoint, state: first.nextState });
    expect(second.notifications).toEqual([]);
  });

  test('hands verified series identity to the public watchdog and emits one recovery notice', () => {
    const bootstrap = {
      schemaVersion: 1, source: 'codex-ithome-ironman-publisher', repository: 'gcake119/ithome-2026', contest: '18th-ironman-2026',
      bootstrapDay: 1, status: 'verified', articleUrl: 'https://ithelp.ithome.com.tw/articles/123',
      seriesUrl: 'https://ithelp.ithome.com.tw/ironman/456', seriesId: '456', publishedAt: '2026-09-01T10:00:00.000Z',
      verifiedAt: '2026-09-01T10:05:00.000Z', runId: 'publish-day1-test',
      verification: { titleMatched: true, canonicalMatched: true, seriesTitleMatched: true, day1ListedOnSeriesPage: true },
    };
    const prior = { bootstrapProblemObserved: true };
    const first = evaluate([], { bootstrap, state: prior });
    expect(first.watchdog).toEqual({ status: 'ready', seriesUrl: bootstrap.seriesUrl, seriesId: '456' });
    expect(first.notifications).toMatchObject([{ kind: 'bootstrap_recovered' }]);
    expect(evaluate([], { bootstrap, state: first.nextState }).notifications).toEqual([]);
  });
});

describe('Hermes watcher CLI boundary', () => {
  test('runs when invoked through an absolute path containing spaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'ithome watcher cli '));
    const repositoryAlias = join(root, 'deployment clone');
    symlinkSync(resolve('.'), repositoryAlias, 'dir');
    const events = join(root, 'events');
    const bootstrap = join(root, 'missing-bootstrap.json');
    const state = join(root, 'watcher-state.json');
    mkdirSync(events);
    writeFileSync(join(events, 'audit.json'), JSON.stringify({ ...common, eventId: 'audit-complete', status: 'complete' }));

    const result = spawnSync(process.execPath, [join(repositoryAlias, '.agents/skills/ithome-ironman-publisher/scripts/hermes-watcher.mjs'),
      '--events', events, '--bootstrap', bootstrap, '--state', state, '--now', now, '--dry-run'], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ dryRun: true });
  });

  test('dry-run reads fixtures without writing Hermes state or sending anything', () => {
    const root = mkdtempSync(join(tmpdir(), 'ithome-watcher-'));
    const events = join(root, 'events');
    const bootstrap = join(root, 'missing-bootstrap.json');
    const state = join(root, 'watcher-state.json');
    mkdirSync(events);
    writeFileSync(join(events, 'audit.json'), JSON.stringify({ ...common, eventId: 'audit-complete', status: 'complete' }));
    const result = spawnSync(process.execPath, [resolve('.agents/skills/ithome-ironman-publisher/scripts/hermes-watcher.mjs'),
      '--events', events, '--bootstrap', bootstrap, '--state', state, '--checkpoint', 'day1-1900', '--now', now, '--dry-run'], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ dryRun: true, notifications: [{ kind: 'bootstrap_missing' }] });
    expect(existsSync(state)).toBe(false);
  });
});
