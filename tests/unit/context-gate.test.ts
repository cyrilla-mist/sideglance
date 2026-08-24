import { describe, expect, it } from 'vitest';
import { contextGateCases } from '../../evaluation/cases/context-gate';
import { AIContextGateEngine, ContextGateError, MockContextGateEngine } from '../../worker/engine/context-gate';
import { diagnoseContextGateResult, isContextGateResult } from '../../shared/schemas/context-gate';

describe('MockContextGateEngine', () => {
  it('keeps the ambiguous inputs behind the context gate', async () => {
    const engine = new MockContextGateEngine();
    for (const testCase of contextGateCases) {
      const result = await engine.checkContext(testCase.input, testCase.context);
      expect(result.status, testCase.id).toBe(testCase.expectedStatus);
      if (testCase.expectedQuestion) expect(result.question, testCase.id).toBe(testCase.expectedQuestion);
    }
  });

  it('reports sufficiency dimensions for ready and blocked paths', async () => {
    const engine = new MockContextGateEngine();
    expect((await engine.checkContext('fearless behavior')).sufficiency).toEqual({ toneJudgment: false, socialImplication: false, usageBoundary: false });
    expect((await engine.checkContext('Kai: on a friday??\nLeo: fearless behavior 💀\nLeo: enjoy your weekend')).sufficiency).toEqual({ toneJudgment: true, socialImplication: true, usageBoundary: true });
  });
});

function providerResponse(result: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
}

const readyResult = { status: 'ready', confidence: 'high', reason: 'context_sufficient', sufficiency: { toneJudgment: true, socialImplication: true, usageBoundary: true } };
const needsContextResult = { status: 'needs_context', confidence: 'low', reason: 'ambiguous_phrase', missingInformation: 'The surrounding exchange is missing.', question: 'What was said immediately before this?', sufficiency: { toneJudgment: false, socialImplication: false, usageBoundary: false } };

describe('AIContextGateEngine contract seam', () => {
  it('accepts a valid needs_context response without calling a real provider', async () => {
    const engine = new AIContextGateEngine({ apiKey: 'test-only', fetcher: async () => providerResponse(needsContextResult) });
    await expect(engine.checkContext('fearless behavior')).resolves.toMatchObject({ status: 'needs_context', question: 'What was said immediately before this?' });
  });

  it('accepts a valid ready response', async () => {
    const engine = new AIContextGateEngine({ apiKey: 'test-only', fetcher: async () => providerResponse(readyResult) });
    const result = await engine.checkContext('Friday merge with surrounding exchange');
    expect(result.status).toBe('ready');
    expect(isContextGateResult(result)).toBe(true);
  });

  it('rejects invalid enum and shape responses safely', async () => {
    const invalid = { ...readyResult, status: 'maybe', sufficiency: { toneJudgment: true } };
    const engine = new AIContextGateEngine({ apiKey: 'test-only', fetcher: async () => providerResponse(invalid) });
    await expect(engine.checkContext('input')).rejects.toMatchObject({ name: 'ContextGateError', stage: 'invalid_contract' });
    expect(diagnoseContextGateResult(invalid).valid).toBe(false);
  });

  it('rejects multiple clarification questions', async () => {
    const invalid = { ...needsContextResult, question: 'What happened? Who said it?' };
    const engine = new AIContextGateEngine({ apiKey: 'test-only', fetcher: async () => providerResponse(invalid) });
    await expect(engine.checkContext('input')).rejects.toBeInstanceOf(ContextGateError);
    expect(diagnoseContextGateResult(invalid).issues.some((issue) => issue.path === 'question')).toBe(true);
  });
});
