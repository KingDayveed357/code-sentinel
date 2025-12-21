"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { LogOut, AlertCircle } from "lucide-react"

interface LogoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function LogoutDialog({ open, onOpenChange, onConfirm }: LogoutDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[400px] p-6 gap-6">
        <div className="flex flex-col items-center text-center gap-4">
          {/* Visual Icon Header */}
          <div className="h-12 w-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center border border-red-100 dark:border-red-900/30">
            <LogOut className="h-6 w-6 text-red-600 dark:text-red-500" />
          </div>
          
          <AlertDialogHeader className="space-y-2">
            <AlertDialogTitle className="text-xl font-bold tracking-tight">
              Confirm Logout
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to end your session? You will need to authenticate again to access your security dashboards and repositories.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2 space-x-4 sm:gap-0">
          <AlertDialogCancel className="flex-1 border-none bg-muted hover:bg-muted/80 text-foreground transition-all">
            Stay logged in
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white border-none shadow-sm transition-all"
          >
            Sign out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}


