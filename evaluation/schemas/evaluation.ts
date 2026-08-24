import type { ContextAnalysis, ContextSignalType, Register, Tone, UsageBoundary } from '../../shared/contracts/context';

export type EvaluationCategory = 'internet_slang' | 'developer_culture' | 'social_tone' | 'meme_community';
export type ExpectedTone = Tone | 'teasing' | 'approval' | 'negative' | 'emphasis' | 'positive' | 'ambiguous' | 'uncertainty';

export type RequiredSignal = {
  phrase: string;
  signalTypes: ContextSignalType[];
};

export type UsageBoundaryExpectation = Partial<Record<keyof UsageBoundary, string>>;

export type EvaluationExpected = {
  tone?: ExpectedTone[];
  register?: Register;
  communityContext?: string;
  requiredSignals?: RequiredSignal[];
  forbiddenClaims?: string[];
  usageBoundary?: UsageBoundaryExpectation;
  uncertaintyRequired?: boolean;
};

export type EvaluationCase = {
  id: string;
  category: EvaluationCategory;
  input: string;
  context?: string;
  expected: EvaluationExpected;
};

export type EvaluationIssue = {
  rule: 'tone_match' | 'register_match' | 'community_context' | 'required_signal' | 'forbidden_claim' | 'usage_boundary' | 'uncertainty' | 'hallucinated_evidence';
  message: string;
};

export type EvaluationResult = {
  caseId: string;
  passed: boolean;
  issues: EvaluationIssue[];
  notes: string;
};

export type EvaluationReport = {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  issues: EvaluationIssue[];
  results: EvaluationResult[];
};

export function isEvaluationCase(value: unknown): value is EvaluationCase {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const categories: EvaluationCategory[] = ['internet_slang', 'developer_culture', 'social_tone', 'meme_community'];
  const tones: ExpectedTone[] = ['playful', 'sarcastic', 'sincere', 'neutral', 'critical', 'uncertain', 'teasing', 'approval', 'negative', 'emphasis', 'positive', 'ambiguous', 'uncertainty'];
  const registers: Register[] = ['casual', 'professional', 'community', 'meme', 'technical'];
  const signalTypes: ContextSignalType[] = ['emoji', 'wording', 'community_norm', 'timing', 'relationship', 'irony'];
  const expected = item.expected;
  if (!expected || typeof expected !== 'object') return false;
  const expectedItem = expected as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.category === 'string'
    && categories.includes(item.category as EvaluationCategory)
    && typeof item.input === 'string'
    && (!item.context || typeof item.context === 'string')
    && (expectedItem.tone === undefined || (Array.isArray(expectedItem.tone) && expectedItem.tone.every((tone) => typeof tone === 'string' && tones.includes(tone as ExpectedTone))))
    && (expectedItem.register === undefined || (typeof expectedItem.register === 'string' && registers.includes(expectedItem.register as Register)))
    && (expectedItem.communityContext === undefined || typeof expectedItem.communityContext === 'string')
    && (expectedItem.requiredSignals === undefined || (Array.isArray(expectedItem.requiredSignals) && expectedItem.requiredSignals.every((signal) => {
      if (!signal || typeof signal !== 'object') return false;
      const item = signal as Record<string, unknown>;
      return typeof item.phrase === 'string' && Array.isArray(item.signalTypes) && item.signalTypes.every((signalType) => typeof signalType === 'string' && signalTypes.includes(signalType as ContextSignalType));
    })))
    && (expectedItem.forbiddenClaims === undefined || (Array.isArray(expectedItem.forbiddenClaims) && expectedItem.forbiddenClaims.every((claim) => typeof claim === 'string')))
    && (expectedItem.usageBoundary === undefined || (typeof expectedItem.usageBoundary === 'object' && expectedItem.usageBoundary !== null && Object.values(expectedItem.usageBoundary).every((entry) => typeof entry === 'string')))
    && (expectedItem.uncertaintyRequired === undefined || typeof expectedItem.uncertaintyRequired === 'boolean');
}

export function assertEvaluationCase(value: unknown): EvaluationCase {
  if (!isEvaluationCase(value)) throw new Error('Invalid evaluation case.');
  return value;
}

export function isEvaluationResult(value: unknown): value is EvaluationResult {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.caseId === 'string' && typeof item.passed === 'boolean' && Array.isArray(item.issues) && typeof item.notes === 'string';
}

export type EvaluationInput = {
  case: EvaluationCase;
  analysis: ContextAnalysis;
};
