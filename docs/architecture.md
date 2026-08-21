# Sideglance Architecture

## High-level flow

```text
User
  ↓
Context Gate
  ↓
Context Engine
  ↓
Provider
  ↓
Validation
  ↓
Explanation
```

The Context Gate checks whether the input supports a responsible judgment about tone, social implication, and usage boundary. When information is missing, it returns a specific minimum question and stops the interpretation pass.

When the gate is ready, the Context Engine produces a typed `ContextAnalysis`. The provider may be a deterministic fixture provider or an explicitly configured model provider. Schema validation runs before an analysis reaches the decode response.

The frontend only consumes the decode contract. It does not choose ambiguity, call a provider, or access provider credentials.
