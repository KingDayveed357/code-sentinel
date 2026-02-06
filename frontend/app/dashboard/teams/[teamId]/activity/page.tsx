// app/dashboard/teams/[teamId]/activity/page.tsx - Activity Log

"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Loader2, AlertCircle, ArrowLeft, Activity as ActivityIcon } from "lucide-react";
import Link from "next/link";
import { teamsApi, type TeamActivity } from "@/lib/api/teams";
import { toast } from "sonner";



export default function TeamActivityPage({ params }: {params: Promise<{ teamId: string }>}) {
  
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<TeamActivity[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  const { teamId } = use(params);

  useEffect(() => {
    if (teamId) {
      loadActivities();
    }
  }, [teamId, pagination.page]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      const data = await teamsApi.getActivity(teamId, { page: pagination.page });
      setActivities(data.activities);
      setPagination(data.pagination);
    } catch (error: any) {
      toast.error(
        <div>
          <strong>Failed to Load Activity</strong>
          <p>{error.message}</p>
        </div>
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActionBadge = (action: string) => {
    if (action.includes("created") || action.includes("invited") || action.includes("accepted")) {
      return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400";
    }
    if (action.includes("removed") || action.includes("deleted")) {
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400";
    }
    if (action.includes("updated") || action.includes("changed") || action.includes("renamed")) {
      return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400";
    }
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
  };

  const formatActivityMessage = (activity: TeamActivity): string => {
    const actor = activity.users?.name || activity.users?.email || "System";
    const action = activity.action;
    const metadata = activity.metadata || {};

    // Human-readable messages based on action type
    switch (action) {
      case "team.created":
        return `${actor} created the team "${metadata.team_name || "team"}"`;
      
      case "member.invited":
        return `${actor} invited ${metadata.email} as ${metadata.role}`;
      
      case "member.invitation_accepted":
        return `${metadata.email} accepted the invitation and joined as ${metadata.role}`;
      
      case "member.removed":
        return `${actor} removed ${metadata.removed_user_email || "a member"} from the team`;
      
      case "member.role_changed":
        return `${actor} changed ${metadata.user_email || "a member"}'s role from ${metadata.old_role} to ${metadata.new_role}`;
      
      case "team.renamed":
        return `${actor} renamed the team from "${metadata.old_name}" to "${metadata.new_name}"`;
      
      case "team.deleted":
        return `${actor} deleted the team "${metadata.team_name || "team"}"`;
      
      default:
        // Fallback: format action name
        const formattedAction = action
          .replace(/\./g, " ")
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        return `${actor} ${formattedAction}`;
    }
  };

  const getActionLabel = (action: string): string => {
    const labels: Record<string, string> = {
      "team.created": "Team Created",
      "member.invited": "Member Invited",
      "member.invitation_accepted": "Invitation Accepted",
      "member.removed": "Member Removed",
      "member.role_changed": "Role Changed",
      "team.renamed": "Team Renamed",
      "team.deleted": "Team Deleted",
    };
    return labels[action] || action.replace(/\./g, " ").replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard/teams">Teams</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/dashboard/teams/${teamId}`}>Team</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Activity</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href={`/dashboard/teams/${teamId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ActivityIcon className="h-8 w-8 text-primary" />
            Activity Log
          </h1>
          <p className="text-muted-foreground mt-1">
            Track all team actions and changes
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>
            All actions performed by team members ({pagination.total} total)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <div className="text-center py-12">
              <ActivityIcon className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">No activity yet</h3>
              <p className="text-sm text-muted-foreground">
                Team activity will appear here as members take actions
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getActionBadge(activity.action)} variant="outline">
                        {getActionLabel(activity.action)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(activity.created_at)}
                      </span>
                    </div>
                    <p className="text-sm font-medium">
                      {formatActivityMessage(activity)}
                    </p>
                    {activity.users?.email && activity.users.email !== activity.users?.name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {activity.users.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-6 border-t">
              <Button
                variant="outline"
                onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                disabled={pagination.page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="outline"
                onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                disabled={pagination.page === pagination.pages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}