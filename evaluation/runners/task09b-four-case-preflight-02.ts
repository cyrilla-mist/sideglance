import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ContextAnalysis } from '../../shared/contracts/context';
import { buildEvidenceCatalog } from '../../shared/context/evidence-catalog';
import { diagnoseContextAnalysis } from '../../shared/schemas/context';
import { validateContextEvidence } from '../../shared/schemas/context-evidence';
import { AIContextEngine } from '../../worker/engine/context-engine';
import { AIContextGateEngine, ContextGateError } from '../../worker/engine/context-gate';
import { ContextProviderError, ModelContextProvider, type FetchLike } from '../../worker/providers/context-provider';
import { createPowerShellGeminiFetcher, loadEvaluationModelEnvironment, type PowerShellGeminiFetcher } from '../transports/powershell-gemini-transport';
import { task09bPreflightCases } from '../cases/task09b-preflight';

const model = 'gemini-3.5-flash';
type CaseSpec = { id: 'A' | 'B' | 'C' | 'D'; input: string; context?: string; expectedGate: 'ready' | 'needs_context'; kind: 'friday' | 'isolated' | 'praise' | 'readme' };
type RequestRecord = { stage: 'gate' | 'interpreter'; status: number | null; latencyMs: number };
const runnableCases: CaseSpec[] = (Object.entries(task09bPreflightCases) as Array<[CaseSpec['id'], typeof task09bPreflightCases[keyof typeof task09bPreflightCases]]>).map(([id, item]) => ({ id, input: item.input, context: 'context' in item ? item.context : undefined, expectedGate: item.expectedGate, kind: item.kind }));

async function runCase(spec: CaseSpec, environment: Awaited<ReturnType<typeof loadEvaluationModelEnvironment>>): Promise<Record<string, unknown>> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const baseFetcher = createPowerShellGeminiFetcher(environment);
    const catalog = buildEvidenceCatalog(spec.input, spec.context);
    const requests: RequestRecord[] = [];
    let stage: RequestRecord['stage'] = 'gate';
    let modelRefCount = 0;
    let validRefCount = 0;
    const fetcher: FetchLike = async (request, init) => {
      const started = Date.now();
      try {
        const response = await baseFetcher(request, init);
        requests.push({ stage, status: response.status, latencyMs: Date.now() - started });
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
        requests.push({ stage, status: baseFetcher.lastResponse?.status ?? null, latencyMs: Date.now() - started });
        throw error;
      }
    };
    const started = Date.now();
    try {
      const gateResult = await new AIContextGateEngine({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, reasoningEffort: 'low' }).checkContext(spec.input, spec.context);
      const gate = { status: gateResult.status, confidence: gateResult.confidence, reason: gateResult.reason, contract: 'pass', clarificationQuestionCount: gateResult.status === 'needs_context' ? 1 : 0 };
      if (gateResult.status !== spec.expectedGate) return { case: spec.id, model, attempt, gate, interpreterInvoked: false, requests, latencyMs: Date.now() - started, verdict: 'FAIL', hardFailure: 'gate_expectation_failed' };
      if (spec.kind === 'isolated') {
        const pass = gateResult.status === 'needs_context' && typeof gateResult.question === 'string' && (gateResult.question.match(/\?/g) ?? []).length === 1;
        return { case: spec.id, model, attempt, gate, interpreterInvoked: false, requests, latencyMs: Date.now() - started, modelContract: 'not_reached', finalContextAnalysisContract: 'not_reached', grounding: 'not_reached', semantic: { clarificationQuestionCount: 1, pass }, unsupportedClaims: [], verdict: pass ? 'PASS' : 'FAIL', ...(pass ? {} : { hardFailure: 'invalid_clarification' }) };
      }
      stage = 'interpreter';
      const analysis = await new AIContextEngine(new ModelContextProvider({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, responseFormat: true })).analyze(spec.input, spec.context);
      return interpretedResult(spec, model, attempt, gate, requests, started, analysis, modelRefCount, validRefCount);
    } catch (error) {
      const invalidRef = error instanceof ContextProviderError && error.code === 'invalid_evidence_reference';
      const failure = failureSummary(error, baseFetcher);
      const transient = !invalidRef && isTransient(error, baseFetcher);
      return { case: spec.id, model, attempt, gate: 'failed_or_not_reached', interpreterInvoked: stage === 'interpreter', requests, latencyMs: Date.now() - started, failure, verdict: transient ? 'RETRYABLE' : 'FAIL', hardFailure: invalidRef ? 'hallucinated_evidence_reference' : transient ? undefined : 'invalid_gate_or_provider_contract' };
    }
  }
  return { case: spec.id, model, verdict: 'PROVIDER_BLOCKED', providerBlocked: true };
}

