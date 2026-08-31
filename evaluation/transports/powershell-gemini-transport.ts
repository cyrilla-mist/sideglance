import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FetchLike } from '../../worker/providers/context-provider';

// LOCAL EVALUATION ONLY. NOT PRODUCTION TRANSPORT.

export type PowerShellGeminiEnvironment = {
  MODEL_API_KEY?: string;
  MODEL_API_URL?: string;
  MODEL_NAME?: string;
};

export type PowerShellGeminiFetcher = FetchLike & {
  lastResponse?: { status: number; latencyMs: number; retryAfterSeconds?: number };
  lastError?: { category: PowerShellTransportErrorCategory; latencyMs: number };
  shell?: PowerShellHost;
  attempts?: Array<{ status: number; latencyMs: number; retryAfterSeconds?: number }>;
};

export type PowerShellHost = 'pwsh' | 'powershell.exe';
export type PowerShellTransportErrorCategory = 'shell_not_found' | 'shell_spawn_error' | 'powershell_script_error' | 'powershell_http_error' | 'powershell_timeout' | 'provider_http_error' | 'script_parse_error' | 'stdin_parse_error' | 'request_serialization_error' | 'invoke_webrequest_error' | 'tls_error' | 'connection_timeout' | 'dns_error' | 'http_error' | 'response_parse_error' | 'child_timeout';
type TransportOptions = { dryRun?: boolean; shell?: PowerShellHost };

export class PowerShellTransportError extends Error {
  constructor(public readonly category: PowerShellTransportErrorCategory, message: string = category) {
    super(message);
    this.name = 'PowerShellTransportError';
  }
}

export async function loadEvaluationModelEnvironment(): Promise<PowerShellGeminiEnvironment> {
  const contents = await readFile(resolve(process.cwd(), '.dev.vars'), 'utf8');
  return Object.fromEntries(contents.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    return match && ['MODEL_API_KEY', 'MODEL_API_URL', 'MODEL_NAME'].includes(match[1]) ? [[match[1], match[2]]] : [];
  })) as PowerShellGeminiEnvironment;
}

