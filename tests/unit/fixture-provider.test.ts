import { describe, expect, it } from 'vitest';
import { FixtureProvider } from '../../worker/providers/fixture-provider';

describe('FixtureProvider', () => {
  const provider = new FixtureProvider();

  it('returns Needs Context for fearless behavior alone', () => {
    expect(provider.decode({ inputText: 'fearless behavior' })).toMatchObject({ type: 'needs_context' });
  });

  it('returns genuine praise with the supplied context', () => {
    expect(provider.decode({ inputText: 'fearless behavior', additionalContext: 'Mia: I finally spoke up about the issue even though I was terrified.' })).toMatchObject({ type: 'decoded', confidence: 'high' });
  });
});
