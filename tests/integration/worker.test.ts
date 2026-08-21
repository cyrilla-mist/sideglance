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
    expect(await response.json()).toMatchObject({ type: 'decoded', confidence: 'high' });
  });

  it('returns needs context for an isolated phrase', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/decode', { method: 'POST', body: JSON.stringify({ inputText: 'fearless behavior' }), headers: { 'content-type': 'application/json' } }));
    expect(await response.json()).toMatchObject({ type: 'needs_context', reason: 'ambiguous_phrase' });
  });
});
