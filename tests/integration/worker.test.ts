import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';

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

  it('does not fall back to fixture or expose details when AI mode lacks a key', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/decode', { method: 'POST', body: JSON.stringify({ inputText: 'touch grass' }), headers: { 'content-type': 'application/json' } }), { CONTEXT_ENGINE_MODE: 'ai' });
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ type: 'failed', errorCode: 'missing_api_key', message: 'Context model API key is not configured.' });
  });
});
