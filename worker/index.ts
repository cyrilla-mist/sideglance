import { HEALTH_PATH, healthResponse } from '../shared/contracts/health';
import { handleDecode, type WorkerEnv } from './routes/decode';

/**
 * Browser CORS is deliberately opt-in. The trusted site is configured in the
 * Worker environment, never inferred from a request's untrusted Origin header.
 * CORS is NOT authentication or rate limiting; see docs/sg-r01-live-decode.md.
 */
function isTrustedBrowserOrigin(origin: string, env: WorkerEnv): boolean {
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(origin);
}

function withBrowserCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv = {}): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === HEALTH_PATH) {
      return Response.json(healthResponse());
    }
    if (url.pathname === '/api/decode') {
      const origin = request.headers.get('Origin');
      // Block unapproved browser origins before any model or context work.
      // Requests with no Origin remain available to explicit server-side smoke tools.
      if (origin && !isTrustedBrowserOrigin(origin, env)) {
        return Response.json({ error: 'Origin not allowed.' }, { status: 403 });
      }
      if (request.method === 'OPTIONS') {
        if (!origin) return Response.json({ error: 'Origin required.' }, { status: 400 });
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'content-type',
            'Access-Control-Max-Age': '600',
            Vary: 'Origin',
          },
        });
      }
      if (request.method === 'POST') {
        return withBrowserCors(await handleDecode(request, env), origin);
      }
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
