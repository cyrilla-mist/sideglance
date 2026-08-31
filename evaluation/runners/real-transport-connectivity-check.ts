import { createPowerShellGeminiFetcher, loadEvaluationModelEnvironment, type PowerShellGeminiFetcher } from '../transports/powershell-gemini-transport';

const transientStatuses = [429, 500, 502, 503, 504];

async function main(): Promise<void> {
  const environment = await loadEvaluationModelEnvironment();
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const fetcher = createPowerShellGeminiFetcher(environment);
    try {
      const response = await fetcher(environment.MODEL_API_URL ?? '', { method: 'POST', body: JSON.stringify({ model: environment.MODEL_NAME, messages: [{ role: 'system', content: 'You are a connectivity check.' }, { role: 'user', content: 'Reply with exactly: ok' }], max_tokens: 8 }) });
      if (!response.ok) { console.log(`Real transport check: FAIL\nStage: provider_response\nCategory: provider_http_error\nHTTP: ${response.status}`); process.exitCode = 1; return; }
      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      if (typeof payload.choices?.[0]?.message?.content !== 'string') { console.log('Real transport check: FAIL\nStage: response_parse\nCategory: response_parse_error\nHTTP: ' + response.status); process.exitCode = 1; return; }
      console.log(`Real transport check: PASS\nHTTP: ${response.status}\nShell: ${fetcher.shell ?? 'none'}`);
      return;
    } catch (error) {
      const status = fetcher.lastResponse?.status ?? null;
      const category = fetcher.lastError?.category ?? (error instanceof Error ? error.name : 'transport_error');
      if (attempt < 2 && (transientStatuses.includes(status ?? -1) || ['connection_timeout', 'powershell_timeout'].includes(category))) { await new Promise((resolveDelay) => setTimeout(resolveDelay, 100)); continue; }
      console.log(`Real transport check: FAIL\nStage: http_request\nCategory: ${category}\nHTTP: ${status ?? 'none'}`);
      process.exitCode = 1;
      return;
    }
  }
}

main().catch(() => { console.log('Real transport check: FAIL\nStage: transport\nCategory: evaluation_transport_error\nHTTP: none'); process.exitCode = 1; });
