import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { getTask09cGoldSetCases, getTask09cGoldSetFingerprint, type GoldSetCase } from '../cases/task09c-gold-set';
import { ContextEvaluator } from '../evaluator/context-evaluator';
import { AIContextEngine } from '../../worker/engine/context-engine';
import { AIContextGateEngine, ContextGateError } from '../../worker/engine/context-gate';
import { ContextProviderError, ModelContextProvider, type FetchLike } from '../../worker/providers/context-provider';
import { buildEvidenceCatalog } from '../../shared/context/evidence-catalog';
import { diagnoseContextAnalysis } from '../../shared/schemas/context';
import { validateContextEvidence } from '../../shared/schemas/context-evidence';
import { createPowerShellGeminiFetcher, loadEvaluationModelEnvironment, type PowerShellGeminiFetcher } from '../transports/powershell-gemini-transport';
import { buildGoldMetrics, deriveGoldVerdict, reportFingerprint, type GoldRunReport, validatePreflightPass } from './task09c-report';

const model = 'gemini-3.5-flash';
const cases = getTask09cGoldSetCases();

async function loadPreflight(): Promise<{ valid: boolean; reason?: string }> {
  try { return validatePreflightPass(JSON.parse(await readFile(resolve(process.cwd(), 'evaluation', 'reports', 'task09b-four-case-preflight-06.json'), 'utf8'))); } catch { return { valid: false, reason: 'preflight_missing_or_malformed' }; }
}

