import { describe, expect, it } from 'vitest';
import { ContextEvaluator, buildEvaluationReport, serializeEvaluationReport } from '../../evaluation/evaluator/context-evaluator';
import type { ContextAnalysis } from '../../shared/contracts/context';

const analysis: ContextAnalysis = {
  literalMeaning: 'Literal meaning', contextualMeaning: 'Playful developer teasing', tone: ['playful', 'sarcastic'], register: 'technical',
  communityContext: 'Developer norms and online discourse', socialImplication: 'Shared context is assumed',
  signals: [{ phrase: 'fearless behavior 💀', signalType: 'irony', explanation: 'The emoji undercuts the praise.', evidenceQuote: 'fearless behavior 💀' }],
  usageBoundary: { naturalIn: 'Close teammates', beCarefulIn: 'New coworkers', avoidIn: 'Formal review' }, confidence: 'high',
  uncertainty: 'Intent could still vary by relationship.',
};

describe('ContextEvaluator', () => {
  it('passes tone, required signal, boundary, and uncertainty checks', () => {
    const result = new ContextEvaluator().evaluate({ id: 'fixture', category: 'developer_culture', input: 'fearless behavior 💀', expected: {
      tone: ['sarcastic'], requiredSignals: [{ phrase: 'fearless behavior', signalTypes: ['irony'] }], usageBoundary: { naturalIn: 'Close teammates' }, uncertaintyRequired: true,
    } }, analysis);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports tone mismatch and forbidden claims deterministically', () => {
    const result = new ContextEvaluator().evaluate({ id: 'bad', category: 'social_tone', input: 'x', expected: { tone: ['sincere'], forbiddenClaims: ['speaker is angry'] } }, { ...analysis, tone: ['playful'], socialImplication: 'The speaker is angry', signals: [{ ...analysis.signals[0], evidenceQuote: 'x' }] });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.rule)).toEqual(['tone_match', 'forbidden_claim']);
  });

  it('builds a JSON report without a dashboard', () => {
    const report = buildEvaluationReport([{ caseId: 'a', passed: true, issues: [], notes: 'ok' }]);
    expect(report).toMatchObject({ totalCases: 1, passedCases: 1, failedCases: 0 });
    expect(JSON.parse(serializeEvaluationReport(report.results))).toMatchObject({ totalCases: 1 });
  });
});
