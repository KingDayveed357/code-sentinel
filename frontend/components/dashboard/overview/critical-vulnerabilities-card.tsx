"use client"

import { memo, useState, useCallback, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  XCircle, 
  AlertCircle,
  CheckCircle2,
  MoreVertical,
  ExternalLink,
  UserPlus,
  FileText,
  Loader2,
  GitBranch,
  Clock,
} from "lucide-react"
import Link from "next/link"
import type { CriticalVulnerability } from "@/lib/api/dashboard"
import { CreateIssueDialog } from "../create-issue-dialog"

interface CriticalVulnerabilitiesCardProps {
  vulnerabilities: CriticalVulnerability[]
  canAccessTeam: boolean
  onUpgradeRequired: () => void
}

/**
 * FIXED: Action menu z-index and clickability issues resolved
 */
export const CriticalVulnerabilitiesCard = memo(function CriticalVulnerabilitiesCard({ 
  vulnerabilities,
  canAccessTeam,
  onUpgradeRequired
}: CriticalVulnerabilitiesCardProps) {
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null)

  const handleClickOutside = useCallback(() => {
    setOpenActionMenu(null)
  }, [])

  if (vulnerabilities.length === 0) {
    return <EmptyVulnerabilitiesState />
  }

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-all duration-300 animate-in fade-in-50 slide-in-from-right-4 self-start" style={{ animationDelay: '150ms' }}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle>Critical Vulnerabilities</CardTitle>
        <Button variant="ghost" size="sm" asChild className="hover:bg-muted/50">
          <Link href="/dashboard/vulnerabilities">View All</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {vulnerabilities.map((vuln, index) => (
            <VulnerabilityItem
              key={vuln.id}
              vuln={vuln}
              index={index}
              isMenuOpen={openActionMenu === vuln.id}
              onMenuToggle={(id) => setOpenActionMenu(openActionMenu === id ? null : id)}
              onClickOutside={handleClickOutside}
              canAccessTeam={canAccessTeam}
              onUpgradeRequired={onUpgradeRequired}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
})

const EmptyVulnerabilitiesState = memo(function EmptyVulnerabilitiesState() {
  return (
    <Card className="overflow-hidden animate-in fade-in-50 slide-in-from-right-4 self-start" style={{ animationDelay: '150ms' }}>
      <CardHeader>
        <CardTitle>Critical Vulnerabilities</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center justify-center py-12 text-center animate-in zoom-in-50" style={{ animationDelay: '300ms' }}>
          <div className="h-16 w-16 rounded-full bg-green-100 dark:bg-green-950 flex items-center justify-center mb-4 ring-4 ring-green-50 dark:ring-green-900/20">
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <p className="text-sm font-semibold mb-1">No critical vulnerabilities found</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Your projects are looking secure! Keep up the good work.
          </p>
        </div>
      </CardContent>
    </Card>
  )
})

/**
 * FIXED: Action menu now properly positioned and clickable
 */
const VulnerabilityItem = memo(function VulnerabilityItem({
  vuln,
  index,
  isMenuOpen,
  onMenuToggle,
  onClickOutside,
  canAccessTeam,
  onUpgradeRequired
}: {
  vuln: CriticalVulnerability
  index: number
  isMenuOpen: boolean
  onMenuToggle: (id: string) => void
  onClickOutside: () => void
  canAccessTeam: boolean
  onUpgradeRequired: () => void
}) {
  const [assigningVuln, setAssigningVuln] = useState(false)
  const [showCreateIssue, setShowCreateIssue] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Handle clicks outside the menu
  useEffect(() => {
    if (!isMenuOpen) return

    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClickOutside()
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isMenuOpen, onClickOutside])

  const handleAssignToTeam = useCallback(() => {
    if (!canAccessTeam) {
      onUpgradeRequired()
      return
    }

    setAssigningVuln(true)
    setTimeout(() => {
      setAssigningVuln(false)
      alert("Team assignment feature - integrate with your team API")
    }, 1000)
  }, [canAccessTeam, onUpgradeRequired])

  const handleCreateIssue = useCallback(() => {
    setShowCreateIssue(true)
  }, [])

  const SeverityIcon = vuln.severity === "critical" ? XCircle : AlertCircle
  const severityColor = vuln.severity === "critical" ? "text-red-500" : "text-orange-500"

  return (
    <>
      <div 
        className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0 group hover:bg-muted/20 -mx-2 px-2 py-2 rounded-lg transition-all duration-200 animate-in fade-in-50 slide-in-from-bottom-2"
        style={{ animationDelay: `${300 + index * 75}ms` }}
      >
        <div className="flex-shrink-0 mt-1">
          <SeverityIcon className={`h-5 w-5 ${severityColor} group-hover:scale-110 transition-transform duration-200`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Badge
              variant={vuln.severity === "critical" ? "destructive" : "default"}
              className={`${
                vuln.severity === "high" 
                  ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-950" 
                  : ""
              } transition-colors duration-200`}
            >
              {vuln.severity}
            </Badge>
            <span className="text-xs border px-2 py-0.5 rounded-md bg-muted/50 text-muted-foreground font-mono"> 
              {vuln.cwe}
            </span>  
          </div>
          <p className="text-sm font-medium mb-1.5 line-clamp-1 group-hover:text-primary transition-colors duration-200">
            {vuln.title}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
            <GitBranch className="h-3 w-3" />
            <span className="font-medium">{vuln.repo}</span>
            <span>•</span>
            <Clock className="h-3 w-3" />
            <span>{vuln.detected}</span>
          </div>
        </div>
        <div className="relative flex-shrink-0" ref={menuRef}>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            onClick={() => onMenuToggle(vuln.id)}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          {isMenuOpen && (
            <ActionMenu
              vuln={vuln}
              onClose={onClickOutside}
              onAssign={handleAssignToTeam}
              onCreateIssue={handleCreateIssue}
              isAssigning={assigningVuln}
            />
          )}
        </div>
      </div>

      <CreateIssueDialog
        open={showCreateIssue}
        onOpenChange={setShowCreateIssue}
        vulnerability={vuln}
      />
    </>
  )
})

/**
 * FIXED: Action menu with proper z-index and positioning
 */
const ActionMenu = memo(function ActionMenu({
  vuln,
  onClose,
  onAssign,
  onCreateIssue,
  isAssigning
}: {
  vuln: CriticalVulnerability
  onClose: () => void
  onAssign: () => void
  onCreateIssue: () => void
  isAssigning: boolean
}) {
  return (
    <div 
      className="absolute right-0 top-10 w-56 rounded-lg border bg-popover shadow-lg animate-in fade-in-50 slide-in-from-top-2 duration-200"
      style={{ zIndex: 9999 }} // FIXED: Explicit high z-index
    >
      <div className="p-1">
        <div className="px-2 py-1.5 text-sm font-semibold">Actions</div>
        <div className="h-px bg-border my-1" />
        <Link 
          href={`/dashboard/scans/${vuln.scan_id}`}
          className="flex items-center px-2 py-2 text-sm hover:bg-accent rounded cursor-pointer transition-colors duration-150"
          onClick={onClose}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          View in Project
        </Link>
        <div className="h-px bg-border my-1" />
        <button
          className="w-full flex items-center px-2 py-2 text-sm hover:bg-accent rounded cursor-pointer disabled:opacity-50 transition-colors duration-150"
          onClick={onAssign}
          disabled={isAssigning}
        >
          {isAssigning ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="mr-2 h-4 w-4" />
          )}
          Assign to Team Member
        </button>
        <button
          className="w-full flex items-center px-2 py-2 text-sm hover:bg-accent rounded cursor-pointer transition-colors duration-150"
          onClick={onCreateIssue}
        >
          <FileText className="mr-2 h-4 w-4" />
          Create GitHub Issue
        </button>
      </div>
    </div>
  )
})