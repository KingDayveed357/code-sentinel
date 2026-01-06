"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CreditCard, Check, Zap, Database, Activity, TrendingUp, Shield, Infinity, RefreshCw, AlertCircle, Info } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { useEntitlements } from "@/hooks/use-entitlements"
import { useWorkspace } from "@/hooks/use-workspace"
import { useWorkspaceChangeListener } from "@/hooks/use-workspace-change-listener"
import { BillingPageSkeleton } from "@/components/dashboard/billing-skeleton"

export default function BillingPage() {
  const { user } = useAuth()
  const { workspace, isTeamWorkspace, initializing } = useWorkspace()
  const { 
    entitlements, 
    loading, 
    error,
    refresh,
    isApproachingLimit,
    isLimitExceeded,
    getUsagePercentage,
    formatLimit 
  } = useEntitlements()

  // Listen to workspace changes and invalidate entitlements queries
  useWorkspaceChangeListener()

  const currentPlan = user?.plan?.toLowerCase() || "free"

  // ✅ FIX: Check if user is the owner of the team workspace
  const isTeamWorkspaceNonOwner = isTeamWorkspace && workspace?.owner_id !== user?.id

  // Show skeleton during initial load or workspace transitions
  if (initializing || (loading && !entitlements)) {
    return <BillingPageSkeleton />;
  }

  const plans = [
    {
      id: "free",
      name: "Free",
      price: "$0",
      period: "forever",
      description: "Perfect for getting started",
      features: [
        "5 repositories",
        "10 scans per month",
        "1 concurrent scan",
        "Basic vulnerability detection",
        "Community support"
      ],
      limits: {
        repositories: 5,
        scans: 10,
        concurrent: 1
      },
      cta: "Current Plan",
      isCurrent: currentPlan === "free",
    },
    {
      id: "dev",
      name: "Dev",
      price: "$10",
      period: "/month",
      description: "For individual developers",
      features: [
        "20 repositories",
        "100 scans per month",
        "3 concurrent scans",
        "Advanced AI fix suggestions",
        "Auto-scan on push",
        "Email support",
        "7-day free trial"
      ],
      limits: {
        repositories: 20,
        scans: 100,
        concurrent: 3
      },
      cta: "Upgrade Now",
      isCurrent: currentPlan === "dev",
    },
    {
      id: "team",
      name: "Team",
      price: "$29",
      period: "/month",
      description: "For engineering teams",
      features: [
        "100 repositories",
        "Unlimited scans",
        "10 concurrent scans",
        "Team collaboration",
        "Priority CI/CD integration",
        "Priority support",
        "14-day free trial"
      ],
      limits: {
        repositories: 100,
        scans: null,
        concurrent: 10
      },
      cta: "Current Plan",
      isCurrent: currentPlan === "team",
      popular: true,
    },
    {
      id: "enterprise",
      name: "Enterprise",
      price: "Custom",
      period: "pricing",
      description: "For large organizations",
      features: [
        "Unlimited repositories",
        "Unlimited scans",
        "50 concurrent scans",
        "Single Sign-On (SSO)",
        "Dedicated support engineer",
        "SLA guarantees",
        "Custom integrations"
      ],
      limits: {
        repositories: null,
        scans: null,
        concurrent: 50
      },
      cta: "Contact Sales",
      isCurrent: currentPlan === "enterprise",
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2 mb-2">
          <CreditCard className="h-8 w-8 text-primary" />
          Billing & Subscription
        </h1>
        <p className="text-muted-foreground">
          {isTeamWorkspaceNonOwner 
            ? "Billing is handled by the team owner" 
            : "Manage your subscription and billing information"}
        </p>
      </div>

      {/* Team Workspace Non-Owner Message */}
      {isTeamWorkspaceNonOwner && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            You're currently in a team workspace where you are not the owner. Billing and subscription management is handled by the team owner. 
            Switch to your personal workspace to manage your own billing.
          </AlertDescription>
        </Alert>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load usage data: {error.message}
            <Button 
              variant="outline" 
              size="sm" 
              className="ml-4"
              onClick={() => refresh()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Current Usage Card */}
      {!loading && entitlements && !isTeamWorkspaceNonOwner && (
        <Card className="border-primary">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Current Usage
                </CardTitle>
                <CardDescription>
                  {entitlements.plan} Plan • Resets {new Date(entitlements.period.resets_at).toLocaleDateString()}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-lg">
                  {entitlements.plan}
                </Badge>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={refresh}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {/* Scans Usage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">Monthly Scans</span>
                  </div>
                  {entitlements.limits.scans_per_month === null && (
                    <Infinity className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold">
                    {entitlements.usage.scans_this_month}
                    <span className="text-sm text-muted-foreground ml-1">
                      / {formatLimit(entitlements.limits.scans_per_month)}
                    </span>
                  </div>
                  {entitlements.limits.scans_per_month !== null && (
                    <Progress
                      value={getUsagePercentage('scans')}
                      className="h-2"
                    />
                  )}
                </div>
              </div>

              {/* Repositories Usage */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">Repositories</span>
                  </div>
                  {entitlements.limits.repositories === null && (
                    <Infinity className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold">
                    {entitlements.usage.repositories}
                    <span className="text-sm text-muted-foreground ml-1">
                      / {formatLimit(entitlements.limits.repositories)}
                    </span>
                  </div>
                  {entitlements.limits.repositories !== null && (
                    <Progress
                      value={getUsagePercentage('repositories')}
                      className="h-2"
                    />
                  )}
                </div>
              </div>

              {/* Concurrent Scans */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Active Scans</span>
                </div>
                <div className="space-y-1">
                  <div className="text-2xl font-bold">
                    {entitlements.usage.concurrent_scans}
                    <span className="text-sm text-muted-foreground ml-1">
                      / {entitlements.limits.concurrent_scans}
                    </span>
                  </div>
                  <Progress
                    value={getUsagePercentage('concurrent')}
                    className="h-2"
                  />
                </div>
              </div>
            </div>

            {/* Usage Warnings */}
            {isLimitExceeded('scans') && (
              <Alert variant="destructive">
                <TrendingUp className="h-4 w-4" />
                <AlertDescription>
                  You've reached your monthly scan limit. Upgrade your plan to continue scanning.
                </AlertDescription>
              </Alert>
            )}

            {isApproachingLimit('scans') && !isLimitExceeded('scans') && (
              <Alert>
                <TrendingUp className="h-4 w-4" />
                <AlertDescription>
                  You've used {Math.round(getUsagePercentage('scans'))}% 
                  of your monthly scan limit. Consider upgrading for unlimited scans.
                </AlertDescription>
              </Alert>
            )}

            {isApproachingLimit('repositories') && (
              <Alert>
                <Database className="h-4 w-4" />
                <AlertDescription>
                  You're approaching your repository limit. Current: {entitlements.usage.repositories} / {formatLimit(entitlements.limits.repositories)}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && !entitlements && (
        <Card className="border-primary">
          <CardContent className="py-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading usage data...</p>
          </CardContent>
        </Card>
      )}

      {/* Plans Grid - Show in personal workspace OR if user is team owner */}
      {!isTeamWorkspaceNonOwner && (
        <div>
          <h2 className="text-2xl font-bold mb-6">Choose Your Plan</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`flex flex-col ${plan.popular ? "border-primary border-2 relative" : ""} ${plan.isCurrent ? "opacity-75" : ""}`}
            >
              {plan.popular && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</Badge>}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  <span className="text-muted-foreground ml-1">{plan.period}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-3 mb-6 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  variant={plan.isCurrent ? "outline" : "default"}
                  disabled={plan.isCurrent}
                >
                  {plan.cta}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      )}

      {/* Payment Method - Show in personal workspace OR if user is team owner */}
      {!isTeamWorkspaceNonOwner && (
        <Card>
        <CardHeader>
          <CardTitle>Payment Method</CardTitle>
          <CardDescription>Manage your billing information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <div className="h-10 w-14 bg-gradient-to-br from-blue-500 to-purple-500 rounded flex items-center justify-center text-white font-bold text-xs">
                VISA
              </div>
              <div>
                <p className="font-medium">•••• •••• •••• 4242</p>
                <p className="text-sm text-muted-foreground">Expires 12/25</p>
              </div>
            </div>
            <Button variant="outline" size="sm">Update</Button>
          </div>
          <Button variant="outline" className="w-full">
            Add Payment Method
          </Button>
        </CardContent>
      </Card>
      )}

      {/* Payment History - Show in personal workspace OR if user is team owner */}
      {!isTeamWorkspaceNonOwner && (
        <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>Your recent invoices and payments</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { date: "Feb 15, 2024", amount: "$29.00", status: "Paid", plan: "Team" },
              { date: "Jan 15, 2024", amount: "$29.00", status: "Paid", plan: "Team" },
              { date: "Dec 15, 2023", amount: "$29.00", status: "Paid", plan: "Team" },
            ].map((invoice) => (
              <div key={invoice.date} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-medium">{invoice.date}</p>
                  <p className="text-sm text-muted-foreground">{invoice.plan} Plan • {invoice.amount}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{invoice.status}</Badge>
                  <Button variant="ghost" size="sm">
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  )
}