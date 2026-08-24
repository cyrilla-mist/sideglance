import { describe, expect, it } from 'vitest';
import { buildEvidenceCatalog } from '../../shared/context/evidence-catalog';
import { resolveContextEvidence } from '../../shared/context/evidence-resolver';
import type { ModelContextAnalysis } from '../../shared/contracts/model-context';
import { validateContextEvidence } from '../../shared/schemas/context-evidence';
import { diagnoseModelContextAnalysis } from '../../shared/schemas/model-context';
import { buildContextAnalysisPrompt } from '../../worker/prompts/context-analysis';

const modelAnalysis: ModelContextAnalysis = {
  literalMeaning: 'Literal', contextualMeaning: 'Contextual', tone: ['neutral'], register: 'community', communityContext: 'Community', socialImplication: 'Shared context',
  usageBoundary: { naturalIn: 'Peers', beCarefulIn: 'Strangers', avoidIn: 'Formal review' }, confidence: 'medium', uncertainty: 'Uncertain.',
  signals: [{ phrase: 'fearless behavior', signalType: 'wording', explanation: 'The wording matters.', evidenceRef: 'E1' }],
};

describe('Evidence reference architecture', () => {
  it('builds deterministic IDs from non-empty multiline input', () => {
    expect(buildEvidenceCatalog('first line\n\nsecond line', 'third line')).toEqual([
      { id: 'E1', text: 'first line', source: 'input' }, { id: 'E2', text: 'second line', source: 'input' }, { id: 'E3', text: 'third line', source: 'additional_context' },
    ]);
  });

  it('uses one unit for a single-line input and preserves exact source text', () => {
    const source = 'Fearless behavior 💀';
    const catalog = buildEvidenceCatalog(source);
    expect(catalog).toEqual([{ id: 'E1', text: source, source: 'input' }]);
    expect(source.includes(catalog[0].text)).toBe(true);
  });

  it('includes additional context as independent source units', () => {
    const catalog = buildEvidenceCatalog('input line', 'context line\ncontext two');
    expect(catalog.filter((unit) => unit.source === 'additional_context').map((unit) => unit.text)).toEqual(['context line', 'context two']);
  });

  it('resolves a valid reference to an exact quote', () => {
    const result = resolveContextEvidence(modelAnalysis, buildEvidenceCatalog('fearless behavior'));
    expect(result).toMatchObject({ valid: true, total: 1, validRefs: 1, invalid: [] });
    expect(result.analysis?.signals[0].evidenceQuote).toBe('fearless behavior');
    expect(validateContextEvidence(result.analysis!, 'fearless behavior')).toMatchObject({ valid: true, exactMatches: 1 });
  });

  it('hard-fails unknown references without fuzzy repair', () => {
    const unknown = { ...modelAnalysis, signals: [{ ...modelAnalysis.signals[0], evidenceRef: 'E01' }] };
    expect(resolveContextEvidence(unknown, buildEvidenceCatalog('fearless behavior'))).toMatchObject({ valid: false, validRefs: 0, invalid: [{ signalIndex: 0, reason: 'invalid_evidence_reference' }] });
  });

  it('resolves multiple signals independently', () => {
    const multi = { ...modelAnalysis, signals: [modelAnalysis.signals[0], { ...modelAnalysis.signals[0], phrase: 'behavior', evidenceRef: 'E2' }] };
    const result = resolveContextEvidence(multi, buildEvidenceCatalog('fearless behavior\nbehavior'));
    expect(result).toMatchObject({ valid: true, total: 2, validRefs: 2 });
    expect(result.analysis?.signals.map((signal) => signal.evidenceQuote)).toEqual(['fearless behavior', 'behavior']);
  });

  it('requires evidenceRef in the model-only contract', () => {
    const result = diagnoseModelContextAnalysis({ ...modelAnalysis, signals: [{ ...modelAnalysis.signals[0], evidenceRef: undefined }] });
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual({ path: 'signals[0].evidenceRef', reason: 'wrong_type', expected: 'string' });
  });

  it('instructs the model to choose catalog IDs and not output evidence text', () => {
    const prompt = buildContextAnalysisPrompt('fearless behavior', undefined, buildEvidenceCatalog('fearless behavior'));
    expect(prompt.user).toContain('[E1] fearless behavior');
    expect(prompt.system).toContain('evidenceRef');
    expect(prompt.system).toContain('Never output source text as evidence');
    expect(prompt.system).toContain('Never invent an evidence ID');
  });
});
