# Sideglance Demo Flow

Target duration: 60–120 seconds. The demo uses deterministic fixtures and does not depend on a live model API.

## Scene 1 — Ambiguous phrase

Input:

```text
fearless behavior 💀
```

Sideglance stops at the Context Gate and shows:

- Need a little more context.
- What was said immediately before this?

This demonstrates that the system does not invent intent from an isolated phrase.

## Scene 2 — Provide context

Provide:

```text
Kai:
Are you really deploying this on Friday?

Leo:
fearless behavior 💀
```

Sideglance returns the decoded view with the actual meaning, tone, evidence signals, and usage boundary. The fixture is deterministic, so the demo remains stable.

## Scene 3 — Internet context

Input:

```text
touch grass
```

Sideglance shows an internet-slang interpretation, including the teasing/critical tone, online-community context, uncertainty, and where the phrase may or may not sound natural.
