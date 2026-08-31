import { createHash } from 'node:crypto';
import { validatePreflightReport } from './preflight-telemetry';

export type GoldCaseResult = Record<string, unknown>;
export type GoldRunReport = {
  runId: string;
  timestamp: string;
  model: string;
  reasoningEffort: 'low';
  caseRegistryFingerprint: string;
  totalCases: number;
  evaluatedCases: number;
  metrics: Record<string, unknown>;
  categoryMetrics: Record<string, Record<string, number | null>>;
  providerMetrics: Record<string, unknown>;
  verdict: 'READY' | 'NEEDS_CALIBRATION' | 'NOT_READY' | 'PROVIDER_BLOCKED';
  cases: GoldCaseResult[];
};

export function buildGoldMetrics(results: readonly GoldCaseResult[]): { metrics: Record<string, unknown>; categoryMetrics: Record<string, Record<string, number | null>>; providerMetrics: Record<string, unknown> } {
  const evaluated = results.filter((result) => result.verdict !== 'NOT_RUN' && result.verdict !== 'PROVIDER_BLOCKED');
  const pass = evaluated.filter((result) => result.verdict === 'PASS').length;
  const blocked = results.filter((result) => result.verdict === 'PROVIDER_BLOCKED').length;
  const refs = results.map((result) => result.grounding).filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'));
  const gateRecords = results.flatMap((result) => Array.isArray(result.gateAttemptRecords) ? result.gateAttemptRecords as Array<Record<string, unknown>> : []);
  const interpreterRecords = results.flatMap((result) => Array.isArray(result.interpreterAttemptRecords) ? result.interpreterAttemptRecords as Array<Record<string, unknown>> : []);
  const latency = (records: Array<Record<string, unknown>>): Record<string, number | null> => { const values = records.map((record) => record.latencyMs).filter((value): value is number => typeof value === 'number').sort((a, b) => a - b); return { averageMs: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null, medianMs: values.length ? values[Math.floor((values.length - 1) / 2)] : null }; };
  const categoryMetrics: Record<string, { total: number; evaluated: number; pass: number; fail: number; providerBlocked: number; passRate: number | null }> = {};
  for (const result of results) { const category = typeof result.category === 'string' ? result.category : 'unknown'; const current = categoryMetrics[category] ?? { total: 0, evaluated: 0, pass: 0, fail: 0, providerBlocked: 0, passRate: null }; current.total += 1; if (result.verdict !== 'NOT_RUN' && result.verdict !== 'PROVIDER_BLOCKED') current.evaluated += 1; if (result.verdict === 'PASS') current.pass += 1; if (result.verdict === 'PROVIDER_BLOCKED') current.providerBlocked += 1; if (result.verdict === 'FAIL') current.fail += 1; current.passRate = current.evaluated ? current.pass / current.evaluated : null; categoryMetrics[category] = current; }
  return {
    metrics: { totalCases: results.length, evaluatedCases: evaluated.length, passed: pass, failed: evaluated.length - pass, providerBlocked: blocked, passRateAmongEvaluated: evaluated.length ? pass / evaluated.length : null, completionRate: results.length ? evaluated.length / results.length : 0, gateReadyCases: results.filter((result) => result.gateStatus === 'ready').length, gateNeedsContextCases: results.filter((result) => result.gateStatus === 'needs_context').length, correctGateDecisions: results.filter((result) => result.gateDecisionCorrect === true).length, incorrectGateDecisions: results.filter((result) => result.gateDecisionCorrect === false).length, interpreterCasesEvaluated: results.filter((result) => result.interpreterInvoked === true).length, semanticPassRate: evaluated.filter((result) => (result.semantic as Record<string, unknown> | undefined)?.pass === true).length / (evaluated.filter((result) => result.interpreterInvoked === true).length || 1), contractReliability: evaluated.length ? evaluated.filter((result) => result.contractsValid === true).length / evaluated.length : null, clarificationQualityFailures: results.filter((result) => result.clarificationQuality === 'fail').length, overinterpretationCount: results.filter((result) => result.failureCategory === 'OVERINTERPRETATION').length, underinterpretationCount: results.filter((result) => result.failureCategory === 'UNDERINTERPRETATION').length, totalEvidenceRefs: refs.reduce((sum, value) => sum + (typeof value.total === 'number' ? value.total : 0), 0), validEvidenceRefs: refs.reduce((sum, value) => sum + (typeof value.valid === 'number' ? value.valid : 0), 0), invalidEvidenceRefs: refs.reduce((sum, value) => sum + (typeof value.invalid === 'number' ? value.invalid : 0), 0), totalResolvedEvidence: refs.reduce((sum, value) => sum + (typeof value.total === 'number' ? value.total : 0), 0), exactEvidence: refs.reduce((sum, value) => sum + (typeof value.exact === 'number' ? value.exact : 0), 0), invalidGrounding: refs.reduce((sum, value) => sum + (typeof value.invalid === 'number' ? value.invalid : 0), 0), unsupportedClaimCount: results.reduce((sum, result) => sum + (Array.isArray(result.unsupportedClaims) ? result.unsupportedClaims.length : 0), 0), hallucinatedEvidenceCount: results.filter((result) => result.failureCategory === 'HALLUCINATED_EVIDENCE').length, gateLatency: latency(gateRecords), interpreterLatency: latency(interpreterRecords), caseAverageModelLatencyMs: results.length ? results.reduce((sum, result) => sum + (typeof result.modelLatencyMs === 'number' ? result.modelLatencyMs : 0), 0) / results.length : null, tokens: 'not available', cost: 'not available' },
    categoryMetrics,
    providerMetrics: { requestAttempts: gateRecords.length + interpreterRecords.length, http200Count: [...gateRecords, ...interpreterRecords].filter((record) => record.status === 200).length, transientErrorCount: [...gateRecords, ...interpreterRecords].filter((record) => typeof record.status === 'number' && [429, 500, 502, 503, 504].includes(record.status)).length, providerBlockedCases: blocked },
  };
}

