import { describe, expect, test } from 'vitest';

import { formatNotifications } from './hermes-watcher-notify.mjs';

describe('Hermes watcher Telegram formatter', () => {
  test('keeps an empty notification list completely silent', () => {
    expect(formatNotifications([])).toBe('');
  });

  test('formats audit problems without article content or credentials', () => {
    expect(formatNotifications([
      { kind: 'audit_missing', days: [7, 19] },
      { kind: 'audit_duplicate', entries: [{ day: 12, count: 2 }] },
      { kind: 'audit_mismatch', entries: [{ day: 4, fields: ['title'] }] },
    ])).toBe([
      'iThome 草稿盤點異常：缺少 Day 07、Day 19。',
      'iThome 草稿盤點異常：Day 12 有 2 份重複草稿，未自動刪除。',
      'iThome 草稿盤點異常：Day 04 的 title 不一致，未自動覆寫。',
    ].join('\n'));
  });

  test('formats checkpoint, stale, failure, and recovery decisions', () => {
    expect(formatNotifications([{ kind: 'bootstrap_missing', checkpoint: 'day1-1900' }])).toContain('Day 1 19:00');
    expect(formatNotifications([{ kind: 'stale_event', operation: 'audit-drafts', ageHours: 48 }])).toContain('已超過 48 小時');
    expect(formatNotifications([{ kind: 'audit_failed', failure: { reasonCode: 'ui_unreadable' } }])).toContain('ui_unreadable');
    expect(formatNotifications([{ kind: 'bootstrap_recovered' }])).toBe('iThome Day 1 verified bootstrap state 已就緒，公開系列頁 watchdog 可以開始監控。');
  });

  test('distinguishes public mismatch from an unavailable public page', () => {
    expect(formatNotifications([{ kind: 'publication_reminder', day: 17, date: '2026-08-29' }]))
      .toBe('鐵人賽發文提醒：今天應發布 Day 17（2026-08-29）。');
    expect(formatNotifications([{ kind: 'public_article_missing', day: 17, date: '2026-08-29' }]))
      .toBe('鐵人賽發文提醒：目前尚未偵測到 Day 17（2026-08-29）的公開文章。');
    expect(formatNotifications([{ kind: 'public_watchdog_unavailable', day: 17 }]))
      .toBe('鐵人賽發文檢查失敗：目前無法可靠讀取系列頁，請人工確認。');
  });

  test('formats a verified public article for one-time Telegram delivery', () => {
    expect(formatNotifications([{
      kind: 'public_article_verified',
      day: 18,
      date: '2026-09-26',
      articleUrl: 'https://ithelp.ithome.com.tw/articles/10408740',
    }])).toBe('iThome Day 18 已確認公開：https://ithelp.ithome.com.tw/articles/10408740');
  });

  test('does not misreport missing verified publish evidence as a missing public article', () => {
    expect(formatNotifications([{ kind: 'public_publish_event_missing', day: 2, date: '2026-09-10' }]))
      .toBe('iThome 發布證據不足：尚未收到 Day 02（2026-09-10）的 verified 發布結果，無法判定公開文章是否正確，請人工確認。');
  });

  test('names the exact formal publish phase in an abnormal notification', () => {
    expect(formatNotifications([{
      kind: 'publish_failed',
      day: 6,
      status: 'blocked',
      result: { reasonCode: 'anti_automation', phase: 'browser_session' },
    }])).toBe('iThome Day 06 發布失敗階段：登入與反自動化檢查；結果：blocked／anti_automation，請人工確認。');
  });

  test('does not call an unverified post-click outcome a publication failure', () => {
    expect(formatNotifications([{
      kind: 'publish_failed',
      day: 15,
      status: 'uncertain',
      result: { reasonCode: 'post_publish_unverified', phase: 'public_verification' },
    }])).toBe('iThome Day 15 發布狀態待確認：發文後公開驗證未完成；請檢查公開文章，勿再次點擊發文。');
  });

  test('formats GitHub Pages missing, mismatch, and unavailable results', () => {
    expect(formatNotifications([{ kind: 'github_pages_missing', day: 2, date: '2026-09-10' }]))
      .toBe('GitHub Pages 發布異常：Day 02（2026-09-10）頁面仍是 404。');
    expect(formatNotifications([{ kind: 'github_pages_mismatch', day: 2, date: '2026-09-10', fields: ['canonical', 'date'] }]))
      .toBe('GitHub Pages 發布異常：Day 02（2026-09-10）的 canonical、date 不一致。');
    expect(formatNotifications([{ kind: 'github_pages_unavailable', day: 2, date: '2026-09-10' }]))
      .toBe('GitHub Pages 檢查失敗：無法可靠讀取 Day 02（2026-09-10），請人工確認。');
  });
});
