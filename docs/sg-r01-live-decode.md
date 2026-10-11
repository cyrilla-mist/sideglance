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
| Cost/abuse controls | **Not provided by CORS**; public AI mode needs rate limiting or authentication before exposure |

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

The Worker returns CORS headers for allowed browser origins on both successful responses and API failures. It rejects unknown origins **before** invoking a model. Requests without an `Origin` header remain available for explicit operator smoke tests.

**Security note:** Origin/CORS is a *browser boundary*, not client authentication. Scripts can send no Origin header. Before enabling any publicly accessible real-model endpoint, configure and verify server-side rate limits, spending limits and/or authentication. This task does not create those controls; do **not** switch the public Pages deployment from fixture based on these code changes alone.

## Review and testing (no API key)

From a Windows PowerShell terminal in the repository:

```powershell
npm ci
npm run typecheck
npm run worker:typecheck
npm test
npm run build:pages
```

The full repository test suite includes Windows PowerShell operator tests, so run it on **Windows**. Pull-request CI separately runs portable Decode/Worker integration tests plus both typechecks and the fixture Pages build on Ubuntu. All the listed checks are code-only/fixture tests; none proves real model inference.

For local fixture integration, in separate terminals run:

```powershell
npm run worker:dev
npm run dev
```

Vite proxies same-origin `/api/decode` to the local Worker on 127.0.0.1:8787. A fabricated random phrase should fail with `unknown_fixture` in local fixture mode; this is expected, not proof of a broken model.

## Controlled live verification — NOT run by this PR

1. Confirm the intended Google AI model, user-owned account and billing/quota setup independently. The `MODEL_NAME` in `wrangler.toml` is **not proof the named model currently exists or is usable**.
2. Confirm Worker secrets privately and run the **existing** readiness operator documented in `docs/task10-production-setup.md`. Never paste keys or account identifiers in ChatGPT or an issue.
3. Deploy **only after user authorization**, preserving the Pages fixture build. First verify `GET /api/health` (no AI cost).
4. Use the existing single-case `scripts/run-production-diagnostic.ps1` with a user-confirmed `YES` for one live model request. Use its safe diagnostic categories to distinguish auth, transport, model and schema failures.
5. Verify a novel phrase, an ambiguous phrase requiring context, and a contextual dialogue on a **non-public, explicitly approved live frontend** only after rate-limit / spending controls are configured.
6. Stop on any 502, provider failure, malformed contract, or uncontrolled cost. Do not claim production-ready before these conditions pass.

References: [Task 10 production setup](task10-production-setup.md), [Task 10 transport](task10-production-transport.md), [Product direction](product-direction.md).

## Deliberately excluded

No credential updates, remote Worker deployments, public Pages switch, cross-repository merge, Radar/Archive migration, social account handling, automatic Notion sync or paid inference in this PR.
