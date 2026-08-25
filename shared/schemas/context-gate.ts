import type { ContextGateResult } from '../contracts/context-gate';

export type ContextGateIssue = { path: string; reason: 'missing_field' | 'wrong_type' | 'invalid_enum' | 'invalid_ready_shape' | 'invalid_needs_context_shape' | 'invalid_question' | 'unexpected_nullability' | 'other'; expected: string; receivedType?: string; receivedValue?: string };

export function diagnoseContextGateResult(value: unknown): { valid: boolean; issues: ContextGateIssue[] } {
  const issues: ContextGateIssue[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, issues: [{ path: '$', reason: 'wrong_type', expected: 'object', receivedType: describeType(value) }] };
  const result = value as Record<string, unknown>;
  requireEnum(result, 'status', ['ready', 'needs_context'], issues);
  requireEnum(result, 'confidence', ['high', 'medium', 'low'], issues);
  requireEnum(result, 'reason', ['context_sufficient', 'ambiguous_phrase', 'insufficient_context'], issues);
  const sufficiency = result.sufficiency;
  if (!sufficiency || typeof sufficiency !== 'object' || Array.isArray(sufficiency)) issues.push({ path: 'sufficiency', reason: 'other', expected: 'object', receivedType: describeType(sufficiency) });
  else for (const key of ['toneJudgment', 'socialImplication', 'usageBoundary']) if (typeof (sufficiency as Record<string, unknown>)[key] !== 'boolean') issues.push({ path: `sufficiency.${key}`, reason: 'wrong_type', expected: 'boolean', receivedType: describeType((sufficiency as Record<string, unknown>)[key]) });
  if (result.status === 'needs_context') {
    if (typeof result.missingInformation !== 'string' || !result.missingInformation.trim()) issues.push({ path: 'missingInformation', reason: 'missing_field', expected: 'non-empty string' });
    if (typeof result.question !== 'string' || !result.question.trim()) issues.push({ path: 'question', reason: 'missing_field', expected: 'one specific question' });
    else if ((result.question.match(/\?/g) ?? []).length !== 1) issues.push({ path: 'question', reason: 'invalid_question', expected: 'exactly one specific question', receivedType: 'question_mark_count' });
    for (const key of ['missingInformation', 'question']) if (result[key] === null) issues.push({ path: key, reason: 'unexpected_nullability', expected: 'string, not null', receivedType: 'null' });
  } else if (result.status === 'ready') {
    for (const key of ['missingInformation', 'question']) if (key in result) issues.push({ path: key, reason: 'invalid_ready_shape', expected: 'field must be omitted for ready', receivedType: describeType(result[key]), ...(typeof result[key] === 'string' ? { receivedValue: result[key].slice(0, 80) } : {}) });
  }
  return { valid: issues.length === 0, issues };
}

export function isContextGateResult(value: unknown): value is ContextGateResult {
  return diagnoseContextGateResult(value).valid;
}

export function assertContextGateResult(value: unknown): ContextGateResult {
  if (!isContextGateResult(value)) throw new Error('Context gate returned an invalid contract.');
  return value;
}

function requireEnum(source: Record<string, unknown>, key: string, values: readonly string[], issues: ContextGateIssue[]): void {
  if (!(key in source)) issues.push({ path: key, reason: 'missing_field', expected: `enum(${values.join('|')})` });
  else if (typeof source[key] !== 'string') issues.push({ path: key, reason: 'wrong_type', expected: `enum(${values.join('|')})`, receivedType: describeType(source[key]) });
  else if (!values.includes(source[key] as string)) issues.push({ path: key, reason: 'invalid_enum', expected: `enum(${values.join('|')})`, receivedType: 'string', receivedValue: (source[key] as string).slice(0, 80) });
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
