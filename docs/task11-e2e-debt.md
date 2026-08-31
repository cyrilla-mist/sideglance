# Task 11 E2E debt

The existing fixture Playwright run was 1/4. This task records the debt only; no UI or selector changes were made.

- `Friday Merge decodes from Capture to result`: selector/copy mismatch; the fixture Worker integration remains passing, so this is not evidence of a transport failure.
- `isolated phrase enters Needs Context`: selector/copy mismatch; the deterministic route behavior remains covered by unit/integration tests.
- `Needs Context flow decodes after the user supplies context`: selector/state-marker mismatch; the deterministic route behavior remains covered by unit/integration tests.

Recommended Task 11 action: reconcile the Playwright copy and `data-context-gate` selectors with the current UI contract, then rerun the fixture-only E2E suite.
