export type ModelTransportMode = 'direct' | 'google_native_direct' | 'cloudflare_ai_gateway' | 'cloudflare_google_native';
export type ModelTransportFailure = 'gateway_auth_error' | 'google_auth_error' | 'gateway_rate_limited' | 'provider_rate_limited' | 'gateway_provider_unavailable' | 'provider_unavailable' | 'gateway_timeout' | 'provider_timeout' | 'gateway_invalid_request' | 'structured_output_rejected' | 'model_contract_error' | 'transport_error';

export type ModelMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ModelChatRequest = { model: string; messages: ModelMessage[]; temperature?: number; response_format?: unknown; reasoning_effort?: 'low' | 'medium' | 'high' };
export type ModelTransport = { chat(request: ModelChatRequest): Promise<Response> };
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ModelTransportError extends Error {
  constructor(public readonly category: ModelTransportFailure, message: string, public readonly status?: number, public readonly providerMessage?: string) {
    super(message);
    this.name = 'ModelTransportError';
  }
}

export type ModelTransportConfigErrorCode = 'missing_model_config' | 'missing_gateway_account' | 'missing_gateway_token' | 'missing_google_key' | 'invalid_transport_mode';
export class ModelTransportConfigError extends ModelTransportError {
  constructor(public readonly configCode: ModelTransportConfigErrorCode, message: string) { super('transport_error', message); this.name = 'ModelTransportConfigError'; }
}

export type ModelTransportConfig = {
  mode: ModelTransportMode;
  model?: string;
  apiKey?: string;
  endpoint?: string;
  accountId?: string;
  cloudflareToken?: string;
  cloudflareAigToken?: string;
  timeoutMs?: number;
  fetcher?: FetchLike;
  retryBackoffMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;
const GATEWAY_ENDPOINT = 'https://api.cloudflare.com/client/v4/accounts';

export function createModelTransport(config: ModelTransportConfig): ModelTransport {
  if (config.mode !== 'direct' && !config.model) throw new ModelTransportConfigError('missing_model_config', 'Model name is not configured.');
  if (config.mode === 'google_native_direct') {
    if (!config.model) throw new ModelTransportConfigError('missing_model_config', 'Model name is not configured.');
    if (!config.apiKey) throw new ModelTransportConfigError('missing_google_key', 'Google AI Studio API key is not configured.');
    return new DirectGoogleNativeTransport(config);
  }
  if (config.mode === 'cloudflare_google_native') {
    if (!config.accountId) throw new ModelTransportConfigError('missing_gateway_account', 'Cloudflare account ID is not configured.');
    if (!config.cloudflareAigToken) throw new ModelTransportConfigError('missing_gateway_token', 'Cloudflare AI Gateway token is not configured.');
    if (!config.apiKey) throw new ModelTransportConfigError('missing_google_key', 'Google AI Studio API key is not configured.');
    return new CloudflareGoogleNativeTransport(config);
  }
  if (config.mode === 'cloudflare_ai_gateway') {
    if (!config.accountId) throw new ModelTransportConfigError('missing_gateway_account', 'Cloudflare account ID is not configured.');
    if (!config.cloudflareToken) throw new ModelTransportConfigError('missing_gateway_token', 'Cloudflare API token is not configured.');
    return new CloudflareAIGatewayTransport(config);
  }
  if (!config.apiKey) throw new ModelTransportConfigError('missing_google_key', 'Model API key is not configured.');
  return new DirectModelTransport(config);
}

export class DirectModelTransport implements ModelTransport {
  private readonly fetcher: FetchLike;
  constructor(private readonly config: ModelTransportConfig) { this.fetcher = config.fetcher ?? defaultFetch; }
  chat(request: ModelChatRequest): Promise<Response> {
    return requestWithRetry(this.fetcher, resolveChatEndpoint(this.config.endpoint ?? 'https://api.openai.com/v1/chat/completions'), request, { authorization: `Bearer ${this.config.apiKey}`, 'content-type': 'application/json' }, this.config, 'direct');
  }
}

export class DirectGoogleNativeTransport implements ModelTransport {
  private readonly fetcher: FetchLike;
  constructor(private readonly config: ModelTransportConfig) { this.fetcher = config.fetcher ?? defaultFetch; }
  chat(request: ModelChatRequest): Promise<Response> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
    return requestWithRetry(this.fetcher, url, toGeminiRequest(request), { 'x-goog-api-key': this.config.apiKey!, 'content-type': 'application/json' }, this.config, 'google', true);
  }
}

export class CloudflareAIGatewayTransport implements ModelTransport {
  private readonly fetcher: FetchLike;
  constructor(private readonly config: ModelTransportConfig) { this.fetcher = config.fetcher ?? defaultFetch; }
  chat(request: ModelChatRequest): Promise<Response> {
    const url = `${GATEWAY_ENDPOINT}/${encodeURIComponent(this.config.accountId!)}/ai/v1/chat/completions`;
    return requestWithRetry(this.fetcher, url, { ...request, model: `google-ai-studio/${request.model}` }, { authorization: `Bearer ${this.config.cloudflareToken}`, 'content-type': 'application/json' }, this.config, 'gateway');
  }
}

