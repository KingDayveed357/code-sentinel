"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  Settings, 
  Github, 
  Sun, 
  Moon, 
  Monitor, 
  Bell, 
  Mail, 
  Globe, 
  Shield, 
  AlertTriangle,
  ExternalLink,
  RefreshCw
} from "lucide-react"
import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { useAuth } from "@/hooks/use-auth"
import { authApi } from "@/lib/api/auth"
import { integrationsApi } from "@/lib/api/integrations"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Alert,
  AlertDescription,
} from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { useWorkspace } from "@/hooks/use-workspace"
import { useWorkspaceChangeListener } from "@/hooks/use-workspace-change-listener"

export default function SettingsPage() {
  const { theme: currentTheme, setTheme } = useTheme()
  const { user, refreshUser, logout } = useAuth()
  const { workspace } = useWorkspace()
  const [mounted, setMounted] = useState(false)
  
  // Listen to workspace changes and invalidate queries
  useWorkspaceChangeListener()
  
  // State
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [weeklySummary, setWeeklySummary] = useState(true)
  const [timezone, setTimezone] = useState("auto")
  const [syncing, setSyncing] = useState(false)
  const [integrations, setIntegrations] = useState<any[]>([])
  const [loadingIntegrations, setLoadingIntegrations] = useState(true)
  
  // Delete account dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteUsername, setDeleteUsername] = useState("")
  const [deleting, setDeleting] = useState(false)
  
  // Disconnect dialog
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false)
  const [disconnectProvider, setDisconnectProvider] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  const username = user?.full_name || user?.email?.split("@")[0] || "user"

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    loadIntegrations()
  }, [])

  const loadIntegrations = async () => {
    try {
      setLoadingIntegrations(true)
      const { integrations: data } = await integrationsApi.getIntegrations()
      setIntegrations(data)
    } catch (error: any) {
      console.error("Failed to load integrations:", error)
      toast.error(
        <div>
          <strong>Failed to load integrations</strong>
          <p>{error.message || 'Please try again'}</p>
        </div>
      )
    } finally {
      setLoadingIntegrations(false)
    }
  }

  const handleResyncGitHub = async () => {
    try {
      setSyncing(true)
      await authApi.resyncGitHub()
      await refreshUser()
      toast.success("GitHub data synced successfully")
    } catch (error: any) {
      console.error("Resync failed:", error)
      toast.error(
        <div>
          <strong>Sync failed</strong>
          <p>{error.message}</p>
        </div>
      )
    } finally {
      setSyncing(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteUsername !== username) {
      toast.error(
        <div>
          <strong>Username mismatch</strong>
          <p>The username you entered does not match your account</p>
        </div>
      )
      return
    }

    try {
      setDeleting(true)
      await authApi.deleteAccount(deleteUsername)
      toast.success("Account deleted successfully")
      setDeleteDialogOpen(false)
      
      // Sign out and redirect
      setTimeout(() => {
        logout()
      }, 1000)
    } catch (error: any) {
      console.error("Delete account failed:", error)
      toast.error(
        <div>
          <strong>Delete failed</strong>
          <p>{error.message}</p>
        </div>
      )
    } finally {
      setDeleting(false)
    }
  }

  const handleDisconnectIntegration = async () => {
    if (!disconnectProvider) return

    try {
      setDisconnecting(true)
      const result = await integrationsApi.disconnectIntegration(disconnectProvider)
      
      toast.success(result.message)
      setDisconnectDialogOpen(false)
      setDisconnectProvider(null)
      
      // Reload integrations
      await loadIntegrations()
      
      // If GitHub was disconnected, sign out
      if (result.requiresSignOut) {
        toast(
          <div>
            <strong>Signing you out</strong>
            <p>Signing you out...</p>
          </div>
        )
        setTimeout(() => {
          logout()
        }, 1500)
      }
    } catch (error: any) {
      console.error("Disconnect failed:", error)
      toast.error(
        <div>
          <strong>Disconnect failed</strong>
          <p>{error.message}</p>
        </div>
      )
    } finally {
      setDisconnecting(false)
    }
  }

  const openDisconnectDialog = (provider: string) => {
    setDisconnectProvider(provider)
    setDisconnectDialogOpen(true)
  }

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ]

  const connectedIntegrations = integrations.filter(i => i.connected)
  const githubIntegration = integrations.find(i => i.provider === "github" && i.connected)

  if (!mounted) {
    return null
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            Settings
          </h1>
          <p className="text-muted-foreground">
            Manage your account preferences and security settings
          </p>
        </div>

        <Tabs defaultValue="account" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="account">Account</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          {/* Account Tab */}
          <TabsContent value="account" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>GitHub Account</CardTitle>
                <CardDescription>
                  Your account information is synced from GitHub
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="flex items-center justify-between py-3 border-b">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Username</Label>
                      <p className="text-sm text-muted-foreground">{username}</p>
                    </div>
                    <Badge variant="secondary">GitHub</Badge>
                  </div>

                  <div className="flex items-center justify-between py-3 border-b">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Email</Label>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>
                    <Badge variant="secondary">GitHub</Badge>
                  </div>

                  <div className="flex items-center justify-between py-3">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-medium">Full Name</Label>
                      <p className="text-sm text-muted-foreground">{user?.full_name || "Not set"}</p>
                    </div>
                    <Badge variant="secondary">GitHub</Badge>
                  </div>
                </div>

                <div className="pt-2">
                  <Button 
                    variant="outline" 
                    onClick={handleResyncGitHub}
                    disabled={syncing}
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Re-sync GitHub Data'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>
                  Irreversible actions that affect your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Deleting your account will remove all your data, scan history, and configurations. This action cannot be undone.
                  </AlertDescription>
                </Alert>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  Delete Account
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sun className="h-5 w-5" />
                  Appearance
                </CardTitle>
                <CardDescription>
                  Customize how CodeSentinel looks on your device
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>Theme</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {themeOptions.map((option) => {
                      const Icon = option.icon
                      return (
                        <button
                          key={option.value}
                          onClick={() => setTheme(option.value)}
                          className={`
                            flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all
                            ${currentTheme === option.value 
                              ? 'border-primary bg-primary/5' 
                              : 'border-border hover:border-muted-foreground/50'
                            }
                          `}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="text-sm font-medium">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Notifications
                </CardTitle>
                <CardDescription>
                  Configure how you receive updates and alerts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Email Notifications</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Receive alerts for new vulnerabilities and scan results
                    </p>
                  </div>
                  <Button 
                    variant={emailNotifications ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEmailNotifications(!emailNotifications)}
                  >
                    {emailNotifications ? "Enabled" : "Disabled"}
                  </Button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-medium">Weekly Summary</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Get a weekly digest of your security posture
                    </p>
                  </div>
                  <Button 
                    variant={weeklySummary ? "default" : "outline"}
                    size="sm"
                    onClick={() => setWeeklySummary(!weeklySummary)}
                  >
                    {weeklySummary ? "Enabled" : "Disabled"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Localization
                </CardTitle>
                <CardDescription>
                  Set your timezone and regional preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect (UTC+1)</SelectItem>
                      <SelectItem value="utc">UTC</SelectItem>
                      <SelectItem value="est">Eastern Time (EST)</SelectItem>
                      <SelectItem value="pst">Pacific Time (PST)</SelectItem>
                      <SelectItem value="cet">Central European Time (CET)</SelectItem>
                      <SelectItem value="jst">Japan Standard Time (JST)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    Used for displaying scan times and scheduling reports
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Tab */}
          <TabsContent value="security" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  OAuth Connections
                </CardTitle>
                <CardDescription>
                  Manage your connected authentication providers
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingIntegrations ? (
                  <div className="text-center py-4 text-muted-foreground">
                    Loading integrations...
                  </div>
                ) : githubIntegration ? (
                  <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-card">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                        <Github className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium">GitHub</p>
                        <p className="text-sm text-muted-foreground">
                          Connected as {username}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400">
                        Active
                      </Badge>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openDisconnectDialog("github")}
                        disabled={connectedIntegrations.length === 1}
                      >
                        Disconnect
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    No GitHub integration found
                  </div>
                )}

                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Warning:</strong> Disconnecting GitHub will immediately:
                    <ul className="list-disc ml-5 mt-2 space-y-1">
                      <li>Sign you out of your account</li>
                      <li>Block you from logging in until you reconnect</li>
                      <li>Disable all project scanning capabilities</li>
                      <li>Remove access to your repositories</li>
                    </ul>
                    {connectedIntegrations.length === 1 && (
                      <p className="mt-2 font-semibold text-destructive">
                        You cannot disconnect your only authentication provider. This would permanently lock you out.
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>OAuth Application Access</CardTitle>
                <CardDescription>
                  Review and manage CodeSentinel's permissions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm font-medium">Repository access</span>
                    <Badge variant="outline">Read & Write</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm font-medium">Webhook management</span>
                    <Badge variant="outline">Enabled</Badge>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm font-medium">Pull request checks</span>
                    <Badge variant="outline">Enabled</Badge>
                  </div>
                </div>

                <div className="pt-4">
                  <Button variant="outline" className="w-full" asChild>
                    <a 
                      href="https://github.com/settings/applications" 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      View on GitHub
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Account Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Account
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                All of your data including:
                <ul className="list-disc ml-5 mt-2">
                  <li>Scan history and results</li>
                  <li>Project configurations</li>
                  <li>Integration settings</li>
                  <li>User preferences</li>
                </ul>
                will be permanently deleted.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="delete-username">
                Please type <span className="font-mono font-bold">{username}</span> to confirm
              </Label>
              <Input
                id="delete-username"
                placeholder="Enter your username"
                value={deleteUsername}
                onChange={(e) => setDeleteUsername(e.target.value)}
                disabled={deleting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setDeleteUsername("")
              }}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={deleteUsername !== username || deleting}
            >
              {deleting ? "Deleting..." : "Delete Account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Integration Dialog */}
      <Dialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Disconnect {disconnectProvider?.charAt(0).toUpperCase()}{disconnectProvider?.slice(1)}
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect your {disconnectProvider} integration?
            </DialogDescription>
          </DialogHeader>
          
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>This will immediately:</strong>
              <ul className="list-disc ml-5 mt-2 space-y-1">
                <li><strong>Sign you out</strong> and end your current session</li>
                <li><strong>Block scanning</strong> until you reconnect</li>
                <li><strong>Remove repository access</strong> from CodeSentinel</li>
                <li>Require you to <strong>reconnect {disconnectProvider}</strong> to log in again</li>
              </ul>
              <p className="mt-3 font-semibold">
                You will need to authenticate with {disconnectProvider} again to regain access.
              </p>
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDisconnectDialogOpen(false)
                setDisconnectProvider(null)
              }}
              disabled={disconnecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnectIntegration}
              disabled={disconnecting}
            >
              {disconnecting ? "Disconnecting..." : "Yes, Disconnect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}