"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCw } from "lucide-react"

interface DashboardErrorProps {
  error: string
  onRetry: () => void
}

/**
 * Premium error state with retry functionality
 */
export function DashboardError({ error, onRetry }: DashboardErrorProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4 animate-in fade-in duration-300">
      <Alert variant="destructive" className="max-w-2xl">
        <AlertCircle className="h-5 w-5" />
        <AlertTitle className="text-lg font-semibold mb-2">
          Failed to load dashboard
        </AlertTitle>
        <AlertDescription className="space-y-4">
          <p className="text-sm">{error}</p>
          <Button 
            onClick={onRetry} 
            variant="outline" 
            size="sm"
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  )
}
