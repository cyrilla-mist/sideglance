# Hyperbloom AI tools disclosure

Sideglance uses AI as a bounded interpretation component, not as the product's source of truth.

## Runtime AI

The server-side Worker can call Google Gemini for two context-intelligence jobs:

- deciding whether an Internet Moment has enough context to interpret safely;
- producing structured social, pragmatic, and usage analysis when the Context Gate allows it.

The application validates the returned contract, resolves evidence references against exact source text, checks grounding, and applies deterministic presentation and safe-failure rules. Provider credentials stay on the server boundary and are never part of the browser bundle. The repository's stable demo and end-to-end path use deterministic fixtures so the core product behavior can be reviewed without depending on a live provider call.

## Development assistance

ChatGPT and Codex were used during development for architecture discussion, implementation support, debugging, test design, repository audits, documentation, and submission preparation. These tools supported the work; they did not replace product decisions, source review, or acceptance checks by the author.

## Disclosure boundary

No claim is made that generated text is objective cultural truth. Sideglance is deliberately conservative when context is missing, and its explanations should be read as contextual guidance rather than authority over a community or person.
