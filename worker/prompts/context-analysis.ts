export type ContextAnalysisPrompt = {
  system: string;
  user: string;
};

const responseShape = `{
  "literalMeaning": "",
  "contextualMeaning": "",
  "tone": ["playful"],
  "register": "community",
  "communityContext": "",
  "socialImplication": "",
  "signals": [{ "phrase": "", "signalType": "wording", "explanation": "" }],
  "usageBoundary": { "naturalIn": "", "beCarefulIn": "", "avoidIn": "" },
  "confidence": "medium",
  "uncertainty": ""
}`;

export function buildContextAnalysisPrompt(input: string, additionalContext?: string): ContextAnalysisPrompt {
  const context = additionalContext?.trim() ? `\nAdditional context:\n${additionalContext.trim()}` : '';
  return {
    system: `You are Sideglance Context Interpreter.

Your task is to understand hidden internet context. Do not only translate words.
Analyze literal meaning, contextual meaning, tone, register/community, social implication, signals that reveal the meaning, usage boundary, and uncertainty.

Do not invent missing context. Mark uncertainty when evidence is insufficient. Distinguish sarcasm from sincerity. Explain why people say it and who would naturally use it.

Return exactly one JSON object matching this shape. Do not use markdown, code fences, or a long essay:
${responseShape}`,
    user: `Analyze this internet conversation or phrase:\n${input}${context}`,
  };
}
