import { describe, expect, it } from 'vitest';
import { healthResponse } from '../../shared/contracts/health';

describe('health contract', () => {
  it('returns the worker identity', () => {
    expect(healthResponse()).toEqual({ ok: true, service: 'sideglance-worker' });
  });
});
