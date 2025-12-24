// frontend/components/dashboard/layout/dashboard-shell.tsx
"use client";

import type React from "react";
import { useState, useMemo } from "react";
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
  FolderGit2
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { AIAssistant } from "@/components/dashboard/ai-assistant";
import { useAuth } from "@/hooks/use-auth";
import { UserNav } from "@/components/dashboard/sidebar/user-nav";
import { WorkspaceSwitcher } from "./workspace-switcher";

const navigation = [
  { name: "Overview", href: "/dashboard", icon: Home },
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
  const { canAccessTeam, profileLoading } = useAuth();

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
          flex flex-col // Ensure flex column for proper spacing
          transform transition-all duration-300 ease-in-out // Smoother transition
          md:relative md:translate-x-0
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
          ${desktopSidebarCollapsed ? "md:w-20" : "md:w-64"} // Slightly wider expanded state for better readability
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
                  <item.icon className="h-5 w-5" />
                  {!desktopSidebarCollapsed && <span>{item.name}</span>}
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
        <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6">
          {children}
        </main>
      </div>


      <AIAssistant />
    </div>
  );
}
