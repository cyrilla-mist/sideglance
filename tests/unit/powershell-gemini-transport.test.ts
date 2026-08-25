import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { selectPowerShellHost } from '../../evaluation/transports/powershell-gemini-transport';
import { classifyAttempt } from '../../evaluation/runners/preflight-telemetry';

const execFileAsync = promisify(execFile);

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
    const script = 'evaluation/transports/invoke-gemini.ps1';
    const result = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-DryRun'], { windowsHide: true });
    expect(result.stderr).toContain('DRY_RUN=ok');
  });
});
