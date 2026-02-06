"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Globe, Lock, Shield, AlertTriangle } from "lucide-react";

interface RiskContext {
  public_facing?: boolean;
  auth_required?: boolean;
  framework?: string;
  exploit_likelihood?: "high" | "medium" | "low";
}

interface RiskContextGridProps {
  riskContext: RiskContext;
}

export function RiskContextGrid({ riskContext }: RiskContextGridProps) {
  const cards = [
    {
      title: "Public-Facing",
      value: riskContext.public_facing ? "Yes" : "No",
      icon: Globe,
      color: riskContext.public_facing ? "text-red-500" : "text-green-500",
      bgColor: riskContext.public_facing ? "bg-red-500/10" : "bg-green-500/10",
    },
    {
      title: "Auth Required",
      value: riskContext.auth_required ? "Yes" : "No",
      icon: Lock,
      color: riskContext.auth_required ? "text-green-500" : "text-red-500",
      bgColor: riskContext.auth_required ? "bg-green-500/10" : "bg-red-500/10",
    },
    {
      title: "Framework",
      value: riskContext.framework || "Unknown",
      icon: Shield,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Exploit Likelihood",
      value: riskContext.exploit_likelihood?.toUpperCase() || "UNKNOWN",
      icon: AlertTriangle,
      color:
        riskContext.exploit_likelihood === "high"
          ? "text-red-500"
          : riskContext.exploit_likelihood === "medium"
          ? "text-yellow-500"
          : "text-green-500",
      bgColor:
        riskContext.exploit_likelihood === "high"
          ? "bg-red-500/10"
          : riskContext.exploit_likelihood === "medium"
          ? "bg-yellow-500/10"
          : "bg-green-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.title} className={card.bgColor}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`${card.color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className={`font-semibold ${card.color}`}>{card.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
