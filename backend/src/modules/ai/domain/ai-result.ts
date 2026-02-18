import type { AiError } from "./ai-errors";
import type { AiTaskStatus } from "./ai-task";
import type { AiTaskType } from "./ai-task-type";

export interface AiResult<TPayload = unknown> {
  id: string;
  taskId: string;
  workspaceId: string;
  taskType: AiTaskType;
  status: AiTaskStatus;
  payload?: TPayload;
  provider?: string;
  model?: string;
  cacheHit?: boolean;
  fallbackUsed?: boolean;
  retryCount?: number;
  error?: AiError;
  createdAt: string;
  updatedAt: string;
}
