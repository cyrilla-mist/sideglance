import { describe, expect, it } from 'vitest';
import { ModelContextProvider, ContextProviderError } from '../../worker/providers/context-provider';

const analysis = {
  literalMeaning: 'A literal meaning', contextualMeaning: 'A contextual meaning', tone: ['playful'], register: 'community',
  communityContext: 'Internet slang', socialImplication: 'Shared online norms',
  signals: [{ phrase: 'touch grass', signalType: 'wording', explanation: 'A familiar admonition.', evidenceQuote: 'touch grass' }],
  usageBoundary: { naturalIn: 'Online communities', beCarefulIn: 'Professional settings', avoidIn: 'Formal reports' },
  confidence: 'medium', uncertainty: 'Exact intent depends on context.',
};
const modelAnalysis = { ...analysis, signals: [{ phrase: 'touch grass', signalType: 'wording', explanation: 'A familiar admonition.', evidenceRef: 'E1' }] };

describe('ModelContextProvider', () => {
  it('parses and validates a provider JSON response', async () => {
    const provider = new ModelContextProvider({ apiKey: 'test-key', fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(modelAnalysis) } }] })) });
    await expect(provider.analyzeContext('touch grass')).resolves.toEqual(analysis);
  });

  it('rejects non-JSON model content without falling back to text', async () => {
    const provider = new ModelContextProvider({ apiKey: 'test-key', fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'plain text' } }] })) });
    await expect(provider.analyzeContext('touch grass')).rejects.toMatchObject({ code: 'context_invalid_json' });
  });

  it('rejects JSON that does not satisfy ContextAnalysis', async () => {
    const provider = new ModelContextProvider({ apiKey: 'test-key', fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...modelAnalysis, confidence: 'certain' }) } }] })) });
    await expect(provider.analyzeContext('touch grass')).rejects.toMatchObject({ code: 'context_schema_invalid' });
  });

  it('rejects schema-valid output whose evidence is not in the supplied source', async () => {
    const invalidEvidence = { ...modelAnalysis, signals: [{ ...modelAnalysis.signals[0], evidenceRef: 'E99' }] };
    const provider = new ModelContextProvider({ apiKey: 'test-key', fetcher: async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(invalidEvidence) } }] })) });
    await expect(provider.analyzeContext('touch grass')).rejects.toMatchObject({ code: 'invalid_evidence_reference', diagnostics: { stage: 'evidence_reference_error', evidenceTotal: 1, evidenceExactMatches: 0, evidenceInvalid: 1 } });
  });

  it('reports a missing API key safely', async () => {
    const provider = new ModelContextProvider({ fetcher: async () => new Response() });
    await expect(provider.analyzeContext('touch grass')).rejects.toBeInstanceOf(ContextProviderError);
    await expect(provider.analyzeContext('touch grass')).rejects.toMatchObject({ code: 'missing_api_key' });
  });
});
