"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { 
  LogOut, 
  CreditCard, 
  Settings, 
  User, 
  Sparkles,
  MoreHorizontal
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { LogoutDialog } from "@/components/dashboard/sidebar/logout-dialog";
import Link from "next/link";

interface UserNavProps {
  isCollapsed: boolean;
}

export function UserNav({ isCollapsed }: UserNavProps) {
  const { user, logout } = useAuth();
  const { workspace, plan, role, isTeam } = useWorkspace();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const displayName = user?.full_name || "CodeSentinel User";
  const displayEmail = user?.email || "";
  const avatarUrl = user?.user_metadata?.avatar_url || user?.avatar_url;
  const isPaid = plan !== "Free";

  return (
    <>
      <div className="p-2 border-t border-border mt-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className={`
                relative flex items-center gap-3 h-auto py-3 w-full 
                hover:bg-muted/50 focus-visible:ring-1 focus-visible:ring-ring transition-all
                ${isCollapsed ? "justify-center px-0" : "justify-start px-2"}
              `}
            >
              <Avatar className="h-9 w-9 border border-border">
                <AvatarImage src={avatarUrl} alt={displayName} />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              {!isCollapsed && (
                <>
                  <div className="flex flex-col items-start text-sm flex-1 min-w-0">
                    <span className="font-semibold truncate w-full text-left">
                      {displayName}
                    </span>
                    <div className="flex items-center gap-2 w-full">
                      {/* <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                        {displayEmail}
                      </span> */}
                      <span className={`
                        text-[10px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wider
                        ${isPaid 
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800" 
                          : "bg-muted text-muted-foreground border-border"}
                      `}>
                        {plan}
                      </span>
                      {role && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-background text-muted-foreground font-bold uppercase tracking-wider">
                          {role}
                        </span>
                      )}
                    </div>
                  </div>
                  <MoreHorizontal className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          
          <DropdownMenuContent 
            className="w-64 mb-2" 
            align={isCollapsed ? "center" : "end"} 
            side={isCollapsed ? "right" : "top"}
            sideOffset={12}
          >
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1 py-1">
                <p className="text-sm font-semibold leading-none">{displayName}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {displayEmail}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            
            {!isPaid && (
              <DropdownMenuItem className="p-0 focus:bg-transparent">
                <Link 
                  href="/dashboard/settings?tab=billing" 
                  className="flex w-full items-center gap-2 p-2 m-1 rounded-md bg-gradient-to-br from-indigo-600 to-violet-600 text-white hover:opacity-90 transition-all shadow-sm"
                >
                  <Sparkles className="h-4 w-4 fill-white" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold">Upgrade Plan</span>
                    <span className="text-[10px] text-indigo-100">Get advanced security tools</span>
                  </div>
                </Link>
              </DropdownMenuItem>
            )}

            <DropdownMenuGroup className="py-1">
              <DropdownMenuItem asChild>
                <Link href="/dashboard/account" className="cursor-pointer py-2">
                  <User className="mr-2 h-4 w-4" />
                  <span>Account Settings</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" className="cursor-pointer py-2">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Workspace Settings</span>
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            
            <DropdownMenuSeparator />
            
            <DropdownMenuItem 
              className="text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-900/20 py-2 cursor-pointer"
              onSelect={() => setShowLogoutDialog(true)} // Opens the modal
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span className="font-medium">Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Confirmation Modal */}
      <LogoutDialog 
        open={showLogoutDialog} 
        onOpenChange={setShowLogoutDialog} 
        onConfirm={logout} 
      />
    </>
  );
}