import type { VulnerabilityWithInstances } from "../../vulnerabilities-unified/types";
import type { AiTaskType } from "./ai-task-type";

export type AiTaskStatus = "queued" | "processing" | "validated" | "persisted" | "failed";

export interface VulnerabilityExplanationInput {
  vulnerability: VulnerabilityWithInstances;
}

export interface RiskPrioritizationInput {
  vulnerability: VulnerabilityWithInstances;
  deterministicSignals: Record<string, unknown>;
}

export interface RemediationSuggestionInput {
  vulnerability: VulnerabilityWithInstances;
}

export interface ExecutiveSummaryInput {
  periodStart: string;
  periodEnd: string;
  aggregateMetrics: Record<string, unknown>;
}

export interface AiTask<TInput = unknown> {
  id: string;
  workspaceId: string;
  vulnerabilityId?: string;
  type: AiTaskType;
  input: TInput;
  promptVersion: string;
  createdAt: string;
  requestedBy?: string;
  correlationId?: string;
  regenerate?: boolean;
}
