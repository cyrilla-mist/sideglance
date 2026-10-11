import { describe, expect, it, vi } from 'vitest';
import worker from '../../worker/index';
import type { WorkerEnv } from '../../worker/routes/decode';

const url = 'https://sideglance-worker-production.example.workers.dev/api/decode';
const origin = 'https://cyrilla-mist.github.io';
const token = 'test-only-operator-token';

function request(auth?: string, suppliedOrigin?: string): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(auth ? { Authorization: auth } : {}),
      ...(suppliedOrigin ? { Origin: suppliedOrigin } : {}),
    },
    body: JSON.stringify({ inputText: 'touch grass' }),
  });
}

function aiEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    CONTEXT_ENGINE_MODE: 'ai',
    ALLOWED_ORIGINS: origin,
    AI_ACCESS_TOKEN: token,
    AI_RATE_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  };
}

describe('AI operator-only access gate', () => {
  it('fails closed if either secret or rate limiter binding is missing', async () => {
    const missingToken = await worker.fetch(request(), aiEnv({ AI_ACCESS_TOKEN: undefined }));
    expect(missingToken.status).toBe(503);
    expect(await missingToken.json()).toEqual({ error: 'Live Decode is not configured.' });

    const missingLimiter = await worker.fetch(request('Bearer ' + token), aiEnv({ AI_RATE_LIMITER: undefined }));
    expect(missingLimiter.status).toBe(503);
    expect(await missingLimiter.json()).toEqual({ error: 'Live Decode is not configured.' });
  });

  it('denies anonymous or incorrect bearer tokens without hitting the model or limiter', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const env = aiEnv({ AI_RATE_LIMITER: { limit } });
    for (const attempted of [request(), request('Bearer wrong'), request('Basic ' + token)]) {
      const response = await worker.fetch(attempted, env);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Authorization required.' });
    }
    expect(limit).not.toHaveBeenCalled();
  });

  it('only consumes limit after valid authorization; preserves existing AI contract failures', async () => {
    const limit = vi.fn(async () => ({ success: true }));
    const response = await worker.fetch(request('Bearer ' + token), aiEnv({ AI_RATE_LIMITER: { limit } }));
    expect(limit).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith({ key: 'sideglance:operator-decode' });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ type: 'failed', errorCode: 'missing_api_key' });
  });

  it('blocks exhausted budgets before a model call with 429 and Retry-After', async () => {
    const response = await worker.fetch(request('Bearer ' + token, origin), aiEnv({
      AI_RATE_LIMITER: { limit: async () => ({ success: false }) },
    }));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
    expect(await response.json()).toEqual({ error: 'Too many Decode requests.' });
  });

  it('fails closed if the limiter throws instead of using unmetered inference', async () => {
    const response = await worker.fetch(request('Bearer ' + token), aiEnv({
      AI_RATE_LIMITER: { limit: async () => { throw new Error('internal limiter exception'); } },
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Live Decode is temporarily unavailable.' });
  });

  it('CORS cannot substitute for authentication; untrusted Origin stays blocked', async () => {
    const noToken = await worker.fetch(request(undefined, origin), aiEnv());
    expect(noToken.status).toBe(401);
    expect(noToken.headers.get('Access-Control-Allow-Origin')).toBe(origin);

    const untrusted = await worker.fetch(request('Bearer ' + token, 'https://untrusted.example'), aiEnv());
    expect(untrusted.status).toBe(403);
    expect(untrusted.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('does not restrict fixture demos or no-key health checks', async () => {
    const demo = await worker.fetch(request(), { CONTEXT_ENGINE_MODE: 'fixture' });
    expect(demo.status).toBe(200);
    expect(await demo.json()).toMatchObject({ type: 'decoded' });
    const health = await worker.fetch(new Request(url.replace('/api/decode', '/api/health')), aiEnv());
    expect(health.status).toBe(200);
  });
});
