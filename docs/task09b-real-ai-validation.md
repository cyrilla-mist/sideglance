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

## Gemini 3.5 Flash Availability Control

This evaluation-only experiment changed only the model override from `gemini-3.7-flash` to `gemini-3.5-flash`; `reasoning_effort: "low"`, prompt, response format, contract, and retry policy were unchanged. The Friday request received HTTP `200` in 16,301 ms, and envelope parsing, assistant extraction, and JSON parsing passed. The ContextAnalysis guard captured four enum mismatches (`register`, two `tone` values, and one signal type), so the result is `CONTRACT_DIAGNOSTIC_CAPTURED`. The limited snapshot detected Friday developer-risk context, ironic/playful framing, and weekend implication, but this is not formal evaluator scoring. Production `MODEL_NAME` and provider defaults remain unchanged.

## Prompt Calibration Round 1

Baseline assessment: `prompt_contract_under_specified` was true. The previous prompt showed enum examples but did not enumerate the complete contract vocabulary or explicitly prohibit invented/composite taxonomy labels. The prompt now states the complete shared enum sets, requires exact taxonomy values, forbids synonyms and composite labels, and directs richer nuance into descriptive fields. The TypeScript contract, guard, provider, response format, model, and evaluation transport were unchanged.

The calibrated Friday run used `gemini-3.5-flash` with `reasoning_effort: "low"`. Attempt 1 timed out; Attempt 2 returned HTTP `200` in 7,974 ms. Envelope parsing, JSON parsing, and ContextAnalysis contract validation passed. The semantic regression snapshot remained positive for developer Friday context, ironic/playful framing, and weekend implication. Evidence statistics were `0 / 0 / 0`; no formal evaluator score was run. Classification: `CALIBRATION_PASS`.

## 09B.12 Low Reasoning Control

This was an evaluation-only single-variable experiment. The request shape confirmed `model`, `messages`, and `response_format` remained present, with only `reasoning_effort: "low"` added; no production provider default was changed. Both bounded Friday attempts timed out before an HTTP response (30,023 ms and 30,031 ms), so envelope parsing, assistant extraction, JSON parsing, contract diagnosis, evidence checks, and semantic snapshot were not reached. The result is `PROVIDER_AVAILABILITY_BLOCKED`, not a low-reasoning candidate and not a production configuration decision.

## Current 09B checkpoint

Production Worker transport remains unvalidated. Local Node/workerd has Google API network-path issues. The PowerShell bridge is explicitly evaluation-only and is not imported by `worker/` or `src/`. Gemini has returned HTTP `200` at least once through that bridge; the OpenAI-compatible envelope and JSON parsing passed on that run, but the hand-written ContextAnalysis contract guard rejected the output and the exact mismatch was not captured. Explainable guard diagnostics now exist, and deterministic tests are healthy: the targeted contract tests pass `4/4`, while the full unit suite passes `32/32`. Semantic model validation remains pending; no Friday Merge pass, Gold Set evaluation, or production transport validation has been established.

## 09B.11 Friday real contract capture

The clean checkpoint was retried once with the existing bounded policy. Attempt 1 returned HTTP `503` in 9,611 ms and was classified as `provider_temporarily_unavailable`. Attempt 2 used a fresh child/provider/controller but timed out after 30,020 ms without an HTTP response. Because no attempt returned HTTP `200`, envelope parsing, assistant extraction, JSON parsing, and contract diagnosis were not reached. The primary result is `evaluation_transport_timeout`, with `provider_temporarily_unavailable` as a secondary category. No contract mismatch can be inferred from this run, and no code, prompt, model, or contract change was made.

## 09B.15 Four-case real AI preflight

The calibration checkpoint was frozen before gate work in commit `94448e3` (`refine: align context prompt with contract vocabulary`). Static grounding audit confirmed that `ContextAnalysis` has no formal evidence or quote field, and `ContextEvaluator` does not enforce source grounding; the earlier `0 / 0 / 0` evidence result therefore reflects the absent contract field and non-enforcing evaluator.

`AIContextGateEngine` now uses the existing gate result vocabulary, an injected `FetchLike` seam, a bounded 30-second AbortController, and JSON contract validation. The gate is evaluated before `AIContextEngine`; a `needs_context` result does not invoke the interpreter. PowerShell remains evaluation-only and is not imported by production code.

