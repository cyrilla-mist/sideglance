# Task 09C Gold Set Evaluation

## Status

PENDING REAL RUN. This document prepares the evaluation infrastructure; it does not contain model results or marketing claims.

## Methodology

The canonical registry combines 21 Context Intelligence cases and 6 Context Gate cases into 26 unique IDs, with `developer-readme-update` represented once. The pipeline runs the provider-enforced structured Gate first. `needs_context` cases are evaluated for minimum-context clarification and do not invoke the interpreter. `ready` cases run the existing AI context engine, model contract validation, deterministic evidence-reference resolution, final contract validation, exact grounding, and the existing evaluator.

## Configuration and transport

The evaluation override is `gemini-3.5-flash` with low reasoning. The PowerShell bridge is evaluation-only and runs through the local PowerShell host after a no-network DryRun and an explicit user `YES`. A minimal real connectivity check must pass before Gold fixtures are sent. Production Worker transport is not validated by this evaluation.

## Metrics and verdict

Reports include total/evaluated/pass/fail/provider-blocked counts, evaluated-case pass rate, completion rate, Gate and interpreter reliability, deterministic grounding counts, unsupported claims, provider attempts/statuses, category metrics, and average/median latency where data exists. Tokens and cost remain `not available` unless returned by the provider. `READY` requires at least 90% pass among evaluated cases, zero critical failures, zero invalid grounding, reliable critical Gate behavior, and sufficient completion. Incomplete external availability is `PROVIDER_BLOCKED`; repairable quality issues are `NEEDS_CALIBRATION`; critical or insufficiently complete results are `NOT_READY`.

## Security and limitations

Reports omit full fixtures, raw model output, raw evidence catalogs, prompts, API keys, and Authorization headers. Per-case checkpoint state is sanitized and fingerprinted by case registry/configuration before any future resume implementation is used. Provider availability and evaluation-only transport are separate from production transport.

## Output

The user-run operator writes `evaluation/reports/task09c-gold-set-run-01.json` and prints a compact sanitized summary only after completion.
