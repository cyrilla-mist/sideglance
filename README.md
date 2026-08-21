# Sideglance

Sideglance helps people read between the lines of internet conversations: tone, implied meaning, community context, and how a phrase may land.

## Problem

Internet language often depends on shared context. A literal translation can miss sarcasm, developer norms, slang, or a relationship signal.

## Solution

Sideglance first checks whether the available context is sufficient. If it is not, it asks one specific question. Only then does the Context Engine produce a structured explanation with signals, uncertainty, and usage boundaries.

## Architecture

`User → Context Gate → Context Engine → Provider → Validation → Explanation`

The default local mode uses deterministic fixtures. An AI provider is available behind an explicit environment setting and is never called by the frontend directly.

## Key innovation

The Context Gate makes uncertainty a product boundary: Sideglance does not explain what it cannot yet understand.

## Demo flow

The 60–120 second demo is documented in [docs/demo-flow.md](docs/demo-flow.md) and uses only deterministic fixtures in [fixtures/demo](fixtures/demo).

## Evaluation

The gold cases and deterministic evaluator live under [evaluation](evaluation). They check tone, community context, signals, uncertainty, and usage boundaries rather than writing quality.

## Local development

```bash
npm install
npm run worker:dev
npm run dev
```

Run validation with `npm run typecheck`, `npm run worker:typecheck`, `npm run build`, `npm test`, and `npm run test:e2e`.
