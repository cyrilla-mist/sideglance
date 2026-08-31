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
  errorCode: 'invalid_request' | 'unknown_fixture' | 'invalid_response' | 'context_timeout' | 'context_invalid_json' | 'context_schema_invalid' | 'missing_api_key' | 'model_unavailable';
  message: string;
  diagnosticCode?: FailureDiagnosticCode;
};

export type FailureDiagnosticCode =
  | 'gateway_auth_error'
  | 'google_auth_error'
  | 'gateway_invalid_request'
  | 'gateway_provider_unavailable'
  | 'gateway_rate_limited'
  | 'structured_output_rejected'
  | 'provider_model_error'
  | 'provider_timeout'
  | 'model_contract_error'
  | 'transport_error'
  | 'worker_internal_error'
  | 'unknown_502';

export type DecodeResponse = DecodedResponse | NeedsContextResponse | FailedResponse;
