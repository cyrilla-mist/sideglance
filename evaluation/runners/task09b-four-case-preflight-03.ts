import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ContextAnalysis } from '../../shared/contracts/context';
import type { ContextGateResult } from '../../shared/contracts/context-gate';
import { buildEvidenceCatalog } from '../../shared/context/evidence-catalog';
import { diagnoseContextAnalysis } from '../../shared/schemas/context';
import { validateContextEvidence } from '../../shared/schemas/context-evidence';
import { AIContextEngine } from '../../worker/engine/context-engine';
import { AIContextGateEngine, ContextGateError } from '../../worker/engine/context-gate';
import { ContextProviderError, ModelContextProvider, type FetchLike } from '../../worker/providers/context-provider';
import { createPowerShellGeminiFetcher, loadEvaluationModelEnvironment, type PowerShellGeminiFetcher } from '../transports/powershell-gemini-transport';
import { task09bPreflightCases } from '../cases/task09b-preflight';
import { classifyAttempt, finishAttempt, structuredGateAcceptance, validatePreflightReport, type AttemptRecord } from './preflight-telemetry';

const model = 'gemini-3.5-flash';
const reasoningEffort = 'low' as const;
type CaseSpec = { id: 'A' | 'B' | 'C' | 'D'; input: string; context?: string; expectedGate: 'ready' | 'needs_context'; kind: 'friday' | 'isolated' | 'praise' | 'readme' };
type Stage = 'gate' | 'interpreter';
const order: CaseSpec['id'][] = ['B', 'A', 'C', 'D'];
const cases = order.map((id) => {
  const item = task09bPreflightCases[id];
  return { id, input: item.input, context: 'context' in item ? item.context : undefined, expectedGate: item.expectedGate, kind: item.kind } as CaseSpec;
});

