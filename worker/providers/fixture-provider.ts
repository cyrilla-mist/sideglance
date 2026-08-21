import type { DecodeRequest, DecodeResponse } from '../../shared/contracts/decode';

const fridaySnapshot = 'Kai and Leo are jokingly warning Nora that making a risky change before the weekend is a bold move. "Fearless behavior" is likely playful sarcasm rather than genuine praise.';

export class FixtureProvider {
  decode(request: DecodeRequest): DecodeResponse {
    const input = request.inputText.toLowerCase().trim();
    if (input === 'fearless behavior' && !request.additionalContext?.trim()) {
      return { type: 'needs_context', originalMoment: request.inputText, reason: 'ambiguous_phrase', question: 'What was said immediately before this?', missingContext: 'The phrase could be sincere praise or sarcasm depending on the situation.' };
    }
    if (request.additionalContext?.toLowerCase().includes('mia:') && (request.additionalContext.toLowerCase().includes('terrified') || request.additionalContext.toLowerCase().includes('spoke up'))) return this.fearlessPraise(request);
    if (input.includes('on a friday??') && input.includes('fearless behavior') && input.includes('enjoy your weekend')) return this.fridayMerge(request);
    return { type: 'failed', errorCode: 'unknown_fixture', message: 'This Task 02 slice only recognizes the bundled fixture conversations.' };
  }

  private fridayMerge(request: DecodeRequest): DecodeResponse {
    return { type: 'decoded', originalMoment: request.inputText, snapshot: fridaySnapshot, signals: [
      { id: 'signal-01', quote: 'on a friday??', category: 'community_norm', explanation: 'The question implies concern because developers often avoid risky changes right before a weekend.' },
      { id: 'signal-02', quote: 'fearless behavior 💀', category: 'irony', explanation: 'The phrase sounds positive but the skull emoji changes it into playful sarcasm.' },
      { id: 'signal-03', quote: 'enjoy your weekend', category: 'dry_humor', explanation: 'The closing line continues the joke rather than offering a literal farewell.' },
    ], usageBoundary: { natural: 'Close teammates or familiar communities', depends: 'New teammates', avoid: 'Formal reviews or client communication' }, confidence: 'high' };
  }

  private fearlessPraise(request: DecodeRequest): DecodeResponse {
    return { type: 'decoded', originalMoment: request.additionalContext ?? request.inputText, snapshot: 'This is genuine encouragement. The speaker is praising a difficult but brave choice, not being sarcastic.', signals: [
      { id: 'signal-01', quote: 'spoke up about the issue', category: 'literal', explanation: 'The specific action gives the compliment a sincere subject.' },
      { id: 'signal-02', quote: 'even though I was terrified', category: 'tone', explanation: 'The admission of fear makes "fearless behavior" read as genuine encouragement.' },
    ], usageBoundary: { natural: 'Supportive teammates or close friends', depends: 'New teammates', avoid: 'Formal client communication without context' }, confidence: 'high' };
  }
}