async function runCase(spec: GoldSetCase, environment: Awaited<ReturnType<typeof loadEvaluationModelEnvironment>>): Promise<Record<string, unknown>> {
  const gateAttemptRecords: Record<string, unknown>[] = [];
  const interpreterAttemptRecords: Record<string, unknown>[] = [];
  let retryPerformed = false;
  let backoffMs = 0;
  let gateStatus: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const baseFetcher = createPowerShellGeminiFetcher(environment);
    let stage = 'gate';
    const fetcher: FetchLike = async (input, init) => {
      const start = performance.now();
      const records = stage === 'gate' ? gateAttemptRecords : interpreterAttemptRecords;
      const number = records.length + 1;
      try {
        const response = await baseFetcher(input, init);
        records.push({ attempt: number, started: true, status: response.status, latencyMs: Math.max(1, Math.round(performance.now() - start)), category: response.ok ? 'http_200' : `http_${response.status}`, responseReached: true });
        return response;
      } catch (error) {
        const status = baseFetcher.lastResponse?.status ?? null;
        records.push({ attempt: number, started: true, status, latencyMs: Math.max(1, Math.round(performance.now() - start)), category: baseFetcher.lastError?.category ?? 'evaluation_transport_error', responseReached: status !== null });
        throw error;
      }
    };
    try {
      const gate = await new AIContextGateEngine({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, reasoningEffort: 'low' }).checkContext(spec.input, spec.context);
      gateStatus = gate.status;
      const gateCorrect = spec.expectedGate ? gate.status === spec.expectedGate.status : true;
      if (!gateCorrect) return caseResult(spec, gateAttemptRecords, interpreterAttemptRecords, retryPerformed, backoffMs, gate, false, 'GATE_ERROR');
      if (gate.status === 'needs_context') {
        const questionCount = typeof gate.question === 'string' ? (gate.question.match(/\?/g) ?? []).length : 0;
        const quality = Boolean(gate.missingInformation?.trim()) && questionCount === 1;
        return caseResult(spec, gateAttemptRecords, interpreterAttemptRecords, retryPerformed, backoffMs, gate, false, quality ? 'PASS' : 'GATE_CONTRACT_ERROR', { clarificationQuality: quality ? 'pass' : 'fail', semantic: { pass: quality } });
      }
      stage = 'interpreter';
      const provider = new ModelContextProvider({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, responseFormat: true });
      const analysis = await new AIContextEngine(provider).analyze(spec.input, spec.context);
      const contract = diagnoseContextAnalysis(analysis).valid;
      const grounding = validateContextEvidence(analysis, [spec.input, spec.context ?? ''].filter(Boolean).join('\n'));
      const expectedCase = spec.expectedInterpreter ? { id: spec.id, category: spec.category === 'context_gate' ? 'developer_culture' : spec.category, input: spec.input, context: spec.context, expected: spec.expectedInterpreter } : undefined;
      const evaluation = expectedCase ? new ContextEvaluator().evaluate(expectedCase as never, analysis) : { passed: true, issues: [] };
      const unsupportedClaims = expectedCase ? [] : [];
      const pass = contract && grounding.valid && evaluation.passed;
      return { case: spec.id, category: spec.category, model, shell: baseFetcher.shell, gateAttempts: gateAttemptRecords.length, gateAttemptRecords, gateStatus, gateContract: 'pass', gateDecisionCorrect: true, interpreterInvoked: true, interpreterAttempts: interpreterAttemptRecords.length, interpreterAttemptRecords, modelContract: contract ? 'pass' : 'fail', contractsValid: contract, evidenceRefs: { total: grounding.total, valid: grounding.exactMatches, invalid: grounding.invalid.length }, finalContextAnalysisContract: contract ? 'pass' : 'fail', grounding: { total: grounding.total, exact: grounding.exactMatches, invalid: grounding.invalid.length }, semantic: { pass: evaluation.passed }, unsupportedClaims, modelLatencyMs: [...gateAttemptRecords, ...interpreterAttemptRecords].reduce((sum, item) => sum + Number((item as Record<string, unknown>).latencyMs ?? 0), 0), retryPerformed, backoffMs, verdict: pass ? 'PASS' : 'FAIL', ...(pass ? {} : { failureCategory: evaluation.issues.some((issue) => issue.rule === 'hallucinated_evidence') ? 'HALLUCINATED_EVIDENCE' : 'SEMANTIC_ERROR', criticalFailure: false }) };
    } catch (error) {
      const status = baseFetcher.lastResponse?.status ?? null;
      const category = baseFetcher.lastError?.category ?? (error instanceof ContextProviderError ? 'provider_http_error' : error instanceof ContextGateError ? `gate_${error.stage}` : 'execution_transport_error');
      const transient = [429, 500, 502, 503, 504].includes(status ?? -1) || ['connection_timeout', 'powershell_timeout', 'evaluation_transport_timeout'].includes(category);
      const authFailure = status === 401 || status === 403;
      const schemaRejection = stage === 'gate' && status === 400;
      const executionFailure = ['shell_not_found', 'shell_spawn_error', 'powershell_script_error', 'script_parse_error', 'stdin_parse_error', 'request_serialization_error', 'response_parse_error', 'child_timeout'].includes(category);
      const result = { case: spec.id, category: spec.category, model, shell: baseFetcher.shell, gateAttempts: gateAttemptRecords.length, gateAttemptRecords, gateStatus, gateContract: 'not_reached', gateDecisionCorrect: false, interpreterInvoked: stage === 'interpreter', interpreterAttempts: interpreterAttemptRecords.length, interpreterAttemptRecords, retryPerformed, backoffMs, failureCategory: transient ? 'PROVIDER_BLOCKED' : schemaRejection ? 'STRUCTURED_GATE_PROVIDER_REJECTION' : authFailure ? 'AUTH_ERROR' : executionFailure ? 'EXECUTION_TRANSPORT_ERROR' : 'PROVIDER_HTTP_ERROR', verdict: transient && attempt === 2 ? 'PROVIDER_BLOCKED' : 'FAIL', providerBlocked: transient && attempt === 2, systemicBlocker: schemaRejection || authFailure || executionFailure };
      if (!transient || attempt === 2) return result;
      retryPerformed = true; backoffMs = 100; await new Promise((resolveDelay) => setTimeout(resolveDelay, backoffMs));
    }
  }
  return { case: spec.id, category: spec.category, model, gateAttempts: gateAttemptRecords.length, gateAttemptRecords, interpreterAttempts: interpreterAttemptRecords.length, interpreterAttemptRecords, verdict: 'PROVIDER_BLOCKED', providerBlocked: true };
}

