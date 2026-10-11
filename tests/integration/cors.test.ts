import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';

const TRUSTED_ORIGIN = 'https://cyrilla-mist.github.io';
const WORKER_URL = 'https://sideglance-worker-production.example.workers.dev/api/decode';
const env = { ALLOWED_ORIGINS: TRUSTED_ORIGIN };

function decodeRequest(origin?: string): Request {
  return new Request(WORKER_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ inputText: 'touch grass' }),
  });
}

describe('Worker browser origin boundary', () => {
  it('allows only a configured exact origin to preflight the decode endpoint', async () => {
    const response = await worker.fetch(new Request(WORKER_URL, {
      method: 'OPTIONS',
      headers: { Origin: TRUSTED_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    }), env);
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(TRUSTED_ORIGIN);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('content-type');
    expect(response.headers.get('Vary')).toBe('Origin');
  });

  it('blocks other origins, null origins, and missing allowlists before model work', async () => {
    for (const origin of ['https://attacker.example', 'https://cyrilla-mist.github.io.attacker.example', 'null']) {
      const response = await worker.fetch(decodeRequest(origin), { ...env, CONTEXT_ENGINE_MODE: 'ai' });
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Origin not allowed.' });
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    const noAllowlist = await worker.fetch(decodeRequest(TRUSTED_ORIGIN));
    expect(noAllowlist.status).toBe(403);
  });

  it('blocks unknown-origin preflight and preflight with no Origin', async () => {
    const disallowed = await worker.fetch(new Request(WORKER_URL, {
      method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' },
    }), env);
    expect(disallowed.status).toBe(403);
    const missing = await worker.fetch(new Request(WORKER_URL, { method: 'OPTIONS' }), env);
    expect(missing.status).toBe(400);
  });

  it('keeps CORS headers on both successful fixture and failed AI responses', async () => {
    const fixture = await worker.fetch(decodeRequest(TRUSTED_ORIGIN), env);
    expect(fixture.status).toBe(200);
    expect(await fixture.json()).toMatchObject({ type: 'decoded' });
    expect(fixture.headers.get('Access-Control-Allow-Origin')).toBe(TRUSTED_ORIGIN);

    const authorizedRequest = decodeRequest(TRUSTED_ORIGIN);
    authorizedRequest.headers.set('Authorization', 'Bearer test-operator-token');
    const failed = await worker.fetch(authorizedRequest, {
      ...env,
      CONTEXT_ENGINE_MODE: 'ai',
      AI_ACCESS_TOKEN: 'test-operator-token',
      AI_RATE_LIMITER: { limit: async () => ({ success: true }) },
    });
    expect(failed.status).toBe(502);
    expect(await failed.json()).toMatchObject({ type: 'failed', errorCode: 'missing_api_key' });
    expect(failed.headers.get('Access-Control-Allow-Origin')).toBe(TRUSTED_ORIGIN);
  });

  it('preserves health and explicit no-Origin operator smoke requests', async () => {
    const health = await worker.fetch(new Request(WORKER_URL.replace('/api/decode', '/api/health')));
    expect(health.status).toBe(200);
    const fixture = await worker.fetch(decodeRequest(), env);
    expect(fixture.status).toBe(200);
    expect(fixture.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
