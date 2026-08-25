import { describe, expect, it } from 'vitest';
import { goldCases } from '../../evaluation/cases/gold';
import { assertEvaluationCase, isEvaluationCase } from '../../evaluation/schemas/evaluation';

describe('evaluation case schema', () => {
  it('contains 20 strongly typed gold cases', () => {
    expect(goldCases).toHaveLength(21);
    expect(goldCases.every((item) => isEvaluationCase(item))).toBe(true);
    expect(assertEvaluationCase(goldCases[0])).toEqual(goldCases[0]);
  });

  it('rejects missing or unsupported case fields', () => {
    expect(isEvaluationCase({ id: 'bad', category: 'unknown', input: 'x', expected: {} })).toBe(false);
    expect(isEvaluationCase({ id: 'bad', category: 'social_tone', input: 'x' })).toBe(false);
  });
});