async function runCase(spec: CaseSpec, environment: Awaited<ReturnType<typeof loadEvaluationModelEnvironment>>): Promise<Record<string, unknown>> {
  let lastFailure: Record<string, unknown> | undefined;
  const gateAttemptRecords: AttemptRecord[] = [];
  const interpreterAttemptRecords: AttemptRecord[] = [];
  let retryPerformed = false;
  let backoffMs = 0;
  let gate: Record<string, unknown> | undefined;
  let shell: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const baseFetcher = createPowerShellGeminiFetcher(environment);
    shell = baseFetcher.shell;
    let stage: Stage = 'gate';
    const catalog = buildEvidenceCatalog(spec.input, spec.context);
    let modelRefCount = 0;
    let validRefCount = 0;
    const fetcher: FetchLike = async (input, init) => {
      const started = performance.now();
      const records = stage === 'gate' ? gateAttemptRecords : interpreterAttemptRecords;
      const attemptNumber = records.length + 1;
      try {
        const response = await baseFetcher(input, init);
        records.push(finishAttempt(attemptNumber, started, response.status, classifyAttempt(response.status, stage, false, baseFetcher.lastError?.category)));
        if (stage === 'interpreter' && response.ok) {
          const payload = await response.clone().json().catch(() => undefined) as { choices?: Array<{ message?: { content?: unknown } }> } | undefined;
          const content = payload?.choices?.[0]?.message?.content;
          if (typeof content === 'string') {
            const output = JSON.parse(content) as { signals?: Array<{ evidenceRef?: unknown }> };
            const refs = Array.isArray(output.signals) ? output.signals.map((signal) => signal.evidenceRef).filter((ref): ref is string => typeof ref === 'string') : [];
            modelRefCount = refs.length;
            validRefCount = refs.filter((ref) => catalog.some((unit) => unit.id === ref)).length;
          }
        }
        return response;
      } catch (error) {
        const status = baseFetcher.lastResponse?.status ?? null;
        records.push(finishAttempt(attemptNumber, started, status, classifyAttempt(status, stage, init?.signal?.aborted ?? false, baseFetcher.lastError?.category)));
        throw error;
      }
    };
    const started = performance.now();
    try {
      const gateResult = await new AIContextGateEngine({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, reasoningEffort }).checkContext(spec.input, spec.context);
      gate = summarizeGate(gateResult, spec.expectedGate, structuredGateAcceptance(gateAttemptRecords, true));
      if (gateResult.status !== spec.expectedGate) return { case: spec.id, model, gateAttempts: gateAttemptRecords.length, gateAttemptRecords, interpreterAttempts: 0, interpreterAttemptRecords, retryPerformed, backoffMs, gate, interpreterInvoked: false, verdict: 'FAIL', hardFailure: 'gate_logic_failure' };
      if (spec.kind === 'isolated') return isolatedResult(spec, gateResult, gateAttemptRecords, interpreterAttemptRecords, retryPerformed, backoffMs, shell, started);
      stage = 'interpreter';
      const analysis = await new AIContextEngine(new ModelContextProvider({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, responseFormat: true })).analyze(spec.input, spec.context);
      return interpretedResult(spec, gate!, gateAttemptRecords, interpreterAttemptRecords, retryPerformed, backoffMs, shell, started, analysis, modelRefCount, validRefCount);
    } catch (error) {
      const failure = failureSummary(error, baseFetcher, attempt, started);
      const schemaRejected = isSchemaIncompatibility(error, stage, baseFetcher);
      const executionTransportFailure = isExecutionTransportFailure(baseFetcher);
      const acceptance = schemaRejected ? 'rejected' : structuredGateAcceptance(gateAttemptRecords, Boolean(gate), false);
      lastFailure = { case: spec.id, model, shell, gateAttempts: gateAttemptRecords.length, gateAttemptRecords, interpreterAttempts: interpreterAttemptRecords.length, interpreterAttemptRecords, retryPerformed, backoffMs, gate: gate ?? { structuredGateProviderAcceptance: acceptance, structuredGateProviderAccepted: acceptance === 'verified' }, failure, interpreterInvoked: stage === 'interpreter' };
      if (schemaRejected) return { ...lastFailure, structuredGateProviderAcceptance: 'rejected', structuredGateProviderAccepted: false, verdict: 'GATE_JSON_SCHEMA_PROVIDER_INCOMPATIBILITY', hardFailure: 'GATE_JSON_SCHEMA_PROVIDER_INCOMPATIBILITY' };
      if (executionTransportFailure) return { ...lastFailure, structuredGateProviderAcceptance: acceptance, structuredGateProviderAccepted: acceptance === 'verified', verdict: 'EXECUTION_TRANSPORT_ERROR', hardFailure: failure.category };
      if (isAuthenticationFailure(error, baseFetcher)) return { ...lastFailure, structuredGateProviderAcceptance: acceptance, structuredGateProviderAccepted: acceptance === 'verified', verdict: 'PROVIDER_BLOCKED', providerBlocked: true, hardFailure: 'authentication_failure' };
      if (!isRetryable(error, baseFetcher)) return { ...lastFailure, structuredGateProviderAcceptance: acceptance, structuredGateProviderAccepted: acceptance === 'verified', verdict: 'FAIL', hardFailure: failure.category };
      if (attempt === 2) return { ...lastFailure, structuredGateProviderAcceptance: acceptance, structuredGateProviderAccepted: acceptance === 'verified', verdict: 'PROVIDER_BLOCKED', providerBlocked: true };
      retryPerformed = true;
      backoffMs = 100;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, backoffMs));
    }
  }
  return { ...(lastFailure ?? { case: spec.id, model }), gateAttempts: gateAttemptRecords.length, gateAttemptRecords, interpreterAttempts: interpreterAttemptRecords.length, interpreterAttemptRecords, retryPerformed, backoffMs, verdict: 'PROVIDER_BLOCKED', providerBlocked: true };
}

function summarizeGate(result: ContextGateResult, expected: CaseSpec['expectedGate'], acceptance: string): Record<string, unknown> {
  return { expected: expected, result: result.status, confidence: result.confidence, reason: result.reason, missingInformation: result.missingInformation ?? null, question: result.question ?? null, questionCount: typeof result.question === 'string' ? (result.question.match(/\?/g) ?? []).length : 0, sufficiency: result.sufficiency, structuredGateProviderAcceptance: acceptance, structuredGateProviderAccepted: acceptance === 'verified', contract: 'pass' };
}

function isolatedResult(spec: CaseSpec, gateResult: ContextGateResult, gateAttemptRecords: AttemptRecord[], interpreterAttemptRecords: AttemptRecord[], retryPerformed: boolean, backoffMs: number, shell: string | undefined, started: number): Record<string, unknown> {
  const questionCount = typeof gateResult.question === 'string' ? (gateResult.question.match(/\?/g) ?? []).length : 0;
  const pass = questionCount === 1 && Boolean(gateResult.missingInformation?.trim());
  return { case: spec.id, model, shell, gateAttempts: gateAttemptRecords.length, gateAttemptRecords, interpreterAttempts: interpreterAttemptRecords.length, interpreterAttemptRecords, retryPerformed, backoffMs, gate: summarizeGate(gateResult, spec.expectedGate, 'verified'), structuredGateProviderAcceptance: 'verified', structuredGateProviderAccepted: true, interpreterInvoked: false, gateLatencyMs: gateAttemptRecords.at(-1)?.latencyMs ?? Math.round(performance.now() - started), missingInformation: gateResult.missingInformation, clarificationQuestionCount: questionCount, clarificationQuestionQuality: pass ? 'minimum surrounding context' : 'invalid', semantic: { noConfidentConclusion: pass, noIdentitySpeculation: pass }, verdict: pass ? 'PASS' : 'FAIL', ...(pass ? {} : { hardFailure: 'gate_logic_failure' }) };
}

