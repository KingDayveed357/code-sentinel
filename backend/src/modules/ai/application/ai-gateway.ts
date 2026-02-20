import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import {
  AiErrorCode,
  AiTaskType,
  type AiResult,
  type AiTask,
} from "../domain";
import type { VulnerabilityWithInstances } from "../../vulnerabilities-unified/types";
import { PromptRegistry } from "./prompt-registry";
import { PolicyEngine } from "./policy-engine";
import { TaskOrchestrator } from "./task-orchestrator";
import {
  vulnerabilityExplanationSchema,
  type VulnerabilityExplanationPayload,
} from "./explanation-schema";
import { validateTitleSanity } from "./title-sanity";
import {
  VulnerabilityExplanationProcessor,
  type ExplanationExecutionResult,
} from "./vulnerability-explanation-processor";
import {
  BullMqQueue,
  MetricsRecorder,
  OpenAiProvider,
  RedisCache,
  UsageRepository,
  GroqProvider,
  type CacheInterface,
  type AiQueueJob,
} from "../infrastructure";
import type { AiProvider } from "../domain";
import type { AiQueueInterface } from "../infrastructure";

interface AiTaskRow {
  id: string;
  workspace_id: string;
  vulnerability_id: string;
  task_type: string;
  status: "queued" | "processing" | "validated" | "persisted" | "failed";
  prompt_version: string;
  cache_key: string;
  provider_used: string | null;
  retry_count: number;
  fallback_used: boolean;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface AiResultRow {
  id: string;
  task_id: string;
  workspace_id: string;
  vulnerability_id: string;
  task_type: string;
  prompt_version: string;
  provider: string | null;
  model: string | null;
  payload: unknown;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number | null;
  retry_count: number;
  fallback_used: boolean;
  created_at: string;
  updated_at: string;
}

interface UsageRepositoryLike {
  record(event: {
    workspaceId: string;
    taskId?: string;
    vulnerabilityId?: string;
    taskType: AiTaskType;
    provider?: string;
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs?: number;
    retryCount?: number;
    fallbackUsed?: boolean;
    status: "success" | "failure";
    errorCode?: string;
    errorMessage?: string;
    createdAt: string;
  }): Promise<void>;
}

interface MetricsRecorderLike {
  increment(name: string, value?: number, tags?: Record<string, string | undefined>): void;
  histogram(name: string, value: number, tags?: Record<string, string | undefined>): void;
}

export interface AiGatewayDependencies {
  cache?: CacheInterface;
  policyEngine?: PolicyEngine;
  promptRegistry?: PromptRegistry;
  orchestrator?: TaskOrchestrator;
  usageRepository?: UsageRepositoryLike;
  metricsRecorder?: MetricsRecorderLike;
  providers?: Record<"groq" | "openai", AiProvider>;
  explanationProcessor?: VulnerabilityExplanationProcessor;
}

export class AiGateway {
  private readonly cache: CacheInterface;
  private readonly promptRegistry: PromptRegistry;
  private readonly policyEngine: PolicyEngine;
  private readonly orchestrator: TaskOrchestrator;
  private readonly usageRepository: UsageRepositoryLike;
  private readonly metrics: MetricsRecorderLike;
  private readonly providers: Record<"groq" | "openai", AiProvider>;
  private readonly explanationProcessor: VulnerabilityExplanationProcessor;
  private workerRegistered = false;

  constructor(
    private readonly fastify: FastifyInstance,
    dependencies: AiGatewayDependencies = {}
  ) {
    this.cache = dependencies.cache || new RedisCache();
    this.promptRegistry = dependencies.promptRegistry || new PromptRegistry();
    this.policyEngine = dependencies.policyEngine || new PolicyEngine();
    this.usageRepository =
      dependencies.usageRepository || new UsageRepository(fastify);
    this.metrics = dependencies.metricsRecorder || new MetricsRecorder();
    this.providers = dependencies.providers || {
      groq: new GroqProvider(),
      openai: new OpenAiProvider(),
    };
    this.explanationProcessor =
      dependencies.explanationProcessor ||
      new VulnerabilityExplanationProcessor({
        providers: this.providers,
        promptRegistry: this.promptRegistry,
        policyEngine: this.policyEngine,
        logger: this.fastify.log,
      });

    if (dependencies.orchestrator) {
      this.orchestrator = dependencies.orchestrator;
    } else {
      const queue: AiQueueInterface = new BullMqQueue({
        concurrency: this.policyEngine.getQueuePolicy().concurrency,
        logger: {
          info: (meta, message) => this.fastify.log.info(meta, message),
          warn: (meta, message) => this.fastify.log.warn(meta, message),
          error: (meta, message) => this.fastify.log.error(meta, message),
        },
      });
      this.orchestrator = new TaskOrchestrator(queue);
    }
  }

