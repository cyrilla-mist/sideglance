# SG-R01 — Safe live Decode bridge (post-hackathon)

Status: **implementation candidate — NOT a verified production AI release**.

## What exists and what does not

| Boundary | Status |
| --- | --- |
| GitHub Pages `build:pages` | Deliberately fixture-only; deterministic demonstrations continue to work offline |
| Local Vite + local Worker | Development integration via existing `/api` proxy (default fixture Worker) |
| Standalone AI Worker | Has existing Gate → Interpreter transport and response contracts; health and historic tests exist |
| Configurable browser → Worker URL | Implemented in this branch with `VITE_DECODE_API_BASE_URL` |
| Allowed browser origins | Explicit Worker `ALLOWED_ORIGINS` list, exact matches, default deny |
| Production model inference | **Not verified**; previous 502 transport issues still need user-operated deployment and smoke |
| Paid-inference access | **Operator-only**: requires `AI_ACCESS_TOKEN` and Cloudflare `AI_RATE_LIMITER`; defaults to unavailable when either is missing |
| Cost/abuse controls | Three operator requests per 60 seconds **per Cloudflare location**; this is not a global budget cap or public-user authentication |

## Browser setup

In **non-fixture builds only**, set a non-secret base URL:

```env
VITE_DECODE_API_BASE_URL=https://YOUR-APPROVED-WORKER.workers.dev
```

It must be an HTTPS **origin**, without `/api/decode`, query strings, user info, or fragments. Local development may use `http://127.0.0.1:8787` or `http://localhost:8787` only. If unset, the client keeps its original same-origin `/api/decode` path.

Put local browser configuration in a gitignored `.env.local` if needed; never put `MODEL_API_KEY`, `CLOUDFLARE_*` tokens, or other secrets into `VITE_*` variables. The `npm run build:pages` flow still loads `.env.pages` with `VITE_DEMO_MODE=fixture`, so its app does **not** call the configured Worker.

The production Worker configuration in `wrangler.toml` defines:

```toml
ALLOWED_ORIGINS = "https://cyrilla-mist.github.io"
```

This is the **exact browser origin** (no `/sideglance/` path), not a wildcard. Other authorized origins may be comma-separated by an operator; otherwise denied. This setting takes effect **only after an explicitly approved Worker deployment**. It does not modify the existing remote Worker by merely merging code.

Browser route:
```text
Sideglance (non-fixture build)
  → POST ${VITE_DECODE_API_BASE_URL}/api/decode
  → Cloudflare Worker (trusted Origin allowlist and OPTIONS preflight)
  → Context Gate → AI Interpreter
  → validated DecodeResponse (decoded | needs_context | failed)
```

The Worker returns CORS headers for allowed browser origins on both successful responses and API failures. It rejects unknown origins **before** invoking a model. **For real AI mode**, an origin check is never sufficient: every POST requires a private `AI_ACCESS_TOKEN` bearer header and a working Cloudflare `AI_RATE_LIMITER` binding. A script without an Origin also needs the token. Never put this token in `VITE_*`, GitHub Pages, localStorage, or any frontend code.

**Security note:** CORS is not authentication. The current bearer token is for a single trusted operator, not website visitors. The Worker has a low-volume rate limiter, but Cloudflare states its counters are **per location and eventually consistent**, not a hard global spending cap. Do **not** distribute operator credentials or switch the public Pages demo to real inference. A public release still requires genuine end-user authentication, abuse monitoring, and a provider-side spending/quota policy.

## Review and testing (no API key)

From a Windows PowerShell terminal in the repository:

```powershell
npm ci
npm run typecheck
npm run worker:typecheck
npm test
npm run build:pages
npx wrangler deploy --dry-run --env production --outdir .wrangler/ci-production
```

The full repository test suite includes Windows PowerShell operator tests, so run it on **Windows**. Pull-request CI separately runs portable Decode/Worker integration tests plus both typechecks and the fixture Pages build on Ubuntu. All the listed checks are code-only/fixture tests; none proves real model inference.

For local fixture integration, in separate terminals run:

```powershell
npm run worker:dev
npm run dev
```

Vite proxies same-origin `/api/decode` to the local Worker on 127.0.0.1:8787. A fabricated random phrase should fail with `unknown_fixture` in local fixture mode; this is expected, not proof of a broken model.

## Controlled live verification — NOT run by this PR

The reviewed production model is **`gemini-3.8-flash`**, replacing the deprecated `gemini-3.7-flash` name (Google changelog, October 8, 2026): https://ai.google.dev/gemini-api/docs/changelog . This is a model configuration update, **not** a successful model request.

The project locks Wrangler **4.125.0**, which is newer than the Cloudflare rate limiting binding minimum **4.36.0**. Binding configuration is:

```toml
[[env.production.ratelimits]]
name = "AI_RATE_LIMITER"
namespace_id = "730011"

[env.production.ratelimits.simple]
limit = 3
period = 60
```

Confirm that the `namespace_id` is unused in your own Cloudflare account before deploying; rate limiting namespace IDs are shared across Workers within one account. This is intentionally conservative for private diagnostics and applies **per Cloudflare location, not globally**. Do not confuse it with spending protection.

1. **Review first**: GitHub PR checks must be green; check the linked Google model specification, AI Studio limits, costs, and desired budget. Confirm that the chosen Cloudflare namespace ID does not collide with other Workers.
2. **Private secret setup only with explicit user consent**: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/configure-production.ps1`. Prepare a separately generated, random 32+ character `AI_ACCESS_TOKEN` and retain it **privately in a password manager**. The setup prompts through Wrangler; never paste tokens into chat, commits, GitHub Issues, PR comments or diagnostics. The Google provider's `MODEL_API_KEY` is a separate secret.
3. **Readiness**: `npm run production:readiness` checks the current code, local Wrangler access, and presence (names only) of both Worker secrets plus production bundle dry-run. A passing readiness check does **not** prove model inference works.
4. **Deploy only after separate user authorization**: The existing `scripts/deploy-production.ps1` requires exact `DEPLOY`. Do not modify the fixture-only Pages site. Check `GET /api/health` first.
5. **One bounded paid-provider diagnostic, separately approved**: From PowerShell invoke `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-protected-operator-smoke.ps1 -ProductionUrl https://sideglance-worker-production.YOUR-SUBDOMAIN.workers.dev`. The script accepts only the exact production Workers.dev hostname format, checks free `/api/health`, prompts for an explicit `YES`, then securely asks for `AI_ACCESS_TOKEN` and sends **one** ambiguous test phrase. It reports only safe HTTP / response / diagnostic codes. This can incur provider charges, and it does not verify all model output quality.
6. **Stop rules**: Stop on any unauthorized/429/502/timeout, absent model quota, billing uncertainty, missing or colliding rate-limit namespace, or malformed response. Never expose the operator secret to a website.

`scripts/run-production-diagnostic.ps1` and `run-production-smoke.ps1` are legacy **unauthenticated** scripts and do not work against the new protected AI route. Use the new protected one-case script instead; full scenario testing belongs in a later operator-only protocol.

References: [Task 10 production setup](task10-production-setup.md), [Task 10 transport](task10-production-transport.md), [Product direction](product-direction.md), [Cloudflare Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Deliberately excluded

No credential updates, remote Worker deployments, public Pages switch, cross-repository merge, Radar/Archive migration, social account handling, automatic Notion sync or paid inference in this PR.
