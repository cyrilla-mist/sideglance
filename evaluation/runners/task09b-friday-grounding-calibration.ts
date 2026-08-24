import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ContextAnalysis } from '../../shared/contracts/context';
import { diagnoseContextAnalysis } from '../../shared/schemas/context';
import { validateContextEvidence } from '../../shared/schemas/context-evidence';
import { AIContextEngine } from '../../worker/engine/context-engine';
import { AIContextGateEngine, ContextGateError } from '../../worker/engine/context-gate';
import { ContextProviderError, ModelContextProvider, type FetchLike } from '../../worker/providers/context-provider';
import { createPowerShellGeminiFetcher, loadEvaluationModelEnvironment, type PowerShellGeminiFetcher } from '../transports/powershell-gemini-transport';

const model = 'gemini-3.5-flash';
const input = 'Nora: just merged the auth rewrite into main\n\nKai: on a friday??\n\nLeo: fearless behavior 💀\n\nNora: wait what\n\nKai: nothing. enjoy your weekend';

type RequestRecord = { stage: 'gate' | 'interpreter'; status: number | null; latencyMs: number };

async function runAttempt(environment: Awaited<ReturnType<typeof loadEvaluationModelEnvironment>>, attempt: number): Promise<Record<string, unknown>> {
  const baseFetcher = createPowerShellGeminiFetcher(environment);
  const requests: RequestRecord[] = [];
  let stage: RequestRecord['stage'] = 'gate';
  let gateSummary: Record<string, unknown> = { status: 'not_reached' };
  const fetcher: FetchLike = async (request, init) => {
    const started = Date.now();
    try {
      const response = await baseFetcher(request, init);
      requests.push({ stage, status: response.status, latencyMs: Date.now() - started });
      return response;
    } catch (error) {
      requests.push({ stage, status: baseFetcher.lastResponse?.status ?? null, latencyMs: Date.now() - started });
      throw error;
    }
  };
  const started = Date.now();
  try {
    const gate = new AIContextGateEngine({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, reasoningEffort: 'low' });
    const gateResult = await gate.checkContext(input);
    gateSummary = { status: gateResult.status, confidence: gateResult.confidence, reason: gateResult.reason, contract: 'pass' };
    if (gateResult.status !== 'ready') return { attempt, gate: { status: gateResult.status, contract: 'pass' }, interpreterInvoked: false, requests, latencyMs: Date.now() - started, verdict: 'FAIL', classification: 'gate_not_ready' };
    stage = 'interpreter';
    const provider = new ModelContextProvider({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, responseFormat: true });
    const analysis = await new AIContextEngine(provider).analyze(input);
    return successfulResult(attempt, requests, started, gateResult, analysis);
  } catch (error) {
    const groundingFailure = error instanceof ContextProviderError && error.code === 'hallucinated_evidence';
    return { attempt, gate: gateSummary, interpreterInvoked: stage === 'interpreter', requests, latencyMs: Date.now() - started, failure: failureSummary(error, baseFetcher), verdict: groundingFailure ? 'MODEL_GROUNDING_NONCOMPLIANCE' : retryable(error, baseFetcher) ? 'RETRYABLE' : 'FAIL' };
  }
}

function successfulResult(attempt: number, requests: RequestRecord[], started: number, gate: { status: string; confidence: string; reason: string }, analysis: ContextAnalysis): Record<string, unknown> {
  const contract = diagnoseContextAnalysis(analysis);
  const grounding = validateContextEvidence(analysis, input);
  const semantic = semanticCheck(analysis);
  const unsupportedClaims = unsupportedClaimsIn(analysis);
  const verdict = contract.valid && grounding.valid && semantic.pass && unsupportedClaims.length === 0 ? 'PASS' : grounding.valid ? 'FAIL' : 'MODEL_GROUNDING_NONCOMPLIANCE';
  return { attempt, gate: { status: gate.status, confidence: gate.confidence, reason: gate.reason, contract: 'pass' }, interpreterInvoked: true, requests, latencyMs: Date.now() - started, contextAnalysisContract: contract.valid ? 'pass' : 'fail', grounding: { total: grounding.total, exactMatches: grounding.exactMatches, invalid: grounding.invalid.length, invalidSignalIndexes: grounding.invalid.map((issue) => issue.signalIndex) }, semantic, unsupportedClaims, verdict };
}

