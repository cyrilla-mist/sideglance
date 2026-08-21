import { describe, expect, it } from 'vitest';
import { buildContextAnalysisPrompt } from '../../worker/prompts/context-analysis';

describe('context analysis prompt', () => {
  it('requests structured JSON and uncertainty-aware interpretation', () => {
    const prompt = buildContextAnalysisPrompt('fearless behavior 💀', 'A developer chat');
    expect(prompt.system).toContain('You are Sideglance Context Interpreter.');
    expect(prompt.system).toContain('Do not use markdown');
    expect(prompt.system).toContain('uncertainty');
    expect(prompt.user).toContain('fearless behavior 💀');
    expect(prompt.user).toContain('A developer chat');
  });
});
