"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  User,
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

export default function AccountPage() {
  const { theme: currentTheme, setTheme } = useTheme()
  const { user, refreshUser, logout } = useAuth()
  const [mounted, setMounted] = useState(false)
  
  // State
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [weeklySummary, setWeeklySummary] = useState(true)
  const [timezone, setTimezone] = useState("auto")
  const [syncing, setSyncing] = useState(false)
  
  // Delete account dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteUsername, setDeleteUsername] = useState("")
  const [deleting, setDeleting] = useState(false)

  const username = user?.full_name || user?.email?.split("@")[0] || "user"

  useEffect(() => {
    setMounted(true)
  }, [])

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

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ]

  if (!mounted) {
    return null
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            {/* <User className="h-8 w-8 text-primary" /> */}
            Account Settings
          </h1>
          <p className="text-muted-foreground">
            Manage your personal profile, preferences, and security
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
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
    </>
  )
}
