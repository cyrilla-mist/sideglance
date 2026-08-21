import type { ContextAnalysis, ContextSignalType, Confidence, Register, Tone } from '../contracts/context';

const tones: Tone[] = ['playful', 'sarcastic', 'sincere', 'neutral', 'critical', 'uncertain'];
const registers: Register[] = ['casual', 'professional', 'community', 'meme', 'technical'];
const confidences: Confidence[] = ['high', 'medium', 'low'];
const signalTypes: ContextSignalType[] = ['emoji', 'wording', 'community_norm', 'timing', 'relationship', 'irony'];

export function isContextAnalysis(value: unknown): value is ContextAnalysis {
  if (!value || typeof value !== 'object') return false;
  const analysis = value as Record<string, unknown>;
  const boundary = analysis.usageBoundary;
  const signals = analysis.signals;
  return typeof analysis.literalMeaning === 'string'
    && typeof analysis.contextualMeaning === 'string'
    && Array.isArray(analysis.tone)
    && analysis.tone.length > 0
    && analysis.tone.every((tone) => typeof tone === 'string' && tones.includes(tone as Tone))
    && typeof analysis.register === 'string'
    && registers.includes(analysis.register as Register)
    && typeof analysis.communityContext === 'string'
    && typeof analysis.socialImplication === 'string'
    && Boolean(boundary && typeof boundary === 'object'
      && typeof (boundary as Record<string, unknown>).naturalIn === 'string'
      && typeof (boundary as Record<string, unknown>).beCarefulIn === 'string'
      && typeof (boundary as Record<string, unknown>).avoidIn === 'string')
    && typeof analysis.confidence === 'string'
    && confidences.includes(analysis.confidence as Confidence)
    && typeof analysis.uncertainty === 'string'
    && Array.isArray(signals)
    && signals.every((signal) => {
      if (!signal || typeof signal !== 'object') return false;
      const item = signal as Record<string, unknown>;
      return typeof item.phrase === 'string'
        && typeof item.signalType === 'string'
        && signalTypes.includes(item.signalType as ContextSignalType)
        && typeof item.explanation === 'string';
    });
}

export function assertContextAnalysis(value: unknown): ContextAnalysis {
  if (!isContextAnalysis(value)) throw new Error('Context analysis has an invalid contract.');
  return value;
}
