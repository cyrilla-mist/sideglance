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
    { phrase: 'on a friday??', signalType: 'timing', explanation: 'The timing implies concern about making a risky change before the weekend.' },
    { phrase: 'fearless behavior 💀', signalType: 'irony', explanation: 'The skull emoji undercuts the apparent praise and signals playful sarcasm.' },
    { phrase: 'enjoy your weekend', signalType: 'community_norm', explanation: 'The closing line continues a developer in-joke about weekend support risk.' },
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
    { phrase: 'spoke up about the issue', signalType: 'wording', explanation: 'The specific action gives the compliment a sincere subject.' },
    { phrase: 'fearless behavior', signalType: 'relationship', explanation: 'The phrase directly affirms a difficult action rather than using irony.' },
  ],
};
