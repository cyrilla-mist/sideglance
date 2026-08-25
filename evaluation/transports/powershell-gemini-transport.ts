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
export type PowerShellTransportErrorCategory = 'shell_not_found' | 'shell_spawn_error' | 'powershell_script_error' | 'powershell_http_error' | 'powershell_timeout' | 'provider_http_error';

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

export function createPowerShellGeminiFetcher(environment: PowerShellGeminiEnvironment): PowerShellGeminiFetcher {
  let shell: PowerShellHost | undefined;
  let shellSelectionError: PowerShellTransportError | undefined;
  try {
    shell = selectPowerShellHost(commandAvailable);
  } catch (error) {
    shellSelectionError = error instanceof PowerShellTransportError ? error : new PowerShellTransportError('shell_not_found');
  }
  const fetcher = (async (input, init) => {
    const body = typeof init?.body === 'string' ? init.body : init?.body ? JSON.stringify(init.body) : '';
    if (!shell) {
      fetcher.lastError = { category: shellSelectionError?.category ?? 'shell_not_found', latencyMs: 0 };
      throw shellSelectionError ?? new PowerShellTransportError('shell_not_found');
    }
    const result = await runPowerShellAttempt(shell, environment, body, init?.signal ?? undefined);
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

async function runPowerShellAttempt(shell: PowerShellHost, environment: PowerShellGeminiEnvironment, body: string, signal?: AbortSignal): Promise<{ status: number | null; body: Buffer; latencyMs: number; retryAfterSeconds?: number; errorCategory?: PowerShellTransportErrorCategory }> {
  return new Promise((resolveAttempt) => {
    const started = Date.now();
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(process.cwd(), 'evaluation', 'transports', 'invoke-gemini.ps1')], {
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
      resolveAttempt({ status: Number(statusLine.slice(7)), body: Buffer.concat(stdout), latencyMs: Date.now() - started, retryAfterSeconds: retryLine ? parseRetryAfter(retryLine.slice(21)) : undefined });
    });
    child.stdin.end(body);
  });
}

function parseRetryAfter(value: string): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 60 ? seconds : undefined;
}
