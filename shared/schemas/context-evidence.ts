import type { ContextAnalysis } from '../contracts/context';

export type ContextEvidenceIssueReason = 'empty_evidence' | 'evidence_not_found';
export type ContextEvidenceIssue = { signalIndex: number; reason: ContextEvidenceIssueReason };
export type ContextEvidenceValidation = { valid: boolean; total: number; exactMatches: number; invalid: ContextEvidenceIssue[] };

export function validateContextEvidence(analysis: ContextAnalysis, sourceContext: string): ContextEvidenceValidation {
  const invalid: ContextEvidenceIssue[] = [];
  let exactMatches = 0;
  analysis.signals.forEach((signal, signalIndex) => {
    if (!signal.evidenceQuote) invalid.push({ signalIndex, reason: 'empty_evidence' });
    else if (sourceContext.includes(signal.evidenceQuote)) exactMatches += 1;
    else invalid.push({ signalIndex, reason: 'evidence_not_found' });
  });
  return { valid: invalid.length === 0, total: analysis.signals.length, exactMatches, invalid };
}
