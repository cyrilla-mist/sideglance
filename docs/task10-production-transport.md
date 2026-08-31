# Task 10 production transport

Status: `IMPLEMENTED_LOCALLY` · `PENDING_CLOUDFLARE_CONFIGURATION` · `PENDING_DEPLOYMENT` · `PENDING_PRODUCTION_SMOKE`

The Worker keeps fixture mode network-free. AI mode selects either the existing direct OpenAI-compatible transport (`MODEL_TRANSPORT=direct`) or the production Cloudflare REST transport (`MODEL_TRANSPORT=cloudflare_ai_gateway`). Both the Context Gate and Context Interpreter share one configured transport instance.

## Production request path

```text
Browser
  ↓
Cloudflare Worker
  ├─ Context Gate ─┐
  └─ Interpreter ──┴─ POST https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions
                         model: google-ai-studio/{MODEL_NAME}
                         ↓
                    Google AI Studio / Gemini
  ↓
Evidence reference resolution and deterministic grounding validation
  ↓
Decode response
```

The Gateway transport uses the Cloudflare API token in the Worker-only `Authorization` header. It does not require `MODEL_API_KEY`; direct/evaluation use may continue to use that secret separately. The default Gateway REST endpoint is used; no gateway ID is required by this implementation.

## Configuration (values are intentionally omitted)

Non-secret Worker variables:

- `CONTEXT_ENGINE_MODE=ai`
- `MODEL_TRANSPORT=cloudflare_ai_gateway`
- `MODEL_NAME=<approved production model>`
- `CLOUDFLARE_ACCOUNT_ID=<account id>` (the operator stores this as a Worker secret so account metadata is not committed)

Worker secret:

- `CLOUDFLARE_API_TOKEN` — Cloudflare API token with `Account → Workers AI → Read` permission for the inference REST endpoint. AI Gateway management permissions are not required by this implementation.

Do not use `VITE_` for the token, put it in tracked files, or log it. Confirm sufficient Cloudflare Unified Billing / AI Gateway credits before production use. Future setup is documented in `docs/task10-production-setup.md`; this task performs none of those remote actions.

## Reliability and safety

Each model stage has a 30-second total transport budget and at most two attempts. Retries are limited to 429, 500–504, and a genuine timeout, with a short bounded backoff. `/api/decode` has a 65-second outer budget for Gate plus Interpreter. Client-visible errors are safe categories/messages; credentials, headers, internal endpoints, raw prompts, and model output are not logged or returned.

The Gate `response_format.type=json_schema` and Interpreter structured response format are passed through unchanged. Malformed JSON, empty input, and oversized input/context are rejected before model work. The current model remains configurable; `PRODUCTION_MODEL_FINALIZATION_PENDING_EVALUATION` remains in force until the frozen evaluation evidence is sufficient.

## Post-deploy smoke plan (not run here)

1. `GET /api/health`
2. Ambiguous phrase → `needs_context`
3. Contextual Friday phrase → `decoded`
4. Exact evidence reference is grounded
5. Straightforward phrase is not overinterpreted
6. Provider failure returns a safe product error
