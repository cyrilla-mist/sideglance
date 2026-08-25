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
    return { attempt, httpStatus: fetcher.lastResponse?.status ?? null, latencyMs: Date.now() - started, structuredOutputAccepted: true, jsonParse: 'pass', gateContract: 'pass', gateResult: result.status, missingInformationPresent: typeof result.missingInformation === 'string' && result.missingInformation.trim().length > 0, questionCount, questionQuality, interpreterInvoked: false, semanticConclusionMade: false, verdict: result.status === 'needs_context' && questionCount === 1 && questionQuality ? 'PASS' : 'FAIL' };
  } catch (error) {
    const transient = isTransient(error, fetcher);
    const providerError = error instanceof ContextGateError;
    const status = providerError ? error.status ?? fetcher.lastResponse?.status ?? null : fetcher.lastResponse?.status ?? null;
    const schemaRejected = providerError && error.stage === 'http_error' && status === 400;
    return { attempt, httpStatus: status, latencyMs: Date.now() - started, structuredOutputAccepted: false, safeProviderCategory: schemaRejected ? 'structured_output_schema_rejected' : providerError ? error.stage : 'transport_error', safeProviderMessage: providerError ? error.providerMessage : undefined, jsonParse: providerError && error.stage === 'invalid_contract' ? 'pass' : 'not_reached', gateContract: providerError && error.stage === 'invalid_contract' ? 'fail' : 'not_reached', safeContractIssues: providerError ? error.issues ?? [] : [], gateResult: 'not_reached', missingInformationPresent: false, questionCount: 0, questionQuality: false, interpreterInvoked: false, semanticConclusionMade: false, verdict: transient ? 'RETRYABLE' : schemaRejected ? 'SCHEMA_REJECTED' : 'FAIL' };
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
  const finalVerdict = final?.verdict === 'PASS' ? 'FEARLESS_STRUCTURED_GATE_PASS' : final?.verdict === 'SCHEMA_REJECTED' ? 'GATE_JSON_SCHEMA_PROVIDER_INCOMPATIBILITY' : final?.verdict === 'RETRYABLE' ? 'PROVIDER_BLOCKED' : 'STRUCTURED_GATE_CONTRACT_NONCOMPLIANCE';
  const report = { runId: 'task09b-fearless-structured-gate', model, reasoningEffort: 'low', responseFormatMode: 'json_schema', transport: 'evaluation-only PowerShell bridge', attempts, finalVerdict };
  const path = resolve(process.cwd(), 'evaluation', 'reports', 'task09b-fearless-structured-gate.json');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ runId: report.runId, attempts: attempts.length, finalVerdict }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Structured Gate validation failed.'); process.exitCode = 1; });
