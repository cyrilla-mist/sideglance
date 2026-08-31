import { describe, expect, it } from 'vitest';
import { createPowerShellGeminiFetcher, selectPowerShellHost } from '../../evaluation/transports/powershell-gemini-transport';
import { classifyAttempt } from '../../evaluation/runners/preflight-telemetry';

describe('evaluation PowerShell transport host compatibility', () => {
  it('selects pwsh when available', () => {
    expect(selectPowerShellHost((command) => command === 'pwsh')).toBe('pwsh');
  });

  it('falls back to Windows PowerShell when pwsh is unavailable', () => {
    expect(selectPowerShellHost((command) => command === 'powershell.exe')).toBe('powershell.exe');
  });

  it('classifies no available host as shell_not_found', () => {
    expect(() => selectPowerShellHost(() => false)).toThrowError(/No supported PowerShell host/);
  });

  it('keeps shell spawn failure distinct from provider timeout', () => {
    expect(classifyAttempt(null, 'gate', false, 'shell_spawn_error')).toBe('shell_spawn_error');
    expect(classifyAttempt(null, 'gate', true, 'powershell_timeout')).toBe('evaluation_transport_timeout');
  });

  it('starts the Windows PowerShell script in dry-run mode without network access', async () => {
    const fetcher = createPowerShellGeminiFetcher({ MODEL_API_KEY: 'test-only', MODEL_API_URL: 'https://example.invalid/v1beta/openai', MODEL_NAME: 'test-model' }, { dryRun: true, shell: 'powershell.exe' });
    const response = await fetcher('https://example.invalid/transport-self-check', { method: 'POST', body: JSON.stringify({ check: 'transport' }) });
    const result = await response.json() as { dryRun?: boolean; stdinJson?: boolean; requestConstructed?: boolean; environment?: Record<string, boolean> };
    expect(response.status).toBe(200);
    expect(result).toMatchObject({ dryRun: true, stdinJson: true, requestConstructed: true, environment: { MODEL_API_KEY: true, MODEL_API_URL: true, MODEL_NAME: true } });
  });

  it('maps a PowerShell dry-run script failure to powershell_script_error', async () => {
    const fetcher = createPowerShellGeminiFetcher({ MODEL_API_KEY: 'test-only', MODEL_API_URL: 'https://example.invalid/v1beta/openai', MODEL_NAME: 'test-model' }, { dryRun: true, shell: 'powershell.exe' });
    await expect(fetcher('https://example.invalid/transport-self-check', { method: 'POST', body: '{not-json' })).rejects.toMatchObject({ category: 'powershell_script_error' });
  });
});
