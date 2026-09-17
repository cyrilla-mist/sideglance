# Sideglance Evaluation

This directory contains the evaluation harness and preserved verification artifacts for Sideglance.

It is **not** the current product roadmap and it should not be read as a list of unresolved product failures. For current product status and direction, start with [`../README.md`](../README.md) and [`../docs/README.md`](../docs/README.md).

## Directory Roles

- `cases/` — evaluation cases and fixtures used to exercise Decode behavior.
- `evaluator/` — scoring / evaluation logic.
- `runners/` — executable evaluation flows.
- `schemas/` — evaluation-specific schemas and contracts.
- `scripts/` — supporting evaluation utilities.
- `transports/` — execution / provider transport boundaries used by evaluation flows.
- `context-schema-check.ts` — context-schema validation helper.
- `reports/` — preserved point-in-time run outputs and reliability evidence.

## Historical Reports

Many files under `reports/` were produced during the Task 09B reliability-hardening period, including preflight, structured-gate, grounding, telemetry, and provider-control checks.

These JSON files are retained for provenance. A historical report can record a failure, transport error, blocked run, or intermediate defect that was later repaired; its status must therefore **not** be interpreted as the current health of Sideglance.

When determining present behavior, prefer this order:

```text
current source code and tests
  → current README / product docs
  → current CI and deployment state
  → historical evaluation reports
```

## Maintenance Rule

Keep reports when they document a meaningful engineering decision, failure mode, or acceptance checkpoint. New temporary or purely local outputs should not be committed by default.

If the evaluation system is substantially redesigned later, preserve useful historical reports as an explicit archive rather than silently treating them as current evaluation results.
