"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Github,
  LayoutDashboard,
  Settings,
  CreditCard,
  Sparkles,
  LogOut,
  Loader2,
} from "lucide-react";

export function NavbarGithubButton() {
  const router = useRouter();
  const {
    user,
    loading,
    profileLoading,
    isOnboardingComplete,
    githubSignIn,
    logout,
    userPlan,
  } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isLoading = loading || profileLoading;

  // Handle GitHub Sign In
  const handleSignIn = async () => {
    setIsSigningIn(true);
    try {
      await githubSignIn();
    } catch (error) {
      console.error("Sign in failed:", error);
      setIsSigningIn(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error("Logout failed:", error);
      setIsLoggingOut(false);
    }
  };

  // 1. Loading state
  if (isLoading) {
    return <Skeleton className="h-9 w-40 rounded-md" />;
  }

  // 2. Not logged in → Show "Connect GitHub"
  if (!user) {
    return (
      <Button size="sm" onClick={handleSignIn} disabled={isSigningIn}>
        {isSigningIn ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : (
          <>
            <Github className="mr-2 h-4 w-4" />
            Connect GitHub
          </>
        )}
      </Button>
    );
  }

  // 3. Logged in, onboarding NOT done → Continue Setup
  if (!isOnboardingComplete) {
    return (
      <Button size="sm" asChild>
        <Link href="/onboarding">Continue Setup</Link>
      </Button>
    );
  }

  // 4. Logged in + onboarding done → Show profile dropdown
  const avatarUrl = user.user_metadata?.avatar_url || user.avatar_url;
  const fullName = user.user_metadata?.full_name || user.full_name || "User";
  const email = user.email || "";

  // Get initials for fallback
  const initials = fullName
    .split(" ")
    .map((n:any) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 w-9 rounded-full">
          <Avatar className="h-9 w-9">
            <AvatarImage src={avatarUrl} alt={fullName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{fullName}</p>
            <p className="text-xs leading-none text-muted-foreground">{email}</p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                {userPlan}
              </Badge>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="cursor-pointer">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/settings" className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Account Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/dashboard/billing" className="cursor-pointer">
            <CreditCard className="mr-2 h-4 w-4" />
            Plan & Billing
          </Link>
        </DropdownMenuItem>
        {userPlan === "Free" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/billing" className="cursor-pointer text-primary">
                <Sparkles className="mr-2 h-4 w-4" />
                Upgrade Plan
              </Link>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          {isLoggingOut ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Logging out...
            </>
          ) : (
            <>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}