import { assertDecodeResponse, parseDecodeRequest } from '../../shared/schemas/decode';
import type { DecodeResponse } from '../../shared/contracts/decode';
import { FixtureProvider } from '../providers/fixture-provider';
import type { ContextEngine } from '../engine/context-engine';
import { MockContextEngine } from '../engine/context-engine';

const provider = new FixtureProvider();
const contextEngine: ContextEngine = new MockContextEngine();

export async function handleDecode(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ type: 'failed', errorCode: 'invalid_request', message: 'Request body must be valid JSON.' }, 400); }
  try {
    const request = parseDecodeRequest(body);
    const contextAnalysis = contextEngine.analyze(request.inputText, request.additionalContext);
    const decoded = assertDecodeResponse(provider.decode(request));
    if (decoded.type !== 'decoded') return json(decoded, 200);
    return json(assertDecodeResponse(contextAnalysis ? { ...decoded, contextAnalysis } : decoded), 200);
  } catch (error) {
    return json({ type: 'failed', errorCode: 'invalid_request', message: error instanceof Error ? error.message : 'Invalid decode request.' }, 400);
  }
}

function json(value: DecodeResponse, status: number): Response { return Response.json(value, { status }); }
