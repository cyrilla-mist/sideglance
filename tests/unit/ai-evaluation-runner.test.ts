import { describe, expect, it } from 'vitest';
import { ContextProviderError } from '../../worker/providers/context-provider';
import { fridayMergeContextAnalysis } from '../../worker/providers/fixture-context';
import { runAIEvaluation, serializeAIEvaluationReport } from '../../evaluation/runners/ai-evaluation-runner';
import type { ContextEngine } from '../../worker/engine/context-engine';

describe('AI evaluation runner', () => {
  it('keeps per-case model and evaluation results while classifying failures', async () => {
    const engine: ContextEngine = { analyze: async (input) => {
      if (input === 'bad') throw new ContextProviderError('context_schema_invalid', 'Context model returned an invalid context schema.');
      return fridayMergeContextAnalysis;
    } };
    const report = await runAIEvaluation([
      { id: 'good', category: 'developer_culture', input: 'fearless behavior 💀', expected: { tone: ['sarcastic'], uncertaintyRequired: true } },
      { id: 'bad', category: 'developer_culture', input: 'bad', expected: {} },
    ], engine, undefined, (() => { let time = 1000; return () => ++time; })());
    expect(report.totalCases).toBe(2);
    expect(report.cases[0].modelResult).toEqual(fridayMergeContextAnalysis);
    expect(report.cases[1].modelResult).toBeNull();
    expect(report.cases[1].failureCategories).toEqual(['schema_issue']);
    expect(JSON.parse(serializeAIEvaluationReport(report))).toMatchObject({ totalCases: 2, schemaFailures: 1 });
  });
});
