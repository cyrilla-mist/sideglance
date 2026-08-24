import { spawn } from 'node:child_process';
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
  lastError?: { category: string; latencyMs: number };
  attempts?: Array<{ status: number; latencyMs: number; retryAfterSeconds?: number }>;
};

export async function loadEvaluationModelEnvironment(): Promise<PowerShellGeminiEnvironment> {
  const contents = await readFile(resolve(process.cwd(), '.dev.vars'), 'utf8');
  return Object.fromEntries(contents.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    return match && ['MODEL_API_KEY', 'MODEL_API_URL', 'MODEL_NAME'].includes(match[1]) ? [[match[1], match[2]]] : [];
  })) as PowerShellGeminiEnvironment;
}

export function createPowerShellGeminiFetcher(environment: PowerShellGeminiEnvironment): PowerShellGeminiFetcher {
  const fetcher = (async (input, init) => {
    const body = typeof init?.body === 'string' ? init.body : init?.body ? JSON.stringify(init.body) : '';
    const result = await runPowerShellAttempt(environment, body, init?.signal ?? undefined);
    if (result.status === null) {
      fetcher.lastError = { category: 'powershell_transport_error', latencyMs: result.latencyMs };
      throw new Error('powershell_transport_error');
    }
    fetcher.lastResponse = { status: result.status, latencyMs: result.latencyMs, ...(result.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: result.retryAfterSeconds }) };
    fetcher.attempts = [fetcher.lastResponse];
    return new Response(new Uint8Array(result.body), { status: result.status, headers: { 'content-type': 'application/json' } });
  }) as PowerShellGeminiFetcher;
  return fetcher;
}

async function runPowerShellAttempt(environment: PowerShellGeminiEnvironment, body: string, signal?: AbortSignal): Promise<{ status: number | null; body: Buffer; latencyMs: number; retryAfterSeconds?: number }> {
  return new Promise((resolveAttempt) => {
    const started = Date.now();
    const child = spawn(resolvePowerShell(), ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(process.cwd(), 'evaluation', 'transports', 'invoke-gemini.ps1')], {
      env: { ...process.env, MODEL_API_KEY: environment.MODEL_API_KEY ?? '', MODEL_API_URL: environment.MODEL_API_URL ?? '', MODEL_NAME: environment.MODEL_NAME ?? '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', () => resolveAttempt({ status: null, body: Buffer.alloc(0), latencyMs: Date.now() - started }));
    child.on('close', (code) => {
      signal?.removeEventListener('abort', abort);
      const lines = Buffer.concat(stderr).toString('utf8').split(/\r?\n/);
      const statusLine = lines.find((line) => line.startsWith('STATUS='));
      const retryLine = lines.find((line) => line.startsWith('RETRY_AFTER_SECONDS='));
      if (code !== 0 || !statusLine) { resolveAttempt({ status: null, body: Buffer.alloc(0), latencyMs: Date.now() - started }); return; }
      resolveAttempt({ status: Number(statusLine.slice(7)), body: Buffer.concat(stdout), latencyMs: Date.now() - started, retryAfterSeconds: retryLine ? parseRetryAfter(retryLine.slice(21)) : undefined });
    });
    child.stdin.end(body);
  });
}

function parseRetryAfter(value: string): number | undefined {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 && seconds <= 60 ? seconds : undefined;
}

function resolvePowerShell(): string {
  return 'pwsh';
}
