// src/modules/scans/schemas.ts
import { z } from 'zod';

export const startScanSchema = z.object({
    branch: z.string().optional().default('main'),
    scan_type: z.enum(['quick', 'full']).optional().default('full'), // ✅ FIX: Removed 'custom' - only quick/full supported
});

export const scanHistorySchema = z.object({
    page: z.string().transform(v => parseInt(v, 10)).pipe(z.number().int().positive()).optional().default('1'),
    limit: z.string().transform(v => parseInt(v, 10)).pipe(z.number().int().positive().max(100)).optional().default('20'),
});

export const scanIdSchema = z.object({
    scanId: z.string().uuid(),
});

export const repoIdSchema = z.object({
    repoId: z.string().uuid(),
});

export type StartScanInput = z.infer<typeof startScanSchema>;
export type ScanHistoryInput = z.infer<typeof scanHistorySchema>;