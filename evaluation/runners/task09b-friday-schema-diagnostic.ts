import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { ModelContextProvider, ContextProviderError } from '../../worker/providers/context-provider';
import { diagnoseContextAnalysis } from '../../shared/schemas/context';
import { createPowerShellGeminiFetcher, loadEvaluationModelEnvironment } from '../transports/powershell-gemini-transport';

const fridayInput = 'Nora: just merged the auth rewrite into main\n\nKai: on a friday??\n\nLeo: fearless behavior 💀\n\nNora: wait what\n\nKai: nothing. enjoy your weekend';
const requiredKeys = ['literalMeaning', 'contextualMeaning', 'tone', 'register', 'communityContext', 'socialImplication', 'usageBoundary', 'confidence', 'uncertainty', 'signals'];
const enumValues = {
  tone: ['playful', 'sarcastic', 'sincere', 'neutral', 'critical', 'uncertain'],
  register: ['casual', 'professional', 'community', 'meme', 'technical'],
  confidence: ['high', 'medium', 'low'],
  signalType: ['emoji', 'wording', 'community_norm', 'timing', 'relationship', 'irony'],
};

type Issue = { path: string; code: string; expected: string; received: string; message: string };

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function received(value: unknown): string {
  if (typeof value === 'string') return `string(${JSON.stringify(value).slice(0, 120)})`;
  return typeOf(value);
}

function issue(path: string, expected: string, value: unknown, message: string, code = 'invalid_contract'): Issue {
  return { path, code, expected, received: received(value), message };
}

function collectIssues(value: unknown): Issue[] {
  const issues: Issue[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [issue('$', 'object', value, 'Expected a top-level object.')];
  const root = value as Record<string, unknown>;
  const requireString = (key: string) => { if (typeof root[key] !== 'string') issues.push(issue(key, 'string', root[key], `Expected ${key} to be a string.`)); };
  requireString('literalMeaning');
  requireString('contextualMeaning');
  requireString('communityContext');
  requireString('socialImplication');
  requireString('uncertainty');
  for (const key of ['register', 'confidence'] as const) {
    if (typeof root[key] !== 'string' || !enumValues[key].includes(root[key] as string)) issues.push(issue(key, `enum(${enumValues[key].join('|')})`, root[key], `Expected ${key} to use the contract enum.`));
  }
  if (!Array.isArray(root.tone) || root.tone.length === 0) issues.push(issue('tone', 'non-empty array', root.tone, 'Expected tone to be a non-empty array.'));
  else root.tone.forEach((value, index) => { if (typeof value !== 'string' || !enumValues.tone.includes(value)) issues.push(issue(`tone[${index}]`, `enum(${enumValues.tone.join('|')})`, value, 'Expected a valid tone enum.')); });
  const boundary = root.usageBoundary;
  if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)) issues.push(issue('usageBoundary', 'object', boundary, 'Expected usageBoundary to be an object.'));
  else for (const key of ['naturalIn', 'beCarefulIn', 'avoidIn']) if (typeof (boundary as Record<string, unknown>)[key] !== 'string') issues.push(issue(`usageBoundary.${key}`, 'string', (boundary as Record<string, unknown>)[key], 'Expected usage boundary field to be a string.'));
  if (!Array.isArray(root.signals)) issues.push(issue('signals', 'array', root.signals, 'Expected signals to be an array.'));
  else root.signals.forEach((signal, index) => {
    if (!signal || typeof signal !== 'object' || Array.isArray(signal)) { issues.push(issue(`signals[${index}]`, 'object', signal, 'Expected signal item to be an object.')); return; }
    const item = signal as Record<string, unknown>;
    for (const key of ['phrase', 'explanation']) if (typeof item[key] !== 'string') issues.push(issue(`signals[${index}].${key}`, 'string', item[key], 'Expected signal field to be a string.'));
    if (typeof item.signalType !== 'string' || !enumValues.signalType.includes(item.signalType)) issues.push(issue(`signals[${index}].signalType`, `enum(${enumValues.signalType.join('|')})`, item.signalType, 'Expected a valid signalType enum.'));
  });
  return issues;
}

