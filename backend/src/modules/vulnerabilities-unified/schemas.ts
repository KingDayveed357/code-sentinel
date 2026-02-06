// src/modules/vulnerabilities-unified/schemas.ts
// Zod validation schemas for unified vulnerabilities API

// import { z } from 'zod';

// // Query parameters for listing vulnerabilities
// export const vulnerabilityListSchema = z.object({
//   severity: z
//     .string()
//     .optional()
//     .transform((val) => val?.split(','))
//     .pipe(
//       z.array(z.enum(['critical', 'high', 'medium', 'low', 'info'])).optional()
//     ),
//   status: z
//     .enum(['open', 'in_review', 'accepted', 'false_positive', 'wont_fix', 'fixed', 'ignored'])
//     .optional(),
//   search: z.string().optional(),
//   scanner_type: z.enum(['sast', 'sca', 'secrets', 'iac', 'container']).optional(),
//   assigned_to: z.string().uuid().optional(),
//   page: z
//     .string()
//     .transform((v) => parseInt(v, 10))
//     .pipe(z.number().int().positive())
//     .optional()
//     .default(1),
//   limit: z
//     .string()
//     .transform((v) => parseInt(v, 10))
//     .pipe(z.number().int().positive().max(100))
//     .optional()
//     .default(15), 
//   sort: z.enum(['severity', 'recent', 'oldest', 'confidence']).optional().default('severity'),
// });

// // Path parameters for vulnerability detail
// export const vulnerabilityIdSchema = z.object({
//   vulnId: z.string().uuid(),
// });

// // Query parameters for vulnerability detail
// export const vulnerabilityDetailQuerySchema = z.object({
//   include: z
//     .string()
//     .optional()
//     .transform((val) => val?.split(','))
//     .pipe(
//       z.array(z.enum(['instances', 'ai_explanation', 'risk_context', 'related_issues'])).optional()
//     ),
// });

// // Body for updating vulnerability status
// export const updateVulnerabilityStatusSchema = z.object({
//   status: z.enum([
//     'open',
//     'in_review',
//     'accepted',
//     'false_positive',
//     'wont_fix',
//     'fixed',
//     'ignored',
//   ]),
//   note: z.string().optional(),
// });

// // Body for assigning vulnerability
// export const assignVulnerabilitySchema = z.object({
//   assigned_to: z.string().uuid().nullable(),
// });

// // Body for generating AI explanation
// export const generateAIExplanationSchema = z.object({
//   regenerate: z.boolean().optional().default(false),
// });

// // Workspace ID parameter
// export const workspaceIdSchema = z.object({
//   workspaceId: z.string().uuid(),
// });