function interpretedResult(spec: CaseSpec, gate: Record<string, unknown>, gateAttemptRecords: AttemptRecord[], interpreterAttemptRecords: AttemptRecord[], retryPerformed: boolean, backoffMs: number, shell: string | undefined, started: number, analysis: ContextAnalysis, modelRefCount: number, validRefCount: number): Record<string, unknown> {
  const contract = diagnoseContextAnalysis(analysis);
  const grounding = validateContextEvidence(analysis, [spec.input, spec.context ?? ''].filter(Boolean).join('\n'));
  const text = JSON.stringify(analysis).toLowerCase();
  const semantic = spec.kind === 'friday'
    ? { developerContext: /developer|technical|coding|software|auth|merge|main/.test(text), ironicPraise: /sarcastic|playful|ironic|sarcasm/.test(text), weekendRisk: /weekend|friday/.test(text) }
    : spec.kind === 'praise'
      ? { sincerePraise: analysis.tone.includes('sincere'), warmth: /support|encourag|affirm|brave|difficult/.test(text), noSarcasmContamination: !/sarcastic|sarcasm|ironic/.test(text) }
      : { straightforward: !/sarcastic|sarcasm|critical/.test(text), noHiddenMeaningInvention: !/tension|passive.aggressive|frustration|warning|cultural subtext|slang/.test(text), noRiskWarning: !/warning|risky|deployment/.test(text) };
  const unsupportedClaims = [/discord|github/.test(text) ? 'unsupported_platform_claim' : '', /production definitely failed|deploy definitely broke|deployment definitely broke/.test(text) ? 'unsupported_failure_claim' : '', /identity|demographic|friend|teammate|coworker|relationship/.test(text) && spec.kind === 'praise' ? 'unsupported_relationship_claim' : ''].filter(Boolean);
  const semanticPass = Object.values(semantic).every(Boolean);
  const pass = contract.valid && modelRefCount === validRefCount && grounding.invalid.length === 0 && grounding.exactMatches === grounding.total && semanticPass && unsupportedClaims.length === 0;
  return { case: spec.id, model, shell, gateAttempts: gateAttemptRecords.length, gateAttemptRecords, interpreterAttempts: interpreterAttemptRecords.length, interpreterAttemptRecords, retryPerformed, backoffMs, gate, structuredGateProviderAcceptance: 'verified', structuredGateProviderAccepted: true, interpreterInvoked: true, interpreterLatencyMs: interpreterAttemptRecords.at(-1)?.latencyMs ?? Math.round(performance.now() - started), modelContextAnalysisContract: contract.valid ? 'pass' : 'fail', evidenceRefs: { total: modelRefCount, valid: validRefCount, invalid: modelRefCount - validRefCount }, finalContextAnalysisContract: contract.valid ? 'pass' : 'fail', grounding: { total: grounding.total, exact: grounding.exactMatches, invalid: grounding.invalid.length }, semantic: { ...semantic, pass: semanticPass }, unsupportedClaims, verdict: pass ? 'PASS' : 'FAIL', ...(pass ? {} : { hardFailure: grounding.invalid.length ? 'hallucinated_evidence' : 'semantic_or_contract_failure' }) };
}

function failureSummary(error: unknown, fetcher: PowerShellGeminiFetcher, attempt: number, started: number): Record<string, unknown> {
  if (fetcher.lastError) return { category: fetcher.lastError.category, stage: 'transport', status: fetcher.lastResponse?.status ?? null, latencyMs: Math.round(performance.now() - started), attempt };
  if (error instanceof ContextGateError) return { category: categoryFor(error.status, error.stage), stage: error.stage, status: error.status ?? fetcher.lastResponse?.status ?? null, latencyMs: Math.round(performance.now() - started), attempt, providerMessage: error.providerMessage };
  if (error instanceof ContextProviderError) return { category: categoryFor(error.diagnostics?.status, error.diagnostics?.stage), stage: error.diagnostics?.stage ?? 'provider_error', status: error.diagnostics?.status ?? fetcher.lastResponse?.status ?? null, latencyMs: Math.round(performance.now() - started), attempt, providerMessage: error.diagnostics?.providerMessage, evidenceRefs: { total: error.diagnostics?.evidenceTotal, valid: error.diagnostics?.evidenceExactMatches, invalid: error.diagnostics?.evidenceInvalid } };
  return { category: 'provider_transport_error', stage: 'transport', status: fetcher.lastResponse?.status ?? null, latencyMs: Math.round(performance.now() - started), attempt };
}

