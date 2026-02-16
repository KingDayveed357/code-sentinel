"use client";

import { useRouter as useNextRouter } from "next/navigation";
import { useProgressStore } from "@/stores/progress-store";
import { useCallback } from "react";

export function useProgressRouter() {
  const router = useNextRouter();
  const { start } = useProgressStore();

  const push = useCallback((href: string, options?: any) => {
    start();
    router.push(href, options);
  }, [router, start]);

  const replace = useCallback((href: string, options?: any) => {
    start();
    router.replace(href, options);
  }, [router, start]);

  const back = useCallback(() => {
    start();
    router.back();
  }, [router, start]);

  const refresh = useCallback(() => {
    start();
    router.refresh();
  }, [router, start]);
  
  return { ...router, push, replace, back, refresh };
}
