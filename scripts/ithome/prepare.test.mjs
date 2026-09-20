import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { prepareIthomePayload } from './prepare.mjs';

describe('iThome payload contract', () => {
  test.each([1, 2, 3, 4, 5, 6])('Day %i fails closed without an explicit schedule entry', async (day) => {
    const project = {
      schedule: [],
      githubPages: { publicUrl: 'https://example.github.io/series' },
    };

    await expect(prepareIthomePayload(day, { project })).rejects.toThrow(/explicit schedule/);
  });

  test('preserves payload shape and reads only an explicit Ironman Day', async () => {
    const postsDir = await mkdtemp(join(tmpdir(), 'ithome-ironman-'));
    await writeFile(join(postsDir, 'day-01.md'), '---\ntitle: "Day 01｜測試"\nday: 1\npublishDate: 2026-09-01\n---\n\n正文\n');
    const project = {
      publication: { schedule: [{ day: 1, date: '2026-09-01' }] },
      schedule: [{ day: 1, date: '2026-09-01' }],
      githubPages: { publicUrl: 'https://example.github.io/series' },
    };
    const payload = await prepareIthomePayload(1, { project, postsDir });
    expect(Object.keys(payload)).toEqual(['day', 'dayString', 'sourcePath', 'title', 'publishDate', 'canonicalUrl', 'syncLine', 'body']);
    expect(payload.canonicalUrl).toBe('https://example.github.io/series/day/01/');
    expect(payload.body).toBe('本文同步刊載於[個人連載網站](https://example.github.io/series/day/01/)\n\n正文\n');
  });
});
