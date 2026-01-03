"use client";

import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Zap, Users, Check, ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { entitlementsApi, type PlanFeatures, type Entitlements } from "@/lib/api/entitlements";

export function RequireTeamPlan({
  children,
  upgradeTitle = "Unlock Team Features",
  upgradeMessage = "Collaborate with your team and scale your security scanning with advanced team features.",
}: {
  children: React.ReactNode;
  upgradeTitle?: string;
  upgradeMessage?: string;
}) {
  const { user, loading, canAccessTeam } = useAuth();
  const pathname = usePathname();
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [planFeatures, setPlanFeatures] = useState<PlanFeatures | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(true);

  // Check if we're on an invite route - allow access without team plan
  const isInviteRoute = pathname?.includes("/teams/invite/");

  // Fetch entitlements and plan features
  useEffect(() => {
    if (!user || loading) return;

    async function fetchData() {
      try {
        setFeaturesLoading(true);
        const [entitlementsData, featuresData] = await Promise.all([
          entitlementsApi.getEntitlements(),
          entitlementsApi.getPlanFeatures(),
        ]);
        setEntitlements(entitlementsData);
        setPlanFeatures(featuresData);
      } catch (error) {
        console.error("Failed to fetch entitlements:", error);
      } finally {
        setFeaturesLoading(false);
      }
    }

    fetchData();
  }, [user, loading]);

  // Show loading state
  if (loading || featuresLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  // Allow invite routes to bypass team plan requirement
  if (isInviteRoute) {
    return <>{children}</>;
  }

  // Show upgrade prompt for users without team access
  if (!user || !canAccessTeam) {
    const currentPlan = entitlements?.plan || user?.plan || "Free";
    const planDisplayName = currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1).toLowerCase();
    
    // Get enabled features for current plan
    const enabledFeatures = planFeatures?.features
      .filter((f: { feature: string; enabled: boolean }) => f.enabled)
      .map((f: { feature: string; enabled: boolean }) => f.feature) || [];
    
    // Get disabled features (team features)
    const disabledFeatures = planFeatures?.features
      .filter((f: { feature: string; enabled: boolean }) => !f.enabled)
      .map((f: { feature: string; enabled: boolean }) => f.feature) || [];

    return (
      <div className="space-y-8 max-w-5xl mx-auto">
        {/* Hero Section */}
        <div className="text-center space-y-4 pt-8">
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
              <Users className="h-16 w-16 text-primary relative" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">{upgradeTitle}</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            {upgradeMessage}
          </p>
        </div>

        {/* Feature Comparison */}
        <Card className="border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Team Features
            </CardTitle>
            <CardDescription>
              Upgrade to Team or Enterprise plan to unlock these powerful collaboration features
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              {/* Free Plan */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Your Current Plan</h3>
                  <Badge variant="outline">{planDisplayName}</Badge>
                </div>
                <ul className="space-y-3">
                  {/* Show plan limits from entitlements */}
                  {entitlements && (
                    <>
                      {entitlements.limits.repositories !== null && (
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm">
                            {entitlements.limits.repositories === 100 ? "Up to 100 repositories" : 
                             entitlements.limits.repositories === 20 ? "Up to 20 repositories" :
                             entitlements.limits.repositories === 5 ? "Up to 5 repositories" :
                             `${entitlements.limits.repositories} repositories`}
                          </span>
                        </li>
                      )}
                      {entitlements.limits.scans_per_month !== null && (
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm">
                            {entitlements.limits.scans_per_month} scans per month
                          </span>
                        </li>
                      )}
                      {entitlements.limits.scans_per_month === null && (
                        <li className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm">Unlimited scans</span>
                        </li>
                      )}
                      <li className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                        <span className="text-sm">
                          {entitlements.limits.concurrent_scans} concurrent scan{entitlements.limits.concurrent_scans !== 1 ? 's' : ''}
                        </span>
                      </li>
                    </>
                  )}
                  {/* Show enabled features from plan_entitlements */}
                  {enabledFeatures.length > 0 && enabledFeatures.map((feature: string) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-sm capitalize">
                        {feature.replace(/_/g, ' ')}
                      </span>
                    </li>
                  ))}
                  {/* Show disabled team features */}
                  {disabledFeatures.filter((f: string) => 
                    f.includes('team') || 
                    f.includes('collaboration') || 
                    f.includes('member') || 
                    f.includes('role')
                  ).map((feature: string) => (
                    <li key={feature} className="flex items-start gap-2 opacity-50">
                      <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <span className="text-sm line-through capitalize">
                        {feature.replace(/_/g, ' ')}
                      </span>
                    </li>
                  ))}
                  {/* Fallback if no features loaded */}
                  {enabledFeatures.length === 0 && !entitlements && (
                    <>
                      <li className="flex items-start gap-2">
                        <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                        <span className="text-sm">Basic vulnerability detection</span>
                      </li>
                      <li className="flex items-start gap-2 opacity-50">
                        <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <span className="text-sm line-through">Team collaboration</span>
                      </li>
                      <li className="flex items-start gap-2 opacity-50">
                        <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <span className="text-sm line-through">Team member management</span>
                      </li>
                      <li className="flex items-start gap-2 opacity-50">
                        <Lock className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <span className="text-sm line-through">Role-based permissions</span>
                      </li>
                    </>
                  )}
                </ul>
              </div>

              {/* Team Plan */}
              <div className="space-y-4 p-6 bg-primary/5 rounded-lg border-2 border-primary relative">
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                  Most Popular
                </Badge>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Team Plan</h3>
                  <div className="text-right">
                    <div className="text-2xl font-bold">$29</div>
                    <div className="text-xs text-muted-foreground">/month</div>
                  </div>
                </div>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">Unlimited repositories</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">Unlimited scans</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">Advanced AI fix suggestions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">Team collaboration features</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">Invite unlimited team members</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">Role-based access control</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">Team activity dashboard</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm font-medium">Priority support</span>
                  </li>
                </ul>
                <Button className="w-full mt-4" size="lg" asChild>
                  <Link href="/dashboard/billing">
                    Upgrade to Team
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  14-day free trial • Cancel anytime
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <Users className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Team Collaboration</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Invite team members, assign vulnerabilities, and collaborate on security issues in real-time.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Shield className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Role-Based Access</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Define roles with specific permissions to control who can view, scan, and manage projects.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Zap className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Unlimited Everything</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                No limits on repositories, scans, or team members. Scale as your team grows.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <Card className="border-primary bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold mb-2">Ready to upgrade?</h3>
                <p className="text-muted-foreground">
                  Start your 14-day free trial today. No credit card required.
                </p>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" asChild>
                  <Link href="/dashboard/billing">View All Plans</Link>
                </Button>
                <Button size="lg" asChild>
                  <Link href="/dashboard/billing">
                    Start Free Trial
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}