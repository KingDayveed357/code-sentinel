"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useProgressStore } from "@/stores/progress-store";
import { AnimatePresence, motion } from "framer-motion";

function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAnimating, progress, done, start } = useProgressStore();
  
  // Stop animation when route changes (URL updates)
  useEffect(() => {
    done();
  }, [pathname, searchParams, done]);

  // Global click interception for Next.js Links
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (anchor && anchor.href && anchor.target !== '_blank' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey && !anchor.dataset.noProgress) {
         // Check if internal link
         try {
           const url = new URL(anchor.href);
           if (url.origin === window.location.origin) {
              // Only trigger if navigation actually happens
              if (url.pathname !== window.location.pathname || url.search !== window.location.search) {
                 start();
              }
           }
         } catch (e) {
           // Invalid URL, ignore
         }
      }
    };
    
    document.addEventListener('click', handleAnchorClick);
    return () => document.removeEventListener('click', handleAnchorClick);
  }, [start]);

  return (
    <AnimatePresence>
      {isAnimating && (
        <div className="fixed top-0 left-0 right-0 z-[100] h-[3px] pointer-events-none">
          {/* Progress Bar with Glow */}
          <motion.div
            className="h-full bg-primary shadow-[0_0_10px_currentColor] text-primary" // Use text-primary for glow color inheritance
            initial={{ width: "0%", opacity: 1 }}
            animate={{ 
              width: `${progress}%`,
              opacity: progress === 100 ? 0 : 1 
            }}
            exit={{ opacity: 0 }}
            transition={{ 
               width: { duration: 0.2, ease: "easeOut" },
               opacity: { duration: 0.3, delay: 0.2 } 
            }}
          />
        </div>
      )}
    </AnimatePresence>
  );
}

export function TopProgressBar() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}
