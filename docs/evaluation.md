# Context Intelligence Evaluation

Sideglance evaluation checks whether a context analysis explains internet language responsibly, rather than whether it produces polished prose. The evaluator is deterministic and independent from model selection.

## What it tests

- Tone match against the expected semantic tone.
- Register and community-context recognition.
- Required signals such as wording, timing, emoji, or irony.
- Forbidden claims that overstate unobserved intent.
- Presence and quality of `naturalIn`, `beCarefulIn`, and `avoidIn` usage boundaries.
- Explicit uncertainty for ambiguous cases.

## Case categories

The gold set in `evaluation/cases/gold.ts` contains 20 cases across Internet Slang, Developer Culture, Social Tone, and Meme / Community. Each case is typed as an `EvaluationCase` and can include input context, expected tone/register/community context, required signals, forbidden claims, usage boundaries, and an uncertainty requirement.

## Reports

`ContextEvaluator` returns one `EvaluationResult` per case. `buildEvaluationReport` aggregates those results into totals and issues, and `serializeEvaluationReport` produces JSON. No dashboard, leaderboard, analytics store, or training pipeline is part of this layer.