export function deriveGoldVerdict(results: readonly GoldCaseResult[], metrics: Record<string, unknown>): GoldRunReport['verdict'] {
  if (results.some((result) => result.verdict === 'PROVIDER_BLOCKED')) return 'PROVIDER_BLOCKED';
  const evaluated = Number(metrics.evaluatedCases ?? 0); const passRate = typeof metrics.passRateAmongEvaluated === 'number' ? metrics.passRateAmongEvaluated : 0;
  const critical = results.some((result) => result.criticalFailure === true);
  const groundingInvalid = Number(metrics.invalidGrounding ?? 0);
  if (evaluated === 0 || critical || passRate < 0.9 || groundingInvalid !== 0) return evaluated === 0 ? 'NOT_READY' : 'NEEDS_CALIBRATION';
  return 'READY';
}

export function validatePreflightPass(value: unknown): { valid: boolean; reason?: string } {
  if (!value || typeof value !== 'object') return { valid: false, reason: 'report_not_object' };
  const report = value as Record<string, unknown>;
  if (report.overallVerdict !== 'PASS') return { valid: false, reason: 'overall_not_pass' };
  if (report.structuredGateProviderAcceptance !== 'verified' || report.structuredGateProviderAccepted !== true) return { valid: false, reason: 'structured_gate_not_verified' };
  const results = Array.isArray(report.results) ? report.results : [];
  const integrityErrors = validatePreflightReport(report);
  if (integrityErrors.length > 0) return { valid: false, reason: 'preflight_integrity_failure' };
  const ids = new Set(results.map((result) => result && typeof result === 'object' ? (result as Record<string, unknown>).case : undefined));
  if (!['A', 'B', 'C', 'D'].every((id) => ids.has(id))) return { valid: false, reason: 'preflight_cases_incomplete' };
  if (results.some((result) => !result || typeof result !== 'object' || (result as Record<string, unknown>).verdict !== 'PASS')) return { valid: false, reason: 'preflight_case_not_pass' };
  return { valid: true };
}

export function reportFingerprint(report: unknown): string { return createHash('sha256').update(JSON.stringify(report)).digest('hex'); }

export function summarizeGoldReport(report: GoldRunReport): string { const metrics = report.metrics; return [`Task 09C Gold Set`, `Cases: ${metrics.totalCases} total / ${metrics.evaluatedCases} evaluated / ${metrics.passed} PASS / ${metrics.failed} FAIL / ${metrics.providerBlocked} PROVIDER_BLOCKED`, `Pass rate: ${typeof metrics.passRateAmongEvaluated === 'number' ? `${(metrics.passRateAmongEvaluated * 100).toFixed(1)}%` : 'not available'}`, `Gate: ${metrics.correctGateDecisions} correct decisions`, `Grounding: ${metrics.exactEvidence} exact / ${metrics.invalidGrounding} invalid`, `Verdict: ${report.verdict}`, `Report: evaluation/reports/task09c-gold-set-run-01.json`].join('\n'); }
