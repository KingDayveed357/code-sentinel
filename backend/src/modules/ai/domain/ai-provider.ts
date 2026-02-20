import type { AiTaskType } from "./ai-task-type";

export interface AiProviderResponseSchema {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}

export interface AiProviderRequest {
  taskType: AiTaskType;
  systemPrompt: string;
  prompt: string;
  responseSchemaName: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  responseFormat?: "json_object" | "json_schema";
  responseSchema?: AiProviderResponseSchema;
  metadata?: Record<string, string | number | boolean>;
}

export interface AiProviderResponse<TData = unknown> {
  provider: string;
  model: string;
  rawText: string;
  data?: TData;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
}

export interface AiProvider {
  readonly name: string;
  generate<TData = unknown>(request: AiProviderRequest): Promise<AiProviderResponse<TData>>;
}
