
import type { FastifyInstance } from "fastify";
import type { IntegrationProvider, WorkspaceIntegration } from "./types";

export class IntegrationsRepository {
  constructor(private readonly fastify: FastifyInstance) {}

  async findByWorkspaceAndProvider(
    workspaceId: string,
    provider: IntegrationProvider
  ): Promise<WorkspaceIntegration | null> {
    const { data, error } = await this.fastify.supabase
      .from("workspace_integrations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("provider", provider)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }
    return data as WorkspaceIntegration | null;
  }

  async findAllByWorkspace(workspaceId: string): Promise<WorkspaceIntegration[]> {
    const { data, error } = await this.fastify.supabase
      .from("workspace_integrations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }
    return (data as WorkspaceIntegration[]) || [];
  }

  async upsert(data: Partial<WorkspaceIntegration>): Promise<WorkspaceIntegration> {
    const { data: integration, error } = await this.fastify.supabase
      .from("workspace_integrations")
      .upsert(data, {
        onConflict: "workspace_id,provider",
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    return integration as WorkspaceIntegration;
  }

  async disconnect(workspaceId: string, provider: IntegrationProvider): Promise<void> {
    const { error } = await this.fastify.supabase
      .from("workspace_integrations")
      .update({
        connected: false,
        oauth_access_token: null,
        oauth_refresh_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("provider", provider);

    if (error) {
      throw new Error(error.message);
    }
  }
}
