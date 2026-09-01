import { assertDecodeResponse, parseDecodeRequest } from '../../shared/schemas/decode';
import type { DecodeResponse, FailureDiagnosticCode } from '../../shared/contracts/decode';
import { FixtureProvider } from '../providers/fixture-provider';
import type { ContextAnalysis } from '../../shared/contracts/context';
import type { ContextEngine } from '../engine/context-engine';
import { AIContextEngine, MockContextEngine } from '../engine/context-engine';
import { ContextProviderError, ModelContextProvider } from '../providers/context-provider';
import { AIContextGateEngine, ContextGateError, MockContextGateEngine } from '../engine/context-gate';
import { createModelTransport, ModelTransportError, type ModelTransport } from '../providers/model-transport';

export type WorkerEnv = {
  CONTEXT_ENGINE_MODE?: string;
  MODEL_API_KEY?: string;
  MODEL_API_URL?: string;
  MODEL_NAME?: string;
  MODEL_TRANSPORT?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_AIG_TOKEN?: string;
};

const DECODE_TIMEOUT_MS = 65_000;
const MAX_INPUT_LENGTH = 4_000;
const MAX_CONTEXT_LENGTH = 12_000;

export async function handleDecode(request: Request, env: WorkerEnv = {}): Promise<Response> {
  const requestId = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const started = Date.now();
  let body: unknown;
  try { body = await request.json(); } catch { return failure({ type: 'failed', errorCode: 'invalid_request', message: 'Request body must be valid JSON.', diagnosticCode: 'invalid_request' }, 400, 'invalid_request', requestId, env, started); }
  try {
    const request = parseDecodeRequest(body);
    if (request.inputText.length > MAX_INPUT_LENGTH) throw new Error('inputText exceeds the maximum length.');
    if (request.additionalContext && request.additionalContext.length > MAX_CONTEXT_LENGTH) throw new Error('additionalContext exceeds the maximum length.');
    const transport = env.CONTEXT_ENGINE_MODE === 'ai' ? createTransport(env) : undefined;
    const gateEngine = env.CONTEXT_ENGINE_MODE === 'ai'
      ? new AIContextGateEngine({ apiKey: env.MODEL_API_KEY, endpoint: env.MODEL_API_URL, model: env.MODEL_NAME, transport })
      : new MockContextGateEngine();
    const gateResult = await withDecodeBudget(gateEngine.checkContext(request.inputText, request.additionalContext));
    if (gateResult.status === 'needs_context') {
      return json({ type: 'needs_context', originalMoment: request.inputText, reason: 'ambiguous_phrase', question: gateResult.question ?? 'What was said immediately before this?', missingContext: gateResult.missingInformation ?? 'The meaning is ambiguous without the surrounding exchange.' }, 200);
    }
    const contextEngine = createContextEngine(env, transport);
    if (env.CONTEXT_ENGINE_MODE === 'ai') {
      const contextAnalysis = await withDecodeBudget(contextEngine.analyze(request.inputText, request.additionalContext));
      if (!contextAnalysis) throw new Error('AI context engine returned no analysis.');
      return json(toDecodedResponse(request.inputText, contextAnalysis), 200);
    }
    const contextAnalysis = await withDecodeBudget(contextEngine.analyze(request.inputText, request.additionalContext));
    const decoded = assertDecodeResponse(new FixtureProvider().decode(request));
    if (decoded.type !== 'decoded') return json(decoded, 200);
    return json(assertDecodeResponse(contextAnalysis ? { ...decoded, contextAnalysis } : decoded), 200);
  } catch (error) {
    if (error instanceof ContextProviderError) { const diagnosticCode = providerDiagnosticCode(error); return failure({ type: 'failed', errorCode: error.code === 'hallucinated_evidence' || error.code === 'invalid_evidence_reference' ? 'model_unavailable' : error.code, message: error.code === 'hallucinated_evidence' || error.code === 'invalid_evidence_reference' ? 'We could not verify the model explanation.' : error.message, ...(diagnosticCode ? { diagnosticCode } : {}) }, 502, diagnosticCode ?? 'unknown_502', requestId, env, started); }
    if (error instanceof ContextGateError) { const diagnosticCode = gateDiagnosticCode(error); return failure({ type: 'failed', errorCode: contextGateErrorCode(error), message: error.stage === 'missing_api_key' ? 'Context model API key is not configured.' : 'Context gate is unavailable.', ...(diagnosticCode ? { diagnosticCode } : {}) }, 502, diagnosticCode ?? 'unknown_502', requestId, env, started); }
    if (error instanceof ModelTransportError) { const diagnosticCode = transportDiagnosticCode(error); return failure({ type: 'failed', errorCode: 'model_unavailable', message: 'Context model is unavailable.', diagnosticCode }, 502, diagnosticCode, requestId, env, started); }
    return failure({ type: 'failed', errorCode: 'invalid_request', message: error instanceof Error ? error.message : 'Invalid decode request.', diagnosticCode: 'invalid_request' }, 400, 'invalid_request', requestId, env, started);
  }
}

function contextGateErrorCode(error: ContextGateError): 'context_timeout' | 'context_invalid_json' | 'context_schema_invalid' | 'missing_api_key' | 'model_unavailable' {
  if (error.stage === 'missing_api_key') return 'missing_api_key';
  if (error.stage === 'timeout') return 'context_timeout';
  if (error.stage === 'invalid_json') return 'context_invalid_json';
  if (error.stage === 'invalid_contract') return 'context_schema_invalid';
  return 'model_unavailable';
}

