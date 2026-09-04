import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeContext } from '../../src/api/decode-client';

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
});
