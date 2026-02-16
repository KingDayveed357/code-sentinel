"use client"

import { useWorkspaces } from "@/hooks/use-workspace"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Sparkles, ArrowRight, Loader2 } from "lucide-react"
import { useState } from "react"
import { initiateCheckout } from "@/lib/api/workspaces"
import { useToast } from "@/hooks/use-toast"

export function PendingWorkspaceBanner() {
  const { workspaces, isLoading } = useWorkspaces()
  const { toast } = useToast()
  const [isProcessing, setIsProcessing] = useState(false)

  // Find any pending team workspace where the user is an owner
  // Note: Backend filters allow owners to see pending workspaces
  const pendingWorkspace = workspaces.find(
    (w) => w.type === 'team' && w.billing_status === 'pending'
  )

  if (isLoading || !pendingWorkspace) {
    return null
  }

  // Calculate time remaining
  const expiresAt = pendingWorkspace.expires_at ? new Date(pendingWorkspace.expires_at) : null;
  const now = new Date();
  
  let timeRemaining = "";
  if (expiresAt) {
    const hours = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)));
    timeRemaining = hours > 0 ? `${hours} hours` : "less than an hour";
  }

  const handleCompleteSetup = async () => {
    try {
      setIsProcessing(true)
      const { checkoutUrl } = await initiateCheckout(pendingWorkspace.id)
      
      if (checkoutUrl) {
        window.location.href = checkoutUrl
      } else {
        throw new Error("No checkout URL returned")
      }
    } catch (error) {
      console.error("Failed to initiate checkout:", error)
      toast({
        title: "Error",
        description: "Failed to resume setup. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md w-full animate-in slide-in-from-bottom-5 fade-in duration-300">
      <Alert className="border-primary/20 bg-background/80 backdrop-blur-md shadow-xl dark:border-primary/30 dark:bg-zinc-900/90">
        <Sparkles className="h-5 w-5 text-primary animate-pulse" />
        <AlertTitle className="mb-2 text-lg font-semibold flex items-center justify-between">
          <span>Finish setting up {pendingWorkspace.name}</span>
        </AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p className="text-sm text-foreground/80">
            Your team workspace is pending activation. Complete the billing setup to unlock team features.
          </p>
          {timeRemaining && (
             <p className="text-xs text-amber-500 font-medium dark:text-amber-400">
                Expires in {timeRemaining}
             </p>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <Button size="sm" onClick={handleCompleteSetup} disabled={isProcessing} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
              {isProcessing ? (
                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="h-3 w-3 mr-2" />
              )}
              Complete Setup
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  )
}