export function createPowerShellGeminiFetcher(environment: PowerShellGeminiEnvironment, options: TransportOptions = {}): PowerShellGeminiFetcher {
  let shell: PowerShellHost | undefined;
  let shellSelectionError: PowerShellTransportError | undefined;
  try {
    shell = options.shell ?? selectPowerShellHost(commandAvailable);
  } catch (error) {
    shellSelectionError = error instanceof PowerShellTransportError ? error : new PowerShellTransportError('shell_not_found');
  }
  const fetcher = (async (input, init) => {
    const body = typeof init?.body === 'string' ? init.body : init?.body ? JSON.stringify(init.body) : '';
    if (!shell) {
      fetcher.lastError = { category: shellSelectionError?.category ?? 'shell_not_found', latencyMs: 0 };
      throw shellSelectionError ?? new PowerShellTransportError('shell_not_found');
    }
    const result = await runPowerShellAttempt(shell, environment, body, init?.signal ?? undefined, options.dryRun ?? false);
    if (result.status === null) {
      fetcher.lastError = { category: result.errorCategory ?? 'powershell_script_error', latencyMs: result.latencyMs };
      throw new PowerShellTransportError(fetcher.lastError.category);
    }
    fetcher.lastResponse = { status: result.status, latencyMs: result.latencyMs, ...(result.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: result.retryAfterSeconds }) };
    fetcher.attempts = [fetcher.lastResponse];
    return new Response(new Uint8Array(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
  }) as PowerShellGeminiFetcher;
  fetcher.shell = shell;
  return fetcher;
}

export function selectPowerShellHost(isAvailable: (command: PowerShellHost) => boolean): PowerShellHost {
  if (isAvailable('pwsh')) return 'pwsh';
  if (isAvailable('powershell.exe')) return 'powershell.exe';
  throw new PowerShellTransportError('shell_not_found', 'No supported PowerShell host is available.');
}

function commandAvailable(command: PowerShellHost): boolean {
  try {
    execFileSync('where.exe', [command], { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function runPowerShellAttempt(shell: PowerShellHost, environment: PowerShellGeminiEnvironment, body: string, signal?: AbortSignal, dryRun = false): Promise<{ status: number | null; body: Buffer; latencyMs: number; retryAfterSeconds?: number; errorCategory?: PowerShellTransportErrorCategory }> {
  return new Promise((resolveAttempt) => {
    const started = Date.now();
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(process.cwd(), 'evaluation', 'transports', 'invoke-gemini.ps1'), ...(dryRun ? ['-DryRun'] : [])], {
      env: { ...process.env, MODEL_API_KEY: environment.MODEL_API_KEY ?? '', MODEL_API_URL: environment.MODEL_API_URL ?? '', MODEL_NAME: environment.MODEL_NAME ?? '' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      });
    } catch {
      resolveAttempt({ status: null, body: Buffer.alloc(0), latencyMs: Date.now() - started, errorCategory: 'shell_spawn_error' });
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error: NodeJS.ErrnoException) => resolveAttempt({ status: null, body: Buffer.alloc(0), latencyMs: Date.now() - started, errorCategory: error.code === 'ENOENT' ? 'shell_not_found' : 'shell_spawn_error' }));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      const lines = Buffer.concat(stderr).toString('utf8').split(/\r?\n/);
      const statusLine = lines.find((line) => line.startsWith('STATUS='));
      const retryLine = lines.find((line) => line.startsWith('RETRY_AFTER_SECONDS='));
      if (code !== 0 || !statusLine) {
        const errorLine = lines.find((line) => line.startsWith('ERROR='));
        const errorCategory = errorLine?.slice(6) as PowerShellTransportErrorCategory | undefined;
        resolveAttempt({ status: null, body: Buffer.alloc(0), latencyMs: Date.now() - started, errorCategory: errorCategory === 'powershell_timeout' ? 'powershell_timeout' : errorCategory === 'powershell_http_error' ? 'powershell_http_error' : 'powershell_script_error' });
        return;
      }
      const rawEnvelope = Buffer.concat(stdout).toString('utf8');
      try {
        const envelope = JSON.parse(rawEnvelope) as { ok?: unknown; status?: unknown; body?: unknown; category?: unknown; message?: unknown };
        if (envelope.ok !== true && typeof envelope.status === 'number') {
          const errorBody = typeof envelope.body === 'string' ? envelope.body : JSON.stringify({ error: { message: typeof envelope.message === 'string' ? envelope.message : 'Provider returned an HTTP error.' } });
          resolveAttempt({ status: envelope.status, body: Buffer.from(errorBody, 'utf8'), latencyMs: Date.now() - started, retryAfterSeconds: retryLine ? parseRetryAfter(retryLine.slice(21)) : undefined, errorCategory: typeof envelope.category === 'string' ? envelope.category as PowerShellTransportErrorCategory : 'provider_http_error' });
          return;
        }
        if (envelope.ok !== true || typeof envelope.status !== 'number' || typeof envelope.body !== 'string') {
          const category = typeof envelope.category === 'string' ? envelope.category as PowerShellTransportErrorCategory : 'response_parse_error';
          resolveAttempt({ status: null, body: Buffer.alloc(0), latencyMs: Date.now() - started, errorCategory: category });
          return;
        }
        resolveAttempt({ status: envelope.status, body: Buffer.from(envelope.body, 'utf8'), latencyMs: Date.now() - started, retryAfterSeconds: retryLine ? parseRetryAfter(retryLine.slice(21)) : undefined });
      } catch {
        resolveAttempt({ status: null, body: Buffer.alloc(0), latencyMs: Date.now() - started, errorCategory: 'powershell_script_error' });
      }
    });
    child.stdin.end(body);
  });
}

function parseRetryAfter(value: string): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 60 ? seconds : undefined;
}