The authorized four-case preflight stopped at Case A under the hard-fail rule. The gate and interpreter both returned HTTP `200`; the gate contract, ContextAnalysis contract, and Friday semantic checks passed. One of three model signal phrases was not an exact cue in the input, so the case was classified as fabricated specific evidence. Cases B-D were not run. Formal evidence grounding remains `not_enforced_by_current_contract`; no evidence metric was fabricated. Gold Set and full evaluation were not run.

## 09B.16 Evidence grounding hardening and Calibration Round 2

The 09B.15 AI Context Gate checkpoint was frozen in commit `1f12005` (`feat: add AI context gate`). `ContextSignal` now requires `evidenceQuote`. The deterministic validator uses only case-sensitive exact substring matching against the original input plus explicit additional context; it performs no trimming, case repair, fuzzy matching, semantic similarity, or automatic rewriting. Validation occurs after provider envelope parsing, JSON parsing, and ContextAnalysis schema validation.

An invalid evidence quote is an internal `hallucinated_evidence` provider failure and cannot enter the decoded response. The public route returns a safe generic failure instead of exposing provider internals. The existing editorial evidence flow now renders the verified `evidenceQuote` directly.

Calibration Round 2 used `gemini-3.5-flash`, `reasoning_effort: low`, and the evaluation-only PowerShell bridge. Gate and interpreter each returned HTTP `200`; ContextAnalysis contract validation passed; semantic checks passed; grounding was `2/3` exact with one invalid quote. Final classification: `MODEL_GROUNDING_NONCOMPLIANCE`. No Cases B-D, Gold Set, or Prompt Calibration Round 3 were run.

## 09B.17 Deterministic evidence-reference architecture

The grounding checkpoint was frozen in commit `6bb47b6` (`feat: validate context evidence against source`). The probabilistic layer no longer generates evidence text. `buildEvidenceCatalog` creates stable `E1`, `E2`, ... units from non-empty source lines in the original input and explicit additional context, preserving each line verbatim.

The model-only contract uses `evidenceRef`; `resolveContextEvidence` maps each reference to a catalog unit and creates the public `ContextSignal.evidenceQuote`. Unknown references hard-fail as `invalid_evidence_reference`; there is no fuzzy repair or fallback. The final pipeline is model envelope → JSON → model contract → reference resolution → final contract → exact grounding validator → decoded UI. The public `ContextAnalysis` and editorial UI remain unchanged except that displayed quotes now come from the deterministic resolver.

Friday reference calibration used `gemini-3.5-flash` with low reasoning through the evaluation-only PowerShell bridge. Gate and interpreter returned HTTP `200`; all 3 evidence references resolved; final grounding was `3/3` exact with `0` invalid; semantic requirements passed and unsupported claims were absent. Classification: `GROUNDING_REFERENCE_PASS`. This is not a four-case preflight: Cases B-D and Gold Set were not run.

## 09B.18 Full four-case preflight Round 2

The evidence-reference architecture was frozen in commit `4eb75a8` (`feat: resolve model evidence from source references`) before this validation. Case A was independently rerun and passed: Gate HTTP `200`, interpreter HTTP `200`, model contract pass, 3/3 valid references, 3/3 exact grounding, and all semantic checks pass.

Case B received HTTP `200` at the Gate stage but returned an invalid Gate contract. The interpreter was not invoked, and the preflight stopped as required. Cases C and D were not executed. Repository inspection found no existing README Gold/preflight fixture for Case D; no replacement case was invented. Overall result: `FAIL` due to `invalid_gate_or_provider_contract`, with D additionally unavailable as `missing_existing_readme_case`.

## Fearless Alone Gate Recovery

The preserved Round 2 failure remains unchanged: Case B returned HTTP `200`, the Gate contract was invalid, and interpretation did not run. The Gate diagnostic now reports safe field-level issues while retaining the boolean guard behavior. Static audit classified the original prompt as `prompt_gate_contract_under_specified`; it listed enums and the one-question rule but did not fully state the exact ready/needs_context shapes.

The Gate prompt was minimally clarified to require exactly the existing JSON shape, omit clarification fields for `ready`, require non-empty `missingInformation` plus one question for `needs_context`, and prohibit invented fields or labels. The Gate-only recovery returned HTTP `200` in 7,627 ms and JSON parsing passed, but the model still omitted `missingInformation`. The interpreter was not invoked. Final classification: `GATE_CONTRACT_NONCOMPLIANCE`. Cases C-D, Gold Set, and further calibration were not run.

