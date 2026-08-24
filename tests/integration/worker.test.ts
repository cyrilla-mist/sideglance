import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';
import { ContextEvaluator } from '../../evaluation/evaluator/context-evaluator';
import { fridayMergeContextAnalysis } from '../../worker/providers/fixture-context';

describe('worker health route', () => {
  it('serves GET /api/health', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'sideglance-worker' });
  });

  it('decodes the Friday Merge fixture', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/decode', { method: 'POST', body: JSON.stringify({ inputText: 'Kai: on a friday??\n\nLeo: fearless behavior 💀\n\nNora: wait what\n\nLeo: nothing. enjoy your weekend' }), headers: { 'content-type': 'application/json' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ type: 'decoded', confidence: 'high', contextAnalysis: { tone: ['playful', 'sarcastic'], register: 'technical' } });
  });

  it('returns needs context for an isolated phrase', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/decode', { method: 'POST', body: JSON.stringify({ inputText: 'fearless behavior' }), headers: { 'content-type': 'application/json' } }));
    expect(await response.json()).toMatchObject({ type: 'needs_context', reason: 'ambiguous_phrase' });
  });

  it('decodes after the user supplies the minimum missing context', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/decode', { method: 'POST', body: JSON.stringify({ inputText: 'fearless behavior', additionalContext: 'Mia: I finally spoke up about the issue.\n\nAlex: That was fearless behavior.' }), headers: { 'content-type': 'application/json' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ type: 'decoded', contextAnalysis: { tone: ['sincere'] } });
  });

  it('decodes the deterministic touch grass demo fixture', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/decode', { method: 'POST', body: JSON.stringify({ inputText: 'touch grass' }), headers: { 'content-type': 'application/json' } }));
    expect(await response.json()).toMatchObject({ type: 'decoded', snapshot: expect.stringContaining('internet slang') });
  });

  it('returns friendly failed responses for empty and invalid requests', async () => {
    const emptyResponse = await worker.fetch(new Request('http://localhost/api/decode', { method: 'POST', body: JSON.stringify({ inputText: '   ' }), headers: { 'content-type': 'application/json' } }));
    expect(await emptyResponse.json()).toMatchObject({ type: 'failed', errorCode: 'invalid_request' });
    const invalidResponse = await worker.fetch(new Request('http://localhost/api/decode', { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } }));
    expect(await invalidResponse.json()).toEqual({ type: 'failed', errorCode: 'invalid_request', message: 'Request body must be valid JSON.' });
  });

  it('does not fall back to fixture or expose details when AI mode lacks a key', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/decode', { method: 'POST', body: JSON.stringify({ inputText: 'touch grass' }), headers: { 'content-type': 'application/json' } }), { CONTEXT_ENGINE_MODE: 'ai' });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ type: 'failed', errorCode: 'missing_api_key', message: 'Context model API key is not configured.' });
  });

  it('evaluates the fixture context output independently from the API route', () => {
    const result = new ContextEvaluator().evaluate({ id: 'friday-fixture', category: 'developer_culture', input: 'Nora: just merged the auth rewrite into main\n\nKai: on a friday??\n\nLeo: fearless behavior 💀\n\nKai: enjoy your weekend', expected: {
      tone: ['sarcastic', 'playful'], communityContext: 'developer norm', requiredSignals: [{ phrase: 'fearless behavior', signalTypes: ['irony'] }], uncertaintyRequired: true,
    } }, fridayMergeContextAnalysis);
    expect(result.passed).toBe(true);
  });
});
