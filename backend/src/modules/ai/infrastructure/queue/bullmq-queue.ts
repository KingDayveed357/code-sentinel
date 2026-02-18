import type { AiQueueInterface, AiQueueJob } from "./ai-queue-interface";
import { Queue, QueueEvents, Worker } from "bullmq";
import { env } from "../../../../env";

interface RedisConnection {
  host: string;
  port: number;
  password?: string;
}

export interface BullMqQueueOptions {
  queueName?: string;
  deadLetterQueueName?: string;
  concurrency?: number;
  attempts?: number;
  backoffDelayMs?: number;
  connection?: RedisConnection;
  logger?: {
    info(meta: Record<string, unknown>, message: string): void;
    error(meta: Record<string, unknown>, message: string): void;
    warn(meta: Record<string, unknown>, message: string): void;
  };
}

export class BullMqQueue implements AiQueueInterface {
  readonly queueName: string;
  readonly deadLetterQueueName: string;

  private readonly connection: RedisConnection;
  private readonly concurrency: number;
  private readonly attempts: number;
  private readonly backoffDelayMs: number;
  private readonly logger?: BullMqQueueOptions["logger"];

  private readonly queue: Queue<AiQueueJob>;
  private readonly deadLetterQueue: Queue;
  private readonly queueEvents: QueueEvents;
  private worker?: Worker<AiQueueJob>;

  constructor(options: BullMqQueueOptions = {}) {
    this.queueName = options.queueName || "ai-enrichment-queue";
    this.deadLetterQueueName =
      options.deadLetterQueueName || "ai-enrichment-dead-letter-queue";
    this.connection = options.connection || this.getDefaultConnection();
    this.concurrency = options.concurrency ?? Number(env.AI_QUEUE_CONCURRENCY || 2);
    this.attempts = options.attempts ?? Number(env.AI_QUEUE_ATTEMPTS || 3);
    this.backoffDelayMs =
      options.backoffDelayMs ?? Number(env.AI_QUEUE_BACKOFF_MS || 500);
    this.logger = options.logger;

    this.queue = new Queue<AiQueueJob>(this.queueName, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: this.attempts,
        backoff: {
          type: "exponential",
          delay: this.backoffDelayMs,
        },
        removeOnComplete: 200,
        removeOnFail: false,
      },
    });

    this.deadLetterQueue = new Queue(this.deadLetterQueueName, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: 500,
        removeOnFail: false,
      },
    });

    this.queueEvents = new QueueEvents(this.queueName, {
      connection: this.connection,
    });
  }

  async enqueue(job: AiQueueJob): Promise<string> {
    const queuedJob = await this.queue.add("vulnerability_explanation", job, {
      jobId: job.id,
    });

    this.logger?.info(
      { queue: this.queueName, jobId: queuedJob.id, taskId: job.id },
      "AI explanation job enqueued"
    );

    return String(queuedJob.id);
  }

  async registerWorker(handler: (job: AiQueueJob) => Promise<void>): Promise<void> {
    if (this.worker) {
      return;
    }

    this.worker = new Worker<AiQueueJob>(
      this.queueName,
      async (bullJob) => {
        await handler(bullJob.data);
      },
      {
        connection: this.connection,
        concurrency: this.concurrency,
        autorun: true,
      }
    );

    this.worker.on("failed", async (job, error) => {
      this.logger?.error(
        {
          queue: this.queueName,
          taskId: job?.data?.task?.id,
          jobId: job?.id,
          attemptsMade: job?.attemptsMade,
          maxAttempts: job?.opts?.attempts,
          error: error.message,
        },
        "AI worker job failed"
      );

      const isTerminalFailure =
        !!job && (job.attemptsMade >= (job.opts.attempts ?? this.attempts));
      if (!isTerminalFailure || !job) {
        return;
      }

      await this.deadLetterQueue.add("dead_letter", {
        queue: this.queueName,
        originalJobId: job.id,
        taskId: job.data?.task?.id,
        payload: job.data,
        failedAt: new Date().toISOString(),
        reason: error.message,
      });
    });

    this.worker.on("error", (error) => {
      this.logger?.error(
        { queue: this.queueName, error: error.message },
        "AI worker process error"
      );
    });

    this.logger?.info(
      { queue: this.queueName, concurrency: this.concurrency, attempts: this.attempts },
      "AI queue worker registered"
    );
  }

  async getMetrics(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }

  async close(): Promise<void> {
    await Promise.all([
      this.worker?.close(),
      this.queue.close(),
      this.deadLetterQueue.close(),
      this.queueEvents.close(),
    ]);
  }

  private getDefaultConnection(): RedisConnection {
    const redisUrl = env.REDIS_URL || "redis://127.0.0.1:6379";
    const url = new URL(redisUrl);

    return {
      host: url.hostname,
      port: Number(url.port || "6379"),
      password: url.password || undefined,
    };
  }
}
