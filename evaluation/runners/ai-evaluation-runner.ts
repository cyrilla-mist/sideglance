import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { goldCases } from '../cases/gold';
import { ContextEvaluator, buildEvaluationReport } from '../evaluator/context-evaluator';
import type { EvaluationCase, EvaluationReport, EvaluationResult } from '../schemas/evaluation';
import type { ContextAnalysis } from '../../shared/contracts/context';
import { AIContextEngine, type ContextEngine } from '../../worker/engine/context-engine';
import { ContextProviderError, ModelContextProvider } from '../../worker/providers/context-provider';

export type FailureCategory = 'model_misunderstanding' | 'prompt_issue' | 'schema_issue' | 'evaluation_rule_issue' | 'provider_error';

export type AIEvaluationCaseRun = {
  caseId: string;
  input: string;
  modelResult: ContextAnalysis | null;
  evaluationResult: EvaluationResult | null;
  latencyMs: number;
  failureCategories: FailureCategory[];
  error?: string;
};

export type AIEvaluationReport = EvaluationReport & {
  runId: string;
  mode: 'ai';
  model: string;
  endpoint: string;
  promptRounds: number;
  startedAt: string;
  finishedAt: string;
  totalLatencyMs: number;
  averageLatencyMs: number;
  schemaFailures: number;
  tokenUsage: null;
  cost: null;
  cases: AIEvaluationCaseRun[];
};

export type AIEvaluationEnvironment = {
  MODEL_API_KEY?: string;
  MODEL_API_URL?: string;
  MODEL_NAME?: string;
};

export async function runAIEvaluation(
  cases: readonly EvaluationCase[],
  engine: ContextEngine,
  evaluator = new ContextEvaluator(),
  clock: () => number = Date.now,
): Promise<AIEvaluationReport> {
  const startedAt = new Date(clock()).toISOString();
  const caseRuns: AIEvaluationCaseRun[] = [];
  for (const caseItem of cases) {
    const started = clock();
    try {
      const modelResult = await engine.analyze(caseItem.input, caseItem.context);
      if (!modelResult) throw new Error('AI context engine returned no analysis.');
      const evaluationResult = evaluator.evaluate(caseItem, modelResult);
      caseRuns.push({ caseId: caseItem.id, input: caseItem.input, modelResult, evaluationResult, latencyMs: clock() - started, failureCategories: evaluationResult.passed ? [] : classifyEvaluationIssues(evaluationResult) });
    } catch (error) {
      const failureCategories: FailureCategory[] = error instanceof ContextProviderError
        ? (error.code === 'context_invalid_json' || error.code === 'context_schema_invalid' ? ['schema_issue'] : ['provider_error'])
        : ['provider_error'];
      caseRuns.push({ caseId: caseItem.id, input: caseItem.input, modelResult: null, evaluationResult: null, latencyMs: clock() - started, failureCategories, error: safeError(error) });
    }
  }
  const evaluationResults = caseRuns.flatMap((run) => run.evaluationResult ? [run.evaluationResult] : []);
  const evaluationSummary = buildEvaluationReport(evaluationResults);
  const totalLatencyMs = caseRuns.reduce((total, run) => total + run.latencyMs, 0);
  const finishedAt = new Date(clock()).toISOString();
  return {
    ...evaluationSummary,
    totalCases: cases.length,
    failedCases: cases.length - evaluationSummary.passedCases,
    runId: 'task06-run-01', mode: 'ai', model: 'configured-by-environment', endpoint: 'configured-by-environment', promptRounds: 1,
    startedAt, finishedAt, totalLatencyMs, averageLatencyMs: caseRuns.length ? totalLatencyMs / caseRuns.length : 0,
    schemaFailures: caseRuns.filter((run) => run.failureCategories.includes('schema_issue')).length, tokenUsage: null, cost: null, cases: caseRuns,
  };
}

function classifyEvaluationIssues(result: EvaluationResult): FailureCategory[] {
  const categories = new Set<FailureCategory>();
  for (const issue of result.issues) {
    if (issue.rule === 'tone_match' || issue.rule === 'register_match' || issue.rule === 'community_context' || issue.rule === 'required_signal') categories.add('model_misunderstanding');
    else if (issue.rule === 'uncertainty' || issue.rule === 'usage_boundary' || issue.rule === 'forbidden_claim') categories.add('prompt_issue');
    else categories.add('evaluation_rule_issue');
  }
  return [...categories];
}

export function serializeAIEvaluationReport(report: AIEvaluationReport): string {
  return JSON.stringify(report, null, 2);
}

export async function runAIEvaluationFromEnvironment(environment: AIEvaluationEnvironment): Promise<AIEvaluationReport> {
  if (!environment.MODEL_API_KEY) throw new Error('MODEL_API_KEY is required for an AI evaluation run.');
  const endpoint = environment.MODEL_API_URL ?? 'https://api.openai.com/v1/chat/completions';
  const model = environment.MODEL_NAME ?? 'gpt-4o-mini';
  const report = await runAIEvaluation(goldCases, new AIContextEngine(new ModelContextProvider({ apiKey: environment.MODEL_API_KEY, endpoint, model })));
  const outputPath = resolve(process.cwd(), 'evaluation', 'reports', 'task06-run-01.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serializeAIEvaluationReport({ ...report, model, endpoint }), 'utf8');
  return report;
}

function safeError(error: unknown): string {
  return error instanceof ContextProviderError ? error.message : 'AI evaluation case failed.';
}

const invokedAsCli = process.argv.some((argument) => argument.endsWith('ai-evaluation-runner.ts'));
if (invokedAsCli || process.env.SIDEGLANCE_RUN_AI_EVALUATION === '1') {
  runAIEvaluationFromEnvironment(process.env)
    .then((report) => console.log(JSON.stringify({ runId: report.runId, totalCases: report.totalCases, passedCases: report.passedCases, failedCases: report.failedCases, schemaFailures: report.schemaFailures })))
    .catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'AI evaluation could not run.'); process.exitCode = 1; });
}
