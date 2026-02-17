"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useProgressRouter as useRouter } from '@/hooks/use-progress-router';
import { useWorkspace } from '@/hooks/use-workspace';
import { useWorkspaceStore } from '@/stores/workspace-store';
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
 * 5. Prevents infinite loops on workspace switch
 */
export function WorkspaceRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, initializing } = useWorkspace();
  const queryClient = useQueryClient();
  
  // ✅ FIX: Get lifecycle state from store
  const lifecycleState = useWorkspaceStore((state) => state.lifecycleState);
  
  // Track the last active workspace ID to detect switches
  const [lastWorkspaceId, setLastWorkspaceId] = useState<string | null>(null);
  
  // Local validation state
  const [isValidating, setIsValidating] = useState(false);
  
  // Detect if we are in a "post-switch" mismatched state before effect runs
  // This prevents flashing "old route + new workspace" content
  const isWorkspaceMismatch = lastWorkspaceId !== null && workspace?.id && lastWorkspaceId !== workspace.id;

  // ✅ FIX: Only block UI during initializing and switching, NOT during validating
  const isLoading = lifecycleState === "initializing" || lifecycleState === "switching" || isWorkspaceMismatch;

  // Instrumentation: render log
  console.log('WorkspaceRouteGuard render', { pathname, isLoading, lifecycleState, workspaceId: workspace?.id });

  useEffect(() => {
    // 1. Guard clauses
    if (!workspace || initializing || lifecycleState === "switching") return;

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
        console.log('🔄 WorkspaceRouteGuard: Workspace switch detected', { 
          from: lastWorkspaceId, 
          to: currentWsId, 
          routeType: route.type,
          pathname 
        });
        
        // ✅ FIX: Update tracker IMMEDIATELY to prevent re-triggering
        setLastWorkspaceId(currentWsId);
        
        if (route.type === 'entity-dependent') {
             const redirectPath = route.redirectOnInvalid || '/dashboard';
             
             console.log('🔄 WorkspaceRouteGuard: Redirecting from entity route', { 
               from: pathname, 
               to: redirectPath 
             });
             
             // CRITICAL: Immediate Redirect - Do not validate
             router.replace(redirectPath);
             
             toast.warning("Workspace changed", {
                 description: "The resource you were viewing belongs to a different workspace. You've been redirected.",
                 duration: 4000,
             });
             
             // ✅ FIX: Return early, do NOT run validation
             return;
        }
        
        // ✅ FIX: For safe routes after workspace switch, skip validation entirely
        // Workspace is already updated above, just return
        return;
    }

    // 4. Standard Validation Logic
    // (Runs on deep link OR stable navigation within workspace)
    
    // Explicitly turn OFF validation if route is safe
    if (route.type !== 'entity-dependent' || !route.requiresValidation) {
      setIsValidating(false);
      return;
    }

    // Start validation for entity routes, but avoid validating while tab is hidden
    let active = true;
    let visibilityListener: (() => void) | null = null;

    const runValidation = async () => {
      if (!active) return;
      console.log('WorkspaceRouteGuard: starting validation', { pathname, workspaceId: workspace.id });
      setIsValidating(true);

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
        console.error('Route validation error:', err);
        // ✅ FIX: On validation error (e.g., entity not found), redirect to safe route
        const redirectPath = route.redirectOnInvalid || '/dashboard';
        if (active) {
          router.replace(redirectPath);
          toast.error('Resource not found', {
            description: 'The resource you are trying to access does not exist or has been moved.',
            duration: 4000,
          });
        }
      } finally {
        if (active) {
          setIsValidating(false);
          console.log('WorkspaceRouteGuard: finished validation', { pathname, workspaceId: workspace.id });
        }
      }
    };

    // If the document is hidden (tab switched), defer validation until visible to avoid transient loading
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      console.log('WorkspaceRouteGuard: document hidden, deferring validation');
      visibilityListener = () => {
        if (document.visibilityState === 'visible' && active) {
          runValidation();
        }
      };
      document.addEventListener('visibilitychange', visibilityListener);
    } else {
      // small debounce to avoid racing on quick navigation
      const t = window.setTimeout(() => runValidation(), 80);
      // ensure we clear timeout on cleanup
      visibilityListener = () => clearTimeout(t);
    }

    return () => {
      active = false;
      if (visibilityListener && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityListener as EventListener);
      }
    };
  }, [pathname, workspace?.id, lifecycleState, initializing, queryClient, router, lastWorkspaceId]);

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
