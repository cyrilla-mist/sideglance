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
        if (env.CONTEXT_ENGINE_MODE === 'ai') {
          // Operator-only until public identity, budgeting, and abuse protection are designed.
          // CORS cannot prevent scripts from calling the Worker with no Origin header.
          if (!env.AI_ACCESS_TOKEN || !env.AI_RATE_LIMITER) {
            return withBrowserCors(Response.json({ error: 'Live Decode is not configured.' }, { status: 503 }), origin);
          }
          if (request.headers.get('Authorization') !== `Bearer ${env.AI_ACCESS_TOKEN}`) {
            return withBrowserCors(Response.json({ error: 'Authorization required.' }, { status: 401 }), origin);
          }
          let allowed = false;
          try {
            const result = await env.AI_RATE_LIMITER.limit({ key: 'sideglance:operator-decode' });
            allowed = result.success === true;
          } catch {
            // Fail closed if Cloudflare's limit binding is unavailable.
            return withBrowserCors(Response.json({ error: 'Live Decode is temporarily unavailable.' }, { status: 503 }), origin);
          }
          if (!allowed) {
            return withBrowserCors(Response.json({ error: 'Too many Decode requests.' }, {
              status: 429, headers: { 'Retry-After': '60' },
            }), origin);
          }
        }
        return withBrowserCors(await handleDecode(request, env), origin);
      }
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
