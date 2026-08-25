import type { ContextGateStatus } from '../../shared/contracts/context-gate';

export type ContextGateEvaluationCase = {
  id: string;
  input: string;
  context?: string;
  expectedStatus: ContextGateStatus;
  expectedQuestion?: string;
};

export const contextGateCases: ContextGateEvaluationCase[] = [
  { id: 'gate-fearless-behavior', input: 'fearless behavior', expectedStatus: 'needs_context', expectedQuestion: 'What was said immediately before this?' },
  { id: 'gate-bold-move', input: 'bold move', expectedStatus: 'needs_context' },
  { id: 'gate-interesting-choice', input: 'interesting choice', expectedStatus: 'needs_context' },
  { id: 'gate-friday-merge', input: 'Kai: on a friday??\n\nLeo: fearless behavior 💀', expectedStatus: 'ready' },
  { id: 'gate-sincere-fearless', input: 'fearless behavior', context: 'Mia: I finally spoke up about the issue.\n\nAlex: That was fearless behavior.', expectedStatus: 'ready' },
  { id: 'developer-readme-update', input: 'Sam: I updated the README with the setup steps and the new environment variable names.\n\nMina: Thanks, I’ll review it this afternoon.', expectedStatus: 'ready' },
];
