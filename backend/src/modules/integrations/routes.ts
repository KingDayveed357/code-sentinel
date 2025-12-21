// src/modules/integrations/routes.ts
import type { FastifyInstance } from "fastify";
import * as controller from "./controller";
import { verifyAuth, loadProfile } from "../../middleware/auth";
import { requireAuth, requireProfile } from "../../middleware/gatekeepers";

export default async function integrationsRoutes(fastify: FastifyInstance) {
    // Get all integrations
    fastify.get(
        "/",
        {
            preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile],
        },
        async (req, reply) => controller.getIntegrationsController(fastify, req, reply)
    );

    // Disconnect integration
    fastify.post(
        "/:provider/disconnect",
        {
            preHandler: [verifyAuth, loadProfile, requireAuth, requireProfile],
        },
        async (req, reply) => controller.disconnectIntegrationController(fastify, req, reply)
    );
}