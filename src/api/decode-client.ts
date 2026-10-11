import type { DecodeRequest, DecodeResponse } from '../../shared/contracts/decode';
import { assertDecodeResponse } from '../../shared/schemas/decode';
import { FixtureProvider } from '../../worker/providers/fixture-provider';

export class DecodeClientError extends Error {}

export function resolveDecodeEndpoint(): string {
  const configuredBase = import.meta.env.VITE_DECODE_API_BASE_URL?.trim();
  if (!configuredBase) return '/api/decode';

  let parsed: URL;
  try { parsed = new URL(configuredBase); }
  catch { throw new DecodeClientError('The decode service address is invalid.'); }

  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (
    (parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) ||
    parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash
  ) {
    throw new DecodeClientError('The decode service address must be an HTTPS origin (or local HTTP origin).');
  }
  return `${parsed.origin}/api/decode`;
}

export async function decodeContext(request: DecodeRequest): Promise<DecodeResponse> {
  // The public GitHub Pages demo deliberately remains network-free.
  if (import.meta.env.VITE_DEMO_MODE === 'fixture') return new FixtureProvider().decode(request);

  const endpoint = resolveDecodeEndpoint();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch { throw new DecodeClientError('The decode service is unavailable.'); }

  let body: unknown;
  try { body = await response.json(); }
  catch { throw new DecodeClientError('The decode service returned invalid JSON.'); }

  let decoded: DecodeResponse;
  try { decoded = assertDecodeResponse(body); }
  catch { throw new DecodeClientError('The decode service returned an invalid response.'); }

  // A failed response is valid application data even when the Worker uses HTTP 4xx/5xx.
  // A successful decode on a non-success HTTP status, however, is a broken API contract.
  if (!response.ok && decoded.type !== 'failed') {
    throw new DecodeClientError('The decode service returned an unexpected status.');
  }
  return decoded;
}
