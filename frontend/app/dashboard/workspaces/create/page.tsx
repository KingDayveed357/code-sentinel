"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Users,
  Building2,
  Sparkles,
  Check,
  X,
  Mail,
  Shield,
  Eye,
  ArrowRight,
  Plus,
  Trash2,
  Info,
  Loader2
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/hooks/use-auth"
import { useWorkspace, useWorkspaces } from "@/hooks/use-workspace"
import { inviteMember } from "@/lib/api/workspaces"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TeamMemberInvite {
  id: string
  email: string
  role: 'admin' | 'developer' | 'viewer'
}

export default function CreateWorkspacePage() {
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const { switchWorkspace } = useWorkspace()
  const { createWorkspace } = useWorkspaces()
  
  const [step, setStep] = useState<'details' | 'members' | 'confirm'>(user?.plan === 'Free' || user?.plan === 'Dev' ? 'details' : 'details')
  const [workspaceName, setWorkspaceName] = useState("")
  const [workspaceSlug, setWorkspaceSlug] = useState("")
  const [members, setMembers] = useState<TeamMemberInvite[]>([])
  const [newMemberEmail, setNewMemberEmail] = useState("")
  const [newMemberRole, setNewMemberRole] = useState<'admin' | 'developer' | 'viewer'>('developer')
  const [creating, setCreating] = useState(false)
  const [slugError, setSlugError] = useState("")

  const userPlan = user?.plan || 'Free'
  const canCreateTeam = ['Team', 'Enterprise'].includes(userPlan)

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    setWorkspaceName(name)
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    setWorkspaceSlug(slug)
    setSlugError("")
  }

  const handleSlugChange = (slug: string) => {
    const sanitized = slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
    setWorkspaceSlug(sanitized)
    
    if (sanitized.length < 3) {
      setSlugError("Slug must be at least 3 characters")
    } else if (sanitized.length > 50) {
      setSlugError("Slug must be less than 50 characters")
    } else {
      setSlugError("")
    }
  }

  const addMember = () => {
    if (!newMemberEmail) return
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newMemberEmail)) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid email address",
        variant: "destructive",
      })
      return
    }

    // Check for duplicates
    if (members.some(m => m.email === newMemberEmail)) {
      toast({
        title: "Duplicate email",
        description: "This member has already been added",
        variant: "destructive",
      })
      return
    }

    setMembers([...members, {
      id: Math.random().toString(36).substr(2, 9),
      email: newMemberEmail,
      role: newMemberRole,
    }])
    setNewMemberEmail("")
    setNewMemberRole('developer')
  }

  const removeMember = (id: string) => {
    setMembers(members.filter(m => m.id !== id))
  }

  const handleCreateWorkspace = async () => {
    if (!canCreateTeam) {
      toast({
        title: "Upgrade required",
        description: "Please upgrade to Team or Enterprise plan to create team workspaces",
        variant: "destructive",
      })
      return
    }

    if (!workspaceName || !workspaceSlug) {
      toast({
        title: "Missing information",
        description: "Please provide a workspace name and slug",
        variant: "destructive",
      })
      return
    }

    if (slugError) {
      toast({
        title: "Invalid slug",
        description: slugError,
        variant: "destructive",
      })
      return
    }

    try {
      setCreating(true)

      // Create workspace using hook (automatically updating list)
      const workspace = await createWorkspace({
        name: workspaceName,
        type: 'team',
      })

      // Invite members using API client
      if (members.length > 0) {
        await Promise.all(
          members.map(member =>
            inviteMember(workspace.id, {
              email: member.email,
              role: member.role as any, // Map to WorkspaceRole
            })
          )
        )
      }

      toast({
        title: "Workspace created!",
        description: `${workspaceName} has been created successfully`,
      })

      // Switch to new workspace immediately
      await switchWorkspace(workspace.id)

      // Redirect to dashboard (context already updated)
      router.push('/dashboard')
    } catch (error: any) {
      console.error('Failed to create workspace:', error)
      toast({
        title: "Failed to create workspace",
        description: error.message || "Please try again",
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="h-4 w-4 text-blue-500" />
      case 'viewer':
        return <Eye className="h-4 w-4 text-gray-500" />
      default:
        return <Users className="h-4 w-4 text-green-500" />
    }
  }

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "outline" => {
    switch (role) {
      case 'admin':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-2">Create Team Workspace</h1>
          <p className="text-muted-foreground text-lg">
            Collaborate with your team on security scans
          </p>
        </div>

        {/* Upgrade Banner for Free/Dev Users */}
        {!canCreateTeam && (
          <Alert className="mb-6 border-primary bg-primary/5">
            <Sparkles className="h-4 w-4 text-primary" />
            <AlertDescription className="flex items-center justify-between">
              <span>
                <strong>Upgrade to Team plan</strong> to create team workspaces and collaborate with your team
              </span>
              <Button size="sm" className="ml-4">
                Upgrade Now
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className={`flex items-center gap-2 ${step === 'details' ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === 'details' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              1
            </div>
            <span className="font-medium hidden sm:inline">Details</span>
          </div>
          <div className="h-px w-12 bg-border" />
          <div className={`flex items-center gap-2 ${step === 'members' ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === 'members' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              2
            </div>
            <span className="font-medium hidden sm:inline">Members</span>
          </div>
          <div className="h-px w-12 bg-border" />
          <div className={`flex items-center gap-2 ${step === 'confirm' ? 'text-primary' : 'text-muted-foreground'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              step === 'confirm' ? 'bg-primary text-primary-foreground' : 'bg-muted'
            }`}>
              3
            </div>
            <span className="font-medium hidden sm:inline">Confirm</span>
          </div>
        </div>

        {/* Main Card */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle>
              {step === 'details' && 'Workspace Details'}
              {step === 'members' && 'Invite Team Members'}
              {step === 'confirm' && 'Review & Create'}
            </CardTitle>
            <CardDescription>
              {step === 'details' && 'Choose a name and identifier for your workspace'}
              {step === 'members' && 'Add team members to collaborate (optional)'}
              {step === 'confirm' && 'Review your workspace settings before creating'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Step 1: Details */}
            {step === 'details' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Workspace Name *</Label>
                  <Input
                    id="name"
                    placeholder="Acme Security Team"
                    value={workspaceName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    disabled={!canCreateTeam}
                  />
                  <p className="text-xs text-muted-foreground">
                    This will be visible to all team members
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">Workspace Slug *</Label>
                  <Input
                    id="slug"
                    placeholder="acme-security-team"
                    value={workspaceSlug}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    disabled={!canCreateTeam}
                  />
                  {slugError && (
                    <p className="text-xs text-destructive">{slugError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Used in URLs: /workspace/{workspaceSlug || 'your-slug'}
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => router.back()}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => setStep('members')}
                    disabled={!workspaceName || !workspaceSlug || !!slugError || !canCreateTeam}
                  >
                    Next: Add Members
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Members */}
            {step === 'members' && (
              <div className="space-y-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    You can skip this step and invite members later from the Members page
                  </AlertDescription>
                </Alert>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@example.com"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addMember()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={newMemberRole} onValueChange={(value: any) => setNewMemberRole(value)}>
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="developer">Developer</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={addMember} variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>

                {/* Members List */}
                {members.length > 0 && (
                  <div className="space-y-2">
                    <Label>Team Members ({members.length})</Label>
                    <div className="space-y-2">
                      {members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{member.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {getRoleIcon(member.role)}
                            <Badge variant={getRoleBadgeVariant(member.role)}>
                              {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeMember(member.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between gap-2 pt-4">
                  <Button variant="outline" onClick={() => setStep('details')}>
                    Back
                  </Button>
                  <Button onClick={() => setStep('confirm')}>
                    Next: Review
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Confirm */}
            {step === 'confirm' && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-muted-foreground">Workspace Name</Label>
                    <p className="text-lg font-semibold">{workspaceName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Workspace Slug</Label>
                    <p className="text-lg font-mono">{workspaceSlug}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Team Members</Label>
                    <p className="text-lg font-semibold">
                      {members.length === 0 ? 'None (you can add later)' : `${members.length} member${members.length > 1 ? 's' : ''} to invite`}
                    </p>
                  </div>
                </div>

                {members.length > 0 && (
                  <div className="border rounded-lg p-4 space-y-2">
                    <Label>Invitations will be sent to:</Label>
                    <ul className="space-y-1">
                      {members.map((member) => (
                        <li key={member.id} className="flex items-center gap-2 text-sm">
                          <Check className="h-4 w-4 text-green-500" />
                          <span>{member.email}</span>
                          <Badge variant="outline" className="text-xs">
                            {member.role}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Your workspace will be created with your current plan: <strong>{userPlan}</strong>
                  </AlertDescription>
                </Alert>

                <div className="flex justify-between gap-2 pt-4">
                  <Button variant="outline" onClick={() => setStep('members')}>
                    Back
                  </Button>
                  <Button onClick={handleCreateWorkspace} disabled={creating}>
                    {creating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Create Workspace
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Features Preview */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">Team Collaboration</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Invite unlimited team members and collaborate on security scans
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">Role-Based Access</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Control permissions with Owner, Admin, Member, and Viewer roles
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 backdrop-blur">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">Premium Features</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Unlimited scans, 100 repositories, and priority support
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
