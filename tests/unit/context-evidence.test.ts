import { describe, expect, it } from 'vitest';
import { ContextEvaluator } from '../../evaluation/evaluator/context-evaluator';
import type { ContextAnalysis } from '../../shared/contracts/context';
import { validateContextEvidence } from '../../shared/schemas/context-evidence';

const analysis: ContextAnalysis = {
  literalMeaning: 'Literal', contextualMeaning: 'Contextual', tone: ['neutral'], register: 'community',
  communityContext: 'Community', socialImplication: 'Shared context', usageBoundary: { naturalIn: 'Peers', beCarefulIn: 'Strangers', avoidIn: 'Formal review' },
  confidence: 'medium', uncertainty: 'Some context remains uncertain.', signals: [
    { phrase: 'fearless behavior', signalType: 'wording', explanation: 'The wording matters.', evidenceQuote: 'fearless behavior' },
  ],
};

describe('Context evidence grounding', () => {
  it('passes exact evidence from the input', () => {
    expect(validateContextEvidence(analysis, 'Alex said fearless behavior yesterday.')).toEqual({ valid: true, total: 1, exactMatches: 1, invalid: [] });
  });

  it('fails an invented quote', () => {
    const result = validateContextEvidence({ ...analysis, signals: [{ ...analysis.signals[0], evidenceQuote: 'brave action' }] }, 'Alex said fearless behavior.');
    expect(result).toMatchObject({ valid: false, total: 1, exactMatches: 0, invalid: [{ signalIndex: 0, reason: 'evidence_not_found' }] });
  });

  it('fails a paraphrased but similar quote', () => {
    const result = validateContextEvidence({ ...analysis, signals: [{ ...analysis.signals[0], evidenceQuote: 'fearless actions' }] }, 'Alex said fearless behavior.');
    expect(result.valid).toBe(false);
  });

  it('fails empty evidence', () => {
    const result = validateContextEvidence({ ...analysis, signals: [{ ...analysis.signals[0], evidenceQuote: '' }] }, 'fearless behavior');
    expect(result.invalid).toEqual([{ signalIndex: 0, reason: 'empty_evidence' }]);
  });

  it('passes when multiple signals are all exact', () => {
    const multi = { ...analysis, signals: [analysis.signals[0], { phrase: 'yesterday', signalType: 'timing' as const, explanation: 'Timing matters.', evidenceQuote: 'yesterday' }] };
    expect(validateContextEvidence(multi, 'Alex said fearless behavior yesterday.')).toMatchObject({ valid: true, total: 2, exactMatches: 2 });
  });

  it('fails the whole analysis when one of multiple signals is invalid', () => {
    const multi = { ...analysis, signals: [analysis.signals[0], { phrase: 'missing', signalType: 'wording' as const, explanation: 'Not present.', evidenceQuote: 'not present' }] };
    expect(validateContextEvidence(multi, 'fearless behavior')).toMatchObject({ valid: false, total: 2, exactMatches: 1, invalid: [{ signalIndex: 1, reason: 'evidence_not_found' }] });
  });

  it('accepts an exact quote from additional context and evaluator rejects invented evidence', () => {
    expect(validateContextEvidence(analysis, ['fearless behavior', 'Alex explained the phrase.'].join('\n')).valid).toBe(true);
    const result = new ContextEvaluator().evaluate({ id: 'evidence', category: 'social_tone', input: 'fearless behavior', context: 'Alex explained the phrase.', expected: {} }, { ...analysis, signals: [{ ...analysis.signals[0], evidenceQuote: 'invented quote' }] });
    expect(result.passed).toBe(false);
    expect(result.issues).toContainEqual({ rule: 'hallucinated_evidence', message: 'One or more signal evidence quotes were not copied exactly from the case source.' });
  });
});
