import type { ContextAnalysis } from '../../shared/contracts/context';
import { assertContextAnalysis } from '../../shared/schemas/context';
import { validateContextEvidence } from '../../shared/schemas/context-evidence';
import { buildEvidenceCatalog } from '../../shared/context/evidence-catalog';
import { resolveContextEvidence } from '../../shared/context/evidence-resolver';
import { assertModelContextAnalysis } from '../../shared/schemas/model-context';
import { buildContextAnalysisPrompt } from '../prompts/context-analysis';
import { createModelTransport, ModelTransportError, type ModelTransport, type FetchLike as TransportFetchLike } from './model-transport';

export type ContextProviderErrorCode = 'context_timeout' | 'context_invalid_json' | 'context_schema_invalid' | 'invalid_evidence_reference' | 'hallucinated_evidence' | 'missing_api_key' | 'model_unavailable';
export type ContextProviderFailureStage = 'env_loading' | 'request_construction' | 'fetch_error' | 'timeout' | 'http_error' | 'api_envelope_error' | 'missing_content' | 'model_json_error' | 'model_context_schema_error' | 'context_schema_error' | 'evidence_reference_error' | 'evidence_grounding_error';

export type ContextProviderDiagnostics = {
  stage: ContextProviderFailureStage | 'response_received';
  status: number | null;
  contentType: string | null;
  elapsedMs: number;
  assistantContentReached: boolean;
  envelopeParsed: boolean;
  providerMessage?: string;
  errorName?: string;
  errorMessage?: string;
  errorCode?: string;
  causeName?: string;
  causeCode?: string;
  causeMessage?: string;
  evidenceTotal?: number;
  evidenceExactMatches?: number;
  evidenceInvalid?: number;
  aborted?: boolean;
  signalAborted?: boolean;
};

export class ContextProviderError extends Error {
  constructor(public readonly code: ContextProviderErrorCode, message: string, public readonly diagnostics?: ContextProviderDiagnostics) {
    super(message);
    this.name = 'ContextProviderError';
  }
}

export interface ContextModelProvider {
  analyzeContext(input: string, additionalContext?: string): Promise<ContextAnalysis>;
}

export type FetchLike = TransportFetchLike;

export type ContextModelProviderConfig = {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  timeoutMs?: number;
  fetcher?: FetchLike;
  responseFormat?: boolean;
  transport?: ModelTransport;
};

type ModelResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

type ProviderContentResult = ContextProviderDiagnostics & { content: string };

export class ModelContextProvider implements ContextModelProvider {
  private readonly transport?: ModelTransport;

  constructor(private readonly config: ContextModelProviderConfig) {
    this.transport = config.transport ?? (config.apiKey ? createModelTransport({ mode: 'direct', apiKey: config.apiKey, endpoint: config.endpoint, model: config.model, timeoutMs: config.timeoutMs, fetcher: config.fetcher }) : undefined);
  }

  async diagnoseMinimal(): Promise<ContextProviderDiagnostics> {
    const result = await this.requestContent('You are a connectivity test.', 'Reply with exactly: ok', false);
    return {
      stage: result.stage,
      status: result.status,
      contentType: result.contentType,
      elapsedMs: result.elapsedMs,
      assistantContentReached: result.assistantContentReached,
      envelopeParsed: result.envelopeParsed,
    };
  }

  async analyzeContext(input: string, additionalContext?: string): Promise<ContextAnalysis> {
    if (!this.config.apiKey && !this.config.transport) throw new ContextProviderError('missing_api_key', 'Context model API key is not configured.');
    try {
      const evidenceCatalog = buildEvidenceCatalog(input, additionalContext);
      const prompt = buildContextAnalysisPrompt(input, additionalContext, evidenceCatalog);
      const result = await this.requestContent(prompt.system, prompt.user, this.config.responseFormat !== false);
      let parsed: unknown;
      try { parsed = JSON.parse(result.content) as unknown; } catch { throw new ContextProviderError('context_invalid_json', 'Context model returned invalid JSON.', { ...result, stage: 'model_json_error' }); }
      let modelAnalysis;
      try { modelAnalysis = assertModelContextAnalysis(parsed); } catch { throw new ContextProviderError('context_schema_invalid', 'Context model returned an invalid context schema.', { ...result, stage: 'model_context_schema_error' }); }
      const resolved = resolveContextEvidence(modelAnalysis, evidenceCatalog);
      if (!resolved.valid || !resolved.analysis) throw new ContextProviderError('invalid_evidence_reference', 'Context model returned an invalid evidence reference.', { ...result, stage: 'evidence_reference_error', evidenceTotal: resolved.total, evidenceExactMatches: resolved.validRefs, evidenceInvalid: resolved.invalid.length });
      let analysis: ContextAnalysis;
      try { analysis = assertContextAnalysis(resolved.analysis); } catch { throw new ContextProviderError('context_schema_invalid', 'Resolved context analysis has an invalid schema.', { ...result, stage: 'context_schema_error' }); }
      const grounding = validateContextEvidence(analysis, [input, additionalContext ?? ''].filter(Boolean).join('\n'));
      if (!grounding.valid) throw new ContextProviderError('hallucinated_evidence', 'Context model returned unsupported evidence.', { ...result, stage: 'evidence_grounding_error', evidenceTotal: grounding.total, evidenceExactMatches: grounding.exactMatches, evidenceInvalid: grounding.invalid.length });
      return analysis;
    } catch (error) {
      if (error instanceof ContextProviderError) throw error;
      throw new ContextProviderError('model_unavailable', 'Context model is unavailable.', { stage: 'request_construction', status: null, contentType: null, elapsedMs: 0, assistantContentReached: false, envelopeParsed: false });
    }
  }

