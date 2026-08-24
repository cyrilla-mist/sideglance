# Task 09B — Host-side Real AI Validation

## Execution environment

The validation used a normal host-side Node process through `vite-node`, directly instantiating `ModelContextProvider` and `AIContextEngine`. It did not use Wrangler, a local Worker, or a remote Worker. The provider used the configured model and endpoint from `.dev.vars`, with a Node-safe `globalThis.fetch` wrapper.

The Worker path was not used because Task 09A isolated a local workerd Google egress failure. This run does not validate production Worker connectivity.

## Baseline smoke

The single Friday Merge case was attempted once:

- Case: `task09b-friday-merge`
- Model: `gemini-3.7-flash`
- Latency: 10,661 ms
- Result: provider error (`Context model is unavailable.`)
- JSON parse: not reached
- ContextAnalysis contract guard validation: not reached
- Deterministic evaluator: not reached

The API key was configured in the process but was not printed or written to the report.

## Gate and preflight status

Only `MockContextGateEngine` exists. An `AIContextGateEngine` is not implemented. Because the Friday Merge smoke failed first, four-case preflight was not run. Cases B, C, and D were not represented as successful AI results.

Gold Set and full evaluation were not run.

## Reliability and verdict

ContextAnalysis contract reliability and gate reliability are unconfirmed because the provider failed before returning model content. There are no valid latency comparisons across cases.

Strongest case: none.

Weakest case: Friday Merge, blocked at provider request.

Verdict: `NOT_READY`

## 09B.1 provider parity diagnostic

The provider now retains safe internal diagnostics while keeping the public error text unchanged. The diagnostic captures failure stage, HTTP status when available, content type, elapsed time, envelope/content progress, and a bounded provider message without credentials or full bodies.

The minimal request was sent through `ModelContextProvider` with the same host configuration, model, endpoint, API key, and native-fetch wrapper used by the host path. It failed at:

- Stage: `fetch_error`
- Latency: 10,626 ms
- HTTP status: not received
- Assistant content: not reached
- Envelope parse: not reached

Because this parity control failed, the Friday request without `response_format` was not run. No third provider call was made. The result isolates a host-side provider parity failure before HTTP response/envelope handling; it does not establish a prompt, schema, or `response_format` cause.

## 09B.2 host fetch parity isolation

The earlier successful Probe B was not a Node fetch: it used a PowerShell `Invoke-WebRequest` process, loading `.dev.vars` in memory and sending a minimal authenticated request with `max_tokens: 8`. The current provider runner uses Node `v26.2.0` through `vite-node`, with `globalThis.fetch` backed by Node/undici.

The same-process raw Node control used the provider-equivalent URL normalization, POST method, Bearer authorization style, JSON content type, minimal messages, no `response_format`, and a 30-second AbortController. It failed before an HTTP response:

- Result: fail
- Latency: 10,639 ms
- Error: `TypeError: fetch failed`
- Cause code: `UND_ERR_CONNECT_TIMEOUT`
- Provider retry: not run
- Friday request: not run

Static differences from the successful PowerShell probe are the HTTP runtime (PowerShell/.NET versus Node/undici), the successful probe's `max_tokens: 8`, and its `TimeoutSec 40` versus the provider's 30-second budget. No custom dispatcher, agent, keepalive, proxy configuration, or extra headers are configured in the Node path.

This isolates the current issue as a Node host network-path failure rather than a `ModelContextProvider` parity bug. No provider fix was made in 09B.2.

## Evaluation Transport Workaround

Task 09B.4 added an evaluation-only PowerShell Core (`pwsh`) transport bridge under `evaluation/transports/`. The TypeScript evaluation runner still constructs the Sideglance prompt, request body, `response_format`, OpenAI-compatible envelope handling, JSON parsing, ContextAnalysis contract guard validation, and deterministic evaluation. PowerShell is used only for the HTTP transport; the API key is inherited through the child process environment and the request body is sent through stdin.

