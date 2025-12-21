import React from "react"

interface ProgressIndicatorProps {
  currentStep: number
  totalSteps: number
}

export default function ProgressIndicator({ currentStep, totalSteps }: ProgressIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: totalSteps }).map((_, index) => (
        <React.Fragment key={index}>
          <div
            className={`h-2 w-8 rounded-full transition-all duration-300 ${
              index <= currentStep ? "bg-primary" : "bg-border"
            }`}
          />
          {index < totalSteps - 1 && <div className="w-2 h-0.5 bg-border" />}
        </React.Fragment>
      ))}
    </div>
  )
}
