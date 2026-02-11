
import type { FastifyInstance } from "fastify";
import type { ScanFilters, ScanWithRepository, ScanDetail } from "./types";

export class ScansRepository {
  constructor(private readonly fastify: FastifyInstance) {}

  async findById(scanId: string, workspaceId: string): Promise<any | null> {
    const { data: scan, error } = await this.fastify.supabase
      .from("scans")
      .select(
        `
        *,
        repositories:repository_id (
          id, name, full_name, url
        )
      `
      )
      .eq("id", scanId)
      .eq("workspace_id", workspaceId)
      .single();

    if (error) return null;
    return scan;
  }

  async findAll(workspaceId: string, filters: ScanFilters): Promise<{ data: any[]; count: number }> {
    const offset = (filters.page - 1) * filters.limit;

    let query = this.fastify.supabase
      .from("scans")
      .select(
        `
        *,
        repositories:repository_id (
          id, name, full_name, url
        )
      `,
        { count: "exact" }
      )
      .eq("workspace_id", workspaceId);

    // Filters
    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.repository_id) {
      query = query.eq("repository_id", filters.repository_id);
    }

    if (filters.severity) {
      switch (filters.severity) {
        case "critical":
          query = query.gt("critical_count", 0);
          break;
        case "high":
          query = query.gt("high_count", 0);
          break;
        case "medium":
          query = query.gt("medium_count", 0);
          break;
        case "low":
          query = query.gt("low_count", 0);
          break;
      }
    }

    // Sorting
    switch (filters.sort) {
      case "recent":
        query = query.order("created_at", { ascending: false });
        break;
      case "oldest":
        query = query.order("created_at", { ascending: true });
        break;
      case "duration":
        query = query.order("duration_seconds", { ascending: false, nullsFirst: false });
        break;
      default:
        query = query.order("created_at", { ascending: false });
    }

    // Pagination
    query = query.range(offset, offset + filters.limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return { data: data || [], count: count || 0 };
  }

  async create(scanData: any): Promise<any> {
    const { data: scan, error } = await this.fastify.supabase
      .from("scans")
      .insert(scanData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create scan: ${error.message}`);
    }
    return scan;
  }

  async updateStatus(scanId: string, workspaceId: string, status: string, additionalData: any = {}): Promise<void> {
    const { error } = await this.fastify.supabase
      .from("scans")
      .update({ status, ...additionalData })
      .eq("id", scanId)
      .eq("workspace_id", workspaceId);

    if (error) {
      throw new Error(`Failed to update scan status: ${error.message}`);
    }
  }

  async countRunningScans(workspaceId: string): Promise<number> {
    const { count, error } = await this.fastify.supabase
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "running", "normalizing", "ai_enriching"]);

    if (error) {
      // If error (e.g. no rows found if count works differently), return 0 or throw
      // Supabase count returns null on error usually
      throw new Error(error.message);
    }
    return count || 0;
  }

  async getScanInstances(scanId: string): Promise<any[]> {
    const { data: instances, error } = await this.fastify.supabase
      .from("vulnerability_instances")
      .select(`
        id, vulnerability_id, file_path, line_start, package_name, package_version,
        vulnerabilities_unified!inner (
          id, title, description, severity, file_path, line_start, cwe,
          confidence, status, scanner_type
        )
      `)
      .eq("scan_id", scanId);

    if (error) throw new Error(error.message);
    return instances || [];
  }

  async getScanLogs(scanId: string): Promise<any[]> {
    const { data: logs, error } = await this.fastify.supabase
      .from("scan_logs")
      .select("*")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);
   return (logs || []).map(log => ({
    ...log,
    created_at: new Date(log.created_at).toISOString(),
  }));
  }
}
