"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ConfidenceGaugeProps {
  confidence: number; // 0-1 scale
}

export function ConfidenceGauge({ confidence }: ConfidenceGaugeProps) {
  const percentage = Math.round(confidence * 100);
  
  // Determine color and label based on confidence
  const getConfidenceConfig = (pct: number) => {
    if (pct >= 90) {
      return {
        color: "text-green-500",
        strokeColor: "#22c55e",
        bgColor: "stroke-green-500/20",
        label: "High Confidence",
        description: "Likely a true positive",
      };
    } else if (pct >= 70) {
      return {
        color: "text-yellow-500",
        strokeColor: "#eab308",
        bgColor: "stroke-yellow-500/20",
        label: "Medium Confidence",
        description: "Review recommended",
      };
    } else {
      return {
        color: "text-red-500",
        strokeColor: "#ef4444",
        bgColor: "stroke-red-500/20",
        label: "Low Confidence",
        description: "May be false positive",
      };
    }
  };

  const config = getConfidenceConfig(percentage);
  const circumference = 2 * Math.PI * 45; // radius = 45
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Confidence Score</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          {/* Circular gauge */}
          <div className="relative w-32 h-32">
            <svg className="w-full h-full transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="64"
                cy="64"
                r="45"
                className={config.bgColor}
                strokeWidth="8"
                fill="none"
              />
              {/* Progress circle */}
              <circle
                cx="64"
                cy="64"
                r="45"
                stroke={config.strokeColor}
                strokeWidth="8"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            {/* Percentage text */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-3xl font-bold ${config.color}`}>
                {percentage}%
              </span>
            </div>
          </div>

          {/* Label and description */}
          <div className="text-center mt-4">
            <p className={`font-semibold ${config.color}`}>{config.label}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {config.description}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
