import { describe, expect, it } from 'vitest';
import { classifyAttempt, finishAttempt, structuredGateAcceptance, validatePreflightReport, type AttemptRecord } from '../../evaluation/runners/preflight-telemetry';

function timeoutAttempt(attempt: number, elapsed: number): AttemptRecord {
  return finishAttempt(attempt, 100, null, classifyAttempt(null, 'gate', true), 100 + elapsed);
}

describe('preflight telemetry', () => {
  it('preserves two distinct timeout attempts and remains unverified', () => {
    const records = [timeoutAttempt(1, 31_000), timeoutAttempt(2, 30_000)];
    expect(records).toHaveLength(2);
    expect(records[0]).not.toBe(records[1]);
    expect(records.every((record) => record.latencyMs > 0 && !record.responseReached)).toBe(true);
    expect(structuredGateAcceptance(records, false)).toBe('unverified');
  });

  it('preserves 503 then 200 and verifies structured acceptance', () => {
    const records = [finishAttempt(1, 10, 503, classifyAttempt(503, 'gate'), 120), finishAttempt(2, 200, 200, classifyAttempt(200, 'gate'), 280)];
    expect(records.map((record) => record.status)).toEqual([503, 200]);
    expect(structuredGateAcceptance(records, true)).toBe('verified');
  });

  it('classifies a 400 Gate response as schema rejection without retry implication', () => {
    const record = finishAttempt(1, 10, 400, classifyAttempt(400, 'gate'), 25);
    expect(record.category).toBe('structured_gate_provider_rejection');
    expect(structuredGateAcceptance([record], false, true)).toBe('rejected');
  });

  it('uses attempt-local elapsed time rather than a zero or shared timer', () => {
    const record = finishAttempt(1, 1_000, null, 'evaluation_transport_timeout', 1_237);
    expect(record.latencyMs).toBe(237);
    expect(record.latencyMs).not.toBe(0);
  });

  it('does not create a record when no attempt starts and validates report shape', () => {
    expect(validatePreflightReport({ results: [{ case: 'B', verdict: 'NOT_RUN' }] })).toEqual([]);
    expect(validatePreflightReport({ results: [{ case: 'B', verdict: 'PROVIDER_BLOCKED', gateAttempts: 0, gateAttemptRecords: [], structuredGateProviderAcceptance: 'unverified', structuredGateProviderAccepted: false }] })).toEqual([]);
    expect(validatePreflightReport({ results: [{ case: 'B', verdict: 'PROVIDER_BLOCKED', gateAttempts: 1, gateAttemptRecords: [timeoutAttempt(1, 1)], structuredGateProviderAcceptance: 'unverified', structuredGateProviderAccepted: true }] })).toContain('B:unverified_marked_true');
  });
});
