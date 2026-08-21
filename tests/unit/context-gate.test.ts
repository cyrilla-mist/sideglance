import { describe, expect, it } from 'vitest';
import { contextGateCases } from '../../evaluation/cases/context-gate';
import { MockContextGateEngine } from '../../worker/engine/context-gate';

describe('MockContextGateEngine', () => {
  it('keeps the ambiguous inputs behind the context gate', () => {
    const engine = new MockContextGateEngine();
    for (const testCase of contextGateCases) {
      const result = engine.checkContext(testCase.input, testCase.context);
      expect(result.status, testCase.id).toBe(testCase.expectedStatus);
      if (testCase.expectedQuestion) expect(result.question, testCase.id).toBe(testCase.expectedQuestion);
    }
  });

  it('reports sufficiency dimensions for ready and blocked paths', () => {
    const engine = new MockContextGateEngine();
    expect(engine.checkContext('fearless behavior').sufficiency).toEqual({ toneJudgment: false, socialImplication: false, usageBoundary: false });
    expect(engine.checkContext('Kai: on a friday??\nLeo: fearless behavior 💀\nLeo: enjoy your weekend').sufficiency).toEqual({ toneJudgment: true, socialImplication: true, usageBoundary: true });
  });
});