function categoryFor(status: number | null | undefined, stage: string | undefined): string {
  if (status === 400) return 'invalid_request';
  if (status === 401 || status === 403) return 'authentication_failure';
  if (status === 404) return 'invalid_model_or_endpoint';
  if (status === 429) return 'quota_or_rate_limit';
  if (status !== undefined && status !== null && status >= 500) return 'provider_5xx';
  if (stage === 'timeout' || stage === 'fetch_error' || stage === 'transport') return 'provider_transport_timeout';
  return 'provider_error';
}

function statusOf(error: unknown, fetcher: PowerShellGeminiFetcher): number | null | undefined { return error instanceof ContextGateError ? error.status ?? fetcher.lastResponse?.status : error instanceof ContextProviderError ? error.diagnostics?.status ?? fetcher.lastResponse?.status : fetcher.lastResponse?.status; }
function stageOf(error: unknown): string { return error instanceof ContextGateError ? error.stage : error instanceof ContextProviderError ? error.diagnostics?.stage ?? 'provider_error' : 'transport'; }
function isRetryable(error: unknown, fetcher: PowerShellGeminiFetcher): boolean { const status = statusOf(error, fetcher); return ['timeout', 'fetch_error', 'transport'].includes(stageOf(error)) || [429, 500, 502, 503, 504].includes(status ?? -1); }
function isAuthenticationFailure(error: unknown, fetcher: PowerShellGeminiFetcher): boolean { return [401, 403].includes(statusOf(error, fetcher) ?? -1); }
function isSchemaIncompatibility(error: unknown, stage: Stage, fetcher: PowerShellGeminiFetcher): boolean { return stage === 'gate' && statusOf(error, fetcher) === 400; }
function isExecutionTransportFailure(fetcher: PowerShellGeminiFetcher): boolean { return ['shell_not_found', 'shell_spawn_error', 'powershell_script_error'].includes(fetcher.lastError?.category ?? ''); }

async function main(): Promise<void> {
  const environment = await loadEvaluationModelEnvironment();
  const results: Record<string, unknown>[] = [];
  for (const spec of cases) {
    const result = await runCase(spec, environment);
    results.push(result);
    if (result.verdict === 'PROVIDER_BLOCKED' || result.verdict === 'EXECUTION_TRANSPORT_ERROR' || result.verdict === 'GATE_JSON_SCHEMA_PROVIDER_INCOMPATIBILITY') break;
  }
  for (const remaining of cases.slice(results.length)) results.push({ case: remaining.id, model, verdict: 'NOT_RUN', note: 'Stopped after provider-wide blocker.' });
  const overall = results.some((r) => r.verdict === 'GATE_JSON_SCHEMA_PROVIDER_INCOMPATIBILITY') ? 'GATE_JSON_SCHEMA_PROVIDER_INCOMPATIBILITY' : results.some((r) => r.verdict === 'EXECUTION_TRANSPORT_ERROR') ? 'EXECUTION_TRANSPORT_ERROR' : results.some((r) => r.providerBlocked) ? 'PROVIDER_BLOCKED' : results.length === cases.length && results.every((r) => r.verdict === 'PASS') ? 'PASS' : 'FAIL';
  const structuredAcceptance = results.some((r) => r.structuredGateProviderAcceptance === 'rejected') ? 'rejected' : results.some((r) => r.structuredGateProviderAcceptance === 'verified') ? 'verified' : 'unverified';
  const report = { runId: 'task09b-four-case-preflight-04', transport: 'evaluation-only PowerShell bridge', productionWorkerPathUsed: false, model, reasoningEffort, casesRequested: 4, casesRun: results.filter((r) => r.verdict !== 'NOT_RUN').length, results, hardFailures: results.filter((r) => r.hardFailure).map((r) => r.hardFailure), providerBlockedCases: results.filter((r) => r.providerBlocked).map((r) => r.case), structuredGateProviderAcceptance: structuredAcceptance, structuredGateProviderAccepted: structuredAcceptance === 'verified', overallVerdict: overall };
  const integrityErrors = validatePreflightReport(report as unknown as Record<string, unknown>);
  if (integrityErrors.length > 0) throw new Error(`Preflight report integrity failure: ${integrityErrors.join(', ')}`);
  const path = resolve(process.cwd(), 'evaluation', 'reports', 'task09b-four-case-preflight-04.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ runId: report.runId, casesRun: report.casesRun, overallVerdict: report.overallVerdict }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Four-case preflight failed.'); process.exitCode = 1; });
