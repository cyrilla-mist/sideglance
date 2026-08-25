import type { ContextGateResult, ContextSufficiency } from '../../shared/contracts/context-gate';
import { assertContextGateResult, diagnoseContextGateResult, type ContextGateIssue } from '../../shared/schemas/context-gate';
import type { FetchLike } from '../providers/context-provider';

export interface ContextGateEngine {
  checkContext(input: string, additionalContext?: string): Promise<ContextGateResult>;
}

export class MockContextGateEngine implements ContextGateEngine {
  async checkContext(input: string, additionalContext?: string): Promise<ContextGateResult> {
    const normalized = input.toLowerCase().replaceAll('💀', '').trim();
    const context = additionalContext?.toLowerCase().trim() ?? '';
    if (normalized === 'fearless behavior' && !context) return needsContext('The phrase could be sincere praise or sarcasm depending on the situation.', 'What was said immediately before this?');
    if (normalized === 'bold move' && !context) return needsContext('The phrase can be admiration, sarcasm, or criticism depending on the surrounding exchange.', 'What happened immediately before this?');
    if (normalized === 'interesting choice' && !context) return needsContext('The phrase can be genuine interest or indirect criticism depending on the tone around it.', 'What was the surrounding exchange?');
    if (isFridayMerge(`${normalized}\n${context}`)) return ready('high');
    if (normalized === 'fearless behavior' && hasSincereFearlessContext(context)) return ready('high');
    return ready('low');
  }
}

export type AIContextGateConfig = { apiKey?: string; endpoint?: string; model?: string; fetcher?: FetchLike; timeoutMs?: number; reasoningEffort?: 'low' | 'medium' | 'high' };

export class ContextGateError extends Error {
  constructor(public readonly stage: 'missing_api_key' | 'transport' | 'http_error' | 'invalid_json' | 'invalid_contract' | 'timeout', message: string, public readonly status?: number, public readonly issues?: ContextGateIssue[]) {
    super(message);
    this.name = 'ContextGateError';
  }
}

export class AIContextGateEngine implements ContextGateEngine {
  private readonly fetcher: FetchLike;

  constructor(private readonly config: AIContextGateConfig) {
    this.fetcher = config.fetcher ?? ((input, init) => globalThis.fetch(input, init));
  }

  async checkContext(input: string, additionalContext?: string): Promise<ContextGateResult> {
    if (!this.config.apiKey) throw new ContextGateError('missing_api_key', 'Context gate API key is not configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);
    try {
      const response = await this.fetcher(resolveEndpoint(this.config.endpoint ?? 'https://api.openai.com/v1/chat/completions'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` },
        body: JSON.stringify({
          model: this.config.model ?? 'gpt-4o-mini',
          temperature: 0,
          ...(this.config.reasoningEffort ? { reasoning_effort: this.config.reasoningEffort } : {}),
          response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: gateSystemPrompt }, { role: 'user', content: `Assess whether this input has enough context for a reliable interpretation.\nInput:\n${input}${additionalContext?.trim() ? `\nAdditional context:\n${additionalContext.trim()}` : ''}` }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new ContextGateError('http_error', 'Context gate provider returned an HTTP error.', response.status);
      const payload = await response.json().catch(() => { throw new ContextGateError('invalid_json', 'Context gate provider returned invalid JSON.'); }) as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string') throw new ContextGateError('invalid_json', 'Context gate provider returned no JSON content.');
      let parsed: unknown;
      try { parsed = JSON.parse(content); } catch { throw new ContextGateError('invalid_json', 'Context gate returned invalid JSON content.'); }
      try { return assertContextGateResult(parsed); } catch { throw new ContextGateError('invalid_contract', 'Context gate returned an invalid contract.', undefined, diagnoseContextGateResult(parsed).issues); }
    } catch (error) {
      if (error instanceof ContextGateError) throw error;
      if (controller.signal.aborted) throw new ContextGateError('timeout', 'Context gate request timed out.');
      throw new ContextGateError('transport', 'Context gate request failed.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

const gateSystemPrompt = `You are the Sideglance Context Gate. Decide only whether the supplied information is sufficient for a reliable context interpretation. Ask — do not guess.

Return only one JSON object using exactly this contract. Do not add fields or invent labels:
status: exactly one of ready, needs_context
confidence: exactly one of high, medium, low
reason: exactly one of context_sufficient, ambiguous_phrase, insufficient_context
sufficiency: object with boolean toneJudgment, socialImplication, usageBoundary
If status is ready, omit missingInformation and question entirely.
If status is needs_context, include non-empty missingInformation and exactly one specific question ending with one question mark.
Do not output a full interpretation, sarcasm verdict, social essay, or demographic/identity inference.`;

function resolveEndpoint(endpoint: string): string {
  const url = new URL(endpoint);
  if (url.pathname.endsWith('/chat/completions')) return url.toString();
  url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`;
  return url.toString();
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
  return input.includes('friday') && input.includes('fearless behavior');
}

function hasSincereFearlessContext(context: string): boolean {
  return context.includes('mia:') && context.includes('spoke up') && context.includes('issue');
}