function providerDiagnosticCode(error: ContextProviderError): FailureDiagnosticCode | undefined {
  if (error.code === 'context_timeout') return 'provider_timeout';
  if (error.code === 'context_invalid_json' || error.code === 'context_schema_invalid') return 'model_contract_error';
  if (error.code === 'invalid_evidence_reference' || error.code === 'hallucinated_evidence') return 'model_contract_error';
  const diagnostics = error.diagnostics;
  if (diagnostics?.status !== undefined && diagnostics.status !== null) return statusDiagnosticCode(diagnostics.status, diagnostics.providerMessage);
  if (diagnostics?.stage === 'timeout') return 'provider_timeout';
  if (diagnostics?.stage === 'fetch_error') return 'transport_error';
  return undefined;
}

function gateDiagnosticCode(error: ContextGateError): FailureDiagnosticCode | undefined {
  if (error.stage === 'timeout') return 'provider_timeout';
  if (error.stage === 'transport') return 'transport_error';
  if (error.stage === 'invalid_json' || error.stage === 'invalid_contract') return 'model_contract_error';
  if (error.stage === 'http_error') return statusDiagnosticCode(error.status ?? 502, error.providerMessage);
  return undefined;
}

function transportDiagnosticCode(error: ModelTransportError): FailureDiagnosticCode {
  if (error.category === 'gateway_auth_error') return 'gateway_auth_error';
  if (error.category === 'gateway_rate_limited') return 'gateway_rate_limited';
  if (error.category === 'gateway_provider_unavailable') return 'gateway_provider_unavailable';
  if (error.category === 'gateway_timeout') return 'provider_timeout';
  if (error.category === 'gateway_invalid_request') return statusDiagnosticCode(error.status ?? 400, error.providerMessage);
  return 'transport_error';
}

function statusDiagnosticCode(status: number, providerMessage?: string): FailureDiagnosticCode {
  if (status === 401 || status === 403) return 'gateway_auth_error';
  if (status === 429) return 'gateway_rate_limited';
  if (status >= 500 && status <= 504) return 'gateway_provider_unavailable';
  if (status >= 400 && status < 500) {
    if (providerMessage && /schema|response[_ -]?format|structured|json_schema/i.test(providerMessage)) return 'structured_output_rejected';
    return 'gateway_invalid_request';
  }
  return 'unknown_502';
}

function json(value: DecodeResponse, status: number): Response { return Response.json(value, { status }); }

function failure(value: DecodeResponse, status: number, diagnosticCode: FailureDiagnosticCode, requestId: string, env: WorkerEnv, started: number): Response {
  const response = { ...value, requestId } as DecodeResponse;
  console.error(JSON.stringify({ event: 'decode_failure', requestId, stage: failureStage(value), diagnosticCode, httpStatus: status, transportMode: env.MODEL_TRANSPORT ?? 'fixture', model: env.MODEL_NAME ?? null, latencyMs: Date.now() - started }));
  return json(response, status);
}

function failureStage(value: DecodeResponse): string {
  if (value.type !== 'failed') return 'unknown';
  if (value.diagnosticCode === 'invalid_request') return 'request_validation';
  if (value.diagnosticCode === 'model_contract_error') return 'model_contract';
  return 'model_transport';
}

function createContextEngine(env: WorkerEnv, transport?: ModelTransport): ContextEngine {
  if (env.CONTEXT_ENGINE_MODE === 'ai') {
    return new AIContextEngine(new ModelContextProvider({
      apiKey: env.MODEL_API_KEY,
      endpoint: env.MODEL_API_URL,
      model: env.MODEL_NAME,
      transport,
    }));
  }
  return new MockContextEngine();
}

function createTransport(env: WorkerEnv): ModelTransport | undefined {
  const mode = env.MODEL_TRANSPORT === 'cloudflare_google_openai_passthrough' ? 'cloudflare_google_openai_passthrough' : env.MODEL_TRANSPORT === 'cloudflare_ai_gateway' ? 'cloudflare_ai_gateway' : 'direct';
  if (env.MODEL_TRANSPORT && !['direct', 'cloudflare_ai_gateway', 'cloudflare_google_openai_passthrough'].includes(env.MODEL_TRANSPORT)) throw new ModelTransportError('transport_error', 'Invalid model transport mode.');
  if (mode === 'direct' && !env.MODEL_API_KEY) return undefined;
  return createModelTransport({ mode, apiKey: env.MODEL_API_KEY, endpoint: env.MODEL_API_URL, model: env.MODEL_NAME, accountId: env.CLOUDFLARE_ACCOUNT_ID, cloudflareToken: env.CLOUDFLARE_API_TOKEN, cloudflareAigToken: env.CLOUDFLARE_AIG_TOKEN });
}

async function withDecodeBudget<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new ContextGateError('timeout', 'Decode request timed out.')), DECODE_TIMEOUT_MS); })]);
  } finally { if (timer) clearTimeout(timer); }
}

function toDecodedResponse(originalMoment: string, analysis: ContextAnalysis): DecodeResponse {
  return {
    type: 'decoded',
    originalMoment,
    snapshot: analysis.contextualMeaning,
    signals: analysis.signals.map((signal, index) => ({ id: `context-signal-${index + 1}`, quote: signal.evidenceQuote, explanation: signal.explanation, category: signalCategory(signal.signalType) })),
    usageBoundary: { natural: analysis.usageBoundary.naturalIn, depends: analysis.usageBoundary.beCarefulIn, avoid: analysis.usageBoundary.avoidIn },
    confidence: analysis.confidence,
    contextAnalysis: analysis,
  };
}

function signalCategory(signalType: ContextAnalysis['signals'][number]['signalType']): 'community_norm' | 'irony' | 'dry_humor' | 'literal' | 'tone' {
  if (signalType === 'community_norm' || signalType === 'timing') return 'community_norm';
  if (signalType === 'irony') return 'irony';
  if (signalType === 'wording') return 'literal';
  return 'tone';
}
