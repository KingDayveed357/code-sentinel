// "use client"

// import { useEffect, useState } from "react"
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
// import { Button } from "@/components/ui/button"
// import { Badge } from "@/components/ui/badge"
// import { Alert, AlertDescription } from "@/components/ui/alert"
// import { 
//   AlertTriangle, 
//   Shield, 
//   GitBranch, 
//   TrendingUp, 
//   Clock, 
//   XCircle, 
//   AlertCircle,
//   CheckCircle2,
//   MoreVertical,
//   ExternalLink,
//   UserPlus,
//   FileText,
//   Loader2,
//   Activity,
//   Zap,
// } from "lucide-react"
// import Link from "next/link"
// import { VulnerabilityChart } from "./vulnerability-chart"
// import { apiFetch } from "@/lib/api"
// // import type { DashboardOverview } from "@/lib/api/dashboard"

// interface DashboardStats {
//   total_vulnerabilities: number;
//   repositories_scanned: number;
//   scans_this_month: number;
//   resolution_rate: number;
//   changes: {
//     vulnerabilities: string;
//     repositories: string;
//     scans: string;
//     resolution: string;
//   };
// }

// interface CriticalVulnerability {
//   id: string;
//   severity: 'critical' | 'high';
//   title: string;
//   repo: string;
//   repo_id: string;
//   scan_id: string;
//   detected: string;
//   cwe: string;
//   type: 'sast' | 'sca' | 'secrets' | 'iac' | 'container';
// }

// interface RecentScan {
//   id: string;
//   repo: string;
//   repo_id: string;
//   branch: string;
//   status: string;
//   vulnerabilities: number;
//   critical: number;
//   high: number;
//   medium: number;
//   low: number;
//   duration: string;
//   timestamp: string;
// }

// interface SecurityScore {
//   overall: number;
//   critical: number;
//   high: number;
//   medium: number;
//   low: number;
// }

// interface DashboardOverview {
//   stats: DashboardStats;
//   critical_vulnerabilities: CriticalVulnerability[];
//   recent_scans: RecentScan[];
//   security_score: SecurityScore;
// }

// export function DashboardOverview() {
//   const [data, setData] = useState<DashboardOverview | null>(null)
//   const [loading, setLoading] = useState(true)
//   const [error, setError] = useState<string | null>(null)
//   const [openActionMenu, setOpenActionMenu] = useState<string | null>(null)
//   const [assigningVuln, setAssigningVuln] = useState<string | null>(null)
//   const [creatingIssue, setCreatingIssue] = useState<string | null>(null)
//   const [userPlan, setUserPlan] = useState<string>("Free")

//   useEffect(() => {
//     loadDashboardData()
//   }, [])

//   const loadDashboardData = async () => {
//     try {
//       setLoading(true)
//       setError(null)
      
//       // Get user profile to check plan
//       const userProfile = await apiFetch('/auth/me', { requireAuth: true })
//       setUserPlan(userProfile?.user?.plan || "Free")
      
//       // Get dashboard data
//       const overview = await apiFetch('/dashboard/overview', { requireAuth: true })
//       setData(overview)
//     } catch (err: any) {
//       setError(err.message || "Failed to load dashboard data")
//     } finally {
//       setLoading(false)
//     }
//   }

//   const canAccessTeam = userPlan === "Team" || userPlan === "Enterprise"

//   const handleAssignToTeam = (vulnId: string) => {
//     if (!canAccessTeam) {
//       alert("Team features require a Team or Enterprise plan. Please upgrade to use this feature.")
//       setOpenActionMenu(null)
//       return
//     }

//     setAssigningVuln(vulnId)
//     setOpenActionMenu(null)
//     setTimeout(() => {
//       setAssigningVuln(null)
//       alert("Team assignment feature - integrate with your team API")
//     }, 1000)
//   }

//   const handleCreateIssue = (vulnId: string) => {
//     setCreatingIssue(vulnId)
//     setOpenActionMenu(null)
//     setTimeout(() => {
//       setCreatingIssue(null)
//       alert("Create issue feature - integrate with your issue tracking system")
//     }, 1000)
//   }

//   if (loading) {
//     return (
//       <div className="flex items-center justify-center min-h-[60vh]">
//         <Loader2 className="h-8 w-8 animate-spin text-primary" />
//       </div>
//     )
//   }

