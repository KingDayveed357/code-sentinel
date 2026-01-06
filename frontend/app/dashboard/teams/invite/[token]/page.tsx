"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mail, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { teamsApi } from "@/lib/api/teams";
import { workspacesApi } from "@/lib/api/workspaces";
import { toast } from 'sonner';

export default function AcceptInvitationPage({ params }: { params: Promise<{token: string }> } ) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { token } = use(params); 
  
  const handleAcceptInvitation = async () => {
    try {
      setAccepting(true);
      setError(null);
      
      const result = await teamsApi.acceptInvitation(token);
      setAccepted(true);

      toast.success(
        <div>
          <strong>Invitation Accepted</strong>
          <div>You've joined {result.team.name}</div>
        </div>
      );

      // Fetch all workspaces to find the team workspace ID
      try {
        const workspacesResponse = await workspacesApi.list();
        const teamWorkspace = workspacesResponse.workspaces.find(
          w => w.type === 'team' && w.team_id === result.team.id
        );

        // Redirect to team page after 2 seconds with workspace query param
        setTimeout(() => {
          if (teamWorkspace) {
            router.push(`/dashboard/teams/${result.team.id}?workspace=${teamWorkspace.id}`);
          } else {
            // Fallback if workspace not found
            router.push(`/dashboard/teams/${result.team.id}`);
          }
        }, 2000);
      } catch (workspaceError) {
        console.error('Failed to fetch workspace:', workspaceError);
        // Fallback redirect without workspace param
        setTimeout(() => {
          router.push(`/dashboard/teams/${result.team.id}`);
        }, 2000);
      }
    } catch (error: any) {
      setError(error.message || "Failed to accept invitation");
      toast.error(
        <div>
          <strong>Failed to Accept Invitation</strong>
          <div>{error.message || "Please try again"}</div>
        </div>
      );
    } finally {
      setAccepting(false);
    }
  };

  if (accepted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Welcome to the Team!</CardTitle>
            <CardDescription>
              You've successfully joined the team. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Join the Team</CardTitle>
          <CardDescription>
            You've been invited to collaborate on CodeSentinel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            onClick={handleAcceptInvitation}
            disabled={accepting}
          >
            {accepting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Accepting...
              </>
            ) : (
              "Accept Invitation"
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By accepting, you agree to collaborate on this team's security scans
          </p>
        </CardContent>
      </Card>
    </div>
  );
}