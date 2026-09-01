# Task 10.1 production setup

This is a user-operated workflow. Do not paste an account ID, API token, or secret into ChatGPT.

## Required sequence

1. No Cloudflare credits or payment method are required for the current BYOK route.
2. Create an authenticated AI Gateway token from the Cloudflare AI Gateway dashboard.
3. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/configure-production.ps1`. The script discovers the authenticated account locally and invokes interactive `wrangler secret put` commands for `CLOUDFLARE_AIG_TOKEN` and `MODEL_API_KEY`; it never accepts a token as a command-line argument.
4. Run `npm.cmd run production:readiness`. It must report `READY_FOR_DEPLOY` before deployment. The check never prints secret values.
5. Run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/deploy-production.ps1`. Type exactly `DEPLOY` when prompted.
6. For a single production diagnosis, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-production-diagnostic.ps1 -ProductionUrl <deployed-worker-url>`. It checks health and a non-AI malformed request, then sends only one model case after exact `YES` confirmation and correlates safe Wrangler tail fields.
7. After the diagnostic path is understood, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/run-production-smoke.ps1 -ProductionUrl <deployed-worker-url>`. Health runs first; the full model-calling smoke requires typing exactly `YES`.
8. Review the sanitized reports under `docs/reports/`.

Production Worker is `sideglance-worker-production`. The previously deployed versions had health pass but AI smoke 502 responses on Gateway transports. The current direct Google native transport is implemented locally and requires redeployment. Configuration is `CONTEXT_ENGINE_MODE=ai`, `MODEL_TRANSPORT=google_native_direct`, and the existing `MODEL_NAME`. AI inference requires the existing `MODEL_API_KEY`; Cloudflare account and Gateway secrets may remain configured for deployment and non-production alternatives but are not required by the active inference path. The request is sent to `/v1beta/models/{MODEL_NAME}:generateContent` with the existing model value. `PRODUCTION_MODEL_FINALIZATION_PENDING_EVALUATION` remains true.

The deploy and smoke operators stop on failed prerequisites, do not auto-confirm, do not print raw model output, and do not create reports for actions that did not happen.
