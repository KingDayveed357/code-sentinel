"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { repositoriesApi } from "@/lib/api/repositories";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, ChevronRight, History } from "lucide-react";

interface ProjectBreadcrumbsProps {
  projectId: string;
}

export function ProjectBreadcrumbs({ projectId }: ProjectBreadcrumbsProps) {
  const pathname = usePathname();
  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Fetch Project Name
  useEffect(() => {
    let isMounted = true;
    async function fetchName() {
      if (!projectId) return;
      try {
        setLoading(true);
        const project = await repositoriesApi.getById(projectId);
        if (isMounted) setProjectName(project.name);
      } catch (e) {
        console.error("Failed to fetch project name", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchName();
    return () => { isMounted = false; };
  }, [projectId]);

  // 2. Smart Breadcrumb Logic
  const generateItems = () => {
    const items = [];
    
    // Root: Dashboard (Icon)
    items.push({ 
      label: <Home className="h-4 w-4" />, 
      href: "/dashboard",
      isIcon: true 
    });

    // Level 2: Projects
    items.push({ label: "Projects", href: "/dashboard/projects" });

    // Level 3: Project Name (Dynamic)
    const projectUrl = `/dashboard/projects/${projectId}`;
    const projectLabel = loading ? (
      <Skeleton className="h-4 w-24 rounded bg-muted/50" />
    ) : (
      <span className="truncate max-w-[150px] inline-block align-bottom">
        {projectName || "Project"}
      </span>
    );
    
    items.push({ label: projectLabel, href: projectUrl });

    // Level 4+: Nested Routes
    if (pathname.includes("/settings")) {
      items.push({ label: "Settings", href: `${projectUrl}/settings` });
    } 
    else if (pathname.includes("/scan-history")) {
      items.push({ label: "Scans", href: `${projectUrl}/scan-history` });
    }
    else if (pathname.includes("/scans/")) {
      items.push({ 
        label: "Scans", 
        href: `${projectUrl}/scan-history` 
      });

    
      const scanIdMatch = pathname.match(/\/scans\/([^/]+)/);
      const scanId = scanIdMatch ? scanIdMatch[1] : null;

      if (scanId) {
        const reportUrl = `${projectUrl}/scans/${scanId}/report`;
        const isVulnerabilityPage = pathname.includes("/vulnerabilities/");
        items.push({ 
          label: "Report", 
          href: reportUrl,
          active: !isVulnerabilityPage
        });
        if (isVulnerabilityPage) {
           items.push({ 
             label: "Details", 
             href: pathname, 
             active: true 
           });
        }
      }
    } else if (pathname.includes("/team")) {
      items.push({ label: "Team", href: `${projectUrl}/team` });
    }
    return items;
  };

  const items = generateItems();

  return (
    <div className="w-full border-b mb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Breadcrumb className="px-4 sm:px-6 py-3">
        <BreadcrumbList>
          {items.map((item, index) => {
            const isLast = index === items.length - 1;
            const isActive = item.active || isLast; 

            return (
              <div key={index} className="flex items-center">
                <BreadcrumbItem>
                  {isActive ? (
                    <BreadcrumbPage className="font-medium text-foreground flex items-center">
                      {item.label}
                    </BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link 
                        href={item.href} 
                        className="text-muted-foreground hover:text-foreground transition-colors flex items-center"
                      >
                        {item.label}
                      </Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && (
                  <BreadcrumbSeparator className="mx-2">
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                  </BreadcrumbSeparator>
                )}
              </div>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}