import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { AIContextGateEngine, ContextGateError } from '../../worker/engine/context-gate';
import { createPowerShellGeminiFetcher, loadEvaluationModelEnvironment, type PowerShellGeminiFetcher } from '../transports/powershell-gemini-transport';

const model = 'gemini-3.5-flash';
const input = 'fearless behavior 💀';

async function runAttempt(environment: Awaited<ReturnType<typeof loadEvaluationModelEnvironment>>, attempt: number): Promise<Record<string, unknown>> {
  const fetcher = createPowerShellGeminiFetcher(environment);
  const started = Date.now();
  try {
    const result = await new AIContextGateEngine({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model, fetcher, reasoningEffort: 'low' }).checkContext(input);
    const questionCount = result.status === 'needs_context' && result.question ? (result.question.match(/\?/g) ?? []).length : 0;
    const questionQuality = result.status === 'needs_context' && typeof result.question === 'string' && /before|surrounding|exchange|happened|said/i.test(result.question) && !/sarcasm|praise|demographic|identity|relationship/i.test(result.question);
    const pass = result.status === 'needs_context' && questionCount === 1 && questionQuality;
    return { attempt, httpStatus: fetcher.lastResponse?.status ?? null, latencyMs: Date.now() - started, jsonParse: 'pass', gateContract: 'pass', gateResult: result.status, questionCount, questionQuality, interpreterInvoked: false, semanticConclusionMade: false, verdict: pass ? 'PASS' : 'FAIL', ...(pass ? {} : { hardFailure: 'gate_result_or_question_quality' }) };
  } catch (error) {
    const transient = isTransient(error, fetcher);
    const diagnostics = error instanceof ContextGateError ? { category: error.stage, status: error.status ?? fetcher.lastResponse?.status ?? null, issues: error.issues ?? [] } : { category: 'provider_transport_error', status: fetcher.lastResponse?.status ?? null, issues: [] };
    return { attempt, httpStatus: diagnostics.status, latencyMs: Date.now() - started, jsonParse: error instanceof ContextGateError && error.stage === 'invalid_contract' ? 'pass' : 'not_reached', gateContract: error instanceof ContextGateError && error.stage === 'invalid_contract' ? 'fail' : 'not_reached', safeContractIssues: diagnostics.issues, gateResult: 'not_reached', questionCount: 0, questionQuality: false, interpreterInvoked: false, semanticConclusionMade: false, failureCategory: diagnostics.category, verdict: transient ? 'RETRYABLE' : 'FAIL', ...(transient ? {} : { hardFailure: error instanceof ContextGateError && error.stage === 'invalid_contract' ? 'gate_contract_noncompliance' : 'provider_or_gate_failure' }) };
  }
}

function isTransient(error: unknown, fetcher: PowerShellGeminiFetcher): boolean {
  const status = error instanceof ContextGateError ? error.status : fetcher.lastResponse?.status;
  const stage = error instanceof ContextGateError ? error.stage : 'transport';
  return stage === 'timeout' || stage === 'transport' || status === 429 || (status !== undefined && status !== null && status >= 500);
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
  const finalVerdict = final?.verdict === 'PASS' ? 'FEARLESS_GATE_PASS' : final?.verdict === 'RETRYABLE' ? 'PROVIDER_BLOCKED' : final?.hardFailure === 'gate_contract_noncompliance' ? 'GATE_CONTRACT_NONCOMPLIANCE' : 'other';
  const report = { runId: 'task09b-fearless-gate-recovery', staticRootCause: 'prompt_gate_contract_under_specified', promptChanged: true, model, reasoningEffort: 'low', attempts, finalVerdict };
  const path = resolve(process.cwd(), 'evaluation', 'reports', 'task09b-fearless-gate-recovery.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ runId: report.runId, attempts: attempts.length, finalVerdict }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Fearless gate recovery failed.'); process.exitCode = 1; });
