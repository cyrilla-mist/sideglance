import type { ContextAnalysis } from '../../shared/contracts/context';
import { fridayMergeContextAnalysis } from '../providers/fixture-context';

export interface ContextEngine {
  analyze(input: string, additionalContext?: string): ContextAnalysis | undefined;
}

export class MockContextEngine implements ContextEngine {
  analyze(input: string, _additionalContext?: string): ContextAnalysis | undefined {
    const normalized = input.toLowerCase();
    if (normalized.includes('on a friday??') && normalized.includes('fearless behavior') && normalized.includes('enjoy your weekend')) {
      return fridayMergeContextAnalysis;
    }
    return undefined;
  }
}
