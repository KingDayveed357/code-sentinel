import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import {
  AiTaskType,
  type AiResult,
  type AiTask,
  type VulnerabilityExplanationInput,
} from "../domain";
import { getAiGateway, type VulnerabilityExplanationPayload } from "../application";
import { canAccessVulnerability, isProjectScopedRole } from "../../authz/permissions";

interface ExplanationRequestBody {
  regenerate?: boolean;
  promptVersion?: string;
}

interface UserContext {
  userId: string;
  role: string;
}

interface ExplanationResponse {
  taskId: string;
  state: "queued" | "processing" | "ready" | "failed";
  explanation: VulnerabilityExplanationPayload | null;
  provider?: string;
  cacheHit?: boolean;
  fallbackUsed?: boolean;
  retryCount?: number;
  error?: {
    code: string;
    message: string;
  };
}

export class AiController {
  constructor(private readonly fastify: FastifyInstance) {}

  async generateVulnerabilityExplanation(
    workspaceId: string,
    vulnerabilityId: string,
    body: ExplanationRequestBody = {},
    userContext?: UserContext
  ): Promise<ExplanationResponse> {
    const { data: vulnerability, error } = await this.fastify.supabase
      .from("vulnerabilities_unified")
      .select("*")
      .eq("id", vulnerabilityId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error || !vulnerability) {
      const httpErrors = (this.fastify as any).httpErrors;
      throw httpErrors
        ? httpErrors.notFound("Vulnerability not found")
        : new Error("Vulnerability not found");
    }

    if (userContext && isProjectScopedRole(userContext.role)) {
      const allowed = await canAccessVulnerability(
        this.fastify,
        userContext.userId,
        vulnerabilityId,
        workspaceId,
        userContext.role
      );

      if (!allowed) {
        const httpErrors = (this.fastify as any).httpErrors;
        throw httpErrors
          ? httpErrors.forbidden("You do not have access to this vulnerability")
          : new Error("You do not have access to this vulnerability");
      }
    }

    const gateway = getAiGateway(this.fastify);
    const task: AiTask<VulnerabilityExplanationInput> = {
      id: randomUUID(),
      workspaceId,
      vulnerabilityId,
      type: AiTaskType.VulnerabilityExplanation,
      promptVersion: body.promptVersion || "v1",
      regenerate: body.regenerate || false,
      createdAt: new Date().toISOString(),
      input: {
        vulnerability,
      },
    };

    const result = await gateway.runTask(task);
    return this.toExplanationResponse(result);
  }

  private toExplanationResponse(
    result: AiResult<VulnerabilityExplanationPayload>
  ): ExplanationResponse {
    if (result.status === "persisted") {
      return {
        taskId: result.taskId,
        state: "ready",
        explanation: result.payload || null,
        provider: result.provider,
        cacheHit: result.cacheHit,
        fallbackUsed: result.fallbackUsed,
        retryCount: result.retryCount,
      };
    }

    if (result.status === "failed") {
      return {
        taskId: result.taskId,
        state: "failed",
        explanation: null,
        provider: result.provider,
        cacheHit: result.cacheHit,
        fallbackUsed: result.fallbackUsed,
        retryCount: result.retryCount,
        error: result.error
          ? {
              code: result.error.code,
              message: result.error.message,
            }
          : undefined,
      };
    }

    return {
      taskId: result.taskId,
      state: result.status === "queued" ? "queued" : "processing",
      explanation: null,
      provider: result.provider,
      cacheHit: result.cacheHit,
      fallbackUsed: result.fallbackUsed,
      retryCount: result.retryCount,
    };
  }
}
