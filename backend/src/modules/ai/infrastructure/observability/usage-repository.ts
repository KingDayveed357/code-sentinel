import type { AiTaskType } from "../../domain";
import type { FastifyInstance } from "fastify";

export interface UsageEvent {
  workspaceId: string;
  taskId?: string;
  vulnerabilityId?: string;
  taskType: AiTaskType;
  provider?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  latencyMs?: number;
  retryCount?: number;
  fallbackUsed?: boolean;
  status: "success" | "failure";
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
}

export class UsageRepository {
  constructor(private readonly fastify: FastifyInstance) {}

  async record(event: UsageEvent): Promise<void> {
    const { error } = await this.fastify.supabase.from("ai_usage_events").insert({
      workspace_id: event.workspaceId,
      task_id: event.taskId ?? null,
      vulnerability_id: event.vulnerabilityId ?? null,
      task_type: event.taskType,
      provider: event.provider ?? null,
      model: event.model ?? null,
      prompt_tokens: event.promptTokens ?? null,
      completion_tokens: event.completionTokens ?? null,
      estimated_cost_usd: event.estimatedCostUsd ?? null,
      latency_ms: event.latencyMs ?? null,
      retry_count: event.retryCount ?? 0,
      fallback_used: event.fallbackUsed ?? false,
      status: event.status,
      error_code: event.errorCode ?? null,
      error_message: event.errorMessage ?? null,
      created_at: event.createdAt,
    });

    if (error) {
      this.fastify.log.error({ error, event }, "Failed to persist AI usage event");
    }
  }
}