//   if (error) {
//     return (
//       <Alert variant="destructive">
//         <AlertCircle className="h-4 w-4" />
//         <AlertDescription>{error}</AlertDescription>
//       </Alert>
//     )
//   }

//   if (!data) return null

//   const stats = [
//     {
//       title: "Total Vulnerabilities",
//       value: data.stats.total_vulnerabilities.toString(),
//       change: data.stats.changes.vulnerabilities,
//       trend: data.stats.changes.vulnerabilities.startsWith('-') ? "down" : "up",
//       icon: AlertTriangle,
//       color: "text-destructive",
//     },
//     {
//       title: "Repositories Scanned",
//       value: data.stats.repositories_scanned.toString(),
//       change: data.stats.changes.repositories,
//       trend: data.stats.changes.repositories.startsWith('-') ? "down" : "up",
//       icon: GitBranch,
//       color: "text-primary",
//     },
//     {
//       title: "Scans This Month",
//       value: data.stats.scans_this_month.toString(),
//       change: data.stats.changes.scans,
//       trend: data.stats.changes.scans.startsWith('-') ? "down" : "up",
//       icon: Shield,
//       color: "text-success",
//     },
//     {
//       title: "Resolution Rate",
//       value: `${data.stats.resolution_rate}%`,
//       change: data.stats.changes.resolution,
//       trend: data.stats.changes.resolution.startsWith('-') ? "down" : "up",
//       icon: TrendingUp,
//       color: "text-accent",
//     },
//   ]

//   return (
//     <div className="space-y-6">
//       {/* Header */}
//       <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
//         <div>
//           <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
//           <p className="text-muted-foreground mt-1">Welcome back! Here's your security overview.</p>
//         </div>
//         <Button asChild>
//           <Link href="/dashboard/projects">
//             <GitBranch className="mr-2 h-4 w-4" />
//             View All Projects
//           </Link>
//         </Button>
//       </div>

//       {/* Stats Grid */}
//       <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
//         {stats.map((stat, index) => (
//           <Card key={index}>
//             <CardHeader className="flex flex-row items-center justify-between pb-2">
//               <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
//               <stat.icon className={`h-4 w-4 ${stat.color}`} />
//             </CardHeader>
//             <CardContent>
//               <div className="text-2xl font-bold">{stat.value}</div>
//               <div className="flex items-center text-xs mt-1">
//                 <span className={stat.trend === "up" ? "text-success" : "text-destructive"}>{stat.change}</span>
//                 <span className="text-muted-foreground ml-1">from last month</span>
//               </div>
//             </CardContent>
//           </Card>
//         ))}
//       </div>

//       {/* Main Content Grid */}
//       <div className="grid gap-6 md:grid-cols-2">
//         {/* Aggregated Security Score */}
//         <Card>
//           <CardHeader>
//             <CardTitle>Overall Security Score</CardTitle>
//           </CardHeader>
//           <CardContent>
//             <div className="flex items-center justify-center mb-6">
//               <div className="relative">
//                 <svg className="h-32 w-32 transform -rotate-90">
//                   <circle
//                     cx="64"
//                     cy="64"
//                     r="56"
//                     stroke="currentColor"
//                     strokeWidth="8"
//                     fill="none"
//                     className="text-muted"
//                   />
//                   <circle
//                     cx="64"
//                     cy="64"
//                     r="56"
//                     stroke="currentColor"
//                     strokeWidth="8"
//                     fill="none"
//                     strokeDasharray={`${2 * Math.PI * 56}`}
//                     strokeDashoffset={`${2 * Math.PI * 56 * (1 - data.security_score.overall / 100)}`}
//                     className="text-primary transition-all duration-500"
//                     strokeLinecap="round"
//                   />
//                 </svg>
//                 <div className="absolute inset-0 flex items-center justify-center">
//                   <div className="text-center">
//                     <div className="text-3xl font-bold">{data.security_score.overall}</div>
//                     <div className="text-xs text-muted-foreground">Across all projects</div>
//                   </div>
//                 </div>
//               </div>
//             </div>

