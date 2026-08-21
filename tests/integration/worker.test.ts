import { describe, expect, it } from 'vitest';
import worker from '../../worker/index';

describe('worker health route', () => {
  it('serves GET /api/health', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'sideglance-worker' });
  });

  it('does not expose decode yet', async () => {
    const response = await worker.fetch(new Request('http://localhost/api/decode'));
    expect(response.status).toBe(404);
  });
});
