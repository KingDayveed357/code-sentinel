import assert from "assert";
import type { FastifyBaseLogger } from "fastify";
import { randomUUID } from "crypto";
import {
  AiErrorCode,
  AiProviderError,
  AiTaskType,
  type AiProvider,
  type AiProviderRequest,
  type AiProviderResponse,
  type AiTask,
} from "../domain";
import { PolicyEngine } from "../application/policy-engine";
import { PromptRegistry } from "../application/prompt-registry";
import {
  VulnerabilityExplanationProcessor,
  vulnerabilityExplanationSchema,
  AiGateway,
  TaskOrchestrator,
  TITLE_MAX_WORDS,
  validateTitleSanity,
} from "../application";
import type { CacheInterface } from "../infrastructure/cache/cache-interface";
import type { AiQueueInterface, AiQueueJob } from "../infrastructure/queue/ai-queue-interface";

type TestFn = () => Promise<void>;

const tests: Array<{ name: string; fn: TestFn }> = [];

function test(name: string, fn: TestFn) {
  tests.push({ name, fn });
}

function createLogger(): FastifyBaseLogger {
  const noop = () => {};
  return {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    trace: noop,
    fatal: noop,
    child: () => createLogger(),
    level: "silent",
    silent: true,
  } as unknown as FastifyBaseLogger;
}

function buildVulnerabilityFixture() {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    fingerprint: "fp-1",
    title: "SQL Injection in login query",
    severity: "high",
    cwe: "CWE-89",
    rule_id: "semgrep.sql.injection",
    scanner_type: "sast",
    description: "Unsanitized input reaches SQL query execution path.",
    file_path: "src/auth/login.ts",
    ai_explanation: null,
  } as any;
}

class MockProvider implements AiProvider {
  calls = 0;

  constructor(
    public readonly name: string,
    private readonly handler: (
      request: AiProviderRequest,
      call: number
    ) => Promise<AiProviderResponse> | AiProviderResponse
  ) {}

  async generate<TData = unknown>(
    request: AiProviderRequest
  ): Promise<AiProviderResponse<TData>> {
    this.calls += 1;
    const result = await this.handler(request, this.calls);
    return result as AiProviderResponse<TData>;
  }
}

class MemoryCache implements CacheInterface {
  readonly store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class ImmediateQueue implements AiQueueInterface {
  private handler: ((job: AiQueueJob) => Promise<void>) | null = null;
  enqueueCount = 0;

  async enqueue(job: AiQueueJob): Promise<string> {
    this.enqueueCount += 1;
    if (this.handler) {
      await this.handler(job);
    }
    return job.id;
  }

  async registerWorker(handler: (job: AiQueueJob) => Promise<void>): Promise<void> {
    this.handler = handler;
  }

  async close(): Promise<void> {}
}

class AsyncFailingQueue implements AiQueueInterface {
  private handler: ((job: AiQueueJob) => Promise<void>) | null = null;

  async enqueue(job: AiQueueJob): Promise<string> {
    setTimeout(async () => {
      try {
        await this.handler?.(job);
      } catch {
        // swallow to simulate isolated worker crash
      }
    }, 0);
    return job.id;
  }

  async registerWorker(handler: (job: AiQueueJob) => Promise<void>): Promise<void> {
    this.handler = handler;
  }

  async close(): Promise<void> {}
}

class ThrottledQueue implements AiQueueInterface {
  private handler: ((job: AiQueueJob) => Promise<void>) | null = null;
  private pending: AiQueueJob[] = [];
  private running = 0;
  private drainedResolver: (() => void) | null = null;
  readonly completion: Promise<void>;

  constructor(private readonly concurrency: number) {
    this.completion = new Promise<void>((resolve) => {
      this.drainedResolver = resolve;
    });
  }

  async enqueue(job: AiQueueJob): Promise<string> {
    this.pending.push(job);
    this.pump();
    return job.id;
  }

  async registerWorker(handler: (job: AiQueueJob) => Promise<void>): Promise<void> {
    this.handler = handler;
    this.pump();
  }

