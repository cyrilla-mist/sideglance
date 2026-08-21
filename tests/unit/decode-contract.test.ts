import { describe, expect, it } from 'vitest';
import { assertDecodeResponse, parseDecodeRequest } from '../../shared/schemas/decode';

describe('decode contracts', () => {
  it('accepts a valid request and rejects an empty input', () => {
    expect(parseDecodeRequest({ inputText: 'fearless behavior' }).inputText).toBe('fearless behavior');
    expect(() => parseDecodeRequest({ inputText: ' ' })).toThrow('inputText cannot be empty');
  });

  it('rejects malformed responses before rendering', () => {
    expect(() => assertDecodeResponse({ type: 'decoded', confidence: 'certain' })).toThrow('invalid decode response');
  });
});
