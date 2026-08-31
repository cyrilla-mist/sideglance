import { createPowerShellGeminiFetcher, loadEvaluationModelEnvironment } from '../transports/powershell-gemini-transport';

async function main(): Promise<void> {
  const environment = await loadEvaluationModelEnvironment();
  const fetcher = createPowerShellGeminiFetcher(environment, { dryRun: true, shell: 'powershell.exe' });
  const response = await fetcher('https://example.invalid/transport-self-check', { method: 'POST', body: JSON.stringify({ check: 'transport' }) });
  const result = await response.json() as { dryRun?: boolean; stdinJson?: boolean; requestConstructed?: boolean; environment?: Record<string, boolean> };
  const passed = response.status === 200 && result.dryRun === true && result.stdinJson === true && result.requestConstructed === true && Object.values(result.environment ?? {}).every(Boolean);
  if (!passed) { console.log('Transport self-check: FAIL'); process.exitCode = 1; return; }
  console.log(`Transport self-check: PASS (${fetcher.shell ?? 'none'})`);
}

main().catch((error: unknown) => { console.log(`Transport self-check: FAIL\nCategory: ${error instanceof Error ? error.name : 'transport_error'}`); process.exitCode = 1; });
