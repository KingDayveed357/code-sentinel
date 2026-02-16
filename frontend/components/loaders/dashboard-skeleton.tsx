
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Header Skeleton */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur">
        <div className="container flex h-14 items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="hidden md:flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </header>

      <div className="container flex-1 items-start md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-10">
        {/* Sidebar Skeleton */}
        <aside className="fixed top-14 z-30 -ml-2 hidden h-[calc(100vh-3.5rem)] w-full shrink-0 md:sticky md:block overflow-y-auto border-r py-6 pr-6 lg:py-8">
           <div className="space-y-4">
              <Skeleton className="h-4 w-1/2 mb-6" />
              <div className="space-y-2">
                 <Skeleton className="h-8 w-full" />
                 <Skeleton className="h-8 w-full" />
                 <Skeleton className="h-8 w-full" />
              </div>
              <div className="space-y-2 pt-6">
                 <Skeleton className="h-4 w-1/3 mb-4" />
                 <Skeleton className="h-8 w-full" />
                 <Skeleton className="h-8 w-full" />
                 <Skeleton className="h-8 w-full" />
              </div>
           </div>
        </aside>

        {/* Main Content Skeleton */}
        <main className="relative py-6 lg:gap-10 lg:py-8 xl:grid xl:grid-cols-[1fr_300px]">
           <div className="mx-auto w-full min-w-0 space-y-6">
              <div className="space-y-2">
                 <Skeleton className="h-10 w-1/3" />
                 <Skeleton className="h-4 w-2/3" />
              </div>
              
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                 <Skeleton className="h-[180px] rounded-xl" />
                 <Skeleton className="h-[180px] rounded-xl" />
                 <Skeleton className="h-[180px] rounded-xl" />
              </div>

              <div className="space-y-4 pt-4">
                 <Skeleton className="h-[400px] w-full rounded-xl" />
              </div>
           </div>
        </main>
      </div>
    </div>
  );
}
