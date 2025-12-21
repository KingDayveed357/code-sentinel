// app/dashboard/teams/[teamId]/activity/page.tsx - Activity Log

"use client";

import { useState, useEffect, use } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, ArrowLeft, Activity as ActivityIcon } from "lucide-react";
import Link from "next/link";
import { teamsApi, type TeamActivity } from "@/lib/api/teams";
import { useToast } from "@/hooks/use-toast";



export default function TeamActivityPage({ params }: {params: Promise<{ teamId: string }>}) {
  const { toast } = useToast();
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
      toast({
        title: "Failed to Load Activity",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return "Yesterday";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActionBadge = (action: string) => {
    if (action.includes("added") || action.includes("created")) {
      return "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400";
    }
    if (action.includes("removed") || action.includes("deleted")) {
      return "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-400";
    }
    if (action.includes("updated") || action.includes("changed")) {
      return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400";
    }
    return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
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
            <div className="space-y-4">
              {activities.map((activity) => (
                <div key={activity.id} className="flex items-start gap-4 p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getActionBadge(activity.action)}>
                        {activity.action.replace(/\./g, " ").replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(activity.created_at)}
                      </span>
                    </div>
                    <p className="text-sm">
                      <strong>{activity.users?.name || "System"}</strong> performed an action
                    </p>
                    {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {JSON.stringify(activity.metadata, null, 2)}
                      </div>
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