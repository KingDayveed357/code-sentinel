"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { useState } from "react";
import { billingApi } from "@/lib/api/billing";
import { toast } from "sonner";

const PLANS = [
  {
    id: "Free",
    name: "Free",
    price: "$0",
    description: "Perfect for individual developers",
    perks: [
      "100 scans per month",
      "Up to 3 repositories",
      "Single user workspace",
      "Standard support",
    ],
    cta: "Current Plan",
    recommended: false,
  },
  {
    id: "Dev",
    name: "Dev",
    price: "$19",
    description: "For serious security professionals",
    perks: [
      "1,000 scans per month",
      "Up to 20 repositories",
      "Advanced vulnerability AI",
      "Priority email support",
    ],
    cta: "Upgrade to Dev",
    recommended: false,
  },
  {
    id: "Team",
    name: "Team",
    price: "$49",
    description: "Best for growing security teams",
    perks: [
      "Unlimited scans",
      "100 repositories",
      "Up to 10 team seats",
      "Role-based access (RBAC)",
      "Vulnerability assignment",
    ],
    cta: "Upgrade to Team",
    recommended: true,
  },
];

export function PlanCards() {
  const { workspace, plan: currentPlan, role } = useWorkspace();
  const [loading, setLoading] = useState<string | null>(null);

  const isOwner = role === "owner";

  const handleUpgrade = async (planId: string) => {
    if (!workspace) return;
    if (planId === currentPlan) return;
    
    setLoading(planId);
    try {
      const session = await billingApi.createCheckoutSession(workspace.id);
      window.location.href = session.url;
    } catch (error: any) {
      toast.error(error.message || "Failed to start checkout");
      setLoading(null);
    }
  };

  return (
    <div className="grid gap-6 md:grid-cols-3 pt-4">
      {PLANS.map((plan) => {
        const isCurrent = plan.id === currentPlan;
        
        return (
          <Card 
            key={plan.id} 
            className={`
              relative flex flex-col border-2 transition-all 
              ${plan.recommended 
                ? "border-primary shadow-lg scale-105 z-10" 
                : "hover:border-muted-foreground/20"}
              ${isCurrent ? "bg-muted/50" : "bg-card"}
            `}
          >
            {plan.recommended && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground font-bold px-4 py-1 gap-1">
                  <Sparkles className="h-3 w-3 fill-current" />
                  Most Popular
                </Badge>
              </div>
            )}

            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{plan.name}</span>
                {isCurrent && (
                  <Badge variant="secondary" className="font-bold">Current</Badge>
                )}
              </CardTitle>
              <div className="flex items-baseline gap-1 pt-2">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground">/ month</span>
              </div>
              <CardDescription className="pt-2">{plan.description}</CardDescription>
            </CardHeader>

            <CardContent className="flex-1 space-y-4">
              <div className="h-px bg-border" />
              <ul className="space-y-3">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
            </CardContent>

            <CardFooter>
              <Button 
                className="w-full font-bold h-12" 
                variant={plan.recommended ? "default" : "outline"}
                disabled={isCurrent || !isOwner || !!loading}
                onClick={() => handleUpgrade(plan.id)}
              >
                {loading === plan.id ? "Redirecting..." : (isCurrent ? "Current Plan" : plan.cta)}
              </Button>
            </CardFooter>
            
            {!isOwner && !isCurrent && (
              <div className="absolute inset-0 bg-background/5 p-6 flex items-end pointer-events-none">
                <p className="text-[10px] text-muted-foreground italic w-full text-center">
                  Only owners can manage plans
                </p>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
