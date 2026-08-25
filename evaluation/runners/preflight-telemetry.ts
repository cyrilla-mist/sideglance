export type StructuredGateAcceptance = 'verified' | 'rejected' | 'unverified';

export type AttemptRecord = {
  attempt: number;
  started: true;
  status: number | null;
  latencyMs: number;
  category: string;
  responseReached: boolean;
};

export type RetryTelemetry = {
  retryPerformed: boolean;
  backoffMs: number;
};

export function finishAttempt(attempt: number, startedAt: number, status: number | null, category: string, endedAt = performance.now()): AttemptRecord {
  return { attempt, started: true, status, latencyMs: Math.max(0, Math.round(endedAt - startedAt)), category, responseReached: status !== null };
}

export function classifyAttempt(status: number | null, stage: string, signalAborted = false): string {
  if (status === 400) return stage === 'gate' ? 'structured_gate_provider_rejection' : 'invalid_request';
  if (status === 401 || status === 403) return 'authentication_error';
  if (status === 404) return 'invalid_model_or_endpoint';
  if (status === 429) return 'provider_429';
  if (status !== null && status >= 500) return 'provider_5xx';
  if (signalAborted) return 'evaluation_transport_timeout';
  if (status === null) return 'evaluation_transport_error';
  return `http_${status}`;
}

export function structuredGateAcceptance(records: AttemptRecord[], structuredResultReached: boolean, schemaRejected = false): StructuredGateAcceptance {
  if (schemaRejected) return 'rejected';
  if (structuredResultReached && records.some((record) => record.status === 200 && record.responseReached)) return 'verified';
  return 'unverified';
}

export function validatePreflightReport(report: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const results = Array.isArray(report.results) ? report.results : [];
  for (const result of results) {
    if (!result || typeof result !== 'object') { errors.push('result_not_object'); continue; }
    const item = result as Record<string, unknown>;
    if (item.verdict === 'NOT_RUN') {
      if ('gateAttemptRecords' in item || 'interpreterAttemptRecords' in item || 'requests' in item) errors.push(`${String(item.case)}:not_run_has_attempt_data`);
      continue;
    }
    for (const [name, countKey] of [['gateAttemptRecords', 'gateAttempts'], ['interpreterAttemptRecords', 'interpreterAttempts']] as const) {
      const records = item[name];
      if (records !== undefined) {
        if (!Array.isArray(records)) { errors.push(`${String(item.case)}:${name}_not_array`); continue; }
        if (item[countKey] !== records.length) errors.push(`${String(item.case)}:${countKey}_drift`);
        for (const record of records) {
          if (!record || typeof record !== 'object') { errors.push(`${String(item.case)}:${name}_invalid_record`); continue; }
          const attempt = record as Record<string, unknown>;
          if (attempt.started !== true || typeof attempt.latencyMs !== 'number' || attempt.latencyMs < 0) errors.push(`${String(item.case)}:${name}_invalid_timing`);
          if (attempt.responseReached === true && attempt.status === null) errors.push(`${String(item.case)}:${name}_response_without_status`);
        }
      }
    }
    const acceptance = item.structuredGateProviderAcceptance;
    if (acceptance === 'verified' && item.structuredGateProviderAccepted !== true) errors.push(`${String(item.case)}:verified_without_boolean`);
    if (acceptance === 'unverified' && item.structuredGateProviderAccepted === true) errors.push(`${String(item.case)}:unverified_marked_true`);
    if (acceptance === 'rejected' && !Array.isArray(item.gateAttemptRecords)) errors.push(`${String(item.case)}:rejected_without_records`);
  }
  return errors;
}