  async runTask(
    task: AiTask
  ): Promise<AiResult<VulnerabilityExplanationPayload>> {
    await this.ensureWorkerRegistered();

    if (task.type !== AiTaskType.VulnerabilityExplanation) {
      const httpErrors = (this.fastify as any).httpErrors;
      throw httpErrors
        ? httpErrors.badRequest(`Unsupported AI task type: ${task.type}`)
        : new Error(`Unsupported AI task type: ${task.type}`);
    }

    const decision = this.policyEngine.evaluate(task);
    if (!decision.allowed) {
      const httpErrors = (this.fastify as any).httpErrors;
      throw httpErrors
        ? httpErrors.forbidden(decision.reason || "Task denied by policy")
        : new Error(decision.reason || "Task denied by policy");
    }

    const vulnerability = this.getVulnerability(task.input);
    const taskId = task.id || randomUUID();
    const cacheKey = this.getExplanationCacheKey(
      task.workspaceId,
      vulnerability.fingerprint,
      task.promptVersion
    );
    const titleCacheKey = this.getTitleCacheKey(
      task.workspaceId,
      vulnerability.fingerprint
    );

    if (!task.regenerate) {
      const existingFromVulnerability = vulnerabilityExplanationSchema.safeParse(
        vulnerability.ai_explanation
      );
      if (existingFromVulnerability.success) {
        await this.cache.set(
          cacheKey,
          existingFromVulnerability.data,
          this.policyEngine.getQueuePolicy().cacheTtlSeconds
        );
        await this.cache.set(
          titleCacheKey,
          existingFromVulnerability.data.refined_title,
          this.policyEngine.getQueuePolicy().cacheTtlSeconds
        );
        return this.buildResult({
          id: taskId,
          taskId,
          workspaceId: task.workspaceId,
          status: "persisted",
          payload: existingFromVulnerability.data,
          provider: "database",
          model: "database",
          cacheHit: false,
        });
      }
    }

    if (!task.regenerate) {
      const cached = await this.cache.get<unknown>(cacheKey);
      if (cached) {
        const parsedCached = vulnerabilityExplanationSchema.safeParse(cached);
        if (!parsedCached.success) {
          await this.cache.delete(cacheKey);
        } else {
          return this.buildResult({
            id: taskId,
            taskId,
            workspaceId: task.workspaceId,
            status: "persisted",
            payload: parsedCached.data,
            provider: "cache",
            model: "cache",
            cacheHit: true,
          });
        }
      }
    }

    if (!task.regenerate) {
      const persisted = await this.getPersistedResult(
        task.workspaceId,
        vulnerability.id,
        task.promptVersion
      );
      if (persisted) {
        const parsedPersistedPayload = vulnerabilityExplanationSchema.safeParse(
          persisted.payload
        );
        if (!parsedPersistedPayload.success) {
          this.fastify.log.warn(
            {
              workspaceId: task.workspaceId,
              vulnerabilityId: vulnerability.id,
              promptVersion: task.promptVersion,
            },
            "Persisted AI result failed schema validation, regenerating"
          );
        } else {
          const normalizedRow: AiResultRow = {
            ...persisted,
            payload: parsedPersistedPayload.data,
          };
          await this.cache.set(
            cacheKey,
            parsedPersistedPayload.data,
            this.policyEngine.getQueuePolicy().cacheTtlSeconds
          );
          await this.cache.set(
            titleCacheKey,
            parsedPersistedPayload.data.refined_title,
            this.policyEngine.getQueuePolicy().cacheTtlSeconds
          );
          return this.resultFromRow(normalizedRow);
        }
      }
    }

    if (!task.regenerate) {
      const activeTask = await this.getActiveTask(
        task.workspaceId,
        vulnerability.id,
        task.promptVersion
      );
      if (activeTask && activeTask.status !== "failed") {
        return this.buildResult({
          id: activeTask.id,
          taskId: activeTask.id,
          workspaceId: task.workspaceId,
          status: activeTask.status,
          provider: activeTask.provider_used || undefined,
        });
      }
    }

    const queuedAt = new Date().toISOString();
    const queueTask: AiTask = {
      ...task,
      id: taskId,
      vulnerabilityId: vulnerability.id,
      createdAt: queuedAt,
      input: { vulnerability },
    };

    const taskRow = await this.createTaskRecord(queueTask, cacheKey);
    await this.orchestrator.enqueue(queueTask);

    return this.buildResult({
      id: taskRow.id,
      taskId: taskRow.id,
      workspaceId: task.workspaceId,
      status: "queued",
      createdAt: taskRow.created_at,
      updatedAt: taskRow.updated_at,
    });
  }

