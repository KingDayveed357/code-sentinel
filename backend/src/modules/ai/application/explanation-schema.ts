import { z } from "zod";

const titleWordCount = (value: string): number => {
  return value
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
};

const NOISE_TOKEN_REGEX =
  /\b(CKV(?:_[A-Z0-9_]+)?|CWE-\d+|DOCKER|IAC|SAST|SCA|SECRETS?|CONTAINER|LOW|MEDIUM|HIGH|CRITICAL|INFO|SEVERITY)\b/i;
const METADATA_LEAK_REGEX = /\b(admin assets?|asset groups?|generic assets?)\b/i;

const CONNECTOR_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
  "with",
]);

const isLikelyTitleCase = (value: string): boolean => {
  const words = value.split(/\s+/).filter(Boolean);
  return words.every((rawWord, index) => {
    const word = rawWord.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
    if (!word) {
      return true;
    }
    if (/^[A-Z0-9]+$/.test(word) && word.length > 1) {
      return true;
    }

    const firstLetter = word.charAt(0);
    const isConnector = CONNECTOR_WORDS.has(word.toLowerCase());
    if (index !== 0 && isConnector) {
      return true;
    }

    return firstLetter === firstLetter.toUpperCase();
  });
};

export const refinedTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((value) => titleWordCount(value) >= 4, {
    message: "Title must contain at least 4 words",
  })
  .refine((value) => titleWordCount(value) <= 9, {
    message: "Title must contain fewer than 10 words",
  })
  .refine(
    (value) => /^[a-zA-Z0-9][a-zA-Z0-9\s'&():\-.,/]+$/.test(value),
    {
      message: "Title must be human-readable plain English",
    }
  )
  .refine((value) => !NOISE_TOKEN_REGEX.test(value), {
    message: "Title must not include scanner or severity noise",
  })
  .refine((value) => !METADATA_LEAK_REGEX.test(value), {
    message: "Title must not include metadata labels",
  })
  .refine((value) => !/\b\d+\b/.test(value), {
    message: "Title must not include numeric suffixes",
  })
  .refine((value) => isLikelyTitleCase(value), {
    message: "Title must use Title Case",
  });

export const vulnerabilityExplanationSchema = z.object({
  refined_title: refinedTitleSchema,
  root_cause_summary: z.string().trim().min(1),
  remediation_step: z.string().trim().min(1),
});

export type VulnerabilityExplanationPayload = z.infer<
  typeof vulnerabilityExplanationSchema
>;
