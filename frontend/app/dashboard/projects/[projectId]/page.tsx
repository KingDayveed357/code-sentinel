// frontend/app/dashboard/projects/[projectId]/page.tsx
import { ProjectDetail } from "@/components/dashboard/project/project-detail"

export default async function RepositoryDetailPage({ 
  params 
}: { 
  params: Promise<{ projectId: string }> 
}) {
  const { projectId } = await params
  return <ProjectDetail projectId={projectId} />
}