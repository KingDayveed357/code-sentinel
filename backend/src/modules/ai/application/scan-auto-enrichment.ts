import { randomUUID } from "crypto";
import type { FastifyInstance } from "fastify";
import { AiTaskType, type AiTask } from "../domain";
import { getAiGateway } from "./ai-gateway";

export interface AutoEnqueueResult {
  queued: number;
  processing: number;
  ready: number;
  failed: number;
}

export async function enqueueVulnerabilityExplanationsForScan(
  fastify: FastifyInstance,
  workspaceId: string,
  scanId: string
): Promise<AutoEnqueueResult> {
  const { data, error } = await fastify.supabase
    .from("vulnerability_instances")
    .select(
      `
      vulnerability_id,
      vulnerabilities_unified!inner(*)
    `
    )
    .eq("scan_id", scanId);

  if (error) {
    throw new Error(`Failed to fetch scan vulnerabilities for AI enrichment: ${error.message}`);
  }

  const byId = new Map<string, any>();
  (data || []).forEach((row: any) => {
    const vulnerability = row.vulnerabilities_unified;
    if (vulnerability?.id) {
      byId.set(vulnerability.id, vulnerability);
    }
  });

  const gateway = getAiGateway(fastify);
  const result: AutoEnqueueResult = {
    queued: 0,
    processing: 0,
    ready: 0,
    failed: 0,
  };

  const operations = Array.from(byId.values()).map(async (vulnerability) => {
    const task: AiTask = {
      id: randomUUID(),
      workspaceId,
      vulnerabilityId: vulnerability.id,
      type: AiTaskType.VulnerabilityExplanation,
      promptVersion: "v1",
      createdAt: new Date().toISOString(),
      input: { vulnerability },
      regenerate: false,
    };

    const lifecycle = await gateway.runTask(task);
    if (lifecycle.status === "queued") {
      result.queued += 1;
      return;
    }
    if (lifecycle.status === "processing" || lifecycle.status === "validated") {
      result.processing += 1;
      return;
    }
    if (lifecycle.status === "persisted") {
      result.ready += 1;
      return;
    }
    result.failed += 1;
  });

  await Promise.allSettled(operations);
  return result;
}
