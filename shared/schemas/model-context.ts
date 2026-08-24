import type { ModelContextAnalysis } from '../contracts/model-context';
import { CONTEXT_CONFIDENCE_VALUES, CONTEXT_REGISTER_VALUES, CONTEXT_SIGNAL_TYPE_VALUES, CONTEXT_TONE_VALUES } from './context';

export type ModelContextIssue = { path: string; reason: 'missing_field' | 'wrong_type' | 'invalid_enum' | 'invalid_shape'; expected: string };

export function diagnoseModelContextAnalysis(value: unknown): { valid: boolean; issues: ModelContextIssue[] } {
  const issues: ModelContextIssue[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, issues: [{ path: '$', reason: 'wrong_type', expected: 'object' }] };
  const root = value as Record<string, unknown>;
  for (const key of ['literalMeaning', 'contextualMeaning', 'communityContext', 'socialImplication', 'uncertainty']) if (typeof root[key] !== 'string') issues.push({ path: key, reason: key in root ? 'wrong_type' : 'missing_field', expected: 'string' });
  enumField(root, 'register', CONTEXT_REGISTER_VALUES, issues);
  enumField(root, 'confidence', CONTEXT_CONFIDENCE_VALUES, issues);
  if (!Array.isArray(root.tone) || root.tone.length === 0) issues.push({ path: 'tone', reason: 'invalid_shape', expected: 'non-empty array' });
  else root.tone.forEach((tone, index) => { if (typeof tone !== 'string' || !CONTEXT_TONE_VALUES.includes(tone as never)) issues.push({ path: `tone[${index}]`, reason: 'invalid_enum', expected: CONTEXT_TONE_VALUES.join('|') }); });
  const boundary = root.usageBoundary;
  if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)) issues.push({ path: 'usageBoundary', reason: 'invalid_shape', expected: 'object' });
  else for (const key of ['naturalIn', 'beCarefulIn', 'avoidIn']) if (typeof (boundary as Record<string, unknown>)[key] !== 'string') issues.push({ path: `usageBoundary.${key}`, reason: 'wrong_type', expected: 'string' });
  if (!Array.isArray(root.signals)) issues.push({ path: 'signals', reason: 'invalid_shape', expected: 'array' });
  else root.signals.forEach((signal, index) => {
    const path = `signals[${index}]`;
    if (!signal || typeof signal !== 'object' || Array.isArray(signal)) { issues.push({ path, reason: 'invalid_shape', expected: 'object' }); return; }
    const item = signal as Record<string, unknown>;
    for (const key of ['phrase', 'explanation', 'evidenceRef']) if (typeof item[key] !== 'string') issues.push({ path: `${path}.${key}`, reason: key in item ? 'wrong_type' : 'missing_field', expected: 'string' });
    enumField(item, `${path}.signalType`, CONTEXT_SIGNAL_TYPE_VALUES, issues, 'signalType');
  });
  return { valid: issues.length === 0, issues };
}

export function isModelContextAnalysis(value: unknown): value is ModelContextAnalysis { return diagnoseModelContextAnalysis(value).valid; }
export function assertModelContextAnalysis(value: unknown): ModelContextAnalysis { if (!isModelContextAnalysis(value)) throw new Error('Model context analysis has an invalid contract.'); return value; }

function enumField(source: Record<string, unknown>, key: string, values: readonly string[], issues: ModelContextIssue[], sourceKey = key): void {
  const value = source[sourceKey];
  if (typeof value !== 'string' || !values.includes(value)) issues.push({ path: key, reason: sourceKey in source ? 'invalid_enum' : 'missing_field', expected: values.join('|') });
}
