import type { ContextAnalysis, ContextSignal } from './context';

export type ModelContextSignal = Omit<ContextSignal, 'evidenceQuote'> & { evidenceRef: string };
export type ModelContextAnalysis = Omit<ContextAnalysis, 'signals'> & { signals: ModelContextSignal[] };
