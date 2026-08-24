import type { ContextAnalysis, Tone } from '../../shared/contracts/context';
import { validateContextEvidence } from '../../shared/schemas/context-evidence';
import type { EvaluationCase, EvaluationIssue, EvaluationReport, EvaluationResult, ExpectedTone } from '../schemas/evaluation';

const toneAliases: Record<ExpectedTone, Tone[]> = {
  playful: ['playful'], sarcastic: ['sarcastic'], sincere: ['sincere'], neutral: ['neutral'], critical: ['critical'], uncertain: ['uncertain'],
  teasing: ['playful', 'sarcastic'], approval: ['sincere', 'playful'], negative: ['critical', 'sarcastic'], emphasis: ['sincere', 'neutral'],
  positive: ['sincere', 'playful'], ambiguous: ['uncertain', 'neutral'], uncertainty: ['uncertain'],
};

export class ContextEvaluator {
  evaluate(caseItem: EvaluationCase, analysis: ContextAnalysis): EvaluationResult {
    const issues: EvaluationIssue[] = [];
    const expected = caseItem.expected;
    const grounding = validateContextEvidence(analysis, [caseItem.input, caseItem.context ?? ''].filter(Boolean).join('\n'));
    if (!grounding.valid) issues.push({ rule: 'hallucinated_evidence', message: 'One or more signal evidence quotes were not copied exactly from the case source.' });
    if (expected.tone && !expected.tone.some((tone) => toneAliases[tone].some((alias) => analysis.tone.includes(alias)))) {
      issues.push({ rule: 'tone_match', message: `Expected tone ${expected.tone.join(' or ')} but received ${analysis.tone.join(', ')}.` });
    }
    if (expected.register && analysis.register !== expected.register) {
      issues.push({ rule: 'register_match', message: `Expected register ${expected.register} but received ${analysis.register}.` });
    }
    if (expected.communityContext && !communityMatches(expected.communityContext, analysis.communityContext)) {
      issues.push({ rule: 'community_context', message: `Community context did not contain the expected meaning: ${expected.communityContext}.` });
    }
    for (const required of expected.requiredSignals ?? []) {
      const signalFound = analysis.signals.some((signal) => signal.phrase.toLowerCase().includes(required.phrase.toLowerCase())
        && required.signalTypes.some((signalType) => signal.signalType === signalType));
      if (!signalFound) issues.push({ rule: 'required_signal', message: `Required signal was not found: ${required.phrase}.` });
    }
    const analysisText = JSON.stringify(analysis).toLowerCase();
    for (const forbidden of expected.forbiddenClaims ?? []) {
      if (analysisText.includes(forbidden.toLowerCase())) issues.push({ rule: 'forbidden_claim', message: `Forbidden claim appeared: ${forbidden}.` });
    }
    if (expected.usageBoundary) {
      for (const field of ['naturalIn', 'beCarefulIn', 'avoidIn'] as const) {
        const expectedValue = expected.usageBoundary[field];
        if (expectedValue && !analysis.usageBoundary[field].toLowerCase().includes(expectedValue.toLowerCase())) {
          issues.push({ rule: 'usage_boundary', message: `${field} did not include ${expectedValue}.` });
        }
      }
    } else if (!analysis.usageBoundary.naturalIn.trim() || !analysis.usageBoundary.beCarefulIn.trim() || !analysis.usageBoundary.avoidIn.trim()) {
      issues.push({ rule: 'usage_boundary', message: 'Usage boundary must include naturalIn, beCarefulIn, and avoidIn.' });
    }
    if (expected.uncertaintyRequired && !hasUncertainty(analysis)) {
      issues.push({ rule: 'uncertainty', message: 'Ambiguous case did not acknowledge uncertainty.' });
    }
    return { caseId: caseItem.id, passed: issues.length === 0, issues, notes: issues.length === 0 ? 'All deterministic checks passed.' : 'One or more deterministic checks failed.' };
  }
}

function communityMatches(expected: string, actual: string): boolean {
  const aliases: Record<string, string[]> = {
    'internet slang': ['internet slang', 'online slang'], 'developer context': ['developer', 'technical'], 'code review context': ['code review', 'review'],
    'technical meaning': ['technical', 'breaking change'], 'developer humor': ['developer', 'humor', 'joke'], 'developer norm': ['developer', 'norm', 'friday'],
    'online discourse': ['online', 'discourse', 'social media'], 'social media context': ['social media', 'online discourse'], 'approval slang': ['approval', 'slang'],
    'negative slang': ['negative', 'slang'], 'dismissive internet slang': ['dismissive', 'internet slang'],
  };
  const normalizedExpected = expected.toLowerCase();
  const normalizedActual = actual.toLowerCase();
  const alternatives = aliases[normalizedExpected] ?? [normalizedExpected];
  return alternatives.some((term) => normalizedActual.includes(term)) || normalizedActual.includes(normalizedExpected);
}

function hasUncertainty(analysis: ContextAnalysis): boolean {
  const uncertainty = analysis.uncertainty.trim().toLowerCase();
  return uncertainty.length > 0 && !['none', 'unknown', 'not applicable', 'no uncertainty'].includes(uncertainty);
}

export function buildEvaluationReport(results: readonly EvaluationResult[]): EvaluationReport {
  const passedCases = results.filter((result) => result.passed).length;
  return { totalCases: results.length, passedCases, failedCases: results.length - passedCases, issues: results.flatMap((result) => result.issues), results: [...results] };
}

export function serializeEvaluationReport(results: readonly EvaluationResult[]): string {
  return JSON.stringify(buildEvaluationReport(results), null, 2);
}