The bridge exists because the local Node/workerd network path cannot currently reach Google APIs, while the previously verified PowerShell path can. It is not imported by `worker/` or `src/`, is not production architecture, and does not validate production Worker connectivity.

The single Friday Merge smoke through the bridge received HTTP `503` after 12,099 ms. The safe provider message classified it as a provider HTTP error (`UNAVAILABLE`, temporarily high demand). Provider response was received, but envelope parsing, JSON parsing, and ContextAnalysis validation were not reached. No additional model case was run.

## 09B.5 transient retry result

The evaluation-only bridge performed the bounded retry policy: one initial request plus one retry after a 20-second wait. Attempt 1 returned HTTP `503` (`transient_provider_error`) in 7,141 ms. Attempt 2 did not receive an HTTP response before the formal provider 30-second AbortController deadline; the final stage was `timeout` at 30,044 ms. No third request was made, and the Friday smoke did not pass structured validation.

## 09B.6 retry deadline fix and Friday smoke

The retry deadline bug was fixed in the evaluation path. Each attempt now creates a new PowerShell child process, a new fetch seam, a new `ModelContextProvider`, and therefore a new provider `AbortController`. Backoff occurs only after the completed attempt and is outside the 30-second per-attempt provider budget. The retry policy remains bounded at two total attempts.

The Friday Merge smoke was run once after this fix. Attempt 1 received HTTP `503` in 10,455 ms and was classified as `transient_provider_error`; the bridge waited 20 seconds before retrying. Attempt 2 received HTTP `200` in 9,163 ms. The response envelope was parsed and assistant content was reached, but the returned JSON failed `ContextAnalysis` contract guard validation. JSON parsing itself was not the failing stage. No third attempt, other case, preflight, Gold Set, or full evaluation was run.

## Friday Schema Diagnostic

The runtime contract is implemented by the hand-written `isContextAnalysis` guard, not Zod. The prompt and contract use the same required field names and documented object/array shapes; the prompt examples use valid enum values, although the full enum vocabulary is not listed. The allowed single diagnostic run received HTTP `503` on both bounded attempts, so no new assistant JSON was available for safe structural issue extraction. The earlier HTTP `200` smoke result recorded only the generic contract-guard failure. Exact mismatch path, enum value, evidence quotes, and semantic snapshot therefore remain unavailable; this is classified as `other` / insufficient mismatch evidence, not attributed to the model or schema without proof. No fix was applied.

## 09B.8 explainable ContextAnalysis contract diagnostic

The existing boolean `isContextAnalysis` guard now delegates to a pure `diagnoseContextAnalysis` function. It reports safe paths and categories for missing fields, wrong types, invalid enums, invalid arrays, and invalid nested shapes without changing the contract or exposing long model text. Deterministic cases cover a valid fixture, a wrong required field, an invalid enum, and a missing nested signal field. Vitest is healthy when run with the required project-local directory permissions.

The single authorized Friday contract capture did not reach Gemini content: its only bounded attempt ended in a 30,029 ms transport timeout with no HTTP response. Consequently no new guard issue, structure, evidence, or semantic snapshot could be extracted. The earlier HTTP 200/schema-failure observation remains a generic contract-guard failure without exact mismatch evidence. No prompt, contract, normalization, or model change was made.

## Current 09B checkpoint

Production Worker transport remains unvalidated. Local Node/workerd has Google API network-path issues. The PowerShell bridge is explicitly evaluation-only and is not imported by `worker/` or `src/`. Gemini has returned HTTP `200` at least once through that bridge; the OpenAI-compatible envelope and JSON parsing passed on that run, but the hand-written ContextAnalysis contract guard rejected the output and the exact mismatch was not captured. Explainable guard diagnostics now exist, and deterministic tests are healthy: the targeted contract tests pass `4/4`, while the full unit suite passes `32/32`. Semantic model validation remains pending; no Friday Merge pass, Gold Set evaluation, or production transport validation has been established.