//             <div className="space-y-3">
//               <div className="flex items-center justify-between text-sm">
//                 <div className="flex items-center gap-2">
//                   <div className="h-3 w-3 rounded-full bg-destructive" />
//                   <span>Critical</span>
//                 </div>
//                 <span className="font-medium">{data.security_score.critical}</span>
//               </div>
//               <div className="flex items-center justify-between text-sm">
//                 <div className="flex items-center gap-2">
//                   <div className="h-3 w-3 rounded-full bg-orange-500" />
//                   <span>High</span>
//                 </div>
//                 <span className="font-medium">{data.security_score.high}</span>
//               </div>
//               <div className="flex items-center justify-between text-sm">
//                 <div className="flex items-center gap-2">
//                   <div className="h-3 w-3 rounded-full bg-yellow-500" />
//                   <span>Medium</span>
//                 </div>
//                 <span className="font-medium">{data.security_score.medium}</span>
//               </div>
//               <div className="flex items-center justify-between text-sm">
//                 <div className="flex items-center gap-2">
//                   <div className="h-3 w-3 rounded-full bg-green-500" />
//                   <span>Low</span>
//                 </div>
//                 <span className="font-medium">{data.security_score.low}</span>
//               </div>
//             </div>
//           </CardContent>
//         </Card>

//         {/* Top Critical Vulnerabilities */}
//         <Card>
//           <CardHeader className="flex flex-row items-center justify-between">
//             <CardTitle>Critical Vulnerabilities</CardTitle>
//             <Button variant="ghost" size="sm" asChild>
//               <Link href="/dashboard/vulnerabilities">View All</Link>
//             </Button>
//           </CardHeader>
//           <CardContent>
//             {data.critical_vulnerabilities.length === 0 ? (
//               <div className="flex flex-col items-center justify-center py-8 text-center">
//                 <CheckCircle2 className="h-12 w-12 text-success mb-3" />
//                 <p className="text-sm font-medium">No critical vulnerabilities found</p>
//                 <p className="text-xs text-muted-foreground mt-1">Your projects are looking secure!</p>
//               </div>
//             ) : (
//               <div className="space-y-4">
//                 {data.critical_vulnerabilities.map((vuln) => (
//                   <div key={vuln.id} className="flex items-start gap-3 pb-4 border-b last:border-0 last:pb-0">
//                     <div className="flex-shrink-0 mt-1">
//                       {vuln.severity === "critical" ? (
//                         <XCircle className="h-5 w-5 text-destructive" />
//                       ) : (
//                         <AlertCircle className="h-5 w-5 text-orange-500" />
//                       )}
//                     </div>
//                     <div className="flex-1 min-w-0">
//                       <div className="flex items-center gap-2 mb-1 flex-wrap">
//                         <Badge
//                           variant={vuln.severity === "critical" ? "destructive" : "default"}
//                           className={vuln.severity === "high" ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400" : ""}
//                         >
//                           {vuln.severity}
//                         </Badge>
//                        <p className="text-xs border px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground"> 
//                         {/* <Badge variant="outline" className="text-xs"> */}
//                          {vuln.cwe}
//                         {/* </Badge> */}
//                         </p>  
//                       </div>
//                       <p className="text-sm font-medium mb-1">{vuln.title}</p>
//                       <div className="flex items-center gap-2 text-xs text-muted-foreground">
//                         <GitBranch className="h-3 w-3" />
//                         <span>{vuln.repo}</span>
//                         <span>•</span>
//                         <Clock className="h-3 w-3" />
//                         <span>{vuln.detected}</span>
//                       </div>
//                     </div>
//                     <div className="relative">
//                       <Button 
//                         variant="ghost" 
//                         size="icon" 
//                         className="h-8 w-8"
//                         onClick={() => setOpenActionMenu(openActionMenu === vuln.id ? null : vuln.id)}
//                       >
//                         <MoreVertical className="h-4 w-4" />
//                       </Button>
//                       {openActionMenu === vuln.id && (
//                         <div className="absolute right-0 mt-2 w-56 rounded-md border bg-popover shadow-lg z-50">
//                           <div className="p-1">
//                             <div className="px-2 py-1.5 text-sm font-semibold">Actions</div>
//                             <div className="h-px bg-border my-1" />
//                             <Link 
//                               href={`/dashboard/projects/${vuln.repo_id}/scans/${vuln.scan_id}/report`}
//                               className="flex items-center px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer"
//                               onClick={() => setOpenActionMenu(null)}
//                             >
//                               <ExternalLink className="mr-2 h-4 w-4" />
//                               View in Project
//                             </Link>
//                             <div className="h-px bg-border my-1" />
//                             <button
//                               className="w-full flex items-center px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer disabled:opacity-50"
//                               onClick={() => handleAssignToTeam(vuln.id)}
//                               disabled={assigningVuln === vuln.id}
//                             >
//                               {assigningVuln === vuln.id ? (
//                                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                               ) : (
//                                 <UserPlus className="mr-2 h-4 w-4" />
//                               )}
//                               Assign to Team Member
//                             </button>
//                             <button
//                               className="w-full flex items-center px-2 py-1.5 text-sm hover:bg-accent rounded cursor-pointer disabled:opacity-50"
//                               onClick={() => handleCreateIssue(vuln.id)}
//                               disabled={creatingIssue === vuln.id}
//                             >
//                               {creatingIssue === vuln.id ? (
//                                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                               ) : (
//                                 <FileText className="mr-2 h-4 w-4" />
//                               )}
//                               Create Issue
//                             </button>
//                           </div>
//                         </div>
//                       )}
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             )}
//           </CardContent>
//         </Card>
//       </div>

