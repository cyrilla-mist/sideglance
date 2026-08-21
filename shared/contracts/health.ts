export const HEALTH_PATH = '/api/health';

export type HealthResponse = {
  ok: true;
  service: 'sideglance-worker';
};

export const healthResponse = (): HealthResponse => ({ ok: true, service: 'sideglance-worker' });
