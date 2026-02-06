// frontend/components/dashboard/layout/dashboard-shell.tsx
"use client";

import type React from "react";
import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Home,
  GitBranch,
  Shield,
  History,
  Settings,
  Users,
  Menu,
  X,
  Plug,
  ChevronLeft,
  FolderGit2,
  AlertCircle,
  Search
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { AIAssistant } from "@/components/dashboard/ai-assistant";
import { useAuth } from "@/hooks/use-auth";
import { UserNav } from "@/components/dashboard/sidebar/user-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { ScanActivityTray } from "@/components/scans/scan-activity-tray";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: Home },
  { name: "Scans", href: "/dashboard/scans", icon: Search, badge: "running_scans" },
  { name: "Vulnerabilities", href: "/dashboard/vulnerabilities", icon: AlertCircle, badge: "critical_high" },
  { name: "Projects", href: "/dashboard/projects", icon: FolderGit2 },
  { name: "Integrations", href: "/dashboard/integrations", icon: Plug },
  { name: "Team", href: "/dashboard/teams", icon: Users },
  // { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const { canAccessTeam, profileLoading, workspaceId } = useAuth();
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({
    running_scans: 0,
    critical_high: 0,
  });

  // Fetch badge counts
  useEffect(() => {
    if (!workspaceId) return;

    const fetchBadgeCounts = async () => {
      try {
        // Fetch running scans count
        const scansRes = await fetch(`/api/workspaces/${workspaceId}/scans/stats`);
        if (scansRes.ok) {
          const scansData = await scansRes.json();
          setBadgeCounts((prev) => ({ ...prev, running_scans: scansData.running || 0 }));
        }

        // Fetch critical/high vulnerabilities count
        const vulnsRes = await fetch(`/api/workspaces/${workspaceId}/vulnerabilities/stats`);
        if (vulnsRes.ok) {
          const vulnsData = await vulnsRes.json();
          const criticalHigh = (vulnsData.by_severity?.critical || 0) + (vulnsData.by_severity?.high || 0);
          setBadgeCounts((prev) => ({ ...prev, critical_high: criticalHigh }));
        }
      } catch (error) {
        console.error("Failed to fetch badge counts:", error);
      }
    };

    fetchBadgeCounts();
    // Refresh every 30 seconds
    const interval = setInterval(fetchBadgeCounts, 30000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  const filteredNavigation = useMemo(() => {
    return navigation
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-card border-r border-border
          flex flex-col 
          transform transition-all duration-300 ease-in-out 
          md:relative md:translate-x-0
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
          ${desktopSidebarCollapsed ? "md:w-20" : "md:w-64"} 
          w-64
        `}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div
            className={`flex h-16 items-center justify-between px-6 border-b border-border transition-all duration-200 ${
              desktopSidebarCollapsed ? "md:px-3" : ""
            }`}
          >
            {!desktopSidebarCollapsed && (
              <Link
                href="/dashboard"
                className="flex items-center gap-2 flex-1"
              >
                <Shield className="h-6 w-6 text-primary flex-shrink-0" />
                <span className="text-lg font-bold">CodeSentinel</span>
              </Link>
            )}
            {desktopSidebarCollapsed && (
              <Link
                href="/dashboard"
                className="flex items-center justify-center w-full"
              >
                <Shield className="h-6 w-6 text-primary" />
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
            {filteredNavigation.map((item) => {
              const isActive = pathname === item.href;
              const badgeCount = item.badge ? badgeCounts[item.badge] : 0;
              const showBadge = badgeCount > 0;
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  title={desktopSidebarCollapsed ? item.name : undefined}
                  className={`
                    flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg
                    transition-all duration-200
                    ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }
                    ${
                      desktopSidebarCollapsed ? "md:justify-center md:px-2" : ""
                    }
                  `}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!desktopSidebarCollapsed && (
                    <>
                      <span className="flex-1">{item.name}</span>
                      {showBadge && (
                        <span className={`
                          inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full
                          ${isActive 
                            ? "bg-primary-foreground text-primary" 
                            : "bg-primary text-primary-foreground"
                          }
                        `}>
                          {badgeCount}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User menu */}
        </div>
        <div className="shrink-0">
          <UserNav isCollapsed={desktopSidebarCollapsed} />
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 items-center justify-between border-b border-border px-4 md:px-6 bg-card gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="hidden md:flex"
              onClick={() =>
                setDesktopSidebarCollapsed(!desktopSidebarCollapsed)
              }
              title={
                desktopSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
            >
              <ChevronLeft
                className={`h-5 w-5 transition-transform ${
                  desktopSidebarCollapsed ? "rotate-180" : ""
                }`}
              />
            </Button>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <WorkspaceSwitcher />
            <ThemeToggle />
            <Button
              variant="outline"
              size="sm"
              asChild
              className="hidden sm:inline-flex bg-transparent"
            >
              <Link href="/docs">Docs</Link>
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="p-4 md:p-6 space-y-6">
          <ScanActivityTray />
            {children}
          </div>
        </main>
      </div>

  
      {/* <AIAssistant /> */}
    </div>
  );
}
