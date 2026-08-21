import type { DecodeRequest, DecodeResponse, SignalCategory } from '../contracts/decode';

const categories: SignalCategory[] = ['community_norm', 'irony', 'dry_humor', 'literal', 'tone'];
const confidences = ['high', 'medium', 'low'] as const;

export function parseDecodeRequest(value: unknown): DecodeRequest {
  if (!value || typeof value !== 'object' || typeof (value as { inputText?: unknown }).inputText !== 'string') {
    throw new Error('Decode request requires inputText.');
  }
  const request = value as Record<string, unknown>;
  const inputText = request.inputText;
  if (typeof inputText !== 'string' || !inputText.trim()) throw new Error('inputText cannot be empty.');
  for (const key of ['additionalContext', 'requestId']) {
    if (request[key] !== undefined && typeof request[key] !== 'string') throw new Error(`${key} must be a string.`);
  }
  return { inputText, additionalContext: request.additionalContext as string | undefined, requestId: request.requestId as string | undefined };
}

export function isDecodeResponse(value: unknown): value is DecodeResponse {
  if (!value || typeof value !== 'object' || typeof (value as { type?: unknown }).type !== 'string') return false;
  const response = value as Record<string, unknown>;
  if (response.type === 'failed') return typeof response.errorCode === 'string' && typeof response.message === 'string';
  if (response.type === 'needs_context') return response.reason === 'ambiguous_phrase' && typeof response.originalMoment === 'string' && typeof response.question === 'string' && typeof response.missingContext === 'string';
  if (response.type !== 'decoded') return false;
  if (typeof response.originalMoment !== 'string' || typeof response.snapshot !== 'string' || !confidences.includes(response.confidence as typeof confidences[number])) return false;
  if (!Array.isArray(response.signals) || !response.signals.every((signal) => {
    if (!signal || typeof signal !== 'object') return false;
    const item = signal as Record<string, unknown>;
    return typeof item.id === 'string' && typeof item.quote === 'string' && typeof item.explanation === 'string' && categories.includes(item.category as SignalCategory);
  })) return false;
  const boundary = response.usageBoundary;
  return Boolean(boundary && typeof boundary === 'object' && typeof (boundary as Record<string, unknown>).natural === 'string' && typeof (boundary as Record<string, unknown>).depends === 'string' && typeof (boundary as Record<string, unknown>).avoid === 'string');
}

export function assertDecodeResponse(value: unknown): DecodeResponse {
  if (!isDecodeResponse(value)) throw new Error('Fixture provider returned an invalid decode response.');
  return value;
}
