import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface AccessDeniedProps {
  title?: string;
  description?: string;
  returnTo?: string;
  returnLabel?: string;
}

export function AccessDenied({
  title = "Access Denied",
  description = "You do not have permission to view this page or perform this action.",
  returnTo = "/dashboard",
  returnLabel = "Return to Dashboard",
}: AccessDeniedProps) {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-8 border rounded-lg bg-muted/30">
      <div className="bg-red-100 dark:bg-red-900/20 p-4 rounded-full mb-6">
        <ShieldAlert className="h-12 w-12 text-red-600 dark:text-red-400" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight mb-2">{title}</h2>
      <p className="text-muted-foreground max-w-md mb-8">{description}</p>
      
      <div className="flex gap-4">
        <Button variant="outline" onClick={() => router.back()}>
          Go Back
        </Button>
        <Button asChild>
          <Link href={returnTo}>{returnLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