  private async ensureWorkerRegistered(): Promise<void> {
    if (this.workerRegistered) {
      return;
    }

    await this.orchestrator.registerWorker(async (job) => {
      await this.processQueuedTask(job);
    });
    this.workerRegistered = true;
  }

  private async processQueuedTask(job: AiQueueJob): Promise<void> {
    const task = job.task;
    if (task.type !== AiTaskType.VulnerabilityExplanation) {
      return;
    }

    const vulnerability = this.getVulnerability(task.input);
    const cacheKey = this.getExplanationCacheKey(
      task.workspaceId,
      vulnerability.fingerprint,
      task.promptVersion
    );
    const titleCacheKey = this.getTitleCacheKey(
      task.workspaceId,
      vulnerability.fingerprint
    );

    await this.updateTaskStatus(task.id, "processing");

    try {
      const execution = await this.explanationProcessor.generate(
        vulnerability,
        task.promptVersion
      );
      await this.updateTaskStatus(task.id, "validated", {
        provider_used: execution.provider,
        retry_count: execution.retryCount,
        fallback_used: execution.fallbackUsed,
      });

      const persistedResult = await this.persistResult(
        task,
        vulnerability.id,
        execution
      );

      await this.cache.set(
        cacheKey,
        execution.payload,
        this.policyEngine.getQueuePolicy().cacheTtlSeconds
      );
      await this.cache.set(
        titleCacheKey,
        execution.payload.refined_title,
        this.policyEngine.getQueuePolicy().cacheTtlSeconds
      );

      await this.updateTaskStatus(task.id, "persisted", {
        provider_used: execution.provider,
        retry_count: execution.retryCount,
        fallback_used: execution.fallbackUsed,
        completed_at: new Date().toISOString(),
      });

      await this.usageRepository.record({
        workspaceId: task.workspaceId,
        taskId: task.id,
        vulnerabilityId: vulnerability.id,
        taskType: task.type,
        provider: execution.provider,
        model: execution.model,
        promptTokens: execution.promptTokens,
        completionTokens: execution.completionTokens,
        latencyMs: execution.latencyMs,
        retryCount: execution.retryCount,
        fallbackUsed: execution.fallbackUsed,
        status: "success",
        createdAt: new Date().toISOString(),
      });

      this.metrics.increment("ai.task.success", 1, {
        workspaceId: task.workspaceId,
        provider: execution.provider,
        model: execution.model,
        taskType: task.type,
      });
      this.metrics.histogram("ai.task.latency_ms", execution.latencyMs, {
        workspaceId: task.workspaceId,
        provider: execution.provider,
        taskType: task.type,
      });

      this.fastify.log.info(
        {
          taskId: task.id,
          vulnerabilityId: vulnerability.id,
          provider: execution.provider,
          fallbackUsed: execution.fallbackUsed,
          aiTitle: execution.payload.refined_title,
          remediationStep: execution.payload.remediation_step,
          resultId: persistedResult.id,
        },
        "AI vulnerability explanation persisted"
      );
    } catch (error: any) {
      const provider = error?.provider as string | undefined;
      await this.updateTaskStatus(task.id, "failed", {
        provider_used: provider || null,
        error_code: error?.code || AiErrorCode.Unknown,
        error_message: error?.message || "Unknown AI processing error",
      });

      await this.usageRepository.record({
        workspaceId: task.workspaceId,
        taskId: task.id,
        vulnerabilityId: vulnerability.id,
        taskType: task.type,
        provider,
        latencyMs: 0,
        retryCount: 0,
        fallbackUsed: false,
        status: "failure",
        errorCode: error?.code || AiErrorCode.Unknown,
        errorMessage: error?.message || "Unknown AI processing error",
        createdAt: new Date().toISOString(),
      });

      this.metrics.increment("ai.task.failure", 1, {
        workspaceId: task.workspaceId,
        provider,
        taskType: task.type,
      });

      throw error;
    }
  }

