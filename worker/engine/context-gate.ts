import type { ContextGateResult, ContextSufficiency } from '../../shared/contracts/context-gate';

export interface ContextGateEngine {
  checkContext(input: string, additionalContext?: string): ContextGateResult;
}

export class MockContextGateEngine implements ContextGateEngine {
  checkContext(input: string, additionalContext?: string): ContextGateResult {
    const normalized = input.toLowerCase().trim();
    const context = additionalContext?.toLowerCase().trim() ?? '';
    if (normalized === 'fearless behavior' && !context) return needsContext('The phrase could be sincere praise or sarcasm depending on the situation.', 'What was said immediately before this?');
    if (normalized === 'bold move' && !context) return needsContext('The phrase can be admiration, sarcasm, or criticism depending on the surrounding exchange.', 'What happened immediately before this?');
    if (normalized === 'interesting choice' && !context) return needsContext('The phrase can be genuine interest or indirect criticism depending on the tone around it.', 'What was the surrounding exchange?');
    if (isFridayMerge(normalized)) return ready('high');
    if (normalized === 'fearless behavior' && hasSincereFearlessContext(context)) return ready('high');
    return ready('low');
  }
}

function needsContext(missingInformation: string, question: string): ContextGateResult {
  return { status: 'needs_context', confidence: 'low', reason: 'ambiguous_phrase', missingInformation, question, sufficiency: sufficiency(false, false, false) };
}

function ready(confidence: 'high' | 'medium' | 'low'): ContextGateResult {
  return { status: 'ready', confidence, reason: 'context_sufficient', sufficiency: sufficiency(true, true, true) };
}

function sufficiency(value: boolean, socialImplication: boolean, usageBoundary: boolean): ContextSufficiency {
  return { toneJudgment: value, socialImplication, usageBoundary };
}

function isFridayMerge(input: string): boolean {
  return input.includes('on a friday??') && input.includes('fearless behavior');
}

function hasSincereFearlessContext(context: string): boolean {
  return context.includes('mia:') && context.includes('spoke up') && context.includes('issue');
}
