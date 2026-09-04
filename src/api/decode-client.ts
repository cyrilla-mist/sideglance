import type { DecodeRequest, DecodeResponse } from '../../shared/contracts/decode';
import { assertDecodeResponse } from '../../shared/schemas/decode';
import { FixtureProvider } from '../../worker/providers/fixture-provider';

export class DecodeClientError extends Error {}

export async function decodeContext(request: DecodeRequest): Promise<DecodeResponse> {
  if (import.meta.env.VITE_DEMO_MODE === 'fixture') return new FixtureProvider().decode(request);
  let response: Response;
  try { response = await fetch('/api/decode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) }); }
  catch { throw new DecodeClientError('The decode service is unavailable.'); }
  let body: unknown;
  try { body = await response.json(); } catch { throw new DecodeClientError('The decode service returned invalid JSON.'); }
  try { return assertDecodeResponse(body); }
  catch { throw new DecodeClientError(response.ok ? 'The decode service returned an invalid response.' : 'The decode request failed.'); }
}
