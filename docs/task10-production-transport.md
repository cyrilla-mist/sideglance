# Task 10 production transport

Status: `HYPERBLOOM_PRODUCTION_CANDIDATE_LOCAL` · `READY_FOR_REDEPLOY` · `PRODUCTION_AI_SMOKE_PENDING`

The Worker keeps fixture mode network-free. AI mode selects the direct Google OpenAI-compatible production transport (`MODEL_TRANSPORT=google_openai_direct`) or retained non-production alternatives (`direct`, `google_native_direct`, `cloudflare_ai_gateway`, `cloudflare_google_native`). Both the Context Gate and Context Interpreter share one configured transport instance.

## Production request path

```text
Browser
  ↓
Cloudflare Worker
  ├─ Context Gate ─┐
  └─ Interpreter ──┴─ POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
                         Authorization: Bearer <MODEL_API_KEY>
                         ↓
                    Google AI Studio / Gemini
  ↓
Evidence reference resolution and deterministic grounding validation
  ↓
Decode response
```

The production direct OpenAI-compatible transport uses `Authorization: Bearer <MODEL_API_KEY>` for Google AI Studio. The Cloudflare Gateway and native transports remain isolated non-production alternatives and retain their own server-side authentication boundaries.

## Configuration (values are intentionally omitted)

Non-secret Worker variables:

- `CONTEXT_ENGINE_MODE=ai`
- `MODEL_TRANSPORT=google_openai_direct`
- `MODEL_NAME=<approved production model>`
- `CLOUDFLARE_ACCOUNT_ID=<account id>` (the operator stores this as a Worker secret so account metadata is not committed)

Worker secret:

- `CLOUDFLARE_AIG_TOKEN` — authenticated AI Gateway token created from the Cloudflare AI Gateway dashboard.
- `MODEL_API_KEY` — the user-owned Google AI Studio API key.

Do not use `VITE_` for either credential, put them in tracked files, or log them. Cloudflare Unified Billing credits and a payment method are not required for the current BYOK route. Future setup is documented in `docs/task10-production-setup.md`; this task performs none of those remote actions.

## Reliability and safety

Each model stage has a 30-second total transport budget and at most two attempts. Retries are limited to 429, 500–504, and a genuine timeout, with a short bounded backoff. `/api/decode` has a 65-second outer budget for Gate plus Interpreter. Client-visible errors are safe categories/messages; credentials, headers, internal endpoints, raw prompts, and model output are not logged or returned.

The Gate `response_format.type=json_schema` and the Interpreter JSON mode are preserved in the existing OpenAI-compatible request body. Google responses use the existing `choices[0].message.content` envelope and current parsing/contracts. Malformed JSON, empty input, and oversized input/context are rejected before model work. The current model remains configurable; `PRODUCTION_MODEL_FINALIZATION_PENDING_EVALUATION` remains in force until the frozen evaluation evidence is sufficient.

The first production AI smoke reached the deployed Worker but returned HTTP 502 through multiple Cloudflare Gateway candidates. For hackathon demo reliability, the current production candidate is direct Google OpenAI-compatible REST from the Worker; it is not claimed production-fixed until redeployment and the single-case diagnostic succeed.

## Post-deploy smoke plan (not run here)

1. `GET /api/health`
2. Ambiguous phrase → `needs_context`
3. Contextual Friday phrase → `decoded`
4. Exact evidence reference is grounded
5. Straightforward phrase is not overinterpreted
6. Provider failure returns a safe product error
