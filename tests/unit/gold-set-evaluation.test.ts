import { describe, expect, it } from 'vitest';
import { contextGateCases } from '../../evaluation/cases/context-gate';
import { goldCases } from '../../evaluation/cases/gold';
import { getTask09cGoldSetCases, getTask09cGoldSetFingerprint } from '../../evaluation/cases/task09c-gold-set';
import { buildGoldMetrics, deriveGoldVerdict, summarizeGoldReport, validatePreflightPass } from '../../evaluation/runners/task09c-report';

describe('Task 09C Gold Set infrastructure', () => {
  it('builds a unique canonical registry from 21 intelligence and 6 Gate cases', () => {
    const cases = getTask09cGoldSetCases();
    expect(goldCases).toHaveLength(21);
    expect(contextGateCases).toHaveLength(6);
    expect(cases).toHaveLength(26);
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
    expect(getTask09cGoldSetFingerprint()).toContain('task09c-gold-v1:');
  });

  it('requires a complete passing structured Gate preflight', () => {
    const base = { overallVerdict: 'PASS', structuredGateProviderAcceptance: 'verified', structuredGateProviderAccepted: true, results: ['A', 'B', 'C', 'D'].map((id) => ({ case: id, verdict: 'PASS' })) };
    expect(validatePreflightPass(base).valid).toBe(true);
    expect(validatePreflightPass({ ...base, overallVerdict: 'PROVIDER_BLOCKED' }).valid).toBe(false);
    expect(validatePreflightPass({ ...base, results: [{ case: 'A', verdict: 'PASS' }] }).valid).toBe(false);
    expect(validatePreflightPass({ ...base, structuredGateProviderAcceptance: 'unverified', structuredGateProviderAccepted: false }).valid).toBe(false);
  });

  it('computes evaluated denominators, category metrics, grounding and latency', () => {
    const results = [
      { case: 'x', category: 'internet_slang', verdict: 'PASS', contractsValid: true, semantic: { pass: true }, gateStatus: 'ready', gateDecisionCorrect: true, interpreterInvoked: true, gateAttemptRecords: [{ status: 200, latencyMs: 10 }], interpreterAttemptRecords: [{ status: 200, latencyMs: 30 }], grounding: { total: 1, exact: 1, invalid: 0 }, modelLatencyMs: 40, unsupportedClaims: [] },
      { case: 'y', category: 'internet_slang', verdict: 'FAIL', contractsValid: false, semantic: { pass: false }, gateStatus: 'ready', gateDecisionCorrect: true, interpreterInvoked: true, gateAttemptRecords: [{ status: 503, latencyMs: 20 }], interpreterAttemptRecords: [], grounding: { total: 1, exact: 0, invalid: 1 }, modelLatencyMs: 20, unsupportedClaims: ['x'] },
      { case: 'z', category: 'context_gate', verdict: 'PROVIDER_BLOCKED', providerBlocked: true, gateAttemptRecords: [{ status: null, latencyMs: 5 }], interpreterAttemptRecords: [] },
    ];
    const calculated = buildGoldMetrics(results);
    expect(calculated.metrics).toMatchObject({ totalCases: 3, evaluatedCases: 2, passed: 1, failed: 1, providerBlocked: 1, passRateAmongEvaluated: 0.5, completionRate: 2 / 3, invalidGrounding: 1 });
    expect(calculated.categoryMetrics.internet_slang).toMatchObject({ total: 2, evaluated: 2, pass: 1, fail: 1, passRate: 0.5 });
    expect(calculated.providerMetrics).toMatchObject({ requestAttempts: 4, http200Count: 2, transientErrorCount: 1 });
  });

  it('derives strict verdict states', () => {
    expect(deriveGoldVerdict([{ verdict: 'PROVIDER_BLOCKED' }], { evaluatedCases: 0 })).toBe('PROVIDER_BLOCKED');
    expect(deriveGoldVerdict([{ verdict: 'PASS', criticalFailure: true }], { evaluatedCases: 1, passRateAmongEvaluated: 1, invalidGrounding: 0 })).toBe('NEEDS_CALIBRATION');
    expect(deriveGoldVerdict([{ verdict: 'PASS' }], { evaluatedCases: 1, passRateAmongEvaluated: 1, invalidGrounding: 0 })).toBe('READY');
  });

  it('produces a compact sanitized summary', () => {
    const report = { runId: 'x', timestamp: 'now', model: 'gemini-3.5-flash', reasoningEffort: 'low' as const, caseRegistryFingerprint: 'x', totalCases: 26, evaluatedCases: 26, metrics: { totalCases: 26, evaluatedCases: 26, passed: 26, failed: 0, providerBlocked: 0, passRateAmongEvaluated: 1, correctGateDecisions: 26, exactEvidence: 26, invalidGrounding: 0 }, categoryMetrics: {}, providerMetrics: {}, verdict: 'READY' as const, cases: [] };
    const summary = summarizeGoldReport(report);
    expect(summary).toContain('Task 09C Gold Set');
    expect(summary).not.toContain('MODEL_API_KEY');
  });
});