//       {/* Vulnerability Trend Chart */}
//       <VulnerabilityChart />

//       {/* Recent Scans */}
//       <Card>
//         <CardHeader className="flex flex-row items-center justify-between">
//           <CardTitle>Recent Scans</CardTitle>
//           <Button variant="ghost" size="sm" asChild>
//             <Link href="/dashboard/projects">View All Projects</Link>
//           </Button>
//         </CardHeader>
//         <CardContent>
//           {data.recent_scans.length === 0 ? (
//             <div className="flex flex-col items-center justify-center py-8 text-center">
//               <Shield className="h-12 w-12 text-muted-foreground mb-3" />
//               <p className="text-sm font-medium">No scans yet</p>
//               <p className="text-xs text-muted-foreground mt-1">Run your first security scan to get started</p>
//               <Button className="mt-4" asChild>
//                 <Link href="/dashboard/projects">
//                   <GitBranch className="mr-2 h-4 w-4" />
//                   Go to Projects
//                 </Link>
//               </Button>
//             </div>
//           ) : (
//             <div className="space-y-3">
//               {data.recent_scans.map((scan) => (
//                 <div
//                   key={scan.id}
//                   className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
//                 >
//                   <div className="flex items-center gap-4 flex-1">
//                     <div
//                       className={`flex h-10 w-10 items-center justify-center rounded-lg ${
//                         scan.vulnerabilities > 0 ? "bg-destructive/10" : "bg-success/10"
//                       }`}
//                     >
//                       {scan.vulnerabilities > 0 ? (
//                         <AlertTriangle className="h-5 w-5 text-destructive" />
//                       ) : (
//                         <CheckCircle2 className="h-5 w-5 text-success" />
//                       )}
//                     </div>

//                     <div className="flex-1 min-w-0">
//                       <div className="flex items-center gap-2 mb-1 flex-wrap">
//                         <Link 
//                           href={`/dashboard/projects/${scan.repo_id}`}
//                           className="text-sm font-medium hover:text-primary transition-colors"
//                         >
//                           {scan.repo}
//                         </Link>
//                         <Badge variant="outline" className="text-xs">
//                           <GitBranch className="h-3 w-3 mr-1" />
//                           {scan.branch}
//                         </Badge>
//                       </div>
//                       <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
//                         {scan.vulnerabilities > 0 ? (
//                           <div className="flex items-center gap-2">
//                             {scan.critical > 0 && (
//                               <Badge variant="destructive" className="text-xs px-1.5 py-0">
//                                 {scan.critical} C
//                               </Badge>
//                             )}
//                             {scan.high > 0 && (
//                               <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-400 text-xs px-1.5 py-0">
//                                 {scan.high} H
//                               </Badge>
//                             )}
//                             {scan.medium > 0 && (
//                               <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400 text-xs px-1.5 py-0">
//                                 {scan.medium} M
//                               </Badge>
//                             )}
//                             {scan.low > 0 && (
//                               <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 text-xs px-1.5 py-0">
//                                 {scan.low} L
//                               </Badge>
//                             )}
//                           </div>
//                         ) : (
//                           <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400 text-xs">
//                             Clean
//                           </Badge>
//                         )}
//                         <span>•</span>
//                         <span>{scan.duration}</span>
//                         <span>•</span>
//                         <div className="flex items-center gap-1">
//                           <Clock className="h-3 w-3" />
//                           <span>{scan.timestamp}</span>
//                         </div>
//                       </div>
//                     </div>
//                   </div>

