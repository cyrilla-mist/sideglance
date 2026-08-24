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

const model = 'gemini-3.5-flash';
const input = 'Nora: just merged the auth rewrite into main\n\nKai: on a friday??\n\nLeo: fearless behavior 💀\n\nNora: wait what\n\nKai: nothing. enjoy your weekend';

type RequestRecord = { stage: 'gate' | 'interpreter'; status: number | null; latencyMs: number };

async function runAttempt(environment: Awaited<ReturnType<typeof loadEvaluationModelEnvironment>>, attempt: number): Promise<Record<string, unknown>> {
  const baseFetcher = createPowerShellGeminiFetcher(environment);
  const catalog = buildEvidenceCatalog(input);
  const requests: RequestRecord[] = [];
  let stage: RequestRecord['stage'] = 'gate';
  let gate: Record<string, unknown> = { status: 'not_reached' };
  let modelReferenceCount = 0;
  let modelValidReferenceCount = 0;
  const fetcher: FetchLike = async (request, init) => {
    const started = Date.now();
    try {
      const response = await baseFetcher(request, init);
      requests.push({ stage, status: response.status, latencyMs: Date.now() - started });
      if (stage === 'interpreter' && response.ok) {
        const payload = await response.clone().json().catch(() => undefined) as { choices?: Array<{ message?: { content?: unknown } }> } | undefined;
        const content = payload?.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
          const modelOutput = JSON.parse(content) as { signals?: Array<{ evidenceRef?: unknown }> };
          const refs = Array.isArray(modelOutput.signals) ? modelOutput.signals.map((signal) => signal.evidenceRef).filter((ref): ref is string => typeof ref === 'string') : [];
          modelReferenceCount = refs.length;
          modelValidReferenceCount = refs.filter((ref) => catalog.some((unit) => unit.id === ref)).length;
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
    const gateEngine = new AIContextGateEngine({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, reasoningEffort: 'low' });
    const gateResult = await gateEngine.checkContext(input);
    gate = { status: gateResult.status, confidence: gateResult.confidence, reason: gateResult.reason, contract: 'pass' };
    if (gateResult.status !== 'ready') return { attempt, gate, interpreterInvoked: false, requests, latencyMs: Date.now() - started, verdict: 'FAIL', classification: 'gate_not_ready' };
    stage = 'interpreter';
    const provider = new ModelContextProvider({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, responseFormat: true });
    const analysis = await new AIContextEngine(provider).analyze(input);
    return success(attempt, gate, requests, started, analysis, modelReferenceCount, modelValidReferenceCount);
  } catch (error) {
    const invalidRef = error instanceof ContextProviderError && error.code === 'invalid_evidence_reference';
    const failure = error instanceof ContextProviderError ? { category: invalidRef ? 'invalid_evidence_reference' : 'provider_error', stage: error.diagnostics?.stage ?? 'provider_error', status: error.diagnostics?.status ?? baseFetcher.lastResponse?.status ?? null, evidenceRefCount: error.diagnostics?.evidenceTotal, validEvidenceRefs: error.diagnostics?.evidenceExactMatches, invalidEvidenceRefs: error.diagnostics?.evidenceInvalid } : error instanceof ContextGateError ? { category: 'provider_error', stage: error.stage, status: error.status ?? baseFetcher.lastResponse?.status ?? null } : { category: 'provider_transport_error', stage: 'transport', status: baseFetcher.lastResponse?.status ?? null };
    const transient = !invalidRef && isTransient(error, baseFetcher);
    return { attempt, gate, interpreterInvoked: stage === 'interpreter', requests, latencyMs: Date.now() - started, failure, verdict: transient ? 'RETRYABLE' : invalidRef ? 'MODEL_EVIDENCE_REFERENCE_NONCOMPLIANCE' : 'FAIL' };
  }
}

function success(attempt: number, gate: Record<string, unknown>, requests: RequestRecord[], started: number, analysis: ContextAnalysis, modelReferenceCount: number, modelValidReferenceCount: number): Record<string, unknown> {
  const contract = diagnoseContextAnalysis(analysis);
  const grounding = validateContextEvidence(analysis, input);
  const text = JSON.stringify(analysis).toLowerCase();
  const semantic = { developerFridayContext: /developer|technical|coding|software|auth|merge|main/.test(text), ironicPraise: analysis.tone.includes('sarcastic') || analysis.tone.includes('playful') || /ironic|sarcasm/.test(text), weekendImplication: /weekend|friday/.test(text), pass: false };
  semantic.pass = semantic.developerFridayContext && semantic.ironicPraise && semantic.weekendImplication;
  const unsupportedClaims = [/discord|github/.test(text) ? 'unsupported_platform_claim' : '', /production definitely failed|deploy definitely broke/.test(text) ? 'unsupported_failure_claim' : '', /identity|demographic/.test(text) ? 'unsupported_identity_claim' : ''].filter(Boolean);
  const verdict = contract.valid && grounding.valid && semantic.pass && unsupportedClaims.length === 0 && modelReferenceCount === modelValidReferenceCount ? 'GROUNDING_REFERENCE_PASS' : 'FAIL';
  return { attempt, gate, interpreterInvoked: true, requests, latencyMs: Date.now() - started, modelContract: contract.valid ? 'pass' : 'fail', evidenceRefs: { count: modelReferenceCount, valid: modelValidReferenceCount, invalid: modelReferenceCount - modelValidReferenceCount }, finalContextAnalysisContract: contract.valid ? 'pass' : 'fail', grounding: { total: grounding.total, exactMatches: grounding.exactMatches, invalid: grounding.invalid.length }, semantic, unsupportedClaims, verdict };
}

function isTransient(error: unknown, fetcher: PowerShellGeminiFetcher): boolean {
  const status = error instanceof ContextProviderError ? error.diagnostics?.status : error instanceof ContextGateError ? error.status : fetcher.lastResponse?.status;
  const stage = error instanceof ContextProviderError ? error.diagnostics?.stage : error instanceof ContextGateError ? error.stage : 'transport';
  return stage === 'timeout' || stage === 'fetch_error' || stage === 'transport' || status === 429 || (status !== undefined && status !== null && status >= 500);
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
  const finalClassification = final?.verdict === 'GROUNDING_REFERENCE_PASS' ? 'GROUNDING_REFERENCE_PASS' : final?.verdict === 'MODEL_EVIDENCE_REFERENCE_NONCOMPLIANCE' ? 'MODEL_EVIDENCE_REFERENCE_NONCOMPLIANCE' : final?.verdict === 'RETRYABLE' ? 'PROVIDER_BLOCKED' : 'other';
  const report = { runId: 'task09b-friday-evidence-reference', transport: 'evaluation-only PowerShell bridge', productionWorkerPathUsed: false, model, reasoningEffort: 'low', attempts, finalClassification };
  const path = resolve(process.cwd(), 'evaluation', 'reports', 'task09b-friday-evidence-reference.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ runId: report.runId, attempts: attempts.length, finalClassification }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Evidence reference calibration failed.'); process.exitCode = 1; });
