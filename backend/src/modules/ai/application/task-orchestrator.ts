import type { AiTask } from "../domain";
import type { AiQueueInterface, AiQueueJob } from "../infrastructure";

export class TaskOrchestrator {
  constructor(private readonly queue: AiQueueInterface) {}

  async enqueue(task: AiTask): Promise<{ jobId: string }> {
    const job: AiQueueJob = {
      id: task.id,
      task,
      enqueuedAt: new Date().toISOString(),
    };

    const jobId = await this.queue.enqueue(job);
    return { jobId };
  }

  async registerWorker(handler: (job: AiQueueJob) => Promise<void>): Promise<void> {
    await this.queue.registerWorker(handler);
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
