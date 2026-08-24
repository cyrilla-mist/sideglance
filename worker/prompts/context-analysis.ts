export type ContextAnalysisPrompt = {
  system: string;
  user: string;
};

import { CONTEXT_CONFIDENCE_VALUES, CONTEXT_REGISTER_VALUES, CONTEXT_SIGNAL_TYPE_VALUES, CONTEXT_TONE_VALUES } from '../../shared/schemas/context';
import type { EvidenceUnit } from '../../shared/context/evidence-catalog';

const responseShape = `{
  "literalMeaning": "",
  "contextualMeaning": "",
  "tone": ["playful"],
  "register": "community",
  "communityContext": "",
  "socialImplication": "",
  "signals": [{ "phrase": "", "signalType": "wording", "explanation": "", "evidenceRef": "E1" }],
  "usageBoundary": { "naturalIn": "", "beCarefulIn": "", "avoidIn": "" },
  "confidence": "medium",
  "uncertainty": ""
}`;

const taxonomyRules = `
Enum and taxonomy rules:
- Every enum-like value MUST use exactly one allowed value listed below. Never invent labels, use synonyms, or combine values into a new phrase. Put richer nuance in descriptive fields.
- REGISTER: choose exactly one of: ${CONTEXT_REGISTER_VALUES.join(', ')}. Keep domain/community detail in communityContext.
- TONE: every item must be exactly one of: ${CONTEXT_TONE_VALUES.join(', ')}.
- SIGNAL TYPE: choose exactly one primary type from: ${CONTEXT_SIGNAL_TYPE_VALUES.join(', ')}. signalType is a taxonomy label, not a natural-language description; put multiple-cue detail in explanation.
- CONFIDENCE: choose exactly one of: ${CONTEXT_CONFIDENCE_VALUES.join(', ')}.
`;

export function buildContextAnalysisPrompt(input: string, additionalContext?: string, evidenceCatalog: readonly EvidenceUnit[] = []): ContextAnalysisPrompt {
  const context = additionalContext?.trim() ? `\nAdditional context:\n${additionalContext.trim()}` : '';
  const catalog = evidenceCatalog.length ? `\nEvidence Catalog (select only these IDs):\n${evidenceCatalog.map((unit) => `[${unit.id}] ${unit.text}`).join('\n')}` : '';
  return {
    system: `You are Sideglance Context Interpreter.

Your task is to understand hidden internet context. Do not only translate words.
Analyze literal meaning, contextual meaning, tone, register/community, social implication, signals that reveal the meaning, usage boundary, and uncertainty.

Evidence reference rules:
- Every signal must include exactly one evidenceRef selected from the supplied Evidence Catalog.
- Allowed evidenceRef values are only the IDs present in that catalog.
- Never invent, paraphrase, reconstruct, or normalize an evidence reference.
- If you cannot point to an exact textual cue, do not create that signal.
- Keep interpretation in explanation; evidenceRef must remain an ID from the catalog.
- Never output source text as evidence. Never invent an evidence ID.

Do not invent missing context. Mark uncertainty when evidence is insufficient. Distinguish sarcasm from sincerity. Explain why people say it and who would naturally use it.

${taxonomyRules}

Return exactly one JSON object matching this shape. Do not use markdown, code fences, or a long essay:
${responseShape}`,
    user: `Analyze this internet conversation or phrase:\n${input}${context}${catalog}`,
  };
}
