import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ContextAnalysis } from '../../shared/contracts/context';
import type { ContextGateResult } from '../../shared/contracts/context-gate';
import { diagnoseContextAnalysis } from '../../shared/schemas/context';
import { AIContextEngine } from '../../worker/engine/context-engine';
import { AIContextGateEngine, ContextGateError } from '../../worker/engine/context-gate';
import { ContextProviderError, ModelContextProvider, type FetchLike } from '../../worker/providers/context-provider';
import { createPowerShellGeminiFetcher, loadEvaluationModelEnvironment, type PowerShellGeminiFetcher } from '../transports/powershell-gemini-transport';

const model = 'gemini-3.5-flash';
const reasoningEffort = 'low' as const;
const fridayInput = 'Nora: just merged the auth rewrite into main\n\nKai: on a friday??\n\nLeo: fearless behavior 💀\n\nNora: wait what\n\nKai: nothing. enjoy your weekend';
const genuinePraiseInput = 'fearless behavior 💀';
const genuinePraiseContext = 'Mia: I finally spoke up about the issue.\n\nAlex: That was fearless behavior.';
const readmeInput = 'Sideglance first checks whether the available context is sufficient.';

type CaseSpec = { id: 'A' | 'B' | 'C' | 'D'; input: string; context?: string; expectedGate: 'ready' | 'needs_context'; kind: 'friday' | 'ambiguous' | 'praise' | 'readme' };
type RequestRecord = { status: number | null; latencyMs: number; stage: 'gate' | 'interpreter' };

const cases: CaseSpec[] = [
  { id: 'A', input: fridayInput, expectedGate: 'ready', kind: 'friday' },
  { id: 'B', input: 'fearless behavior 💀', expectedGate: 'needs_context', kind: 'ambiguous' },
  { id: 'C', input: genuinePraiseInput, context: genuinePraiseContext, expectedGate: 'ready', kind: 'praise' },
  { id: 'D', input: readmeInput, expectedGate: 'ready', kind: 'readme' },
];

async function runCase(spec: CaseSpec, environment: Awaited<ReturnType<typeof loadEvaluationModelEnvironment>>): Promise<Record<string, unknown>> {
  let lastFailure: Record<string, unknown> | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const baseFetcher = createPowerShellGeminiFetcher(environment);
    const requests: RequestRecord[] = [];
    let stage: RequestRecord['stage'] = 'gate';
    const fetcher: FetchLike = async (input, init) => {
      const started = Date.now();
      try {
        const response = await baseFetcher(input, init);
        requests.push({ stage, status: response.status, latencyMs: Date.now() - started });
        return response;
      } catch (error) {
        requests.push({ stage, status: baseFetcher.lastResponse?.status ?? null, latencyMs: Date.now() - started });
        throw error;
      }
    };
    const gate = new AIContextGateEngine({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, reasoningEffort });
    const started = Date.now();
    try {
      const gateResult = await gate.checkContext(spec.input, spec.context);
      const gateValid = gateResult.status === spec.expectedGate;
      if (!gateValid) return caseFailure(spec, attempt, requests, started, 'gate_expectation_failed', gateResult);
      if (gateResult.status === 'needs_context') return caseSuccess(spec, attempt, requests, started, gateResult, undefined);
      stage = 'interpreter';
      const provider = new ModelContextProvider({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, responseFormat: true });
      const analysis = await new AIContextEngine(provider).analyze(spec.input, spec.context);
      const contract = diagnoseContextAnalysis(analysis);
      const grounding = cueGrounding(spec.input, analysis);
      const semantics = semanticCheck(spec.kind, analysis);
      const unsupportedClaims = unsupportedClaimsIn(analysis);
      const verdict = contract.valid && grounding.invalid === 0 && semantics.pass && unsupportedClaims.length === 0 ? 'PASS' : 'FAIL';
      return { case: spec.id, model, attempt, gate: summarizeGate(gateResult), gateContract: 'pass', interpreterInvoked: true, httpAttempts: requests, latencyMs: Date.now() - started, contextAnalysisContract: contract.valid ? 'pass' : 'fail', semantic: semantics, unsupportedClaims, grounding, verdict };
    } catch (error) {
      const failure = failureSummary(error, baseFetcher, attempt, requests, started);
      lastFailure = { case: spec.id, model, attempt, gate: 'not_reached_or_failed', interpreterInvoked: stage === 'interpreter', httpAttempts: requests, latencyMs: Date.now() - started, failure };
      if (!isRetryable(error, baseFetcher)) return { ...lastFailure, verdict: 'FAIL' };
      if (attempt === 2) return { ...lastFailure, verdict: 'PROVIDER_BLOCKED' };
    }
  }
  return { ...(lastFailure ?? { case: spec.id, verdict: 'PROVIDER_BLOCKED' }), verdict: 'PROVIDER_BLOCKED' };
}

