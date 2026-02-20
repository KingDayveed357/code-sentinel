"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  Settings, 
  CreditCard, 
  Users, 
  Shield, 
  AlertTriangle,
  RefreshCw,
  Building2
} from "lucide-react"
import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { useWorkspace } from "@/hooks/use-workspace"
import { useWorkspaceChangeListener } from "@/hooks/use-workspace-change-listener"
import { toast } from "sonner"
import { useRouter, useSearchParams } from "next/navigation"
import { BillingUsage } from "@/components/dashboard/settings/billing/billing-usage"
import { PlanCards } from "@/components/dashboard/settings/billing/plan-cards"
import { PaymentHistory } from "@/components/dashboard/settings/billing/payment-history"

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = searchParams.get('tab') || 'general'
  
  const { user } = useAuth()
  const { workspace, updateWorkspace, plan, billingStatus, isBillingActive, role } = useWorkspace()
  const [mounted, setMounted] = useState(false)
  
  // Listen to workspace changes
  useWorkspaceChangeListener()
  
  // State
  const [name, setName] = useState(workspace?.name || "")
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (workspace) {
      setName(workspace.name)
    }
  }, [workspace])

  const handleUpdateWorkspace = async () => {
    if (!workspace) return
    try {
      setUpdating(true)
      await updateWorkspace(workspace.id, { name })
      toast.success("Workspace updated successfully")
    } catch (error: any) {
      toast.error("Failed to update workspace")
    } finally {
      setUpdating(false)
    }
  }

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`/dashboard/settings?${params.toString()}`)
  }

  if (!mounted) {
    return null
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <p className="text-muted-foreground">Loading workspace settings...</p>
      </div>
    )
  }

  const isOwner = role === 'owner'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          Workspace Settings
        </h1>
        <p className="text-muted-foreground">
          Manage {workspace.name}'s configuration and billing
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <CardDescription>
                How your workspace appears to you and your team
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Workspace Name</Label>
                <Input 
                  id="name" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isOwner || updating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Workspace Slug</Label>
                <Input 
                  id="slug" 
                  value={workspace.slug} 
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  The unique identifier for your workspace in URLs
                </p>
              </div>
              <div className="pt-2">
                <Button 
                  onClick={handleUpdateWorkspace} 
                  disabled={!isOwner || updating || name === workspace.name}
                >
                  {updating ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workspace Identity</CardTitle>
              <CardDescription>
                Metadata about this workspace
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Type</Label>
                  <p className="text-sm text-muted-foreground capitalize">{workspace.type} Workspace</p>
                </div>
                <Building2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Plan</Label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground">{plan}</p>
                    <Badge variant={isBillingActive ? "default" : "secondary"}>
                      {isBillingActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-8 animate-in fade-in-50 duration-500">
          <div className="grid gap-8">
            {/* 1. Usage Overview */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <RefreshCw className="h-5 w-5 text-primary" />
                  Usage Overview
                </h3>
              </div>
              <BillingUsage />
            </section>

            {/* 2. Plans & Comparison */}
            <section className="space-y-4 pt-4">
              <div className="space-y-1">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Subscription Plans
                </h3>
                <p className="text-sm text-muted-foreground">Select the best plan for your team's needs</p>
              </div>
              <PlanCards />
            </section>

            {/* 3. Payment History & Methods */}
            <section className="space-y-4 pt-4">
              <div className="space-y-1">
                <h3 className="text-xl font-bold">Billing & Invoices</h3>
                <p className="text-sm text-muted-foreground">Manage your payment methods and view history</p>
              </div>
              <PaymentHistory />
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}