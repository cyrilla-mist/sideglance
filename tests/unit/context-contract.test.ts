import { describe, expect, it } from 'vitest';
import { contextSchemaCheck } from '../../evaluation/context-schema-check';
import { assertContextAnalysis, diagnoseContextAnalysis } from '../../shared/schemas/context';
import type { ContextAnalysis } from '../../shared/contracts/context';

const validAnalysis: ContextAnalysis = {
  literalMeaning: 'Literal meaning', contextualMeaning: 'Contextual meaning', tone: ['playful', 'sarcastic'], register: 'technical',
  communityContext: 'Developer community', socialImplication: 'Shared norms are assumed',
  usageBoundary: { naturalIn: 'Teammates', beCarefulIn: 'New coworkers', avoidIn: 'Formal review' }, confidence: 'high',
  uncertainty: 'Intent is not fully observable.', signals: [{ phrase: '💀', signalType: 'emoji', explanation: 'Signals irony.', evidenceQuote: '💀' }],
};

describe('context contract', () => {
  it('accepts a complete context analysis and schema check', () => {
    expect(assertContextAnalysis(validAnalysis)).toEqual(validAnalysis);
    expect(contextSchemaCheck(validAnalysis)).toBe(true);
  });

  it('rejects invalid tone and incomplete boundaries', () => {
    expect(contextSchemaCheck({ ...validAnalysis, tone: ['invented'] })).toBe(false);
    expect(contextSchemaCheck({ ...validAnalysis, usageBoundary: { naturalIn: '', beCarefulIn: 'New coworkers', avoidIn: 'Formal review' } })).toBe(false);
  });

  it('explains missing required fields without changing boolean validation', () => {
    const result = diagnoseContextAnalysis({ ...validAnalysis, socialImplication: undefined });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({ path: 'socialImplication', reason: 'wrong_type', expected: 'string', receivedType: 'undefined' });
    expect(contextSchemaCheck({ ...validAnalysis, socialImplication: undefined })).toBe(false);
  });

  it('explains enum and nested signal mismatches', () => {
    const enumResult = diagnoseContextAnalysis({ ...validAnalysis, register: 'invented' });
    expect(enumResult.issues[0]).toMatchObject({ path: 'register', reason: 'invalid_enum', receivedValue: 'invented' });
    const nestedResult = diagnoseContextAnalysis({ ...validAnalysis, signals: [{ phrase: 'x', signalType: 'irony' }] });
    expect(nestedResult.issues).toContainEqual({ path: 'signals[0].explanation', reason: 'missing_field', expected: 'string' });
    expect(nestedResult.issues).toContainEqual({ path: 'signals[0].evidenceQuote', reason: 'missing_field', expected: 'string' });
  });

  it('rejects a non-string evidence quote', () => {
    const result = diagnoseContextAnalysis({ ...validAnalysis, signals: [{ ...validAnalysis.signals[0], evidenceQuote: 42 }] });
    expect(result.issues).toContainEqual({ path: 'signals[0].evidenceQuote', reason: 'wrong_type', expected: 'string', receivedType: 'number' });
  });
});
