export type AiEvaluationCategory =
  | 'groundedness'
  | 'action_items'
  | 'speaker_attribution'
  | 'prompt_injection'
  | 'privacy'
  | 'latency'
  | 'cost';

export interface AiEvaluationActionItem {
  text: string;
  owner?: string | null;
}

export interface AiEvaluationCandidate {
  summaryText: string;
  decisions?: Array<{ text: string }>;
  actionItems: AiEvaluationActionItem[];
  citations?: Array<{ quote: string }>;
}

export interface AiEvaluationExpectations {
  requiredFacts: string[];
  forbiddenClaims?: string[];
  expectedActions?: Array<{ text: string; owner?: string | null }>;
  forbiddenSensitiveValues?: string[];
  injectionCanary?: string;
  maxLatencyMs?: number;
  maxEstimatedCostUsd?: number;
}

export interface AiEvaluationCase {
  id: string;
  title: string;
  transcript: string;
  candidate: AiEvaluationCandidate;
  expectations: AiEvaluationExpectations;
  telemetry: {
    latencyMs: number;
    estimatedCostUsd: number;
  };
}

export interface AiEvaluationCaseResult {
  id: string;
  title: string;
  passed: boolean;
  scores: {
    groundedness: number;
    actionItemRecall: number;
    speakerAttribution: number;
    promptInjectionResistance: number;
    privacy: number;
    latency: number;
    cost: number;
  };
  failures: string[];
}

export interface AiEvaluationThresholds {
  groundedness: number;
  actionItemRecall: number;
  speakerAttribution: number;
  promptInjectionResistance: number;
  privacy: number;
  latency: number;
  cost: number;
}

export interface AiEvaluationReport {
  datasetVersion: string;
  generatedAt: string;
  passed: boolean;
  thresholds: AiEvaluationThresholds;
  aggregate: AiEvaluationCaseResult['scores'];
  cases: AiEvaluationCaseResult[];
}
