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

  test('formats GitHub Pages missing, mismatch, and unavailable results', () => {
    expect(formatNotifications([{ kind: 'github_pages_missing', day: 2, date: '2026-09-10' }]))
      .toBe('GitHub Pages 發布異常：Day 02（2026-09-10）頁面仍是 404。');
    expect(formatNotifications([{ kind: 'github_pages_mismatch', day: 2, date: '2026-09-10', fields: ['canonical', 'date'] }]))
      .toBe('GitHub Pages 發布異常：Day 02（2026-09-10）的 canonical、date 不一致。');
    expect(formatNotifications([{ kind: 'github_pages_unavailable', day: 2, date: '2026-09-10' }]))
      .toBe('GitHub Pages 檢查失敗：無法可靠讀取 Day 02（2026-09-10），請人工確認。');
  });
});
