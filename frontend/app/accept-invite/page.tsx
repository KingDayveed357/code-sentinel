"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { previewInvitation, acceptInvitation } from "@/lib/api/workspaces";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, ShieldCheck, Mail, Building2, User } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function AcceptInvitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, githubSignIn, refreshUser, refreshWorkspaces } = useAuth();
  
  const [status, setStatus] = useState<"loading" | "valid" | "invalid" | "expired" | "accepted" | "error">("loading");
  const [inviteData, setInviteData] = useState<{
    workspaceName: string;
    workspaceSlug: string;
    inviterName: string;
    inviterEmail: string;
    role: string;
    expiresAt: string;
    email?: string;
  } | null>(null);
  
  const [isAccepting, setIsAccepting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. Validate Token on Mount
  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    async function checkInvite() {
        try {
            const preview = await previewInvitation(token!);
            
            setInviteData({
                workspaceName: preview.workspace.name,
                workspaceSlug: preview.workspace.slug,
                inviterName: preview.inviter.full_name || preview.inviter.email.split('@')[0],
                inviterEmail: preview.inviter.email,
                role: preview.role,
                expiresAt: preview.expires_at,
                email: preview.email
            });
            setStatus("valid");

        } catch (err: any) {
            console.error("Invite check failed:", err);
            if (err.status === 410 || err.message?.includes("expired")) {
                setStatus("expired");
            } else if (err.status === 409 || err.message?.includes("accepted")) {
                setStatus("accepted");
            } else {
                setStatus("invalid");
                setErrorMsg(err.message || "Invitation not found");
            }
        }
    }

    checkInvite();
  }, [token]);

  // 2. Handle Login (Unauthenticated)
  const handleLogin = useCallback(async () => {
    try {
        await githubSignIn(token!);
    } catch (err) {
        toast.error("Failed to initiate login");
    }
  }, [githubSignIn, token]);

  // 3. Handle Accept (Authenticated)
  const handleAccept = async () => {
    if (!token) return;
    
    setIsAccepting(true);
    try {
        await acceptInvitation(token);
        
        // 1. Refresh user profile (roles)
        await refreshUser();
        
        // 2. Refresh workspaces to ensure the new one appears
        // This fixes the "workspace not found" issue after redirect
        await refreshWorkspaces();

        toast.success("Welcome to the team!");
        
        // 3. Force redirect to dashboard which should now resolve the new workspace
        router.push("/dashboard");

    } catch (err: any) {
        toast.error(err.message || "Failed to accept invitation");
        setErrorMsg(err.message);
    } finally {
        setIsAccepting(false);
    }
  };

  if (!token) {
     return <ErrorState title="Invalid Invitation" description="This invitation link is missing a token." />;
  }

  if (status === "loading") {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="flex flex-col items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Loader2 className="h-6 w-6 animate-spin" />
                </div>
                <div className="text-center">
                    <h3 className="font-semibold text-foreground">Verifying invitation...</h3>
                    <p className="text-sm text-muted-foreground">Just a moment</p>
                </div>
            </div>
        </div>
    );
  }

  if (status === "expired" || status === "invalid" || status === "error") {
    return (
        <ErrorState 
            title={status === "expired" ? "Invitation Expired" : "Invalid Invitation"} 
            description={
                status === "expired" 
                ? "This invitation has expired. Please ask the workspace owner to send a new one." 
                : errorMsg || "This invitation link is invalid or has likely been revoked."
            } 
        />
    );
  }

  if (status === "accepted") {
     return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md shadow-xl border-border">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 ring-8 ring-green-50 dark:ring-green-900/10">
                        <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <CardTitle className="text-2xl">Already Accepted</CardTitle>
                    <CardDescription className="text-base mt-2">
                        You have already accepted this invitation.
                    </CardDescription>
                </CardHeader>
                <CardFooter className="justify-center pt-6">
                    <Button onClick={() => router.push("/dashboard")} className="w-full h-11">
                        Go to Dashboard
                    </Button>
                </CardFooter>
            </Card>
        </div>
     );
  }

  // Valid Invitation State
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
      <Card className="w-full max-w-lg shadow-2xl border-border overflow-hidden z-10">
        {/* Decorative header background */}
        <div className="h-32 bg-gradient-to-r from-blue-600 to-indigo-600 relative">
            <div className="absolute inset-0 bg-grid-white/10 [mask-image:linear-gradient(0deg,transparent,black)]" />
            <div className="absolute -bottom-10 left-1/2 -translate-x-1/2">
                <div className="h-20 w-20 rounded-2xl bg-card shadow-lg flex items-center justify-center p-1 ring-4 ring-background/50">
                    <div className="h-full w-full rounded-xl bg-muted/50 flex items-center justify-center border border-border">
                         <Building2 className="h-10 w-10 text-muted-foreground" />
                    </div>
                </div>
            </div>
        </div>

        <CardHeader className="text-center pt-14 pb-6">
            <CardTitle className="text-2xl font-bold">Join {inviteData?.workspaceName}</CardTitle>
            <CardDescription className="text-base mt-2 max-w-sm mx-auto">
                You've been invited to join the team on CodeSentinel.
            </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6 px-8">
            {/* Invite Details */}
            <div className="grid gap-4">
                <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
                    <Avatar className="h-10 w-10 border border-border">
                        <AvatarFallback className="bg-primary/10 text-primary font-medium">
                            {inviteData?.inviterName.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{inviteData?.inviterName}</p>
                        <p className="text-xs text-muted-foreground truncate">{inviteData?.inviterEmail}</p>
                    </div>
                    <div className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                        Inviter
                    </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-dashed border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                        <div>
                            <p className="text-sm font-medium text-foreground">Assigned Role</p>
                            <p className="text-xs text-muted-foreground capitalize">{inviteData?.role}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <div className="text-right">
                            <p className="text-sm font-medium text-foreground">Sent to</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">{inviteData?.email}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Auth Status */}
            {user ? (
                 <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-4 text-sm text-blue-700 dark:text-blue-400 flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div className="flex-1">
                        <p className="font-medium">Signed in as {user.email}</p>
                        {user.email !== inviteData?.email && (
                             <p className="text-xs text-red-600 dark:text-red-400 mt-1.5 font-medium bg-red-100 dark:bg-red-900/30 p-2 rounded-lg border border-red-200 dark:border-red-800">
                                Warning: This invite was sent to {inviteData?.email}. You may lose access if you accept with a different email.
                             </p>
                        )}
                    </div>
                </div>
            ) : (
                <div className="text-center space-y-2">
                    <p className="text-sm text-muted-foreground">
                        Sign in or create an account to accept this invitation.
                    </p>
                </div>
            )}
        </CardContent>

        <CardFooter className="flex-col gap-3 px-8 pb-8">
            {user ? (
                 <Button 
                    className="w-full h-11 text-base font-medium shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5" 
                    onClick={handleAccept} 
                    disabled={isAccepting}
                >
                    {isAccepting ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Joining {inviteData?.workspaceName}...
                        </>
                    ) : (
                        `Join ${inviteData?.workspaceName}`
                    )}
                 </Button>
            ) : (
                <Button 
                    className="w-full h-11 text-base font-medium bg-[#24292F] hover:bg-[#24292F]/90 shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5" 
                    onClick={handleLogin}
                >
                    <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    Continue with GitHub
                </Button>
            )}
             <Button 
                variant="ghost" 
                className="w-full text-gray-500 hover:text-gray-900" 
                onClick={() => router.push("/")}
            >
                Cancel
            </Button>
        </CardFooter>
      </Card>
      
      {/* Background decoration */}
      <div className="fixed inset-0 -z-10 bg-background">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] dark:bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)]" />
      </div>
    </div>
  );
}

function ErrorState({ title, description }: { title: string; description: string }) {
    const router = useRouter();
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
             <Card className="w-full max-w-md text-center shadow-xl border-border">
                <CardHeader className="pb-2">
                    <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30 ring-8 ring-red-50 dark:ring-red-900/10">
                        <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                    </div>
                    <CardTitle className="text-xl">{title}</CardTitle>
                    <CardDescription className="text-base mt-2">{description}</CardDescription>
                </CardHeader>
                <CardFooter className="justify-center pt-6">
                    <Button variant="outline" onClick={() => router.push("/")} className="w-full h-11">
                        Return Home
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
}
