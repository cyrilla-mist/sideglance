# Sideglance Documentation

This directory contains current product documentation, architecture and evaluation notes, engineering phase records, and historical hackathon submission material.

> **Current product status:** the September 2026 public release is Decode-focused. The long-term Sideglance direction now extends beyond that release into **Decode / Radar / Archive**. See [`product-direction.md`](product-direction.md).

## Start Here

1. [`../README.md`](../README.md) — current repository and release overview.
2. [`product-direction.md`](product-direction.md) — post-hackathon long-term product direction.
3. [`architecture.md`](architecture.md) — current Decode architecture summary.
4. [`evaluation.md`](evaluation.md) — evaluation approach and boundaries.

## Current Release vs Product Direction

The repository contains two different kinds of truth that should not be mixed:

### Current public release

The shipped hackathon-era implementation is centered on **Decode** and includes the Context Gate, structured interpretation contracts, evidence references, deterministic grounding / validation, evaluation fixtures, and the public demo path.

### Long-term product direction

Sideglance is now organized conceptually as:

```text
Decode   → understand this moment
Radar    → build context instinct over time
Archive  → preserve and revisit context knowledge
```

Radar is informed by the existing English Radar learning system, but the integrated Radar and Archive surfaces are not yet claimed as implemented in the current Sideglance release.

## Documentation Classes

### Product / Architecture

- `product-direction.md` — long-term product structure and English Radar relationship.
- `architecture.md` — current Decode architecture.
- `evaluation.md` — evaluation principles and current evidence boundaries.

### Engineering Phase Records

Documents prefixed with `task09`, `task10`, `task11`, or similar task identifiers are point-in-time implementation and validation records.

Examples include:

- real-AI transport validation;
- gold-set evaluation;
- production transport setup;
- E2E debt / freeze notes.

They are retained as engineering provenance. A historical failure, blocker, or next-step statement in one of these files is not automatically a current product backlog item.

### Hackathon Submission Archive

The following material was created for the September 2026 submission cycle and should be read as historical submission evidence:

- `Sideglance_Deck.pdf`
- `hyperbloom-submission.md`
- `hyperbloom-ai-disclosure.md`
- `demo-flow.md`
- `demo-candidates.md`
- related screenshots and presentation assets under `assets/`

The repository was submitted to Hyperbloom September — AI/ML and AI Builders. Submission-oriented wording in these files describes that release, not the entire future Sideglance product.

## Reading Rule

When documents disagree, use this order:

```text
Current code and tests
  → root README
  → product-direction.md for long-term scope
  → architecture / evaluation docs
  → engineering task records
  → hackathon submission material
```

This preserves the useful history without allowing competition-era scope limits to become permanent product constraints by accident.
