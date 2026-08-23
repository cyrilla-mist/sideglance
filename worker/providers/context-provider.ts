import type { ContextAnalysis } from '../../shared/contracts/context';
import { assertContextAnalysis } from '../../shared/schemas/context';
import { buildContextAnalysisPrompt } from '../prompts/context-analysis';

export type ContextProviderErrorCode = 'context_timeout' | 'context_invalid_json' | 'context_schema_invalid' | 'missing_api_key' | 'model_unavailable';

export class ContextProviderError extends Error {
  constructor(public readonly code: ContextProviderErrorCode, message: string) {
    super(message);
    this.name = 'ContextProviderError';
  }
}

export interface ContextModelProvider {
  analyzeContext(input: string, additionalContext?: string): Promise<ContextAnalysis>;
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;

export type ContextModelProviderConfig = {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  fetcher?: FetchLike;
};

type ModelResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export class ModelContextProvider implements ContextModelProvider {
  private readonly fetcher: FetchLike;

  constructor(private readonly config: ContextModelProviderConfig) {
    this.fetcher = config.fetcher ?? defaultFetch;
  }

  async analyzeContext(input: string, additionalContext?: string): Promise<ContextAnalysis> {
    if (!this.config.apiKey) throw new ContextProviderError('missing_api_key', 'Context model API key is not configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS);
    try {
      const prompt = buildContextAnalysisPrompt(input, additionalContext);
      const requestUrl = resolveChatCompletionsEndpoint(this.config.endpoint ?? 'https://api.openai.com/v1/chat/completions');
      const requestBody = {
        model: this.config.model ?? 'gpt-4o-mini',
        temperature: 0,
        response_format: { type: 'json_object' as const },
        messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }],
      };
      const response = await this.fetcher(requestUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ContextProviderError('model_unavailable', 'Context model is unavailable.');
      }
      let payload: unknown;
      try { payload = await response.json() as unknown; } catch { throw new ContextProviderError('context_invalid_json', 'Context model returned invalid JSON.'); }
      const content = extractContent(payload);
      let parsed: unknown;
      try { parsed = JSON.parse(content) as unknown; } catch { throw new ContextProviderError('context_invalid_json', 'Context model returned invalid JSON.'); }
      try { return assertContextAnalysis(parsed); } catch { throw new ContextProviderError('context_schema_invalid', 'Context model returned an invalid context schema.'); }
    } catch (error) {
      if (error instanceof ContextProviderError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') throw new ContextProviderError('context_timeout', 'Context model request timed out.');
      throw new ContextProviderError('model_unavailable', 'Context model is unavailable.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

function resolveChatCompletionsEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.pathname.endsWith('/chat/completions')) return url.toString();
  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
  return url.toString();
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') throw new ContextProviderError('context_invalid_json', 'Context model returned an invalid response.');
  const response = payload as ModelResponse;
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new ContextProviderError('context_invalid_json', 'Context model returned no JSON content.');
  return content;
}
