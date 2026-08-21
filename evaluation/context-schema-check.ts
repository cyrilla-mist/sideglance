import { isContextAnalysis } from '../shared/schemas/context';

export function contextSchemaCheck(value: unknown): boolean {
  if (!isContextAnalysis(value)) return false;
  return value.literalMeaning.length > 0
    && value.contextualMeaning.length > 0
    && value.tone.length > 0
    && value.register.length > 0
    && value.usageBoundary.naturalIn.length > 0
    && value.usageBoundary.beCarefulIn.length > 0
    && value.usageBoundary.avoidIn.length > 0
    && value.uncertainty.length > 0;
}
