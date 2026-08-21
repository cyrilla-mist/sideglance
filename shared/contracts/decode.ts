export type Confidence = 'high' | 'medium' | 'low';
export type SignalCategory = 'community_norm' | 'irony' | 'dry_humor' | 'literal' | 'tone';

export type DecodeRequest = {
  inputText: string;
  additionalContext?: string;
  requestId?: string;
};

export type DecodeSignal = {
  id: string;
  quote: string;
  explanation: string;
  category: SignalCategory;
};

export type UsageBoundary = {
  natural: string;
  depends: string;
  avoid: string;
};

export type DecodedResponse = {
  type: 'decoded';
  originalMoment: string;
  snapshot: string;
  signals: DecodeSignal[];
  usageBoundary: UsageBoundary;
  confidence: Confidence;
  contextAnalysis?: import('./context').ContextAnalysis;
};

export type NeedsContextResponse = {
  type: 'needs_context';
  originalMoment: string;
  reason: 'ambiguous_phrase';
  question: string;
  missingContext: string;
};

export type FailedResponse = {
  type: 'failed';
  errorCode: 'invalid_request' | 'unknown_fixture' | 'invalid_response';
  message: string;
};

export type DecodeResponse = DecodedResponse | NeedsContextResponse | FailedResponse;
