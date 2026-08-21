import { HEALTH_PATH, healthResponse } from '../shared/contracts/health';
import { handleDecode } from './routes/decode';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === HEALTH_PATH) {
      return Response.json(healthResponse());
    }
    if (request.method === 'POST' && url.pathname === '/api/decode') return handleDecode(request);
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