  private async requestContent(system: string, user: string, includeResponseFormat: boolean): Promise<ProviderContentResult> {
    if (!this.config.apiKey && !this.config.transport) throw new ContextProviderError('missing_api_key', 'Context model API key is not configured.', { stage: 'env_loading', status: null, contentType: null, elapsedMs: 0, assistantContentReached: false, envelopeParsed: false });
    const started = Date.now();
    const baseDiagnostics = (stage: ContextProviderDiagnostics['stage'], status: number | null, contentType: string | null, extra: Partial<ContextProviderDiagnostics> = {}): ContextProviderDiagnostics => ({ stage, status, contentType, elapsedMs: Date.now() - started, assistantContentReached: false, envelopeParsed: false, aborted: false, signalAborted: false, ...extra });
    try {
      const requestBody = {
        model: this.config.model ?? 'gpt-4o-mini',
        temperature: 0,
        ...(includeResponseFormat ? { response_format: { type: 'json_object' as const } } : {}),
        messages: [{ role: 'system' as const, content: system }, { role: 'user' as const, content: user }],
      };
      const response = await this.transport!.chat(requestBody);
      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        throw new ContextProviderError('model_unavailable', 'Context model is unavailable.', { ...baseDiagnostics('http_error', response.status, contentType), providerMessage: safeProviderMessage(responseText) });
      }
      let payload: unknown;
      try { payload = await response.json() as unknown; } catch { throw new ContextProviderError('context_invalid_json', 'Context model returned invalid JSON.', baseDiagnostics('api_envelope_error', response.status, contentType)); }
      const content = extractContent(payload);
      if (!content) throw new ContextProviderError('context_invalid_json', 'Context model returned no JSON content.', baseDiagnostics('missing_content', response.status, contentType, { envelopeParsed: true }));
      return { ...baseDiagnostics('response_received', response.status, contentType, { envelopeParsed: true, assistantContentReached: true }), content };
    } catch (error) {
      if (error instanceof ContextProviderError) throw error;
      if (error instanceof ModelTransportError) {
        if (error.category === 'gateway_timeout' || error.category === 'provider_timeout') throw new ContextProviderError('context_timeout', 'Context model request timed out.', baseDiagnostics('timeout', error.status ?? null, null, { errorName: error.name, errorMessage: error.message, providerMessage: error.providerMessage }));
        throw new ContextProviderError('model_unavailable', 'Context model is unavailable.', baseDiagnostics('http_error', error.status ?? null, null, { errorName: error.name, errorMessage: error.message, providerMessage: error.providerMessage }));
      }
      const exception = describeFetchError(error, false);
      if (exception.aborted) throw new ContextProviderError('context_timeout', 'Context model request timed out.', baseDiagnostics('timeout', null, null, exception));
      throw new ContextProviderError('model_unavailable', 'Context model is unavailable.', baseDiagnostics('fetch_error', null, null, exception));
    }
  }
}

function extractContent(payload: unknown): string {
  if (!payload || typeof payload !== 'object') throw new ContextProviderError('context_invalid_json', 'Context model returned an invalid response.');
  const response = payload as ModelResponse;
  const content = response.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}

function safeProviderMessage(responseText: string): string {
  try {
    const payload = JSON.parse(responseText) as { error?: { type?: unknown; message?: unknown } };
    const message = payload.error?.message;
    if (typeof message === 'string') return redactDiagnosticText(message);
  } catch { /* Use bounded text below. */ }
  return redactDiagnosticText(responseText) || 'Provider returned an error.';
}

function redactDiagnosticText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/https?:\/\/[^\s)]+/gi, '[url redacted]')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[address redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function describeFetchError(error: unknown, signalAborted: boolean): Pick<ContextProviderDiagnostics, 'errorName' | 'errorMessage' | 'errorCode' | 'causeName' | 'causeCode' | 'causeMessage' | 'aborted' | 'signalAborted'> {
  const value = error as { name?: unknown; message?: unknown; code?: unknown; cause?: { name?: unknown; message?: unknown; code?: unknown } };
  const cause = value.cause;
  const errorName = typeof value.name === 'string' ? value.name : 'Error';
  const errorMessage = typeof value.message === 'string' ? redactDiagnosticText(value.message) : 'Provider fetch failed.';
  const errorCode = typeof value.code === 'string' ? value.code : undefined;
  const causeName = cause && typeof cause.name === 'string' ? cause.name : undefined;
  const causeCode = cause && typeof cause.code === 'string' ? cause.code : undefined;
  const causeMessage = cause && typeof cause.message === 'string' ? redactDiagnosticText(cause.message) : undefined;
  return { errorName, errorMessage, errorCode, causeName, causeCode, causeMessage, aborted: signalAborted || errorName === 'AbortError', signalAborted };
}
