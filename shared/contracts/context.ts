export type Tone = 'playful' | 'sarcastic' | 'sincere' | 'neutral' | 'critical' | 'uncertain';
export type Register = 'casual' | 'professional' | 'community' | 'meme' | 'technical';
export type Confidence = 'high' | 'medium' | 'low';
export type ContextSignalType = 'emoji' | 'wording' | 'community_norm' | 'timing' | 'relationship' | 'irony';

export type UsageBoundary = {
  naturalIn: string;
  beCarefulIn: string;
  avoidIn: string;
};

export type ContextSignal = {
  phrase: string;
  signalType: ContextSignalType;
  explanation: string;
  evidenceQuote: string;
};

export type ContextAnalysis = {
  literalMeaning: string;
  contextualMeaning: string;
  tone: Tone[];
  register: Register;
  communityContext: string;
  socialImplication: string;
  usageBoundary: UsageBoundary;
  confidence: Confidence;
  uncertainty: string;
  signals: ContextSignal[];
};
