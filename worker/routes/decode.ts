import { assertDecodeResponse, parseDecodeRequest } from '../../shared/schemas/decode';
import type { DecodeResponse } from '../../shared/contracts/decode';
import { FixtureProvider } from '../providers/fixture-provider';
import type { ContextAnalysis } from '../../shared/contracts/context';
import type { ContextEngine } from '../engine/context-engine';
import { AIContextEngine, MockContextEngine } from '../engine/context-engine';
import { ContextProviderError, ModelContextProvider } from '../providers/context-provider';
import { AIContextGateEngine, ContextGateError, MockContextGateEngine } from '../engine/context-gate';

export type WorkerEnv = {
  CONTEXT_ENGINE_MODE?: string;
  MODEL_API_KEY?: string;
  MODEL_API_URL?: string;
  MODEL_NAME?: string;
};

export async function handleDecode(request: Request, env: WorkerEnv = {}): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ type: 'failed', errorCode: 'invalid_request', message: 'Request body must be valid JSON.' }, 400); }
  try {
    const request = parseDecodeRequest(body);
    const gateEngine = env.CONTEXT_ENGINE_MODE === 'ai'
      ? new AIContextGateEngine({ apiKey: env.MODEL_API_KEY, endpoint: env.MODEL_API_URL, model: env.MODEL_NAME })
      : new MockContextGateEngine();
    const gateResult = await gateEngine.checkContext(request.inputText, request.additionalContext);
    if (gateResult.status === 'needs_context') {
      return json({ type: 'needs_context', originalMoment: request.inputText, reason: 'ambiguous_phrase', question: gateResult.question ?? 'What was said immediately before this?', missingContext: gateResult.missingInformation ?? 'The meaning is ambiguous without the surrounding exchange.' }, 200);
    }
    const contextEngine = createContextEngine(env);
    if (env.CONTEXT_ENGINE_MODE === 'ai') {
      const contextAnalysis = await contextEngine.analyze(request.inputText, request.additionalContext);
      if (!contextAnalysis) throw new Error('AI context engine returned no analysis.');
      return json(toDecodedResponse(request.inputText, contextAnalysis), 200);
    }
    const contextAnalysis = await contextEngine.analyze(request.inputText, request.additionalContext);
    const decoded = assertDecodeResponse(new FixtureProvider().decode(request));
    if (decoded.type !== 'decoded') return json(decoded, 200);
    return json(assertDecodeResponse(contextAnalysis ? { ...decoded, contextAnalysis } : decoded), 200);
  } catch (error) {
    if (error instanceof ContextProviderError) return json({ type: 'failed', errorCode: error.code === 'hallucinated_evidence' ? 'model_unavailable' : error.code, message: error.code === 'hallucinated_evidence' ? 'We could not verify the model explanation.' : error.message }, 502);
    if (error instanceof ContextGateError) return json({ type: 'failed', errorCode: contextGateErrorCode(error), message: error.stage === 'missing_api_key' ? 'Context model API key is not configured.' : 'Context gate is unavailable.' }, 502);
    return json({ type: 'failed', errorCode: 'invalid_request', message: error instanceof Error ? error.message : 'Invalid decode request.' }, 400);
  }
}

function contextGateErrorCode(error: ContextGateError): 'context_timeout' | 'context_invalid_json' | 'context_schema_invalid' | 'missing_api_key' | 'model_unavailable' {
  if (error.stage === 'missing_api_key') return 'missing_api_key';
  if (error.stage === 'timeout') return 'context_timeout';
  if (error.stage === 'invalid_json') return 'context_invalid_json';
  if (error.stage === 'invalid_contract') return 'context_schema_invalid';
  return 'model_unavailable';
}

function json(value: DecodeResponse, status: number): Response { return Response.json(value, { status }); }

function createContextEngine(env: WorkerEnv): ContextEngine {
  if (env.CONTEXT_ENGINE_MODE === 'ai') {
    return new AIContextEngine(new ModelContextProvider({
      apiKey: env.MODEL_API_KEY,
      endpoint: env.MODEL_API_URL,
      model: env.MODEL_NAME,
    }));
  }
  return new MockContextEngine();
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
