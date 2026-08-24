import { describe, expect, it } from 'vitest';
import { buildContextAnalysisPrompt } from '../../worker/prompts/context-analysis';
import { CONTEXT_CONFIDENCE_VALUES, CONTEXT_REGISTER_VALUES, CONTEXT_SIGNAL_TYPE_VALUES, CONTEXT_TONE_VALUES } from '../../shared/schemas/context';

describe('context analysis prompt', () => {
  it('requests structured JSON and uncertainty-aware interpretation', () => {
    const prompt = buildContextAnalysisPrompt('fearless behavior 💀', 'A developer chat');
    expect(prompt.system).toContain('You are Sideglance Context Interpreter.');
    expect(prompt.system).toContain('Do not use markdown');
    expect(prompt.system).toContain('uncertainty');
    expect(prompt.user).toContain('fearless behavior 💀');
    expect(prompt.user).toContain('A developer chat');
  });

  it('keeps prompt taxonomy vocabulary aligned with the shared contract', () => {
    const prompt = buildContextAnalysisPrompt('generic input');
    for (const value of [...CONTEXT_TONE_VALUES, ...CONTEXT_REGISTER_VALUES, ...CONTEXT_SIGNAL_TYPE_VALUES, ...CONTEXT_CONFIDENCE_VALUES]) {
      expect(prompt.system).toContain(value);
    }
    expect(prompt.system).toContain('Never invent labels');
    expect(prompt.system).toContain('signalType is a taxonomy label');
  });
});
