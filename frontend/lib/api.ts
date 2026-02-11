// lib/api.ts
import { supabase } from "./supabase-client";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

interface FetchOptions extends RequestInit {
  requireAuth?: boolean;
  params?: Record<string, string | number | boolean | null | undefined>;
}

/**
 * Get active workspace ID with priority:
 * 1. URL query parameter (highest - current page context)
 * 2. localStorage (fallback - last active)
 */
function getActiveWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  const id = localStorage.getItem('active_workspace_id');
  return (id && id !== 'undefined' && id !== 'null') ? id : null;
}

export async function apiFetch(endpoint: string, options: FetchOptions = {}) {
  const { requireAuth = false, params = {}, headers = {}, body, ...restOptions } = options;

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
    
    // Add workspace context
    const activeWorkspaceId = getActiveWorkspaceId();
    if (activeWorkspaceId) {
      // Send workspace in header for backend
      fetchHeaders['X-Workspace-ID'] = activeWorkspaceId;
      
      // Also add as query param if not already present
      if (!params.workspace) {
        params.workspace = activeWorkspaceId;
      }
    }
  }

  // Add Content-Type if body exists
  if (body) {
    fetchHeaders["Content-Type"] = "application/json";
  }

  // Merge custom headers
  Object.assign(fetchHeaders, headers);

  // Build URL with query parameters
  let url = `${API_BASE_URL}${endpoint}`;
  
  // Add query params if any
  if (Object.keys(params).length > 0) {
    const urlObj = new URL(url);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        urlObj.searchParams.append(key, String(value));
      }
    });
    url = urlObj.toString();
  }

  // Log requests in development
  if (process.env.NODE_ENV === 'development') {
    console.log('🌐 API Request:', {
      method: restOptions.method || 'GET',
      endpoint,
      workspace: params.workspace || fetchHeaders['X-Workspace-ID'],
    });
  }

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