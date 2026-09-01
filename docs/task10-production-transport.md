# Task 10 production transport

Status: `DEPLOYED` · `HEALTH_PASS` · `AI_SMOKE_FAILED_DIAGNOSTIC_PENDING`

The Worker keeps fixture mode network-free. AI mode selects either the existing direct OpenAI-compatible transport (`MODEL_TRANSPORT=direct`), the optional Unified Billing transport, or the production BYOK transport (`MODEL_TRANSPORT=cloudflare_ai_gateway_byok`). Both the Context Gate and Context Interpreter share one configured transport instance.

## Production request path

```text
Browser
  ↓
Cloudflare Worker
  ├─ Context Gate ─┐
  └─ Interpreter ──┴─ POST https://gateway.ai.cloudflare.com/v1/{account}/default/compat/chat/completions
                         model: google-ai-studio/{MODEL_NAME}
                         ↓
                    Google AI Studio / Gemini
  ↓
Evidence reference resolution and deterministic grounding validation
  ↓
Decode response
```

The BYOK transport uses the Worker-only `cf-aig-authorization: Bearer <CLOUDFLARE_AIG_TOKEN>` header for AI Gateway and `Authorization: Bearer <MODEL_API_KEY>` for the user-owned Google AI Studio credential. The `cf-aig-collect-log-payload: false` privacy header is sent. The default gateway is used; no gateway ID is required.

## Configuration (values are intentionally omitted)

Non-secret Worker variables:

- `CONTEXT_ENGINE_MODE=ai`
- `MODEL_TRANSPORT=cloudflare_ai_gateway_byok`
- `MODEL_NAME=<approved production model>`
- `CLOUDFLARE_ACCOUNT_ID=<account id>` (the operator stores this as a Worker secret so account metadata is not committed)

Worker secret:

- `CLOUDFLARE_AIG_TOKEN` — authenticated AI Gateway token created from the Cloudflare AI Gateway dashboard.
- `MODEL_API_KEY` — the user-owned Google AI Studio API key.

Do not use `VITE_` for either credential, put them in tracked files, or log them. Cloudflare Unified Billing credits and a payment method are not required for the current BYOK route. Future setup is documented in `docs/task10-production-setup.md`; this task performs none of those remote actions.

## Reliability and safety

Each model stage has a 30-second total transport budget and at most two attempts. Retries are limited to 429, 500–504, and a genuine timeout, with a short bounded backoff. `/api/decode` has a 65-second outer budget for Gate plus Interpreter. Client-visible errors are safe categories/messages; credentials, headers, internal endpoints, raw prompts, and model output are not logged or returned.

The Gate `response_format.type=json_schema` and Interpreter structured response format are passed through unchanged. Malformed JSON, empty input, and oversized input/context are rejected before model work. The current model remains configurable; `PRODUCTION_MODEL_FINALIZATION_PENDING_EVALUATION` remains in force until the frozen evaluation evidence is sufficient.

The first production AI smoke reached the deployed Worker but returned HTTP 502 for all three model cases. The sanitized report contained `unknown_502` and no response body or diagnostic code, so the underlying Gateway/provider cause remains unconfirmed. The Worker now returns a short request ID on controlled failures and emits allowlisted failure telemetry; use `scripts/run-production-diagnostic.ps1` for the next single-case diagnosis. Production AI validation remains pending.

## Post-deploy smoke plan (not run here)

1. `GET /api/health`
2. Ambiguous phrase → `needs_context`
3. Contextual Friday phrase → `decoded`
4. Exact evidence reference is grounded
5. Straightforward phrase is not overinterpreted
6. Provider failure returns a safe product error
