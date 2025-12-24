// lib/api.ts
import { supabase } from "./supabase-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
}

export async function apiFetch(endpoint: string, options: FetchOptions = {}) {
  const { requireAuth = false, headers = {}, body, ...restOptions } = options;

  const fetchHeaders: Record<string, string> = {};

  // Add auth token if required
  if (requireAuth) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("Authentication required");
    }

    fetchHeaders["Authorization"] = `Bearer ${session.access_token}`;
    const activeWorkspaceId = localStorage.getItem('active_workspace_id');
    if (activeWorkspaceId) {
      fetchHeaders['X-Workspace-ID'] = activeWorkspaceId;
    }
  }

  // Add Content-Type if body exists
  if (body) {
    fetchHeaders["Content-Type"] = "application/json";
  }

  // Merge custom headers
  Object.assign(fetchHeaders, headers);

  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...restOptions,
    headers: fetchHeaders,
    body,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      error: "Unknown error",
      statusCode: response.status,
    }));
    throw new Error(error.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}