//                   <Button variant="ghost" size="sm" asChild>
//                     <Link href={`/dashboard/projects/${scan.repo_id}/scans/${scan.id}/report`}>
//                       View Report
//                     </Link>
//                   </Button>
//                 </div>
//               ))}
//             </div>
//           )}
//         </CardContent>
//       </Card>
//     </div>
//   )
// }




// components/dashboard/dashboard-overview.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { GitBranch } from "lucide-react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { onboardingApi } from "@/lib/api/onboarding";
import type { DashboardOverview as DashboardData } from "@/lib/api/dashboard";
import type { OnboardingState } from "@/lib/api/onboarding";

import { DashboardSkeleton } from "./dashboard-skeleton";
import { DashboardError } from "./dashboard-error";
import { ImportBanner } from "./import-banner";
import { StatsCards } from "./stats-cards";
import { SecurityScoreCard } from "./security-score-card";
import { CriticalVulnerabilitiesCard } from "./critical-vulnerabilities-card";
import { RecentScansCard } from "./recent-scans-card";
import { UpgradeModal } from "./upgrade-modal";

/**
 * Main Dashboard Overview Component with Import Banner
 */
export function DashboardOverview() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [onboardingState, setOnboardingState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string>("Free");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all data in parallel
      const [userProfile, overview, state] = await Promise.all([
        apiFetch("/auth/me", { requireAuth: true }),
        apiFetch("/dashboard/overview", { requireAuth: true }),
        onboardingApi.getState().catch(() => null), // Don't fail if this errors
      ]);

      setUserPlan(userProfile?.user?.plan || "Free");
      setData(overview);
      setOnboardingState(state);

      // Determine banner visibility with fallback logic
      if (state) {
        setShowBanner(state.should_show_import_banner);
      } else {
        // Fallback: check if user has 0 repos (defensive programming)
        const repoCount = overview?.stats?.repositories_scanned || 0;
        setShowBanner(repoCount === 0);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleUpgradeRequired = useCallback(() => {
    setShowUpgradeModal(true);
  }, []);

  const handleBannerDismiss = useCallback(() => {
    setShowBanner(false);
  }, []);

  if (error) {
    return <DashboardError error={error} onRetry={loadDashboardData} />;
  }

  const canAccessTeam = userPlan === "Team" || userPlan === "Enterprise";

  return (
    <>
      <div className="space-y-6">
        {/* Import Banner - Shows at top if conditions met */}
        {showBanner && !loading && (
          <ImportBanner onDismiss={handleBannerDismiss} />
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-in fade-in duration-300">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Dashboard
            </h1>
            <p className="text-muted-foreground">
              Welcome back! Here's your security overview.
            </p>
          </div>
          <Button
            asChild
            className="shadow-sm hover:shadow-md transition-all duration-200"
          >
            <Link href="/dashboard/projects">
              <GitBranch className="mr-2 h-4 w-4" />
              View All Projects
            </Link>
          </Button>
        </div>

        {/* Content - Show skeleton while loading */}
        {loading ? (
          <DashboardSkeleton />
        ) : data ? (
          <>
            {/* Stats Grid */}
            <StatsCards stats={data.stats} />

            {/* Main Content Grid */}
            <div className="grid gap-6 md:grid-cols-2 md:items-start">
              <SecurityScoreCard score={data.security_score} />
              <CriticalVulnerabilitiesCard
                vulnerabilities={data.critical_vulnerabilities}
                canAccessTeam={canAccessTeam}
                onUpgradeRequired={handleUpgradeRequired}
              />
            </div>

            {/* Recent Scans */}
            <RecentScansCard scans={data.recent_scans} />
          </>
        ) : null}
      </div>

      {/* Upgrade Modal */}
      <UpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        currentPlan={userPlan}
      />
    </>
  );
}