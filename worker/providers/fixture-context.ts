import type { ContextAnalysis } from '../../shared/contracts/context';

export const fridayMergeContextAnalysis: ContextAnalysis = {
  literalMeaning: '“fearless behavior” literally means 无畏的行为。',
  contextualMeaning: 'In this developer context, it is playful teasing rather than serious praise.',
  tone: ['playful', 'sarcastic'],
  register: 'technical',
  communityContext: 'Technical developer communities often treat risky Friday changes as a shared warning sign.',
  socialImplication: 'The speaker assumes shared understanding of developer norms and a familiar relationship.',
  usageBoundary: { naturalIn: 'Close teammates', beCarefulIn: 'New coworkers', avoidIn: 'Formal review' },
  confidence: 'high',
  uncertainty: 'The text does not prove whether anyone is genuinely annoyed or only extending the joke.',
  signals: [
    { phrase: 'on a friday??', signalType: 'timing', explanation: 'The timing implies concern about making a risky change before the weekend.', evidenceQuote: 'on a friday??' },
    { phrase: 'fearless behavior 💀', signalType: 'irony', explanation: 'The skull emoji undercuts the apparent praise and signals playful sarcasm.', evidenceQuote: 'fearless behavior 💀' },
    { phrase: 'enjoy your weekend', signalType: 'community_norm', explanation: 'The closing line continues a developer in-joke about weekend support risk.', evidenceQuote: 'enjoy your weekend' },
  ],
};

export const sincereFearlessContextAnalysis: ContextAnalysis = {
  literalMeaning: '“fearless behavior” literally means 无畏的行为。',
  contextualMeaning: 'Here it is sincere encouragement for speaking up about a difficult issue.',
  tone: ['sincere'],
  register: 'community',
  communityContext: 'A supportive conversation where someone recognizes a difficult but constructive action.',
  socialImplication: 'The speaker is affirming the other person and treating the disclosure as brave.',
  usageBoundary: { naturalIn: 'Supportive teammates or close friends', beCarefulIn: 'New coworkers', avoidIn: 'Formal client communication without context' },
  confidence: 'high',
  uncertainty: 'The exact emotional weight of the issue is not stated.',
  signals: [
    { phrase: 'spoke up about the issue', signalType: 'wording', explanation: 'The specific action gives the compliment a sincere subject.', evidenceQuote: 'spoke up about the issue' },
    { phrase: 'fearless behavior', signalType: 'relationship', explanation: 'The phrase directly affirms a difficult action rather than using irony.', evidenceQuote: 'fearless behavior' },
  ],
};

export const touchGrassContextAnalysis: ContextAnalysis = {
  literalMeaning: '“touch grass” literally means to go outside and touch grass.',
  contextualMeaning: 'It is internet slang telling someone they are too absorbed in online discourse and should reconnect with ordinary life.',
  tone: ['playful', 'critical'],
  register: 'community',
  communityContext: 'Internet slang used in online discourse, often as teasing criticism.',
  socialImplication: 'The speaker assumes the listener understands online community shorthand and is being lightly called out.',
  usageBoundary: { naturalIn: 'Online communities and familiar peers', beCarefulIn: 'New coworkers', avoidIn: 'Formal or sensitive conversations' },
  confidence: 'high',
  uncertainty: 'The phrase may be playful or genuinely dismissive depending on the relationship and exchange.',
  signals: [
    { phrase: 'touch grass', signalType: 'community_norm', explanation: 'The phrase is a recognizable internet shorthand rather than a literal instruction.', evidenceQuote: 'touch grass' },
    { phrase: 'grass', signalType: 'wording', explanation: 'The ordinary image creates a contrast with excessive online focus.', evidenceQuote: 'grass' },
  ],
};

export const straightforwardReadmeContextAnalysis: ContextAnalysis = {
  literalMeaning: 'One person updated README setup documentation and environment variable names; the other will review it later.',
  contextualMeaning: 'This is a straightforward documentation update and a routine acknowledgement.',
  tone: ['neutral'],
  register: 'technical',
  communityContext: 'A direct developer documentation exchange.',
  socialImplication: 'No hidden interpersonal meaning is required to understand the exchange.',
  usageBoundary: { naturalIn: 'Developer teams', beCarefulIn: 'Formal release notes', avoidIn: 'Unrelated personal conversations' },
  confidence: 'high',
  uncertainty: 'The exchange does not provide a reason to infer additional subtext.',
  signals: [],
};
