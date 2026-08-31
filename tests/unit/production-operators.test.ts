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
    expect(configure).toContain('secret put CLOUDFLARE_API_TOKEN');
    expect(configure).not.toMatch(/param\s*\([^)]*token/i);
    expect(configure).not.toMatch(/CLOUDFLARE_API_TOKEN\s*=\s*['\"]/i);
  });
  it('documents the Workers AI Read permission and billing confirmation', () => {
    expect(read('docs/task10-production-setup.md')).toContain('Workers AI → Read');
    expect(configure).toContain('Unified Billing / AI Gateway credits');
  });
  it('requires exact DEPLOY before invoking Wrangler deploy', () => {
    expect(deploy).toContain("$confirmation -cne 'DEPLOY'");
    expect(deploy).toContain('wrangler deploy --env production');
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
    expect(readiness).toContain('Cloudflare account ID is not configured');
    expect(readiness).toContain('CLOUDFLARE_API_TOKEN is not configured');
    expect(readiness).toContain('CLOUDFLARE_ACCOUNT_ID is not configured');
  });
});