  private getVulnerability(input: unknown): VulnerabilityWithInstances {
    const vulnerability = (input as { vulnerability?: VulnerabilityWithInstances })?.vulnerability;
    if (!vulnerability) {
      const httpErrors = (this.fastify as any).httpErrors;
      throw httpErrors
        ? httpErrors.badRequest("Vulnerability payload is required")
        : new Error("Vulnerability payload is required");
    }
    return vulnerability;
  }

  private getExplanationCacheKey(
    workspaceId: string,
    vulnerabilityFingerprint: string,
    promptVersion: string
  ): string {
    return `${workspaceId}:${vulnerabilityFingerprint}:${promptVersion}:explanation`;
  }

  private getTitleCacheKey(
    workspaceId: string,
    vulnerabilityFingerprint: string
  ): string {
    return `${workspaceId}:${vulnerabilityFingerprint}:title`;
  }

  private async createTaskRecord(task: AiTask, cacheKey: string): Promise<AiTaskRow> {
    const vulnerability = this.getVulnerability(task.input);
    const { data, error } = await this.fastify.supabase
      .from("ai_tasks")
      .insert({
        id: task.id,
        workspace_id: task.workspaceId,
        vulnerability_id: vulnerability.id,
        task_type: task.type,
        status: "queued",
        prompt_version: task.promptVersion,
        cache_key: cacheKey,
        requested_by: task.requestedBy || null,
        retry_count: 0,
        fallback_used: false,
      })
      .select("*")
      .single();

    if (error || !data) {
      if (error?.code === "23505") {
        const active = await this.getActiveTask(
          task.workspaceId,
          vulnerability.id,
          task.promptVersion
        );
        if (active) {
          return active;
        }
      }
      this.fastify.log.error({ error, task }, "Failed to persist AI task record");
      const httpErrors = (this.fastify as any).httpErrors;
      throw httpErrors
        ? httpErrors.internalServerError("Failed to create AI task")
        : new Error("Failed to create AI task");
    }

    return data as AiTaskRow;
  }

  private async updateTaskStatus(
    taskId: string,
    status: AiTaskRow["status"],
    extras: Record<string, unknown> = {}
  ): Promise<void> {
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
      ...extras,
    };

    if (status === "processing") {
      updatePayload.processing_started_at = new Date().toISOString();
    }
    if (status === "persisted" || status === "failed") {
      updatePayload.completed_at = new Date().toISOString();
    }

    const { error } = await this.fastify.supabase
      .from("ai_tasks")
      .update(updatePayload)
      .eq("id", taskId);

    if (error) {
      this.fastify.log.error({ error, taskId, status }, "Failed to update AI task status");
      throw error;
    }
  }

