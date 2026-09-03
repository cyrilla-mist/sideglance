# Hyperbloom submission draft

## Project name

Sideglance

## Tagline

Read between the lines.

## One-line description

Sideglance helps people understand the social context, tone, and boundaries behind online English they can already translate.

## Short description

Sideglance is a Decode-only context intelligence tool for Internet Moments. It notices when words are understandable but meaning is not, asks for the minimum missing context, and returns an evidence-grounded explanation of tone, intent, usage, confidence, and boundaries.

## Long description

Sideglance starts with a familiar problem: translation can make every word clear while leaving the interaction itself confusing. A post may be ironic, a phrase may be community-specific, or a short reply may carry a social signal that a dictionary cannot explain. Sideglance is built for that gap.

The product is intentionally focused on one flow: Decode. A user pastes an Internet Moment, and Sideglance first checks whether the available context is sufficient for a responsible interpretation. If context is missing, it asks one minimum clarification question instead of confidently guessing. If the gate passes, the interpreter explains what is happening with structured signals for meaning, tone, confidence, usage boundaries, and naturalness in another situation.

The central principle is simple: “Translation tells you what the words say. Context tells you what people mean.” Sideglance combines a server-side Google Gemini integration with deterministic product logic around it. Gemini handles context sufficiency and pragmatic interpretation. TypeScript contracts and schema guards validate the response. EvidenceRef values must resolve to exact source text, grounding checks reject unsupported references, and the application applies conservative safe-failure behavior when a contract or evidence boundary is not satisfied. This lets the product use probabilistic language intelligence without making the whole experience probabilistic.

The interface is deliberately small and editorial: one moment, one contextual decision, and one readable explanation. The repository includes the stable fixture-backed demo path, screenshots of the core states, unit and integration coverage, and a Playwright smoke path that can run without network access. The Worker is the credential boundary for live AI mode, keeping provider secrets out of the browser.

Sideglance does not claim to determine objective cultural truth, infer a person's private intent, or replace community knowledge. It focuses on pasted text rather than OCR or browser integration. Live provider inference remains environment-dependent in the current submission package, so the demo evidence emphasizes the deterministic product path and makes that limitation explicit. Future work could add broader context sources and a separate learning-oriented Radar experience, but this release keeps its promise narrow: help people read between the lines before they act on an interpretation.

## Tech stack

TypeScript, Vite, semantic HTML/CSS, Cloudflare Workers, Wrangler, Google Gemini, Vitest, and Playwright.

## AI tools

Runtime: Google Gemini. Development assistance: ChatGPT and Codex. See [the full AI tools disclosure](hyperbloom-ai-disclosure.md).

## Repository

Public repository URL: to be filled after GitHub publication.

## Team

Solo