## Provider-Enforced Gate Contract

The previous Gate relied on prompt-only structural discipline, which still allowed a response to omit required `missingInformation`. The public `ContextGateResult` semantics were not changed. `AIContextGateEngine` now requests `response_format.type = json_schema` with separate strict `ready` and `needs_context` branches, while the deterministic Gate diagnostic remains the final guard.

The authorized Fearless Alone structured-output run made two fresh attempts. Both timed out after approximately 30 seconds without an HTTP response, so structured-output acceptance, JSON parsing, and Gate contract validation were not reached. No fallback request without the schema was made. Final classification: `PROVIDER_BLOCKED`. Cases C-D and Gold Set were not run.

## 09B.21 Structured Gate freeze and straightforward control case

The locally validated structured Gate implementation is frozen in commit `b169b57` (`feat: add structured output contract for context gate`). Provider acceptance remains unverified because the authorized structured Gate run reached two transport timeouts; no real model call is part of this case-design task.

The official straightforward control case is now registered as `developer-readme-update` in the `developer_culture` category. It uses a routine README/setup exchange, expects `ready`, and permits zero signals because the current ContextAnalysis contract allows an empty signals array. Its evaluator forbids invented sarcasm, tension, warnings, risky deployment implications, platform claims, and unsupported relationship claims. This is a deterministic control asset, not a real-AI pass.

## 09B.22 Full 4-Case Real-AI Preflight — Structured Gate Round

The official real-AI order is B → A → C → D, using `gemini-3.5-flash`, low reasoning, and the evaluation-only PowerShell bridge. All cases use the provider-enforced strict JSON Schema Gate; no `json_object` fallback is permitted. The runner allows two fresh attempts for transient provider failures only, continues after case-level semantic or grounding failures, and stops for provider-wide blockers.

The generated report is `evaluation/reports/task09b-four-case-preflight-03.json`. It separates Gate reliability, interpreter semantic quality, contract reliability, deterministic evidence-reference grounding, provider availability, and production transport status. Production Worker transport remains unvalidated. Gold Set and full evaluation are not run, and the report and this documentation entry remain uncommitted for review.

## Manual Operator Run

Codex execution approval blocked the external 09B.22 call; this is an execution-environment boundary, not a model or product failure. The user-operated local flow is available at `evaluation/scripts/run-task09b-preflight.ps1` and reuses the existing four-case runner in B → A → C → D order. It runs the local checks first, requires an explicit `YES`, and otherwise makes no network call. The existing evaluation-only PowerShell transport loads `.dev.vars` locally without placing credentials on the command line; the report is sanitized and production Worker transport remains unvalidated.

## Preflight Telemetry Repair

The user-operated run `task09b-four-case-preflight-03.json` genuinely reached `PROVIDER_BLOCKED`; A/C/D correctly remained `NOT_RUN`. It is preserved as `evaluation/reports/task09b-four-case-preflight-03-telemetry-defect.json` with its original fields unchanged. That historical report contains known attempt-recording and structured-Gate acceptance-state defects and must not be used to verify provider acceptance.

Before any further real-AI conclusion, the evaluation runner now records each started external attempt independently with attempt-local monotonic latency, status, category, and response reachability. Counts derive from record lengths, retry backoff is separate, and report integrity is checked before writing. Structured Gate acceptance is `verified` only after a successful structured result, `rejected` only after explicit provider rejection, and otherwise `unverified`. The next manual run writes `evaluation/reports/task09b-four-case-preflight-04.json`.

## 09B.27 Evaluation PowerShell host compatibility

Run 04 remains historical and unchanged. Its two immediate `evaluation_transport_error` attempts likely occurred before provider access because the evaluation transport hardcoded `pwsh`, while the user host provides Windows PowerShell. Structured Gate acceptance remains `unverified`; Run 04 must not be interpreted as a Gemini failure. The evaluation-only transport now selects `pwsh` first and `powershell.exe` second, reports shell/PowerShell failures separately from provider timeouts, and uses Windows PowerShell 5-compatible request handling. Future reports include only the safe shell name (`pwsh` or `powershell.exe`).