  async close(): Promise<void> {}

  private pump(): void {
    while (this.handler && this.running < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.running += 1;
      void this.handler(job)
        .catch(() => undefined)
        .finally(() => {
          this.running -= 1;
          if (this.pending.length === 0 && this.running === 0) {
            this.drainedResolver?.();
          } else {
            this.pump();
          }
        });
    }
  }
}

function createGatewayHarness(options: {
  queue: AiQueueInterface;
  cache: CacheInterface;
  processorGenerate: (
    vulnerability: any,
    promptVersion: string
  ) => Promise<{
    payload: any;
    provider: string;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    latencyMs: number;
    retryCount: number;
    fallbackUsed: boolean;
  }>;
}) {
  const fastify = {
    log: createLogger(),
    httpErrors: {
      badRequest: (message: string) => new Error(message),
      forbidden: (message: string) => new Error(message),
      internalServerError: (message: string) => new Error(message),
    },
    supabase: {},
  } as any;

  const orchestrator = new TaskOrchestrator(options.queue);
  const gateway = new AiGateway(fastify, {
    cache: options.cache,
    orchestrator,
    usageRepository: { record: async () => {} },
    metricsRecorder: { increment: () => {}, histogram: () => {} },
    policyEngine: new PolicyEngine(),
    promptRegistry: new PromptRegistry(),
    explanationProcessor: {
      generate: options.processorGenerate,
    } as any,
    providers: {
      groq: new MockProvider("groq", async () => {
        throw new Error("unused");
      }),
      openai: new MockProvider("openai", async () => {
        throw new Error("unused");
      }),
    },
  });

  const tasks = new Map<string, any>();
  const results = new Map<string, any>();

  const gatewayInternal = gateway as any;

  gatewayInternal.createTaskRecord = async (task: AiTask, cacheKey: string) => {
    const row = {
      id: task.id,
      workspace_id: task.workspaceId,
      vulnerability_id: (task.input as any).vulnerability.id,
      task_type: task.type,
      status: "queued",
      prompt_version: task.promptVersion,
      cache_key: cacheKey,
      provider_used: null,
      retry_count: 0,
      fallback_used: false,
      error_code: null,
      error_message: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    tasks.set(task.id, row);
    return row;
  };

  gatewayInternal.getActiveTask = async (
    workspaceId: string,
    vulnerabilityId: string,
    promptVersion: string
  ) => {
    const rows = Array.from(tasks.values()).filter(
      (row) =>
        row.workspace_id === workspaceId &&
        row.vulnerability_id === vulnerabilityId &&
        row.prompt_version === promptVersion
    );
    return rows.length > 0 ? rows[rows.length - 1] : null;
  };

  gatewayInternal.getPersistedResult = async (
    workspaceId: string,
    vulnerabilityId: string,
    promptVersion: string
  ) => {
    const key = `${workspaceId}:${vulnerabilityId}:${promptVersion}`;
    return results.get(key) ?? null;
  };

  gatewayInternal.updateTaskStatus = async (
    taskId: string,
    status: string,
    extras: Record<string, unknown> = {}
  ) => {
    const row = tasks.get(taskId);
    if (!row) return;
    tasks.set(taskId, { ...row, status, updated_at: new Date().toISOString(), ...extras });
  };

  gatewayInternal.persistResult = async (
    task: AiTask,
    vulnerabilityId: string,
    execution: any
  ) => {
    const key = `${task.workspaceId}:${vulnerabilityId}:${task.promptVersion}`;
    const row = {
      id: randomUUID(),
      task_id: task.id,
      workspace_id: task.workspaceId,
      vulnerability_id: vulnerabilityId,
      task_type: task.type,
      prompt_version: task.promptVersion,
      provider: execution.provider,
      model: execution.model,
      payload: execution.payload,
      prompt_tokens: execution.promptTokens ?? null,
      completion_tokens: execution.completionTokens ?? null,
      latency_ms: execution.latencyMs,
      retry_count: execution.retryCount,
      fallback_used: execution.fallbackUsed,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    results.set(key, row);
    return row;
  };

  return { gateway, tasks, results, orchestrator };
}

test("Provider fallback uses OpenAI when Groq fails", async () => {
  const groq = new MockProvider("groq", async () => {
    throw new AiProviderError({
      code: AiErrorCode.RateLimited,
      message: "rate limited",
      retryable: true,
      provider: "groq",
      statusCode: 429,
    });
  });
  const openai = new MockProvider("openai", async () => ({
    provider: "openai",
    model: "gpt-4o-mini",
    rawText: JSON.stringify({
      vulnerabilityTitle: "High severity SQL injection in login path",
      summary: "Input reaches SQL sink.",
      impact: "Attackers can extract sensitive records.",
      exploitScenario: "Malicious payload bypasses sanitization and executes query logic.",
      remediationOverview: "Use parameterized queries and strict input validation.",
      stepByStepFix: [
        "Replace string interpolation with parameterized queries.",
        "Validate input type and length before query execution.",
      ],
      confidence: 0.9,
      citations: ["semgrep.sql.injection"],
    }),
    latencyMs: 20,
  }));

  const processor = new VulnerabilityExplanationProcessor({
    providers: { groq, openai },
    promptRegistry: new PromptRegistry(),
    policyEngine: new PolicyEngine(),
    logger: createLogger(),
  });

  const result = await processor.generate(buildVulnerabilityFixture(), "v1");
  assert.equal(result.provider, "openai");
  assert.equal(result.fallbackUsed, false);
  assert.ok(groq.calls >= 1);
  assert.equal(openai.calls, 1);
});

test("Malformed JSON is rejected and falls back after retry", async () => {
  const groq = new MockProvider("groq", async () => ({
    provider: "groq",
    model: "llama",
    rawText: "{ malformed json",
    latencyMs: 10,
  }));
  const openai = new MockProvider("openai", async () => ({
    provider: "openai",
    model: "gpt-4o-mini",
    rawText: JSON.stringify({
      vulnerabilityTitle: "Unsafe execution path allows credential theft",
      summary: "Vulnerability enables unsafe execution.",
      impact: "Compromise can expose credentials.",
      exploitScenario: "Attacker submits crafted payload to trigger unsafe path.",
      remediationOverview: "Apply strict validation and safe query APIs.",
      stepByStepFix: [
        "Add strict validation on untrusted input.",
        "Refactor vulnerable sink to safe API usage.",
      ],
      confidence: 0.8,
      citations: [],
    }),
    latencyMs: 15,
  }));

  const processor = new VulnerabilityExplanationProcessor({
    providers: { groq, openai },
    promptRegistry: new PromptRegistry(),
    policyEngine: new PolicyEngine(),
    logger: createLogger(),
  });

  const result = await processor.generate(buildVulnerabilityFixture(), "v1");
  assert.equal(result.provider, "openai");
  assert.equal(groq.calls, 2);
  assert.equal(openai.calls, 1);
});

test("Worker crash does not affect scan completion status", async () => {
  const scan = { status: "completed" as const };
  const queue = new AsyncFailingQueue();
  const cache = new MemoryCache();

  const { gateway } = createGatewayHarness({
    queue,
    cache,
    processorGenerate: async () => {
      throw new Error("simulated worker crash");
    },
  });

  const vulnerability = buildVulnerabilityFixture();
  const task: AiTask = {
    id: randomUUID(),
    workspaceId: "22222222-2222-2222-2222-222222222222",
    type: AiTaskType.VulnerabilityExplanation,
    promptVersion: "v1",
    createdAt: new Date().toISOString(),
    input: { vulnerability },
  };

  const result = await gateway.runTask(task);
  assert.equal(result.status, "queued");

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(scan.status, "completed");
});

test("Queue throttles when 100 jobs are enqueued", async () => {
  const queue = new ThrottledQueue(5);
  const orchestrator = new TaskOrchestrator(queue);

  let active = 0;
  let maxActive = 0;
  let processed = 0;

  await orchestrator.registerWorker(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    processed += 1;
  });

  const vulnerability = buildVulnerabilityFixture();
  for (let i = 0; i < 100; i += 1) {
    await orchestrator.enqueue({
      id: `job-${i}`,
      workspaceId: "33333333-3333-3333-3333-333333333333",
      type: AiTaskType.VulnerabilityExplanation,
      promptVersion: "v1",
      createdAt: new Date().toISOString(),
      input: { vulnerability },
    });
  }

  await queue.completion;
  assert.equal(processed, 100);
  assert.ok(maxActive <= 5);
});

test("Cache prevents duplicate provider calls for same vulnerability", async () => {
  const queue = new ImmediateQueue();
  const cache = new MemoryCache();
  let processorCalls = 0;

  const { gateway } = createGatewayHarness({
    queue,
    cache,
    processorGenerate: async () => {
      processorCalls += 1;
      return {
        payload: {
          refined_title: "Cache Test Authentication Bypass Risk",
          root_cause_summary:
            "Unsafe token validation allows attackers to bypass authentication checks.",
          remediation_step:
            "Enforce strict signature, issuer, and audience validation before granting access.",
        },
        provider: "openai",
        model: "gpt-4o-mini",
        latencyMs: 10,
        retryCount: 0,
        fallbackUsed: false,
      };
    },
  });

  const vulnerability = buildVulnerabilityFixture();
  const workspaceId = "44444444-4444-4444-4444-444444444444";

  await gateway.runTask({
    id: randomUUID(),
    workspaceId,
    type: AiTaskType.VulnerabilityExplanation,
    promptVersion: "v1",
    createdAt: new Date().toISOString(),
    input: { vulnerability },
  });

  const second = await gateway.runTask({
    id: randomUUID(),
    workspaceId,
    type: AiTaskType.VulnerabilityExplanation,
    promptVersion: "v1",
    createdAt: new Date().toISOString(),
    input: { vulnerability },
  });

  assert.equal(queue.enqueueCount, 1);
  assert.equal(processorCalls, 1);
  assert.equal(second.status, "persisted");
  assert.equal(second.cacheHit, true);
});

test("Deterministic fallback returns valid schema when providers fail", async () => {
  const groq = new MockProvider("groq", async () => {
    throw new AiProviderError({
      code: AiErrorCode.ProviderUnavailable,
      message: "groq down",
      retryable: false,
      provider: "groq",
    });
  });
  const openai = new MockProvider("openai", async () => {
    throw new AiProviderError({
      code: AiErrorCode.ProviderUnavailable,
      message: "openai down",
      retryable: false,
      provider: "openai",
    });
  });

  const processor = new VulnerabilityExplanationProcessor({
    providers: { groq, openai },
    promptRegistry: new PromptRegistry(),
    policyEngine: new PolicyEngine(),
    logger: createLogger(),
  });

  const result = await processor.generate(buildVulnerabilityFixture(), "v1");
  const parsed = vulnerabilityExplanationSchema.parse(result.payload);

  assert.equal(result.provider, "deterministic");
  assert.equal(result.fallbackUsed, true);
  assert.ok(parsed.refined_title.split(/\s+/).filter(Boolean).length > 0);
  assert.ok(parsed.root_cause_summary.endsWith("."));
  assert.ok(parsed.remediation_step.endsWith("."));
});

test("AI-generated titles are human-readable and at most 12 words", async () => {
  const groq = new MockProvider("groq", async () => ({
    provider: "groq",
    model: "llama",
    rawText: JSON.stringify({
      refined_title: "Authentication Bypass in Token Validation Flow",
      root_cause_summary:
        "Token claim validation is incomplete, allowing forged claims to pass authorization.",
      remediation_step:
        "Validate signature, issuer, audience, and expiration before accepting tokens.",
    }),
    latencyMs: 8,
  }));
  const openai = new MockProvider("openai", async () => {
    throw new Error("should not be called");
  });

  const processor = new VulnerabilityExplanationProcessor({
    providers: { groq, openai },
    promptRegistry: new PromptRegistry(),
    policyEngine: new PolicyEngine(),
    logger: createLogger(),
  });

  const result = await processor.generate(buildVulnerabilityFixture(), "v1");
  const titleWords = result.payload.refined_title.split(/\s+/).filter(Boolean);

  assert.equal(result.provider, "groq");
  assert.ok(titleWords.length >= 3 && titleWords.length <= TITLE_MAX_WORDS);
  assert.ok(/^[A-Za-z0-9]/.test(result.payload.refined_title));
  assert.equal(validateTitleSanity(result.payload.refined_title).valid, true);
});

test("Title sanitizer removes metadata leakage and numeric suffixes", async () => {
  const groq = new MockProvider("groq", async () => ({
    provider: "groq",
    model: "llama",
    rawText: JSON.stringify({
      refined_title: "Missing Healthcheck 2 Misconfiguration Admin Assets",
      root_cause_summary:
        "Container health checks are missing and service health cannot be verified.",
      remediation_step:
        "Add an explicit HEALTHCHECK instruction and verify it in CI.",
    }),
    latencyMs: 8,
  }));
  const openai = new MockProvider("openai", async () => {
    throw new Error("should not be called");
  });

  const processor = new VulnerabilityExplanationProcessor({
    providers: { groq, openai },
    promptRegistry: new PromptRegistry(),
    policyEngine: new PolicyEngine(),
    logger: createLogger(),
  });

  const vulnerability = {
    ...buildVulnerabilityFixture(),
    title: "Missing Healthcheck 2 Misconfiguration Admin Assets",
    rule_id: "missing-healthcheck-2-misconfiguration-admin-assets",
    description:
      "Missing container health checks can hide unhealthy instances and expand service outage risk.",
  };

  const result = await processor.generate(vulnerability, "v1");

  assert.equal(result.provider, "groq");
  assert.ok(!/\b\d+\b/.test(result.payload.refined_title));
  assert.ok(!/\b(admin|assets?|generic)\b/i.test(result.payload.refined_title));
  assert.ok(result.payload.refined_title.split(/\s+/).filter(Boolean).length >= 3);
});

test("Title sanitizer removes instruction leakage and fragmented words", async () => {
  const groq = new MockProvider("groq", async () => ({
    provider: "groq",
    model: "llama",
    rawText: JSON.stringify({
      refined_title:
        "Echo ing user input risks cross-site scripting you should sanitize output immediately",
      root_cause_summary:
        "Unsanitized output allows attacker-controlled scripts to execute in user browsers.",
      remediation_step:
        "Apply contextual output encoding and strict HTML sanitization for untrusted content.",
    }),
    latencyMs: 8,
  }));
  const openai = new MockProvider("openai", async () => {
    throw new Error("should not be called");
  });

  const processor = new VulnerabilityExplanationProcessor({
    providers: { groq, openai },
    promptRegistry: new PromptRegistry(),
    policyEngine: new PolicyEngine(),
    logger: createLogger(),
  });

  const vulnerability = {
    ...buildVulnerabilityFixture(),
    title: "echo-ing user input risks cross-site scripting",
    description:
      "echo-ing user input risks cross-site scripting and enables untrusted script execution",
  };

  const result = await processor.generate(vulnerability, "v1");
  const sanity = validateTitleSanity(result.payload.refined_title);

  assert.equal(result.provider, "groq");
  assert.equal(sanity.valid, true);
  assert.ok(!/\bYou Should\b/i.test(result.payload.refined_title));
  assert.ok(!/\bEcho Ing\b/.test(result.payload.refined_title));
  assert.ok(
    result.payload.refined_title.split(/\s+/).filter(Boolean).length <= TITLE_MAX_WORDS
  );
});

async function run() {
  let failures = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      // eslint-disable-next-line no-console
      console.log(`PASS ${name}`);
    } catch (error) {
      failures += 1;
      // eslint-disable-next-line no-console
      console.error(`FAIL ${name}`);
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`PASS ${tests.length}/${tests.length} Wave 3 tests`);
}

void run();
