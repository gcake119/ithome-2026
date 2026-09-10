#!/usr/bin/env node

import { readFileSync } from 'node:fs';

import { isDirectExecution } from './cli-entrypoint.mjs';

function day(value) {
  return `Day ${String(value).padStart(2, '0')}`;
}

function formatOne(item) {
  if (item.kind === 'publication_reminder') return `鐵人賽發文提醒：今天應發布 ${day(item.day)}（${item.date}）。`;
  if (['public_article_missing', 'public_article_not_latest', 'public_article_mismatch', 'public_publish_event_missing'].includes(item.kind)) return `鐵人賽發文提醒：目前尚未偵測到 ${day(item.day)}（${item.date ?? '日期未提供'}）的公開文章。`;
  if (['public_watchdog_unavailable', 'public_watchdog_blocked'].includes(item.kind)) return '鐵人賽發文檢查失敗：目前無法可靠讀取系列頁，請人工確認。';
  if (item.kind === 'github_pages_missing') return `GitHub Pages 發布異常：${day(item.day)}（${item.date}）頁面仍是 404。`;
  if (item.kind === 'github_pages_mismatch') return `GitHub Pages 發布異常：${day(item.day)}（${item.date}）的 ${item.fields.join('、')} 不一致。`;
  if (item.kind === 'github_pages_unavailable') return `GitHub Pages 檢查失敗：無法可靠讀取 ${day(item.day)}（${item.date}），請人工確認。`;
  if (item.kind === 'audit_missing') return `iThome 草稿盤點異常：缺少 ${item.days.map(day).join('、')}。`;
  if (item.kind === 'audit_duplicate') return `iThome 草稿盤點異常：${item.entries.map((entry) => `${day(entry.day)} 有 ${entry.count} 份重複草稿`).join('；')}，未自動刪除。`;
  if (item.kind === 'audit_mismatch') return `iThome 草稿盤點異常：${item.entries.map((entry) => `${day(entry.day)} 的 ${entry.fields.join('、')} 不一致`).join('；')}，未自動覆寫。`;
  if (item.kind === 'audit_failed') return `iThome 草稿盤點失敗：${item.failure?.reasonCode ?? 'unknown'}，請查看 Codex audit log。`;
  if (item.kind === 'publish_failed') return `iThome ${day(item.day)} 發布結果異常：${item.status}／${item.result?.reasonCode ?? 'unknown'}，請人工確認。`;
  if (item.kind === 'bootstrap_failed') return `iThome Day 1 bootstrap 異常：${item.status}／${item.failure?.reasonCode ?? 'unknown'}，請人工確認。`;
  if (item.kind === 'bootstrap_missing') return `iThome Day 1 ${item.checkpoint === 'day1-2230' ? '22:30' : '19:00'} 尚無有效 verified bootstrap state，請人工確認。`;
  if (item.kind === 'bootstrap_recovered') return 'iThome Day 1 verified bootstrap state 已就緒，公開系列頁 watchdog 可以開始監控。';
  if (item.kind === 'stale_event') return `iThome ${item.operation ?? '事件'} 證據已超過 ${item.ageHours} 小時，不能視為目前狀態。`;
  if (item.kind === 'duplicate_event_id') return `iThome watcher 發現相同 eventId 的內容不一致：${item.eventId}。`;
  if (item.kind === 'event_invalid') return `iThome watcher 讀到無效事件：${item.eventId ?? '缺少 eventId'}。`;
  return `iThome watcher 出現未知通知類型：${item.kind ?? 'unknown'}。`;
}

export function formatNotifications(notifications) {
  if (!Array.isArray(notifications)) throw new Error('notifications must be an array');
  return notifications.map(formatOne).join('\n');
}

if (isDirectExecution(import.meta.url, process.argv[1])) {
  try {
    const result = JSON.parse(readFileSync(0, 'utf8'));
    process.stdout.write(formatNotifications(result.notifications));
  } catch (error) {
    process.stdout.write(`iThome watcher 執行失敗：${error.message}`);
    process.exitCode = 1;
  }
}