function interpretedResult(spec: CaseSpec, modelName: string, attempt: number, gate: Record<string, unknown>, requests: RequestRecord[], started: number, analysis: ContextAnalysis, modelRefCount: number, validRefCount: number): Record<string, unknown> {
  const contract = diagnoseContextAnalysis(analysis);
  const grounding = validateContextEvidence(analysis, [spec.input, spec.context ?? ''].filter(Boolean).join('\n'));
  const text = JSON.stringify(analysis).toLowerCase();
  const semantic = spec.kind === 'friday'
    ? { developerContext: /developer|technical|coding|software|auth|merge|main/.test(text), ironicPraise: analysis.tone.includes('sarcastic') || analysis.tone.includes('playful') || /ironic|sarcasm/.test(text), weekendRisk: /weekend|friday/.test(text) }
    : spec.kind === 'praise'
      ? { sincerePraise: analysis.tone.includes('sincere'), warmth: /support|encourag|affirm|brave|difficult/.test(text), noSarcasmContamination: !analysis.tone.includes('sarcastic') && !/sarcasm|ironic/.test(text) }
      : { straightforward: !analysis.tone.includes('sarcastic') && !analysis.tone.includes('critical'), noInterpersonalTension: !/tension|passive.aggressive|frustration|warning/.test(text), noCulturalOverread: !/community norm|cultural subtext|slang/.test(text) };
  const semanticPass = Object.values(semantic).every(Boolean);
  const unsupportedClaims = [/discord|github/.test(text) ? 'unsupported_platform_claim' : '', /production definitely failed|deploy definitely broke|deployment definitely broke/.test(text) ? 'unsupported_failure_claim' : '', /identity|demographic|friend|teammate|coworker|relationship/.test(text) && spec.kind === 'praise' ? 'unsupported_relationship_claim' : ''].filter(Boolean);
  const pass = contract.valid && modelRefCount === validRefCount && grounding.invalid.length === 0 && grounding.exactMatches === grounding.total && semanticPass && unsupportedClaims.length === 0;
  return { case: spec.id, model: modelName, attempt, gate, interpreterInvoked: true, requests, latencyMs: Date.now() - started, modelContract: 'pass', evidenceRefs: { total: modelRefCount, valid: validRefCount, invalid: modelRefCount - validRefCount }, finalContextAnalysisContract: contract.valid ? 'pass' : 'fail', grounding: { total: grounding.total, exact: grounding.exactMatches, invalid: grounding.invalid.length }, semantic: { ...semantic, pass: semanticPass }, unsupportedClaims, verdict: pass ? 'PASS' : 'FAIL', ...(pass ? {} : { hardFailure: grounding.invalid.length ? 'hallucinated_evidence' : 'semantic_or_contract_failure' }) };
}

function failureSummary(error: unknown, fetcher: PowerShellGeminiFetcher): Record<string, unknown> {
  if (error instanceof ContextProviderError) return { category: error.code, stage: error.diagnostics?.stage ?? 'provider_error', status: error.diagnostics?.status ?? fetcher.lastResponse?.status ?? null, evidenceRefsTotal: error.diagnostics?.evidenceTotal, evidenceRefsValid: error.diagnostics?.evidenceExactMatches, evidenceRefsInvalid: error.diagnostics?.evidenceInvalid };
  if (error instanceof ContextGateError) return { category: error.stage, stage: error.stage, status: error.status ?? fetcher.lastResponse?.status ?? null };
  return { category: 'provider_transport_error', stage: 'transport', status: fetcher.lastResponse?.status ?? null };
}

function isTransient(error: unknown, fetcher: PowerShellGeminiFetcher): boolean {
  const status = error instanceof ContextProviderError ? error.diagnostics?.status : error instanceof ContextGateError ? error.status : fetcher.lastResponse?.status;
  const stage = error instanceof ContextProviderError ? error.diagnostics?.stage : error instanceof ContextGateError ? error.stage : 'transport';
  return stage === 'timeout' || stage === 'fetch_error' || stage === 'transport' || status === 429 || (status !== undefined && status !== null && status >= 500);
}

async function main(): Promise<void> {
  const environment = await loadEvaluationModelEnvironment();
  const results: Record<string, unknown>[] = [];
  for (const spec of runnableCases) {
    const result = await runCase(spec, environment);
    results.push(result);
    if (result.verdict === 'FAIL' || result.verdict === 'PROVIDER_BLOCKED') break;
  }
  const hardFailure = results.find((result) => result.hardFailure);
  for (const remaining of runnableCases.slice(results.length)) results.push({ case: remaining.id, model, verdict: 'NOT_RUN', note: 'Stopped after earlier hard failure.' });
  const overall = hardFailure ? 'FAIL' : results.some((result) => result.providerBlocked) ? 'PROVIDER_BLOCKED' : results.some((result) => result.verdict === 'NOT_RUN') ? 'other' : 'PASS';
  const report = { runId: 'task09b-four-case-preflight-02', transport: 'evaluation-only PowerShell bridge', productionWorkerPathUsed: false, model, reasoningEffort: 'low', casesRequested: 4, casesRun: results.filter((result) => result.verdict !== 'NOT_RUN').length, results, hardFailures: hardFailure ? [hardFailure.hardFailure] : [], overallVerdict: overall };
  const path = resolve(process.cwd(), 'evaluation', 'reports', 'task09b-four-case-preflight-02.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ runId: report.runId, casesRun: report.casesRun, overallVerdict: report.overallVerdict }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Four-case preflight failed.'); process.exitCode = 1; });
