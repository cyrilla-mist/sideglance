import { describe, expect, it } from 'vitest';
import { contextSchemaCheck } from '../../evaluation/context-schema-check';
import { assertContextAnalysis } from '../../shared/schemas/context';
import type { ContextAnalysis } from '../../shared/contracts/context';

const validAnalysis: ContextAnalysis = {
  literalMeaning: 'Literal meaning', contextualMeaning: 'Contextual meaning', tone: ['playful', 'sarcastic'], register: 'technical',
  communityContext: 'Developer community', socialImplication: 'Shared norms are assumed',
  usageBoundary: { naturalIn: 'Teammates', beCarefulIn: 'New coworkers', avoidIn: 'Formal review' }, confidence: 'high',
  uncertainty: 'Intent is not fully observable.', signals: [{ phrase: '💀', signalType: 'emoji', explanation: 'Signals irony.' }],
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
});
