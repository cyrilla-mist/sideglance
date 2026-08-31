import { goldCases } from './gold';
import { contextGateCases } from './context-gate';
import type { EvaluationExpected } from '../schemas/evaluation';
import type { ContextGateStatus } from '../../shared/contracts/context-gate';

export type GoldSetCategory = 'internet_slang' | 'developer_culture' | 'social_tone' | 'meme_community' | 'context_gate';
export type GoldSetCase = {
  id: string;
  category: GoldSetCategory;
  input: string;
  context?: string;
  expectedGate?: { status: ContextGateStatus; expectedQuestion?: string };
  expectedInterpreter?: EvaluationExpected;
  source: 'context_intelligence' | 'context_gate' | 'both';
};

const categoryByGateId: Record<string, GoldSetCategory> = {
  'gate-fearless-behavior': 'context_gate',
  'gate-bold-move': 'context_gate',
  'gate-interesting-choice': 'context_gate',
  'gate-friday-merge': 'context_gate',
  'gate-sincere-fearless': 'context_gate',
  'developer-readme-update': 'developer_culture',
};

const interpreterById = new Map(goldCases.map((item) => [item.id, item]));
const gateById = new Map(contextGateCases.map((item) => [item.id, item]));
const ids = new Set([...interpreterById.keys(), ...gateById.keys()]);

export const task09cGoldSetCases: readonly GoldSetCase[] = [...ids].map((id) => {
  const interpreter = interpreterById.get(id);
  const gate = gateById.get(id);
  return {
    id,
    category: interpreter?.category ?? categoryByGateId[id] ?? 'context_gate',
    input: interpreter?.input ?? gate!.input,
    context: interpreter?.context ?? gate?.context,
    expectedGate: gate ? { status: gate.expectedStatus, ...(gate.expectedQuestion ? { expectedQuestion: gate.expectedQuestion } : {}) } : undefined,
    expectedInterpreter: interpreter?.expected,
    source: interpreter && gate ? 'both' : interpreter ? 'context_intelligence' : 'context_gate',
  };
});

export function getTask09cGoldSetCases(): readonly GoldSetCase[] { return task09cGoldSetCases; }
export function getTask09cGoldSetFingerprint(): string { return `task09c-gold-v1:${task09cGoldSetCases.map((item) => item.id).join('|')}`; }
