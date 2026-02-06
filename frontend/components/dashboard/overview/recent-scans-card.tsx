"use client"

import { memo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  AlertTriangle,
  CheckCircle2,
  Shield,
  GitBranch,
  Clock,
} from "lucide-react"
import Link from "next/link"
import type { RecentScan } from "@/lib/api/dashboard"

interface RecentScansCardProps {
  scans: RecentScan[]
}

/**
 * FIXED: Duration now displays in minutes when > 59 seconds
 */
export const RecentScansCard = memo(function RecentScansCard({ scans }: RecentScansCardProps) {
  if (scans.length === 0) {
    return <EmptyScansState />
  }

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 animate-in fade-in-50 slide-in-from-bottom-4" style={{ animationDelay: '450ms' }}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-border/50">
        <CardTitle>Recent Scans</CardTitle>
        <Button variant="ghost" size="sm" asChild className="hover:bg-muted/50">
          <Link href="/dashboard/projects">View All Projects</Link>
        </Button>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-3">
          {scans.map((scan, index) => (
            <ScanItem key={scan.id} scan={scan} index={index} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
})

const EmptyScansState = memo(function EmptyScansState() {
  return (
    <Card className="overflow-hidden animate-in fade-in-50 slide-in-from-bottom-4" style={{ animationDelay: '450ms' }}>
      <CardHeader>
        <CardTitle>Recent Scans</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center animate-in zoom-in-50" style={{ animationDelay: '600ms' }}>
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 ring-4 ring-primary/5">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <p className="text-sm font-semibold mb-1">No scans yet</p>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs">
            Run your first security scan to get started
          </p>
          <Button asChild>
            <Link href="/dashboard/projects">
              <GitBranch className="mr-2 h-4 w-4" />
              Go to Projects
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
})

/**
 * Helper function to format duration
 * FIXED: Converts seconds to minutes when > 59 seconds
 */
function formatDuration(duration: string): string {
  // Extract number from string like "280.5s" or "45s"
  const match = duration.match(/^([\d.]+)s?$/);
  if (!match) return duration;

  const seconds = parseFloat(match[1]);
  
  if (seconds > 59) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    
    if (remainingSeconds === 0) {
      return `${minutes}m`;
    }
    return `${minutes}m ${remainingSeconds}s`;
  }
  
  return `${Math.round(seconds)}s`;
}

const ScanItem = memo(function ScanItem({ 
  scan, 
  index 
}: { 
  scan: RecentScan
  index: number 
}) {
  const hasVulnerabilities = scan.vulnerabilities > 0
  const formattedDuration = formatDuration(scan.duration)

  return (
    <div
      className="group flex items-center justify-between p-4 rounded-lg border border-border/50 hover:border-border hover:bg-muted/20 transition-all duration-200 animate-in fade-in-50 slide-in-from-bottom-2"
      style={{ animationDelay: `${500 + index * 75}ms` }}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-lg ring-2 transition-all duration-200 ${
            hasVulnerabilities 
              ? "bg-red-50 dark:bg-red-950/20 ring-red-100 dark:ring-red-900/30 group-hover:ring-red-200 dark:group-hover:ring-red-800/40" 
              : "bg-green-50 dark:bg-green-950/20 ring-green-100 dark:ring-green-900/30 group-hover:ring-green-200 dark:group-hover:ring-green-800/40"
          }`}
        >
          {hasVulnerabilities ? (
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Link 
              href={`/dashboard/projects/${scan.repo_id}`}
              className="text-sm font-semibold hover:text-primary transition-colors truncate"
            >
              {scan.repo}
            </Link>
            <Badge variant="outline" className="text-xs">
              <GitBranch className="h-3 w-3 mr-1" />
              {scan.branch}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            {hasVulnerabilities ? (
              <div className="flex items-center gap-2">
                {scan.critical > 0 && (
                  <Badge variant="destructive" className="text-xs px-1.5 py-0 h-5">
                    {scan.critical} C
                  </Badge>
                )}
                {scan.high > 0 && (
                  <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400 text-xs px-1.5 py-0 h-5 hover:bg-orange-100 dark:hover:bg-orange-950">
                    {scan.high} H
                  </Badge>
                )}
                {scan.medium > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400 text-xs px-1.5 py-0 h-5 hover:bg-yellow-100 dark:hover:bg-yellow-950">
                    {scan.medium} M
                  </Badge>
                )}
                {scan.low > 0 && (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 text-xs px-1.5 py-0 h-5 hover:bg-green-100 dark:hover:bg-green-950">
                    {scan.low} L
                  </Badge>
                )}
              </div>
            ) : (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 text-xs h-5 hover:bg-green-100 dark:hover:bg-green-950">
                Clean
              </Badge>
            )}
            <span>•</span>
            <span className="font-medium">{formattedDuration}</span>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{scan.timestamp}</span>
            </div>
          </div>
        </div>
      </div>

      <Button 
        variant="ghost" 
        size="sm" 
        asChild 
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
      >
        <Link href={`/dashboard/scans/${scan.id}`}>
          View Report
        </Link>
      </Button>
    </div>
  )
})