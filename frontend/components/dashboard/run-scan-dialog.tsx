"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useState } from "react"
import { Zap } from "lucide-react"

interface RunScanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoName: string
  onScanStart?: () => void
}

export function RunScanDialog({ open, onOpenChange, repoName, onScanStart }: RunScanDialogProps) {
  const [isScanning, setIsScanning] = useState(false)

  const handleStartScan = () => {
    setIsScanning(true)
    onScanStart?.()
    // Simulate scan completion after 3 seconds
    setTimeout(() => {
      setIsScanning(false)
      onOpenChange(false)
    }, 3000)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Run Security Scan
          </AlertDialogTitle>
          <AlertDialogDescription>
            Start an immediate security audit of <strong>{repoName}</strong>. This may take a few minutes depending on
            the size of your repository.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isScanning && (
          <div className="py-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">Scanning your repository...</p>
            <p className="text-xs text-muted-foreground mt-2">Analyzing code for vulnerabilities</p>
          </div>
        )}

        {!isScanning && (
          <div className="flex gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleStartScan}>Start Scan</AlertDialogAction>
          </div>
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}
