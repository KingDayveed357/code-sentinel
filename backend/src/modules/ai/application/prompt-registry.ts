import { AiTaskType } from "../domain";

export interface PromptTemplate {
  taskType: AiTaskType;
  version: string;
  systemPrompt: string;
  template: string;
}

export class PromptRegistry {
  private readonly registry = new Map<string, PromptTemplate>();

  constructor() {
    this.seedDefaults();
  }

  register(prompt: PromptTemplate): void {
    const key = this.getKey(prompt.taskType, prompt.version);
    this.registry.set(key, prompt);
  }

  get(taskType: AiTaskType, version: string): PromptTemplate | undefined {
    return this.registry.get(this.getKey(taskType, version));
  }

  render(taskType: AiTaskType, version: string, variables: Record<string, string>): PromptTemplate {
    const template = this.get(taskType, version);
    if (!template) {
      throw new Error(`Prompt not found for ${taskType}:${version}`);
    }

    let rendered = template.template;
    Object.entries(variables).forEach(([key, value]) => {
      rendered = rendered.split(`{{${key}}}`).join(value);
    });

    return {
      ...template,
      template: rendered,
    };
  }

  private getKey(taskType: AiTaskType, version: string): string {
    return `${taskType}:${version}`;
  }

  private seedDefaults(): void {
    this.register({
      taskType: AiTaskType.VulnerabilityExplanation,
      version: "v1",
      systemPrompt:
        "You are a security analysis assistant. Return JSON only. Do not include markdown.",
      template: `Generate a structured vulnerability explanation as strict JSON.

Required JSON shape:
{
  "vulnerabilityTitle": "string (5-10 words, plain English)",
  "summary": "string",
  "impact": "string",
  "exploitScenario": "string",
  "remediationOverview": "string",
  "stepByStepFix": ["string"],
  "confidence": 0.0,
  "citations": ["string"]
}

Rules:
- vulnerabilityTitle must be concise, human-readable, and specific.
- Strings must be concise and non-empty.
- stepByStepFix must be actionable for developers and include concrete steps.
- confidence must be between 0 and 1.
- citations may be empty but must be an array.
- Do not include extra keys.

Vulnerability context:
- Title: {{title}}
- Severity: {{severity}}
- CWE: {{cwe}}
- Rule ID: {{ruleId}}
- Scanner: {{scanner}}
- Description: {{description}}
- File: {{filePath}}
- Evidence: {{evidence}}`,
    });
  }
}
