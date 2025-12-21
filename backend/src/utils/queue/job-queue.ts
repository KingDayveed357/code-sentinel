// ===================================================================
// src/shared/queue/job-queue.ts (UPDATED - Fix Stalling)
// ===================================================================
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { env } from '../../env';

export interface ScanJobPayload {
  scanId: string;
  repositoryId: string;
  userId: string;
  branch: string;
  scanType: 'quick' | 'full' | 'custom';
  enabledScanners: {
    sast: boolean;
    sca: boolean;
    secrets: boolean;
    iac: boolean;
    container: boolean;
  };
}

export interface JobQueueOptions {
  name: string;
  connection: {
    host: string;
    port: number;
    password?: string;
  };
  defaultJobOptions?: {
    attempts?: number;
    backoff?: {
      type: 'exponential' | 'fixed';
      delay: number;
    };
    removeOnComplete?: boolean | number;
    removeOnFail?: boolean | number;
  };
}

export class JobQueueManager {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  constructor(private fastify: FastifyInstance) {}

  createQueue<T = any>(options: JobQueueOptions): Queue<T> {
    if (this.queues.has(options.name)) {
      return this.queues.get(options.name) as Queue<T>;
    }

    const queue = new Queue<T>(options.name, {
      connection: options.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
        ...options.defaultJobOptions,
      },
    });

    this.queues.set(options.name, queue as Queue);
    this.fastify.log.info({ queue: options.name }, 'Queue created');
    return queue;
  }

  createWorker<T = any>(
    queueName: string,
    processor: (job: Job<T>) => Promise<any>,
    options?: {
      concurrency?: number;
      connection?: JobQueueOptions['connection'];
    }
  ): Worker<T> {
    if (this.workers.has(queueName)) {
      this.fastify.log.warn({ queue: queueName }, 'Worker already exists');
      return this.workers.get(queueName) as Worker<T>;
    }

    const worker = new Worker<T>(queueName, processor, {
      connection: options?.connection || this.getDefaultConnection(),
      concurrency: options?.concurrency || 3,
      autorun: true,
      // ✅ CRITICAL FIX: Increase stalled timeout for long-running scans
      lockDuration: 300000, // 5 minutes (was 30 seconds by default)
      lockRenewTime: 150000, // Renew every 2.5 minutes
      stalledInterval: 150000, // Check for stalled jobs every 2.5 minutes
    });

    worker.on('completed', (job) => {
      this.fastify.log.info(
        { jobId: job.id, queue: queueName },
        'Job completed successfully'
      );
    });

    worker.on('failed', (job, err) => {
      this.fastify.log.error(
        { jobId: job?.id, queue: queueName, error: err.message },
        'Job failed'
      );
    });

    worker.on('error', (err) => {
      this.fastify.log.error(
        { queue: queueName, error: err.message },
        'Worker error'
      );
    });

    this.workers.set(queueName, worker as Worker);
    this.fastify.log.info({ queue: queueName }, 'Worker started');

    return worker;
  }

  createQueueEvents(queueName: string): QueueEvents {
    if (this.queueEvents.has(queueName)) {
      return this.queueEvents.get(queueName)!;
    }

    const queueEvents = new QueueEvents(queueName, {
      connection: this.getDefaultConnection(),
    });

    queueEvents.on('waiting', ({ jobId }) => {
      this.fastify.log.debug({ jobId, queue: queueName }, 'Job waiting');
    });

    queueEvents.on('active', ({ jobId }) => {
      this.fastify.log.info({ jobId, queue: queueName }, 'Job active');
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      this.fastify.log.debug({ jobId, progress: data }, 'Job progress');
    });

    this.queueEvents.set(queueName, queueEvents);
    return queueEvents;
  }

  async enqueue<T = any>(
    queueName: string,
    jobName: string,
    data: T,
    options?: {
      delay?: number;
      priority?: number;
      jobId?: string;
    }
  ): Promise<Job<T>> {
    const queue = this.queues.get(queueName);

    if (!queue) {
      throw new Error(`Queue ${queueName} not found. Create it first.`);
    }

    const job = await queue.add(jobName, data, {
      delay: options?.delay,
      priority: options?.priority,
      jobId: options?.jobId,
    });

    this.fastify.log.info(
      { jobId: job.id, queue: queueName, jobName },
      'Job enqueued'
    );

    return job as Job<T>;
  }

  async getJob<T = any>(
    queueName: string,
    jobId: string
  ): Promise<Job<T> | undefined> {
    const queue = this.queues.get(queueName);
    if (!queue) return undefined;

    return queue.getJob(jobId) as Promise<Job<T> | undefined>;
  }

  async getQueueMetrics(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  async close() {
    this.fastify.log.info('Closing all queues and workers...');

    await Promise.all([
      ...Array.from(this.workers.values()).map((w) => w.close()),
      ...Array.from(this.queues.values()).map((q) => q.close()),
      ...Array.from(this.queueEvents.values()).map((qe) => qe.close()),
    ]);

    this.fastify.log.info('All queues and workers closed');
  }

  private getDefaultConnection() {
    const redisUrl = env.REDIS_URL || 'redis://localhost:6379';
    const url = new URL(redisUrl);

    return {
      host: url.hostname,
      port: parseInt(url.port) || 6379,
      password: url.password || undefined,
    };
  }
}

// ===================================================================
// Fastify Plugin
// ===================================================================
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    jobQueue: JobQueueManager;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const jobQueue = new JobQueueManager(fastify);

  fastify.decorate('jobQueue', jobQueue);

  fastify.addHook('onClose', async () => {
    await jobQueue.close();
  });

  fastify.log.info('Job queue manager initialized');
});