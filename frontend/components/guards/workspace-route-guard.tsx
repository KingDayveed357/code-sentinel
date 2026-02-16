"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useProgressRouter as useRouter } from '@/hooks/use-progress-router';
import { useWorkspace } from '@/hooks/use-workspace';
import { classifyRoute } from '@/lib/routes/route-classifier';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * ✅ PREMIUM WORKSPACE ROUTE GUARD
 * 
 * Best-practice implementation that:
 * 1. Renders content immediately (optimistic UI)
 * 2. Uses progressive loading overlay instead of full-page block
 * 3. Gracefully handles workspace validation
 * 4. Provides clear visual feedback during transitions
 */
export function WorkspaceRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, isSwitching, initializing } = useWorkspace();
  const queryClient = useQueryClient();
  
  // Track the last active workspace ID to detect switches
  const [lastWorkspaceId, setLastWorkspaceId] = useState<string | null>(null);
  
  // Local validation state
  const [isValidating, setIsValidating] = useState(false);
  
  // Detect if we are in a "post-switch" mismatched state before effect runs
  // This prevents flashing "old route + new workspace" content
  const isWorkspaceMismatch = lastWorkspaceId !== null && workspace?.id && lastWorkspaceId !== workspace.id;

  // Combined loading state
  const isLoading = initializing || isSwitching || isValidating || isWorkspaceMismatch;

  useEffect(() => {
    // 1. Guard clauses
    if (!workspace || initializing || isSwitching) return;

    const currentWsId = workspace.id;
    const route = classifyRoute(pathname);

    // 2. Initialize tracker on first load
    if (lastWorkspaceId === null) {
        setLastWorkspaceId(currentWsId);
        // Fall through to validation (needed for deep links)
    }
    // 3. Detect Workspace Switch
    else if (lastWorkspaceId !== currentWsId) {
        // Workspace changed!
        
        if (route.type === 'entity-dependent') {
             const redirectPath = route.redirectOnInvalid || '/dashboard';
             
             // CRITICAL: Immediate Redirect - Do not validate
             router.replace(redirectPath);
             
             toast.warning("Workspace changed", {
                 description: "The resource you were viewing belongs to a different workspace. You’ve been redirected.",
                 duration: 4000,
             });
             
             // Determine we are redirecting, so stop here
             return;
        } else {
             // For safe routes, just accept the new workspace
             setLastWorkspaceId(currentWsId);
             // We can proceed to let standard validation logic run (or skip) below
             // but usually safe routes don't 'requireValidation'.
        }
    }

    // 4. Standard Validation Logic
    // (Runs on deep link OR stable navigation within workspace)
    
    // Explicitly turn OFF validation if route is safe
    if (route.type !== 'entity-dependent' || !route.requiresValidation) {
      setIsValidating(false);
      return;
    }

    // Start validation for entity routes
    let active = true;
    setIsValidating(true);

    const validate = async () => {
      try {
        const isValid = await route.requiresValidation!(pathname, workspace, queryClient);
        
        if (!active) return; 

        if (!isValid) {
           const redirectPath = route.redirectOnInvalid || '/dashboard';
           
           router.replace(redirectPath);
           
           toast.error('Access Denied', {
             description: 'You do not have permission to view this resource.',
             duration: 4000,
           });
        }
      } catch (err: any) {
         console.error("Route validation error:", err);
      } finally {
         if (active) {
            setIsValidating(false);
         }
      }
    };

    validate();

    return () => {
      active = false;
    };
  }, [pathname, workspace?.id, isSwitching, initializing, queryClient, router, lastWorkspaceId]);

  return (
    <div className="relative min-h-[calc(100vh-4rem)]">
      {/* 
        ✅ CONTENT LAYER 
        Render content immediately. It will be interactable unless loading overlay is active.
        We apply a subtle blur/dim when deep loading occurs.
      */}
      <div className={cn(
        "transition-all duration-300",
        isLoading ? "opacity-60 pointer-events-none grayscale-[0.5]" : "opacity-100"
      )}>
        {children}
      </div>

      {/* 
        ✅ PROGRESSIVE LOADING OVERLAY
        Minimalist, premium loader only. No raw text.
        Centered, smooth entry/exit.
      */}
      <AnimatePresence mode="wait">
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            {/* Glassmorphism Card - Icon Only */}
            <div className="bg-background/40 backdrop-blur-xl border border-border/20 shadow-2xl rounded-2xl p-6 flex items-center justify-center pointer-events-auto">
              <div className="relative flex items-center justify-center h-12 w-12">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin duration-700" />
                {/* Brand dot in center */}
                <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
