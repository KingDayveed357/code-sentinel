// src/plugins/supabase.ts
import fastifyPlugin from "fastify-plugin";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

export default fastifyPlugin(async (fastify) => {
    const supabase = createClient(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        {
            auth: { persistSession: false },
            global: {
                headers: {
                    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
                },
            },
        }
    );

    fastify.decorate("supabase", supabase);
    fastify.log.info("Supabase service_role client initialized");
});
