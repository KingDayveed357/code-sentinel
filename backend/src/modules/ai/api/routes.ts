import type { FastifyInstance } from "fastify";
import { verifyAuth, loadProfile } from "../../../middleware/auth";
import { resolveWorkspace } from "../../../middleware/workspace";
import {
  requireAuth,
  requireProfile,
  requireWorkspace,
} from "../../../middleware/gatekeepers";
import { requireActiveWorkspace } from "../../../middleware/billing-guard";
import { AiController } from "./controller";

export async function registerAiRoutes(fastify: FastifyInstance): Promise<void> {
  const controller = new AiController(fastify);

  fastify.addHook("preHandler", verifyAuth);
  fastify.addHook("preHandler", loadProfile);
  fastify.addHook("preHandler", requireAuth);
  fastify.addHook("preHandler", requireProfile);
  fastify.addHook("preHandler", resolveWorkspace);
  fastify.addHook("preHandler", requireWorkspace);
  fastify.addHook("preHandler", requireActiveWorkspace);

  fastify.post(
    "/vulnerability/:id/explanation",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", format: "uuid" },
          },
        },
        body: {
          type: "object",
          properties: {
            regenerate: { type: "boolean", default: false },
            promptVersion: { type: "string", default: "v1" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const workspaceId = request.workspace?.id;

      if (!workspaceId) {
        const httpErrors = (fastify as any).httpErrors;
        throw httpErrors
          ? httpErrors.badRequest("Workspace context required")
          : new Error("Workspace context required");
      }

      const body = (request.body || {}) as {
        regenerate?: boolean;
        promptVersion?: string;
      };
      const result = await controller.generateVulnerabilityExplanation(
        workspaceId,
        id,
        body,
        {
          userId: request.supabaseUser!.id,
          role: request.workspaceRole!,
        }
      );

      if (result.state === "queued" || result.state === "processing") {
        reply.status(202);
      }
      return reply.send(result);
    }
  );
}
