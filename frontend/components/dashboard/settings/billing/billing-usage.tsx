"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Zap, Shield, Users } from "lucide-react";
import { useEntitlements } from "@/hooks/use-entitlements";
import { Skeleton } from "@/components/ui/skeleton";

export function BillingUsage() {
  const { entitlements, loading, getUsagePercentage, formatLimit } = useEntitlements();

  if (loading || !entitlements) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-6 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-2 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const usageMetrics = [
    {
      label: "Monthly Scans",
      type: "scans" as const,
      used: entitlements.usage.scans_this_month,
      limit: entitlements.limits.scans_per_month,
      icon: <Zap className="h-4 w-4 text-amber-500" />,
      color: "amber",
    },
    {
      label: "Repositories",
      type: "repositories" as const,
      used: entitlements.usage.repositories,
      limit: entitlements.limits.repositories,
      icon: <Shield className="h-4 w-4 text-blue-500" />,
      color: "blue",
    },
    {
      label: "Team Seats",
      type: "seats" as const,
      used: entitlements.usage.seats,
      limit: entitlements.limits.seats,
      icon: <Users className="h-4 w-4 text-green-500" />,
      color: "green",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {usageMetrics.map((metric) => {
        const percentage = getUsagePercentage(metric.type as any);
        const isNearLimit = percentage >= 80;
        const isExceeded = percentage >= 100;

        return (
          <Card key={metric.label} className="overflow-hidden border-2 transition-all hover:border-muted-foreground/20">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-full bg-${metric.color}-500/10`}>
                    {metric.icon}
                  </div>
                  <span className="text-sm font-semibold">{metric.label}</span>
                </div>
                {isNearLimit && (
                  <Badge variant={isExceeded ? "destructive" : "outline"} className="animate-pulse">
                    {isExceeded ? "Limit Reached" : "Near Limit"}
                  </Badge>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-baseline justify-between text-2xl font-bold">
                  {metric.used}
                  <span className="text-sm font-medium text-muted-foreground">
                    / {formatLimit(metric.limit)}
                  </span>
                </div>
                <Progress 
                  value={percentage} 
                  className={`h-2 ${isNearLimit ? "bg-muted" : "bg-muted"}`} 
                />
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  {metric.type === 'scans' && `Resets on ${new Date(entitlements.period.resets_at).toLocaleDateString()}`}
                  {metric.type === 'repositories' && "Total repositories managed"}
                  {metric.type === 'seats' && "Active members in workspace"}
                </p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
