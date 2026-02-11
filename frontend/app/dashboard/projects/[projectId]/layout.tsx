import { Breadcrumbs } from "@/components/dashboard/project/project-breadcrumbs";

export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ projectId: string }>;
  children: React.ReactNode;
}) {
  const { projectId } = await params;

  return (
    <div className="flex flex-col h-full">
      <Breadcrumbs  />
      {children}
    </div>
  );
}