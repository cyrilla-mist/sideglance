import { CONTEXT_GATE_CONFIDENCE_VALUES, CONTEXT_GATE_REASON_VALUES, CONTEXT_GATE_STATUS_VALUES } from './context-gate-values';

const sufficiency = {
  type: 'object',
  additionalProperties: false,
  properties: {
    toneJudgment: { type: 'boolean' },
    socialImplication: { type: 'boolean' },
    usageBoundary: { type: 'boolean' },
  },
  required: ['toneJudgment', 'socialImplication', 'usageBoundary'],
} as const;

const commonProperties = {
  confidence: { type: 'string', enum: CONTEXT_GATE_CONFIDENCE_VALUES },
  reason: { type: 'string', enum: CONTEXT_GATE_REASON_VALUES },
  sufficiency,
} as const;

export const contextGateJsonSchema = {
  type: 'object',
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: { status: { const: 'ready' }, ...commonProperties },
      required: ['status', 'confidence', 'reason', 'sufficiency'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: { status: { const: 'needs_context' }, ...commonProperties, missingInformation: { type: 'string', minLength: 1 }, question: { type: 'string', minLength: 1 } },
      required: ['status', 'confidence', 'reason', 'sufficiency', 'missingInformation', 'question'],
    },
  ],
} as const;

export const contextGateResponseFormat = {
  type: 'json_schema',
  json_schema: { name: 'context_gate_result', strict: true, schema: contextGateJsonSchema },
} as const;

export const CONTEXT_GATE_SCHEMA_STATUS_VALUES = CONTEXT_GATE_STATUS_VALUES;
export const CONTEXT_GATE_SCHEMA_CONFIDENCE_VALUES = CONTEXT_GATE_CONFIDENCE_VALUES;
export const CONTEXT_GATE_SCHEMA_REASON_VALUES = CONTEXT_GATE_REASON_VALUES;
