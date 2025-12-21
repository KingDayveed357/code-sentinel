// src/modules/github-issues/controller.ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { closeGitHubIssue } from './service';

const scanIdSchema = z.object({
  scanId: z.string().uuid('Invalid scan ID'),
});

const issueIdSchema = z.object({
  issueId: z.string().uuid('Invalid issue ID'),
});

/**
 * GET /api/github-issues/scan/:scanId
 * Get all GitHub issues for a specific scan
 */
export async function getIssuesForScanController(
  request: FastifyRequest<{ Params: any }>,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const { scanId } = scanIdSchema.parse(request.params);

  try {
    // Verify user owns the scan
    const { data: scan, error: scanError } = await request.server.supabase
      .from('scans')
      .select('id, user_id')
      .eq('id', scanId)
      .eq('user_id', userId)
      .single();

    if (scanError || !scan) {
      throw request.server.httpErrors.notFound('Scan not found');
    }

    // Fetch all issues for this scan
    const { data: issues, error: issuesError } = await request.server.supabase
      .from('github_issues')
      .select('*')
      .eq('scan_id', scanId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (issuesError) {
      request.server.log.error({ issuesError, scanId }, 'Failed to fetch GitHub issues');
      throw request.server.httpErrors.internalServerError('Failed to fetch issues');
    }

    return reply.send({
      issues: issues || [],
      total: issues?.length || 0,
    });
  } catch (err: any) {
    if (err.statusCode) {
      throw err;
    }
    request.server.log.error({ err, scanId }, 'Error fetching GitHub issues');
    throw request.server.httpErrors.internalServerError('Failed to fetch issues');
  }
}

/**
 * POST /api/github-issues/:issueId/close
 * Close a GitHub issue
 */
export async function closeIssueController(
  request: FastifyRequest<{ Params: any }>,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const { issueId } = issueIdSchema.parse(request.params);

  try {
    const result = await closeGitHubIssue(request.server, userId, issueId);

    if (!result.success) {
      throw request.server.httpErrors.internalServerError(
        result.error || 'Failed to close issue'
      );
    }

    return reply.send({ success: true });
  } catch (err: any) {
    if (err.statusCode) {
      throw err;
    }
    request.server.log.error({ err, issueId }, 'Error closing GitHub issue');
    throw request.server.httpErrors.internalServerError('Failed to close issue');
  }
}