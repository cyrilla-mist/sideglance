import type { ContextAnalysis } from '../contracts/context';
import type { ModelContextAnalysis } from '../contracts/model-context';
import type { EvidenceUnit } from './evidence-catalog';

export type EvidenceReferenceIssue = { signalIndex: number; reason: 'invalid_evidence_reference' };
export type EvidenceResolution = { valid: boolean; analysis?: ContextAnalysis; total: number; validRefs: number; invalid: EvidenceReferenceIssue[] };

export function resolveContextEvidence(modelAnalysis: ModelContextAnalysis, catalog: readonly EvidenceUnit[]): EvidenceResolution {
  const byId = new Map(catalog.map((unit) => [unit.id, unit]));
  const invalid: EvidenceReferenceIssue[] = [];
  const signals = modelAnalysis.signals.map((signal, signalIndex) => {
    const unit = byId.get(signal.evidenceRef);
    if (!unit) { invalid.push({ signalIndex, reason: 'invalid_evidence_reference' }); return { phrase: signal.phrase, signalType: signal.signalType, explanation: signal.explanation, evidenceQuote: '' }; }
    return { phrase: signal.phrase, signalType: signal.signalType, explanation: signal.explanation, evidenceQuote: unit.text };
  });
  if (invalid.length > 0) return { valid: false, total: signals.length, validRefs: signals.length - invalid.length, invalid };
  return { valid: true, analysis: { ...modelAnalysis, signals }, total: signals.length, validRefs: signals.length, invalid };
}
