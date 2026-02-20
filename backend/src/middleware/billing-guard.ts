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

    const { type, billing_status, plan } = request.workspace;

    // Personal workspaces and Free plans are always considered "active" (functional)
    // Team/Dev workspaces MUST be active to perform operations
    if (type === 'personal' || plan === 'Free') {
        return;
    }

    if (billing_status !== 'active') {
        // Whitelist specific routes if needed (e.g. fetching workspace details, billing routes)
        // For now, we block everything else
        request.log.warn({ 
            workspaceId: request.workspace.id, 
            status: billing_status,
            path: request.url
        }, "Access denied: Inactive workspace");
        
        throw request.server.httpErrors.paymentRequired(
            `Access restricted. Workspace status is ${billing_status}. Please update your billing information.`
        );
    }
}
