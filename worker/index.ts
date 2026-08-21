import { HEALTH_PATH, healthResponse } from '../shared/contracts/health';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === HEALTH_PATH) {
      return Response.json(healthResponse());
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
};
