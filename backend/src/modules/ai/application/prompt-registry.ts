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
        "You are a Senior Security Communications Engineer. Respond with valid JSON only, no markdown and no extra prose.",
      template: `Task: Transform raw security scanner metadata into a human-readable, high-impact vulnerability title and concise fix guidance.

Required JSON shape:
{
  "refined_title": "string",
  "root_cause_summary": "string",
  "remediation_step": "string"
}

Rules:
- refined_title must be a concise noun phrase (not a sentence) and must start with the specific flaw or risk.
- refined_title must be Title Case and 3 to 12 words.
- refined_title must remove scanner noise, IDs, tool tags, and severity labels.
- refined_title must not include category labels such as "Admin Assets" (or hyphen/underscore variants).
- refined_title must not include instructional phrases like "you should", "must", "return only", or similar directives.
- refined_title must not include fragmented words such as "Echo Ing".
- root_cause_summary must be one sentence, concise, and explain why this exists.
- remediation_step must be one sentence, actionable, and specific.
- Audience is founders and junior developers. Answer: what is the risk?
- Do not include extra keys.

Vulnerability context:
- Scanner Metadata: {{scannerMetadata}}
- Title: {{title}}
- Severity: {{severity}}
- CWE: {{cwe}}
- Rule ID: {{ruleId}}
- Scanner: {{scanner}}
- Description: {{description}}
- File: {{filePath}}
- Evidence: {{evidence}}

Return ONLY a JSON object.`,
    });
  }
}
