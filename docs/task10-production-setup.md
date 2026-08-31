# Task 10.1 production setup

This is a user-operated workflow. Do not paste an account ID, API token, or secret into ChatGPT.

## Required sequence

1. Confirm the Cloudflare account has sufficient Unified Billing / AI Gateway credits for third-party model calls.
2. Create a Cloudflare API token with `Account → Workers AI → Read`. AI Gateway management permissions are only needed for future management APIs, not this inference path.
3. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/configure-production.ps1`. The script discovers the authenticated account locally and invokes interactive `wrangler secret put` commands; it never accepts a token as a command-line argument.
4. Run `npm.cmd run production:readiness`. It must report `READY_FOR_DEPLOY` before deployment. The check never prints secret values.
5. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-production.ps1`. Type exactly `DEPLOY` when prompted.
6. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-production-smoke.ps1 -ProductionUrl <deployed-worker-url>`. Health runs first; the model-calling cases require typing exactly `YES`.
7. Review the sanitized reports under `docs/reports/`.

Production configuration is `CONTEXT_ENGINE_MODE=ai`, `MODEL_TRANSPORT=cloudflare_ai_gateway`, the existing `MODEL_NAME`, and the account ID/token secrets. The request is sent to `/accounts/{account_id}/ai/v1/chat/completions` with `google-ai-studio/{MODEL_NAME}`. `PRODUCTION_MODEL_FINALIZATION_PENDING_EVALUATION` remains true.

The deploy and smoke operators stop on failed prerequisites, do not auto-confirm, do not print raw model output, and do not create reports for actions that did not happen.
