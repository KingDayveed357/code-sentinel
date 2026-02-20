import { z } from "zod";
import {
  TITLE_MAX_WORDS,
  TITLE_MIN_WORDS,
  validateTitleSanity,
} from "./title-sanity";

const titleWordCount = (value: string): number => {
  return value
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
};

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
  .refine((value) => titleWordCount(value) >= TITLE_MIN_WORDS, {
    message: `Title must contain at least ${TITLE_MIN_WORDS} words`,
  })
  .refine((value) => titleWordCount(value) <= TITLE_MAX_WORDS, {
    message: `Title must contain at most ${TITLE_MAX_WORDS} words`,
  })
  .refine(
    (value) => /^[a-zA-Z0-9][a-zA-Z0-9\s'&():\-.,/]+$/.test(value),
    {
      message: "Title must be human-readable plain English",
    }
  )
  .refine((value) => {
    const sanity = validateTitleSanity(value);
    if (!sanity.valid) {
      return false;
    }
    return isLikelyTitleCase(value);
  }, {
    message: "Title failed sanity checks",
  });

export const vulnerabilityExplanationSchema = z.object({
  refined_title: refinedTitleSchema,
  root_cause_summary: z.string().trim().min(1),
  remediation_step: z.string().trim().min(1),
}).strict();

export const vulnerabilityExplanationResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["refined_title", "root_cause_summary", "remediation_step"],
  properties: {
    refined_title: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      description:
        "3 to 12 words, title case, concise vulnerability title without metadata labels.",
    },
    root_cause_summary: {
      type: "string",
      minLength: 1,
      description: "One concise sentence explaining why the risk exists.",
    },
    remediation_step: {
      type: "string",
      minLength: 1,
      description: "One actionable remediation sentence.",
    },
  },
} as const;

export type VulnerabilityExplanationPayload = z.infer<
  typeof vulnerabilityExplanationSchema
>;
