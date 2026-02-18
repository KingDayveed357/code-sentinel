import { z } from "zod";

const titleWordCount = (value: string): number => {
  return value
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
};

export const vulnerabilityTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => titleWordCount(value) >= 5 && titleWordCount(value) <= 10, {
    message: "Title must contain 5-10 words",
  })
  .refine(
    (value) => /^[a-zA-Z0-9][a-zA-Z0-9\s'&():\-.,/]+$/.test(value),
    {
      message: "Title must be human-readable plain English",
    }
  );

export const vulnerabilityExplanationSchema = z.object({
  vulnerabilityTitle: vulnerabilityTitleSchema,
  summary: z.string().trim().min(1),
  impact: z.string().trim().min(1),
  exploitScenario: z.string().trim().min(1),
  remediationOverview: z.string().trim().min(1),
  stepByStepFix: z.array(z.string().trim().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  citations: z.array(z.string()),
});

export type VulnerabilityExplanationPayload = z.infer<
  typeof vulnerabilityExplanationSchema
>;