function semanticCheck(analysis: ContextAnalysis): { pass: boolean; developerFridayContext: boolean; ironicPraise: boolean; weekendImplication: boolean } {
  const text = JSON.stringify(analysis).toLowerCase();
  const developerFridayContext = /developer|technical|coding|software|auth|merge|main/.test(text);
  const ironicPraise = analysis.tone.includes('sarcastic') || analysis.tone.includes('playful') || /ironic|sarcasm/.test(text);
  const weekendImplication = /weekend|friday/.test(text);
  return { pass: developerFridayContext && ironicPraise && weekendImplication, developerFridayContext, ironicPraise, weekendImplication };
}

function unsupportedClaimsIn(analysis: ContextAnalysis): string[] {
  const text = JSON.stringify(analysis).toLowerCase();
  const claims: string[] = [];
  if (/discord|github/.test(text)) claims.push('unsupported_platform_claim');
  if (/production definitely failed|deploy definitely broke/.test(text)) claims.push('unsupported_failure_claim');
  if (/identity|demographic/.test(text)) claims.push('unsupported_identity_claim');
  return claims;
}

function failureSummary(error: unknown, fetcher: PowerShellGeminiFetcher): Record<string, unknown> {
  if (error instanceof ContextGateError) return { category: category(error.status, error.stage), stage: error.stage, status: error.status ?? fetcher.lastResponse?.status ?? null };
  if (error instanceof ContextProviderError) return { category: category(error.diagnostics?.status, error.diagnostics?.stage ?? 'provider_error'), stage: error.diagnostics?.stage ?? 'provider_error', status: error.diagnostics?.status ?? fetcher.lastResponse?.status ?? null, evidenceTotal: error.diagnostics?.evidenceTotal, evidenceExactMatches: error.diagnostics?.evidenceExactMatches, evidenceInvalid: error.diagnostics?.evidenceInvalid };
  return { category: 'provider_transport_error', stage: 'transport', status: fetcher.lastResponse?.status ?? null };
}

function category(status: number | null | undefined, stage: string): string {
  if (status === 429) return 'provider_429';
  if (status !== undefined && status !== null && status >= 500) return 'provider_5xx';
  if (stage === 'timeout' || stage === 'fetch_error' || stage === 'transport') return 'evaluation_transport_timeout_or_error';
  return 'provider_error';
}

function retryable(error: unknown, fetcher: PowerShellGeminiFetcher): boolean {
  const status = error instanceof ContextGateError ? error.status : error instanceof ContextProviderError ? error.diagnostics?.status : fetcher.lastResponse?.status;
  const stage = error instanceof ContextGateError ? error.stage : error instanceof ContextProviderError ? error.diagnostics?.stage : 'transport';
  return stage === 'timeout' || stage === 'transport' || stage === 'fetch_error' || status === 429 || (status !== undefined && status !== null && status >= 500);
}

async function main(): Promise<void> {
  const environment = await loadEvaluationModelEnvironment();
  const attempts: Record<string, unknown>[] = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await runAttempt(environment, attempt);
    attempts.push(result);
    if (result.verdict !== 'RETRYABLE') break;
  }
  const final = attempts.at(-1) as Record<string, unknown> | undefined;
  const finalVerdict = final?.verdict === 'PASS' ? 'GROUNDING_CALIBRATION_PASS' : final?.verdict === 'MODEL_GROUNDING_NONCOMPLIANCE' ? 'MODEL_GROUNDING_NONCOMPLIANCE' : final?.verdict === 'RETRYABLE' ? 'PROVIDER_BLOCKED' : 'other';
  const report = { runId: 'task09b-friday-grounding-calibration', calibrationRound: 2, transport: 'evaluation-only PowerShell bridge', productionWorkerPathUsed: false, model, reasoningEffort: 'low', attempts, finalVerdict };
  const path = resolve(process.cwd(), 'evaluation', 'reports', 'task09b-friday-grounding-calibration.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ runId: report.runId, attempts: attempts.length, finalVerdict }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Friday grounding calibration failed.'); process.exitCode = 1; });