  private async persistResult(
    task: AiTask,
    vulnerabilityId: string,
    execution: ExplanationExecutionResult
  ): Promise<AiResultRow> {
    const validatedPayload = vulnerabilityExplanationSchema.safeParse(execution.payload);
    if (!validatedPayload.success) {
      this.fastify.log.error(
        { taskId: task.id, details: validatedPayload.error.flatten() },
        "AI payload failed schema validation before persistence"
      );
      throw new Error("AI payload failed schema validation before persistence");
    }

    const titleSanity = validateTitleSanity(validatedPayload.data.refined_title);
    if (!titleSanity.valid) {
      this.fastify.log.error(
        { taskId: task.id, titleSanity },
        "AI title failed sanity validation before persistence"
      );
      throw new Error("AI title failed sanity validation before persistence");
    }

    const now = new Date().toISOString();
    const { data, error } = await this.fastify.supabase
      .from("ai_results")
      .upsert(
        {
          task_id: task.id,
          workspace_id: task.workspaceId,
          vulnerability_id: vulnerabilityId,
          task_type: task.type,
          prompt_version: task.promptVersion,
          provider: execution.provider,
          model: execution.model,
          payload: validatedPayload.data,
          prompt_tokens: execution.promptTokens ?? null,
          completion_tokens: execution.completionTokens ?? null,
          latency_ms: execution.latencyMs,
          retry_count: execution.retryCount,
          fallback_used: execution.fallbackUsed,
          updated_at: now,
          created_at: now,
        },
        { onConflict: "task_id" }
      )
      .select("*")
      .single();

    if (error || !data) {
      this.fastify.log.error({ error, taskId: task.id }, "Failed to persist AI result");
      const httpErrors = (this.fastify as any).httpErrors;
      throw httpErrors
        ? httpErrors.internalServerError("Failed to persist AI result")
        : new Error("Failed to persist AI result");
    }

    const explanationForVulnerability = {
      ...validatedPayload.data,
      generated_at: now,
      provider: execution.provider,
      model_version: execution.model,
    };

    const vulnerabilityUpdate = await this.fastify.supabase
      .from("vulnerabilities_unified")
      .update({
        title: validatedPayload.data.refined_title,
        ai_explanation: explanationForVulnerability,
        updated_at: now,
      })
      .eq("id", vulnerabilityId)
      .eq("workspace_id", task.workspaceId);

    if (vulnerabilityUpdate.error) {
      this.fastify.log.error(
        { error: vulnerabilityUpdate.error, vulnerabilityId },
        "Failed to persist vulnerability AI explanation"
      );
      const httpErrors = (this.fastify as any).httpErrors;
      throw httpErrors
        ? httpErrors.internalServerError(
            "Failed to persist vulnerability AI explanation"
          )
        : new Error("Failed to persist vulnerability AI explanation");
    }

    return data as AiResultRow;
  }

  private async getPersistedResult(
    workspaceId: string,
    vulnerabilityId: string,
    promptVersion: string
  ): Promise<AiResultRow | null> {
    const { data, error } = await this.fastify.supabase
      .from("ai_results")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("vulnerability_id", vulnerabilityId)
      .eq("task_type", AiTaskType.VulnerabilityExplanation)
      .eq("prompt_version", promptVersion)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      this.fastify.log.error({ error, workspaceId, vulnerabilityId }, "Failed to fetch persisted AI result");
      return null;
    }

    return ((data as AiResultRow[] | null) || [])[0] || null;
  }

  private async getActiveTask(
    workspaceId: string,
    vulnerabilityId: string,
    promptVersion: string
  ): Promise<AiTaskRow | null> {
    const { data, error } = await this.fastify.supabase
      .from("ai_tasks")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("vulnerability_id", vulnerabilityId)
      .eq("task_type", AiTaskType.VulnerabilityExplanation)
      .eq("prompt_version", promptVersion)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      this.fastify.log.error({ error, workspaceId, vulnerabilityId }, "Failed to fetch active AI task");
      return null;
    }

    return ((data as AiTaskRow[] | null) || [])[0] || null;
  }

  private resultFromRow(row: AiResultRow): AiResult<VulnerabilityExplanationPayload> {
    const parsedPayload = vulnerabilityExplanationSchema.safeParse(row.payload);
    if (!parsedPayload.success) {
      throw new Error("Persisted AI result payload failed schema validation");
    }

    return this.buildResult({
      id: row.id,
      taskId: row.task_id,
      workspaceId: row.workspace_id,
      status: "persisted",
      payload: parsedPayload.data,
      provider: row.provider || undefined,
      model: row.model || undefined,
      fallbackUsed: row.fallback_used,
      retryCount: row.retry_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  private buildResult(
    input: Partial<AiResult<VulnerabilityExplanationPayload>> & {
      id: string;
      taskId: string;
      workspaceId: string;
      status: AiResult["status"];
    }
  ): AiResult<VulnerabilityExplanationPayload> {
    const now = new Date().toISOString();
    return {
      id: input.id,
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      taskType: AiTaskType.VulnerabilityExplanation,
      status: input.status,
      payload: input.payload,
      provider: input.provider,
      model: input.model,
      cacheHit: input.cacheHit,
      fallbackUsed: input.fallbackUsed,
      retryCount: input.retryCount,
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
    };
  }

}

const gateways = new WeakMap<FastifyInstance, AiGateway>();

export function getAiGateway(fastify: FastifyInstance): AiGateway {
  const existing = gateways.get(fastify);
  if (existing) {
    return existing;
  }

  const gateway = new AiGateway(fastify);
  gateways.set(fastify, gateway);
  return gateway;
}
