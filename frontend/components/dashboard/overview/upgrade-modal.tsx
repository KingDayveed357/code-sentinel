"use client"

import { memo } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Zap, Check, ArrowRight } from "lucide-react"
import Link from "next/link"

interface UpgradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentPlan: string
}

/**
 * Premium upgrade modal for team features
 */
export const UpgradeModal = memo(function UpgradeModal({
  open,
  onOpenChange,
  currentPlan
}: UpgradeModalProps) {
  const teamFeatures = [
    "Assign vulnerabilities to team members",
    "Team collaboration and comments",
    "Advanced role-based access control",
    "Shared vulnerability tracking",
    "Team performance analytics",
    "Priority support"
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] gap-0 p-0 overflow-hidden">
        {/* Header with gradient background */}
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background p-6 pb-8">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center ring-2 ring-primary/20">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <Badge variant="secondary" className="text-xs">
                Team Feature
              </Badge>
            </div>
            <DialogTitle className="text-2xl">
              Upgrade to unlock team collaboration
            </DialogTitle>
            <DialogDescription className="text-base">
              You're currently on the <strong>{currentPlan}</strong> plan. Upgrade to Team or Enterprise to access advanced collaboration features.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Features list */}
        <div className="px-6 py-6 space-y-3">
          <p className="text-sm font-semibold text-foreground mb-4">
            What you'll get with Team:
          </p>
          {teamFeatures.map((feature, index) => (
            <div 
              key={index} 
              className="flex items-start gap-3 text-sm animate-in fade-in-50 slide-in-from-left-2"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Check className="h-3 w-3 text-primary" />
              </div>
              <span className="text-muted-foreground">{feature}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <DialogFooter className="px-6 py-4 bg-muted/30 border-t gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="flex-1 sm:flex-initial"
          >
            Maybe Later
          </Button>
          <Button asChild className="flex-1 sm:flex-initial group">
            <Link href="/dashboard/settings/billing">
              View Plans
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
