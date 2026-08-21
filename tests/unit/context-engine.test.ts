import { describe, expect, it } from 'vitest';
import { MockContextEngine } from '../../worker/engine/context-engine';
import type { ContextEngine } from '../../worker/engine/context-engine';

describe('ContextEngine', () => {
  it('supports the interface with a deterministic Friday Merge mock', async () => {
    const engine: ContextEngine = new MockContextEngine();
    const result = await engine.analyze('Nora: just merged the auth rewrite into main\nKai: on a friday??\nLeo: fearless behavior 💀\nKai: enjoy your weekend');
    expect(result?.tone).toEqual(['playful', 'sarcastic']);
    expect(result?.register).toBe('technical');
  });

  it('does not infer context for unsupported input', async () => {
    expect(await new MockContextEngine().analyze('unrelated fixture')).toBeUndefined();
  });
});
