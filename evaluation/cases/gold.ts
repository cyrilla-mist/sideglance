import type { EvaluationCase } from '../schemas/evaluation';

export const goldCases: EvaluationCase[] = [
  { id: 'slang-touch-grass', category: 'internet_slang', input: 'touch grass', expected: { communityContext: 'internet slang', tone: ['teasing', 'critical'], uncertaintyRequired: true } },
  { id: 'slang-based', category: 'internet_slang', input: 'based', expected: { tone: ['approval'], communityContext: 'internet slang' } },
  { id: 'slang-you-are-cooked', category: 'internet_slang', input: 'you are cooked', expected: { tone: ['negative', 'playful'], communityContext: 'internet slang', uncertaintyRequired: true } },
  { id: 'slang-no-cap', category: 'internet_slang', input: 'no cap', expected: { tone: ['emphasis'], communityContext: 'internet slang' } },
  { id: 'slang-rent-free', category: 'internet_slang', input: 'rent free', expected: { communityContext: 'online discourse', tone: ['teasing'] } },
  { id: 'developer-ship-it', category: 'developer_culture', input: 'ship it', expected: { register: 'technical', communityContext: 'developer context' } },
  { id: 'developer-lgtm', category: 'developer_culture', input: 'LGTM', expected: { register: 'technical', communityContext: 'code review context' } },
  { id: 'developer-breaking-change', category: 'developer_culture', input: 'breaking change', expected: { register: 'technical', communityContext: 'technical meaning' } },
  { id: 'developer-works-on-my-machine', category: 'developer_culture', input: 'works on my machine', expected: { register: 'technical', communityContext: 'developer humor', tone: ['teasing'] } },
  { id: 'developer-friday-deploy', category: 'developer_culture', input: 'Friday deploy', expected: { register: 'technical', communityContext: 'developer norm', uncertaintyRequired: true } },
  { id: 'developer-readme-update', category: 'developer_culture', input: 'Sam: I updated the README with the setup steps and the new environment variable names.\n\nMina: Thanks, I’ll review it this afternoon.', expected: { register: 'technical', forbiddenClaims: ['sarcastic reading', 'passive-aggressive', 'interpersonal tension', 'secret frustration', 'hidden warning', 'risky deploy', 'Discord', 'GitHub', 'unsupported relationship'] } },
  { id: 'tone-interesting-choice', category: 'social_tone', input: 'interesting choice', expected: { tone: ['negative', 'ambiguous'], uncertaintyRequired: true } },
  { id: 'tone-bold-move', category: 'social_tone', input: 'bold move', expected: { tone: ['ambiguous'], uncertaintyRequired: true } },
  { id: 'tone-nice-one', category: 'social_tone', input: 'nice one', expected: { tone: ['positive', 'ambiguous'], uncertaintyRequired: true } },
  { id: 'tone-sure', category: 'social_tone', input: 'sure...', expected: { tone: ['uncertainty', 'ambiguous'], uncertaintyRequired: true } },
  { id: 'tone-great-job', category: 'social_tone', input: 'great job', expected: { tone: ['positive'] } },
  { id: 'meme-ratio', category: 'meme_community', input: 'ratio', expected: { communityContext: 'social media context', register: 'community' } },
  { id: 'meme-w', category: 'meme_community', input: 'W', expected: { tone: ['approval'], communityContext: 'approval slang' } },
  { id: 'meme-l', category: 'meme_community', input: 'L', expected: { tone: ['negative'], communityContext: 'negative slang' } },
  { id: 'meme-cope', category: 'meme_community', input: 'cope', expected: { tone: ['negative', 'teasing'], communityContext: 'dismissive internet slang' } },
  { id: 'meme-skill-issue', category: 'meme_community', input: 'skill issue', expected: { tone: ['teasing', 'negative'], communityContext: 'internet slang' } },
];

export function getGoldCases(): readonly EvaluationCase[] {
  return goldCases;
}
