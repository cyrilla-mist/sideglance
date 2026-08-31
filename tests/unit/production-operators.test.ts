import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const configure = read('scripts/configure-production.ps1');
const readiness = read('scripts/check-production-readiness.ps1');
const deploy = read('scripts/deploy-production.ps1');
const smoke = read('scripts/run-production-smoke.ps1');

describe('production operator safeguards', () => {
  it('discovers one account locally and never accepts a token argument', () => {
    expect(configure).toContain("[regex]::Matches($whoami");
    expect(configure).toContain('secret put CLOUDFLARE_AIG_TOKEN');
    expect(configure).not.toMatch(/param\s*\([^)]*token/i);
    expect(configure).not.toMatch(/CLOUDFLARE_API_TOKEN\s*=\s*['\"]/i);
    expect(configure).toContain('secret list --env production');
    expect(configure).toContain('if (-not $hasAigToken)');
    expect(configure).toContain('if (-not $hasGoogleKey)');
  });
  it('documents the AI Gateway token path without a billing requirement', () => {
    expect(read('docs/task10-production-setup.md')).toContain('AI Gateway token');
    expect(read('docs/task10-production-setup.md')).toContain('No Cloudflare credits');
    expect(configure).toContain('AI Gateway token');
  });
  it('requires exact DEPLOY before invoking Wrangler deploy', () => {
    expect(deploy).toContain("$confirmation -cne 'DEPLOY'");
    expect(deploy).toContain('wrangler deploy --env production');
    expect(deploy).toContain("workerName = 'sideglance-worker-production'");
    expect(deploy).toContain('deployExitCode');
    expect(deploy).toContain('2>&1');
    expect(deploy).not.toContain('SilentlyContinue');
  });
  it('treats stderr warnings as output when native exit code is zero', () => {
    expect(deploy).toContain('$deployOutput | ForEach-Object { Write-Output $_ }');
    expect(deploy).toContain('if ($deployExitCode -ne 0)');
  });
  it('fails when the native process fails or produces no credible route URL', () => {
    expect(deploy).toContain("$deployExitCode = 1");
    expect(deploy).toContain('no credible workers.dev URL found');
    expect(deploy).toContain("Write-Output 'DEPLOY_FAILED'");
  });
  it('captures and sanitizes the workers.dev deployment report', () => {
    expect(deploy).toContain('workers\\.dev');
    expect(deploy).toContain('productionUrl = $workersDevUrl');
    expect(deploy).toContain('timestamp =');
  });
  it('runs health before requiring YES for model calls', () => {
    expect(smoke.indexOf('healthResponse')).toBeLessThan(smoke.indexOf("Type YES to authorize"));
    expect(smoke).toContain("-cne 'YES'");
  });
  it('writes sanitized reports without raw model or fixture fields', () => {
    expect(smoke).toContain('latencyMs');
    expect(smoke).not.toContain('modelOutput');
    expect(smoke).not.toContain('evidenceCatalog');
    expect(deploy).toContain('task10-production-deploy.json');
  });
  it('keeps production Worker free of evaluation imports', () => {
    for (const path of ['worker/index.ts', 'worker/routes/decode.ts', 'worker/providers/model-transport.ts']) expect(read(path)).not.toContain("from '../../evaluation/");
  });
  it('blocks readiness until account and runtime secrets are configured', () => {
    expect(readiness).toContain('CLOUDFLARE_AIG_TOKEN is not configured');
    expect(readiness).toContain('CLOUDFLARE_ACCOUNT_ID is not configured');
    expect(readiness).toContain('MODEL_API_KEY is not configured');
    expect(readiness).not.toContain('$env:CLOUDFLARE_ACCOUNT_ID');
    expect(readiness).toContain('secret list --env production');
  });
  it('enables explicit workers.dev routing for production', () => {
    expect(read('wrangler.toml')).toContain('workers_dev = true');
  });
});
