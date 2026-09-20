import { describe, expect, test } from 'vitest';
import { assertContentContract } from './content-contract';

const project = {
  learningMap: { sections: [{ id: 'foundation' }, { id: 'practice' }] },
  publication: { schedule: [{ day: 1, date: '2026-09-01' }, { day: 2, date: '2026-09-02' }] },
};
const post = (id: string, day: number, section = 'foundation', date = `2026-09-0${day}`) => ({ id, data: { day, section, description: `Day ${day} 的獨特摘要`, publishDate: new Date(`${date}T00:00:00Z`) } });

describe('content cross-collection contract', () => {
  test('accepts configured sections, dates, unique slugs, and existing related Days', () => {
    expect(() => assertContentContract([post('day-01', 1), post('day-02', 2, 'practice')], [{ id: 'retrospective', data: { slug: 'retrospective', relatedDays: [1, 2] } }], project)).not.toThrow();
  });
  test('reports source, received field, and expected value', () => {
    expect(() => assertContentContract(
      [post('day-01', 1), post('duplicate-day', 1, 'missing', '2026-09-09')],
      [{ id: 'one', data: { slug: 'same', relatedDays: [2, 2, 30] } }, { id: 'two', data: { slug: 'same' } }],
      project,
    )).toThrow(/duplicate-day: day=1 duplicates day-01[\s\S]*section=missing[\s\S]*publishDate=2026-09-09 expected 2026-09-01[\s\S]*relatedDays contains duplicate[\s\S]*relatedDays=30[\s\S]*slug=same duplicates one/);
  });
  test('rejects an Ironman article without a reusable description', () => {
    const invalid = post('day-01', 1);
    invalid.data.description = '';

    expect(() => assertContentContract([invalid], [], project)).toThrow(/day-01: description is required/);
  });
});
