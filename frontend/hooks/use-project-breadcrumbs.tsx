// hooks/use-project-breadcrumbs.ts
import { useEffect, useState } from 'react';
import { useWorkspace } from '@/hooks/use-workspace';
import { repositoriesApi } from '@/lib/api/repositories';

interface ProjectBreadcrumb {
  id: string;
  name: string;
  loading: boolean;
}

// In-memory cache for project names to avoid redundant API calls
const projectCache = new Map<string, { name: string; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useProjectBreadcrumbs(projectId: string | null) {
  const { workspace } = useWorkspace();
  const [project, setProject] = useState<ProjectBreadcrumb>({
    id: projectId || '',
    name: '',
    loading: true,
  });

  useEffect(() => {
    if (!projectId || !workspace?.id) {
      setProject({ id: '', name: '', loading: false });
      return;
    }

    // Check cache first
    const cached = projectCache.get(projectId);
    const now = Date.now();
    
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      setProject({ id: projectId, name: cached.name, loading: false });
      return;
    }

    // Fetch from API
    let isMounted = true;

    const fetchProject = async () => {
      try {
        const data = await repositoriesApi.getById(workspace.id, projectId);
        
        if (isMounted) {
          // Update cache
          projectCache.set(projectId, { 
            name: data.name, 
            timestamp: now 
          });
          
          setProject({
            id: projectId,
            name: data.name,
            loading: false,
          });
        }
      } catch (error) {
        console.error('Error fetching project for breadcrumbs:', error);
        if (isMounted) {
          setProject({
            id: projectId,
            name: 'Unknown Project',
            loading: false,
          });
        }
      }
    };

    fetchProject();

    return () => {
      isMounted = false;
    };
  }, [projectId, workspace?.id]);

  return project;
}

// Helper to clear cache when needed (e.g., after project updates)
export function clearProjectCache(projectId?: string) {
  if (projectId) {
    projectCache.delete(projectId);
  } else {
    projectCache.clear();
  }
}