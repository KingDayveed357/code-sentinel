"use client";

import { useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useWorkspace } from '@/hooks/use-workspace';
import { classifyRoute } from '@/lib/routes/route-classifier';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
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
  const { toast } = useToast();
  
  // Local validation state
  const [isValidating, setIsValidating] = useState(false);
  
  // Use transition for smoother navigation
  const [isPending, startTransition] = useTransition();

  // Combined loading state
  const isLoading = initializing || isSwitching || isValidating || isPending;

  useEffect(() => {
    // Skip logical checks if purely initializing
    if (!workspace) return;

    const route = classifyRoute(pathname);

    // If route is workspace-safe, no checks needed
    if (route.type === 'workspace-safe') return;

    // Entity-dependent routes require async validation to ensure the resource belongs to the workspace
    if (route.type === 'entity-dependent' && route.requiresValidation) {
       setIsValidating(true);
       
       const validate = async () => {
         try {
           const isValid = await route.requiresValidation!(pathname, workspace, queryClient);
           
           if (!isValid) {
              console.warn(`Redirecting from ${pathname} - resource not found in workspace ${workspace.id}`);
              
              const redirectPath = route.redirectOnInvalid || '/dashboard';
              
              // Use transition for redirect
              startTransition(() => {
                router.push(redirectPath);
              });
              
              toast({
                title: "Resource not available",
                description: "This resource doesn't exist in the current workspace.",
                variant: 'destructive',
              });
           }
         } catch (err: any) {
            console.error("Route validation error:", err);
            // Optional: Show error toast?
         } finally {
            setIsValidating(false);
         }
       };

       validate();
    }
  }, [pathname, workspace?.id, queryClient, router, toast]);

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
        Only visible when significant work is happening.
        Uses AnimatePresence for smooth entry/exit.
      */}
      <AnimatePresence>
        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="bg-background/80 backdrop-blur-md border border-border/50 shadow-2xl rounded-xl px-8 py-6 flex flex-col items-center gap-4 max-w-sm mx-auto pointer-events-auto">
              {/* Premium Gradient Loader */}
              <div className="relative flex items-center justify-center h-16 w-16">
                <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
                <Loader2 className="h-6 w-6 text-primary animate-pulse" />
              </div>
              
              <div className="text-center space-y-1">
                <h3 className="font-semibold text-lg tracking-tight">
                  {isSwitching ? 'Switching Workspace' : isValidating ? 'Verifying Access' : 'Loading'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isSwitching ? 'Syncing your environment...' : 'Checking permissions...'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