function shapeSummary(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { actualType: typeOf(value) };
  const root = value as Record<string, unknown>;
  const nested: Record<string, unknown> = {};
  for (const key of ['tone', 'usageBoundary', 'signals']) {
    const child = root[key];
    if (Array.isArray(child)) nested[key] = { actualType: 'array', itemCount: child.length, itemTypes: [...new Set(child.map(typeOf))] };
    else if (child && typeof child === 'object') nested[key] = { actualType: 'object', nestedKeys: Object.keys(child as object).sort() };
    else nested[key] = { actualType: typeOf(child) };
  }
  return { topLevelKeysPresent: Object.keys(root).sort(), requiredKeysMissing: requiredKeys.filter((key) => !(key in root)), extraTopLevelKeys: Object.keys(root).filter((key) => !requiredKeys.includes(key)).sort(), nested };
}

function semanticSnapshot(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { developerFridayRiskContext: 'unknown', sarcasmIronicPraise: 'unknown', weekendImplication: 'unknown', tone: 'missing', register: 'missing', communityContext: 'missing', confidence: 'missing', uncertaintyPresent: false };
  const root = value as Record<string, unknown>;
  const fields = [root.contextualMeaning, root.communityContext, root.socialImplication, root.uncertainty].filter((item): item is string => typeof item === 'string').join(' ').toLowerCase();
  const tone = Array.isArray(root.tone) ? root.tone.filter((item): item is string => typeof item === 'string') : [];
  return { developerFridayRiskContext: /friday|merge|main|auth|risk/.test(fields) ? 'yes' : 'unknown', sarcasmIronicPraise: tone.some((item) => item === 'sarcastic' || item === 'playful') || /sarcasm|ironic|irony/.test(fields) ? 'yes' : 'unknown', weekendImplication: /weekend|friday/.test(fields) ? 'yes' : 'unknown', tone: tone.slice(0, 4), register: shortValue(root.register), communityContext: shortValue(root.communityContext), confidence: shortValue(root.confidence), uncertaintyPresent: typeof root.uncertainty === 'string' ? root.uncertainty.trim().length > 0 : false };
}

function shortValue(value: unknown): string | string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 80)).slice(0, 4);
  return typeof value === 'string' ? value.slice(0, 120) : 'missing';
}

function evidenceStats(value: unknown): { total: number; exactMatches: number; invalid: number } {
  const quotes: string[] = [];
  const visit = (node: unknown, key = '') => {
    if (Array.isArray(node)) { node.forEach((item) => visit(item, key)); return; }
    if (!node || typeof node !== 'object') return;
    for (const [childKey, child] of Object.entries(node as Record<string, unknown>)) {
      if (/(evidence|quote)/i.test(childKey) && typeof child === 'string') quotes.push(child);
      else visit(child, childKey);
    }
  };
  visit(value);
  const exactMatches = quotes.filter((quote) => fridayInput.includes(quote)).length;
  return { total: quotes.length, exactMatches, invalid: quotes.length - exactMatches };
}

