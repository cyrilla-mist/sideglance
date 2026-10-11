import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeContext, resolveDecodeEndpoint, DecodeClientError } from '../../src/api/decode-client';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('decodeContext', () => {
  it('keeps the normal client on the /api/decode network path', async () => {
    const response = { type: 'failed', errorCode: 'unknown_fixture', message: 'ok' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(decodeContext({ inputText: 'unknown request' })).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledWith('/api/decode', expect.objectContaining({ method: 'POST' }));
  });

  it('uses the shared fixture provider in Pages mode without network access', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'fixture');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(decodeContext({ inputText: 'fearless behavior' })).resolves.toMatchObject({ type: 'needs_context' });
    await expect(decodeContext({ inputText: 'Kai: on a friday??\nLeo: fearless behavior 💀' })).resolves.toMatchObject({ type: 'decoded' });
    await expect(decodeContext({ inputText: 'fearless behavior', additionalContext: 'Mia: I finally spoke up about the issue even though I was terrified.' })).resolves.toMatchObject({ type: 'decoded' });
    await expect(decodeContext({ inputText: 'touch grass' })).resolves.toMatchObject({ type: 'decoded' });
    await expect(decodeContext({ inputText: 'not in the fixture' })).resolves.toMatchObject({ type: 'failed', errorCode: 'unknown_fixture' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends non-fixture requests to a configured HTTPS Worker origin', async () => {
    vi.stubEnv('VITE_DECODE_API_BASE_URL', 'https://sideglance-worker-production.example.workers.dev/');
    const value = { type: 'failed', errorCode: 'model_unavailable', message: 'Context model is unavailable.' };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(value), { status: 502 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(decodeContext({ inputText: 'unknown new text' })).resolves.toEqual(value);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sideglance-worker-production.example.workers.dev/api/decode',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('accepts only HTTPS origins or loopback HTTP and rejects paths, credentials, or query strings', () => {
    for (const bad of [
      'http://some-worker.example', 'https://foo.example/api/decode',
      'https://foo.example/?key=abc', 'https://user:pass@foo.example',
      'javascript:alert(1)', '/api/decode',
    ]) {
      vi.stubEnv('VITE_DECODE_API_BASE_URL', bad);
      expect(() => resolveDecodeEndpoint()).toThrow(DecodeClientError);
    }
    vi.stubEnv('VITE_DECODE_API_BASE_URL', 'http://127.0.0.1:8787');
    expect(resolveDecodeEndpoint()).toBe('http://127.0.0.1:8787/api/decode');
  });

  it('does not call the network on an invalid live endpoint', async () => {
    vi.stubEnv('VITE_DECODE_API_BASE_URL', 'http://insecure.example');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(decodeContext({ inputText: 'anything' })).rejects.toThrow(DecodeClientError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves the needs-context result and refuses a decoded body on HTTP 502', async () => {
    const needs = { type: 'needs_context', originalMoment: 'fr', reason: 'ambiguous_phrase', question: 'What happened before?', missingContext: 'Not enough context.' };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(needs), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(decodeContext({ inputText: 'fr' })).resolves.toEqual(needs);

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      type: 'decoded', originalMoment: 'fr', snapshot: 'test',
      signals: [], confidence: 'low',
      usageBoundary: { natural: '', depends: '', avoid: '' },
    }), { status: 502 }));
    await expect(decodeContext({ inputText: 'fr' })).rejects.toThrow('unexpected status');
  });

  it('returns controlled errors for network failure or invalid JSON and schema', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('private connection details'))
      .mockResolvedValueOnce(new Response('not JSON', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ secret: 'ignore me' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(decodeContext({ inputText: 'a' })).rejects.toThrow('unavailable');
    await expect(decodeContext({ inputText: 'b' })).rejects.toThrow('invalid JSON');
    await expect(decodeContext({ inputText: 'c' })).rejects.toThrow('invalid response');
  });

  it('keeps the Pages fixture isolated even if a live API origin is configured', async () => {
    vi.stubEnv('VITE_DEMO_MODE', 'fixture');
    vi.stubEnv('VITE_DECODE_API_BASE_URL', 'https://sideglance-worker-production.example.workers.dev');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(decodeContext({ inputText: 'touch grass' })).resolves.toMatchObject({ type: 'decoded' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
