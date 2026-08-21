export type ContextGateStatus = 'ready' | 'needs_context';
export type ContextGateConfidence = 'high' | 'medium' | 'low';
export type ContextGateReason = 'context_sufficient' | 'ambiguous_phrase' | 'insufficient_context';

export type ContextSufficiency = {
  toneJudgment: boolean;
  socialImplication: boolean;
  usageBoundary: boolean;
};

export type ContextGateResult = {
  status: ContextGateStatus;
  confidence: ContextGateConfidence;
  reason: ContextGateReason;
  missingInformation?: string;
  question?: string;
  sufficiency: ContextSufficiency;
};
