import type { AiTask } from "../../domain";

export interface AiQueueJob {
  id: string;
  task: AiTask;
  enqueuedAt: string;
}

export interface AiQueueInterface {
  enqueue(job: AiQueueJob): Promise<string>;
  registerWorker(handler: (job: AiQueueJob) => Promise<void>): Promise<void>;
  getMetrics?(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }>;
  close(): Promise<void>;
}
