import { ConfigService } from '@nestjs/config';
import { AiProviderService } from '../ai-provider.service';
import {
  AI_EVALUATION_DATASET,
  AI_EVALUATION_DATASET_VERSION,
} from './ai-evaluation.dataset';
import { AiEvaluationService } from './ai-evaluation.service';
import type { AiEvaluationCase } from './ai-evaluation.types';

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function estimateCostUsd(input: string, output: string): number {
  const inputPerMillion = Number(process.env.AI_EVAL_INPUT_USD_PER_MILLION ?? 0);
  const outputPerMillion = Number(process.env.AI_EVAL_OUTPUT_USD_PER_MILLION ?? 0);
  return (
    (estimateTokens(input) / 1_000_000) * inputPerMillion +
    (estimateTokens(output) / 1_000_000) * outputPerMillion
  );
}

async function main(): Promise<void> {
  const config = new ConfigService(process.env);
  const provider = new AiProviderService(config);
  const providerName = provider.providerName();
  if (providerName === 'disabled' || providerName === 'mock') {
    throw new Error(
      'ai_provider_evaluation_requires_qualified_non_mock_provider',
    );
  }

  const evaluatedCases: AiEvaluationCase[] = [];
  for (const source of AI_EVALUATION_DATASET) {
    const startedAt = performance.now();
    const result = await provider.summarize({
      title: source.title,
      transcript: source.transcript,
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const candidateText = JSON.stringify(result);
    evaluatedCases.push({
      ...source,
      candidate: {
        summaryText: result.summaryText,
        decisions: result.decisions,
        actionItems: result.actionItems,
        citations: result.citations,
      },
      telemetry: {
        latencyMs,
        estimatedCostUsd: estimateCostUsd(source.transcript, candidateText),
      },
    });
  }

  const report = new AiEvaluationService().evaluate(
    `${AI_EVALUATION_DATASET_VERSION}:${providerName}`,
    evaluatedCases,
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