function caseSuccess(spec: CaseSpec, attempt: number, requests: RequestRecord[], started: number, gate: ContextGateResult, analysis: undefined): Record<string, unknown> {
  const questionValid = typeof gate.question === 'string' && (gate.question.match(/\?/g) ?? []).length === 1;
  const semantic = { pass: spec.kind === 'ambiguous' && questionValid, checks: { oneSpecificQuestion: questionValid, interpreterNotRun: analysis === undefined } };
  return { case: spec.id, model, attempt, gate: summarizeGate(gate), gateContract: 'pass', interpreterInvoked: false, httpAttempts: requests, latencyMs: Date.now() - started, contextAnalysisContract: 'not_reached', semantic, unsupportedClaims: [], grounding: 'not_applicable', verdict: semantic.pass ? 'PASS' : 'FAIL' };
}

function caseFailure(spec: CaseSpec, attempt: number, requests: RequestRecord[], started: number, reason: string, gate: ContextGateResult): Record<string, unknown> {
  return { case: spec.id, model, attempt, gate: summarizeGate(gate), gateContract: 'pass', interpreterInvoked: false, httpAttempts: requests, latencyMs: Date.now() - started, contextAnalysisContract: 'not_reached', semantic: { pass: false, checks: { reason } }, unsupportedClaims: [], grounding: 'not_applicable', verdict: 'FAIL' };
}

function summarizeGate(result: ContextGateResult): Record<string, unknown> { return { status: result.status, confidence: result.confidence, reason: result.reason, hasQuestion: typeof result.question === 'string', hasMissingInformation: typeof result.missingInformation === 'string', sufficiency: result.sufficiency }; }

function cueGrounding(input: string, analysis: ContextAnalysis): { formalEvidence: string; specificCueCount: number; exactCueCount: number; invalid: number } {
  const cues = analysis.signals.map((signal) => signal.phrase.trim()).filter(Boolean);
  const exactCueCount = cues.filter((cue) => input.toLowerCase().includes(cue.toLowerCase())).length;
  return { formalEvidence: 'not_enforced_by_current_contract', specificCueCount: cues.length, exactCueCount, invalid: cues.length - exactCueCount };
}

function semanticCheck(kind: CaseSpec['kind'], analysis: ContextAnalysis): { pass: boolean; checks: Record<string, boolean> } {
  const text = JSON.stringify(analysis).toLowerCase();
  const tone = analysis.tone;
  if (kind === 'friday') return { pass: /technical|developer|coding|software|auth|merge|main/.test(text) && tone.some((item) => item === 'playful' || item === 'sarcastic') && /weekend|friday/.test(text), checks: { developerContext: /technical|developer|coding|software|auth|merge|main/.test(text), ironicPraise: tone.some((item) => item === 'playful' || item === 'sarcastic'), weekendRisk: /weekend|friday/.test(text) } };
  if (kind === 'praise') return { pass: tone.includes('sincere') && !tone.includes('sarcastic') && !/tension|conflict|ironic|sarcasm/.test(text), checks: { sincerePraise: tone.includes('sincere'), noSarcasmContamination: !tone.includes('sarcastic') && !/ironic|sarcasm/.test(text), noInventedTension: !/tension|conflict/.test(text) } };
  if (kind === 'readme') return { pass: !tone.includes('sarcastic') && !/hidden tension|interpersonal tension|cultural overread|sarcasm/.test(text), checks: { straightforward: !tone.includes('sarcastic'), noInterpersonalTension: !/tension|conflict/.test(text), noCulturalOverread: !/cultural|community norm|slang/.test(text) } };
  return { pass: false, checks: {} };
}

