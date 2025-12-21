// ===================================================================
// src/utils/queue.ts - Simple In-Memory Job Queue
// ===================================================================
import type { FastifyInstance } from 'fastify';
import type { ScanJobPayload } from '../modules/scans/types';

interface QueueJob<T = any> {
    id: string;
    payload: T;
    attempts: number;
    maxAttempts: number;
    createdAt: Date;
    processingStartedAt?: Date;
}

export class JobQueue<T = any> {
    private queue: QueueJob<T>[] = [];
    private processing = false;
    private readonly maxConcurrent = 3;
    private activeJobs = 0;

    constructor(
        private readonly fastify: FastifyInstance,
        private readonly processor: (job: QueueJob<T>) => Promise<void>
    ) {}

    async enqueue(payload: T, maxAttempts = 3): Promise<string> {
        const job: QueueJob<T> = {
            id: crypto.randomUUID(),
            payload,
            attempts: 0,
            maxAttempts,
            createdAt: new Date(),
        };

        this.queue.push(job);
        this.fastify.log.info({ jobId: job.id }, 'Job enqueued');

        // Start processing if not already running
        if (!this.processing) {
            this.processQueue();
        }

        return job.id;
    }

    private async processQueue() {
        if (this.processing) return;
        this.processing = true;

        while (this.queue.length > 0 || this.activeJobs > 0) {
            // Process jobs concurrently up to maxConcurrent
            while (this.activeJobs < this.maxConcurrent && this.queue.length > 0) {
                const job = this.queue.shift();
                if (!job) break;

                this.activeJobs++;
                this.processJob(job).finally(() => {
                    this.activeJobs--;
                });
            }

            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        this.processing = false;
    }

    private async processJob(job: QueueJob<T>) {
        job.attempts++;
        job.processingStartedAt = new Date();

        this.fastify.log.info(
            { jobId: job.id, attempt: job.attempts },
            'Processing job'
        );

        try {
            await this.processor(job);
            this.fastify.log.info({ jobId: job.id }, 'Job completed successfully');
        } catch (error: any) {
            this.fastify.log.error(
                { jobId: job.id, error, attempt: job.attempts },
                'Job processing failed'
            );

            // Retry if attempts remaining
            if (job.attempts < job.maxAttempts) {
                this.fastify.log.info(
                    { jobId: job.id, nextAttempt: job.attempts + 1 },
                    'Requeueing job for retry'
                );
                job.attempts--; // Reset for requeue
                this.queue.push(job);
            } else {
                this.fastify.log.error(
                    { jobId: job.id },
                    'Job failed permanently after max attempts'
                );
            }
        }
    }

    getQueueSize(): number {
        return this.queue.length;
    }

    getActiveJobsCount(): number {
        return this.activeJobs;
    }
}