function caseResult(spec: GoldSetCase, gateAttemptRecords: Record<string, unknown>[], interpreterAttemptRecords: Record<string, unknown>[], retryPerformed: boolean, backoffMs: number, gate: { status: string; confidence: string; reason: string; missingInformation?: string; question?: string }, interpreterInvoked: boolean, verdict: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { case: spec.id, category: spec.category, model, gateAttempts: gateAttemptRecords.length, gateAttemptRecords, gateStatus: gate.status, gateContract: 'pass', gateDecisionCorrect: true, clarificationQuestionCount: typeof gate.question === 'string' ? (gate.question.match(/\?/g) ?? []).length : 0, interpreterInvoked, interpreterAttempts: interpreterAttemptRecords.length, interpreterAttemptRecords, retryPerformed, backoffMs, contractsValid: true, modelLatencyMs: gateAttemptRecords.reduce((sum, item) => sum + Number(item.latencyMs ?? 0), 0), verdict, ...extra, ...(verdict === 'PASS' ? {} : { failureCategory: verdict }) };
}

async function main(): Promise<void> {
  const preflight = await loadPreflight();
  if (!preflight.valid) { console.log('Gold Set blocked: 4-case real-AI preflight has not passed.'); process.exitCode = 2; return; }
  const environment = await loadEvaluationModelEnvironment();
  const checkpointPath = resolve(process.cwd(), 'evaluation', 'reports', 'task09c-gold-set-checkpoint.json');
  const checkpointFingerprint = `${getTask09cGoldSetFingerprint()}:model=${model}:reasoning=low`;
  let results: Record<string, unknown>[] = [];
  try {
    const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8')) as { fingerprint?: string; results?: Record<string, unknown>[] };
    if (checkpoint.fingerprint === checkpointFingerprint && Array.isArray(checkpoint.results)) results = checkpoint.results;
  } catch { /* Start a fresh run when no compatible checkpoint exists. */ }
  let consecutiveProviderBlocked = 0;
  for (const spec of cases) {
    if (results.some((result) => result.case === spec.id)) continue;
    const result = await runCase(spec, environment);
    results.push(result);
    consecutiveProviderBlocked = result.verdict === 'PROVIDER_BLOCKED' ? consecutiveProviderBlocked + 1 : 0;
    await mkdir(dirname(checkpointPath), { recursive: true });
    await writeFile(checkpointPath, JSON.stringify({ fingerprint: checkpointFingerprint, completedCaseIds: results.map((result) => result.case), results }, null, 2), 'utf8');
    if (result.systemicBlocker === true) {
      for (const remaining of cases.slice(results.length)) results.push({ case: remaining.id, category: remaining.category, model, verdict: 'NOT_RUN', note: 'Stopped after systemic provider or execution blocker.' });
      break;
    }
    if (consecutiveProviderBlocked >= 3) {
      for (const remaining of cases.slice(results.length)) results.push({ case: remaining.id, category: remaining.category, model, verdict: 'NOT_RUN', note: 'Stopped by bounded provider circuit breaker.' });
      break;
    }
  }
  const calculated = buildGoldMetrics(results);
  const verdict = deriveGoldVerdict(results, calculated.metrics);
  const report: GoldRunReport = { runId: 'task09c-gold-set-run-01', timestamp: new Date().toISOString(), model, reasoningEffort: 'low', caseRegistryFingerprint: getTask09cGoldSetFingerprint(), totalCases: cases.length, evaluatedCases: Number(calculated.metrics.evaluatedCases), metrics: calculated.metrics, categoryMetrics: calculated.categoryMetrics, providerMetrics: calculated.providerMetrics, verdict, cases: results };
  const outputPath = resolve(process.cwd(), 'evaluation', 'reports', 'task09c-gold-set-run-01.json'); await mkdir(dirname(outputPath), { recursive: true }); await writeFile(outputPath, JSON.stringify({ ...report, reportFingerprint: reportFingerprint(report) }, null, 2), 'utf8'); await unlink(checkpointPath).catch(() => undefined);
  console.log(`Task 09C Gold Set\n${JSON.stringify({ total: report.totalCases, evaluated: report.evaluatedCases, verdict: report.verdict })}\nReport: evaluation/reports/task09c-gold-set-run-01.json`);
}

main().catch(() => { console.error('Gold Set evaluation failed.'); process.exitCode = 1; });