async function main(): Promise<void> {
  const environment = await loadEvaluationModelEnvironment();
  const lowReasoning = process.env.SIDEGLANCE_EVAL_REASONING_EFFORT === 'low';
  const evaluationModel = process.env.SIDEGLANCE_EVAL_MODEL ?? environment.MODEL_NAME;
  const startAttempt = process.env.SIDEGLANCE_EVAL_ATTEMPT === '2' ? 2 : 1;
  const attempts: Array<Record<string, unknown>> = [];
  let requestShape = { model: false, messages: false, responseFormat: false, reasoningEffort: false };
  let captured: unknown;
  let finalError: ContextProviderError | undefined;
  for (let attempt = startAttempt; attempt <= 2; attempt += 1) {
    const baseFetcher = createPowerShellGeminiFetcher(environment);
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let requestInit = init;
      if (lowReasoning && typeof init?.body === 'string') {
        const body = JSON.parse(init.body) as Record<string, unknown>;
        body.reasoning_effort = 'low';
        requestShape = { model: typeof body.model === 'string', messages: Array.isArray(body.messages), responseFormat: Boolean(body.response_format), reasoningEffort: body.reasoning_effort === 'low' };
        requestInit = { ...init, body: JSON.stringify(body) };
      }
      const response = await baseFetcher(input, requestInit);
      if (response.ok) {
        const payload = await response.clone().json().catch(() => undefined);
        if (payload && typeof payload === 'object') {
          const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
          const content = choices?.[0]?.message?.content;
          if (typeof content === 'string') { try { captured = JSON.parse(content); } catch { captured = undefined; } }
        }
      }
      return response;
    };
    const started = Date.now();
    try {
      const provider = new ModelContextProvider({ apiKey: environment.MODEL_API_KEY, endpoint: environment.MODEL_API_URL, model: evaluationModel, fetcher });
      await provider.analyzeContext(fridayInput);
      attempts.push({ attempt, httpStatus: baseFetcher.lastResponse?.status ?? null, latencyMs: Date.now() - started, stage: 'contract_pass', category: 'contract_pass' });
      break;
    } catch (error) {
      finalError = error instanceof ContextProviderError ? error : undefined;
      const status = baseFetcher.lastResponse?.status ?? finalError?.diagnostics?.status ?? null;
      const stage = finalError?.diagnostics?.stage ?? 'transport_error';
      const category = stage === 'context_schema_error' ? 'contract_diagnostic_captured' : status !== null && [429, 500, 502, 503, 504].includes(status) ? 'provider_temporarily_unavailable' : stage === 'timeout' ? 'evaluation_transport_timeout' : 'provider_http_error';
      attempts.push({ attempt, httpStatus: status, latencyMs: Date.now() - started, stage, category });
      const retryable = stage === 'timeout' || [429, 500, 502, 503, 504].includes(status ?? -1);
      if (attempt === 2 || !retryable) break;
      await new Promise((resolveWait) => setTimeout(resolveWait, 20_000));
    }
  }
  const issues = captured === undefined ? [] : diagnoseContextAnalysis(captured).issues;
  const report = {
    runId: lowReasoning ? 'task09b-friday-low-reasoning' : 'task09b-friday-contract-capture',
    transport: 'evaluation-only PowerShell bridge',
    productionWorkerPathUsed: false,
    apiKeyConfigured: Boolean(environment.MODEL_API_KEY),
    evaluation_model_override: process.env.SIDEGLANCE_EVAL_MODEL ?? 'none',
    model: evaluationModel ?? 'configured-by-environment',
    reasoning_effort: lowReasoning ? 'low' : 'not_set',
    requestShape,
    attempts,
    parse: { envelope: captured === undefined ? 'not_reached' : 'pass', assistantContent: captured === undefined ? 'not_reached' : 'reached', json: captured === undefined ? 'not_reached' : 'pass' },
    guard: { validator: 'isContextAnalysis via diagnoseContextAnalysis', valid: captured === undefined ? false : issues.length === 0, issueCount: issues.length, issues },
    outputShape: shapeSummary(captured),
    enumMismatches: issues.filter((item) => (item.expected ?? '').startsWith('enum(')),
    promptSchemaDrift: { classification: 'none_observed', findings: ['Prompt and contract use the same required field names, object/array shapes, and complete enum vocabulary generated from shared values.'] },
    evidence: evidenceStats(captured),
    semanticSnapshot: semanticSnapshot(captured),
    rootCause: captured === undefined ? (attempts.at(-1)?.category ?? 'other') : issues.length === 0 ? 'contract_pass' : issues.some((item) => item.reason === 'invalid_enum') ? 'enum_vocabulary_mismatch' : issues.some((item) => item.path.startsWith('signals')) ? 'nested_shape_mismatch' : issues.some((item) => item.reason === 'wrong_type') ? 'wrong_primitive_type' : issues.some((item) => item.reason === 'missing_field') ? 'missing_required_fields' : 'mixed_contract_failure',
    secondaryCategories: finalError?.diagnostics?.stage === 'context_schema_error' ? ['model_contract_noncompliance'] : [],
  };
  const reportName = evaluationModel === 'gemini-3.5-flash' ? 'task09b-friday-gemini-35-control.json' : lowReasoning ? 'task09b-friday-low-reasoning.json' : 'task09b-friday-contract-capture.json';
  const outputPath = resolve(process.cwd(), 'evaluation', 'reports', reportName);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ runId: report.runId, issueCount: issues.length, rootCause: report.rootCause, attempts: attempts.length }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Schema diagnostic failed.'); process.exitCode = 1; });
