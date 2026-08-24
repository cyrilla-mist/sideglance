export type EvidenceSource = 'input' | 'additional_context';

export type EvidenceUnit = {
  id: string;
  text: string;
  source: EvidenceSource;
};

export function buildEvidenceCatalog(input: string, additionalContext?: string): EvidenceUnit[] {
  const units: EvidenceUnit[] = [];
  appendLines(units, input, 'input');
  if (additionalContext) appendLines(units, additionalContext, 'additional_context');
  return units.map((unit, index) => ({ ...unit, id: `E${index + 1}` }));
}

function appendLines(units: EvidenceUnit[], sourceText: string, source: EvidenceSource): void {
  for (const line of sourceText.split(/\r?\n/)) {
    if (line.trim()) units.push({ id: '', text: line, source });
  }
}
