// src/modules/workspaces/controller.ts
import type { FastifyRequest, FastifyReply } from "fastify";
import type { FastifyInstance } from "fastify";
import * as service from "./service";

/**
 * GET /api/workspaces
 * List all workspaces accessible to the current user
 */
export async function listWorkspacesController(
    request: FastifyRequest,
    reply: FastifyReply
) {
    const userId = request.profile!.id;
    const workspaces = await service.getUserWorkspaces(request.server, userId);

    return reply.send({
        workspaces,
    });
}


export async function bootstrapWorkspaceController(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = request.profile!.id;
  const userName = request.profile!.full_name || 'My';
  const userPlan = request.profile!.plan || 'Free';

  fastify.log.info({ userId }, 'Workspace bootstrap requested');

  try {
    // Step 1: Try to find existing personal workspace
    const { data: existing, error: fetchError } = await fastify.supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', userId)
      .eq('type', 'personal')
      .maybeSingle(); // Use maybeSingle to avoid error on 0 rows

    // Found existing workspace
    if (existing) {
      fastify.log.info(
        { userId, workspaceId: existing.id },
        'Personal workspace already exists'
      );
      return reply.send({
        workspace: existing,
        created: false,
      });
    }

    // Check for unexpected fetch errors
    if (fetchError) {
      fastify.log.error({ fetchError, userId }, 'Unexpected error fetching workspace');
      throw fastify.httpErrors.internalServerError('Failed to query workspace');
    }

    // Step 2: No workspace exists - create one
    const workspaceSlug = `user-${userId}`;
    const workspaceName = `${userName}'s Workspace`;

    const { data: newWorkspace, error: createError } = await fastify.supabase
      .from('workspaces')
      .insert({
        id: userId, // Use userId as workspace ID for personal workspace
        name: workspaceName,
        slug: workspaceSlug,
        type: 'personal',
        owner_id: userId,
        team_id: null,
        plan: userPlan,
        settings: {},
      })
      .select()
      .single();

    // Handle creation errors
    if (createError) {
      // CRITICAL: Race condition - another request created it
      if (createError.code === '23505') { // Duplicate key
        fastify.log.warn({ userId }, 'Race condition: workspace created concurrently');

        // Retry fetch
        const { data: retryWorkspace, error: retryError } = await fastify.supabase
          .from('workspaces')
          .select('*')
          .eq('owner_id', userId)
          .eq('type', 'personal')
          .single();

        if (retryError || !retryWorkspace) {
          fastify.log.error({ retryError, userId }, 'Failed to fetch after race condition');
          throw fastify.httpErrors.internalServerError('Workspace creation conflict');
        }

        return reply.send({
          workspace: retryWorkspace,
          created: false, // Another process created it
        });
      }

      // Other creation errors
      fastify.log.error({ createError, userId }, 'Failed to create workspace');
      throw fastify.httpErrors.internalServerError('Failed to create workspace');
    }

    // Success
    fastify.log.info(
      { userId, workspaceId: newWorkspace!.id },
      'Personal workspace created successfully'
    );

    return reply.send({
      workspace: newWorkspace,
      created: true,
    });

  } catch (error) {
    fastify.log.error({ error, userId }, 'Workspace bootstrap failed');
    
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error; // Re-throw HTTP errors
    }
    
    throw fastify.httpErrors.internalServerError('Workspace bootstrap failed');
  }
}
