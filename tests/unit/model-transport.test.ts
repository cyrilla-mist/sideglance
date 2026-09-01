import { describe, expect, it } from 'vitest';
import { CloudflareAIGatewayTransport, CloudflareGoogleNativeTransport, ModelTransportError, createModelTransport } from '../../worker/providers/model-transport';
import { contextGateResponseFormat } from '../../shared/schemas/context-gate-json';

const request = { model: 'gemini-3.7-flash', messages: [{ role: 'user' as const, content: 'hello' }], response_format: { type: 'json_schema' } };

describe('Cloudflare AI Gateway transport', () => {
  it('builds the documented URL, model prefix, and server-side auth', async () => {
    let seenUrl = ''; let seenInit: RequestInit | undefined;
    const transport = new CloudflareAIGatewayTransport({ mode: 'cloudflare_ai_gateway', model: 'gemini-3.7-flash', accountId: 'account-test', cloudflareToken: 'token-test', fetcher: async (input, init) => { seenUrl = String(input); seenInit = init; return new Response(JSON.stringify({ choices: [] }), { status: 200 }); } });
    await transport.chat(request);
    expect(seenUrl).toBe('https://api.cloudflare.com/client/v4/accounts/account-test/ai/v1/chat/completions');
    expect(seenInit?.headers).toMatchObject({ authorization: 'Bearer token-test', 'content-type': 'application/json' });
    expect(JSON.parse(String(seenInit?.body))).toMatchObject({ model: 'google-ai-studio/gemini-3.7-flash', response_format: request.response_format });
  });

  it('retries transient responses once but not invalid/auth responses', async () => {
    let attempts = 0;
    const transport = createModelTransport({ mode: 'cloudflare_ai_gateway', model: 'm', accountId: 'a', cloudflareToken: 't', retryBackoffMs: 0, fetcher: async () => { attempts += 1; return new Response('{}', { status: attempts === 1 ? 503 : 200 }); } });
    await expect(transport.chat(request)).resolves.toBeInstanceOf(Response);
    expect(attempts).toBe(2);
    let invalidAttempts = 0;
    const invalid = createModelTransport({ mode: 'cloudflare_ai_gateway', model: 'm', accountId: 'a', cloudflareToken: 't', fetcher: async () => { invalidAttempts += 1; return new Response(JSON.stringify({ error: { message: 'bad request' } }), { status: 400 }); } });
    await expect(invalid.chat(request)).rejects.toMatchObject({ category: 'gateway_invalid_request', status: 400 });
    expect(invalidAttempts).toBe(1);
  });

  it('requires gateway configuration without exposing a token', () => {
    expect(() => createModelTransport({ mode: 'cloudflare_ai_gateway', model: 'm' })).toThrow(ModelTransportError);
    expect(() => createModelTransport({ mode: 'cloudflare_ai_gateway', model: 'm', accountId: 'a' })).toThrow(/token is not configured/);
  });

  it('uses the documented native Google Gateway endpoint and translates auth, messages, and schema', async () => {
    let url = ''; let init: RequestInit | undefined;
    const transport = createModelTransport({ mode: 'cloudflare_google_native', model: 'gemini-3.7-flash', accountId: 'a', cloudflareAigToken: 'cf-test-token', apiKey: 'google-test-key', fetcher: async (input, requestInit) => { url = String(input); init = requestInit; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'thought', thought: true }, { text: '{"status":"ready"}' }] } }] }), { status: 200 }); } });
    const nativeRequest = { ...request, response_format: contextGateResponseFormat, messages: [{ role: 'system' as const, content: 'system text' }, ...request.messages] };
    const response = await transport.chat(nativeRequest);
    expect(url).toBe('https://gateway.ai.cloudflare.com/v1/a/default/google-ai-studio/v1/models/gemini-3.7-flash:generateContent');
    expect(url).not.toContain('/default/compat/chat/completions');
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'google-test-key', 'cf-aig-authorization': 'Bearer cf-test-token', 'cf-aig-collect-log-payload': 'false' });
    expect(init?.headers).not.toHaveProperty('authorization');
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ systemInstruction: { parts: [{ text: 'system text' }] }, contents: [{ role: 'user', parts: [{ text: 'hello' }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: contextGateResponseFormat.json_schema.schema } });
    expect(body.model).toBeUndefined();
    expect(await response.json()).toEqual({ choices: [{ message: { role: 'assistant', content: '{"status":"ready"}' } }] });
  });
});
