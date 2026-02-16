import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Middleware: Ensure workspace is active (billing status)
 * Blocks requests to pending/expired workspaces except for whitelisted routes.
 */
export async function requireActiveWorkspace(
    request: FastifyRequest,
    reply: FastifyReply
) {
    if (!request.workspace) {
        // No workspace context, skip check (should be handled by other guards)
        return;
    }

    const { type, billing_status } = request.workspace;

    // Free workspaces are always considered "active" for now
    if (type === 'personal' || request.workspace.plan === 'free') {
        return;
    }

    if (billing_status !== 'active') {
        // Whitelist specific routes if needed (e.g. fetching workspace details, billing routes)
        // For now, we block everything else
        request.log.warn({ workspaceId: request.workspace.id, status: billing_status }, "Access denied: Inactive workspace");
        
        throw request.server.httpErrors.paymentRequired(
            `Workspace is ${billing_status}. Please update your billing information/subscription.`
        );
    }
}