function unsupportedClaimsIn(analysis: ContextAnalysis): string[] {
  const text = JSON.stringify(analysis).toLowerCase();
  const claims: string[] = [];
  if (/discord|github/.test(text)) claims.push('unsupported_platform_claim');
  if (/production definitely failed|deploy definitely broke/.test(text)) claims.push('unsupported_failure_claim');
  if (/identity|demographic/.test(text)) claims.push('unsupported_identity_claim');
  return claims;
}

function failureSummary(error: unknown, fetcher: PowerShellGeminiFetcher, attempt: number, requests: RequestRecord[], started: number): Record<string, unknown> {
  if (error instanceof ContextGateError) return { category: categoryFor(error.status, error.stage), stage: error.stage, status: error.status ?? fetcher.lastResponse?.status ?? null, latencyMs: Date.now() - started, attempt, requestCount: requests.length };
  if (error instanceof ContextProviderError) return { category: categoryFor(error.diagnostics?.status, error.diagnostics?.stage), stage: error.diagnostics?.stage ?? 'provider_error', status: error.diagnostics?.status ?? fetcher.lastResponse?.status ?? null, latencyMs: Date.now() - started, attempt, requestCount: requests.length };
  return { category: 'provider_transport_error', stage: 'transport', status: fetcher.lastResponse?.status ?? null, latencyMs: Date.now() - started, attempt, requestCount: requests.length };
}

function categoryFor(status: number | null | undefined, stage: string | undefined): string {
  if (status === 429) return 'provider_429';
  if (status !== undefined && status !== null && status >= 500) return 'provider_5xx';
  if (stage === 'timeout' || stage === 'fetch_error' || stage === 'transport') return 'provider_transport_timeout_or_error';
  return 'provider_error';
}

function isRetryable(error: unknown, fetcher: PowerShellGeminiFetcher): boolean {
  const status = error instanceof ContextGateError ? error.status : error instanceof ContextProviderError ? error.diagnostics?.status : fetcher.lastResponse?.status;
  const stage = error instanceof ContextGateError ? error.stage : error instanceof ContextProviderError ? error.diagnostics?.stage : 'transport';
  return stage === 'timeout' || stage === 'transport' || stage === 'fetch_error' || status === 429 || (status !== undefined && status !== null && status >= 500);
}

async function main(): Promise<void> {
  const environment = await loadEvaluationModelEnvironment();
  const results: Record<string, unknown>[] = [];
  for (const spec of cases) {
    const result = await runCase(spec, environment);
    results.push(result);
    if (result.verdict === 'FAIL' || result.verdict === 'PROVIDER_BLOCKED') break;
  }
  const overall = results.length === cases.length && results.every((result) => result.verdict === 'PASS') ? 'PASS' : results.some((result) => result.verdict === 'PROVIDER_BLOCKED') ? 'PROVIDER_BLOCKED' : 'FAIL';
  const report = { runId: 'task09b-four-case-preflight', transport: 'evaluation-only PowerShell bridge', productionWorkerPathUsed: false, model, reasoningEffort, casesRequested: cases.length, casesRun: results.length, overallVerdict: overall, results };
  const outputPath = resolve(process.cwd(), 'evaluation', 'reports', 'task09b-four-case-preflight.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ runId: report.runId, casesRun: report.casesRun, overallVerdict: report.overallVerdict }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Preflight failed.'); process.exitCode = 1; });
