// frontend/components/ui/auth-toast.tsx
"use client";

import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Info } from "lucide-react";

// Success toast
export function showAuthSuccess(title: string, description?: string) {
  toast.custom((t) => (
    <div className="bg-gradient-to-r from-emerald-500 to-green-600 text-white rounded-lg shadow-lg p-4 flex items-start gap-3 min-w-[300px] max-w-md border border-emerald-400/20">
      <CheckCircle2 className="h-5 w-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-semibold text-sm">{title}</p>
        {description && <p className="text-xs mt-1 text-emerald-50">{description}</p>}
      </div>
    </div>
  ), {
    duration: 4000,
  });
}

// Error toast
export function showAuthError(title: string, description?: string) {
  toast.custom((t) => (
    <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white rounded-lg shadow-lg p-4 flex items-start gap-3 min-w-[300px] max-w-md border border-red-400/20">
      <XCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-semibold text-sm">{title}</p>
        {description && <p className="text-xs mt-1 text-red-50">{description}</p>}
      </div>
    </div>
  ), {
    duration: 5000,
  });
}

// Loading toast
export function showAuthLoading(title: string, description?: string) {
  return toast.custom((t) => (
    <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg shadow-lg p-4 flex items-start gap-3 min-w-[300px] max-w-md border border-blue-400/20">
      <Loader2 className="h-5 w-5 mt-0.5 flex-shrink-0 animate-spin" />
      <div className="flex-1">
        <p className="font-semibold text-sm">{title}</p>
        {description && <p className="text-xs mt-1 text-blue-50">{description}</p>}
      </div>
    </div>
  ), {
    duration: Infinity,
  });
}

// Info toast
export function showAuthInfo(title: string, description?: string) {
  toast.custom((t) => (
    <div className="bg-gradient-to-r from-purple-500 to-violet-600 text-white rounded-lg shadow-lg p-4 flex items-start gap-3 min-w-[300px] max-w-md border border-purple-400/20">
      <Info className="h-5 w-5 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-semibold text-sm">{title}</p>
        {description && <p className="text-xs mt-1 text-purple-50">{description}</p>}
      </div>
    </div>
  ), {
    duration: 4000,
  });
}