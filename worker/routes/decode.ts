import { assertDecodeResponse, parseDecodeRequest } from '../../shared/schemas/decode';
import type { DecodeResponse } from '../../shared/contracts/decode';
import { FixtureProvider } from '../providers/fixture-provider';

const provider = new FixtureProvider();

export async function handleDecode(request: Request): Promise<Response> {
  let body: unknown;
  try { body = await request.json(); } catch { return json({ type: 'failed', errorCode: 'invalid_request', message: 'Request body must be valid JSON.' }, 400); }
  try {
    const decoded = assertDecodeResponse(provider.decode(parseDecodeRequest(body)));
    return json(decoded, 200);
  } catch (error) {
    return json({ type: 'failed', errorCode: 'invalid_request', message: error instanceof Error ? error.message : 'Invalid decode request.' }, 400);
  }
}

function json(value: DecodeResponse, status: number): Response { return Response.json(value, { status }); }
