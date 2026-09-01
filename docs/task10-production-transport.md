# Task 10 production transport

Status: `DIRECT_GOOGLE_NATIVE_IMPLEMENTED_LOCALLY` · `READY_FOR_REDEPLOY` · `PRODUCTION_AI_SMOKE_PENDING`

The Worker keeps fixture mode network-free. AI mode selects the direct Google native production transport (`MODEL_TRANSPORT=google_native_direct`) or retained non-production alternatives (`direct`, `cloudflare_ai_gateway`, `cloudflare_google_native`). Both the Context Gate and Context Interpreter share one configured transport instance.

## Production request path

```text
Browser
  ↓
Cloudflare Worker
  ├─ Context Gate ─┐
  └─ Interpreter ──┴─ POST https://generativelanguage.googleapis.com/v1beta/models/{MODEL_NAME}:generateContent
                         x-goog-api-key
                         ↓
                    Google AI Studio / Gemini
  ↓
Evidence reference resolution and deterministic grounding validation
  ↓
Decode response
```

The production direct native transport uses only `x-goog-api-key: <MODEL_API_KEY>` for Google AI Studio. The Cloudflare Gateway transports remain isolated non-production alternatives and retain their own server-side authentication boundaries.

## Configuration (values are intentionally omitted)

Non-secret Worker variables:

- `CONTEXT_ENGINE_MODE=ai`
- `MODEL_TRANSPORT=cloudflare_google_native`
- `MODEL_NAME=<approved production model>`
- `CLOUDFLARE_ACCOUNT_ID=<account id>` (the operator stores this as a Worker secret so account metadata is not committed)

Worker secret:

- `CLOUDFLARE_AIG_TOKEN` — authenticated AI Gateway token created from the Cloudflare AI Gateway dashboard.
- `MODEL_API_KEY` — the user-owned Google AI Studio API key.

Do not use `VITE_` for either credential, put them in tracked files, or log them. Cloudflare Unified Billing credits and a payment method are not required for the current BYOK route. Future setup is documented in `docs/task10-production-setup.md`; this task performs none of those remote actions.

## Reliability and safety

Each model stage has a 30-second total transport budget and at most two attempts. Retries are limited to 429, 500–504, and a genuine timeout, with a short bounded backoff. `/api/decode` has a 65-second outer budget for Gate plus Interpreter. Client-visible errors are safe categories/messages; credentials, headers, internal endpoints, raw prompts, and model output are not logged or returned.

The Gate `response_format.type=json_schema` is translated to Gemini `generationConfig.responseMimeType=application/json` plus the existing `responseJsonSchema`. The Interpreter JSON mode is translated to `responseMimeType=application/json`. Native Gemini responses are adapted back to the existing OpenAI-compatible `choices[0].message.content` envelope before current parsing and contracts run. Malformed JSON, empty input, and oversized input/context are rejected before model work. The current model remains configurable; `PRODUCTION_MODEL_FINALIZATION_PENDING_EVALUATION` remains in force until the frozen evaluation evidence is sufficient.

The first production AI smoke reached the deployed Worker but returned HTTP 502 through the unified compat surface, the provider-specific OpenAI passthrough, and the documented Gateway-native attempt. For hackathon demo reliability, the current production candidate is direct Google native REST from the Worker; it is not claimed production-fixed until redeployment and the single-case diagnostic succeed.

## Post-deploy smoke plan (not run here)

1. `GET /api/health`
2. Ambiguous phrase → `needs_context`
3. Contextual Friday phrase → `decoded`
4. Exact evidence reference is grounded
5. Straightforward phrase is not overinterpreted
6. Provider failure returns a safe product error
