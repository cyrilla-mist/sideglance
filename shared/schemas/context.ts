import type { ContextAnalysis, ContextSignalType, Confidence, Register, Tone } from '../contracts/context';

const tones: Tone[] = ['playful', 'sarcastic', 'sincere', 'neutral', 'critical', 'uncertain'];
const registers: Register[] = ['casual', 'professional', 'community', 'meme', 'technical'];
const confidences: Confidence[] = ['high', 'medium', 'low'];
const signalTypes: ContextSignalType[] = ['emoji', 'wording', 'community_norm', 'timing', 'relationship', 'irony'];

export type ContextAnalysisIssueReason = 'missing_field' | 'wrong_type' | 'invalid_enum' | 'invalid_array' | 'invalid_nested_shape' | 'invalid_optional_value';

export type ContextAnalysisIssue = {
  path: string;
  reason: ContextAnalysisIssueReason;
  expected?: string;
  receivedType?: string;
  receivedValue?: string;
};

export type ContextAnalysisDiagnostic = {
  valid: boolean;
  issues: ContextAnalysisIssue[];
};

export function isContextAnalysis(value: unknown): value is ContextAnalysis {
  return diagnoseContextAnalysis(value).valid;
}

export function diagnoseContextAnalysis(value: unknown): ContextAnalysisDiagnostic {
  const issues: ContextAnalysisIssue[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push({ path: '$', reason: 'wrong_type', expected: 'object', receivedType: describeType(value) });
    return { valid: false, issues };
  }
  const analysis = value as Record<string, unknown>;
  for (const key of ['literalMeaning', 'contextualMeaning', 'communityContext', 'socialImplication', 'uncertainty']) {
    requireField(analysis, key, 'string', issues);
  }
  requireEnum(analysis, 'register', registers, issues);
  requireEnum(analysis, 'confidence', confidences, issues);
  const tone = analysis.tone;
  if (!(('tone' in analysis))) issues.push({ path: 'tone', reason: 'missing_field', expected: 'non-empty array' });
  else if (!Array.isArray(tone)) issues.push({ path: 'tone', reason: 'invalid_array', expected: 'non-empty array', receivedType: describeType(tone) });
  else if (tone.length === 0) issues.push({ path: 'tone', reason: 'invalid_array', expected: 'non-empty array', receivedType: 'array' });
  else tone.forEach((item, index) => requireEnumValue(`tone[${index}]`, item, tones, issues));

  const boundary = analysis.usageBoundary;
  if (!('usageBoundary' in analysis)) issues.push({ path: 'usageBoundary', reason: 'missing_field', expected: 'object' });
  else if (!boundary || typeof boundary !== 'object' || Array.isArray(boundary)) issues.push({ path: 'usageBoundary', reason: 'invalid_nested_shape', expected: 'object', receivedType: describeType(boundary) });
  else for (const key of ['naturalIn', 'beCarefulIn', 'avoidIn']) requireField(boundary as Record<string, unknown>, key, 'string', issues, `usageBoundary.${key}`);

  const signals = analysis.signals;
  if (!('signals' in analysis)) issues.push({ path: 'signals', reason: 'missing_field', expected: 'array' });
  else if (!Array.isArray(signals)) issues.push({ path: 'signals', reason: 'invalid_array', expected: 'array', receivedType: describeType(signals) });
  else signals.forEach((signal, index) => {
    const path = `signals[${index}]`;
    if (!signal || typeof signal !== 'object' || Array.isArray(signal)) { issues.push({ path, reason: 'invalid_nested_shape', expected: 'object', receivedType: describeType(signal) }); return; }
    const item = signal as Record<string, unknown>;
    requireField(item, 'phrase', 'string', issues, `${path}.phrase`);
    requireEnum(item, 'signalType', signalTypes, issues, `${path}.signalType`);
    requireField(item, 'explanation', 'string', issues, `${path}.explanation`);
  });
  return { valid: issues.length === 0, issues };
}

function requireField(source: Record<string, unknown>, key: string, expected: string, issues: ContextAnalysisIssue[], path = key): void {
  if (!(key in source)) issues.push({ path, reason: 'missing_field', expected });
  else if (typeof source[key] !== expected) issues.push({ path, reason: 'wrong_type', expected, receivedType: describeType(source[key]) });
}

function requireEnum(source: Record<string, unknown>, key: string, values: readonly string[], issues: ContextAnalysisIssue[], path = key): void {
  if (!(key in source)) issues.push({ path, reason: 'missing_field', expected: `enum(${values.join('|')})` });
  else requireEnumValue(path, source[key], values, issues);
}

function requireEnumValue(path: string, value: unknown, values: readonly string[], issues: ContextAnalysisIssue[]): void {
  if (typeof value !== 'string') issues.push({ path, reason: 'wrong_type', expected: `enum(${values.join('|')})`, receivedType: describeType(value) });
  else if (!values.includes(value)) issues.push({ path, reason: 'invalid_enum', expected: `enum(${values.join('|')})`, receivedType: 'string', receivedValue: value.slice(0, 80) });
}

function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export function assertContextAnalysis(value: unknown): ContextAnalysis {
  if (!isContextAnalysis(value)) throw new Error('Context analysis has an invalid contract.');
  return value;
}
