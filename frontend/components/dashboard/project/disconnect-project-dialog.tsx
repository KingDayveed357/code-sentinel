"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { repositoriesApi } from "@/lib/api/repositories";

interface DisconnectProjectDialogProps {
  project: { id: string; name: string } | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  onSuccess?: (deletedProjectId: string) => void;
  redirectTo?: string;
}

export function DisconnectProjectDialog({
  project,
  open,
  onOpenChange,
  trigger,
  onSuccess,
  redirectTo,
}: DisconnectProjectDialogProps) {
  const [deleting, setDeleting] = useState(false);
  

  // Handle the delete logic
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent closing immediately
    if (!project) return;

    try {
      setDeleting(true);
      await repositoriesApi.delete(project.id);

      toast.success("Project disconnected");

      if (onSuccess) {
        onSuccess(project.id);
      }

      if (redirectTo) {
        window.location.href = redirectTo;
      }

      // Close dialog if controlled
      if (onOpenChange) {
        onOpenChange(false);
      }
    } catch (err: any) {
      toast.error(
        <div>
          <strong>Failed to disconnect project</strong>
          <p>{err.message}</p>
        </div>
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2 text-destructive mb-2">
            <div className="p-2 bg-destructive/10 rounded-full">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Disconnect Project?</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="space-y-3">
            <p>
              Are you sure you want to disconnect <strong>{project?.name}</strong>?
            </p>
            <p>
              This action will permanently delete all scan history, vulnerability reports, and
              settings associated with this project. This action cannot be undone.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting} className="">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            {deleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Disconnecting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Yes, Disconnect
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}