# Sideglance Product Direction

**Status:** Long-term product direction after the September 2026 hackathon submissions.

This document describes where Sideglance is going. It does **not** claim that every surface below is implemented in the current repository release.

## Product Identity

**Sideglance — Internet Context Intelligence**

Sideglance helps people understand the context around online language: social meaning, tone, cultural references, community norms, implied intent, and usage boundaries.

The long-term product is organized into three connected surfaces:

```text
Sideglance
├── Decode
│   Understand this moment.
│
├── Radar
│   Build context instinct over time.
│
└── Archive
    Preserve and revisit context knowledge.
```

## Decode

**Understand this moment.**

Decode is the immediate interpretation surface. A user brings an Internet Moment — a post, message, meme, thread, phrase, or interaction — and Sideglance helps explain what is happening beyond literal translation.

The current public Sideglance release is centered on Decode.

Key ideas already represented in the current implementation include:

- context sufficiency before interpretation;
- minimum clarification when context is insufficient;
- structured context interpretation;
- evidence-backed signals;
- tone and confidence boundaries;
- usage-boundary guidance;
- deterministic validation around probabilistic model output.

## Radar

**Build context instinct over time.**

Radar is the long-term learning surface. It is intended to help users repeatedly encounter, review, and internalize the kinds of internet context that Decode explains in individual moments.

The existing **English Radar** project is the main product-learning foundation for this surface. Its useful assets include:

- Signal-based learning content;
- Daily Mix and review loops;
- context, tone, pronunciation, and usage-boundary fields;
- quiz and mastery systems;
- personal Signals and inbox workflows;
- content packs and personal archive material.

English Radar is **not being silently merged into this repository today**. It remains a separate maintained repository while the shared product model is designed. Future migration should preserve working learning data and behavior rather than copy pages mechanically.

## Archive

Archive is the shared context-knowledge and reference layer.

It is intended to connect what a user has decoded, learned, saved, or revisited over time. Archive should eventually make useful context retrievable without turning Sideglance into a generic notes database.

Potential responsibilities include:

- saved context references;
- learned / reviewed Signals;
- source and provenance information;
- personal context collections;
- links between Decode moments and Radar learning material.

Archive is a product direction, not a claim about the current release.

## Relationship to English Radar

The product relationship is now:

```text
English Radar
  → learning-system foundation
  → future Sideglance Radar surface

Sideglance Decode
  → immediate context interpretation

Shared context model
  → future Radar + Archive connection
```

The goal is not to place two unrelated apps behind one navigation bar. The goal is to make immediate interpretation, long-term learning, and saved context feel like different surfaces of one context-intelligence system.

## Current Release Boundary

The September 2026 hackathon build remains a **Decode-focused release**.

It does not currently claim production implementations of:

- the integrated Radar surface;
- the shared Archive layer;
- cross-surface user accounts or synchronization;
- a unified Decode-to-Radar learning pipeline.

Those belong to post-hackathon product development.

## Near-Term Product Work

When active development resumes, prioritize consolidation over feature sprawl:

1. preserve the reliable Decode contract and evidence model;
2. define the shared Signal / context object that Decode and Radar can both use;
3. identify which English Radar learning assets migrate unchanged, which need adaptation, and which should remain historical;
4. design one coherent navigation and information architecture for Decode / Radar / Archive;
5. only then implement cross-surface persistence or new platform features.

The objective is to deepen one product system rather than create another collection of disconnected tools.
