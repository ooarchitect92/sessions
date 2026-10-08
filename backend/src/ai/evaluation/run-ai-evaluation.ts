import {
  AI_EVALUATION_DATASET,
  AI_EVALUATION_DATASET_VERSION,
} from './ai-evaluation.dataset';
import { AiEvaluationService } from './ai-evaluation.service';

const service = new AiEvaluationService();
const report = service.evaluate(
  AI_EVALUATION_DATASET_VERSION,
  AI_EVALUATION_DATASET,
);

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!report.passed) {
  process.exitCode = 1;
}
