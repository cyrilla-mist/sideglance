import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
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
  it('passes all production PowerShell operators through the real Windows parser', () => {
    const files = [
      'scripts/deploy-production.ps1',
      'scripts/configure-production.ps1',
      'scripts/check-production-readiness.ps1',
      'scripts/run-production-smoke.ps1',
    ];
    const root = process.cwd().replace(/'/g, "''");
    const command = `$root = '${root}'; $files = @('${files.join("','")}'); foreach ($file in $files) { $tokens = $null; $errors = $null; [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root $file), [ref]$tokens, [ref]$errors) | Out-Null; if ($errors.Count -ne 0) { $errors | ForEach-Object { Write-Output \"\${file}: $($_.Message)\" }; exit 1 } }; exit 0`;
    expect(() => execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { encoding: 'utf8' })).not.toThrow();
  });
  it('runs the deploy operator safely against mocked Wrangler output', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'sideglance-deploy-'));
    const readinessPath = join(tempRoot, 'readiness.ps1');
    const npxPath = join(tempRoot, 'npx.cmd');
    const reportPath = join(process.cwd(), 'docs/reports/task10-production-deploy.json');
    writeFileSync(readinessPath, "Write-Output 'READY_FOR_DEPLOY'\n", 'utf8');
    const run = (output: string, exitCode: number, confirmation = 'DEPLOY') => {
      const escapedOutput = output.replace(/%/g, '%%').replace(/\r?\n/g, '\r\necho ');
      writeFileSync(npxPath, `@echo off\r\necho ${escapedOutput}\r\nexit /b ${exitCode}\r\n`, 'utf8');
      return spawnSync('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', join(process.cwd(), 'scripts/deploy-production.ps1'),
        '-ReadinessScriptPath', readinessPath,
      ], {
        encoding: 'utf8',
        input: `${confirmation}\n`,
        env: { ...process.env, PATH: `${tempRoot}${delimiter}${process.env.PATH ?? ''}` },
      });
    };
    try {
      const success = run('Published https://sideglance-worker-production.example.workers.dev', 0);
      expect(success.status).toBe(0);
      expect(success.stdout).toContain('DEPLOY_SUCCESS');
      expect(JSON.parse(readFileSync(reportPath, 'utf8').replace(/^\uFEFF/, '')).productionUrl).toBe('https://sideglance-worker-production.example.workers.dev');
      unlinkSync(reportPath);

      const warning = run('WARNING deployment completed\r\nPublished https://sideglance-worker-production.example.workers.dev', 0);
      expect(warning.status).toBe(0);
      expect(warning.stdout).toContain('DEPLOY_SUCCESS');
      unlinkSync(reportPath);

      const noUrl = run('Published deployment without route URL', 0);
      expect(noUrl.status).toBe(1);
      expect(noUrl.stdout).toContain('DEPLOY_FAILED');
      expect(existsSync(reportPath)).toBe(false);

      const nativeFailure = run('ERROR deployment failed', 7);
      expect(nativeFailure.status).toBe(1);
      expect(nativeFailure.stdout).toContain('DEPLOY_FAILED');
      expect(existsSync(reportPath)).toBe(false);

      const wrongConfirmation = run('SHOULD_NOT_RUN', 0, 'NO');
      expect(wrongConfirmation.status).toBe(1);
      expect(wrongConfirmation.stdout).toContain('No deployment performed');
      expect(wrongConfirmation.stdout).not.toContain('SHOULD_NOT_RUN');
    } finally {
      if (existsSync(reportPath)) unlinkSync(reportPath);
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }, 30000);
  it('preserves safe non-2xx diagnostics and continues every smoke case on a local fixture server', () => {
    const reportPath = join(process.cwd(), 'docs/reports/task10-production-smoke.json');
    const run = (responses: Array<{ status: number; body: string; contentType?: string }>) => new Promise<{ status: number | null; stdout: string }>((resolve, reject) => {
      let index = 0;
      const server = createServer((request, response) => {
        const fixture = responses[index++];
        if (!fixture) { response.writeHead(500); response.end('unexpected request'); return; }
        response.writeHead(fixture.status, { 'content-type': fixture.contentType ?? 'application/json' });
        response.end(fixture.body);
      });
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') { server.close(); reject(new Error('Could not start fixture server.')); return; }
        const child = spawn('powershell.exe', [
          '-NoProfile',
          '-ExecutionPolicy', 'Bypass',
          '-File', join(process.cwd(), 'scripts/run-production-smoke.ps1'),
          '-ProductionUrl', `http://127.0.0.1:${address.port}`,
        ], { encoding: 'utf8' });
        let stdout = '';
        child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        child.on('error', reject);
        child.on('close', (status) => { server.close(); resolve({ status, stdout }); });
        child.stdin.write('YES\n');
        child.stdin.end();
      });
    });
    const json = (value: unknown) => JSON.stringify(value);
    return run([
        { status: 200, body: json({ ok: true, service: 'sideglance-worker' }) },
        { status: 502, body: json({ type: 'failed', message: 'Context gate is unavailable.', diagnosticCode: 'gateway_auth_error' }) },
        { status: 502, body: json({ type: 'failed', message: 'Context model is unavailable.', diagnosticCode: 'gateway_provider_unavailable' }) },
        { status: 502, body: 'upstream provider body Bearer secret-must-not-persist', contentType: 'text/plain' },
        { status: 400, body: json({ type: 'failed', errorCode: 'invalid_request', message: 'Request body must be valid JSON.' }) },
        { status: 400, body: json({ type: 'failed', errorCode: 'invalid_request', message: 'inputText exceeds the maximum length.' }) },
      ]).then((result) => {
        expect(result.status).toBe(1);
        const report = JSON.parse(readFileSync(reportPath, 'utf8').replace(/^\uFEFF/, ''));
        expect(report.cases).toHaveLength(5);
        expect(report.cases.map((item: { caseId: string }) => item.caseId)).toEqual(['ambiguous', 'friday', 'straightforward', 'malformed', 'oversized']);
        expect(report.cases[0]).toMatchObject({ httpStatus: 502, responseType: 'failed', safeCode: 'gateway_auth_error', verdict: 'FAIL' });
        expect(report.cases[1]).toMatchObject({ httpStatus: 502, safeCode: 'gateway_provider_unavailable', verdict: 'FAIL' });
        expect(report.cases[2]).toMatchObject({ httpStatus: 502, safeCode: 'unknown_502', verdict: 'FAIL' });
        expect(report.cases[3]).toMatchObject({ httpStatus: 400, responseType: 'failed', safeCode: 'invalid_request', verdict: 'PASS' });
        expect(report.cases[4]).toMatchObject({ httpStatus: 400, responseType: 'failed', safeCode: 'invalid_request', verdict: 'PASS' });
        expect(report.finalVerdict).toBe('PRODUCTION_SMOKE_FAILED');
        const raw = readFileSync(reportPath, 'utf8');
        expect(raw).not.toContain('secret-must-not-persist');
        expect(raw).not.toContain('Authorization');
      }).finally(() => {
        if (existsSync(reportPath)) unlinkSync(reportPath);
      });
  }, 30000);
});
