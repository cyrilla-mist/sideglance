import { describe, expect, it } from 'vitest';
import { CloudflareAIGatewayTransport, ModelTransportError, createModelTransport } from '../../worker/providers/model-transport';
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

  it('uses direct Google native transport without Gateway credentials', async () => {
    let url = ''; let init: RequestInit | undefined;
    const transport = createModelTransport({ mode: 'google_native_direct', model: 'gemini-3.7-flash', apiKey: 'google-test-key', fetcher: async (input, requestInit) => { url = String(input); init = requestInit; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }), { status: 200 }); } });
    const response = await transport.chat({ model: 'gemini-3.7-flash', messages: [{ role: 'system' as const, content: 'system' }, { role: 'user' as const, content: 'user' }], response_format: { type: 'json_object' } });
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent');
    expect(init?.headers).toMatchObject({ 'x-goog-api-key': 'google-test-key', 'content-type': 'application/json' });
    expect(init?.headers).not.toHaveProperty('cf-aig-authorization');
    expect(init?.headers).not.toHaveProperty('authorization');
    expect(JSON.parse(String(init?.body))).toMatchObject({ systemInstruction: { parts: [{ text: 'system' }] }, contents: [{ role: 'user', parts: [{ text: 'user' }] }], generationConfig: { responseMimeType: 'application/json' } });
    expect(await response.json()).toEqual({ choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }] });
  });

  it('uses the final direct Google OpenAI-compatible production candidate', async () => {
    let url = ''; let init: RequestInit | undefined;
    const transport = createModelTransport({ mode: 'google_openai_direct', model: 'gemini-3.7-flash', apiKey: 'google-test-key', fetcher: async (input, requestInit) => { url = String(input); init = requestInit; return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 }); } });
    await transport.chat(request);
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer google-test-key', 'content-type': 'application/json' });
    expect(init?.headers).not.toHaveProperty('x-goog-api-key');
    expect(init?.headers).not.toHaveProperty('cf-aig-authorization');
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'gemini-3.7-flash', messages: request.messages, response_format: request.response_format });
  });

  it('maps direct Google auth and provider failures without retrying auth', async () => {
    let attempts = 0;
    const transport = createModelTransport({ mode: 'google_native_direct', model: 'm', apiKey: 'k', fetcher: async () => { attempts += 1; return new Response(JSON.stringify({ error: { message: 'invalid key' } }), { status: 401 }); } });
    await expect(transport.chat(request)).rejects.toMatchObject({ category: 'google_auth_error', status: 401 });
    expect(attempts).toBe(1);
  });

  it('retries direct Google transient provider failures once and requires its key', async () => {
    let attempts = 0;
    const transport = createModelTransport({ mode: 'google_native_direct', model: 'm', apiKey: 'k', retryBackoffMs: 0, fetcher: async () => { attempts += 1; return new Response(attempts === 1 ? '{"error":{"message":"busy"}}' : '{"candidates":[{"content":{"parts":[{"text":"ok"}]}}]}', { status: attempts === 1 ? 503 : 200 }); } });
    await expect(transport.chat(request)).resolves.toBeInstanceOf(Response);
    expect(attempts).toBe(2);
    expect(() => createModelTransport({ mode: 'google_native_direct', model: 'm' })).toThrow(/Google AI Studio API key/);
  });
});
