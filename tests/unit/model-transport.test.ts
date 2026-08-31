import { describe, expect, it } from 'vitest';
import { CloudflareAIGatewayTransport, ModelTransportError, createModelTransport } from '../../worker/providers/model-transport';

const request = { model: 'gemini-3.7-flash', messages: [{ role: 'user' as const, content: 'hello' }], response_format: { type: 'json_schema' } };

describe('Cloudflare AI Gateway transport', () => {
  it('builds the documented URL, model prefix, and server-side auth', async () => {
    let seenUrl = ''; let seenInit: RequestInit | undefined;
    const transport = new CloudflareAIGatewayTransport({ mode: 'cloudflare_ai_gateway', accountId: 'account-test', cloudflareToken: 'token-test', fetcher: async (input, init) => { seenUrl = String(input); seenInit = init; return new Response(JSON.stringify({ choices: [] }), { status: 200 }); } });
    await transport.chat(request);
    expect(seenUrl).toBe('https://api.cloudflare.com/client/v4/accounts/account-test/ai/v1/chat/completions');
    expect(seenInit?.headers).toMatchObject({ authorization: 'Bearer token-test', 'content-type': 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toMatchObject({ model: 'google-ai-studio/gemini-3.7-flash', response_format: request.response_format });
  });

  it('retries transient responses once but not invalid/auth responses', async () => {
    let attempts = 0;
    const transport = createModelTransport({ mode: 'cloudflare_ai_gateway', accountId: 'a', cloudflareToken: 't', retryBackoffMs: 0, fetcher: async () => { attempts += 1; return new Response('{}', { status: attempts === 1 ? 503 : 200 }); } });
    await expect(transport.chat(request)).resolves.toBeInstanceOf(Response);
    expect(attempts).toBe(2);
    let invalidAttempts = 0;
    const invalid = createModelTransport({ mode: 'cloudflare_ai_gateway', accountId: 'a', cloudflareToken: 't', fetcher: async () => { invalidAttempts += 1; return new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 }); } });
    await expect(invalid.chat(request)).rejects.toMatchObject({ category: 'gateway_invalid_request', status: 400 });
    expect(invalidAttempts).toBe(1);
  });

  it('requires gateway configuration without exposing a token', () => {
    expect(() => createModelTransport({ mode: 'cloudflare_ai_gateway' })).toThrow(ModelTransportError);
    expect(() => createModelTransport({ mode: 'cloudflare_ai_gateway', accountId: 'a' })).toThrow(/token is not configured/);
  });
});
