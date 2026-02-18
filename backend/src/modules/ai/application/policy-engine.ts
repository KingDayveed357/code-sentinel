import type { AiTask } from "../domain";
import { AiTaskType } from "../domain";
import { env } from "../../../env";

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export interface RetryPolicy {
  maxRetriesPerProvider: number;
  validationRetriesPerProvider: number;
  baseBackoffMs: number;
}

export interface QueuePolicy {
  concurrency: number;
  cacheTtlSeconds: number;
}

export class PolicyEngine {
  evaluate(_task: AiTask): PolicyDecision {
    return { allowed: true };
  }

  getRetryPolicy(_taskType: AiTaskType): RetryPolicy {
    return {
      maxRetriesPerProvider: 2,
      validationRetriesPerProvider: 1,
      baseBackoffMs: 500,
    };
  }

  getQueuePolicy(): QueuePolicy {
    return {
      concurrency: Number(env.AI_QUEUE_CONCURRENCY || 2),
      cacheTtlSeconds: Number(env.AI_EXPLANATION_CACHE_TTL_SECONDS || 3600),
    };
  }

  getProviderOrder(): Array<"groq" | "openai"> {
    return ["groq", "openai"];
  }
}
