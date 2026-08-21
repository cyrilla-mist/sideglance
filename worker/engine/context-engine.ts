import type { ContextAnalysis } from '../../shared/contracts/context';
import { fridayMergeContextAnalysis } from '../providers/fixture-context';
import type { ContextModelProvider } from '../providers/context-provider';

export interface ContextEngine {
  analyze(input: string, additionalContext?: string): Promise<ContextAnalysis | undefined>;
}

export class MockContextEngine implements ContextEngine {
  async analyze(input: string, _additionalContext?: string): Promise<ContextAnalysis | undefined> {
    const normalized = input.toLowerCase();
    if (normalized.includes('on a friday??') && normalized.includes('fearless behavior') && normalized.includes('enjoy your weekend')) {
      return fridayMergeContextAnalysis;
    }
    return undefined;
  }
}

export class AIContextEngine implements ContextEngine {
  constructor(private readonly provider: ContextModelProvider) {}

  async analyze(input: string, additionalContext?: string): Promise<ContextAnalysis> {
    return this.provider.analyzeContext(input, additionalContext);
  }
}