export class CloudflareGoogleNativeTransport implements ModelTransport {
  private readonly fetcher: FetchLike;
  constructor(private readonly config: ModelTransportConfig) { this.fetcher = config.fetcher ?? defaultFetch; }
  chat(request: ModelChatRequest): Promise<Response> {
    const url = `${GATEWAY_ENDPOINT.replace('/client/v4/accounts', '').replace('https://api.cloudflare.com', 'https://gateway.ai.cloudflare.com/v1')}/${encodeURIComponent(this.config.accountId!)}/default/google-ai-studio/v1/models/${encodeURIComponent(request.model)}:generateContent`;
    return requestWithRetry(this.fetcher, url, toGeminiRequest(request), { 'x-goog-api-key': this.config.apiKey!, 'cf-aig-authorization': `Bearer ${this.config.cloudflareAigToken}`, 'cf-aig-collect-log-payload': 'false', 'content-type': 'application/json' }, this.config, 'gateway', true);
  }
}

async function requestWithRetry(fetcher: FetchLike, url: string, request: unknown, headers: Record<string, string>, config: ModelTransportConfig, mode: 'direct' | 'gateway' | 'google', nativeResponse = false): Promise<Response> {
  const deadline = Date.now() + (config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let lastError: ModelTransportError | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const remaining = Math.max(1, deadline - Date.now());
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remaining);
    try {
      const response = await fetcher(url, { method: 'POST', headers, body: JSON.stringify(request), signal: controller.signal });
      if (!response.ok) {
        const providerMessage = await response.clone().text().catch(() => '');
        const safeMessage = safeProviderMessage(providerMessage);
        const error = new ModelTransportError(classifyStatus(response.status, safeMessage, mode), safeMessage, response.status, safeMessage);
        if (attempt < MAX_ATTEMPTS && isRetryableStatus(response.status) && Date.now() < deadline) { await boundedBackoff(config.retryBackoffMs ?? 100); continue; }
        throw error;
      }
      return nativeResponse ? adaptGeminiResponse(response) : response;
    } catch (error) {
      if (error instanceof ModelTransportError) { lastError = error; if (attempt < MAX_ATTEMPTS && isRetryableStatus(error.status ?? 0) && Date.now() < deadline) { await boundedBackoff(config.retryBackoffMs ?? 100); continue; } throw error; }
      const aborted = controller.signal.aborted;
      lastError = new ModelTransportError(aborted ? (mode === 'google' ? 'provider_timeout' : 'gateway_timeout') : 'transport_error', aborted ? 'Model transport timed out.' : 'Model transport failed.');
      if (attempt < MAX_ATTEMPTS && aborted && Date.now() < deadline) { await boundedBackoff(config.retryBackoffMs ?? 100); continue; }
      throw lastError;
    } finally { clearTimeout(timeout); }
  }
  throw lastError ?? new ModelTransportError(mode === 'gateway' ? 'transport_error' : 'transport_error', 'Model transport failed.');
}

function toGeminiRequest(request: ModelChatRequest): object {
  const systemMessages = request.messages.filter(message => message.role === 'system');
  const contents = request.messages.filter(message => message.role !== 'system').map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }));
  const responseFormat = request.response_format as { type?: string; json_schema?: { schema?: unknown } } | undefined;
  const generationConfig: Record<string, unknown> = {};
  if (responseFormat?.type === 'json_schema') {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseJsonSchema = responseFormat.json_schema?.schema;
  } else if (responseFormat?.type === 'json_object') {
    generationConfig.responseMimeType = 'application/json';
  }
  return {
    ...(systemMessages.length ? { systemInstruction: { parts: systemMessages.map(message => ({ text: message.content })) } } : {}),
    contents,
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };
}

async function adaptGeminiResponse(response: Response): Promise<Response> {
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new ModelTransportError('model_contract_error', 'Provider returned invalid JSON.', response.status); }
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }> } | null)?.candidates;
  const text = candidates?.flatMap(candidate => candidate.content?.parts ?? []).filter(part => part.thought !== true && typeof part.text === 'string').map(part => part.text as string).join('') ?? '';
  if (!text.trim()) throw new ModelTransportError('model_contract_error', 'Provider returned no normal text content.', response.status);
  return Response.json({ choices: [{ message: { role: 'assistant', content: text } }] }, { status: response.status, headers: { 'content-type': 'application/json' } });
}

function defaultFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> { return globalThis.fetch(input, init); }
function resolveChatEndpoint(endpoint: string): string { const url = new URL(endpoint); if (!url.pathname.endsWith('/chat/completions')) url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`; return url.toString(); }
function isRetryableStatus(status: number): boolean { return status === 429 || (status >= 500 && status <= 504); }
function classifyStatus(status: number, message = '', mode: 'direct' | 'gateway' | 'google' = 'direct'): ModelTransportFailure { const google = mode === 'google'; if (status === 401 || status === 403) return google ? 'google_auth_error' : 'gateway_auth_error'; if (status === 429) return google ? 'provider_rate_limited' : 'gateway_rate_limited'; if (status >= 500 && status <= 504) return google ? 'provider_unavailable' : 'gateway_provider_unavailable'; if (status >= 400 && status < 500 && /schema|response[_ -]?format|structured|json_schema/i.test(message)) return 'structured_output_rejected'; if (status >= 400 && status < 500) return 'gateway_invalid_request'; return 'transport_error'; }
function boundedBackoff(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, Math.min(Math.max(ms, 0), 500))); }
function safeProviderMessage(text: string): string { try { const payload = JSON.parse(text) as { error?: { message?: unknown } }; if (typeof payload.error?.message === 'string') return redact(payload.error.message); } catch { /* bounded fallback */ } return redact(text) || 'Provider returned an error.'; }
function redact(value: string): string { return value.replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]').replace(/https?:\/\/[^\s)]+/gi, '[url redacted]').replace(/\s+/g, ' ').trim().slice(0, 500); }
