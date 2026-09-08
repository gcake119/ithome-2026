import { describe, expect, test } from 'vitest';
import { hasReachedPublishDate } from './publishing-date';

describe('hasReachedPublishDate', () => {
  test('reaches a scheduled date from midnight in Asia/Taipei', () => {
    const publishDate = new Date('2026-09-09T00:00:00.000Z');
    const taipeiOneAm = new Date('2026-09-08T17:00:00.000Z');

    expect(hasReachedPublishDate(publishDate, taipeiOneAm)).toBe(true);
  });
});
