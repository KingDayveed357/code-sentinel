"use client"

import { memo, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { SecurityScore } from "@/lib/api/dashboard"

interface SecurityScoreCardProps {
  score: SecurityScore
}


export const SecurityScoreCard = memo(function SecurityScoreCard({ score }: SecurityScoreCardProps) {
  const severityItems = useMemo(() => [
    { label: "Critical", count: score.critical, color: "bg-red-500" },
    { label: "High", count: score.high, color: "bg-orange-500" },
    { label: "Medium", count: score.medium, color: "bg-yellow-500" },
    { label: "Low", count: score.low, color: "bg-green-500" },
  ], [score])

  const circumference = 2 * Math.PI * 56
  const dashOffset = circumference * (1 - score.overall / 100)

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 animate-in fade-in-50 slide-in-from-left-4" style={{ animationDelay: '150ms' }}>
      <CardHeader>
        <CardTitle>Overall Security Score</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <svg className="h-32 w-32 transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-muted/20"
              />
              {/* Progress circle with gradient */}
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--primary) / 0.6)" />
                </linearGradient>
              </defs>
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="url(#scoreGradient)"
                strokeWidth="8"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-all duration-1000 ease-out"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-3xl font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
                  {score.overall}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Across all projects
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {severityItems.map((item, index) => (
            <div 
              key={item.label} 
              className="flex items-center justify-between text-sm group hover:bg-muted/30 -mx-2 px-2 py-1.5 rounded-lg transition-colors duration-200 animate-in fade-in-50 slide-in-from-left-2"
              style={{ animationDelay: `${300 + index * 50}ms` }}
            >
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full ${item.color} ring-2 ring-background group-hover:scale-110 transition-transform duration-200`} />
                <span className="font-medium">{item.label}</span>
              </div>
              <span className="font-semibold tabular-nums">{item.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})