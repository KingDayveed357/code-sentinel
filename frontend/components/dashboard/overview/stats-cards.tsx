"use client"

import { memo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, Shield, GitBranch, TrendingUp, LucideIcon } from "lucide-react"
import type { DashboardStats } from "@/lib/api/dashboard"

interface StatCardData {
  title: string
  value: string
  change: string
  trend: "up" | "down"
  icon: LucideIcon
  color: string
}

interface StatsCardsProps {
  stats: DashboardStats
}

/**
 * Premium stats cards with smooth animations and gradients
 * Memoized to prevent unnecessary re-renders
 */
export const StatsCards = memo(function StatsCards({ stats }: StatsCardsProps) {
  const statCards: StatCardData[] = [
    {
      title: "Total Vulnerabilities",
      value: stats.total_vulnerabilities.toString(),
      change: stats.changes.vulnerabilities,
      trend: stats.changes.vulnerabilities.startsWith('-') ? "down" : "up",
      icon: AlertTriangle,
      color: "text-red-500",
    },
    {
      title: "Repositories Scanned",
      value: stats.repositories_scanned.toString(),
      change: stats.changes.repositories,
      trend: stats.changes.repositories.startsWith('-') ? "down" : "up",
      icon: GitBranch,
      color: "text-blue-500",
    },
    {
      title: "Scans This Month",
      value: stats.scans_this_month.toString(),
      change: stats.changes.scans,
      trend: stats.changes.scans.startsWith('-') ? "down" : "up",
      icon: Shield,
      color: "text-green-500",
    },
    {
      title: "Resolution Rate",
      value: `${stats.resolution_rate}%`,
      change: stats.changes.resolution,
      trend: stats.changes.resolution.startsWith('-') ? "down" : "up",
      icon: TrendingUp,
      color: "text-purple-500",
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat, index) => (
        <StatCard key={stat.title} stat={stat} index={index} />
      ))}
    </div>
  )
})


const StatCard = memo(function StatCard({ 
  stat, 
  index 
}: { 
  stat: StatCardData
  index: number 
}) {
  const Icon = stat.icon
  
  return (
    <Card 
      className="overflow-hidden hover:shadow-lg transition-all duration-300 border-border/50 animate-in fade-in-50 slide-in-from-bottom-4"
      style={{ animationDelay: `${index * 75}ms` }}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {stat.title}
        </CardTitle>
        <div className={`h-9 w-9 rounded-lg bg-gradient-to-br from-background to-muted/20 flex items-center justify-center ring-1 ring-border/50`}>
          <Icon className={`h-4 w-4 ${stat.color}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
        <div className="flex items-center text-xs mt-1">
          <span className={`font-medium ${stat.trend === "down" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
            {stat.change}
          </span>
          <span className="text-muted-foreground ml-1">from last month</span>
        </div>
      </CardContent>
    </Card>
  )
})