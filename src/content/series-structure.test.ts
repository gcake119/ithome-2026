import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

describe('series chapter boundaries', () => {
  test('starts the second product chapter at Day 12', () => {
    const source = readFileSync(new URL('./ironman/day-12.md', import.meta.url), 'utf8');

    expect(source).toMatch(/^section: "chapter-3"$/m);
  });
});
