import { describe, expect, it } from 'vitest';
import { task09bPreflightCases } from '../../evaluation/cases/task09b-preflight';
import { ContextEvaluator } from '../../evaluation/evaluator/context-evaluator';
import { validateContextEvidence } from '../../shared/schemas/context-evidence';
import { straightforwardReadmeContextAnalysis } from '../../worker/providers/fixture-context';

describe('straightforward README control case', () => {
  it('is registered with a ready Gate expectation', () => {
    expect(task09bPreflightCases.D).toMatchObject({ id: 'developer-readme-update', expectedGate: 'ready', kind: 'readme' });
  });

  it('allows a valid no-signal interpretation', () => {
    const caseItem = { id: 'developer-readme-update', category: 'developer_culture' as const, input: task09bPreflightCases.D.input, expected: { register: 'technical' as const, forbiddenClaims: ['sarcastic reading', 'passive-aggressive', 'interpersonal tension', 'secret frustration', 'hidden warning', 'risky deploy', 'Discord', 'GitHub', 'unsupported relationship'] } };
    const result = new ContextEvaluator().evaluate(caseItem, straightforwardReadmeContextAnalysis);
    expect(result.passed).toBe(true);
    expect(straightforwardReadmeContextAnalysis.signals).toHaveLength(0);
    expect(validateContextEvidence(straightforwardReadmeContextAnalysis, task09bPreflightCases.D.input)).toMatchObject({ valid: true, total: 0, exactMatches: 0, invalid: [] });
  });

  it('fails a fabricated sarcastic interpretation', () => {
    const fabricated = { ...straightforwardReadmeContextAnalysis, tone: ['sarcastic' as const], socialImplication: 'This is a sarcastic reading with interpersonal tension.' };
    const result = new ContextEvaluator().evaluate({ id: 'developer-readme-update', category: 'developer_culture', input: task09bPreflightCases.D.input, expected: { register: 'technical', forbiddenClaims: ['sarcastic reading', 'interpersonal tension'] } }, fabricated);
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.rule)).toContain('forbidden_claim');
  });
});
